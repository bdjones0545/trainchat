import { Router, type IRouter } from "express";
import crypto from "crypto";
import { z } from "zod";
import { logger } from "../lib/logger";

const router: IRouter = Router();

const PIXEL_ID = "990242873481719";
const CAPI_URL = `https://graph.facebook.com/v19.0/${PIXEL_ID}/events`;

// ─── Helpers ──────────────────────────────────────────────────────────────────

function sha256(value: string): string {
  return crypto.createHash("sha256").update(value.trim().toLowerCase()).digest("hex");
}

function hashIfPresent(value: string | undefined): string | undefined {
  return value ? sha256(value) : undefined;
}

// ─── Validation ───────────────────────────────────────────────────────────────

const UserDataSchema = z.object({
  email: z.string().optional(),
  phone: z.string().optional(),
  firstName: z.string().optional(),
  lastName: z.string().optional(),
  externalId: z.string().optional(),
  clientIpAddress: z.string().optional(),
  clientUserAgent: z.string().optional(),
  fbp: z.string().optional(),
  fbc: z.string().optional(),
});

const CustomDataSchema = z.record(z.unknown()).optional();

const CapiEventSchema = z.object({
  eventName: z.string().min(1),
  eventSourceUrl: z.string().optional(),
  userData: UserDataSchema.optional(),
  customData: CustomDataSchema,
});

const CapiBodySchema = z.object({
  events: z.array(CapiEventSchema).min(1).max(50),
});

// ─── Route ────────────────────────────────────────────────────────────────────

router.post("/api/meta-capi", async (req, res): Promise<void> => {
  const token = process.env.META_CAPI_TOKEN;
  if (!token) {
    req.log.warn("META_CAPI_TOKEN is not configured — skipping CAPI send");
    res.json({ ok: true, skipped: true });
    return;
  }

  const parsed = CapiBodySchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ ok: false, error: parsed.error.flatten() });
    return;
  }

  const now = Math.floor(Date.now() / 1000);
  const clientIp =
    (req.headers["x-forwarded-for"] as string)?.split(",")[0]?.trim() ??
    req.socket.remoteAddress ??
    "";

  const fbEvents = parsed.data.events.map((e) => {
    const ud = e.userData ?? {};
    const hashedUserData: Record<string, string | undefined> = {
      em: hashIfPresent(ud.email),
      ph: hashIfPresent(ud.phone),
      fn: hashIfPresent(ud.firstName),
      ln: hashIfPresent(ud.lastName),
      external_id: ud.externalId ? sha256(ud.externalId) : undefined,
      client_ip_address: ud.clientIpAddress ?? clientIp,
      client_user_agent:
        ud.clientUserAgent ?? (req.headers["user-agent"] as string) ?? "",
      fbp: ud.fbp,
      fbc: ud.fbc,
    };

    // Strip undefined values
    const cleanUserData = Object.fromEntries(
      Object.entries(hashedUserData).filter(([, v]) => v !== undefined),
    );

    return {
      event_name: e.eventName,
      event_time: now,
      event_source_url: e.eventSourceUrl,
      action_source: "website",
      user_data: cleanUserData,
      custom_data: e.customData,
    };
  });

  try {
    const response = await fetch(`${CAPI_URL}?access_token=${token}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ data: fbEvents }),
    });

    if (!response.ok) {
      const text = await response.text();
      req.log.error({ status: response.status, body: text }, "meta-capi: upstream error");
      res.status(502).json({ ok: false, error: "upstream error" });
      return;
    }

    const result = await response.json();
    req.log.info({ events_sent: fbEvents.length }, "meta-capi: events delivered");
    res.json({ ok: true, result });
  } catch (err) {
    req.log.error({ err }, "meta-capi: fetch failed");
    res.status(500).json({ ok: false, error: "internal error" });
  }
});

export default router;
