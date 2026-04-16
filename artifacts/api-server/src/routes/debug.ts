/**
 * debug.ts — Anonymous Session Reset & Stale State Recovery
 *
 * Provides a safe mechanism for anonymous/deviceId users to start fresh when
 * their state is stale, corrupted, or tied to older bugged behavior.
 *
 * SAFETY RULES:
 * - Only operates on anonymous users (isAnonymous: true)
 * - Refuses to touch registered user accounts under any circumstances
 * - Scoped exclusively to the requesting device's anonymous record
 */

import { Router, type IRouter } from "express";
import { z } from "zod";
import {
  db,
  usersTable,
  conversationsTable,
  messagesTable,
  neuralProfilesTable,
} from "@workspace/db";
import { eq, count } from "drizzle-orm";
import { requireAuth } from "../middlewares/auth";
import { logger } from "../lib/logger";

const router: IRouter = Router();

// ─── Only available in non-production environments ────────────────────────────

function requireDebugEnabled(req: any, res: any, next: any) {
  if (process.env.NODE_ENV === "production" && process.env.DEBUG_RESET_ENABLED !== "true") {
    res.status(404).json({ error: "Not found" });
    return;
  }
  next();
}

// ─── Stale state detection helpers ───────────────────────────────────────────

/**
 * Detect suspicious patterns that indicate legacy / corrupted anonymous state.
 */
async function detectStaleState(userId: number): Promise<{
  warnings: string[];
  isLikelyStale: boolean;
}> {
  const warnings: string[] = [];

  try {
    // Check: conversations exist but none have messages
    const [convCount] = await db
      .select({ count: count() })
      .from(conversationsTable)
      .where(eq(conversationsTable.userId, userId));

    const totalConvs = Number(convCount?.count ?? 0);

    if (totalConvs > 0) {
      const [msgCount] = await db
        .select({ count: count() })
        .from(messagesTable)
        .innerJoin(conversationsTable, eq(messagesTable.conversationId, conversationsTable.id))
        .where(eq(conversationsTable.userId, userId));

      const totalMsgs = Number(msgCount?.count ?? 0);

      if (totalMsgs === 0) {
        warnings.push("User has conversations but no messages — possibly from a failed initialization.");
      }

      // Check: very high message count (possible loop)
      if (totalMsgs > 200) {
        warnings.push(`High message count (${totalMsgs}) detected — possible loop or runaway conversation.`);
      }
    }

    // Check: no neural profile (expected after onboarding)
    const [profile] = await db
      .select()
      .from(neuralProfilesTable)
      .where(eq(neuralProfilesTable.userId, userId));

    if (totalConvs > 0 && !profile) {
      warnings.push("Conversations exist but no neural profile — state may be incomplete.");
    }
  } catch (err) {
    warnings.push("Stale state check encountered an error — check DB connectivity.");
  }

  return {
    warnings,
    isLikelyStale: warnings.length > 0,
  };
}

// ─── Routes ───────────────────────────────────────────────────────────────────

/**
 * GET /api/debug/anonymous-state
 *
 * Returns a map of the current anonymous user's persisted state for inspection.
 * Does NOT modify anything. Safe to call repeatedly for diagnostics.
 *
 * Only works for anonymous sessions — returns 403 for registered users.
 */
router.get("/debug/anonymous-state", requireDebugEnabled, requireAuth, async (req, res): Promise<void> => {
  const userId = req.session.userId!;

  const [user] = await db
    .select()
    .from(usersTable)
    .where(eq(usersTable.id, userId));

  if (!user) {
    res.status(404).json({ error: "User not found" });
    return;
  }

  if (!user.isAnonymous) {
    res.status(403).json({
      error: "This endpoint is for anonymous/device users only. Registered accounts cannot be inspected here.",
    });
    return;
  }

  try {
    const [convCount] = await db
      .select({ count: count() })
      .from(conversationsTable)
      .where(eq(conversationsTable.userId, userId));

    const [msgCount] = await db
      .select({ count: count() })
      .from(messagesTable)
      .innerJoin(conversationsTable, eq(messagesTable.conversationId, conversationsTable.id))
      .where(eq(conversationsTable.userId, userId));

    const [profile] = await db
      .select()
      .from(neuralProfilesTable)
      .where(eq(neuralProfilesTable.userId, userId));

    const staleCheck = await detectStaleState(userId);

    const stateMap = {
      userId: user.id,
      deviceId: user.deviceId,
      isAnonymous: user.isAnonymous,
      createdAt: user.createdAt,
      onboardingComplete: user.onboardingComplete,
      serverState: {
        conversationCount: Number(convCount?.count ?? 0),
        messageCount: Number(msgCount?.count ?? 0),
        hasNeuralProfile: !!profile,
      },
      clientState: {
        note: "Check the browser for: localStorage.trainchat_device_id, sessionStorage.trainchat_guest_session, and the session cookie (sid).",
        knownLocalStorageKeys: ["trainchat_device_id"],
        knownSessionStorageKeys: ["trainchat_guest_session"],
        knownCookies: ["sid (HttpOnly session cookie)"],
        reactQueryCaches: [
          "getGetMeQueryKey() — current user auth state",
          "conversations list",
          "active training system",
          "memories, insights, streaks, etc.",
        ],
      },
      staleDetection: staleCheck,
    };

    logger.info({ userId, deviceId: user.deviceId }, "debug/anonymous-state: state map requested");

    res.json(stateMap);
  } catch (err: any) {
    logger.error({ err, userId }, "debug/anonymous-state: failed");
    res.status(500).json({ error: "State inspection failed" });
  }
});

const ResetBody = z.object({
  confirm: z.literal("RESET_ANONYMOUS_STATE"),
  clearServerData: z.boolean().optional().default(false),
});

/**
 * POST /api/debug/reset-anonymous
 *
 * Resets all anonymous user state for the requesting device.
 *
 * What gets reset:
 * - Server session (destroyed — forces fresh bootstrap on next visit)
 * - Optionally: all DB data for this anonymous user (conversations, messages, neural profile)
 *   controlled by `clearServerData: true`
 *
 * What is NOT reset (handled client-side, returned in response for the client to action):
 * - localStorage.trainchat_device_id
 * - sessionStorage.trainchat_guest_session
 * - React Query cache
 *
 * Safety:
 * - Refuses to operate on registered (non-anonymous) users
 * - Requires explicit confirmation payload: { confirm: "RESET_ANONYMOUS_STATE" }
 * - Body validation prevents accidental invocation
 */
router.post("/debug/reset-anonymous", requireDebugEnabled, requireAuth, async (req, res): Promise<void> => {
  const userId = req.session.userId!;

  const parsed = ResetBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({
      error: "Missing confirmation. Send: { confirm: 'RESET_ANONYMOUS_STATE' }",
    });
    return;
  }

  const { clearServerData } = parsed.data;

  const [user] = await db
    .select()
    .from(usersTable)
    .where(eq(usersTable.id, userId));

  if (!user) {
    res.status(404).json({ error: "User not found" });
    return;
  }

  // Critical safety check — refuse to operate on registered accounts
  if (!user.isAnonymous) {
    logger.warn(
      { userId, email: user.email },
      "debug/reset-anonymous: REFUSED — user is a registered account, not anonymous",
    );
    res.status(403).json({
      error: "Reset refused: this is a registered account, not an anonymous device session. Registered accounts are protected.",
    });
    return;
  }

  logger.info(
    { userId, deviceId: user.deviceId, clearServerData },
    "debug/reset-anonymous: initiating anonymous state reset",
  );

  try {
    // ── Optional: clear server-side DB data for this anonymous user ──────────
    if (clearServerData) {
      // Delete messages first (FK constraint), then conversations
      const userConvs = await db
        .select({ id: conversationsTable.id })
        .from(conversationsTable)
        .where(eq(conversationsTable.userId, userId));

      for (const conv of userConvs) {
        await db.delete(messagesTable).where(eq(messagesTable.conversationId, conv.id));
      }

      await db.delete(conversationsTable).where(eq(conversationsTable.userId, userId));
      await db.delete(neuralProfilesTable).where(eq(neuralProfilesTable.userId, userId));

      logger.info(
        { userId, conversationsCleared: userConvs.length },
        "debug/reset-anonymous: server DB data cleared for anonymous user",
      );
    }

    // ── Destroy the server session ────────────────────────────────────────────
    // This forces the client to get a new session on next bootstrap call.
    await new Promise<void>((resolve) => req.session.destroy(() => resolve()));

    res.json({
      reset: true,
      userId,
      serverDataCleared: clearServerData,
      clientActionsRequired: [
        "Clear localStorage key: trainchat_device_id",
        "Clear sessionStorage key: trainchat_guest_session",
        "Clear React Query cache (queryClient.clear())",
        "Generate a new deviceId by calling getOrCreateDeviceId() after clearing",
        "Reload the page — this will trigger a fresh /api/auth/bootstrap with the new deviceId",
      ],
      message: clearServerData
        ? "Anonymous session fully reset — server DB data cleared, session destroyed. Perform client actions and reload."
        : "Anonymous session reset — server session destroyed. Perform client actions and reload.",
    });
  } catch (err: any) {
    logger.error({ err, userId }, "debug/reset-anonymous: failed");
    res.status(500).json({ error: "Reset failed" });
  }
});

export default router;
