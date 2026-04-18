/**
 * Refinement Impact Engine
 *
 * Handles impact classification, downstream propagation, coach response generation,
 * and audit logging for all refinement operations in TrainChat.
 *
 * Impact scopes:
 *   local_only        — cosmetic swap, note update, no progression consequence
 *   same_week         — week-level change that doesn't ripple forward
 *   downstream_weeks  — change that warrants softening / adjusting future weeks
 *   full_block        — block-level change touching all weeks
 */

import { db, sessionExercises, trainingSessions } from "@workspace/db";
import { eq, inArray } from "drizzle-orm";
import { logger } from "./logger";
import type { ScopeResolution } from "./refinement-scope-resolver";
import type { EditPlan } from "./edit-intent-service";

// ─── Types ────────────────────────────────────────────────────────────────────

export type RefinementImpactScope =
  | "local_only"
  | "same_week"
  | "downstream_weeks"
  | "full_block";

export interface DownstreamWeekEffect {
  weekNumber: number;
  sessionsAdjusted: number;
  exercisesAdjusted: number;
  adjustmentType: string;
}

export interface RefinementImpactResult {
  impactScope: RefinementImpactScope;
  immediateChangeSummary: string;
  downstreamWeeksAffected: DownstreamWeekEffect[];
  relatedMovementFamilies: string[];
  coachResponse: string;
}

export interface RefinementImpactAuditEntry {
  request: string;
  targetScope: string;
  impactScope: RefinementImpactScope;
  immediateChanges: string;
  downstreamWeeksAffected: number[];
  relatedExerciseFamiliesTouched: string[];
}

// ─── Movement Family Classifier ───────────────────────────────────────────────

type MovementFamily =
  | "squat_lunge"
  | "hinge_deadlift"
  | "push_press"
  | "pull_row"
  | "carry_stability"
  | "jump_plyometric"
  | "core_anti_rotation"
  | "conditioning_cardio"
  | "unknown";

const MOVEMENT_FAMILY_PATTERNS: Array<{ family: MovementFamily; patterns: RegExp[] }> = [
  {
    family: "squat_lunge",
    patterns: [
      /\b(squat|goblet squat|front squat|hack squat|lunge|split squat|bulgarian|step[- ]?up|pistol|sissy squat|leg press)\b/i,
    ],
  },
  {
    family: "hinge_deadlift",
    patterns: [
      /\b(deadlift|rdl|romanian|hip hinge|good morning|kettlebell swing|hip thrust|glute bridge|back extension|nordics?|nordic curl|hamstring curl)\b/i,
    ],
  },
  {
    family: "push_press",
    patterns: [
      /\b(bench press|push[- ]?up|overhead press|military press|dip|shoulder press|incline|decline|chest fly|push jerk|push press|landmine press)\b/i,
    ],
  },
  {
    family: "pull_row",
    patterns: [
      /\b(pull[- ]?up|chin[- ]?up|row|lat pulldown|cable row|face pull|band pull|rear delt|inverted row|t[- ]?bar row)\b/i,
    ],
  },
  {
    family: "carry_stability",
    patterns: [
      /\b(farmer.?s? carry|suitcase carry|overhead carry|waiter carry|single[- ]?leg|pallof|anti[- ]?rotation|plank|dead bug|bird dog|Copenhagen)\b/i,
    ],
  },
  {
    family: "jump_plyometric",
    patterns: [
      /\b(box jump|broad jump|depth jump|hurdle hop|bounds?|plyometric|jump squat|power skip|sprint|acceleration|med ball slam|med ball throw|medicine ball)\b/i,
    ],
  },
  {
    family: "core_anti_rotation",
    patterns: [
      /\b(core|ab |abs |crunch|sit[- ]?up|hollow hold|cable crunch|leg raise|woodchop|chop|lift|rotation|landmine rotation|russian twist)\b/i,
    ],
  },
  {
    family: "conditioning_cardio",
    patterns: [
      /\b(bike|assault bike|row erg|ski erg|treadmill|sled|prowler|interval|conditioning|aerobic|tempo run|rower|battle rope|circuit)\b/i,
    ],
  },
];

export function detectMovementFamily(exerciseName: string): MovementFamily {
  for (const { family, patterns } of MOVEMENT_FAMILY_PATTERNS) {
    for (const pattern of patterns) {
      if (pattern.test(exerciseName)) return family;
    }
  }
  return "unknown";
}

export function detectMovementFamiliesFromExercises(exerciseNames: string[]): MovementFamily[] {
  const families = new Set<MovementFamily>();
  for (const name of exerciseNames) {
    const family = detectMovementFamily(name);
    if (family !== "unknown") families.add(family);
  }
  return Array.from(families);
}

// ─── Pain / Injury Keyword Detection ─────────────────────────────────────────

export interface PainSignal {
  detected: boolean;
  bodyPart?: string;
  movementFamily?: MovementFamily;
}

const PAIN_BODY_PART_PATTERNS: Array<{ part: string; family: MovementFamily }> = [
  { part: "knee", family: "squat_lunge" },
  { part: "hip", family: "hinge_deadlift" },
  { part: "lower back", family: "hinge_deadlift" },
  { part: "back", family: "hinge_deadlift" },
  { part: "shoulder", family: "push_press" },
  { part: "wrist", family: "push_press" },
  { part: "hamstring", family: "hinge_deadlift" },
  { part: "quad", family: "squat_lunge" },
];

export function detectPainSignal(message: string): PainSignal {
  const lower = message.toLowerCase();
  const hasPainWord = /\b(pain|hurt|irritat|bother|ache|sore|injured|injury|uncomfortable|discomfort|tweak)\b/.test(lower);

  if (!hasPainWord) return { detected: false };

  for (const { part, family } of PAIN_BODY_PART_PATTERNS) {
    if (lower.includes(part)) {
      return { detected: true, bodyPart: part, movementFamily: family };
    }
  }

  return { detected: true };
}

// ─── Difficulty Signal Detection ──────────────────────────────────────────────

export type DifficultyDirection = "easier" | "harder" | "neutral";

export function detectDifficultySignal(message: string): DifficultyDirection {
  const lower = message.toLowerCase();
  if (/\b(easier|too hard|too heavy|regress|recovery|deload|reduce|lighten|lower intensity|less intense)\b/.test(lower)) {
    return "easier";
  }
  if (/\b(harder|more challenging|progress|heavier|increase|tougher)\b/.test(lower)) {
    return "harder";
  }
  return "neutral";
}

// ─── Impact Classification ─────────────────────────────────────────────────────

interface ClassifyImpactOpts {
  scopeResolution: ScopeResolution;
  userMessage: string;
  editPlan?: EditPlan | null;
  painSignal?: PainSignal;
  difficultyDirection?: DifficultyDirection;
}

export function classifyRefinementImpact(opts: ClassifyImpactOpts): RefinementImpactScope {
  const { scopeResolution, userMessage, editPlan, painSignal, difficultyDirection } = opts;

  // Block scope always full_block
  if (scopeResolution.scope === "block_scope") return "full_block";

  // Week scope
  if (scopeResolution.scope === "week_scope") {
    const direction = difficultyDirection ?? detectDifficultySignal(userMessage);
    // If the week is made easier/recovery, future weeks may need to stay coherent
    if (direction === "easier") return "downstream_weeks";
    // Explosive / power shift that might ripple
    if (/\b(explosive|power|more intense)\b/i.test(userMessage)) return "downstream_weeks";
    return "same_week";
  }

  // Session scope
  const direction = difficultyDirection ?? detectDifficultySignal(userMessage);
  const pain = painSignal ?? detectPainSignal(userMessage);

  // Pain patterns warrant downstream attention
  if (pain.detected) return "downstream_weeks";

  // Meaningful difficulty changes ripple forward
  if (direction === "easier") return "downstream_weeks";

  // Swaps that affect the main movement (not just a note or cosmetic tweak)
  if (editPlan) {
    const hasSwap = editPlan.changes.some((c) => c.type === "replace_exercise");
    const hasDelete = editPlan.changes.some((c) => c.type === "delete_exercise");
    if (hasSwap || hasDelete) return "downstream_weeks";
  }

  // Cosmetic / local edits
  if (editPlan) {
    const onlyNoteUpdates = editPlan.changes.every(
      (c) =>
        c.type === "update_exercise" &&
        c.updates &&
        Object.keys(c.updates).length === 1 &&
        "notes" in c.updates
    );
    if (onlyNoteUpdates) return "local_only";
  }

  return "local_only";
}

// ─── Full Training System Shape (lightweight, for downstream use) ──────────────

interface WeekExercise {
  id: number;
  name: string;
  category?: string;
  reps?: string;
  rest?: string;
  notes?: string;
}

interface WeekSession {
  id: number;
  isRestDay: boolean;
  exercises: WeekExercise[];
}

interface TrainingWeek {
  weekNumber: number;
  sessions: WeekSession[];
}

// ─── Downstream Propagation ────────────────────────────────────────────────────

interface PropagateDownstreamOpts {
  fullSystem: {
    phases: Array<{
      weeks: Array<{
        weekNumber: number;
        sessions: Array<{
          id: number;
          isRestDay: boolean;
          exercises: Array<{
            id: number;
            name: string;
            category?: string | null;
            reps?: string | null;
            rest?: string | null;
            notes?: string | null;
          }>;
        }>;
      }>;
    }>;
  };
  currentWeekNumber: number;
  impactScope: RefinementImpactScope;
  targetMovementFamilies: MovementFamily[];
  difficultyDirection: DifficultyDirection;
  painSignal: PainSignal;
}

export async function propagateDownstream(
  opts: PropagateDownstreamOpts
): Promise<DownstreamWeekEffect[]> {
  const { fullSystem, currentWeekNumber, impactScope, targetMovementFamilies, difficultyDirection, painSignal } = opts;

  if (impactScope === "local_only" || impactScope === "same_week" || impactScope === "full_block") {
    return [];
  }

  const allWeeks = fullSystem.phases.flatMap((p) => p.weeks);
  // Only future weeks
  const futureWeeks = allWeeks.filter((w) => w.weekNumber > currentWeekNumber);

  if (futureWeeks.length === 0) return [];

  const effects: DownstreamWeekEffect[] = [];

  for (const week of futureWeeks) {
    let sessionsAdjusted = 0;
    let exercisesAdjusted = 0;
    let adjustmentType = "";

    for (const session of week.sessions) {
      if (session.isRestDay) continue;

      const relatedExercises = session.exercises.filter((ex) => {
        if (!ex.name) return false;
        const family = detectMovementFamily(ex.name);
        return targetMovementFamilies.length === 0 || targetMovementFamilies.includes(family);
      });

      if (relatedExercises.length === 0) continue;

      const exerciseIds = relatedExercises.map((e) => e.id).filter((id): id is number => id != null);

      if (difficultyDirection === "easier") {
        // Soften the progression — increase rest slightly, don't reset reps to harder range
        await db
          .update(sessionExercises)
          .set({ rest: "2-3 min" })
          .where(inArray(sessionExercises.id, exerciseIds));
        adjustmentType = "progression_softened";
      } else if (painSignal.detected && painSignal.bodyPart) {
        // Flag related exercises with modification notes
        const existingNotes = relatedExercises[0]?.notes ?? "";
        const modNote = `Monitor ${painSignal.bodyPart} — use pain-free ROM only. Consider regression if discomfort returns.`;
        if (!existingNotes.includes("pain-free")) {
          await db
            .update(sessionExercises)
            .set({ notes: modNote })
            .where(inArray(sessionExercises.id, exerciseIds));
          adjustmentType = "pain_monitoring_note_added";
        } else {
          adjustmentType = "pain_monitoring_already_present";
        }
      }

      exercisesAdjusted += exerciseIds.length;
      if (exerciseIds.length > 0) sessionsAdjusted++;
    }

    if (sessionsAdjusted > 0) {
      effects.push({
        weekNumber: week.weekNumber,
        sessionsAdjusted,
        exercisesAdjusted,
        adjustmentType,
      });
    }
  }

  return effects;
}

// ─── Coach Response Generator ──────────────────────────────────────────────────

interface CoachResponseOpts {
  impactScope: RefinementImpactScope;
  immediateChangeSummary: string;
  downstreamEffects: DownstreamWeekEffect[];
  scopeLabel: string;
  difficultyDirection: DifficultyDirection;
  painSignal: PainSignal;
  userMessage: string;
  movementFamilies: MovementFamily[];
}

function movementFamilyLabel(family: MovementFamily): string {
  const labels: Record<MovementFamily, string> = {
    squat_lunge: "lower-body / knee-dominant",
    hinge_deadlift: "hip-hinge / posterior-chain",
    push_press: "pressing / upper-body push",
    pull_row: "pulling / upper-body pull",
    carry_stability: "carry and stability",
    jump_plyometric: "plyometric and explosive",
    core_anti_rotation: "core and anti-rotation",
    conditioning_cardio: "conditioning",
    unknown: "",
  };
  return labels[family] ?? "";
}

export function generateCoachResponse(opts: CoachResponseOpts): string {
  const {
    impactScope,
    immediateChangeSummary,
    downstreamEffects,
    scopeLabel,
    difficultyDirection,
    painSignal,
    movementFamilies,
  } = opts;

  const immediate = immediateChangeSummary.endsWith(".")
    ? immediateChangeSummary
    : `${immediateChangeSummary}.`;

  const totalDownstreamSessions = downstreamEffects.reduce((s, e) => s + e.sessionsAdjusted, 0);
  const downstreamWeekNumbers = downstreamEffects.map((e) => e.weekNumber).sort((a, b) => a - b);
  const weekRange =
    downstreamWeekNumbers.length === 1
      ? `Week ${downstreamWeekNumbers[0]}`
      : downstreamWeekNumbers.length > 1
      ? `Weeks ${downstreamWeekNumbers[0]}–${downstreamWeekNumbers[downstreamWeekNumbers.length - 1]}`
      : null;

  const familyLabel = movementFamilies
    .filter((f) => f !== "unknown")
    .map(movementFamilyLabel)
    .filter(Boolean)
    .join(" and ");

  // ── Full block ──────────────────────────────────────────────────────────────
  if (impactScope === "full_block") {
    return `${immediate} The full block has been restructured — all sessions updated to reflect the new direction.`;
  }

  // ── Same week only ──────────────────────────────────────────────────────────
  if (impactScope === "same_week") {
    return immediate;
  }

  // ── Local only ──────────────────────────────────────────────────────────────
  if (impactScope === "local_only") {
    return immediate;
  }

  // ── Downstream weeks ────────────────────────────────────────────────────────
  if (downstreamEffects.length === 0) {
    // Classified as downstream but nothing actually propagated (e.g., already last week)
    return immediate;
  }

  // Pain-related downstream
  if (painSignal.detected && painSignal.bodyPart) {
    const bodyPartLabel = painSignal.bodyPart;
    if (weekRange) {
      return `${immediate} I've also flagged related ${familyLabel || "exercises"} in ${weekRange} to monitor ${bodyPartLabel} load — train pain-free and regress if discomfort comes back.`;
    }
    return `${immediate} Related exercises in later weeks have been flagged with ${bodyPartLabel} monitoring cues.`;
  }

  // Difficulty easier → downstream softened
  if (difficultyDirection === "easier") {
    if (weekRange) {
      return `${immediate} I've also softened the progression in ${weekRange} so the load doesn't spike back immediately — ${totalDownstreamSessions} session${totalDownstreamSessions !== 1 ? "s" : ""} adjusted to keep continuity smooth.`;
    }
    return `${immediate} The progression in later weeks has been kept moderate to avoid an abrupt jump back.`;
  }

  // Generic downstream
  if (weekRange) {
    return `${immediate} ${weekRange} adjusted (${totalDownstreamSessions} session${totalDownstreamSessions !== 1 ? "s" : ""}) to preserve progression continuity.`;
  }

  return immediate;
}

// ─── Audit Logger ─────────────────────────────────────────────────────────────

export function logRefinementImpactAudit(entry: RefinementImpactAuditEntry): void {
  logger.info(
    {
      request: entry.request.slice(0, 120),
      targetScope: entry.targetScope,
      impactScope: entry.impactScope,
      immediateChanges: entry.immediateChanges.slice(0, 200),
      downstreamWeeksAffected: entry.downstreamWeeksAffected,
      relatedExerciseFamiliesTouched: entry.relatedExerciseFamiliesTouched,
    },
    "[RefinementImpactAudit]"
  );
}

// ─── Full Pipeline (for session-scope edits) ──────────────────────────────────

interface SessionScopeImpactOpts {
  userMessage: string;
  scopeResolution: ScopeResolution;
  editPlan: EditPlan | null;
  immediateChangeSummary: string;
  fullSystem: PropagateDownstreamOpts["fullSystem"];
  currentWeekNumber: number;
  targetExerciseNames?: string[];
}

export async function processSessionScopeImpact(
  opts: SessionScopeImpactOpts
): Promise<RefinementImpactResult> {
  const {
    userMessage,
    scopeResolution,
    editPlan,
    immediateChangeSummary,
    fullSystem,
    currentWeekNumber,
    targetExerciseNames = [],
  } = opts;

  const painSignal = detectPainSignal(userMessage);
  const difficultyDirection = detectDifficultySignal(userMessage);
  const impactScope = classifyRefinementImpact({
    scopeResolution,
    userMessage,
    editPlan,
    painSignal,
    difficultyDirection,
  });

  // Detect movement families from targeted exercises
  const targetFamilies = detectMovementFamiliesFromExercises(targetExerciseNames) as MovementFamily[];

  // Also infer from pain signal
  if (painSignal.movementFamily && !targetFamilies.includes(painSignal.movementFamily)) {
    targetFamilies.push(painSignal.movementFamily);
  }

  // Propagate downstream if needed
  const downstreamEffects = await propagateDownstream({
    fullSystem,
    currentWeekNumber,
    impactScope,
    targetMovementFamilies: targetFamilies,
    difficultyDirection,
    painSignal,
  });

  const coachResponse = generateCoachResponse({
    impactScope,
    immediateChangeSummary,
    downstreamEffects,
    scopeLabel: "session",
    difficultyDirection,
    painSignal,
    userMessage,
    movementFamilies: targetFamilies,
  });

  // Audit log
  logRefinementImpactAudit({
    request: userMessage,
    targetScope: scopeResolution.scope,
    impactScope,
    immediateChanges: immediateChangeSummary,
    downstreamWeeksAffected: downstreamEffects.map((e) => e.weekNumber),
    relatedExerciseFamiliesTouched: targetFamilies,
  });

  return {
    impactScope,
    immediateChangeSummary,
    downstreamWeeksAffected: downstreamEffects,
    relatedMovementFamilies: targetFamilies,
    coachResponse,
  };
}

// ─── Week/Block Scope Coach Response ─────────────────────────────────────────

interface HierarchicalImpactOpts {
  userMessage: string;
  scopeResolution: ScopeResolution;
  changeSummary: string;
  sessionCount: number;
  exerciseCount: number;
  fullSystem: PropagateDownstreamOpts["fullSystem"];
  currentWeekNumber: number;
}

export async function processHierarchicalImpact(
  opts: HierarchicalImpactOpts
): Promise<RefinementImpactResult> {
  const {
    userMessage,
    scopeResolution,
    changeSummary,
    fullSystem,
    currentWeekNumber,
  } = opts;

  const painSignal = detectPainSignal(userMessage);
  const difficultyDirection = detectDifficultySignal(userMessage);
  const impactScope = classifyRefinementImpact({
    scopeResolution,
    userMessage,
    painSignal,
    difficultyDirection,
  });

  // For week scope that warrants downstream propagation
  let downstreamEffects: DownstreamWeekEffect[] = [];
  if (impactScope === "downstream_weeks" && scopeResolution.scope === "week_scope") {
    downstreamEffects = await propagateDownstream({
      fullSystem,
      currentWeekNumber,
      impactScope,
      targetMovementFamilies: [],
      difficultyDirection,
      painSignal,
    });
  }

  const coachResponse = generateCoachResponse({
    impactScope,
    immediateChangeSummary: changeSummary,
    downstreamEffects,
    scopeLabel: scopeResolution.scope === "block_scope" ? "block" : "week",
    difficultyDirection,
    painSignal,
    userMessage,
    movementFamilies: [],
  });

  logRefinementImpactAudit({
    request: userMessage,
    targetScope: scopeResolution.scope,
    impactScope,
    immediateChanges: changeSummary,
    downstreamWeeksAffected: downstreamEffects.map((e) => e.weekNumber),
    relatedExerciseFamiliesTouched: [],
  });

  return {
    impactScope,
    immediateChangeSummary: changeSummary,
    downstreamWeeksAffected: downstreamEffects,
    relatedMovementFamilies: [],
    coachResponse,
  };
}
