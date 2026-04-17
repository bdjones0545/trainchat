import { Router, type IRouter } from "express";
import { db, supportSubmissionsTable, usersTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { requireAuth } from "../middlewares/auth";
import { sendSupportEmail } from "../lib/email";
import { logger } from "../lib/logger";

const router: IRouter = Router();

// ─── POST /api/support ───────────────────────────────────────────────────────
// Stores a support submission in DB and sends email to Bryan.jones@trainchat.ai.
// Auth optional — anonymous users can also submit support requests.

router.post("/support", async (req, res): Promise<void> => {
  const body = req.body as {
    type?: string;
    name?: string;
    email?: string;
    category?: string;
    subject?: string;
    message?: string;
    metadata?: Record<string, unknown>;
  };

  const { type, name, email, category, subject, message, metadata } = body;

  // ── Basic validation ────────────────────────────────────────────────────────
  if (!type || !["contact", "bug", "feature"].includes(type)) {
    res.status(400).json({ error: "Invalid support type" });
    return;
  }
  if (!name?.trim()) {
    res.status(400).json({ error: "Name is required" });
    return;
  }
  if (!email?.trim() || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    res.status(400).json({ error: "Valid email is required" });
    return;
  }
  if (!message?.trim()) {
    res.status(400).json({ error: "Message is required" });
    return;
  }

  const userId = req.session?.userId ?? null;

  // ── Enrich metadata with server-side context ─────────────────────────────
  let userPlan: string | null = null;
  if (userId) {
    try {
      const [user] = await db.select({ plan: usersTable.plan }).from(usersTable).where(eq(usersTable.id, userId)).limit(1);
      userPlan = user?.plan ?? null;
    } catch {
      // non-blocking
    }
  }

  const enrichedMetadata: Record<string, unknown> = {
    ...metadata,
    userId: userId ?? metadata?.userId ?? null,
    plan: userPlan ?? metadata?.plan ?? null,
    environment: process.env.NODE_ENV ?? "unknown",
    submittedAt: new Date().toISOString(),
  };

  // ── Store in DB ──────────────────────────────────────────────────────────
  let submissionId: number | null = null;
  try {
    const [row] = await db.insert(supportSubmissionsTable).values({
      userId: userId ?? null,
      type: type as "contact" | "bug" | "feature",
      name: name.trim(),
      email: email.trim().toLowerCase(),
      category: category?.trim() ?? null,
      subject: subject?.trim() ?? null,
      message: message.trim(),
      metadata: enrichedMetadata,
      emailSent: "pending",
    }).returning({ id: supportSubmissionsTable.id });
    submissionId = row.id;
    logger.info({ submissionId, type, email, userId }, "[SettingsAudit:Support] Submission stored in DB");
  } catch (err) {
    logger.error({ err, type, email }, "[Support] Failed to store submission in DB");
    res.status(500).json({ error: "Failed to save your submission. Please try again." });
    return;
  }

  // ── Send email ────────────────────────────────────────────────────────────
  const emailResult = await sendSupportEmail({
    type: type as "contact" | "bug" | "feature",
    name: name.trim(),
    email: email.trim(),
    category: category?.trim() ?? null,
    subject: subject?.trim() ?? null,
    message: message.trim(),
    metadata: enrichedMetadata,
    userId,
  });

  // Update DB with email send status
  if (submissionId) {
    try {
      await db.update(supportSubmissionsTable)
        .set({ emailSent: emailResult.sent ? "sent" : (emailResult.reason ?? "failed") })
        .where(eq(supportSubmissionsTable.id, submissionId));
    } catch {
      // non-blocking
    }
  }

  res.json({
    success: true,
    submissionId,
    emailSent: emailResult.sent,
    message: emailResult.sent
      ? "Your message has been sent to TrainChat support."
      : "Your message has been received and logged. Our team will follow up.",
  });
});

export default router;
