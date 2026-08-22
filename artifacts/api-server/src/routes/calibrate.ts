/**
 * POST /api/calibrate
 *
 * Receives calibration + behavioral data, updates the user profile,
 * calculates multi-dimensional Coaching Precision, builds Athlete DNA,
 * writes AI memories, and returns a rich coaching intelligence response.
 */

import { Router, type IRouter } from "express";
import { db, userProfilesTable, userMemoriesTable, trainingSystems } from "@workspace/db";
import { and, eq } from "drizzle-orm";
import { requireAuth } from "../middlewares/auth";
import { upsertMemory } from "../lib/memory";
import { logger } from "../lib/logger";
import { calibrationProfileFieldsSchema, changedProgramConstraints } from "../lib/profile-settings";
import {
  calculateCoachingPrecision,
  buildAthleteDNA,
  buildAtlasLearnedSummary,
  type AthleteDNA,
  type PrecisionDimensions,
  type AthleteLearnedSummary,
} from "../lib/athlete-dna";

const router: IRouter = Router();

// ─── Types ────────────────────────────────────────────────────────────────────

interface CalibrationPayload {
  // Existing fields
  experienceLevel?: string;
  yearsTraining?: number;
  primaryGoal?: string;
  injuries?: string;
  equipmentAccess?: string;
  daysPerWeek?: number;
  sessionDuration?: number;
  sportFocus?: string;
  exercisesToAvoid?: string;
  // Behavioral profile (T005)
  scheduleConsistency?: string;
  recoveryConsistency?: string;
  coachingStylePreference?: string;
  autoregulationComfort?: string;
  motivationStyle?: string;
  confidenceUnderFatigue?: string;
  trainingAggression?: string;
  exerciseConfidence?: string;
}

// ─── Legacy coaching reply (kept for backward compatibility) ──────────────────

function buildLegacyCoachReply(data: CalibrationPayload, score: number): string {
  const parts: string[] = [];
  if (data.experienceLevel) parts.push(`your ${data.experienceLevel} training background`);
  if (data.equipmentAccess) parts.push(`${data.equipmentAccess} access`);
  if (data.injuries) parts.push(`your ${data.injuries} limitation`);
  if (data.daysPerWeek) parts.push(`${data.daysPerWeek}-day schedule`);

  const detail =
    parts.length > 0 ? `I've locked in ${parts.join(", ")}.` : "I've updated your training profile.";

  const tier = score >= 70 ? "high" : score >= 40 ? "medium" : "baseline";
  const tierMsg =
    tier === "high"
      ? "Coaching precision is high — Atlas has everything needed to build precisely around you."
      : tier === "medium"
        ? "Coaching precision is solid. Add more detail anytime to sharpen things further."
        : "I've got the basics. The more you share, the more individualized your coaching becomes.";

  return `${detail} ${tierMsg}${
    data.primaryGoal
      ? ` I'm optimizing around ${data.primaryGoal.toLowerCase().replace(/_/g, " ")} as your primary driver.`
      : ""
  }`;
}

// ─── Precision history entry ──────────────────────────────────────────────────

interface PrecisionHistoryEntry {
  score: number;
  dimensions: PrecisionDimensions;
  tier: string;
  generatedAt: string;
  trigger: "calibration" | "check_in" | "adherence_update";
}

// ─── Route ────────────────────────────────────────────────────────────────────

router.post("/calibrate", requireAuth, async (req, res): Promise<void> => {
  const userId = req.session.userId!;
  const data: CalibrationPayload = req.body ?? {};
  const profileFields = calibrationProfileFieldsSchema.safeParse({
    ...(data.experienceLevel !== undefined ? { experienceLevel: data.experienceLevel } : {}),
    ...(data.primaryGoal !== undefined ? { primaryGoal: data.primaryGoal } : {}),
    ...(data.injuries !== undefined ? { injuries: data.injuries } : {}),
    ...(data.equipmentAccess !== undefined ? { equipmentAccess: data.equipmentAccess } : {}),
    ...(data.daysPerWeek !== undefined ? { daysPerWeek: data.daysPerWeek } : {}),
    ...(data.sessionDuration !== undefined ? { sessionDuration: data.sessionDuration } : {}),
    ...(data.sportFocus !== undefined ? { sportFocus: data.sportFocus } : {}),
    ...(data.exercisesToAvoid !== undefined ? { exercisesToAvoid: data.exercisesToAvoid } : {}),
  });
  if (!profileFields.success) {
    res.status(400).json({
      error: "Validation failed",
      issues: profileFields.error.issues.map((issue) => ({
        field: issue.path.join("."),
        message: issue.message,
      })),
    });
    return;
  }

  try {
    // ── Coaching Precision (6-dimensional) ──────────────────────────────────
    const precision = calculateCoachingPrecision({
      ...data,
      trainingGoal: data.primaryGoal,
    });

    // ── Athlete DNA synthesis ────────────────────────────────────────────────
    const dna: AthleteDNA = buildAthleteDNA({
      ...data,
      trainingGoal: data.primaryGoal,
    });

    // ── "What Atlas Learned" summary ─────────────────────────────────────────
    const learned: AthleteLearnedSummary = buildAtlasLearnedSummary({
      ...data,
      trainingGoal: data.primaryGoal,
    });

    // ── Build profile update payload ─────────────────────────────────────────
    const updatePayload: Record<string, unknown> = {
      coachingPrecisionScore: precision.score,
      calibrationScore: precision.score, // keep legacy field in sync
      athleteDNA: dna,
      updatedAt: new Date(),
    };

    if (profileFields.data.experienceLevel) updatePayload.experienceLevel = profileFields.data.experienceLevel;
    if (data.yearsTraining != null) updatePayload.yearsTraining = data.yearsTraining;
    if (profileFields.data.primaryGoal) updatePayload.trainingGoal = profileFields.data.primaryGoal;
    if (profileFields.data.injuries !== undefined) updatePayload.injuries = profileFields.data.injuries;
    if (profileFields.data.equipmentAccess) updatePayload.equipmentAccess = profileFields.data.equipmentAccess;
    if (profileFields.data.daysPerWeek != null) updatePayload.daysPerWeek = profileFields.data.daysPerWeek;
    if (profileFields.data.sessionDuration != null) updatePayload.sessionDuration = profileFields.data.sessionDuration;
    if (profileFields.data.sportFocus !== undefined) updatePayload.sportFocus = profileFields.data.sportFocus;
    if (profileFields.data.exercisesToAvoid !== undefined) updatePayload.exercisesToAvoid = profileFields.data.exercisesToAvoid;

    // Behavioral fields (T005)
    if (data.scheduleConsistency) updatePayload.scheduleConsistency = data.scheduleConsistency;
    if (data.recoveryConsistency) updatePayload.recoveryConsistency = data.recoveryConsistency;
    if (data.coachingStylePreference) updatePayload.coachingStylePreference = data.coachingStylePreference;
    if (data.autoregulationComfort) updatePayload.autoregulationComfort = data.autoregulationComfort;
    if (data.motivationStyle) updatePayload.motivationStyle = data.motivationStyle;
    if (data.confidenceUnderFatigue) updatePayload.confidenceUnderFatigue = data.confidenceUnderFatigue;
    if (data.trainingAggression) updatePayload.trainingAggression = data.trainingAggression;
    if (data.exerciseConfidence) updatePayload.exerciseConfidence = data.exerciseConfidence;

    // ── Upsert profile ───────────────────────────────────────────────────────
    const existing = await db
      .select()
      .from(userProfilesTable)
      .where(eq(userProfilesTable.userId, userId));

    // Build precision history (append new entry, keep last 20)
    const existingHistory = (existing[0]?.coachingPrecisionHistory as PrecisionHistoryEntry[] | null) ?? [];
    const newHistoryEntry: PrecisionHistoryEntry = {
      score: precision.score,
      dimensions: precision.dimensions,
      tier: precision.tier,
      generatedAt: new Date().toISOString(),
      trigger: "calibration",
    };
    const updatedHistory = [...existingHistory.slice(-19), newHistoryEntry];
    updatePayload.coachingPrecisionHistory = updatedHistory;

    if (existing.length > 0) {
      await db.transaction(async (tx) => {
        const [updated] = await tx
          .update(userProfilesTable)
          .set(updatePayload as any)
          .where(eq(userProfilesTable.userId, userId))
          .returning();
        const reviewReasons = changedProgramConstraints(existing[0], updated);
        if (reviewReasons.length > 0) {
          await tx
            .update(trainingSystems)
            .set({ needsReview: true, reviewReasons, markedNeedsReviewAt: new Date() })
            .where(and(eq(trainingSystems.userId, userId), eq(trainingSystems.status, "active")));
        }
      });
    } else {
      await db.insert(userProfilesTable).values({
        userId,
        trainingGoal: profileFields.data.primaryGoal ?? "general_fitness",
        experienceLevel: profileFields.data.experienceLevel ?? "intermediate",
        trainingStyle: "general_strength",
        daysPerWeek: profileFields.data.daysPerWeek ?? 4,
        sessionDuration: profileFields.data.sessionDuration ?? 60,
        equipmentAccess: profileFields.data.equipmentAccess ?? "full gym",
        injuries: profileFields.data.injuries ?? null,
        sportFocus: profileFields.data.sportFocus ?? null,
        exercisesToAvoid: profileFields.data.exercisesToAvoid ?? null,
        yearsTraining: data.yearsTraining ?? null,
        calibrationScore: precision.score,
        coachingPrecisionScore: precision.score,
        athleteDNA: dna as any,
        coachingPrecisionHistory: [newHistoryEntry] as any,
        scheduleConsistency: data.scheduleConsistency ?? null,
        recoveryConsistency: data.recoveryConsistency ?? null,
        coachingStylePreference: data.coachingStylePreference ?? null,
        autoregulationComfort: data.autoregulationComfort ?? null,
        motivationStyle: data.motivationStyle ?? null,
        confidenceUnderFatigue: data.confidenceUnderFatigue ?? null,
        trainingAggression: data.trainingAggression ?? null,
        exerciseConfidence: data.exerciseConfidence ?? null,
      });
    }

    // ── Write AI memories ────────────────────────────────────────────────────
    const memoryPromises: Promise<void>[] = [];

    if (data.experienceLevel) {
      memoryPromises.push(
        upsertMemory(userId, {
          type: "volume_response",
          subject: "experience_level",
          sentiment: "neutral",
          confidence: 5,
          source: "onboarding",
          detail: `User identified as ${data.experienceLevel}${
            data.yearsTraining != null
              ? ` with ${data.yearsTraining} year${data.yearsTraining === 1 ? "" : "s"} of training experience`
              : ""
          }.`,
        }),
      );
    }

    if (data.injuries) {
      memoryPromises.push(
        upsertMemory(userId, {
          type: "pain_pattern",
          subject: "reported_limitation",
          sentiment: "negative",
          confidence: 5,
          source: "onboarding",
          detail: `User reported injury/limitation: ${data.injuries}. Must be respected in all program design.`,
        }),
      );
    }

    if (data.equipmentAccess) {
      memoryPromises.push(
        upsertMemory(userId, {
          type: "exercise_preference",
          subject: "equipment_access",
          sentiment: "neutral",
          confidence: 5,
          source: "onboarding",
          detail: `Equipment access: ${data.equipmentAccess}. Only program exercises appropriate for this setup.`,
        }),
      );
    }

    if (data.daysPerWeek) {
      memoryPromises.push(
        upsertMemory(userId, {
          type: "split_preference",
          subject: "training_frequency",
          sentiment: "neutral",
          confidence: 5,
          source: "onboarding",
          detail: `User trains ${data.daysPerWeek} days per week${
            data.sessionDuration ? `, ${data.sessionDuration} minutes per session` : ""
          }.`,
        }),
      );
    }

    if (data.primaryGoal) {
      memoryPromises.push(
        upsertMemory(userId, {
          type: "split_preference",
          subject: "primary_goal",
          sentiment: "positive",
          confidence: 5,
          source: "onboarding",
          detail: `Primary training goal: ${data.primaryGoal}. All programming decisions should support this goal.`,
        }),
      );
    }

    if (data.sportFocus) {
      const sport = data.sportFocus.trim();
      memoryPromises.push(
        upsertMemory(userId, {
          type: "sport_context",
          subject: sport.toLowerCase().replace(/\s+/g, "_"),
          sentiment: "neutral",
          confidence: 5,
          source: "onboarding",
          detail: `User's sport focus: ${sport}. Programs should bias toward ${sport}-relevant movement qualities, transfer patterns, and athletic demands.`,
        }),
      );
    }

    if (data.exercisesToAvoid) {
      const exclusions = data.exercisesToAvoid
        .split(/,|;|\n/)
        .map((s) => s.trim())
        .filter(Boolean);
      for (const exercise of exclusions) {
        memoryPromises.push(
          upsertMemory(userId, {
            type: "exercise_exclusion",
            subject: exercise.toLowerCase().replace(/\s+/g, "_"),
            sentiment: "negative",
            confidence: 5,
            source: "onboarding",
            detail: `User explicitly excluded "${exercise}" during profile setup. NEVER include this exercise in any program, swap, or progression suggestion.`,
          }),
        );
      }
    }

    // Behavioral signals written as memories for Atlas context
    if (data.scheduleConsistency) {
      memoryPromises.push(
        upsertMemory(userId, {
          type: "split_preference",
          subject: "schedule_consistency",
          sentiment: "neutral",
          confidence: 4,
          source: "onboarding",
          detail: `Schedule consistency: ${data.scheduleConsistency}. ${
            data.scheduleConsistency.toLowerCase().includes("variable") ||
            data.scheduleConsistency.toLowerCase().includes("unpredictable")
              ? "Build autoregulation and flexible deload windows into program structure."
              : "Athlete follows a reliable training schedule — progressive overload can be applied systematically."
          }`,
        }),
      );
    }

    if (data.trainingAggression) {
      memoryPromises.push(
        upsertMemory(userId, {
          type: "volume_response",
          subject: "training_aggression",
          sentiment: "neutral",
          confidence: 4,
          source: "onboarding",
          detail: `Training aggression: ${data.trainingAggression}. ${
            data.trainingAggression.toLowerCase().includes("all-out") ||
            data.trainingAggression.toLowerCase().includes("aggressive")
              ? "Athlete trains at high intensities — monitor fatigue accumulation and include regular deload phases."
              : "Athlete trains at controlled intensities — standard periodization applies."
          }`,
        }),
      );
    }

    await Promise.all(memoryPromises);

    const coachReply = buildLegacyCoachReply(data, precision.score);

    logger.info(
      { userId, score: precision.score, tier: precision.tier, dimensions: precision.dimensions },
      "[Calibrate] Coaching precision calculated and saved",
    );

    res.json({
      success: true,
      calibrationScore: precision.score,
      coachingPrecisionScore: precision.score,
      precisionTier: precision.tier,
      precisionTierLabel: precision.tierLabel,
      precisionTierDescription: precision.tierDescription,
      precisionDimensions: precision.dimensions,
      coachReply,
      learned,
      dna,
    });
  } catch (err) {
    logger.error({ err, userId }, "[Calibrate] Calibration failed");
    res.status(500).json({ error: "Failed to save calibration. Please try again." });
  }
});

export default router;
