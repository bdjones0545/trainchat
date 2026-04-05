/**
 * Exercise Service — Intelligent exercise library queries
 *
 * Provides fast, structured access to the exercise_library table.
 * Powers swap clusters, equipment filtering, injury-aware selection,
 * body-region filtering, unilateral/bilateral routing, and AI context injection.
 *
 * New fields leveraged: bodyRegion, unilateral, tags
 */

import { db, exerciseLibrary } from "@workspace/db";
import { eq, inArray, and, sql } from "drizzle-orm";

export type { ExerciseLibraryEntry } from "@workspace/db";

// ─── Equipment mapping (matches EquipmentLevel in training-intelligence) ───────

const EQUIPMENT_LEVEL_MAP: Record<string, string[]> = {
  full_gym: ["barbell", "dumbbell", "cable", "machine", "bodyweight", "kettlebell", "band", "trap_bar", "rings", "trx", "sled", "med_ball"],
  dumbbells_only: ["dumbbell", "bodyweight", "band", "kettlebell"],
  home_limited: ["dumbbell", "bodyweight", "band", "kettlebell"],
  bodyweight: ["bodyweight", "band", "rings", "trx"],
};

const DIFFICULTY_ORDER: Record<string, number> = {
  beginner: 0,
  intermediate: 1,
  advanced: 2,
  elite: 3,
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
 * Returns cluster members that satisfy equipment + injury + unilateral constraints.
 */
export async function getSwapCandidates(opts: {
  exerciseName: string;
  equipmentLevel?: string;
  injuryFlags?: string[];
  unilateralOnly?: boolean;
  maxCount?: number;
}): Promise<ExerciseLibraryEntry[]> {
  const { exerciseName, equipmentLevel = "full_gym", injuryFlags = [], unilateralOnly, maxCount = 6 } = opts;

  const exercise = await findExerciseByName(exerciseName);
  if (!exercise || !exercise.clusterId) {
    const fallback = await getByMovementPattern({
      pattern: exercise?.movementPattern ?? "squat",
      equipmentLevel,
      injuryFlags,
      unilateralOnly: unilateralOnly ?? exercise?.unilateral ?? false,
      excludeNames: [exerciseName],
      maxCount,
    });
    return fallback;
  }

  const clusterMembers = await getClusterMembers(exercise.clusterId, exerciseName);
  const allowed = EQUIPMENT_LEVEL_MAP[equipmentLevel] ?? EQUIPMENT_LEVEL_MAP.full_gym;

  return clusterMembers
    .filter((ex) => {
      const hasEquipment = (ex.equipment as string[]).some((eq) => allowed.includes(eq));
      if (!hasEquipment) return false;
      if (injuryFlags.length > 0) {
        const stress = ex.jointStressProfile as string[];
        if (injuryFlags.some((flag) => stress.includes(flag))) return false;
      }
      if (unilateralOnly !== undefined && ex.unilateral !== unilateralOnly) return false;
      return true;
    })
    .slice(0, maxCount);
}

/**
 * Get exercises by movement pattern with full constraint filtering.
 * Now includes bodyRegion, unilateral, and tags filtering.
 */
export async function getByMovementPattern(opts: {
  pattern: string;
  equipmentLevel?: string;
  injuryFlags?: string[];
  difficultyMax?: "beginner" | "intermediate" | "advanced";
  intentTags?: string[];
  tags?: string[];
  bodyRegion?: string;
  unilateralOnly?: boolean;
  excludeNames?: string[];
  maxCount?: number;
}): Promise<ExerciseLibraryEntry[]> {
  const {
    pattern,
    equipmentLevel = "full_gym",
    injuryFlags = [],
    difficultyMax,
    intentTags = [],
    tags = [],
    bodyRegion,
    unilateralOnly,
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
  const maxLevel = difficultyMax ? DIFFICULTY_ORDER[difficultyMax] : 3;
  const excludeSet = new Set(excludeNames.map((n) => n.toLowerCase()));

  const filtered = rows.filter((ex) => {
    if (excludeSet.has(ex.name.toLowerCase())) return false;
    const hasEquipment = (ex.equipment as string[]).some((e) => allowed.includes(e));
    if (!hasEquipment) return false;
    if ((DIFFICULTY_ORDER[ex.difficultyLevel] ?? 1) > maxLevel) return false;
    if (injuryFlags.length > 0) {
      const stress = ex.jointStressProfile as string[];
      if (injuryFlags.some((f) => stress.includes(f))) return false;
    }
    if (bodyRegion && ex.bodyRegion && ex.bodyRegion !== bodyRegion) return false;
    if (unilateralOnly !== undefined && ex.unilateral !== unilateralOnly) return false;
    if (tags.length > 0) {
      const exTags = ex.tags as string[];
      if (!tags.some((t) => exTags.includes(t))) return false;
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
  tags?: string[];
  bodyRegion?: string;
  unilateralOnly?: boolean;
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
 * Get exercises filtered by body region.
 * Useful for upper/lower body splits, full-body day filtering, etc.
 */
export async function getByBodyRegion(opts: {
  bodyRegion: "upper_body" | "lower_body" | "full_body" | "core";
  equipmentLevel?: string;
  injuryFlags?: string[];
  difficultyMax?: "beginner" | "intermediate" | "advanced";
  intentTags?: string[];
  unilateralOnly?: boolean;
  maxCount?: number;
}): Promise<ExerciseLibraryEntry[]> {
  const {
    bodyRegion,
    equipmentLevel = "full_gym",
    injuryFlags = [],
    difficultyMax,
    intentTags = [],
    unilateralOnly,
    maxCount,
  } = opts;

  const rows = await db
    .select()
    .from(exerciseLibrary)
    .where(
      and(
        eq(exerciseLibrary.bodyRegion, bodyRegion),
        eq(exerciseLibrary.isActive, true)
      )
    );

  const allowed = EQUIPMENT_LEVEL_MAP[equipmentLevel] ?? EQUIPMENT_LEVEL_MAP.full_gym;
  const maxLevel = difficultyMax ? DIFFICULTY_ORDER[difficultyMax] : 3;

  const filtered = rows.filter((ex) => {
    const hasEquipment = (ex.equipment as string[]).some((e) => allowed.includes(e));
    if (!hasEquipment) return false;
    if ((DIFFICULTY_ORDER[ex.difficultyLevel] ?? 1) > maxLevel) return false;
    if (injuryFlags.length > 0) {
      const stress = ex.jointStressProfile as string[];
      if (injuryFlags.some((f) => stress.includes(f))) return false;
    }
    if (unilateralOnly !== undefined && ex.unilateral !== unilateralOnly) return false;
    return true;
  });

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
 * Get joint-friendly / low-impact exercise alternatives.
 * Filters by jointStressProfile tags that do NOT include the injury flags,
 * and prioritizes exercises tagged low_impact or older_adult.
 */
export async function getJointFriendlyAlternatives(opts: {
  movementPattern: string;
  injuryFlags: string[];
  equipmentLevel?: string;
  difficultyMax?: "beginner" | "intermediate" | "advanced";
  maxCount?: number;
}): Promise<ExerciseLibraryEntry[]> {
  const { movementPattern, injuryFlags, equipmentLevel = "full_gym", difficultyMax, maxCount = 6 } = opts;

  return getByMovementPattern({
    pattern: movementPattern,
    equipmentLevel,
    injuryFlags,
    difficultyMax,
    tags: ["low_impact", "older_adult", "knee_sensitive", "low_back_sensitive", "shoulder_sensitive"],
    maxCount,
  });
}

/**
 * Build a compact AI context string from exercise options.
 * Used in prompt injection for program generation and edits.
 * Now includes bodyRegion, unilateral status, tags, and progression links.
 */
export async function buildExerciseContext(opts: {
  patterns: string[];
  equipmentLevel?: string;
  injuryFlags?: string[];
  difficultyMax?: "beginner" | "intermediate" | "advanced";
  intentTags?: string[];
  tags?: string[];
  bodyRegion?: string;
  unilateralOnly?: boolean;
  perPatternMax?: number;
  verbose?: boolean;
}): Promise<string> {
  const { verbose = false, ...queryOpts } = opts;
  const byPattern = await getForPatterns(queryOpts);

  const lines: string[] = [
    "AVAILABLE EXERCISE LIBRARY (use these names exactly when prescribing exercises):",
    "Format: Name (equipment | difficulty | body_region) [unilateral?] [tags]",
    "        → easier: ... | harder: ...",
  ];

  for (const [pattern, exercises] of Object.entries(byPattern)) {
    if (exercises.length === 0) continue;
    const label = pattern.replace(/_/g, " ").toUpperCase();
    lines.push(`\n${label}:`);
    for (const ex of exercises) {
      const equip = (ex.equipment as string[]).join("/");
      const region = ex.bodyRegion ?? "—";
      const lateral = ex.unilateral ? " [unilateral]" : "";
      const exTags = (ex.tags as string[]).slice(0, 3).join(", ");
      const tagStr = exTags ? ` {${exTags}}` : "";
      let line = `  - ${ex.name} (${equip} | ${ex.difficultyLevel} | ${region})${lateral}${tagStr}`;

      if (verbose) {
        const easier = (ex.easierVariations as string[]).join(", ");
        const harder = (ex.harderVariations as string[]).join(", ");
        if (easier || harder) {
          const progressions: string[] = [];
          if (easier) progressions.push(`easier: ${easier}`);
          if (harder) progressions.push(`harder: ${harder}`);
          line += `\n      → ${progressions.join(" | ")}`;
        }
      }

      lines.push(line);
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
  unilateralOnly?: boolean;
}): Promise<string> {
  const candidates = await getSwapCandidates({ ...opts, maxCount: 8 });
  if (candidates.length === 0) {
    return `No direct cluster matches found for "${opts.exerciseName}". Use your best judgment.`;
  }

  const lines = [
    `SWAP CANDIDATES for "${opts.exerciseName}" (prefer these options):`,
    ...candidates.map((ex) => {
      const equip = (ex.equipment as string[]).join("/");
      const region = ex.bodyRegion ?? "—";
      const lateral = ex.unilateral ? " [unilateral]" : " [bilateral]";
      const easier = (ex.easierVariations as string[]).join(", ");
      const harder = (ex.harderVariations as string[]).join(", ");
      const exTags = (ex.tags as string[]).filter((t) =>
        ["low_impact", "home_gym", "knee_sensitive", "shoulder_sensitive", "low_back_sensitive", "older_adult", "beginner_friendly"].includes(t)
      ).join(", ");
      let line = `  - ${ex.name} (${equip} | ${ex.difficultyLevel} | ${region})${lateral}`;
      if (exTags) line += ` {${exTags}}`;
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
 * Get library stats including new field breakdowns.
 */
export async function getLibraryStats(): Promise<{
  total: number;
  byPattern: Record<string, number>;
  byBodyRegion: Record<string, number>;
  clusterCount: number;
  unilateralCount: number;
  bilateralCount: number;
}> {
  const all = await getAllExercises();
  const byPattern: Record<string, number> = {};
  const byBodyRegion: Record<string, number> = {};
  const clusters = new Set<string>();
  let unilateralCount = 0;
  let bilateralCount = 0;

  for (const ex of all) {
    byPattern[ex.movementPattern] = (byPattern[ex.movementPattern] ?? 0) + 1;
    const region = ex.bodyRegion ?? "unclassified";
    byBodyRegion[region] = (byBodyRegion[region] ?? 0) + 1;
    if (ex.clusterId) clusters.add(ex.clusterId);
    if (ex.unilateral) unilateralCount++;
    else bilateralCount++;
  }

  return {
    total: all.length,
    byPattern,
    byBodyRegion,
    clusterCount: clusters.size,
    unilateralCount,
    bilateralCount,
  };
}
