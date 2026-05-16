import { Router, type IRouter } from "express";
import { db, sessionLogsTable, sessionFeedbackTable, systemChangeLog, trainingSystems, exerciseLogsTable, sessionExercises, trainingSessions, trainingWeeks, trainingPhases, conversationsTable, messagesTable, activeSessionsTable } from "@workspace/db";
import { eq, desc, and, ilike, gte, lt, inArray } from "drizzle-orm";
import { analyzeSessionLogAdaptation } from "../lib/session-log-adaptation-analyzer";
import { requireAuth } from "../middlewares/auth";
import { z } from "zod";
import { evaluateWorkoutCompletion } from "../lib/workout-evaluation";
import {
  evaluateSessionProgression,
  buildProgressionChangeSummary,
  getProgressionTargets,
  type PerceivedDifficulty,
  type PainLevel,
  type ExerciseLogEntry,
} from "../lib/progression";
import { runBlockEvaluationAndLog } from "./block-intelligence";
import { syncMemoriesFromData, upsertMemory } from "../lib/memory";
import { advanceToNextWeek, generateContinuationPhase } from "../lib/training-system-service";
import { buildBlockProjection, applyBlockProjectionToFutureWeeks } from "../lib/block-projection";
import { applyNextSessionAdjustment } from "../lib/next-session-intelligence";
import { updateStructuredMemoryFromLog } from "../lib/memory-dominance";
import { logger } from "../lib/logger";

// ─── Pain area label map ───────────────────────────────────────────────────────

const PAIN_AREA_LABELS: Record<string, string> = {
  knee: "knee",
  lower_back: "lower back",
  shoulder: "shoulder",
  hip: "hip",
  elbow: "elbow",
  wrist: "wrist",
  ankle: "ankle",
  neck: "neck",
  upper_back: "upper back",
};

function formatAreas(areas: string[]): string {
  return areas.map((a) => PAIN_AREA_LABELS[a] ?? a).join(", ");
}

// ─── Pipeline helpers: chat ack + agent memory ────────────────────────────────

interface SessionSignals {
  difficulty?: number | null;
  energy?: number | null;
  pain?: number | null;
  enjoyment?: number | null;
  painAreas?: string[] | null;
  notes?: string | null;
}

async function postSessionAckToChat(
  userId: number,
  sessionStatus: string,
  signals: SessionSignals
): Promise<void> {
  try {
    const [recentConvo] = await db
      .select({ id: conversationsTable.id })
      .from(conversationsTable)
      .where(eq(conversationsTable.userId, userId))
      .orderBy(desc(conversationsTable.updatedAt))
      .limit(1);
    if (!recentConvo) return;

    const { difficulty, energy, pain, enjoyment, painAreas, notes } = signals;

    const hasPainAreas = painAreas && painAreas.length > 0;
    const areaText = hasPainAreas ? formatAreas(painAreas!) : null;
    const tooHard = (difficulty ?? 0) >= 4;
    const tooEasy = (difficulty ?? 0) <= 2 && difficulty != null;
    const drained = (energy ?? 3) <= 2 && energy != null;
    const energized = (energy ?? 3) >= 4;
    const significantPain = (pain ?? 0) >= 4;
    const moderatePain = (pain ?? 0) === 3;
    const anyPain = (pain ?? 0) >= 3;
    const lowEnjoyment = (enjoyment ?? 3) <= 2 && enjoyment != null;

    let content: string;

    if (sessionStatus === "skipped") {
      content =
        "Session skipped — that's okay, it happens. The plan is still there when you're ready. If skipping becomes a pattern, tell me and I can simplify the schedule or drop the frequency so it's more realistic to stick to.";
    } else if (significantPain && hasPainAreas) {
      content = `Logged — but that level of discomfort in your ${areaText} is worth paying attention to. I've flagged it and will keep the loading conservative on that pattern in your upcoming sessions. If it's still there next session, let me know and I'll swap the movement entirely.`;
    } else if (significantPain) {
      content =
        "Logged — significant discomfort flagged. I've noted it and I'm going to be conservative with loading in your next session. If you can tell me where it was coming from, I can adjust the specific movements rather than just pulling back across the board.";
    } else if (tooHard && drained) {
      content = `Tough one today — and it sounds like you felt it afterward. I'm not going to push the load higher next session. Your body's telling you something, and the smart move right now is to hold where you are until you feel more recovered. The fitness is still building even when it doesn't feel like it.`;
    } else if (tooHard) {
      content = `Hard session — noted${areaText ? `, along with some discomfort in your ${areaText}` : ""}. I'll hold the current load rather than stepping it up until things settle. Forcing progression when it's already difficult usually just adds accumulated fatigue.`;
    } else if (moderatePain && hasPainAreas) {
      content = `Logged — moderate discomfort in your ${areaText}. I've flagged that area and I'll monitor the loading patterns that put stress on it. If it comes up again, mention it and I'll swap to a less aggravating movement.`;
    } else if (tooEasy && energized) {
      content = "You had clearly more in the tank today than the session asked for. That's a useful signal — I'll bump the challenge up a touch next time. A small increment now keeps you progressing rather than just going through the motions.";
    } else if (lowEnjoyment) {
      content = `Logged — but I noticed low enjoyment this time. If that keeps coming up I'll look at adjusting the exercise mix or the session format. Training you don't want to do doesn't last long.${notes?.trim() ? ` Notes: "${notes.trim().slice(0, 120)}"` : ""}`;
    } else if (drained) {
      content = "Logged — energy was low after this one. I'm not stepping the load up next session. Let recovery do its job first, then we build.";
    } else {
      const diffNote =
        difficulty == null ? ""
        : difficulty <= 2 ? " It felt comfortable — well within your range."
        : difficulty === 3 ? " It hit the right zone."
        : " It was appropriately challenging.";
      const painNote =
        !anyPain ? " No discomfort reported."
        : pain === 2 ? " Minor discomfort — nothing to flag."
        : "";
      content = `Logged.${diffNote}${painNote} Consistent sessions like this are what compound into real results.${notes?.trim() ? ` Notes: "${notes.trim().slice(0, 120)}"` : ""}`;
    }

    const structuredData = JSON.stringify({
      _type: "session_logged",
      sessionStatus,
      difficultyScore: difficulty ?? null,
      energyScore: energy ?? null,
      painScore: pain ?? null,
      enjoymentScore: enjoyment ?? null,
      painAreas: hasPainAreas ? painAreas : null,
    });

    await db.insert(messagesTable).values({
      conversationId: recentConvo.id,
      role: "assistant",
      content,
      structuredData,
    });
    await db
      .update(conversationsTable)
      .set({ updatedAt: new Date() })
      .where(eq(conversationsTable.id, recentConvo.id));
  } catch {
    // Non-fatal — session log is already saved
  }
}

async function updateSessionAgentMemory(
  userId: number,
  data: {
    sessionStatus: string;
    difficultyScore?: number | null;
    energyScore?: number | null;
    painScore?: number | null;
    enjoymentScore?: number | null;
    painAreas?: string[] | null;
    notes?: string | null;
  }
): Promise<void> {
  try {
    const [system] = await db
      .select({ id: trainingSystems.id, metadata: trainingSystems.metadata })
      .from(trainingSystems)
      .where(eq(trainingSystems.userId, userId))
      .limit(1);
    if (!system) return;

    const meta = (system.metadata ?? {}) as Record<string, unknown>;
    const existingMemory = (meta.agentMemory ?? {}) as Record<string, unknown>;

    const performance =
      data.difficultyScore == null ? "unknown"
      : data.difficultyScore <= 2 ? "below_target"
      : data.difficultyScore >= 4 ? "above_target"
      : "on_target";

    const fatigueSignal =
      data.energyScore == null ? "unknown"
      : data.energyScore <= 2 ? "high"
      : data.energyScore >= 4 ? "low"
      : "neutral";

    const enjoymentSignal =
      data.enjoymentScore == null ? "unknown"
      : data.enjoymentScore <= 2 ? "low"
      : data.enjoymentScore >= 4 ? "high"
      : "neutral";

    const painSignal =
      data.painScore == null ? "unknown"
      : data.painScore <= 1 ? "none"
      : data.painScore === 2 ? "mild"
      : data.painScore === 3 ? "moderate"
      : "significant_or_severe";

    // Derive next-session intent from combined signals
    const tooHard = (data.difficultyScore ?? 0) >= 4;
    const drained = (data.energyScore ?? 3) <= 2 && data.energyScore != null;
    const tooEasy = (data.difficultyScore ?? 0) <= 2 && data.difficultyScore != null;
    const energized = (data.energyScore ?? 0) >= 4;
    const hasSeriousPain = (data.painScore ?? 0) >= 4;
    const skipped = data.sessionStatus === "skipped";
    const partial = data.sessionStatus === "partial";

    let nextSessionIntent: string;
    if (hasSeriousPain) {
      nextSessionIntent = "pain_aware";
    } else if (skipped || partial) {
      nextSessionIntent = "hold_progression";
    } else if (tooHard && drained) {
      nextSessionIntent = "soften_load";
    } else if (tooEasy && energized) {
      nextSessionIntent = "progress";
    } else {
      nextSessionIntent = "continue_on_plan";
    }

    const updatedMemory = {
      ...existingMemory,
      performance,
      fatigueSignal,
      enjoymentSignal,
      painSignal,
      nextSessionIntent,
      lastSessionPerformance: {
        status: data.sessionStatus,
        difficulty: data.difficultyScore ?? null,
        energy: data.energyScore ?? null,
        pain: data.painScore ?? null,
        enjoyment: data.enjoymentScore ?? null,
        painAreas: data.painAreas ?? null,
        notes: data.notes ? data.notes.slice(0, 300) : null,
        loggedAt: new Date().toISOString(),
      },
    };

    await db
      .update(trainingSystems)
      .set({ metadata: { ...meta, agentMemory: updatedMemory } as any })
      .where(eq(trainingSystems.id, system.id));
  } catch {
    // Non-fatal
  }
}

/**
 * When pain areas are reported (score >= 3), write them directly to user_memories
 * so the AI coach knows about them in future sessions without needing to re-read logs.
 */
async function writePainAreasToMemory(
  userId: number,
  painScore: number,
  painAreas: string[]
): Promise<void> {
  if (painScore < 3 || painAreas.length === 0) return;
  const severity = painScore >= 5 ? "severe" : painScore >= 4 ? "significant" : "moderate";
  const confidence: 1 | 2 | 3 | 4 | 5 = painScore >= 5 ? 5 : painScore >= 4 ? 4 : 3;
  const MOVEMENT_FAMILIES: Record<string, string> = {
    knee: "high knee-stress movements (deep squats, jump landings) — favor hip-dominant alternatives",
    lower_back: "spinal loading under fatigue — prioritize hip hinge technique and core stability",
    shoulder: "aggressive overhead pressing and loaded internal rotation",
    hip: "deep hip flexion and high-rep hip-dominant exercises",
    elbow: "heavy elbow-loaded pulling or pressing — use neutral grip where possible",
    wrist: "heavy press movements with wrist extension — use neutral grip",
    ankle: "plyometrics and aggressive ankle-loaded movements",
    neck: "heavy axial loading and any exercise that causes neck strain",
    upper_back: "high-volume rowing under fatigue — monitor scapular stability",
  };
  await Promise.all(
    painAreas.map((area) => {
      const areaLabel = PAIN_AREA_LABELS[area] ?? area;
      const movementGuidance = MOVEMENT_FAMILIES[area];
      const detail = movementGuidance
        ? `User reported ${severity} pain in ${areaLabel} during a session. Avoid ${movementGuidance}.`
        : `User reported ${severity} pain in ${areaLabel} during a session. Monitor loading on movements that stress this area.`;
      return upsertMemory(userId, {
        type: "pain_pattern",
        subject: `${areaLabel} discomfort`,
        sentiment: "negative",
        confidence,
        source: "feedback",
        detail,
      });
    })
  );
}

/**
 * After a session is logged, check whether the user has completed ALL sessions
 * in the current training week.
 *
 * Progression rules:
 *  - Only advance when every non-rest training_session in the current week has a
 *    corresponding completed active_sessions record (matched by trainingSessionId).
 *  - Logging a single day never triggers advancement — all days must be done.
 *  - Falls back to calendar-week counting only when occurrence data is absent
 *    (legacy sessions without trainingSessionId stored).
 */
async function checkAndAutoAdvanceWeek(userId: number): Promise<void> {
  try {
    // Get active system
    const [system] = await db
      .select({ id: trainingSystems.id, weeklyFrequency: trainingSystems.weeklyFrequency, currentPhaseId: trainingSystems.currentPhaseId })
      .from(trainingSystems)
      .where(eq(trainingSystems.userId, userId))
      .limit(1);
    if (!system || !system.currentPhaseId) return;

    // Get current training week (must be status "current")
    const [currentPhaseRow] = await db
      .select({ id: trainingPhases.id })
      .from(trainingPhases)
      .where(and(
        eq(trainingPhases.id, system.currentPhaseId),
        eq(trainingPhases.status, "current")
      ))
      .limit(1);
    if (!currentPhaseRow) return;

    const [currentWeekRow] = await db
      .select({ id: trainingWeeks.id, weekNumber: trainingWeeks.weekNumber, status: trainingWeeks.status })
      .from(trainingWeeks)
      .where(and(
        eq(trainingWeeks.trainingPhaseId, currentPhaseRow.id),
        eq(trainingWeeks.status, "current")
      ))
      .limit(1);
    if (!currentWeekRow || currentWeekRow.status === "completed") return;

    // Get all non-rest training sessions for the current week
    const weekSessions = await db
      .select({ id: trainingSessions.id })
      .from(trainingSessions)
      .where(
        and(
          eq(trainingSessions.trainingWeekId, currentWeekRow.id),
          eq(trainingSessions.isRestDay, false)
        )
      );

    if (weekSessions.length === 0) return;
    const weekSessionIds = weekSessions.map((s) => s.id);

    // ── Occurrence-based check (new, correct path) ──────────────────────────
    // Look for completed active_sessions records keyed by this week's trainingSessionIds.
    const completedForWeek = await db
      .select({ trainingSessionId: activeSessionsTable.trainingSessionId })
      .from(activeSessionsTable)
      .where(
        and(
          eq(activeSessionsTable.userId, userId),
          eq(activeSessionsTable.status, "completed"),
          system.id != null ? eq(activeSessionsTable.trainingSystemId, system.id) : undefined,
          inArray(activeSessionsTable.trainingSessionId, weekSessionIds)
        )
      );

    const completedSessionIds = new Set(
      completedForWeek.map((r) => r.trainingSessionId).filter((id): id is number => id != null)
    );
    const allWeekSessionsDone = weekSessionIds.every((id) => completedSessionIds.has(id));

    // If occurrence data is present, use it exclusively.
    // Only fall back to the calendar heuristic when zero sessions have been
    // tracked with trainingSessionId (i.e. all legacy data).
    const hasOccurrenceData = completedSessionIds.size > 0;

    if (hasOccurrenceData) {
      if (!allWeekSessionsDone) {
        logger.info(
          { userId, completedCount: completedSessionIds.size, required: weekSessionIds.length, weekId: currentWeekRow.id },
          "[WeekAdvance] Not all sessions complete — holding at current week"
        );
        return;
      }
      // Fall through to advance
    } else {
      // ── Legacy fallback: calendar-week heuristic ──────────────────────────
      // Used only when no occurrence-scoped data exists yet.
      const weeklyFrequency = system.weeklyFrequency ?? 3;
      const now = new Date();
      const dayOfWeek = now.getDay();
      const daysFromMonday = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
      const monday = new Date(now);
      monday.setDate(now.getDate() - daysFromMonday);
      monday.setHours(0, 0, 0, 0);
      const nextMonday = new Date(monday);
      nextMonday.setDate(monday.getDate() + 7);

      const weekLogs = await db
        .select({ id: sessionLogsTable.id, sessionStatus: sessionLogsTable.sessionStatus })
        .from(sessionLogsTable)
        .where(
          and(
            eq(sessionLogsTable.userId, userId),
            gte(sessionLogsTable.completedAt, monday),
            lt(sessionLogsTable.completedAt, nextMonday)
          )
        );
      const activeSessionCount = weekLogs.filter((l) => l.sessionStatus !== "skipped").length;
      if (activeSessionCount < weeklyFrequency) {
        const sevenDaysAgo = new Date(now);
        sevenDaysAgo.setDate(now.getDate() - 6);
        sevenDaysAgo.setHours(0, 0, 0, 0);
        const rollingLogs = await db
          .select({ id: sessionLogsTable.id, sessionStatus: sessionLogsTable.sessionStatus })
          .from(sessionLogsTable)
          .where(
            and(
              eq(sessionLogsTable.userId, userId),
              gte(sessionLogsTable.completedAt, sevenDaysAgo),
              lt(sessionLogsTable.completedAt, nextMonday)
            )
          );
        const rollingCount = rollingLogs.filter((l) => l.sessionStatus !== "skipped").length;
        if (rollingCount < weeklyFrequency) return;
      }
      // Also require that we haven't done this already via occurrence path
    }

    // Advance to next week
    const advance = await advanceToNextWeek(userId);
    if (!advance) return;

    // Post chat acknowledgment for the transition
    const [recentConvo] = await db
      .select({ id: conversationsTable.id })
      .from(conversationsTable)
      .where(eq(conversationsTable.userId, userId))
      .orderBy(desc(conversationsTable.updatedAt))
      .limit(1);

    if (recentConvo) {
      let ackContent: string;
      if (advance.blockCompleted) {
        const phaseName = advance.completedPhaseName ?? "this block";
        ackContent = `Week ${advance.previousWeek.weekNumber} done — and that's all 4 weeks of ${phaseName} complete. Great work finishing this block. I'm building your next training phase now and it'll carry everything forward — your performance data, pain history, and adaptation signals all carry through.`;
      } else {
        const newW = advance.newWeek!;
        const focusLabel =
          newW.volumeLevel === "deload" ? "Deload Week"
          : newW.volumeLevel === "high" ? "High Volume Week"
          : newW.volumeLevel === "low" ? "Light Week"
          : `Week ${newW.weekNumber}`;
        const label = newW.label ? `${newW.label} (${focusLabel})` : focusLabel;
        ackContent = `Week ${advance.previousWeek.weekNumber} complete — moving you into ${label}. Same structure, same exercises, stepped up appropriately based on your performance this week.`;
      }

      await db.insert(messagesTable).values({
        conversationId: recentConvo.id,
        role: "assistant",
        content: ackContent,
        structuredData: JSON.stringify({
          _type: advance.blockCompleted ? "block_completed" : "week_advanced",
          fromWeek: advance.previousWeek.weekNumber,
          toWeek: advance.newWeek?.weekNumber ?? null,
          blockCompleted: advance.blockCompleted,
        }),
      });
      await db
        .update(conversationsTable)
        .set({ updatedAt: new Date() })
        .where(eq(conversationsTable.id, recentConvo.id));
    }

    // If block completed, auto-generate the continuation phase
    if (advance.blockCompleted) {
      generateContinuationPhase(userId, { mode: "next" }).catch(() => {});
    }
  } catch {
    // Non-fatal — session log already saved
  }
}

const router: IRouter = Router();

const CreateSessionLogBody = z.object({
  savedProgramId: z.number().optional(),
  trainingSystemId: z.number().optional(),
  trainingWeekId: z.number().optional(),
  trainingSessionId: z.number().optional(),
  conversationId: z.number().optional(),
  dayNumber: z.number().optional(),
  sessionType: z.string().default("workout"),
  completedAt: z.string().optional(),

  // Completion metadata
  sessionStatus: z.enum(["completed", "partial", "skipped", "rescheduled"]).default("completed"),
  actualDuration: z.number().optional(),

  // Scores (1-5)
  difficultyScore: z.number().min(1).max(5).optional(),
  painScore: z.number().min(1).max(5).optional(),
  energyScore: z.number().min(1).max(5).optional(),
  enjoymentScore: z.number().min(1).max(5).optional(),

  // Body areas with discomfort
  painAreas: z.array(z.string()).optional(),

  notes: z.string().optional(),
});

// ── Response profile / summary ────────────────────────────────────────────────
// Returns aggregated training behavior data (UserTrainingResponseProfile).
router.get("/session-logs/summary", requireAuth, async (req: any, res): Promise<void> => {
  const userId = req.session.userId!;
  const logs = await db
    .select()
    .from(sessionLogsTable)
    .where(eq(sessionLogsTable.userId, userId))
    .orderBy(desc(sessionLogsTable.completedAt))
    .limit(30);

  if (logs.length === 0) {
    res.json({ totalSessions: 0, message: "No sessions logged yet." });
    return;
  }

  const total = logs.length;
  const completed = logs.filter((l) => l.sessionStatus === "completed").length;
  const partial = logs.filter((l) => l.sessionStatus === "partial").length;
  const skipped = logs.filter((l) => l.sessionStatus === "skipped").length;
  const completionRate = Math.round((completed / total) * 100);

  const withDiff = logs.filter((l) => l.difficultyScore != null);
  const withPain = logs.filter((l) => l.painScore != null);
  const withEnergy = logs.filter((l) => l.energyScore != null);
  const withEnjoy = logs.filter((l) => l.enjoymentScore != null);
  const withDuration = logs.filter((l) => l.actualDuration != null);

  function average(vals: number[]): number | null {
    if (vals.length === 0) return null;
    return Math.round((vals.reduce((a, b) => a + b, 0) / vals.length) * 10) / 10;
  }

  const avgDifficulty = average(withDiff.map((l) => l.difficultyScore!));
  const avgPain = average(withPain.map((l) => l.painScore!));
  const avgEnergy = average(withEnergy.map((l) => l.energyScore!));
  const avgEnjoyment = average(withEnjoy.map((l) => l.enjoymentScore!));
  const avgActualDuration = average(withDuration.map((l) => l.actualDuration!));

  // Tally pain area frequency
  const areaCount: Record<string, number> = {};
  for (const log of logs) {
    if ((log.painScore ?? 0) >= 3 && log.painAreas) {
      for (const area of (log.painAreas as string[])) {
        areaCount[area] = (areaCount[area] ?? 0) + 1;
      }
    }
  }
  const frequentPainAreas = Object.entries(areaCount)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 3)
    .map(([area, count]) => ({ area, count }));

  res.json({
    totalSessions: total,
    completed,
    partial,
    skipped,
    completionRate,
    avgDifficulty,
    avgPain,
    avgEnergy,
    avgEnjoyment,
    avgActualDuration,
    frequentPainAreas,
    updatedAt: new Date().toISOString(),
  });
});

router.get("/session-logs", requireAuth, async (req: any, res): Promise<void> => {
  const userId = req.session.userId!;
  const logs = await db
    .select()
    .from(sessionLogsTable)
    .where(eq(sessionLogsTable.userId, userId))
    .orderBy(desc(sessionLogsTable.completedAt))
    .limit(50);

  res.json(
    logs.map((l) => ({
      id: l.id,
      savedProgramId: l.savedProgramId,
      dayNumber: l.dayNumber,
      sessionType: l.sessionType,
      completedAt: l.completedAt.toISOString(),
      sessionStatus: l.sessionStatus,
      difficultyScore: l.difficultyScore,
      painScore: l.painScore,
      energyScore: l.energyScore,
      enjoymentScore: l.enjoymentScore,
      actualDuration: l.actualDuration,
      painAreas: l.painAreas,
      notes: l.notes,
    }))
  );
});

router.post("/session-logs", requireAuth, async (req: any, res): Promise<void> => {
  const parsed = CreateSessionLogBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const userId = req.session.userId!;
  const data = parsed.data;

  // ── Duplicate prevention ─────────────────────────────────────────────────
  // When a specific trainingSessionId is provided, use it as the duplicate key
  // (occurrence-scoped — prevents re-logging the same specific session instance).
  // Otherwise fall back to savedProgramId + dayNumber scoping.
  const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000);
  if (data.trainingSessionId != null) {
    const [existing] = await db
      .select({ id: sessionLogsTable.id, sessionStatus: sessionLogsTable.sessionStatus })
      .from(sessionLogsTable)
      .where(
        and(
          eq(sessionLogsTable.userId, userId),
          eq(sessionLogsTable.trainingSessionId, data.trainingSessionId),
          gte(sessionLogsTable.completedAt, twoHoursAgo)
        )
      )
      .limit(1);

    if (existing) {
      logger.info({ userId, existingId: existing.id, trainingSessionId: data.trainingSessionId }, "[SessionLog] Duplicate (occurrence-scoped) — returning existing");
      res.status(200).json({
        id: existing.id,
        trainingSessionId: data.trainingSessionId,
        sessionStatus: existing.sessionStatus,
        completedAt: new Date().toISOString(),
        recap: null,
        adaptationApplied: false,
        duplicate: true,
      });
      return;
    }
  } else if (data.savedProgramId != null && data.dayNumber != null) {
    const [existing] = await db
      .select({ id: sessionLogsTable.id, sessionStatus: sessionLogsTable.sessionStatus })
      .from(sessionLogsTable)
      .where(
        and(
          eq(sessionLogsTable.userId, userId),
          eq(sessionLogsTable.savedProgramId, data.savedProgramId),
          eq(sessionLogsTable.dayNumber, data.dayNumber),
          gte(sessionLogsTable.completedAt, twoHoursAgo)
        )
      )
      .limit(1);

    if (existing) {
      logger.info({ userId, existingId: existing.id }, "[SessionLog] Duplicate log detected — returning existing");
      res.status(200).json({
        id: existing.id,
        savedProgramId: data.savedProgramId,
        dayNumber: data.dayNumber,
        sessionStatus: existing.sessionStatus,
        completedAt: new Date().toISOString(),
        recap: null,
        adaptationApplied: false,
        duplicate: true,
      });
      return;
    }
  }

  // ── Resolve trainingSystemId if not provided ─────────────────────────────
  let resolvedTrainingSystemId = data.trainingSystemId ?? null;
  if (!resolvedTrainingSystemId) {
    try {
      const [activeSystem] = await db
        .select({ id: trainingSystems.id })
        .from(trainingSystems)
        .where(eq(trainingSystems.userId, userId))
        .orderBy(desc(trainingSystems.createdAt))
        .limit(1);
      resolvedTrainingSystemId = activeSystem?.id ?? null;
    } catch { /* non-fatal */ }
  }

  // ── Save workout completion ───────────────────────────────────────────────
  const [log] = await db
    .insert(sessionLogsTable)
    .values({
      userId,
      savedProgramId: data.savedProgramId ?? null,
      trainingSystemId: resolvedTrainingSystemId,
      trainingWeekId: data.trainingWeekId ?? null,
      trainingSessionId: data.trainingSessionId ?? null,
      conversationId: data.conversationId ?? null,
      dayNumber: data.dayNumber ?? null,
      sessionType: data.sessionType,
      completedAt: data.completedAt ? new Date(data.completedAt) : new Date(),
      sessionStatus: data.sessionStatus,
      difficultyScore: data.difficultyScore ?? null,
      painScore: data.painScore ?? null,
      energyScore: data.energyScore ?? null,
      enjoymentScore: data.enjoymentScore ?? null,
      actualDuration: data.actualDuration ?? null,
      painAreas: data.painAreas ?? null,
      notes: data.notes ?? null,
    })
    .returning();

  // ── Mirror to session_feedback for adaptation engine ─────────────────────
  // The adaptation engine reads from session_feedback to compute training tolerance.
  // When a session has full feedback, mirror the key scores there too.
  if (
    data.sessionStatus !== "skipped" &&
    data.difficultyScore != null &&
    data.painScore != null &&
    data.energyScore != null
  ) {
    try {
      await db.insert(sessionFeedbackTable).values({
        userId,
        savedProgramId: data.savedProgramId ?? null,
        difficultyScore: Math.round(data.difficultyScore),
        painResponseScore: Math.round(data.painScore),
        energyResponseScore: Math.round(data.energyScore),
        notes: data.notes ?? null,
      });
    } catch {
      // Non-fatal — session log already saved
    }
  }

  // ── Run evaluation and build session recap ────────────────────────────────
  const recap = evaluateWorkoutCompletion({
    sessionStatus: data.sessionStatus,
    difficultyScore: data.difficultyScore,
    painScore: data.painScore,
    energyScore: data.energyScore,
    enjoymentScore: data.enjoymentScore,
    actualDuration: data.actualDuration,
    painAreas: data.painAreas,
    notes: data.notes,
  });

  // ── Write change log note for significant flags ───────────────────────────
  // Non-fatal: if no active system, skip.
  const significantFlags = recap.flags.filter((f) => f.type === "pain_trigger" || f.type === "overload");
  if (significantFlags.length > 0) {
    try {
      const activeSystem = await db
        .select({ id: trainingSystems.id })
        .from(trainingSystems)
        .where(eq(trainingSystems.userId, userId))
        .orderBy(desc(trainingSystems.createdAt))
        .limit(1)
        .then((rows) => rows[0] ?? null);

      if (activeSystem) {
        const changeSummary = significantFlags
          .map((f) => f.detail)
          .join("; ");
        await db.insert(systemChangeLog).values({
          userId,
          trainingSystemId: activeSystem.id,
          source: "workout_feedback",
          intent: "session_signal",
          scope: "session",
          changeSummary: `Workout feedback signal: ${changeSummary}`,
          isMajorVersion: false,
        });
      }
    } catch {
      // Non-fatal — recap already built
    }
  }

  // ── Pipeline: chat ack + agent memory + memory sync (fire-and-forget) ───────
  // All non-fatal — session log is already saved and recap returned.

  postSessionAckToChat(userId, data.sessionStatus, {
    difficulty: data.difficultyScore,
    energy: data.energyScore,
    pain: data.painScore,
    enjoyment: data.enjoymentScore,
    painAreas: data.painAreas,
    notes: data.notes,
  }).catch(() => {});

  updateSessionAgentMemory(userId, {
    sessionStatus: data.sessionStatus,
    difficultyScore: data.difficultyScore,
    energyScore: data.energyScore,
    painScore: data.painScore,
    enjoymentScore: data.enjoymentScore,
    painAreas: data.painAreas,
    notes: data.notes,
  }).catch(() => {});

  // Write pain area memories directly so AI coach knows about them immediately
  if (data.painScore != null && data.painScore >= 3 && data.painAreas && data.painAreas.length > 0) {
    writePainAreasToMemory(userId, data.painScore, data.painAreas).catch(() => {});
  }

  // Full memory sync — picks up adherence, volume, enjoyment, and pain patterns
  syncMemoriesFromData(userId).catch(() => {});

  // Auto-advance week if user has hit their weekly session target
  checkAndAutoAdvanceWeek(userId).catch(() => {});

  // ── UPGRADE PIPELINE ─────────────────────────────────────────────────────
  // Parts 3 + 2: Structured memory update — writes rolling metrics to user_memories
  // and persists fatigue/adherence patterns as governing memory signals.
  updateStructuredMemoryFromLog(userId, {
    sessionStatus: data.sessionStatus,
    difficultyScore: data.difficultyScore,
    painScore: data.painScore,
    energyScore: data.energyScore,
    enjoymentScore: data.enjoymentScore,
    painAreas: data.painAreas,
  }).catch(() => {});

  // Part 4: Next session intelligence — adjusts the upcoming session's
  // coaching notes and sets based on last session signals.
  applyNextSessionAdjustment(userId).catch(() => {});

  // Part 1: Predictive block projection — modifies FUTURE week volume/intensity
  // based on rolling performance trends (fires only when ≥4 sessions exist).
  buildBlockProjection(userId)
    .then(async (projection) => {
      if (projection) {
        await applyBlockProjectionToFutureWeeks(userId, projection);
      }
    })
    .catch(() => {});

  // ── Adaptation analyzer — runs async, emits change receipt ─────────────
  // Determines adjustment scope from rolling signals and writes a change receipt
  // if a meaningful adaptation is warranted. Result included in response.
  let adaptationResult: Awaited<ReturnType<typeof analyzeSessionLogAdaptation>> | null = null;
  try {
    adaptationResult = await analyzeSessionLogAdaptation(
      userId,
      {
        sessionStatus: data.sessionStatus,
        difficultyScore: data.difficultyScore,
        energyScore: data.energyScore,
        painScore: data.painScore,
        enjoymentScore: data.enjoymentScore,
        painAreas: data.painAreas,
        notes: data.notes,
      },
      resolvedTrainingSystemId
    );
  } catch { /* non-fatal */ }

  logger.info(
    {
      userId,
      logId: log.id,
      adaptationApplied: adaptationResult?.adaptationApplied ?? false,
      adjustmentScope: adaptationResult?.recommendedAdjustmentScope ?? "none",
      predictiveAdaptation: true,
      memoryDominance: true,
      nextSessionAdjustment: true,
      blockContinuationIntelligent: true,
    },
    "[SessionLog] Session logged with adaptation analysis"
  );

  res.status(201).json({
    id: log.id,
    savedProgramId: log.savedProgramId,
    dayNumber: log.dayNumber,
    sessionStatus: log.sessionStatus,
    completedAt: log.completedAt.toISOString(),
    recap,
    adaptationApplied: adaptationResult?.adaptationApplied ?? false,
    adaptationScope: adaptationResult?.recommendedAdjustmentScope ?? "none",
    adjustmentReason: adaptationResult?.adjustmentReason ?? null,
  });
});

// ── POST /api/session-logs/complete — save a full session + run progression ────

const CompleteSessionBody = z.object({
  savedProgramId: z.number().optional(),
  dayNumber: z.number().optional(),
  goal: z.string().default("general_fitness"),
  perceivedDifficulty: z.enum(["too_easy", "just_right", "too_hard"]).optional(),
  /** Pain level for the session overall */
  painLevel: z.enum(["none", "mild", "moderate", "significant", "severe"]).optional(),
  /** Free-text pain notes — used to flag relevant exercises */
  painNotes: z.string().optional(),
  notes: z.string().optional(),
  sessionWasSkipped: z.boolean().optional(),
  exercises: z.array(
    z.object({
      exerciseName: z.string().min(1).max(200),
      exerciseRole: z.enum(["power", "compound", "unilateral", "accessory", "prep", "trunk"]).optional(),
      category: z.string().optional(),
      sets: z.array(
        z.object({
          setNumber: z.number(),
          weight: z.number().min(0).max(2000).nullable(),
          reps: z.number().min(0).max(200).nullable(),
          completed: z.boolean(),
        })
      ),
    })
  ),
  /** Accepted mid-session live adjustments — recorded in change log */
  liveAdjustments: z.array(
    z.object({
      exerciseName: z.string(),
      changeType: z.enum(["load_reduction", "load_increase", "volume_reduction", "rest_increase", "stop_exercise"]),
      oldValue: z.union([z.string(), z.number()]).nullable(),
      newValue: z.union([z.string(), z.number()]).nullable(),
      reason: z.string(),
      setAppliedAt: z.number(),
      acceptedByUser: z.boolean(),
    })
  ).optional(),
});

router.post("/session-logs/complete", requireAuth, async (req: any, res): Promise<void> => {
  const parsed = CompleteSessionBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const userId = req.session.userId!;
  const data = parsed.data;
  const now = new Date();

  const perceivedDifficulty = data.perceivedDifficulty as PerceivedDifficulty | undefined;
  const painLevel = data.painLevel as PainLevel | undefined;
  const goal = data.goal as any;

  // Map session-level difficulty to per-exercise completionStatus override
  const sessionCompletionStatus =
    perceivedDifficulty === "too_easy" ? "easy" :
    perceivedDifficulty === "too_hard" ? "hard" :
    "solid";

  // ── 1. Insert exercise_logs for all completed sets ─────────────────────────
  const exerciseInserts: Promise<any>[] = [];

  for (const ex of data.exercises) {
    const completedSets = ex.sets.filter((s) => s.completed);
    if (completedSets.length === 0) continue;

    for (const set of completedSets) {
      exerciseInserts.push(
        db.insert(exerciseLogsTable).values({
          userId,
          exerciseName: ex.exerciseName,
          programId: data.savedProgramId ?? null,
          dayNumber: data.dayNumber ?? null,
          orderIndex: set.setNumber - 1,
          loadUsed: set.weight,
          repsCompleted: set.reps,
          setsCompleted: 1,
          completionStatus: sessionCompletionStatus,
          exerciseRole: ex.exerciseRole ?? null,
        })
      );
    }
  }

  await Promise.all(exerciseInserts);

  // ── 2. Create session_log entry ────────────────────────────────────────────
  const difficultyScore =
    perceivedDifficulty === "too_easy" ? 2 :
    perceivedDifficulty === "too_hard" ? 4 :
    perceivedDifficulty === "just_right" ? 3 :
    null;

  const painScore =
    painLevel === "none" ? 1 :
    painLevel === "mild" ? 2 :
    painLevel === "moderate" ? 3 :
    painLevel === "significant" ? 4 :
    painLevel === "severe" ? 5 :
    null;

  const [sessionLog] = await db
    .insert(sessionLogsTable)
    .values({
      userId,
      savedProgramId: data.savedProgramId ?? null,
      dayNumber: data.dayNumber ?? null,
      sessionType: "workout",
      completedAt: now,
      sessionStatus: data.sessionWasSkipped ? "skipped" : "completed",
      difficultyScore,
      painScore,
      notes: data.notes ?? null,
    })
    .returning();

  // ── 3. Fetch 90-day exercise history for progression evaluation ─────────────
  const exerciseNames = data.exercises.map((e) => e.exerciseName);
  const progressions: string[] = [];

  if (data.sessionWasSkipped || exerciseNames.length === 0) {
    res.status(201).json({
      sessionLogId: sessionLog.id,
      completedAt: sessionLog.completedAt.toISOString(),
      progressions,
      exercisesLogged: 0,
    });
    return;
  }

  // Fetch recent logs for all exercises
  const ninetyDaysAgo = new Date(Date.now() - 90 * 86400000);
  let allLogs: any[] = [];
  try {
    const { exerciseLogsTable: elt } = await import("@workspace/db");
    const { gte: gteOp } = await import("drizzle-orm");
    allLogs = await db
      .select()
      .from(elt)
      .where(and(eq(elt.userId, userId), gteOp(elt.loggedAt, ninetyDaysAgo)))
      .orderBy(desc(elt.loggedAt))
      .limit(300);
  } catch {
    // Non-fatal
  }

  const logsByName = new Map<string, ExerciseLogEntry[]>();
  for (const log of allLogs) {
    const name = log.exerciseName.toLowerCase();
    if (!logsByName.has(name)) logsByName.set(name, []);
    logsByName.get(name)!.push({
      id: log.id,
      loadUsed: log.loadUsed,
      repsCompleted: log.repsCompleted,
      setsCompleted: log.setsCompleted,
      rpe: log.rpe,
      completionStatus: log.completionStatus as "easy" | "solid" | "hard" | "failed",
      exerciseRole: log.exerciseRole,
      loggedAt: log.loggedAt,
    });
  }

  // Build session exercise input for evaluator (exclude just-inserted logs)
  // The newly inserted logs will affect next session's query — for this evaluation
  // we use the pre-session history so the engine sees what was known before today.
  const sessionExInputs = data.exercises
    .filter((ex) => ex.sets.some((s) => s.completed))
    .map((ex) => ({
      exerciseName: ex.exerciseName,
      exerciseRole: (ex.exerciseRole as any) ?? "compound",
      category: ex.category,
      setsCompleted: ex.sets.filter((s) => s.completed).length,
      totalPrescribedSets: ex.sets.length,
      // Use history BEFORE this session (exclude logs inserted above)
      logs: (logsByName.get(ex.exerciseName.toLowerCase()) ?? []).filter(
        (l) => l.loggedAt < now
      ),
    }));

  // ── 4. Evaluate progression ────────────────────────────────────────────────
  let evaluation: Awaited<ReturnType<typeof evaluateSessionProgression>> | null = null;
  try {
    evaluation = evaluateSessionProgression(
      sessionExInputs,
      goal,
      null, // readinessScore — not available at session-complete time
      perceivedDifficulty ?? null,
      painLevel ?? null,
      data.sessionWasSkipped ?? false,
    );
  } catch {
    // Non-fatal
  }

  // ── 5. Find active training system for change log writes ───────────────────
  let activeSystemId: number | null = null;
  try {
    const activeSystem = await db
      .select({ id: trainingSystems.id })
      .from(trainingSystems)
      .where(eq(trainingSystems.userId, userId))
      .orderBy(desc(trainingSystems.createdAt))
      .limit(1)
      .then((rows) => rows[0] ?? null);
    activeSystemId = activeSystem?.id ?? null;
  } catch {
    // Non-fatal
  }

  // ── 6. Write progression changes to change_log + update program state ──────
  if (evaluation) {
    // Session-level deload flag
    if (evaluation.deloadRecommended && activeSystemId) {
      try {
        await db.insert(systemChangeLog).values({
          userId,
          trainingSystemId: activeSystemId,
          source: "workout_feedback",
          intent: "deload_signal",
          scope: "block",
          changeSummary: `Deload recommended: ${evaluation.deloadReason}`,
          isMajorVersion: false,
          decisionMetadata: {
            painLevel,
            perceivedDifficulty,
            whyChanged: evaluation.deloadReason,
          },
        });
      } catch { /* Non-fatal */ }
    }

    // Per-exercise progression decisions
    for (const ex of evaluation.exercises) {
      if (ex.status === "maintain") continue; // No-change — don't clutter the log

      const summary = buildProgressionChangeSummary(ex);
      progressions.push(summary);

      if (!activeSystemId) continue;

      const intent =
        ex.status === "progress" ? "auto_progression" :
        ex.status === "regress" ? "load_reduction" :
        "exercise_review";

      try {
        await db.insert(systemChangeLog).values({
          userId,
          trainingSystemId: activeSystemId,
          source: "workout_feedback",
          intent,
          scope: "exercise",
          changeSummary: summary,
          isMajorVersion: false,
          decisionMetadata: {
            exerciseName: ex.exerciseName,
            progressionType: ex.progressionType,
            status: ex.status,
            lastLoad: ex.recommendation.targetLoad !== null ? ex.recommendation.targetLoad - (ex.recommendation.loadChange ?? 0) : null,
            targetLoad: ex.recommendation.targetLoad,
            lastReps: ex.recommendation.targetReps !== null ? ex.recommendation.targetReps - (ex.recommendation.repsChange ?? 0) : null,
            targetReps: ex.recommendation.targetReps,
            loadChange: ex.recommendation.loadChange,
            repsChange: ex.recommendation.repsChange,
            painLevel: painLevel ?? null,
            perceivedDifficulty: perceivedDifficulty ?? null,
            flagForReview: ex.flagForReview,
            whyChanged: ex.reason,
          },
        });
      } catch { /* Non-fatal */ }

      // ── Write recommendation into future session_exercises metadata ─────────
      // Find the next occurrence of this exercise in the program (future sessions)
      if (data.savedProgramId && (ex.status === "progress" || ex.status === "regress")) {
        try {
          // Get all future session_exercises matching this name in the same program's system
          const futureExercises = await db
            .select({
              id: sessionExercises.id,
              metadata: sessionExercises.metadata,
            })
            .from(sessionExercises)
            .innerJoin(trainingSessions, eq(sessionExercises.trainingSessionId, trainingSessions.id))
            .innerJoin(trainingWeeks, eq(trainingSessions.trainingWeekId, trainingWeeks.id))
            .innerJoin(trainingPhases, eq(trainingWeeks.trainingPhaseId, trainingPhases.id))
            .innerJoin(trainingSystems, eq(trainingPhases.trainingSystemId, trainingSystems.id))
            .where(
              and(
                eq(trainingSystems.userId, userId),
                ilike(sessionExercises.name, ex.exerciseName),
              )
            )
            .limit(10);

          const progressionTarget = {
            targetLoad: ex.recommendation.targetLoad,
            targetReps: ex.recommendation.targetReps,
            loadChange: ex.recommendation.loadChange,
            repsChange: ex.recommendation.repsChange,
            unit: ex.recommendation.unit,
            reason: ex.reason,
            status: ex.status,
            progressionType: ex.progressionType,
            updatedAt: now.toISOString(),
          };

          for (const futureEx of futureExercises) {
            const existingMeta = (futureEx.metadata as Record<string, unknown>) ?? {};
            await db
              .update(sessionExercises)
              .set({ metadata: { ...existingMeta, progressionTarget } })
              .where(eq(sessionExercises.id, futureEx.id));
          }
        } catch { /* Non-fatal — program update is best-effort */ }
      }
    }
  }

  // ── 7. Run block-level evaluation (non-blocking — fires in background) ──────
  // Do not await — this is best-effort and must not delay the response.
  runBlockEvaluationAndLog(userId).catch(() => {});

  // ── 7b. Sync long-term coach memory (non-blocking — must not delay response) ─
  // Extracts session-level performance patterns and updates the memory store.
  syncMemoriesFromData(userId).catch(() => {});

  // ── 7c. Pipeline: chat ack + agent memory update (fire-and-forget) ───────────
  const completeStatus = data.sessionWasSkipped ? "skipped" : "completed";
  postSessionAckToChat(userId, completeStatus, {
    difficulty: difficultyScore,
    pain: painScore,
    notes: data.notes ?? null,
  }).catch(() => {});
  updateSessionAgentMemory(userId, {
    sessionStatus: completeStatus,
    difficultyScore,
    painScore,
  }).catch(() => {});

  // ── 8. Write accepted live adjustments to change log ───────────────────────
  if (data.liveAdjustments && data.liveAdjustments.length > 0 && activeSystemId) {
    for (const adj of data.liveAdjustments) {
      if (!adj.acceptedByUser) continue;
      const summary = adj.changeType === "load_reduction"
        ? `LIVE ADJUSTMENT — ${adj.exerciseName}: load reduced from ${adj.oldValue} → ${adj.newValue} lbs (set ${adj.setAppliedAt})`
        : adj.changeType === "load_increase"
        ? `LIVE ADJUSTMENT — ${adj.exerciseName}: load increased from ${adj.oldValue} → ${adj.newValue} lbs (set ${adj.setAppliedAt})`
        : adj.changeType === "volume_reduction"
        ? `LIVE ADJUSTMENT — ${adj.exerciseName}: volume reduced (${adj.oldValue} → ${adj.newValue})`
        : adj.changeType === "rest_increase"
        ? `LIVE ADJUSTMENT — ${adj.exerciseName}: extended rest applied (${adj.newValue})`
        : `LIVE ADJUSTMENT — ${adj.exerciseName}: exercise stopped early`;

      try {
        await db.insert(systemChangeLog).values({
          userId,
          trainingSystemId: activeSystemId,
          source: "workout_feedback",
          intent: adj.changeType === "load_increase" ? "auto_progression" : "load_reduction",
          scope: "exercise",
          changeSummary: summary,
          isMajorVersion: false,
          decisionMetadata: {
            exerciseName: adj.exerciseName,
            changeType: adj.changeType,
            oldValue: adj.oldValue,
            newValue: adj.newValue,
            setAppliedAt: adj.setAppliedAt,
            whyChanged: adj.reason,
            source: "mid_session_engine",
          },
        });
      } catch { /* Non-fatal */ }
    }
  }

  res.status(201).json({
    sessionLogId: sessionLog.id,
    completedAt: sessionLog.completedAt.toISOString(),
    progressions,
    exercisesLogged: data.exercises.filter(
      (e) => e.sets.some((s) => s.completed)
    ).length,
    sessionAdaptation: evaluation?.sessionAdaptation ?? null,
    deloadRecommended: evaluation?.deloadRecommended ?? false,
  });
});

export default router;
