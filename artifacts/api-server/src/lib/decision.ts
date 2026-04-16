// ─── TrainChat Decision Tree & Reasoning Layer ────────────────────────────────
//
// ⚠️  LEGACY MODULE — DO NOT ADD NEW ROUTING LOGIC HERE
//
// This module was the original routing authority for TrainChat conversations.
// It has been superseded by the Execution Planner (execution-planner.ts), which
// is now the single-brain routing system. This module is retained because:
//   - ai.ts still accepts ActionDecision in its AIResponseOptions interface
//   - response-templates.ts ACTION_TO_MODE map still references ActionType
//   - tests and other callers may reference exported types
//
// Migration status:
//   - conversations.ts no longer calls resolveAction() — fully migrated
//   - ai.ts accepts actionDecision=null and handles gracefully
//   - NEXT STEP: remove ActionDecision from ai.ts AIResponseOptions, then
//     remove this module entirely
//
// Sits between intent classification and response generation.
// Resolves: what action to take, what to preserve, and whether to infer or ask.
// This is a pure function module — no DB calls, no AI calls, no side effects.

import { IntentResult } from "./intent";
import { ProgramStructure } from "./ai";
import { logger } from "./logger";

// ─── Types ────────────────────────────────────────────────────────────────────

export type ActionType =
  | "DIRECT_MUTATION"          // Atomic surgical edit (add calves, swap exercise, shorten)
  | "STRUCTURAL_REBUILD"       // Full architecture change (full body, upper/lower, 3 days)
  | "SESSION_ADJUSTMENT"       // Today's session change (readiness/pain context)
  | "ASK_CLARIFYING_QUESTION"  // Genuinely ambiguous — return question without calling AI
  | "GUIDANCE_ONLY"            // Coaching/conceptual answer, no program change
  | "PROGRAM_GENERATION"       // Build a new program
  | "PROGRAM_RETRIEVAL"        // Return existing program
  | "PROGRAM_SAVE";            // Save confirmation

export interface PreservationDecision {
  preserveGoal: boolean;
  preserveEquipment: boolean;
  preservePainLimitations: boolean;
  preserveSessionDuration: boolean;
  preserveProgressionStrategy: boolean;
  preserveKeyExercises: boolean;
  preserveSplitStructure: boolean;
  allowedChanges: string[];
  preservedCompoundLifts?: string[];
}

export interface ActionDecision {
  actionType: ActionType;
  shouldAsk: boolean;
  clarifyingQuestion?: string;
  preservationRules: PreservationDecision;
  inferenceRationale: string;
  targetDescription: string;
  recommendedMaxTokens: number;
}

// ─── Preset Preservation Rule Sets ────────────────────────────────────────────

const PRESERVE_ALL: Omit<PreservationDecision, "allowedChanges" | "preservedCompoundLifts"> = {
  preserveGoal: true,
  preserveEquipment: true,
  preservePainLimitations: true,
  preserveSessionDuration: true,
  preserveProgressionStrategy: true,
  preserveKeyExercises: true,
  preserveSplitStructure: true,
};

const PRESERVE_CORE_ALLOW_STRUCTURE: Omit<PreservationDecision, "allowedChanges" | "preservedCompoundLifts"> = {
  preserveGoal: true,
  preserveEquipment: true,
  preservePainLimitations: true,
  preserveSessionDuration: true,
  preserveProgressionStrategy: true,
  preserveKeyExercises: true,
  preserveSplitStructure: false,
};

const PRESERVE_PROFILE_ONLY: Omit<PreservationDecision, "allowedChanges" | "preservedCompoundLifts"> = {
  preserveGoal: true,
  preserveEquipment: true,
  preservePainLimitations: true,
  preserveSessionDuration: false,
  preserveProgressionStrategy: false,
  preserveKeyExercises: false,
  preserveSplitStructure: false,
};

// ─── Compound Lift Extractor ─────────────────────────────────────────────────

function extractCompoundLifts(program: ProgramStructure): string[] {
  const compoundPattern = /(squat|deadlift|bench|press|barbell row|weighted pull|chin.up|pull.up|power clean|hang clean|snatch|push press|front squat|trap bar|sumo|romanian|rdl)/i;
  const seen = new Set<string>();
  for (const day of program.days) {
    for (const ex of day.exercises) {
      if (compoundPattern.test(ex.name) || /primary|secondary/i.test(ex.classification ?? "")) {
        if (!seen.has(ex.name)) seen.add(ex.name);
      }
    }
  }
  return Array.from(seen).slice(0, 8);
}

// ─── Infer vs Ask Logic ───────────────────────────────────────────────────────
//
// The agent infers when: direction is clear, best move is obvious, low ambiguity risk
// The agent asks ONE question when: multiple materially different valid outcomes exist

function resolveStructuralEditAction(
  intent: IntentResult,
  program: ProgramStructure | null,
): Pick<ActionDecision, "actionType" | "shouldAsk" | "clarifyingQuestion" | "inferenceRationale"> {
  const meta = intent.metadata as {
    targetSplit?: string;
    targetDays?: number | null;
    targetGoalShift?: string | null;
  } | undefined;

  const targetSplit = meta?.targetSplit ?? "unknown";
  const targetDays = meta?.targetDays ?? null;
  const targetGoalShift = meta?.targetGoalShift ?? null;
  const currentDays = program?.days?.length ?? 4;

  // INFER: specific split type is clear
  if (targetSplit !== "unknown") {
    const splitLabels: Record<string, string> = {
      full_body: "full-body distribution",
      upper_lower: "upper/lower split",
      ppl: "push/pull/legs",
      push_pull: "push/pull",
    };
    return {
      actionType: "STRUCTURAL_REBUILD",
      shouldAsk: false,
      inferenceRationale: `Clear structural target identified: ${splitLabels[targetSplit] ?? targetSplit}. Executing rebuild.`,
    };
  }

  // INFER: explicit day count given — day change is unambiguous
  if (targetDays !== null && targetDays !== currentDays) {
    return {
      actionType: "STRUCTURAL_REBUILD",
      shouldAsk: false,
      inferenceRationale: `Explicit day count change from ${currentDays} to ${targetDays}. Executing rebuild.`,
    };
  }

  // INFER: goal shift is clear enough to act on
  if (targetGoalShift !== null) {
    return {
      actionType: "STRUCTURAL_REBUILD",
      shouldAsk: false,
      inferenceRationale: `Goal orientation shift detected: ${targetGoalShift}. Rebuilding with new orientation.`,
    };
  }

  // INFER: vague structural request — make a reasonable assumption and act
  // Per core rule: if direction is even loosely clear, act. Never loop on clarification.
  return {
    actionType: "STRUCTURAL_REBUILD",
    shouldAsk: false,
    inferenceRationale: "Vague structural request — inferring best reorganization based on current program and user profile. Proceeding with rebuild; user can refine after.",
  };
}

// ─── Core Decision Function ───────────────────────────────────────────────────

export function resolveAction(
  intent: IntentResult,
  program: ProgramStructure | null,
  message: string,
): ActionDecision {
  const currentDays = program?.days?.length ?? 0;
  const hasProgram = program !== null;
  const compoundLifts = hasProgram ? extractCompoundLifts(program) : [];

  switch (intent.type) {
    // ── Terminal paths — no AI needed ──────────────────────────────────────

    case "SAVE_PROGRAM":
      return {
        actionType: "PROGRAM_SAVE",
        shouldAsk: false,
        inferenceRationale: "Save intent detected. Returning save confirmation.",
        targetDescription: hasProgram ? `Current ${currentDays}-day program` : "No active program",
        preservationRules: {
          ...PRESERVE_ALL,
          allowedChanges: [],
          preservedCompoundLifts: compoundLifts,
        },
        recommendedMaxTokens: 300,
      };

    case "RETRIEVE_CURRENT_PROGRAM":
      return {
        actionType: "PROGRAM_RETRIEVAL",
        shouldAsk: false,
        inferenceRationale: "Retrieve intent detected. Returning current program.",
        targetDescription: hasProgram ? `Current ${currentDays}-day program` : "No program found",
        preservationRules: {
          ...PRESERVE_ALL,
          allowedChanges: [],
          preservedCompoundLifts: compoundLifts,
        },
        recommendedMaxTokens: 300,
      };

    // ── Session modifications ───────────────────────────────────────────────

    case "ADJUST_FOR_PAIN": {
      const bodyPart = (intent.metadata?.bodyPart as string) ?? "unspecified";
      return {
        actionType: "SESSION_ADJUSTMENT",
        shouldAsk: false,
        inferenceRationale: `Pain signal for ${bodyPart}. Modifying affected exercises while preserving program integrity.`,
        targetDescription: hasProgram ? `Current program — remove/replace ${bodyPart}-loading exercises` : "No program context",
        preservationRules: {
          ...PRESERVE_ALL,
          preserveSplitStructure: true,
          allowedChanges: [`exercises loading ${bodyPart.replace("_", " ")}`],
          preservedCompoundLifts: compoundLifts,
        },
        recommendedMaxTokens: 3500,
      };
    }

    case "ADJUST_FOR_READINESS": {
      const signal = (intent.metadata?.signal as string) ?? "general";
      const signalLabels: Record<string, string> = {
        poor_sleep: "poor sleep",
        high_fatigue: "high accumulated fatigue",
        illness: "illness",
        high_stress: "high stress",
        poor_recovery: "incomplete recovery",
        travel: "travel/disruption",
      };
      return {
        actionType: "SESSION_ADJUSTMENT",
        shouldAsk: false,
        inferenceRationale: `Readiness signal: ${signalLabels[signal] ?? signal}. Adjusting session intensity, not program structure.`,
        targetDescription: "Today's session only — program structure unchanged",
        preservationRules: {
          ...PRESERVE_ALL,
          allowedChanges: ["session intensity", "load prescription", "volume today"],
          preservedCompoundLifts: compoundLifts,
        },
        recommendedMaxTokens: 2000,
      };
    }

    // ── Program editing ─────────────────────────────────────────────────────

    case "EDIT_PROGRAM": {
      const editSubtype = intent.editSubtype ?? "general_modification";

      // Structural edits — full decision tree for infer-vs-ask
      if (editSubtype === "structural_edit") {
        const structuralDecision = resolveStructuralEditAction(intent, program);
        const meta = intent.metadata as { targetSplit?: string; targetDays?: number | null } | undefined;
        const targetSplit = meta?.targetSplit ?? "unknown";
        const targetDays = meta?.targetDays ?? null;

        return {
          ...structuralDecision,
          targetDescription: hasProgram
            ? `Current ${currentDays}-day program → ${targetSplit !== "unknown" ? targetSplit : targetDays ? `${targetDays} days` : "new structure"}`
            : "No program to restructure",
          preservationRules: {
            ...PRESERVE_CORE_ALLOW_STRUCTURE,
            allowedChanges: [
              "split type and day names",
              "exercise distribution across days",
              "accessory exercise selection",
              "day count" + (targetDays ? ` (target: ${targetDays})` : ""),
            ],
            preservedCompoundLifts: compoundLifts,
          },
          recommendedMaxTokens: 4500,
        };
      }

      // Program transformation — broad goal/focus shift across the whole program
      if (editSubtype === "program_transformation") {
        const direction = (intent.metadata?.direction as string) ?? "focus shift";
        return {
          actionType: "DIRECT_MUTATION",
          shouldAsk: false,
          inferenceRationale: `Program-wide transformation: ${direction}. Making real structural changes across multiple sessions using block-level edit engine.`,
          targetDescription: hasProgram
            ? `Entire ${currentDays}-day program — ${direction} transformation`
            : "No program to transform",
          preservationRules: {
            ...PRESERVE_PROFILE_ONLY,
            preserveKeyExercises: true,
            preserveSplitStructure: true,
            allowedChanges: [
              "rest intervals",
              "rep ranges and intensity zones",
              "exercise selection (accessories and secondary compounds)",
              "session emphasis and coaching notes",
              "conditioning blocks and energy system work",
              "phase goal and emphasis labels",
            ],
            preservedCompoundLifts: compoundLifts,
          },
          recommendedMaxTokens: 4500,
        };
      }

      // Atomic edits — high-confidence, specific changes
      const atomicSubtypes = new Set([
        "add_core", "add_hamstrings", "add_calves", "add_glutes",
        "add_upper_back", "add_shoulders", "add_conditioning",
        "swap_exercise", "remove_exercise",
      ]);

      const recoverySubtypes = new Set([
        "shorten_sessions", "lengthen_sessions", "reduce_fatigue", "reduce_frequency",
      ]);

      const volumeSubtypes = new Set([
        "increase_volume", "increase_frequency",
        "make_more_athletic", "make_more_strength", "make_more_hypertrophy",
      ]);

      if (atomicSubtypes.has(editSubtype)) {
        return {
          actionType: "DIRECT_MUTATION",
          shouldAsk: false,
          inferenceRationale: `Atomic edit: ${editSubtype}. Making surgical change — everything else preserved.`,
          targetDescription: hasProgram
            ? `Current ${currentDays}-day program — ${editSubtype.replace(/_/g, " ")}`
            : "Program not found",
          preservationRules: {
            ...PRESERVE_ALL,
            allowedChanges: [editSubtype.replace(/_/g, " ")],
            preservedCompoundLifts: compoundLifts,
          },
          recommendedMaxTokens: 4000,
        };
      }

      if (recoverySubtypes.has(editSubtype)) {
        return {
          actionType: "DIRECT_MUTATION",
          shouldAsk: false,
          inferenceRationale: `Recovery/load edit: ${editSubtype}. Reducing lowest-priority work first, primary lifts untouched.`,
          targetDescription: `All sessions — ${editSubtype.replace(/_/g, " ")}`,
          preservationRules: {
            ...PRESERVE_ALL,
            allowedChanges: ["accessory exercise volume", "conditioning block", "session length"],
            preservedCompoundLifts: compoundLifts,
          },
          recommendedMaxTokens: 4000,
        };
      }

      if (volumeSubtypes.has(editSubtype)) {
        return {
          actionType: "DIRECT_MUTATION",
          shouldAsk: false,
          inferenceRationale: `Volume/orientation edit: ${editSubtype}. Adjusting emphasis while preserving base structure.`,
          targetDescription: `Current program — ${editSubtype.replace(/_/g, " ")}`,
          preservationRules: {
            ...PRESERVE_ALL,
            preserveSplitStructure: false,
            allowedChanges: ["exercise emphasis", "accessory selection", "explosive block"],
            preservedCompoundLifts: compoundLifts,
          },
          recommendedMaxTokens: 4000,
        };
      }

      // General modification — let AI handle with program context
      if (!hasProgram) {
        return {
          actionType: "GUIDANCE_ONLY",
          shouldAsk: false,
          inferenceRationale: "General modification requested but no active program found. Providing guidance.",
          targetDescription: "No program in context",
          preservationRules: {
            ...PRESERVE_PROFILE_ONLY,
            allowedChanges: ["everything — no program to preserve"],
          },
          recommendedMaxTokens: 2000,
        };
      }

      return {
        actionType: "DIRECT_MUTATION",
        shouldAsk: false,
        inferenceRationale: "General modification with active program. AI will infer the best surgical change.",
        targetDescription: `Current ${currentDays}-day program — general modification`,
        preservationRules: {
          ...PRESERVE_ALL,
          allowedChanges: ["AI-inferred specific element"],
          preservedCompoundLifts: compoundLifts,
        },
        recommendedMaxTokens: 4000,
      };
    }

    // ── New program generation ──────────────────────────────────────────────

    case "START_NEW_PROGRAM":
    case "CREATE_PROGRAM":
      return {
        actionType: "PROGRAM_GENERATION",
        shouldAsk: false,
        inferenceRationale: intent.type === "START_NEW_PROGRAM"
          ? "User explicitly wants a fresh start. Discarding current program."
          : "Program creation request. Building from profile.",
        targetDescription: "New program — built from profile",
        preservationRules: {
          ...PRESERVE_PROFILE_ONLY,
          allowedChanges: ["all program structure — fresh build"],
        },
        recommendedMaxTokens: 4500,
      };

    // ── Coaching guidance ───────────────────────────────────────────────────

    case "GENERAL_COACHING_QUESTION":
    default:
      return {
        actionType: "GUIDANCE_ONLY",
        shouldAsk: false,
        inferenceRationale: "Coaching/conceptual question. Answering directly — no program mutation.",
        targetDescription: "No program target — conceptual response",
        preservationRules: {
          ...PRESERVE_ALL,
          allowedChanges: [],
          preservedCompoundLifts: compoundLifts,
        },
        recommendedMaxTokens: 2000,
      };
  }
}

// ─── Preservation Context Builder ────────────────────────────────────────────
// Injects a preservation requirements block into the AI system prompt

export function buildPreservationContext(
  rules: PreservationDecision,
  actionType: ActionType,
): string {
  if (actionType === "GUIDANCE_ONLY" || actionType === "PROGRAM_GENERATION" ||
      actionType === "PROGRAM_RETRIEVAL" || actionType === "PROGRAM_SAVE") {
    return "";
  }

  const preserved: string[] = [];
  const allowed = rules.allowedChanges;

  if (rules.preserveGoal) preserved.push("training goal");
  if (rules.preserveEquipment) preserved.push("equipment constraints");
  if (rules.preservePainLimitations) preserved.push("injury/limitation restrictions");
  if (rules.preserveSessionDuration) preserved.push("session duration target");
  if (rules.preserveProgressionStrategy) preserved.push("progression model");
  if (rules.preserveKeyExercises && rules.preservedCompoundLifts?.length) {
    preserved.push(`compound lifts (${rules.preservedCompoundLifts.slice(0, 5).join(", ")})`);
  }
  if (rules.preserveSplitStructure) preserved.push("split structure and day names");

  if (preserved.length === 0 && allowed.length === 0) return "";

  const lines: string[] = ["## PRESERVATION REQUIREMENTS"];
  if (preserved.length > 0) {
    lines.push(`**Must preserve:** ${preserved.join(", ")}`);
  }
  if (allowed.length > 0) {
    lines.push(`**Allowed to change:** ${allowed.join(", ")}`);
  }

  return lines.join("\n");
}

// ─── Decision Logging ─────────────────────────────────────────────────────────

export function logDecisionSummary(
  message: string,
  intent: IntentResult,
  decision: ActionDecision,
  hasProgram: boolean,
): void {
  logger.info(
    {
      intent: intent.type,
      intentConfidence: intent.confidence,
      editSubtype: intent.editSubtype ?? null,
      actionType: decision.actionType,
      shouldAsk: decision.shouldAsk,
      targetDescription: decision.targetDescription,
      preserved: {
        goal: decision.preservationRules.preserveGoal,
        equipment: decision.preservationRules.preserveEquipment,
        keyExercises: decision.preservationRules.preserveKeyExercises,
        splitStructure: decision.preservationRules.preserveSplitStructure,
        compoundLifts: decision.preservationRules.preservedCompoundLifts ?? [],
      },
      allowedChanges: decision.preservationRules.allowedChanges,
      inferenceRationale: decision.inferenceRationale,
      hasActiveProgram: hasProgram,
      maxTokens: decision.recommendedMaxTokens,
      messagePreview: message.slice(0, 80),
    },
    "[DecisionTree] Resolved action"
  );
}
