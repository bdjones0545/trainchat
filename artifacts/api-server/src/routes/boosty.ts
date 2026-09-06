import { Router, type IRouter, type Request } from "express";
import { logger } from "../lib/logger";
import { getUncachableStripeClient } from "../lib/stripeClient";
import { sharedRateLimit } from "../lib/shared-rate-limiter";
import {
  getSku, priceIdFor, isPurchasable, listCatalog, BOOSTY_PRODUCT_TAG,
} from "../lib/boostyCatalog";
import { boostyStorage, isValidPlayerId } from "../lib/boostyStorage";

/**
 * BOOSTY store API.
 *
 * These routes are deliberately UNAUTHENTICATED: BOOSTY has no accounts, and a
 * player is identified only by the random id behind their recovery code. That
 * makes two things load-bearing:
 *
 *  1. Rate limiting by IP, since there is no session to limit by.
 *  2. Never trusting the client for anything that decides money. The browser
 *     names a SKU; the server resolves the price, and Stripe charges it.
 *
 * The player id is a bearer token: whoever holds it can read those entitlements.
 * It is 64 bits of random so it cannot be guessed, and everything it unlocks is
 * cosmetic, which is what makes that acceptable. It is NOT a login.
 */
const router: IRouter = Router();

const playerFrom = (req: Request): string =>
  `ip:${req.ip ?? "unknown"}`;

// ─── GET /api/boosty/catalog ─────────────────────────────────────────────────
// What is actually on sale right now. A SKU with no Stripe price configured
// reports available:false rather than pretending to be free.
router.get("/boosty/catalog", async (_req, res): Promise<void> => {
  try {
    res.json({
      items: listCatalog().map((s) => ({
        id: s.id, kind: s.kind, name: s.name, cents: s.cents,
        sparks: s.sparks ?? 0, available: s.available,
      })),
    });
  } catch (err: any) {
    logger.error({ err }, "[BoostyRouter] /boosty/catalog error");
    res.status(500).json({ error: "catalog unavailable" });
  }
});

// ─── GET /api/boosty/entitlements ────────────────────────────────────────────
// What this player has paid for. The game merges this into local state at boot,
// which is what makes a cleared cache survivable.
router.get(
  "/boosty/entitlements",
  sharedRateLimit({ category: "boosty-ent", max: 60, windowMs: 60_000, keyFor: playerFrom }),
  async (req, res): Promise<void> => {
    const playerId = String(req.query.player ?? "");
    if (!isValidPlayerId(playerId)) {
      res.status(400).json({ error: "invalid player id" });
      return;
    }
    try {
      const ent = await boostyStorage.getEntitlements(playerId);
      res.json({
        owned: ent.owned,
        bundle: ent.bundle,
        sparksPurchased: ent.sparksPurchased,
      });
    } catch (err: any) {
      logger.error({ err }, "[BoostyRouter] /boosty/entitlements error");
      res.status(500).json({ error: "could not load entitlements" });
    }
  }
);

// ─── POST /api/boosty/checkout ───────────────────────────────────────────────
// Creates a hosted Stripe Checkout Session. BOOSTY never sees card details:
// the player completes payment on Stripe's own domain.
router.post(
  "/boosty/checkout",
  sharedRateLimit({
    category: "boosty-checkout",
    max: 12,
    windowMs: 60_000,
    message: "Too many checkout attempts. Wait a minute and try again.",
    keyFor: playerFrom,
  }),
  async (req, res): Promise<void> => {
    try {
      const { playerId, sku: skuId, returnUrl } = req.body ?? {};

      if (!isValidPlayerId(playerId)) {
        res.status(400).json({ error: "invalid player id" });
        return;
      }

      const sku = getSku(skuId);
      if (!sku) {
        res.status(400).json({ error: "unknown item" });
        return;
      }
      if (!isPurchasable(sku)) {
        // Configured-but-priceless is an operational error, not a customer one.
        logger.error({ sku: sku.id, env: sku.priceEnv }, "[BoostyRouter] SKU has no Stripe price configured");
        res.status(503).json({ error: "this item is not on sale right now" });
        return;
      }

      // Only same-origin return URLs; an open redirect on a payment flow is a
      // phishing primitive.
      const base = process.env.BOOSTY_PUBLIC_URL || "";
      if (!base) {
        logger.error("[BoostyRouter] BOOSTY_PUBLIC_URL is not set — cannot build return URLs");
        res.status(503).json({ error: "store is not configured" });
        return;
      }
      const safeReturn = typeof returnUrl === "string" && returnUrl.startsWith(base) ? returnUrl : base;

      const stripe = await getUncachableStripeClient();
      const session = await stripe.checkout.sessions.create({
        mode: "payment",
        payment_method_types: ["card"],
        line_items: [{ price: priceIdFor(sku)!, quantity: 1 }],
        success_url: `${safeReturn}${safeReturn.includes("?") ? "&" : "?"}boosty_purchase=success&session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: `${safeReturn}${safeReturn.includes("?") ? "&" : "?"}boosty_purchase=cancelled`,
        // This metadata is the ONLY account binding for the grant. The webhook
        // refuses anything without it rather than guessing from the email.
        metadata: {
          product: BOOSTY_PRODUCT_TAG,
          boostyPlayerId: playerId,
          boostySku: sku.id,
        },
        payment_intent_data: {
          metadata: {
            product: BOOSTY_PRODUCT_TAG,
            boostyPlayerId: playerId,
            boostySku: sku.id,
          },
        },
      });

      logger.info({ sessionId: session.id, sku: sku.id, playerId }, "[BoostyRouter] checkout session created");
      res.json({ url: session.url, sessionId: session.id });
    } catch (err: any) {
      logger.error({ err: err?.message }, "[BoostyRouter] /boosty/checkout error");
      res.status(500).json({ error: "could not start checkout" });
    }
  }
);

export default router;
