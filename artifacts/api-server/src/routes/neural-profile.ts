import { Router, type IRouter } from "express";
import { requireAuth } from "../middlewares/auth";
import { z } from "zod";
import { getOrCreateProfile, awardXpForSession } from "../lib/neural-profile-service";
import { db } from "@workspace/db";
import { neuralProfilesTable } from "@workspace/db";
import { eq } from "drizzle-orm";

const router: IRouter = Router();

// ── GET /api/neural-profile ───────────────────────────────────────────────────

router.get("/neural-profile", requireAuth, async (req: any, res): Promise<void> => {
  const userId = req.session.userId!;
  try {
    const profile = await getOrCreateProfile(userId);
    res.json(profile);
  } catch (err) {
    res.status(500).json({ error: "Failed to load neural profile" });
  }
});

// ── POST /api/neural-profile/award — award XP for a session ──────────────────

const AwardSessionBody = z.object({
  sessionStatus: z.enum(["completed", "partial", "skipped", "rescheduled"]).default("completed"),
  difficultyScore: z.number().min(1).max(5).optional(),
  streakDays: z.number().min(0).optional(),
  isPerfect: z.boolean().optional(),
});

router.post("/neural-profile/award", requireAuth, async (req: any, res): Promise<void> => {
  const parsed = AwardSessionBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const userId = req.session.userId!;
  try {
    const result = await awardXpForSession(userId, parsed.data);
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: "Failed to award XP" });
  }
});

export default router;
