/**
 * Zod schema for AI-generated ProgramStructure output (release-audit F5).
 *
 * The LLM's JSON was previously parsed and CAST (`JSON.parse(...) as
 * ProgramStructure`) with no structural validation — a malformed model
 * response could be persisted as a training program or returned as a
 * successful structured result. This schema is the gate at the
 * probabilistic→deterministic boundary.
 *
 * Design notes:
 * - Mirrors the `ProgramStructure` interface in lib/ai.ts (which remains the
 *   TypeScript source of truth). A maximal-fixture test in
 *   program-structure-schema.test.ts keeps the two from drifting.
 * - STRICT on the skeleton the product depends on: programName, a non-empty
 *   `days` array, each day named with an `exercises` array, each exercise
 *   named. Anything less is not a program.
 * - LENIENT on prescription fields (sets/reps/rest optional, but
 *   type-checked when present): every persistence path already tolerates
 *   their absence (`ex.sets ?? null`), and rest/mobility entries legitimately
 *   omit them. Requiring them would reject real, usable model output.
 * - Loose objects (unknown keys pass through): the pipeline decorates
 *   programs with internal fields (`_buildMeta`, `_architectureAudit`, …) and
 *   the model sometimes volunteers extras — validation must not strip or
 *   reject them. Callers keep using the ORIGINAL parsed object; this module
 *   only answers "is it structurally a program".
 */

import { z } from "zod/v4";

export const PROGRAM_OUTPUT_SCHEMA_VERSION = "trainchat.program.v1";
export const PROGRAM_PROMPT_VERSION = "coach-atlas-program-2026-08-20";

/**
 * Provider-facing contract. Unlike the decorated persistence shape below, this
 * is strict and requires an executable prescription for every generated
 * exercise. Internal metadata is attached only after this boundary passes.
 */
export const ProviderProgramOutputSchema = z.strictObject({
  programName: z.string().min(1),
  description: z.string().min(1),
  progressionStrategy: z.string().min(1),
  splitType: z.string().min(1),
  days: z.array(z.strictObject({
    dayNumber: z.number().int().positive(),
    name: z.string().min(1),
    focus: z.string().min(1),
    exercises: z.array(z.strictObject({
      name: z.string().min(1),
      classification: z.string().min(1),
      sets: z.number().int().positive(),
      reps: z.string().min(1),
      rest: z.string().min(1),
      intent: z.string().min(1),
      notes: z.string().min(1),
    })),
    notes: z.string().min(1),
  })).min(1),
});

export const OPENAI_PROGRAM_JSON_SCHEMA = {
  name: "trainchat_program",
  strict: true,
  schema: {
    type: "object",
    additionalProperties: false,
    required: ["programName", "description", "progressionStrategy", "splitType", "days"],
    properties: {
      programName: { type: "string", minLength: 1 },
      description: { type: "string", minLength: 1 },
      progressionStrategy: { type: "string", minLength: 1 },
      splitType: { type: "string", minLength: 1 },
      days: {
        type: "array",
        minItems: 1,
        items: {
          type: "object",
          additionalProperties: false,
          required: ["dayNumber", "name", "focus", "exercises", "notes"],
          properties: {
            dayNumber: { type: "integer", minimum: 1 },
            name: { type: "string", minLength: 1 },
            focus: { type: "string", minLength: 1 },
            exercises: {
              type: "array",
              items: {
                type: "object",
                additionalProperties: false,
                required: ["name", "classification", "sets", "reps", "rest", "intent", "notes"],
                properties: {
                  name: { type: "string", minLength: 1 },
                  classification: { type: "string", minLength: 1 },
                  sets: { type: "integer", minimum: 1 },
                  reps: { type: "string", minLength: 1 },
                  rest: { type: "string", minLength: 1 },
                  intent: { type: "string", minLength: 1 },
                  notes: { type: "string", minLength: 1 },
                },
              },
            },
            notes: { type: "string", minLength: 1 },
          },
        },
      },
    },
  },
} as const;

export function validateProviderProgramOutput(candidate: unknown): ProgramStructureValidation {
  const result = ProviderProgramOutputSchema.safeParse(candidate);
  if (result.success && result.data.days.some((day) => day.exercises.length > 0)) {
    return { valid: true };
  }
  if (result.success) return { valid: false, issues: ["days: program has no executable exercises"] };
  return {
    valid: false,
    issues: result.error.issues.slice(0, 10)
      .map((issue) => `${issue.path.join(".") || "(root)"}: ${issue.message}`),
  };
}

export const ExerciseSchema = z.looseObject({
  name: z.string().min(1),
  classification: z.string().optional(),
  sets: z.number().optional(),
  reps: z.string().optional(),
  rest: z.string().optional(),
  intent: z.string().optional(),
  notes: z.string().optional(),
});

export const ProgramDaySchema = z.looseObject({
  // The interface declares dayNumber required, but persistence derives order
  // from array position — tolerate its absence rather than reject a program.
  dayNumber: z.number().optional(),
  name: z.string().min(1),
  focus: z.string().optional(),
  // Empty is allowed: rest/recovery days legitimately carry no exercises.
  exercises: z.array(ExerciseSchema),
  notes: z.string().optional(),
  sessionFlowNotes: z.array(z.string()).optional(),
});

export const ProgramStructureSchema = z.looseObject({
  programName: z.string().min(1),
  description: z.string().optional(),
  progressionStrategy: z.string().optional(),
  splitType: z.string().optional(),
  whatChanged: z.string().optional(),
  whyChanged: z.string().optional(),
  expertJudgmentNotes: z.array(z.string()).optional(),
  whyItWorks: z.string().optional(),
  days: z.array(ProgramDaySchema).min(1),
  intelligenceStatus: z
    .looseObject({
      periodizationPhase: z.string().optional(),
      progressionModel: z.string().optional(),
      adaptationDirective: z.string().optional(),
      recoveryStatus: z.string().optional(),
      behavioralSignals: z
        .array(z.looseObject({ type: z.string(), label: z.string() }))
        .optional(),
    })
    .optional(),
  _architectureAudit: z.unknown().optional(),
});

export type ProgramStructureValidation =
  | { valid: true }
  | { valid: false; issues: string[] };

/**
 * Validate a parsed candidate against the program schema. Returns compact,
 * loggable issue strings on failure. Validation-only: on success callers keep
 * the original object (no re-shaping, no field stripping).
 */
export function validateProgramStructure(candidate: unknown): ProgramStructureValidation {
  const result = ProgramStructureSchema.safeParse(candidate);
  if (result.success) return { valid: true };
  return {
    valid: false,
    issues: result.error.issues
      .slice(0, 10)
      .map((issue) => `${issue.path.join(".") || "(root)"}: ${issue.message}`),
  };
}
