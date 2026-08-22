import { Router, type IRouter } from "express";
import { db, userProfilesTable, usersTable, trainingSystems } from "@workspace/db";
import { and, eq } from "drizzle-orm";
import { requireAuth } from "../middlewares/auth";
import { logger } from "../lib/logger";
import {
  DEFAULT_COACH_SETTINGS,
  changedProgramConstraints,
  coachSettingsSchema,
  profileSettingsSchema,
} from "../lib/profile-settings";

const router: IRouter = Router();

router.get("/profile", requireAuth, async (req, res): Promise<void> => {
  const userId = req.session.userId!;
  try {
    const [profile] = await db.select().from(userProfilesTable).where(eq(userProfilesTable.userId, userId));
    if (!profile) {
      res.status(404).json({ error: "Profile not found" });
      return;
    }

    res.json({
      id: profile.id,
      userId: profile.userId,
      trainingGoal: profile.trainingGoal,
      experienceLevel: profile.experienceLevel,
      trainingStyle: profile.trainingStyle,
      daysPerWeek: profile.daysPerWeek,
      sessionDuration: profile.sessionDuration,
      equipmentAccess: profile.equipmentAccess,
      injuries: profile.injuries ?? null,
      sportFocus: profile.sportFocus ?? null,
      exercisePreferences: profile.exercisePreferences ?? null,
      exercisesToAvoid: profile.exercisesToAvoid ?? null,
      yearsTraining: profile.yearsTraining ?? null,
      calibrationScore: profile.calibrationScore ?? 0,
      createdAt: profile.createdAt.toISOString(),
      updatedAt: profile.updatedAt.toISOString(),
    });
  } catch (err) {
    logger.error({ err, userId }, "Failed to fetch profile");
    res.status(500).json({ error: "Failed to load profile. Please try again." });
  }
});

router.post("/profile", requireAuth, async (req, res): Promise<void> => {
  const userId = req.session.userId!;

  logger.info({ userId, body: req.body }, "Onboarding profile save attempt");

  const parsed = profileSettingsSchema.safeParse(req.body);
  if (!parsed.success) {
    const issues = parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ");
    logger.warn({ userId, issues, body: req.body }, "Onboarding validation failed");
    res.status(400).json({ error: `Validation failed: ${issues}` });
    return;
  }

  logger.info({ userId, payload: parsed.data }, "Onboarding payload validated");

  const safeData = {
    trainingGoal: parsed.data.trainingGoal,
    experienceLevel: parsed.data.experienceLevel,
    trainingStyle: parsed.data.trainingStyle,
    daysPerWeek: parsed.data.daysPerWeek,
    sessionDuration: parsed.data.sessionDuration,
    equipmentAccess: parsed.data.equipmentAccess,
    injuries: parsed.data.injuries ?? null,
    sportFocus: parsed.data.sportFocus ?? null,
    exercisePreferences: parsed.data.exercisePreferences ?? null,
    exercisesToAvoid: parsed.data.exercisesToAvoid ?? null,
  };

  try {
    const profile = await db.transaction(async (tx) => {
      const existing = await tx.select().from(userProfilesTable).where(eq(userProfilesTable.userId, userId));
      let savedProfile;
      if (existing.length > 0) {
      // Optional preference fields are also written by calibration. A profile
      // save from Settings does not include them, so only overwrite them when
      // the caller explicitly supplied the field. This preserves calibrated
      // preferences/exclusions while still allowing an explicit null to clear.
      const updateData = {
        ...safeData,
        ...(parsed.data.exercisePreferences !== undefined
          ? { exercisePreferences: parsed.data.exercisePreferences }
          : { exercisePreferences: existing[0].exercisePreferences }),
        ...(parsed.data.exercisesToAvoid !== undefined
          ? { exercisesToAvoid: parsed.data.exercisesToAvoid }
          : { exercisesToAvoid: existing[0].exercisesToAvoid }),
      };
      const [updated] = await tx.update(userProfilesTable)
        .set({ ...updateData, userId })
        .where(eq(userProfilesTable.userId, userId))
        .returning();
        savedProfile = updated;

        const reviewReasons = changedProgramConstraints(existing[0], updated);
        if (reviewReasons.length > 0) {
          await tx.update(trainingSystems)
            .set({ needsReview: true, reviewReasons, markedNeedsReviewAt: new Date() })
            .where(and(eq(trainingSystems.userId, userId), eq(trainingSystems.status, "active")));
        }
      } else {
      const [created] = await tx.insert(userProfilesTable)
        .values({ ...safeData, userId })
        .returning();
        savedProfile = created;
      }

      await tx.update(usersTable)
        .set({ onboardingComplete: true })
        .where(eq(usersTable.id, userId));
      return savedProfile;
    });

    logger.info({ userId, profileId: profile.id }, "Onboarding profile saved successfully");

    res.json({
      id: profile.id,
      userId: profile.userId,
      trainingGoal: profile.trainingGoal,
      experienceLevel: profile.experienceLevel,
      trainingStyle: profile.trainingStyle,
      daysPerWeek: profile.daysPerWeek,
      sessionDuration: profile.sessionDuration,
      equipmentAccess: profile.equipmentAccess,
      injuries: profile.injuries ?? null,
      sportFocus: profile.sportFocus ?? null,
      exercisePreferences: profile.exercisePreferences ?? null,
      exercisesToAvoid: profile.exercisesToAvoid ?? null,
      createdAt: profile.createdAt.toISOString(),
      updatedAt: profile.updatedAt.toISOString(),
    });
  } catch (err) {
    logger.error({ err, userId, payload: safeData }, "Onboarding database save failed");
    const message = err instanceof Error ? err.message : "Unknown database error";
    res.status(500).json({ error: `Failed to save profile: ${message}` });
  }
});

router.get("/profile/coach-settings", requireAuth, async (req, res): Promise<void> => {
  const [user] = await db.select({ coachingSettings: usersTable.coachingSettings })
    .from(usersTable)
    .where(eq(usersTable.id, req.session.userId!));
  if (!user) {
    res.status(404).json({ error: "Account not found" });
    return;
  }
  const parsed = coachSettingsSchema.safeParse(user.coachingSettings);
  res.json(parsed.success ? parsed.data : DEFAULT_COACH_SETTINGS);
});

router.put("/profile/coach-settings", requireAuth, async (req, res): Promise<void> => {
  const parsed = coachSettingsSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid coaching settings", issues: parsed.error.issues });
    return;
  }
  const [user] = await db.update(usersTable)
    .set({ coachingSettings: parsed.data })
    .where(eq(usersTable.id, req.session.userId!))
    .returning({ coachingSettings: usersTable.coachingSettings });
  if (!user) {
    res.status(404).json({ error: "Account not found" });
    return;
  }
  res.json(user.coachingSettings);
});

export default router;
