// ─── Kevin Integration Configuration ─────────────────────────────────────────
//
// All Kevin env vars are read here. Every Kevin feature defaults to DISABLED.
// Kevin being unavailable must NEVER stop a valid TrainChat workout.
//
// Staged activation order:
//   Stage 1: KEVIN_INTEGRATION_ENABLED=true          (health + circuit state)
//   Stage 2: KEVIN_CONTEXT_RETRIEVAL_ENABLED=true    (optional generation context)
//   Stage 3: KEVIN_EVENT_DISPATCH_ENABLED=true        (event queue dispatch)
//   Stage 4: KEVIN_OUTCOME_FORWARDING_ENABLED=true   (outcome forwarding)
//   Stage 5: KEVIN_SIGNAL_INTAKE_ENABLED=true         (inbound Kevin signals)
//   Stage 6: Cross-application context — NOT enabled until identity linking,
//             explicit consent, revocation, and auditing are verified.
//
// SECURITY:
//   - All secrets are server-only; none may appear in browser bundles.
//   - No Kevin URL or secret is ever returned to the client.
//   - The transformation key for pseudonymous IDs must remain server-only.

import { logger } from "./logger";

// ─── Kevin environment variables ─────────────────────────────────────────────

export interface KevinConfig {
  integrationEnabled: boolean;
  contextRetrievalEnabled: boolean;
  eventDispatchEnabled: boolean;
  outcomeForwardingEnabled: boolean;
  signalIntakeEnabled: boolean;

  hermesBaseUrl: string | null;
  hermesApiKey: string | null;
  internalServiceToken: string | null;

  applicationId: string;
  pseudonymSalt: string | null;

  // Timeouts
  contextTimeoutMs: number;
  eventTimeoutMs: number;
  healthTimeoutMs: number;

  // Size caps
  maxContextMemories: number;
  maxContextResponseBytes: number;
}

function readBool(key: string): boolean {
  const val = process.env[key];
  return val === "true" || val === "1";
}

function readInt(key: string, fallback: number): number {
  const val = process.env[key];
  if (!val) return fallback;
  const n = parseInt(val, 10);
  return isNaN(n) ? fallback : n;
}

let _config: KevinConfig | null = null;

export function getKevinConfig(): KevinConfig {
  if (_config) return _config;

  const integrationEnabled = readBool("KEVIN_INTEGRATION_ENABLED");

  _config = {
    integrationEnabled,

    // Sub-flags only have effect when integrationEnabled = true
    contextRetrievalEnabled:
      integrationEnabled && readBool("KEVIN_CONTEXT_RETRIEVAL_ENABLED"),
    eventDispatchEnabled:
      integrationEnabled && readBool("KEVIN_EVENT_DISPATCH_ENABLED"),
    outcomeForwardingEnabled:
      integrationEnabled && readBool("KEVIN_OUTCOME_FORWARDING_ENABLED"),
    signalIntakeEnabled:
      integrationEnabled && readBool("KEVIN_SIGNAL_INTAKE_ENABLED"),

    hermesBaseUrl: process.env["KEVIN_HERMES_BASE_URL"] ?? null,
    hermesApiKey: process.env["KEVIN_HERMES_API_KEY"] ?? null,
    internalServiceToken: process.env["KEVIN_INTERNAL_SERVICE_TOKEN"] ?? null,

    applicationId: process.env["KEVIN_APPLICATION_ID"] ?? "trainchat",

    // Server-only salt for pseudonymous ID derivation — MUST NOT be sent to clients
    pseudonymSalt: process.env["KEVIN_PSEUDONYM_SALT"] ?? null,

    contextTimeoutMs: readInt("KEVIN_CONTEXT_TIMEOUT_MS", 3000),
    eventTimeoutMs: readInt("KEVIN_EVENT_TIMEOUT_MS", 5000),
    healthTimeoutMs: readInt("KEVIN_HEALTH_TIMEOUT_MS", 2000),

    maxContextMemories: readInt("KEVIN_MAX_CONTEXT_MEMORIES", 10),
    maxContextResponseBytes: readInt(
      "KEVIN_MAX_CONTEXT_RESPONSE_BYTES",
      16384,
    ),
  };

  if (!integrationEnabled) {
    logger.info(
      "[KevinConfig] Kevin integration is DISABLED — all Kevin calls are no-ops",
    );
  } else {
    const issues: string[] = [];
    if (!_config.hermesBaseUrl)
      issues.push("KEVIN_HERMES_BASE_URL is not set");
    if (!_config.hermesApiKey) issues.push("KEVIN_HERMES_API_KEY is not set");
    if (!_config.pseudonymSalt) issues.push("KEVIN_PSEUDONYM_SALT is not set (pseudonymous IDs will use fallback)");
    if (issues.length > 0) {
      logger.warn(
        { issues },
        "[KevinConfig] Kevin integration is enabled but has configuration gaps",
      );
    } else {
      logger.info(
        {
          contextRetrieval: _config.contextRetrievalEnabled,
          eventDispatch: _config.eventDispatchEnabled,
          outcomeForwarding: _config.outcomeForwardingEnabled,
          signalIntake: _config.signalIntakeEnabled,
        },
        "[KevinConfig] Kevin integration active",
      );
    }
  }

  return _config;
}

// Exported for test injection — do not call in production code
export function _resetKevinConfigForTest(): void {
  _config = null;
}
