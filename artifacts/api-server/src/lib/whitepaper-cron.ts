import cron from "node-cron";
import { db, whitepaperTopicQueueTable, whitepaperPublicationsTable, whitepaperSettingsTable } from "@workspace/db";
import { eq, and, lte, asc, or, isNull } from "drizzle-orm";
import { logger } from "./logger";
import { generateWhitepaper } from "./whitepaper-generator";
import type { WhitepaperTopicStatus } from "@workspace/db";

// ─── Settings Helper ───────────────────────────────────────────────────────────

async function getSettings() {
  const [row] = await db.select().from(whitepaperSettingsTable).where(eq(whitepaperSettingsTable.id, 1));
  if (row) return row;

  // Bootstrap singleton row if it doesn't exist yet
  const [inserted] = await db
    .insert(whitepaperSettingsTable)
    .values({ id: 1, autoGenerate: true, autoPublish: false })
    .onConflictDoNothing()
    .returning();
  return inserted ?? { autoGenerate: true, autoPublish: false };
}

// ─── Core Generation Job ───────────────────────────────────────────────────────

export async function runDailyWhitepaperJob(): Promise<void> {
  const settings = await getSettings();

  if (!settings.autoGenerate) {
    logger.info("[whitepaper-cron] autoGenerate is disabled — skipping");
    return;
  }

  const now = new Date();

  // Find the next queued topic scheduled for today or earlier (or no date set)
  const [topic] = await db
    .select()
    .from(whitepaperTopicQueueTable)
    .where(
      and(
        eq(whitepaperTopicQueueTable.status, "queued" as WhitepaperTopicStatus),
        or(
          isNull(whitepaperTopicQueueTable.scheduledFor),
          lte(whitepaperTopicQueueTable.scheduledFor, now),
        ),
      ),
    )
    .orderBy(
      asc(whitepaperTopicQueueTable.sortOrder),
      asc(whitepaperTopicQueueTable.id),
    )
    .limit(1);

  if (!topic) {
    logger.info("[whitepaper-cron] No queued topics ready for generation");
    return;
  }

  logger.info(
    { topicId: topic.id, slug: topic.slug },
    "[whitepaper-cron] Starting whitepaper generation",
  );

  // Mark as drafting
  await db
    .update(whitepaperTopicQueueTable)
    .set({ status: "drafting" as WhitepaperTopicStatus, updatedAt: new Date() })
    .where(eq(whitepaperTopicQueueTable.id, topic.id));

  try {
    const generated = await generateWhitepaper({
      title: topic.title,
      code: topic.code,
      slug: topic.slug,
      subtitle: topic.subtitle,
      thesis: topic.thesis,
      targetAudience: topic.targetAudience,
    });

    const pubStatus = settings.autoPublish ? "published" : "needs_review";

    const [publication] = await db
      .insert(whitepaperPublicationsTable)
      .values({
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
        status: pubStatus,
        publishedAt: settings.autoPublish ? new Date() : null,
      })
      .returning();

    // Mark topic as needs_review (or published if autoPublish)
    const topicStatus: WhitepaperTopicStatus = settings.autoPublish ? "published" : "needs_review";
    await db
      .update(whitepaperTopicQueueTable)
      .set({ status: topicStatus, updatedAt: new Date() })
      .where(eq(whitepaperTopicQueueTable.id, topic.id));

    logger.info(
      {
        topicId: topic.id,
        publicationId: publication.id,
        slug: generated.slug,
        status: pubStatus,
      },
      "[whitepaper-cron] Whitepaper draft saved — ready for review",
    );
  } catch (err) {
    // Mark topic back to queued so it can be retried
    await db
      .update(whitepaperTopicQueueTable)
      .set({ status: "queued" as WhitepaperTopicStatus, updatedAt: new Date() })
      .where(eq(whitepaperTopicQueueTable.id, topic.id));

    logger.error(
      { err, topicId: topic.id, slug: topic.slug },
      "[whitepaper-cron] Generation failed — topic reset to queued",
    );
  }
}

// ─── Cron Scheduler ────────────────────────────────────────────────────────────

let cronTask: ReturnType<typeof cron.schedule> | null = null;

export function startWhitepaperCron(): void {
  if (cronTask) return;

  // Run daily at 06:00 server time
  cronTask = cron.schedule("0 6 * * *", () => {
    runDailyWhitepaperJob().catch((err) => {
      logger.error({ err }, "[whitepaper-cron] Unhandled error in daily job");
    });
  });

  logger.info("[whitepaper-cron] Daily whitepaper cron scheduled (06:00 daily)");
}

export function stopWhitepaperCron(): void {
  cronTask?.stop();
  cronTask = null;
}
