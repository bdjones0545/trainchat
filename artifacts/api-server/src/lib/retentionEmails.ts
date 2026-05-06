/**
 * ── Retention Email Service ────────────────────────────────────────────────────
 *
 * Idempotent retention emails for TrainChat.
 * Uses the analytics_events table as an idempotency log: before sending,
 * we check if a matching "email_sent:<type>:<userId>" event already exists.
 * This prevents double-sends across server restarts and concurrent requests.
 *
 * All functions are fire-and-forget safe: errors are caught and logged,
 * never propagated to the calling request.
 */

import { db, analyticsEventsTable, usersTable } from "@workspace/db";
import { eq, and, gte } from "drizzle-orm";
import { logger } from "./logger";
import {
  sendFirstBuildEmail,
  sendWeekTransitionEmail,
  send48hInactivityEmail,
} from "./email";

// ── Idempotency helpers ───────────────────────────────────────────────────────

async function hasEmailBeenSent(userId: number, emailType: string): Promise<boolean> {
  try {
    const event = `email_sent:${emailType}:${userId}`;
    const rows = await db
      .select({ event: analyticsEventsTable.event })
      .from(analyticsEventsTable)
      .where(
        and(
          eq(analyticsEventsTable.event as any, event),
          eq(analyticsEventsTable.userId as any, userId),
        ),
      )
      .limit(1);
    return rows.length > 0;
  } catch {
    return false;
  }
}

async function markEmailSent(userId: number, emailType: string): Promise<void> {
  try {
    const event = `email_sent:${emailType}:${userId}`;
    await db.insert(analyticsEventsTable).values({
      event: event as any,
      userId,
      properties: { emailType, sentAt: new Date().toISOString() },
    });
  } catch (err) {
    logger.warn({ err, userId, emailType }, "[retentionEmails] failed to mark email sent");
  }
}

async function getUserForEmail(userId: number): Promise<{ email: string; name: string } | null> {
  try {
    const [user] = await db
      .select({ email: usersTable.email, name: usersTable.name, isAnonymous: usersTable.isAnonymous })
      .from(usersTable)
      .where(eq(usersTable.id, userId))
      .limit(1);

    if (!user || user.isAnonymous || !user.email) return null;
    return { email: user.email, name: user.name ?? "Athlete" };
  } catch {
    return null;
  }
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Fires a "Your training system is ready" email once per user after their
 * first successful program build. Safe to call on every build — idempotent.
 */
export async function fireFirstBuildEmail(userId: number): Promise<void> {
  try {
    if (await hasEmailBeenSent(userId, "first_build")) return;

    const user = await getUserForEmail(userId);
    if (!user) return;

    await markEmailSent(userId, "first_build");
    const result = await sendFirstBuildEmail({ name: user.name, email: user.email });
    logger.info({ userId, sent: result.sent }, "[retentionEmails] first_build email");
  } catch (err) {
    logger.warn({ err, userId }, "[retentionEmails] fireFirstBuildEmail failed (non-fatal)");
  }
}

/**
 * Fires a "Week N is ready" email when the user advances to a new training week.
 * Idempotent per user per week number.
 */
export async function fireWeekTransitionEmail(userId: number, weekNumber: number): Promise<void> {
  try {
    const emailType = `week_transition_w${weekNumber}`;
    if (await hasEmailBeenSent(userId, emailType)) return;

    const user = await getUserForEmail(userId);
    if (!user) return;

    await markEmailSent(userId, emailType);
    const result = await sendWeekTransitionEmail({ name: user.name, email: user.email, weekNumber });
    logger.info({ userId, weekNumber, sent: result.sent }, "[retentionEmails] week_transition email");
  } catch (err) {
    logger.warn({ err, userId }, "[retentionEmails] fireWeekTransitionEmail failed (non-fatal)");
  }
}

/**
 * Fires a "Your next session is waiting" email if the user has been inactive
 * for >= 48 hours since their last session or message. Idempotent within a
 * 7-day window — will not send again if already sent in the past week.
 *
 * Designed to be called from a lightweight route triggered on app load.
 */
export async function fire48hInactivityEmail(userId: number, lastActiveDaysAgo: number): Promise<void> {
  try {
    if (lastActiveDaysAgo < 2) return;

    // Don't send more than once per 7 days
    const emailType = "inactivity_48h";
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const event = `email_sent:${emailType}:${userId}`;
    const recentRows = await db
      .select({ event: analyticsEventsTable.event })
      .from(analyticsEventsTable)
      .where(
        and(
          eq(analyticsEventsTable.event as any, event),
          eq(analyticsEventsTable.userId as any, userId),
          gte(analyticsEventsTable.createdAt, sevenDaysAgo),
        ),
      )
      .limit(1);

    if (recentRows.length > 0) return;

    const user = await getUserForEmail(userId);
    if (!user) return;

    await markEmailSent(userId, emailType);
    const result = await send48hInactivityEmail({ name: user.name, email: user.email });
    logger.info({ userId, lastActiveDaysAgo, sent: result.sent }, "[retentionEmails] inactivity_48h email");
  } catch (err) {
    logger.warn({ err, userId }, "[retentionEmails] fire48hInactivityEmail failed (non-fatal)");
  }
}
