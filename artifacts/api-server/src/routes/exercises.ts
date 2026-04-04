/**
 * Exercise Library API Routes
 *
 * GET  /api/exercises/stats             — library stats (total, by pattern, clusters)
 * GET  /api/exercises/swap/:name        — swap candidates for a specific exercise
 * GET  /api/exercises/progressions/:name — easier/harder variations
 * POST /api/exercises/filter            — query by pattern/equipment/intent/injury
 * GET  /api/exercises/cluster/:clusterId — all exercises in a cluster
 */

import { Router } from "express";
import {
  getSwapCandidates,
  getProgressions,
  getByMovementPattern,
  getLibraryStats,
  getClusterMembers,
  findExerciseByName,
  getAllExercises,
} from "../lib/exercise-service";

export const exercisesRouter = Router();

// ── Library stats ──────────────────────────────────────────────────────────────
exercisesRouter.get("/stats", async (req, res) => {
  try {
    const stats = await getLibraryStats();
    res.json({ success: true, data: stats });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ── All exercises (paginated) ──────────────────────────────────────────────────
exercisesRouter.get("/", async (req, res) => {
  try {
    const exercises = await getAllExercises();
    res.json({ success: true, data: exercises, total: exercises.length });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ── Swap candidates ────────────────────────────────────────────────────────────
exercisesRouter.get("/swap/:name", async (req, res) => {
  try {
    const exerciseName = decodeURIComponent(req.params.name);
    const { equipment = "full_gym", injuries = "" } = req.query as Record<string, string>;
    const injuryFlags = injuries ? injuries.split(",").filter(Boolean) : [];

    const candidates = await getSwapCandidates({
      exerciseName,
      equipmentLevel: equipment,
      injuryFlags,
      maxCount: 8,
    });

    res.json({
      success: true,
      exerciseName,
      swapCount: candidates.length,
      data: candidates,
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ── Progressions / regressions ─────────────────────────────────────────────────
exercisesRouter.get("/progressions/:name", async (req, res) => {
  try {
    const exerciseName = decodeURIComponent(req.params.name);
    const progressions = await getProgressions(exerciseName);
    res.json({ success: true, exerciseName, data: progressions });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ── Cluster members ────────────────────────────────────────────────────────────
exercisesRouter.get("/cluster/:clusterId", async (req, res) => {
  try {
    const clusterId = decodeURIComponent(req.params.clusterId);
    const members = await getClusterMembers(clusterId);
    res.json({ success: true, clusterId, data: members });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ── Lookup single exercise ─────────────────────────────────────────────────────
exercisesRouter.get("/lookup/:name", async (req, res) => {
  try {
    const exerciseName = decodeURIComponent(req.params.name);
    const exercise = await findExerciseByName(exerciseName);
    if (!exercise) {
      return res.status(404).json({ success: false, error: "Exercise not found" });
    }
    res.json({ success: true, data: exercise });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ── Filter / search ────────────────────────────────────────────────────────────
exercisesRouter.post("/filter", async (req, res) => {
  try {
    const {
      patterns = [],
      equipmentLevel = "full_gym",
      injuryFlags = [],
      difficultyMax,
      intentTags = [],
      excludeNames = [],
      maxCount,
    } = req.body;

    if (!Array.isArray(patterns) || patterns.length === 0) {
      return res.status(400).json({ success: false, error: "patterns array is required" });
    }

    const results: Record<string, any[]> = {};
    for (const pattern of patterns) {
      results[pattern] = await getByMovementPattern({
        pattern,
        equipmentLevel,
        injuryFlags,
        difficultyMax,
        intentTags,
        excludeNames,
        maxCount,
      });
    }

    const total = Object.values(results).flat().length;
    res.json({ success: true, total, data: results });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});
