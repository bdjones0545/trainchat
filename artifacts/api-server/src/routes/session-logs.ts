import { Router, type IRouter } from "express";
import { db, sessionLogsTable, sessionFeedbackTable, systemChangeLog, trainingSystems, exerciseLogsTable, sessionExercises, trainingSessions, trainingWeeks, trainingPhases, conversationsTable, messagesTable } from "@workspace/db";
import { eq, desc, and, ilike } from "drizzle-orm";
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
        "Got it — session skipped. Rest counts as part of the plan. If skipping becomes a pattern I can simplify your schedule or reduce training frequency to make it more executable.";
    } else if (significantPain && hasPainAreas) {
      content = `Got it — session logged. Significant pain flagged in your ${areaText}. I've recorded this and will avoid aggressive loading on that movement pattern in your upcoming sessions. If it continues, let me know and I can modify the exercise selection directly.`;
    } else if (significantPain) {
      content =
        "Got it — session logged. Significant discomfort was flagged. I've noted this and will keep loading conservative in your next session. If a specific area is causing the issue, mention it so I can adjust the movement selection.";
    } else if (tooHard && drained) {
      content = `Got it — session was tough and you're feeling drained. I've noted the overload signal. The next session will stay on plan structurally, but I'll hold progression and watch fatigue heading in. If this pattern continues across sessions I'll pull back volume slightly.`;
    } else if (tooHard) {
      content = `Got it — session felt hard. Noted${areaText ? ` along with discomfort in your ${areaText}` : ""}. I'll hold the current load rather than progressing until difficulty normalizes.`;
    } else if (moderatePain && hasPainAreas) {
      content = `Got it — session logged with moderate discomfort in your ${areaText}. I've flagged this area. I'll keep an eye on loading patterns that stress it and can substitute movements if it comes up again.`;
    } else if (tooEasy && energized) {
      content = "Good session — it felt easy and your energy is high. That's a clear progression signal. I'll bump up the challenge slightly next session — a small load or volume increment to match where your body actually is right now.";
    } else if (lowEnjoyment) {
      content = `Got it — session logged. Noted low enjoyment this time. If this continues across sessions I'll look at bringing in more exercise variety or adjusting the session format to keep it engaging.${notes?.trim() ? ` Notes: "${notes.trim().slice(0, 120)}"` : ""}`;
    } else if (drained) {
      content = "Got it — session logged. Energy is low after this one. I'll keep the next session from pushing harder than today — hold the current load and monitor recovery before applying any progression.";
    } else {
      const diffNote =
        difficulty == null ? ""
        : difficulty <= 2 ? " It felt within your capacity."
        : difficulty === 3 ? " It hit the target zone."
        : " It was appropriately challenging.";
      const painNote =
        !anyPain ? " No pain reported."
        : pain === 2 ? " Minor discomfort noted — nothing flagged."
        : "";
      content = `Got it — session logged as ${sessionStatus}.${diffNote}${painNote} Keep showing up consistently — that's what drives results.${notes?.trim() ? ` Notes: "${notes.trim().slice(0, 120)}"` : ""}`;
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

const router: IRouter = Router();

const CreateSessionLogBody = z.object({
  savedProgramId: z.number().optional(),
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

  // ── Save workout completion ───────────────────────────────────────────────
  const [log] = await db
    .insert(sessionLogsTable)
    .values({
      userId,
      savedProgramId: data.savedProgramId ?? null,
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

  res.status(201).json({
    id: log.id,
    savedProgramId: log.savedProgramId,
    dayNumber: log.dayNumber,
    sessionStatus: log.sessionStatus,
    completedAt: log.completedAt.toISOString(),
    recap,
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
  }, data.notes).catch(() => {});
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
