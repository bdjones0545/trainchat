/**
 * Exercise Service — Decision-Ready Movement System
 *
 * Provides structured, constraint-aware access to the exercise library.
 * Powers swap clusters, equipment filtering, injury-aware selection,
 * neural demand filtering, time compression, sport-specific biasing,
 * and AI context injection.
 *
 * Every query function is designed to support the Program Specialist Decision Layer:
 * PATTERN → CATEGORY → EXERCISE → VARIANTS
 */

import { db, exerciseLibrary } from "@workspace/db";
import { eq, inArray, and, sql, ne } from "drizzle-orm";

export type { ExerciseLibraryEntry } from "@workspace/db";

// ─── Equipment mapping ────────────────────────────────────────────────────────

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
export async function findExerciseByName(name: string) {
  const rows = await db
    .select()
    .from(exerciseLibrary)
    .where(sql`lower(${exerciseLibrary.name}) = lower(${name})`)
    .limit(1);
  return rows[0] ?? null;
}

/**
 * Get all exercises in the same cluster as the given clusterId.
 * These are direct swap candidates (same role, different equipment/constraint level).
 */
export async function getClusterMembers(clusterId: string, excludeName?: string) {
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
 * Find smart swap candidates for an exercise.
 * Respects equipment, injury, neural demand, and time constraints.
 * Falls back to movement pattern search if no cluster exists.
 */
export async function getSwapCandidates(opts: {
  exerciseName: string;
  equipmentLevel?: string;
  injuryFlags?: string[];
  unilateralOnly?: boolean;
  maxNeuralDemand?: "low" | "moderate" | "high";
  maxTimeCost?: "low" | "moderate" | "high";
  maxCount?: number;
}) {
  const {
    exerciseName,
    equipmentLevel = "full_gym",
    injuryFlags = [],
    unilateralOnly,
    maxNeuralDemand,
    maxTimeCost,
    maxCount = 6,
  } = opts;

  const exercise = await findExerciseByName(exerciseName);
  if (!exercise || !exercise.clusterId) {
    return getByMovementPattern({
      pattern: exercise?.movementPattern ?? "knee_dominant",
      equipmentLevel,
      injuryFlags,
      unilateralOnly: unilateralOnly ?? exercise?.unilateral ?? false,
      excludeNames: [exerciseName],
      maxNeuralDemand,
      maxTimeCost,
      maxCount,
    });
  }

  const clusterMembers = await getClusterMembers(exercise.clusterId, exerciseName);
  const allowed = EQUIPMENT_LEVEL_MAP[equipmentLevel] ?? EQUIPMENT_LEVEL_MAP.full_gym;
  const neuralOrder: Record<string, number> = { low: 0, moderate: 1, high: 2 };
  const maxNeuralLevel = maxNeuralDemand ? neuralOrder[maxNeuralDemand] : 2;
  const maxTimeLevel = maxTimeCost ? neuralOrder[maxTimeCost] : 2;

  return clusterMembers
    .filter((ex) => {
      const hasEquipment = (ex.equipment as string[]).some((eq) => allowed.includes(eq));
      if (!hasEquipment) return false;
      if (injuryFlags.length > 0) {
        const stress = ex.jointStressProfile as string[];
        if (injuryFlags.some((flag) => stress.includes(flag))) return false;
      }
      if (unilateralOnly !== undefined && ex.unilateral !== unilateralOnly) return false;
      if (maxNeuralDemand && ex.neuralDemand) {
        if ((neuralOrder[ex.neuralDemand] ?? 1) > maxNeuralLevel) return false;
      }
      if (maxTimeCost && ex.timeCost) {
        if ((neuralOrder[ex.timeCost] ?? 1) > maxTimeLevel) return false;
      }
      return true;
    })
    .slice(0, maxCount);
}

/**
 * Get exercises by movement pattern with full constraint filtering.
 * Supports sport biasing via sportTransferTags, neural demand cap, and time cost cap.
 */
export async function getByMovementPattern(opts: {
  pattern: string;
  equipmentLevel?: string;
  injuryFlags?: string[];
  difficultyMax?: "beginner" | "intermediate" | "advanced";
  intentTags?: string[];
  sportTransferTags?: string[];
  tags?: string[];
  bodyRegion?: string;
  role?: string;
  unilateralOnly?: boolean;
  excludeNames?: string[];
  maxNeuralDemand?: "low" | "moderate" | "high";
  maxTimeCost?: "low" | "moderate" | "high";
  maxCount?: number;
}) {
  const {
    pattern,
    equipmentLevel = "full_gym",
    injuryFlags = [],
    difficultyMax,
    intentTags = [],
    sportTransferTags = [],
    tags = [],
    bodyRegion,
    role,
    unilateralOnly,
    excludeNames = [],
    maxNeuralDemand,
    maxTimeCost,
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
  const neuralOrder: Record<string, number> = { low: 0, moderate: 1, high: 2 };
  const maxNeuralLevel = maxNeuralDemand ? neuralOrder[maxNeuralDemand] : 2;
  const maxTimeLevel = maxTimeCost ? neuralOrder[maxTimeCost] : 2;

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
    if (role && ex.role && ex.role !== role) return false;
    if (unilateralOnly !== undefined && ex.unilateral !== unilateralOnly) return false;
    if (tags.length > 0) {
      const exTags = ex.tags as string[];
      if (!tags.some((t) => exTags.includes(t))) return false;
    }
    if (maxNeuralDemand && ex.neuralDemand) {
      if ((neuralOrder[ex.neuralDemand] ?? 1) > maxNeuralLevel) return false;
    }
    if (maxTimeCost && ex.timeCost) {
      if ((neuralOrder[ex.timeCost] ?? 1) > maxTimeLevel) return false;
    }
    return true;
  });

  // Score: intent tags first, then sport transfer tags (for sport-specific biasing)
  if (intentTags.length > 0 || sportTransferTags.length > 0) {
    filtered.sort((a, b) => {
      const aIntent = (a.intentTags as string[]).filter((t) => intentTags.includes(t)).length;
      const bIntent = (b.intentTags as string[]).filter((t) => intentTags.includes(t)).length;
      const aSport = (a.sportTransferTags as string[]).filter((t) => sportTransferTags.includes(t)).length;
      const bSport = (b.sportTransferTags as string[]).filter((t) => sportTransferTags.includes(t)).length;
      return (bIntent + bSport) - (aIntent + aSport);
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
  sportTransferTags?: string[];
  tags?: string[];
  bodyRegion?: string;
  role?: string;
  unilateralOnly?: boolean;
  maxNeuralDemand?: "low" | "moderate" | "high";
  maxTimeCost?: "low" | "moderate" | "high";
  perPatternMax?: number;
}) {
  const { patterns, perPatternMax = 6, ...rest } = opts;
  const result: Record<string, Awaited<ReturnType<typeof getByMovementPattern>>> = {};
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
 * Useful for upper/lower splits and full-body days.
 */
export async function getByBodyRegion(opts: {
  bodyRegion: "upper_body" | "lower_body" | "full_body" | "core";
  equipmentLevel?: string;
  injuryFlags?: string[];
  difficultyMax?: "beginner" | "intermediate" | "advanced";
  intentTags?: string[];
  role?: string;
  unilateralOnly?: boolean;
  maxNeuralDemand?: "low" | "moderate" | "high";
  maxCount?: number;
}) {
  const {
    bodyRegion,
    equipmentLevel = "full_gym",
    injuryFlags = [],
    difficultyMax,
    intentTags = [],
    role,
    unilateralOnly,
    maxNeuralDemand,
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
  const neuralOrder: Record<string, number> = { low: 0, moderate: 1, high: 2 };
  const maxNeuralLevel = maxNeuralDemand ? neuralOrder[maxNeuralDemand] : 2;

  const filtered = rows.filter((ex) => {
    const hasEquipment = (ex.equipment as string[]).some((e) => allowed.includes(e));
    if (!hasEquipment) return false;
    if ((DIFFICULTY_ORDER[ex.difficultyLevel] ?? 1) > maxLevel) return false;
    if (injuryFlags.length > 0) {
      const stress = ex.jointStressProfile as string[];
      if (injuryFlags.some((f) => stress.includes(f))) return false;
    }
    if (role && ex.role && ex.role !== role) return false;
    if (unilateralOnly !== undefined && ex.unilateral !== unilateralOnly) return false;
    if (maxNeuralDemand && ex.neuralDemand) {
      if ((neuralOrder[ex.neuralDemand] ?? 1) > maxNeuralLevel) return false;
    }
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
 * Time-compressed exercise selection.
 * Drops low-priority accessories and high timeCost exercises.
 * Returns only the exercises the system should keep under time pressure.
 */
export async function getTimeCompressedExercises(opts: {
  patterns: string[];
  equipmentLevel?: string;
  injuryFlags?: string[];
  perPatternMax?: number;
}) {
  return getForPatterns({
    ...opts,
    maxTimeCost: "moderate",
    tags: [],
    intentTags: ["strength", "power", "athletic"],
    perPatternMax: opts.perPatternMax ?? 3,
  });
}

/**
 * Get joint-friendly alternatives by filtering out stress flags
 * and prioritizing constraint-aware tags.
 */
export async function getJointFriendlyAlternatives(opts: {
  movementPattern: string;
  injuryFlags: string[];
  equipmentLevel?: string;
  difficultyMax?: "beginner" | "intermediate" | "advanced";
  maxCount?: number;
}) {
  const { movementPattern, injuryFlags, equipmentLevel = "full_gym", difficultyMax, maxCount = 6 } = opts;

  return getByMovementPattern({
    pattern: movementPattern,
    equipmentLevel,
    injuryFlags,
    difficultyMax,
    tags: ["shoulder_sensitive", "knee_sensitive", "low_back_sensitive", "low_impact", "beginner_friendly"],
    maxCount,
  });
}

/**
 * Get sport-specific exercise selections.
 * Biases the library toward exercises with matching sportTransferTags.
 */
export async function getSportSpecificExercises(opts: {
  sport: string;
  patterns: string[];
  equipmentLevel?: string;
  injuryFlags?: string[];
  perPatternMax?: number;
}) {
  const SPORT_TAG_MAP: Record<string, string[]> = {
    soccer: ["change_of_direction", "acceleration", "deceleration", "lower_body_force"],
    basketball: ["vertical_jump", "change_of_direction", "lower_body_force", "stiffness"],
    baseball: ["rotational_power", "upper_body_force", "trunk_stability"],
    tennis: ["rotational_power", "change_of_direction", "upper_body_force", "anti_rotation"],
    football: ["lower_body_force", "acceleration", "upper_body_force", "stiffness"],
    rugby: ["lower_body_force", "acceleration", "upper_body_force", "trunk_stability"],
    lacrosse: ["rotational_power", "change_of_direction", "upper_body_force"],
    mma: ["rotational_power", "trunk_stability", "upper_body_force", "lower_body_force"],
    swimming: ["upper_body_force", "trunk_stability", "anti_rotation"],
    sprinting: ["acceleration", "stiffness", "lower_body_force"],
    general_athletic: ["acceleration", "lower_body_force", "trunk_stability"],
  };

  const transferTags = SPORT_TAG_MAP[opts.sport.toLowerCase()] ?? SPORT_TAG_MAP.general_athletic;

  return getForPatterns({
    patterns: opts.patterns,
    equipmentLevel: opts.equipmentLevel,
    injuryFlags: opts.injuryFlags,
    sportTransferTags: transferTags,
    perPatternMax: opts.perPatternMax ?? 4,
  });
}

/**
 * Build compact AI context string from exercise options.
 * Includes role, neural demand, time cost, and sport transfer tags for richer AI reasoning.
 */
export async function buildExerciseContext(opts: {
  patterns: string[];
  equipmentLevel?: string;
  injuryFlags?: string[];
  difficultyMax?: "beginner" | "intermediate" | "advanced";
  intentTags?: string[];
  sportTransferTags?: string[];
  tags?: string[];
  bodyRegion?: string;
  role?: string;
  unilateralOnly?: boolean;
  maxNeuralDemand?: "low" | "moderate" | "high";
  maxTimeCost?: "low" | "moderate" | "high";
  perPatternMax?: number;
  verbose?: boolean;
}) {
  const { verbose = false, ...queryOpts } = opts;
  const byPattern = await getForPatterns(queryOpts);

  const lines: string[] = [
    "EXERCISE LIBRARY — Decision-Ready Movement System",
    "Format: Name | role | equipment | difficulty | neural_demand | time_cost",
    "        → easier: ... | harder: ... | sport: ...",
    "",
  ];

  for (const [pattern, exercises] of Object.entries(byPattern)) {
    if (exercises.length === 0) continue;
    const label = pattern.replace(/_/g, " ").toUpperCase();
    lines.push(`[${label}]`);

    for (const ex of exercises) {
      const equip = (ex.equipment as string[]).join("/");
      const role = ex.role ?? "—";
      const neural = ex.neuralDemand ?? "—";
      const time = ex.timeCost ?? "—";
      const lateral = ex.unilateral ? " [uni]" : "";
      let line = `  ${ex.name}${lateral} | ${role} | ${equip} | ${ex.difficultyLevel} | neural:${neural} | time:${time}`;

      if (verbose) {
        const easier = (ex.easierVariations as string[]).join(", ");
        const harder = (ex.harderVariations as string[]).join(", ");
        const sport = (ex.sportTransferTags as string[]).join(", ");
        const progressions: string[] = [];
        if (easier) progressions.push(`easier: ${easier}`);
        if (harder) progressions.push(`harder: ${harder}`);
        if (sport) progressions.push(`sport: ${sport}`);
        if (progressions.length > 0) {
          line += `\n    → ${progressions.join(" | ")}`;
        }
      }

      lines.push(line);
    }
    lines.push("");
  }

  return lines.join("\n");
}

/**
 * Build swap candidate context for the AI.
 * Returns a formatted string showing what the system can swap to given constraints.
 */
export async function buildSwapContext(opts: {
  exerciseName: string;
  equipmentLevel?: string;
  injuryFlags?: string[];
  unilateralOnly?: boolean;
  maxNeuralDemand?: "low" | "moderate" | "high";
  maxTimeCost?: "low" | "moderate" | "high";
}) {
  const candidates = await getSwapCandidates({ ...opts, maxCount: 8 });
  const exercise = await findExerciseByName(opts.exerciseName);

  if (candidates.length === 0) {
    return `No direct cluster matches found for "${opts.exerciseName}". Use movement pattern and role to find alternatives.`;
  }

  const lines = [
    `SWAP CANDIDATES for "${opts.exerciseName}" (${exercise?.role ?? "unknown role"} | ${exercise?.movementPattern ?? ""})`,
    `Constraints applied: equipment=${opts.equipmentLevel ?? "full_gym"} | injury=${(opts.injuryFlags ?? []).join(",") || "none"} | neural_max=${opts.maxNeuralDemand ?? "any"} | time_max=${opts.maxTimeCost ?? "any"}`,
    "",
    ...candidates.map((ex) => {
      const equip = (ex.equipment as string[]).join("/");
      const lateral = ex.unilateral ? " [unilateral]" : " [bilateral]";
      const easier = (ex.easierVariations as string[]).join(", ");
      const harder = (ex.harderVariations as string[]).join(", ");
      const constraintTags = (ex.tags as string[]).filter((t) =>
        ["shoulder_sensitive", "knee_sensitive", "low_back_sensitive", "low_impact", "beginner_friendly", "time_efficient"].includes(t)
      ).join(", ");

      let line = `  - ${ex.name}${lateral} | ${equip} | ${ex.difficultyLevel} | neural:${ex.neuralDemand} | time:${ex.timeCost}`;
      if (constraintTags) line += ` {${constraintTags}}`;
      if (easier) line += `\n      easier: ${easier}`;
      if (harder) line += `\n      harder: ${harder}`;
      return line;
    }),
  ];
  return lines.join("\n");
}

/**
 * Get regressions and progressions for an exercise.
 */
export async function getProgressions(exerciseName: string) {
  const exercise = await findExerciseByName(exerciseName);
  if (!exercise) return { easier: [], harder: [] };

  const easierNames = exercise.easierVariations as string[];
  const harderNames = exercise.harderVariations as string[];

  const [easier, harder] = await Promise.all([
    easierNames.length > 0
      ? db.select().from(exerciseLibrary).where(
          and(inArray(exerciseLibrary.name, easierNames), eq(exerciseLibrary.isActive, true))
        )
      : Promise.resolve([]),
    harderNames.length > 0
      ? db.select().from(exerciseLibrary).where(
          and(inArray(exerciseLibrary.name, harderNames), eq(exerciseLibrary.isActive, true))
        )
      : Promise.resolve([]),
  ]);

  return { easier, harder };
}

/**
 * Get all active exercises — for admin/seed verification.
 */
export async function getAllExercises() {
  return db.select().from(exerciseLibrary).where(eq(exerciseLibrary.isActive, true));
}

/**
 * Get library stats for the decision system.
 */
export async function getLibraryStats() {
  const all = await getAllExercises();
  const byPattern: Record<string, number> = {};
  const byRole: Record<string, number> = {};
  const byBodyRegion: Record<string, number> = {};
  const clusters = new Set<string>();
  let unilateralCount = 0;
  let bilateralCount = 0;

  for (const ex of all) {
    byPattern[ex.movementPattern] = (byPattern[ex.movementPattern] ?? 0) + 1;
    const region = ex.bodyRegion ?? "unclassified";
    byBodyRegion[region] = (byBodyRegion[region] ?? 0) + 1;
    const role = ex.role ?? "unclassified";
    byRole[role] = (byRole[role] ?? 0) + 1;
    if (ex.clusterId) clusters.add(ex.clusterId);
    if (ex.unilateral) unilateralCount++;
    else bilateralCount++;
  }

  return {
    total: all.length,
    byPattern,
    byRole,
    byBodyRegion,
    clusterCount: clusters.size,
    unilateralCount,
    bilateralCount,
  };
}
