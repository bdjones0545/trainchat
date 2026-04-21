/**
 * Edit Engine — Phase 2 + Phase 3 + Phase 4
 *
 * Applies a structured EditPlan to the training system database.
 * Operations are targeted: only the specified IDs and fields are modified.
 *
 * Phase 3: Returns changedIds for frontend change highlighting.
 * Phase 4: Captures before/after snapshots for every change — used by
 *          change-log-service to enable full restore capability.
 *
 * Family Propagation: when an exercise-level change (replace or update) is
 * applied and trainingSystemId is provided, the same change is automatically
 * propagated to all other occurrences of the same exercise name in upcoming
 * and current weeks within the same training system. This keeps the program
 * consistent across weeks when a user adjusts an exercise.
 */

import { db } from "@workspace/db";
import {
  sessionExercises,
  trainingSessions,
  trainingWeeks,
  trainingPhases,
  trainingSystems,
  exerciseLibrary,
  globalLearningEventsTable,
  learningCandidatesTable,
} from "@workspace/db";
import { eq, and, inArray, ne, sql } from "drizzle-orm";
import { logger } from "./logger";
import type { EditPlan, EditChange } from "./edit-intent-service";
import type { SystemSnapshot } from "./change-log-service";
import { verifyMutation, type MutationVerificationResult } from "./mutation-verifier";
import {
  ensureSessionIdentityUpdated,
  buildIdentityUpdateSummary,
  type PatchedIdentityResult,
} from "./session-identity-sync";
import {
  buildPropagationPlan,
  commitPropagationPlan,
  getPropagationSummary,
  stampUserModification,
  type PropagationSummary,
} from "./propagation-engine";

// ─── Allowed field allowlists (safety guard) ─────────────────────────────────

const EXERCISE_ALLOWED_FIELDS = new Set([
  "name", "category", "sets", "reps", "tempo", "rest", "rpe", "notes", "orderIndex",
  // metadata is handled separately via extractPrescriptionUpdates
]);

const SESSION_ALLOWED_FIELDS = new Set([
  "label", "sessionType", "emphasis", "warmupNotes", "cooldownNotes",
  "coachingNotes", "isRestDay", "dayOfWeek",
]);

const WEEK_ALLOWED_FIELDS = new Set([
  "label", "focus", "volumeLevel", "notes", "status",
]);

const PHASE_ALLOWED_FIELDS = new Set([
  "name", "goal", "emphasis", "notes", "status",
]);

const DEMAND_LEVELS = new Set(["low", "moderate", "high"]);
const DIFFICULTY_LEVELS = new Set(["beginner", "intermediate", "advanced", "elite"]);
const APPROVED_ADD_ADJACENCIES: Record<string, string[]> = {
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

function filterFields(updates: Record<string, unknown>, allowed: Set<string>): Record<string, unknown> {
  const filtered: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(updates)) {
    if (allowed.has(key)) filtered[key] = value;
  }
  return filtered;
}

/**
 * Extracts `__prescription_*` special keys from an updates object.
 * These keys signal that the value should be merged into `metadata.prescription`
 * rather than a top-level column.
 *
 * Returns { prescriptionPatch, remainingUpdates }
 */
function extractPrescriptionUpdates(updates: Record<string, unknown>): {
  prescriptionPatch: Record<string, unknown> | null;
  remainingUpdates: Record<string, unknown>;
} {
  const patch: Record<string, unknown> = {};
  const remaining: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(updates)) {
    if (key.startsWith("__prescription_")) {
      const fieldName = key.slice("__prescription_".length);
      patch[fieldName] = value;
    } else {
      remaining[key] = value;
    }
  }

  return {
    prescriptionPatch: Object.keys(patch).length > 0 ? patch : null,
    remainingUpdates: remaining,
  };
}

function normalizeExerciseName(value: string | null | undefined): string {
  return String(value ?? "")
    .toLowerCase()
    .replace(/\brdl\b/g, "romanian deadlift")
    .replace(/\bdb\b/g, "dumbbell")
    .replace(/\bkb\b/g, "kettlebell")
    .replace(/\bbwd\b/g, "backward")
    .replace(/\breps?\b|\bsets?\b|\beach side\b|\bper side\b/g, "")
    .replace(/\b(barbell|dumbbell|kettlebell|cable|machine|banded|band|bodyweight|single arm|single-arm|single leg|single-leg|alternating|loaded|weighted|repeat)\b/g, "")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function exerciseNameKeys(name: string | null | undefined): Set<string> {
  const canonical = normalizeExerciseName(name);
  const raw = String(name ?? "").toLowerCase().replace(/[^a-z0-9\s]/g, " ").replace(/\s+/g, " ").trim();
  const compact = canonical.replace(/\s+/g, "");
  const keys = new Set([canonical, raw, compact].filter(Boolean));
  if (canonical.includes("romanian deadlift")) keys.add("rdl");
  if (canonical.includes("push up")) keys.add("pushup");
  if (canonical.includes("pull up")) keys.add("pullup");
  if (canonical.includes("30m sprint")) keys.add("sprint");
  return keys;
}

function namesConflict(a: string | null | undefined, b: string | null | undefined): boolean {
  const aKeys = exerciseNameKeys(a);
  const bKeys = exerciseNameKeys(b);
  for (const key of aKeys) {
    if (key.length >= 3 && bKeys.has(key)) return true;
  }
  const aNorm = normalizeExerciseName(a);
  const bNorm = normalizeExerciseName(b);
  if (!aNorm || !bNorm) return false;
  return aNorm.length >= 8 && bNorm.length >= 8 && (aNorm.includes(bNorm) || bNorm.includes(aNorm));
}

function inferMovementPattern(name: string, category?: string): string {
  const n = `${name} ${category ?? ""}`.toLowerCase();
  if (/squat|lunge|split squat|step.?up|leg press/.test(n)) return "knee_dominant";
  if (/deadlift|hinge|rdl|romanian|hip thrust|glute bridge|good morning|swing/.test(n)) return "hip_dominant";
  if (/bench|push.?up|chest press|dip/.test(n)) return "push_horizontal";
  if (/overhead|shoulder press|z.?press|landmine press/.test(n)) return "push_vertical";
  if (/row|face pull/.test(n)) return "pull_horizontal";
  if (/pull.?up|chin.?up|pulldown|lat/.test(n)) return "pull_vertical";
  if (/jump|bound|sprint|throw|plyo|power|med ball|acceleration|deceleration/.test(n)) return "power_explosive";
  if (/plank|dead bug|hollow|anti.?extension|ab wheel/.test(n)) return "core_anti_extension";
  if (/pallof|anti.?rotation|chop|lift/.test(n)) return "core_anti_rotation";
  if (/carry|suitcase|side plank|lateral/.test(n)) return "core_lateral";
  if (/mobility|stretch|cars|prep|flow|pails|rails|hip|ankle|shoulder|thoracic|breathing/.test(n)) return "mobility_prep";
  if (/activation|glute|wall drill|march|skip/.test(n)) return "activation";
  if (/conditioning|bike|run|rower|sled|tempo|interval/.test(n)) return "conditioning";
  return "accessory_lower";
}

function inferFocusMode(systemMeta: unknown, sessionType?: string | null, sessionLabel?: string | null): string {
  const metaFocus = typeof systemMeta === "object" && systemMeta ? (systemMeta as any).focusMode : null;
  if (typeof metaFocus === "string" && metaFocus.trim()) return metaFocus;
  const text = `${sessionType ?? ""} ${sessionLabel ?? ""}`.toLowerCase();
  if (/mobility|recovery|range|flow|tissue/.test(text)) return "mobility";
  if (/speed|sprint|acceleration|footwork|agility|plyo/.test(text)) return "speed";
  return "strength";
}

function roleToSessionCategory(role?: string | null, fallback?: string): string {
  const r = String(role ?? "").toLowerCase();
  if (r.includes("primary")) return "primary";
  if (r.includes("power")) return "power";
  if (r.includes("conditioning")) return "conditioning";
  if (r.includes("prep") || r.includes("activation")) return "activation";
  if (r.includes("corrective")) return "recovery";
  if (r.includes("accessory") || r.includes("unilateral")) return "accessory";
  return fallback ?? "accessory";
}

function defaultPrescriptionForCategory(category?: string | null): Pick<NonNullable<EditChange["exercise"]>, "sets" | "reps" | "rest" | "tempo"> {
  const c = String(category ?? "").toLowerCase();
  if (c === "power" || c === "explosive") return { sets: 4, reps: "3-5", rest: "2-3 min", tempo: "X10X" };
  if (c === "conditioning" || c === "finisher") return { sets: 6, reps: "20-30s", rest: "30-60s" };
  if (c === "activation" || c === "warmup" || c === "recovery") return { sets: 2, reps: "8-10", rest: "30-45s" };
  if (c === "trunk") return { sets: 3, reps: "8-12", rest: "60s" };
  return { sets: 3, reps: "8-12", rest: "90s" };
}

function isGenericGeneratedName(name: string): boolean {
  const n = name.trim().toLowerCase();
  if (n.length < 3 || n.length > 80) return true;
  if (/^(exercise|movement|drill|variation|option|alternative|something|anything|new exercise|new movement|new drill)$/.test(n)) return true;
  if (/[{}[\]"`]/.test(name)) return true;
  return false;
}

async function loadAddExerciseContext(sessionId: number) {
  const [ctx] = await db
    .select({
      sessionId: trainingSessions.id,
      sessionLabel: trainingSessions.label,
      sessionType: trainingSessions.sessionType,
      weekId: trainingWeeks.id,
      weekNumber: trainingWeeks.weekNumber,
      phaseId: trainingPhases.id,
      trainingSystemId: trainingSystems.id,
      systemMeta: trainingSystems.metadata,
      equipmentAccess: trainingSystems.equipmentAccess,
      constraints: trainingSystems.constraints,
      overarchingGoal: trainingSystems.overarchingGoal,
    })
    .from(trainingSessions)
    .innerJoin(trainingWeeks, eq(trainingSessions.trainingWeekId, trainingWeeks.id))
    .innerJoin(trainingPhases, eq(trainingWeeks.trainingPhaseId, trainingPhases.id))
    .innerJoin(trainingSystems, eq(trainingPhases.trainingSystemId, trainingSystems.id))
    .where(eq(trainingSessions.id, sessionId))
    .limit(1);

  if (!ctx) return null;

  const dayExercises = await db
    .select({ id: sessionExercises.id, name: sessionExercises.name })
    .from(sessionExercises)
    .where(eq(sessionExercises.trainingSessionId, sessionId));

  const weekExercises = await db
    .select({ id: sessionExercises.id, name: sessionExercises.name })
    .from(sessionExercises)
    .innerJoin(trainingSessions, eq(sessionExercises.trainingSessionId, trainingSessions.id))
    .where(eq(trainingSessions.trainingWeekId, ctx.weekId));

  const blockExercises = await db
    .select({ id: sessionExercises.id, name: sessionExercises.name })
    .from(sessionExercises)
    .innerJoin(trainingSessions, eq(sessionExercises.trainingSessionId, trainingSessions.id))
    .innerJoin(trainingWeeks, eq(trainingSessions.trainingWeekId, trainingWeeks.id))
    .where(eq(trainingWeeks.trainingPhaseId, ctx.phaseId));

  return { ...ctx, dayExercises, weekExercises, blockExercises };
}

function occurrenceCount(name: string, rows: Array<{ name: string }>): number {
  return rows.filter((row) => namesConflict(name, row.name)).length;
}

function detectSameDayDuplicate(name: string, rows: Array<{ name: string }>): string | null {
  const found = rows.find((row) => namesConflict(name, row.name));
  return found?.name ?? null;
}

async function persistGeneratedAddCandidate(params: {
  requestedName: string;
  candidate: any;
  focusMode: string;
  sourcePattern: string;
  sessionId: number;
}): Promise<void> {
  try {
    const key = `safe_add_candidate:${params.focusMode}:${normalizeExerciseName(params.requestedName).replace(/\s+/g, "_")}:${normalizeExerciseName(params.candidate.name).replace(/\s+/g, "_")}`;
    const summary = `AI generated staged add-exercise candidate "${params.candidate.name}" for "${params.requestedName}". Not added to the canonical exercise library.`;
    const metadata = {
      requestedExercise: params.requestedName,
      proposedExercise: params.candidate.name,
      focusMode: params.focusMode,
      sourcePattern: params.sourcePattern,
      sessionId: params.sessionId,
      generatedDefinition: params.candidate,
    };

    await db.insert(globalLearningEventsTable).values({
      userId: null,
      eventType: "exercise_addition_candidate_generated",
      routeUsed: "openai",
      intentType: "add_exercise",
      editSubtype: "duplicate_safe_ai_backstop",
      targetScope: "session",
      normalizedRequestKey: "safe_add_exercise_backstop",
      mutationApplied: true,
      validatorPassed: true,
      metadata,
    });

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
          confidenceScore: 0.2,
          recommendation: "needs_more_data",
          updatedAt: new Date(),
          metadata,
        })
        .where(eq(learningCandidatesTable.id, existing[0].id));
    } else {
      await db.insert(learningCandidatesTable).values({
        type: "exercise_relationship_update",
        key,
        summary,
        evidenceCount: 1,
        confidenceScore: 0.2,
        riskLevel: "medium",
        recommendation: "needs_more_data",
        metadata,
      });
    }
  } catch (err) {
    logger.warn({ err }, "[DuplicateExerciseBlockAudit] Failed to persist staged add candidate");
  }
}

function validateGeneratedAddExercise(def: any, ctx: Awaited<ReturnType<typeof loadAddExerciseContext>>, sourcePattern: string): { ok: boolean; reason?: string; exercise?: NonNullable<EditChange["exercise"]> } {
  if (!ctx || !def || typeof def !== "object") return { ok: false, reason: "not_object" };
  const name = String(def.name ?? "").trim();
  if (isGenericGeneratedName(name)) return { ok: false, reason: "generic_name" };
  if (detectSameDayDuplicate(name, ctx.dayExercises)) return { ok: false, reason: "same_day_duplicate" };
  const approved = new Set([sourcePattern, ...(APPROVED_ADD_ADJACENCIES[sourcePattern] ?? [])]);
  const movementPattern = String(def.movementPattern ?? sourcePattern).trim();
  if (!approved.has(movementPattern)) return { ok: false, reason: "unapproved_pattern" };
  const neuralDemand = String(def.neuralDemand ?? "moderate");
  const timeCost = String(def.timeCost ?? "moderate");
  const difficultyLevel = String(def.difficultyLevel ?? "intermediate");
  if (!DEMAND_LEVELS.has(neuralDemand) || !DEMAND_LEVELS.has(timeCost)) return { ok: false, reason: "bad_demand_schema" };
  if (!DIFFICULTY_LEVELS.has(difficultyLevel)) return { ok: false, reason: "bad_difficulty_schema" };
  const constraints = String(ctx.constraints ?? "").toLowerCase();
  const jointStressProfile = Array.isArray(def.jointStressProfile) ? def.jointStressProfile.map((x: unknown) => String(x).toLowerCase()) : [];
  if (constraints && jointStressProfile.some((flag: string) => flag && constraints.includes(flag))) return { ok: false, reason: "injury_flag_conflict" };
  const category = roleToSessionCategory(def.role, "accessory");
  const dose = defaultPrescriptionForCategory(category);
  return {
    ok: true,
    exercise: {
      name,
      category,
      sets: Number.isFinite(Number(def.sets)) ? Number(def.sets) : dose.sets,
      reps: String(def.reps ?? dose.reps),
      rest: String(def.rest ?? dose.rest),
      tempo: def.tempo ? String(def.tempo) : dose.tempo,
      notes: String(def.coachingNotes ?? def.reason ?? `Added as a non-duplicate ${category} option.`).slice(0, 500),
      metadata: {
        generatedCandidate: true,
        source: "duplicate_safe_add_ai_backstop",
        movementPattern,
        neuralDemand,
        timeCost,
        difficultyLevel,
        generatedDefinition: def,
      },
    },
  };
}

async function requestAiAddCandidate(params: {
  ctx: Awaited<ReturnType<typeof loadAddExerciseContext>>;
  requestedName: string;
  sourcePattern: string;
  focusMode: string;
  category?: string;
}): Promise<NonNullable<EditChange["exercise"]> | null> {
  const { ctx, requestedName, sourcePattern, focusMode, category } = params;
  if (!ctx) return null;
  const apiKey = process.env.OPENAI_API_KEY ?? process.env.AI_INTEGRATIONS_OPENAI_API_KEY;
  if (!apiKey) return null;
  const baseUrl = process.env.OPENAI_API_KEY ? "https://api.openai.com/v1" : (process.env.AI_INTEGRATIONS_OPENAI_BASE_URL ?? "https://api.openai.com/v1");
  const existingDay = ctx.dayExercises.map((ex) => ex.name).join(", ") || "none";
  const approvedPatterns = [sourcePattern, ...(APPROVED_ADD_ADJACENCIES[sourcePattern] ?? [])];
  const prompt = `Return JSON only. Propose up to 3 real exercise definitions to add to a training session without duplicating the current day.

Focus mode: ${focusMode}
Session: ${ctx.sessionLabel}
Session type: ${ctx.sessionType}
Week number: ${ctx.weekNumber}
Requested/blocked candidate: ${requestedName}
Preferred category: ${category ?? "accessory"}
Preferred movement pattern: ${sourcePattern}
Approved movement patterns: ${approvedPatterns.join(", ")}
Equipment access: ${ctx.equipmentAccess}
Constraints/injuries: ${ctx.constraints ?? "none"}
Program goal: ${ctx.overarchingGoal}
Existing same-day exercises that must not be duplicated or near-duplicated: ${existingDay}

Schema:
{
  "candidates": [
    {
      "name": "string",
      "movementPattern": "string",
      "bodyRegion": "upper_body|lower_body|full_body|core",
      "role": "primary_strength|primary_power|unilateral_strength|accessory|conditioning|prep_activation|corrective",
      "equipment": ["string"],
      "difficultyLevel": "beginner|intermediate|advanced|elite",
      "neuralDemand": "low|moderate|high",
      "timeCost": "low|moderate|high",
      "jointStressProfile": ["string"],
      "coachingNotes": "string",
      "reason": "string"
    }
  ]
}`;

  try {
    const response = await fetch(`${baseUrl}/chat/completions`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model: "gpt-4o",
        messages: [
          { role: "system", content: prompt },
          { role: "user", content: `Add one non-duplicate ${focusMode} exercise to ${ctx.sessionLabel}.` },
        ],
        max_tokens: 900,
        temperature: 0.15,
        response_format: { type: "json_object" },
      }),
    });
    if (!response.ok) {
      logger.warn({ status: response.status, body: await response.text() }, "[DuplicateExerciseBlockAudit] OpenAI add fallback failed");
      return null;
    }
    const data = (await response.json()) as { choices?: Array<{ message?: { content?: string } }> };
    const parsed = JSON.parse(data.choices?.[0]?.message?.content ?? "{}");
    const candidates = Array.isArray(parsed.candidates) ? parsed.candidates : [parsed];
    for (const candidate of candidates) {
      const validated = validateGeneratedAddExercise(candidate, ctx, sourcePattern);
      if (!validated.ok) {
        logger.warn({ reason: validated.reason, candidateName: candidate?.name }, "[DuplicateExerciseBlockAudit] AI add proposal rejected");
        continue;
      }
      await persistGeneratedAddCandidate({ requestedName, candidate, focusMode, sourcePattern, sessionId: ctx.sessionId });
      return validated.exercise ?? null;
    }
  } catch (err) {
    logger.warn({ err }, "[DuplicateExerciseBlockAudit] AI add fallback threw");
  }
  return null;
}

async function selectNonDuplicateLibraryExercise(params: {
  ctx: Awaited<ReturnType<typeof loadAddExerciseContext>>;
  requested: NonNullable<EditChange["exercise"]>;
  sourcePattern: string;
  focusMode: string;
}): Promise<NonNullable<EditChange["exercise"]> | null> {
  const { ctx, requested, sourcePattern, focusMode } = params;
  if (!ctx) return null;
  const approved = new Set([sourcePattern, ...(APPROVED_ADD_ADJACENCIES[sourcePattern] ?? [])]);
  const rows = await db
    .select()
    .from(exerciseLibrary)
    .where(eq(exerciseLibrary.isActive, true));

  const requestedCategory = requested.category ?? roleToSessionCategory(null, "accessory");
  let best: { row: typeof rows[number]; score: number; weekCount: number; blockCount: number } | null = null;
  for (const row of rows) {
    if (namesConflict(row.name, requested.name)) continue;
    if (detectSameDayDuplicate(row.name, ctx.dayExercises)) continue;
    const pattern = row.movementPattern;
    const samePattern = pattern === sourcePattern;
    const adjacentPattern = approved.has(pattern);
    const intentTags = Array.isArray(row.intentTags) ? row.intentTags : [];
    const roleCategory = roleToSessionCategory(row.role, requestedCategory);
    let score = 0;
    if (samePattern) score += 100;
    else if (adjacentPattern) score += 75;
    else score += 30;
    if (roleCategory === requestedCategory) score += 15;
    if (focusMode === "speed" && (intentTags.includes("power") || intentTags.includes("athletic") || pattern === "power_explosive" || pattern === "conditioning")) score += 20;
    if (focusMode === "mobility" && (intentTags.includes("mobility") || intentTags.includes("activation") || ["mobility_prep", "activation", "corrective"].includes(pattern))) score += 25;
    if (focusMode === "strength" && (intentTags.includes("strength") || intentTags.includes("hypertrophy"))) score += 15;
    const weekCount = occurrenceCount(row.name, ctx.weekExercises.filter((ex) => ex.id !== 0));
    const blockCount = occurrenceCount(row.name, ctx.blockExercises.filter((ex) => ex.id !== 0));
    if (weekCount > 0) score -= 50 * weekCount;
    if (blockCount > weekCount) score -= Math.min(30, 8 * (blockCount - weekCount));
    if (!adjacentPattern && pattern !== sourcePattern) score -= 20;
    if (!best || score > best.score) best = { row, score, weekCount, blockCount };
  }
  if (!best) return null;
  const category = roleToSessionCategory(best.row.role, requested.category ?? "accessory");
  const dose = defaultPrescriptionForCategory(category);
  return {
    name: best.row.name,
    category,
    sets: requested.sets ?? dose.sets,
    reps: requested.reps ?? dose.reps,
    rest: requested.rest ?? dose.rest,
    tempo: requested.tempo ?? dose.tempo,
    notes: requested.notes ?? best.row.description ?? `Added as a non-duplicate ${category} option.`,
    metadata: {
      duplicateSafeAdd: true,
      source: "library",
      movementPattern: best.row.movementPattern,
      weekReuseCountBeforeAdd: best.weekCount,
      blockReuseCountBeforeAdd: best.blockCount,
      score: best.score,
    },
  };
}

async function resolveDuplicateSafeAddExercise(change: EditChange): Promise<{ change: EditChange; audit: Record<string, unknown> | null; blocked: boolean }> {
  if (change.type !== "add_exercise" || !change.sessionId || !change.exercise?.name) {
    return { change, audit: null, blocked: false };
  }

  const ctx = await loadAddExerciseContext(change.sessionId);
  if (!ctx) return { change, audit: null, blocked: false };

  const focusMode = inferFocusMode(ctx.systemMeta, ctx.sessionType, ctx.sessionLabel);
  const selectorUsed = "edit_engine_duplicate_safe_selector";
  const requested = change.exercise;
  const existingLibrary = await db
    .select()
    .from(exerciseLibrary)
    .where(sql`lower(${exerciseLibrary.name}) = lower(${requested.name})`)
    .limit(1);
  const sourcePattern = existingLibrary[0]?.movementPattern ?? inferMovementPattern(requested.name, requested.category);
  const dayDuplicate = detectSameDayDuplicate(requested.name, ctx.dayExercises);
  const weekCount = occurrenceCount(requested.name, ctx.weekExercises.filter((ex) => !ctx.dayExercises.some((day) => day.id === ex.id)));
  const blockCount = occurrenceCount(requested.name, ctx.blockExercises);
  const sameWeekPenalty = weekCount > 0;
  const sameBlockPenalty = blockCount > weekCount + (dayDuplicate ? 1 : 0);
  const shouldReplace = !!dayDuplicate || sameWeekPenalty || sameBlockPenalty;

  logger.info(
    {
      surface: /button|chip|right panel|quick action/i.test(change.reason ?? "") ? "right_panel_button" : "edit_plan",
      focusMode,
      selectorUsed,
      duplicateCheckPresent: true,
      dayAware: true,
      weekAware: true,
      blockAware: true,
    },
    "[AddExerciseAudit]"
  );

  if (!shouldReplace) {
    return { change, audit: null, blocked: false };
  }

  let replacement = await selectNonDuplicateLibraryExercise({ ctx, requested, sourcePattern, focusMode });
  let aiFallbackUsed = false;
  if (!replacement) {
    aiFallbackUsed = true;
    replacement = await requestAiAddCandidate({ ctx, requestedName: requested.name, sourcePattern, focusMode, category: requested.category });
  }

  const blockReason = dayDuplicate ? "same_day_duplicate" : sameWeekPenalty ? "same_week_penalty" : "same_block_penalty";
  const audit = {
    focusMode,
    actionSource: change.reason ?? "add_exercise",
    requestedDay: ctx.sessionLabel ?? ctx.sessionId,
    blockedCandidateName: requested.name,
    blockReason,
    replacementFound: !!replacement,
    finalCandidate: replacement?.name ?? null,
    aiFallbackUsed,
  };
  logger.info(audit, "[DuplicateExerciseBlockAudit]");

  if (!replacement) {
    return {
      change: {
        ...change,
        exercise: undefined,
      },
      audit,
      blocked: true,
    };
  }

  return {
    change: {
      ...change,
      exercise: replacement,
      reason: `${change.reason ?? "Add exercise"} — duplicate-safe resolver selected ${replacement.name}`,
    },
    audit,
    blocked: !!dayDuplicate,
  };
}

// ─── Snapshot capture helpers ─────────────────────────────────────────────────

async function snapshotExercise(id: number): Promise<Record<string, unknown> | null> {
  const [row] = await db.select().from(sessionExercises).where(eq(sessionExercises.id, id)).limit(1);
  if (!row) return null;
  const meta = row.metadata as Record<string, unknown> | null;
  const prescription = meta?.prescription as Record<string, unknown> | undefined;
  return {
    name: row.name, category: row.category, sets: row.sets, reps: row.reps,
    tempo: row.tempo, rest: row.rest, rpe: row.rpe, notes: row.notes, orderIndex: row.orderIndex,
    // Include structured prescription fields for clean diffs
    ...(prescription ? { prescriptionLoad: prescription.load, prescriptionHeight: prescription.height, prescriptionDistance: prescription.distance } : {}),
  };
}

async function snapshotSession(id: number): Promise<Record<string, unknown> | null> {
  const [row] = await db.select().from(trainingSessions).where(eq(trainingSessions.id, id)).limit(1);
  if (!row) return null;
  return {
    label: row.label, sessionType: row.sessionType, emphasis: row.emphasis,
    warmupNotes: row.warmupNotes, coachingNotes: row.coachingNotes, isRestDay: row.isRestDay, dayOfWeek: row.dayOfWeek,
  };
}

async function snapshotWeek(id: number): Promise<Record<string, unknown> | null> {
  const [row] = await db.select().from(trainingWeeks).where(eq(trainingWeeks.id, id)).limit(1);
  if (!row) return null;
  return {
    label: row.label, focus: row.focus, volumeLevel: row.volumeLevel, notes: row.notes, status: row.status,
  };
}

async function snapshotPhase(id: number): Promise<Record<string, unknown> | null> {
  const [row] = await db.select().from(trainingPhases).where(eq(trainingPhases.id, id)).limit(1);
  if (!row) return null;
  return {
    name: row.name, goal: row.goal, emphasis: row.emphasis, notes: row.notes, status: row.status,
  };
}

// ─── Apply a single change ────────────────────────────────────────────────────

async function applyChange(change: EditChange): Promise<{ applied: boolean; detail: string; newId?: number }> {
  try {
    switch (change.type) {
      case "add_exercise": {
        if (!change.sessionId || !change.exercise?.name) {
          return { applied: false, detail: `add_exercise missing sessionId or exercise.name` };
        }

        const resolved = await resolveDuplicateSafeAddExercise(change);
        const effectiveChange = resolved.change;
        if (!effectiveChange.sessionId || !effectiveChange.exercise?.name) {
          const requested = change.exercise?.name ?? "unknown";
          return { applied: false, detail: `Blocked duplicate add_exercise "${requested}" in session ${change.sessionId}; no valid non-duplicate candidate found` };
        }

        // Determine the next orderIndex for this session
        const existing = await db
          .select({ orderIndex: sessionExercises.orderIndex })
          .from(sessionExercises)
          .where(eq(sessionExercises.trainingSessionId, effectiveChange.sessionId));
        const maxOrder = existing.reduce((max, r) => Math.max(max, r.orderIndex ?? 0), 0);

        const [inserted] = await db
          .insert(sessionExercises)
          .values({
            trainingSessionId: effectiveChange.sessionId,
            name: effectiveChange.exercise.name,
            category: (effectiveChange.exercise.category as any) ?? "accessory",
            sets: effectiveChange.exercise.sets ?? 3,
            reps: effectiveChange.exercise.reps ?? "8-10",
            rest: effectiveChange.exercise.rest ?? "90s",
            tempo: effectiveChange.exercise.tempo ?? null,
            notes: effectiveChange.exercise.notes ?? null,
            metadata: effectiveChange.exercise.metadata ?? null,
            orderIndex: maxOrder + 1,
            createdAt: new Date(),
            updatedAt: new Date(),
          })
          .returning({ id: sessionExercises.id });

        if (!inserted) {
          return { applied: false, detail: `Failed to insert exercise into session ${effectiveChange.sessionId}` };
        }

        return { applied: true, detail: `Added "${effectiveChange.exercise.name}" to session ${effectiveChange.sessionId} (new id:${inserted.id})`, newId: inserted.id };
      }

      case "update_exercise": {
        if (!change.updates || Object.keys(change.updates).length === 0) {
          return { applied: false, detail: `No updates for exercise ${change.id}` };
        }

        // Handle INCREMENT/DECREMENT sentinels for sets
        const updatesWithSentinel = { ...change.updates };
        if (updatesWithSentinel.sets === "INCREMENT" || updatesWithSentinel.sets === "DECREMENT") {
          const [existing] = await db.select().from(sessionExercises).where(eq(sessionExercises.id, change.id));
          if (existing) {
            const currentSets = existing.sets ?? 3;
            updatesWithSentinel.sets = updatesWithSentinel.sets === "INCREMENT"
              ? Math.min(currentSets + 1, 6)
              : Math.max(currentSets - 1, 1);
          }
        }

        // Extract __prescription_* keys for metadata merge
        const { prescriptionPatch, remainingUpdates } = extractPrescriptionUpdates(updatesWithSentinel);

        const safeUpdates = filterFields(remainingUpdates, EXERCISE_ALLOWED_FIELDS);

        // If there are prescription metadata updates, merge them into metadata.prescription
        if (prescriptionPatch) {
          const [existing] = await db.select().from(sessionExercises).where(eq(sessionExercises.id, change.id));
          if (existing) {
            const currentMeta = (existing.metadata as Record<string, unknown> | null) ?? {};
            const currentPrescription = (currentMeta.prescription as Record<string, unknown> | null) ?? {};
            const mergedMeta = {
              ...currentMeta,
              prescription: { ...currentPrescription, ...prescriptionPatch },
            };
            (safeUpdates as any).metadata = mergedMeta;
          }
        }

        if (Object.keys(safeUpdates).length === 0) {
          return { applied: false, detail: `No allowed fields in exercise update for ${change.id}` };
        }
        await db
          .update(sessionExercises)
          .set({ ...safeUpdates, updatedAt: new Date() } as any)
          .where(eq(sessionExercises.id, change.id));
        const appliedFields = [
          ...Object.keys(filterFields(remainingUpdates, EXERCISE_ALLOWED_FIELDS)),
          ...(prescriptionPatch ? Object.keys(prescriptionPatch).map((k) => `prescription.${k}`) : []),
        ];
        return { applied: true, detail: `Updated exercise ${change.id}: ${appliedFields.join(", ")}` };
      }

      case "replace_exercise": {
        if (!change.replacement) {
          return { applied: false, detail: `No replacement data for exercise ${change.id}` };
        }

        const [existing] = await db
          .select()
          .from(sessionExercises)
          .where(eq(sessionExercises.id, change.id));

        if (!existing) {
          return { applied: false, detail: `Exercise ${change.id} not found` };
        }

        const replacement = change.replacement;
        const replacementMetadata = replacement.metadata && typeof replacement.metadata === "object"
          ? { ...((existing.metadata as Record<string, unknown> | null) ?? {}), ...replacement.metadata }
          : existing.metadata;
        await db
          .update(sessionExercises)
          .set({
            name: replacement.name,
            category: (replacement.category as any) ?? existing.category,
            sets: replacement.sets ?? existing.sets,
            reps: replacement.reps ?? existing.reps,
            rest: replacement.rest ?? existing.rest,
            tempo: replacement.tempo ?? null,
            notes: replacement.notes ?? null,
            metadata: replacementMetadata,
            updatedAt: new Date(),
          })
          .where(eq(sessionExercises.id, change.id));

        return { applied: true, detail: `Replaced exercise ${change.id} with "${replacement.name}"` };
      }

      case "delete_exercise": {
        await db.delete(sessionExercises).where(eq(sessionExercises.id, change.id));
        return { applied: true, detail: `Deleted exercise ${change.id}` };
      }

      case "update_session": {
        if (!change.updates || Object.keys(change.updates).length === 0) {
          return { applied: false, detail: `No updates for session ${change.id}` };
        }
        const safeUpdates = filterFields(change.updates, SESSION_ALLOWED_FIELDS);
        if (Object.keys(safeUpdates).length === 0) {
          return { applied: false, detail: `No allowed fields in session update for ${change.id}` };
        }
        await db
          .update(trainingSessions)
          .set({ ...safeUpdates, updatedAt: new Date() } as any)
          .where(eq(trainingSessions.id, change.id));
        return { applied: true, detail: `Updated session ${change.id}: ${Object.keys(safeUpdates).join(", ")}` };
      }

      case "update_week": {
        if (!change.updates || Object.keys(change.updates).length === 0) {
          return { applied: false, detail: `No updates for week ${change.id}` };
        }
        const safeUpdates = filterFields(change.updates, WEEK_ALLOWED_FIELDS);
        if (Object.keys(safeUpdates).length === 0) {
          return { applied: false, detail: `No allowed fields in week update for ${change.id}` };
        }
        await db
          .update(trainingWeeks)
          .set({ ...safeUpdates, updatedAt: new Date() } as any)
          .where(eq(trainingWeeks.id, change.id));
        return { applied: true, detail: `Updated week ${change.id}: ${Object.keys(safeUpdates).join(", ")}` };
      }

      case "update_phase": {
        if (!change.updates || Object.keys(change.updates).length === 0) {
          return { applied: false, detail: `No updates for phase ${change.id}` };
        }
        const safeUpdates = filterFields(change.updates, PHASE_ALLOWED_FIELDS);
        if (Object.keys(safeUpdates).length === 0) {
          return { applied: false, detail: `No allowed fields in phase update for ${change.id}` };
        }
        await db
          .update(trainingPhases)
          .set({ ...safeUpdates, updatedAt: new Date() } as any)
          .where(eq(trainingPhases.id, change.id));
        return { applied: true, detail: `Updated phase ${change.id}: ${Object.keys(safeUpdates).join(", ")}` };
      }

      default:
        return { applied: false, detail: `Unknown change type: ${(change as any).type}` };
    }
  } catch (err) {
    logger.error({ err, change }, "Failed to apply change");
    return { applied: false, detail: `Error applying change: ${String(err)}` };
  }
}

// ─── Changed IDs Extraction ───────────────────────────────────────────────────

export interface ChangedIds {
  exercises: number[];
  sessions: number[];
  weeks: number[];
  phases: number[];
}

function extractChangedIds(plan: EditPlan, newExerciseIds: number[] = []): ChangedIds {
  const exercises: number[] = [...newExerciseIds];
  const sessions: number[] = [];
  const weeks: number[] = [];
  const phases: number[] = [];

  for (const change of plan.changes) {
    switch (change.type) {
      case "add_exercise":
        if (change.sessionId) sessions.push(change.sessionId);
        break;
      case "update_exercise":
      case "replace_exercise":
      case "delete_exercise":
        exercises.push(change.id);
        break;
      case "update_session":
        sessions.push(change.id);
        break;
      case "update_week":
        weeks.push(change.id);
        break;
      case "update_phase":
        phases.push(change.id);
        break;
    }
  }

  return { exercises, sessions, weeks, phases };
}

// ─── Snapshot capture for entire plan ────────────────────────────────────────

async function captureBeforeSnapshot(plan: EditPlan): Promise<SystemSnapshot> {
  const snapshot: SystemSnapshot = { exercises: {}, sessions: {}, weeks: {}, phases: {} };

  for (const change of plan.changes) {
    switch (change.type) {
      case "add_exercise":
        // Nothing exists before the insert — no before snapshot needed
        break;
      case "update_exercise":
      case "replace_exercise":
      case "delete_exercise": {
        const s = await snapshotExercise(change.id);
        if (s) snapshot.exercises[String(change.id)] = s;
        break;
      }
      case "update_session": {
        const s = await snapshotSession(change.id);
        if (s) snapshot.sessions[String(change.id)] = s;
        break;
      }
      case "update_week": {
        const s = await snapshotWeek(change.id);
        if (s) snapshot.weeks[String(change.id)] = s;
        break;
      }
      case "update_phase": {
        const s = await snapshotPhase(change.id);
        if (s) snapshot.phases[String(change.id)] = s;
        break;
      }
    }
  }

  return snapshot;
}

async function captureAfterSnapshot(changedIds: ChangedIds): Promise<SystemSnapshot> {
  const snapshot: SystemSnapshot = { exercises: {}, sessions: {}, weeks: {}, phases: {} };

  for (const id of changedIds.exercises) {
    const s = await snapshotExercise(id);
    if (s) snapshot.exercises[String(id)] = s;
  }
  for (const id of changedIds.sessions) {
    const s = await snapshotSession(id);
    if (s) snapshot.sessions[String(id)] = s;
  }
  for (const id of changedIds.weeks) {
    const s = await snapshotWeek(id);
    if (s) snapshot.weeks[String(id)] = s;
  }
  for (const id of changedIds.phases) {
    const s = await snapshotPhase(id);
    if (s) snapshot.phases[String(id)] = s;
  }

  return snapshot;
}

// ─── Family Propagation ────────────────────────────────────────────────────────
//
// When a user changes an exercise at the exercise level, that same exercise
// almost always appears in multiple weeks of the program. Without propagation,
// only the targeted instance changes — leaving the program inconsistent.
//
// This function finds all sibling exercise rows (same name, same training system,
// upcoming/current weeks, not the original row) and applies the same mutation.
// "Same session slot" is determined by matching the session label — this ensures
// we don't propagate a change on "Lower Power" exercises into an "Upper Strength"
// session that happens to contain the same exercise name.
//
// NOT every change warrants propagation. The gate below ensures only structural,
// program-wide changes (swaps, regressions, progressions, injury modifications)
// propagate. One-off tweaks (note edits, single set adjustments) stay local.

/**
 * Determines whether a specific change within a plan should propagate to sibling
 * exercise instances in future weeks.
 *
 * Gate rules:
 *  - replace_exercise → ALWAYS propagate (exercise itself changed)
 *  - update_exercise, notes-only → NEVER propagate (personal cue)
 *  - update_exercise, sets INCREMENT/DECREMENT → NEVER propagate (one-off volume)
 *  - update_exercise with intent matching progression/injury family → propagate
 *  - update_exercise with intent matching one-off tweaks → don't propagate
 *  - all other update_exercise → don't propagate (default safe)
 */
function shouldPropagateChange(planIntent: string, change: EditChange): boolean {
  if (change.type === "replace_exercise") {
    return true;
  }

  if (change.type !== "update_exercise") {
    return false;
  }

  const updates = change.updates ?? {};
  const updateKeys = Object.keys(updates).filter((k) => !k.startsWith("__prescription_"));

  // Notes-only → personal cue, stays local
  if (updateKeys.length === 1 && updateKeys[0] === "notes") {
    return false;
  }

  // Sets INCREMENT/DECREMENT → one-off volume adjustment, stays local
  if (
    updateKeys.length === 1 &&
    updateKeys[0] === "sets" &&
    (updates.sets === "INCREMENT" || updates.sets === "DECREMENT")
  ) {
    return false;
  }

  const propagatableIntents = new Set([
    "easier_variation",
    "harder_variation",
    "injury_modification",
    "joint_friendly_modification",
    "add_explosive_emphasis",
    "shoulder_modification",
    "swap_exercise",
    "exercise_swap",
  ]);

  const localOnlyIntents = new Set([
    "increase_sets",
    "reduce_sets",
    "exercise_note",
    "change_rep_range",
  ]);

  if (localOnlyIntents.has(planIntent)) return false;
  if (propagatableIntents.has(planIntent)) return true;

  return false;
}

interface PropagationResult {
  propagatedIds: number[];
  propagatedCount: number;
  skippedCount: number;
}

async function propagateExerciseChangeAcrossWeeks(
  originalExerciseId: number,
  exerciseName: string,
  trainingSystemId: number,
  applyFn: (siblingId: number) => Promise<{ applied: boolean; detail: string }>
): Promise<PropagationResult> {
  try {
    // 1. Resolve the source exercise's session and week
    const [sourceEx] = await db
      .select({
        sessionId: sessionExercises.trainingSessionId,
      })
      .from(sessionExercises)
      .where(eq(sessionExercises.id, originalExerciseId))
      .limit(1);

    if (!sourceEx) return { propagatedIds: [], propagatedCount: 0, skippedCount: 0 };

    // 2. Get source session label
    const [sourceSession] = await db
      .select({ label: trainingSessions.label, weekId: trainingSessions.trainingWeekId })
      .from(trainingSessions)
      .where(eq(trainingSessions.id, sourceEx.sessionId))
      .limit(1);

    if (!sourceSession) return { propagatedIds: [], propagatedCount: 0, skippedCount: 0 };

    // 3. Get source week's weekNumber to only propagate to future weeks
    const [sourceWeek] = await db
      .select({ weekNumber: trainingWeeks.weekNumber, phaseId: trainingWeeks.trainingPhaseId })
      .from(trainingWeeks)
      .where(eq(trainingWeeks.id, sourceSession.weekId))
      .limit(1);

    if (!sourceWeek) return { propagatedIds: [], propagatedCount: 0, skippedCount: 0 };

    // 4. Find all phases in this training system
    const phases = await db
      .select({ id: trainingPhases.id })
      .from(trainingPhases)
      .where(eq(trainingPhases.trainingSystemId, trainingSystemId));

    if (phases.length === 0) return { propagatedIds: [], propagatedCount: 0, skippedCount: 0 };

    const phaseIds = phases.map((p) => p.id);

    // 5. Find all upcoming/current weeks with a higher weekNumber (future weeks)
    const futureWeeks = await db
      .select({ id: trainingWeeks.id, weekNumber: trainingWeeks.weekNumber, status: trainingWeeks.status })
      .from(trainingWeeks)
      .where(
        and(
          inArray(trainingWeeks.trainingPhaseId, phaseIds),
          ne(trainingWeeks.id, sourceSession.weekId)
        )
      );

    // Only propagate to upcoming or current weeks (not completed)
    const eligibleWeekIds = futureWeeks
      .filter((w) => w.status !== "completed" && w.weekNumber > sourceWeek.weekNumber)
      .map((w) => w.id);

    if (eligibleWeekIds.length === 0) return { propagatedIds: [], propagatedCount: 0, skippedCount: 0 };

    // 6. Find all sessions in those weeks with the same label as the source session
    const targetSessions = await db
      .select({ id: trainingSessions.id, label: trainingSessions.label })
      .from(trainingSessions)
      .where(
        and(
          inArray(trainingSessions.trainingWeekId, eligibleWeekIds),
          eq(trainingSessions.label, sourceSession.label)
        )
      );

    if (targetSessions.length === 0) return { propagatedIds: [], propagatedCount: 0, skippedCount: 0 };

    const targetSessionIds = targetSessions.map((s) => s.id);

    // 7. Find all exercise rows with the same name in those sessions (excluding original)
    const siblingExercises = await db
      .select({ id: sessionExercises.id })
      .from(sessionExercises)
      .where(
        and(
          inArray(sessionExercises.trainingSessionId, targetSessionIds),
          eq(sessionExercises.name, exerciseName),
          ne(sessionExercises.id, originalExerciseId)
        )
      );

    if (siblingExercises.length === 0) return { propagatedIds: [], propagatedCount: 0, skippedCount: 0 };

    // 8. Apply the change to each sibling
    const propagatedIds: number[] = [];
    let propagatedCount = 0;
    let skippedCount = 0;

    for (const sibling of siblingExercises) {
      const result = await applyFn(sibling.id);
      if (result.applied) {
        propagatedIds.push(sibling.id);
        propagatedCount++;
      } else {
        skippedCount++;
      }
    }

    return { propagatedIds, propagatedCount, skippedCount };
  } catch (err) {
    logger.error({ err, originalExerciseId, exerciseName, trainingSystemId }, "[EditEngine] Family propagation threw — skipping propagation");
    return { propagatedIds: [], propagatedCount: 0, skippedCount: 0 };
  }
}

// ─── Main Entry Point ────────────────────────────────────────────────────────

export interface ChangeTarget {
  type: "exercise_swap" | "exercise_update" | "exercise_added";
  originalExercise?: string;
  newExercise: string;
  exerciseId: number;
  /** Human-readable description of what specifically changed, e.g. "tempo: → 3-1-X-0" */
  changeDetail?: string;
}

export interface EditResult {
  appliedCount: number;
  skippedCount: number;
  changeSummary: string;
  details: string[];
  changedIds: ChangedIds;
  beforeSnapshot: SystemSnapshot;
  afterSnapshot: SystemSnapshot;
  changeTargets: ChangeTarget[];
  /** Phase 2: Post-mutation verification result */
  verification: MutationVerificationResult;
  /** Sessions whose label/emphasis were auto-patched by the identity sync guard */
  identityPatches: PatchedIdentityResult[];
  /** Structured propagation summary — how many future weeks were updated and why */
  propagationSummary?: PropagationSummary;
}

export async function applyEditPlan(plan: EditPlan, intentFamily?: string, trainingSystemId?: number): Promise<EditResult> {
  // Phase 4: Capture state BEFORE applying changes
  const beforeSnapshot = await captureBeforeSnapshot(plan);

  const results: { applied: boolean; detail: string; newId?: number }[] = [];
  for (const change of plan.changes) {
    const result = await applyChange(change);
    results.push(result);
    logger.info({ applied: result.applied, detail: result.detail, changeType: change.type, id: change.id }, "Edit change processed");
  }

  const appliedCount = results.filter((r) => r.applied).length;
  const skippedCount = results.filter((r) => !r.applied).length;

  // Collect IDs for exercises inserted via add_exercise so they appear in changedIds
  const newExerciseIds = results.flatMap((r) => (r.newId ? [r.newId] : []));
  const changedIds = extractChangedIds(plan, newExerciseIds);

  // ── Family Propagation ────────────────────────────────────────────────────
  // For exercise-level replace or update changes, propagate to all sibling
  // occurrences of the same exercise name in upcoming/current weeks of the same
  // training system. Uses the propagation engine for smart, safety-gated, delta-
  // preserving propagation rather than blind copy-forward.
  let totalPropagated = 0;
  let aggregatePropagationSummary: PropagationSummary | undefined;

  if (trainingSystemId) {
    for (let i = 0; i < plan.changes.length; i++) {
      const change = plan.changes[i];
      const thisResult = results[i];
      if (!thisResult.applied) continue;
      if (change.type !== "replace_exercise" && change.type !== "update_exercise") continue;

      // Stamp user modification provenance on the directly edited exercise.
      // This prevents future propagation from treating this as an unmodified sibling.
      stampUserModification(change.id).catch(() => {});

      // Derive before/after state for this exercise
      const exerciseBefore = (beforeSnapshot.exercises[String(change.id)] ?? {}) as Record<string, any>;
      let exerciseAfter: Record<string, any>;
      let exerciseName: string;
      let fieldsChanged: string[];

      if (change.type === "replace_exercise" && change.replacement) {
        exerciseAfter = { ...exerciseBefore, ...change.replacement };
        exerciseName = (exerciseBefore.name as string) ?? "";
        fieldsChanged = ["name"];
      } else if (change.type === "update_exercise" && change.updates) {
        exerciseAfter = { ...exerciseBefore, ...change.updates };
        exerciseName = (exerciseBefore.name as string) ?? "";
        fieldsChanged = Object.keys(change.updates).filter((k) => !k.startsWith("__prescription_"));
      } else {
        continue;
      }

      if (!exerciseName) continue;

      // Get source session label + week number via a single join query
      const [sourceCtx] = await db
        .select({
          sessionLabel: trainingSessions.label,
          weekNumber: trainingWeeks.weekNumber,
        })
        .from(sessionExercises)
        .innerJoin(trainingSessions, eq(sessionExercises.trainingSessionId, trainingSessions.id))
        .innerJoin(trainingWeeks, eq(trainingSessions.trainingWeekId, trainingWeeks.id))
        .where(eq(sessionExercises.id, change.id))
        .limit(1);

      if (!sourceCtx) continue;

      // Build the propagation plan (dry run — no mutations yet)
      const propPlan = await buildPropagationPlan({
        sourceExerciseId: change.id,
        sourceWeekNumber: sourceCtx.weekNumber,
        sourceSessionLabel: sourceCtx.sessionLabel,
        exerciseName,
        trainingSystemId,
        exerciseBefore,
        exerciseAfter,
        planIntent: plan.intent,
        fieldsChanged,
      });

      if (propPlan.mode === "none") {
        logger.info({ intent: plan.intent, exerciseName }, "[EditEngine] Propagation mode=none — local only");
        continue;
      }

      if (propPlan.mode === "prompt_user") {
        logger.info({ exerciseName }, "[EditEngine] Propagation requires user confirmation — skipping auto-apply");
        aggregatePropagationSummary = getPropagationSummary(propPlan, {
          planId: propPlan.planId, appliedIds: [], appliedCount: 0, skippedCount: 0, auditEntryCount: 0,
        });
        continue;
      }

      if (propPlan.summary.applyCount === 0) {
        const summary = getPropagationSummary(propPlan, {
          planId: propPlan.planId, appliedIds: [], appliedCount: 0, skippedCount: propPlan.targets.length, auditEntryCount: 0,
        });
        logger.info({ planId: propPlan.planId, exerciseName, skipCount: propPlan.summary.skipCount }, "[EditEngine] Propagation plan: nothing safe to apply");
        if (!aggregatePropagationSummary) aggregatePropagationSummary = summary;
        continue;
      }

      // Commit the plan — applies changes, stamps metadata, writes audit log
      const commit = await commitPropagationPlan(propPlan, trainingSystemId, undefined, "user");

      changedIds.exercises.push(...commit.appliedIds);
      totalPropagated += commit.appliedCount;

      const summary = getPropagationSummary(propPlan, commit);
      logger.info(
        { planId: propPlan.planId, mode: propPlan.mode, appliedCount: commit.appliedCount, skippedCount: commit.skippedCount, exerciseName },
        "[EditEngine] Propagation committed"
      );

      if (!aggregatePropagationSummary || summary.status !== "local_only") {
        aggregatePropagationSummary = summary;
      }
    }
  }

  // ── Session Identity Sync (post-mutation guard) ────────────────────────────
  // If the AI's EditPlan made structural changes for an identity-changing
  // transformation but did NOT include an update_session with new label/emphasis,
  // deterministically patch the session identity now using the template matrix.
  const identityPatches = await ensureSessionIdentityUpdated(plan, intentFamily);
  if (identityPatches.length > 0) {
    // Add auto-patched sessions to changedIds so they appear in the after snapshot
    for (const patch of identityPatches) {
      if (!changedIds.sessions.includes(patch.sessionId)) {
        changedIds.sessions.push(patch.sessionId);
      }
    }
    logger.info(
      {
        count: identityPatches.length,
        patches: identityPatches.map((p) => ({
          sessionId: p.sessionId,
          region: p.inferredRegion,
          family: p.intentFamily,
          newLabel: p.newLabel,
        })),
      },
      "[EditEngine] Session identity auto-synced after mutation",
    );
  }

  // Phase 4: Capture state AFTER applying changes
  const afterSnapshot = await captureAfterSnapshot(changedIds);

  // Phase 2: Verify that the intended changes are actually present in the post-mutation state
  const verification = verifyMutation(plan, beforeSnapshot, afterSnapshot, results);
  logger.info(
    { status: verification.status, verified: verification.verifiedChanges.length, missing: verification.missingChanges.length, requiresReview: verification.requiresReview ?? false, intent: plan.intent },
    "[MutationVerifier] Verification complete"
  );

  // Build change targets for frontend highlighting
  const changeTargets: ChangeTarget[] = [];
  for (const change of plan.changes) {
    if (change.type === "replace_exercise") {
      const before = beforeSnapshot.exercises[String(change.id)];
      const after = afterSnapshot.exercises[String(change.id)];
      if (before?.name && after?.name) {
        changeTargets.push({
          type: "exercise_swap",
          originalExercise: before.name as string,
          newExercise: after.name as string,
          exerciseId: change.id,
        });
      }
    } else if (change.type === "update_exercise") {
      const before = beforeSnapshot.exercises[String(change.id)];
      const after = afterSnapshot.exercises[String(change.id)];
      if (after?.name) {
        // Build a specific change detail string from before/after diff
        const changeDetails: string[] = [];
        if (after.tempo && after.tempo !== before?.tempo) {
          changeDetails.push(`tempo → ${after.tempo}`);
        }
        if (after.reps && after.reps !== before?.reps) {
          changeDetails.push(`reps: ${before?.reps ?? "?"} → ${after.reps}`);
        }
        if (after.sets !== undefined && after.sets !== before?.sets) {
          changeDetails.push(`sets: ${before?.sets ?? "?"} → ${after.sets}`);
        }
        if (after.rest && after.rest !== before?.rest) {
          changeDetails.push(`rest: ${before?.rest ?? "?"} → ${after.rest}`);
        }
        changeTargets.push({
          type: "exercise_update",
          originalExercise: before?.name as string | undefined,
          newExercise: after.name as string,
          exerciseId: change.id,
          changeDetail: changeDetails.length > 0 ? changeDetails.join(", ") : undefined,
        });
      }
    }
  }
  // Include newly added exercises
  for (const result of results) {
    if (result.applied && result.newId) {
      const after = afterSnapshot.exercises[String(result.newId)];
      if (after?.name) {
        changeTargets.push({
          type: "exercise_added",
          newExercise: after.name as string,
          exerciseId: result.newId,
        });
      }
    }
  }

  // ── Augment changeSummary with identity update notes and propagation note ─
  const identitySuffix = buildIdentityUpdateSummary(identityPatches);
  let propagationSuffix = "";
  if (aggregatePropagationSummary && aggregatePropagationSummary.status !== "local_only") {
    propagationSuffix = ` ${aggregatePropagationSummary.message}`;
  } else if (totalPropagated > 0) {
    propagationSuffix = ` Applied to ${totalPropagated} additional week${totalPropagated !== 1 ? "s" : ""} across the program.`;
  }
  const finalChangeSummary = (plan.changeSummary + identitySuffix + propagationSuffix).trim();

  return {
    appliedCount,
    skippedCount,
    changeSummary: finalChangeSummary,
    details: results.map((r) => r.detail),
    changedIds,
    beforeSnapshot,
    afterSnapshot,
    changeTargets,
    verification,
    identityPatches,
    propagationSummary: aggregatePropagationSummary,
  };
}
