/**
 * Check-In Adaptation Engine
 *
 * Evaluates daily readiness scores and proactively adjusts the user's
 * active training system — without requiring them to ask.
 *
 * Architecture:
 * - Deterministic rules engine  → determines adaptation mode (consistent, safe)
 * - EditPlan builder (rules)    → generates targeted DB changes for the mode
 * - applyEditPlan               → writes the changes to the training DB
 * - createChangeLogEntry        → logs the adaptation (source: "auto_adjust")
 *
 * Called from POST /api/readiness after the check-in row is saved.
 */

import { getActiveTrainingSystem, getTodaySession } from "./training-system-service";
import { applyEditPlan } from "./edit-engine";
import { createChangeLogEntry } from "./change-log-service";
import type { EditPlan } from "./edit-intent-service";
import { logger } from "./logger";

// ─── Types ────────────────────────────────────────────────────────────────────

export type AdaptationMode =
  | "TRAIN_AS_PLANNED"
  | "LIGHT_MODIFICATION"
  | "PAIN_MODIFICATION"
  | "RECOVERY_DELOAD"
  | "GREEN_LIGHT_PROGRESSION";

export interface CheckInScores {
  sleepScore: number;      // 1-5 (1=terrible, 5=excellent)
  energyScore: number;     // 1-5 (1=empty, 5=peak)
  sorenessScore: number;   // 1-5 (1=none, 5=severe)  — HIGHER is WORSE
  stressScore: number;     // 1-5 (1=low, 5=very high) — HIGHER is WORSE
  motivationScore: number; // 1-5 (1=none, 5=pumped)
  painScore: number;       // 1-5 (1=none, 5=severe)   — HIGHER is WORSE
}

export interface AdaptationResult {
  mode: AdaptationMode;
  adjustmentSummary: string;
  coachExplanation: string;
  changesApplied: number;
  changeLogId: number | null;
}

// ─── Readiness Score ─────────────────────────────────────────────────────────
// Converts all 6 dimensions into a single 6-30 composite score.
// Positive dims: sleep, energy, motivation. Negative dims inverted: soreness, stress, pain.

function computeReadinessScore(s: CheckInScores): number {
  return (
    s.sleepScore +
    s.energyScore +
    s.motivationScore +
    (6 - s.sorenessScore) +
    (6 - s.stressScore) +
    (6 - s.painScore)
  );
}

// ─── Rules Engine ─────────────────────────────────────────────────────────────

export function determineAdaptationMode(s: CheckInScores): AdaptationMode {
  const readiness = computeReadinessScore(s);

  // PAIN_MODIFICATION — always prioritized: pain that should gate certain movements
  if (s.painScore >= 4) return "PAIN_MODIFICATION";

  // RECOVERY_DELOAD — severely compromised state (composite + individual triggers)
  if (
    (s.sleepScore <= 2 && s.stressScore >= 4) ||
    (s.sleepScore <= 2 && s.sorenessScore >= 4) ||
    (s.energyScore <= 2 && s.sorenessScore >= 4) ||
    readiness <= 14
  ) return "RECOVERY_DELOAD";

  // GREEN_LIGHT_PROGRESSION — all signals optimal
  if (
    s.sleepScore >= 4 &&
    s.energyScore >= 4 &&
    s.sorenessScore <= 2 &&
    s.stressScore <= 2 &&
    s.motivationScore >= 4 &&
    s.painScore <= 1
  ) return "GREEN_LIGHT_PROGRESSION";

  // LIGHT_MODIFICATION — one or more suboptimal signals
  if (
    s.energyScore <= 3 ||
    s.sorenessScore >= 3 ||
    s.stressScore >= 3 ||
    s.sleepScore <= 3
  ) return "LIGHT_MODIFICATION";

  return "TRAIN_AS_PLANNED";
}

// ─── Summary Builders ─────────────────────────────────────────────────────────

function buildSummary(mode: AdaptationMode, s: CheckInScores): string {
  switch (mode) {
    case "TRAIN_AS_PLANNED":
      return "Training as planned today. Signals are solid.";
    case "LIGHT_MODIFICATION":
      return `Volume adjusted — energy ${s.energyScore}/5${s.sorenessScore >= 3 ? `, soreness ${s.sorenessScore}/5` : ""}${s.stressScore >= 3 ? `, stress ${s.stressScore}/5` : ""}. Primary work stays intact.`;
    case "PAIN_MODIFICATION":
      return `Pain-modified session (${s.painScore}/5). Loading capped — avoid any exercise causing discomfort.`;
    case "RECOVERY_DELOAD":
      return `Auto-deload — sleep ${s.sleepScore}/5, soreness ${s.sorenessScore}/5, energy ${s.energyScore}/5. Pull back loads, prioritize recovery.`;
    case "GREEN_LIGHT_PROGRESSION":
      return `Green light — sleep ${s.sleepScore}/5, energy ${s.energyScore}/5. Push for progression today.`;
  }
}

function buildCoachExplanation(mode: AdaptationMode, s: CheckInScores): string {
  switch (mode) {
    case "TRAIN_AS_PLANNED":
      return "Your readiness signals are in a good range today. Sleep, energy, and recovery are all working in your favour. Stick to the plan and hit your targets as prescribed.";
    case "LIGHT_MODIFICATION":
      return `Today's signals show manageable fatigue — ${s.sorenessScore >= 3 ? "some soreness, " : ""}${s.energyScore <= 3 ? "lower energy, " : ""}${s.stressScore >= 3 ? "elevated stress. " : ". "}I've updated your session notes to guide you toward a slightly reduced accessory volume. Primary work stays — quality beats quantity on days like this.`;
    case "PAIN_MODIFICATION":
      return `A pain level of ${s.painScore}/5 is a signal worth respecting. I've flagged your session to keep loading conservative and steer clear of exercises that create discomfort. Smart modifications now protect long-term progress — don't push through it.`;
    case "RECOVERY_DELOAD":
      return `Your body is asking for recovery. The combination of ${s.sleepScore <= 2 ? "poor sleep" : "disrupted sleep"}${s.sorenessScore >= 4 ? ", significant soreness" : ""}${s.stressScore >= 4 ? ", and high stress" : ""} signals accumulated fatigue. I've set this week to deload mode — move well, cut loads 40-50%, and let your system rebuild.`;
    case "GREEN_LIGHT_PROGRESSION":
      return `All signals are green today — excellent sleep, high energy, low soreness and stress. This is the kind of day where real progress happens. I've updated your session notes to push you to reach for progression on your primary lifts if they feel submaximal.`;
  }
}

// ─── EditPlan Builder (deterministic) ─────────────────────────────────────────

function buildEditPlanForMode(
  mode: AdaptationMode,
  scores: CheckInScores,
  todaySession: { id: number; label: string },
  currentWeek: { id: number }
): EditPlan | null {
  const summary = buildSummary(mode, scores);

  switch (mode) {
    case "TRAIN_AS_PLANNED":
      return null;

    case "LIGHT_MODIFICATION":
      return {
        intent: "light_modification",
        scope: "session",
        changeSummary: summary,
        changes: [
          {
            type: "update_session",
            id: todaySession.id,
            updates: {
              coachingNotes: `Check-in adjustment (auto): slightly reduced volume today. Energy ${scores.energyScore}/5${scores.sorenessScore >= 3 ? `, soreness ${scores.sorenessScore}/5` : ""}. Keep all primary lifts — cut 1 set from accessory movements. Stop early if fatigue compounds quickly.`,
            },
          },
          {
            type: "update_week",
            id: currentWeek.id,
            updates: {
              notes: `Auto check-in: moderate fatigue signals this week. Trim 1 accessory set per session. Primary structure intact.`,
            },
          },
        ],
      };

    case "PAIN_MODIFICATION":
      return {
        intent: "pain_modification",
        scope: "session",
        changeSummary: summary,
        changes: [
          {
            type: "update_session",
            id: todaySession.id,
            updates: {
              emphasis: "Pain-modified — conservative loading",
              coachingNotes: `Check-in adjustment (auto): pain ${scores.painScore}/5 flagged. Reduce load on any movement causing discomfort. Use machines or controlled-ROM alternatives. If pain exceeds 3/10 during an exercise, skip it today. No ego lifting.`,
            },
          },
        ],
      };

    case "RECOVERY_DELOAD":
      return {
        intent: "recovery_deload",
        scope: "week",
        changeSummary: summary,
        changes: [
          {
            type: "update_week",
            id: currentWeek.id,
            updates: {
              volumeLevel: "deload",
              notes: `Auto-deload (check-in): sleep ${scores.sleepScore}/5, soreness ${scores.sorenessScore}/5, stress ${scores.stressScore}/5. Cut all session loads 40-50%, reduce sets ~40%. Quality over intensity — let the body recover.`,
            },
          },
          {
            type: "update_session",
            id: todaySession.id,
            updates: {
              coachingNotes: `Recovery session: your signals say ease off. Do the session, but drop loads significantly. No PRs today — move well, stay mobile. The adaptation happens during rest.`,
            },
          },
        ],
      };

    case "GREEN_LIGHT_PROGRESSION":
      return {
        intent: "progression_emphasis",
        scope: "session",
        changeSummary: summary,
        changes: [
          {
            type: "update_session",
            id: todaySession.id,
            updates: {
              coachingNotes: `Green-light session (auto): sleep ${scores.sleepScore}/5, energy ${scores.energyScore}/5, soreness ${scores.sorenessScore}/5. Conditions are excellent. If primary sets feel submaximal at 2+ RIR, add 2.5-5kg today. Chase the progression — your body is ready.`,
            },
          },
        ],
      };
  }
}

// ─── Main Entry Point ─────────────────────────────────────────────────────────

export async function evaluateAndAdapt(
  userId: number,
  readinessEntryId: number,
  scores: CheckInScores
): Promise<AdaptationResult | null> {
  try {
    const system = await getActiveTrainingSystem(userId);
    if (!system) return null;

    const mode = determineAdaptationMode(scores);
    const adjustmentSummary = buildSummary(mode, scores);
    const coachExplanation = buildCoachExplanation(mode, scores);

    if (mode === "TRAIN_AS_PLANNED") {
      return { mode, adjustmentSummary, coachExplanation, changesApplied: 0, changeLogId: null };
    }

    const todayData = await getTodaySession(userId);
    if (!todayData) {
      logger.warn({ userId, mode }, "Check-in adaptation: no today session found — returning mode only");
      return { mode, adjustmentSummary, coachExplanation, changesApplied: 0, changeLogId: null };
    }

    const editPlan = buildEditPlanForMode(mode, scores, todayData, todayData.currentWeek);
    if (!editPlan) {
      return { mode, adjustmentSummary, coachExplanation, changesApplied: 0, changeLogId: null };
    }

    const editResult = await applyEditPlan(editPlan);

    const changeLogId = await createChangeLogEntry({
      userId,
      trainingSystemId: system.id,
      source: "auto_adjust",
      intent: editPlan.intent,
      scope: editPlan.scope,
      changeSummary: adjustmentSummary,
      requestText: `Daily check-in auto-adaptation — mode: ${mode}`,
      beforeSnapshot: editResult.beforeSnapshot,
      afterSnapshot: editResult.afterSnapshot,
      appliedCount: editResult.appliedCount,
      skippedCount: editResult.skippedCount,
      decisionMetadata: { mode, scores, readinessEntryId },
    });

    logger.info({ userId, mode, changesApplied: editResult.appliedCount, changeLogId }, "Check-in adaptation applied");

    return {
      mode,
      adjustmentSummary,
      coachExplanation,
      changesApplied: editResult.appliedCount,
      changeLogId,
    };
  } catch (err) {
    logger.error({ err, userId }, "Check-in adaptation failed");
    return null;
  }
}
