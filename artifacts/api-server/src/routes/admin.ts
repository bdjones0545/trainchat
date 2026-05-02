import { Router, type IRouter } from "express";
import { db, usersTable, conversationsTable, messagesTable, savedProgramsTable, sessionLogsTable, coachingKnowledgeTable, researchDocumentsTable, researchChunksTable } from "@workspace/db";
import { eq, count, sql, gte, desc, and } from "drizzle-orm";
import { requireAuth } from "../middlewares/auth";
import { getFunnelMetrics, getRecentEvents } from "../lib/analyticsService";
import {
  getLearningReport,
  buildAllAggregates,
  buildAggregateForKey,
  getOpenCandidates,
  getRecentLearningEvents,
  generateCandidates,
  promoteCandidate,
  dismissCandidate,
} from "../lib/globalLearningService";
import { seedExerciseLibrary, isExerciseLibraryEmpty } from "../lib/exercise-seeder";
import {
  createResearchDocument,
  summarizeAndChunkDocument,
  approveDocument,
  rejectDocument,
  toggleDocumentActive,
} from "../research/research-ingestion";
import { seedResearchLibrary, isResearchLibraryEmpty } from "../research/research-seeder";

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
    if (!user || !ADMIN_EMAILS.includes(user.email ?? "")) {
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

// ─── Knowledge Base CRUD ────────────────────────────────────────────────────

/**
 * GET /api/admin/knowledge
 * List all coaching knowledge entries.
 */
router.get("/admin/knowledge", requireAuth, requireAdmin, async (_req, res): Promise<void> => {
  const entries = await db
    .select()
    .from(coachingKnowledgeTable)
    .orderBy(desc(coachingKnowledgeTable.createdAt));
  res.json({ entries });
});

/**
 * POST /api/admin/knowledge
 * Create a new coaching knowledge entry.
 */
router.post("/admin/knowledge", requireAuth, requireAdmin, async (req, res): Promise<void> => {
  const { type, content, tags, sport, goal, bodyRegion, movementPattern, population, sourceType } = req.body ?? {};

  if (!type || !content) {
    res.status(400).json({ error: "type and content are required" });
    return;
  }

  const validTypes = ["philosophy", "exercise", "rule", "sport_template"];
  if (!validTypes.includes(type)) {
    res.status(400).json({ error: `type must be one of: ${validTypes.join(", ")}` });
    return;
  }

  const [entry] = await db
    .insert(coachingKnowledgeTable)
    .values({
      type,
      content,
      tags: Array.isArray(tags) ? tags : [],
      sport: sport || null,
      goal: goal || null,
      bodyRegion: bodyRegion || null,
      movementPattern: movementPattern || null,
      population: population || null,
      sourceType: sourceType || "manual",
      isActive: true,
    })
    .returning();

  res.status(201).json({ entry });
});

/**
 * PUT /api/admin/knowledge/:id
 * Update a coaching knowledge entry.
 */
router.put("/admin/knowledge/:id", requireAuth, requireAdmin, async (req, res): Promise<void> => {
  const id = parseInt(req.params.id as string, 10);
  if (isNaN(id)) {
    res.status(400).json({ error: "Invalid id" });
    return;
  }

  const { type, content, tags, sport, goal, bodyRegion, movementPattern, population, sourceType, isActive } = req.body ?? {};

  const [updated] = await db
    .update(coachingKnowledgeTable)
    .set({
      ...(type !== undefined && { type }),
      ...(content !== undefined && { content }),
      ...(tags !== undefined && { tags: Array.isArray(tags) ? tags : [] }),
      ...(sport !== undefined && { sport: sport || null }),
      ...(goal !== undefined && { goal: goal || null }),
      ...(bodyRegion !== undefined && { bodyRegion: bodyRegion || null }),
      ...(movementPattern !== undefined && { movementPattern: movementPattern || null }),
      ...(population !== undefined && { population: population || null }),
      ...(sourceType !== undefined && { sourceType }),
      ...(isActive !== undefined && { isActive }),
      updatedAt: new Date(),
    })
    .where(eq(coachingKnowledgeTable.id, id))
    .returning();

  if (!updated) {
    res.status(404).json({ error: "Entry not found" });
    return;
  }

  res.json({ entry: updated });
});

/**
 * DELETE /api/admin/knowledge/:id
 * Delete a coaching knowledge entry.
 */
router.delete("/admin/knowledge/:id", requireAuth, requireAdmin, async (req, res): Promise<void> => {
  const id = parseInt(req.params.id as string, 10);
  if (isNaN(id)) {
    res.status(400).json({ error: "Invalid id" });
    return;
  }

  await db.delete(coachingKnowledgeTable).where(eq(coachingKnowledgeTable.id, id));
  res.json({ ok: true });
});

// ─── Global Learning Layer — Admin Routes ─────────────────────────────────────
// All routes below are restricted to admins only.
// They provide read-only visibility and controlled review actions.
// The live agent NEVER reads from these routes.

/**
 * GET /api/admin/learning/report
 * Summary report: top patterns, failures, clarifications, revert rates, candidate counts.
 * Query params: range ("7d" | "30d" | "all", default "30d")
 */
router.get("/admin/learning/report", requireAuth, requireAdmin, async (req, res): Promise<void> => {
  const range = (req.query.range as string) ?? "30d";
  const window = range === "7d" ? 7 : range === "all" ? "all" : 30;
  try {
    const report = await getLearningReport(window as 7 | 30 | "all");
    res.json({ range, ...report });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * GET /api/admin/learning/aggregates
 * All normalized key aggregates with success/revert/clarification rates and confidence scores.
 * Query params: range ("7d" | "30d" | "all", default "30d")
 */
router.get("/admin/learning/aggregates", requireAuth, requireAdmin, async (req, res): Promise<void> => {
  const range = (req.query.range as string) ?? "30d";
  const window = range === "7d" ? 7 : range === "all" ? "all" : 30;
  try {
    const aggregates = await buildAllAggregates(window as 7 | 30 | "all");
    res.json({ range, count: aggregates.length, aggregates });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * GET /api/admin/learning/aggregates/:key
 * Aggregate for a single normalized request key.
 * Query params: range ("7d" | "30d" | "all", default "30d")
 */
router.get("/admin/learning/aggregates/:key", requireAuth, requireAdmin, async (req, res): Promise<void> => {
  const key = req.params.key as string;
  const range = (req.query.range as string) ?? "30d";
  const window = range === "7d" ? 7 : range === "all" ? "all" : 30;
  try {
    const aggregate = await buildAggregateForKey(key, window as 7 | 30 | "all");
    res.json({ range, aggregate });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * GET /api/admin/learning/candidates
 * All open (non-promoted, non-dismissed) improvement candidates, sorted by confidence.
 * Query params: limit (default 50)
 */
router.get("/admin/learning/candidates", requireAuth, requireAdmin, async (req, res): Promise<void> => {
  const limit = Math.min(Number(req.query.limit ?? 50), 200);
  try {
    const candidates = await getOpenCandidates(limit);
    res.json({ count: candidates.length, candidates });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * POST /api/admin/learning/candidates/generate
 * Run the aggregation pipeline and generate/update improvement candidates.
 * This is safe to call repeatedly — it will upsert existing open candidates.
 * Query params: range ("7d" | "30d" | "all", default "30d")
 */
router.post("/admin/learning/candidates/generate", requireAuth, requireAdmin, async (req, res): Promise<void> => {
  const range = (req.query.range as string) ?? "30d";
  const window = range === "7d" ? 7 : range === "all" ? "all" : 30;
  try {
    const newCount = await generateCandidates(window as 7 | 30 | "all");
    res.json({ ok: true, newCandidatesCreated: newCount, range });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * POST /api/admin/learning/candidates/:id/promote
 * Mark a candidate as reviewed and accepted (promoted).
 * This records the decision but does NOT auto-modify any live system logic.
 * The actual core change must be implemented by an engineer after reviewing this signal.
 */
router.post("/admin/learning/candidates/:id/promote", requireAuth, requireAdmin, async (req, res): Promise<void> => {
  const id = parseInt(req.params.id as string, 10);
  if (isNaN(id)) {
    res.status(400).json({ error: "Invalid id" });
    return;
  }
  try {
    const ok = await promoteCandidate(id);
    if (!ok) {
      res.status(404).json({ error: "Candidate not found" });
      return;
    }
    res.json({ ok: true, id, promoted: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * POST /api/admin/learning/candidates/:id/dismiss
 * Dismiss a candidate (will not resurface unless regenerated with stronger evidence).
 */
router.post("/admin/learning/candidates/:id/dismiss", requireAuth, requireAdmin, async (req, res): Promise<void> => {
  const id = parseInt(req.params.id as string, 10);
  if (isNaN(id)) {
    res.status(400).json({ error: "Invalid id" });
    return;
  }
  try {
    const ok = await dismissCandidate(id);
    if (!ok) {
      res.status(404).json({ error: "Candidate not found" });
      return;
    }
    res.json({ ok: true, id, dismissed: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * GET /api/admin/learning/events
 * Recent raw learning events (structured signals, not raw chat logs).
 * Query params: range ("7d" | "30d" | "all", default "30d"), limit (default 100)
 */
router.get("/admin/learning/events", requireAuth, requireAdmin, async (req, res): Promise<void> => {
  const range = (req.query.range as string) ?? "30d";
  const limit = Math.min(Number(req.query.limit ?? 100), 500);
  const window = range === "7d" ? 7 : range === "all" ? "all" : 30;
  try {
    const events = await getRecentLearningEvents(limit, window as 7 | 30 | "all");
    res.json({ range, count: events.length, events });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * POST /api/admin/seed-exercises
 * Seed or re-seed the exercise library.
 * Protected by X-Admin-Key header matching ADMIN_SECRET env var.
 * Query params: force=true to re-seed even if library already has data.
 */
router.post("/admin/seed-exercises", async (req, res): Promise<void> => {
  const adminSecret = process.env.ADMIN_SECRET;
  if (!adminSecret) {
    res.status(503).json({ error: "Admin secret not configured" });
    return;
  }
  const providedKey = req.headers["x-admin-key"];
  if (providedKey !== adminSecret) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  const force = req.query.force === "true";

  try {
    const empty = await isExerciseLibraryEmpty();
    if (!empty && !force) {
      res.json({ ok: true, skipped: true, message: "Exercise library already populated. Use ?force=true to re-seed." });
      return;
    }

    const { inserted, updated } = await seedExerciseLibrary();
    res.json({ ok: true, inserted, updated, forced: force });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * POST /api/admin/users/set-plan
 * Directly set a user's plan for testing/admin purposes.
 * Protected by X-Admin-Key header matching ADMIN_SECRET env var.
 * Body: { email: string, plan: "free"|"starter"|"pro"|"elite", planStatus?: string }
 */
router.post("/admin/users/set-plan", async (req, res): Promise<void> => {
  const adminSecret = process.env.ADMIN_SECRET;
  if (!adminSecret) {
    res.status(503).json({ error: "Admin secret not configured" });
    return;
  }
  const providedKey = req.headers["x-admin-key"];
  if (providedKey !== adminSecret) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  const { email, plan, planStatus } = req.body ?? {};
  if (!email || !plan) {
    res.status(400).json({ error: "email and plan are required" });
    return;
  }

  const validPlans = ["free", "starter", "pro", "elite"];
  if (!validPlans.includes(plan)) {
    res.status(400).json({ error: `plan must be one of: ${validPlans.join(", ")}` });
    return;
  }

  const [updated] = await db
    .update(usersTable)
    .set({
      plan,
      planStatus: planStatus ?? "active",
      updatedAt: new Date(),
    })
    .where(eq(usersTable.email, email))
    .returning({ id: usersTable.id, email: usersTable.email, plan: usersTable.plan, planStatus: usersTable.planStatus });

  if (!updated) {
    res.status(404).json({ error: `User not found: ${email}` });
    return;
  }

  res.json({ ok: true, user: updated });
});

// ─── Research Knowledge Admin Routes ─────────────────────────────────────────

/**
 * GET /api/admin/research
 * List all research documents with optional filters.
 * Query params: status, category, trustLevel
 */
router.get("/admin/research", requireAuth, requireAdmin, async (req, res): Promise<void> => {
  const { status, category, trustLevel } = req.query as Record<string, string>;

  let query = db.select().from(researchDocumentsTable).$dynamic();

  const conditions = [];
  if (status) conditions.push(eq(researchDocumentsTable.status, status as any));
  if (category) conditions.push(eq(researchDocumentsTable.category, category as any));
  if (trustLevel) conditions.push(eq(researchDocumentsTable.trustLevel, trustLevel as any));

  if (conditions.length > 0) {
    query = query.where(and(...conditions) as any);
  }

  const docs = await query.orderBy(desc(researchDocumentsTable.createdAt));
  res.json({ documents: docs });
});

/**
 * GET /api/admin/research/:id
 * Get a single research document with its chunks.
 */
router.get("/admin/research/:id", requireAuth, requireAdmin, async (req, res): Promise<void> => {
  const id = parseInt(req.params.id as string, 10);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }

  const [doc] = await db.select().from(researchDocumentsTable).where(eq(researchDocumentsTable.id, id));
  if (!doc) { res.status(404).json({ error: "Not found" }); return; }

  const chunks = await db.select().from(researchChunksTable).where(eq(researchChunksTable.documentId, id));
  res.json({ document: doc, chunks });
});

/**
 * POST /api/admin/research
 * Create a new research document.
 */
router.post("/admin/research", requireAuth, requireAdmin, async (req, res): Promise<void> => {
  const {
    title, authors, year, source, journal, url, doi,
    category, topicTags, populationTags, evidenceType,
    trustLevel, confidence, abstract: abstractText,
  } = req.body ?? {};

  if (!title || !source || !category) {
    res.status(400).json({ error: "title, source, and category are required" });
    return;
  }

  try {
    const doc = await createResearchDocument({
      title,
      authors: authors || null,
      year: year ? parseInt(year, 10) : null,
      source,
      journal: journal || null,
      url: url || null,
      doi: doi || null,
      category,
      topicTags: Array.isArray(topicTags) ? topicTags : [],
      populationTags: Array.isArray(populationTags) ? populationTags : [],
      evidenceType: evidenceType || null,
      trustLevel: trustLevel ?? "high",
      confidence: confidence ?? "moderate",
      abstract: abstractText || null,
      status: "pending",
      isActive: false,
    });
    res.status(201).json({ document: doc });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * PUT /api/admin/research/:id
 * Update a research document.
 */
router.put("/admin/research/:id", requireAuth, requireAdmin, async (req, res): Promise<void> => {
  const id = parseInt(req.params.id as string, 10);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }

  const allowed = [
    "title", "authors", "year", "source", "journal", "url", "doi",
    "category", "topicTags", "populationTags", "evidenceType", "trustLevel",
    "confidence", "abstract", "plainLanguageSummary", "coachingImplications",
    "programmingImplications", "safetyConsiderations", "limitations", "contraindications",
    "status", "isActive",
  ];

  const updates: Record<string, any> = { updatedAt: new Date() };
  for (const key of allowed) {
    if (req.body?.[key] !== undefined) updates[key] = req.body[key];
  }

  const [updated] = await db
    .update(researchDocumentsTable)
    .set(updates)
    .where(eq(researchDocumentsTable.id, id))
    .returning();

  if (!updated) { res.status(404).json({ error: "Not found" }); return; }
  res.json({ document: updated });
});

/**
 * DELETE /api/admin/research/:id
 * Delete a research document and its chunks.
 */
router.delete("/admin/research/:id", requireAuth, requireAdmin, async (req, res): Promise<void> => {
  const id = parseInt(req.params.id as string, 10);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }

  await db.delete(researchChunksTable).where(eq(researchChunksTable.documentId, id));
  await db.delete(researchDocumentsTable).where(eq(researchDocumentsTable.id, id));
  res.json({ ok: true });
});

/**
 * POST /api/admin/research/:id/approve
 * Approve a document — makes it available to the agent.
 */
router.post("/admin/research/:id/approve", requireAuth, requireAdmin, async (req, res): Promise<void> => {
  const id = parseInt(req.params.id as string, 10);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }

  try {
    const ok = await approveDocument(id);
    if (!ok) { res.status(404).json({ error: "Not found" }); return; }
    res.json({ ok: true, id, approved: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * POST /api/admin/research/:id/reject
 * Reject a document — removes it from agent context.
 */
router.post("/admin/research/:id/reject", requireAuth, requireAdmin, async (req, res): Promise<void> => {
  const id = parseInt(req.params.id as string, 10);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }

  const ok = await rejectDocument(id);
  if (!ok) { res.status(404).json({ error: "Not found" }); return; }
  res.json({ ok: true, id, rejected: true });
});

/**
 * POST /api/admin/research/:id/toggle
 * Toggle a document's active status (enable/disable from agent without full rejection).
 */
router.post("/admin/research/:id/toggle", requireAuth, requireAdmin, async (req, res): Promise<void> => {
  const id = parseInt(req.params.id as string, 10);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }

  const { isActive } = req.body ?? {};
  const ok = await toggleDocumentActive(id, Boolean(isActive));
  if (!ok) { res.status(404).json({ error: "Not found" }); return; }
  res.json({ ok: true, id, isActive: Boolean(isActive) });
});

/**
 * POST /api/admin/research/:id/summarize
 * Re-run AI summarization and chunk generation for a document.
 */
router.post("/admin/research/:id/summarize", requireAuth, requireAdmin, async (req, res): Promise<void> => {
  const id = parseInt(req.params.id as string, 10);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }

  try {
    const result = await summarizeAndChunkDocument(id);
    res.json({ ok: result.ok, chunksCreated: result.chunksCreated, error: result.error });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * POST /api/admin/research/seed
 * Seed the research library with curated initial data.
 * Query params: force=true to re-seed even if data already exists.
 */
router.post("/admin/research/seed", requireAuth, requireAdmin, async (req, res): Promise<void> => {
  const force = req.query.force === "true";
  try {
    const { inserted, skipped } = await seedResearchLibrary(force);
    res.json({ ok: true, inserted, skipped });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * GET /api/admin/research/stats
 * Summary stats for the research library.
 */
router.get("/admin/research/stats", requireAuth, requireAdmin, async (_req, res): Promise<void> => {
  const [totalResult] = await db.select({ n: count() }).from(researchDocumentsTable);
  const [approvedResult] = await db
    .select({ n: count() })
    .from(researchDocumentsTable)
    .where(and(eq(researchDocumentsTable.status, "approved"), eq(researchDocumentsTable.isActive, true)));
  const [chunkResult] = await db.select({ n: count() }).from(researchChunksTable);

  const byCategory = await db.execute(sql`
    SELECT category, COUNT(*) as count
    FROM research_documents
    GROUP BY category ORDER BY count DESC
  `);

  res.json({
    total: Number(totalResult?.n ?? 0),
    approved: Number(approvedResult?.n ?? 0),
    chunks: Number(chunkResult?.n ?? 0),
    byCategory: byCategory.rows,
  });
});

export default router;
