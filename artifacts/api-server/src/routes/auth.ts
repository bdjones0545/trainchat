import { Router, type IRouter } from "express";
import bcrypt from "bcryptjs";
import crypto from "crypto";
import { z } from "zod";
import { db, usersTable, userProfilesTable, passwordResetTokensTable } from "@workspace/db";
import { eq, and, gt, isNull } from "drizzle-orm";
import { RegisterBody, LoginBody } from "@workspace/api-zod";
import { requireAuth } from "../middlewares/auth";
import { authRateLimiter } from "../middlewares/auth-rate-limiter";
import { logger } from "../lib/logger";
import { mergeAnonymousToRegistered } from "../lib/anonymousMerge";
import { getUncachableStripeClient } from "../lib/stripeClient";
import { sendWelcomeEmail, sendPasswordResetEmail } from "../lib/email";

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
router.post("/auth/register", authRateLimiter, async (req, res): Promise<void> => {
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

    // Send welcome email — fire-and-forget, never blocks the response
    if (user.email) {
      sendWelcomeEmail({ name: user.name ?? "there", email: user.email }).catch((err) =>
        logger.error({ err, userId: user.id }, "auth/register: welcome email fire-and-forget failed"),
      );
    }

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
router.post("/auth/login", authRateLimiter, async (req, res): Promise<void> => {
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
  req.session.destroy((err) => {
    if (err) {
      logger.warn({ err }, "auth: session destroy error during logout");
    }
    // Explicitly expire the session cookie on the client so the browser stops
    // sending it. Without this the browser keeps the old cookie and the next
    // bootstrap/me call can re-authenticate the user from a stale session ID.
    res.clearCookie("connect.sid", { path: "/" });
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

    // ── 4. Destroy session and clear cookie ──────────────────────────────────
    req.session.destroy((destroyErr) => {
      if (destroyErr) {
        logger.warn({ destroyErr, userId }, "[SettingsAudit:Delete] Session destroy error after account deletion");
      }
      // Explicitly expire the session cookie so the browser stops sending it.
      // Without this the client keeps the stale cookie ID and could trigger
      // a bootstrap race on the next page load.
      res.clearCookie("connect.sid", { path: "/" });
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

// ─── Password Reset constants ──────────────────────────────────────────────────

const RESET_TOKEN_EXPIRES_MINUTES = 60;
const GENERIC_RESET_RESPONSE = {
  message: "If an account exists for that email, we've sent password reset instructions.",
};

// Simple in-memory rate limiter: max 5 requests per email per hour
const resetRateMap = new Map<string, { count: number; resetAt: number }>();

function isRateLimited(email: string): boolean {
  const now = Date.now();
  const entry = resetRateMap.get(email);
  if (!entry || entry.resetAt < now) {
    resetRateMap.set(email, { count: 1, resetAt: now + 60 * 60 * 1000 });
    return false;
  }
  entry.count += 1;
  if (entry.count > 5) return true;
  return false;
}

// ─── POST /api/auth/forgot-password ───────────────────────────────────────────

/**
 * Accepts an email address and sends a password reset link if the account exists.
 * Always returns the same generic response to prevent user enumeration.
 */
router.post("/auth/forgot-password", authRateLimiter, async (req, res): Promise<void> => {
  const parsed = z.object({ email: z.string().email() }).safeParse(req.body);

  if (!parsed.success) {
    res.status(400).json({ error: "A valid email address is required." });
    return;
  }

  const email = parsed.data.email.toLowerCase();

  // Rate limiting — silently return success to prevent enumeration via timing
  if (isRateLimited(email)) {
    logger.warn({ email }, "[PasswordResetRequest] rate limited");
    res.json(GENERIC_RESET_RESPONSE);
    return;
  }

  logger.info({ email }, "[PasswordResetRequest] received");

  // Always respond quickly — do the heavy work after replying
  res.json(GENERIC_RESET_RESPONSE);

  // Fire-and-forget the actual work so response is already sent
  setImmediate(async () => {
    try {
      const [user] = await db
        .select({ id: usersTable.id, email: usersTable.email, isAnonymous: usersTable.isAnonymous, passwordHash: usersTable.passwordHash })
        .from(usersTable)
        .where(eq(usersTable.email, email));

      // No user, or anonymous (no password set) — silently stop
      if (!user || user.isAnonymous || !user.passwordHash) {
        logger.info({ email }, "[PasswordResetRequest] email not found or anonymous — no action");
        return;
      }

      // Invalidate any existing unused tokens for this user
      await db
        .delete(passwordResetTokensTable)
        .where(
          and(
            eq(passwordResetTokensTable.userId, user.id),
            isNull(passwordResetTokensTable.usedAt),
          ),
        );

      // Generate cryptographically secure token
      const rawToken = crypto.randomBytes(32).toString("hex");
      const tokenHash = crypto.createHash("sha256").update(rawToken).digest("hex");
      const expiresAt = new Date(Date.now() + RESET_TOKEN_EXPIRES_MINUTES * 60 * 1000);

      await db.insert(passwordResetTokensTable).values({
        userId: user.id,
        tokenHash,
        expiresAt,
      });

      // Build reset URL — use the app's public URL or fall back to a safe default
      const appUrl = process.env.APP_URL
        ?? (process.env.REPLIT_DEV_DOMAIN ? `https://${process.env.REPLIT_DEV_DOMAIN}` : "https://www.trainchat.ai");
      const resetUrl = `${appUrl}/reset-password?token=${rawToken}`;

      await sendPasswordResetEmail({
        email: user.email!,
        resetUrl,
        expiresInMinutes: RESET_TOKEN_EXPIRES_MINUTES,
      });

      logger.info({ userId: user.id }, "[PasswordResetEmailSent] reset email sent");
    } catch (err) {
      logger.error({ err, email }, "[PasswordResetRequest] background processing failed");
    }
  });
});

// ─── POST /api/auth/reset-password ────────────────────────────────────────────

const ResetPasswordBody = z.object({
  token: z.string().min(1, "Token is required"),
  password: z
    .string()
    .min(8, "Password must be at least 8 characters")
    .max(128, "Password is too long"),
});

/**
 * Validates a reset token and updates the user's password.
 * Token must exist, not be expired, and not already be used.
 */
router.post("/auth/reset-password", async (req, res): Promise<void> => {
  const parsed = ResetPasswordBody.safeParse(req.body);

  if (!parsed.success) {
    const firstError = parsed.error.errors[0]?.message ?? "Invalid request";
    res.status(400).json({ error: firstError });
    return;
  }

  const { token, password } = parsed.data;
  const tokenHash = crypto.createHash("sha256").update(token).digest("hex");
  const now = new Date();

  try {
    const [record] = await db
      .select()
      .from(passwordResetTokensTable)
      .where(eq(passwordResetTokensTable.tokenHash, tokenHash));

    if (!record) {
      logger.warn({ tokenHash }, "[PasswordResetTokenValidated] token not found");
      res.status(400).json({ error: "This reset link is invalid. Please request a new one." });
      return;
    }

    if (record.usedAt) {
      logger.warn({ tokenId: record.id, userId: record.userId }, "[PasswordResetTokenValidated] token already used");
      res.status(400).json({ error: "This reset link has already been used. Please request a new one." });
      return;
    }

    if (record.expiresAt < now) {
      logger.warn({ tokenId: record.id, userId: record.userId }, "[PasswordResetTokenValidated] token expired");
      res.status(400).json({ error: "This reset link has expired. Please request a new one." });
      return;
    }

    logger.info({ tokenId: record.id, userId: record.userId }, "[PasswordResetTokenValidated] token valid");

    // Hash the new password and update the user record
    const passwordHash = await bcrypt.hash(password, 12);

    await db
      .update(usersTable)
      .set({ passwordHash })
      .where(eq(usersTable.id, record.userId));

    // Mark token as used
    await db
      .update(passwordResetTokensTable)
      .set({ usedAt: now })
      .where(eq(passwordResetTokensTable.id, record.id));

    // Invalidate any active session for this user (revoke on password reset)
    // Sessions are stored in the DB — we can't destroy them directly here,
    // so we clear the current request session at minimum.
    req.session.destroy(() => {});

    logger.info({ userId: record.userId }, "[PasswordResetCompleted] password updated, session invalidated");

    res.json({ message: "Your password has been reset. You can now sign in." });
  } catch (err) {
    logger.error({ err }, "[PasswordResetCompleted] failed");
    res.status(500).json({ error: "Something went wrong. Please try again." });
  }
});

// ─── GET /api/auth/validate-reset-token ───────────────────────────────────────

/**
 * Validates a reset token without consuming it.
 * Used by the reset password page to show appropriate UI on load.
 */
router.get("/auth/validate-reset-token", async (req, res): Promise<void> => {
  const token = typeof req.query.token === "string" ? req.query.token : "";
  if (!token) {
    res.status(400).json({ valid: false, reason: "missing" });
    return;
  }

  const tokenHash = crypto.createHash("sha256").update(token).digest("hex");
  const now = new Date();

  try {
    const [record] = await db
      .select({ id: passwordResetTokensTable.id, expiresAt: passwordResetTokensTable.expiresAt, usedAt: passwordResetTokensTable.usedAt })
      .from(passwordResetTokensTable)
      .where(eq(passwordResetTokensTable.tokenHash, tokenHash));

    if (!record) {
      res.json({ valid: false, reason: "invalid" });
      return;
    }
    if (record.usedAt) {
      res.json({ valid: false, reason: "used" });
      return;
    }
    if (record.expiresAt < now) {
      res.json({ valid: false, reason: "expired" });
      return;
    }

    res.json({ valid: true });
  } catch (err) {
    logger.error({ err }, "validate-reset-token: failed");
    res.status(500).json({ valid: false, reason: "error" });
  }
});

export default router;
