// ─── Kevin Admin Diagnostics ──────────────────────────────────────────────────
//
// Protected admin endpoints for Kevin integration diagnostics.
// Requires requireAdmin middleware (same as existing admin.ts pattern).
//
// No secrets are displayed in any response.
// Circuit state, queue stats, signal counts, and feature flags are exposed.
//
// Routes:
//   GET  /admin/kevin/status      — integration health + circuit state
//   GET  /admin/kevin/events      — queue statistics
//   GET  /admin/kevin/signals     — recent signals
//   GET  /admin/kevin/capabilities — capability modes
//   GET  /admin/kevin/context-requests — recent context request audit

import { Router, type IRouter } from "express";
import { db, usersTable } from "@workspace/db";
import {
  kevinAppSignalsTable,
  kevinAppEventsTable,
  kevinContextRequestsTable,
} from "@workspace/db";
import { eq, desc } from "drizzle-orm";
import { requireAuth } from "../middlewares/auth";
import { getKevinConfig } from "../lib/kevin-config";
import { getKevinCircuitStatus } from "../lib/kevin-circuit-breaker";
import { getAllKevinCapabilities } from "../lib/kevin-capability-service";
import { getKevinEventQueueStats } from "../services/kevin-event-service";
import { checkKevinHealth, KevinError } from "../lib/kevin-client";
import { logger } from "../lib/logger";

const router: IRouter = Router();

const ADMIN_EMAILS = (process.env.ADMIN_EMAILS ?? "")
  .split(",")
  .map((e) => e.trim())
  .filter(Boolean);

async function requireAdmin(req: any, res: any, next: any): Promise<void> {
  if (!req.session?.userId) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  if (ADMIN_EMAILS.length === 0) {
    res.status(403).json({ error: "Forbidden" });
    return;
  }
  const [user] = await db
    .select({ email: usersTable.email })
    .from(usersTable)
    .where(eq(usersTable.id, req.session.userId));
  if (!user || !ADMIN_EMAILS.includes(user.email ?? "")) {
    res.status(403).json({ error: "Forbidden" });
    return;
  }
  next();
}

// ─── GET /admin/kevin/status ──────────────────────────────────────────────────

router.get(
  "/admin/kevin/status",
  requireAuth,
  requireAdmin,
  async (_req, res): Promise<void> => {
    const config = getKevinConfig();
    const circuit = getKevinCircuitStatus();

    let healthResult: { ok: boolean; version?: string } | null = null;
    let healthError: string | null = null;

    if (config.integrationEnabled && config.hermesBaseUrl) {
      try {
        healthResult = await checkKevinHealth();
      } catch (err) {
        healthError =
          err instanceof KevinError ? err.code : "UNKNOWN";
      }
    }

    res.json({
      integration: {
        enabled: config.integrationEnabled,
        contextRetrieval: config.contextRetrievalEnabled,
        eventDispatch: config.eventDispatchEnabled,
        outcomeForwarding: config.outcomeForwardingEnabled,
        signalIntake: config.signalIntakeEnabled,
        applicationId: config.applicationId,
        hermesConfigured: !!(config.hermesBaseUrl && config.hermesApiKey),
        // Never expose the actual URL or key values
      },
      health: healthResult ?? { ok: false, error: healthError ?? "not_configured" },
      circuit,
    });
  },
);

// ─── GET /admin/kevin/events ──────────────────────────────────────────────────

router.get(
  "/admin/kevin/events",
  requireAuth,
  requireAdmin,
  async (_req, res): Promise<void> => {
    try {
      const stats = await getKevinEventQueueStats();

      // Recent dead-lettered events (without payloads — no PII)
      const deadLettered = await db
        .select({
          id: kevinAppEventsTable.id,
          eventType: kevinAppEventsTable.eventType,
          attempts: kevinAppEventsTable.attempts,
          lastError: kevinAppEventsTable.lastError,
          deadLetteredAt: kevinAppEventsTable.deadLetteredAt,
        })
        .from(kevinAppEventsTable)
        .where(eq(kevinAppEventsTable.status, "dead_lettered"))
        .orderBy(desc(kevinAppEventsTable.deadLetteredAt))
        .limit(10);

      res.json({ stats, recentDeadLettered: deadLettered });
    } catch (err) {
      logger.error({ err }, "[KevinAdmin] Failed to fetch event stats");
      res.status(500).json({ error: "Failed to fetch event stats" });
    }
  },
);

// ─── GET /admin/kevin/signals ─────────────────────────────────────────────────

router.get(
  "/admin/kevin/signals",
  requireAuth,
  requireAdmin,
  async (_req, res): Promise<void> => {
    try {
      const signals = await db
        .select({
          id: kevinAppSignalsTable.id,
          signalType: kevinAppSignalsTable.signalType,
          riskClass: kevinAppSignalsTable.riskClass,
          status: kevinAppSignalsTable.status,
          routedTo: kevinAppSignalsTable.routedTo,
          title: kevinAppSignalsTable.title,
          summary: kevinAppSignalsTable.summary,
          confidence: kevinAppSignalsTable.confidence,
          depth: kevinAppSignalsTable.depth,
          createdAt: kevinAppSignalsTable.createdAt,
        })
        .from(kevinAppSignalsTable)
        .orderBy(desc(kevinAppSignalsTable.createdAt))
        .limit(50);

      res.json({ signals });
    } catch (err) {
      logger.error({ err }, "[KevinAdmin] Failed to fetch signals");
      res.status(500).json({ error: "Failed to fetch signals" });
    }
  },
);

// ─── GET /admin/kevin/capabilities ────────────────────────────────────────────

router.get(
  "/admin/kevin/capabilities",
  requireAuth,
  requireAdmin,
  async (_req, res): Promise<void> => {
    try {
      const capabilities = await getAllKevinCapabilities();
      res.json({ capabilities });
    } catch (err) {
      logger.error({ err }, "[KevinAdmin] Failed to fetch capabilities");
      res.status(500).json({ error: "Failed to fetch capabilities" });
    }
  },
);

// ─── GET /admin/kevin/context-requests ────────────────────────────────────────

router.get(
  "/admin/kevin/context-requests",
  requireAuth,
  requireAdmin,
  async (_req, res): Promise<void> => {
    try {
      const requests = await db
        .select({
          id: kevinContextRequestsTable.id,
          workflow: kevinContextRequestsTable.workflow,
          status: kevinContextRequestsTable.status,
          memoriesCount: kevinContextRequestsTable.memoriesCount,
          durationMs: kevinContextRequestsTable.durationMs,
          depth: kevinContextRequestsTable.depth,
          createdAt: kevinContextRequestsTable.createdAt,
        })
        .from(kevinContextRequestsTable)
        .orderBy(desc(kevinContextRequestsTable.createdAt))
        .limit(50);

      res.json({ requests });
    } catch (err) {
      logger.error({ err }, "[KevinAdmin] Failed to fetch context requests");
      res.status(500).json({ error: "Failed to fetch context requests" });
    }
  },
);

export default router;
