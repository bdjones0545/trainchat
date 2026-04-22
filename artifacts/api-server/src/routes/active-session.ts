import { Router, type IRouter } from "express";
import { db, activeSessionsTable } from "@workspace/db";
import { eq, and, isNull } from "drizzle-orm";
import { requireAuth } from "../middlewares/auth";
import { z } from "zod";
import { logger } from "../lib/logger";

const router: IRouter = Router();

const VALID_FOCUS_MODES = ["strength", "speed", "mobility"] as const;
type FocusMode = typeof VALID_FOCUS_MODES[number];

function resolveFocusModeParam(raw: unknown): FocusMode {
  if (raw === "strength" || raw === "speed" || raw === "mobility") return raw;
  return "strength";
}

function todayDateString(): string {
  return new Date().toISOString().slice(0, 10);
}

/**
 * Build a drizzle WHERE condition that scopes the active session lookup to
 * the exact training system (program). When trainingSystemId is provided it
 * must match; when it is null/absent we only match rows where
 * training_system_id IS NULL (legacy rows without a program scope).
 *
 * This prevents Day 1 in Program A from leaking into Program B.
 */
function trainingSystemCondition(trainingSystemId: number | null) {
  if (trainingSystemId != null) {
    return eq(activeSessionsTable.trainingSystemId, trainingSystemId);
  }
  return isNull(activeSessionsTable.trainingSystemId);
}

// ── GET /api/active-session ───────────────────────────────────────────────────
// Returns today's session status for the current user, focus, and program.
// Query params:
//   ?focus=strength|speed|mobility  (defaults to "strength")
//   ?trainingSystemId=<id>          (required for proper program isolation)
router.get("/active-session", requireAuth, async (req: any, res): Promise<void> => {
  const userId = req.session.userId!;
  const today = todayDateString();
  const focusMode = resolveFocusModeParam(req.query.focus);
  const trainingSystemId =
    req.query.trainingSystemId != null
      ? parseInt(req.query.trainingSystemId as string, 10) || null
      : null;

  logger.info(
    { userId, focusMode, trainingSystemId, today },
    "[SessionProgramIsolationAudit] GET active-session — lookup"
  );

  const [row] = await db
    .select()
    .from(activeSessionsTable)
    .where(
      and(
        eq(activeSessionsTable.userId, userId),
        eq(activeSessionsTable.sessionDate, today),
        eq(activeSessionsTable.focusMode, focusMode),
        trainingSystemCondition(trainingSystemId),
      )
    )
    .limit(1);

  if (!row) {
    res.json({ status: "not_started", focusMode });
    return;
  }

  logger.info(
    {
      userId,
      focusMode,
      trainingSystemId,
      today,
      resolvedStatus: row.status,
      rowId: row.id,
      crossProgramLeakDetected: false,
    },
    "[SessionProgramIsolationAudit] GET active-session — resolved"
  );

  res.json({
    id: row.id,
    status: row.status,
    focusMode: row.focusMode,
    trainingSystemId: row.trainingSystemId,
    savedProgramId: row.savedProgramId,
    dayNumber: row.dayNumber,
    startedAt: row.startedAt.toISOString(),
    completedAt: row.completedAt?.toISOString() ?? null,
  });
});

// ── POST /api/active-session/start ────────────────────────────────────────────
// Creates or re-opens today's session for the given focus and program.
const StartSessionBody = z.object({
  trainingSystemId: z.number().optional(),
  savedProgramId: z.number().optional(),
  dayNumber: z.number().optional(),
  focusMode: z.enum(["strength", "speed", "mobility"]).optional(),
});

router.post("/active-session/start", requireAuth, async (req: any, res): Promise<void> => {
  const parsed = StartSessionBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  if (!parsed.data.trainingSystemId) {
    logger.warn(
      { userId: req.session.userId, body: req.body },
      "[SessionProgramWriteAudit] start called without trainingSystemId — session isolation degraded"
    );
  }

  const userId = req.session.userId!;
  const today = todayDateString();
  const now = new Date();
  const focusMode = resolveFocusModeParam(parsed.data.focusMode ?? req.query.focus);
  const trainingSystemId = parsed.data.trainingSystemId ?? null;

  logger.info(
    { userId, focusMode, trainingSystemId, dayNumber: parsed.data.dayNumber },
    "[SessionProgramWriteAudit] start — attempting"
  );

  const existing = await db
    .select()
    .from(activeSessionsTable)
    .where(
      and(
        eq(activeSessionsTable.userId, userId),
        eq(activeSessionsTable.sessionDate, today),
        eq(activeSessionsTable.focusMode, focusMode),
        trainingSystemCondition(trainingSystemId),
      )
    )
    .limit(1);

  if (existing.length > 0) {
    const row = existing[0];
    if (row.status === "in_progress") {
      res.json({
        id: row.id,
        status: "in_progress",
        focusMode: row.focusMode,
        trainingSystemId: row.trainingSystemId,
        startedAt: row.startedAt.toISOString(),
        savedProgramId: row.savedProgramId,
        dayNumber: row.dayNumber,
      });
      return;
    }

    // Was completed — don't allow restart without explicit reset
    res.json({
      id: row.id,
      status: row.status,
      focusMode: row.focusMode,
      trainingSystemId: row.trainingSystemId,
      startedAt: row.startedAt.toISOString(),
      completedAt: row.completedAt?.toISOString() ?? null,
      savedProgramId: row.savedProgramId,
      dayNumber: row.dayNumber,
    });
    return;
  }

  // Create new program-scoped active session
  const [row] = await db
    .insert(activeSessionsTable)
    .values({
      userId,
      trainingSystemId,
      savedProgramId: parsed.data.savedProgramId ?? null,
      dayNumber: parsed.data.dayNumber ?? null,
      sessionDate: today,
      focusMode,
      status: "in_progress",
      startedAt: now,
      updatedAt: now,
    })
    .returning();

  logger.info(
    { userId, focusMode, trainingSystemId, rowId: row.id, writeSucceeded: true },
    "[SessionProgramWriteAudit] start — created"
  );

  res.status(201).json({
    id: row.id,
    status: "in_progress",
    focusMode: row.focusMode,
    trainingSystemId: row.trainingSystemId,
    startedAt: row.startedAt.toISOString(),
    savedProgramId: row.savedProgramId,
    dayNumber: row.dayNumber,
  });
});

// ── POST /api/active-session/complete ─────────────────────────────────────────
// Marks today's session for the given focus and program as completed.
// Body: { focusMode?: string; trainingSystemId?: number }
router.post("/active-session/complete", requireAuth, async (req: any, res): Promise<void> => {
  const userId = req.session.userId!;
  const today = todayDateString();
  const now = new Date();
  const focusMode = resolveFocusModeParam(req.body?.focusMode ?? req.query.focus);
  const trainingSystemId =
    req.body?.trainingSystemId != null
      ? (parseInt(String(req.body.trainingSystemId), 10) || null)
      : null;

  if (!trainingSystemId) {
    logger.warn(
      { userId, focusMode, body: req.body },
      "[SessionProgramWriteAudit] complete called without trainingSystemId — session isolation degraded"
    );
  }

  logger.info(
    { userId, focusMode, trainingSystemId },
    "[SessionProgramWriteAudit] complete — attempting"
  );

  const existing = await db
    .select()
    .from(activeSessionsTable)
    .where(
      and(
        eq(activeSessionsTable.userId, userId),
        eq(activeSessionsTable.sessionDate, today),
        eq(activeSessionsTable.focusMode, focusMode),
        trainingSystemCondition(trainingSystemId),
      )
    )
    .limit(1);

  if (existing.length === 0) {
    // No active session today for this program+focus — create a completed one
    const [row] = await db
      .insert(activeSessionsTable)
      .values({
        userId,
        trainingSystemId,
        sessionDate: today,
        focusMode,
        status: "completed",
        startedAt: now,
        completedAt: now,
        updatedAt: now,
      })
      .returning();

    logger.info(
      { userId, focusMode, trainingSystemId, rowId: row.id, writeSucceeded: true },
      "[SessionProgramWriteAudit] complete — inserted new completed row"
    );

    res.json({
      id: row.id,
      status: "completed",
      focusMode: row.focusMode,
      trainingSystemId: row.trainingSystemId,
      startedAt: row.startedAt.toISOString(),
      completedAt: row.completedAt!.toISOString(),
    });
    return;
  }

  const [updated] = await db
    .update(activeSessionsTable)
    .set({
      status: "completed",
      completedAt: now,
      updatedAt: now,
    })
    .where(
      and(
        eq(activeSessionsTable.userId, userId),
        eq(activeSessionsTable.sessionDate, today),
        eq(activeSessionsTable.focusMode, focusMode),
        trainingSystemCondition(trainingSystemId),
      )
    )
    .returning();

  logger.info(
    { userId, focusMode, trainingSystemId, rowId: updated.id, writeSucceeded: true },
    "[SessionProgramWriteAudit] complete — updated existing row"
  );

  res.json({
    id: updated.id,
    status: "completed",
    focusMode: updated.focusMode,
    trainingSystemId: updated.trainingSystemId,
    startedAt: updated.startedAt.toISOString(),
    completedAt: updated.completedAt!.toISOString(),
  });
});

export default router;
