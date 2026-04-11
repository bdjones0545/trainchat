/**
 * Neural Graph Interpreter — Training Intelligence Layer
 *
 * Reads a user's neural graph state and produces:
 * 1. A NeuralBias object — structured signal for programming decisions
 * 2. Detected imbalances — qualitative coaching observations
 * 3. Adjustment explanations — human-readable coaching language
 * 4. A promptContext string — injected into the AI system prompt
 *
 * This module is purely functional. No DB calls.
 * It is the bridge between the graph (what training has been done)
 * and the program (what training should be done next).
 *
 * All user-facing language is coaching/science-based only.
 * Node names are referred to by their quality, not by scores.
 */

import type { ProgramStructure, ProgramDay, Exercise } from "./ai";

// ─── Graph types (mirrors neural-profile-service.ts) ────────────────────────

export interface GraphNode {
  id: string;
  activationLevel: number; // 0-1
}

export interface GraphConnection {
  from: string;
  to: string;
  strength: number; // 0-1
  lastReinforced: string;
}

export interface GraphState {
  nodes: GraphNode[];
  connections: GraphConnection[];
  version: number;
}

// ─── Bias output ──────────────────────────────────────────────────────────────

/**
 * Programming bias derived from graph state.
 * All values 0-1. Higher = more emphasis needed.
 * These drive post-hoc program adjustments.
 */
export interface NeuralBias {
  /** Add more power/explosive work — power pathway is underdeveloped */
  powerBias: number;
  /** Prioritize anti-rotation and bracing — trunk is the weak link */
  trunkBias: number;
  /** Reduce volume, protect recovery — user's recovery capacity is constrained */
  recoveryBias: number;
  /** Simplify program structure — consistency needs to be de-risked */
  simplicityBias: number;
  /** Emphasize strength loading — strength foundation is weak */
  strengthBias: number;
  /** Shift emphasis toward lower body structural work */
  lowerBodyBias: number;
  /** Shift emphasis toward upper body structural work */
  upperBodyBias: number;
  /** Whether any meaningful bias exists at all */
  isActive: boolean;
}

// ─── Imbalance detection ──────────────────────────────────────────────────────

export interface Imbalance {
  code: string;
  description: string;
  adjustment: string;
}

// ─── Full interpretation result ───────────────────────────────────────────────

export interface NeuralInterpretation {
  bias: NeuralBias;
  imbalances: Imbalance[];
  adjustments: string[];        // Applied adjustment explanations (coaching language)
  promptContext: string;        // Injected into the AI system prompt
  hasMeaningfulData: boolean;   // false if the user has no/very few sessions
}

// ─── Node activation lookup ───────────────────────────────────────────────────

function getActivation(nodes: GraphNode[], nodeId: string): number {
  return nodes.find((n) => n.id === nodeId)?.activationLevel ?? 0;
}

// ─── Main interpreter ─────────────────────────────────────────────────────────

const BIAS_THRESHOLD_WEAK = 0.25;    // Activation below this → strong bias to develop
const BIAS_THRESHOLD_MODERATE = 0.5; // Activation below this → moderate bias

export function interpretNeuralGraph(graphState: GraphState | null | undefined): NeuralInterpretation {
  const empty: NeuralInterpretation = {
    bias: {
      powerBias: 0, trunkBias: 0, recoveryBias: 0,
      simplicityBias: 0, strengthBias: 0,
      lowerBodyBias: 0, upperBodyBias: 0,
      isActive: false,
    },
    imbalances: [],
    adjustments: [],
    promptContext: "",
    hasMeaningfulData: false,
  };

  if (!graphState || !graphState.nodes || graphState.nodes.length === 0) return empty;

  const nodes = graphState.nodes;

  const power       = getActivation(nodes, "power");
  const trunk       = getActivation(nodes, "trunk");
  const recovery    = getActivation(nodes, "recovery");
  const consistency = getActivation(nodes, "consistency");
  const strength    = getActivation(nodes, "strength");
  const lowerBody   = getActivation(nodes, "lower_body");
  const upperBody   = getActivation(nodes, "upper_body");
  const movQuality  = getActivation(nodes, "movement_quality");

  // If everything is at zero, no sessions have been logged — no meaningful data
  const totalActivation = nodes.reduce((sum, n) => sum + n.activationLevel, 0);
  if (totalActivation < 0.05) return empty;

  // ── Compute biases ──────────────────────────────────────────────────────
  // Bias scale: 0.0 = no emphasis needed, 1.0 = max emphasis needed
  // Inverted: low activation → high bias

  function toBias(activation: number): number {
    if (activation >= BIAS_THRESHOLD_MODERATE) return 0;
    if (activation >= BIAS_THRESHOLD_WEAK) return 0.5;
    return 0.9;
  }

  const powerBias     = toBias(power);
  const trunkBias     = toBias(trunk);
  const recoveryBias  = recovery < BIAS_THRESHOLD_WEAK ? 0.85 : 0;
  const simplicityBias = consistency < BIAS_THRESHOLD_WEAK ? 0.8 : consistency < 0.35 ? 0.4 : 0;
  const strengthBias  = toBias(strength);
  const lowerBodyBias = toBias(lowerBody);
  const upperBodyBias = toBias(upperBody);

  const isActive = powerBias > 0.4 || trunkBias > 0.4 || recoveryBias > 0.4 ||
    simplicityBias > 0.4 || strengthBias > 0.4;

  const bias: NeuralBias = {
    powerBias, trunkBias, recoveryBias,
    simplicityBias, strengthBias,
    lowerBodyBias, upperBodyBias,
    isActive,
  };

  // ── Detect imbalances ───────────────────────────────────────────────────
  const imbalances: Imbalance[] = [];

  if (lowerBody > 0.5 && trunk < BIAS_THRESHOLD_WEAK) {
    imbalances.push({
      code: "lower_trunk_gap",
      description: "Lower body output is developing ahead of trunk stability",
      adjustment: "Add anti-rotation and bracing work to support force transfer through the trunk",
    });
  }
  if (strength > 0.5 && power < BIAS_THRESHOLD_WEAK) {
    imbalances.push({
      code: "strength_power_gap",
      description: "Strength capacity is ahead of power expression",
      adjustment: "Shift emphasis toward rate of force development — more explosive work",
    });
  }
  if (strength > 0.4 && movQuality < BIAS_THRESHOLD_WEAK) {
    imbalances.push({
      code: "strength_quality_gap",
      description: "Strength loading outpacing movement quality",
      adjustment: "Reduce intensity on primary lifts, prioritize technical quality",
    });
  }
  if (consistency < BIAS_THRESHOLD_WEAK && strength > 0.3) {
    imbalances.push({
      code: "adherence_risk",
      description: "Training load inconsistency is limiting adaptation signal",
      adjustment: "Simplify structure — fewer variables, higher consistency rate",
    });
  }
  if (upperBody > 0.5 && lowerBody < BIAS_THRESHOLD_WEAK) {
    imbalances.push({
      code: "upper_lower_gap",
      description: "Upper body output developing faster than lower body foundation",
      adjustment: "Increase lower body structural work and hinge loading",
    });
  }

  // ── Build adjustment explanations ──────────────────────────────────────
  const adjustments: string[] = [];

  if (powerBias > 0.4) {
    adjustments.push(
      power < BIAS_THRESHOLD_WEAK
        ? "Added additional power development work — power pathway is in early formation."
        : "Expanded explosive work exposure — power is developing but needs more volume.",
    );
  }
  if (trunkBias > 0.4) {
    adjustments.push(
      trunk < BIAS_THRESHOLD_WEAK
        ? "Added trunk stability work — trunk pathway is underactivated relative to other qualities."
        : "Increased anti-rotation emphasis — trunk stability is progressing but lagging.",
    );
  }
  if (recoveryBias > 0.4) {
    adjustments.push("Reduced session volume — recovery capacity is constrained based on training patterns.");
  }
  if (simplicityBias > 0.4) {
    adjustments.push("Simplified program structure — adherence consistency takes priority over complexity.");
  }
  if (imbalances.find((i) => i.code === "lower_trunk_gap")) {
    adjustments.push("Repositioned trunk work to earlier in session — improving force transfer efficiency.");
  }
  if (imbalances.find((i) => i.code === "strength_power_gap")) {
    adjustments.push("Shifting emphasis toward explosive work — converting strength into power output.");
  }

  // ── Build prompt context for AI ────────────────────────────────────────
  const nodeStatus = (activation: number): string => {
    if (activation >= 0.6) return "well-developed";
    if (activation >= 0.35) return "developing";
    if (activation >= BIAS_THRESHOLD_WEAK) return "early stage";
    return "needs focus";
  };

  const promptLines: string[] = [
    "## Neural Adaptation Profile",
    "",
    "The following represents the user's training adaptation state based on logged sessions.",
    "Use this to inform programming decisions. Do not expose scores or percentages to the user.",
    "Refer only to observed patterns in coaching language.",
    "",
    "**Training pathway status:**",
    `- Strength: ${nodeStatus(strength)}`,
    `- Power: ${nodeStatus(power)}`,
    `- Movement Quality: ${nodeStatus(movQuality)}`,
    `- Trunk Stability: ${nodeStatus(trunk)}`,
    `- Recovery: ${nodeStatus(recovery)}`,
    `- Lower Body Output: ${nodeStatus(lowerBody)}`,
    `- Upper Body Output: ${nodeStatus(upperBody)}`,
    `- Consistency: ${nodeStatus(consistency)}`,
  ];

  if (imbalances.length > 0) {
    promptLines.push("", "**Detected imbalances:**");
    imbalances.forEach((im) => {
      promptLines.push(`- ${im.description} → ${im.adjustment}`);
    });
  }

  if (adjustments.length > 0) {
    promptLines.push("", "**Programming guidance (apply silently — explain in coach language, not scores):**");
    adjustments.forEach((adj) => promptLines.push(`- ${adj}`));
  }

  if (powerBias > 0.4) {
    promptLines.push("- Include at least one dedicated explosive movement per session (jumps, throws, medicine ball) — position early in session before fatigue.");
  }
  if (trunkBias > 0.4) {
    promptLines.push("- Include anti-rotation or bracing work (Pallof Press, Dead Bug, Copenhagen Plank) — place earlier in session structure (blocks D-E rather than F).");
  }
  if (recoveryBias > 0.4) {
    promptLines.push("- Reduce total exercise count per session by 1-2. Prioritize compound movements. Remove conditioning work if present.");
  }
  if (simplicityBias > 0.4) {
    promptLines.push("- Keep session structure simple: fewer exercise variations, same movements each session, clear rep targets.");
  }

  const promptContext = promptLines.join("\n");

  return {
    bias,
    imbalances,
    adjustments,
    promptContext,
    hasMeaningfulData: true,
  };
}

// ─── Post-hoc program adapter ─────────────────────────────────────────────────

/**
 * Applies neural bias adjustments to an already-built ProgramStructure.
 * This is the clean way to layer neural intelligence on top of any program
 * (both fallback-generated and AI-generated) without touching the builders.
 *
 * Returns the adapted program and a list of coaching-language explanations
 * of what was changed (suitable for the change log and user display).
 */
export function applyNeuralBiasToProgram(
  program: ProgramStructure,
  bias: NeuralBias,
  imbalances: Imbalance[],
): { adapted: ProgramStructure; changeLog: string[] } {
  if (!bias.isActive) return { adapted: program, changeLog: [] };

  const changeLog: string[] = [];

  const adaptedDays = program.days.map((day, dayIdx) => {
    const exercises = [...day.exercises];

    // ── Recovery: remove last conditioning exercise ──────────────────────
    if (bias.recoveryBias > 0.6 && exercises.length > 4) {
      const lastIdx = exercises.length - 1;
      const last = exercises[lastIdx];
      if (last.classification === "Conditioning" || last.classification === "Capacity") {
        exercises.splice(lastIdx, 1);
        if (dayIdx === 0) {
          changeLog.push("Reduced session volume based on recovery pathway — removed conditioning work to protect adaptation capacity.");
        }
      }
    }

    // ── Simplicity: remove lowest-priority accessory if adherence is low ─
    if (bias.simplicityBias > 0.65 && exercises.length > 5) {
      const accessoryIdx = exercises.slice().reverse()
        .findIndex((ex) => ex.classification === "Accessory" || ex.classification === "Isolation");
      if (accessoryIdx !== -1) {
        const realIdx = exercises.length - 1 - accessoryIdx;
        exercises.splice(realIdx, 1);
        if (dayIdx === 0) {
          changeLog.push("Simplified session structure to support consistency — removed lower-priority accessory work.");
        }
      }
    }

    // ── Power: add a second power movement if only one exists ────────────
    if (bias.powerBias > 0.55) {
      const powerExercises = exercises.filter((e) => e.classification === "Power");
      const firstPowerIdx = exercises.findIndex((e) => e.classification === "Power");

      if (powerExercises.length < 2 && firstPowerIdx !== -1) {
        const powerOptions = [
          {
            name: dayIdx % 3 === 0 ? "Medicine Ball Overhead Scoop Toss" : dayIdx % 3 === 1 ? "Lateral Bound" : "Broad Jump",
            classification: "Power" as const,
            sets: 3,
            reps: "3-4",
            rest: "2-3 min",
            intent: "Rate of force development — maximum intent on every repetition. Reset fully between reps.",
            notes: "Neural quality work — this is about speed of force expression, not fatigue accumulation.",
          },
        ];
        const addition = powerOptions[0];
        // Check it's not already present
        if (!exercises.some((e) => e.name === addition.name)) {
          exercises.splice(firstPowerIdx + 1, 0, addition);
          if (dayIdx === 0) {
            changeLog.push("Added additional power development work — explosive pathway needs more exposure to develop rate of force production.");
          }
        }
      }
    }

    // ── Trunk: add a second trunk exercise, earlier in session ───────────
    if (bias.trunkBias > 0.55) {
      const trunkExercises = exercises.filter((e) => e.classification === "Trunk");

      // Ensure at least one trunk exercise exists and increase its sets
      if (trunkExercises.length === 1) {
        const trunkIdx = exercises.findIndex((e) => e.classification === "Trunk");
        if (trunkIdx !== -1) {
          exercises[trunkIdx] = { ...exercises[trunkIdx], sets: Math.min(4, (exercises[trunkIdx].sets ?? 3) + 1) };
        }
      }

      // If the only trunk exercise is at the very end, add an anti-rotation one earlier
      if (trunkExercises.length < 2) {
        const trunkAddition: Exercise = {
          name: dayIdx % 2 === 0 ? "Pallof Press" : "Dead Bug",
          classification: "Trunk",
          sets: 3,
          reps: dayIdx % 2 === 0 ? "10 each side" : "8 each side",
          rest: "60 sec",
          intent: dayIdx % 2 === 0
            ? "Anti-rotation under load — resist the pull, stay tall. Trunk stability anchors all force transfer."
            : "Anti-extension with full lumbar contact — lower back stays flat throughout. Quality over quantity.",
          notes: dayIdx % 2 === 0
            ? "Added to address trunk stability development — anti-rotation is the highest-value trunk pattern for force transfer."
            : "Added to reinforce trunk stability pathway — spinal stiffness quality is the limiting factor for compound movement efficiency.",
        };
        if (!exercises.some((e) => e.name === trunkAddition.name)) {
          // Insert at 2/3 through the session rather than the end
          const insertAt = Math.max(3, Math.floor(exercises.length * 0.65));
          exercises.splice(insertAt, 0, trunkAddition);
          if (dayIdx === 0) {
            changeLog.push("Added trunk stability work and repositioned it earlier — improving force transfer and addressing the largest pathway gap.");
          }
        }
      }
    }

    return { ...day, exercises };
  });

  // ── Append imbalance notes to program description ─────────────────────
  let description = program.description;
  if (imbalances.length > 0 && changeLog.length > 0) {
    const imbalanceNote = changeLog.slice(0, 2).map((c) => c.split(" — ")[0]).join(". ");
    description = `${description} ${imbalanceNote}.`;
  }

  return {
    adapted: { ...program, days: adaptedDays, description },
    changeLog,
  };
}

// ─── Change log summary builder ───────────────────────────────────────────────

/**
 * Returns a single coaching-language summary for the change log
 * when neural bias is applied during program generation.
 */
export function buildNeuralAdjustmentSummary(
  adjustments: string[],
  imbalances: Imbalance[],
): string {
  if (adjustments.length === 0 && imbalances.length === 0) return "";

  const parts: string[] = [];
  if (adjustments.length > 0) parts.push(...adjustments.slice(0, 2));
  if (imbalances.length > 0 && parts.length < 2) {
    parts.push(`Imbalance detected: ${imbalances[0].description.toLowerCase()}.`);
  }

  return parts.join(" ");
}
