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
import { db, externalProgramsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { getSwapCandidates, findExerciseByName } from "../../lib/exercise-service";
import { resolveSafeSwapBackstop } from "../../lib/swap-backstop-service";
import { logger } from "../../lib/logger";

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

// ─── Helpers ──────────────────────────────────────────────────────────────────

function buildSystemUserId(apiKey: Express.Request["apiKey"]): number {
  return apiKey?.createdBy ?? 1;
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
      const [found] = await db
        .select()
        .from(externalProgramsTable)
        .where(eq(externalProgramsTable.id, programId))
        .limit(1);
      storedProgram = found;
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

      const updatedProgram = aiResponse.structuredData
        ? stripInternalFields(aiResponse.structuredData)
        : currentProgram;

      await db
        .update(externalProgramsTable)
        .set({
          programData: updatedProgram as unknown as Record<string, unknown>,
        })
        .where(eq(externalProgramsTable.id, programId));

      res.json(
        buildStandardResponse({
          programId,
          updatedProgram,
          changes: aiResponse.changeSummary ?? [],
          coachSummary: aiResponse.content,
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

      // 2. Fall back to AI swap backstop via resolveSafeSwapBackstop
      let storedProgram: typeof externalProgramsTable.$inferSelect | undefined;
      if (programId) {
        const [found] = await db
          .select()
          .from(externalProgramsTable)
          .where(eq(externalProgramsTable.id, programId))
          .limit(1);
        storedProgram = found;
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
      const [found] = await db
        .select()
        .from(externalProgramsTable)
        .where(eq(externalProgramsTable.id, programId))
        .limit(1);
      storedProgram = found;
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
      const [program] = await db
        .select()
        .from(externalProgramsTable)
        .where(eq(externalProgramsTable.id, programId))
        .limit(1);

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

export default router;
