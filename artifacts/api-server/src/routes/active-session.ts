import { Router, type IRouter } from "express";
import { db, activeSessionsTable } from "@workspace/db";
import { eq, and } from "drizzle-orm";
import { requireAuth } from "../middlewares/auth";
import { z } from "zod";

const router: IRouter = Router();

function todayDateString(): string {
  return new Date().toISOString().slice(0, 10);
}

// ── GET /api/active-session ───────────────────────────────────────────────────
// Returns today's session status for the current user.
// Response: { status: "not_started" | "in_progress" | "completed", startedAt?: string, completedAt?: string }
router.get("/active-session", requireAuth, async (req: any, res): Promise<void> => {
  const userId = req.session.userId!;
  const today = todayDateString();

  const [row] = await db
    .select()
    .from(activeSessionsTable)
    .where(
      and(
        eq(activeSessionsTable.userId, userId),
        eq(activeSessionsTable.sessionDate, today),
      )
    )
    .limit(1);

  if (!row) {
    res.json({ status: "not_started" });
    return;
  }

  res.json({
    id: row.id,
    status: row.status,
    savedProgramId: row.savedProgramId,
    dayNumber: row.dayNumber,
    startedAt: row.startedAt.toISOString(),
    completedAt: row.completedAt?.toISOString() ?? null,
  });
});

// ── POST /api/active-session/start ────────────────────────────────────────────
// Creates or re-opens today's session (upserts to in_progress).
const StartSessionBody = z.object({
  savedProgramId: z.number().optional(),
  dayNumber: z.number().optional(),
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

  const existing = await db
    .select()
    .from(activeSessionsTable)
    .where(
      and(
        eq(activeSessionsTable.userId, userId),
        eq(activeSessionsTable.sessionDate, today),
      )
    )
    .limit(1);

  if (existing.length > 0) {
    // Already exists — if completed, reset to in_progress (user wants to re-open)
    // If already in_progress, just return current state
    const row = existing[0];
    if (row.status === "in_progress") {
      res.json({
        id: row.id,
        status: "in_progress",
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
      startedAt: row.startedAt.toISOString(),
      completedAt: row.completedAt?.toISOString() ?? null,
      savedProgramId: row.savedProgramId,
      dayNumber: row.dayNumber,
    });
    return;
  }

  // Create new active session
  const [row] = await db
    .insert(activeSessionsTable)
    .values({
      userId,
      savedProgramId: parsed.data.savedProgramId ?? null,
      dayNumber: parsed.data.dayNumber ?? null,
      sessionDate: today,
      status: "in_progress",
      startedAt: now,
      updatedAt: now,
    })
    .returning();

  res.status(201).json({
    id: row.id,
    status: "in_progress",
    startedAt: row.startedAt.toISOString(),
    savedProgramId: row.savedProgramId,
    dayNumber: row.dayNumber,
  });
});

// ── POST /api/active-session/complete ─────────────────────────────────────────
// Marks today's session as completed.
router.post("/active-session/complete", requireAuth, async (req: any, res): Promise<void> => {
  const userId = req.session.userId!;
  const today = todayDateString();
  const now = new Date();

  const existing = await db
    .select()
    .from(activeSessionsTable)
    .where(
      and(
        eq(activeSessionsTable.userId, userId),
        eq(activeSessionsTable.sessionDate, today),
      )
    )
    .limit(1);

  if (existing.length === 0) {
    // No active session today — create a completed one (handles edge case)
    const [row] = await db
      .insert(activeSessionsTable)
      .values({
        userId,
        sessionDate: today,
        status: "completed",
        startedAt: now,
        completedAt: now,
        updatedAt: now,
      })
      .returning();

    res.json({
      id: row.id,
      status: "completed",
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
      )
    )
    .returning();

  res.json({
    id: updated.id,
    status: "completed",
    startedAt: updated.startedAt.toISOString(),
    completedAt: updated.completedAt!.toISOString(),
  });
});

export default router;
