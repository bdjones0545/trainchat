/**
 * Cross-Turn Constraint Memory Enforcement
 *
 * Bridges the gap between user-stated constraints and future program generation:
 *
 *  1. `persistConstraintsFromTurn`  — detects constraint signals in a user message,
 *     classifies entities, and upserts them into the long-term memory store so they
 *     survive across conversations.
 *
 *  2. `loadHardConstraints`         — extracts structured constraint data from the
 *     already-loaded MemoryEntry list (no extra DB call needed).
 *
 *  3. `buildConstraintEnforcementDirective` — formats hard constraints as an absolute
 *     enforcement section for injection into AI generation prompts.
 *
 *  4. `validateAgainstHardConstraints` — checks a final program payload for violations
 *     so the alignment verifier and post-generation pipeline can catch and repair them.
 *
 * Persistence rules:
 *  - Only stores constraints with persistenceType "permanent" or "context_update".
 *  - Temporary constraints ("hotel gym", "just for today") are explicitly skipped.
 *  - Calls upsertMemory which is idempotent (only upgrades confidence, never downgrades).
 */

import { upsertMemory, type MemoryEntry } from "./memory";
import { classifyAdjustmentIntent } from "./adjustment-intent-classifier";
import type { IntentFamily } from "./intent-family-engine";
import type { ProgramStructure } from "./ai";
import { logger } from "./logger";

// ─── Types ────────────────────────────────────────────────────────────────────

/**
 * Structured hard constraints loaded from a user's long-term memory.
 * Used for prompt injection and post-generation validation.
 */
export interface HardConstraints {
  /** Equipment or exercise names that are flat-out unavailable — never include. */
  bannedItems: string[];
  /** Exercise names the user dislikes — avoid unless explicitly requested this turn. */
  dislikedItems: string[];
  /** Body regions with reported pain or limitation — protect in program design. */
  painRegions: string[];
  /** User's primary sport (if known) — maintain appropriate athletic emphasis. */
  sport: string | null;
}

export interface ConstraintViolation {
  exerciseName: string;
  violationType: "banned_item" | "disliked_item";
  matchedConstraint: string;
  detail: string;
}

// ─── Intent families that can carry persistent constraints ────────────────────

const CONSTRAINT_FAMILIES: ReadonlySet<string> = new Set([
  "equipment_constraint",
  "exercise_dislike_or_preference",
  "sport_context_update",
  "injury_modification",
  "joint_friendly_modification",
]);

// ─── Helpers ──────────────────────────────────────────────────────────────────

function slugify(text: string): string {
  return text.toLowerCase().trim().replace(/\s+/g, "_").replace(/[^a-z0-9_]/g, "");
}

function capitalize(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

function buildPainDetail(region: string): string {
  const regionLower = region.toLowerCase();
  const hints: Record<string, string> = {
    knee: "avoid deep knee flexion under load, high-impact movements, and single-leg knee-dominant work",
    shoulder: "avoid overhead pressing, upright rows, behind-the-neck movements, and extreme shoulder internal rotation",
    back: "avoid high-shear spinal loading, heavy good mornings, and unbraced lumbar flexion under load",
    "lower back": "avoid heavy spinal flexion under load, stiff-leg deadlifts, and unsupported rowing",
    hip: "avoid extreme hip flexion under load and high-impact hip-dominant movements",
    wrist: "avoid barbell front rack positions, wrist flexion/extension under heavy load, and strict push-ups",
    elbow: "avoid heavy elbow flexion/extension work at end range and high-frequency supination/pronation",
    ankle: "avoid deep dorsiflexion under load, high-impact landing drills, and heavy calf work in extreme ranges",
  };
  const hint = hints[regionLower] ?? `protect the ${region} — avoid heavy loading and high-impact work on this region`;
  return `Reported ${region} pain or discomfort — ${hint}.`;
}

function buildSportContextDetail(sport: string): string {
  const sportLower = sport.toLowerCase();
  const contexts: Record<string, string> = {
    golf: "User plays golf — include rotational strength, anti-rotation stability (Pallof press, landmine work), hip mobility, and thoracic rotation capacity. Avoid movements that limit rotational range.",
    basketball: "User plays basketball — include lateral quickness, deceleration strength, vertical power (jump mechanics), and ankle stability. Emphasise unilateral lower body work.",
    bjj: "User trains BJJ — include neck strength, hip escape mobility, grip endurance, and isometric strength in compromised positions. High upper-body pulling volume is appropriate.",
    "jiu jitsu": "User trains Jiu Jitsu — include neck strength, hip escape mobility, grip endurance, and isometric strength in compromised positions.",
    soccer: "User plays soccer — include unilateral leg power, rotational core, change-of-direction mechanics, and ankle stability. Moderate upper body emphasis.",
    football: "User plays football — include explosive hip extension, first-step quickness, collision strength, and neck/trap development.",
    tennis: "User plays tennis — include rotational power, shoulder external rotation strength, split-step quickness, and wrist integrity work.",
    baseball: "User plays baseball — include rotational power, posterior shoulder health (external rotators, lower trap), and hip separation mechanics.",
    swimming: "User swims — include shoulder external rotation, posterior cuff strength, lat development, and hip-driven kick power. Avoid over-compressing the anterior shoulder.",
    cycling: "User cycles — include hip mobility to counterbalance hip flexor tightening, thoracic extension, and upper back work. Knee load should be monitored carefully.",
    running: "User runs — include single-leg strength, hip stability, achilles/calf resilience, and glute max power. Avoid excessive quad fatigue that impairs running mechanics.",
  };
  return contexts[sportLower] ?? `User's sport: ${sport} — maintain athletic emphasis appropriate for this sport type.`;
}

// ─── 1. Persist constraints from a user turn ─────────────────────────────────

/**
 * Detects constraint signals in a user message and persists them to long-term
 * memory. Only persists for permanently applicable constraints — temporary
 * context changes (hotel gym, "just for today") are explicitly skipped.
 *
 * Safe to call fire-and-forget from the route handler.
 */
export async function persistConstraintsFromTurn(
  userId: number,
  message: string,
  intentFamily: IntentFamily | null,
): Promise<void> {
  if (!intentFamily || !CONSTRAINT_FAMILIES.has(intentFamily)) return;

  let classification: ReturnType<typeof classifyAdjustmentIntent>;
  try {
    classification = classifyAdjustmentIntent(message);
  } catch (err) {
    logger.warn({ err, intentFamily }, "[ConstraintMemory] classifyAdjustmentIntent failed — skipping persistence");
    return;
  }

  const { persistenceType, extractedEntities } = classification;

  // Only save permanent or context-update constraints — not temporary ones
  if (persistenceType !== "permanent" && persistenceType !== "context_update") {
    logger.debug(
      { intentFamily, persistenceType },
      "[ConstraintMemory] Skipping persistence — constraint is temporary"
    );
    return;
  }

  const candidates: Parameters<typeof upsertMemory>[1][] = [];

  // Equipment unavailability (hard ban)
  if (extractedEntities.targetEquipment && intentFamily === "equipment_constraint") {
    const equip = extractedEntities.targetEquipment;
    candidates.push({
      type: "exercise_preference",
      subject: `${slugify(equip)}_unavailable`,
      sentiment: "negative",
      confidence: 4,
      source: "conversation",
      detail: `${capitalize(equip)} is unavailable — never include it in any program.`,
    });
    logger.info(
      { userId, equipment: equip },
      "[ConstraintMemory] Persisting equipment unavailability"
    );
  }

  // Exercise dislike (soft avoid)
  if (extractedEntities.targetExercise && intentFamily === "exercise_dislike_or_preference") {
    const exercise = extractedEntities.targetExercise;
    candidates.push({
      type: "exercise_preference",
      subject: `${slugify(exercise)}_disliked`,
      sentiment: "negative",
      confidence: 3,
      source: "conversation",
      detail: `User dislikes ${exercise} — avoid in programs unless explicitly requested this turn.`,
    });
    logger.info(
      { userId, exercise },
      "[ConstraintMemory] Persisting exercise dislike"
    );
  }

  // Sport context
  if (extractedEntities.targetSport && intentFamily === "sport_context_update") {
    const sport = extractedEntities.targetSport;
    candidates.push({
      type: "sport_context",
      subject: slugify(sport),
      sentiment: "neutral",
      confidence: 4,
      source: "conversation",
      detail: buildSportContextDetail(sport),
    });
    logger.info(
      { userId, sport },
      "[ConstraintMemory] Persisting sport context"
    );
  }

  // Pain / injury constraint
  if (
    extractedEntities.targetBodyRegion &&
    (intentFamily === "injury_modification" || intentFamily === "joint_friendly_modification")
  ) {
    const region = extractedEntities.targetBodyRegion;
    candidates.push({
      type: "pain_pattern",
      subject: slugify(region),
      sentiment: "negative",
      confidence: 4,
      source: "conversation",
      detail: buildPainDetail(region),
    });
    logger.info(
      { userId, region },
      "[ConstraintMemory] Persisting pain/injury constraint"
    );
  }

  for (const candidate of candidates) {
    await upsertMemory(userId, candidate).catch((err: unknown) => {
      logger.warn({ err, subject: candidate.subject }, "[ConstraintMemory] upsertMemory failed — non-fatal");
    });
  }
}

// ─── 2. Load structured hard constraints from memories ────────────────────────

/**
 * Extracts structured HardConstraints from a pre-loaded MemoryEntry list.
 * No additional DB calls needed — pass the same memories array already loaded
 * for the memory context.
 */
export function loadHardConstraints(memories: MemoryEntry[]): HardConstraints {
  const bannedItems: string[] = [];
  const dislikedItems: string[] = [];
  const painRegions: string[] = [];
  let sport: string | null = null;

  for (const m of memories) {
    if (m.type === "exercise_preference" && m.sentiment === "negative") {
      if (m.subject.endsWith("_unavailable")) {
        // "belt_squat_unavailable" → "belt squat"
        const name = m.subject
          .slice(0, -"_unavailable".length)
          .replace(/_/g, " ");
        bannedItems.push(name);
      } else if (m.subject.endsWith("_disliked")) {
        // "lunges_disliked" → "lunges"
        const name = m.subject
          .slice(0, -"_disliked".length)
          .replace(/_/g, " ");
        dislikedItems.push(name);
      }
    }

    if (m.type === "pain_pattern" && m.sentiment === "negative") {
      // subject is already the region slug: "knee", "lower_back"
      painRegions.push(m.subject.replace(/_/g, " "));
    }

    if (m.type === "sport_context") {
      // Keep the most recently-updated sport
      if (!sport || m.updatedAt > (memories.find((x) => x.subject === sport)?.updatedAt ?? new Date(0))) {
        sport = m.subject.replace(/_/g, " ");
      }
    }
  }

  return { bannedItems, dislikedItems, painRegions, sport };
}

// ─── 3. Build enforcement directive for AI prompt injection ───────────────────

/**
 * Returns a hard constraint enforcement section for injection into the AI
 * system prompt. Returns null when there are no constraints to enforce.
 *
 * This section is injected as an absolute rule, not soft guidance.
 */
export function buildConstraintEnforcementDirective(
  constraints: HardConstraints,
): string | null {
  const lines: string[] = [];

  if (constraints.bannedItems.length > 0) {
    lines.push(
      "NEVER include the following — they are permanently unavailable or excluded:"
    );
    for (const item of constraints.bannedItems) {
      lines.push(`  - ${capitalize(item)} (unavailable)`);
    }
  }

  if (constraints.dislikedItems.length > 0) {
    lines.push(
      "AVOID the following — user dislikes them (only include if explicitly requested in this turn):"
    );
    for (const item of constraints.dislikedItems) {
      lines.push(`  - ${capitalize(item)}`);
    }
  }

  if (constraints.painRegions.length > 0) {
    lines.push(
      "Pain/limitation constraints — protect the following body regions:"
    );
    for (const region of constraints.painRegions) {
      lines.push(
        `  - ${capitalize(region)}: avoid heavy loading, high-impact work, and maximal range of motion under load`
      );
    }
  }

  if (constraints.sport) {
    lines.push(
      `Sport context: ${capitalize(constraints.sport)} athlete — maintain appropriate emphasis for this sport (rotational power, mobility, or positional demands as applicable).`
    );
  }

  if (lines.length === 0) return null;

  return [
    "## PERSISTED USER CONSTRAINTS — ABSOLUTE",
    "(These were explicitly stated in past sessions. Treat them as inviolable rules.)",
    "",
    ...lines,
  ].join("\n");
}

// ─── 4. Validate a program against hard constraints ───────────────────────────

/**
 * Checks every exercise in a program against the user's hard constraints.
 * Returns an array of violations. An empty array means the program is clean.
 *
 * Matching uses substring inclusion (case-insensitive) to catch variants.
 * For example, "belt squat" will match "Belt Squat Machine", "Safety Bar Squat (Belt)", etc.
 *
 * Note: pain-region validation is intentionally omitted here — the exercise-to-
 * body-region mapping is too imprecise for reliable programmatic checking.
 * Pain constraints are enforced via prompt injection instead.
 */
export function validateAgainstHardConstraints(
  structuredData: ProgramStructure,
  constraints: HardConstraints,
): ConstraintViolation[] {
  const violations: ConstraintViolation[] = [];

  if (
    constraints.bannedItems.length === 0 &&
    constraints.dislikedItems.length === 0
  ) {
    return violations;
  }

  for (const day of structuredData.days) {
    for (const exercise of day.exercises) {
      const nameLower = exercise.name.toLowerCase();

      for (const banned of constraints.bannedItems) {
        const bannedLower = banned.toLowerCase();
        if (nameLower.includes(bannedLower) || bannedLower.includes(nameLower)) {
          violations.push({
            exerciseName: exercise.name,
            violationType: "banned_item",
            matchedConstraint: banned,
            detail: `"${exercise.name}" matches banned item "${banned}" (unavailable equipment/exercise).`,
          });
        }
      }

      for (const disliked of constraints.dislikedItems) {
        const dislikedLower = disliked.toLowerCase();
        if (nameLower.includes(dislikedLower) || dislikedLower.includes(nameLower)) {
          violations.push({
            exerciseName: exercise.name,
            violationType: "disliked_item",
            matchedConstraint: disliked,
            detail: `"${exercise.name}" matches disliked exercise "${disliked}".`,
          });
        }
      }
    }
  }

  return violations;
}

// ─── 5. Constraint Satisfaction Check ────────────────────────────────────────

function normalizeConstraintLabel(s: string): string {
  return s.toLowerCase().replace(/[-_\s]+/g, " ").trim();
}

/**
 * Returns true when a named constraint is already honored by the active program
 * — i.e. the item does NOT appear in any exercise slot.
 *
 * Used by the execution planner to short-circuit APPLY_MUTATION → GUIDANCE when
 * the user is restating a constraint that the current program already satisfies.
 */
export function isConstraintAlreadySatisfied({
  constraintLabel,
  activeProgram,
}: {
  constraintLabel: string;
  activeProgram: ProgramStructure;
}): boolean {
  const needle = normalizeConstraintLabel(constraintLabel);
  if (!needle) return false;

  for (const day of activeProgram.days) {
    for (const exercise of day.exercises) {
      const hay = normalizeConstraintLabel(exercise.name);
      if (hay.includes(needle) || needle.includes(hay)) {
        return false; // program DOES contain the item — not satisfied
      }
    }
  }
  return true; // item absent from every exercise slot
}

/**
 * Checks whether a constraint label is already present in hard constraints
 * (i.e. previously persisted in memory).
 */
export function isConstraintAlreadyPersisted({
  constraintLabel,
  hardConstraints,
}: {
  constraintLabel: string;
  hardConstraints: HardConstraints;
}): boolean {
  const needle = normalizeConstraintLabel(constraintLabel);
  return [...hardConstraints.bannedItems, ...hardConstraints.dislikedItems].some(
    (item) => {
      const hay = normalizeConstraintLabel(item);
      return hay.includes(needle) || needle.includes(hay);
    }
  );
}

/**
 * Builds the coach-voice reinforcement message for a constraint that is
 * already satisfied by the current program.
 *
 * Format: "Got it — I'll keep avoiding {Label} going forward. Your current
 * program already reflects that."
 */
export function buildConstraintReinforcementDirective({
  constraintLabel,
  alreadyPersisted,
  intentFamily,
}: {
  constraintLabel: string;
  alreadyPersisted: boolean;
  intentFamily: string;
}): string {
  const label = constraintLabel.trim().replace(/\b\w/g, (c) => c.toUpperCase());
  const avoidVerb = intentFamily === "exercise_dislike_or_preference" ? "including" : "using";

  const persistNote = alreadyPersisted
    ? "I already have that noted in your preferences."
    : "I've added that to your preferences now.";

  return [
    `## CONSTRAINT REINFORCEMENT`,
    ``,
    `The user is restating a constraint their current program already satisfies.`,
    `DO NOT ask for clarification. DO NOT ask a question. DO NOT trigger a program rebuild. DO NOT modify anything.`,
    ``,
    `Respond ONLY with a short (1-2 sentence) memory reinforcement message:`,
    `- Acknowledge the constraint by name: "${label}"`,
    `- Confirm the current program already avoids it`,
    `- State it is stored for future programs`,
    ``,
    `Example: "Got it — I'll keep avoiding ${label} going forward. Your current program already reflects that. ${persistNote}"`,
    ``,
    `Rules:`,
    `- Name the constraint explicitly ("${label}", not "that exercise" or "this equipment")`,
    `- Use the word "already" to signal compliance`,
    `- Keep it under 2 sentences`,
    `- Do not use technical terms from internal plumbing; speak like a coach`,
    `- Do not ask what to do`,
    `- Avoid verb "${avoidVerb}" — prefer "including" or "putting it in your program"`,
  ].join("\n");
}
