// ─── Kevin Memory Settings ────────────────────────────────────────────────────
//
// User-facing routes for Kevin memory consent management.
// Users may only view and modify their own consent.
//
// Routes:
//   GET  /settings/kevin-memory         — view all consent records
//   POST /settings/kevin-memory/grant   — grant consent for a memory type
//   POST /settings/kevin-memory/revoke  — revoke consent for a memory type
//   POST /settings/kevin-memory/revoke-all — revoke all consents
//
// Cross-application context is blocked from being granted until Phase 13.
// Memory deletion from Kevin itself is NOT guaranteed until a deletion endpoint
// is confirmed — this is disclosed to users.

import { Router, type IRouter } from "express";
import { requireAuth } from "../middlewares/auth";
import {
  getUserKevinConsents,
  grantKevinConsent,
  revokeKevinConsent,
  revokeAllKevinConsents,
} from "../lib/kevin-consent-service";
import { KEVIN_MEMORY_TYPES, type KevinMemoryType } from "@workspace/db";
import { logger } from "../lib/logger";
import { z } from "zod/v4";

const router: IRouter = Router();

const MemoryTypeSchema = z.object({
  memory_type: z.enum(KEVIN_MEMORY_TYPES as unknown as [KevinMemoryType, ...KevinMemoryType[]]),
});

// ─── GET /settings/kevin-memory ───────────────────────────────────────────────

router.get(
  "/settings/kevin-memory",
  requireAuth,
  async (req, res): Promise<void> => {
    const userId = req.session.userId!;
    try {
      const consents = await getUserKevinConsents(userId);
      res.json({
        consents,
        notice:
          "Revoking consent stops future memory from being used. " +
          "Deletion from Kevin's memory store is not yet guaranteed — " +
          "contact support for a full memory deletion request.",
      });
    } catch (err) {
      logger.error({ err }, "[KevinMemory] Failed to fetch consents");
      res.status(500).json({ error: "Failed to fetch memory settings" });
    }
  },
);

// ─── POST /settings/kevin-memory/grant ────────────────────────────────────────

router.post(
  "/settings/kevin-memory/grant",
  requireAuth,
  async (req, res): Promise<void> => {
    const userId = req.session.userId!;
    const parsed = MemoryTypeSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "Invalid memory_type", details: parsed.error.issues });
      return;
    }

    try {
      await grantKevinConsent(userId, parsed.data.memory_type);
      res.json({ ok: true, memory_type: parsed.data.memory_type, status: "granted" });
    } catch (err: any) {
      logger.error({ err }, "[KevinMemory] Failed to grant consent");
      res.status(400).json({ error: err?.message ?? "Failed to grant consent" });
    }
  },
);

// ─── POST /settings/kevin-memory/revoke ───────────────────────────────────────

router.post(
  "/settings/kevin-memory/revoke",
  requireAuth,
  async (req, res): Promise<void> => {
    const userId = req.session.userId!;
    const parsed = MemoryTypeSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "Invalid memory_type", details: parsed.error.issues });
      return;
    }

    try {
      await revokeKevinConsent(userId, parsed.data.memory_type);
      res.json({ ok: true, memory_type: parsed.data.memory_type, status: "revoked" });
    } catch (err) {
      logger.error({ err }, "[KevinMemory] Failed to revoke consent");
      res.status(500).json({ error: "Failed to revoke consent" });
    }
  },
);

// ─── POST /settings/kevin-memory/revoke-all ───────────────────────────────────

router.post(
  "/settings/kevin-memory/revoke-all",
  requireAuth,
  async (req, res): Promise<void> => {
    const userId = req.session.userId!;
    try {
      await revokeAllKevinConsents(userId);
      res.json({ ok: true, status: "all_revoked" });
    } catch (err) {
      logger.error({ err }, "[KevinMemory] Failed to revoke all consents");
      res.status(500).json({ error: "Failed to revoke all consents" });
    }
  },
);

export default router;
