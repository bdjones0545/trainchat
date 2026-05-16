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
  /**
   * Body regions with active pain or limitation (status="active").
   * These are hard constraints — protect aggressively in program design.
   */
  painRegions: string[];
  /**
   * Body regions with monitored (recovering/improving) discomfort (status="monitor").
   * These are soft cautions — exercise care but do not fully block.
   */
  monitorRegions: string[];
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
  const monitorRegions: string[] = [];
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

    // exercise_exclusion memories are absolute hard bans — written from calibrate.ts
    // or from conversation signals. Each memory's subject is the slugified exercise name.
    if (m.type === "exercise_exclusion") {
      const name = m.subject.replace(/_/g, " ");
      if (!bannedItems.includes(name)) {
        bannedItems.push(name);
        logger.info({ subject: m.subject, name }, "[MemoryRead] exercise_exclusion loaded into bannedItems");
      }
    }

    if (m.type === "pain_pattern" && m.sentiment === "negative") {
      const region = m.subject.replace(/_/g, " ");
      const status = m.status ?? "active";
      if (status === "resolved") {
        // Injury is healed — must NOT block exercise selection.
        // Resolved injuries are excluded from both painRegions and monitorRegions.
        logger.info({ subject: m.subject, region }, "[MemoryRead] pain_pattern is resolved — skipping constraint");
        continue;
      } else if (status === "monitor") {
        // Recovering — soft caution only, not a hard block.
        monitorRegions.push(region);
      } else {
        // "active" — enforce strongly.
        painRegions.push(region);
      }
    }

    if (m.type === "sport_context") {
      // Keep the most recently-updated sport
      if (!sport || m.updatedAt > (memories.find((x) => x.subject === sport)?.updatedAt ?? new Date(0))) {
        sport = m.subject.replace(/_/g, " ");
      }
    }
  }

  logger.info(
    { bannedCount: bannedItems.length, dislikedCount: dislikedItems.length, painCount: painRegions.length, monitorCount: monitorRegions.length, sport },
    "[MemoryRead] loadHardConstraints resolved"
  );
  return { bannedItems, dislikedItems, painRegions, monitorRegions, sport };
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
      "NEVER include the following — they are permanently unavailable or user-excluded:"
    );
    for (const item of constraints.bannedItems) {
      lines.push(`  - ${capitalize(item)}${buildEquipmentBanExample(item)}`);
    }
    lines.push(
      "  If the user explicitly asks to include one of these in this turn, acknowledge the exclusion rule and ask them to confirm before overriding it."
    );
    logger.info({ count: constraints.bannedItems.length }, "[MemoryApplied] bannedItems injected into constraint directive");
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
      "ACTIVE Pain/limitation constraints — hard block — protect these regions aggressively:"
    );
    for (const region of constraints.painRegions) {
      lines.push(
        `  - ${capitalize(region)}: avoid heavy loading, high-impact work, and maximal range of motion under load`
      );
    }
  }

  if (constraints.monitorRegions.length > 0) {
    lines.push(
      "MONITORING regions — recovering, not fully restricted — exercise care but do not fully block:"
    );
    for (const region of constraints.monitorRegions) {
      lines.push(
        `  - ${capitalize(region)}: reduce extreme loading and avoid high-impact stress; this area is improving — do not eliminate load entirely. Check in with the user if programming in this area.`
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

// ─── 3b. Equipment constraint directive improvements ──────────────────────────
// (Equipment category ban examples injected into AI prompts — see buildConstraintEnforcementDirective)

/**
 * Expands a banned equipment token into category examples for AI prompt injection.
 * Makes the constraint concrete so the AI understands what "barbell unavailable" blocks.
 */
function buildEquipmentBanExample(item: string): string {
  const lower = item.toLowerCase().trim();
  const examples: Record<string, string> = {
    barbell: "back squat, front squat, deadlift, bench press, barbell row, overhead press, Olympic lifts",
    cable: "cable fly, cable row, lat pulldown (cable), cable curl, cable pushdown",
    machine: "leg press, leg curl, leg extension, chest press machine, smith machine",
    "smith machine": "smith machine squat, smith machine bench",
    "trap bar": "trap bar deadlift, trap bar carry",
    sled: "sled push, sled pull, prowler",
    rings: "ring dip, ring pull-up, ring muscle-up",
    trx: "TRX row, TRX chest press, TRX fallout",
    "med ball": "med ball slam, med ball throw, rotational med ball press",
  };
  const example = examples[lower];
  return example ? ` (includes: ${example})` : "";
}

// ─── 4. Validate a program against hard constraints ───────────────────────────

/**
 * Checks every exercise in a program against the user's hard constraints.
 * Returns an array of violations. An empty array means the program is clean.
 *
 * Matching uses substring inclusion (case-insensitive) to catch variants.
 * For example, "belt squat" will match "Belt Squat Machine", "Safety Bar Squat (Belt)", etc.
 *
 * Note: pain-region validation is handled separately by validatePainConstraints().
 * Equipment and exercise bans are checked deterministically here.
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

// ─── 4b. Pain constraint deterministic checker ────────────────────────────────

/**
 * Maps reported pain regions to exercise/movement patterns that pose elevated risk.
 * Used by validatePainConstraints() to generate coach warnings (not hard blocks).
 *
 * Keys must be lowercase and match how pain regions are stored in HardConstraints.
 * Each entry has:
 *  - critical: regex strings matching exercises that directly stress the region (should flag prominently)
 *  - monitor: regex strings for elevated-risk patterns (worth a coaching note)
 *  - coachNote: human-readable explanation for why these are flagged
 */
const PAIN_RISK_MAP: Record<
  string,
  { critical: string[]; monitor: string[]; coachNote: string }
> = {
  shoulder: {
    critical: ["upright row", "behind.neck", "behind neck"],
    monitor: ["overhead press", "shoulder press", "lateral raise", "front raise", "dip", "pike push.?up"],
    coachNote:
      "Shoulder pain: upright rows and behind-neck patterns carry elevated impingement risk. Monitor overhead volume and degree of internal rotation under load.",
  },
  knee: {
    critical: [],
    monitor: ["box jump", "depth jump", "jump squat", "jump lunge", "plyometric", "pistol", "full squat"],
    coachNote:
      "Knee pain: high-impact plyometrics and deep loaded knee flexion require careful monitoring. Prioritize eccentric control and avoid valgus loading.",
  },
  "lower back": {
    critical: ["good morning", "stiff.?leg", "stiff leg deadlift"],
    monitor: ["deadlift", "romanian deadlift", "back extension", "jefferson curl", "bent.?over row"],
    coachNote:
      "Lower back pain: heavy spinal loading and unsupported flexion under load require careful monitoring. Prioritize bracing cues and neutral spine positions.",
  },
  back: {
    critical: ["good morning"],
    monitor: ["deadlift", "row", "hinge", "back extension"],
    coachNote:
      "Back pain: monitor spinal loading patterns and unsupported forward flexion under load.",
  },
  hip: {
    critical: [],
    monitor: ["split squat", "single.?leg squat", "hip flexor", "deep squat", "full squat"],
    coachNote:
      "Hip pain: monitor deep hip flexion, high-volume unilateral loading, and end-range positions under load.",
  },
  wrist: {
    critical: ["front rack", "front squat"],
    monitor: ["push.?up", "plank on hands", "barbell curl", "wrist curl", "reverse curl"],
    coachNote:
      "Wrist pain: front rack positions and loaded wrist extension require caution. Consider dumbbell/neutral-grip alternatives.",
  },
  elbow: {
    critical: [],
    monitor: ["tricep", "skull crusher", "close.?grip bench", "dip", "pull.?up", "chin.?up"],
    coachNote:
      "Elbow pain: monitor end-range elbow loading and supination/pronation under load. Reduce volume before reducing load.",
  },
  ankle: {
    critical: [],
    monitor: ["calf raise", "single.?leg calf", "box jump", "depth jump", "pogo", "jump"],
    coachNote:
      "Ankle pain: monitor high-impact landing drills and extreme dorsiflexion under load. Prioritize landing mechanics before intensity.",
  },
  neck: {
    critical: ["behind.?neck press", "behind.?neck pull.?down", "neck bridge"],
    monitor: ["overhead press", "shrug", "trap raise", "face pull"],
    coachNote:
      "Neck pain: behind-neck loading patterns carry elevated cervical risk. Monitor overhead press alignment and trap loading.",
  },
};

export interface PainConstraintWarning {
  exerciseName: string;
  painRegion: string;
  severity: "critical" | "warning";
  coachNote: string;
}

/**
 * Checks exercises in a program against active pain and monitor regions.
 * Returns warnings (severity: critical | warning) for coach review.
 *
 * - critical: exercise directly stresses the injured region — should be flagged in coaching response.
 * - warning: elevated risk worth noting, but does not hard-block the exercise.
 *
 * This is a best-effort deterministic safety net. AI prompt injection (via
 * buildConstraintEnforcementDirective) remains the primary enforcement mechanism.
 * This catches obvious pattern matches that may slip through LLM generation.
 *
 * Returns an empty array when no active pain regions are present.
 */
export function validatePainConstraints(
  structuredData: ProgramStructure,
  constraints: HardConstraints,
): PainConstraintWarning[] {
  const warnings: PainConstraintWarning[] = [];
  const activeRegions = [...constraints.painRegions, ...constraints.monitorRegions];
  if (activeRegions.length === 0) return warnings;

  for (const day of structuredData.days) {
    for (const exercise of day.exercises) {
      const nameLower = exercise.name.toLowerCase();

      for (const region of activeRegions) {
        const regionLower = region.toLowerCase();
        const riskEntry = PAIN_RISK_MAP[regionLower];
        if (!riskEntry) continue;

        // Check critical patterns first
        let criticalFlagged = false;
        for (const pattern of riskEntry.critical) {
          if (new RegExp(pattern, "i").test(nameLower)) {
            warnings.push({
              exerciseName: exercise.name,
              painRegion: region,
              severity: "critical",
              coachNote: riskEntry.coachNote,
            });
            criticalFlagged = true;
            break;
          }
        }

        // Check monitor patterns (only if no critical flag already added for this combo)
        if (!criticalFlagged) {
          for (const pattern of riskEntry.monitor) {
            if (new RegExp(pattern, "i").test(nameLower)) {
              warnings.push({
                exerciseName: exercise.name,
                painRegion: region,
                severity: "warning",
                coachNote: riskEntry.coachNote,
              });
              break;
            }
          }
        }
      }
    }
  }

  return warnings;
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
