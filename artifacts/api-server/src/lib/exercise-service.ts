/**
 * Exercise Service — Intelligent exercise library queries
 *
 * Provides fast, structured access to the exercise_library table.
 * Powers swap clusters, equipment filtering, injury-aware selection,
 * and AI context injection.
 */

import { db, exerciseLibrary } from "@workspace/db";
import { eq, inArray, and, sql } from "drizzle-orm";

export type { ExerciseLibraryEntry } from "@workspace/db";

// ─── Equipment mapping (matches EquipmentLevel in training-intelligence) ───────

const EQUIPMENT_LEVEL_MAP: Record<string, string[]> = {
  full_gym: ["barbell", "dumbbell", "cable", "machine", "bodyweight", "kettlebell", "band", "trap_bar", "rings", "trx"],
  dumbbells_only: ["dumbbell", "bodyweight", "band", "kettlebell"],
  home_limited: ["dumbbell", "bodyweight", "band", "kettlebell"],
  bodyweight: ["bodyweight", "band", "rings", "trx"],
};

// ─── Core query functions ─────────────────────────────────────────────────────

/**
 * Find an exercise by exact name (case-insensitive).
 */
export async function findExerciseByName(name: string): Promise<ExerciseLibraryEntry | null> {
  const rows = await db
    .select()
    .from(exerciseLibrary)
    .where(sql`lower(${exerciseLibrary.name}) = lower(${name})`)
    .limit(1);
  return rows[0] ?? null;
}

/**
 * Get all exercises in the same cluster as the given clusterId.
 * These are direct swap candidates.
 */
export async function getClusterMembers(
  clusterId: string,
  excludeName?: string
): Promise<ExerciseLibraryEntry[]> {
  const rows = await db
    .select()
    .from(exerciseLibrary)
    .where(
      and(
        eq(exerciseLibrary.clusterId, clusterId),
        eq(exerciseLibrary.isActive, true)
      )
    );
  if (excludeName) {
    return rows.filter((r) => r.name.toLowerCase() !== excludeName.toLowerCase());
  }
  return rows;
}

/**
 * Find swap candidates for an exercise.
 * Returns cluster members that satisfy equipment + injury constraints.
 */
export async function getSwapCandidates(opts: {
  exerciseName: string;
  equipmentLevel?: string;
  injuryFlags?: string[];
  maxCount?: number;
}): Promise<ExerciseLibraryEntry[]> {
  const { exerciseName, equipmentLevel = "full_gym", injuryFlags = [], maxCount = 6 } = opts;

  const exercise = await findExerciseByName(exerciseName);
  if (!exercise || !exercise.clusterId) {
    // Fallback: find by movement pattern
    const fallback = await getByMovementPattern({
      pattern: exercise?.movementPattern ?? "squat",
      equipmentLevel,
      injuryFlags,
      excludeNames: [exerciseName],
      maxCount,
    });
    return fallback;
  }

  const clusterMembers = await getClusterMembers(exercise.clusterId, exerciseName);
  const allowed = EQUIPMENT_LEVEL_MAP[equipmentLevel] ?? EQUIPMENT_LEVEL_MAP.full_gym;

  return clusterMembers
    .filter((ex) => {
      // Equipment check
      const hasEquipment = (ex.equipment as string[]).some((eq) => allowed.includes(eq));
      if (!hasEquipment) return false;
      // Injury check
      if (injuryFlags.length > 0) {
        const stress = ex.jointStressProfile as string[];
        const hasConflict = injuryFlags.some((flag) => stress.includes(flag));
        if (hasConflict) return false;
      }
      return true;
    })
    .slice(0, maxCount);
}

/**
 * Get exercises by movement pattern with full constraint filtering.
 */
export async function getByMovementPattern(opts: {
  pattern: string;
  equipmentLevel?: string;
  injuryFlags?: string[];
  difficultyMax?: "beginner" | "intermediate" | "advanced";
  intentTags?: string[];
  excludeNames?: string[];
  maxCount?: number;
}): Promise<ExerciseLibraryEntry[]> {
  const {
    pattern,
    equipmentLevel = "full_gym",
    injuryFlags = [],
    difficultyMax,
    intentTags = [],
    excludeNames = [],
    maxCount,
  } = opts;

  const rows = await db
    .select()
    .from(exerciseLibrary)
    .where(
      and(
        eq(exerciseLibrary.movementPattern, pattern),
        eq(exerciseLibrary.isActive, true)
      )
    );

  const allowed = EQUIPMENT_LEVEL_MAP[equipmentLevel] ?? EQUIPMENT_LEVEL_MAP.full_gym;
  const diffOrder: Record<string, number> = { beginner: 0, intermediate: 1, advanced: 2, elite: 3 };
  const maxLevel = difficultyMax ? diffOrder[difficultyMax] : 3;
  const excludeSet = new Set(excludeNames.map((n) => n.toLowerCase()));

  const filtered = rows.filter((ex) => {
    if (excludeSet.has(ex.name.toLowerCase())) return false;
    const hasEquipment = (ex.equipment as string[]).some((e) => allowed.includes(e));
    if (!hasEquipment) return false;
    if (diffOrder[ex.difficultyLevel] > maxLevel) return false;
    if (injuryFlags.length > 0) {
      const stress = ex.jointStressProfile as string[];
      if (injuryFlags.some((f) => stress.includes(f))) return false;
    }
    return true;
  });

  // Boost exercises that match intent tags
  if (intentTags.length > 0) {
    filtered.sort((a, b) => {
      const aScore = (a.intentTags as string[]).filter((t) => intentTags.includes(t)).length;
      const bScore = (b.intentTags as string[]).filter((t) => intentTags.includes(t)).length;
      return bScore - aScore;
    });
  }

  return maxCount ? filtered.slice(0, maxCount) : filtered;
}

/**
 * Get exercises for multiple movement patterns (for program generation).
 */
export async function getForPatterns(opts: {
  patterns: string[];
  equipmentLevel?: string;
  injuryFlags?: string[];
  difficultyMax?: "beginner" | "intermediate" | "advanced";
  intentTags?: string[];
  perPatternMax?: number;
}): Promise<Record<string, ExerciseLibraryEntry[]>> {
  const { patterns, perPatternMax = 8, ...rest } = opts;
  const result: Record<string, ExerciseLibraryEntry[]> = {};
  await Promise.all(
    patterns.map(async (pattern) => {
      result[pattern] = await getByMovementPattern({
        pattern,
        maxCount: perPatternMax,
        ...rest,
      });
    })
  );
  return result;
}

/**
 * Build a compact AI context string from exercise options.
 * Used in prompt injection for program generation and edits.
 */
export async function buildExerciseContext(opts: {
  patterns: string[];
  equipmentLevel?: string;
  injuryFlags?: string[];
  difficultyMax?: "beginner" | "intermediate" | "advanced";
  intentTags?: string[];
  perPatternMax?: number;
}): Promise<string> {
  const byPattern = await getForPatterns(opts);

  const lines: string[] = ["AVAILABLE EXERCISE LIBRARY (use these names exactly):"];
  for (const [pattern, exercises] of Object.entries(byPattern)) {
    if (exercises.length === 0) continue;
    const label = pattern.replace(/_/g, " ").toUpperCase();
    lines.push(`\n${label}:`);
    for (const ex of exercises) {
      const equip = (ex.equipment as string[]).join("/");
      const cluster = ex.clusterId ? ` [cluster:${ex.clusterId}]` : "";
      lines.push(`  - ${ex.name} (${equip}, ${ex.difficultyLevel})${cluster}`);
    }
  }

  return lines.join("\n");
}

/**
 * Build swap candidate context for a specific exercise.
 * Returns a formatted string for AI injection when handling a swap request.
 */
export async function buildSwapContext(opts: {
  exerciseName: string;
  equipmentLevel?: string;
  injuryFlags?: string[];
}): Promise<string> {
  const candidates = await getSwapCandidates({ ...opts, maxCount: 8 });
  if (candidates.length === 0) {
    return `No direct cluster matches found for "${opts.exerciseName}". Use your best judgment.`;
  }

  const lines = [
    `SWAP CANDIDATES for "${opts.exerciseName}" (prefer these options):`,
    ...candidates.map((ex) => {
      const equip = (ex.equipment as string[]).join("/");
      const easier = (ex.easierVariations as string[]).join(", ");
      const harder = (ex.harderVariations as string[]).join(", ");
      let line = `  - ${ex.name} (${equip}, ${ex.difficultyLevel})`;
      if (easier) line += ` | easier: ${easier}`;
      if (harder) line += ` | harder: ${harder}`;
      return line;
    }),
  ];
  return lines.join("\n");
}

/**
 * Get regressions/progressions for an exercise.
 */
export async function getProgressions(exerciseName: string): Promise<{
  easier: ExerciseLibraryEntry[];
  harder: ExerciseLibraryEntry[];
}> {
  const exercise = await findExerciseByName(exerciseName);
  if (!exercise) return { easier: [], harder: [] };

  const easierNames = exercise.easierVariations as string[];
  const harderNames = exercise.harderVariations as string[];

  const [easier, harder] = await Promise.all([
    easierNames.length > 0
      ? db.select().from(exerciseLibrary).where(
          and(
            inArray(exerciseLibrary.name, easierNames),
            eq(exerciseLibrary.isActive, true)
          )
        )
      : Promise.resolve([]),
    harderNames.length > 0
      ? db.select().from(exerciseLibrary).where(
          and(
            inArray(exerciseLibrary.name, harderNames),
            eq(exerciseLibrary.isActive, true)
          )
        )
      : Promise.resolve([]),
  ]);

  return { easier, harder };
}

/**
 * Get all exercises — for admin/seed verification.
 */
export async function getAllExercises(): Promise<ExerciseLibraryEntry[]> {
  return db.select().from(exerciseLibrary).where(eq(exerciseLibrary.isActive, true));
}

/**
 * Get library stats.
 */
export async function getLibraryStats(): Promise<{
  total: number;
  byPattern: Record<string, number>;
  clusterCount: number;
}> {
  const all = await getAllExercises();
  const byPattern: Record<string, number> = {};
  const clusters = new Set<string>();

  for (const ex of all) {
    byPattern[ex.movementPattern] = (byPattern[ex.movementPattern] ?? 0) + 1;
    if (ex.clusterId) clusters.add(ex.clusterId);
  }

  return { total: all.length, byPattern, clusterCount: clusters.size };
}
