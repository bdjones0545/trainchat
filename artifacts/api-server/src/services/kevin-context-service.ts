// ─── Kevin Context Service ────────────────────────────────────────────────────
//
// Orchestrates safe optional Kevin context retrieval before generation or editing.
//
// Context hierarchy (highest → lowest priority):
//   1. Current authenticated user request
//   2. Current program / session constraints
//   3. Current safety rules
//   4. Current equipment and scheduling constraints
//   5. Explicit user preferences stored in TrainChat
//   6. Optional Kevin memories          ← this service enriches here
//   7. General defaults
//
// Kevin memory NEVER overrides a current explicit request or a safety restriction.
// Kevin context is DATA — not system policy.
//
// Capability modes:
//   observe           → context retrieved, logged, NOT applied to generation
//   recommend / draft → context retrieved AND applied (bounded prompt fragment)
//   require_approval  → context retrieved but not applied without explicit approval
//   auto              → context applied (never bypasses safety or validation)
//   disabled          → no context requested
//
// Consent requirements for program generation context:
//   BOTH training_preferences AND program_history_summary must be granted.
//
// Privacy guarantees:
//   - No raw emails, names, phone numbers, or addresses sent to Kevin
//   - No medical diagnoses, raw injury notes, or pain reports sent
//   - No payment data, auth data, or API keys sent
//   - No hidden prompts or chain-of-thought sent
//   - Only categorical / summary constraints

import { requestKevinContext, type KevinContextResponse } from "../lib/kevin-client";
import { hasKevinConsent } from "../lib/kevin-consent-service";
import { isKevinCapabilityEnabled, getKevinCapabilityMode } from "../lib/kevin-capability-service";
import { getKevinConfig } from "../lib/kevin-config";
import { deriveKevinPseudonymousId, deriveKevinPseudonymousOrgId } from "../lib/kevin-pseudonym";
import {
  db,
  kevinContextRequestsTable,
  type KevinCapabilityMode,
} from "@workspace/db";
import { logger } from "../lib/logger";
import crypto from "crypto";

// ─── Public types ─────────────────────────────────────────────────────────────

export type KevinWorkflow =
  | "program_generation"
  | "session_generation"
  | "program_edit"
  | "session_edit"
  | "exercise_substitution"
  | "feedback_interpretation"
  | "onboarding_assistance"
  | "support_navigation";

export interface KevinContextInput {
  userId: number;
  orgId?: string;
  workflow: KevinWorkflow;
  entityType?: string;
  entityId?: string;
  /** Brief description of why context is being requested — no raw prompts */
  questionSummary?: string;
  /** Propagation depth — blocks recursive loops at >3 */
  depth?: number;
  parentTraceId?: string;
}

export interface TrainChatKevinContext {
  available: boolean;
  status: KevinContextResponse["status"];
  preferences: KevinContextResponse["preferences"];
  patterns: string[];
  priorAcceptedChanges: string[];
  adherenceInsights: string[];
  risks: string[];
  confidence?: number;
  memoriesCount: number;
  contextRequestId?: string;
  traceId: string;
  durationMs: number;
  /** Whether the context was retrieved from Kevin (even if not applied) */
  contextRetrieved: boolean;
  /**
   * Whether the context was applied to the generation prompt.
   * false in "observe" mode — context is audited but does not alter generation.
   * true in "draft", "auto", "recommend" modes.
   */
  contextApplied: boolean;
  /** The capability mode that was active during this request */
  capabilityMode: KevinCapabilityMode;
}

const DISABLED_CONTEXT: Omit<TrainChatKevinContext, "traceId" | "durationMs"> = {
  available: false,
  status: "disabled",
  preferences: {},
  patterns: [],
  priorAcceptedChanges: [],
  adherenceInsights: [],
  risks: [],
  memoriesCount: 0,
  contextRetrieved: false,
  contextApplied: false,
  capabilityMode: "disabled",
};

// ─── requestTrainChatKevinContext ─────────────────────────────────────────────

/**
 * Main entry point: fetches optional Kevin context enrichment for a workflow.
 *
 * Always fail-open — any error returns a disabled/empty context so the caller
 * continues without interruption. Kevin failure NEVER blocks a workout.
 *
 * Consent enforcement:
 *   For program generation, BOTH training_preferences AND program_history_summary
 *   must be granted. If either is missing, returns consent_required and does NOT
 *   call Kevin.
 *
 * Capability mode enforcement:
 *   observe  → context retrieved for audit, contextApplied = false
 *   draft/auto/recommend → context retrieved AND applied, contextApplied = true
 *   disabled → no call
 *   require_approval → no automatic application
 */
export async function requestTrainChatKevinContext(
  input: KevinContextInput,
): Promise<TrainChatKevinContext> {
  const traceId = crypto.randomUUID();
  const start = Date.now();

  // ── Recursion guard ────────────────────────────────────────────────────────
  const depth = input.depth ?? 0;
  if (depth > 3) {
    logger.warn(
      { depth, workflow: input.workflow, traceId },
      "[KevinContext] Depth > 3 — blocking recursive context loop",
    );
    return { ...DISABLED_CONTEXT, status: "blocked_loop", traceId, durationMs: 0 };
  }

  // ── Master feature flag ───────────────────────────────────────────────────
  const config = getKevinConfig();
  if (!config.integrationEnabled || !config.contextRetrievalEnabled) {
    return { ...DISABLED_CONTEXT, status: "disabled", traceId, durationMs: 0 };
  }

  // ── Capability check ──────────────────────────────────────────────────────
  const capabilityMap: Record<KevinWorkflow, import("@workspace/db").KevinCapability> = {
    program_generation: "program_generation_context",
    session_generation: "program_generation_context",
    program_edit: "program_edit_context",
    session_edit: "program_edit_context",
    exercise_substitution: "exercise_substitution_context",
    feedback_interpretation: "session_feedback_learning",
    onboarding_assistance: "training_context",
    support_navigation: "support_navigation",
  };

  const capability = capabilityMap[input.workflow];
  const capEnabled = await isKevinCapabilityEnabled(capability);
  if (!capEnabled) {
    return { ...DISABLED_CONTEXT, status: "disabled", traceId, durationMs: 0 };
  }

  // Get the mode so we know whether to apply or just observe
  const capabilityMode = await getKevinCapabilityMode(capability, config.applicationId);
  if (capabilityMode === "disabled" || capabilityMode === "require_approval") {
    return {
      ...DISABLED_CONTEXT,
      status: "disabled",
      capabilityMode,
      traceId,
      durationMs: 0,
    };
  }

  // ── Consent check — both required for generation context ─────────────────
  // Per spec: training_preferences AND program_history_summary must both be granted.
  // If either is not granted, return consent_required and do NOT call Kevin.
  // Revoked consent immediately stops future context requests.
  const [hasPrefConsent, hasHistoryConsent] = await Promise.all([
    hasKevinConsent(input.userId, "training_preferences"),
    hasKevinConsent(input.userId, "program_history_summary"),
  ]);

  if (!hasPrefConsent || !hasHistoryConsent) {
    logger.info(
      {
        userId: input.userId,
        workflow: input.workflow,
        hasPrefConsent,
        hasHistoryConsent,
      },
      "[KevinContext] Consent not granted for required memory types — skipping (no Kevin call)",
    );
    return {
      ...DISABLED_CONTEXT,
      status: "consent_required",
      capabilityMode,
      traceId,
      durationMs: Date.now() - start,
    };
  }

  // ── Derive pseudonymous identifiers ───────────────────────────────────────
  // Raw user IDs, emails, names are NEVER sent to Kevin
  const userIdPseudonymous = deriveKevinPseudonymousId(input.userId);
  const orgIdPseudonymous = input.orgId
    ? deriveKevinPseudonymousOrgId(input.orgId)
    : undefined;

  // ── Log the context request (audit) ──────────────────────────────────────
  let contextRequestDbId: number | undefined;
  try {
    const [row] = await db
      .insert(kevinContextRequestsTable)
      .values({
        applicationId: config.applicationId,
        orgId: orgIdPseudonymous,
        userIdPseudonymous,
        workflow: input.workflow,
        entityType: input.entityType,
        entityId: input.entityId,
        questionSummary: input.questionSummary,
        traceId,
        depth,
        status: "pending" as any,
      })
      .returning({ id: kevinContextRequestsTable.id });
    contextRequestDbId = row?.id;
  } catch (err) {
    logger.warn({ err }, "[KevinContext] Failed to log context request — proceeding");
  }

  // ── Fetch from Kevin (fail-open) ──────────────────────────────────────────
  // Any error from the Kevin client returns a disabled context so the caller's
  // workout workflow is never blocked. Kevin failure NEVER crashes the server.
  let kevinResponse: Awaited<ReturnType<typeof requestKevinContext>>;
  try {
    kevinResponse = await requestKevinContext({
      userIdPseudonymous,
      orgId: orgIdPseudonymous,
      workflow: input.workflow,
      entityType: input.entityType,
      entityId: input.entityId,
      questionSummary: input.questionSummary,
    });
  } catch (err) {
    const durationMs = Date.now() - start;
    logger.warn({ err, workflow: input.workflow, durationMs }, "[KevinContext] Kevin client threw — returning disabled context (fail-open)");
    if (contextRequestDbId !== undefined) {
      const { eq } = await import("drizzle-orm");
      db.update(kevinContextRequestsTable)
        .set({ status: "error" as any, durationMs })
        .where(eq(kevinContextRequestsTable.id, contextRequestDbId))
        .catch(() => {});
    }
    return {
      ...DISABLED_CONTEXT,
      status: "error" as unknown as typeof DISABLED_CONTEXT.status,
      capabilityMode,
      traceId,
      durationMs,
    };
  }

  const durationMs = Date.now() - start;
  const contextRetrieved = kevinResponse.available;

  // "observe" mode: context is retrieved for audit but MUST NOT alter generation.
  // ("require_approval" was already handled above — capabilityMode narrows here to
  //  "recommend" | "draft" | "auto" | "observe")
  const contextApplied = contextRetrieved && capabilityMode !== "observe";

  // ── Update audit record ───────────────────────────────────────────────────
  if (contextRequestDbId !== undefined) {
    const { eq } = await import("drizzle-orm");
    db.update(kevinContextRequestsTable)
      .set({
        responseSummary: kevinResponse.available ? "context_returned" : kevinResponse.status,
        memoriesCount: kevinResponse.memoriesCount,
        confidence: kevinResponse.confidence,
        durationMs,
        status: kevinResponse.status,
      })
      .where(eq(kevinContextRequestsTable.id, contextRequestDbId))
      .catch((err: unknown) => {
        logger.warn({ err }, "[KevinContext] Failed to update context request audit row");
      });
  }

  logger.info(
    {
      workflow: input.workflow,
      status: kevinResponse.status,
      memoriesCount: kevinResponse.memoriesCount,
      contextRetrieved,
      contextApplied,
      capabilityMode,
      durationMs,
    },
    "[KevinContext] Context retrieval complete",
  );

  return {
    available: kevinResponse.available,
    status: kevinResponse.status,
    preferences: kevinResponse.preferences,
    patterns: kevinResponse.patterns,
    priorAcceptedChanges: kevinResponse.priorAcceptedChanges,
    adherenceInsights: kevinResponse.adherenceInsights,
    risks: kevinResponse.risks,
    confidence: kevinResponse.confidence,
    memoriesCount: kevinResponse.memoriesCount,
    contextRequestId: contextRequestDbId !== undefined
      ? String(contextRequestDbId)
      : kevinResponse.contextRequestId,
    traceId,
    durationMs,
    contextRetrieved,
    contextApplied,
    capabilityMode,
  };
}

// ─── Prompt context builder ───────────────────────────────────────────────────

/**
 * Converts Kevin context into a concise, safe string fragment for the system prompt.
 *
 * Only called when contextApplied = true (draft/auto/recommend mode).
 *
 * IMPORTANT: Kevin memory is enrichment only — clearly framed as optional
 * preferences, never as hard constraints that override the user's current request.
 *
 * Delimiter-breaking characters are stripped to prevent prompt injection.
 * Hidden chain-of-thought is never stored or returned.
 */
export function buildKevinContextPromptFragment(
  context: TrainChatKevinContext,
): string {
  if (!context.contextApplied || !context.available || context.memoriesCount === 0) return "";

  const lines: string[] = [
    "=== OPTIONAL SAVED PREFERENCES (from Kevin memory) ===",
    "These are historical preferences only. They must NEVER override:",
    "  - the user's current explicit request",
    "  - current safety rules",
    "  - current equipment constraints",
    "  - current program constraints",
    "  - current session duration requirements",
    "",
  ];

  const p = context.preferences;
  if (p.sessionDurationMinutes) {
    lines.push(`Preferred session duration: ~${p.sessionDurationMinutes} minutes`);
  }
  if (p.trainingStyle?.length) {
    lines.push(`Preferred training style: ${sanitizeFragment(p.trainingStyle.join(", "))}`);
  }
  if (p.equipmentPreferences?.length) {
    lines.push(`Equipment preferences: ${sanitizeFragment(p.equipmentPreferences.join(", "))}`);
  }
  if (p.coachingTone) {
    lines.push(`Preferred coaching tone: ${sanitizeFragment(p.coachingTone)}`);
  }
  if (p.preferredExercises?.length) {
    lines.push(`Previously accepted exercises: ${sanitizeFragment(p.preferredExercises.join(", "))}`);
  }
  if (p.avoidedExercises?.length) {
    lines.push(`Previously avoided exercises: ${sanitizeFragment(p.avoidedExercises.join(", "))}`);
  }
  if (context.patterns.length) {
    lines.push(`Patterns: ${sanitizeFragment(context.patterns.join("; "))}`);
  }
  if (context.priorAcceptedChanges.length) {
    lines.push(`Prior accepted changes: ${sanitizeFragment(context.priorAcceptedChanges.join("; "))}`);
  }

  lines.push("=== END KEVIN CONTEXT ===");
  return lines.join("\n");
}

/** Strip characters that could break prompt delimiters or inject instructions */
function sanitizeFragment(s: string): string {
  return s
    .replace(/\x00/g, "")
    .replace(/[\x01-\x08\x0b\x0c\x0e-\x1f]/g, "")
    .replace(/={3,}/g, "---")  // neutralise "===" delimiters
    .slice(0, 300);
}

// ─── Generation provenance ────────────────────────────────────────────────────

/**
 * Provenance metadata added to generation results when Kevin context was used.
 * Kept server-side unless a user-facing explanation is explicitly supported.
 */
export interface KevinGenerationProvenance {
  kevinContextUsed: boolean;
  kevinContextRetrieved: boolean;
  kevinContextApplied: boolean;
  kevinContextRequestId?: string;
  kevinMemoriesCount: number;
  kevinContextConfidence?: number;
  kevinContextStatus: string;
  kevinCapabilityMode: string;
  kevinTraceId: string;
}

export function buildKevinGenerationProvenance(
  context: TrainChatKevinContext,
): KevinGenerationProvenance {
  return {
    kevinContextUsed: context.available,
    kevinContextRetrieved: context.contextRetrieved,
    kevinContextApplied: context.contextApplied,
    kevinContextRequestId: context.contextRequestId,
    kevinMemoriesCount: context.memoriesCount,
    kevinContextConfidence: context.confidence,
    kevinContextStatus: context.status,
    kevinCapabilityMode: context.capabilityMode,
    kevinTraceId: context.traceId,
  };
}
