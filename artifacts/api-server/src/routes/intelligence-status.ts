/**
 * GET /api/intelligence-status
 *
 * Returns server-truth about the user's Atlas intelligence systems.
 * Settings UI uses this instead of localStorage to reflect real state.
 *
 * Fields:
 *  - memoryCount        total active memories
 *  - highConfCount      memories with confidence >= 4
 *  - hasDNA             whether athlete DNA has been calibrated
 *  - hasReadiness       whether any readiness check-ins exist
 *  - forecastStatus     "inactive" | "learning" | "active" | "unavailable"
 *  - precisionScore     current coaching precision score (0-100)
 *  - plan               user's current plan ("free" | "starter" | "pro" | "elite")
 *  - hasActiveSystem    whether a training system is currently active
 */

import { Router, type IRouter } from "express";
import { requireAuth } from "../middlewares/auth";
import { db, userProfilesTable, userMemoriesTable, readinessEntriesTable } from "@workspace/db";
import { eq, count, and, gte } from "drizzle-orm";
import { logger } from "../lib/logger";

const router: IRouter = Router();

router.get("/intelligence-status", requireAuth, async (req, res): Promise<void> => {
  const userId = req.session.userId!;

  try {
    const [profileResult, memoryCountResult, highConfCountResult, readinessCountResult] = await Promise.all([
      db
        .select({
          coachingPrecisionScore: userProfilesTable.coachingPrecisionScore,
          athleteDNA: userProfilesTable.athleteDNA,
          notificationPreferences: userProfilesTable.notificationPreferences,
        })
        .from(userProfilesTable)
        .where(eq(userProfilesTable.userId, userId))
        .limit(1),
      db
        .select({ count: count() })
        .from(userMemoriesTable)
        .where(
          and(
            eq(userMemoriesTable.userId, userId),
            eq(userMemoriesTable.status, "active"),
          )
        ),
      db
        .select({ count: count() })
        .from(userMemoriesTable)
        .where(
          and(
            eq(userMemoriesTable.userId, userId),
            gte(userMemoriesTable.confidence, 4),
          )
        ),
      db
        .select({ count: count() })
        .from(readinessEntriesTable)
        .where(eq(readinessEntriesTable.userId, userId)),
    ]);

    const profile = profileResult[0] ?? null;
    const memoryCount = Number(memoryCountResult[0]?.count ?? 0);
    const highConfCount = Number(highConfCountResult[0]?.count ?? 0);
    const readinessCount = Number(readinessCountResult[0]?.count ?? 0);

    const hasDNA = !!(profile?.athleteDNA);
    const hasReadiness = readinessCount > 0;
    const precisionScore = profile?.coachingPrecisionScore ?? 0;

    // Forecast status: needs high-confidence memories + readiness data to be reliable
    let forecastStatus: "inactive" | "learning" | "active" | "unavailable";
    if (memoryCount === 0 && readinessCount === 0) {
      forecastStatus = "inactive";
    } else if (highConfCount >= 5 && readinessCount >= 3) {
      forecastStatus = "active";
    } else {
      forecastStatus = "learning";
    }

    res.json({
      memoryCount,
      highConfCount,
      hasDNA,
      hasReadiness,
      forecastStatus,
      precisionScore,
      hasActiveSystem: memoryCount > 0 || hasDNA,
      notificationPreferences: profile?.notificationPreferences ?? null,
    });
  } catch (err) {
    logger.error({ err, userId }, "[IntelligenceStatus] Failed to fetch status");
    res.status(500).json({ error: "Failed to fetch intelligence status" });
  }
});

/**
 * PATCH /api/intelligence-status/notifications
 * Persists notification preferences to the user profile.
 */
router.patch("/intelligence-status/notifications", requireAuth, async (req, res): Promise<void> => {
  const userId = req.session.userId!;
  const prefs = req.body;

  if (typeof prefs !== "object" || prefs === null) {
    res.status(400).json({ error: "Invalid notification preferences" });
    return;
  }

  try {
    await db
      .update(userProfilesTable)
      .set({ notificationPreferences: prefs, updatedAt: new Date() })
      .where(eq(userProfilesTable.userId, userId));
    res.json({ ok: true });
  } catch (err) {
    logger.error({ err, userId }, "[IntelligenceStatus] Failed to save notification preferences");
    res.status(500).json({ error: "Failed to save preferences" });
  }
});

export default router;
