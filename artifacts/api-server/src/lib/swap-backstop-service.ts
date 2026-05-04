import { db, exerciseLibrary, globalLearningEventsTable, learningCandidatesTable } from "@workspace/db";
import { and, eq, sql } from "drizzle-orm";
import { logger } from "./logger";
import { OPENAI_MODELS } from "./openai-models";
import { findExerciseByName, getByMovementPattern } from "./exercise-service";
import type { EditPlan } from "./edit-intent-service";

type Difficulty = "beginner" | "intermediate" | "advanced" | "elite";
type Demand = "low" | "moderate" | "high";

interface SwapBackstopContext {
  exerciseName: string;
  exerciseId: number;
  userRequest: string;
  system: any;
  equipmentLevel: string;
  injuryFlags: string[];
  /** User-excluded exercise names from exercise_exclusion memories — never swap to these. */
  excludeNames?: string[];
  researchGuidance?: string;
}

interface GeneratedExerciseDefinition {
  name: string;
  movementPattern: string;
  bodyRegion: string;
  role: string;
  unilateral: boolean;
  primaryMuscle: string;
  secondaryMuscles: string[];
  equipment: string[];
  difficultyLevel: Difficulty;
  neuralDemand: Demand;
  timeCost: Demand;
  intentTags: string[];
  sportTransferTags: string[];
  jointStressProfile: string[];
  tags: string[];
  coachingNotes: string;
  reason: string;
}

const EQUIPMENT_LEVEL_MAP: Record<string, string[]> = {
  full_gym: ["barbell", "dumbbell", "cable", "machine", "bodyweight", "kettlebell", "band", "trap_bar", "rings", "trx", "sled", "med_ball", "pull_up_bar", "plyo_box"],
  dumbbells_only: ["dumbbell", "bodyweight", "band", "kettlebell"],
  home_limited: ["dumbbell", "bodyweight", "band", "kettlebell"],
  bodyweight: ["bodyweight", "band"],
};

const SPECIALTY_EQUIPMENT = ["pull_up_bar", "plyo_box", "barbell", "cable", "machine", "trap_bar", "sled", "rings", "trx", "med_ball"];
const DIFFICULTIES = new Set(["beginner", "intermediate", "advanced", "elite"]);
const DEMANDS = new Set(["low", "moderate", "high"]);
const APPROVED_ADJACENT_PATTERNS: Record<string, string[]> = {
  knee_dominant: ["accessory_lower", "hip_dominant"],
  hip_dominant: ["accessory_lower", "knee_dominant"],
  push_horizontal: ["push_vertical", "accessory_upper"],
  push_vertical: ["push_horizontal", "accessory_upper"],
  pull_horizontal: ["pull_vertical", "accessory_upper"],
  pull_vertical: ["pull_horizontal", "accessory_upper"],
  power_explosive: ["plyometric", "conditioning"],
  plyometric: ["power_explosive", "conditioning"],
  core_anti_extension: ["core_anti_rotation", "core_lateral"],
  core_anti_rotation: ["core_anti_extension", "core_rotation", "core_lateral"],
  core_rotation: ["core_anti_rotation", "core_lateral"],
  core_lateral: ["core_anti_extension", "core_anti_rotation"],
  accessory_lower: ["knee_dominant", "hip_dominant"],
  accessory_upper: ["push_horizontal", "pull_horizontal", "push_vertical", "pull_vertical"],
  conditioning: ["power_explosive", "plyometric"],
  mobility_prep: ["activation", "corrective"],
  activation: ["mobility_prep", "corrective"],
  corrective: ["mobility_prep", "activation"],
};

function isGenericExerciseName(name: string): boolean {
  const n = name.trim().toLowerCase();
  if (n.length < 3 || n.length > 80) return true;
  if (/^(something|anything|another|different|alternative|substitute|replacement|exercise|movement|variation|option|similar|better)(\s+\w+)?$/.test(n)) return true;
  if (/^(a|an|the)\s+(exercise|movement|variation|option|alternative|substitute|replacement)$/i.test(name.trim())) return true;
  if (/[{}[\]"`]/.test(name)) return true;
  return false;
}

function hasAllowedEquipment(equipment: string[], equipmentLevel: string): boolean {
  const allowed = EQUIPMENT_LEVEL_MAP[equipmentLevel] ?? EQUIPMENT_LEVEL_MAP.full_gym;
  for (const item of equipment) {
    if (SPECIALTY_EQUIPMENT.includes(item) && !allowed.includes(item)) return false;
  }
  return equipment.some((item) => allowed.includes(item));
}

function inferMovementPattern(name: string, category?: string): string {
  const n = `${name} ${category ?? ""}`.toLowerCase();
  if (/squat|lunge|split squat|step.?up|leg press/.test(n)) return "knee_dominant";
  if (/deadlift|hinge|rdl|hip thrust|glute bridge|good morning|swing/.test(n)) return "hip_dominant";
  if (/bench|push.?up|chest press|dip/.test(n)) return "push_horizontal";
  if (/overhead|shoulder press|z.?press|landmine press/.test(n)) return "push_vertical";
  if (/row|face pull/.test(n)) return "pull_horizontal";
  if (/pull.?up|chin.?up|pulldown|lat/.test(n)) return "pull_vertical";
  if (/jump|bound|sprint|throw|plyo|power|med ball/.test(n)) return "power_explosive";
  if (/plank|dead bug|hollow|anti.?extension|ab wheel/.test(n)) return "core_anti_extension";
  if (/pallof|anti.?rotation|chop|lift/.test(n)) return "core_anti_rotation";
  if (/carry|suitcase|side plank|lateral/.test(n)) return "core_lateral";
  if (/mobility|stretch|cars|prep|activation/.test(n)) return "mobility_prep";
  if (/conditioning|bike|run|rower|sled|tempo/.test(n)) return "conditioning";
  return "accessory_lower";
}

function findProgramExercise(system: any, exerciseId: number) {
  for (const phase of system.phases ?? []) {
    for (const week of phase.weeks ?? []) {
      for (const session of week.sessions ?? []) {
        const found = (session.exercises ?? []).find((ex: any) => ex.id === exerciseId);
        if (found) return { exercise: found, session, week, phase };
      }
    }
  }
  return null;
}

function approvedPatterns(sourcePattern: string): string[] {
  return [sourcePattern, ...(APPROVED_ADJACENT_PATTERNS[sourcePattern] ?? [])];
}

function normalizeArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.map((item) => String(item).trim()).filter(Boolean);
}

function validateGeneratedExercise(def: any, ctx: SwapBackstopContext, sourcePattern: string): { ok: boolean; definition?: GeneratedExerciseDefinition; reason?: string } {
  if (!def || typeof def !== "object") return { ok: false, reason: "not_object" };
  const name = String(def.name ?? "").trim();
  if (isGenericExerciseName(name)) return { ok: false, reason: "generic_name" };
  if (name.toLowerCase() === ctx.exerciseName.toLowerCase()) return { ok: false, reason: "same_exercise" };
  const existingPattern = approvedPatterns(sourcePattern);
  const movementPattern = String(def.movementPattern ?? sourcePattern).trim();
  if (!existingPattern.includes(movementPattern)) return { ok: false, reason: "unapproved_pattern" };
  const equipment = normalizeArray(def.equipment);
  if (equipment.length === 0 || !hasAllowedEquipment(equipment, ctx.equipmentLevel)) return { ok: false, reason: "equipment_mismatch" };
  const jointStressProfile = normalizeArray(def.jointStressProfile);
  if (ctx.injuryFlags.some((flag) => jointStressProfile.includes(flag))) return { ok: false, reason: "injury_flag_conflict" };
  const difficultyLevel = String(def.difficultyLevel ?? "intermediate") as Difficulty;
  if (!DIFFICULTIES.has(difficultyLevel)) return { ok: false, reason: "bad_difficulty" };
  const neuralDemand = String(def.neuralDemand ?? "moderate") as Demand;
  const timeCost = String(def.timeCost ?? "moderate") as Demand;
  if (!DEMANDS.has(neuralDemand) || !DEMANDS.has(timeCost)) return { ok: false, reason: "bad_demand" };
  return {
    ok: true,
    definition: {
      name,
      movementPattern,
      bodyRegion: String(def.bodyRegion ?? "full_body"),
      role: String(def.role ?? "accessory"),
      unilateral: Boolean(def.unilateral),
      primaryMuscle: String(def.primaryMuscle ?? "general"),
      secondaryMuscles: normalizeArray(def.secondaryMuscles),
      equipment,
      difficultyLevel,
      neuralDemand,
      timeCost,
      intentTags: normalizeArray(def.intentTags),
      sportTransferTags: normalizeArray(def.sportTransferTags),
      jointStressProfile,
      tags: normalizeArray(def.tags),
      coachingNotes: String(def.coachingNotes ?? `Substituted for ${ctx.exerciseName}.`).slice(0, 500),
      reason: String(def.reason ?? "AI selected a same-pattern substitute after the exercise library had no direct candidate.").slice(0, 500),
    },
  };
}

async function callOpenAIForSwap(ctx: SwapBackstopContext, sourcePattern: string, sourceMeta: any): Promise<GeneratedExerciseDefinition | null> {
  const apiKey = process.env.OPENAI_API_KEY ?? process.env.AI_INTEGRATIONS_OPENAI_API_KEY;
  if (!apiKey) {
    logger.warn("[SwapBackstop] No OpenAI key available — skipping AI proposal");
    return null;
  }

  const baseUrl = process.env.OPENAI_API_KEY
    ? "https://api.openai.com/v1"
    : (process.env.AI_INTEGRATIONS_OPENAI_BASE_URL ?? "https://api.openai.com/v1");
  const allowed = EQUIPMENT_LEVEL_MAP[ctx.equipmentLevel] ?? EQUIPMENT_LEVEL_MAP.full_gym;
  const allowedPatterns = approvedPatterns(sourcePattern);
  const researchNote = ctx.researchGuidance ? `\n${ctx.researchGuidance}\n` : "";
  const exclusionNote = ctx.excludeNames?.length
    ? `\nHARD-EXCLUDED EXERCISES (NEVER suggest any of these): ${ctx.excludeNames.join(", ")}`
    : "";
  const prompt = `You are a strength and conditioning exercise library safety resolver.

Return one real exercise definition that can replace the current exercise when the local library has no candidates.

Current exercise: ${ctx.exerciseName}
User request: ${ctx.userRequest}
Movement pattern to preserve: ${sourcePattern}
Approved movement patterns: ${allowedPatterns.join(", ")}
Equipment profile: ${ctx.equipmentLevel}
Allowed equipment: ${allowed.join(", ")}
Injury flags to avoid exactly: ${ctx.injuryFlags.join(", ") || "none"}
Session category: ${sourceMeta?.exercise?.category ?? "unknown"}
Session label: ${sourceMeta?.session?.label ?? "unknown"}
Program goal: ${ctx.system.overarchingGoal ?? "general training"}${exclusionNote}${researchNote}

Rules:
- Use library-first thinking: only invent this because deterministic candidates are empty.
- The exercise must be a real, well-known movement name.
- Do not return generic placeholders.
- Do not require equipment outside the allowed equipment list.
- Do not use a movement pattern outside the approved list.
- Return JSON only with this exact shape:
{
  "name": "string",
  "movementPattern": "string",
  "bodyRegion": "upper_body|lower_body|full_body|core",
  "role": "primary_strength|primary_power|unilateral_strength|accessory|conditioning|prep_activation|corrective",
  "unilateral": false,
  "primaryMuscle": "string",
  "secondaryMuscles": ["string"],
  "equipment": ["string"],
  "difficultyLevel": "beginner|intermediate|advanced|elite",
  "neuralDemand": "low|moderate|high",
  "timeCost": "low|moderate|high",
  "intentTags": ["strength|hypertrophy|power|endurance|rehab|athletic|fat_loss|mobility|activation"],
  "sportTransferTags": ["string"],
  "jointStressProfile": ["string"],
  "tags": ["string"],
  "coachingNotes": "short cue",
  "reason": "why this safely preserves the slot"
}`;

  try {
    const response = await fetch(`${baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: OPENAI_MODELS.SWAP_BACKSTOP,
        messages: [
          { role: "system", content: prompt },
          { role: "user", content: `Resolve a safe swap for "${ctx.exerciseName}".` },
        ],
        max_tokens: 700,
        temperature: 0.15,
        response_format: { type: "json_object" },
      }),
    });

    if (!response.ok) {
      logger.warn({ status: response.status, body: await response.text() }, "[SwapBackstop] OpenAI swap proposal failed");
      return null;
    }

    const data = (await response.json()) as { choices?: Array<{ message?: { content?: string } }> };
    const raw = data.choices?.[0]?.message?.content ?? "{}";
    const parsed = JSON.parse(raw);
    const validated = validateGeneratedExercise(parsed, ctx, sourcePattern);
    if (!validated.ok) {
      logger.warn({ reason: validated.reason, parsed }, "[SwapBackstop] AI proposal rejected by validator");
      return null;
    }
    return validated.definition ?? null;
  } catch (err) {
    logger.warn({ err }, "[SwapBackstop] AI swap proposal threw");
    return null;
  }
}

async function persistCandidate(ctx: SwapBackstopContext, def: GeneratedExerciseDefinition, route: "adjacent_library" | "ai_generated_staged", sourcePattern: string): Promise<void> {
  try {
    await db.insert(globalLearningEventsTable).values({
      userId: null,
      eventType: "exercise_substitution_accepted",
      routeUsed: route === "adjacent_library" ? "deterministic" : "openai",
      intentType: "swap_exercise",
      editSubtype: route,
      targetScope: "exercise",
      normalizedRequestKey: "safe_swap_backstop",
      mutationApplied: true,
      validatorPassed: true,
      metadata: {
        sourceExercise: ctx.exerciseName,
        replacementExercise: def.name,
        route,
        sourcePattern,
        generatedDefinition: def,
      },
    });

    const key = `safe_swap_candidate:${ctx.exerciseName.toLowerCase().replace(/\s+/g, "_")}:${def.name.toLowerCase().replace(/\s+/g, "_")}`;
    const summary = route === "ai_generated_staged"
      ? `AI generated staged swap candidate "${def.name}" for "${ctx.exerciseName}". Not added to the canonical exercise library.`
      : `Adjacent library swap candidate "${def.name}" for "${ctx.exerciseName}".`;
    const existing = await db
      .select({ id: learningCandidatesTable.id, evidenceCount: learningCandidatesTable.evidenceCount })
      .from(learningCandidatesTable)
      .where(and(eq(learningCandidatesTable.key, key), eq(learningCandidatesTable.promoted, false), eq(learningCandidatesTable.dismissed, false)))
      .limit(1);

    if (existing.length > 0) {
      await db
        .update(learningCandidatesTable)
        .set({
          evidenceCount: (existing[0].evidenceCount ?? 0) + 1,
          confidenceScore: route === "ai_generated_staged" ? 0.2 : 0.45,
          recommendation: "needs_more_data",
          updatedAt: new Date(),
          metadata: { sourceExercise: ctx.exerciseName, replacementExercise: def.name, route, sourcePattern, generatedDefinition: def },
        })
        .where(eq(learningCandidatesTable.id, existing[0].id));
    } else {
      await db.insert(learningCandidatesTable).values({
        type: "exercise_relationship_update",
        key,
        summary,
        evidenceCount: 1,
        confidenceScore: route === "ai_generated_staged" ? 0.2 : 0.45,
        riskLevel: route === "ai_generated_staged" ? "medium" : "low",
        recommendation: "needs_more_data",
        metadata: { sourceExercise: ctx.exerciseName, replacementExercise: def.name, route, sourcePattern, generatedDefinition: def },
      });
    }
  } catch (err) {
    logger.warn({ err }, "[SwapBackstop] Failed to persist staged candidate");
  }
}

function planFromDefinition(ctx: SwapBackstopContext, def: GeneratedExerciseDefinition, route: "adjacent_library" | "ai_generated_staged", sourcePattern: string): EditPlan {
  const routeLabel = route === "ai_generated_staged" ? "safe AI backstop" : "adjacent library fallback";
  return {
    intent: "swap_exercise",
    scope: "exercise",
    changeSummary: `${ctx.exerciseName} replaced with ${def.name} — selected by ${routeLabel} after direct swap candidates were unavailable. Loading will be preserved if same movement family, or recalculated for the new exercise's role.`,
    changes: [
      {
        type: "replace_exercise",
        id: ctx.exerciseId,
        replacement: {
          name: def.name,
          notes: def.coachingNotes || `Substituted for ${ctx.exerciseName}; ${sourcePattern.replace(/_/g, " ")} slot preserved.`,
          metadata: {
            swapBackstop: {
              route,
              sourceExercise: ctx.exerciseName,
              sourcePattern,
              candidateStatus: route === "ai_generated_staged" ? "staged_not_canonical" : "library_adjacent",
              generatedDefinition: def,
            },
          },
        },
        reason: `Swap backstop (${route}): ${def.reason}`,
      },
    ],
    _debugRoute: {
      openaiCalled: route === "ai_generated_staged",
      openaiSucceeded: route === "ai_generated_staged",
      pathUsed: route === "ai_generated_staged" ? "openai" : "deterministic",
    },
  };
}

function definitionFromLibrary(row: any): GeneratedExerciseDefinition {
  return {
    name: row.name,
    movementPattern: row.movementPattern,
    bodyRegion: row.bodyRegion ?? "full_body",
    role: row.role ?? "accessory",
    unilateral: Boolean(row.unilateral),
    primaryMuscle: row.primaryMuscle ?? "general",
    secondaryMuscles: row.secondaryMuscles ?? [],
    equipment: row.equipment ?? [],
    difficultyLevel: row.difficultyLevel ?? "intermediate",
    neuralDemand: row.neuralDemand ?? "moderate",
    timeCost: row.timeCost ?? "moderate",
    intentTags: row.intentTags ?? [],
    sportTransferTags: row.sportTransferTags ?? [],
    jointStressProfile: row.jointStressProfile ?? [],
    tags: row.tags ?? [],
    coachingNotes: `Substituted for the unavailable ${row.movementPattern.replace(/_/g, " ")} slot.`,
    reason: "Closest approved adjacent movement pattern candidate from the canonical library.",
  };
}

export async function resolveSafeSwapBackstop(ctx: SwapBackstopContext): Promise<EditPlan | null> {
  const sourceMeta = findProgramExercise(ctx.system, ctx.exerciseId);
  const librarySource = await findExerciseByName(ctx.exerciseName);
  const inferredPattern = inferMovementPattern(ctx.exerciseName, sourceMeta?.exercise?.category);
  const sourcePattern = librarySource?.movementPattern ?? inferredPattern;

  for (const pattern of APPROVED_ADJACENT_PATTERNS[sourcePattern] ?? []) {
    const candidates = await getByMovementPattern({
      pattern,
      equipmentLevel: ctx.equipmentLevel,
      injuryFlags: ctx.injuryFlags,
      excludeNames: [ctx.exerciseName],
      maxCount: 4,
    });
    const selected = candidates.find((candidate) => candidate.name.toLowerCase() !== ctx.exerciseName.toLowerCase());
    if (selected) {
      const def = definitionFromLibrary(selected);
      await persistCandidate(ctx, def, "adjacent_library", sourcePattern);
      logger.info(
        { sourceExercise: ctx.exerciseName, replacementExercise: def.name, sourcePattern, adjacentPattern: pattern },
        "[SwapBackstop] Resolved via approved adjacent library fallback"
      );
      return planFromDefinition(ctx, def, "adjacent_library", sourcePattern);
    }
  }

  const existingSource = await db
    .select({ id: exerciseLibrary.id })
    .from(exerciseLibrary)
    .where(sql`lower(${exerciseLibrary.name}) = lower(${ctx.exerciseName})`)
    .limit(1);

  const aiDefinition = await callOpenAIForSwap(ctx, sourcePattern, sourceMeta);
  if (!aiDefinition) return null;

  // Guard: reject AI suggestion if it names a user-excluded exercise
  if (ctx.excludeNames?.length) {
    const proposed = aiDefinition.name.toLowerCase();
    const excluded = ctx.excludeNames.find((ex) => proposed.includes(ex.toLowerCase()) || ex.toLowerCase().includes(proposed));
    if (excluded) {
      logger.warn(
        { sourceExercise: ctx.exerciseName, proposed: aiDefinition.name, excluded },
        "[SwapBackstop] AI proposed excluded exercise — rejected"
      );
      return null;
    }
  }

  if (existingSource.length === 0) {
    logger.info({ sourceExercise: ctx.exerciseName }, "[SwapBackstop] Source exercise absent from library — staged AI candidate only");
  }

  await persistCandidate(ctx, aiDefinition, "ai_generated_staged", sourcePattern);
  logger.info(
    { sourceExercise: ctx.exerciseName, replacementExercise: aiDefinition.name, sourcePattern },
    "[SwapBackstop] Resolved via safe AI staged candidate"
  );
  return planFromDefinition(ctx, aiDefinition, "ai_generated_staged", sourcePattern);
}