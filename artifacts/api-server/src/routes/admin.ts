import { Router, type IRouter } from "express";
import { db, usersTable, conversationsTable, messagesTable, savedProgramsTable, sessionLogsTable, coachingKnowledgeTable, researchDocumentsTable, researchChunksTable, researchDiscoveryRunsTable, researchPaperCandidatesTable } from "@workspace/db";
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
import {
  analyzeResearchDocument,
  reviewResearchCandidate,
  generateResearchChunks,
  batchAnalyzeDocuments,
  reviewUnreviewedDocuments,
} from "../research/research-librarian-agent";
import { seedResearchLibrary, isResearchLibraryEmpty } from "../research/research-seeder";
import { seedSpeedMobilityResearch, hasSpeedMobilityResearch } from "../research/research-speed-mobility-seeder";
import { seedStrengthResearch, hasStrengthResearch } from "../research/research-strength-seeder";
import { seedWeeklyUpdateWeek1, hasWeeklyUpdateWeek1Research } from "../research/research-weekly-update-seeder";
import {
  runDiscovery,
  approveCandidateAsDocument,
  rejectCandidate,
} from "../research/research-discovery-service";

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
    "status", "isActive", "isFoundational",
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
 * POST /api/admin/research/:id/toggle-foundational
 * Mark or unmark a document as foundational (exempts it from freshness age penalties).
 */
router.post("/admin/research/:id/toggle-foundational", requireAuth, requireAdmin, async (req, res): Promise<void> => {
  const id = parseInt(req.params.id as string, 10);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }

  const { isFoundational } = req.body ?? {};
  const [updated] = await db
    .update(researchDocumentsTable)
    .set({ isFoundational: Boolean(isFoundational), updatedAt: new Date() })
    .where(eq(researchDocumentsTable.id, id))
    .returning({ id: researchDocumentsTable.id, isFoundational: researchDocumentsTable.isFoundational });

  if (!updated) { res.status(404).json({ error: "Not found" }); return; }
  res.json({ ok: true, id, isFoundational: updated.isFoundational });
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
 * POST /api/admin/research/seed-speed-mobility
 * Seed the Speed + Mobility research library with curated principle documents.
 * Query params: force=true to re-seed even if speed/mobility data already exists.
 */
router.post("/admin/research/seed-speed-mobility", requireAuth, requireAdmin, async (req, res): Promise<void> => {
  const force = req.query.force === "true";
  try {
    const { inserted, skipped, chunks } = await seedSpeedMobilityResearch(force);
    res.json({ ok: true, inserted, skipped, chunks });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * POST /api/admin/research/seed-strength
 * Seed the Strength research library with curated principle documents.
 * Query params: force=true to re-seed even if strength data already exists.
 */
router.post("/admin/research/seed-strength", requireAuth, requireAdmin, async (req, res): Promise<void> => {
  const force = req.query.force === "true";
  try {
    const { inserted, skipped, chunks } = await seedStrengthResearch(force);
    res.json({ ok: true, inserted, skipped, chunks });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * GET /api/admin/research/stats
 * Summary stats for the research library, including librarian coverage and safety status.
 */
router.get("/admin/research/stats", requireAuth, requireAdmin, async (_req, res): Promise<void> => {
  const [
    totalResult,
    approvedResult,
    chunkResult,
    librarianReviewedResult,
    unreviewedResult,
    needsReviewResult,
    rejectedResult,
    retrievableResult,
  ] = await Promise.all([
    db.select({ n: count() }).from(researchDocumentsTable),
    db.select({ n: count() }).from(researchDocumentsTable)
      .where(and(eq(researchDocumentsTable.status, "approved"), eq(researchDocumentsTable.isActive, true))),
    db.select({ n: count() }).from(researchChunksTable),
    db.select({ n: count() }).from(researchDocumentsTable)
      .where(sql`${researchDocumentsTable.librarianRecommendation} IS NOT NULL`),
    db.select({ n: count() }).from(researchDocumentsTable)
      .where(sql`${researchDocumentsTable.librarianRecommendation} IS NULL`),
    db.select({ n: count() }).from(researchDocumentsTable)
      .where(eq(researchDocumentsTable.librarianRecommendation as any, "needs_review")),
    db.select({ n: count() }).from(researchDocumentsTable)
      .where(eq(researchDocumentsTable.status, "rejected")),
    // Retrievable = approved + active + librarian_recommendation in ('approve', 'needs_review')
    db.select({ n: count() }).from(researchDocumentsTable)
      .where(
        and(
          eq(researchDocumentsTable.status, "approved"),
          eq(researchDocumentsTable.isActive, true),
          sql`${researchDocumentsTable.librarianRecommendation} IN ('approve', 'needs_review')`,
        ),
      ),
  ]);

  const byCategory = await db.execute(sql`
    SELECT category, COUNT(*) as count
    FROM research_documents
    GROUP BY category ORDER BY count DESC
  `);

  const byRecommendation = await db.execute(sql`
    SELECT librarian_recommendation, COUNT(*) as count
    FROM research_documents
    GROUP BY librarian_recommendation ORDER BY count DESC
  `);

  const byTrustLevel = await db.execute(sql`
    SELECT trust_level, COUNT(*) as count
    FROM research_documents
    GROUP BY trust_level ORDER BY count DESC
  `);

  const total = Number(totalResult[0]?.n ?? 0);
  const librarianReviewed = Number(librarianReviewedResult[0]?.n ?? 0);

  res.json({
    total,
    approved: Number(approvedResult[0]?.n ?? 0),
    retrievable: Number(retrievableResult[0]?.n ?? 0),
    chunks: Number(chunkResult[0]?.n ?? 0),
    librarian: {
      reviewed: librarianReviewed,
      unreviewed: Number(unreviewedResult[0]?.n ?? 0),
      needsReview: Number(needsReviewResult[0]?.n ?? 0),
      rejected: Number(rejectedResult[0]?.n ?? 0),
      coveragePercent: total > 0 ? Math.round((librarianReviewed / total) * 100) : 0,
    },
    byCategory: byCategory.rows,
    byRecommendation: byRecommendation.rows,
    byTrustLevel: byTrustLevel.rows,
  });
});

// ─── Research Librarian Agent Routes ─────────────────────────────────────────

/**
 * POST /api/admin/research/:id/librarian/analyze
 * Run the Research Librarian Agent on a document.
 * Updates structured fields and generates retrieval chunks.
 * Does NOT approve the document automatically.
 */
router.post("/admin/research/:id/librarian/analyze", requireAuth, requireAdmin, async (req, res): Promise<void> => {
  const id = parseInt(req.params.id as string, 10);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }

  try {
    const outcome = await analyzeResearchDocument(id);
    if (!outcome.ok) {
      res.status(outcome.error === "Document not found" ? 404 : 500).json({ error: outcome.error });
      return;
    }
    res.json({ ok: true, recommendation: outcome.result?.recommendation, chunksCreated: outcome.chunksCreated, result: outcome.result });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * POST /api/admin/research/librarian/review-candidate
 * Evaluate a candidate source before adding it to the library.
 * Returns a recommendation and structured notes. Does NOT save anything.
 */
router.post("/admin/research/librarian/review-candidate", requireAuth, requireAdmin, async (req, res): Promise<void> => {
  const { title, authors, year, source, journal, url, doi, abstract: abstractText, category } = req.body ?? {};

  if (!title || !source) {
    res.status(400).json({ error: "title and source are required" });
    return;
  }

  try {
    const outcome = await reviewResearchCandidate({
      title,
      authors: authors || undefined,
      year: year ? parseInt(year, 10) : undefined,
      source,
      journal: journal || undefined,
      url: url || undefined,
      doi: doi || undefined,
      abstract: abstractText || undefined,
      category: category || "strength_conditioning",
    });

    if (!outcome.ok) {
      res.status(500).json({ error: outcome.error });
      return;
    }
    res.json({ ok: true, result: outcome.result });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * POST /api/admin/research/:id/librarian/chunks
 * Regenerate retrieval chunks only for an existing document.
 */
router.post("/admin/research/:id/librarian/chunks", requireAuth, requireAdmin, async (req, res): Promise<void> => {
  const id = parseInt(req.params.id as string, 10);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }

  try {
    const outcome = await generateResearchChunks(id);
    if (!outcome.ok) {
      res.status(outcome.error === "Document not found" ? 404 : 500).json({ error: outcome.error });
      return;
    }
    res.json({ ok: true, chunksCreated: outcome.chunksCreated });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * POST /api/admin/research/seed-weekly-update-week1
 * Seed Week 1 of the weekly research update (3 pending docs: hypertrophy, recovery, concurrent training).
 * Documents are inserted as status: "pending" / isActive: false — admin must approve before they enter retrieval.
 * Query params: force=true to re-seed even if already seeded.
 */
router.post("/admin/research/seed-weekly-update-week1", requireAuth, requireAdmin, async (req, res): Promise<void> => {
  const force = req.query.force === "true";
  try {
    const alreadySeeded = await hasWeeklyUpdateWeek1Research();
    if (alreadySeeded && !force) {
      res.json({
        ok: true,
        skipped: true,
        message: "Week 1 weekly update already seeded. Use ?force=true to re-seed. Documents remain PENDING — approve individually via /api/admin/research/:id/approve.",
      });
      return;
    }
    const { inserted, skipped, chunks } = await seedWeeklyUpdateWeek1(force);
    res.json({
      ok: true,
      inserted,
      skipped,
      chunks,
      status: "pending",
      isActive: false,
      note: "Documents are PENDING and NOT active. Review and approve each via POST /api/admin/research/:id/approve.",
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * POST /api/admin/research/librarian/batch-analyze
 * Run the Librarian Agent on multiple documents. Max 10 per batch.
 * Body: { ids: number[] }
 */
router.post("/admin/research/librarian/batch-analyze", requireAuth, requireAdmin, async (req, res): Promise<void> => {
  const { ids } = req.body ?? {};
  if (!Array.isArray(ids) || ids.length === 0) {
    res.status(400).json({ error: "ids must be a non-empty array" });
    return;
  }
  if (ids.length > 10) {
    res.status(400).json({ error: "Batch size limited to 10 documents" });
    return;
  }

  try {
    const outcome = await batchAnalyzeDocuments(ids.map((id: any) => parseInt(id, 10)));
    res.json({ ok: true, results: outcome.results });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * POST /api/admin/research/librarian/review-unreviewed
 * Run the Librarian Agent on ALL documents where librarian_recommendation IS NULL.
 * After analysis, automatically applies the recommendation as a status change:
 *   approve      → status=approved, isActive=true  (enters retrieval)
 *   needs_review → status=pending,  isActive=false  (blocked until admin manually approves)
 *   reject       → status=rejected, isActive=false  (permanently blocked)
 *
 * This enforces the safety rule: no unreviewed seed content is retrievable by the Coach.
 *
 * Optional query params:
 *   batchSize=5  (default 5; controls how many docs are processed per loop iteration)
 *
 * NOTE: This is a long-running operation. For 22 documents it may take ~2–3 minutes
 * depending on OpenAI response times. The response will not be sent until all documents
 * are processed. Do not call with a short client timeout.
 */
router.post("/admin/research/librarian/review-unreviewed", requireAuth, requireAdmin, async (req, res): Promise<void> => {
  const batchSize = parseInt((req.query.batchSize as string) ?? "5", 10) || 5;

  try {
    const outcome = await reviewUnreviewedDocuments(batchSize);
    res.json({
      ok: true,
      processed: outcome.processed,
      approved: outcome.approved,
      needsReview: outcome.needsReview,
      rejected: outcome.rejected,
      errors: outcome.errors,
      results: outcome.results,
      note: "Documents with recommendation=needs_review are now pending/inactive. " +
        "Review their warningFlags via GET /api/admin/research?status=pending, " +
        "then approve via POST /api/admin/research/:id/approve if acceptable.",
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ─── Research Discovery Pipeline ──────────────────────────────────────────────

/**
 * POST /api/admin/research/discovery/run
 * Manually trigger a full discovery run (searches PubMed + Semantic Scholar,
 * stores candidates, runs Librarian evaluation). Long-running — may take
 * several minutes. Response is sent only when complete.
 */
router.post("/admin/research/discovery/run", requireAuth, requireAdmin, async (req, res): Promise<void> => {
  const skipLibrarian = req.body?.skipLibrarian === true;
  try {
    const result = await runDiscovery({ skipLibrarian });
    res.json({
      ok: true,
      runId: result.runId,
      status: result.status,
      durationMs: result.duration,
      stats: result.stats,
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * GET /api/admin/research/discovery/runs
 * List recent discovery run history.
 */
router.get("/admin/research/discovery/runs", requireAuth, requireAdmin, async (req, res): Promise<void> => {
  const limit = Math.min(parseInt((req.query.limit as string) ?? "20", 10) || 20, 100);
  try {
    const runs = await db
      .select()
      .from(researchDiscoveryRunsTable)
      .orderBy(desc(researchDiscoveryRunsTable.startedAt))
      .limit(limit);
    res.json({ runs });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * GET /api/admin/research/candidates
 * List paper candidates with optional filters.
 * Query params: status, category, recommendation, limit
 */
router.get("/admin/research/candidates", requireAuth, requireAdmin, async (req, res): Promise<void> => {
  const limit = Math.min(parseInt((req.query.limit as string) ?? "50", 10) || 50, 200);
  const statusFilter = req.query.status as string | undefined;
  const categoryFilter = req.query.category as string | undefined;
  const recommendationFilter = req.query.recommendation as string | undefined;

  try {
    const conditions = [];
    const statusVal = Array.isArray(statusFilter) ? statusFilter[0] : statusFilter;
    const categoryVal = Array.isArray(categoryFilter) ? categoryFilter[0] : categoryFilter;
    const recommendationVal = Array.isArray(recommendationFilter) ? recommendationFilter[0] : recommendationFilter;

    if (statusVal && statusVal !== "all") {
      conditions.push(eq(researchPaperCandidatesTable.status, statusVal as any));
    }
    if (categoryVal && categoryVal !== "all") {
      conditions.push(eq(researchPaperCandidatesTable.category, categoryVal as any));
    }
    if (recommendationVal && recommendationVal !== "all") {
      conditions.push(eq(researchPaperCandidatesTable.librarianRecommendation, recommendationVal as any));
    }

    const candidates = await db
      .select()
      .from(researchPaperCandidatesTable)
      .where(conditions.length > 0 ? and(...conditions) : undefined)
      .orderBy(desc(researchPaperCandidatesTable.discoveredAt))
      .limit(limit);

    const total = await db
      .select({ count: count() })
      .from(researchPaperCandidatesTable);

    const byStatus = await db
      .select({
        status: researchPaperCandidatesTable.status,
        count: count(),
      })
      .from(researchPaperCandidatesTable)
      .groupBy(researchPaperCandidatesTable.status);

    res.json({
      candidates,
      total: total[0]?.count ?? 0,
      byStatus,
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * POST /api/admin/research/candidates/:id/approve
 * Approve a candidate: creates a research_documents row (is_active = true)
 * and optionally runs the Librarian to generate retrieval chunks.
 */
router.post("/admin/research/candidates/:id/approve", requireAuth, requireAdmin, async (req, res): Promise<void> => {
  const candidateId = parseInt(String(req.params.id), 10);
  if (isNaN(candidateId)) { res.status(400).json({ error: "Invalid id" }); return; }

  try {
    const approveResult = await approveCandidateAsDocument(candidateId);
    if (!approveResult.ok) {
      res.status(400).json({ error: approveResult.error });
      return;
    }

    // Optionally run Librarian to generate retrieval chunks on the new doc
    if (approveResult.documentId) {
      analyzeResearchDocument(approveResult.documentId).catch((err: Error) => {
        req.log.warn({ err: err.message, documentId: approveResult.documentId }, "Post-approval Librarian chunk generation failed (non-fatal)");
      });
    }

    res.json({
      ok: true,
      documentId: approveResult.documentId,
      note: "Research document created and active. Librarian chunk generation running in background.",
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * POST /api/admin/research/candidates/:id/reject
 * Reject a candidate — no research document is created.
 */
router.post("/admin/research/candidates/:id/reject", requireAuth, requireAdmin, async (req, res): Promise<void> => {
  const candidateId = parseInt(String(req.params.id), 10);
  if (isNaN(candidateId)) { res.status(400).json({ error: "Invalid id" }); return; }

  try {
    const result = await rejectCandidate(candidateId);
    if (!result.ok) { res.status(400).json({ error: result.error }); return; }
    res.json({ ok: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
