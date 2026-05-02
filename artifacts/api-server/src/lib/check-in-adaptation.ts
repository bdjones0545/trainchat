/**
 * Check-In Adaptation Engine
 *
 * Evaluates daily readiness scores and returns a structured recommendation
 * for how the user's training should be adjusted — WITHOUT auto-applying.
 *
 * Architecture:
 * - Deterministic rules engine  → determines adaptation mode (consistent, safe)
 * - ReadinessScore builder      → computes readinessLevel + fatigueRisk
 * - EditPlan builder (rules)    → generates targeted DB changes for the mode
 * - applyCheckInEditPlan        → writes changes only when user confirms
 * - createChangeLogEntry        → logs the adaptation (source: "user_confirmed")
 *
 * Called from POST /api/readiness after the check-in row is saved.
 * Edits are applied only via POST /api/readiness/apply-adjustment (user-confirmed).
 */

import { getActiveTrainingSystem, getTodaySession } from "./training-system-service";
import { applyEditPlan } from "./edit-engine";
import { createChangeLogEntry } from "./change-log-service";
import type { EditPlan } from "./edit-intent-service";
import { logger } from "./logger";
import { generateCoachReasoning, type FocusMode } from "./coach-reasoning-engine";
import { createCheckInAdjustmentEvent } from "./system-adjustment-service";

// ─── Types ────────────────────────────────────────────────────────────────────

export type AdaptationMode =
  | "TRAIN_AS_PLANNED"
  | "LIGHT_MODIFICATION"
  | "PAIN_MODIFICATION"
  | "RECOVERY_DELOAD"
  | "GREEN_LIGHT_PROGRESSION";

export type ReadinessLevel = "high" | "moderate" | "low";
export type FatigueRisk = "low" | "moderate" | "high";

export interface CheckInScores {
  sleepScore: number;      // 1-5 (1=terrible, 5=excellent)
  energyScore: number;     // 1-5 (1=empty, 5=peak)
  sorenessScore: number;   // 1-5 (1=none, 5=severe)  — HIGHER is WORSE
  stressScore: number;     // 1-5 (1=low, 5=very high) — HIGHER is WORSE
  motivationScore: number; // 1-5 (1=none, 5=pumped)
  painScore: number;       // 1-5 (1=none, 5=severe)   — HIGHER is WORSE
}

export interface ReadinessScore {
  sleep: number;
  energy: number;
  motivation: number;
  soreness: number;
  stress: number;
  composite: number;       // 6-30 scale
  readinessLevel: ReadinessLevel;
  fatigueRisk: FatigueRisk;
}

export interface AdaptationResult {
  mode: AdaptationMode;
  readiness: ReadinessScore;
  adjustmentSummary: string;
  coachMessage: string;
  coachExplanation: string;
  coachReasoning: string | null;
  hasActiveProgram: boolean;
  todaySessionId: number | null;
  changesApplied: number;
  changeLogId: number | null;
}

// ─── Readiness Score ─────────────────────────────────────────────────────────
// Converts all 6 dimensions into a single 6-30 composite score.
// Positive dims: sleep, energy, motivation. Negative dims inverted: soreness, stress, pain.

export function computeReadinessScore(s: CheckInScores): ReadinessScore {
  const composite =
    s.sleepScore +
    s.energyScore +
    s.motivationScore +
    (6 - s.sorenessScore) +
    (6 - s.stressScore) +
    (6 - s.painScore);

  const readinessLevel: ReadinessLevel =
    composite >= 22 ? "high"
    : composite >= 16 ? "moderate"
    : "low";

  // Fatigue risk: high soreness or stress, compounded by low sleep
  const highSoreness = s.sorenessScore >= 4;
  const highStress = s.stressScore >= 4;
  const poorSleep = s.sleepScore <= 2;
  const lowEnergy = s.energyScore <= 2;

  const fatigueRisk: FatigueRisk =
    (poorSleep && highSoreness) || (poorSleep && highStress) || (lowEnergy && highSoreness) || composite <= 14
      ? "high"
    : (highSoreness || highStress || poorSleep)
      ? "moderate"
    : "low";

  return {
    sleep: s.sleepScore,
    energy: s.energyScore,
    motivation: s.motivationScore,
    soreness: s.sorenessScore,
    stress: s.stressScore,
    composite,
    readinessLevel,
    fatigueRisk,
  };
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
    readiness.composite <= 14
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

// ─── Coach Message Builder ────────────────────────────────────────────────────
// One short coaching statement shown immediately after check-in saves.
// UX-first: coaching tone, never medical. No auto-change language.

function buildCoachMessage(mode: AdaptationMode, s: CheckInScores): string {
  switch (mode) {
    case "TRAIN_AS_PLANNED":
      return "You look ready for normal training today.";
    case "LIGHT_MODIFICATION":
      return s.sorenessScore >= 3
        ? "Soreness is elevated — I can make today more joint-friendly."
        : "Recovery looks a little low — I can reduce volume today.";
    case "PAIN_MODIFICATION":
      return "Pain flagged — I can adjust today's session to keep things comfortable.";
    case "RECOVERY_DELOAD":
      return "Recovery looks lower today. I can reduce load and keep quality high.";
    case "GREEN_LIGHT_PROGRESSION":
      return "Everything looks dialled in — great day to push for progression.";
  }
}

// ─── Summary Builders ─────────────────────────────────────────────────────────

function buildSummary(mode: AdaptationMode, s: CheckInScores): string {
  switch (mode) {
    case "TRAIN_AS_PLANNED":
      return "Training as planned today. Signals are solid.";
    case "LIGHT_MODIFICATION":
      return `Recovery a little lower today — energy ${s.energyScore}/5${s.sorenessScore >= 3 ? `, soreness ${s.sorenessScore}/5` : ""}${s.stressScore >= 3 ? `, stress ${s.stressScore}/5` : ""}. Primary work stays intact.`;
    case "PAIN_MODIFICATION":
      return `Pain flagged (${s.painScore}/5). Conservative loading recommended — avoid movements causing discomfort.`;
    case "RECOVERY_DELOAD":
      return `Recovery lower today — sleep ${s.sleepScore}/5, soreness ${s.sorenessScore}/5, energy ${s.energyScore}/5. Reducing load and keeping quality high.`;
    case "GREEN_LIGHT_PROGRESSION":
      return `All signals solid — sleep ${s.sleepScore}/5, energy ${s.energyScore}/5. Good day to push for progression.`;
  }
}

function buildCoachExplanation(mode: AdaptationMode, s: CheckInScores): string {
  switch (mode) {
    case "TRAIN_AS_PLANNED":
      return "Your readiness signals are in a good range today. Sleep, energy, and recovery are all working in your favour. Stick to the plan and hit your targets as prescribed.";
    case "LIGHT_MODIFICATION":
      return `Today's signals show manageable fatigue — ${s.sorenessScore >= 3 ? "some soreness, " : ""}${s.energyScore <= 3 ? "lower energy, " : ""}${s.stressScore >= 3 ? "elevated stress. " : ""}Let's keep quality high and reduce unnecessary fatigue. If you adjust, I'll cut one accessory set per movement — primary work stays untouched.`;
    case "PAIN_MODIFICATION":
      return `A pain level of ${s.painScore}/5 is worth respecting. If you adjust, I'll flag your session to keep loading conservative and steer clear of exercises that create discomfort. Smart modifications now protect long-term progress.`;
    case "RECOVERY_DELOAD":
      return `Recovery looks lower today. The combination of ${s.sleepScore <= 2 ? "poor sleep" : "disrupted sleep"}${s.sorenessScore >= 4 ? ", significant soreness" : ""}${s.stressScore >= 4 ? ", and high stress" : ""} signals accumulated fatigue. If you adjust, I'll reduce loads and keep the session useful — not just easy.`;
    case "GREEN_LIGHT_PROGRESSION":
      return `All signals are solid — excellent sleep, high energy, low soreness and stress. If you want to capitalise on this, I can update today's session notes to push for progression on your primary lifts.`;
  }
}

// ─── EditPlan Builder (deterministic) ─────────────────────────────────────────
// Builds the plan but does NOT apply it. Applied only on user confirmation.

export function buildEditPlanForMode(
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
              coachingNotes: `Check-in adjustment: recovery is lower today. Energy ${scores.energyScore}/5${scores.sorenessScore >= 3 ? `, soreness ${scores.sorenessScore}/5` : ""}. Keep all primary lifts — cut 1 set from accessory movements. Stop early if fatigue compounds quickly.`,
            },
          },
          {
            type: "update_week",
            id: currentWeek.id,
            updates: {
              notes: `Check-in: moderate fatigue signals. Trim 1 accessory set per session. Primary structure intact.`,
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
              coachingNotes: `Check-in adjustment: pain ${scores.painScore}/5 flagged. Reduce load on any movement causing discomfort. Use machines or controlled-ROM alternatives. If pain exceeds 3/10 during an exercise, skip it today.`,
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
              notes: `Check-in adjustment: sleep ${scores.sleepScore}/5, soreness ${scores.sorenessScore}/5, stress ${scores.stressScore}/5. Reducing loads to let the body rebuild. Quality over intensity this week.`,
            },
          },
          {
            type: "update_session",
            id: todaySession.id,
            updates: {
              coachingNotes: `Recovery session: today's signals say ease off. Do the session, but drop loads significantly. No PRs today — move well, stay mobile. The adaptation happens during rest.`,
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
              coachingNotes: `Green-light session: sleep ${scores.sleepScore}/5, energy ${scores.energyScore}/5, soreness ${scores.sorenessScore}/5. Conditions are excellent. If primary sets feel submaximal at 2+ RIR, add 2.5-5kg today. Chase the progression — your body is ready.`,
            },
          },
        ],
      };
  }
}

// ─── Evaluate (no auto-apply) ─────────────────────────────────────────────────
// Called on POST /api/readiness. Returns recommendation only — no DB edits.

export async function evaluateCheckIn(
  userId: number,
  readinessEntryId: number,
  scores: CheckInScores
): Promise<AdaptationResult | null> {
  try {
    const system = await getActiveTrainingSystem(userId);
    const mode = determineAdaptationMode(scores);
    const readiness = computeReadinessScore(scores);
    const adjustmentSummary = buildSummary(mode, scores);
    const coachMessage = buildCoachMessage(mode, scores);
    const coachExplanation = buildCoachExplanation(mode, scores);

    const systemFocusMode = ((system?.metadata as any)?.focusMode ?? "strength") as FocusMode;
    const coachReasoning = generateCoachReasoning({
      focusMode: systemFocusMode,
      actionType: "checkin",
      adaptationMode: mode,
    });

    const hasActiveProgram = !!system;
    let todaySessionId: number | null = null;

    if (system && mode !== "TRAIN_AS_PLANNED") {
      const todayData = await getTodaySession(userId).catch(() => null);
      todaySessionId = todayData?.id ?? null;
    }

    return {
      mode,
      readiness,
      adjustmentSummary,
      coachMessage,
      coachExplanation,
      coachReasoning,
      hasActiveProgram,
      todaySessionId,
      changesApplied: 0,
      changeLogId: null,
    };
  } catch (err) {
    logger.error({ err, userId }, "Check-in evaluation failed");
    return null;
  }
}

// ─── Apply Adjustment (user-confirmed) ───────────────────────────────────────
// Called only from POST /api/readiness/apply-adjustment when user confirms.

export async function applyCheckInAdjustment(
  userId: number,
  readinessEntryId: number,
  scores: CheckInScores,
  mode: AdaptationMode
): Promise<AdaptationResult | null> {
  try {
    const system = await getActiveTrainingSystem(userId);
    if (!system) return null;

    const readiness = computeReadinessScore(scores);
    const adjustmentSummary = buildSummary(mode, scores);
    const coachMessage = buildCoachMessage(mode, scores);
    const coachExplanation = buildCoachExplanation(mode, scores);

    const systemFocusMode = ((system.metadata as any)?.focusMode ?? "strength") as FocusMode;
    const coachReasoning = generateCoachReasoning({
      focusMode: systemFocusMode,
      actionType: "checkin",
      adaptationMode: mode,
    });

    if (mode === "TRAIN_AS_PLANNED") {
      return { mode, readiness, adjustmentSummary, coachMessage, coachExplanation, coachReasoning, hasActiveProgram: true, todaySessionId: null, changesApplied: 0, changeLogId: null };
    }

    const todayData = await getTodaySession(userId);
    if (!todayData) {
      logger.warn({ userId, mode }, "Apply check-in adjustment: no today session found");
      return { mode, readiness, adjustmentSummary, coachMessage, coachExplanation, coachReasoning, hasActiveProgram: true, todaySessionId: null, changesApplied: 0, changeLogId: null };
    }

    const editPlan = buildEditPlanForMode(mode, scores, todayData, todayData.currentWeek);
    if (!editPlan) {
      return { mode, readiness, adjustmentSummary, coachMessage, coachExplanation, coachReasoning, hasActiveProgram: true, todaySessionId: todayData.id, changesApplied: 0, changeLogId: null };
    }

    const editResult = await applyEditPlan(editPlan);

    const changeLogId = await createChangeLogEntry({
      userId,
      trainingSystemId: system.id,
      source: "auto_adjust",
      intent: editPlan.intent,
      scope: editPlan.scope,
      changeSummary: adjustmentSummary,
      requestText: `Daily check-in adjustment confirmed by user — mode: ${mode}`,
      beforeSnapshot: editResult.beforeSnapshot,
      afterSnapshot: editResult.afterSnapshot,
      appliedCount: editResult.appliedCount,
      skippedCount: editResult.skippedCount,
      decisionMetadata: { mode, scores, readinessEntryId },
    });

    logger.info({ userId, mode, changesApplied: editResult.appliedCount, changeLogId }, "Check-in adjustment applied (user confirmed)");

    createCheckInAdjustmentEvent({
      userId,
      trainingSystemId: system.id,
      focusMode: systemFocusMode,
      mode,
      scores,
    }).catch(() => {});

    return {
      mode,
      readiness,
      adjustmentSummary,
      coachMessage,
      coachExplanation,
      coachReasoning,
      hasActiveProgram: true,
      todaySessionId: todayData.id,
      changesApplied: editResult.appliedCount,
      changeLogId,
    };
  } catch (err) {
    logger.error({ err, userId }, "Check-in adjustment apply failed");
    return null;
  }
}

// ─── Legacy alias — kept for any remaining internal callers ───────────────────
export const evaluateAndAdapt = evaluateCheckIn;
