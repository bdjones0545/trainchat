/**
 * Exercise Library Seeder
 *
 * Populates the exercise_library table from the canonical EXERCISES data.
 * Safe to call multiple times — uses upsert (ON CONFLICT DO UPDATE).
 *
 * Called on startup if the table is empty, and available via admin endpoint.
 */

import { db, exerciseLibrary } from "@workspace/db";
import { sql, count } from "drizzle-orm";
import { EXERCISES } from "./exercise-library-data";
import { logger } from "./logger";

export async function isExerciseLibraryEmpty(): Promise<boolean> {
  const [result] = await db.select({ count: count() }).from(exerciseLibrary);
  return Number(result?.count ?? 0) === 0;
}

export async function seedExerciseLibrary(): Promise<{ inserted: number; updated: number }> {
  logger.info("[ExerciseSeeder] Starting exercise library seed...");

  await db.update(exerciseLibrary).set({ isActive: false });

  let inserted = 0;
  let updated = 0;

  for (const ex of EXERCISES) {
    const result = await db
      .insert(exerciseLibrary)
      .values({
        name: ex.name,
        movementPattern: ex.movementPattern,
        bodyRegion: ex.bodyRegion,
        role: ex.role,
        unilateral: ex.unilateral ?? false,
        primaryMuscle: ex.primaryMuscle,
        secondaryMuscles: ex.secondaryMuscles,
        equipment: ex.equipment,
        difficultyLevel: ex.difficultyLevel,
        neuralDemand: ex.neuralDemand ?? "moderate",
        timeCost: ex.timeCost ?? "moderate",
        intentTags: ex.intentTags,
        sportTransferTags: ex.sportTransferTags ?? [],
        jointStressProfile: ex.jointStressProfile,
        tags: ex.tags ?? [],
        clusterId: ex.clusterId,
        easierVariations: ex.easierVariations,
        harderVariations: ex.harderVariations,
        description: ex.description,
        isActive: true,
      })
      .onConflictDoUpdate({
        target: exerciseLibrary.name,
        set: {
          movementPattern: sql`excluded.movement_pattern`,
          bodyRegion: sql`excluded.body_region`,
          role: sql`excluded.role`,
          unilateral: sql`excluded.unilateral`,
          primaryMuscle: sql`excluded.primary_muscle`,
          secondaryMuscles: sql`excluded.secondary_muscles`,
          equipment: sql`excluded.equipment`,
          difficultyLevel: sql`excluded.difficulty_level`,
          neuralDemand: sql`excluded.neural_demand`,
          timeCost: sql`excluded.time_cost`,
          intentTags: sql`excluded.intent_tags`,
          sportTransferTags: sql`excluded.sport_transfer_tags`,
          jointStressProfile: sql`excluded.joint_stress_profile`,
          tags: sql`excluded.tags`,
          clusterId: sql`excluded.cluster_id`,
          easierVariations: sql`excluded.easier_variations`,
          harderVariations: sql`excluded.harder_variations`,
          description: sql`excluded.description`,
          isActive: sql`excluded.is_active`,
        },
      })
      .returning({ id: exerciseLibrary.id });

    if (result.length > 0) {
      inserted++;
    } else {
      updated++;
    }
  }

  logger.info(`[ExerciseSeeder] Done. ${inserted} exercises inserted, ${updated} updated.`);
  return { inserted, updated };
}

export async function seedExerciseLibraryIfEmpty(): Promise<void> {
  try {
    const empty = await isExerciseLibraryEmpty();
    if (empty) {
      logger.info("[ExerciseSeeder] Exercise library is empty — seeding now...");
      const { inserted, updated } = await seedExerciseLibrary();
      logger.info(`[ExerciseSeeder] Auto-seed complete: ${inserted} inserted, ${updated} updated.`);
    } else {
      logger.info("[ExerciseSeeder] Exercise library already populated — skipping auto-seed.");
    }
  } catch (err) {
    logger.error({ err }, "[ExerciseSeeder] Auto-seed failed — swap feature may not work.");
  }
}
