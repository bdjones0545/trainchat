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
