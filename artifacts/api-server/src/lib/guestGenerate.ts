import { logger } from "./logger";
import { getGuestSession, updateGuestSession } from "./guestService";
import { OPENAI_MODELS } from "./openai-models";
import {
  OPENAI_PROGRAM_JSON_SCHEMA,
  PROGRAM_OUTPUT_SCHEMA_VERSION,
  validateProviderProgramOutput,
} from "./program-structure-schema";
import { resolveGenerationAttempts } from "./generation-safety";
import { validatePainConstraints, type HardConstraints } from "./constraint-memory";
import type { GenerationProvenance, ProgramStructure } from "./ai";
import { validateProgramEquipmentConstraints } from "./program-equipment-safety";
import {
  normalizeGoal,
  normalizeExperience,
  normalizeEquipment,
  detectInjuryFlags,
} from "./training-intelligence";
import {
  selectSessionExercises,
  buildCoachContext,
  type SessionType,
  type GoalType as CoachGoalType,
  type ExperienceTier,
  type EquipmentLevel,
} from "./coach-select";

// ─── Types ──────────────────────────────────────────────────────────────────

export interface GuestOnboardingAnswers {
  goal: string;
  experience: string;
  frequency: number;
  equipment: string[];
  injuries: string;
  style: string;
  timeline: string;
  sport: string;
}

export interface GuestProgramExercise {
  name: string;
  classification?: string;
  sets: number;
  reps: string;
  rest: string;
  notes?: string;
}

export interface GuestProgramDay {
  dayNumber: number;
  name: string;
  focus: string;
  exercises: GuestProgramExercise[];
  dayNotes?: string;
}

export interface GuestProgram {
  programName: string;
  weeklyStructure: string;
  coachIntro: string;
  rationale: string;
  days: GuestProgramDay[];
  coachNote: string;
  progressionPrinciple: string;
  generationProvenance?: GenerationProvenance;
}

export const GUEST_PROGRAM_PROMPT_VERSION = "coach-atlas-guest-program-2026-08-20";

export class GuestGenerationError extends Error {
  constructor(
    public readonly category:
      | "provider_failure"
      | "timeout"
      | "malformed_structured_output"
      | "schema_validation_failure"
      | "hard_constraint_violation"
      | "exhausted_retry",
  ) {
    super("Guest program generation could not be completed safely.");
    this.name = "GuestGenerationError";
  }
}

// ─── Prompt Engineering ──────────────────────────────────────────────────────

function buildGuestSystemPrompt(): string {
  return `You are an elite AI performance architect — a world-class strength coach with deep expertise in exercise physiology, periodization science, and long-term athlete development.

## YOUR IDENTITY
You operate at the intersection of:
- PhD-level exercise science (adaptation biology, biomechanics, energy systems)
- Elite strength & conditioning experience (professional athletes, Olympic competitors)
- NSCA-certified programming logic (periodization, supercompensation, fatigue management)

## COMMUNICATION STYLE
- Authoritative, precise, zero fluff
- Educational — explain the WHY behind programming decisions
- Warm confidence — you're a trusted coach, not a robot
- Never generic. Every recommendation must reflect the athlete's specific profile

## NSCA EXERCISE ORDER — MANDATORY IN EVERY SESSION
Follow this hierarchy strictly in every training day. No exceptions:

1. Plyometric / Explosive movements (box jumps, med ball throws) — CNS must be fresh
2. Olympic lifts / High-skill power movements (power clean, hang clean) — before any compound work
3. Primary strength lifts (squat, deadlift, bench press) — highest priority compound
4. Secondary compound lifts (RDL, incline press, barbell row) — support the primary
5. Accessory / Isolation work (curls, lateral raises, leg press) — tolerate fatigue
6. Conditioning / Metabolic work (sled, circuits) — always last

NEVER: place explosive or high-skill lifts after heavy compound work.

## NSCA REP & INTENSITY ZONES — MANDATORY
Match prescriptions to these zones:

- Strength: 1–6 reps | 3–6 sets | primary and major compound lifts | 2–5 min rest
- Power / Olympic: 1–5 reps | 3–5 sets | max speed intent | 2–5 min rest
- Hypertrophy: 6–12 reps | 2–4 sets | secondary and accessory | 60–90 sec rest
- Endurance: 12+ reps | 2–3 sets | metabolic accessory work | 30–60 sec rest

Rules:
- Primary lifts always use strength or power zones
- Accessories always use hypertrophy zones
- Never assign 60-second rest to power cleans or heavy squats
- Never assign strength-zone reps to isolation exercises

## MOVEMENT BALANCE — PER SESSION
- Lower body day: squat pattern + hinge pattern + posterior chain accessory
- Upper body day: horizontal or vertical push + horizontal or vertical pull + shoulder stability
- No redundant loading (two horizontal pushes with no pull = violation)

## INTENT INSTRUCTIONS — REQUIRED ON EVERY EXERCISE
Every exercise MUST include a performance intent cue in the "notes" field and a "classification" field:
- Classification options: "Plyometric/Explosive", "Olympic", "Primary", "Secondary Compound", "Accessory", "Conditioning"
- Intent examples: "Explosive concentric — max intent", "Controlled eccentric (3s), explosive drive", "Stability focus, full ROM"

## PRE-OUTPUT VALIDATION (run internally before outputting)
Verify before output:
☑ Exercise order follows NSCA hierarchy (explosive → olympic → primary → secondary → accessory → conditioning)
☑ Rep ranges match NSCA zones by classification
☑ Rest periods match exercise classification (power/primary: 2-5 min; accessory: 60-90s)
☑ Every session has movement balance (push + pull or squat + hinge)
☑ Every exercise has a classification and intent cue
Auto-correct any violations before output.

## OUTPUT REQUIREMENT
Return only the canonical TrainChat program JSON contract. The provider schema
requires programName, description, progressionStrategy, splitType, days, and
complete executable exercise prescriptions. Do not add guest-specific fields.

Include all training days. Exercises must be specific and appropriate for the stated equipment. Never include equipment the user doesn't have. Exercises must appear in NSCA order within each day.`;
}

function buildGuestUserPrompt(answers: GuestOnboardingAnswers, exerciseContext?: string): string {
  const equipmentList = answers.equipment.length > 0
    ? answers.equipment.join(", ")
    : "Bodyweight only";

  const injuryNote = answers.injuries && answers.injuries.toLowerCase() !== "none" && answers.injuries.trim()
    ? `**Injury/Limitation:** ${answers.injuries} — program around this, do not aggravate it`
    : "**Injuries:** None reported";

  const sportNote = answers.sport && answers.sport.toLowerCase() !== "none" && answers.sport.trim()
    ? `**Sport/Performance Focus:** ${answers.sport}`
    : "";

  const exerciseSection = exerciseContext
    ? `\n## CURATED EXERCISE LIBRARY\nUse ONLY the exercises listed below (use these names exactly). This library has been pre-filtered for the athlete's equipment, experience, and injury constraints. You may select any exercise from the appropriate tier — do not invent exercise names not in this list.\n\n${exerciseContext}\n`
    : "";

  return `Design a complete, highly personalized Week 1 training program for this athlete:

**Primary Goal:** ${answers.goal}
**Training Experience:** ${answers.experience}
**Training Days Per Week:** ${answers.frequency}
**Available Equipment:** ${equipmentList}
${injuryNote}
**Preferred Training Style:** ${answers.style}
**Timeline/Commitment:** ${answers.timeline}
${sportNote}
${exerciseSection}
Engineering requirements (NSCA-standard):
1. Select exercises ONLY from the curated library above (when provided) and only from available equipment — never invent or assume equipment not listed
2. ${answers.experience.toLowerCase().includes("beginner") ? "Prioritize technique-friendly movements. Limit complexity. Build movement patterns before adding load." : answers.experience.toLowerCase().includes("advanced") ? "Include periodization sophistication. Advanced loading patterns appropriate." : "Balance variety with progressive overload. Moderate technique complexity."}
3. ${answers.injuries && answers.injuries.toLowerCase() !== "none" ? `Strictly route around ${answers.injuries}. Zero direct loading of affected area.` : "Full range of movement patterns available."}
4. NSCA exercise order within each day: explosive/plyometric → olympic → primary compound → secondary compound → accessory → conditioning. This order is mandatory.
5. NSCA rep zones: primary lifts = 1-6 reps (strength) or 1-5 reps (power); accessory = 6-12 reps (hypertrophy). Rest: primary/power = 2-5 min; accessory = 60-90 sec.
6. Every exercise must include: classification (Primary/Plyometric/Olympic/Secondary Compound/Accessory/Conditioning) and a performance intent cue in the notes field.
7. Each session must have movement balance: lower days = squat + hinge + posterior chain; upper days = push + pull + shoulder stability.
8. Day structure must fit ${answers.frequency} days/week without overlap.
9. Progression/regression: for each primary compound, select an appropriate difficulty. Easier alternatives are shown with ↓, harder with ↑ in the library.
10. Run internal validation before output: correct order ✓ correct rep zones ✓ correct rest ✓ movement balance ✓ intent cues ✓. Auto-correct any violations.
11. Make the program feel like it was designed by an elite strength coach — not a template.

Return only valid JSON. No markdown.`;
}

/**
 * Build a structured exercise context for the AI prompt from the live DB.
 * Pre-filters by equipment, injury, and experience so the AI selects
 * from a curated list rather than its general training data.
 */
async function buildExerciseContextForAI(answers: GuestOnboardingAnswers): Promise<string> {
  const rawGoal = normalizeGoal(answers.goal);
  const rawExperience = normalizeExperience(answers.experience);
  const rawEquipment = normalizeEquipment(answers.equipment.join(", "));
  const injuryFlags = detectInjuryFlags(answers.injuries);
  const freq = answers.frequency;

  const goal: CoachGoalType = rawGoal === "athletic_performance" ? "athletic_performance" : (rawGoal as CoachGoalType);
  const experience: ExperienceTier = rawExperience as ExperienceTier;
  const equipment: EquipmentLevel =
    rawEquipment === "dumbbells_only" ? "dumbbells_only" :
    rawEquipment === "bodyweight"     ? "bodyweight" :
    rawEquipment === "home_limited"   ? "home_limited" :
    "full_gym";

  // Determine which session types to build context for
  const sessionTypes: SessionType[] =
    freq <= 3 ? ["full_body_a", "full_body_b"] :
    freq === 4 ? ["lower_a", "upper_a", "lower_b", "upper_b"] :
    freq === 5 ? ["lower_a", "upper_a", "lower_b", "upper_b", "conditioning"] :
    ["push", "pull", "legs"];

  // Build context for each unique session type (avoid duplicates in PPL)
  const seen = new Set<string>();
  const contexts: string[] = [];

  for (const sessionType of sessionTypes) {
    if (seen.has(sessionType)) continue;
    seen.add(sessionType);
    try {
      const ctx = await buildCoachContext({
        sessionType,
        goal,
        experience,
        equipment,
        injuryFlags: injuryFlags.map(String),
        perPatternMax: 5,
      });
      contexts.push(ctx);
    } catch {
      // Don't fail AI generation if context building fails
    }
  }

  return contexts.join("\n---\n");
}

// ─── OpenAI Call ────────────────────────────────────────────────────────────

interface GuestProviderResult {
  candidate: unknown;
  provenance: GenerationProvenance;
}

async function callOpenAIProgram(systemPrompt: string, userPrompt: string, maxTokens = 3500): Promise<GuestProviderResult> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new GuestGenerationError("provider_failure");

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 30_000);
  let response: Response;
  try {
    response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      signal: controller.signal,
      body: JSON.stringify({
        model: OPENAI_MODELS.PROGRAM_GENERATION,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
        max_tokens: maxTokens,
        temperature: 0,
        response_format: { type: "json_schema", json_schema: OPENAI_PROGRAM_JSON_SCHEMA },
      }),
    });
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      throw new GuestGenerationError("timeout");
    }
    throw new GuestGenerationError("provider_failure");
  } finally {
    clearTimeout(timeout);
  }

  if (!response.ok) {
    throw new GuestGenerationError("provider_failure");
  }

  const data = (await response.json()) as {
    id?: string;
    choices: { message: { content: string } }[];
    usage?: { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number };
  };

  const raw = data.choices[0]?.message?.content;
  if (!raw) throw new GuestGenerationError("malformed_structured_output");
  let candidate: unknown;
  try {
    candidate = JSON.parse(raw);
  } catch {
    throw new GuestGenerationError("malformed_structured_output");
  }
  const usage = data.usage &&
    [data.usage.prompt_tokens, data.usage.completion_tokens, data.usage.total_tokens].every(Number.isFinite)
    ? {
        promptTokens: data.usage.prompt_tokens!,
        completionTokens: data.usage.completion_tokens!,
        totalTokens: data.usage.total_tokens!,
      }
    : null;
  return {
    candidate,
    provenance: {
      provider: "openai",
      modelId: OPENAI_MODELS.PROGRAM_GENERATION,
      promptVersion: GUEST_PROGRAM_PROMPT_VERSION,
      schemaVersion: PROGRAM_OUTPUT_SCHEMA_VERSION,
      providerRequestId: data.id ?? null,
      generatedAt: new Date().toISOString(),
      validationVerdict: "passed",
      constraintValidationVerdict: "pending",
      attemptCount: 1,
      fallbackUsed: false,
      tokenUsage: usage,
    },
  };
}

// ─── Intelligent Fallback ────────────────────────────────────────────────────

// Maps frequency + day index to a session type for the coach engine
function getDaySessionType(freq: number, dayIndex: number): { sessionType: SessionType; name: string; focus: string } {
  if (freq <= 3) {
    const options: { sessionType: SessionType; name: string; focus: string }[] = [
      { sessionType: "full_body_a", name: "Full Body A", focus: "Squat primary, horizontal push & pull — complete full-body stimulus" },
      { sessionType: "full_body_b", name: "Full Body B", focus: "Hinge primary, vertical pull & push — posterior chain and upper back emphasis" },
      { sessionType: "full_body",   name: "Full Body C", focus: "Balanced full-body integration — power, compound strength, and accessory work" },
    ];
    return options[dayIndex % options.length];
  }
  if (freq === 4) {
    const options: { sessionType: SessionType; name: string; focus: string }[] = [
      { sessionType: "lower_a", name: "Lower A — Squat Focus",   focus: "Quad-dominant squat patterns, hinge accessory, posterior chain" },
      { sessionType: "upper_a", name: "Upper A — Push",          focus: "Horizontal & vertical press, shoulder stability, tricep accessory" },
      { sessionType: "lower_b", name: "Lower B — Hinge Focus",   focus: "Hinge-dominant, posterior chain, unilateral legs" },
      { sessionType: "upper_b", name: "Upper B — Pull",          focus: "Vertical & horizontal pull, back thickness and arm accessory" },
    ];
    return options[dayIndex % options.length];
  }
  if (freq === 5) {
    const options: { sessionType: SessionType; name: string; focus: string }[] = [
      { sessionType: "lower_a",     name: "Lower A — Squat Focus",         focus: "Quad-dominant squat patterns, hinge accessory" },
      { sessionType: "upper_a",     name: "Upper A — Push",                focus: "Horizontal press primary, shoulder and tricep work" },
      { sessionType: "lower_b",     name: "Lower B — Hinge Focus",         focus: "Hinge primary, posterior chain, unilateral legs" },
      { sessionType: "upper_b",     name: "Upper B — Pull",                focus: "Vertical pull primary, rows, and arm accessory" },
      { sessionType: "conditioning",name: "Power & Conditioning",          focus: "Explosive work, conditioning, and athletic development" },
    ];
    return options[dayIndex % options.length];
  }
  // 6 days — PPL
  const options: { sessionType: SessionType; name: string; focus: string }[] = [
    { sessionType: "push", name: "Push A", focus: "Chest, front delts, triceps — horizontal and vertical press" },
    { sessionType: "pull", name: "Pull A", focus: "Back width, rear delts, biceps — vertical and horizontal pull" },
    { sessionType: "legs", name: "Legs A", focus: "Squat-dominant lower body, posterior chain accessory" },
    { sessionType: "push", name: "Push B", focus: "Incline, overhead, triceps — upper chest and shoulder emphasis" },
    { sessionType: "pull", name: "Pull B", focus: "Rows, deadlift accessory, biceps — back thickness focus" },
    { sessionType: "legs", name: "Legs B", focus: "Hinge-dominant lower body, unilateral accessory" },
  ];
  return options[dayIndex % options.length];
}

async function buildFallbackProgram(answers: GuestOnboardingAnswers): Promise<GuestProgram> {
  const rawGoal = normalizeGoal(answers.goal);
  const rawExperience = normalizeExperience(answers.experience);
  const rawEquipment = normalizeEquipment(answers.equipment.join(", "));
  const injuryFlags = detectInjuryFlags(answers.injuries);
  const freq = Math.min(Math.max(answers.frequency, 2), 6);

  // Map to coach-select types
  const goal: CoachGoalType =
    rawGoal === "athletic_performance" ? "athletic_performance" : (rawGoal as CoachGoalType);
  const experience: ExperienceTier = rawExperience as ExperienceTier;
  const equipment: EquipmentLevel =
    rawEquipment === "dumbbells_only" ? "dumbbells_only" :
    rawEquipment === "bodyweight"     ? "bodyweight" :
    rawEquipment === "home_limited"   ? "home_limited" :
    "full_gym";

  const goalLabels: Record<string, string> = {
    hypertrophy: "Muscle Building",
    strength: "Strength",
    fat_loss: "Fat Loss",
    general_fitness: "General Fitness",
    athletic_performance: "Athletic Performance",
    endurance: "Endurance",
  };
  const goalLabel = goalLabels[goal] ?? answers.goal;

  const splitLabel =
    freq <= 3 ? `${freq}-Day Full Body` :
    freq === 4 ? "4-Day Upper/Lower Split" :
    freq === 5 ? "5-Day Upper/Lower + Conditioning" :
    "6-Day Push/Pull/Legs";

  // Build all days using the intelligent coach selection engine
  const days: GuestProgramDay[] = await Promise.all(
    Array.from({ length: freq }, async (_, i) => {
      const dayPlan = getDaySessionType(freq, i);

      const coachExercises = await selectSessionExercises({
        sessionType: dayPlan.sessionType,
        goal,
        experience,
        equipment,
        injuryFlags: injuryFlags.map(String),
        weekNumber: 1, // intro week — slightly reduced volume
        sessionDuration: answers.frequency >= 5 ? 60 : 65,
      });

      return {
        dayNumber: i + 1,
        name: `Day ${i + 1} — ${dayPlan.name}`,
        focus: dayPlan.focus,
        exercises: coachExercises.map((ex) => ({
          name: ex.name,
          classification: ex.classification,
          sets: ex.sets,
          reps: ex.reps,
          rest: ex.rest,
          notes: ex.notes,
        })),
        dayNotes: i === 0
          ? "Week 1: establish your baseline loads. Record weights on every set — progressive overload is tracked from here."
          : undefined,
      };
    })
  );

  return {
    programName: `${answers.experience} ${goalLabel} Program — ${freq}×/week`,
    weeklyStructure: splitLabel,
    coachIntro: `Based on your ${answers.experience.toLowerCase()} experience and ${goalLabel.toLowerCase()} focus, I've built a ${freq}-day program that pulls from a library of 620 structured exercises — every selection is matched to your equipment, experience level, and any limitations you noted.`,
    rationale: `This program applies progressive overload across ${freq} weekly sessions. Exercises follow NSCA hierarchy (explosive → primary compound → secondary → accessory) and are filtered to your ${answers.equipment.join("/")} setup${answers.injuries && answers.injuries.toLowerCase() !== "none" ? `, routing around ${answers.injuries}` : ""}. Volume and intensity are calibrated for your experience tier.`,
    days,
    coachNote: `Focus on movement quality in week 1 — track every weight used. From week 2 we load progressively. Log any soreness or discomfort so adjustments can be made.`,
    progressionPrinciple: `Add 2.5–5% load or 1-2 reps when all sets are completed cleanly. Every fourth week: deload (reduce sets by 1, weights by 40%). Progress compounds first.`,
  };
}

function canonicalToGuestProgram(
  program: ProgramStructure,
  answers: GuestOnboardingAnswers,
  provenance: GenerationProvenance,
): GuestProgram {
  return {
    programName: program.programName,
    weeklyStructure: program.splitType ?? `${answers.frequency}-day program`,
    coachIntro: program.description,
    rationale: program.description,
    days: program.days.map((day) => ({
      dayNumber: day.dayNumber,
      name: day.name,
      focus: day.focus ?? day.name,
      exercises: day.exercises.map((exercise) => ({
        name: exercise.name,
        classification: exercise.classification,
        sets: exercise.sets,
        reps: exercise.reps,
        rest: exercise.rest,
        notes: exercise.notes ?? exercise.intent,
      })),
      dayNotes: day.notes,
    })),
    coachNote: program.whyItWorks ?? program.description,
    progressionPrinciple: program.progressionStrategy ?? "Progress only after completing every prescribed repetition safely.",
    generationProvenance: provenance,
  };
}

function guestFallbackToCanonical(program: GuestProgram): ProgramStructure {
  return {
    programName: program.programName,
    description: program.rationale,
    progressionStrategy: program.progressionPrinciple,
    splitType: program.weeklyStructure,
    days: program.days.map((day) => ({
      dayNumber: day.dayNumber,
      name: day.name,
      focus: day.focus,
      exercises: day.exercises.map((exercise) => ({
        name: exercise.name,
        classification: exercise.classification ?? "Accessory",
        sets: exercise.sets,
        reps: exercise.reps,
        rest: exercise.rest,
        intent: exercise.notes ?? "Execute with controlled, pain-free technique.",
        notes: exercise.notes ?? "Execute with controlled, pain-free technique.",
      })),
      notes: day.dayNotes ?? "Follow the prescribed exercise order and stop if pain occurs.",
    })),
  };
}

export function validateGuestProgramConstraints(
  program: ProgramStructure,
  answers: GuestOnboardingAnswers,
): { constraintIssues: string[]; hardConstraintIssues: string[]; criticalPainIssues: string[] } {
  const constraintIssues: string[] = [];
  if (program.days.length !== answers.frequency) {
    constraintIssues.push(`frequency expected ${answers.frequency}, received ${program.days.length}`);
  }

  const hardConstraintIssues = validateProgramEquipmentConstraints(
    program,
    answers.equipment.join(", "),
  ).map((violation) => violation.detail);

  const injuryFlags = detectInjuryFlags(answers.injuries).map(String);
  const hardConstraints: HardConstraints = {
    bannedItems: [],
    dislikedItems: [],
    painRegions: injuryFlags,
    monitorRegions: [],
    sport: answers.sport || null,
  };
  const criticalPainIssues = validatePainConstraints(program, hardConstraints)
    .map((warning) => `${warning.exerciseName}: ${warning.painRegion} ${warning.severity}`);

  return { constraintIssues, hardConstraintIssues, criticalPainIssues };
}

function assessGuestCandidate(candidate: unknown, answers: GuestOnboardingAnswers) {
  const schema = validateProviderProgramOutput(candidate);
  if (!schema.valid) {
    return {
      value: candidate,
      schemaIssues: schema.issues,
      constraintIssues: [],
      hardConstraintIssues: [],
      criticalPainIssues: [],
    };
  }
  const program = candidate as ProgramStructure;
  return {
    value: program,
    schemaIssues: [],
    ...validateGuestProgramConstraints(program, answers),
  };
}

// ─── Main Services ────────────────────────────────────────────────────────────

export async function generateGuestProgram(
  deviceId: string,
  answers: GuestOnboardingAnswers
): Promise<GuestProgram> {
  let program: GuestProgram | undefined;

  // Pre-build exercise context from the 620-exercise DB.
  // This is passed to both the AI (to constrain its selection) and used in the fallback.
  let exerciseContext: string | undefined;
  try {
    exerciseContext = await buildExerciseContextForAI(answers);
  } catch (ctxErr: any) {
    logger.warn({ err: ctxErr.message }, "Failed to build exercise context — proceeding without it");
  }

  try {
    const attempts: ReturnType<typeof assessGuestCandidate>[] = [];
    const providerResults: GuestProviderResult[] = [];
    for (let attempt = 0; attempt < 2; attempt++) {
      let result: GuestProviderResult;
      try {
        result = await callOpenAIProgram(
          buildGuestSystemPrompt(),
          buildGuestUserPrompt(answers, exerciseContext) +
            (attempt === 1 ? "\nThis is the final retry. Correct every schema, equipment, frequency, and injury violation." : ""),
        );
      } catch (attemptErr) {
        if (attemptErr instanceof GuestGenerationError && attemptErr.category === "malformed_structured_output") {
          attempts.push({
            value: null,
            schemaIssues: ["malformed provider response"],
            constraintIssues: [],
            hardConstraintIssues: [],
            criticalPainIssues: [],
          });
          if (attempt === 1) throw new GuestGenerationError("exhausted_retry");
          continue;
        }
        throw attemptErr;
      }
      providerResults.push(result);
      attempts.push(assessGuestCandidate(result.candidate, answers));
      const resolution = resolveGenerationAttempts(attempts);
      if (resolution.accepted) {
        const usageAvailable = providerResults.every((item) => item.provenance.tokenUsage !== null);
        const provenance: GenerationProvenance = {
          ...result.provenance,
          attemptCount: providerResults.length,
          validationVerdict: "passed",
          constraintValidationVerdict: "passed",
          tokenUsage: usageAvailable ? providerResults.reduce((total, item) => ({
            promptTokens: total.promptTokens + item.provenance.tokenUsage!.promptTokens,
            completionTokens: total.completionTokens + item.provenance.tokenUsage!.completionTokens,
            totalTokens: total.totalTokens + item.provenance.tokenUsage!.totalTokens,
          }), { promptTokens: 0, completionTokens: 0, totalTokens: 0 }) : null,
        };
        program = canonicalToGuestProgram(resolution.value as ProgramStructure, answers, provenance);
        logger.info({ attemptCount: provenance.attemptCount }, "Guest program generated via strict OpenAI schema");
        break;
      }
    }
    if (!program) throw new GuestGenerationError("exhausted_retry");
  } catch (err: any) {
    if (err instanceof GuestGenerationError && err.category !== "provider_failure" && err.category !== "timeout") {
      logger.warn({ category: err.category }, "Guest provider output exhausted safety retries");
      throw err;
    }
    if (err.message !== "NO_API_KEY") {
      logger.warn({ category: err?.category ?? "provider_failure" }, "Guest provider unavailable — validating deterministic fallback");
    } else {
      logger.info("No OpenAI key — validating coach-select fallback");
    }
    const fallback = await buildFallbackProgram(answers);
    const canonicalFallback = guestFallbackToCanonical(fallback);
    const fallbackAssessment = assessGuestCandidate(canonicalFallback, answers);
    const fallbackResolution = resolveGenerationAttempts([fallbackAssessment]);
    if (!fallbackResolution.accepted) {
      logger.error({
        schemaIssues: fallbackAssessment.schemaIssues,
        constraintIssues: fallbackAssessment.constraintIssues,
        hardConstraintIssues: fallbackAssessment.hardConstraintIssues,
        criticalPainIssues: fallbackAssessment.criticalPainIssues,
      }, "Deterministic guest fallback rejected by shared safety boundary");
      throw new GuestGenerationError("hard_constraint_violation");
    }
    program = canonicalToGuestProgram(canonicalFallback, answers, {
      provider: "local_fallback",
      modelId: "coach-select-deterministic",
      promptVersion: GUEST_PROGRAM_PROMPT_VERSION,
      schemaVersion: PROGRAM_OUTPUT_SCHEMA_VERSION,
      providerRequestId: null,
      generatedAt: new Date().toISOString(),
      validationVerdict: "passed",
      constraintValidationVerdict: "passed",
      attemptCount: 1,
      fallbackUsed: true,
      tokenUsage: null,
    });
  }

  if (!program) throw new GuestGenerationError("exhausted_retry");

  // Persist to guest session
  const session = await getGuestSession(deviceId);
  const existingMeta = (session?.metadata ?? {}) as Record<string, unknown>;

  await updateGuestSession(deviceId, {
    firstProgramGeneratedAt: new Date(),
    teaserUsesCount: 1,
    metadata: {
      ...existingMeta,
      firstProgramOutput: program,
      firstProgramProvenance: program.generationProvenance,
    },
  });

  return program;
}

export async function generateGuestFollowup(
  deviceId: string,
  userMessage: string
): Promise<string> {
  const session = await getGuestSession(deviceId);
  if (!session) throw new Error("Guest session not found");

  const meta = (session.metadata ?? {}) as Record<string, unknown>;
  const answers = meta.onboardingAnswers as GuestOnboardingAnswers | undefined;
  const firstProgram = meta.firstProgramOutput as GuestProgram | undefined;

  const systemPrompt = `You are an elite AI performance architect. You have just delivered a personalized training program to this athlete and they have one follow-up question or refinement request.

## ATHLETE PROFILE
${answers ? `- Goal: ${answers.goal}
- Experience: ${answers.experience}
- Training Days: ${answers.frequency}/week
- Equipment: ${(answers.equipment ?? []).join(", ")}
- Injuries: ${answers.injuries}
- Style: ${answers.style}` : "Profile not available"}

## THEIR INITIAL PROGRAM
${firstProgram ? `Program: ${firstProgram.programName}
Structure: ${firstProgram.weeklyStructure}
Days: ${firstProgram.days.map(d => d.name).join(", ")}` : "Program context not available"}

## RESPONSE RULES
- Answer precisely and helpfully
- Stay in character as their performance coach
- If they want a modification, describe it clearly
- If they ask a question, answer it with expert depth
- Keep response focused and scannable (use line breaks)
- Do NOT repeat back what they said
- Do NOT use filler phrases`;

  let content: string;

  try {
      const apiKey = process.env.OPENAI_API_KEY;
      if (!apiKey) throw new Error("NO_API_KEY");

      const response = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
        body: JSON.stringify({
          model: OPENAI_MODELS.PROGRAM_GENERATION,
          messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: userMessage },
          ],
          max_tokens: 800,
          temperature: 0.65,
        }),
      });

      const data = (await response.json()) as { choices: { message: { content: string } }[] };
      content = data.choices[0]?.message?.content ?? "Good question. Let me think through this...";
  } catch {
    content = generateFallbackFollowup(userMessage, answers, firstProgram);
  }

  // Update teaser usage
  await updateGuestSession(deviceId, {
    teaserUsesCount: (session.teaserUsesCount ?? 1) + 1,
  });

  return content;
}

function generateFallbackFollowup(
  message: string,
  answers?: GuestOnboardingAnswers,
  program?: GuestProgram
): string {
  const lower = message.toLowerCase();

  if (lower.match(/easier|beginner|simpler|too hard|scale/)) {
    return `Good call — if the volume feels high in week 1, reduce each working set by one and prioritize movement quality over load. The structure stays the same; just start conservative and earn the volume over weeks 2-3.`;
  }
  if (lower.match(/harder|more volume|too easy|advanced/)) {
    return `If week 1 feels manageable, add one working set to your two heaviest compound lifts in week 2, and increase difficulty where form held well — an extra rep, tighter tempo, or harder variation. Don't chase fatigue — chase quality reps with stronger intent.`;
  }
  if (lower.match(/swap|change|replace|substitute|alternative/)) {
    return `Happy to swap exercises. Tell me which movement you want to replace and I'll give you a biomechanically equivalent substitute that matches your equipment and won't compromise the program structure.`;
  }
  if (lower.match(/cardio|conditioning|fat loss|cut/)) {
    return `For cardio alongside this program: 2-3 sessions of 20-30 min moderate-intensity work on off days works well. Keep intensity low enough that it doesn't compromise recovery. If fat loss is the primary goal, nutrition will drive 80% of those results — the lifting preserves muscle.`;
  }
  if (lower.match(/how long|weeks|progress|when|results/)) {
    return `With consistent execution and adequate nutrition, expect measurable strength gains in weeks 2-4 and visible physique changes by weeks 6-8. Beginners will progress faster. Log your lifts weekly — the data tells you more than how you feel day to day.`;
  }

  return `That's a great angle to work on. Based on your ${answers?.goal ?? "goal"} and current ${answers?.experience ?? ""} experience, the key is consistency with progressive load. Keep the core structure intact for the first 3 weeks to establish your baseline — then we can make informed adjustments. What specifically prompted the question?`;
}
