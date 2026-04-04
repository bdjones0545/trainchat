import { Router, type IRouter } from "express";
import { db, usersTable, conversationsTable, messagesTable, savedProgramsTable, sessionLogsTable } from "@workspace/db";
import { eq, count, sql, gte } from "drizzle-orm";
import { requireAuth } from "../middlewares/auth";
import { getFunnelMetrics, getRecentEvents } from "../lib/analyticsService";

const router: IRouter = Router();

const ADMIN_EMAILS = (process.env.ADMIN_EMAILS ?? "").split(",").map((e) => e.trim()).filter(Boolean);

async function requireAdmin(req: any, res: any, next: any) {
  if (!req.session?.userId) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  if (ADMIN_EMAILS.length > 0) {
    const [user] = await db
      .select({ email: usersTable.email })
      .from(usersTable)
      .where(eq(usersTable.id, req.session.userId));
    if (!user || !ADMIN_EMAILS.includes(user.email)) {
      res.status(403).json({ error: "Forbidden" });
      return;
    }
  }
  next();
}

/**
 * GET /api/admin/analytics
 * Platform-level health metrics: users, messages, programs, session logs, plan breakdown.
 */
router.get("/admin/analytics", requireAuth, requireAdmin, async (_req, res): Promise<void> => {
  const thirtyDaysAgo = new Date(Date.now() - 30 * 86400000);
  const sevenDaysAgo = new Date(Date.now() - 7 * 86400000);

  const [
    totalUsersResult,
    newUsersThisWeekResult,
    paidUsersResult,
    totalMessagesResult,
    messagesThisWeekResult,
    totalProgramsResult,
    sessionLogsResult,
    planBreakdownResult,
  ] = await Promise.all([
    db.select({ count: count() }).from(usersTable),
    db.select({ count: count() }).from(usersTable).where(gte(usersTable.createdAt, sevenDaysAgo)),
    db.select({ count: count() }).from(usersTable).where(sql`${usersTable.plan} != 'free'`),
    db.select({ count: count() }).from(messagesTable),
    db.select({ count: count() }).from(messagesTable).where(gte(messagesTable.createdAt, sevenDaysAgo)),
    db.select({ count: count() }).from(savedProgramsTable),
    db.select({ count: count() }).from(sessionLogsTable),
    db.execute(sql`
      SELECT plan, COUNT(*) as count
      FROM users
      GROUP BY plan
      ORDER BY count DESC
    `),
  ]);

  const totalUsers = Number(totalUsersResult[0]?.count ?? 0);
  const paidUsers = Number(paidUsersResult[0]?.count ?? 0);

  res.json({
    users: {
      total: totalUsers,
      newThisWeek: Number(newUsersThisWeekResult[0]?.count ?? 0),
      paid: paidUsers,
      free: totalUsers - paidUsers,
      conversionRate: totalUsers > 0 ? parseFloat(((paidUsers / totalUsers) * 100).toFixed(1)) : 0,
    },
    messages: {
      total: Number(totalMessagesResult[0]?.count ?? 0),
      thisWeek: Number(messagesThisWeekResult[0]?.count ?? 0),
    },
    programs: {
      total: Number(totalProgramsResult[0]?.count ?? 0),
    },
    sessionLogs: {
      total: Number(sessionLogsResult[0]?.count ?? 0),
    },
    planBreakdown: planBreakdownResult.rows.map((r) => ({
      plan: r.plan,
      count: Number(r.count),
    })),
    generatedAt: new Date().toISOString(),
  });
});

/**
 * GET /api/admin/funnel
 * Full guest acquisition funnel metrics with drop-off analysis.
 *
 * Query params:
 *   range: "7d" | "30d" | "all" (default: "30d")
 */
router.get("/admin/funnel", requireAuth, requireAdmin, async (req, res): Promise<void> => {
  const range = (req.query.range as string) ?? "30d";

  let from: Date | undefined;
  const now = new Date();

  if (range === "7d") {
    from = new Date(now.getTime() - 7 * 86400000);
  } else if (range === "30d") {
    from = new Date(now.getTime() - 30 * 86400000);
  }
  // "all" → no from filter

  try {
    const metrics = await getFunnelMetrics({ from, to: now });
    res.json({ range, generatedAt: now.toISOString(), ...metrics });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * GET /api/admin/events
 * Recent analytics events, optionally filtered by date range.
 *
 * Query params:
 *   range: "7d" | "30d" | "all" (default: "30d")
 *   limit: number (default: 100)
 */
router.get("/admin/events", requireAuth, requireAdmin, async (req, res): Promise<void> => {
  const range = (req.query.range as string) ?? "30d";
  const limit = Math.min(Number(req.query.limit ?? 100), 500);

  let from: Date | undefined;
  const now = new Date();

  if (range === "7d") {
    from = new Date(now.getTime() - 7 * 86400000);
  } else if (range === "30d") {
    from = new Date(now.getTime() - 30 * 86400000);
  }

  try {
    const events = await getRecentEvents(limit, { from, to: now });
    res.json({ range, events });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
