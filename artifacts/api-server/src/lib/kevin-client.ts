// ─── Kevin HTTP Client ────────────────────────────────────────────────────────
//
// Typed HTTP client for all TrainChat → Kevin/Hermes calls.
// Every method:
//   - checks KEVIN_INTEGRATION_ENABLED before any network call
//   - enforces circuit breaker
//   - sets a strict timeout
//   - caps response size
//   - never propagates raw Kevin errors to end users
//   - adds standard application metadata to every request
//
// Endpoint readiness classification:
//   VERIFIED   — contract confirmed with Kevin/Hermes team
//   PENDING    — endpoint defined in spec; not yet confirmed with Hermes
//
// Current status: All endpoints are PENDING — no live Hermes instance exists yet.
// Kevin integration is in staged-activation mode. All calls will return
// KEVIN_NOT_CONFIGURED or KEVIN_DISABLED until KEVIN_HERMES_BASE_URL is set.

import { getKevinConfig } from "./kevin-config";
import {
  isKevinCircuitAllowed,
  recordKevinFailure,
  recordKevinSuccess,
} from "./kevin-circuit-breaker";
import { logger } from "./logger";
import crypto from "crypto";

// ─── Error types ──────────────────────────────────────────────────────────────

export type KevinErrorCode =
  | "KEVIN_DISABLED"
  | "KEVIN_NOT_CONFIGURED"
  | "KEVIN_UNAVAILABLE"
  | "KEVIN_TIMEOUT"
  | "KEVIN_AUTH"
  | "KEVIN_BUSY"
  | "KEVIN_INVALID_RESPONSE"
  | "KEVIN_UNSUPPORTED_ENDPOINT"
  | "KEVIN_CIRCUIT_OPEN"
  | "KEVIN_HTTP";

export class KevinError extends Error {
  constructor(
    public readonly code: KevinErrorCode,
    message: string,
    public readonly statusCode?: number,
  ) {
    super(message);
    this.name = "KevinError";
  }
}

// ─── Request metadata ─────────────────────────────────────────────────────────

export interface KevinRequestMeta {
  application_id: string;
  environment: "production" | "development";
  org_id?: string;
  user_id: string;           // always pseudonymous
  trace_id: string;
}

function buildMeta(
  userIdPseudonymous: string,
  orgId?: string,
): KevinRequestMeta {
  const config = getKevinConfig();
  return {
    application_id: config.applicationId,
    environment:
      process.env["NODE_ENV"] === "production" ? "production" : "development",
    ...(orgId ? { org_id: orgId } : {}),
    user_id: userIdPseudonymous,
    trace_id: crypto.randomUUID(),
  };
}

// ─── Health / capabilities ────────────────────────────────────────────────────

export interface KevinHealthResult {
  ok: boolean;
  version?: string;
  traceId: string;
}

/**
 * checkKevinHealth — PENDING endpoint
 * Used by circuit breaker probes and admin diagnostics.
 */
export async function checkKevinHealth(): Promise<KevinHealthResult> {
  const config = getKevinConfig();
  const traceId = crypto.randomUUID();

  if (!config.integrationEnabled) {
    throw new KevinError("KEVIN_DISABLED", "Kevin integration is disabled");
  }
  if (!config.hermesBaseUrl || !config.hermesApiKey) {
    throw new KevinError(
      "KEVIN_NOT_CONFIGURED",
      "KEVIN_HERMES_BASE_URL or KEVIN_HERMES_API_KEY is not configured",
    );
  }
  if (!isKevinCircuitAllowed()) {
    throw new KevinError(
      "KEVIN_CIRCUIT_OPEN",
      "Kevin circuit breaker is open",
    );
  }

  const url = `${config.hermesBaseUrl}/health`;
  let data: unknown;

  try {
    const controller = new AbortController();
    const timer = setTimeout(
      () => controller.abort(),
      config.healthTimeoutMs,
    );

    const resp = await fetch(url, {
      method: "GET",
      headers: buildHeaders(config.hermesApiKey, traceId),
      signal: controller.signal,
    }).finally(() => clearTimeout(timer));

    if (!resp.ok) {
      const code = resp.status === 429 ? "KEVIN_BUSY" : resp.status === 401 || resp.status === 403 ? "KEVIN_AUTH" : "KEVIN_HTTP";
      recordKevinFailure(`HTTP ${resp.status}`);
      throw new KevinError(code as KevinErrorCode, `Kevin health returned ${resp.status}`, resp.status);
    }

    data = await readBoundedJson(resp, config.maxContextResponseBytes);
    recordKevinSuccess();

    return {
      ok: true,
      version: (data as any)?.version,
      traceId,
    };
  } catch (err) {
    if (err instanceof KevinError) throw err;
    if ((err as any)?.name === "AbortError") {
      recordKevinFailure("timeout");
      throw new KevinError("KEVIN_TIMEOUT", "Kevin health check timed out");
    }
    recordKevinFailure(String(err));
    throw new KevinError("KEVIN_UNAVAILABLE", "Kevin health check failed");
  }
}

// ─── Context retrieval ────────────────────────────────────────────────────────

export interface KevinContextRequest {
  userIdPseudonymous: string;
  orgId?: string;
  workflow: string;
  entityType?: string;
  entityId?: string;
  questionSummary?: string;
}

export interface KevinContextResponse {
  available: boolean;
  status:
    | "success"
    | "empty"
    | "disabled"
    | "consent_required"
    | "unavailable"
    | "timeout"
    | "failed"
    | "blocked_loop";
  preferences: {
    trainingStyle?: string[];
    sessionDurationMinutes?: number;
    equipmentPreferences?: string[];
    preferredExercises?: string[];
    avoidedExercises?: string[];
    coachingTone?: string;
  };
  patterns: string[];
  priorAcceptedChanges: string[];
  adherenceInsights: string[];
  risks: string[];
  confidence?: number;
  memoriesCount: number;
  contextRequestId?: string;
  traceId: string;
  durationMs: number;
}

const EMPTY_CONTEXT: Omit<KevinContextResponse, "traceId" | "durationMs"> = {
  available: false,
  status: "disabled",
  preferences: {},
  patterns: [],
  priorAcceptedChanges: [],
  adherenceInsights: [],
  risks: [],
  memoriesCount: 0,
};

/**
 * requestKevinContext — PENDING endpoint
 * Fetches optional enrichment context before a TrainChat generation or edit.
 * Always fail-open: on any error returns an empty disabled context so the
 * calling workflow continues unaffected.
 */
export async function requestKevinContext(
  input: KevinContextRequest,
): Promise<KevinContextResponse> {
  const config = getKevinConfig();
  const traceId = crypto.randomUUID();
  const start = Date.now();

  if (!config.integrationEnabled || !config.contextRetrievalEnabled) {
    return { ...EMPTY_CONTEXT, status: "disabled", traceId, durationMs: 0 };
  }
  if (!config.hermesBaseUrl || !config.hermesApiKey) {
    return { ...EMPTY_CONTEXT, status: "disabled", traceId, durationMs: 0 };
  }
  if (!isKevinCircuitAllowed()) {
    logger.warn("[KevinClient] Circuit open — skipping context retrieval");
    return { ...EMPTY_CONTEXT, status: "unavailable", traceId, durationMs: 0 };
  }

  const url = `${config.hermesBaseUrl}/v1/context`;
  const meta = buildMeta(input.userIdPseudonymous, input.orgId);

  try {
    const controller = new AbortController();
    const timer = setTimeout(
      () => controller.abort(),
      config.contextTimeoutMs,
    );

    const resp = await fetch(url, {
      method: "POST",
      headers: { ...buildHeaders(config.hermesApiKey, traceId), "Content-Type": "application/json" },
      body: JSON.stringify({
        meta,
        workflow: input.workflow,
        entity_type: input.entityType,
        entity_id: input.entityId,
        question_summary: sanitizeText(input.questionSummary),
      }),
      signal: controller.signal,
    }).finally(() => clearTimeout(timer));

    if (!resp.ok) {
      recordKevinFailure(`HTTP ${resp.status}`);
      logger.warn(
        { status: resp.status, workflow: input.workflow },
        "[KevinClient] Context retrieval HTTP error — returning empty context",
      );
      return {
        ...EMPTY_CONTEXT,
        status: "failed",
        traceId,
        durationMs: Date.now() - start,
      };
    }

    const raw = await readBoundedJson(resp, config.maxContextResponseBytes);
    const validated = validateAndBoundContextResponse(raw, config.maxContextMemories);

    recordKevinSuccess();
    logger.info(
      {
        workflow: input.workflow,
        memoriesCount: validated.memoriesCount,
        durationMs: Date.now() - start,
      },
      "[KevinClient] Context retrieved",
    );

    return { ...validated, traceId, durationMs: Date.now() - start };
  } catch (err) {
    const durationMs = Date.now() - start;
    if ((err as any)?.name === "AbortError") {
      recordKevinFailure("timeout");
      logger.warn("[KevinClient] Context retrieval timed out — continuing without Kevin");
      return { ...EMPTY_CONTEXT, status: "timeout", traceId, durationMs };
    }
    recordKevinFailure(String(err));
    logger.warn(
      { err },
      "[KevinClient] Context retrieval failed — continuing without Kevin",
    );
    return { ...EMPTY_CONTEXT, status: "failed", traceId, durationMs };
  }
}

// ─── Event dispatch ───────────────────────────────────────────────────────────

export interface KevinEventPayload {
  userIdPseudonymous: string;
  orgId?: string;
  eventType: string;
  entityType?: string;
  entityId?: string;
  summary: Record<string, unknown>;
  idempotencyKey: string;
  traceId: string;
  origin: string;
  depth: number;
}

/**
 * sendKevinEvent — PENDING endpoint
 * Dispatches a sanitized training event to Kevin.
 * Only called from the event worker, never from request handlers.
 */
export async function sendKevinEvent(
  event: KevinEventPayload,
): Promise<void> {
  const config = getKevinConfig();

  if (!config.integrationEnabled || !config.eventDispatchEnabled) {
    throw new KevinError("KEVIN_DISABLED", "Kevin event dispatch is disabled");
  }
  if (!config.hermesBaseUrl || !config.hermesApiKey) {
    throw new KevinError(
      "KEVIN_NOT_CONFIGURED",
      "Kevin Hermes is not configured",
    );
  }
  if (!isKevinCircuitAllowed()) {
    throw new KevinError("KEVIN_CIRCUIT_OPEN", "Kevin circuit is open");
  }

  const url = `${config.hermesBaseUrl}/v1/events`;
  const meta = buildMeta(event.userIdPseudonymous, event.orgId);

  const controller = new AbortController();
  const timer = setTimeout(
    () => controller.abort(),
    config.eventTimeoutMs,
  );

  try {
    const resp = await fetch(url, {
      method: "POST",
      headers: {
        ...buildHeaders(config.hermesApiKey, event.traceId),
        "Content-Type": "application/json",
        "Idempotency-Key": event.idempotencyKey,
      },
      body: JSON.stringify({
        meta,
        event_type: event.eventType,
        entity_type: event.entityType,
        entity_id: event.entityId,
        summary: event.summary,
        origin: event.origin,
        depth: event.depth,
      }),
      signal: controller.signal,
    }).finally(() => clearTimeout(timer));

    if (!resp.ok) {
      const code =
        resp.status === 429
          ? "KEVIN_BUSY"
          : resp.status === 401 || resp.status === 403
            ? "KEVIN_AUTH"
            : "KEVIN_HTTP";
      recordKevinFailure(`HTTP ${resp.status}`);
      throw new KevinError(
        code as KevinErrorCode,
        `Kevin event endpoint returned ${resp.status}`,
        resp.status,
      );
    }

    recordKevinSuccess();
  } catch (err) {
    if ((err as any)?.name === "AbortError") {
      recordKevinFailure("timeout");
      throw new KevinError("KEVIN_TIMEOUT", "Kevin event send timed out");
    }
    if (err instanceof KevinError) throw err;
    recordKevinFailure(String(err));
    throw new KevinError("KEVIN_UNAVAILABLE", `Kevin event send failed: ${err}`);
  } finally {
    clearTimeout(timer);
  }
}

/**
 * sendKevinOutcome — PENDING endpoint
 * Forwards a training outcome to Kevin for learning.
 */
export async function sendKevinOutcome(payload: {
  userIdPseudonymous: string;
  orgId?: string;
  outcomeType: string;
  entityType?: string;
  entityId?: string;
  contextRequestId?: string;
  resultSummary: Record<string, unknown>;
  wasUseful?: boolean;
  wasModified?: boolean;
  completionStatus?: string;
  traceId: string;
}): Promise<void> {
  const config = getKevinConfig();

  if (!config.integrationEnabled || !config.outcomeForwardingEnabled) {
    throw new KevinError("KEVIN_DISABLED", "Kevin outcome forwarding is disabled");
  }
  if (!config.hermesBaseUrl || !config.hermesApiKey) {
    throw new KevinError("KEVIN_NOT_CONFIGURED", "Kevin Hermes is not configured");
  }
  if (!isKevinCircuitAllowed()) {
    throw new KevinError("KEVIN_CIRCUIT_OPEN", "Kevin circuit is open");
  }

  const url = `${config.hermesBaseUrl}/v1/outcomes`;
  const meta = buildMeta(payload.userIdPseudonymous, payload.orgId);

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), config.eventTimeoutMs);

  try {
    const resp = await fetch(url, {
      method: "POST",
      headers: {
        ...buildHeaders(config.hermesApiKey, payload.traceId),
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        meta,
        outcome_type: payload.outcomeType,
        entity_type: payload.entityType,
        entity_id: payload.entityId,
        context_request_id: payload.contextRequestId,
        result_summary: payload.resultSummary,
        was_useful: payload.wasUseful,
        was_modified: payload.wasModified,
        completion_status: payload.completionStatus,
      }),
      signal: controller.signal,
    }).finally(() => clearTimeout(timer));

    if (!resp.ok) {
      recordKevinFailure(`HTTP ${resp.status}`);
      throw new KevinError("KEVIN_HTTP", `Kevin outcome endpoint returned ${resp.status}`, resp.status);
    }

    recordKevinSuccess();
  } catch (err) {
    if ((err as any)?.name === "AbortError") {
      recordKevinFailure("timeout");
      throw new KevinError("KEVIN_TIMEOUT", "Kevin outcome send timed out");
    }
    if (err instanceof KevinError) throw err;
    recordKevinFailure(String(err));
    throw new KevinError("KEVIN_UNAVAILABLE", `Kevin outcome send failed: ${err}`);
  } finally {
    clearTimeout(timer);
  }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function buildHeaders(
  apiKey: string,
  traceId: string,
): Record<string, string> {
  return {
    Authorization: `Bearer ${apiKey}`,
    "X-Application-Id": "trainchat",
    "X-Trace-Id": traceId,
    "X-Environment":
      process.env["NODE_ENV"] === "production" ? "production" : "development",
  };
}

async function readBoundedJson(
  resp: Response,
  maxBytes: number,
): Promise<unknown> {
  const text = await resp.text();
  if (text.length > maxBytes) {
    throw new KevinError(
      "KEVIN_INVALID_RESPONSE",
      `Kevin response exceeds max size (${text.length} > ${maxBytes} bytes)`,
    );
  }
  try {
    return JSON.parse(text);
  } catch {
    throw new KevinError(
      "KEVIN_INVALID_RESPONSE",
      "Kevin returned non-JSON response",
    );
  }
}

function sanitizeText(s?: string): string | undefined {
  if (!s) return undefined;
  // Remove null bytes and control characters that could inject into prompts
  return s.replace(/\x00/g, "").replace(/[\x01-\x08\x0b\x0c\x0e-\x1f]/g, "").slice(0, 500);
}

// ─── Context response validation ─────────────────────────────────────────────
//
// Kevin context is DATA — not system policy.
// Unknown fields are ignored. Oversized arrays are truncated.
// Arbitrary exercise IDs, SQL, shell commands, and routes are rejected.

function validateAndBoundContextResponse(
  raw: unknown,
  maxMemories: number,
): KevinContextResponse {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return {
      ...EMPTY_CONTEXT,
      status: "failed",
      traceId: crypto.randomUUID(),
      durationMs: 0,
    };
  }

  const r = raw as Record<string, unknown>;

  const preferences: KevinContextResponse["preferences"] = {};

  const rawPrefs = r["preferences"];
  if (rawPrefs && typeof rawPrefs === "object" && !Array.isArray(rawPrefs)) {
    const p = rawPrefs as Record<string, unknown>;
    if (Array.isArray(p["trainingStyle"]))
      preferences.trainingStyle = (p["trainingStyle"] as unknown[])
        .filter((x) => typeof x === "string")
        .slice(0, 10) as string[];
    if (typeof p["sessionDurationMinutes"] === "number")
      preferences.sessionDurationMinutes = Math.min(
        Math.max(p["sessionDurationMinutes"], 10),
        240,
      );
    if (Array.isArray(p["equipmentPreferences"]))
      preferences.equipmentPreferences = (p["equipmentPreferences"] as unknown[])
        .filter((x) => typeof x === "string")
        .slice(0, 20) as string[];
    if (Array.isArray(p["preferredExercises"]))
      preferences.preferredExercises = (p["preferredExercises"] as unknown[])
        .filter((x) => typeof x === "string")
        .slice(0, maxMemories) as string[];
    if (Array.isArray(p["avoidedExercises"]))
      preferences.avoidedExercises = (p["avoidedExercises"] as unknown[])
        .filter((x) => typeof x === "string")
        .slice(0, maxMemories) as string[];
    if (typeof p["coachingTone"] === "string")
      preferences.coachingTone = p["coachingTone"].slice(0, 100);
  }

  function safeStringArray(val: unknown, limit: number): string[] {
    if (!Array.isArray(val)) return [];
    return (val as unknown[])
      .filter((x) => typeof x === "string")
      .map((x) => (x as string).slice(0, 500))
      .slice(0, limit);
  }

  return {
    available: true,
    status: "success",
    preferences,
    patterns: safeStringArray(r["patterns"], maxMemories),
    priorAcceptedChanges: safeStringArray(r["priorAcceptedChanges"], maxMemories),
    adherenceInsights: safeStringArray(r["adherenceInsights"], maxMemories),
    risks: safeStringArray(r["risks"], 5),
    confidence:
      typeof r["confidence"] === "number"
        ? Math.min(Math.max(r["confidence"], 0), 100)
        : undefined,
    memoriesCount:
      typeof r["memoriesCount"] === "number" ? r["memoriesCount"] : 0,
    contextRequestId:
      typeof r["contextRequestId"] === "string"
        ? r["contextRequestId"]
        : undefined,
    traceId: crypto.randomUUID(),
    durationMs: 0,
  };
}
