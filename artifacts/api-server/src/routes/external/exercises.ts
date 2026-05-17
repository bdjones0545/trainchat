/**
 * External API — Exercise Library Routes
 *
 * GET /api/external/exercises   — list exercises with search/filters/pagination
 */

import { Router } from "express";
import { z } from "zod/v4";
import { validateExternalApiKey } from "../../middlewares/external-api-auth";
import { db, exerciseLibrary } from "@workspace/db";
import { sql, and, ilike, inArray } from "drizzle-orm";
import { logger } from "../../lib/logger";

const router = Router();

// ── Query schema ──────────────────────────────────────────────────────────────

const ExerciseQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  search: z.string().max(100).optional(),
  movementPattern: z.string().optional(),
  equipment: z.string().optional(),
  tags: z.string().optional(),
  bodyRegion: z.string().optional(),
  difficultyLevel: z.enum(["beginner", "intermediate", "advanced", "elite"]).optional(),
});

// ── GET /api/external/exercises ───────────────────────────────────────────────

router.get(
  "/external/exercises",
  validateExternalApiKey(["list_exercises"]),
  async (req, res): Promise<void> => {
    const parsed = ExerciseQuerySchema.safeParse(req.query);
    if (!parsed.success) {
      res.status(400).json({
        success: false,
        error: {
          code: "VALIDATION_ERROR",
          message: "Invalid query parameters.",
          details: parsed.error.issues,
        },
      });
      return;
    }

    const { page, limit, search, movementPattern, equipment, tags, bodyRegion, difficultyLevel } =
      parsed.data;

    const offset = (page - 1) * limit;

    try {
      const conditions: ReturnType<typeof ilike>[] = [];

      if (search) {
        conditions.push(ilike(exerciseLibrary.name, `%${search}%`));
      }
      if (movementPattern) {
        conditions.push(
          sql`${exerciseLibrary.movementPattern} = ${movementPattern}` as ReturnType<typeof ilike>,
        );
      }
      if (bodyRegion) {
        conditions.push(
          sql`${exerciseLibrary.bodyRegion} = ${bodyRegion}` as ReturnType<typeof ilike>,
        );
      }
      if (difficultyLevel) {
        conditions.push(
          sql`${exerciseLibrary.difficultyLevel} = ${difficultyLevel}` as ReturnType<typeof ilike>,
        );
      }
      if (equipment) {
        conditions.push(
          sql`${exerciseLibrary.equipment}::text ilike ${"%" + equipment + "%"}` as ReturnType<
            typeof ilike
          >,
        );
      }
      if (tags) {
        conditions.push(
          sql`${exerciseLibrary.tags}::text ilike ${"%" + tags + "%"}` as ReturnType<typeof ilike>,
        );
      }

      const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

      const [exercises, countResult] = await Promise.all([
        db
          .select({
            id: exerciseLibrary.id,
            name: exerciseLibrary.name,
            movementPattern: exerciseLibrary.movementPattern,
            bodyRegion: exerciseLibrary.bodyRegion,
            role: exerciseLibrary.role,
            unilateral: exerciseLibrary.unilateral,
            primaryMuscle: exerciseLibrary.primaryMuscle,
            secondaryMuscles: exerciseLibrary.secondaryMuscles,
            equipment: exerciseLibrary.equipment,
            difficultyLevel: exerciseLibrary.difficultyLevel,
            neuralDemand: exerciseLibrary.neuralDemand,
            timeCost: exerciseLibrary.timeCost,
            intentTags: exerciseLibrary.intentTags,
            sportTransferTags: exerciseLibrary.sportTransferTags,
            tags: exerciseLibrary.tags,
            description: exerciseLibrary.description,
          })
          .from(exerciseLibrary)
          .where(whereClause)
          .limit(limit)
          .offset(offset),
        db
          .select({ count: sql<number>`count(*)::int` })
          .from(exerciseLibrary)
          .where(whereClause),
      ]);

      const total = countResult[0]?.count ?? 0;
      const totalPages = Math.ceil(total / limit);

      res.json({
        success: true,
        data: exercises,
        meta: {
          page,
          limit,
          total,
          totalPages,
          hasMore: page < totalPages,
        },
        error: null,
      });
    } catch (err) {
      logger.error({ err }, "external-exercises: list failed");
      res.status(500).json({
        success: false,
        error: { code: "INTERNAL_ERROR", message: "Failed to fetch exercises." },
        data: null,
        meta: null,
      });
    }
  },
);

export default router;
