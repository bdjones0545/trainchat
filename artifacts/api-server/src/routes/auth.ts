import { Router, type IRouter } from "express";
import bcrypt from "bcryptjs";
import { db, usersTable, userProfilesTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { RegisterBody, LoginBody } from "@workspace/api-zod";
import { requireAuth } from "../middlewares/auth";
import { logger } from "../lib/logger";

const router: IRouter = Router();

/**
 * Checks whether a user has a profile with all required fields populated.
 * Used to self-heal the onboardingComplete flag for users who completed
 * onboarding before the flag was reliably set (e.g. direct DB inserts,
 * failed saves, or pre-flag migrations).
 */
async function hasCompletedProfile(userId: number): Promise<boolean> {
  const [profile] = await db
    .select()
    .from(userProfilesTable)
    .where(eq(userProfilesTable.userId, userId));

  if (!profile) return false;

  return (
    !!profile.trainingGoal &&
    !!profile.experienceLevel &&
    !!profile.trainingStyle &&
    profile.daysPerWeek > 0 &&
    profile.sessionDuration > 0 &&
    !!profile.equipmentAccess
  );
}

/**
 * If the onboardingComplete flag is out of sync with the actual profile state,
 * update it and return the corrected value. This runs on login and /me so that
 * returning users are never bounced back to onboarding incorrectly.
 */
async function resolveOnboardingComplete(
  userId: number,
  currentFlag: boolean,
): Promise<boolean> {
  if (currentFlag) return true;

  const profileComplete = await hasCompletedProfile(userId);
  if (!profileComplete) return false;

  await db
    .update(usersTable)
    .set({ onboardingComplete: true })
    .where(eq(usersTable.id, userId));

  logger.info(
    { userId },
    "auth: onboardingComplete self-healed — user has a complete profile",
  );

  return true;
}

router.post("/auth/register", async (req, res): Promise<void> => {
  const parsed = RegisterBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const { email, password, name } = parsed.data;

  const existing = await db
    .select()
    .from(usersTable)
    .where(eq(usersTable.email, email.toLowerCase()));
  if (existing.length > 0) {
    res.status(409).json({ error: "Email already in use" });
    return;
  }

  const passwordHash = await bcrypt.hash(password, 12);

  const [user] = await db
    .insert(usersTable)
    .values({
      email: email.toLowerCase(),
      passwordHash,
      name,
      onboardingComplete: false,
    })
    .returning();

  req.session.userId = user.id;

  logger.info(
    { userId: user.id },
    "auth: new user registered — routing to onboarding",
  );

  res.status(201).json({
    user: {
      id: user.id,
      email: user.email,
      name: user.name,
      createdAt: user.createdAt.toISOString(),
      onboardingComplete: false,
    },
  });
});

router.post("/auth/login", async (req, res): Promise<void> => {
  const parsed = LoginBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const { email, password } = parsed.data;

  const [user] = await db
    .select()
    .from(usersTable)
    .where(eq(usersTable.email, email.toLowerCase()));
  if (!user) {
    res.status(401).json({ error: "Invalid credentials" });
    return;
  }

  const valid = await bcrypt.compare(password, user.passwordHash);
  if (!valid) {
    res.status(401).json({ error: "Invalid credentials" });
    return;
  }

  req.session.userId = user.id;

  const onboardingComplete = await resolveOnboardingComplete(
    user.id,
    user.onboardingComplete,
  );

  logger.info(
    { userId: user.id, onboardingComplete },
    onboardingComplete
      ? "auth: login — routing to chat (onboarding complete)"
      : "auth: login — routing to onboarding (no complete profile found)",
  );

  res.json({
    user: {
      id: user.id,
      email: user.email,
      name: user.name,
      createdAt: user.createdAt.toISOString(),
      onboardingComplete,
    },
  });
});

router.post("/auth/logout", (req, res): void => {
  req.session.destroy(() => {
    res.json({ success: true });
  });
});

router.get("/auth/me", requireAuth, async (req, res): Promise<void> => {
  const [user] = await db
    .select()
    .from(usersTable)
    .where(eq(usersTable.id, req.session.userId!));
  if (!user) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  const onboardingComplete = await resolveOnboardingComplete(
    user.id,
    user.onboardingComplete,
  );

  if (process.env.NODE_ENV !== "production") {
    logger.info(
      { userId: user.id, onboardingComplete },
      onboardingComplete
        ? "auth/me: routing to chat (onboarding complete or profile found)"
        : "auth/me: routing to onboarding (no complete profile)",
    );
  }

  res.json({
    id: user.id,
    email: user.email,
    name: user.name,
    createdAt: user.createdAt.toISOString(),
    onboardingComplete,
  });
});

export default router;
