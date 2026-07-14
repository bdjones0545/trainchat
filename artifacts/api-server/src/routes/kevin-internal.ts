// ─── Kevin Internal Signal Intake ────────────────────────────────────────────
//
// POST /api/internal/kevin/signals
//
// Protected with KEVIN_INTERNAL_SERVICE_TOKEN (timing-safe comparison).
// Requires KEVIN_INTEGRATION_ENABLED=true AND KEVIN_SIGNAL_INTAKE_ENABLED=true.
//
// Kevin signals are evidence only — they cannot directly:
//   - Modify a workout
//   - Change a program
//   - Delete data
//   - Email a user
//   - Mark a workout complete
//   - Alter billing
//   - Change permissions or consent
//
// Depth > 3 is blocked to prevent recursive signal loops.

import { Router, type IRouter, type Request, type Response } from "express";
import { db } from "@workspace/db";
import {
  kevinAppSignalsTable,
  type KevinSignalType,
  KEVIN_SIGNAL_TYPES,
} from "@workspace/db";
import { and, eq } from "drizzle-orm";
import { getKevinConfig } from "../lib/kevin-config";
import { logger } from "../lib/logger";
import crypto from "crypto";
import { z } from "zod/v4";

const router: IRouter = Router();

// ─── Token validation ─────────────────────────────────────────────────────────

function extractBearerToken(req: Request): string | null {
  const auth = req.headers["authorization"];
  if (!auth || !auth.startsWith("Bearer ")) return null;
  return auth.slice(7).trim() || null;
}

/** Timing-safe string comparison to prevent timing attacks */
function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) {
    // Still run comparison to prevent length-oracle attacks
    crypto.timingSafeEqual(Buffer.alloc(32), Buffer.alloc(32));
    return false;
  }
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  return crypto.timingSafeEqual(bufA, bufB);
}

// ─── Request schema ───────────────────────────────────────────────────────────

const ALLOWED_ORIGINS = [
  "trainchat_user",
  "trainchat_generation",
  "trainchat_edit",
  "trainchat_feedback",
  "trainchat_external_api",
  "kevin_context",
  "kevin_signal",
  "human_admin",
] as const;

const KevinSignalSchema = z.object({
  signal_type: z.enum(KEVIN_SIGNAL_TYPES as unknown as [KevinSignalType, ...KevinSignalType[]]),
  external_signal_id: z.string().max(128).optional(),
  org_id: z.string().max(128).optional(),
  entity_type: z.string().max(64).optional(),
  entity_id: z.string().max(128).optional(),
  title: z.string().max(200).optional(),
  summary: z.string().max(2000).optional(),
  // Evidence is structured data — no executable code, SQL, or arbitrary routes
  evidence: z.record(z.string(), z.unknown()).optional(),
  confidence: z.number().int().min(0).max(100).optional(),
  risk_class: z.enum(["low", "medium", "high", "critical"]).optional(),
  trace_id: z.string().max(128).optional(),
  depth: z.number().int().min(0).max(10).default(0),
  parent_id: z.string().max(128).optional(),
  origin: z.enum(ALLOWED_ORIGINS).optional(),
});

// ─── Route ────────────────────────────────────────────────────────────────────

router.post(
  "/internal/kevin/signals",
  async (req: Request, res: Response): Promise<void> => {
    const config = getKevinConfig();

    // ── Feature flag checks ──────────────────────────────────────────────────
    if (!config.integrationEnabled) {
      res.status(503).json({
        error: "Kevin integration is disabled",
        code: "KEVIN_DISABLED",
      });
      return;
    }
    if (!config.signalIntakeEnabled) {
      res.status(503).json({
        error: "Kevin signal intake is disabled",
        code: "KEVIN_SIGNAL_INTAKE_DISABLED",
      });
      return;
    }

    // ── Service token authentication ─────────────────────────────────────────
    const token = extractBearerToken(req);
    if (!token) {
      res.status(401).json({ error: "Missing Authorization header", code: "UNAUTHORIZED" });
      return;
    }

    const expectedToken = config.internalServiceToken;
    if (!expectedToken) {
      // Misconfigured — no token set = always reject
      logger.error("[KevinSignals] KEVIN_INTERNAL_SERVICE_TOKEN is not configured");
      res.status(401).json({ error: "Service authentication not configured", code: "UNAUTHORIZED" });
      return;
    }

    if (!timingSafeEqual(token, expectedToken)) {
      // Log at warn, not error — could be probe/retry from old token
      logger.warn("[KevinSignals] Invalid service token — 401");
      res.status(401).json({ error: "Invalid service token", code: "UNAUTHORIZED" });
      return;
    }

    // ── Body validation ───────────────────────────────────────────────────────
    const parsed = KevinSignalSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "Invalid signal payload", details: parsed.error.issues });
      return;
    }

    const data = parsed.data;

    // ── Depth guard — block recursive loops ───────────────────────────────────
    if (data.depth > 3) {
      logger.warn(
        { depth: data.depth, signalType: data.signal_type, traceId: data.trace_id },
        "[KevinSignals] Depth > 3 — blocking to prevent recursive signal loop",
      );
      res.status(422).json({ error: "Signal depth exceeds maximum", code: "DEPTH_EXCEEDED" });
      return;
    }

    // ── Deduplication — block identical pending signals ──────────────────────
    if (data.external_signal_id) {
      const existing = await db
        .select({ id: kevinAppSignalsTable.id })
        .from(kevinAppSignalsTable)
        .where(
          and(
            eq(kevinAppSignalsTable.externalSignalId, data.external_signal_id),
            eq(kevinAppSignalsTable.applicationId, config.applicationId),
          ),
        )
        .limit(1);

      if (existing.length > 0) {
        res.status(200).json({ ok: true, deduplicated: true });
        return;
      }
    }

    // ── Validate evidence — reject dangerous fields ──────────────────────────
    const evidence = sanitizeEvidence(data.evidence ?? {});

    // ── Route the signal ─────────────────────────────────────────────────────
    const routedTo = routeSignal(data.signal_type);

    try {
      const [signal] = await db
        .insert(kevinAppSignalsTable)
        .values({
          externalSignalId: data.external_signal_id,
          applicationId: config.applicationId,
          orgId: data.org_id,
          signalType: data.signal_type,
          entityType: data.entity_type,
          entityId: data.entity_id,
          title: data.title,
          summary: data.summary,
          evidence,
          confidence: data.confidence,
          riskClass: data.risk_class ?? "low",
          status: "received",
          routedTo,
          traceId: data.trace_id ?? crypto.randomUUID(),
          depth: data.depth,
          parentId: data.parent_id,
          origin: data.origin,
          routedAt: new Date(),
        })
        .returning({ id: kevinAppSignalsTable.id });

      logger.info(
        {
          signalId: signal?.id,
          signalType: data.signal_type,
          routedTo,
          riskClass: data.risk_class ?? "low",
        },
        "[KevinSignals] Signal received and routed",
      );

      res.status(201).json({
        ok: true,
        signal_id: signal?.id,
        routed_to: routedTo,
      });
    } catch (err) {
      logger.error({ err }, "[KevinSignals] Failed to store signal");
      res.status(500).json({ error: "Failed to process signal" });
    }
  },
);

// ─── Signal routing ───────────────────────────────────────────────────────────
//
// Routes signals to the appropriate internal review queue.
// Signal routing does NOT trigger automatic actions on workouts or users.

function routeSignal(signalType: KevinSignalType): string {
  const routingMap: Record<KevinSignalType, string> = {
    "preference.pattern.detected": "product_intelligence",
    "adherence.pattern.detected": "product_intelligence",
    "program.quality.concern": "internal_review_queue",
    "repeated.edit.pattern": "product_intelligence",
    "exercise.dislike.pattern": "product_intelligence",
    "session.duration.pattern": "product_intelligence",
    "generation.failure.pattern": "engineering_ops",
    "external_api.failure.pattern": "engineering_ops",
    "product.support.signal": "support_queue",
    "environment.change": "admin_visibility",
    "architecture.change": "admin_visibility",
    "integration.failure": "engineering_ops",
    "memory.conflict": "memory_review_queue",
  };
  return routingMap[signalType] ?? "unrouted";
}

// ─── Evidence sanitization ────────────────────────────────────────────────────
//
// Kevin evidence must be structured data only.
// Reject: SQL, shell commands, executable code, arbitrary routes, secrets.

const FORBIDDEN_EVIDENCE_PATTERNS = [
  /select\s+/i,
  /drop\s+table/i,
  /insert\s+into/i,
  /delete\s+from/i,
  /exec\s*\(/i,
  /eval\s*\(/i,
  /require\s*\(/i,
  /import\s*\(/i,
  /process\.env/i,
  /api_key/i,
  /secret/i,
  /password/i,
  /token/i,
];

function sanitizeEvidence(
  evidence: Record<string, unknown>,
): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(evidence)) {
    if (typeof value === "string") {
      const isForbidden = FORBIDDEN_EVIDENCE_PATTERNS.some((re) =>
        re.test(value),
      );
      if (isForbidden) {
        logger.warn({ key }, "[KevinSignals] Suspicious evidence field rejected");
        continue;
      }
      result[key] = value.slice(0, 1000);
    } else if (
      typeof value === "number" ||
      typeof value === "boolean" ||
      value === null
    ) {
      result[key] = value;
    }
    // Arrays and nested objects are dropped for safety in Phase 1
  }
  return result;
}

export default router;
