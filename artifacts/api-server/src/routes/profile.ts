import { Router, type IRouter } from "express";
import { db, userProfilesTable, usersTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { CreateProfileBody } from "@workspace/api-zod";
import { requireAuth } from "../middlewares/auth";

const router: IRouter = Router();

router.get("/profile", requireAuth, async (req, res): Promise<void> => {
  const [profile] = await db.select().from(userProfilesTable).where(eq(userProfilesTable.userId, req.session.userId!));
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
    createdAt: profile.createdAt.toISOString(),
    updatedAt: profile.updatedAt.toISOString(),
  });
});

router.post("/profile", requireAuth, async (req, res): Promise<void> => {
  const parsed = CreateProfileBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const userId = req.session.userId!;
  const existing = await db.select().from(userProfilesTable).where(eq(userProfilesTable.userId, userId));

  let profile;
  if (existing.length > 0) {
    const [updated] = await db.update(userProfilesTable)
      .set({ ...parsed.data, userId })
      .where(eq(userProfilesTable.userId, userId))
      .returning();
    profile = updated;
  } else {
    const [created] = await db.insert(userProfilesTable)
      .values({ ...parsed.data, userId })
      .returning();
    profile = created;
  }

  // Mark user onboarding complete
  await db.update(usersTable)
    .set({ onboardingComplete: true })
    .where(eq(usersTable.id, userId));

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
});

export default router;
