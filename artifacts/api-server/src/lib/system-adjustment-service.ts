/**
 * System Adjustment Service
 *
 * Creates, queries, and manages visible SystemAdjustmentEvents —
 * the human-facing layer that shows users what TrainChat has adapted.
 *
 * Design principles:
 * - Only meaningful, user-visible events get persisted
 * - Focus-mode awareness: events are sorted by relevance to active focus
 * - Audit logging: every create / display action is logged
 * - Non-blocking: failures never break the calling pipeline
 */

import { db } from "@workspace/db";
import { systemAdjustmentEventsTable } from "@workspace/db";
import { eq, desc, and, inArray } from "drizzle-orm";
import { logger } from "./logger";

// ─── Types ────────────────────────────────────────────────────────────────────

export type FocusMode = "strength" | "speed" | "mobility";

export type AdjustmentScope = "session" | "week" | "block" | "system";

export type AdjustmentSource =
  | "checkin"
  | "edit"
  | "session_log"
  | "memory"
  | "agent_command";

export type VisiblePriority = "low" | "medium" | "high";

export interface CreateAdjustmentEventParams {
  userId: number;
  trainingSystemId?: number;
  focusMode: FocusMode;
  eventType: string;
  title: string;
  summary: string;
  scope?: AdjustmentScope;
  source?: AdjustmentSource;
  visiblePriority?: VisiblePriority;
  metadata?: Record<string, unknown>;
}

export interface AdjustmentEventRow {
  id: number;
  userId: number;
  trainingSystemId: number | null;
  focusMode: string;
  eventType: string;
  title: string;
  summary: string;
  scope: string | null;
  source: string | null;
  visiblePriority: string;
  isNew: boolean;
  metadata: Record<string, unknown> | null;
  createdAt: string;
}

// ─── Event Creation ───────────────────────────────────────────────────────────

export async function createAdjustmentEvent(
  params: CreateAdjustmentEventParams
): Promise<number | null> {
  try {
    const [inserted] = await db
      .insert(systemAdjustmentEventsTable)
      .values({
        userId: params.userId,
        trainingSystemId: params.trainingSystemId ?? null,
        focusMode: params.focusMode,
        eventType: params.eventType,
        title: params.title,
        summary: params.summary,
        scope: params.scope ?? null,
        source: params.source ?? null,
        visiblePriority: params.visiblePriority ?? "medium",
        isNew: true,
        metadata: (params.metadata ?? null) as any,
      })
      .returning({ id: systemAdjustmentEventsTable.id });

    logger.info(
      {
        surface: "[SystemAdjustmentAudit]",
        focusMode: params.focusMode,
        eventType: params.eventType,
        source: params.source,
        visiblePriority: params.visiblePriority ?? "medium",
        persisted: true,
        displayed: false,
        userId: params.userId,
      },
      "[SystemAdjustmentAudit] event persisted"
    );

    return inserted.id;
  } catch (err) {
    logger.error({ err, params }, "System adjustment event create failed (non-fatal)");
    return null;
  }
}

// ─── Query Events ─────────────────────────────────────────────────────────────

/**
 * Returns recent events sorted by:
 * 1. High-priority events first
 * 2. Current-focus events before off-focus events
 * 3. Newest first within each group
 */
export async function getAdjustmentEvents(
  userId: number,
  activeFocusMode: FocusMode = "strength",
  limit = 20
): Promise<AdjustmentEventRow[]> {
  try {
    const rows = await db
      .select()
      .from(systemAdjustmentEventsTable)
      .where(eq(systemAdjustmentEventsTable.userId, userId))
      .orderBy(desc(systemAdjustmentEventsTable.createdAt))
      .limit(limit * 2); // fetch extra to allow re-sort

    // Re-sort: high priority → current focus → others, then newest within group
    const sorted = rows.sort((a, b) => {
      const aHigh = a.visiblePriority === "high" ? 0 : 1;
      const bHigh = b.visiblePriority === "high" ? 0 : 1;
      if (aHigh !== bHigh) return aHigh - bHigh;

      const aFocus = a.focusMode === activeFocusMode ? 0 : 1;
      const bFocus = b.focusMode === activeFocusMode ? 0 : 1;
      if (aFocus !== bFocus) return aFocus - bFocus;

      return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
    });

    logger.info(
      {
        surface: "[SystemAdjustmentAudit]",
        userId,
        activeFocusMode,
        displayed: true,
        count: sorted.length,
      },
      "[SystemAdjustmentAudit] events displayed"
    );

    return sorted.slice(0, limit).map((r) => ({
      ...r,
      metadata: (r.metadata as Record<string, unknown> | null) ?? null,
      createdAt: r.createdAt.toISOString(),
    }));
  } catch (err) {
    logger.error({ err, userId }, "Failed to fetch system adjustment events");
    return [];
  }
}

// ─── Mark as Seen ─────────────────────────────────────────────────────────────

export async function markAdjustmentEventsSeen(
  userId: number,
  ids: number[]
): Promise<void> {
  if (ids.length === 0) return;
  try {
    await db
      .update(systemAdjustmentEventsTable)
      .set({ isNew: false })
      .where(
        and(
          eq(systemAdjustmentEventsTable.userId, userId),
          inArray(systemAdjustmentEventsTable.id, ids)
        )
      );
  } catch (err) {
    logger.error({ err, userId, ids }, "Failed to mark adjustment events seen");
  }
}

// ─── Check-In Event Mapping ───────────────────────────────────────────────────

type AdaptationMode =
  | "TRAIN_AS_PLANNED"
  | "LIGHT_MODIFICATION"
  | "PAIN_MODIFICATION"
  | "RECOVERY_DELOAD"
  | "GREEN_LIGHT_PROGRESSION";

interface CheckInEventParams {
  userId: number;
  trainingSystemId: number;
  focusMode: FocusMode;
  mode: AdaptationMode;
  scores: {
    sleepScore: number;
    energyScore: number;
    sorenessScore: number;
    stressScore: number;
    motivationScore: number;
    painScore: number;
  };
}

export async function createCheckInAdjustmentEvent(
  params: CheckInEventParams
): Promise<void> {
  const { mode, scores, focusMode, userId, trainingSystemId } = params;

  if (mode === "TRAIN_AS_PLANNED") return;

  let eventType: string;
  let title: string;
  let summary: string;
  let visiblePriority: VisiblePriority = "medium";

  switch (mode) {
    case "PAIN_MODIFICATION":
      eventType = "joint_protection_applied";
      title = "Joint protection applied";
      summary = `Loading capped and movements flagged to protect against reported pain (${scores.painScore}/5).`;
      visiblePriority = "high";
      break;
    case "RECOVERY_DELOAD":
      eventType = "fatigue_reduction_applied";
      title = "Reduced load — recovery week";
      summary = `Auto-deload triggered. Loads cut 40–50% based on low sleep (${scores.sleepScore}/5), high soreness (${scores.sorenessScore}/5), and energy (${scores.energyScore}/5).`;
      visiblePriority = "high";
      break;
    case "LIGHT_MODIFICATION":
      eventType = "volume_shifted";
      title = "Volume trimmed for today";
      summary = `Pulled back accessory volume to protect output. Energy ${scores.energyScore}/5${scores.sorenessScore >= 3 ? `, soreness ${scores.sorenessScore}/5` : ""}.`;
      visiblePriority = "medium";
      break;
    case "GREEN_LIGHT_PROGRESSION":
      eventType = "acceleration_bias_added";
      title = "Green light — push for progression";
      summary = `All signals optimal. Session notes updated to chase progression on primary lifts today.`;
      visiblePriority = "medium";
      break;
    default:
      return;
  }

  await createAdjustmentEvent({
    userId,
    trainingSystemId,
    focusMode,
    eventType,
    title,
    summary,
    scope: mode === "RECOVERY_DELOAD" ? "week" : "session",
    source: "checkin",
    visiblePriority,
    metadata: { mode, scores },
  });
}

// ─── Edit Event Mapping ───────────────────────────────────────────────────────

const INTENT_TO_EVENT: Record<
  string,
  { eventType: string; title: string; summaryFn: (intent: string) => string; priority: VisiblePriority }
> = {
  deload_week: {
    eventType: "week_load_reduced",
    title: "Week load reduced",
    summaryFn: () => "This week shifted to a deload. Loads and volume reduced across all sessions.",
    priority: "high",
  },
  travel_mode: {
    eventType: "block_refocused",
    title: "Program adapted for travel",
    summaryFn: () => "Equipment and session structure adjusted for your travel setup.",
    priority: "medium",
  },
  adjust_for_pain: {
    eventType: "joint_protection_applied",
    title: "Pain adaptation applied",
    summaryFn: () => "Movements and loading modified to work around reported pain or injury.",
    priority: "high",
  },
  adjust_for_readiness: {
    eventType: "fatigue_reduction_applied",
    title: "Readiness adaptation applied",
    summaryFn: () => "Session adjusted based on your current readiness and recovery state.",
    priority: "medium",
  },
  refocus_block_power: {
    eventType: "focus_bias_changed",
    title: "Block refocused toward power",
    summaryFn: () => "Block emphasis shifted — acceleration and power output now leading the week.",
    priority: "high",
  },
  refocus_block_hypertrophy: {
    eventType: "focus_bias_changed",
    title: "Block refocused toward hypertrophy",
    summaryFn: () => "Volume and range emphasis updated. Block now targets hypertrophy and muscle development.",
    priority: "high",
  },
  refocus_block_athletic: {
    eventType: "focus_bias_changed",
    title: "Block refocused toward athletic output",
    summaryFn: () => "Block restructured around athletic performance — reactive output and compound mechanics.",
    priority: "high",
  },
  increase_intensity: {
    eventType: "next_session_adjusted",
    title: "Intensity raised",
    summaryFn: () => "Intensity and volume demands increased. Expect more challenging primary sessions.",
    priority: "medium",
  },
  increase_weekly_volume: {
    eventType: "volume_shifted",
    title: "Weekly volume increased",
    summaryFn: () => "More working sets added across the week to drive accumulation.",
    priority: "medium",
  },
  athletic_emphasis: {
    eventType: "focus_bias_changed",
    title: "Athletic emphasis added",
    summaryFn: () => "Program weighted toward sport-specific movement and athletic output.",
    priority: "medium",
  },
  change_frequency: {
    eventType: "block_refocused",
    title: "Training frequency changed",
    summaryFn: () => "Number of sessions per week restructured. Block rebuilt to match new schedule.",
    priority: "high",
  },
  structural_rebuild: {
    eventType: "block_refocused",
    title: "Block structure rebuilt",
    summaryFn: () => "Full block restructured. Sessions, exercises, and loading patterns rebuilt from your input.",
    priority: "high",
  },
};

export async function createEditAdjustmentEvent(params: {
  userId: number;
  trainingSystemId: number;
  focusMode: FocusMode;
  intent: string;
  scope: string;
  changeSummary: string;
  appliedCount: number;
}): Promise<void> {
  const { intent, userId, trainingSystemId, focusMode, scope, changeSummary, appliedCount } = params;

  if (appliedCount === 0) return;

  const mapping = INTENT_TO_EVENT[intent];
  if (!mapping) return;

  await createAdjustmentEvent({
    userId,
    trainingSystemId,
    focusMode,
    eventType: mapping.eventType,
    title: mapping.title,
    summary: mapping.summaryFn(intent),
    scope: scope as AdjustmentScope,
    source: "edit",
    visiblePriority: mapping.priority,
    metadata: { intent, changeSummary },
  });
}
