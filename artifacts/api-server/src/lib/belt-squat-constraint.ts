/**
 * Belt Squat Constraint System
 *
 * Handles detection, replacement, and post-mutation audit for Belt Squat
 * equipment constraints. Belt Squat is a SPECIALTY machine not found in
 * most gyms. It must NOT appear in generated programs by default.
 *
 * Rules:
 *   - equipmentAvailability: "specialty"
 *   - defaultAllowed: false
 *   - requiresExplicitAccess: true
 *   - Never selected unless user explicitly confirms gym has one
 */

// ─── Detection patterns ────────────────────────────────────────────────────────

export const BELT_SQUAT_UNAVAILABLE_PATTERNS = [
  /\bno belt.?squat\b/i,
  /\bdon.?t\s+have\s+(a\s+)?belt.?squat\b/i,
  /\bdont\s+have\s+(a\s+)?belt.?squat\b/i,
  /\bmy\s+gym\s+doesn.?t\s+have\s+(a\s+)?belt.?squat\b/i,
  /\bmy\s+gym\s+does.?t\s+have\s+(a\s+)?belt.?squat\b/i,
  /\bno\s+belt.?squat\s+machine\b/i,
  /\bwithout\s+(a\s+)?belt.?squat\b/i,
  /\bcan.?t\s+(do|use|access)\s+(a\s+)?belt.?squat\b/i,
  /\b(remove|replace|swap)\s+(the\s+)?belt.?squat\b/i,
  /\bbelt.?squat\s+(is\s+)?(unavailable|not available|not here|not at my gym)\b/i,
];

// ─── Exercise aliases that mean Belt Squat ─────────────────────────────────────

export const BELT_SQUAT_ALIASES = [
  "belt squat",
  "belt-squat",
  "beltsquat",
];

// ─── Replacement priority list ─────────────────────────────────────────────────
//
// Ordered from most-preferred to least-preferred when Belt Squat is unavailable.
// Only common exercises that do NOT require specialty equipment.

export const BELT_SQUAT_REPLACEMENT_PRIORITY = [
  "Back Squat",
  "Front Squat",
  "Goblet Squat",
  "Leg Press",
  "Safety Bar Squat",
  "Hack Squat",
  "Bulgarian Split Squat",
  "Dumbbell Split Squat",
  "Step-Up",
  "Trap Bar Deadlift",
];

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Returns true if the user message signals Belt Squat unavailability.
 */
export function detectsBeltSquatUnavailable(message: string): boolean {
  return BELT_SQUAT_UNAVAILABLE_PATTERNS.some((p) => p.test(message));
}

/**
 * Returns true if an exercise name is a Belt Squat (case-insensitive).
 */
export function isBeltSquat(name: string): boolean {
  const lower = name.toLowerCase().trim();
  return BELT_SQUAT_ALIASES.some((alias) => lower === alias || lower.includes(alias));
}

/**
 * Scan a full training system for every Belt Squat exercise instance.
 * Returns an array of { sessionId, exerciseId, exerciseName, sets, reps, rest, category }.
 */
export function findBeltSquatsInSystem(system: {
  phases: Array<{
    weeks: Array<{
      sessions: Array<{
        id: number;
        exercises: Array<{
          id: number;
          name: string;
          sets: number;
          reps: string;
          rest: string;
          category?: string;
        }>;
      }>;
    }>;
  }>;
}): Array<{
  sessionId: number;
  exerciseId: number;
  exerciseName: string;
  sets: number;
  reps: string;
  rest: string;
  category?: string;
}> {
  const found: ReturnType<typeof findBeltSquatsInSystem> = [];
  const seenIds = new Set<number>();

  for (const phase of system.phases ?? []) {
    for (const week of phase.weeks ?? []) {
      for (const session of week.sessions ?? []) {
        for (const ex of session.exercises ?? []) {
          if (!seenIds.has(ex.id) && isBeltSquat(ex.name)) {
            seenIds.add(ex.id);
            found.push({
              sessionId: session.id,
              exerciseId: ex.id,
              exerciseName: ex.name,
              sets: ex.sets,
              reps: ex.reps,
              rest: ex.rest,
              category: ex.category,
            });
          }
        }
      }
    }
  }

  return found;
}

/**
 * Pick the best Belt Squat replacement given the current exercises in a session.
 * Avoids duplicating an exercise already present in the same session.
 * Falls back through the priority list until one is not already used.
 */
export function pickBeltSquatReplacement(currentExerciseNames: string[]): string {
  const lowerNames = currentExerciseNames.map((n) => n.toLowerCase());
  for (const candidate of BELT_SQUAT_REPLACEMENT_PRIORITY) {
    if (!lowerNames.includes(candidate.toLowerCase())) {
      return candidate;
    }
  }
  // All candidates already in session — use the absolute safest fallback
  return "Goblet Squat";
}

/**
 * Post-mutation audit: scan the system JSON string or object for any remaining
 * Belt Squat references. Returns true if Belt Squat is still present.
 */
export function auditBeltSquatRemoval(
  system: { phases: any[] } | null
): { stillPresent: boolean; count: number } {
  if (!system) return { stillPresent: false, count: 0 };

  let count = 0;
  for (const phase of system.phases ?? []) {
    for (const week of phase.weeks ?? []) {
      for (const session of week.sessions ?? []) {
        for (const ex of session.exercises ?? []) {
          if (isBeltSquat(String(ex.name ?? ""))) {
            count++;
          }
        }
      }
    }
  }

  return { stillPresent: count > 0, count };
}
