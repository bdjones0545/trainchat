import { Router, type IRouter } from "express";
import { db, activeSessionsTable } from "@workspace/db";
import { eq, and } from "drizzle-orm";
import { requireAuth } from "../middlewares/auth";
import { z } from "zod";

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

// ── GET /api/active-session ───────────────────────────────────────────────────
// Returns today's session status for the current user and focus.
// Query param: ?focus=strength|speed|mobility (defaults to "strength")
// Response: { status: "not_started" | "in_progress" | "completed", startedAt?, completedAt? }
router.get("/active-session", requireAuth, async (req: any, res): Promise<void> => {
  const userId = req.session.userId!;
  const today = todayDateString();
  const focusMode = resolveFocusModeParam(req.query.focus);

  const [row] = await db
    .select()
    .from(activeSessionsTable)
    .where(
      and(
        eq(activeSessionsTable.userId, userId),
        eq(activeSessionsTable.sessionDate, today),
        eq(activeSessionsTable.focusMode, focusMode),
      )
    )
    .limit(1);

  if (!row) {
    res.json({ status: "not_started", focusMode });
    return;
  }

  res.json({
    id: row.id,
    status: row.status,
    focusMode: row.focusMode,
    savedProgramId: row.savedProgramId,
    dayNumber: row.dayNumber,
    startedAt: row.startedAt.toISOString(),
    completedAt: row.completedAt?.toISOString() ?? null,
  });
});

// ── POST /api/active-session/start ────────────────────────────────────────────
// Creates or re-opens today's session for the given focus (upserts to in_progress).
const StartSessionBody = z.object({
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

  const userId = req.session.userId!;
  const today = todayDateString();
  const now = new Date();
  const focusMode = resolveFocusModeParam(parsed.data.focusMode ?? req.query.focus);

  const existing = await db
    .select()
    .from(activeSessionsTable)
    .where(
      and(
        eq(activeSessionsTable.userId, userId),
        eq(activeSessionsTable.sessionDate, today),
        eq(activeSessionsTable.focusMode, focusMode),
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
      startedAt: row.startedAt.toISOString(),
      completedAt: row.completedAt?.toISOString() ?? null,
      savedProgramId: row.savedProgramId,
      dayNumber: row.dayNumber,
    });
    return;
  }

  // Create new focus-scoped active session
  const [row] = await db
    .insert(activeSessionsTable)
    .values({
      userId,
      savedProgramId: parsed.data.savedProgramId ?? null,
      dayNumber: parsed.data.dayNumber ?? null,
      sessionDate: today,
      focusMode,
      status: "in_progress",
      startedAt: now,
      updatedAt: now,
    })
    .returning();

  res.status(201).json({
    id: row.id,
    status: "in_progress",
    focusMode: row.focusMode,
    startedAt: row.startedAt.toISOString(),
    savedProgramId: row.savedProgramId,
    dayNumber: row.dayNumber,
  });
});

// ── POST /api/active-session/complete ─────────────────────────────────────────
// Marks today's session for the given focus as completed.
// Body: { focusMode?: string } or query ?focus=
router.post("/active-session/complete", requireAuth, async (req: any, res): Promise<void> => {
  const userId = req.session.userId!;
  const today = todayDateString();
  const now = new Date();
  const focusMode = resolveFocusModeParam(req.body?.focusMode ?? req.query.focus);

  const existing = await db
    .select()
    .from(activeSessionsTable)
    .where(
      and(
        eq(activeSessionsTable.userId, userId),
        eq(activeSessionsTable.sessionDate, today),
        eq(activeSessionsTable.focusMode, focusMode),
      )
    )
    .limit(1);

  if (existing.length === 0) {
    // No active session today for this focus — create a completed one
    const [row] = await db
      .insert(activeSessionsTable)
      .values({
        userId,
        sessionDate: today,
        focusMode,
        status: "completed",
        startedAt: now,
        completedAt: now,
        updatedAt: now,
      })
      .returning();

    res.json({
      id: row.id,
      status: "completed",
      focusMode: row.focusMode,
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
      )
    )
    .returning();

  res.json({
    id: updated.id,
    status: "completed",
    focusMode: updated.focusMode,
    startedAt: updated.startedAt.toISOString(),
    completedAt: updated.completedAt!.toISOString(),
  });
});

export default router;
