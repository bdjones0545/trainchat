/**
 * Next Session Intelligence
 *
 * Reads the last 1-3 session logs and computes precise adjustments
 * for the NEXT scheduled training session. Applied fire-and-forget
 * after each session log.
 *
 * Changes are grounded in real signals:
 *   - Hard session + drained          → reduce sets, add rest note
 *   - Hard + still had energy         → maintain + rest note
 *   - Easy + energized (2+ sessions)  → bump sets up
 *   - Pain flagged                    → conservative notes + pattern warnings
 *   - Skipped last session            → maintain, just get back to it
 *   - No meaningful signal            → return "none" (don't add noise)
 */

import {
  db,
  sessionLogsTable,
  trainingSystems,
  trainingWeeks,
  trainingSessions,
  sessionExercises,
} from "@workspace/db";
import { eq, and, desc } from "drizzle-orm";
import { logger } from "./logger";

// ─── Types ─────────────────────────────────────────────────────────────────

export interface NextSessionAdjustment {
  adjustmentType: "reduce" | "maintain" | "progress" | "none";
  setDelta: number;         // -1, 0, or +1
  addRestNote: boolean;
  coachingNote: string;
  painAreaNotes: string[];
}

// ─── Speed-specific coaching note builder ──────────────────────────────────

function buildSpeedCoachingNote(
  scenario: "pain" | "fatigue" | "hard_with_energy" | "progress" | "skipped",
  painAreas: string[]
): { coachingNote: string; painAreaNotes: string[] } {
  switch (scenario) {
    case "pain": {
      const areaText = painAreas.length > 0 ? ` in your ${painAreas.join(" and ")}` : "";
      return {
        coachingNote: `Discomfort flagged${areaText} last session. I've protected the sprint and COD families this session — keeping the quality there but removing the highest-load exposures. Move at a level that feels clean, not pushed.`,
        painAreaNotes: painAreas.map((a) => `Reduce intensity on ${a}-related sprint and deceleration movements — stop if it flares`),
      };
    }
    case "fatigue":
      return {
        coachingNote: "Last session was taxing and you left drained — CNS fatigue affects speed quality more than anything. I've trimmed sprint volume and pulled back intent this session. Sub-maximal quality work is the target, not max-effort output.",
        painAreaNotes: [],
      };
    case "hard_with_energy":
      return {
        coachingNote: "Tough session but you had fuel left. Same session structure today — extend your recovery periods between efforts rather than cutting sprint volume. Rest is part of the quality.",
        painAreaNotes: [],
      };
    case "progress":
      return {
        coachingNote: "Last couple sessions have felt well within your capacity. You're absorbing the work well — I've added a sprint rep and bumped the quality target slightly. Match the effort with full recovery between.",
        painAreaNotes: [],
      };
    case "skipped":
      return {
        coachingNote: "Last session was skipped — getting back to the planned speed work is the priority. Same session structure. Don't force extra intensity to compensate.",
        painAreaNotes: [],
      };
  }
}

// ─── Core logic ────────────────────────────────────────────────────────────

export async function buildNextSessionAdjustment(
  userId: number,
  focusMode?: string | null
): Promise<NextSessionAdjustment | null> {
  const recentLogs = await db
    .select({
      sessionStatus: sessionLogsTable.sessionStatus,
      difficultyScore: sessionLogsTable.difficultyScore,
      painScore: sessionLogsTable.painScore,
      energyScore: sessionLogsTable.energyScore,
      painAreas: sessionLogsTable.painAreas,
      enjoymentScore: sessionLogsTable.enjoymentScore,
    })
    .from(sessionLogsTable)
    .where(eq(sessionLogsTable.userId, userId))
    .orderBy(desc(sessionLogsTable.completedAt))
    .limit(3);

  if (recentLogs.length === 0) return null;

  const last = recentLogs[0];
  const prev = recentLogs.slice(1).filter((l) => l.sessionStatus !== "skipped");

  const isSpeedMode = focusMode === "speed";

  if (last.sessionStatus === "skipped") {
    if (isSpeedMode) {
      const notes = buildSpeedCoachingNote("skipped", []);
      return { adjustmentType: "maintain", setDelta: 0, addRestNote: false, ...notes };
    }
    return {
      adjustmentType: "maintain",
      setDelta: 0,
      addRestNote: false,
      coachingNote:
        "Last session was skipped — getting back to the planned work is the priority. Same structure as planned.",
      painAreaNotes: [],
    };
  }

  const difficulty = last.difficultyScore ?? 3;
  const energy = last.energyScore ?? 3;
  const pain = last.painScore ?? 1;
  const painAreas = (last.painAreas ?? []) as string[];

  const allDiffs = [difficulty, ...prev.map((l) => l.difficultyScore ?? 3)];
  const rollingDiff = allDiffs.reduce((a, b) => a + b, 0) / allDiffs.length;

  const fatigueScore = (difficulty + (6 - energy)) / 2;

  // ── Decision tree ────────────────────────────────────────────────────────

  if (pain >= 4) {
    if (isSpeedMode) {
      const notes = buildSpeedCoachingNote("pain", painAreas);
      return { adjustmentType: "reduce", setDelta: -1, addRestNote: true, ...notes };
    }
    const areaText =
      painAreas.length > 0
        ? ` in your ${painAreas.join(" and ")}`
        : "";
    return {
      adjustmentType: "reduce",
      setDelta: -1,
      addRestNote: true,
      coachingNote: `Significant discomfort was flagged last session${areaText}. Same structure today but I've pulled the volume back slightly — quality movement while that resolves.`,
      painAreaNotes: painAreas.map((a) => `Manage load carefully on ${a}-related movements — back off if it flares`),
    };
  }

  if (fatigueScore >= 4.2 && rollingDiff >= 3.8) {
    if (isSpeedMode) {
      const notes = buildSpeedCoachingNote("fatigue", []);
      return { adjustmentType: "reduce", setDelta: -1, addRestNote: true, ...notes };
    }
    return {
      adjustmentType: "reduce",
      setDelta: -1,
      addRestNote: true,
      coachingNote:
        "Your last session was tough and you left feeling drained. I've trimmed this one slightly — same exercises, a little less volume, a bit more rest. Keep quality high and let the body catch up.",
      painAreaNotes: [],
    };
  }

  if (difficulty >= 4 && energy >= 3) {
    if (isSpeedMode) {
      const notes = buildSpeedCoachingNote("hard_with_energy", []);
      return { adjustmentType: "maintain", setDelta: 0, addRestNote: true, ...notes };
    }
    return {
      adjustmentType: "maintain",
      setDelta: 0,
      addRestNote: true,
      coachingNote:
        "Last session was hard but you had the energy for it. Same plan today — stretch your rest periods if you need to rather than cutting volume.",
      painAreaNotes: [],
    };
  }

  if (pain >= 3 && painAreas.length > 0) {
    if (isSpeedMode) {
      const notes = buildSpeedCoachingNote("pain", painAreas);
      return { adjustmentType: "maintain", setDelta: 0, addRestNote: false, ...notes };
    }
    return {
      adjustmentType: "maintain",
      setDelta: 0,
      addRestNote: false,
      coachingNote: `Moderate discomfort noted in your ${painAreas.join(" and ")} last session. Same plan today — be mindful of those areas and dial back any exercise that aggravates them.`,
      painAreaNotes: painAreas.map((a) => `Reduce intensity on ${a}-related movements if uncomfortable`),
    };
  }

  if (difficulty <= 2 && energy >= 4 && rollingDiff <= 2.5 && prev.length >= 1) {
    if (isSpeedMode) {
      const notes = buildSpeedCoachingNote("progress", []);
      return { adjustmentType: "progress", setDelta: 1, addRestNote: false, ...notes };
    }
    return {
      adjustmentType: "progress",
      setDelta: 1,
      addRestNote: false,
      coachingNote:
        "Your last couple of sessions have felt well within your capacity — you're ahead of the curve. I've bumped this one up a touch to match where you actually are.",
      painAreaNotes: [],
    };
  }

  // No meaningful signal — don't add noise
  return {
    adjustmentType: "none",
    setDelta: 0,
    addRestNote: false,
    coachingNote: "",
    painAreaNotes: [],
  };
}

export async function applyNextSessionAdjustment(userId: number, focusMode?: string | null): Promise<void> {
  const [system] = await db
    .select({ id: trainingSystems.id, currentPhaseId: trainingSystems.currentPhaseId, metadata: trainingSystems.metadata })
    .from(trainingSystems)
    .where(and(eq(trainingSystems.userId, userId), eq(trainingSystems.status, "active")))
    .limit(1);

  if (!system?.currentPhaseId) return;

  const resolvedFocusMode = focusMode ?? ((system.metadata as Record<string, unknown>)?.focusMode as string | null) ?? null;
  const adjustment = await buildNextSessionAdjustment(userId, resolvedFocusMode);
  if (!adjustment || adjustment.adjustmentType === "none" || !adjustment.coachingNote) return;

  const [currentWeek] = await db
    .select()
    .from(trainingWeeks)
    .where(
      and(
        eq(trainingWeeks.trainingPhaseId, system.currentPhaseId),
        eq(trainingWeeks.status, "current")
      )
    )
    .limit(1);

  if (!currentWeek) return;

  const todayDow = new Date().getDay();

  const sessions = await db
    .select()
    .from(trainingSessions)
    .where(and(eq(trainingSessions.trainingWeekId, currentWeek.id), eq(trainingSessions.isRestDay, false)))
    .orderBy(trainingSessions.dayOfWeek);

  // Next session = next scheduled day after today, or first of the week if none left
  const nextSession =
    sessions.find((s) => (s.dayOfWeek ?? -1) > todayDow) ?? sessions[0] ?? null;

  if (!nextSession) return;

  // Idempotency: skip if already adjusted
  if (nextSession.coachingNotes?.includes("[adj]")) return;

  const marker = "[adj]";
  const newNotes = nextSession.coachingNotes
    ? `${nextSession.coachingNotes} ${marker} ${adjustment.coachingNote}`
    : `${marker} ${adjustment.coachingNote}`;

  await db
    .update(trainingSessions)
    .set({ coachingNotes: newNotes.slice(0, 500) })
    .where(eq(trainingSessions.id, nextSession.id));

  // Apply set / rest adjustments
  if (adjustment.setDelta !== 0 || adjustment.addRestNote || adjustment.painAreaNotes.length > 0) {
    const exercises = await db
      .select()
      .from(sessionExercises)
      .where(eq(sessionExercises.trainingSessionId, nextSession.id));

    for (const ex of exercises) {
      const isPrimary =
        ex.category === "primary" ||
        ex.category === "power" ||
        ex.category === "secondary";

      let newSets = ex.sets ?? 3;
      let newNotes = ex.notes ?? null;

      if (adjustment.setDelta < 0 && isPrimary && newSets > 2) {
        newSets = Math.max(2, newSets + adjustment.setDelta);
      } else if (adjustment.setDelta > 0 && isPrimary && newSets < 5) {
        newSets = Math.min(5, newSets + adjustment.setDelta);
      }

      if (adjustment.addRestNote && ex.rest) {
        const restStr = ex.rest.toString();
        if (/\d+/.test(restStr)) {
          const secs = parseInt(restStr, 10);
          if (secs <= 75) {
            newNotes = newNotes
              ? `${newNotes} — rest longer if needed`
              : "Rest longer if needed";
          }
        }
      }

      if (newSets !== ex.sets || newNotes !== ex.notes) {
        await db
          .update(sessionExercises)
          .set({ sets: newSets, notes: newNotes })
          .where(eq(sessionExercises.id, ex.id));
      }
    }
  }

  logger.info(
    {
      userId,
      sessionId: nextSession.id,
      adjustmentType: adjustment.adjustmentType,
      setDelta: adjustment.setDelta,
    },
    "[NextSessionIntelligence] Applied adjustment to next session"
  );
}
