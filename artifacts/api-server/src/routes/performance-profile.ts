import { Router } from "express";
import { db } from "@workspace/db";
import { performanceProfilesTable } from "@workspace/db";
import { userProfilesTable } from "@workspace/db";
import { eq, and, desc } from "drizzle-orm";
import { logger } from "../lib/logger";
import { buildPerformanceProfile } from "../lib/performance-intelligence/index";
import { buildResearchIntelligenceApiResponse } from "../lib/research-intelligence/index.js";

const router = Router();

// ─── GET /api/performance-profile ────────────────────────────────────────────
// Returns the latest performance profile for the authenticated user.
// If one doesn't exist, generates it on-demand from the user's profile.

router.get("/api/performance-profile", async (req, res): Promise<void> => {
  const userId = (req as any).userId as number | undefined;
  if (!userId) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  const systemIdRaw = req.query.systemId as string | undefined;
  const systemId = systemIdRaw ? parseInt(systemIdRaw, 10) : null;

  try {
    // Try to find an existing stored profile
    const conditions = [eq(performanceProfilesTable.userId, String(userId))];
    if (systemId) {
      conditions.push(eq(performanceProfilesTable.trainingSystemId, systemId));
    }

    const [existing] = await db
      .select()
      .from(performanceProfilesTable)
      .where(and(...conditions))
      .orderBy(desc(performanceProfilesTable.generatedAt))
      .limit(1);

    if (existing) {
      const profile = {
        goal: existing.goal ?? "general_fitness",
        sport: existing.sport ?? null,
        focusMode: existing.focusMode ?? null,
        priorityQualities: existing.priorityQualities ?? [],
        limitingFactors: existing.limitingFactors ?? [],
        recommendedMethods: existing.recommendedMethods ?? [],
        equipmentOpportunities: existing.equipmentOpportunities ?? [],
        recommendedExercisePool: existing.recommendedExercisePool ?? { tier1: [], tier2: [], substitutions: [], progressions: [], regressions: [] },
        riskFactors: existing.riskFactors ?? [],
        expectedAdaptations: existing.expectedAdaptations ?? { primary: [], secondary: [], timeline: "" },
        exerciseRationale: [],
        confidence: 78,
        version: existing.version ?? 1,
      };
      res.json({ profile });
      return;
    }

    // No stored profile — generate one on-demand from user profile
    const [userProfile] = await db
      .select()
      .from(userProfilesTable)
      .where(eq(userProfilesTable.userId, userId))
      .limit(1);

    if (!userProfile) {
      res.json({ profile: null });
      return;
    }

    const generated = buildPerformanceProfile({
      goal: userProfile.trainingGoal ?? "general_fitness",
      sport: userProfile.sportFocus ?? null,
      trainingAge: userProfile.experienceLevel ?? null,
      availableEquipment: userProfile.equipmentAccess ?? null,
      focusMode: null,
      sessionFrequency: userProfile.daysPerWeek ?? null,
    });

    // Persist the generated profile (fire and continue)
    db.insert(performanceProfilesTable).values({
      userId: String(userId),
      trainingSystemId: systemId ?? null,
      goal: generated.goal,
      sport: generated.sport ?? null,
      trainingAge: generated.focusMode ?? null,
      focusMode: generated.focusMode ?? null,
      priorityQualities: generated.priorityQualities as unknown as Record<string, unknown>[],
      limitingFactors: generated.limitingFactors as unknown as Record<string, unknown>[],
      recommendedMethods: generated.recommendedMethods as unknown as Record<string, unknown>[],
      equipmentOpportunities: generated.equipmentOpportunities as unknown as string[],
      recommendedExercisePool: generated.recommendedExercisePool as unknown as Record<string, unknown>,
      riskFactors: generated.riskFactors as unknown as string[],
      expectedAdaptations: generated.expectedAdaptations as unknown as Record<string, unknown>,
      version: 1,
    }).catch((err: unknown) => {
      logger.warn({ err }, "[PerformanceProfile] Failed to persist on-demand profile");
    });

    res.json({ profile: generated });
  } catch (err) {
    logger.error({ err }, "[PerformanceProfile] Failed to fetch/generate performance profile");
    res.status(500).json({ error: "Failed to fetch performance profile" });
  }
});

// ─── POST /api/performance-profile/regenerate ────────────────────────────────
// Forces regeneration of the profile from the current user profile + assessments.

router.post("/api/performance-profile/regenerate", async (req, res): Promise<void> => {
  const userId = (req as any).userId as number | undefined;
  if (!userId) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  const { systemId, assessmentResults, constraints } = req.body ?? {};

  try {
    const [userProfile] = await db
      .select()
      .from(userProfilesTable)
      .where(eq(userProfilesTable.userId, userId))
      .limit(1);

    const generated = buildPerformanceProfile({
      goal: userProfile?.trainingGoal ?? "general_fitness",
      sport: userProfile?.sportFocus ?? null,
      trainingAge: userProfile?.experienceLevel ?? null,
      availableEquipment: userProfile?.equipmentAccess ?? null,
      sessionFrequency: userProfile?.daysPerWeek ?? null,
      assessmentResults: assessmentResults ?? [],
      constraints: constraints ?? [],
      focusMode: req.body.focusMode ?? null,
    });

    // Upsert
    await db.insert(performanceProfilesTable).values({
      userId: String(userId),
      trainingSystemId: systemId ? parseInt(systemId, 10) : null,
      goal: generated.goal,
      sport: generated.sport ?? null,
      focusMode: generated.focusMode ?? null,
      trainingAge: userProfile?.experienceLevel ?? null,
      priorityQualities: generated.priorityQualities as unknown as Record<string, unknown>[],
      limitingFactors: generated.limitingFactors as unknown as Record<string, unknown>[],
      recommendedMethods: generated.recommendedMethods as unknown as Record<string, unknown>[],
      equipmentOpportunities: generated.equipmentOpportunities as unknown as string[],
      recommendedExercisePool: generated.recommendedExercisePool as unknown as Record<string, unknown>,
      riskFactors: generated.riskFactors as unknown as string[],
      expectedAdaptations: generated.expectedAdaptations as unknown as Record<string, unknown>,
      sourceAssessments: (assessmentResults ?? []) as unknown as Record<string, unknown>[],
      version: 1,
    });

    res.json({ profile: generated });
  } catch (err) {
    logger.error({ err }, "[PerformanceProfile] Failed to regenerate performance profile");
    res.status(500).json({ error: "Failed to regenerate performance profile" });
  }
});

export default router;
