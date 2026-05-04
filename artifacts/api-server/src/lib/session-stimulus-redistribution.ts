/**
 * Session Stimulus Redistribution Layer — Layer 3
 *
 * After any exercise replacement, evaluates whether the session retained its
 * training intent and redistributes volume intelligently when it did not.
 *
 * Decision contract:
 *   preserved            — same family/role, no loss, no action
 *   reduced              — lower-priority role substituted in; compensate if safe
 *   distorted            — power ↔ non-power crossing; flag regression
 *   intentionally_regressed — deload block or explicit regression; accept it
 *   safety_modified      — pain flag drove the change; no extra volume
 *
 * Compensation priority order (when safe):
 *   1. Upgrade an existing same-bucket secondary/accessory exercise (+1 set)
 *   2. Flag temporary regression (no safe candidate)
 *
 * Rules that always apply:
 *   • Isolation exercises are never promoted to primary loading
 *   • Pain flag → preserve_regression_no_compensation always
 *   • REBUILD_DELOAD → accept reduced stimulus, no compensation
 *   • High fatigue / low readiness → no extra volume
 *   • Total primary pattern sets capped at 6 per session
 *   • Individual exercise set caps enforced per role
 *
 * Logs:
 *   [ExerciseMutation:StimulusRedistribution:Input]
 *   [ExerciseMutation:StimulusRedistribution:Decision]
 *   [ExerciseMutation:StimulusRedistribution:Output]
 */

import { logger } from "./logger";
import {
  classifyExerciseRole,
  classifyMovementBucket,
  isSameFamilyAndRole,
  type ExerciseRole,
  type MovementBucket,
  type BlockType,
  type FatigueLevel,
  type SessionGoal,
  type TrainingFocus,
  type UserLevel,
} from "./prescription-remap";

// ─── Public types ──────────────────────────────────────────────────────────────

export type StimulusImpact =
  | "preserved"             // same-family swap; prescription carries over
  | "reduced"               // lower-priority role filled in; partial loss
  | "distorted"             // fundamental demand change (power ↔ accessory)
  | "intentionally_regressed" // deload/easier request; loss is acceptable
  | "safety_modified";      // pain flag drove the regression; no compensation

export type StimulusDrop = "none" | "low" | "moderate" | "high";

export type CompensationAction =
  | "increase_secondary_volume"         // secondary_strength exercise in same bucket: +1 set
  | "upgrade_existing_accessory"        // hypertrophy_accessory in same bucket: +1 set
  | "add_pattern_replacement"           // suggest adding a compatible same-pattern exercise
  | "preserve_regression_no_compensation" // intentional regression; volume unchanged
  | "flag_temporary_regression"         // loss noted; no safe compensation available
  | "reduce_session_stress"             // high fatigue; session stress kept low
  | "no_action";                        // no redistribution needed

export interface LostStimulus {
  movementBucketLost: boolean;
  roleLost: boolean;
  primaryPatternLost: boolean;
  estimatedStimulusDrop: StimulusDrop;
  /** Original movement bucket (e.g. "hinge_hip") — null if no loss */
  affectedPattern: string | null;
  /** Original exercise role (e.g. "primary_strength") — null if no loss */
  affectedRole: string | null;
}

export interface SessionStimulusExercise {
  id: number;
  name: string;
  sets: number | null;
  reps?: string | null;
  rest?: string | null;
  notes?: string | null;
  category?: string | null;
  orderIndex?: number | null;
}

export interface StimulusRedistributionInput {
  originalExercise:    { name: string; sets: number; reps: string; rest: string };
  replacementExercise: { id: number;  name: string; sets: number; reps: string; rest: string };
  /** Full list of session exercises AFTER the replacement is already committed */
  sessionExercises: SessionStimulusExercise[];
  sessionGoal?:     SessionGoal;
  blockType?:        BlockType;
  trainingFocus?:    TrainingFocus;
  userLevel?:        UserLevel;
  fatigueLevel?:     FatigueLevel;
  readinessLevel?:   FatigueLevel;
  painSafetyFlag?:   boolean;
  mutationType?:     "swap" | "easier" | "harder" | "user_specified";
}

export interface StimulusRedistributionResult {
  stimulusImpact:    StimulusImpact;
  lostStimulus:      LostStimulus;
  compensationActions: CompensationAction[];
  /** Exercises whose sets should be updated in the DB after redistribution */
  updatedSessionExercises: Array<{ id: number; name: string; oldSets: number; newSets: number }>;
  rationale:         string;
  userFacingSummary: string;
  safetyWarnings:    string[];
  audit: {
    originalRole:                ExerciseRole;
    replacementRole:             ExerciseRole;
    originalBucket:              MovementBucket;
    replacementBucket:           MovementBucket;
    totalSetsBeforeMutation:     number;
    totalSetsAfterRedistribution: number;
    exercisesModified:           string[];
    exercisesAdded:              string[];
  };
}

// ─── Set limits per role ───────────────────────────────────────────────────────

const MAX_SETS_BY_ROLE: Partial<Record<ExerciseRole, number>> = {
  primary_strength:      6,
  secondary_strength:    5,
  hypertrophy_accessory: 4,
  isolation:             4,
  power_plyometric:      5,
  mobility_prehab:       3,
};

/** Total primary-pattern hard sets per session the engine will not exceed */
const BUCKET_SET_CEILING = 6;

/** Maximum exercises upgraded in one redistribution pass */
const MAX_UPGRADES_PER_PASS = 2;

// ─── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Returns how much training stimulus was lost based on the role transition.
 * Same-family checks should be done before calling this.
 */
export function estimateStimulusDrop(
  origRole: ExerciseRole,
  repRole: ExerciseRole,
  origBucket: MovementBucket,
  repBucket: MovementBucket,
): StimulusDrop {
  // Identity — shouldn't happen after same-family check, but handle gracefully
  if (origRole === repRole && origBucket === repBucket) return "none";

  // Power ↔ non-power crossing: unique neural demand is lost
  const origIsPower = origRole === "power_plyometric";
  const repIsPower  = repRole  === "power_plyometric";
  if (origIsPower !== repIsPower) return "high";

  // Completely different demand types
  if (repRole === "mobility_prehab" || repRole === "conditioning") return "high";

  // Primary → isolation or accessory: significant stimulus loss
  if (origRole === "primary_strength" &&
      (repRole === "isolation" || repRole === "hypertrophy_accessory")) return "high";

  // Primary → secondary: meaningful but partial loss
  if (origRole === "primary_strength" && repRole === "secondary_strength") return "moderate";

  // Secondary → isolation: moderate loss
  if (origRole === "secondary_strength" && repRole === "isolation") return "moderate";

  // Secondary → accessory (same-ish tier): small loss
  if (origRole === "secondary_strength" && repRole === "hypertrophy_accessory") return "low";

  // Accessory → isolation: minor
  if (origRole === "hypertrophy_accessory" && repRole === "isolation") return "low";

  // Same role, different bucket (e.g. bench → row): minor contextual loss
  if (origRole === repRole) return "low";

  return "low";
}

/**
 * Maps drop + context to an overall stimulus impact classification.
 */
export function determineStimulusImpact(
  drop: StimulusDrop,
  origRole: ExerciseRole,
  repRole: ExerciseRole,
  context: {
    painSafetyFlag?: boolean;
    blockType?: BlockType;
    fatigueLevel?: FatigueLevel;
    readinessLevel?: FatigueLevel;
    mutationType?: string;
  },
): StimulusImpact {
  if (context.painSafetyFlag) return "safety_modified";

  if (drop === "none") return "preserved";

  // Deload block: reduced stimulus is intentional by design
  if (context.blockType === "REBUILD_DELOAD") return "intentionally_regressed";

  // User explicitly asked for something easier
  if (context.mutationType === "easier") return "intentionally_regressed";

  // Power ↔ non-power: unique demand change that can't be compensated
  const origIsPower = origRole === "power_plyometric";
  const repIsPower  = repRole  === "power_plyometric";
  if (origIsPower !== repIsPower) return "distorted";

  return "reduced";
}

// ─── Upgrade candidate resolution ─────────────────────────────────────────────

interface UpgradeCandidate {
  id:          number;
  name:        string;
  currentSets: number;
  role:        ExerciseRole;
  headroom:    number; // how many more sets it can take
}

function findUpgradeCandidates(
  exercises:           SessionStimulusExercise[],
  targetBucket:        MovementBucket,
  excludeReplacementId: number,
): UpgradeCandidate[] {
  return exercises
    .filter((ex) => ex.id !== excludeReplacementId)
    .filter((ex) => classifyMovementBucket(ex.name) === targetBucket)
    .map((ex) => {
      const role       = classifyExerciseRole(ex.name);
      const currentSets = ex.sets ?? 0;
      const maxSets    = MAX_SETS_BY_ROLE[role] ?? 4;
      return { id: ex.id, name: ex.name, currentSets, role, headroom: maxSets - currentSets };
    })
    .filter((ex) =>
      ex.headroom > 0 &&
      (ex.role === "secondary_strength" || ex.role === "hypertrophy_accessory"),
    )
    .sort((a, b) => {
      // Secondary before accessory, then ascending sets (most headroom first)
      const roleOrder: Partial<Record<ExerciseRole, number>> = {
        secondary_strength:    0,
        hypertrophy_accessory: 1,
      };
      const aPri = roleOrder[a.role] ?? 2;
      const bPri = roleOrder[b.role] ?? 2;
      if (aPri !== bPri) return aPri - bPri;
      return a.currentSets - b.currentSets;
    });
}

// ─── Rationale builders ────────────────────────────────────────────────────────

function buildRationale(
  stimulusImpact:      StimulusImpact,
  lostStimulus:        LostStimulus,
  compensationActions: CompensationAction[],
  originalName:        string,
  replacementName:     string,
  modifiedExercises:   string[],
): string {
  const patternLabel = lostStimulus.affectedPattern?.replace(/_/g, " ") ?? "the original pattern";
  const roleLabel    = lostStimulus.affectedRole?.replace(/_/g, " ")    ?? "primary";

  switch (stimulusImpact) {
    case "preserved":
      return `${replacementName} is in the same movement family and role as ${originalName}. No redistribution required.`;

    case "safety_modified":
      return `Replacement was driven by a pain/safety flag. Volume was not increased to protect quality and safety.`;

    case "intentionally_regressed":
      return `${originalName} → ${replacementName} was an intentional regression (deload or easier request). Reduced stimulus is acceptable and expected.`;

    case "distorted":
      return `${originalName} → ${replacementName} crosses a fundamental demand boundary (power ↔ non-power). The session was flagged as a temporary regression — the power stimulus cannot be compensated with accessory volume.`;

    case "reduced": {
      const compStr = compensationActions.includes("upgrade_existing_accessory") ||
                      compensationActions.includes("increase_secondary_volume")
        ? `Added a set to ${modifiedExercises.join(", ")} to partially preserve the ${patternLabel} stimulus.`
        : compensationActions.includes("flag_temporary_regression")
          ? `No existing ${patternLabel} exercise was available to upgrade — flagged as temporary regression.`
          : compensationActions.includes("reduce_session_stress")
            ? "High fatigue / low readiness: no compensatory volume added."
            : "No compensation was applied.";
      return `${replacementName} is a ${classifyExerciseRole(replacementName).replace(/_/g, " ")} exercise. ` +
             `Replacing a ${roleLabel} (${patternLabel}) with it reduced the pattern stimulus. ${compStr}`;
    }
  }
}

function buildUserFacingSummary(
  stimulusImpact:      StimulusImpact,
  lostStimulus:        LostStimulus,
  compensationActions: CompensationAction[],
  originalName:        string,
  replacementName:     string,
  modifiedExercises:   string[],
  context: {
    painSafetyFlag?: boolean;
    blockType?:       BlockType;
    fatigueLevel?:    FatigueLevel;
    readinessLevel?:  FatigueLevel;
  },
): string {
  const patternLabel = lostStimulus.affectedPattern?.replace(/_/g, " ") ?? "pattern";
  const roleLabel    = lostStimulus.affectedRole?.replace(/_/g, " ")    ?? "primary";

  switch (stimulusImpact) {
    case "preserved":
      return `${replacementName} is the same movement pattern as ${originalName} — prescription carried over with no redistribution needed.`;

    case "safety_modified":
      return `Because this was a safety-oriented regression, TrainChat did not add extra volume. The session is intentionally lower stress today.`;

    case "intentionally_regressed":
      if (context.blockType === "REBUILD_DELOAD") {
        return `This replacement reduced the primary strength stimulus, which is appropriate for a deload block. No compensation was added.`;
      }
      return `This replacement was an intentional regression. TrainChat reduced session stress rather than compensating for the lost stimulus.`;

    case "distorted":
      return `This replacement crossed a major movement boundary. The session was flagged as a temporary regression — a same-pattern exercise should be included in the next session.`;

    case "reduced": {
      const highFatigue = context.fatigueLevel === "high" || context.readinessLevel === "low";

      if (compensationActions.includes("reduce_session_stress")) {
        return `Because readiness/fatigue was flagged, TrainChat did not add compensatory volume. Quality over quantity today.`;
      }

      if (compensationActions.includes("upgrade_existing_accessory") ||
          compensationActions.includes("increase_secondary_volume")) {
        const upgraded = modifiedExercises.join(", ");
        return (
          `The swap changed this from a ${roleLabel} to an isolation/accessory exercise, so TrainChat kept ${replacementName} in an accessory rep range ` +
          `and added a set to ${upgraded} to partially preserve the ${patternLabel} stimulus.`
        );
      }

      if (compensationActions.includes("preserve_regression_no_compensation")) {
        return `TrainChat kept the session unchanged. The reduced ${patternLabel} stimulus is accepted — no compensatory volume was added.`;
      }

      if (compensationActions.includes("flag_temporary_regression")) {
        if (highFatigue) {
          return `Because readiness/fatigue was flagged, TrainChat did not add compensatory volume. Quality over quantity today.`;
        }
        return (
          `This replacement reduced the primary ${patternLabel} stimulus. ` +
          `No existing ${patternLabel} exercise was available to upgrade — flagged as a temporary regression.`
        );
      }

      return `${replacementName} replaced ${originalName}. Stimulus was evaluated and no redistribution was needed.`;
    }
  }
}

// ─── Main function ─────────────────────────────────────────────────────────────

/**
 * Evaluates and optionally redistributes session volume after an exercise swap.
 *
 * Call after Layer 1 (prescription remap) and Layer 2 (context modifiers) have
 * already been applied and the replacement is committed to the database.
 *
 * `sessionExercises` should include the replacement (already in the session)
 * so the function can see the full current state.
 *
 * Returns the full redistribution result, including which exercises (if any)
 * should have their sets increased. The caller is responsible for applying those
 * DB updates.
 */
export function evaluateSessionStimulusAfterMutation(
  input: StimulusRedistributionInput,
): StimulusRedistributionResult {
  const {
    originalExercise, replacementExercise, sessionExercises,
    blockType, fatigueLevel, readinessLevel, painSafetyFlag, mutationType,
  } = input;

  // ── Classify ──────────────────────────────────────────────────────────────
  const origRole   = classifyExerciseRole(originalExercise.name);
  const repRole    = classifyExerciseRole(replacementExercise.name);
  const origBucket = classifyMovementBucket(originalExercise.name);
  const repBucket  = classifyMovementBucket(replacementExercise.name);

  logger.info(
    {
      originalExercise: originalExercise.name,
      replacementExercise: replacementExercise.name,
      origRole, repRole, origBucket, repBucket,
      sessionExerciseCount: sessionExercises.length,
      blockType, fatigueLevel, readinessLevel, painSafetyFlag, mutationType,
    },
    "[ExerciseMutation:StimulusRedistribution:Input]",
  );

  // ── Same-family fast path ─────────────────────────────────────────────────
  const sameFamily = isSameFamilyAndRole(originalExercise.name, replacementExercise.name);

  const drop: StimulusDrop = sameFamily
    ? "none"
    : estimateStimulusDrop(origRole, repRole, origBucket, repBucket);

  const primaryPatternLost =
    !sameFamily &&
    origRole === "primary_strength" &&
    repRole !== "primary_strength";

  const lostStimulus: LostStimulus = {
    movementBucketLost:    origBucket !== repBucket,
    roleLost:              origRole   !== repRole,
    primaryPatternLost,
    estimatedStimulusDrop: drop,
    affectedPattern: primaryPatternLost ? origBucket   : null,
    affectedRole:    primaryPatternLost ? origRole     : null,
  };

  const stimulusImpact = determineStimulusImpact(drop, origRole, repRole, {
    painSafetyFlag, blockType, fatigueLevel, readinessLevel, mutationType,
  });

  logger.info(
    {
      originalExercise: originalExercise.name,
      replacementExercise: replacementExercise.name,
      sameFamily, drop, primaryPatternLost, stimulusImpact,
    },
    "[ExerciseMutation:StimulusRedistribution:Decision]",
  );

  // ── Early exits: no compensation possible or needed ───────────────────────
  const updatedSessionExercises: Array<{ id: number; name: string; oldSets: number; newSets: number }> = [];
  const exercisesModified: string[] = [];
  const compensationActions: CompensationAction[] = [];
  const safetyWarnings: string[] = [];

  if (painSafetyFlag) {
    safetyWarnings.push("Pain/safety flag active — no compensatory volume was added.");
  }

  const highFatigue = fatigueLevel === "high" || readinessLevel === "low";

  // ── Compensation decision tree ────────────────────────────────────────────
  if (stimulusImpact === "preserved") {
    compensationActions.push("no_action");

  } else if (stimulusImpact === "safety_modified") {
    compensationActions.push("preserve_regression_no_compensation");

  } else if (stimulusImpact === "intentionally_regressed") {
    compensationActions.push("preserve_regression_no_compensation");

  } else if (stimulusImpact === "distorted") {
    compensationActions.push("flag_temporary_regression");

  } else {
    // stimulusImpact === "reduced"
    if (highFatigue) {
      // High fatigue: do not pile on volume
      compensationActions.push("reduce_session_stress");

    } else if (blockType === "POWER_ELASTIC_CONVERSION") {
      // Power block: preserve intent; avoid fatigue-heavy compensation
      compensationActions.push("flag_temporary_regression");

    } else if (!primaryPatternLost) {
      // Secondary/accessory drop — not critical enough to compensate
      compensationActions.push("no_action");

    } else {
      // Primary pattern was lost — attempt upgrade
      const totalSetsInOrigBucket = sessionExercises
        .filter((ex) => ex.id !== replacementExercise.id)
        .filter((ex) => classifyMovementBucket(ex.name) === origBucket)
        .reduce((sum, ex) => sum + (ex.sets ?? 0), 0);

      if (totalSetsInOrigBucket >= BUCKET_SET_CEILING) {
        // Already at volume ceiling — no more sets needed
        compensationActions.push("no_action");
      } else {
        const candidates = findUpgradeCandidates(sessionExercises, origBucket, replacementExercise.id);

        if (candidates.length === 0) {
          compensationActions.push("flag_temporary_regression");
        } else {
          let remainingBudget = BUCKET_SET_CEILING - totalSetsInOrigBucket;
          let upgradesApplied = 0;

          for (const candidate of candidates) {
            if (upgradesApplied >= MAX_UPGRADES_PER_PASS) break;
            if (remainingBudget <= 0) break;

            const newSets = candidate.currentSets + 1;
            const action: CompensationAction = candidate.role === "secondary_strength"
              ? "increase_secondary_volume"
              : "upgrade_existing_accessory";

            if (!compensationActions.includes(action)) compensationActions.push(action);

            updatedSessionExercises.push({
              id: candidate.id,
              name: candidate.name,
              oldSets: candidate.currentSets,
              newSets,
            });
            exercisesModified.push(candidate.name);
            remainingBudget--;
            upgradesApplied++;
          }

          if (upgradesApplied === 0) {
            // Candidates existed but none had headroom (safety net)
            compensationActions.push("flag_temporary_regression");
          }
        }
      }
    }
  }

  // ── Audit totals ──────────────────────────────────────────────────────────
  const allCurrentSets = sessionExercises.reduce((sum, ex) => sum + (ex.sets ?? 0), 0);
  const upgradeSetDelta = updatedSessionExercises.reduce((sum, u) => sum + (u.newSets - u.oldSets), 0);
  const totalSetsAfter  = allCurrentSets + upgradeSetDelta;
  const totalSetsBefore = allCurrentSets - replacementExercise.sets + originalExercise.sets;

  // ── Build narrative ───────────────────────────────────────────────────────
  const rationale = buildRationale(
    stimulusImpact, lostStimulus, compensationActions,
    originalExercise.name, replacementExercise.name, exercisesModified,
  );
  const userFacingSummary = buildUserFacingSummary(
    stimulusImpact, lostStimulus, compensationActions,
    originalExercise.name, replacementExercise.name, exercisesModified,
    { painSafetyFlag, blockType, fatigueLevel, readinessLevel },
  );

  const result: StimulusRedistributionResult = {
    stimulusImpact,
    lostStimulus,
    compensationActions,
    updatedSessionExercises,
    rationale,
    userFacingSummary,
    safetyWarnings,
    audit: {
      originalRole: origRole,
      replacementRole: repRole,
      originalBucket: origBucket,
      replacementBucket: repBucket,
      totalSetsBeforeMutation: totalSetsBefore,
      totalSetsAfterRedistribution: totalSetsAfter,
      exercisesModified,
      exercisesAdded: [],
    },
  };

  logger.info(
    {
      originalExercise:    originalExercise.name,
      replacementExercise: replacementExercise.name,
      stimulusImpact,
      compensationActions,
      exercisesModified,
      updatedCount: updatedSessionExercises.length,
      totalSetsBeforeMutation:      totalSetsBefore,
      totalSetsAfterRedistribution: totalSetsAfter,
      userFacingSummary,
    },
    "[ExerciseMutation:StimulusRedistribution:Output]",
  );

  return result;
}
