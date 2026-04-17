import { Router, type IRouter } from "express";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { db, usersTable, userProfilesTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { RegisterBody, LoginBody } from "@workspace/api-zod";
import { requireAuth } from "../middlewares/auth";
import { logger } from "../lib/logger";
import { mergeAnonymousToRegistered } from "../lib/anonymousMerge";
import { getUncachableStripeClient } from "../lib/stripeClient";

const router: IRouter = Router();

// ─── Zod schemas ──────────────────────────────────────────────────────────────

const BootstrapBody = z.object({
  deviceId: z.string().min(8).max(256),
});

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Shape returned by /auth/me, /auth/login, /auth/register, /auth/bootstrap.
 * isAnonymous tells the frontend whether to show the upgrade paywall path.
 */
function toPublicUser(user: {
  id: number;
  email: string | null;
  name: string | null;
  createdAt: Date;
  onboardingComplete: boolean;
  isAnonymous: boolean;
}) {
  return {
    id: user.id,
    email: user.email ?? null,
    name: user.name ?? "Anonymous",
    createdAt: user.createdAt.toISOString(),
    onboardingComplete: user.onboardingComplete,
    isAnonymous: user.isAnonymous,
  };
}

/**
 * Checks whether a user has a profile with all required fields populated.
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
 * update it and return the corrected value.
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

  logger.info({ userId }, "auth: onboardingComplete self-healed — user has a complete profile");

  return true;
}

// ─── Routes ───────────────────────────────────────────────────────────────────

/**
 * POST /api/auth/bootstrap
 *
 * Device-ID anonymous auth. Called on every app load before the user has signed in.
 *
 * - If the request already has a valid session, return the existing user immediately.
 * - Otherwise, find or create an anonymous user for this deviceId and establish a session.
 *
 * This replaces the old guest-session teaser architecture. Every visitor gets a
 * real user record and a real session so they can use the full TrainChat product.
 */
router.post("/auth/bootstrap", async (req, res): Promise<void> => {
  // If there's already an active session, return that user immediately (idempotent)
  if (req.session.userId) {
    const [existing] = await db
      .select()
      .from(usersTable)
      .where(eq(usersTable.id, req.session.userId));
    if (existing) {
      res.json({ user: toPublicUser(existing) });
      return;
    }
    // Session points to a deleted user — clear it and fall through
    req.session.destroy(() => {});
  }

  const parsed = BootstrapBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid deviceId" });
    return;
  }

  const { deviceId } = parsed.data;

  try {
    // Find existing anonymous user for this device
    let [user] = await db
      .select()
      .from(usersTable)
      .where(eq(usersTable.deviceId, deviceId));

    if (!user) {
      // Create a new anonymous user — real row, real session, real product
      [user] = await db
        .insert(usersTable)
        .values({
          deviceId,
          isAnonymous: true,
          email: null,
          passwordHash: null,
          name: null,
          onboardingComplete: true, // Agent handles onboarding inline
        })
        .returning();

      logger.info({ userId: user.id, deviceId }, "auth/bootstrap: anonymous user created");
    } else {
      logger.info({ userId: user.id, deviceId }, "auth/bootstrap: anonymous user resumed");
    }

    req.session.userId = user.id;
    await new Promise<void>((resolve, reject) =>
      req.session.save((err) => (err ? reject(err) : resolve())),
    );

    res.json({ user: toPublicUser(user) });
  } catch (err: any) {
    logger.error({ err, deviceId }, "auth/bootstrap: failed");
    res.status(500).json({ error: "Bootstrap failed" });
  }
});

/**
 * POST /api/auth/register
 *
 * Register a new account. If the request includes a deviceId that matches an
 * anonymous user, upgrades that anonymous user in-place (no data loss).
 * If deviceId matches a non-anonymous user, creates a fresh account.
 */
router.post("/auth/register", async (req, res): Promise<void> => {
  const parsed = RegisterBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const { email, password, name } = parsed.data;
  // deviceId is not in the RegisterBody schema — read directly from body
  const deviceId: string | undefined =
    typeof req.body.deviceId === "string" ? req.body.deviceId : undefined;

  // Check that email isn't already taken by a registered (non-anonymous) user
  const [emailConflict] = await db
    .select()
    .from(usersTable)
    .where(eq(usersTable.email, email.toLowerCase()));

  if (emailConflict && !emailConflict.isAnonymous) {
    res.status(409).json({ error: "Email already in use" });
    return;
  }

  const passwordHash = await bcrypt.hash(password, 12);

  try {
    let user;

    // Try to find and upgrade the anonymous user from this device
    if (deviceId) {
      const [anonUser] = await db
        .select()
        .from(usersTable)
        .where(eq(usersTable.deviceId, deviceId));

      if (anonUser?.isAnonymous) {
        // Upgrade in-place: attach credentials to the same user row.
        // All their conversations and training systems stay intact — no rebuild.
        [user] = await db
          .update(usersTable)
          .set({
            email: email.toLowerCase(),
            passwordHash,
            name,
            isAnonymous: false,
            onboardingComplete: true,
          })
          .where(eq(usersTable.id, anonUser.id))
          .returning();

        logger.info(
          { userId: user.id, deviceId },
          "auth/register: anonymous user upgraded to registered account",
        );
      }
    }

    if (!user) {
      // No anonymous user to upgrade — create a new account
      [user] = await db
        .insert(usersTable)
        .values({
          email: email.toLowerCase(),
          passwordHash,
          name,
          onboardingComplete: true,
        })
        .returning();

      logger.info({ userId: user.id }, "auth/register: new registered account created");
    }

    req.session.userId = user.id;
    await new Promise<void>((resolve, reject) =>
      req.session.save((err) => (err ? reject(err) : resolve())),
    );

    res.status(201).json({ user: toPublicUser(user) });
  } catch (err: any) {
    logger.error({ err, email }, "auth/register: failed");
    res.status(500).json({ error: "Registration failed" });
  }
});

/**
 * POST /api/auth/login
 *
 * Standard credential login. If the request includes a deviceId that matches
 * an anonymous user with data, merges that data into the authenticated account.
 */
router.post("/auth/login", async (req, res): Promise<void> => {
  const parsed = LoginBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const { email, password } = parsed.data;
  const deviceId: string | undefined =
    typeof req.body.deviceId === "string" ? req.body.deviceId : undefined;

  const [user] = await db
    .select()
    .from(usersTable)
    .where(eq(usersTable.email, email.toLowerCase()));

  if (!user) {
    res.status(401).json({ error: "Invalid credentials" });
    return;
  }

  // Anonymous users have no password — they can't log in via email/password
  if (user.isAnonymous || !user.passwordHash) {
    res.status(401).json({ error: "Invalid credentials" });
    return;
  }

  const valid = await bcrypt.compare(password, user.passwordHash);
  if (!valid) {
    res.status(401).json({ error: "Invalid credentials" });
    return;
  }

  req.session.userId = user.id;
  await new Promise<void>((resolve, reject) =>
    req.session.save((err) => (err ? reject(err) : resolve())),
  );

  const onboardingComplete = await resolveOnboardingComplete(user.id, user.onboardingComplete);

  // Merge any anonymous user data from this device into the logged-in account
  if (deviceId) {
    const [anonUser] = await db
      .select()
      .from(usersTable)
      .where(eq(usersTable.deviceId, deviceId));

    if (anonUser?.isAnonymous && anonUser.id !== user.id) {
      mergeAnonymousToRegistered(anonUser.id, user.id).catch((err) =>
        logger.error({ err, anonUserId: anonUser.id, targetUserId: user.id },
          "auth/login: anonymous merge failed — non-fatal"),
      );
    }
  }

  logger.info(
    { userId: user.id, onboardingComplete },
    onboardingComplete
      ? "auth/login: routing to chat (onboarding complete)"
      : "auth/login: routing to onboarding (no complete profile found)",
  );

  res.json({
    user: {
      ...toPublicUser(user),
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

  // Anonymous users are always onboarding-complete (agent handles onboarding inline)
  const onboardingComplete = user.isAnonymous
    ? true
    : await resolveOnboardingComplete(user.id, user.onboardingComplete);

  if (process.env.NODE_ENV !== "production") {
    logger.info(
      { userId: user.id, isAnonymous: user.isAnonymous, onboardingComplete },
      user.isAnonymous
        ? "auth/me: anonymous user"
        : onboardingComplete
          ? "auth/me: routing to chat (onboarding complete or profile found)"
          : "auth/me: routing to onboarding (no complete profile)",
    );
  }

  res.json({
    ...toPublicUser(user),
    onboardingComplete,
  });
});

/**
 * DELETE /api/account
 *
 * Permanently deletes the authenticated user's account:
 *   1. Cancels active Stripe subscription immediately (no period-end grace)
 *   2. Deletes the user row — all related data cascades (conversations, programs,
 *      memories, training systems, readiness, session logs, exercise logs, etc.)
 *   3. Destroys the session cookie
 *
 * Anonymous users are not blocked — their row is deleted and their device/session
 * is cleared so they can start fresh.
 */
router.delete("/account", requireAuth, async (req, res): Promise<void> => {
  const userId = req.session.userId!;

  logger.info({ userId }, "[SettingsAudit:Delete] Account deletion initiated");

  try {
    // ── 1. Load user ──────────────────────────────────────────────────────────
    const [user] = await db
      .select()
      .from(usersTable)
      .where(eq(usersTable.id, userId))
      .limit(1);

    if (!user) {
      req.session.destroy(() => {});
      res.status(404).json({ error: "User not found" });
      return;
    }

    // ── 2. Cancel Stripe subscription if active ───────────────────────────────
    let subscriptionCanceled = false;
    if (user.stripeSubscriptionId && user.plan !== "free") {
      try {
        const stripe = await getUncachableStripeClient();
        // Retrieve subscription first to check it's still active
        const sub = await stripe.subscriptions.retrieve(user.stripeSubscriptionId);
        const isLive = ["active", "trialing", "past_due"].includes(sub.status);

        if (isLive) {
          // Cancel immediately — no grace period, no refund (billing portal handles that)
          await stripe.subscriptions.cancel(user.stripeSubscriptionId, {
            invoice_now: false,
            prorate: false,
          });
          subscriptionCanceled = true;
          logger.info(
            { userId, subscriptionId: user.stripeSubscriptionId, plan: user.plan },
            "[SettingsAudit:Delete] Stripe subscription canceled immediately"
          );
        }
      } catch (stripeErr: any) {
        // If the subscription is already canceled in Stripe, that's fine — continue
        if (stripeErr?.code !== "resource_missing") {
          logger.error({ stripeErr, userId }, "[SettingsAudit:Delete] Stripe cancellation failed — proceeding with account deletion anyway");
        }
      }
    }

    // ── 3. Delete user row (cascades all related data) ────────────────────────
    await db.delete(usersTable).where(eq(usersTable.id, userId));

    logger.info(
      { userId, subscriptionCanceled, plan: user.plan, isAnonymous: user.isAnonymous },
      "[SettingsAudit:Delete] Account deleted — all data cascaded"
    );

    // ── 4. Destroy session ────────────────────────────────────────────────────
    req.session.destroy(() => {
      res.json({ success: true, subscriptionCanceled });
    });
  } catch (err) {
    logger.error({ err, userId }, "[SettingsAudit:Delete] Account deletion failed");
    res.status(500).json({ error: "Failed to delete account. Please try again or contact support." });
  }
});

/**
 * PATCH /api/account
 *
 * Update mutable account fields (currently: display name).
 * Registered users only — anonymous users cannot change their name.
 */
router.patch("/account", requireAuth, async (req, res): Promise<void> => {
  const userId = req.session.userId!;
  const { name } = req.body ?? {};

  if (!name || typeof name !== "string" || !name.trim()) {
    res.status(400).json({ error: "Name is required" });
    return;
  }

  const trimmedName = name.trim().slice(0, 100);

  try {
    const [updated] = await db
      .update(usersTable)
      .set({ name: trimmedName })
      .where(eq(usersTable.id, userId))
      .returning({ id: usersTable.id, name: usersTable.name, email: usersTable.email });

    logger.info({ userId, name: trimmedName }, "[SettingsAudit:Save] Account name updated");

    res.json({ id: updated.id, name: updated.name, email: updated.email });
  } catch (err) {
    logger.error({ err, userId }, "Failed to update account name");
    res.status(500).json({ error: "Failed to update account. Please try again." });
  }
});

export default router;
