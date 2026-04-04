import { Router, type IRouter } from "express";
import { db, sessionLogsTable, readinessEntriesTable } from "@workspace/db";
import { eq, desc, gte } from "drizzle-orm";
import { requireAuth } from "../middlewares/auth";

const router: IRouter = Router();

function computeStreak(dates: Date[]): { currentStreak: number; longestStreak: number; totalSessions: number } {
  if (dates.length === 0) return { currentStreak: 0, longestStreak: 0, totalSessions: 0 };

  const dayStrings = [...new Set(dates.map((d) => d.toISOString().slice(0, 10)))].sort().reverse();

  let currentStreak = 0;
  let longestStreak = 0;
  let streak = 0;

  const today = new Date().toISOString().slice(0, 10);
  const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);

  const anchor = dayStrings[0] === today || dayStrings[0] === yesterday ? dayStrings[0] : null;

  if (anchor) {
    let prev: Date | null = null;
    for (let i = 0; i < dayStrings.length; i++) {
      const curr = new Date(dayStrings[i]);
      if (!prev) {
        streak = 1;
      } else {
        const diffDays = Math.round((prev.getTime() - curr.getTime()) / 86400000);
        if (diffDays === 1) {
          streak++;
        } else {
          break;
        }
      }
      prev = curr;
    }
    currentStreak = streak;
  }

  let tempStreak = 1;
  for (let i = 1; i < dayStrings.length; i++) {
    const curr = new Date(dayStrings[i]);
    const prev = new Date(dayStrings[i - 1]);
    const diffDays = Math.round((prev.getTime() - curr.getTime()) / 86400000);
    if (diffDays === 1) {
      tempStreak++;
    } else {
      longestStreak = Math.max(longestStreak, tempStreak);
      tempStreak = 1;
    }
  }
  longestStreak = Math.max(longestStreak, tempStreak);

  return { currentStreak, longestStreak, totalSessions: dates.length };
}

router.get("/streak", requireAuth, async (req: any, res): Promise<void> => {
  const userId = req.session.userId!;

  const thirtyDaysAgo = new Date(Date.now() - 30 * 86400000);

  const [logs, readiness] = await Promise.all([
    db
      .select({ completedAt: sessionLogsTable.completedAt })
      .from(sessionLogsTable)
      .where(eq(sessionLogsTable.userId, userId))
      .orderBy(desc(sessionLogsTable.completedAt)),
    db
      .select({ date: readinessEntriesTable.date })
      .from(readinessEntriesTable)
      .where(eq(readinessEntriesTable.userId, userId))
      .orderBy(desc(readinessEntriesTable.date)),
  ]);

  const allDates = [
    ...logs.map((l) => l.completedAt),
    ...readiness.map((r) => r.date),
  ];

  const { currentStreak, longestStreak, totalSessions } = computeStreak(allDates);

  const recentDays = logs
    .filter((l) => l.completedAt >= thirtyDaysAgo)
    .map((l) => l.completedAt.toISOString().slice(0, 10));

  res.json({
    currentStreak,
    longestStreak,
    totalSessions,
    recentActiveDays: [...new Set(recentDays)],
    weeklyAverage: recentDays.length > 0 ? parseFloat((recentDays.length / 4.3).toFixed(1)) : 0,
  });
});

export default router;
