/**
 * Harder / Easier Fallback Resolver
 *
 * Called when a user taps Harder or Easier on an exercise and the local
 * exercise-library graph has no progressions / regressions for that exercise.
 *
 * Resolution order:
 *   1. Deterministic graph (handled by caller — skipped here)
 *   2. This file: structured OpenAI fallback with rich context
 *   3. Validate result
 *   4. Convert to EditPlan
 *   5. Log relationship candidate for future graph promotion
 */

import { db, globalLearningEventsTable, learningCandidatesTable } from "@workspace/db";
import { eq, and } from "drizzle-orm";
import { logger } from "./logger";
import type { EditPlan } from "./edit-intent-service";

// ─── Generic Placeholder Guard ────────────────────────────────────────────────
// Duplicated here to avoid circular dependency with edit-intent-service.
// Detects exercise names that are descriptive phrases rather than real exercise names.

const GENERIC_PLACEHOLDER_PATTERNS = [
  /^(a\s+|an\s+)?(harder|easier|more difficult|less difficult|simpler|advanced|beginner|intermediate)\s+(variation|option|exercise|version|alternative|progression|regression|movement|squat variation|deadlift variation|press variation|row variation)$/i,
  /^(harder|easier)\s+(variation|option|exercise|version|alternative|progression|regression|movement)$/i,
  /^a\s+(progression|regression|substitution|alternative|modification)$/i,
  /^(more (challenging|difficult)|less (challenging|difficult))\s*(variation|option|exercise|version|alternative)?$/i,
  /^(harder|easier|simpler|advanced|beginner)\s+(squat|deadlift|bench|press|row|pull|push|hinge|lunge|carry|swing)\s+(variation|alternative|option|version)?$/i,
];

function isGenericPlaceholder(name: string): boolean {
  if (!name || name.trim().length === 0) return true;
  return GENERIC_PLACEHOLDER_PATTERNS.some((p) => p.test(name.trim()));
}

// ─── Resolution Types ─────────────────────────────────────────────────────────

export interface HarderEasierContext {
  exerciseName: string;
  exerciseId: number;
  direction: "harder" | "easier";
  movementPattern?: string;
  category?: string;
  sessionLabel?: string;
  programGoal?: string;
  sport?: string;
  equipmentLevel?: string;
  injuryFlags?: string[];
  notes?: string;
  userId?: number;
  focusMode?: string;
}

export interface HarderEasierResolution {
  changeType: "replace_exercise" | "modify_prescription";
  replacementExerciseName?: string;
  prescriptionAdjustments?: {
    sets?: number;
    reps?: string;
    rest?: string;
    tempo?: string;
    notes?: string;
  };
  reason: string;
}

// ─── Generic Placeholder Guard (re-exported alias) ────────────────────────────
// Imported from edit-intent-service — prevents accepting "a harder variation" etc.

// ─── Validation ───────────────────────────────────────────────────────────────

function isValidResolution(r: HarderEasierResolution): boolean {
  if (!r || typeof r.changeType !== "string") return false;
  if (r.changeType === "replace_exercise") {
    if (!r.replacementExerciseName || typeof r.replacementExerciseName !== "string") return false;
    if (r.replacementExerciseName.trim().length < 3) return false;
    if (isGenericPlaceholder(r.replacementExerciseName)) return false;
  }
  return true;
}

// ─── OpenAI Call ─────────────────────────────────────────────────────────────

async function callOpenAIForHarderEasier(ctx: HarderEasierContext): Promise<HarderEasierResolution | null> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    logger.warn("[HarderEasierFallback] No OPENAI_API_KEY — cannot call structured fallback");
    return null;
  }

  const systemPrompt = buildFallbackSystemPrompt(ctx);

  try {
    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: "gpt-4o",
        messages: [
          { role: "system", content: systemPrompt },
          {
            role: "user",
            content: `Make "${ctx.exerciseName}" ${ctx.direction}. Return a structured resolution.`,
          },
        ],
        max_tokens: 600,
        temperature: 0.2,
        response_format: { type: "json_object" },
      }),
    });

    if (!response.ok) {
      const errText = await response.text();
      logger.error({ status: response.status, errText }, "[HarderEasierFallback] OpenAI request failed");
      return null;
    }

    const data = (await response.json()) as { choices: { message: { content: string } }[] };
    const raw = data.choices[0]?.message?.content ?? "{}";
    const parsed = JSON.parse(raw) as HarderEasierResolution;

    return parsed;
  } catch (err) {
    logger.error({ err }, "[HarderEasierFallback] Failed to call OpenAI structured fallback");
    return null;
  }
}

// ─── Prompt Builder ───────────────────────────────────────────────────────────

function buildFallbackSystemPrompt(ctx: HarderEasierContext): string {
  const injuryNote = ctx.injuryFlags?.length
    ? `INJURY / SPECIAL CONSIDERATIONS: ${ctx.injuryFlags.join(", ")} — avoid exercises that load these joints directly.`
    : "";

  const sportNote = ctx.sport ? `SPORT CONTEXT: ${ctx.sport}` : "";
  const goalNote = ctx.programGoal ? `PROGRAM GOAL: ${ctx.programGoal}` : "";
  const equipNote = ctx.equipmentLevel ? `EQUIPMENT ACCESS: ${ctx.equipmentLevel}` : "EQUIPMENT ACCESS: full_gym";
  const sessionNote = ctx.sessionLabel ? `SESSION: ${ctx.sessionLabel}` : "";
  const patternNote = ctx.movementPattern ? `MOVEMENT PATTERN: ${ctx.movementPattern}` : "";
  const categoryNote = ctx.category ? `EXERCISE CATEGORY: ${ctx.category}` : "";

  return `You are a NSCA-certified strength and conditioning coach resolving an exercise progression/regression request.

CONTEXT:
  Current exercise: "${ctx.exerciseName}"
  Direction: ${ctx.direction.toUpperCase()}
  ${patternNote}
  ${categoryNote}
  ${sessionNote}
  ${goalNote}
  ${sportNote}
  ${equipNote}
  ${injuryNote}

YOUR TASK:
Resolve the ${ctx.direction} request for "${ctx.exerciseName}" by choosing EXACTLY ONE of:

OPTION A — Replace with a real named exercise:
  Use this when a genuine progression/regression exercise exists that fits the context.
  Requirements:
  - Must be a REAL, well-known exercise name (e.g. "Band-Assisted Pull-Up", "Weighted Pull-Up")
  - NEVER use generic descriptors like "a harder variation", "a progression", "easier exercise"
  - Must respect the equipment access and any injury constraints
  - Must be in the same general movement pattern (e.g. vertical pull → vertical pull)

OPTION B — Modify the prescription on the same exercise:
  Use this when no genuine replacement exists or when prescription changes are more appropriate.
  Examples: add tempo (e.g. "3-1-X-0"), adjust reps/rest, add pause

RULES:
- For ${ctx.direction === "harder" ? "harder" : "easier"} requests:
  ${ctx.direction === "harder"
    ? "- Harder progression: increase skill demand, leverage, or load. Pauses, tempo, weighted variations, single-leg/single-arm."
    : "- Easier regression: reduce skill demand, leverage, or load. Assisted, machine, bilateral, higher-rep easier variation."}
- If replacing: the replacement must be a different named exercise, not the same one
- If modifying: provide at least one concrete change (not just a note)

RETURN a single JSON object matching this exact schema:
{
  "changeType": "replace_exercise" | "modify_prescription",
  "replacementExerciseName": "string — ONLY when changeType is replace_exercise",
  "prescriptionAdjustments": {
    "sets": number (optional),
    "reps": "string" (optional),
    "rest": "string" (optional),
    "tempo": "string — use X notation e.g. 3-1-X-0" (optional),
    "notes": "string — coaching cue for the change" (optional)
  },
  "reason": "1-2 sentence explanation — name the specific change and why"
}

KNOWN ${ctx.direction.toUpperCase()} EXAMPLES (reference only, not exhaustive):
Pull-Up → harder: Weighted Pull-Up, L-Sit Pull-Up, Archer Pull-Up
Pull-Up → easier: Band-Assisted Pull-Up, Ring Row, Lat Pulldown
Back Squat → harder: Pause Back Squat, Tempo Back Squat, Front Squat
Back Squat → easier: Box Squat, Goblet Squat, Split Squat
Deadlift → harder: Pause Deadlift, Deficit Deadlift
Deadlift → easier: Romanian Deadlift, Trap Bar Deadlift
Bench Press → harder: Pause Bench Press, Tempo Bench Press
Bench Press → easier: Dumbbell Bench Press, Machine Chest Press
Split Squat → harder: Rear Foot Elevated Split Squat, Barbell Split Squat
Split Squat → easier: Goblet Squat, Step-Up
Hip Thrust → harder: Single-Leg Hip Thrust, Pause Hip Thrust
Hip Thrust → easier: Glute Bridge, Banded Glute Bridge
Overhead Press → harder: Push Press, Z-Press
Overhead Press → easier: Dumbbell Overhead Press, Landmine Press

Return ONLY the JSON object — no other text.`;
}

// ─── Relationship Logger ──────────────────────────────────────────────────────

interface RelationshipCandidateParams {
  fromExercise: string;
  toExercise: string;
  direction: "harder" | "easier";
  sourceExerciseId: number;
  targetExerciseId?: number | null;
  userId?: number;
  focusMode?: string;
  rationale?: string;
}

async function logExerciseRelationship(params: RelationshipCandidateParams): Promise<void> {
  const {
    fromExercise,
    toExercise,
    direction,
    sourceExerciseId,
    targetExerciseId = null,
    userId,
    focusMode,
    rationale,
  } = params;

  const metadata = {
    relationshipType: direction,
    fromExercise,
    toExercise,
    sourceExerciseId,
    targetExerciseId,
    focusMode: focusMode ?? null,
    sourceSurface: "harder_easier_fallback",
    confidence: 0.3,
    rationale: rationale ?? null,
    approved: false,
    promoted: false,
    aiResolved: true,
    stagedOnly: true,
    canonicalWriteBlocked: true,
    promotionRule: "Manual/admin review or deterministic internal promotion tooling must approve this candidate before canonical graph mutation.",
    resolvedBy: "harder_easier_fallback",
  };

  try {
    await db.insert(globalLearningEventsTable).values({
      userId: userId ?? null,
      eventType: "exercise_substitution_accepted",
      routeUsed: "openai",
      intentType: direction === "harder" ? "harder_variation" : "easier_variation",
      editSubtype: "ai_fallback_resolver",
      targetScope: "exercise",
      normalizedRequestKey: `${direction}_variation_fallback`,
      mutationApplied: true,
      validatorPassed: true,
      metadata,
    });

    const key = `exercise_relationship:${fromExercise.toLowerCase().replace(/\s+/g, "_")}:${direction}`;
    const summary = `AI fallback resolved "${fromExercise}" → "${toExercise}" (${direction}). Candidate for adding to exercise graph as ${direction === "harder" ? "harderVariation" : "easierVariation"}.`;

    const existing = await db
      .select({ id: learningCandidatesTable.id, evidenceCount: learningCandidatesTable.evidenceCount })
      .from(learningCandidatesTable)
      .where(
        and(
          eq(learningCandidatesTable.key, key),
          eq(learningCandidatesTable.promoted, false),
          eq(learningCandidatesTable.dismissed, false)
        )
      )
      .limit(1);

    if (existing.length > 0) {
      const newCount = (existing[0].evidenceCount ?? 0) + 1;
      const confidence = Math.min(0.9, 0.3 + newCount * 0.1);
      await db
        .update(learningCandidatesTable)
        .set({
          evidenceCount: newCount,
          confidenceScore: confidence,
          recommendation: newCount >= 3 ? "safe_to_promote" : "needs_more_data",
          updatedAt: new Date(),
          metadata: { ...metadata, confidence },
        })
        .where(eq(learningCandidatesTable.id, existing[0].id));
    } else {
      await db.insert(learningCandidatesTable).values({
        type: "exercise_relationship_update",
        key,
        summary,
        evidenceCount: 1,
        confidenceScore: 0.3,
        riskLevel: "low",
        recommendation: "needs_more_data",
        metadata,
      });
    }

    logger.info({ fromExercise, toExercise, direction }, "[HarderEasierFallback] Exercise relationship logged");
    logger.info(
      {
        sourceExerciseId,
        targetExerciseId,
        relationshipType: direction,
        aiResolved: true,
        stagedOnly: true,
        canonicalWriteBlocked: true,
        promoted: false,
      },
      "[RelationshipFallbackAudit]"
    );
  } catch (err) {
    logger.warn({ err }, "[HarderEasierFallback] Failed to log exercise relationship — suppressed");
    logger.warn(
      {
        sourceExerciseId,
        targetExerciseId,
        relationshipType: direction,
        aiResolved: true,
        stagedOnly: false,
        canonicalWriteBlocked: true,
        promoted: false,
      },
      "[RelationshipFallbackAudit]"
    );
  }
}

// ─── Resolution → EditPlan Converter ─────────────────────────────────────────

function resolutionToEditPlan(
  resolution: HarderEasierResolution,
  exerciseId: number,
  exerciseName: string,
  direction: "harder" | "easier"
): EditPlan {
  if (resolution.changeType === "replace_exercise" && resolution.replacementExerciseName) {
    const toName = resolution.replacementExerciseName;
    return {
      intent: direction === "harder" ? "harder_variation" : "easier_variation",
      scope: "exercise",
      changeSummary: resolution.reason
        ? `${exerciseName} → ${toName}. ${resolution.reason}`
        : direction === "harder"
          ? `Changed ${exerciseName} to ${toName} — a more demanding variation in the same pattern. Sets and reps carried over.`
          : `Changed ${exerciseName} to ${toName} — a less demanding variation to build quality movement. Sets and reps carried over.`,
      changes: [
        {
          type: "replace_exercise",
          id: exerciseId,
          replacement: {
            name: toName,
            notes: direction === "harder"
              ? `Progression from ${exerciseName}. Maintain the same sets/reps — the movement demand is higher. Control the eccentric.`
              : `Regression from ${exerciseName}. Build movement quality and confidence here before returning to the original.`,
            ...resolution.prescriptionAdjustments,
          },
          reason: `AI fallback resolver: ${direction} variation — ${toName}`,
        },
      ],
    };
  }

  // modify_prescription fallback
  const adj = resolution.prescriptionAdjustments ?? {};
  const hasChanges = Object.keys(adj).length > 0;

  if (!hasChanges) {
    // Last resort: apply a default prescription change
    const defaultUpdate = direction === "harder"
      ? { tempo: "3-1-X-0", notes: `Harder: 3-sec eccentric, 1-sec pause, explosive concentric. Keep the same load — tempo makes it harder.` }
      : { reps: "8-10", notes: `Easier: higher rep range, controlled pace, focus on quality movement.` };

    return {
      intent: direction === "harder" ? "harder_variation" : "easier_variation",
      scope: "exercise",
      changeSummary: direction === "harder"
        ? `${exerciseName} made harder with a 3-1-X-0 tempo. ${resolution.reason}`
        : `${exerciseName} adjusted to a higher rep quality zone. ${resolution.reason}`,
      changes: [
        {
          type: "update_exercise",
          id: exerciseId,
          updates: defaultUpdate,
          reason: `AI fallback resolver: ${direction} prescription modification`,
        },
      ],
    };
  }

  const summaryParts: string[] = [];
  if (adj.tempo) summaryParts.push(`tempo ${adj.tempo}`);
  if (adj.reps) summaryParts.push(`${adj.reps} reps`);
  if (adj.rest) summaryParts.push(`${adj.rest} rest`);
  if (adj.sets) summaryParts.push(`${adj.sets} sets`);

  const changeSummary = resolution.reason
    || (summaryParts.length > 0
      ? `${exerciseName} adjusted — ${summaryParts.join(", ")}.`
      : `${exerciseName} ${direction === "harder" ? "made harder" : "made easier"}.`);

  return {
    intent: direction === "harder" ? "harder_variation" : "easier_variation",
    scope: "exercise",
    changeSummary,
    changes: [
      {
        type: "update_exercise",
        id: exerciseId,
        updates: adj as Record<string, unknown>,
        reason: `AI fallback resolver: ${direction} prescription modification`,
      },
    ],
  };
}

// ─── Main Export ──────────────────────────────────────────────────────────────

/**
 * Resolves a Harder/Easier request via structured OpenAI fallback.
 *
 * Returns an EditPlan on success, or null if resolution fails (caller should
 * continue to the general OpenAI path or rule-based fallback).
 *
 * Side effects (fire-and-forget):
 *   - Logs the resolved relationship as a global learning event
 *   - Creates/updates a learning candidate for future graph promotion
 */
export async function resolveHarderEasierFallback(ctx: HarderEasierContext): Promise<EditPlan | null> {
  logger.info(
    { exercise: ctx.exerciseName, direction: ctx.direction },
    "[HarderEasierFallback] Local graph empty — calling structured OpenAI fallback"
  );

  const resolution = await callOpenAIForHarderEasier(ctx);

  if (!resolution) {
    logger.warn({ exercise: ctx.exerciseName }, "[HarderEasierFallback] OpenAI returned null — falling through");
    return null;
  }

  if (!isValidResolution(resolution)) {
    logger.warn(
      { exercise: ctx.exerciseName, resolution },
      "[HarderEasierFallback] Resolution failed validation — falling through"
    );
    return null;
  }

  // If resolution is a prescription-only change with no content, fall through
  if (
    resolution.changeType === "modify_prescription" &&
    (!resolution.prescriptionAdjustments || Object.keys(resolution.prescriptionAdjustments).length === 0)
  ) {
    logger.warn({ exercise: ctx.exerciseName }, "[HarderEasierFallback] Prescription modification empty — falling through");
    return null;
  }

  const plan = resolutionToEditPlan(resolution, ctx.exerciseId, ctx.exerciseName, ctx.direction);

  logger.info(
    {
      exercise: ctx.exerciseName,
      direction: ctx.direction,
      changeType: resolution.changeType,
      replacement: resolution.replacementExerciseName,
    },
    "[HarderEasierFallback] Resolved successfully"
  );

  // Fire-and-forget: stage relationship candidate only
  if (resolution.changeType === "replace_exercise" && resolution.replacementExerciseName) {
    const toName = resolution.replacementExerciseName;
    Promise.resolve(
      logExerciseRelationship({
        fromExercise: ctx.exerciseName,
        toExercise: toName,
        direction: ctx.direction,
        sourceExerciseId: ctx.exerciseId,
        targetExerciseId: null,
        userId: ctx.userId,
        focusMode: ctx.focusMode,
        rationale: resolution.reason,
      })
    ).catch(() => {});
  } else {
    // Log the prescription modification event without a relationship candidate
    Promise.resolve(
      logExerciseRelationship({
        fromExercise: ctx.exerciseName,
        toExercise: `${ctx.exerciseName}:${ctx.direction}_prescription`,
        direction: ctx.direction,
        sourceExerciseId: ctx.exerciseId,
        targetExerciseId: null,
        userId: ctx.userId,
        focusMode: ctx.focusMode,
        rationale: resolution.reason,
      })
    ).catch(() => {});
  }

  return {
    ...plan,
    _debugRoute: {
      openaiCalled: true,
      openaiSucceeded: true,
      pathUsed: "openai",
    },
  };
}
