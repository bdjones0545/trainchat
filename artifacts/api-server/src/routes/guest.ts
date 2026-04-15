import { Router, type IRouter } from "express";
import { z } from "zod";
import {
  initGuestSession,
  getGuestSession,
  updateGuestSession,
} from "../lib/guestService";
import {
  generateGuestProgram,
  generateGuestFollowup,
} from "../lib/guestGenerate";
import { mergeGuestToUser, TEASER_GENERATE_LIMIT, TEASER_TOTAL_LIMIT } from "../lib/guestMerge";
import { processGuestChat, GUEST_CHAT_LIMIT, type GuestChatMessage } from "../lib/guestChat";
import { requireAuth } from "../middlewares/auth";
import { trackEvent } from "../lib/analyticsService";

const router: IRouter = Router();

const InitBody = z.object({
  deviceId: z.string().min(8).max(128),
});

/**
 * POST /api/guest/session
 * Initialize or resume a guest session for the given device ID.
 * Safe to call repeatedly — idempotent.
 */
router.post("/guest/session", async (req, res): Promise<void> => {
  const parsed = InitBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid deviceId" });
    return;
  }

  try {
    const session = await initGuestSession(parsed.data.deviceId);
    res.json({ session });
  } catch (err: any) {
    if (err.message === "Guest session blocked") {
      res.status(403).json({ error: "Device blocked" });
      return;
    }
    res.status(500).json({ error: err.message });
  }
});

/**
 * GET /api/guest/session/:deviceId
 * Fetch an existing guest session without updating lastActiveAt.
 */
router.get("/guest/session/:deviceId", async (req, res): Promise<void> => {
  const { deviceId } = req.params;
  if (!deviceId || deviceId.length < 8) {
    res.status(400).json({ error: "Invalid deviceId" });
    return;
  }

  try {
    const session = await getGuestSession(deviceId);
    if (!session) {
      res.status(404).json({ error: "Guest session not found" });
      return;
    }
    res.json({ session });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * PATCH /api/guest/session/:deviceId
 * Update guest session markers (onboarding progress, paywall shown, etc).
 */
router.patch("/guest/session/:deviceId", async (req, res): Promise<void> => {
  const { deviceId } = req.params;
  if (!deviceId || deviceId.length < 8) {
    res.status(400).json({ error: "Invalid deviceId" });
    return;
  }

  const allowed = [
    "status",
    "teaserUsesCount",
    "onboardingStartedAt",
    "onboardingCompletedAt",
    "firstProgramGeneratedAt",
    "paywallShownAt",
    "convertedAt",
    "linkedUserId",
    "metadata",
  ] as const;

  const safeData: Record<string, any> = {};
  for (const key of allowed) {
    if (key in req.body) safeData[key] = req.body[key];
  }

  try {
    const session = await updateGuestSession(deviceId, safeData as any);
    if (!session) {
      res.status(404).json({ error: "Guest session not found" });
      return;
    }
    res.json({ session });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ─── Schemas ─────────────────────────────────────────────────────────────────

const OnboardingBody = z.object({
  deviceId: z.string().min(8).max(128),
  answers: z.object({
    goal: z.string(),
    experience: z.string(),
    frequency: z.number().int().min(1).max(7),
    equipment: z.array(z.string()),
    injuries: z.string(),
    style: z.string(),
    timeline: z.string(),
    sport: z.string(),
  }),
});

const GenerateBody = z.object({
  deviceId: z.string().min(8).max(128),
});

const FollowupBody = z.object({
  deviceId: z.string().min(8).max(128),
  message: z.string().min(1).max(2000),
});

const ConvertBody = z.object({
  deviceId: z.string().min(8).max(128),
});

const TrackBody = z.object({
  deviceId: z.string().min(8).max(128),
  event: z.string().min(1).max(100),
  metadata: z.record(z.unknown()).optional(),
});

/**
 * POST /api/guest/onboarding
 * Save guest onboarding answers. Marks onboardingCompletedAt.
 */
router.post("/guest/onboarding", async (req, res): Promise<void> => {
  const parsed = OnboardingBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid onboarding data", details: parsed.error.flatten() });
    return;
  }

  const { deviceId, answers } = parsed.data;

  try {
    const session = await getGuestSession(deviceId);
    if (!session) {
      res.status(404).json({ error: "Guest session not found" });
      return;
    }
    if (session.status === "blocked") {
      res.status(403).json({ error: "Device blocked" });
      return;
    }

    const existingMeta = (session.metadata ?? {}) as Record<string, unknown>;
    const updated = await updateGuestSession(deviceId, {
      onboardingCompletedAt: new Date(),
      metadata: { ...existingMeta, onboardingAnswers: answers },
    });

    res.json({ session: updated });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * POST /api/guest/generate
 * Generate a personalized program from stored onboarding answers.
 *
 * PHASE 3 ENFORCEMENT:
 * Blocked if teaserUsesCount >= TEASER_GENERATE_LIMIT (default: 1).
 * Each guest device may only generate one program — further use requires an account.
 */
router.post("/guest/generate", async (req, res): Promise<void> => {
  const parsed = GenerateBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid request" });
    return;
  }

  const { deviceId } = parsed.data;

  try {
    const session = await getGuestSession(deviceId);
    if (!session) {
      res.status(404).json({ error: "Guest session not found" });
      return;
    }
    if (session.status === "blocked") {
      res.status(403).json({ error: "Device blocked" });
      return;
    }

    // ── Backend teaser limit enforcement ─────────────────────────────────
    if (session.teaserUsesCount >= TEASER_GENERATE_LIMIT) {
      res.status(403).json({
        error: "Teaser limit reached",
        code: "TEASER_EXHAUSTED",
        message: "Your free program generation has been used. Create an account to continue.",
      });
      return;
    }

    const meta = (session.metadata ?? {}) as Record<string, unknown>;
    const answers = meta.onboardingAnswers as any;

    if (!answers) {
      res.status(400).json({ error: "No onboarding answers found. Complete onboarding first." });
      return;
    }

    const program = await generateGuestProgram(deviceId, answers);
    res.json({ program });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * POST /api/guest/followup
 * Process one follow-up interaction from a guest user.
 *
 * PHASE 3 ENFORCEMENT:
 * Blocked if teaserUsesCount >= TEASER_TOTAL_LIMIT (default: 2).
 * Guests may ask one follow-up question. Further interactions require an account.
 */
router.post("/guest/followup", async (req, res): Promise<void> => {
  const parsed = FollowupBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid request" });
    return;
  }

  const { deviceId, message } = parsed.data;

  try {
    const session = await getGuestSession(deviceId);
    if (!session) {
      res.status(404).json({ error: "Guest session not found" });
      return;
    }
    if (session.status === "blocked") {
      res.status(403).json({ error: "Device blocked" });
      return;
    }

    // ── Backend teaser limit enforcement ─────────────────────────────────
    if (session.teaserUsesCount >= TEASER_TOTAL_LIMIT) {
      res.status(403).json({
        error: "Teaser limit reached",
        code: "TEASER_EXHAUSTED",
        message: "Your free preview has been used. Create an account to continue unlimited coaching.",
      });
      return;
    }

    const response = await generateGuestFollowup(deviceId, message);
    res.json({ response });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * POST /api/guest/convert
 * Merge a guest session into the currently authenticated user account.
 *
 * Call immediately after registration or login when a guest deviceId is
 * present in localStorage. Requires authentication.
 *
 * Idempotent — safe to call multiple times for the same device/user pair.
 * On success:
 *   - Populates user_profile from onboarding answers (if no profile exists)
 *   - Creates a starter conversation with the generated program (if none exists)
 *   - Sets user.onboardingComplete = true
 *   - Marks guest session as converted with linkedUserId and convertedAt
 */
router.post("/guest/convert", requireAuth, async (req, res): Promise<void> => {
  const parsed = ConvertBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid deviceId" });
    return;
  }

  const { deviceId } = parsed.data;
  const userId = req.session.userId!;

  try {
    const result = await mergeGuestToUser(deviceId, userId);
    res.json(result);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ─── Guest Chat Schema ────────────────────────────────────────────────────────

const GuestChatBody = z.object({
  deviceId: z.string().min(8).max(128),
  message: z.string().min(1).max(4000),
  history: z
    .array(
      z.object({
        role: z.enum(["user", "assistant"]),
        content: z.string(),
      })
    )
    .max(30)
    .optional()
    .default([]),
});

/**
 * POST /api/guest/chat
 * Handle a single conversational turn for a guest user.
 *
 * Allows up to GUEST_CHAT_LIMIT (5) user inputs before requiring signup.
 * Stores conversation history in guest session metadata.
 * Returns the AI response and remaining message count.
 */
router.post("/guest/chat", async (req, res): Promise<void> => {
  const parsed = GuestChatBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid request", details: parsed.error.flatten() });
    return;
  }

  const { deviceId, message, history } = parsed.data;

  try {
    const result = await processGuestChat(
      deviceId,
      message,
      history as GuestChatMessage[]
    );

    if (result.limitReached && !result.response) {
      res.status(402).json({
        error: "Free message limit reached",
        code: "PAYWALL",
        messageCount: result.messageCount,
        limit: GUEST_CHAT_LIMIT,
      });
      return;
    }

    res.json({
      response: result.response,
      messageCount: result.messageCount,
      limitReached: result.limitReached,
      remaining: Math.max(0, GUEST_CHAT_LIMIT - result.messageCount),
      // Phase 3: structured program JSON for the guest program panel
      ...(result.guestProgram ? { guestProgram: result.guestProgram } : {}),
    });
  } catch (err: any) {
    if (err.message === "Guest session not found") {
      res.status(404).json({ error: "Guest session not found" });
      return;
    }
    if (err.message === "Device blocked") {
      res.status(403).json({ error: "Device blocked" });
      return;
    }
    res.status(500).json({ error: err.message });
  }
});

/**
 * POST /api/guest/track
 * Log a funnel analytics event to the guest session metadata.
 *
 * Events are appended to session.metadata.funnelEvents as timestamped entries.
 * This lightweight internal layer can be extended to emit to external analytics later.
 *
 * Never errors — tracking must not break UX.
 */
router.post("/guest/track", async (req, res): Promise<void> => {
  const parsed = TrackBody.safeParse(req.body);
  if (!parsed.success) {
    res.json({ ok: true });
    return;
  }

  const { deviceId, event, metadata } = parsed.data;

  try {
    const session = await getGuestSession(deviceId);
    if (!session) {
      // Still write to analytics even if session doesn't exist yet
      await trackEvent(event, { deviceId, properties: metadata ?? undefined });
      res.json({ ok: true });
      return;
    }

    // Write to structured analytics_events table (primary store)
    await trackEvent(event, {
      deviceId,
      guestSessionId: session.id,
      properties: metadata ?? undefined,
    });

    // Also maintain the metadata.funnelEvents array for backward compatibility
    const existingMeta = (session.metadata ?? {}) as Record<string, unknown>;
    const existingEvents = Array.isArray(existingMeta.funnelEvents)
      ? (existingMeta.funnelEvents as unknown[])
      : [];

    await updateGuestSession(deviceId, {
      metadata: {
        ...existingMeta,
        funnelEvents: [
          ...existingEvents,
          { event, timestamp: new Date().toISOString(), ...(metadata ?? {}) },
        ],
      },
    });
  } catch {
    // Silent — analytics must never break UX
  }

  res.json({ ok: true });
});

export default router;
