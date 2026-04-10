import { Router, type IRouter } from "express";
import { db, userProfilesTable, usersTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { CreateProfileBody } from "@workspace/api-zod";
import { requireAuth } from "../middlewares/auth";
import { logger } from "../lib/logger";

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

  const parsed = CreateProfileBody.safeParse(req.body);
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
    const existing = await db.select().from(userProfilesTable).where(eq(userProfilesTable.userId, userId));

    let profile;
    if (existing.length > 0) {
      const [updated] = await db.update(userProfilesTable)
        .set({ ...safeData, userId })
        .where(eq(userProfilesTable.userId, userId))
        .returning();
      profile = updated;
    } else {
      const [created] = await db.insert(userProfilesTable)
        .values({ ...safeData, userId })
        .returning();
      profile = created;
    }

    await db.update(usersTable)
      .set({ onboardingComplete: true })
      .where(eq(usersTable.id, userId));

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

export default router;
