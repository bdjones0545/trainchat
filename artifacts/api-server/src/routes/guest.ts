import { Router, type IRouter } from "express";
import { z } from "zod";
import {
  initGuestSession,
  getGuestSession,
  updateGuestSession,
} from "../lib/guestService";

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
 * Useful for status checks without side effects.
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
 * Used by future phases — not called by Phase 1 frontend.
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

export default router;
