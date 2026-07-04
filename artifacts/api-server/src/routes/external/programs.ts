/**
 * External API — Program Routes
 *
 * POST /api/external/program/generate         — generate a new program
 * POST /api/external/program/generate/stream  — SSE streaming generation
 * POST /api/external/program/edit             — edit/refine an existing program
 * POST /api/external/program/session          — generate a single training session
 * POST /api/external/program/exercise-swap    — swap one exercise for another
 * POST /api/external/program/explain          — explain program rationale
 * GET  /api/external/program/:id              — retrieve a stored program
 *
 * Architecture:
 *   These routes delegate to the existing TrainChat AI pipeline
 *   (generateAIResponse) via synthetic contexts built from API request data.
 *   No programming logic is duplicated here — this is a pure orchestration layer.
 */

import { Router } from "express";
import { z } from "zod/v4";
import { validateExternalApiKey } from "../../middlewares/external-api-auth";
import { generateAIResponse, type ProgramStructure } from "../../lib/ai";
import {
  db,
  externalProgramsTable,
  externalApiKeysTable,
  externalProgramVersionsTable,
} from "@workspace/db";
import { eq, and, desc } from "drizzle-orm";
import { getSwapCandidates, findExerciseByName } from "../../lib/exercise-service";
import { resolveSafeSwapBackstop } from "../../lib/swap-backstop-service";
import {
  isExternalMaterializationEnabled,
  isExternalSurgicalEditEnabled,
  createDefaultRoundTripDeps,
  resolveExternalServiceUserId,
  maybeMaterializeOnEdit,
  maybeApplySurgicalExternalEdit,
  createDefaultSurgicalDeps,
  emitExternalEvent,
} from "../../lib/external-materialization";
import {
  getExternalProgramHistory,
  revertExternalProgramVersion,
  type HistoryRevertDeps,
} from "../../lib/external-materialization/history-revert";
import { createHistoryRevertSystemDeps } from "../../lib/external-materialization/history-revert-deps";
import { withExternalProgramLock } from "../../lib/external-materialization/serialization";
import { reloadExternalTrainingSystemId } from "../../lib/external-materialization/program-store";
import { logger } from "../../lib/logger";
import {
  acquireProgramAdvisoryLock,
  acquireExternalProgramBlobLock,
} from "../../lib/advisory-lock";
import { validateProgramStructure } from "../../lib/program-structure-schema";

const router = Router();

// ─── Shared Zod schemas ───────────────────────────────────────────────────────

const AthleteContextSchema = z.object({
  name: z.string().optional(),
  age: z.number().int().optional(),
  sport: z.string().optional(),
  position: z.string().optional(),
  experienceLevel: z.enum(["beginner", "intermediate", "advanced", "elite"]).optional(),
  injuryHistory: z.array(z.string()).optional(),
}).optional();

const GenerateProgramBodySchema = z.object({
  goal: z.string().min(1).max(500),
  sport: z.string().max(100).optional(),
  schedule: z.string().max(200).optional(),
  experienceLevel: z.enum(["beginner", "intermediate", "advanced", "elite"]).optional(),
  equipment: z.array(z.string()).optional(),
  athletes: z.array(AthleteContextSchema).optional(),
  constraints: z.array(z.string()).optional(),
  notes: z.array(z.string()).optional(),
  durationWeeks: z.number().int().min(1).max(52).optional(),
  teamContext: z.record(z.string(), z.unknown()).optional(),
  orgContext: z.record(z.string(), z.unknown()).optional(),
  focusMode: z.enum(["strength", "speed", "mobility", "general"]).optional(),
});

const EditProgramBodySchema = z.object({
  programId: z.coerce.number().int().positive(),
  instruction: z.string().min(1).max(1000),
  scope: z.string().max(100).optional(),
});

const GenerateSessionBodySchema = z.object({
  goal: z.string().min(1).max(500),
  sessionType: z.enum(["lifting", "conditioning", "mobility", "recovery", "sport"]).optional(),
  equipment: z.array(z.string()).optional(),
  duration: z.number().int().min(15).max(180).optional(),
  experienceLevel: z.enum(["beginner", "intermediate", "advanced", "elite"]).optional(),
  constraints: z.array(z.string()).optional(),
  notes: z.string().optional(),
  focusMode: z.enum(["strength", "speed", "mobility", "general"]).optional(),
});

const ExerciseSwapBodySchema = z.object({
  programId: z.coerce.number().int().positive().optional(),
  exerciseId: z.coerce.number().int().positive().optional(),
  exerciseName: z.string().max(200).optional(),
  reason: z.string().max(500).optional(),
  equipment: z.string().optional(),
  injuries: z.array(z.string()).optional(),
}).refine(d => d.exerciseId !== undefined || d.exerciseName !== undefined, {
  message: "Either exerciseId or exerciseName is required.",
});

const ExplainProgramBodySchema = z.object({
  programId: z.coerce.number().int().positive(),
  question: z.string().max(500).optional(),
});

const RevertProgramBodySchema = z.object({
  versionId: z.coerce.number().int().positive(),
});

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Non-personal attribution used when an API key has no `createdBy` (e.g. the
 * creating user was later deleted — `created_by` is `on delete set null`).
 *
 * It is intentionally NOT a real user id. `generateAIResponse` only *reads*
 * user context (e.g. `user_profiles`) by this id and never writes by it, so a
 * sentinel yields an empty profile — the external generation is driven purely
 * by the request payload and can never be contaminated by an internal user's
 * stored data. The previous `?? 1` fallback silently loaded user #1's profile
 * into external requests, which was both wrong attribution and a data-isolation
 * leak.
 */
export const EXTERNAL_API_SERVICE_USER_ID = -1;

function buildSystemUserId(apiKey: Express.Request["apiKey"]): number {
  const createdBy = apiKey?.createdBy;
  if (createdBy !== null && createdBy !== undefined) return createdBy;

  logger.warn(
    { apiKeyId: apiKey?.id ?? null },
    "external-programs: API key has no createdBy — attributing to service user (no personal context loaded)",
  );
  return EXTERNAL_API_SERVICE_USER_ID;
}

/**
 * Best-effort baseline snapshot written at program creation so /history and
 * /revert are coherent from the start (a freshly-generated, never-edited program
 * still has a "v0 = as generated" anchor). Additive and non-fatal: a failure
 * here never fails an otherwise-successful generation.
 */
async function writeGenerateSnapshot(
  externalProgramId: number,
  apiKeyId: number | null,
  program: ProgramStructure,
): Promise<void> {
  try {
    await db.insert(externalProgramVersionsTable).values({
      externalProgramId,
      apiKeyId,
      programSnapshot: program as unknown as Record<string, unknown>,
      type: "generate_snapshot",
    });
  } catch (err) {
    logger.warn(
      { err, externalProgramId },
      "external-programs: generate_snapshot write failed (non-fatal)",
    );
  }
}

function buildGenerateMessage(data: z.infer<typeof GenerateProgramBodySchema>): string {
  const parts: string[] = [];

  parts.push(`Build me a training program.`);
  parts.push(`Goal: ${data.goal}`);

  if (data.sport) parts.push(`Sport: ${data.sport}`);
  if (data.schedule) parts.push(`Schedule: ${data.schedule}`);
  if (data.experienceLevel) parts.push(`Experience level: ${data.experienceLevel}`);
  if (data.durationWeeks) parts.push(`Duration: ${data.durationWeeks} weeks`);
  if (data.equipment?.length) {
    parts.push(`Available equipment: ${data.equipment.join(", ")}`);
  }
  if (data.constraints?.length) {
    parts.push(`Constraints: ${data.constraints.join("; ")}`);
  }
  if (data.notes?.length) {
    parts.push(`Additional notes: ${data.notes.join("; ")}`);
  }

  return parts.join(". ");
}

function buildEditMessage(
  data: z.infer<typeof EditProgramBodySchema>,
  program: ProgramStructure,
): string {
  const scopePart = data.scope ? ` (scope: ${data.scope})` : "";
  return `For program "${program.programName}"${scopePart}: ${data.instruction}`;
}

function buildSessionMessage(data: z.infer<typeof GenerateSessionBodySchema>): string {
  const parts: string[] = [];
  parts.push(`Generate a single training session.`);
  parts.push(`Goal: ${data.goal}`);
  if (data.sessionType) parts.push(`Session type: ${data.sessionType}`);
  if (data.duration) parts.push(`Duration: ${data.duration} minutes`);
  if (data.experienceLevel) parts.push(`Experience: ${data.experienceLevel}`);
  if (data.equipment?.length) parts.push(`Equipment: ${data.equipment.join(", ")}`);
  if (data.constraints?.length) parts.push(`Constraints: ${data.constraints.join("; ")}`);
  if (data.notes) parts.push(`Notes: ${data.notes}`);
  return parts.join(". ");
}

function stripInternalFields(program: ProgramStructure): ProgramStructure {
  const safe = { ...program };
  delete (safe as Record<string, unknown>)._architectureAudit;
  delete (safe as Record<string, unknown>).expertJudgmentNotes;
  return safe;
}

function buildStandardResponse<T>(data: T, meta?: Record<string, unknown>) {
  return { success: true, data, meta: meta ?? null, error: null };
}

function buildErrorResponse(code: string, message: string, status = 500) {
  return {
    status,
    body: {
      success: false,
      data: null,
      meta: null,
      error: { code, message },
    },
  };
}

/**
 * Fetch an external program by id, scoped to the caller's ownership.
 *
 * P0 IDOR fix: external programs were previously looked up by primary key
 * alone, so any valid API key could read or edit another tenant's program by
 * iterating integer ids. Ownership is now enforced here.
 *
 * Ownership rule:
 *   - the program's owning key is the caller's key           → allowed
 *   - the caller has an orgId AND the program's owning key
 *     shares that same orgId                                  → allowed
 *   - otherwise                                               → undefined
 *
 * Returns `undefined` for both "does not exist" and "not owned" so callers
 * emit an identical 404 NOT_FOUND and never leak cross-tenant existence.
 */
async function findOwnedProgram(
  programId: number,
  apiKey: Express.Request["apiKey"],
): Promise<typeof externalProgramsTable.$inferSelect | undefined> {
  const [row] = await db
    .select({
      program: externalProgramsTable,
      ownerOrgId: externalApiKeysTable.orgId,
    })
    .from(externalProgramsTable)
    .leftJoin(
      externalApiKeysTable,
      eq(externalProgramsTable.apiKeyId, externalApiKeysTable.id),
    )
    .where(eq(externalProgramsTable.id, programId))
    .limit(1);

  if (!row) return undefined;

  const callerKeyId = apiKey?.id ?? null;
  const callerOrgId = apiKey?.orgId ?? null;

  const ownedByKey =
    row.program.apiKeyId != null && row.program.apiKeyId === callerKeyId;
  const ownedByOrg =
    callerOrgId != null && row.ownerOrgId != null && row.ownerOrgId === callerOrgId;

  if (ownedByKey || ownedByOrg) return row.program;
  return undefined;
}

// ─── POST /api/external/program/generate ─────────────────────────────────────

router.post(
  "/external/program/generate",
  validateExternalApiKey(["generate_program"]),
  async (req, res): Promise<void> => {
    const parsed = GenerateProgramBodySchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({
        success: false,
        data: null,
        meta: null,
        error: {
          code: "VALIDATION_ERROR",
          message: "Invalid request body.",
          details: parsed.error.issues,
        },
      });
      return;
    }

    const data = parsed.data;
    const userId = buildSystemUserId(req.apiKey);
    const userMessage = buildGenerateMessage(data);
    const rawFocus = data.focusMode ?? "general";
    const focusMode = (rawFocus === "general" ? "strength" : rawFocus) as import("../../lib/focus-engines/engine-interface").FocusMode;

    try {
      const aiResponse = await generateAIResponse(userMessage, [], userId, {
        intentResult: {
          type: "CREATE_PROGRAM",
          confidence: "high",
        },
        focusMode,
        hasActiveProgram: false,
        execPlanAction: "REBUILD_PROGRAM",
      });

      if (!aiResponse.structuredData) {
        res.status(422).json({
          success: false,
          data: null,
          meta: null,
          error: {
            code: "GENERATION_FAILED",
            message: "The AI did not produce a structured program. Try adding more detail to your request.",
          },
        });
        return;
      }

      // ── Pre-persistence schema gate (audit F5, defense in depth) ─────────
      // The parse boundary in lib/ai.ts already validates, but this row is
      // served back verbatim to API consumers — never persist or return a
      // structurally invalid program as a success.
      const generateValidation = validateProgramStructure(aiResponse.structuredData);
      if (!generateValidation.valid) {
        logger.warn(
          { issues: generateValidation.issues },
          "external-programs: generate produced structurally invalid program — returning 422, nothing persisted",
        );
        res.status(422).json({
          success: false,
          data: null,
          meta: null,
          error: {
            code: "GENERATION_FAILED",
            message: "The AI produced a structurally invalid program. Nothing was saved — please retry.",
          },
        });
        return;
      }

      const safeProgram = stripInternalFields(aiResponse.structuredData);

      const [stored] = await db
        .insert(externalProgramsTable)
        .values({
          apiKeyId: req.apiKeyId!,
          programData: safeProgram as unknown as Record<string, unknown>,
          requestContext: {
            goal: data.goal,
            sport: data.sport,
            schedule: data.schedule,
            experienceLevel: data.experienceLevel,
            durationWeeks: data.durationWeeks,
            focusMode,
          },
          summary: safeProgram.description ?? safeProgram.programName,
        })
        .returning();

      // Baseline "v0 = as generated" snapshot (additive, best-effort).
      await writeGenerateSnapshot(stored.id, req.apiKeyId ?? null, safeProgram);

      res.status(201).json(
        buildStandardResponse({
          programId: stored.id,
          summary: safeProgram.description,
          programName: safeProgram.programName,
          weeks: safeProgram.days ?? [],
          sessions: safeProgram.days ?? [],
          coachRationale: safeProgram.whyItWorks ?? aiResponse.content,
          splitType: safeProgram.splitType,
          progressionStrategy: safeProgram.progressionStrategy,
          intelligenceStatus: safeProgram.intelligenceStatus,
          generatedAt: stored.generatedAt,
        }),
      );
    } catch (err) {
      logger.error({ err }, "external-programs: generate failed");
      const e = buildErrorResponse("INTERNAL_ERROR", "Program generation failed.");
      res.status(e.status).json(e.body);
    }
  },
);

// ─── POST /api/external/program/generate/stream ──────────────────────────────
// SSE streaming variant — emits stage events then a final `complete` event.

router.post(
  "/external/program/generate/stream",
  validateExternalApiKey(["generate_program"]),
  async (req, res): Promise<void> => {
    const parsed = GenerateProgramBodySchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({
        success: false,
        data: null,
        meta: null,
        error: {
          code: "VALIDATION_ERROR",
          message: "Invalid request body.",
          details: parsed.error.issues,
        },
      });
      return;
    }

    const data = parsed.data;
    const userId = buildSystemUserId(req.apiKey);
    const userMessage = buildGenerateMessage(data);
    const rawFocus = data.focusMode ?? "general";
    const focusMode = (rawFocus === "general" ? "strength" : rawFocus) as import("../../lib/focus-engines/engine-interface").FocusMode;

    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");
    res.flushHeaders();

    const emit = (event: string, payload: Record<string, unknown>) => {
      const body = JSON.stringify(Object.assign({ type: event }, payload)); res.write(`data: ${body}\n\n`);
    };

    try {
      emit("stage", { stage: "queued", message: "Request received, starting generation..." });
      emit("stage", { stage: "architecting", message: "Designing program architecture..." });

      const aiResponse = await generateAIResponse(userMessage, [], userId, {
        intentResult: {
          type: "CREATE_PROGRAM",
          confidence: "high",
        },
        focusMode,
        hasActiveProgram: false,
        execPlanAction: "REBUILD_PROGRAM",
      });

      if (!aiResponse.structuredData) {
        emit("error", {
          code: "GENERATION_FAILED",
          message: "The AI did not produce a structured program.",
        });
        res.end();
        return;
      }

      // Pre-persistence schema gate (audit F5) — same rule as the non-stream
      // route: an invalid structure is an error event, never a `complete`.
      const streamValidation = validateProgramStructure(aiResponse.structuredData);
      if (!streamValidation.valid) {
        logger.warn(
          { issues: streamValidation.issues },
          "external-programs: stream generate produced structurally invalid program — nothing persisted",
        );
        emit("error", {
          code: "GENERATION_FAILED",
          message: "The AI produced a structurally invalid program. Nothing was saved — please retry.",
        });
        res.end();
        return;
      }

      emit("stage", { stage: "saving", message: "Saving program..." });

      const safeProgram = stripInternalFields(aiResponse.structuredData);

      const [stored] = await db
        .insert(externalProgramsTable)
        .values({
          apiKeyId: req.apiKeyId!,
          programData: safeProgram as unknown as Record<string, unknown>,
          requestContext: {
            goal: data.goal,
            sport: data.sport,
            focusMode,
          },
          summary: safeProgram.description ?? safeProgram.programName,
        })
        .returning();

      // Baseline "v0 = as generated" snapshot (additive, best-effort).
      await writeGenerateSnapshot(stored.id, req.apiKeyId ?? null, safeProgram);

      emit("complete", {
        success: true,
        data: {
          programId: stored.id,
          summary: safeProgram.description,
          programName: safeProgram.programName,
          sessions: safeProgram.days ?? [],
          coachRationale: safeProgram.whyItWorks ?? aiResponse.content,
          generatedAt: stored.generatedAt,
        },
        meta: null,
        error: null,
      });
    } catch (err) {
      logger.error({ err }, "external-programs: stream generate failed");
      emit("error", { code: "INTERNAL_ERROR", message: "Program generation failed." });
    }

    res.end();
  },
);

// ─── POST /api/external/program/edit ─────────────────────────────────────────

router.post(
  "/external/program/edit",
  validateExternalApiKey(["edit_program"]),
  async (req, res): Promise<void> => {
    const parsed = EditProgramBodySchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({
        success: false,
        data: null,
        meta: null,
        error: {
          code: "VALIDATION_ERROR",
          message: "Invalid request body.",
          details: parsed.error.issues,
        },
      });
      return;
    }

    const { programId, instruction, scope } = parsed.data;

    let storedProgram: typeof externalProgramsTable.$inferSelect | undefined;
    try {
      storedProgram = await findOwnedProgram(programId, req.apiKey);
    } catch (err) {
      logger.error({ err }, "external-programs: edit DB lookup failed");
    }

    if (!storedProgram) {
      res.status(404).json({
        success: false,
        data: null,
        meta: null,
        error: { code: "NOT_FOUND", message: "Program not found." },
      });
      return;
    }

    const currentProgram = storedProgram.programData as unknown as ProgramStructure;
    const flagCtx = { apiKeyId: req.apiKeyId ?? null, orgId: req.apiKey?.orgId ?? null };
    const surgicalEnabled = isExternalSurgicalEditEnabled(flagCtx);

    // ── Phase 2.6: serialize all materialized work for THIS program (per
    //    instance) so concurrent materialization / surgical edits never
    //    interleave. Materialization is idempotent (re-read the link under the
    //    lock). The surgical relational mutation and the blob writes cannot share
    //    one DB transaction because the engine uses the module db (DR-0006), so
    //    on a failure AFTER the relational mutation commits we FAIL LOUD rather
    //    than fall back to regeneration (which would diverge blob vs system).
    const editOutcome = await withExternalProgramLock(programId, async (): Promise<
      | { kind: "surgical_ok"; updatedProgram: unknown; changes: string[]; coachSummary: string; versionId: number | null; versionCreatedAt: Date | null }
      | { kind: "surgical_partial" }
      | { kind: "fallback" }
    > => {
      // Phase 2.3 bridge — best-effort, runs when EITHER flag is on. Re-read the
      // link under the lock first for concurrency-safe, once-only materialization.
      const freshTsid = await reloadExternalTrainingSystemId(programId);
      const bridge = await maybeMaterializeOnEdit(
        {
          id: storedProgram!.id,
          programData: storedProgram!.programData,
          trainingSystemId: freshTsid ?? storedProgram!.trainingSystemId,
        },
        { apiKeyId: req.apiKeyId ?? null, orgId: req.apiKey?.orgId ?? null },
        {
          enabled: isExternalMaterializationEnabled(flagCtx) || surgicalEnabled,
          adapterDeps: createDefaultRoundTripDeps(() =>
            resolveExternalServiceUserId(storedProgram!.id),
          ),
          link: async (pid, systemId) => {
            await db
              .update(externalProgramsTable)
              .set({ trainingSystemId: systemId })
              .where(eq(externalProgramsTable.id, pid));
          },
          focusMode:
            (storedProgram!.requestContext as { focusMode?: string } | null)?.focusMode ?? null,
          onError: (err) =>
            logger.warn(
              { err, programId: storedProgram!.id },
              "external-programs: lazy materialization failed — continuing with blob edit path",
            ),
        },
      );
      const trainingSystemId =
        bridge.trainingSystemId ?? freshTsid ?? storedProgram!.trainingSystemId ?? null;

      // Observability: materialization outcome.
      if (bridge.reason === "materialized") {
        emitExternalEvent("materialize_attempted", { programId });
        emitExternalEvent("materialize_succeeded", { programId, trainingSystemId });
      } else if (bridge.reason === "failed") {
        emitExternalEvent("materialize_attempted", { programId });
        emitExternalEvent("materialize_failed", { programId });
      } else if (bridge.reason === "already_materialized") {
        emitExternalEvent("materialize_skipped", { programId, trainingSystemId });
      }

      if (!surgicalEnabled || trainingSystemId == null) {
        return { kind: "fallback" };
      }

      emitExternalEvent("surgical_attempted", { programId, trainingSystemId });
      const surgicalStarted = Date.now();
      const outcome = await maybeApplySurgicalExternalEdit(
        { trainingSystemId, instruction, scope: scope ?? null },
        createDefaultSurgicalDeps((err, stage) =>
          logger.warn(
            { err, stage, programId, trainingSystemId },
            "external-programs: surgical edit step failed",
          ),
        ),
      );
      const surgicalLatencyMs = Date.now() - surgicalStarted;

      if (outcome.ok) {
        emitExternalEvent("surgical_succeeded", { programId, trainingSystemId, latencyMs: surgicalLatencyMs });
        const changes = outcome.result.changes;
        // Group the two blob writes (version snapshot + programData overwrite)
        // in one transaction so they commit together. Advisory locks (F9):
        // the blob lock serializes blob writes for this program across
        // instances; the training-system lock additionally prevents the blob
        // write from interleaving with another instance's in-flight relational
        // edit of the same system. Both release at commit/rollback. Lock order
        // (system → blob) is the only multi-lock site, so no deadlock cycle.
        let version: { id: number; createdAt: Date } | undefined;
        await db.transaction(async (tx) => {
          await acquireProgramAdvisoryLock(tx, trainingSystemId);
          await acquireExternalProgramBlobLock(tx, programId);
          const [v] = await tx
            .insert(externalProgramVersionsTable)
            .values({
              externalProgramId: programId,
              apiKeyId: req.apiKeyId ?? null,
              programSnapshot: currentProgram as unknown as Record<string, unknown>,
              type: "edit",
              instruction,
              scope: scope ?? null,
              changeSummary: changes as unknown as Record<string, unknown>,
            })
            .returning();
          version = v;
          await tx
            .update(externalProgramsTable)
            .set({ programData: outcome.result.updatedProgram as unknown as Record<string, unknown> })
            .where(eq(externalProgramsTable.id, programId));
        });
        return {
          kind: "surgical_ok",
          updatedProgram: outcome.result.updatedProgram,
          changes,
          coachSummary: outcome.result.coachSummary,
          versionId: version?.id ?? null,
          versionCreatedAt: version?.createdAt ?? null,
        };
      }

      // committed === true → relational mutation committed but couldn't finalize
      // the blob → fail loud (do NOT regenerate; that would diverge).
      if (outcome.committed) {
        emitExternalEvent("surgical_edit_partial", { programId, trainingSystemId, stage: outcome.stage });
        return { kind: "surgical_partial" };
      }

      // committed === false → nothing changed relationally → safe fallback.
      emitExternalEvent("surgical_fallback", { programId, trainingSystemId, stage: outcome.stage });
      return { kind: "fallback" };
    });

    if (editOutcome.kind === "surgical_ok") {
      res.json(
        buildStandardResponse({
          programId,
          updatedProgram: editOutcome.updatedProgram,
          changes: editOutcome.changes,
          coachSummary: editOutcome.coachSummary,
          version: editOutcome.versionId,
          changeReceipt: {
            versionId: editOutcome.versionId,
            type: "edit" as const,
            instruction,
            scope: scope ?? null,
            changes: editOutcome.changes,
            snapshotAt: editOutcome.versionCreatedAt,
          },
        }),
      );
      return;
    }

    if (editOutcome.kind === "surgical_partial") {
      res.status(500).json({
        success: false,
        data: null,
        meta: null,
        error: {
          code: "EDIT_PARTIAL",
          message:
            "The edit was applied to the program but could not be finalized. Please retry.",
        },
      });
      return;
    }
    // editOutcome.kind === "fallback" → continue to the regeneration path below.

    const userId = buildSystemUserId(req.apiKey);
    const editMessage = buildEditMessage({ programId, instruction, scope }, currentProgram);

    try {
      const aiResponse = await generateAIResponse(editMessage, [], userId, {
        currentProgram,
        intentResult: {
          type: "EDIT_PROGRAM",
          confidence: "high",
          editSubtype: scope ?? "general_modification",
        },
        hasActiveProgram: true,
      });

      // Fail loudly: if the model returned no structured program, the edit
      // could not be applied. Do NOT silently persist the unchanged program
      // and report success — that is a false-positive edit. Leave
      // external_programs.programData untouched and return 422.
      if (!aiResponse.structuredData) {
        logger.warn(
          { programId },
          "external-programs: edit produced no structuredData — returning 422",
        );
        res.status(422).json({
          success: false,
          data: null,
          meta: null,
          error: {
            code: "EDIT_FAILED",
            message:
              "The edit could not be applied — the AI did not produce an updated program. The program was left unchanged. Try rephrasing the instruction with more detail.",
          },
        });
        return;
      }

      // ── Pre-persistence schema gate (audit F5) ───────────────────────────
      // Same fail-loud rule: a structurally invalid regenerated program must
      // never overwrite the stored one. Leave programData untouched, no
      // version row, return 422.
      const editValidation = validateProgramStructure(aiResponse.structuredData);
      if (!editValidation.valid) {
        logger.warn(
          { programId, issues: editValidation.issues },
          "external-programs: edit produced structurally invalid program — returning 422, program unchanged",
        );
        res.status(422).json({
          success: false,
          data: null,
          meta: null,
          error: {
            code: "EDIT_FAILED",
            message:
              "The edit could not be applied — the AI produced a structurally invalid program. The program was left unchanged. Try rephrasing the instruction.",
          },
        });
        return;
      }

      const updatedProgram = stripInternalFields(aiResponse.structuredData);
      const changes = aiResponse.changeSummary ?? [];

      // Snapshot-before-edit: append an append-only version row capturing the
      // program state BEFORE this overwrite, so the edit is auditable and
      // reversible (Phase 1C). Written only after fail-loud passes, so a failed
      // edit never leaves a spurious version. The pair commits in one
      // transaction under the blob advisory lock (F9): version + programData
      // land together, serialized per program across instances. The LLM
      // regeneration above completed before this transaction opened.
      let version: { id: number; createdAt: Date } | undefined;
      await db.transaction(async (tx) => {
        await acquireExternalProgramBlobLock(tx, programId);
        const [v] = await tx
          .insert(externalProgramVersionsTable)
          .values({
            externalProgramId: programId,
            apiKeyId: req.apiKeyId ?? null,
            programSnapshot: currentProgram as unknown as Record<string, unknown>,
            type: "edit",
            instruction,
            scope: scope ?? null,
            changeSummary: changes as unknown as Record<string, unknown>,
          })
          .returning();
        version = v;
        await tx
          .update(externalProgramsTable)
          .set({
            programData: updatedProgram as unknown as Record<string, unknown>,
          })
          .where(eq(externalProgramsTable.id, programId));
      });

      res.json(
        buildStandardResponse({
          programId,
          updatedProgram,
          changes,
          coachSummary: aiResponse.content,
          // Additive (Phase 1C) — existing fields above are unchanged.
          version: version?.id ?? null,
          changeReceipt: {
            versionId: version?.id ?? null,
            type: "edit" as const,
            instruction,
            scope: scope ?? null,
            changes,
            snapshotAt: version?.createdAt ?? null,
          },
        }),
      );
    } catch (err) {
      logger.error({ err }, "external-programs: edit failed");
      const e = buildErrorResponse("INTERNAL_ERROR", "Program edit failed.");
      res.status(e.status).json(e.body);
    }
  },
);

// ─── POST /api/external/program/session ──────────────────────────────────────

router.post(
  "/external/program/session",
  validateExternalApiKey(["generate_session"]),
  async (req, res): Promise<void> => {
    const parsed = GenerateSessionBodySchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({
        success: false,
        data: null,
        meta: null,
        error: {
          code: "VALIDATION_ERROR",
          message: "Invalid request body.",
          details: parsed.error.issues,
        },
      });
      return;
    }

    const data = parsed.data;
    const userId = buildSystemUserId(req.apiKey);
    const userMessage = buildSessionMessage(data);
    const rawFocus = data.focusMode ?? "general";
    const focusMode = (rawFocus === "general" ? "strength" : rawFocus) as import("../../lib/focus-engines/engine-interface").FocusMode;

    try {
      const aiResponse = await generateAIResponse(userMessage, [], userId, {
        intentResult: {
          type: "CREATE_PROGRAM",
          confidence: "high",
        },
        focusMode,
        hasActiveProgram: false,
        execPlanAction: "REBUILD_PROGRAM",
      });

      if (!aiResponse.structuredData?.days?.length) {
        res.status(422).json({
          success: false,
          data: null,
          meta: null,
          error: {
            code: "GENERATION_FAILED",
            message: "Session generation did not produce structured output.",
          },
        });
        return;
      }

      const session = aiResponse.structuredData.days[0];

      res.status(201).json(
        buildStandardResponse({
          session,
          programName: aiResponse.structuredData.programName,
          coachRationale: aiResponse.content,
          generatedAt: new Date().toISOString(),
        }),
      );
    } catch (err) {
      logger.error({ err }, "external-programs: session generate failed");
      const e = buildErrorResponse("INTERNAL_ERROR", "Session generation failed.");
      res.status(e.status).json(e.body);
    }
  },
);

// ─── POST /api/external/program/exercise-swap ────────────────────────────────

router.post(
  "/external/program/exercise-swap",
  validateExternalApiKey(["exercise_swap"]),
  async (req, res): Promise<void> => {
    const parsed = ExerciseSwapBodySchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({
        success: false,
        data: null,
        meta: null,
        error: {
          code: "VALIDATION_ERROR",
          message: "Invalid request body.",
          details: parsed.error.issues,
        },
      });
      return;
    }

    const { exerciseId, exerciseName, reason, equipment, injuries, programId } = parsed.data;
    const equipmentLevel = equipment ?? "full_gym";
    const injuryFlags = injuries ?? [];

    // Resolve target exercise name (by name lookup or by ID search)
    let targetName = exerciseName;

    if (!targetName && exerciseId) {
      try {
        const { db: dbInner, exerciseLibrary: exLib } = await import("@workspace/db");
        const { eq: eqInner } = await import("drizzle-orm");
        const [row] = await dbInner
          .select({ name: exLib.name })
          .from(exLib)
          .where(eqInner(exLib.id, exerciseId))
          .limit(1);
        targetName = row?.name;
      } catch {
        // fall through to not-found below
      }
    }

    if (!targetName) {
      res.status(404).json({
        success: false,
        data: null,
        meta: null,
        error: {
          code: "EXERCISE_NOT_FOUND",
          message: "Exercise not found. Provide a valid exerciseName or exerciseId.",
        },
      });
      return;
    }

    try {
      // 1. Try deterministic swap candidates from exercise library
      const candidates = await getSwapCandidates({
        exerciseName: targetName,
        equipmentLevel,
        injuryFlags,
        maxCount: 5,
      });

      if (candidates.length > 0) {
        const top = candidates[0];
        res.json(
          buildStandardResponse({
            replacement: {
              name: top.name,
              movementPattern: top.movementPattern,
              equipment: top.equipment,
              difficultyLevel: top.difficultyLevel,
              description: top.description,
            },
            alternatives: candidates.slice(1).map(c => ({
              name: c.name,
              movementPattern: c.movementPattern,
              difficultyLevel: c.difficultyLevel,
            })),
            rationale: `${top.name} preserves the same movement pattern as ${targetName} with matching equipment requirements.`,
            stimulusPreserved: true,
            source: "library",
          }),
        );
        return;
      }

      // 2. Fall back to AI swap backstop via resolveSafeSwapBackstop.
      //    Scoped to the caller: an unowned/unknown programId simply yields no
      //    system context (same as omitting it) — never another tenant's data.
      let storedProgram: typeof externalProgramsTable.$inferSelect | undefined;
      if (programId) {
        storedProgram = await findOwnedProgram(programId, req.apiKey);
      }

      // Resolve exercise ID if we only had a name
      let resolvedId: number | undefined = exerciseId;
      if (!resolvedId && targetName) {
        const libEntry = await findExerciseByName(targetName);
        resolvedId = libEntry?.id;
      }

      const editPlan = await resolveSafeSwapBackstop({
        exerciseName: targetName,
        exerciseId: resolvedId ?? 0,
        userRequest: reason ?? `Swap ${targetName}`,
        system: storedProgram?.programData ?? {},
        equipmentLevel,
        injuryFlags,
      });

      if (!editPlan) {
        res.status(422).json({
          success: false,
          data: null,
          meta: null,
          error: {
            code: "NO_SWAP_FOUND",
            message: `No suitable replacement found for "${targetName}" with the given equipment and constraints.`,
          },
        });
        return;
      }

      // Extract replacement from EditPlan (uses changeSummary as rationale)
      const swapChange = editPlan.changes.find(ch => ch.type === "replace_exercise");
      const replacementName: string =
        (swapChange?.exercise?.name)
        ?? editPlan.changeSummary
        ?? "AI-selected replacement";

      res.json(
        buildStandardResponse({
          replacement: {
            name: replacementName,
            rationale: editPlan.changeSummary ?? "Stimulus-preserving replacement.",
          },
          alternatives: [],
          rationale: editPlan.changeSummary ?? "Stimulus-preserving replacement from TrainChat AI.",
          stimulusPreserved: true,
          source: "ai_backstop",
        }),
      );
    } catch (err) {
      logger.error({ err }, "external-programs: exercise-swap failed");
      const e = buildErrorResponse("INTERNAL_ERROR", "Exercise swap failed.");
      res.status(e.status).json(e.body);
    }
  },
);

// ─── POST /api/external/program/explain ──────────────────────────────────────

router.post(
  "/external/program/explain",
  validateExternalApiKey(["explain_program"]),
  async (req, res): Promise<void> => {
    const parsed = ExplainProgramBodySchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({
        success: false,
        data: null,
        meta: null,
        error: {
          code: "VALIDATION_ERROR",
          message: "Invalid request body.",
          details: parsed.error.issues,
        },
      });
      return;
    }

    const { programId, question } = parsed.data;

    let storedProgram: typeof externalProgramsTable.$inferSelect | undefined;
    try {
      storedProgram = await findOwnedProgram(programId, req.apiKey);
    } catch (err) {
      logger.error({ err }, "external-programs: explain DB lookup failed");
    }

    if (!storedProgram) {
      res.status(404).json({
        success: false,
        data: null,
        meta: null,
        error: { code: "NOT_FOUND", message: "Program not found." },
      });
      return;
    }

    const currentProgram = storedProgram.programData as unknown as ProgramStructure;
    const userId = buildSystemUserId(req.apiKey);
    const explainMessage = question
      ? `Explain this program: ${question}`
      : `Explain the reasoning behind this training program. Why was it structured this way? What are the key principles?`;

    try {
      const aiResponse = await generateAIResponse(explainMessage, [], userId, {
        currentProgram,
        intentResult: {
          type: "GENERAL_COACHING_QUESTION",
          confidence: "high",
        },
        hasActiveProgram: true,
      });

      res.json(
        buildStandardResponse({
          programId,
          programName: currentProgram.programName,
          explanation: aiResponse.content,
          whyItWorks: currentProgram.whyItWorks,
          progressionStrategy: currentProgram.progressionStrategy,
          intelligenceStatus: currentProgram.intelligenceStatus,
        }),
      );
    } catch (err) {
      logger.error({ err }, "external-programs: explain failed");
      const e = buildErrorResponse("INTERNAL_ERROR", "Explain request failed.");
      res.status(e.status).json(e.body);
    }
  },
);

// ─── GET /api/external/program/:id ───────────────────────────────────────────

router.get(
  "/external/program/:id",
  validateExternalApiKey(["retrieve_program"]),
  async (req, res): Promise<void> => {
    const programId = parseInt(req.params["id"] as string, 10);
    if (isNaN(programId)) {
      res.status(400).json({
        success: false,
        data: null,
        meta: null,
        error: { code: "INVALID_ID", message: "Program ID must be a number." },
      });
      return;
    }

    try {
      const program = await findOwnedProgram(programId, req.apiKey);

      if (!program) {
        res.status(404).json({
          success: false,
          data: null,
          meta: null,
          error: { code: "NOT_FOUND", message: "Program not found." },
        });
        return;
      }

      const safeProgram = stripInternalFields(
        program.programData as unknown as ProgramStructure,
      );

      res.json(
        buildStandardResponse({
          programId: program.id,
          program: safeProgram,
          summary: program.summary,
          requestContext: program.requestContext,
          generatedAt: program.generatedAt,
          updatedAt: program.updatedAt,
        }),
      );
    } catch (err) {
      logger.error({ err }, "external-programs: retrieve failed");
      const e = buildErrorResponse("INTERNAL_ERROR", "Failed to retrieve program.");
      res.status(e.status).json(e.body);
    }
  },
);

// ─── Phase 2.5: history/revert dependency wiring ─────────────────────────────
// Blob-backed collaborators use this route's db (so external_program_versions
// behavior is unchanged and testable against the mocked db); relational
// collaborators come from the default system-deps factory. The dispatcher in
// lib/external-materialization/history-revert.ts decides blob vs system based
// on trainingSystemId.
function buildHistoryRevertDeps(): HistoryRevertDeps {
  return {
    // ── blob backing (Phase 1C, unchanged) ──
    readBlobVersions: (pid) =>
      db
        .select({
          versionId: externalProgramVersionsTable.id,
          type: externalProgramVersionsTable.type,
          instruction: externalProgramVersionsTable.instruction,
          scope: externalProgramVersionsTable.scope,
          changeSummary: externalProgramVersionsTable.changeSummary,
          revertedFromVersionId: externalProgramVersionsTable.revertedFromVersionId,
          createdAt: externalProgramVersionsTable.createdAt,
        })
        .from(externalProgramVersionsTable)
        .where(eq(externalProgramVersionsTable.externalProgramId, pid))
        .orderBy(desc(externalProgramVersionsTable.id)),
    findBlobVersion: async (pid, versionId) => {
      const [v] = await db
        .select()
        .from(externalProgramVersionsTable)
        .where(
          and(
            eq(externalProgramVersionsTable.id, versionId),
            eq(externalProgramVersionsTable.externalProgramId, pid),
          ),
        )
        .limit(1);
      return v;
    },
    writeBlobRevertSnapshot: async ({ programId, apiKeyId, currentProgramData, versionId }) => {
      const [row] = await db
        .insert(externalProgramVersionsTable)
        .values({
          externalProgramId: programId,
          apiKeyId,
          programSnapshot: currentProgramData as Record<string, unknown>,
          type: "revert",
          revertedFromVersionId: versionId,
        })
        .returning();
      return { id: row?.id, createdAt: row?.createdAt ?? null };
    },
    overwriteBlob: async (pid, programData) => {
      await db
        .update(externalProgramsTable)
        .set({ programData: programData as Record<string, unknown> })
        .where(eq(externalProgramsTable.id, pid));
    },
    stripInternalFields: (program) => stripInternalFields(program as ProgramStructure),
    // ── relational backing ──
    ...createHistoryRevertSystemDeps(),
    onError: (err, stage) =>
      logger.warn({ err, stage }, "external-programs: history/revert relational step failed"),
  };
}

// ─── GET /api/external/program/:id/history ───────────────────────────────────
// Version history for a program. Ownership-scoped (identical 404 for missing +
// cross-tenant, no leak). Phase 2.5: dispatches on trainingSystemId — blob
// programs read external_program_versions; materialized programs read the
// relational system_change_log. Response shape is unchanged.

router.get(
  "/external/program/:id/history",
  validateExternalApiKey(["retrieve_program"]),
  async (req, res): Promise<void> => {
    const programId = parseInt(req.params["id"] as string, 10);
    if (isNaN(programId)) {
      res.status(400).json({
        success: false,
        data: null,
        meta: null,
        error: { code: "INVALID_ID", message: "Program ID must be a number." },
      });
      return;
    }

    try {
      // Ownership gate first — identical 404 for missing and cross-tenant.
      const owned = await findOwnedProgram(programId, req.apiKey);
      if (!owned) {
        res.status(404).json({
          success: false,
          data: null,
          meta: null,
          error: { code: "NOT_FOUND", message: "Program not found." },
        });
        return;
      }

      const { versions, backing } = await getExternalProgramHistory(
        { id: owned.id, programData: owned.programData, trainingSystemId: owned.trainingSystemId },
        buildHistoryRevertDeps(),
      );
      emitExternalEvent(backing === "system" ? "history_system" : "history_blob", { programId });

      res.json(buildStandardResponse({ programId, versions }));
    } catch (err) {
      logger.error({ err }, "external-programs: history failed");
      const e = buildErrorResponse("INTERNAL_ERROR", "Failed to load history.");
      res.status(e.status).json(e.body);
    }
  },
);

// ─── POST /api/external/program/:id/revert ───────────────────────────────────
// Restore a program to a prior version snapshot (Phase 1C). Ownership-scoped;
// the target version must belong to the same owned program. A new "revert"
// version row is written BEFORE the restore, so a rollback is itself reversible.

router.post(
  "/external/program/:id/revert",
  validateExternalApiKey(["edit_program"]),
  async (req, res): Promise<void> => {
    const programId = parseInt(req.params["id"] as string, 10);
    if (isNaN(programId)) {
      res.status(400).json({
        success: false,
        data: null,
        meta: null,
        error: { code: "INVALID_ID", message: "Program ID must be a number." },
      });
      return;
    }

    const parsed = RevertProgramBodySchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({
        success: false,
        data: null,
        meta: null,
        error: {
          code: "VALIDATION_ERROR",
          message: "Invalid request body.",
          details: parsed.error.issues,
        },
      });
      return;
    }

    const { versionId } = parsed.data;

    try {
      // Ownership gate — 404 for missing/cross-tenant program.
      const owned = await findOwnedProgram(programId, req.apiKey);
      if (!owned) {
        res.status(404).json({
          success: false,
          data: null,
          meta: null,
          error: { code: "NOT_FOUND", message: "Program not found." },
        });
        return;
      }

      // Phase 2.5: dispatch on trainingSystemId — blob programs revert the blob
      // snapshot (unchanged); materialized programs restore through the
      // relational path and reserialize the blob. On any relational failure the
      // blob is left unchanged (no corruption).
      // Phase 2.6: serialize per program so revert never interleaves with a
      // concurrent edit/materialization on the same program (per instance).
      const outcome = await withExternalProgramLock(programId, () =>
        revertExternalProgramVersion(
          { id: owned!.id, programData: owned!.programData, trainingSystemId: owned!.trainingSystemId },
          { versionId, apiKeyId: req.apiKeyId ?? null },
          buildHistoryRevertDeps(),
        ),
      );

      if (!outcome.ok) {
        emitExternalEvent("revert_failed", { programId, code: outcome.code });
        res.status(outcome.code === "NOT_FOUND" ? 404 : 500).json({
          success: false,
          data: null,
          meta: null,
          error: { code: outcome.code, message: outcome.message },
        });
        return;
      }

      emitExternalEvent("revert_succeeded", { programId, backing: outcome.backing });
      res.json(
        buildStandardResponse({
          programId,
          updatedProgram: outcome.updatedProgram,
          revertedFromVersionId: outcome.revertedFromVersionId,
          version: outcome.version,
          changeReceipt: outcome.changeReceipt,
        }),
      );
    } catch (err) {
      logger.error({ err }, "external-programs: revert failed");
      const e = buildErrorResponse("INTERNAL_ERROR", "Program revert failed.");
      res.status(e.status).json(e.body);
    }
  },
);

export default router;
