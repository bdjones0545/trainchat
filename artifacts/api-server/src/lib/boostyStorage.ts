import { db, boostyEntitlementsTable, boostyPurchasesTable } from "@workspace/db";
import { eq, sql, inArray } from "drizzle-orm";
import { logger } from "./logger";
import { getSku, type BoostySku } from "./boostyCatalog";

export interface BoostyEntitlementView {
  playerId: string;
  owned: string[];
  bundle: boolean;
  sparksPurchased: number;
}

const EMPTY: Omit<BoostyEntitlementView, "playerId"> = {
  owned: [],
  bundle: false,
  sparksPurchased: 0,
};

/** BOOSTY player ids are "plr_" followed by 16 lowercase hex characters. */
const PLAYER_ID_RE = /^plr_[0-9a-f]{12,32}$/;

export function isValidPlayerId(id: unknown): id is string {
  return typeof id === "string" && PLAYER_ID_RE.test(id);
}

function toStringArray(v: unknown): string[] {
  if (!Array.isArray(v)) return [];
  return v.filter((x): x is string => typeof x === "string").slice(0, 200);
}

export class BoostyStorage {
  async getEntitlements(playerId: string): Promise<BoostyEntitlementView> {
    if (!isValidPlayerId(playerId)) return { playerId: String(playerId), ...EMPTY };
    try {
      const rows = await db
        .select()
        .from(boostyEntitlementsTable)
        .where(eq(boostyEntitlementsTable.playerId, playerId))
        .limit(1);
      const row = rows[0];
      if (!row) return { playerId, ...EMPTY };
      return {
        playerId,
        owned: toStringArray(row.skus),
        bundle: !!row.bundle,
        sparksPurchased: row.sparksPurchased ?? 0,
      };
    } catch (err: any) {
      logger.error({ err: err?.message, playerId }, "[BoostyStorage] getEntitlements failed");
      return { playerId, ...EMPTY };
    }
  }

  /**
   * Records a paid purchase and applies what it grants — ATOMICALLY.
   *
   * The ledger insert and the entitlement write happen in ONE transaction. That
   * matters more than it looks: the ledger row is also the idempotency guard
   * (unique stripe_session_id), so if the two writes could partially apply, a
   * failure would leave the guard in place with no grant behind it and every
   * retry would be rejected as a duplicate. Money taken, nothing delivered,
   * permanently. Rolling back together means a retry starts clean.
   *
   * Failure policy, and the distinction is deliberate:
   *  - TRANSIENT failures (database down, timeout) THROW, so the exception
   *    bubbles past markEventProcessed, the route returns 5xx, and Stripe
   *    retries the event.
   *  - PERMANENT failures (malformed player id, unknown SKU) do not throw.
   *    Retrying cannot fix bad data, so spinning for three days only delays
   *    the human who has to look at it.
   */
  async recordPurchase(params: {
    playerId: string;
    sku: BoostySku;
    stripeSessionId: string;
    stripePaymentIntentId?: string | null;
    stripeEventId?: string | null;
    amountCents: number;
    currency: string;
    userId?: number | null;
  }): Promise<{ applied: boolean; reason?: string }> {
    const { playerId, sku, stripeSessionId } = params;

    // Permanent: no retry will make this id valid.
    if (!isValidPlayerId(playerId)) return { applied: false, reason: "invalid-player-id" };

    const sparks = sku.kind === "sparks" ? sku.sparks ?? 0 : 0;
    const isBundle = sku.kind === "bundle";
    const addsSku = sku.kind === "cosmetic" || sku.kind === "bundle";

    try {
      return await db.transaction(async (tx) => {
        const inserted = await tx
          .insert(boostyPurchasesTable)
          .values({
            playerId,
            sku: sku.id,
            stripeSessionId,
            stripePaymentIntentId: params.stripePaymentIntentId ?? null,
            stripeEventId: params.stripeEventId ?? null,
            amountCents: params.amountCents,
            currency: params.currency || "usd",
            sparksGranted: sparks,
          })
          .onConflictDoNothing({ target: boostyPurchasesTable.stripeSessionId })
          .returning({ id: boostyPurchasesTable.id });

        if (!inserted.length) {
          // Already recorded by an earlier delivery. Idempotent success, and
          // deliberately not an error: the grant is already in place.
          logger.info(
            { stripeSessionId, playerId },
            "[BoostyStorage] purchase already recorded — no double grant"
          );
          return { applied: false, reason: "duplicate" };
        }

        await tx
          .insert(boostyEntitlementsTable)
          .values({
            playerId,
            skus: addsSku ? [sku.id] : [],
            bundle: isBundle,
            sparksPurchased: sparks,
            userId: params.userId ?? null,
            updatedAt: new Date(),
          })
          .onConflictDoUpdate({
            target: boostyEntitlementsTable.playerId,
            set: {
              // Append without duplicating, entirely in SQL so two concurrent
              // webhooks cannot read-modify-write over each other.
              skus: addsSku
                ? sql`(
                    select coalesce(jsonb_agg(distinct value), '[]'::jsonb)
                    from jsonb_array_elements(
                      ${boostyEntitlementsTable.skus} || ${JSON.stringify([sku.id])}::jsonb
                    )
                  )`
                : sql`${boostyEntitlementsTable.skus}`,
              bundle: isBundle ? sql`true` : sql`${boostyEntitlementsTable.bundle}`,
              sparksPurchased: sql`${boostyEntitlementsTable.sparksPurchased} + ${sparks}`,
              updatedAt: new Date(),
            },
          });

        logger.info(
          { playerId, sku: sku.id, sparks, stripeSessionId },
          "[BoostyStorage] entitlement granted"
        );
        return { applied: true };
      });
    } catch (err: any) {
      // Both writes rolled back together, so nothing is half-applied and the
      // session id is free for Stripe's retry. Re-thrown ON PURPOSE: swallowing
      // here would let markEventProcessed run, and the retry would then be
      // skipped as already-processed — the exact way money goes missing.
      logger.error(
        { err: err?.message, playerId, sku: sku.id, stripeSessionId },
        "[BoostyStorage] grant transaction failed and rolled back — rethrowing so Stripe retries"
      );
      throw err;
    }
  }

  /**
   * Every player whose entitlement row does not reflect their own ledger.
   *
   * The transaction above makes this set empty in normal operation. It can
   * still fill if the database was unavailable for Stripe's entire retry
   * window (about three days), or if a row was edited by hand. The ledger is
   * the record of what was PAID FOR, so it is always the side to trust.
   */
  async findUnreconciled(limit = 200): Promise<string[]> {
    const rows = await db.execute(sql`
      select p.player_id
      from boosty_purchases p
      left join boosty_entitlements e on e.player_id = p.player_id
      group by p.player_id, e.skus, e.bundle, e.sparks_purchased
      having
        e.player_id is null
        or coalesce(e.sparks_purchased, 0) <> coalesce(sum(p.sparks_granted), 0)
        or count(*) filter (
          where p.sku not in (
            select jsonb_array_elements_text(coalesce(e.skus, '[]'::jsonb))
          ) and p.sku not like 'sparks.%'
        ) > 0
      limit ${limit}
    `);
    const list = (rows as any).rows ?? rows;
    return (Array.isArray(list) ? list : []).map((r: any) => String(r.player_id));
  }

  /** Repair every drifted player. Returns what it fixed. */
  async reconcileAll(limit = 200): Promise<{ checked: number; repaired: string[] }> {
    const players = await this.findUnreconciled(limit);
    const repaired: string[] = [];
    for (const playerId of players) {
      try {
        await this.rebuildFromLedger(playerId);
        repaired.push(playerId);
        logger.info({ playerId }, "[BoostyStorage] reconciled entitlements from ledger");
      } catch (err: any) {
        logger.error({ err: err?.message, playerId }, "[BoostyStorage] reconcile failed");
      }
    }
    return { checked: players.length, repaired };
  }

  /** Support / reconciliation: rebuild an entitlement row from its ledger. */
  async rebuildFromLedger(playerId: string): Promise<BoostyEntitlementView> {
    const rows = await db
      .select()
      .from(boostyPurchasesTable)
      .where(eq(boostyPurchasesTable.playerId, playerId));

    const owned = new Set<string>();
    let bundle = false;
    let sparks = 0;
    for (const r of rows) {
      const sku = getSku(r.sku);
      if (!sku) continue;
      if (sku.kind === "bundle") { bundle = true; owned.add(sku.id); }
      else if (sku.kind === "cosmetic") owned.add(sku.id);
      sparks += r.sparksGranted ?? 0;
    }

    await db
      .insert(boostyEntitlementsTable)
      .values({ playerId, skus: [...owned], bundle, sparksPurchased: sparks, updatedAt: new Date() })
      .onConflictDoUpdate({
        target: boostyEntitlementsTable.playerId,
        set: { skus: [...owned], bundle, sparksPurchased: sparks, updatedAt: new Date() },
      });

    return { playerId, owned: [...owned], bundle, sparksPurchased: sparks };
  }
}

export const boostyStorage = new BoostyStorage();
