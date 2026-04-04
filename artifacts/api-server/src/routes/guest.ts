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

const router: IRouter = Router();

const InitBody = z.object({
  deviceId: z.string().min(8).max(128),
});

/**
 * POST /api/guest/session
 * Initialize or resume a guest session for the given device ID.
 * Called on every app load by unauthenticated visitors.
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

// ─── Onboarding Schemas ──────────────────────────────────────────────────────

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

/**
 * POST /api/guest/onboarding
 * Save guest onboarding answers to the guest session metadata.
 * Marks onboardingCompletedAt and stores answers for program generation.
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

    const existingMeta = (session.metadata ?? {}) as Record<string, unknown>;

    const updated = await updateGuestSession(deviceId, {
      onboardingCompletedAt: new Date(),
      metadata: {
        ...existingMeta,
        onboardingAnswers: answers,
      },
    });

    res.json({ session: updated });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * POST /api/guest/generate
 * Generate a personalized AI training program from stored onboarding answers.
 * Marks firstProgramGeneratedAt and increments teaserUsesCount.
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
 * Uses stored onboarding + program context for personalized response.
 * Increments teaserUsesCount — Phase 3 will gate further requests here.
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

    const response = await generateGuestFollowup(deviceId, message);
    res.json({ response });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
