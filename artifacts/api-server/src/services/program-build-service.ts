/**
 * ProgramBuildService — Phase 2 extraction
 *
 * Encapsulates the DB-write path that runs after the AI returns a ProgramStructure
 * on build/rebuild turns. This logic was duplicated verbatim between the non-SSE
 * (POST /messages) and SSE (POST /messages/stream) handlers in conversations.ts.
 *
 * Responsibilities:
 *   - Attach block metadata from the most recent architecture brief
 *   - createTrainingSystemFromProgram or upsertTrainingSystemFromProgram
 *   - Write the corresponding change log entry (Initial Build or Update)
 *   - Fire the first-build retention email (non-blocking)
 *   - Return { system, isUpdate, changeLogId } to the route handler
 *
 * NOT responsible for:
 *   - TurnOutcome tracking (remains in conversations.ts route handlers)
 *   - SSE event emission
 *   - Response serialisation
 *   - Critical save guard validation (caller checks before invoking)
 */

import { createTrainingSystemFromProgram, upsertTrainingSystemFromProgram } from "../lib/training-system-service";
import { createChangeLogEntry, type SystemSnapshot } from "../lib/change-log-service";
import { getLastMonthlyPlan } from "../lib/program-architecture-engine";
import { fireFirstBuildEmail } from "../lib/retentionEmails";
import { logger } from "../lib/logger";
import type { ProgramStructure } from "../lib/ai";

// ── Shared types ──────────────────────────────────────────────────────────────

export interface SaveProgramConstraints {
  primaryGoal?: string | null;
  sportFocus?: string | null;
  daysPerWeek?: number | null;
  seasonContext?: string | null;
  sessionDuration?: number | null;
  equipment?: string | null;
  experienceLevel?: string | null;
}

export interface SaveProgramParams {
  userId: number;
  /** ProgramStructure returned by the AI — may be mutated in place to attach blockMetadata. */
  structuredData: ProgramStructure & Record<string, unknown>;
  conversationId: number;
  focusMode: string;
  intentType: string;
  /** editSubtype from the intent result — used for change log intent on update paths. */
  editSubtype?: string | null;
  requestText: string;
  extractedConstraints?: SaveProgramConstraints | null;
}

export interface SaveProgramResult {
  system: { id: number; [key: string]: unknown };
  isUpdate: boolean;
  changeLogId: number | undefined;
}

// ── buildInitialBuildSummary ──────────────────────────────────────────────────
// Moved from conversations.ts — builds a constraint-aware human-readable summary
// for the "Initial Build" change log entry.

export function buildInitialBuildSummary(
  program: ProgramStructure,
  constraints: SaveProgramConstraints | null | undefined,
): string {
  const days = program.days.length;
  const parts: string[] = [];

  parts.push(`Created new program from user request`);

  if (constraints?.primaryGoal) {
    const goalLabels: Record<string, string> = {
      strength: "Strength",
      hypertrophy: "Hypertrophy",
      athletic_performance: "Athletic Performance",
      fat_loss: "Fat Loss / Body Composition",
      general_fitness: "General Fitness",
    };
    parts.push(`Goal: ${goalLabels[constraints.primaryGoal] ?? constraints.primaryGoal}`);
  }

  parts.push(`Frequency: ${days} days/week`);

  if (constraints?.sportFocus) {
    const sportLabel = constraints.sportFocus.replace(/_/g, " ");
    parts.push(`Sport context: ${sportLabel.charAt(0).toUpperCase() + sportLabel.slice(1)}`);
  }

  if (constraints?.seasonContext) {
    const seasonLabels: Record<string, string> = {
      off_season: "Off-Season",
      pre_season: "Pre-Season",
      in_season: "In-Season",
      post_season: "Post-Season",
      return_to_play: "Return to Play",
    };
    parts.push(`Season phase: ${seasonLabels[constraints.seasonContext] ?? constraints.seasonContext}`);
  }

  if (constraints?.sessionDuration) {
    parts.push(`Session duration: ${constraints.sessionDuration} minutes`);
  }

  if (constraints?.equipment) {
    parts.push(`Equipment: ${constraints.equipment}`);
  }

  if (constraints?.experienceLevel) {
    parts.push(`Experience level: ${constraints.experienceLevel}`);
  }

  return parts.join(" · ");
}

// ── saveOrUpdateProgram ───────────────────────────────────────────────────────

export async function saveOrUpdateProgram(
  params: SaveProgramParams,
): Promise<SaveProgramResult> {
  const {
    userId,
    structuredData,
    conversationId,
    focusMode,
    intentType,
    editSubtype,
    requestText,
    extractedConstraints,
  } = params;

  // 1. Attach block metadata from the most recent architecture brief (side-effect on structuredData)
  const lastPlan = getLastMonthlyPlan();
  if (lastPlan) {
    (structuredData as Record<string, unknown>).blockMetadata = {
      blockType: String(lastPlan.blockType),
      blockDisplayName: lastPlan.displayName,
      missionStatement: lastPlan.missionStatement,
      weekProgressionArc: lastPlan.weekProgressionArc,
      primaryAdaptation: lastPlan.primaryAdaptation,
      volumeProfile: lastPlan.volumeProfile,
      intensityProfile: lastPlan.intensityProfile,
    };
  }

  // 2. Create or upsert the training system
  const isNewProgramBuild =
    intentType === "CREATE_PROGRAM" || intentType === "START_NEW_PROGRAM";

  let system: { id: number; [key: string]: unknown };
  let isUpdate: boolean;

  if (isNewProgramBuild) {
    system = await createTrainingSystemFromProgram(
      userId, structuredData, conversationId, focusMode
    ) as { id: number; [key: string]: unknown };
    isUpdate = false;
  } else {
    const result = await upsertTrainingSystemFromProgram(userId, structuredData, focusMode, conversationId);
    system = result.system as { id: number; [key: string]: unknown };
    isUpdate = result.isUpdate;
  }

  // 3. Fire first-build retention email (non-blocking, idempotent)
  if (isNewProgramBuild) {
    fireFirstBuildEmail(userId).catch(() => {});
  }

  // 4. Write the change log entry
  const emptySnapshot: SystemSnapshot = { exercises: {}, sessions: {}, weeks: {}, phases: {} };
  const fullProgramSnapshot = structuredData as unknown as Record<string, unknown>;
  let changeLogId: number | undefined;

  if (isUpdate) {
    logger.info(
      { userId, systemId: system.id, programName: structuredData.programName },
      "[ProgramBuildService] Active program updated in place",
    );
    try {
      const updateSummary =
        (structuredData as any).whatChanged ??
        `Program updated: ${structuredData.days.length} days/week · ${structuredData.programName}`;
      const updateMeta: Record<string, unknown> = {
        intentType,
        editSubtype: editSubtype ?? undefined,
        programDays: structuredData.days.length,
        programGoal: extractedConstraints?.primaryGoal ?? null,
        programSport: extractedConstraints?.sportFocus ?? null,
      };
      if ((structuredData as any).whyChanged) updateMeta.whyChanged = (structuredData as any).whyChanged;

      changeLogId = await createChangeLogEntry({
        userId,
        trainingSystemId: system.id,
        source: "ai_edit",
        intent: editSubtype ?? intentType.toLowerCase(),
        scope: "system",
        changeSummary: updateSummary,
        requestText: requestText.slice(0, 300),
        beforeSnapshot: emptySnapshot,
        afterSnapshot: emptySnapshot,
        fullProgramSnapshot,
        appliedCount: 1,
        skippedCount: 0,
        versionOverrides: { isMajorVersion: true },
        decisionMetadata: updateMeta,
      });
    } catch (logErr) {
      logger.warn({ logErr }, "[ProgramBuildService] Failed to write AI change log — non-fatal");
    }
  } else {
    logger.info(
      { userId, systemId: system.id, programName: structuredData.programName },
      "[ProgramBuildService] New training system created — logging Initial Build version",
    );
    try {
      const initialBuildSummary = buildInitialBuildSummary(structuredData, extractedConstraints);
      changeLogId = await createChangeLogEntry({
        userId,
        trainingSystemId: system.id,
        source: "initialize",
        intent: "create_program",
        scope: "system",
        changeSummary: initialBuildSummary,
        requestText: requestText.slice(0, 300),
        beforeSnapshot: emptySnapshot,
        afterSnapshot: emptySnapshot,
        fullProgramSnapshot,
        appliedCount: 1,
        skippedCount: 0,
        versionOverrides: { isMajorVersion: true, versionLabel: "V1 Initial Build" },
        decisionMetadata: {
          intentType,
          extractedConstraints: extractedConstraints ?? {},
          programDays: structuredData.days.length,
          programGoal: extractedConstraints?.primaryGoal ?? null,
          programSport: extractedConstraints?.sportFocus ?? null,
        },
      });
    } catch (logErr) {
      logger.warn({ logErr }, "[ProgramBuildService] Failed to write Initial Build log — non-fatal");
    }
  }

  return { system, isUpdate, changeLogId };
}
