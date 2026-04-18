/**
 * Language System Audit — DEV-only observability for the language interpretation layer.
 *
 * Every interpreted user message emits a structured audit line and any
 * applicable warnings.  These are grep-friendly and structured for easy
 * post-hoc analysis of how the language system interpreted real inputs.
 *
 * Audit lines use the prefix:
 *   [LanguageSystemAudit]
 *
 * Warning lines use the prefix:
 *   [LanguageSystemAuditWarning]
 *
 * Usage:
 *   logLanguageSystemAudit(profile);
 *   logLanguageSystemAuditWarning("reason");
 *
 * These functions no-op in production unless LOG_LANGUAGE_AUDIT=true is set.
 */

import { logger } from "./logger";
import type { AgentIntentProfile } from "./language-system";

// ─── Guard ────────────────────────────────────────────────────────────────────

const IS_AUDIT_ENABLED =
  process.env.NODE_ENV !== "production" || process.env.LOG_LANGUAGE_AUDIT === "true";

// ─── Full Structured Audit Log ────────────────────────────────────────────────

/**
 * Log the full structured interpretation of a user message.
 * Emits a multiline human-readable audit block and one grep-friendly summary line.
 */
export function logLanguageSystemAudit(profile: AgentIntentProfile): void {
  if (!IS_AUDIT_ENABLED) return;

  // ── Structured log object (JSON-parseable) ────────────────────────────────
  logger.info(
    {
      rawUserMessage: profile.sourceUtterance,
      normalizedConcepts: profile.normalizedConcepts,
      requestType: profile.requestType,
      primaryGoal: profile.primaryGoal,
      secondaryGoals: profile.secondaryGoals,
      recoveryState: profile.recoveryState,
      stylePreferences: profile.stylePreferences,
      requestedChanges: profile.requestedChanges.map((c) => `${c.direction}:${c.concept}`),
      preserveInstructions: profile.preserveInstructions.map((i) => i.raw),
      bodyLimitations: profile.constraints.bodyLimitations,
      equipmentUnavailable: profile.constraints.equipment.unavailable,
      equipmentAvailable: profile.constraints.equipment.available,
      scheduleConstraints: profile.constraints.schedule,
      ambiguityFlags: profile.ambiguityFlags.map((f) => `${f.type}: ${f.description}`),
      contradictions: profile.contradictions.map((c) => c.description),
      confidenceScore: profile.confidenceScore,
      programmingDirectivesCount: profile.programmingDirectives.length,
      programmingDirectives: profile.programmingDirectives.map((d) => `[${d.priority}] ${d.directive.slice(0, 80)}`),
    },
    "[LanguageSystemAudit] Full profile",
  );

  // ── Grep-friendly single-line summary ─────────────────────────────────────
  const changesSummary = profile.requestedChanges
    .slice(0, 4)
    .map((c) => `${c.direction}_${c.concept.replace(/\s+/g, "_")}`)
    .join("|") || "none";

  const preserveSummary = profile.preserveInstructions
    .slice(0, 2)
    .map((i) => i.target)
    .join("|") || "none";

  const directiveSummary = profile.programmingDirectives
    .filter((d) => d.priority === "high")
    .slice(0, 3)
    .map((d) => d.source)
    .join("|") || "none";

  logger.info(
    `[LanguageSystemAudit] type=${profile.requestType} goal=${profile.primaryGoal ?? "none"} recovery=${profile.recoveryState} style=${profile.stylePreferences.slice(0, 2).join("|") || "none"} changes=${changesSummary} preserve=${preserveSummary} confidence=${profile.confidenceScore.toFixed(2)} directives=${directiveSummary}`,
  );
}

// ─── Targeted Warning Logs ────────────────────────────────────────────────────

/**
 * Emit a targeted warning about a specific interpretation issue.
 * Always include the raw phrase that triggered the warning.
 */
export function logLanguageSystemAuditWarning(reason: string, raw?: string): void {
  if (!IS_AUDIT_ENABLED) return;
  const rawFragment = raw ? ` | raw="${raw.slice(0, 80)}"` : "";
  logger.warn(`[LanguageSystemAuditWarning] ${reason}${rawFragment}`);
}

// ─── Composite Audit + Auto-Warnings ─────────────────────────────────────────

/**
 * Run the full audit: log the profile and emit all relevant auto-warnings.
 * This is the primary entry point — call once per interpreted message.
 */
export function auditLanguageInterpretation(profile: AgentIntentProfile): void {
  if (!IS_AUDIT_ENABLED) return;

  logLanguageSystemAudit(profile);

  // Auto-emit warnings for each detected issue ──────────────────────────────

  for (const flag of profile.ambiguityFlags) {
    if (flag.type === "vague_preference") {
      logLanguageSystemAuditWarning(`vague preference detected: "${flag.raw}"`, profile.sourceUtterance);
    }
    if (flag.type === "underspecified_target") {
      logLanguageSystemAuditWarning("preserve instruction present but no preserved target resolved", profile.sourceUtterance);
    }
    if (flag.type === "unclear_intent") {
      logLanguageSystemAuditWarning(`unclear intent — message too short or missing signals: "${flag.raw}"`, profile.sourceUtterance);
    }
  }

  for (const contradiction of profile.contradictions) {
    logLanguageSystemAuditWarning(
      `contradiction detected: "${contradiction.conflictA}" + "${contradiction.conflictB}" — ${contradiction.description}`,
      profile.sourceUtterance,
    );
  }

  if (profile.confidenceScore < 0.35) {
    logLanguageSystemAuditWarning(
      `low confidence interpretation used fallback directive mapping (score=${profile.confidenceScore.toFixed(2)})`,
      profile.sourceUtterance,
    );
  }

  if (profile.preserveInstructions.length > 0 && profile.requestedChanges.length === 0 && profile.requestType !== "ask_question") {
    logLanguageSystemAuditWarning(
      "preserve instruction present but no specific change requested — may be a pure preservation confirmation",
      profile.sourceUtterance,
    );
  }
}
