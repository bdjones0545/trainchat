/**
 * Final Response Alignment Verifier
 *
 * Before the final SSE `done` event is sent, this module checks consistency
 * between the five sources of truth in a completed turn:
 *
 *   1. Stage narrations (what the coach said it was doing during streaming)
 *   2. Action contract (what the planner committed to doing)
 *   3. Mutation verifier outcome (what actually happened to the program)
 *   4. Final program payload (structuredData)
 *   5. Assistant message text (what the AI wrote to the user)
 *
 * On mismatch, the verifier either attempts a transparent repair or returns
 * a failure description so the caller can communicate it honestly.
 *
 * Design constraints:
 *   - Pure function (no DB access, no async) — caller handles DB updates
 *   - Conservative: only flags issues it can determine with high confidence
 *   - Does not produce false positives on verified, clean turns
 */

import type { NarrationContext } from "./stage-narration";
import type { ProgramStructure } from "./ai";
import type { HardConstraints } from "./constraint-memory";

// ─── Public Types ─────────────────────────────────────────────────────────────

export type AlignmentIssueType =
  /** GUIDANCE action produced a full program (structuredData has days) */
  | "guidance_program_leak"
  /** AI text claims a successful build/save but systemSaved is false */
  | "success_claim_without_save"
  /** AI text claims a mutation was applied but turnOutcome says it was not */
  | "mutation_claim_without_outcome"
  /** Final program days differ from what extractedConstraints requested */
  | "constraint_days_mismatch"
  /** Narration signalled a mutation action but the outcome type was conversation-only */
  | "narration_outcome_mismatch"
  /** AI text explicitly names an exercise as removed/added, but structuredData disagrees */
  | "exercise_claim_mismatch"
  /** Program contains an exercise or equipment that was previously marked unavailable */
  | "persisted_constraint_violation";

export interface AlignmentIssue {
  type: AlignmentIssueType;
  severity: "critical" | "warning";
  detail: string;
}

export interface AlignmentCheckInput {
  // ── What the planner committed to ───────────────────────────────────────
  /** execPlan.action */
  action: string;
  /** intentResult.type */
  intentType: string;
  /** Narration context that shaped stage messaging */
  narrationCtx: NarrationContext;

  // ── What was produced ───────────────────────────────────────────────────
  /** Final assistant message text */
  aiContent: string;
  /** Final program payload (null for guidance/conversation turns) */
  structuredData: ProgramStructure | null;
  /** Whether the program was persisted to the DB (auto-save succeeded) */
  systemSaved: boolean;

  // ── What actually happened ──────────────────────────────────────────────
  /** turnOutcomeSSE.type — "mutation_applied" | "conversation_only" | "true_failure" | … */
  outcomeType: string;
  /** Whether a mutation was applied (from turnOutcomeSSE) */
  mutationApplied: boolean;

  // ── User requirements ───────────────────────────────────────────────────
  /** Extracted per-turn constraints (may be null for non-build intents) */
  extractedConstraints: { daysPerWeek?: number | null } | null;
  /** Hard constraints loaded from persisted user memory (optional — skips check when absent) */
  hardConstraints?: HardConstraints | null;
}

export interface AlignmentCheckResult {
  /** True when no actionable issues were found */
  passed: boolean;
  /** All detected issues, sorted critical-first */
  issues: AlignmentIssue[];
  /** When non-null, use this text instead of the original aiContent */
  repairedContent: string | null;
  /** When "clear", do not send structuredData in the done event */
  structuredDataRepair: "clear" | null;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function isBuildAction(action: string): boolean {
  return ["PROGRAM_GENERATION", "REBUILD_PROGRAM", "STRUCTURAL_REBUILD"].includes(action);
}

function isMutationAction(action: string): boolean {
  return [
    "APPLY_MUTATION",
    "DIRECT_MUTATION",
    "SESSION_ADJUSTMENT",
    "DIRECT_EDIT",
  ].includes(action);
}

function isGuidanceAction(action: string): boolean {
  return ["GUIDANCE", "ASK_CLARIFICATION", "NO_OP", "PERSIST_CONSTRAINT_ONLY"].includes(action);
}

/**
 * Returns true when `text` contains language strongly implying that a program
 * was successfully built and saved. Tuned to avoid false positives on
 * guidance or coaching text that happens to use similar words.
 */
function containsSuccessBuildClaim(text: string): boolean {
  const trimmed = text.trim();
  // Common first-sentence build-announcement patterns
  const patterns = [
    /^(built[\.\s]|got it[—\s]*i(?:'ve)? built\s|here(?:'s)? your .{1,30}program|your .{1,30}program is (?:live|ready|set|built|loaded))/i,
    /\b(check the program tab|your program (?:is )?now live|i(?:'ve)? built (?:you )?(?:a )?\d+[\s\-]day)\b/i,
    /\bprogram (?:is )?(?:built|ready|live|saved|loaded) (?:and )?(?:ready|waiting|good)\b/i,
  ];
  return patterns.some((p) => p.test(trimmed));
}

/**
 * Returns true when `text` contains language strongly implying that a specific
 * mutation (exercise change) was successfully applied.
 *
 * FIX 8: Broadened to catch common false-success phrases including the exact
 * strings used in hardcoded fallbacks and AI-generated coaching text.
 */
function containsMutationSuccessClaim(text: string): boolean {
  const patterns = [
    /\b(done[\.\s]|applied[\.\s]|(?:i(?:'ve)?|all) (?:removed|added|swapped|replaced|updated|changed) .{3,60}(?:\.|,))/i,
    /\b(?:that|the) (?:change|swap|update|edit|adjustment) (?:has been |is )?(?:applied|done|saved|made|set)\b/i,
    // FIX 8: Catch broader false-success phrasing
    /\b(i (?:processed|handled|completed) your request)\b/i,
    /\b(applied the change|check the program tab|what was updated)\b/i,
    /\b(your program (?:has been|is now) (?:updated|changed|modified|adjusted))\b/i,
    /\bi(?:'ve)? (?:updated|changed|modified|adjusted) your program\b/i,
    /\b(the (?:change|edit|update) (?:is|has been) (?:live|in your program|reflected))\b/i,
  ];
  return patterns.some((p) => p.test(text.trim()));
}

/**
 * Extracts plausible exercise name claims from free-form coaching text.
 * Returns names that the AI explicitly claims were removed or added.
 * Intentionally conservative to minimize false positives.
 */
function extractExerciseClaims(text: string): {
  removedClaims: string[];
  addedClaims: string[];
} {
  const removedClaims: string[] = [];
  const addedClaims: string[] = [];

  // "removed the Romanian Deadlift", "dropped Leg Press", "cut the Hip Thrust"
  const removePatterns = [
    /(?:removed?|dropped?|cut|eliminated?|taken? out)\s+(?:the\s+)?([A-Z][a-zA-Z]{2,}\s+(?:[A-Z][a-zA-Z]{2,}\s*){0,3})/g,
  ];
  for (const pat of removePatterns) {
    for (const m of text.matchAll(pat)) {
      const name = m[1].trim().replace(/[.,;]$/, "");
      if (name.length >= 4 && name.length <= 50) removedClaims.push(name);
    }
  }

  // "added Romanian Deadlift", "added in Leg Press", "included Hip Thrust"
  const addPatterns = [
    /(?:added?(?:\s+in)?|included?|fit(?:ted)?\s+in)\s+(?:the\s+)?([A-Z][a-zA-Z]{2,}\s+(?:[A-Z][a-zA-Z]{2,}\s*){0,3})/g,
  ];
  for (const pat of addPatterns) {
    for (const m of text.matchAll(pat)) {
      const name = m[1].trim().replace(/[.,;]$/, "");
      if (name.length >= 4 && name.length <= 50) addedClaims.push(name);
    }
  }

  return { removedClaims, addedClaims };
}

/**
 * Collects all exercise names from the final program into a lowercase set
 * for fast membership testing.
 */
function collectProgramExerciseNames(structuredData: ProgramStructure): Set<string> {
  const names = new Set<string>();
  for (const day of structuredData.days) {
    for (const ex of day.exercises) {
      names.add(ex.name.toLowerCase().trim());
    }
  }
  return names;
}

// ─── Individual Checks ────────────────────────────────────────────────────────

function checkGuidanceProgramLeak(input: AlignmentCheckInput): AlignmentIssue | null {
  if (!isGuidanceAction(input.action)) return null;
  const days = input.structuredData?.days;
  if (!days || days.length === 0) return null;
  return {
    type: "guidance_program_leak",
    severity: "warning",
    detail:
      `Action is ${input.action} (guidance) but structuredData contains ` +
      `${days.length} day(s) — program data should not be sent for guidance turns.`,
  };
}

function checkSuccessClaimWithoutSave(input: AlignmentCheckInput): AlignmentIssue | null {
  if (!isBuildAction(input.action)) return null;
  if (input.systemSaved) return null;
  if (!containsSuccessBuildClaim(input.aiContent)) return null;
  return {
    type: "success_claim_without_save",
    severity: "critical",
    detail:
      `Build action (${input.action}) ran and the response text claims success, ` +
      `but systemSaved=false — the program was NOT persisted.`,
  };
}

function checkMutationClaimWithoutOutcome(input: AlignmentCheckInput): AlignmentIssue | null {
  if (!isMutationAction(input.action)) return null;
  if (input.mutationApplied) return null;
  // Only flag if the text actually claims success — guidance fallbacks don't need a flag
  if (!containsMutationSuccessClaim(input.aiContent)) return null;
  return {
    type: "mutation_claim_without_outcome",
    severity: "critical",
    detail:
      `Mutation action (${input.action}) did not result in mutationApplied=true, ` +
      `but the response text contains success language.`,
  };
}

function checkConstraintDaysMismatch(input: AlignmentCheckInput): AlignmentIssue | null {
  const requestedDays = input.extractedConstraints?.daysPerWeek;
  const actualDays = input.structuredData?.days?.length;
  if (!requestedDays || !actualDays) return null;
  if (requestedDays === actualDays) return null;
  // Constraint validation + retry already ran — this is a residual mismatch
  return {
    type: "constraint_days_mismatch",
    severity: requestedDays !== actualDays ? "warning" : "warning",
    detail:
      `User requested ${requestedDays} training days; program has ${actualDays} day(s). ` +
      `Constraint validation and retry already ran — this is a residual mismatch.`,
  };
}

function checkNarrationOutcomeMismatch(input: AlignmentCheckInput): AlignmentIssue | null {
  const narrationIsMutation = isMutationAction(input.narrationCtx.action);
  if (!narrationIsMutation) return null;
  if (input.outcomeType !== "conversation_only") return null;
  return {
    type: "narration_outcome_mismatch",
    severity: "warning",
    detail:
      `Narration context signalled a mutation action (${input.narrationCtx.action}) ` +
      `but final outcomeType is "conversation_only" — narration may have misled the user.`,
  };
}

function checkExerciseClaimMismatch(input: AlignmentCheckInput): AlignmentIssue | null {
  if (!input.structuredData) return null;
  // Only meaningful when the AI path handled a mutation
  if (!isMutationAction(input.action) && !isBuildAction(input.action)) return null;

  const { removedClaims, addedClaims } = extractExerciseClaims(input.aiContent);
  if (removedClaims.length === 0 && addedClaims.length === 0) return null;

  const programNames = collectProgramExerciseNames(input.structuredData);
  const mismatches: string[] = [];

  for (const name of removedClaims) {
    if (programNames.has(name.toLowerCase())) {
      mismatches.push(`claimed removed "${name}" but it is still in the program`);
    }
  }
  for (const name of addedClaims) {
    if (!programNames.has(name.toLowerCase())) {
      mismatches.push(`claimed added "${name}" but it is not found in the program`);
    }
  }

  if (mismatches.length === 0) return null;

  return {
    type: "exercise_claim_mismatch",
    severity: "warning",
    detail: `Exercise name inconsistency detected: ${mismatches.join("; ")}.`,
  };
}

function checkPersistedConstraintViolation(input: AlignmentCheckInput): AlignmentIssue | null {
  if (!input.structuredData) return null;
  if (!input.hardConstraints) return null;

  const { bannedItems } = input.hardConstraints;
  if (bannedItems.length === 0) return null;

  // Only check when we actually generated a program (build or mutation)
  if (!isBuildAction(input.action) && !isMutationAction(input.action)) return null;

  const violations: string[] = [];
  for (const day of input.structuredData.days) {
    for (const exercise of day.exercises) {
      const nameLower = exercise.name.toLowerCase();
      for (const banned of bannedItems) {
        const bannedLower = banned.toLowerCase();
        if (nameLower.includes(bannedLower) || bannedLower.includes(nameLower)) {
          violations.push(`"${exercise.name}" (banned: "${banned}")`);
        }
      }
    }
  }

  if (violations.length === 0) return null;

  return {
    type: "persisted_constraint_violation",
    severity: "critical",
    detail: `Program contains previously banned items: ${violations.join(", ")}.`,
  };
}

// ─── Repair Text ─────────────────────────────────────────────────────────────

function buildRepairContent(
  criticalIssues: AlignmentIssue[],
  warnings: AlignmentIssue[],
  original: string,
): string | null {
  // Only critical issues warrant a full content replacement
  const critical = criticalIssues[0];
  if (!critical) {
    // For warnings, append a transparent caveat to the original
    const warningCaveats: string[] = [];

    for (const issue of warnings) {
      if (issue.type === "constraint_days_mismatch") {
        const match = issue.detail.match(/requested (\d+) training days; program has (\d+)/);
        if (match) {
          warningCaveats.push(
            `(Note: you asked for ${match[1]} training days — the program has ${match[2]}. ` +
            `Let me know and I'll adjust it.)`
          );
        }
      }
      if (issue.type === "exercise_claim_mismatch") {
        warningCaveats.push(
          `(Double-check the program panel — I may not have captured every change precisely.)`
        );
      }
    }

    if (warningCaveats.length === 0) return null;
    return `${original.trimEnd()} ${warningCaveats.join(" ")}`;
  }

  // Critical repairs
  if (critical.type === "success_claim_without_save") {
    return (
      `I built your program but ran into a problem saving it. Your program hasn't been ` +
      `updated yet — give it another try and I'll get it saved correctly this time.`
    );
  }

  if (critical.type === "mutation_claim_without_outcome") {
    // FIX 8: Truth-safe copy — no false "applied" or "check the tab" language
    return (
      `I didn't change your program yet. Tell me exactly what you want adjusted and I'll apply it directly.`
    );
  }

  if (critical.type === "persisted_constraint_violation") {
    // Extract the first banned item mentioned for a personalised message
    const match = critical.detail.match(/banned: "([^"]+)"/);
    const item = match ? match[1] : "a previously excluded item";
    return (
      `I built your program but noticed it included ${item}, which you've previously told me isn't available. ` +
      `Let me fix that — ask me to rebuild and I'll keep ${item} out.`
    );
  }

  // Fallback for any other critical issue
  return (
    `Something didn't align between what I planned and what was saved. ` +
    `Your program may not have been updated. Please try again.`
  );
}

// ─── Main Entry Point ─────────────────────────────────────────────────────────

/**
 * Verify that the final turn response is consistent across all five sources
 * of truth. Returns a result with all issues found and, when needed, a
 * repaired content string to use instead of the original.
 *
 * This function is pure and synchronous — no DB access, no network calls.
 * The caller is responsible for persisting any repairs.
 */
export function verifyResponseAlignment(
  input: AlignmentCheckInput,
): AlignmentCheckResult {
  const issues: AlignmentIssue[] = [];

  const guidanceLeak = checkGuidanceProgramLeak(input);
  if (guidanceLeak) issues.push(guidanceLeak);

  const saveFailure = checkSuccessClaimWithoutSave(input);
  if (saveFailure) issues.push(saveFailure);

  const mutationFailure = checkMutationClaimWithoutOutcome(input);
  if (mutationFailure) issues.push(mutationFailure);

  const daysMismatch = checkConstraintDaysMismatch(input);
  if (daysMismatch) issues.push(daysMismatch);

  const narrationMismatch = checkNarrationOutcomeMismatch(input);
  if (narrationMismatch) issues.push(narrationMismatch);

  const exerciseMismatch = checkExerciseClaimMismatch(input);
  if (exerciseMismatch) issues.push(exerciseMismatch);

  const constraintViolation = checkPersistedConstraintViolation(input);
  if (constraintViolation) issues.push(constraintViolation);

  // Sort: critical first
  issues.sort((a, b) => {
    if (a.severity === "critical" && b.severity !== "critical") return -1;
    if (a.severity !== "critical" && b.severity === "critical") return 1;
    return 0;
  });

  const criticalIssues = issues.filter((i) => i.severity === "critical");
  const warnings = issues.filter((i) => i.severity === "warning");

  const repairedContent = buildRepairContent(criticalIssues, warnings, input.aiContent);

  const structuredDataRepair: "clear" | null =
    issues.some((i) => i.type === "guidance_program_leak") ? "clear" : null;

  return {
    passed: issues.length === 0,
    issues,
    repairedContent,
    structuredDataRepair,
  };
}
