/**
 * POST /api/calibrate
 *
 * Receives calibration data, updates the user profile, calculates a
 * calibration score, writes AI memories, and returns a coaching reply.
 */

import { Router, type IRouter } from "express";
import { db, userProfilesTable, userMemoriesTable } from "@workspace/db";
import { eq, and } from "drizzle-orm";
import { requireAuth } from "../middlewares/auth";
import { upsertMemory } from "../lib/memory";
import { logger } from "../lib/logger";

const router: IRouter = Router();

// ─── Calibration scoring weights ──────────────────────────────────────────────
function computeCalibrationScore(data: CalibrationData): number {
  let score = 0;

  // Experience (15 pts max)
  if (data.experienceLevel) score += 10;
  if (data.yearsTraining != null && data.yearsTraining >= 0) score += 5;

  // Goal (15 pts)
  if (data.primaryGoal) score += 15;

  // Injuries (20 pts — high weight because it shapes what we build)
  if (data.injuries !== undefined) score += 20;

  // Equipment (15 pts)
  if (data.equipmentAccess) score += 15;

  // Time constraints (20 pts)
  if (data.daysPerWeek != null) score += 10;
  if (data.sessionDuration != null) score += 10;

  // Optional extras (15 pts)
  if (data.sportFocus) score += 8;
  if (data.exercisesToAvoid) score += 7;

  return Math.min(100, score);
}

// ─── Build coaching reply ──────────────────────────────────────────────────────
function buildCoachingReply(data: CalibrationData, score: number): string {
  const parts: string[] = [];

  if (data.experienceLevel) parts.push(`your ${data.experienceLevel} training background`);
  if (data.equipmentAccess) parts.push(`${data.equipmentAccess} access`);
  if (data.injuries) parts.push(`your ${data.injuries} limitation`);
  if (data.daysPerWeek) parts.push(`${data.daysPerWeek}-day schedule`);

  const detail = parts.length > 0
    ? `I've locked in ${parts.join(", ")}.`
    : "I've updated your training profile.";

  const tier =
    score >= 70 ? "high" :
    score >= 40 ? "medium" :
    "baseline";

  const tierMsg =
    tier === "high" ? "Plan precision is high — I have everything I need to build precisely around you." :
    tier === "medium" ? "Plan precision is solid. Add more detail anytime to sharpen things further." :
    "I've got the basics. The more you share, the more dialed in your programs will be.";

  return `${detail} ${tierMsg}${
    data.primaryGoal ? ` I'm optimizing around ${data.primaryGoal.toLowerCase().replace(/_/g, " ")} as your primary driver.` : ""
  }`;
}

// ─── Types ────────────────────────────────────────────────────────────────────
interface CalibrationData {
  experienceLevel?: string;
  yearsTraining?: number;
  primaryGoal?: string;
  injuries?: string;
  equipmentAccess?: string;
  daysPerWeek?: number;
  sessionDuration?: number;
  sportFocus?: string;
  exercisesToAvoid?: string;
}

// ─── Route ────────────────────────────────────────────────────────────────────
router.post("/calibrate", requireAuth, async (req, res): Promise<void> => {
  const userId = req.session.userId!;
  const data: CalibrationData = req.body ?? {};

  try {
    const score = computeCalibrationScore(data);

    // Build update payload — only update fields that were provided
    const updatePayload: Record<string, unknown> = {
      calibrationScore: score,
      updatedAt: new Date(),
    };
    if (data.experienceLevel) updatePayload.experienceLevel = data.experienceLevel;
    if (data.yearsTraining != null) updatePayload.yearsTraining = data.yearsTraining;
    if (data.primaryGoal) updatePayload.trainingGoal = data.primaryGoal;
    if (data.injuries !== undefined) updatePayload.injuries = data.injuries;
    if (data.equipmentAccess) updatePayload.equipmentAccess = data.equipmentAccess;
    if (data.daysPerWeek != null) updatePayload.daysPerWeek = data.daysPerWeek;
    if (data.sessionDuration != null) updatePayload.sessionDuration = data.sessionDuration;
    if (data.sportFocus) updatePayload.sportFocus = data.sportFocus;
    if (data.exercisesToAvoid) updatePayload.exercisesToAvoid = data.exercisesToAvoid;

    // Upsert profile
    const existing = await db
      .select({ id: userProfilesTable.id })
      .from(userProfilesTable)
      .where(eq(userProfilesTable.userId, userId));

    if (existing.length > 0) {
      await db
        .update(userProfilesTable)
        .set(updatePayload as any)
        .where(eq(userProfilesTable.userId, userId));
    } else {
      // Create a minimal profile with defaults for required fields
      await db.insert(userProfilesTable).values({
        userId,
        trainingGoal: (data.primaryGoal as any) ?? "General Fitness",
        experienceLevel: data.experienceLevel ?? "intermediate",
        trainingStyle: "strength",
        daysPerWeek: data.daysPerWeek ?? 4,
        sessionDuration: data.sessionDuration ?? 60,
        equipmentAccess: data.equipmentAccess ?? "full gym",
        injuries: data.injuries ?? null,
        sportFocus: data.sportFocus ?? null,
        exercisesToAvoid: data.exercisesToAvoid ?? null,
        yearsTraining: data.yearsTraining ?? null,
        calibrationScore: score,
      });
    }

    // Write AI memories for key calibration inputs
    const memoryPromises: Promise<void>[] = [];

    if (data.experienceLevel) {
      memoryPromises.push(upsertMemory(userId, {
        type: "volume_response",
        subject: "experience_level",
        sentiment: "neutral",
        confidence: 5,
        source: "onboarding",
        detail: `User identified as ${data.experienceLevel}${data.yearsTraining != null ? ` with ${data.yearsTraining} years of training experience` : ""}.`,
      }));
    }

    if (data.injuries) {
      memoryPromises.push(upsertMemory(userId, {
        type: "pain_pattern",
        subject: "reported_limitation",
        sentiment: "negative",
        confidence: 5,
        source: "onboarding",
        detail: `User reported injury/limitation: ${data.injuries}. Must be respected in all program design.`,
      }));
    }

    if (data.equipmentAccess) {
      memoryPromises.push(upsertMemory(userId, {
        type: "exercise_preference",
        subject: "equipment_access",
        sentiment: "neutral",
        confidence: 5,
        source: "onboarding",
        detail: `Equipment access: ${data.equipmentAccess}. Only program exercises appropriate for this setup.`,
      }));
    }

    if (data.daysPerWeek) {
      memoryPromises.push(upsertMemory(userId, {
        type: "split_preference",
        subject: "training_frequency",
        sentiment: "neutral",
        confidence: 5,
        source: "onboarding",
        detail: `User trains ${data.daysPerWeek} days per week${data.sessionDuration ? `, ${data.sessionDuration} minutes per session` : ""}.`,
      }));
    }

    if (data.primaryGoal) {
      memoryPromises.push(upsertMemory(userId, {
        type: "split_preference",
        subject: "primary_goal",
        sentiment: "positive",
        confidence: 5,
        source: "onboarding",
        detail: `Primary training goal: ${data.primaryGoal}. All programming decisions should support this goal.`,
      }));
    }

    await Promise.all(memoryPromises);

    const coachReply = buildCoachingReply(data, score);

    logger.info({ userId, score, data }, "Calibration saved successfully");

    res.json({
      success: true,
      calibrationScore: score,
      coachReply,
    });
  } catch (err) {
    logger.error({ err, userId }, "Calibration failed");
    res.status(500).json({ error: "Failed to save calibration. Please try again." });
  }
});

export default router;
