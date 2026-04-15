/**
 * Change Log Service — Phase 4
 *
 * Records every edit operation in the system_change_log table.
 * Stores before/after snapshots for full restoration capability.
 * Classifies edits as micro-changes or major version milestones.
 *
 * Each log entry represents one user-initiated edit request
 * (which may touch 1-N entities internally).
 *
 * Future extensibility:
 * - source field supports: ai_edit, quick_action, restore, initialize, auto_adjust
 * - decisionMetadata supports arbitrary structured context (wearable data, readiness, etc.)
 */

import { db } from "@workspace/db";
import { systemChangeLog } from "@workspace/db";
import { desc, eq, and } from "drizzle-orm";
import { logger } from "./logger";
import type { EditScope } from "./edit-intent-service";

// ─── Snapshot types ───────────────────────────────────────────────────────────

export interface EntitySnapshot {
  [entityId: string]: Record<string, unknown>;
}

export interface SystemSnapshot {
  exercises: EntitySnapshot;
  sessions: EntitySnapshot;
  weeks: EntitySnapshot;
  phases: EntitySnapshot;
}

// ─── Major-version classification ─────────────────────────────────────────────
// These intents and scopes represent structural changes that deserve a milestone.

const MAJOR_INTENTS = new Set([
  "create_program",
  "initialize",
  "deload_week",
  "travel_mode",
  "change_session_type",
  "athletic_emphasis",
  "refocus_block_power",
  "refocus_block_hypertrophy",
  "refocus_block_athletic",
  "increase_intensity",
  "increase_weekly_volume",
  "restore",
  // Structural rebuild / frequency change intents
  "refinement",
  "structural_rebuild",
  "change_frequency",
  "frequency_update",
  "program_refinement",
  "edit_program",
  "adjust_for_pain",
  "adjust_for_readiness",
  "start_new_program",
]);

export function classifyEdit(
  intent: string,
  scope: EditScope,
  overrides?: { isMajorVersion?: boolean; versionLabel?: string },
): { isMajorVersion: boolean; versionLabel?: string } {
  const isMajor = overrides?.isMajorVersion ?? (MAJOR_INTENTS.has(intent) || scope === "block" || scope === "system");

  const labelMap: Record<string, string> = {
    create_program: "Initial Build",
    initialize: "Program Initialized",
    deload_week: "Deload Week",
    travel_mode: "Travel / Equipment Adaptation",
    change_session_type: "Session Type Change",
    athletic_emphasis: "Athletic Emphasis Update",
    refocus_block_power: "Power Block",
    refocus_block_hypertrophy: "Hypertrophy Block",
    refocus_block_athletic: "Athletic Block",
    increase_intensity: "High Intensity Phase",
    increase_weekly_volume: "Volume Accumulation Phase",
    restore: "Restored Prior Version",
    refinement: "Program Refinement",
    structural_rebuild: "Structural Rebuild",
    change_frequency: "Frequency Update",
    frequency_update: "Frequency Update",
    program_refinement: "Program Refinement",
    edit_program: "Program Update",
    adjust_for_pain: "Pain / Injury Adaptation",
    adjust_for_readiness: "Readiness Adaptation",
    start_new_program: "Program Reset",
  };

  const label = overrides?.versionLabel ?? (isMajor ? (labelMap[intent] ?? undefined) : undefined);

  return { isMajorVersion: isMajor, versionLabel: label };
}

// ─── Create a change log entry ────────────────────────────────────────────────

export interface CreateChangeLogParams {
  userId: number;
  trainingSystemId: number;
  source?: "ai_edit" | "quick_action" | "initialize" | "restore" | "auto_adjust" | "proactive_agent" | "workout_feedback";
  intent: string;
  scope: EditScope;
  changeSummary: string;
  requestText?: string;
  targetType?: string;
  targetId?: number;
  targetLabel?: string;
  beforeSnapshot: SystemSnapshot;
  afterSnapshot: SystemSnapshot;
  /** Full serialized program (ProgramStructure) stored for version restore capability */
  fullProgramSnapshot?: Record<string, unknown>;
  appliedCount: number;
  skippedCount: number;
  restoredFromId?: number;
  /** Optional overrides for isMajorVersion and versionLabel classification */
  versionOverrides?: { isMajorVersion?: boolean; versionLabel?: string };
  decisionMetadata?: Record<string, unknown>;
}

export async function createChangeLogEntry(params: CreateChangeLogParams): Promise<number> {
  const { isMajorVersion, versionLabel } = classifyEdit(params.intent, params.scope, params.versionOverrides);

  // Embed the full program snapshot inside afterSnapshot for restore capability
  const afterSnapshotWithProgram = params.fullProgramSnapshot
    ? { ...params.afterSnapshot, fullProgram: params.fullProgramSnapshot }
    : params.afterSnapshot;

  try {
    const [inserted] = await db
      .insert(systemChangeLog)
      .values({
        userId: params.userId,
        trainingSystemId: params.trainingSystemId,
        source: params.source ?? "ai_edit",
        intent: params.intent,
        scope: params.scope,
        changeSummary: params.changeSummary,
        requestText: params.requestText ?? null,
        isMajorVersion,
        versionLabel: versionLabel ?? null,
        targetType: params.targetType ?? null,
        targetId: params.targetId ?? null,
        targetLabel: params.targetLabel ?? null,
        beforeSnapshot: params.beforeSnapshot as any,
        afterSnapshot: afterSnapshotWithProgram as any,
        appliedCount: params.appliedCount,
        skippedCount: params.skippedCount,
        restoredFromId: params.restoredFromId ?? null,
        decisionMetadata: params.decisionMetadata as any ?? null,
      })
      .returning({ id: systemChangeLog.id });

    logger.info(
      { changeLogId: inserted.id, intent: params.intent, scope: params.scope, isMajorVersion, userId: params.userId },
      "Change log entry created"
    );

    return inserted.id;
  } catch (err) {
    logger.error({ err, params }, "Failed to create change log entry");
    throw err;
  }
}

// ─── Fetch history for a user ─────────────────────────────────────────────────

export interface ChangeLogEntry {
  id: number;
  source: string;
  intent: string;
  scope: string;
  changeSummary: string;
  requestText: string | null;
  isMajorVersion: boolean;
  versionLabel: string | null;
  targetType: string | null;
  targetId: number | null;
  targetLabel: string | null;
  appliedCount: number;
  skippedCount: number;
  restoredFromId: number | null;
  decisionMetadata: Record<string, unknown> | null;
  createdAt: Date;
  // Snapshots omitted in list view for efficiency — fetched in detail view
}

export async function getChangeHistory(
  userId: number,
  trainingSystemId: number,
  limit = 30,
  beforeId?: number
): Promise<ChangeLogEntry[]> {
  const baseQuery = db
    .select({
      id: systemChangeLog.id,
      source: systemChangeLog.source,
      intent: systemChangeLog.intent,
      scope: systemChangeLog.scope,
      changeSummary: systemChangeLog.changeSummary,
      requestText: systemChangeLog.requestText,
      isMajorVersion: systemChangeLog.isMajorVersion,
      versionLabel: systemChangeLog.versionLabel,
      targetType: systemChangeLog.targetType,
      targetId: systemChangeLog.targetId,
      targetLabel: systemChangeLog.targetLabel,
      appliedCount: systemChangeLog.appliedCount,
      skippedCount: systemChangeLog.skippedCount,
      restoredFromId: systemChangeLog.restoredFromId,
      decisionMetadata: systemChangeLog.decisionMetadata,
      createdAt: systemChangeLog.createdAt,
    })
    .from(systemChangeLog)
    .where(
      and(
        eq(systemChangeLog.userId, userId),
        eq(systemChangeLog.trainingSystemId, trainingSystemId)
      )
    )
    .orderBy(desc(systemChangeLog.createdAt))
    .limit(limit);

  return baseQuery as unknown as ChangeLogEntry[];
}

// ─── Fetch single change detail (with snapshots) ──────────────────────────────

export interface ChangeLogDetail extends ChangeLogEntry {
  beforeSnapshot: SystemSnapshot | null;
  afterSnapshot: SystemSnapshot | null;
  skippedCount: number;
}

export async function getChangeDetail(
  userId: number,
  changeId: number
): Promise<ChangeLogDetail | null> {
  const [entry] = await db
    .select()
    .from(systemChangeLog)
    .where(
      and(
        eq(systemChangeLog.id, changeId),
        eq(systemChangeLog.userId, userId)
      )
    )
    .limit(1);

  if (!entry) return null;

  return {
    id: entry.id,
    source: entry.source,
    intent: entry.intent,
    scope: entry.scope,
    changeSummary: entry.changeSummary,
    requestText: entry.requestText,
    isMajorVersion: entry.isMajorVersion,
    versionLabel: entry.versionLabel,
    targetType: entry.targetType,
    targetId: entry.targetId,
    targetLabel: entry.targetLabel,
    appliedCount: entry.appliedCount,
    skippedCount: entry.skippedCount,
    restoredFromId: entry.restoredFromId,
    createdAt: entry.createdAt,
    beforeSnapshot: (entry.beforeSnapshot as SystemSnapshot | null) ?? null,
    afterSnapshot: (entry.afterSnapshot as SystemSnapshot | null) ?? null,
    decisionMetadata: (entry.decisionMetadata as Record<string, unknown> | null) ?? null,
  };
}
