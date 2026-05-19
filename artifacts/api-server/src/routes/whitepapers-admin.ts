import { Router, type IRouter } from "express";
import {
  db,
  usersTable,
  whitepaperTopicQueueTable,
  whitepaperPublicationsTable,
  whitepaperSettingsTable,
} from "@workspace/db";
import { eq, desc, asc, and, or, isNull, lte } from "drizzle-orm";
import { requireAuth } from "../middlewares/auth";
import { runDailyWhitepaperJob } from "../lib/whitepaper-cron";
import { generateWhitepaper } from "../lib/whitepaper-generator";
import type { WhitepaperTopicStatus, WhitepaperPubStatus } from "@workspace/db";

const router: IRouter = Router();

// ─── Default seed topics ───────────────────────────────────────────────────────

const DEFAULT_TOPICS = [
  {
    title: "Constraint Stacking in AI Coaching Systems",
    slug: "constraint-stacking-ai-coaching",
    code: "CSAI",
    subtitle: "How Layered Constraint Resolution Enables Safe, Defensible Programming Decisions",
    thesis: "AI coaching systems must resolve constraints in a defined hierarchy — clinical constraints override performance preferences, which override user convenience. Failure to stack constraints deterministically results in coaching decisions that cannot be audited or defended.",
    targetAudience: "AI engineers, exercise scientists, advanced practitioners",
    sortOrder: 1,
  },
  {
    title: "Mutable Training Architecture",
    slug: "mutable-training-architecture",
    code: "MTA",
    subtitle: "The Case for Programs That Change Without Breaking",
    thesis: "A training program that cannot be mutated without being rebuilt is not a program — it is a document. This paper defines the architectural requirements for a training system that supports surgical mutation at every level while maintaining longitudinal coherence.",
    targetAudience: "Performance coaches, AI practitioners, sport scientists",
    sortOrder: 2,
  },
  {
    title: "Coaching Memory as a Programming Layer",
    slug: "coaching-memory-programming-layer",
    code: "CMPL",
    subtitle: "Why Training History Is Not Data — It Is Architecture",
    thesis: "Coaching memory is not an optional enhancement. It is the substrate upon which all principled programming decisions are made. Without access to training history, an AI coach is guessing. This paper defines coaching memory as a formal programming layer within the ACA.",
    targetAudience: "AI researchers, performance coaches, system architects",
    sortOrder: 3,
  },
  {
    title: "Agentic Feedback Loops in Strength Training",
    slug: "agentic-feedback-loops-strength",
    code: "AFLS",
    subtitle: "Closing the Loop Between Training Stimulus and Coaching Response",
    thesis: "Strength training is an iterative feedback process. This paper defines the agentic feedback loop — the continuous cycle of stimulus, response, interpretation, and adaptation — and argues that AI systems that do not close this loop cannot function as coaches.",
    targetAudience: "Sport scientists, AI researchers, strength coaches",
    sortOrder: 4,
  },
  {
    title: "The Live Program Panel as a Coaching Interface",
    slug: "live-program-panel-coaching-interface",
    code: "LPCI",
    subtitle: "Why the Training Dashboard Is Not a Display — It Is a Decision Surface",
    thesis: "The program panel in an AI coaching system is not a read-only output. It is a live coaching surface where intent is expressed, mutations are reviewed, and coaching state is visualized in real time. This paper defines the architectural requirements for a panel that supports active coaching.",
    targetAudience: "UX researchers, AI product designers, performance coaches",
    sortOrder: 5,
  },
  {
    title: "Human-in-the-Loop Periodization",
    slug: "human-in-the-loop-periodization",
    code: "HILP",
    subtitle: "Designing AI Coaching Systems That Require — Not Merely Tolerate — Human Judgment",
    thesis: "Human oversight in AI coaching is not a safety feature bolted onto an autonomous system. It is a structural requirement for high-stakes, high-variability coaching decisions. This paper defines where human judgment must be preserved and where automation is appropriate.",
    targetAudience: "AI safety researchers, performance coaches, sport scientists",
    sortOrder: 6,
  },
  {
    title: "Training Systems as Living Documents",
    slug: "training-systems-living-documents",
    code: "TSLD",
    subtitle: "The Document Metaphor Is Wrong — Training Programs Are State Machines",
    thesis: "Treating a training program as a document — fixed, versioned, replaced — is architecturally incompatible with adaptive coaching. This paper argues that training programs must be modeled as stateful, mutable systems and defines the state machine properties required for coaching quality.",
    targetAudience: "Software architects, sport scientists, AI researchers",
    sortOrder: 7,
  },
];

// ─── Admin Guard ───────────────────────────────────────────────────────────────

const ADMIN_EMAILS = (process.env.ADMIN_EMAILS ?? "")
  .split(",")
  .map((e) => e.trim())
  .filter(Boolean);

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

// ─── Settings ──────────────────────────────────────────────────────────────────

router.get("/admin/whitepapers/settings", requireAuth, requireAdmin, async (_req, res): Promise<void> => {
  const [row] = await db.select().from(whitepaperSettingsTable).where(eq(whitepaperSettingsTable.id, 1));
  if (!row) {
    const [created] = await db
      .insert(whitepaperSettingsTable)
      .values({ id: 1, autoGenerate: true, autoPublish: false })
      .onConflictDoNothing()
      .returning();
    res.json({ settings: created ?? { id: 1, autoGenerate: true, autoPublish: false } });
    return;
  }
  res.json({ settings: row });
});

router.put("/admin/whitepapers/settings", requireAuth, requireAdmin, async (req, res): Promise<void> => {
  const { autoGenerate, autoPublish } = req.body ?? {};
  const [updated] = await db
    .insert(whitepaperSettingsTable)
    .values({
      id: 1,
      autoGenerate: autoGenerate ?? true,
      autoPublish: autoPublish ?? false,
    })
    .onConflictDoUpdate({
      target: whitepaperSettingsTable.id,
      set: {
        ...(autoGenerate !== undefined && { autoGenerate }),
        ...(autoPublish !== undefined && { autoPublish }),
        updatedAt: new Date(),
      },
    })
    .returning();
  res.json({ settings: updated });
});

// ─── Topic Queue ───────────────────────────────────────────────────────────────

router.get("/admin/whitepapers/topics", requireAuth, requireAdmin, async (_req, res): Promise<void> => {
  const topics = await db
    .select()
    .from(whitepaperTopicQueueTable)
    .orderBy(asc(whitepaperTopicQueueTable.sortOrder), asc(whitepaperTopicQueueTable.id));
  res.json({ topics });
});

router.post("/admin/whitepapers/topics", requireAuth, requireAdmin, async (req, res): Promise<void> => {
  const { title, slug, code, subtitle, thesis, targetAudience, scheduledFor, sortOrder } = req.body ?? {};
  if (!title || !slug || !code) {
    res.status(400).json({ error: "title, slug, and code are required" });
    return;
  }
  try {
    const [topic] = await db
      .insert(whitepaperTopicQueueTable)
      .values({
        title,
        slug,
        code: code.toUpperCase(),
        subtitle: subtitle || null,
        thesis: thesis || null,
        targetAudience: targetAudience || null,
        scheduledFor: scheduledFor ? new Date(scheduledFor) : null,
        sortOrder: sortOrder ?? 0,
        status: "queued",
      })
      .returning();
    res.status(201).json({ topic });
  } catch (err: any) {
    if (err.code === "23505") {
      res.status(409).json({ error: `Slug "${slug}" is already in use` });
      return;
    }
    throw err;
  }
});

router.put("/admin/whitepapers/topics/:id", requireAuth, requireAdmin, async (req, res): Promise<void> => {
  const id = parseInt(req.params.id as string, 10);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }

  const allowed = ["title", "slug", "code", "subtitle", "thesis", "targetAudience", "status", "scheduledFor", "sortOrder"];
  const updates: Record<string, any> = { updatedAt: new Date() };
  for (const key of allowed) {
    if (req.body?.[key] !== undefined) {
      if (key === "scheduledFor") {
        updates[key] = req.body[key] ? new Date(req.body[key]) : null;
      } else if (key === "code") {
        updates[key] = String(req.body[key]).toUpperCase();
      } else {
        updates[key] = req.body[key];
      }
    }
  }

  const [updated] = await db
    .update(whitepaperTopicQueueTable)
    .set(updates)
    .where(eq(whitepaperTopicQueueTable.id, id))
    .returning();

  if (!updated) { res.status(404).json({ error: "Not found" }); return; }
  res.json({ topic: updated });
});

router.delete("/admin/whitepapers/topics/:id", requireAuth, requireAdmin, async (req, res): Promise<void> => {
  const id = parseInt(req.params.id as string, 10);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }
  await db.delete(whitepaperTopicQueueTable).where(eq(whitepaperTopicQueueTable.id, id));
  res.json({ ok: true });
});

/**
 * POST /api/admin/whitepapers/topics/:id/generate
 * Manually trigger whitepaper generation for a specific topic.
 */
router.post("/admin/whitepapers/topics/:id/generate", requireAuth, requireAdmin, async (req, res): Promise<void> => {
  const id = parseInt(req.params.id as string, 10);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }

  const [topic] = await db
    .select()
    .from(whitepaperTopicQueueTable)
    .where(eq(whitepaperTopicQueueTable.id, id));

  if (!topic) { res.status(404).json({ error: "Not found" }); return; }

  if (topic.status === "drafting") {
    res.status(409).json({ error: "Already drafting" });
    return;
  }

  await db
    .update(whitepaperTopicQueueTable)
    .set({ status: "drafting" as WhitepaperTopicStatus, updatedAt: new Date() })
    .where(eq(whitepaperTopicQueueTable.id, id));

  res.json({ ok: true, message: "Generation started" });

  // Run generation asynchronously (don't block the response)
  setImmediate(async () => {
    try {
      const generated = await generateWhitepaper({
        title: topic.title,
        code: topic.code,
        slug: topic.slug,
        subtitle: topic.subtitle,
        thesis: topic.thesis,
        targetAudience: topic.targetAudience,
      });

      await db.insert(whitepaperPublicationsTable).values({
        topicId: topic.id,
        title: generated.title,
        slug: generated.slug,
        code: generated.code,
        subtitle: generated.subtitle,
        abstract: generated.abstract,
        bodyJson: generated.sections,
        citationsJson: generated.citation,
        seoMetadataJson: generated.seoMetadata,
        keywords: generated.keywords,
        estimatedPages: generated.estimatedPages,
        status: "needs_review",
      });

      await db
        .update(whitepaperTopicQueueTable)
        .set({ status: "needs_review" as WhitepaperTopicStatus, updatedAt: new Date() })
        .where(eq(whitepaperTopicQueueTable.id, id));
    } catch (err) {
      await db
        .update(whitepaperTopicQueueTable)
        .set({ status: "queued" as WhitepaperTopicStatus, updatedAt: new Date() })
        .where(eq(whitepaperTopicQueueTable.id, id));
    }
  });
});

/**
 * POST /api/admin/whitepapers/topics/seed-defaults
 * Seeds the 7 default topic ideas if the queue is empty.
 */
router.post("/admin/whitepapers/topics/seed-defaults", requireAuth, requireAdmin, async (_req, res): Promise<void> => {
  const existing = await db.select({ id: whitepaperTopicQueueTable.id }).from(whitepaperTopicQueueTable);
  if (existing.length > 0) {
    res.json({ ok: true, skipped: true, message: "Queue already has topics" });
    return;
  }

  const inserted = await db.insert(whitepaperTopicQueueTable).values(DEFAULT_TOPICS).returning();
  res.status(201).json({ ok: true, inserted: inserted.length });
});

// ─── Publications ──────────────────────────────────────────────────────────────

router.get("/admin/whitepapers/publications", requireAuth, requireAdmin, async (_req, res): Promise<void> => {
  const pubs = await db
    .select()
    .from(whitepaperPublicationsTable)
    .orderBy(desc(whitepaperPublicationsTable.createdAt));
  res.json({ publications: pubs });
});

router.get("/admin/whitepapers/publications/:id", requireAuth, requireAdmin, async (req, res): Promise<void> => {
  const id = parseInt(req.params.id as string, 10);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }

  const [pub] = await db
    .select()
    .from(whitepaperPublicationsTable)
    .where(eq(whitepaperPublicationsTable.id, id));

  if (!pub) { res.status(404).json({ error: "Not found" }); return; }
  res.json({ publication: pub });
});

router.put("/admin/whitepapers/publications/:id", requireAuth, requireAdmin, async (req, res): Promise<void> => {
  const id = parseInt(req.params.id as string, 10);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }

  const allowed = ["title", "subtitle", "abstract", "bodyJson", "citationsJson", "seoMetadataJson", "keywords", "estimatedPages"];
  const updates: Record<string, any> = { updatedAt: new Date() };
  for (const key of allowed) {
    if (req.body?.[key] !== undefined) updates[key] = req.body[key];
  }

  const [updated] = await db
    .update(whitepaperPublicationsTable)
    .set(updates)
    .where(eq(whitepaperPublicationsTable.id, id))
    .returning();

  if (!updated) { res.status(404).json({ error: "Not found" }); return; }
  res.json({ publication: updated });
});

router.post("/admin/whitepapers/publications/:id/approve", requireAuth, requireAdmin, async (req, res): Promise<void> => {
  const id = parseInt(req.params.id as string, 10);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }

  const [updated] = await db
    .update(whitepaperPublicationsTable)
    .set({ status: "approved" as WhitepaperPubStatus, updatedAt: new Date() })
    .where(eq(whitepaperPublicationsTable.id, id))
    .returning();

  if (!updated) { res.status(404).json({ error: "Not found" }); return; }

  // Also update the linked topic status
  if (updated.topicId) {
    await db
      .update(whitepaperTopicQueueTable)
      .set({ status: "approved" as WhitepaperTopicStatus, updatedAt: new Date() })
      .where(eq(whitepaperTopicQueueTable.id, updated.topicId));
  }

  res.json({ ok: true, publication: updated });
});

router.post("/admin/whitepapers/publications/:id/publish", requireAuth, requireAdmin, async (req, res): Promise<void> => {
  const id = parseInt(req.params.id as string, 10);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }

  const now = new Date();
  const [updated] = await db
    .update(whitepaperPublicationsTable)
    .set({ status: "published" as WhitepaperPubStatus, publishedAt: now, updatedAt: now })
    .where(eq(whitepaperPublicationsTable.id, id))
    .returning();

  if (!updated) { res.status(404).json({ error: "Not found" }); return; }

  if (updated.topicId) {
    await db
      .update(whitepaperTopicQueueTable)
      .set({ status: "published" as WhitepaperTopicStatus, updatedAt: now })
      .where(eq(whitepaperTopicQueueTable.id, updated.topicId));
  }

  res.json({ ok: true, publication: updated });
});

router.post("/admin/whitepapers/publications/:id/reject", requireAuth, requireAdmin, async (req, res): Promise<void> => {
  const id = parseInt(req.params.id as string, 10);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }

  const [updated] = await db
    .update(whitepaperPublicationsTable)
    .set({ status: "rejected" as WhitepaperPubStatus, updatedAt: new Date() })
    .where(eq(whitepaperPublicationsTable.id, id))
    .returning();

  if (!updated) { res.status(404).json({ error: "Not found" }); return; }

  if (updated.topicId) {
    await db
      .update(whitepaperTopicQueueTable)
      .set({ status: "rejected" as WhitepaperTopicStatus, updatedAt: new Date() })
      .where(eq(whitepaperTopicQueueTable.id, updated.topicId));
  }

  res.json({ ok: true, publication: updated });
});

/**
 * POST /api/admin/whitepapers/run-job
 * Manually trigger the daily whitepaper job (for testing / catch-up).
 */
router.post("/admin/whitepapers/run-job", requireAuth, requireAdmin, async (_req, res): Promise<void> => {
  res.json({ ok: true, message: "Job started" });
  setImmediate(() => {
    runDailyWhitepaperJob().catch(() => {});
  });
});

export default router;
