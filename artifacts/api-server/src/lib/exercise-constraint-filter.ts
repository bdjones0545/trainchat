/**
 * Constraint-Aware Exercise Selection Filter
 *
 * Pure, synchronous functions that enforce user-stated constraints BEFORE and
 * DURING exercise scoring — moving constraint enforcement upstream from the
 * post-generation validator into the selection pipeline itself.
 *
 * Design goals:
 *  - Structurally impossible: banned items are removed from candidate pools
 *    before scoring so they can never be selected by the softmax draw.
 *  - Safe: filtering never returns an empty pool — if every candidate would be
 *    removed, we fall back progressively so there is always something to score.
 *  - Pattern-aware: pain constraints map to movement-pattern keywords, not
 *    just exercise names, so "knee pain" also flags "walking lunge", "box jump".
 *  - Conservative: we only flag conflicts we can determine with high confidence.
 *    When in doubt, we prefer a soft penalty over a hard filter to avoid
 *    breaking valid programs.
 */

import type { HardConstraints } from "./constraint-memory";

// ─── Pain Pattern Conflict Tables ─────────────────────────────────────────────
//
// Maps pain region → exercise name keyword groups.
// Matching is substring-based and case-insensitive.
// "hard" = high-confidence contraindication → -6 penalty
// "soft" = possible concern, context-dependent → -3 penalty

interface PainConflictRule {
  hard: string[];
  soft: string[];
}

const PAIN_CONFLICT_TABLE: Record<string, PainConflictRule> = {
  knee: {
    // Deep knee flexion under high load, high-impact, jump landings
    hard: [
      "back squat",
      "front squat",
      "jump squat",
      "box jump",
      "depth jump",
      "broad jump",
      "walking lunge",
      "reverse lunge",
      "lateral lunge",
      "curtsy lunge",
      "bulgarian split squat",
      "pistol squat",
      "leg extension",
      "banded jump squat",
      "pause back squat",
      "low-bar back squat",
      "safety bar squat",
    ],
    // Moderate knee flexion — generally manageable but worth noting
    soft: [
      "goblet squat",
      "heel-elevated",
      "step-up",
      "split squat",
      "leg press",
    ],
  },

  shoulder: {
    // Full overhead loading and internal impingement positions
    hard: [
      "overhead press",
      "military press",
      "arnold press",
      "push press",
      "upright row",
      "behind-the-neck",
      "thruster",
      "log press",
      "z-press",
    ],
    // Anterior shoulder stress, less extreme ranges
    soft: [
      "shoulder press",
      "lateral raise",
      "incline press",
      "dip",
    ],
  },

  "lower back": {
    // High spinal shear or compressive loads in compromised positions
    hard: [
      "good morning",
      "jefferson curl",
      "stiff-leg deadlift",
      "hyperextension",
      "back hyperextension",
      "snatch-grip deadlift",
    ],
    // High spinal loading but manageable with proper bracing
    soft: [
      "conventional deadlift",
      "sumo deadlift",
      "barbell row",
      "bent-over row",
      "pendlay row",
    ],
  },

  back: {
    // Redirect "back" pain to lower back table entries
    hard: [
      "good morning",
      "jefferson curl",
      "stiff-leg deadlift",
      "hyperextension",
      "back hyperextension",
    ],
    soft: [
      "conventional deadlift",
      "barbell row",
      "bent-over row",
    ],
  },

  hip: {
    // Deep hip impingement positions — note: many hip exercises are therapeutic
    hard: [
      "deep squat",
      "ido squat",
    ],
    // High hip flexion under heavy load
    soft: [
      "full-range hip thrust",
      "hip hinge",
    ],
  },

  wrist: {
    // Extreme wrist positions under load
    hard: [
      "wrist curl",
      "reverse wrist curl",
      "front squat",  // rack position stresses wrists
      "upright row",  // extreme supination
    ],
    soft: [
      "barbell curl",
      "push-up",
      "clean",
    ],
  },

  elbow: {
    // Elbow flexion/extension at end range under load
    hard: [
      "preacher curl",
      "skull crusher",
      "french press",
      "overhead tricep extension",
    ],
    soft: [
      "barbell curl",
      "pull-up",
      "dip",
      "close-grip bench",
    ],
  },

  ankle: {
    // Extreme dorsiflexion or plantar flexion under high load
    hard: [
      "depth jump",
      "standing calf raise",
      "seated calf raise",
    ],
    soft: [
      "box jump",
      "broad jump",
      "single-leg hop",
    ],
  },
};

// ─── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Case-insensitive substring match between exercise name and a constraint item.
 * Returns true when either string contains the other (handles variants like
 * "Belt Squat" matching "belt squat" constraint, or "belt squat" matching
 * "Belt Squat Machine").
 */
function matchesItem(exerciseName: string, item: string): boolean {
  const nameLower = exerciseName.toLowerCase();
  const itemLower = item.toLowerCase();
  return nameLower.includes(itemLower) || itemLower.includes(nameLower);
}

function matchesAny(exerciseName: string, items: string[]): boolean {
  return items.some((item) => matchesItem(exerciseName, item));
}

// ─── 1. Pain Pattern Conflict Detection ──────────────────────────────────────

export interface PainConflict {
  severity: "hard" | "soft" | "none";
  matchedRegion: string | null;
  matchedPattern: string | null;
}

/**
 * Determines whether a named exercise conflicts with reported pain regions.
 *
 * Returns the most severe conflict found across all reported regions.
 * Hard conflicts represent high-confidence contraindications.
 * Soft conflicts are possible concerns that warrant a penalty but not removal.
 *
 * Conservative by design: only flags conflicts we can determine with high
 * confidence from exercise name alone. Unknown exercises → "none".
 */
export function conflictsWithPainPattern(
  exerciseName: string,
  painRegions: string[],
): PainConflict {
  if (painRegions.length === 0) return { severity: "none", matchedRegion: null, matchedPattern: null };

  // Normalise pain region names for lookup
  const regionsLower = painRegions.map((r) => r.toLowerCase().trim());

  let worstSeverity: "hard" | "soft" | "none" = "none";
  let worstRegion: string | null = null;
  let worstPattern: string | null = null;

  for (const region of regionsLower) {
    // Find the best-matching rule (exact match first, then partial)
    const rule =
      PAIN_CONFLICT_TABLE[region] ??
      Object.entries(PAIN_CONFLICT_TABLE).find(([key]) => region.includes(key) || key.includes(region))?.[1];

    if (!rule) continue;

    for (const pattern of rule.hard) {
      if (matchesItem(exerciseName, pattern)) {
        // Hard conflict — return immediately (can't get worse)
        return { severity: "hard", matchedRegion: region, matchedPattern: pattern };
      }
    }

    for (const pattern of rule.soft) {
      if (matchesItem(exerciseName, pattern) && worstSeverity === "none") {
        worstSeverity = "soft";
        worstRegion = region;
        worstPattern = pattern;
      }
    }
  }

  return { severity: worstSeverity, matchedRegion: worstRegion, matchedPattern: worstPattern };
}

// ─── 2. Candidate Pre-Filter ──────────────────────────────────────────────────

/**
 * Removes constraint-violating exercises from a candidate pool before scoring.
 *
 * Safety guarantees:
 *  - If removing ALL banned items would empty the pool: return the full original
 *    pool (penalty scoring acts as fallback). This prevents generating an error
 *    when every candidate in a slot uses the same banned equipment.
 *  - If removing disliked items would empty the pool after banned filtering:
 *    keep the banned-filtered pool and let penalty scoring discourage disliked
 *    items instead of hard-removing them.
 *  - Pain patterns are NOT hard-filtered here — only scored as penalties. This
 *    is intentional: pain regions suggest patterns, not absolute exercise bans.
 *
 * Generic over T so the exercise-variation-engine's internal ExerciseMeta[]
 * type is preserved without needing to export it.
 */
export function filterCandidatesByConstraints<T extends { name: string }>(
  pool: T[],
  hardConstraints: HardConstraints,
): T[] {
  if (pool.length === 0) return pool;

  const { bannedItems, dislikedItems } = hardConstraints;

  // ── Step 1: Remove banned items (always hard-remove) ─────────────────────
  let filtered = pool;
  if (bannedItems.length > 0) {
    filtered = pool.filter((e) => !matchesAny(e.name, bannedItems));
    // Safety: if filtering removes everything, fall back to original pool
    // and let penalty scoring make banned items undesirable
    if (filtered.length === 0) {
      filtered = pool;
    }
  }

  // ── Step 2: Remove disliked items (soft-remove, only if alternatives remain) ──
  if (dislikedItems.length > 0) {
    const afterDislike = filtered.filter((e) => !matchesAny(e.name, dislikedItems));
    // Only apply if alternatives remain after removal
    if (afterDislike.length > 0) {
      filtered = afterDislike;
    }
    // If all candidates are disliked, keep banned-filtered pool and rely on penalty
  }

  return filtered;
}

// ─── 3. Constraint Penalty Computation ───────────────────────────────────────

export interface ConstraintPenalties {
  /** -100 if exercise matches a banned item — functionally eliminates from softmax */
  bannedPenalty: number;
  /** -6 if exercise matches a disliked item — strong discouragement */
  dislikedPenalty: number;
  /** -6 for hard pain conflict, -3 for soft pain conflict */
  painConflictPenalty: number;
  /** Pain conflict details for breakdown logging */
  painConflict: PainConflict;
}

/**
 * Computes constraint-related scoring penalties for a single exercise.
 *
 * Called inside scoreCandidate() after filtering — penalties are additive on
 * top of the existing score so they integrate naturally with the softmax draw.
 *
 * Banned items receive -100 as a last-resort fallback when the pre-filter
 * couldn't remove them (e.g. the entire pool is banned). This score ensures
 * they rank last and will only be chosen if literally nothing else exists.
 */
export function computeConstraintPenalties(
  exerciseName: string,
  hardConstraints: HardConstraints,
): ConstraintPenalties {
  const { bannedItems, dislikedItems, painRegions } = hardConstraints;

  const isBanned = bannedItems.length > 0 && matchesAny(exerciseName, bannedItems);
  const isDisliked = !isBanned && dislikedItems.length > 0 && matchesAny(exerciseName, dislikedItems);

  const painConflict = conflictsWithPainPattern(exerciseName, painRegions);
  const painConflictPenalty =
    painConflict.severity === "hard" ? 6 :
    painConflict.severity === "soft" ? 3 : 0;

  return {
    bannedPenalty: isBanned ? 100 : 0,
    dislikedPenalty: isDisliked ? 6 : 0,
    painConflictPenalty,
    painConflict,
  };
}
