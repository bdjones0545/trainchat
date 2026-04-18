// ─── Program Architecture Engine ─────────────────────────────────────────────
//
// Implements CNS-driven, movement-based program architecture per the spec:
//   1. Define weekly architecture
//   2. Define session intent
//   3. Allocate movement patterns
//   4. Sequence CNS flow
//   5. Select exercises — pre-selected via exercise-variation-engine,
//      injected into Architecture Brief as prescriptions (not options)
//
// The engine generates a structured "Architecture Brief" that is injected
// into the AI system prompt, ensuring every generated program follows elite
// strength & conditioning principles.
// ─────────────────────────────────────────────────────────────────────────────

import {
  selectSlotExercises,
  buildVariationMandate,
  buildLowerPowerDescription,
  buildSquatPrimaryDescription,
  buildHingePrimaryDescription,
  buildUnilateralDescription,
  buildTrunkDescription,
  buildUpperPushDescription,
  buildUpperPullDescription,
  buildRotationalPowerDescription,
  selectPrepDescription,
  getDayPowerExercise,
  type SlotExerciseSelection,
  type BlockSelectionContext,
} from "./exercise-variation-engine";
// getBlockVariant / describeBlockVariant are used inside buildVariationMandate — no direct call needed here

import {
  detectSpecialPopulation,
  buildSpecialPopArchitectureBrief,
} from "./special-populations-engine";

import {
  buildMonthlyBlockPlan,
  buildMonthlyBlockContext,
  type MonthlyBlockPlan,
} from "./monthly-block-planner";

import {
  buildWeeklyBlockPlans,
  buildWeeklyBlockContext,
  type WeeklyBlockPlan,
} from "./weekly-block-planner";

import { selectBlockAndSplit, archetypeToMonthlyBlockType } from "./programs/blockScoring";
import { buildFingerprint, recordFingerprint, computeSimilarity, getRecentFingerprints, logSimilarityResult } from "./programs/similarity";
import { emitBlockRulesAudit, buildFingerprintString, generateAuditId } from "./programs/blockRulesAudit";
import { validateArchetypeCoherence } from "./programs/blockArchetypes";
import { validateSplitArchitectures } from "./programs/splitArchitectures";
import { buildProgramContextProfile } from "./programs/programContextProfile";
import type { AgentControlDirectives } from "./programs/agentControlTypes";
import { buildExtendedFingerprint } from "./programs/programFingerprint";
import { runProgramVarianceAudit } from "./programs/programVarianceAudit";
import { emitRerollLog } from "./programs/programVarianceReroll";
import { runPerceivedVarianceAudit } from "./programs/perceivedVarianceAudit";

// ─── One-time validation on module load ──────────────────────────────────────
// DEV-only coherence checks fire once per process start.
if (process.env.NODE_ENV !== "production") {
  validateArchetypeCoherence();
  validateSplitArchitectures();
}

// ─── Types ───────────────────────────────────────────────────────────────────

export type NeuralDemand = "high" | "moderate" | "low";

export type MovementPattern =
  | "squat"
  | "hinge"
  | "unilateral_lower"
  | "upper_push"
  | "upper_pull"
  | "trunk"
  | "power"
  | "lateral"
  | "rotational"
  | "locomotion";

export interface CNSBlock {
  role: "prep" | "power" | "primary" | "secondary" | "unilateral" | "trunk" | "finisher";
  description: string;
}

export interface SessionArchitecture {
  dayNumber: number;
  identity: string;
  intent: string;
  neuralDemand: NeuralDemand;
  primaryPattern: MovementPattern;
  emphasizedPatterns: MovementPattern[];
  cnsFlow: CNSBlock[];
  sportNotes?: string;
}

export interface MovementAllocation {
  squat: number;
  hinge: number;
  unilateral_lower: number;
  upper_push: number;
  upper_pull: number;
  trunk: number;
  power: number;
  lateral?: number;
  rotational?: number;
}

export interface WeeklyArchitecture {
  daysPerWeek: number;
  sport: string | null;
  goal: string | null;
  sessions: SessionArchitecture[];
  movementAllocation: MovementAllocation;
  weeklyRhythm: string;
  recoveryNotes: string;
}

// ─── Standard CNS flow ───────────────────────────────────────────────────────
//
// blockArchetype drives STRUCTURAL slot composition — which blocks exist, not
// just which exercises fill them. This is the primary fix for the "same day
// template" collapse problem.
//
// INTENSIFICATION_STRENGTH  → fewer slots (no unilateral), brief power primer
// POWER_ELASTIC_CONVERSION  → elastic/reactive slot leads, contrast structure
// WORK_CAPACITY / FOUNDATION_ACCUMULATION → full stack + conditioning finisher
// Default                    → standard 5-block template (unchanged)

function buildCNSFlow(
  patterns: MovementPattern[],
  neuralDemand: NeuralDemand,
  sel?: SlotExerciseSelection,
  blockArchetype?: string,
): CNSBlock[] {
  const blocks: CNSBlock[] = [];
  const isHingeDay = patterns.includes("hinge") && !patterns.includes("squat");
  const isLowerSession = patterns.includes("squat") || patterns.includes("hinge") || patterns.includes("unilateral_lower");

  // ── INTENSIFICATION_STRENGTH structural template ───────────────────────────
  // Fewer total blocks. Power is a brief CNS primer, not full development.
  // Unilateral block is removed — session density is managed by load, not volume.
  if (blockArchetype === "INTENSIFICATION_STRENGTH" && isLowerSession) {
    blocks.push({
      role: "prep",
      description: "Intensification lower prep: hip CARs, thoracic extension, glute activation — 6–8 min. QUALITY over duration. CNS must be fresh.",
    });
    if (neuralDemand !== "low") {
      blocks.push({
        role: "power",
        description: sel
          ? `CNS POTENTIATION PRIMER (not full power development): 2–3 sets × 3 reps of ${sel.lower_power} at sub-maximal intent. Goal: prime neural drive for the heavy compound. REST FULLY before primary lift.`
          : "CNS POTENTIATION PRIMER: 2–3 sets × 3 sub-maximal vertical jumps — primes neural drive, NOT a full power development block. Full rest before primary lift.",
      });
    }
    blocks.push({
      role: "primary",
      description: sel
        ? buildSquatPrimaryDescription(sel).replace("3–5", "2–4") + " INTENSIFICATION: fewer reps, heavier load, maximum bar speed on concentric."
        : patterns.includes("squat")
          ? "PRIMARY BILATERAL SQUAT — INTENSIFICATION: Heavy bilateral squat (4–5 × 2–4 @ 83–92%). Maximum load, controlled eccentric, explosive concentric. This IS the session."
          : "PRIMARY BILATERAL HINGE — INTENSIFICATION: Heavy deadlift pattern (4 × 2–4 @ 83–90%). Every rep is deliberate — reset, breathe, maximum engagement.",
    });
    blocks.push({
      role: "secondary",
      description: sel
        ? (isHingeDay
          ? `Secondary: ${sel.unilateral_lower} — load-matched single-leg complement (3 × 5–6). Reinforces the primary pattern demand.`
          : `Secondary: ${sel.bilateral_hinge_strength} — heavy posterior chain complement (3 × 5–6 @ ~75–80%). Keeps posterior chain engaged.`)
        : patterns.includes("squat")
          ? "Secondary: Heavy Romanian Deadlift (3 × 5–6 @ ~75–80%) — posterior chain complement to the heavy squat. NOT a hypertrophy accessory."
          : "Secondary: Heavy single-leg RDL (3 × 5–6 per side) — unilateral posterior chain integrity after heavy bilateral hinge.",
    });
    blocks.push({
      role: "trunk",
      description: sel
        ? buildTrunkDescription(sel, patterns.includes("rotational"))
        : "TRUNK INTEGRITY (Intensification): Pallof press variant paired with ab wheel rollout. 2–3 sets only. Trunk work is the session close — brief and structural.",
    });
    return blocks;
  }

  // ── POWER_ELASTIC_CONVERSION structural template ──────────────────────────
  // Elastic/reactive work IS the session anchor. Bilateral compound is the
  // contrast vehicle — it potentiates the reactive work, not the other way around.
  // No secondary compound. No unilateral block. Structure is inverted vs default.
  if (blockArchetype === "POWER_ELASTIC_CONVERSION" && isLowerSession) {
    blocks.push({
      role: "prep",
      description: "Reactive power prep: ankle mobility → pogo hop series (2 × 10 sub-max) → 2 × 3 approach jump to box — activating the stretch-shortening cycle before loading.",
    });
    blocks.push({
      role: "power",
      description: sel
        ? `ELASTIC/REACTIVE BLOCK (PRIMARY OUTPUT): ${sel.elastic_power} — minimum contact time, maximum stiffness. Then ${sel.lower_power} — maximum velocity expression. 3–4 sets × 4–5 reps each. FULL REST between sets (2–3 min). THIS is the session's primary training goal.`
        : "ELASTIC/REACTIVE BLOCK (PRIMARY OUTPUT): Reactive bound series → hurdle hop series — minimum ground contact time, maximum stiffness output. THEN: maximum-displacement jump (horizontal). 3–4 sets × 4–5 reps. Full rest between every set. THIS is the session's primary training goal.",
    });
    blocks.push({
      role: "primary",
      description: sel
        ? `CONTRAST POTENTIATION COMPOUND: ${sel.bilateral_squat_strength || sel.bilateral_hinge_strength} at 65–78% — VELOCITY INTENT on every concentric. This lift potentiates the reactive work above, it is NOT a strength accumulation exercise. 4 × 3–5 reps, max bar speed.`
        : patterns.includes("squat")
          ? "CONTRAST POTENTIATION COMPOUND: Bilateral squat variant at 65–78% — EXPLOSIVE INTENT on concentric. This is the contrast vehicle for the elastic work, not a strength accumulation session. 4 × 3–5 explosive reps."
          : "CONTRAST POTENTIATION COMPOUND: Bilateral hinge variant at 65–78% — ballistic hip extension intent. Speed-strength expression, not grinding maximal load. 4 × 3–4 reps.",
    });
    blocks.push({
      role: "trunk",
      description: sel
        ? buildTrunkDescription(sel, patterns.includes("rotational"))
        : "Reactive trunk close: anti-rotation + lateral stability — 2 sets each, brief. Trunk work is the session close, NOT the session anchor.",
    });
    return blocks;
  }

  // ── REBUILD_DELOAD structural template ────────────────────────────────────
  // Fewer blocks. No power block. No secondary compound. Deload density only.
  // This must look structurally distinct from FOUNDATION_ACCUMULATION every time.
  if (blockArchetype === "REBUILD_DELOAD") {
    blocks.push({
      role: "prep",
      description: "Deload prep: 8–10 min light dynamic mobility — tissue quality, not CNS activation. Move through ranges without approaching mechanical limits.",
    });
    if (isLowerSession) {
      blocks.push({
        role: "primary",
        description: sel
          ? `DELOAD LOWER: ${patterns.includes("squat") ? sel.bilateral_squat_strength : sel.bilateral_hinge_strength} at 50–60% 1RM, 3 × 5 reps. Movement quality only — no grinding, no fatigue accumulation. This is NOT a training stimulus session.`
          : "DELOAD LOWER: Primary squat or hinge pattern at 50–60% 1RM, 3 × 5 reps — movement reinforcement, not loading. Bar speed should feel easy.",
      });
      blocks.push({
        role: "unilateral",
        description: sel
          ? `Deload single-leg: ${sel.unilateral_lower} at bodyweight or very light load (3 × 6 each side). Positional quality and joint health, not strength training.`
          : "Deload single-leg: split squat or step-up at bodyweight or very light load — positional quality and tissue care only.",
      });
    } else {
      blocks.push({
        role: "primary",
        description: "DELOAD UPPER: Primary press at 50–60% 1RM, 3 × 5 reps. Easy bar speed. Shoulder health and thoracic mobility as the session priority, not load.",
      });
      blocks.push({
        role: "secondary",
        description: sel
          ? `Deload pull: ${sel.upper_pull_primary ?? "cable row or face pull"} at very light load (3 × 8 reps). Tissue quality and scapular positioning.`
          : "Deload pull: cable row or face pull at very light load (3 × 8 reps) — scapular care and shoulder health.",
      });
    }
    blocks.push({
      role: "trunk",
      description: "Deload trunk: dead bug (3 × 8) + 90/90 breathing (3 × 5 breaths per side) — parasympathetic recovery, not high-tension abdominal work. Brief and restorative.",
    });
    return blocks;
  }

  // ── WORK_CAPACITY / FOUNDATION_ACCUMULATION structural template ──────────
  // Full slot stack. Conditioning finisher is present regardless of neural demand.
  // Volume and density are the primary training stimuli.
  const isWorkCapacity = blockArchetype === "WORK_CAPACITY_BLOCK" || blockArchetype === "FOUNDATION_ACCUMULATION";

  // ─── Standard 5-6 block template (default + work capacity) ────────────────

  blocks.push({
    role: "prep",
    description: patterns.includes("squat") || patterns.includes("unilateral_lower") || patterns.includes("hinge")
      ? "Lower-body neural prep: hip CARs, glute activation, ankle stiffness series"
      : patterns.includes("upper_push") || patterns.includes("upper_pull")
        ? "Upper-body neural prep: scapular positioning, wall slides, thoracic mobility, shoulder activation"
        : "Full-body dynamic prep: leg swings, inchworm + reach, hip circles, trunk brace activation",
  });

  if (neuralDemand !== "low") {
    const hasPowerPattern = patterns.includes("lateral") || patterns.includes("rotational");
    const hasLowerPattern = patterns.includes("squat") || patterns.includes("unilateral_lower");
    const hasHinge = patterns.includes("hinge");

    if (sel) {
      if (hasPowerPattern && patterns.includes("rotational")) {
        blocks.push({ role: "power", description: buildRotationalPowerDescription(sel) });
      } else if (hasLowerPattern || hasHinge) {
        blocks.push({ role: "power", description: buildLowerPowerDescription(sel, neuralDemand) });
      } else {
        blocks.push({ role: "power", description: `Med ball power: ${sel.rotational_power} or chest throw (3–4 sets × 3–5 reps)` });
      }
    } else {
      blocks.push({
        role: "power",
        description: hasPowerPattern
          ? "Lateral/rotational power: lateral bound, med ball rotational throw, or reactive sprint mechanic drill"
          : hasLowerPattern
            ? "Vertical/horizontal power: broad jump, box jump, or vertical jump (3–5 sets × 3–5 reps)"
            : "Med ball power: chest throw, overhead slam, or push press (3–4 sets × 3–5 reps)",
      });
    }
  }

  if (sel) {
    blocks.push({
      role: "primary",
      description: patterns.includes("squat")
        ? buildSquatPrimaryDescription(sel)
        : patterns.includes("hinge")
          ? buildHingePrimaryDescription(sel)
          : patterns.includes("upper_push")
            ? buildUpperPushDescription(sel, true)
            : patterns.includes("upper_pull")
              ? buildUpperPullDescription(sel, true)
              : "Primary compound movement matching session identity",
    });

    blocks.push({
      role: "secondary",
      description: patterns.includes("squat")
        ? `Secondary pattern: ${sel.bilateral_hinge_strength} complement (hinge) + posterior chain support (3 × 8–10)`
        : patterns.includes("hinge")
          ? `Secondary pattern: ${sel.unilateral_lower} (unilateral squat complement) + posterior chain support (3 × 8–10)`
          : patterns.includes("upper_push")
            ? `Structural balance: ${sel.upper_pull_secondary} — horizontal or vertical pull to complement press (3–4 × 8–12)`
            : `Secondary compound: ${sel.upper_push_secondary} — supports and balances the primary pattern (3 × 8–12)`,
    });
  } else {
    blocks.push({
      role: "primary",
      description: patterns.includes("squat")
        ? "Primary squat pattern: bilateral squat variation — back squat, front squat, or trap bar squat"
        : patterns.includes("hinge")
          ? "Primary hinge pattern: deadlift or Romanian deadlift variation"
          : patterns.includes("upper_push")
            ? "Primary press: bench press, overhead press, or incline press"
            : patterns.includes("upper_pull")
              ? "Primary pull: weighted pull-up or barbell row"
              : "Primary compound movement matching session identity",
    });

    blocks.push({
      role: "secondary",
      description: patterns.includes("squat")
        ? "Secondary pattern: hinge complement (RDL) + posterior chain support"
        : patterns.includes("hinge")
          ? "Secondary pattern: squat complement (goblet or split squat) + trunk"
          : patterns.includes("upper_push")
            ? "Structural balance: horizontal or vertical pull to complement press"
            : "Secondary compound: supports and balances the primary pattern",
    });
  }

  if (patterns.includes("unilateral_lower") || patterns.includes("squat") || patterns.includes("hinge")) {
    blocks.push({
      role: "unilateral",
      description: sel
        ? buildUnilateralDescription(sel, isHingeDay)
        : "Unilateral lower-body: RFESS, lateral step-up, single-leg RDL, or lateral lunge for positional control and asymmetry exposure",
    });
  }

  blocks.push({
    role: "trunk",
    description: sel
      ? buildTrunkDescription(sel, patterns.includes("rotational"))
      : patterns.includes("rotational")
        ? "Rotational trunk: Pallof press, half-kneeling cable chop, or landmine rotation"
        : patterns.includes("lateral")
          ? "Lateral stability trunk: Copenhagen plank, side plank with hip abduction, or suitcase carry"
          : "Trunk integrity: anti-extension (ab wheel, dead bug) + anti-rotation (Pallof press) paired",
  });

  if (neuralDemand === "low") {
    blocks.push({
      role: "finisher",
      description: "Tissue quality finisher: Nordic curl, Copenhagen adduction, or face pull for structural resilience (only if session density allows)",
    });
  }

  // Work capacity / accumulation blocks get a conditioning finisher on lower sessions
  if (isWorkCapacity && isLowerSession && neuralDemand !== "low") {
    blocks.push({
      role: "finisher",
      description: sel
        ? `WORK CAPACITY FINISHER — ${sel.conditioning_finisher}: density/capacity work to close the session. This is NOT rest — it is the accumulation stimulus. 3–4 sets, moderate intensity, continuous effort.`
        : "WORK CAPACITY FINISHER: Kettlebell swing complex (4 × 15) OR sled push (4 × 20m) OR loaded carry complex (3 × 30m each side) — choose based on session load. Density and capacity, not power. Closes the accumulation block.",
    });
  }

  return blocks;
}

// ─── Weekly architecture templates by day count ──────────────────────────────

function buildSessionsForDayCount(
  daysPerWeek: number,
  sport: string | null,
  goal: string | null,
  variationSeed?: number,
  blockArchetype?: string,
): SessionArchitecture[] {
  const isHockey = sport?.toLowerCase().includes("hockey") ?? false;
  const s = sport?.toLowerCase() ?? "";

  // Category 1 — Power/Force Sports
  const isAthletic = isHockey
    || s.includes("soccer") || s.includes("football") || s.includes("basketball")
    || s.includes("rugby") || s.includes("lacrosse") || s.includes("volleyball")
    || s.includes("track") || s.includes("sprint");

  // Category 3 — Rotational / Skill Sports
  const isCategory3 = s.includes("tennis") || s.includes("pickleball") || s.includes("squash")
    || s.includes("padel") || s.includes("baseball") || s.includes("softball") || s.includes("golf");

  // Category 4 — Endurance / Corrective Sports
  const isCategory4 = s.includes("swim") || s.includes("rowing") || s.includes("cycling")
    || s.includes("triathlon") || s.includes("cyclist") || s.includes("rower");

  // Category 5 — Combat / Mixed Sports
  const isCategory5 = s.includes("mma") || s.includes("boxing") || s.includes("wrestling")
    || s.includes("bjj") || s.includes("judo") || s.includes("muay thai")
    || s.includes("kickboxing") || s.includes("martial art") || s.includes("jiu-jitsu");

  const isHypertrophy = goal?.toLowerCase().includes("hypertrophy")
    || goal?.toLowerCase().includes("muscle")
    || goal?.toLowerCase().includes("size")
    || false;

  // Conditioning/endurance goal: programs structured around energy system development
  // with dedicated conditioning sessions rather than only lifting days
  const isConditioning = !!(
    goal?.toLowerCase().includes("conditioning") ||
    goal?.toLowerCase().includes("endurance") ||
    goal?.toLowerCase().includes("cardio") ||
    goal?.toLowerCase().includes("aerobic") ||
    goal?.toLowerCase().includes("work capacity") ||
    goal?.toLowerCase().includes("stamina")
  );

  // ─── Category 3: Rotational / Skill Sports ───────────────────────────────────
  // Tennis, pickleball, squash, padel, baseball, softball, golf
  // No plyometrics. Rotational power (med ball) is the power modality. Moderate reps.
  if (isCategory3) {
    if (daysPerWeek === 3) {
      return [
        {
          dayNumber: 1,
          identity: "Rotational Power + Lower Strength",
          intent: "Rotational med ball work as the power anchor; moderate bilateral lower compound; unilateral lateral control",
          neuralDemand: "moderate",
          primaryPattern: "rotational",
          emphasizedPatterns: ["rotational", "hinge", "unilateral_lower", "trunk"],
          cnsFlow: [
            { role: "prep", description: "Hip and thoracic mobility: hip CARs, thoracic rotation, half-kneeling hip flexor" },
            { role: "power", description: "Rotational med ball: med ball rotational throw or scoop toss (not plyometrics — rotational power only)" },
            { role: "primary", description: "Lower compound: goblet squat, trap bar deadlift, or RDL (moderate load, 6–10 reps)" },
            { role: "unilateral", description: "Unilateral: split squat, lateral lunge, or RFESS (8–12 reps per side)" },
            { role: "trunk", description: "Anti-rotation trunk: Pallof press or half-kneeling cable chop" },
          ],
        },
        {
          dayNumber: 2,
          identity: "Upper Pulling + Shoulder Structural Care",
          intent: "Pull-dominant upper session; rotational power; mandatory shoulder and elbow structural care",
          neuralDemand: "moderate",
          primaryPattern: "upper_pull",
          emphasizedPatterns: ["upper_pull", "rotational", "trunk"],
          cnsFlow: [
            { role: "prep", description: "Scapular prep: wall slides, band pull-apart, thoracic extension over foam roller" },
            { role: "power", description: "Rotational med ball: rotational throw or overhead backward slam" },
            { role: "primary", description: "Vertical or horizontal pull (pull-up, lat pulldown, or barbell row — 6–10 reps)" },
            { role: "secondary", description: "Horizontal push complement (moderate — not the session anchor)" },
            { role: "trunk", description: "Anti-extension trunk: dead bug or ab wheel rollout" },
            { role: "finisher", description: "MANDATORY SHOULDER/ELBOW CARE: face pull + band external rotation (3 sets each — non-negotiable for rotational sport athletes)" },
          ],
        },
        {
          dayNumber: 3,
          identity: "Hip Strength + Thoracic Mobility",
          intent: "Hinge-dominant posterior chain; thoracic rotation; lateral movement and anti-rotation trunk",
          neuralDemand: "low",
          primaryPattern: "hinge",
          emphasizedPatterns: ["hinge", "lateral", "rotational", "trunk"],
          cnsFlow: [
            { role: "prep", description: "Full lower and thoracic prep: hip circles, thoracic rotation, ankle mobility" },
            { role: "primary", description: "Hinge pattern (RDL, single-leg RDL, or hip thrust — 8–12 reps)" },
            { role: "secondary", description: "Lateral movement: lateral lunge, Copenhagen plank, or lateral step-up" },
            { role: "trunk", description: "Rotational and lateral trunk: landmine rotation + Copenhagen plank" },
            { role: "finisher", description: "Thoracic rotation mobility: thoracic CARs, seated rotation with dowel, or half-kneeling reach" },
          ],
        },
      ];
    }
    if (daysPerWeek === 4) {
      return [
        {
          dayNumber: 1,
          identity: "Rotational Power + Lower Strength",
          intent: "Rotational power anchor; moderate lower compound; unilateral lower control",
          neuralDemand: "moderate",
          primaryPattern: "rotational",
          emphasizedPatterns: ["rotational", "squat", "unilateral_lower", "trunk"],
          cnsFlow: [
            { role: "prep", description: "Hip and thoracic mobility prep" },
            { role: "power", description: "Med ball rotational throw or scoop toss" },
            { role: "primary", description: "Squat-pattern compound (goblet squat, front squat, or trap bar — 6–10 reps)" },
            { role: "unilateral", description: "Split squat or RFESS (8–12 per side)" },
            { role: "trunk", description: "Anti-rotation: Pallof press" },
          ],
        },
        {
          dayNumber: 2,
          identity: "Upper Pulling + Shoulder Care",
          intent: "Pull-dominant; rotational power; mandatory shoulder and elbow structural care",
          neuralDemand: "moderate",
          primaryPattern: "upper_pull",
          emphasizedPatterns: ["upper_pull", "rotational", "trunk"],
          cnsFlow: [
            { role: "prep", description: "Scapular positioning and thoracic mobility" },
            { role: "power", description: "Med ball overhead backward slam or rotational throw" },
            { role: "primary", description: "Vertical pull (pull-up or lat pulldown — 6–10 reps)" },
            { role: "secondary", description: "Horizontal push (moderate load)" },
            { role: "trunk", description: "Anti-extension: dead bug or ab wheel" },
            { role: "finisher", description: "Face pull + band external rotation (MANDATORY — 3 sets each)" },
          ],
        },
        {
          dayNumber: 3,
          identity: "Hip Posterior Chain + Lateral Strength",
          intent: "Hinge-dominant; lateral movement control; anti-rotation trunk",
          neuralDemand: "low",
          primaryPattern: "hinge",
          emphasizedPatterns: ["hinge", "lateral", "trunk"],
          cnsFlow: [
            { role: "prep", description: "Hip flexor and ankle mobility" },
            { role: "primary", description: "RDL or single-leg RDL (8–12 reps)" },
            { role: "secondary", description: "Hip thrust or glute bridge" },
            { role: "unilateral", description: "Lateral lunge or Copenhagen plank" },
            { role: "trunk", description: "Lateral stability: side plank or suitcase carry" },
          ],
        },
        {
          dayNumber: 4,
          identity: "Full Rotational Integration + Thoracic Mobility",
          intent: "Rotational power; upper structural care; thoracic mobility finisher",
          neuralDemand: "low",
          primaryPattern: "rotational",
          emphasizedPatterns: ["rotational", "upper_pull", "trunk"],
          cnsFlow: [
            { role: "prep", description: "Full thoracic + hip rotation mobility prep" },
            { role: "power", description: "Med ball rotational complex (2 variations)" },
            { role: "primary", description: "Horizontal pull (bent-over row or cable row — 8–12 reps)" },
            { role: "trunk", description: "Rotational trunk: landmine rotation, half-kneeling chop" },
            { role: "finisher", description: "Face pull + band external rotation + thoracic mobility (structural care)" },
          ],
        },
      ];
    }
  }

  // ─── Category 4: Endurance / Corrective Sports ────────────────────────────────
  // Swimming, rowing, cycling, triathlon
  // No explosive work. Corrective/structural emphasis. No gym conditioning added.
  if (isCategory4) {
    if (daysPerWeek === 3) {
      return [
        {
          dayNumber: 1,
          identity: "Posterior Chain + Pulling Strength",
          intent: "Hinge-dominant posterior chain; vertical or horizontal pull; shoulder structural care",
          neuralDemand: "moderate",
          primaryPattern: "hinge",
          emphasizedPatterns: ["hinge", "upper_pull", "trunk"],
          cnsFlow: [
            { role: "prep", description: "Hip and scapular prep: hip CARs, wall slides, band pull-apart" },
            { role: "primary", description: "Hinge compound: RDL, deadlift, or trap bar deadlift (10–15 reps)" },
            { role: "secondary", description: "Vertical or horizontal pull: pull-up, lat pulldown, or cable row (10–15 reps)" },
            { role: "unilateral", description: "Single-leg RDL or hip thrust (10–12 per side)" },
            { role: "trunk", description: "Anti-extension trunk: dead bug or hollow body hold" },
            { role: "finisher", description: "Shoulder care: face pull + band external rotation (3 sets each — mandatory)" },
          ],
        },
        {
          dayNumber: 2,
          identity: "Upper Structural Health + Scapular Stability",
          intent: "Pull-dominant upper session; scapular care; trunk stiffness — counterbalances sport-specific overuse patterns",
          neuralDemand: "low",
          primaryPattern: "upper_pull",
          emphasizedPatterns: ["upper_pull", "trunk"],
          cnsFlow: [
            { role: "prep", description: "Thoracic extension + scapular positioning: foam roller thoracic, wall slides, Y/T/W" },
            { role: "primary", description: "Horizontal pull primary (bent-over row or cable row — 10–15 reps)" },
            { role: "secondary", description: "Vertical pull (lat pulldown or assisted pull-up — 10–15 reps)" },
            { role: "trunk", description: "Anti-rotation and bracing: Pallof press, RKC plank, or suitcase carry" },
            { role: "finisher", description: "Y/T/W scapular exercises + band external rotation (structural care mandatory)" },
          ],
        },
        {
          dayNumber: 3,
          identity: "Corrective Lower + Hip Balance",
          intent: "Single-leg corrective work; hip extension and abductor balance; posterior chain accessory — addresses imbalances from sport loading",
          neuralDemand: "low",
          primaryPattern: "unilateral_lower",
          emphasizedPatterns: ["unilateral_lower", "hinge", "trunk", "lateral"],
          cnsFlow: [
            { role: "prep", description: "Hip flexor mobility + glute activation: couch stretch, banded clamshell, lateral band walk" },
            { role: "primary", description: "Single-leg strength: RFESS, split squat, or step-up (10–12 per side)" },
            { role: "secondary", description: "Hip thrust or glute bridge for hip extension (10–15 reps)" },
            { role: "unilateral", description: "Hip flexor eccentric loading or Copenhagen plank (tissue balance)" },
            { role: "trunk", description: "Lateral stability: Copenhagen plank or side plank with hip abduction" },
          ],
        },
      ];
    }
    if (daysPerWeek === 4) {
      return [
        {
          dayNumber: 1,
          identity: "Posterior Chain + Pulling Strength",
          intent: "Hinge primary; pulling compound; shoulder care to open the week",
          neuralDemand: "moderate",
          primaryPattern: "hinge",
          emphasizedPatterns: ["hinge", "upper_pull", "trunk"],
          cnsFlow: [
            { role: "prep", description: "Hip and scapular prep" },
            { role: "primary", description: "Hinge compound: RDL or deadlift (10–15 reps)" },
            { role: "secondary", description: "Vertical pull: pull-up or lat pulldown (10–15 reps)" },
            { role: "unilateral", description: "Single-leg RDL or hip thrust (10–12 per side)" },
            { role: "trunk", description: "Anti-extension: dead bug or hollow body" },
            { role: "finisher", description: "Face pull + band external rotation (mandatory)" },
          ],
        },
        {
          dayNumber: 2,
          identity: "Upper Structural Health + Scapular Stability",
          intent: "Pull-dominant; scapular care; trunk bracing",
          neuralDemand: "low",
          primaryPattern: "upper_pull",
          emphasizedPatterns: ["upper_pull", "trunk"],
          cnsFlow: [
            { role: "prep", description: "Thoracic extension + scapular positioning" },
            { role: "primary", description: "Horizontal pull: bent-over row or cable row (10–15 reps)" },
            { role: "secondary", description: "Vertical pull: lat pulldown (10–15 reps)" },
            { role: "trunk", description: "Anti-rotation: Pallof press or suitcase carry" },
            { role: "finisher", description: "Y/T/W + band external rotation" },
          ],
        },
        {
          dayNumber: 3,
          identity: "Corrective Lower + Hip Balance",
          intent: "Single-leg corrective; hip extension; hip flexor care",
          neuralDemand: "low",
          primaryPattern: "unilateral_lower",
          emphasizedPatterns: ["unilateral_lower", "lateral", "trunk"],
          cnsFlow: [
            { role: "prep", description: "Hip flexor mobility + glute activation" },
            { role: "primary", description: "Single-leg strength: RFESS or step-up (10–12 per side)" },
            { role: "secondary", description: "Hip thrust (12–15 reps)" },
            { role: "unilateral", description: "Copenhagen plank or lateral hip abductor work" },
            { role: "trunk", description: "Lateral stability trunk" },
          ],
        },
        {
          dayNumber: 4,
          identity: "Full Structural Integration + Posterior Chain",
          intent: "Closing the week with pulling strength, posterior chain support, and shoulder care",
          neuralDemand: "low",
          primaryPattern: "upper_pull",
          emphasizedPatterns: ["upper_pull", "hinge", "trunk"],
          cnsFlow: [
            { role: "prep", description: "Hip and thoracic mobility" },
            { role: "primary", description: "Horizontal pull compound (10–15 reps)" },
            { role: "secondary", description: "Hinge accessory: single-leg RDL or hip thrust" },
            { role: "trunk", description: "Anti-extension + anti-rotation pairing" },
            { role: "finisher", description: "Shoulder care: face pull + external rotation + Y/T/W" },
          ],
        },
      ];
    }
  }

  // ─── Category 5: Combat / Mixed Sports ───────────────────────────────────────
  // MMA, boxing, wrestling, BJJ, judo, muay thai, kickboxing, martial arts
  // Pull-dominant, functional strength, conditioning rounds mandatory
  if (isCategory5) {
    if (daysPerWeek === 3) {
      return [
        {
          dayNumber: 1,
          identity: "Functional Strength + Grappling Capacity",
          intent: "Pull-dominant compound strength; loaded carry; isometric tolerance; conditioning rounds",
          neuralDemand: "moderate",
          primaryPattern: "upper_pull",
          emphasizedPatterns: ["upper_pull", "hinge", "trunk"],
          cnsFlow: [
            { role: "prep", description: "Full-body dynamic prep: hip circles, arm swings, inchworm, scapular activation" },
            { role: "primary", description: "Pull-dominant compound: weighted pull-up, trap bar deadlift, or barbell row (5–8 reps)" },
            { role: "secondary", description: "Push complement: bench or overhead press (5–8 reps) — not the session anchor" },
            { role: "trunk", description: "Isometric and anti-rotation: RKC plank, Pallof press, or farmer carry" },
            { role: "finisher", description: "CONDITIONING ROUNDS: 4–5 × 3–5 min rounds (shadow boxing, kettlebell complex, assault bike, or grappling-specific drill) with short rest matching sport work:rest ratio" },
          ],
        },
        {
          dayNumber: 2,
          identity: "Lower Strength + Energy System Work",
          intent: "Hinge and single-leg strength base; trunk stiffness; conditioning rounds",
          neuralDemand: "moderate",
          primaryPattern: "hinge",
          emphasizedPatterns: ["hinge", "unilateral_lower", "trunk"],
          cnsFlow: [
            { role: "prep", description: "Hip and ankle mobility: hip CARs, couch stretch, ankle circles" },
            { role: "primary", description: "Hinge compound: deadlift, RDL, or trap bar deadlift (5–8 reps)" },
            { role: "unilateral", description: "Single-leg: split squat or RFESS (8–10 per side)" },
            { role: "trunk", description: "Isometric carry: farmer carry or suitcase carry" },
            { role: "finisher", description: "CONDITIONING ROUNDS: 3–4 × 3–4 min efforts — interval-based (bike, row, or fight-specific drill) with short rest" },
          ],
        },
        {
          dayNumber: 3,
          identity: "Structural Accessory + Active Recovery Conditioning",
          intent: "Supplementary pulling; grip and shoulder care; lower-intensity conditioning",
          neuralDemand: "low",
          primaryPattern: "upper_pull",
          emphasizedPatterns: ["upper_pull", "trunk"],
          cnsFlow: [
            { role: "prep", description: "Thoracic and shoulder mobility: wall slides, thoracic rotation, shoulder CARs" },
            { role: "primary", description: "Supplementary pull: cable row, face pull, or kettlebell row (10–12 reps)" },
            { role: "trunk", description: "Anti-rotation and anti-extension trunk: dead bug + Pallof press" },
            { role: "finisher", description: "CONDITIONING (lighter): 3 × 5 min aerobic base — steady-state row, bike, or shadow work at 60–70% effort" },
          ],
        },
      ];
    }
    if (daysPerWeek === 4) {
      return [
        {
          dayNumber: 1,
          identity: "Upper Pull Strength + Conditioning",
          intent: "Vertical and horizontal pull; conditioning rounds to close",
          neuralDemand: "moderate",
          primaryPattern: "upper_pull",
          emphasizedPatterns: ["upper_pull", "trunk"],
          cnsFlow: [
            { role: "prep", description: "Full-body dynamic prep + scapular activation" },
            { role: "primary", description: "Weighted pull-up or barbell row (5–8 reps)" },
            { role: "secondary", description: "Push complement (moderate load)" },
            { role: "trunk", description: "Farmer carry or suitcase carry" },
            { role: "finisher", description: "CONDITIONING: 4–5 rounds × 3 min with 1 min rest" },
          ],
        },
        {
          dayNumber: 2,
          identity: "Lower Strength + Unilateral",
          intent: "Hinge-dominant lower strength; single-leg stability; trunk",
          neuralDemand: "moderate",
          primaryPattern: "hinge",
          emphasizedPatterns: ["hinge", "unilateral_lower", "trunk"],
          cnsFlow: [
            { role: "prep", description: "Hip mobility and activation" },
            { role: "primary", description: "Deadlift or RDL (5–8 reps)" },
            { role: "unilateral", description: "RFESS or split squat (8–10 per side)" },
            { role: "trunk", description: "Anti-rotation: Pallof press or half-kneeling cable chop" },
          ],
        },
        {
          dayNumber: 3,
          identity: "Functional Strength + Energy System",
          intent: "Pull-dominant; carries; conditioning rounds",
          neuralDemand: "moderate",
          primaryPattern: "upper_pull",
          emphasizedPatterns: ["upper_pull", "trunk"],
          cnsFlow: [
            { role: "prep", description: "Dynamic full-body prep" },
            { role: "primary", description: "Trap bar deadlift or kettlebell swing (5–8 reps)" },
            { role: "secondary", description: "Pull complex: pull-up + face pull" },
            { role: "trunk", description: "Isometric: RKC plank" },
            { role: "finisher", description: "CONDITIONING: 4 rounds × 4 min with short rest" },
          ],
        },
        {
          dayNumber: 4,
          identity: "Structural + Active Recovery",
          intent: "Supplementary pull; grip and shoulder care; lighter conditioning",
          neuralDemand: "low",
          primaryPattern: "trunk",
          emphasizedPatterns: ["upper_pull", "trunk"],
          cnsFlow: [
            { role: "prep", description: "Thoracic and shoulder mobility" },
            { role: "primary", description: "Cable row + face pull (10–12 reps each)" },
            { role: "trunk", description: "Dead bug + Copenhagen plank" },
            { role: "finisher", description: "CONDITIONING (aerobic): 3 × 5 min at 60–70% effort" },
          ],
        },
      ];
    }
  }

  // Individual sport-specific architectures are handled below
  // (football, basketball, soccer, baseball each have dedicated 3-day and 4-day blocks)

  // For conditioning-dominant goals, use conditioning-specific session architectures
  if (isConditioning && !isAthletic) {
    if (daysPerWeek === 3) {
      return [
        {
          dayNumber: 1,
          identity: "Strength Support + Aerobic Base",
          intent: "Compound lower-body strength as the structural foundation; aerobic base conditioning finisher to develop cardiac output",
          neuralDemand: "moderate",
          primaryPattern: "squat",
          emphasizedPatterns: ["squat", "hinge", "trunk", "locomotion"],
          cnsFlow: [
            { role: "prep", description: "Dynamic lower prep: hip mobility, glute activation, ankle stiffness" },
            { role: "primary", description: "Compound squat pattern — bilateral force production foundation" },
            { role: "secondary", description: "Hinge pattern — posterior chain structural support" },
            { role: "unilateral", description: "Unilateral lower — single-leg stability and asymmetry correction" },
            { role: "trunk", description: "Anti-extension trunk work: dead bug or ab wheel" },
            { role: "finisher", description: "AEROBIC BASE CONDITIONING: 20–30 min steady-state run, row, or bike at 60–70% max HR. This is a dedicated energy system session, not a circuit." },
          ],
        },
        {
          dayNumber: 2,
          identity: "Dedicated Conditioning — Energy System Development",
          intent: "Standalone conditioning session targeting the primary energy system — real intervals, real work:rest ratios. This day is conditioning-first, not strength.",
          neuralDemand: "moderate",
          primaryPattern: "locomotion",
          emphasizedPatterns: ["locomotion", "trunk"],
          cnsFlow: [
            { role: "prep", description: "Dynamic warm-up: jog, dynamic drills, build-up strides or jump rope warm-up" },
            { role: "primary", description: "PRIMARY CONDITIONING BLOCK: Structured intervals per the conditioning engine — lactate threshold or VO2max work. Not a circuit. Real work:rest prescribed." },
            { role: "secondary", description: "SECONDARY CONDITIONING: A second energy system block if time allows — e.g., aerobic base cool-down or tempo work" },
            { role: "trunk", description: "Trunk stability cooldown: 2–3 sets anti-rotation or anti-extension (minimal fatigue)" },
          ],
        },
        {
          dayNumber: 3,
          identity: "Upper Strength + Repeat Effort Conditioning",
          intent: "Upper body structural strength support; sprint or repeat-effort conditioning finisher to develop anaerobic capacity",
          neuralDemand: "moderate",
          primaryPattern: "upper_push",
          emphasizedPatterns: ["upper_push", "upper_pull", "trunk", "locomotion"],
          cnsFlow: [
            { role: "prep", description: "Upper-body neural prep: scapular activation, wall slides, thoracic mobility" },
            { role: "primary", description: "Upper push compound — horizontal or vertical press strength" },
            { role: "secondary", description: "Upper pull complement — row or chin-up for structural balance" },
            { role: "trunk", description: "Anti-rotation trunk: Pallof press or dead bug" },
            { role: "finisher", description: "CONDITIONING FINISHER: Anaerobic capacity or repeat sprint work — 6–10 × 20-sec all-out efforts with adequate rest. Named energy system, not 'circuits'." },
          ],
        },
      ];
    }

    if (daysPerWeek === 4) {
      return [
        {
          dayNumber: 1,
          identity: "Lower Strength + Aerobic Foundation",
          intent: "Build structural lower-body strength as the conditioning support base; aerobic conditioning to close the session",
          neuralDemand: "moderate",
          primaryPattern: "squat",
          emphasizedPatterns: ["squat", "hinge", "unilateral_lower", "trunk", "locomotion"],
          cnsFlow: [
            { role: "prep", description: "Lower-body dynamic prep: hip mobility, glute activation" },
            { role: "primary", description: "Squat-pattern bilateral strength" },
            { role: "secondary", description: "Hinge-pattern posterior chain" },
            { role: "unilateral", description: "Unilateral lower stability" },
            { role: "trunk", description: "Anti-extension trunk" },
            { role: "finisher", description: "AEROBIC BASE: 20 min steady-state run or row at 60–70% max HR" },
          ],
        },
        {
          dayNumber: 2,
          identity: "Dedicated Conditioning — Lactate Threshold",
          intent: "Standalone lactate threshold session — structured intervals at 85–92% max HR. No lifting this day. Real conditioning work.",
          neuralDemand: "moderate",
          primaryPattern: "locomotion",
          emphasizedPatterns: ["locomotion"],
          cnsFlow: [
            { role: "prep", description: "5 min easy jog or row warm-up" },
            { role: "primary", description: "LACTATE THRESHOLD INTERVALS: 3–5 × 4–6 min at 85–92% max HR with equal rest. Run, row, or bike. This is a real conditioning session." },
            { role: "finisher", description: "5 min easy cool-down" },
          ],
        },
        {
          dayNumber: 3,
          identity: "Upper Structural Strength",
          intent: "Upper-body compound strength to maintain structural balance in a conditioning-dominant program",
          neuralDemand: "moderate",
          primaryPattern: "upper_push",
          emphasizedPatterns: ["upper_push", "upper_pull", "trunk"],
          cnsFlow: [
            { role: "prep", description: "Upper-body scapular and shoulder prep" },
            { role: "primary", description: "Horizontal press compound" },
            { role: "secondary", description: "Horizontal pull complement" },
            { role: "trunk", description: "Anti-rotation trunk integrity" },
          ],
        },
        {
          dayNumber: 4,
          identity: "Dedicated Conditioning — Anaerobic Capacity / RSA",
          intent: "High-intensity conditioning session targeting anaerobic capacity or repeat sprint ability — the most sport-specific conditioning day",
          neuralDemand: "high",
          primaryPattern: "locomotion",
          emphasizedPatterns: ["locomotion", "power"],
          cnsFlow: [
            { role: "prep", description: "8 min dynamic warm-up: jog + A-skips + high knees + 2 × build-up strides" },
            { role: "primary", description: "ANAEROBIC CAPACITY / RSA: 6–12 × 10–30 sec all-out sprints or bike efforts with 3–5× work:rest ratio. Full speed on every rep. Named energy system target." },
            { role: "finisher", description: "5 min walk cool-down" },
          ],
        },
      ];
    }
  }

  // ─── Power goal: contrast/complex/PAP session architecture ─────────────────
  // Power development requires: sprint/power FIRST, strength support SECOND, NO conditioning finishers
  const isPower = !!(
    goal?.toLowerCase().includes("power") ||
    goal?.toLowerCase().includes("explosive")
  );

  if (isPower) {
    if (daysPerWeek === 3) {
      return [
        {
          dayNumber: 1,
          identity: "Power Development — Lower Contrast Training",
          intent: "Lower-body contrast pairs: heavy compound lift paired with explosive jump/bound — exploits post-activation potentiation for maximum rate of force development",
          neuralDemand: "high",
          primaryPattern: "power",
          emphasizedPatterns: ["power", "squat", "hinge", "trunk"],
          cnsFlow: [
            { role: "prep", description: "CNS activation prep: 8 min — dynamic lower prep → A-skip × 2 × 20m → broad jumps × 3 (sub-max) → build-up stride × 1" },
            { role: "power", description: "CONTRAST PAIR A: Heavy Squat/Trap Bar DL (4 × 2-3 @ 85-90%) → Box Jump or Broad Jump (4 × 3-5 BW) with 3-5 min between primary and explosive. This is a PAP pair, not separate exercises." },
            { role: "primary", description: "CONTRAST PAIR B: Heavy Hip Hinge variant (3 × 3-5) → Med Ball Overhead Scoop Toss (3 × 5) — second contrast pair targeting posterior chain power expression" },
            { role: "trunk", description: "Structural trunk: Pallof press anti-rotation + dead bug (2-3 sets each, low fatigue)" },
          ],
        },
        {
          dayNumber: 2,
          identity: "Speed-Strength — Olympic/Loaded Jump + Sprint",
          intent: "Speed-strength zone: moderate load at maximum velocity intent — bridges gym to track. Gym work supports sprint mechanics.",
          neuralDemand: "high",
          primaryPattern: "power",
          emphasizedPatterns: ["power", "locomotion", "unilateral_lower", "trunk"],
          cnsFlow: [
            { role: "prep", description: "Sprint/movement prep: 10 min — jog → dynamic drill series → 3 × 20m build-up strides at 70%, 85%, 95%" },
            { role: "power", description: "SPRINT BLOCK: Acceleration development — 5 × 10m + 4 × 20m sprints with 2 min full recovery. Every rep is 100% — if speed drops, rest longer." },
            { role: "primary", description: "SPEED-STRENGTH LIFT: Hang Power Clean or Trap Bar Jump (3-4 × 2-4 @ moderate load) — gym work that directly supports sprint force application. Maximum velocity intent every rep." },
            { role: "secondary", description: "Strength support: single-leg RDL or step-up (2-3 × 6-8) — posterior chain and unilateral stability" },
            { role: "trunk", description: "Anti-rotation trunk: Pallof press (2 × 10 each side)" },
          ],
        },
        {
          dayNumber: 3,
          identity: "Upper Power + Strength Support",
          intent: "Upper-body power expression + lower-body strength support; integrates rotational power for full athletic transfer",
          neuralDemand: "moderate",
          primaryPattern: "upper_push",
          emphasizedPatterns: ["upper_push", "upper_pull", "power", "trunk", "rotational"],
          cnsFlow: [
            { role: "prep", description: "Upper-body power prep: band pull-aparts, wall slides, med ball chest throw (2 × 5 sub-max)" },
            { role: "power", description: "UPPER POWER PAIR: Weighted push-up or explosive push-up (3 × 5) paired with med ball rotational throw (3 × 5 each side) — rotational and horizontal power expression" },
            { role: "primary", description: "Upper push compound: bench press or overhead press (4 × 3-5 @ 80-85%) — strength support for upper power output" },
            { role: "secondary", description: "Upper pull: row or chin-up variation (3 × 5-8) — structural balance" },
            { role: "trunk", description: "Rotational trunk: landmine rotation or cable chop (2 × 8 each side)" },
          ],
        },
      ];
    }

    if (daysPerWeek === 4) {
      return [
        {
          dayNumber: 1,
          identity: "Power Development — Lower Contrast (PAP)",
          intent: "Heavy lower-body compound paired with maximal jump or sprint — PAP protocol: 4-8 min between primary and explosive to peak potentiation",
          neuralDemand: "high",
          primaryPattern: "power",
          emphasizedPatterns: ["power", "squat", "trunk"],
          cnsFlow: [
            { role: "prep", description: "CNS activation: dynamic lower prep → 2 × broad jump sub-max → 1 × 30m build-up stride at 90%" },
            { role: "power", description: "PAP PAIR A: Back Squat (4 × 2-3 @ 85-93%) → 4-8 min rest → Vertical Jump max effort (3 reps). Time the jump at PAP peak (4-6 min post-lift)." },
            { role: "primary", description: "PAP PAIR B: Trap Bar Deadlift (3 × 2-3 @ 85%) → 4-5 min rest → Sprint Acceleration 20m (2 reps at 100%)" },
            { role: "trunk", description: "Structural trunk only: Pallof press + anti-extension plank (minimal fatigue — protect CNS for next session)" },
          ],
        },
        {
          dayNumber: 2,
          identity: "Sprint — Acceleration Development",
          intent: "Pure speed session: acceleration mechanics, 0-20m. Gym work comes AFTER sprint work — not before.",
          neuralDemand: "high",
          primaryPattern: "locomotion",
          emphasizedPatterns: ["locomotion", "power", "unilateral_lower"],
          cnsFlow: [
            { role: "prep", description: "Sprint warm-up: 10 min jog → A-skip 2 × 20m → B-skip 2 × 20m → high knees 2 × 20m → 3 × 30m build-ups at 70%, 85%, 95%" },
            { role: "power", description: "ACCELERATION BLOCK: 5-6 × 10m (standing start) + 4-5 × 20m acceleration with 2 min rest between every rep. Every rep is 100% — not conditioning, not intervals. Full recovery." },
            { role: "primary", description: "STRENGTH SUPPORT (post-sprint only): Trap Bar Deadlift or Hip Thrust (3 × 4-6) — posterior chain that supports sprint mechanics. Moderate load, not maximal." },
            { role: "secondary", description: "Unilateral strength: single-leg RDL (3 × 6 each side) — hamstring resilience for sprint demand" },
          ],
        },
        {
          dayNumber: 3,
          identity: "Complex Training — Lower Power",
          intent: "Biomechanically linked heavy-explosive pairs: brief rest between primary and explosive distinguishes complex from contrast training",
          neuralDemand: "high",
          primaryPattern: "power",
          emphasizedPatterns: ["power", "hinge", "unilateral_lower", "trunk"],
          cnsFlow: [
            { role: "prep", description: "Movement prep: hip hinge activation, hamstring mobility, Nordic lowering prep (2 × 4)" },
            { role: "power", description: "COMPLEX A: Front Squat or Hack Squat (4 × 3 @ 75-80%) → 45 sec rest → Depth Jump (4 × 3) — biomechanically linked squat-to-jump complex" },
            { role: "primary", description: "COMPLEX B: Hang Power Clean (4 × 3 @ 70-75%) → 45 sec rest → Med Ball Overhead Scoop Toss (4 × 5) — Olympic lift to triple extension power expression" },
            { role: "secondary", description: "Strength support: Nordic hamstring curl or RDL (2-3 × 6) — posterior chain resilience" },
            { role: "trunk", description: "Rotational trunk: landmine press + cable chop (2 × 8 each side)" },
          ],
        },
        {
          dayNumber: 4,
          identity: "Upper Power + Plyometric Integration",
          intent: "Upper-body power expression + plyometric block for vertical/horizontal force development; week-closing athletic transfer",
          neuralDemand: "moderate",
          primaryPattern: "upper_push",
          emphasizedPatterns: ["upper_push", "upper_pull", "power", "trunk", "rotational"],
          cnsFlow: [
            { role: "prep", description: "Upper power warm-up: band pull-aparts, explosive push-up (2 × 3 max intent), med ball chest throw (2 × 4)" },
            { role: "power", description: "PLYOMETRIC BLOCK: Box Jump (4 × 4) → Broad Jump (4 × 4) → Lateral Bound (3 × 4 each side) — 45-90 sec between exercises. Total foot contacts: 40-60. Power, not conditioning." },
            { role: "primary", description: "Upper push: Bench Press or Weighted Push-Up (4 × 3-5 @ 80-85%)" },
            { role: "secondary", description: "Upper pull: Weighted Pull-Up or Cable Row (3 × 5-8)" },
            { role: "trunk", description: "Anti-rotation + rotational trunk: Pallof press + medicine ball rotational throw finisher (2 × 5 each)" },
          ],
        },
      ];
    }
  }

  // ─── Speed goal: sprint-first architecture ───────────────────────────────────
  // Speed sessions: sprint work ALWAYS before gym work. No conditioning finishers.
  const isSpeed = !!(
    goal?.toLowerCase().includes("speed") ||
    goal?.toLowerCase().includes("sprint") ||
    goal?.toLowerCase().includes("acceleration")
  );

  if (isSpeed) {
    if (daysPerWeek === 3) {
      return [
        {
          dayNumber: 1,
          identity: "Acceleration Development + Strength Support",
          intent: "Sprint mechanics first — 0-20m acceleration focus. Gym strength work comes AFTER sprint work and supports sprint mechanics only.",
          neuralDemand: "high",
          primaryPattern: "locomotion",
          emphasizedPatterns: ["locomotion", "power", "hinge", "unilateral_lower"],
          cnsFlow: [
            { role: "prep", description: "Sprint warm-up: 10 min jog → A-skip × 2 × 20m → B-skip × 2 × 20m → high knees × 2 → 3 × build-up strides at 70%, 85%, 95%" },
            { role: "power", description: "ACCELERATION BLOCK: 5 × 10m (3-point start or standing) + 4 × 20m acceleration. 90 sec minimum between 10m reps, 2 min between 20m reps. 100% intent every rep." },
            { role: "primary", description: "STRENGTH SUPPORT (post-sprint): Heavy hinge — Trap Bar Deadlift or Romanian DL (4 × 3-5) — hip extension strength that powers acceleration. NOT a speed exercise." },
            { role: "secondary", description: "Unilateral: single-leg RDL or step-up (3 × 6 each side) — single-leg posterior chain resilience" },
            { role: "trunk", description: "Anti-rotation trunk: Pallof press (2-3 × 10 each side)" },
          ],
        },
        {
          dayNumber: 2,
          identity: "Strength + Speed-Strength",
          intent: "Strength support day: heavier lifting and speed-strength work in the gym — prepares the system for next speed session",
          neuralDemand: "moderate",
          primaryPattern: "squat",
          emphasizedPatterns: ["squat", "power", "upper_push", "upper_pull", "trunk"],
          cnsFlow: [
            { role: "prep", description: "General prep: hip mobility, thoracic rotation, glute activation" },
            { role: "power", description: "SPEED-STRENGTH BLOCK: Hang Power Clean (4 × 3 @ 65-75%) or Trap Bar Jump (4 × 4 @ 20-30% load) — gym explosive work that bridges strength to sprint speed" },
            { role: "primary", description: "Squat compound: Back Squat or Front Squat (4 × 4-6 @ 75-82%) — lower-body force production foundation" },
            { role: "secondary", description: "Upper structural: Bench Press + Row (3 × 5-8 each) — maintains structural balance in a lower-dominant program" },
            { role: "trunk", description: "Trunk: dead bug or RKC plank (2-3 × 30-45 sec)" },
          ],
        },
        {
          dayNumber: 3,
          identity: "Max Velocity Development + Speed-Strength",
          intent: "Top-end speed: fly sprints after full warm-up. Gym work is supplementary to the sprint stimulus.",
          neuralDemand: "high",
          primaryPattern: "locomotion",
          emphasizedPatterns: ["locomotion", "power", "unilateral_lower"],
          cnsFlow: [
            { role: "prep", description: "Max velocity prep: 12 min — jog → drill series (A/B/C skip) → 4 × build-ups at 70%, 80%, 90%, 95%. Do NOT sprint at max before this." },
            { role: "power", description: "MAX VELOCITY BLOCK: 3-4 × (20m build + 20m fly) at absolute maximum. 4-5 min full rest between every rep. Max velocity budget: 80-100m at true top speed." },
            { role: "primary", description: "STRENGTH SUPPORT (post-sprint): Hip Thrust or Nordic Hamstring Curl (3 × 5-8) — posterior chain specific to sprint propulsion and injury resilience" },
            { role: "trunk", description: "Structural trunk: anti-extension + anti-rotation (2 sets each, low CNS cost)" },
          ],
        },
      ];
    }

    if (daysPerWeek === 4) {
      return [
        {
          dayNumber: 1,
          identity: "Acceleration — 0-20m Sprint Mechanics",
          intent: "First-step power and acceleration mechanics: standing starts, 3-point starts, 10m and 20m reps with full recovery",
          neuralDemand: "high",
          primaryPattern: "locomotion",
          emphasizedPatterns: ["locomotion", "power", "hinge"],
          cnsFlow: [
            { role: "prep", description: "Sprint activation: 10 min warm-up → A-skip × 3 × 20m → broad jump × 3 sub-max → 3 × build-up strides" },
            { role: "power", description: "ACCELERATION: 6 × 10m (standing/3-point start) + 5 × 20m acceleration. 90 sec between 10m, 2 min between 20m. Every rep: 100%." },
            { role: "primary", description: "HINGE STRENGTH (post-sprint): Trap Bar Deadlift (4 × 3-5 @ 80-85%) — hip extension force application" },
            { role: "secondary", description: "Single-leg posterior chain: single-leg RDL (3 × 6 each side)" },
          ],
        },
        {
          dayNumber: 2,
          identity: "Strength — Lower + Speed-Strength",
          intent: "Strength training day — heavier compound loading with speed-strength component. No sprinting.",
          neuralDemand: "moderate",
          primaryPattern: "squat",
          emphasizedPatterns: ["squat", "power", "upper_push", "trunk"],
          cnsFlow: [
            { role: "prep", description: "General lower prep: hip mobility, glute activation, core activation sequence" },
            { role: "power", description: "SPEED-STRENGTH: Hang Power Clean or Trap Bar Jump (4 × 3 @ moderate load, maximum velocity intent) — bridges strength to sprint speed" },
            { role: "primary", description: "Squat: Back Squat (4 × 3-5 @ 80-87%) — strength foundation" },
            { role: "secondary", description: "Upper push + pull: Bench Press + Weighted Pull-Up (3 × 4-6 each) — structural balance" },
            { role: "trunk", description: "Trunk: Pallof press + dead bug (2 × each)" },
          ],
        },
        {
          dayNumber: 3,
          identity: "Max Velocity — Fly Sprints",
          intent: "Top-end speed: maximum velocity fly sprints with complete recovery. Not conditioning. Not intervals. One quality rep at a time.",
          neuralDemand: "high",
          primaryPattern: "locomotion",
          emphasizedPatterns: ["locomotion", "power"],
          cnsFlow: [
            { role: "prep", description: "Max velocity warm-up: 12 min — jog → A/B/C skip drill series × 2 → 4 × build-up strides at 70%, 80%, 90%, 95%" },
            { role: "power", description: "MAX VELOCITY: 4-5 × (20m build + 20m fly) at 100%. 4-5 min full recovery between each rep. True max-speed volume: 100-120m." },
            { role: "primary", description: "STRENGTH (post-sprint only): Hip Thrust (3 × 6-8) + Nordic Curl (2 × 4-6) — sprint-specific posterior chain protection" },
          ],
        },
        {
          dayNumber: 4,
          identity: "COD Speed + Upper Structural",
          intent: "Change of direction and reactive speed; upper-body structural strength for balance in lower-dominant speed program",
          neuralDemand: "moderate",
          primaryPattern: "locomotion",
          emphasizedPatterns: ["locomotion", "lateral", "upper_push", "upper_pull", "trunk"],
          cnsFlow: [
            { role: "prep", description: "COD prep: jog → lateral shuffle × 2 × 20m → backpedal × 2 → 5-10-5 drill at 60% × 2 → build-up strides × 2" },
            { role: "power", description: "COD BLOCK: 5-10-5 yard shuttle (5 reps) + T-drill (5 reps) with 90 sec recovery — deceleration mechanics and plant-and-drive" },
            { role: "primary", description: "Upper push: Bench Press or Overhead Press (3-4 × 5-8) — upper structural maintenance" },
            { role: "secondary", description: "Upper pull: Row or Chin-Up (3 × 5-8) — structural balance" },
            { role: "trunk", description: "Rotational + anti-rotation trunk: landmine rotation + Pallof press (2 × 8 each)" },
          ],
        },
      ];
    }
  }

  // ─── FOOTBALL — Acceleration + Force + Power + Repeat Effort ───────────────
  const isFootball = !!(sport && /\bfootball\b/i.test(sport) && !/soccer/.test(sport.toLowerCase()));
  if (isFootball) {
    if (daysPerWeek === 3) {
      // Variant C (seed ≥ 0.67): Hinge-priority — posterior chain leads, squat complements, power-extended Day 3
      if ((variationSeed ?? 0) >= 0.67) {
        return [
          {
            dayNumber: 1,
            identity: "Posterior Chain Force + Acceleration",
            intent: "Hinge-dominant lower session — deadlift pattern as the weekly anchor; sprint mechanics built into the session; single-leg posterior chain resilience",
            neuralDemand: "high",
            primaryPattern: "hinge",
            emphasizedPatterns: ["locomotion", "hinge", "unilateral_lower", "trunk"],
            cnsFlow: [
              { role: "prep", description: "Sprint activation: 8 min — A-skip × 2 × 20m → broad jump × 3 sub-max → 2 × build-up stride at 80%, 95%" },
              { role: "power", description: "ACCELERATION: 4 × 10m + 3 × 20m (3-point start or standing). 100% effort every rep. 90 sec between each." },
              { role: "primary", description: "HINGE ANCHOR: Trap Bar Deadlift or Conventional Deadlift (4 × 3-5 @ 82-88%) — posterior chain force base for collision and sprinting" },
              { role: "secondary", description: "Hip Thrust (3 × 5-8) + Nordic Hamstring Curl (3 × 4-6) — glute and hamstring tissue resilience" },
              { role: "unilateral", description: "Single-Leg RDL or Kickstand RDL (3 × 6-8 each side) — unilateral posterior chain for sprint asymmetry" },
              { role: "trunk", description: "Collision trunk: Suitcase Carry (3 × 30m each side) + Landmine Anti-Rotation (3 × 8 each) — trunk under load" },
            ],
            sportNotes: "Football hinge day: Trap Bar DL is preferred over Conventional DL for athletic position transfer — hip hinge mechanics mirror acceleration mechanics",
          },
          {
            dayNumber: 2,
            identity: "Upper Structural Strength + Power",
            intent: "Press/pull balance for collision-ready upper body; upper explosive work for block shedding; anti-extension trunk integrity",
            neuralDemand: "moderate",
            primaryPattern: "upper_push",
            emphasizedPatterns: ["upper_push", "upper_pull", "trunk", "rotational"],
            cnsFlow: [
              { role: "prep", description: "Upper activation: band pull-apart × 3 × 15, wall slide × 2 × 10, scapular circles" },
              { role: "power", description: "UPPER EXPLOSIVE: Med Ball Chest Throw (4 × 5) or Push Press (4 × 3) — horizontal and vertical upper power for contact" },
              { role: "primary", description: "Horizontal or incline press (4 × 4-6 @ 78-85%) — collision-ready chest and shoulder strength" },
              { role: "secondary", description: "Horizontal pull: Barbell Row or T-Bar Row (4 × 5-8) — scapular balance and posterior shoulder health" },
              { role: "trunk", description: "Anti-extension trunk: Ab Wheel Rollout (3 × 6-8) + Farmer Carry (3 × 30m) — trunk stiffness for contact" },
            ],
            sportNotes: "Football upper: match pull volume to push volume exactly — contact sport shoulder health depends on balanced loading",
          },
          {
            dayNumber: 3,
            identity: "Squat Strength + Unilateral Power + Conditioning",
            intent: "Bilateral squat strength as secondary lower anchor; single-leg power expression; anaerobic repeat effort football conditioning",
            neuralDemand: "high",
            primaryPattern: "squat",
            emphasizedPatterns: ["power", "squat", "unilateral_lower", "trunk", "locomotion"],
            cnsFlow: [
              { role: "prep", description: "Lower power activation: box jump × 3 sub-max → lateral bound × 2 × 3 each" },
              { role: "power", description: "CONTRAST PAIR: Heavy Squat variation (4 × 2-3 @ 85-90%) → Box Jump or Vertical Jump (4 × 3-4) with 4-5 min PAP window between lift and jump" },
              { role: "primary", description: "UNILATERAL POWER: Step-Up Jump or Split Squat Jump (3 × 5 each side) — single-leg force application mirroring cut and push-off mechanics" },
              { role: "secondary", description: "Sled Push (4 × 20m) — horizontal force transfer; resisted acceleration pattern" },
              { role: "trunk", description: "FOOTBALL CONDITIONING FINISHER: 3 × 5 × 20m shuttle sprints at 100% with 20 sec rest within sets, 3 min between sets. ANAEROBIC — not endurance." },
            ],
            sportNotes: "Football squat day: contrast pair for PAP + sled work + conditioning — combines force development and sport-specific work capacity in one session",
          },
        ];
      }

      // Variant B (seed ≥ 0.33): Power-extended Day 1 — explosive output leads the week
      if ((variationSeed ?? 0) >= 0.33) {
        return [
          {
            dayNumber: 1,
            identity: "Power Development + Lower Strength",
            intent: "Rate of force development via contrast pairs; bilateral lower strength as the potentiation base; anaerobic capacity conditioning — all in one high-CNS session",
            neuralDemand: "high",
            primaryPattern: "power",
            emphasizedPatterns: ["power", "squat", "hinge", "trunk", "locomotion"],
            cnsFlow: [
              { role: "prep", description: "CNS activation: dynamic lower prep → sub-max broad jump × 3 → build-up stride × 2 at 80%, 90%" },
              { role: "power", description: "CONTRAST PAIR A: Heavy bilateral compound (4 × 2-3 @ 85-90%) → explosive jump or bound (4 × 3-4) with 4-min PAP window. This pair IS the primary power output of the session." },
              { role: "primary", description: "SECOND CONTRAST: Hex Bar or Trap Bar jump (3 × 4 @ 30-35% BW) → Med Ball Overhead Scoop Toss (3 × 5) — speed-strength and triple extension development" },
              { role: "secondary", description: "Posterior chain tissue: Nordic Hamstring Curl (3 × 4-6) + Hip Thrust (3 × 8-10) — resilience for sprint demand" },
              { role: "trunk", description: "Loaded carry: Farmer Carry (3 × 30m) + Pallof Press (2 × 10 each) — trunk bracing under load" },
            ],
            sportNotes: "Football: Power FIRST — rate of force development requires a fresh CNS. This session uses post-activation potentiation protocols to peak neuromuscular output.",
          },
          {
            dayNumber: 2,
            identity: "Upper Structural Strength + Vertical Pull",
            intent: "Vertical and horizontal pull as the session anchor; press complement for structural balance; collision-specific trunk work",
            neuralDemand: "moderate",
            primaryPattern: "upper_pull",
            emphasizedPatterns: ["upper_push", "upper_pull", "trunk"],
            cnsFlow: [
              { role: "prep", description: "Upper prep: scapular activation, band pull-apart, face pull warm-up (2 × 15)" },
              { role: "power", description: "UPPER EXPLOSIVE: Med Ball Chest Throw (3 × 5) — horizontal power expression for block shedding" },
              { role: "primary", description: "Vertical pull anchor (4 × 4-6) — weighted pull-up, lat pulldown, or heavy cable row for structural back strength" },
              { role: "secondary", description: "Horizontal press complement (3 × 5-8) — bench or dumbbell press to balance the vertical pull session" },
              { role: "trunk", description: "Anti-rotation: Suitcase Carry (3 × 30m each) + Ab Wheel Rollout (3 × 6-8) — collision trunk integrity" },
            ],
            sportNotes: "Football upper pull day: vertical pull leads for scapular strength — contact athletes need posterior shoulder development equal to pressing",
          },
          {
            dayNumber: 3,
            identity: "Acceleration + Bilateral Squat + Unilateral",
            intent: "Sprint mechanics first; bilateral squat strength as secondary lower anchor; unilateral force production and posterior chain support",
            neuralDemand: "high",
            primaryPattern: "squat",
            emphasizedPatterns: ["locomotion", "squat", "unilateral_lower", "trunk"],
            cnsFlow: [
              { role: "prep", description: "Sprint warm-up: 10 min — jog → A-skip × 2 → B-skip × 2 → build-up strides × 3 at 70%, 85%, 95%" },
              { role: "power", description: "ACCELERATION BLOCK: 5 × 10m + 4 × 20m. 100% intent. Full recovery between reps (90 sec for 10m, 2 min for 20m)." },
              { role: "primary", description: "Bilateral squat primary (4 × 3-6 @ 78-85%) — lower force production complement to Day 1 hinge" },
              { role: "secondary", description: "Posterior chain complement: Romanian DL (3 × 6-8) — hinge reinforcement at moderate intensity" },
              { role: "unilateral", description: "Unilateral lower (3 × 6-8 each side) — single-leg stability and positional control for football cut mechanics" },
              { role: "trunk", description: "FOOTBALL CONDITIONING: 6-8 × 20m sprints at 100% with 90 sec full rest. ANAEROBIC — true speed work, not endurance." },
            ],
            sportNotes: "Football squat + sprint day: sprints first, strength second — acceleration quality degrades if done after heavy lifting",
          },
        ];
      }

      // Variant A (seed < 0.33): Original — Acceleration + Squat leads, Upper structural, Power day closes
      return [
        {
          dayNumber: 1,
          identity: "Acceleration + Lower Force Production",
          intent: "Sprint mechanics (0–20m) + bilateral lower-body strength — the two defining football physical qualities",
          neuralDemand: "high",
          primaryPattern: "squat",
          emphasizedPatterns: ["locomotion", "squat", "hinge", "trunk"],
          cnsFlow: [
            { role: "prep", description: "Sprint activation: 10 min — A-skip × 2 × 20m → broad jump × 3 sub-max → build-up strides × 3 at 70%, 85%, 95%" },
            { role: "power", description: "ACCELERATION: 5 × 10m + 4 × 20m with 90 sec between 10m and 2 min between 20m. 100% effort every rep. Standing or 3-point start." },
            { role: "primary", description: "LOWER FORCE: Heavy bilateral compound squat (4 × 3-5 @ 80-87%) — the strength foundation for collision and acceleration" },
            { role: "secondary", description: "Posterior chain support: Romanian DL or Hip Thrust (3 × 5-8) — hamstring and glute resilience for sprint demand" },
            { role: "trunk", description: "Collision trunk: Loaded Carry complex (3 × 30m) + Anti-rotation work (3 × 10 each side) — trunk bracing for contact" },
          ],
          sportNotes: "Football: Acceleration + heavy lower on the same day — force application in the gym mirrors force application on the field",
        },
        {
          dayNumber: 2,
          identity: "Upper Structural Strength",
          intent: "Horizontal press and pull balance for collision-ready upper body — NOT bodybuilding volume",
          neuralDemand: "moderate",
          primaryPattern: "upper_push",
          emphasizedPatterns: ["upper_push", "upper_pull", "trunk", "rotational"],
          cnsFlow: [
            { role: "prep", description: "Upper prep: scapular activation, band pull-apart × 3 × 15, wall slide × 2 × 10" },
            { role: "power", description: "EXPLOSIVE PUSH: Med ball chest throw (4 × 5) or explosive push-up (4 × 4) — upper power for shedding blocks and contact" },
            { role: "primary", description: "Horizontal press (4 × 4-6 @ 80%) — collision-ready chest and shoulder development" },
            { role: "secondary", description: "Horizontal pull (4 × 5-8) — scapular stability and shoulder health balance" },
            { role: "trunk", description: "Rotational trunk: Landmine Rotation (3 × 8 each) + Anti-extension carry (3 × 30m)" },
          ],
          sportNotes: "Football upper: balanced press/pull — contact athletes cannot have press-dominant upper body imbalance",
        },
        {
          dayNumber: 3,
          identity: "Power Development + Repeat Effort",
          intent: "Contrast training and plyometrics for rate of force development; anaerobic repeat effort conditioning — football-specific",
          neuralDemand: "high",
          primaryPattern: "power",
          emphasizedPatterns: ["power", "hinge", "trunk", "locomotion"],
          cnsFlow: [
            { role: "prep", description: "Power activation: dynamic lower prep → box jump (2 × 3 sub-max)" },
            { role: "power", description: "CONTRAST PAIR: Heavy hinge (4 × 2-3 @ 85-90%) → explosive jump (4 × 4) with 4 min PAP window — rate of force development" },
            { role: "primary", description: "SECOND POWER PAIR: Heavy Sled Push (4 × 20m) → Med Ball Overhead Scoop Toss (4 × 5) — horizontal force application transfer" },
            { role: "secondary", description: "Nordic Hamstring Curl (3 × 4-6) — mandatory for sprint resilience" },
            { role: "trunk", description: "CONDITIONING FINISHER: REPEAT EFFORT — 6–8 × 20m sprints at 100% with 90 sec rest. ANAEROBIC CAPACITY. 2 min between sets of 3." },
          ],
          sportNotes: "Football power day: contrast pairs for RFD + anaerobic repeat effort conditioning — NOT aerobic endurance conditioning",
        },
      ];
    }
    if (daysPerWeek === 4) {
      return [
        {
          dayNumber: 1,
          identity: "Acceleration + Lower Force Production",
          intent: "Sprint mechanics + heavy bilateral lower strength — the foundation football session",
          neuralDemand: "high",
          primaryPattern: "squat",
          emphasizedPatterns: ["locomotion", "squat", "hinge", "trunk"],
          cnsFlow: [
            { role: "prep", description: "Sprint prep: 10 min — A-skip + B-skip + build-up strides × 3" },
            { role: "power", description: "ACCELERATION: 6 × 10m + 5 × 20m with full recovery. 3-point or standing start. 100% every rep." },
            { role: "primary", description: "Back Squat or Trap Bar DL (4 × 3-5 @ 82-88%) — lower force production foundation" },
            { role: "secondary", description: "Romanian DL or Nordic Hamstring Curl (3 × 5-8) — posterior chain resilience" },
            { role: "trunk", description: "Pallof Press (3 × 10 each) + Loaded Carry (3 × 30m)" },
          ],
          sportNotes: "Football Day 1: Sprint before lifting — always. Acceleration mechanics are the highest priority.",
        },
        {
          dayNumber: 2,
          identity: "Upper Structural Strength",
          intent: "Bilateral upper pressing + pulling balance — structural strength for collision sport demands",
          neuralDemand: "moderate",
          primaryPattern: "upper_push",
          emphasizedPatterns: ["upper_push", "upper_pull", "trunk"],
          cnsFlow: [
            { role: "prep", description: "Upper activation: scapular prep, band pull-apart, face pull warm-up" },
            { role: "power", description: "Med Ball Chest Throw (4 × 5) — explosive horizontal power for contact" },
            { role: "primary", description: "Bench Press (4 × 4-6 @ 80%) + Incline Dumbbell Press (3 × 6-8) — collision upper strength" },
            { role: "secondary", description: "Barbell Row + Face Pull (4 × 6-8 each) — scapular balance and shoulder health" },
            { role: "trunk", description: "Landmine Rotation (3 × 8 each side) — rotational trunk for contact sport demands" },
          ],
          sportNotes: "Football upper: equal pressing and pulling volume — contact sport demands balanced shoulder health",
        },
        {
          dayNumber: 3,
          identity: "Power Development — Contrast + Plyometric",
          intent: "Rate of force development via contrast pairs and plyometrics — explosive performance for play initiation",
          neuralDemand: "high",
          primaryPattern: "power",
          emphasizedPatterns: ["power", "squat", "hinge", "trunk"],
          cnsFlow: [
            { role: "prep", description: "CNS prep: broad jump × 3 sub-max → A-skip × 20m → build-up stride × 1" },
            { role: "power", description: "CONTRAST PAIR A: Front Squat (4 × 3 @ 80%) → Box Jump (4 × 4 BW) with 4 min PAP window" },
            { role: "primary", description: "CONTRAST PAIR B: Power Clean or Hang Clean (4 × 3 @ 70-75%) → Med Ball Overhead Scoop Toss (4 × 5)" },
            { role: "secondary", description: "Unilateral power: Split Squat jump or Step-Up (2 × 5 each side) — single-leg force application" },
            { role: "trunk", description: "Anti-rotation: Pallof Press + Dead Bug (2-3 sets each)" },
          ],
          sportNotes: "Football power: contrast pairs develop the RFD needed for explosive play — acceleration off the line mirrors PAP mechanics",
        },
        {
          dayNumber: 4,
          identity: "Repeat Effort Conditioning + Posterior Chain Tissue",
          intent: "Anaerobic capacity conditioning (football-specific) + posterior chain tissue support — resilience and conditioning",
          neuralDemand: "moderate",
          primaryPattern: "hinge",
          emphasizedPatterns: ["locomotion", "hinge", "unilateral_lower", "trunk"],
          cnsFlow: [
            { role: "prep", description: "Movement prep: jog + dynamic drill series + deceleration mechanic drill" },
            { role: "power", description: "FOOTBALL CONDITIONING: REPEAT SPRINT ABILITY — 3 sets × 5 × 20m sprints with 20 sec intra-set rest and 3 min between sets. 100% sprint effort. NOT endurance conditioning." },
            { role: "primary", description: "Posterior chain tissue: Romanian DL (3 × 8-10) + Hip Thrust (3 × 10) — hamstring and glute maintenance for sprint demand" },
            { role: "secondary", description: "Nordic Hamstring Curl (3 × 5-8) — mandatory hamstring resilience. Non-negotiable for sprint athletes." },
            { role: "trunk", description: "Loaded Carry complex: Farmer carry + Cross-body carry (3 × 30m each) — trunk integrity under fatigue" },
          ],
          sportNotes: "Football conditioning: SHORT sprints with FULL rest — NOT soccer-style long aerobic work. Football repeat effort is anaerobic.",
        },
      ];
    }
  }

  // ─── BASKETBALL — Reactive Power + Decel + Upper Balance + Repeat Power ─────
  const isBasketball = !!(sport && /basketball/i.test(sport));
  if (isBasketball) {
    if (daysPerWeek === 3) {
      // Variant C (seed ≥ 0.67): Deceleration + elastic SSC leads Day 1
      if ((variationSeed ?? 0) >= 0.67) {
        return [
          {
            dayNumber: 1,
            identity: "Deceleration Mechanics + Elastic SSC + Posterior Chain",
            intent: "Depth jump and lateral bound as the primary elastic stimulus; Nordic hamstring curl for tendon resilience; single-leg squat to close — decel quality anchors the week",
            neuralDemand: "high",
            primaryPattern: "power",
            emphasizedPatterns: ["power", "unilateral_lower", "lateral", "trunk"],
            cnsFlow: [
              { role: "prep", description: "Decel prep: snap-down drill × 3 → lateral shuffle × 2 × 15m → single-leg landing hold × 3 each side" },
              { role: "power", description: "ELASTIC SSC BLOCK: Depth Jump (4 × 4) — step off box, land, and IMMEDIATELY rebound at max height. Contact time is the metric. Then Lateral Bound (3 × 5 each side) — reactive lateral stiffness." },
              { role: "primary", description: "Nordic Hamstring Curl (3 × 5-8) — tendon resilience mandatory for basketball athletes. This IS the primary tissue protection exercise of the session." },
              { role: "secondary", description: "Single-Leg Squat or Pistol Squat (3 × 5-8 each side) — unilateral vertical force and deceleration mechanics" },
              { role: "trunk", description: "Anti-rotation: Half-Kneeling Pallof Press (3 × 10 each side) + Copenhagen Plank (3 × 20 sec each) — groin and adductor resilience" },
            ],
            sportNotes: "Basketball Variant C: deceleration and elastic SSC quality anchors Day 1 — patellar tendon and ACL resilience built here, not just vertical power",
          },
          {
            dayNumber: 2,
            identity: "Upper Structural + Trunk",
            intent: "Press/pull balance for shoulder health; rotational and anti-rotation trunk for contact and landing stability",
            neuralDemand: "moderate",
            primaryPattern: "upper_push",
            emphasizedPatterns: ["upper_push", "upper_pull", "trunk", "rotational"],
            cnsFlow: [
              { role: "prep", description: "Upper activation: band pull-apart × 3, wall slide × 2, thoracic extension" },
              { role: "power", description: "Med Ball Rotational Throw (3 × 5 each) or Chest Throw — upper rotational power for contact and outlet passes" },
              { role: "primary", description: "Dumbbell Press (4 × 6-8) — shoulder-health-conscious horizontal press" },
              { role: "secondary", description: "Chin-Up or Cable Row (4 × 6-8) — matching pull volume for shoulder joint health" },
              { role: "trunk", description: "Rotational trunk: Cable Chop (3 × 8 each) + Copenhagen Plank (3 × 20-30 sec each) — adductor and groin resilience" },
            ],
            sportNotes: "Basketball upper: shoulder health priority — dumbbell over barbell for joint tolerance; face pull in warm-up; balanced push:pull",
          },
          {
            dayNumber: 3,
            identity: "Reactive Plyometric + Lower Strength + Conditioning",
            intent: "Vertical and horizontal power via reactive jumps; bilateral lower strength; repeat power conditioning — distinct from Day 1 decel emphasis",
            neuralDemand: "moderate",
            primaryPattern: "power",
            emphasizedPatterns: ["power", "squat", "unilateral_lower", "locomotion"],
            cnsFlow: [
              { role: "prep", description: "Jump prep: 2 × sub-max CMJ → 3 × broad jump sub-max" },
              { role: "power", description: "REACTIVE PLYOMETRIC BLOCK: Box Jump (3 × 4) → Broad Jump (3 × 4) — maximum height/distance every rep. 90 sec between exercises." },
              { role: "primary", description: "Trap Bar Deadlift or Goblet Squat (4 × 4-6) — bilateral lower strength foundation" },
              { role: "secondary", description: "RFESS (3 × 6 each side) — single-leg basketball-specific loading" },
              { role: "trunk", description: "CONDITIONING: REPEAT POWER — 6–8 × court sprint (baseline to half and back) at 100% with 60 sec rest. NOT endurance — explosive court transitions." },
            ],
            sportNotes: "Basketball Day 3: plyometric + strength + conditioning — closes the week with full-spectrum power expression",
          },
        ];
      }

      // Variant B (seed ≥ 0.33): Strength-first + bilateral lower anchor leads Day 1
      if ((variationSeed ?? 0) >= 0.33) {
        return [
          {
            dayNumber: 1,
            identity: "Lower Bilateral Strength + Power Expression",
            intent: "Heavy bilateral lower strength as the session anchor; jump expression after potentiation; single-leg loading and tendon care — strength-first structure this week",
            neuralDemand: "high",
            primaryPattern: "squat",
            emphasizedPatterns: ["squat", "power", "unilateral_lower", "trunk"],
            cnsFlow: [
              { role: "prep", description: "CNS lower prep: glute activation → 3 × sub-max box step-up → hip CARs × 5 each direction" },
              { role: "primary", description: "BILATERAL LOWER ANCHOR: Trap Bar Deadlift or Front Squat (4 × 3-5 @ 80-87%) — joint-friendly maximal lower force production. This is the strength anchor for the week." },
              { role: "power", description: "POST-POTENTIATION JUMP: Box Jump (4 × 3) after rest from primary — PAP window. Then RFESS Jump (3 × 4 each side) — single-leg power expression." },
              { role: "secondary", description: "Nordic Hamstring Curl (3 × 5-8) + Copenhagen Plank (3 × 20 sec each) — mandatory tendon and adductor care after heavy loading" },
              { role: "trunk", description: "Anti-rotation: Pallof Press (3 × 10 each side) — trunk stiffness under residual fatigue" },
            ],
            sportNotes: "Basketball Variant B: strength-first Day 1 — bilateral lower is the anchor, jump expression follows via PAP, tissue care closes the session",
          },
          {
            dayNumber: 2,
            identity: "Upper Structural + Trunk",
            intent: "Press/pull balance for shoulder health; rotational and anti-rotation trunk for contact and landing stability",
            neuralDemand: "moderate",
            primaryPattern: "upper_push",
            emphasizedPatterns: ["upper_push", "upper_pull", "trunk", "rotational"],
            cnsFlow: [
              { role: "prep", description: "Upper activation: band pull-apart × 3, wall slide × 2, thoracic extension" },
              { role: "power", description: "Med Ball Rotational Throw (3 × 5 each) or Chest Throw — upper rotational power for contact and outlet passes" },
              { role: "primary", description: "Dumbbell Press (4 × 6-8) — shoulder-health-conscious horizontal press" },
              { role: "secondary", description: "Chin-Up or Cable Row (4 × 6-8) — matching pull volume for shoulder joint health" },
              { role: "trunk", description: "Rotational trunk: Cable Chop (3 × 8 each) + Copenhagen Plank (3 × 20-30 sec each) — adductor and groin resilience" },
            ],
            sportNotes: "Basketball upper: shoulder health priority — dumbbell over barbell for joint tolerance; face pull in warm-up; balanced push:pull",
          },
          {
            dayNumber: 3,
            identity: "Deceleration + Landing Mechanics + Repeat Power Conditioning",
            intent: "Landing mechanics and reactive deceleration — distinct from the strength-first Day 1; basketball conditioning: repeat power efforts, NOT aerobic endurance",
            neuralDemand: "moderate",
            primaryPattern: "power",
            emphasizedPatterns: ["power", "unilateral_lower", "lateral", "locomotion"],
            cnsFlow: [
              { role: "prep", description: "Movement prep: lateral shuffle × 2 × 20m → backpedal → decel pattern × 2" },
              { role: "power", description: "DECELERATION + ELASTIC: Depth Jump (3 × 4) — land and IMMEDIATELY jump. Contact time is the metric. Then Lateral Bound (3 × 4 each side)" },
              { role: "primary", description: "Nordic Hamstring Curl (3 × 5-8) + Single-Leg RDL (3 × 8 each) — tendon resilience and hamstring load tolerance" },
              { role: "trunk", description: "CONDITIONING: REPEAT POWER — 6–8 × court sprint (baseline to half and back) at 100% with 60 sec rest. NOT endurance — explosive court transitions." },
            ],
            sportNotes: "Basketball: deceleration and landing mechanics are as important as acceleration — this session trains the qualities that prevent patellar tendon and ACL injuries",
          },
        ];
      }

      // Variant A (seed < 0.33): Reactive plyometric first — original structure
      return [
        {
          dayNumber: 1,
          identity: "Reactive Plyometric + Lower Strength",
          intent: "Vertical and horizontal power via reactive jumps; bilateral lower strength as the force foundation — highest CNS session of the week",
          neuralDemand: "high",
          primaryPattern: "power",
          emphasizedPatterns: ["power", "squat", "unilateral_lower", "trunk"],
          cnsFlow: [
            { role: "prep", description: "CNS jump prep: 2 × box step-up → 3 × sub-max countermovement jump → lateral shuffle × 2" },
            { role: "power", description: "REACTIVE PLYOMETRIC BLOCK: Box Jump (4 × 4) → Broad Jump (4 × 4) — maximum height/distance intent every rep. 90 sec between exercises." },
            { role: "primary", description: "Trap Bar Deadlift or Goblet Squat (4 × 4-6) — joint-friendly bilateral lower strength for vertical power foundation" },
            { role: "secondary", description: "RFESS or Single-Leg Squat (3 × 6 each side) — single-leg basketball-specific loading" },
            { role: "trunk", description: "Anti-extension + anti-rotation: Dead Bug (3 × 8) + Pallof Press (3 × 10 each)" },
          ],
          sportNotes: "Basketball Day 1: Jumps first — explosive quality must be fresh. Trap bar DL over barbell squat for joint-friendly bilateral loading.",
        },
        {
          dayNumber: 2,
          identity: "Upper Structural + Trunk",
          intent: "Press/pull balance for shoulder health; rotational and anti-rotation trunk for contact and landing stability",
          neuralDemand: "moderate",
          primaryPattern: "upper_push",
          emphasizedPatterns: ["upper_push", "upper_pull", "trunk", "rotational"],
          cnsFlow: [
            { role: "prep", description: "Upper activation: band pull-apart × 3, wall slide × 2, thoracic extension" },
            { role: "power", description: "Med Ball Rotational Throw (3 × 5 each) or Chest Throw — upper rotational power for contact and outlet passes" },
            { role: "primary", description: "Dumbbell Press (4 × 6-8) — shoulder-health-conscious horizontal press" },
            { role: "secondary", description: "Chin-Up or Cable Row (4 × 6-8) — matching pull volume for shoulder joint health" },
            { role: "trunk", description: "Rotational trunk: Cable Chop (3 × 8 each) + Copenhagen Plank (3 × 20-30 sec each) — adductor and groin resilience" },
          ],
          sportNotes: "Basketball upper: shoulder health priority — dumbbell over barbell for joint tolerance; face pull in warm-up; balanced push:pull",
        },
        {
          dayNumber: 3,
          identity: "Deceleration + Landing Mechanics + Repeat Power Conditioning",
          intent: "Landing mechanics and reactive deceleration — distinct from pure strength; basketball conditioning: repeat power efforts, NOT aerobic endurance",
          neuralDemand: "moderate",
          primaryPattern: "power",
          emphasizedPatterns: ["power", "unilateral_lower", "lateral", "locomotion"],
          cnsFlow: [
            { role: "prep", description: "Movement prep: lateral shuffle × 2 × 20m → backpedal → decel pattern × 2" },
            { role: "power", description: "DECELERATION + ELASTIC: Depth Jump (3 × 4) — land and IMMEDIATELY jump. Contact time is the metric. Then Lateral Bound (3 × 4 each side)" },
            { role: "primary", description: "Nordic Hamstring Curl (3 × 5-8) + Single-Leg RDL (3 × 8 each) — tendon resilience and hamstring load tolerance" },
            { role: "trunk", description: "CONDITIONING: REPEAT POWER — 6–8 × court sprint (baseline to half and back) at 100% with 60 sec rest. NOT endurance — explosive court transitions." },
          ],
          sportNotes: "Basketball: deceleration and landing mechanics are as important as acceleration — this session trains the qualities that prevent patellar tendon and ACL injuries",
        },
      ];
    }
    if (daysPerWeek === 4) {
      // Variant C (seed ≥ 0.67): Strength-led Day 1 — bilateral anchor + post-PAP jump
      if ((variationSeed ?? 0) >= 0.67) {
        return [
          {
            dayNumber: 1,
            identity: "Lower Bilateral Strength + Post-PAP Jump",
            intent: "Heavy bilateral lower as the session anchor; box jump after full rest for PAP expression; single-leg and tendon care — strength-first structure this rotation",
            neuralDemand: "high",
            primaryPattern: "squat",
            emphasizedPatterns: ["squat", "power", "unilateral_lower", "trunk"],
            cnsFlow: [
              { role: "prep", description: "Lower CNS prep: hip CARs → glute activation → 3 × sub-max CMJ (not exhaustive — just activating the jump pathway)" },
              { role: "primary", description: "BILATERAL LOWER ANCHOR: Trap Bar Deadlift or Front Squat (4 × 3-5 @ 80-87%) — foundational lower strength. This IS the session." },
              { role: "power", description: "POST-PAP JUMP: Box Jump (4 × 3 max height) → Broad Jump (3 × 4 max distance) — 4-5 min rest after the primary lift to peak potentiation window." },
              { role: "secondary", description: "RFESS (3 × 6 each side) — single-leg stability and asymmetry control" },
              { role: "trunk", description: "Copenhagen Plank (3 × 20-30 sec each side) + Dead Bug (3 × 8) — mandatory adductor and anti-extension care" },
            ],
            sportNotes: "Basketball Variant C 4-day: strength-first Day 1 — bilateral strength anchors the week, PAP jump follows, single-leg closes",
          },
          {
            dayNumber: 2,
            identity: "Upper Structural + Shoulder Health",
            intent: "Balanced pressing and pulling for shoulder joint longevity — NOT hypertrophy focus",
            neuralDemand: "moderate",
            primaryPattern: "upper_push",
            emphasizedPatterns: ["upper_push", "upper_pull", "trunk"],
            cnsFlow: [
              { role: "prep", description: "Shoulder prep: band pull-apart × 20 + face pull × 15 + wall slide × 10" },
              { role: "primary", description: "Dumbbell Press (4 × 6-8) + Landmine Press (3 × 8 each) — joint-friendly pressing patterns" },
              { role: "secondary", description: "Weighted Chin-Up (4 × 5-8) + Face Pull (3 × 15) — pull volume equals press volume for shoulder health" },
              { role: "trunk", description: "Rotational + anti-rotation: Pallof Press (3 × 10 each) + Cable Chop (3 × 8 each)" },
            ],
            sportNotes: "Basketball upper: equal push:pull volume — shoulder health determines career longevity",
          },
          {
            dayNumber: 3,
            identity: "Deceleration + Landing + Elastic Power",
            intent: "Landing mechanics, stretch-shortening cycle at full intensity, single-leg resilience — distinct from the strength-led Day 1",
            neuralDemand: "moderate",
            primaryPattern: "power",
            emphasizedPatterns: ["power", "unilateral_lower", "lateral", "trunk"],
            cnsFlow: [
              { role: "prep", description: "Decel prep: snap-down drill × 3 → lateral shuffle → backpedal break mechanic × 3" },
              { role: "power", description: "DEPTH JUMP (3 × 4) — step off, land, IMMEDIATELY jump. Develops elastic SSC. LATERAL BOUND (3 × 4 each) — reactive lateral power for defensive movements." },
              { role: "primary", description: "Nordic Hamstring Curl (3 × 5-6) — tendon resilience mandatory for basketball athletes" },
              { role: "secondary", description: "Single-Leg Squat or Pistol Squat (3 × 5-8 each side) — unilateral vertical force" },
              { role: "trunk", description: "Anti-rotation: Half-Kneeling Pallof + Copenhagen Plank (2-3 sets each)" },
            ],
            sportNotes: "Basketball deceleration day: teaches the landing mechanics and deceleration capacity that prevent patellar tendon and ACL injuries",
          },
          {
            dayNumber: 4,
            identity: "Repeat Power Conditioning + Mobility Support",
            intent: "Basketball-specific conditioning: repeat explosive efforts, NOT long aerobic work; mobility and tissue maintenance",
            neuralDemand: "moderate",
            primaryPattern: "locomotion",
            emphasizedPatterns: ["locomotion", "lateral", "trunk"],
            cnsFlow: [
              { role: "prep", description: "Court prep: jog → lateral shuffle × 2 → 3-cone drill at 60% × 2" },
              { role: "power", description: "BASKETBALL CONDITIONING: 8 × court sprint (full court and back) at 100% with 45-60 sec rest. EXPLOSIVE — not a jog. Add line drill complex if court available." },
              { role: "secondary", description: "Hip Thrust (3 × 10) + Calf Raise (3 × 15) — posterior chain and ankle tendon maintenance for jump athletes" },
              { role: "trunk", description: "Mobility: hip flexor stretch, ankle mobility, thoracic rotation + light core maintenance" },
            ],
            sportNotes: "Basketball conditioning: short explosive court efforts with full rest — mirrors game demands. NOT aerobic endurance.",
          },
        ];
      }

      // Variant B (seed ≥ 0.33): Deceleration + elastic SSC leads Day 1
      if ((variationSeed ?? 0) >= 0.33) {
        return [
          {
            dayNumber: 1,
            identity: "Deceleration + Elastic SSC + Posterior Chain",
            intent: "Depth jump and lateral bound as the elastic anchor; Nordic and single-leg squat for tendon resilience — decel quality leads this rotation",
            neuralDemand: "high",
            primaryPattern: "power",
            emphasizedPatterns: ["power", "unilateral_lower", "lateral", "trunk"],
            cnsFlow: [
              { role: "prep", description: "Decel activation: snap-down drill × 3 → single-leg landing hold × 3 each → lateral shuffle × 2 × 15m" },
              { role: "power", description: "ELASTIC SSC BLOCK: Depth Jump (4 × 4) — step off, land, IMMEDIATELY rebound at max height. Then Lateral Bound (4 × 4 each side) — reactive lateral stiffness for defensive change of direction." },
              { role: "primary", description: "Nordic Hamstring Curl (3 × 5-8) — tendon resilience. RFESS (3 × 6 each side) — single-leg force production for jump and decel." },
              { role: "secondary", description: "Hip Thrust (3 × 10) — posterior chain support and glute development for vertical power" },
              { role: "trunk", description: "Copenhagen Plank (3 × 25 sec each side) + Dead Bug (3 × 8) — adductor and anti-extension care" },
            ],
            sportNotes: "Basketball Variant B 4-day: decel + elastic SSC leads Day 1 — structural differentiation from reactive plyometric focus of Variant A",
          },
          {
            dayNumber: 2,
            identity: "Upper Structural + Shoulder Health",
            intent: "Balanced pressing and pulling for shoulder joint longevity — NOT hypertrophy focus",
            neuralDemand: "moderate",
            primaryPattern: "upper_push",
            emphasizedPatterns: ["upper_push", "upper_pull", "trunk"],
            cnsFlow: [
              { role: "prep", description: "Shoulder prep: band pull-apart × 20 + face pull × 15 + wall slide × 10" },
              { role: "primary", description: "Dumbbell Press (4 × 6-8) + Landmine Press (3 × 8 each) — joint-friendly pressing patterns" },
              { role: "secondary", description: "Weighted Chin-Up (4 × 5-8) + Face Pull (3 × 15) — pull volume equals press volume for shoulder health" },
              { role: "trunk", description: "Rotational + anti-rotation: Pallof Press (3 × 10 each) + Cable Chop (3 × 8 each)" },
            ],
            sportNotes: "Basketball upper: equal push:pull volume — shoulder health determines career longevity",
          },
          {
            dayNumber: 3,
            identity: "Reactive Plyometric + Lower Strength",
            intent: "Vertical and horizontal power via reactive jumps; bilateral lower strength — distinct jump-first structure from Day 1 decel emphasis",
            neuralDemand: "moderate",
            primaryPattern: "power",
            emphasizedPatterns: ["power", "squat", "unilateral_lower", "trunk"],
            cnsFlow: [
              { role: "prep", description: "Jump prep: 3 × sub-max CMJ → 2 × broad jump sub-max" },
              { role: "power", description: "BOX JUMP (4 × 4) → BROAD JUMP (4 × 4). Maximum height/distance. 90 sec between each exercise. Step down from box every time." },
              { role: "primary", description: "Trap Bar Deadlift (4 × 4-6 @ 75-82%) — foundational lower strength" },
              { role: "secondary", description: "RFESS (3 × 6 each side) — single-leg stability and asymmetry management" },
              { role: "trunk", description: "Copenhagen Plank (3 × 20-30 sec each side) + Dead Bug (3 × 8)" },
            ],
            sportNotes: "Basketball Day 3: reactive plyometric + bilateral strength — vertical power expression in contrast to Day 1 decel anchor",
          },
          {
            dayNumber: 4,
            identity: "Repeat Power Conditioning + Mobility Support",
            intent: "Basketball-specific conditioning: repeat explosive efforts, NOT long aerobic work; mobility and tissue maintenance",
            neuralDemand: "moderate",
            primaryPattern: "locomotion",
            emphasizedPatterns: ["locomotion", "lateral", "trunk"],
            cnsFlow: [
              { role: "prep", description: "Court prep: jog → lateral shuffle × 2 → 3-cone drill at 60% × 2" },
              { role: "power", description: "BASKETBALL CONDITIONING: 8 × court sprint (full court and back) at 100% with 45-60 sec rest. EXPLOSIVE — not a jog. Add line drill complex if court available." },
              { role: "secondary", description: "Hip Thrust (3 × 10) + Calf Raise (3 × 15) — posterior chain and ankle tendon maintenance for jump athletes" },
              { role: "trunk", description: "Mobility: hip flexor stretch, ankle mobility, thoracic rotation + light core maintenance" },
            ],
            sportNotes: "Basketball conditioning: short explosive court efforts with full rest — mirrors game demands. NOT aerobic endurance.",
          },
        ];
      }

      // Variant A (seed < 0.33): Reactive plyometric first — original structure
      return [
        {
          dayNumber: 1,
          identity: "Reactive Plyometric + Lower Strength",
          intent: "Vertical power first — jumps before lifting. Bilateral lower strength as the power foundation.",
          neuralDemand: "high",
          primaryPattern: "power",
          emphasizedPatterns: ["power", "squat", "unilateral_lower", "trunk"],
          cnsFlow: [
            { role: "prep", description: "Jump prep: 3 × sub-max CMJ → 2 × broad jump" },
            { role: "power", description: "BOX JUMP (4 × 4) → BROAD JUMP (4 × 4). Maximum height/distance. 90 sec between each exercise. Step down from box every time." },
            { role: "primary", description: "Trap Bar Deadlift (4 × 4-6 @ 75-82%) — foundational lower strength" },
            { role: "secondary", description: "RFESS (3 × 6 each side) — single-leg stability and asymmetry management" },
            { role: "trunk", description: "Copenhagen Plank (3 × 20-30 sec each side) + Dead Bug (3 × 8)" },
          ],
          sportNotes: "Basketball: Box jump before the heavy lift — CNS must be fresh for reactive power expression",
        },
        {
          dayNumber: 2,
          identity: "Upper Structural + Shoulder Health",
          intent: "Balanced pressing and pulling for shoulder joint longevity — NOT hypertrophy focus",
          neuralDemand: "moderate",
          primaryPattern: "upper_push",
          emphasizedPatterns: ["upper_push", "upper_pull", "trunk"],
          cnsFlow: [
            { role: "prep", description: "Shoulder prep: band pull-apart × 20 + face pull × 15 + wall slide × 10" },
            { role: "primary", description: "Dumbbell Press (4 × 6-8) + Landmine Press (3 × 8 each) — joint-friendly pressing patterns" },
            { role: "secondary", description: "Weighted Chin-Up (4 × 5-8) + Face Pull (3 × 15) — pull volume equals press volume for shoulder health" },
            { role: "trunk", description: "Rotational + anti-rotation: Pallof Press (3 × 10 each) + Cable Chop (3 × 8 each)" },
          ],
          sportNotes: "Basketball upper: equal push:pull volume — shoulder health determines career longevity",
        },
        {
          dayNumber: 3,
          identity: "Deceleration + Landing + Elastic Power",
          intent: "Landing mechanics, stretch-shortening cycle at full intensity, single-leg resilience — distinct from Day 1 plyometric emphasis",
          neuralDemand: "moderate",
          primaryPattern: "power",
          emphasizedPatterns: ["power", "unilateral_lower", "lateral", "trunk"],
          cnsFlow: [
            { role: "prep", description: "Decel prep: snap-down drill × 3 → lateral shuffle → backpedal break mechanic × 3" },
            { role: "power", description: "DEPTH JUMP (3 × 4) — step off, land, IMMEDIATELY jump. Develops elastic SSC. LATERAL BOUND (3 × 4 each) — reactive lateral power for defensive movements." },
            { role: "primary", description: "Nordic Hamstring Curl (3 × 5-6) — tendon resilience mandatory for basketball athletes" },
            { role: "secondary", description: "Single-Leg Squat or Pistol Squat (3 × 5-8 each side) — unilateral vertical force" },
            { role: "trunk", description: "Anti-rotation: Half-Kneeling Pallof + Copenhagen Plank (2-3 sets each)" },
          ],
          sportNotes: "Basketball deceleration day: teaches the landing mechanics and deceleration capacity that prevent patellar tendon and ACL injuries",
        },
        {
          dayNumber: 4,
          identity: "Repeat Power Conditioning + Mobility Support",
          intent: "Basketball-specific conditioning: repeat explosive efforts, NOT long aerobic work; mobility and tissue maintenance",
          neuralDemand: "moderate",
          primaryPattern: "locomotion",
          emphasizedPatterns: ["locomotion", "lateral", "trunk"],
          cnsFlow: [
            { role: "prep", description: "Court prep: jog → lateral shuffle × 2 → 3-cone drill at 60% × 2" },
            { role: "power", description: "BASKETBALL CONDITIONING: 8 × court sprint (full court and back) at 100% with 45-60 sec rest. EXPLOSIVE — not a jog. Add line drill complex if court available." },
            { role: "secondary", description: "Hip Thrust (3 × 10) + Calf Raise (3 × 15) — posterior chain and ankle tendon maintenance for jump athletes" },
            { role: "trunk", description: "Mobility: hip flexor stretch, ankle mobility, thoracic rotation + light core maintenance" },
          ],
          sportNotes: "Basketball conditioning: short explosive court efforts with full rest — mirrors game demands. NOT aerobic endurance.",
        },
      ];
    }
  }

  // ─── SOCCER — Aerobic + RSA + Hamstring Resilience + Tissue Protection ──────
  const isSoccer = !!(sport && /soccer|association football/i.test(sport));
  if (isSoccer) {
    if (daysPerWeek === 3) {
      // Variant C (seed ≥ 0.67): Strength-led Day 1 — bilateral lower strength + Nordic emphasis
      if ((variationSeed ?? 0) >= 0.67) {
        return [
          {
            dayNumber: 1,
            identity: "Bilateral Lower Strength + Hamstring Resilience",
            intent: "Trap bar deadlift or bilateral squat as the lower anchor; Nordic hamstring curl mandatory; Copenhagen plank and single-leg — strength-first structure for soccer this week",
            neuralDemand: "high",
            primaryPattern: "squat",
            emphasizedPatterns: ["squat", "hinge", "unilateral_lower", "trunk"],
            cnsFlow: [
              { role: "prep", description: "Lower strength prep: hip CARs × 5 each direction, glute activation series, ankle stiffness drill" },
              { role: "primary", description: "BILATERAL LOWER ANCHOR: Trap Bar Deadlift or Back Squat (4 × 4-6 @ 78-85%) — structural lower force base. Strength-first Day 1 this week." },
              { role: "secondary", description: "HAMSTRING RESILIENCE: Nordic Hamstring Curl (4 × 5-8) — MANDATORY. Most common soccer injury prevention. Non-negotiable regardless of Day 1 structure." },
              { role: "unilateral", description: "Single-Leg RDL (3 × 8 each side) + Hip Thrust (3 × 10) — posterior chain resilience for sprint and deceleration" },
              { role: "trunk", description: "ADDUCTOR: Copenhagen Plank (3 × 25 sec each side) + Pallof Press (2 × 10 each side) — mandatory every lower session" },
            ],
            sportNotes: "Soccer Variant C: strength-led Day 1 — bilateral lower is the anchor this week, Nordic and Copenhagen still mandatory, no sprinting",
          },
          {
            dayNumber: 2,
            identity: "Upper Structural + Trunk + Single-Leg Support",
            intent: "Upper strength balance + rotational trunk + unilateral lower support — structural maintenance in a lower-dominant sport",
            neuralDemand: "moderate",
            primaryPattern: "upper_push",
            emphasizedPatterns: ["upper_push", "upper_pull", "trunk", "unilateral_lower"],
            cnsFlow: [
              { role: "prep", description: "General activation: hip mobility, thoracic rotation, shoulder prep" },
              { role: "primary", description: "Upper push + pull: Bench Press or Dumbbell Press (3 × 6-8) + Bent Row (3 × 6-8) — structural balance for aerial duels and contact" },
              { role: "secondary", description: "Vertical pull: Chin-Up or Lat Pulldown (3 × 8-10) + Face Pull (3 × 15) — scapular health" },
              { role: "trunk", description: "Rotational trunk: Pallof Press (3 × 10 each) + Lateral Lunge (3 × 8 each side) — adductor and COD support" },
            ],
            sportNotes: "Soccer upper: relatively low volume — focus on structural balance for aerial duels and shoulder health",
          },
          {
            dayNumber: 3,
            identity: "Acceleration + Repeat Sprint Conditioning",
            intent: "Sprint mechanics (0–20m) + RSA conditioning — all sprint work this week consolidated with tissue maintenance",
            neuralDemand: "high",
            primaryPattern: "locomotion",
            emphasizedPatterns: ["locomotion", "hinge", "lateral"],
            cnsFlow: [
              { role: "prep", description: "Sprint warm-up: 8 min jog → A-skip × 2 × 20m → build-up strides × 3 at 70%, 85%, 95%" },
              { role: "power", description: "ACCELERATION: 4 × 10m + 3 × 20m at 100% intent with full rest — sprint mechanics first, freshest CNS goes to acceleration quality." },
              { role: "primary", description: "REPEAT SPRINT ABILITY: 3 sets × 4 × 20-30m with 20 sec intra-set rest, 3 min between sets. Real effort, real rest." },
              { role: "trunk", description: "Lower tissue maintenance: Nordic Hamstring Curl (2 × 6) + Copenhagen Plank (2 × 25 sec each) + Calf Raise (3 × 15) — mandatory tissue care after sprint session" },
            ],
            sportNotes: "Soccer Variant C Day 3: acceleration + RSA combined — sprint work consolidated since Day 1 was strength-led",
          },
        ];
      }

      // Variant B (seed ≥ 0.33): Nordic-first Day 1 — tissue protection leads, no sprint
      if ((variationSeed ?? 0) >= 0.33) {
        return [
          {
            dayNumber: 1,
            identity: "Hamstring + Adductor Resilience + Hip Strength",
            intent: "Nordic hamstring curl as the primary exercise; hip thrust and posterior chain loading; Copenhagen plank — injury prevention session leads the week",
            neuralDemand: "moderate",
            primaryPattern: "hinge",
            emphasizedPatterns: ["hinge", "unilateral_lower", "trunk", "lateral"],
            cnsFlow: [
              { role: "prep", description: "Hip and hamstring prep: hip CARs → hamstring curl warm-up (2 × 6 slow) → Copenhagen side plank isometric hold × 3 each" },
              { role: "primary", description: "HAMSTRING RESILIENCE ANCHOR: Nordic Hamstring Curl (4 × 5-8 @ eccentric focus) — this IS the session anchor this week. Primary exercise, not accessory." },
              { role: "secondary", description: "Hip Thrust (4 × 8-10) — glute and posterior chain strength for sprint force application" },
              { role: "unilateral", description: "Single-Leg RDL (3 × 8-10 each side) + Step-Up (3 × 8 each) — unilateral posterior chain and deceleration resilience" },
              { role: "trunk", description: "ADDUCTOR: Copenhagen Plank (4 × 25-30 sec each side) — adductor strength and groin injury prevention. This day treats injury prevention as performance training." },
            ],
            sportNotes: "Soccer Variant B: Nordic curl is the Day 1 anchor — this week the injury prevention work IS the training priority, not the warm-up",
          },
          {
            dayNumber: 2,
            identity: "Upper Structural + Trunk + Single-Leg Support",
            intent: "Upper strength balance + rotational trunk + unilateral lower support — structural maintenance in a lower-dominant sport",
            neuralDemand: "moderate",
            primaryPattern: "upper_push",
            emphasizedPatterns: ["upper_push", "upper_pull", "trunk", "unilateral_lower"],
            cnsFlow: [
              { role: "prep", description: "General activation: hip mobility, thoracic rotation, shoulder prep" },
              { role: "primary", description: "Upper push + pull: Bench Press or Dumbbell Press (3 × 6-8) + Bent Row (3 × 6-8) — structural balance for aerial duels and contact" },
              { role: "secondary", description: "Vertical pull: Chin-Up or Lat Pulldown (3 × 8-10) + Face Pull (3 × 15) — scapular health" },
              { role: "trunk", description: "Rotational trunk: Pallof Press (3 × 10 each) + Lateral Lunge (3 × 8 each side) — adductor and COD support" },
            ],
            sportNotes: "Soccer upper: relatively low volume — focus on structural balance for aerial duels and shoulder health",
          },
          {
            dayNumber: 3,
            identity: "Acceleration + Repeat Sprint Conditioning + Lower Tissue",
            intent: "Sprint mechanics first; RSA conditioning; calf and adductor maintenance — all sprint quality in one high-intensity session",
            neuralDemand: "high",
            primaryPattern: "locomotion",
            emphasizedPatterns: ["locomotion", "hinge", "lateral"],
            cnsFlow: [
              { role: "prep", description: "RSA warm-up: 5 min jog → dynamic drill series → 3 × 30m build-up strides" },
              { role: "power", description: "ACCELERATION: 5 × 10m + 4 × 20m at 100% intent. 90 sec between 10m, 2 min between 20m. Sprint mechanics first." },
              { role: "primary", description: "REPEAT SPRINT ABILITY: 3 sets × 5 × 20-30m with 20 sec intra-set rest, 3 min between sets. NOT circuits. Real sprint effort." },
              { role: "trunk", description: "Lower tissue maintenance: Calf Raise (3 × 15) + Copenhagen Plank (2 × 30 sec each) — mandatory every session" },
            ],
            sportNotes: "Soccer Variant B Day 3: full sprint session — acceleration + RSA after the Nordic-focused Day 1",
          },
        ];
      }

      // Variant A (seed < 0.33): Acceleration + hamstring resilience — original structure
      return [
        {
          dayNumber: 1,
          identity: "Acceleration + Hamstring Resilience",
          intent: "Sprint mechanics (0–20m) + Nordic curl and single-leg posterior chain — addresses the two most common soccer injury vectors in one session",
          neuralDemand: "high",
          primaryPattern: "hinge",
          emphasizedPatterns: ["locomotion", "hinge", "unilateral_lower", "trunk"],
          cnsFlow: [
            { role: "prep", description: "Sprint warm-up: 10 min jog → A-skip × 2 × 20m → high knees × 2 × 20m → build-up strides × 3 at 70%, 85%, 95%" },
            { role: "power", description: "ACCELERATION: 5 × 10m + 4 × 20m with 90 sec between 10m, 2 min between 20m. 100% effort." },
            { role: "primary", description: "HAMSTRING RESILIENCE: Nordic Hamstring Curl (3 × 5-8) — MANDATORY for soccer. Non-negotiable tissue protection." },
            { role: "secondary", description: "Single-Leg RDL (3 × 8-10 each side) + Hip Thrust (3 × 10) — posterior chain tissue loading for sprint resilience" },
            { role: "trunk", description: "ADDUCTOR: Copenhagen Plank (3 × 20-30 sec each side) — mandatory. Adductor injuries are the second-highest soccer injury type." },
          ],
          sportNotes: "Soccer Day 1: Nordic curl and Copenhagen plank are mandatory — these are the highest-ROI injury prevention tools for soccer athletes",
        },
        {
          dayNumber: 2,
          identity: "Upper Structural + Trunk + Single-Leg Support",
          intent: "Upper strength balance + rotational trunk + unilateral lower support — structural maintenance in a lower-dominant sport",
          neuralDemand: "moderate",
          primaryPattern: "upper_push",
          emphasizedPatterns: ["upper_push", "upper_pull", "trunk", "unilateral_lower"],
          cnsFlow: [
            { role: "prep", description: "General activation: hip mobility, thoracic rotation, shoulder prep" },
            { role: "primary", description: "Upper push + pull: Bench Press or Dumbbell Press (3 × 6-8) + Bent Row (3 × 6-8) — structural balance for aerial duels and contact" },
            { role: "secondary", description: "Vertical pull: Chin-Up or Lat Pulldown (3 × 8-10) + Face Pull (3 × 15) — scapular health" },
            { role: "trunk", description: "Rotational trunk: Pallof Press (3 × 10 each) + Lateral Lunge (3 × 8 each side) — adductor and COD support" },
          ],
          sportNotes: "Soccer upper: relatively low volume — focus on structural balance for aerial duels and shoulder health",
        },
        {
          dayNumber: 3,
          identity: "Repeat Sprint Conditioning + Lower Tissue",
          intent: "RSA conditioning: the most sport-specific soccer session — sprint repeats with incomplete recovery + calf and adductor tissue maintenance",
          neuralDemand: "high",
          primaryPattern: "locomotion",
          emphasizedPatterns: ["locomotion", "hinge", "lateral"],
          cnsFlow: [
            { role: "prep", description: "RSA warm-up: 5 min jog → dynamic drill series → 3 × 30m build-up strides" },
            { role: "power", description: "REPEAT SPRINT ABILITY: 3 sets × 5 × 20-30m sprints with 20 sec intra-set rest and 3 min between sets. This is NOT conditioning circuits. Real sprint effort, real work:rest." },
            { role: "secondary", description: "AEROBIC SUPPORT: 15 min run at 65-70% max HR following RSA work — aerobic base underpins sprint recovery" },
            { role: "trunk", description: "Lower tissue maintenance: Calf Raise (3 × 15) + Copenhagen Plank (2 × 30 sec each) — mandatory every session" },
          ],
          sportNotes: "Soccer RSA day: real sprint intervals with real rest — NOT circuits. Soccer repeat sprint ability is the most sport-defining quality.",
        },
      ];
    }
    if (daysPerWeek === 4) {
      // Variant C (seed ≥ 0.67): Strength-led Day 1 — bilateral lower anchor, no sprint
      if ((variationSeed ?? 0) >= 0.67) {
        return [
          {
            dayNumber: 1,
            identity: "Bilateral Lower Strength + Hamstring Resilience",
            intent: "Trap bar deadlift or squat as the weekly lower anchor; Nordic mandatory; Copenhagen mandatory — strength-first structure this rotation",
            neuralDemand: "high",
            primaryPattern: "squat",
            emphasizedPatterns: ["squat", "hinge", "unilateral_lower", "trunk"],
            cnsFlow: [
              { role: "prep", description: "Lower strength prep: hip CARs, glute activation, ankle mobility — 8 min" },
              { role: "primary", description: "BILATERAL LOWER ANCHOR: Trap Bar Deadlift or Back Squat (4 × 4-5 @ 80-87%) — structural lower force foundation for sprinting and contact" },
              { role: "secondary", description: "HAMSTRING RESILIENCE: Nordic Hamstring Curl (4 × 5-8) — mandatory every lower session in soccer. Highest ROI injury prevention tool." },
              { role: "unilateral", description: "Single-Leg RDL (3 × 8 each side) + Hip Thrust (3 × 10) — posterior chain resilience" },
              { role: "trunk", description: "Copenhagen Plank (3 × 25 sec each side) + Pallof Press (2 × 10 each side) — mandatory adductor and anti-rotation" },
            ],
            sportNotes: "Soccer 4-day Variant C: strength-first Day 1 — bilateral lower anchors the week, sprint work moved to Day 4 RSA session",
          },
          {
            dayNumber: 2,
            identity: "Aerobic Base / Tempo + Lower Tissue Support",
            intent: "Dedicated aerobic conditioning + adductor/calf tissue maintenance — soccer aerobic base is non-negotiable",
            neuralDemand: "low",
            primaryPattern: "locomotion",
            emphasizedPatterns: ["locomotion", "unilateral_lower"],
            cnsFlow: [
              { role: "prep", description: "Easy warm-up: 5 min jog + dynamic stretching + calf activation" },
              { role: "primary", description: "AEROBIC BASE: 25-35 min steady-state run at 65-73% max HR OR 4 × 6 min at 80-85% HR (lactate threshold) with 3 min rest. Soccer demands aerobic capacity for 90 minutes." },
              { role: "secondary", description: "Calf Raise (3 × 15) + Tibialis Raise (2 × 15) — calf and ankle tissue maintenance for running volume" },
              { role: "trunk", description: "Copenhagen Plank (2 × 20 sec each side) + Lateral Lunge (2 × 8 each side) — adductor maintenance session" },
            ],
            sportNotes: "Soccer aerobic day: real running conditioning. 10-13km per game demands this foundation. No lifting today — full aerobic development.",
          },
          {
            dayNumber: 3,
            identity: "Upper Structural + Trunk + Single-Leg",
            intent: "Upper strength balance + lower unilateral strength support + trunk — structural maintenance week",
            neuralDemand: "moderate",
            primaryPattern: "upper_push",
            emphasizedPatterns: ["upper_push", "upper_pull", "trunk", "unilateral_lower"],
            cnsFlow: [
              { role: "prep", description: "General prep: hip flexor stretch, thoracic rotation, shoulder warm-up" },
              { role: "primary", description: "Dumbbell Press (3 × 8) + Bent Row (3 × 8) — balanced upper structural strength" },
              { role: "secondary", description: "Chin-Up (3 × 8) + Lateral Lunge (3 × 8 each side) — upper pull + adductor strength" },
              { role: "trunk", description: "Pallof Press (3 × 10 each) + Single-Leg Squat (3 × 8 each side) — anti-rotation trunk + single-leg strength" },
            ],
            sportNotes: "Soccer upper day: moderate volume — structural balance for heading duels and collision resilience without fatiguing the lower body",
          },
          {
            dayNumber: 4,
            identity: "Acceleration + Repeat Sprint Conditioning + Lower Tissue",
            intent: "Sprint mechanics + RSA conditioning — all speed work this week in Day 4; strength was Day 1",
            neuralDemand: "high",
            primaryPattern: "locomotion",
            emphasizedPatterns: ["locomotion", "hinge", "lateral"],
            cnsFlow: [
              { role: "prep", description: "Sprint prep: 8 min jog → A-skip + high knees → build-up strides × 3" },
              { role: "power", description: "ACCELERATION: 4 × 10m + 4 × 20m with full rest. Every rep 100%. Sprints first — freshest CNS state." },
              { role: "primary", description: "REPEAT SPRINT ABILITY: 4 sets × 4 × 20-30m sprint with 20 sec between reps and 3 min between sets. 100% sprint effort." },
              { role: "secondary", description: "Nordic Hamstring Curl (3 × 5-8) — maintained on conditioning days. Hamstring protection is highest priority." },
              { role: "trunk", description: "Copenhagen Plank (2 × 25 sec each) + Calf Raise (3 × 15) — tissue maintenance after sprint load" },
            ],
            sportNotes: "Soccer Variant C Day 4: all sprint work here — acceleration + RSA after strength-led Day 1 opens the week",
          },
        ];
      }

      // Variant B (seed ≥ 0.33): Nordic-first Day 1 — tissue protection anchors the week
      if ((variationSeed ?? 0) >= 0.33) {
        return [
          {
            dayNumber: 1,
            identity: "Hamstring + Adductor Resilience + Hip Posterior Chain",
            intent: "Nordic hamstring curl as the session anchor; hip thrust and single-leg posterior chain; Copenhagen mandatory — injury prevention IS the performance goal this week",
            neuralDemand: "moderate",
            primaryPattern: "hinge",
            emphasizedPatterns: ["hinge", "unilateral_lower", "trunk", "lateral"],
            cnsFlow: [
              { role: "prep", description: "Hip and hamstring prep: hip CARs → slow Nordic lowering warm-up (2 × 5) → Copenhagen side isometric × 3 each" },
              { role: "primary", description: "HAMSTRING RESILIENCE ANCHOR: Nordic Hamstring Curl (4 × 5-8 eccentric focus) — this is the session anchor. Treat it as a primary performance exercise." },
              { role: "secondary", description: "Hip Thrust (4 × 8-10) — glute and posterior chain development for sprint force production" },
              { role: "unilateral", description: "Single-Leg RDL (3 × 8-10 each side) + Step-Up (3 × 8 each) — unilateral posterior chain resilience" },
              { role: "trunk", description: "ADDUCTOR: Copenhagen Plank (4 × 25-30 sec each side) — groin strength is a top-5 injury risk in soccer. This session prioritizes it." },
            ],
            sportNotes: "Soccer 4-day Variant B: Nordic curl anchors Day 1 — injury prevention quality receives the same priority as sprint and strength work this week",
          },
          {
            dayNumber: 2,
            identity: "Aerobic Base / Tempo + Lower Tissue Support",
            intent: "Dedicated aerobic conditioning + adductor/calf tissue maintenance — soccer aerobic base is non-negotiable",
            neuralDemand: "low",
            primaryPattern: "locomotion",
            emphasizedPatterns: ["locomotion", "unilateral_lower"],
            cnsFlow: [
              { role: "prep", description: "Easy warm-up: 5 min jog + dynamic stretching + calf activation" },
              { role: "primary", description: "AEROBIC BASE: 25-35 min steady-state run at 65-73% max HR OR 4 × 6 min at 80-85% HR (lactate threshold) with 3 min rest. Soccer demands aerobic capacity for 90 minutes." },
              { role: "secondary", description: "Calf Raise (3 × 15) + Tibialis Raise (2 × 15) — calf and ankle tissue maintenance for running volume" },
              { role: "trunk", description: "Copenhagen Plank (2 × 20 sec each side) + Lateral Lunge (2 × 8 each side) — adductor maintenance session" },
            ],
            sportNotes: "Soccer aerobic day: real running conditioning. 10-13km per game demands this foundation. No lifting today — full aerobic development.",
          },
          {
            dayNumber: 3,
            identity: "Upper Structural + Trunk + Single-Leg",
            intent: "Upper strength balance + lower unilateral strength support + trunk — structural maintenance week",
            neuralDemand: "moderate",
            primaryPattern: "upper_push",
            emphasizedPatterns: ["upper_push", "upper_pull", "trunk", "unilateral_lower"],
            cnsFlow: [
              { role: "prep", description: "General prep: hip flexor stretch, thoracic rotation, shoulder warm-up" },
              { role: "primary", description: "Dumbbell Press (3 × 8) + Bent Row (3 × 8) — balanced upper structural strength" },
              { role: "secondary", description: "Chin-Up (3 × 8) + Lateral Lunge (3 × 8 each side) — upper pull + adductor strength" },
              { role: "trunk", description: "Pallof Press (3 × 10 each) + Single-Leg Squat (3 × 8 each side) — anti-rotation trunk + single-leg strength" },
            ],
            sportNotes: "Soccer upper day: moderate volume — structural balance for heading duels and collision resilience without fatiguing the lower body",
          },
          {
            dayNumber: 4,
            identity: "Acceleration + Repeat Sprint Conditioning + Lower Tissue",
            intent: "Sprint mechanics + RSA conditioning — all speed work consolidated on Day 4 when Nordic work anchored Day 1",
            neuralDemand: "high",
            primaryPattern: "locomotion",
            emphasizedPatterns: ["locomotion", "hinge", "lateral"],
            cnsFlow: [
              { role: "prep", description: "RSA prep: 5 min jog → dynamic drill → 3 × build-up strides" },
              { role: "power", description: "ACCELERATION: 5 × 10m + 4 × 20m. Full rest between every rep. 100% effort — sprint mechanics are the priority before RSA." },
              { role: "primary", description: "REPEAT SPRINT ABILITY: 4 sets × 4 × 20-30m sprint with 20 sec between reps and 3 min between sets. 100% sprint effort." },
              { role: "secondary", description: "Nordic Hamstring Curl (3 × 5-8) — maintained even on conditioning days — hamstring protection is highest priority" },
              { role: "trunk", description: "Copenhagen Plank (2 × 25 sec each) + Calf Raise (3 × 15) — tissue maintenance after sprint load" },
            ],
            sportNotes: "Soccer Variant B Day 4: full sprint session — all acceleration + RSA here after Nordic-anchored Day 1",
          },
        ];
      }

      // Variant A (seed < 0.33): Acceleration + hamstring resilience — original structure
      return [
        {
          dayNumber: 1,
          identity: "Acceleration + Hamstring Resilience",
          intent: "Sprint mechanics + Nordic curl + posterior chain tissue — the most important soccer injury prevention session",
          neuralDemand: "high",
          primaryPattern: "hinge",
          emphasizedPatterns: ["locomotion", "hinge", "unilateral_lower", "trunk"],
          cnsFlow: [
            { role: "prep", description: "Sprint prep: 10 min warm-up → A-skip + high knees → build-up strides × 3" },
            { role: "power", description: "ACCELERATION: 5 × 10m + 5 × 20m with full rest. Every rep 100%." },
            { role: "primary", description: "Nordic Hamstring Curl (4 × 5-8) — mandatory every lower session in soccer. Most common soccer injury prevention." },
            { role: "secondary", description: "Single-Leg RDL (3 × 8 each side) + Hip Thrust (3 × 10) — posterior chain resilience" },
            { role: "trunk", description: "Copenhagen Plank (3 × 25 sec each side) — mandatory. Adductor resilience." },
          ],
          sportNotes: "Soccer: Nordic curl + Copenhagen plank are mandatory in EVERY lower session — not optional, not substitutable",
        },
        {
          dayNumber: 2,
          identity: "Aerobic Base / Tempo + Lower Tissue Support",
          intent: "Dedicated aerobic conditioning + adductor/calf tissue maintenance — soccer aerobic base is non-negotiable",
          neuralDemand: "low",
          primaryPattern: "locomotion",
          emphasizedPatterns: ["locomotion", "unilateral_lower"],
          cnsFlow: [
            { role: "prep", description: "Easy warm-up: 5 min jog + dynamic stretching + calf activation" },
            { role: "primary", description: "AEROBIC BASE: 25-35 min steady-state run at 65-73% max HR OR 4 × 6 min at 80-85% HR (lactate threshold) with 3 min rest. Soccer demands aerobic capacity for 90 minutes." },
            { role: "secondary", description: "Calf Raise (3 × 15) + Tibialis Raise (2 × 15) — calf and ankle tissue maintenance for running volume" },
            { role: "trunk", description: "Copenhagen Plank (2 × 20 sec each side) + Lateral Lunge (2 × 8 each side) — adductor maintenance session" },
          ],
          sportNotes: "Soccer aerobic day: real running conditioning. 10-13km per game demands this foundation. No lifting today — full aerobic development.",
        },
        {
          dayNumber: 3,
          identity: "Upper Structural + Trunk + Single-Leg",
          intent: "Upper strength balance + lower unilateral strength support + trunk — structural maintenance week",
          neuralDemand: "moderate",
          primaryPattern: "upper_push",
          emphasizedPatterns: ["upper_push", "upper_pull", "trunk", "unilateral_lower"],
          cnsFlow: [
            { role: "prep", description: "General prep: hip flexor stretch, thoracic rotation, shoulder warm-up" },
            { role: "primary", description: "Dumbbell Press (3 × 8) + Bent Row (3 × 8) — balanced upper structural strength" },
            { role: "secondary", description: "Chin-Up (3 × 8) + Lateral Lunge (3 × 8 each side) — upper pull + adductor strength" },
            { role: "trunk", description: "Pallof Press (3 × 10 each) + Single-Leg Squat (3 × 8 each side) — anti-rotation trunk + single-leg strength" },
          ],
          sportNotes: "Soccer upper day: moderate volume — structural balance for heading duels and collision resilience without fatiguing the lower body",
        },
        {
          dayNumber: 4,
          identity: "Repeat Sprint Conditioning + Lower Tissue",
          intent: "RSA: the most sport-specific soccer conditioning — sprint repeats with partial rest + posterior chain/adductor tissue protection",
          neuralDemand: "high",
          primaryPattern: "locomotion",
          emphasizedPatterns: ["locomotion", "hinge", "lateral"],
          cnsFlow: [
            { role: "prep", description: "RSA prep: 5 min jog → dynamic drill → 3 × build-up strides" },
            { role: "power", description: "REPEAT SPRINT ABILITY: 4 sets × 4 × 20-30m sprint with 20 sec between reps and 3 min between sets. 100% sprint effort. Full rest between sets." },
            { role: "secondary", description: "Nordic Hamstring Curl (3 × 5-8) — maintained even on conditioning days — hamstring protection is highest priority" },
            { role: "trunk", description: "Copenhagen Plank (2 × 25 sec each) + Calf Raise (3 × 15) — tissue maintenance after sprint load" },
          ],
          sportNotes: "Soccer RSA day: sprint intervals with partial recovery — the most sport-specific quality for soccer performance and game endurance",
        },
      ];
    }
  }

  // ─── BASEBALL — Rotational Power + Arm Care + Short Acceleration ─────────────
  const isBaseball = !!(sport && /baseball|softball/i.test(sport));
  if (isBaseball) {
    if (daysPerWeek === 3) {
      return [
        {
          dayNumber: 1,
          identity: "Rotational Power + Lower Strength",
          intent: "Med ball rotational throws + trap bar DL — the two most important physical qualities for baseball athletes",
          neuralDemand: "high",
          primaryPattern: "rotational",
          emphasizedPatterns: ["rotational", "hinge", "squat", "power", "trunk"],
          cnsFlow: [
            { role: "prep", description: "Rotational prep: hip rotation mobility → band hip flexor → rotational med ball throw × 3 sub-max" },
            { role: "power", description: "ROTATIONAL POWER: Med Ball Rotational Throw (4 × 6 each side) at maximum effort — hip-driven rotation. Then Med Ball Overhead Scoop Toss (4 × 5) for posterior chain power." },
            { role: "primary", description: "LOWER STRENGTH: Trap Bar Deadlift (4 × 4-6 @ 78-85%) — bilateral posterior chain without high lumbar stress" },
            { role: "secondary", description: "Single-Leg RDL (3 × 8 each side) — unilateral posterior chain for throwing stride and fielding stance resilience" },
            { role: "trunk", description: "ANTI-ROTATION: Pallof Press (3 × 10 each side) + Landmine Rotation (3 × 8 each) — trunk stiffness converts hip rotation to power" },
          ],
          sportNotes: "Baseball: med ball rotational throw is as important as any barbell exercise. This session is the foundation of batting and throwing power.",
        },
        {
          dayNumber: 2,
          identity: "Arm-Care Upper + Shoulder Balance",
          intent: "Pressing and pulling balance with mandatory shoulder care — arm-care-conscious upper development for throwing sport athletes",
          neuralDemand: "moderate",
          primaryPattern: "upper_pull",
          emphasizedPatterns: ["upper_push", "upper_pull", "trunk"],
          cnsFlow: [
            { role: "prep", description: "ARM CARE PREP: Band pull-apart × 20 + Face Pull × 15 + External rotation drill × 10 each side — MANDATORY every upper session" },
            { role: "primary", description: "PULL-DOMINANT UPPER: Weighted Chin-Up or Cable Row (4 × 6-8) — scapular strength and shoulder health first" },
            { role: "secondary", description: "PRESS BALANCED: Landmine Press (3 × 8 each side) or Dumbbell Press (3 × 8) — arm-care-conscious press. NOT heavy barbell overhead for pitchers." },
            { role: "trunk", description: "SCAPULAR + ROTATOR: Y/T/W Band Work (2 × 10 each) + Face Pull (3 × 15) — scapular upward rotation and retraction for throwing health" },
          ],
          sportNotes: "Baseball upper: arm care is the HIGHEST priority. Face pull and external rotation are mandatory. Pull volume ≥ push volume. Never press-dominant for pitchers.",
        },
        {
          dayNumber: 3,
          identity: "Acceleration + Med Ball + Unilateral",
          intent: "Short sprint acceleration (0–30m) + med ball power + single-leg strength — sport-transfer session",
          neuralDemand: "high",
          primaryPattern: "locomotion",
          emphasizedPatterns: ["locomotion", "power", "rotational", "unilateral_lower"],
          cnsFlow: [
            { role: "prep", description: "Sprint + power prep: jog → build-up strides × 3 → sub-max broad jump × 2" },
            { role: "power", description: "ACCELERATION: 5 × 20m + 4 × 30m sprints with full rest — baserunning and fielding sprint mechanics. Short, not distance." },
            { role: "primary", description: "ROTATIONAL POWER: Med Ball Rotational Throw (4 × 5 each side) + Med Ball Slam (3 × 5) — power expression without barbell loading" },
            { role: "secondary", description: "RFESS (3 × 8 each side) + Calf Raise (3 × 15) — unilateral lower for fielding stance and baserunning" },
            { role: "trunk", description: "CONDITIONING: 8–10 × 20-30m sprints at 100% with 90 sec rest — baseball work capacity. SHORT. Not aerobic endurance." },
          ],
          sportNotes: "Baseball: short sprint acceleration (not distance running). Med ball rotational throws are the conditioning of baseball — they build the rotational power that defines the sport.",
        },
      ];
    }
    if (daysPerWeek === 4) {
      return [
        {
          dayNumber: 1,
          identity: "Rotational Power + Lower Strength",
          intent: "Hip-driven rotational power via med ball + bilateral lower strength — the foundation of hitting and throwing",
          neuralDemand: "high",
          primaryPattern: "rotational",
          emphasizedPatterns: ["rotational", "hinge", "squat", "power", "trunk"],
          cnsFlow: [
            { role: "prep", description: "Rotational activation: hip rotation drills → sub-max med ball throw × 3" },
            { role: "power", description: "ROTATIONAL POWER: Med Ball Rotational Throw (5 × 5 each side) at max effort → Med Ball Overhead Scoop Toss (4 × 5)" },
            { role: "primary", description: "Trap Bar Deadlift (4 × 4-6 @ 80-85%) — bilateral posterior chain foundation" },
            { role: "secondary", description: "Single-Leg RDL (3 × 8 each side) — unilateral posterior chain resilience" },
            { role: "trunk", description: "Pallof Press (3 × 10 each) + Landmine Rotation (3 × 8 each) — anti-rotation and rotational trunk" },
          ],
          sportNotes: "Baseball Day 1: Rotational power is the highest priority — med ball work comes first",
        },
        {
          dayNumber: 2,
          identity: "Arm-Care Upper + Shoulder Balance",
          intent: "Pull-dominant upper strength + mandatory rotator cuff and scapular care — throwing sport demands this every session",
          neuralDemand: "moderate",
          primaryPattern: "upper_pull",
          emphasizedPatterns: ["upper_pull", "upper_push", "trunk"],
          cnsFlow: [
            { role: "prep", description: "ARM CARE: Band pull-apart × 20 + Face Pull × 15 + External Rotation × 10 each — mandatory before any loading" },
            { role: "primary", description: "Weighted Chin-Up (4 × 5-8) + Barbell Row (4 × 6-8) — pull strength foundation" },
            { role: "secondary", description: "Landmine Press (3 × 8 each) or Dumbbell Press (3 × 8) — press with arm-care constraint" },
            { role: "trunk", description: "Y/T/W scapular (2 × 10 each) + Face Pull (3 × 15) + External Rotation Stretch" },
          ],
          sportNotes: "Baseball arm care: face pull and external rotation every single upper session. This is non-negotiable for shoulder longevity.",
        },
        {
          dayNumber: 3,
          identity: "Acceleration + Med Ball Power",
          intent: "Short sprint acceleration + additional rotational med ball work — sport-specific power transfer session",
          neuralDemand: "high",
          primaryPattern: "locomotion",
          emphasizedPatterns: ["locomotion", "rotational", "power", "unilateral_lower"],
          cnsFlow: [
            { role: "prep", description: "Sprint + power prep: jog → build-up strides × 3 → sub-max broad jump × 2" },
            { role: "power", description: "ACCELERATION: 6 × 20m + 5 × 30m with full rest — 100% effort, baserunning mechanics" },
            { role: "primary", description: "Med Ball Power Circuit: Rotational Throw (4 × 5 each) + Med Ball Slam (3 × 5) + Chest Throw (3 × 5) — multi-plane power expression" },
            { role: "secondary", description: "RFESS (3 × 8 each) + Step-Up (2 × 10 each) — fielding stance and baserunning single-leg strength" },
          ],
          sportNotes: "Baseball acceleration: 0-30m only. Baserunners never need max velocity — acceleration is the only sprint quality that matters.",
        },
        {
          dayNumber: 4,
          identity: "Trunk / Scapular / Tissue Support",
          intent: "Anti-rotation trunk integrity, scapular control, unilateral resilience — injury prevention and power transfer architecture",
          neuralDemand: "low",
          primaryPattern: "trunk",
          emphasizedPatterns: ["trunk", "upper_pull", "unilateral_lower"],
          cnsFlow: [
            { role: "prep", description: "Mobility: hip rotation, thoracic rotation, shoulder flexion + extension" },
            { role: "primary", description: "SCAPULAR WORK: Y/T/W (3 × 10 each) + Serratus Press (3 × 12) + Band External Rotation (3 × 15 each) — throwing health maintenance" },
            { role: "secondary", description: "TRUNK: Pallof Press (4 × 10 each side) + Half-Kneeling Cable Chop (3 × 8 each) + Dead Bug (3 × 8) — stiffness for rotation power transfer" },
            { role: "trunk", description: "CONDITIONING: 8-10 × 20m sprints with 90 sec rest OR Assault Bike 4 × 30 sec at max with 2 min rest — brief work capacity, NOT aerobic endurance" },
          ],
          sportNotes: "Baseball tissue day: shoulder health maintenance + trunk integrity. This session prevents the injuries that end baseball careers.",
        },
      ];
    }
  }

  // ─── Generic isSportConditioning fallback (rugby, lacrosse, other field sports)
  const isSportConditioning = !!(sport && (
    sport.toLowerCase().includes("rugby") ||
    sport.toLowerCase().includes("lacrosse") ||
    sport.toLowerCase().includes("volleyball")
  ));

  if (isSportConditioning && daysPerWeek >= 4) {
    const strengthDays = buildSessionsForDayCount(daysPerWeek - 1, sport, "athletic_performance");
    return [
      ...strengthDays.slice(0, daysPerWeek - 1),
      {
        dayNumber: daysPerWeek,
        identity: "Sport-Specific Conditioning — RSA + Energy Systems",
        intent: "Standalone sport conditioning session: repeat sprint ability + energy system development specific to the sport's demands. Real intervals, real work:rest.",
        neuralDemand: "high",
        primaryPattern: "locomotion",
        emphasizedPatterns: ["locomotion", "power", "lateral"],
        cnsFlow: [
          { role: "prep", description: "8 min dynamic prep: jog + dynamic drills + 2 × 20m build-up strides" },
          { role: "primary", description: "REPEAT SPRINT ABILITY: 2–4 sets × 4–6 sprints @ 20–30m with 20 sec intra-set rest and 2–3 min between sets. Full sprint speed every rep." },
          { role: "secondary", description: "SECONDARY ENERGY SYSTEM: Aerobic base or lactate threshold work — 15–20 min at appropriate intensity to complement RSA" },
          { role: "trunk", description: "Movement quality and recovery work" },
        ],
        sportNotes: `Sport-specific conditioning block — mirrors the repeat sprint and aerobic demands of ${sport} competition`,
      },
    ];
  }

  if (daysPerWeek === 2) {
    return [
      {
        dayNumber: 1,
        identity: "Lower Force Production + Upper Push",
        intent: "Build bilateral lower-body force via squat dominance + horizontal upper pressing strength",
        neuralDemand: "high",
        primaryPattern: "squat",
        emphasizedPatterns: ["squat", "upper_push", "power", "trunk"],
        cnsFlow: buildCNSFlow(["squat", "upper_push", "power", "trunk"], "high", undefined, blockArchetype),
        sportNotes: isHockey ? "Bias lateral drive mechanics off squat; include hip flexor control" : undefined,
      },
      {
        dayNumber: 2,
        identity: "Posterior Chain + Upper Pull + Integration",
        intent: "Develop posterior chain capacity via hinge, balance the pressing week with horizontal pull, integrate unilateral control",
        neuralDemand: "moderate",
        primaryPattern: "hinge",
        emphasizedPatterns: ["hinge", "upper_pull", "unilateral_lower", "trunk", "rotational"],
        cnsFlow: buildCNSFlow(["hinge", "upper_pull", "unilateral_lower", "rotational"], "moderate", undefined, blockArchetype),
        sportNotes: isHockey ? "Rotational trunk work essential; single-leg RDL for edge mechanics" : undefined,
      },
    ];
  }

  if (daysPerWeek === 3) {
    // Variant C: Upper-pull anchor + lower integration — pull-led, posterior-chain closed
    if ((variationSeed ?? 0) >= 0.67) {
      return [
        {
          dayNumber: 1,
          identity: "Upper Pull Anchor + Power",
          intent: "Vertical pull strength as the session anchor; rotational power primer; structural push balance; trunk anti-extension",
          neuralDemand: "high",
          primaryPattern: "upper_pull",
          emphasizedPatterns: ["upper_pull", "upper_push", "power", "trunk", "rotational"],
          cnsFlow: buildCNSFlow(["upper_pull", "upper_push", "power", "rotational", "trunk"], "high", undefined, blockArchetype),
          sportNotes: isHockey ? "Weighted pull-up; rotational med ball throw; face pull" : undefined,
        },
        {
          dayNumber: 2,
          identity: "Lower Power + Squat Strength",
          intent: "Explosive power as the CNS primer; bilateral squat strength as the force base; unilateral and lateral control",
          neuralDemand: "high",
          primaryPattern: "squat",
          emphasizedPatterns: ["squat", "power", "unilateral_lower", "lateral", "trunk"],
          cnsFlow: buildCNSFlow(["squat", "power", "unilateral_lower", "lateral", "trunk"], "high", undefined, blockArchetype),
          sportNotes: isHockey ? "Lateral bound; front squat or safety bar squat; lateral step-up; Copenhagen plank" : undefined,
        },
        {
          dayNumber: 3,
          identity: "Posterior Chain + Full Body Integration",
          intent: "Hinge-dominant posterior chain development; unilateral resilience; loaded carry and trunk integrity — athletic transfer session",
          neuralDemand: "moderate",
          primaryPattern: "hinge",
          emphasizedPatterns: ["hinge", "unilateral_lower", "trunk", "lateral"],
          cnsFlow: buildCNSFlow(["hinge", "unilateral_lower", "lateral", "trunk"], "moderate", undefined, blockArchetype),
          sportNotes: isHockey ? "Single-leg RDL; lateral lunge; Copenhagen plank; carry complex" : undefined,
        },
      ];
    }

    // Variant B: Hinge-first / posterior-chain-emphasis 3-day split
    if ((variationSeed ?? 0) >= 0.33) {
      return [
        {
          dayNumber: 1,
          identity: "Hinge-Dominant Lower + Posterior Chain Power",
          intent: "Deadlift-pattern force production as the weekly base; posterior chain capacity and reactive power expression",
          neuralDemand: "high",
          primaryPattern: "hinge",
          emphasizedPatterns: ["hinge", "power", "unilateral_lower", "trunk"],
          cnsFlow: buildCNSFlow(["hinge", "power", "unilateral_lower", "trunk"], "high", undefined, blockArchetype),
          sportNotes: isHockey ? "RDL + single-leg RDL for edge mechanics; reactive bound after hinge warm-up" : undefined,
        },
        {
          dayNumber: 2,
          identity: "Horizontal Push + Shoulder Structural Health",
          intent: "Bench press or dumbbell press as the force baseline; overhead pressing for shoulder resilience; upper trunk anti-extension",
          neuralDemand: "moderate",
          primaryPattern: "upper_push",
          emphasizedPatterns: ["upper_push", "upper_pull", "trunk"],
          cnsFlow: buildCNSFlow(["upper_push", "upper_pull", "trunk"], "moderate", undefined, blockArchetype),
          sportNotes: isHockey ? "Landmine press for rotational load transfer; face pull between sets" : undefined,
        },
        {
          dayNumber: 3,
          identity: "Squat + Upper Pull Integration",
          intent: "Bilateral squat strength as the lower anchor; vertical and horizontal pull for structural balance; unilateral coordination",
          neuralDemand: "high",
          primaryPattern: "squat",
          emphasizedPatterns: ["squat", "upper_pull", "unilateral_lower", "rotational", "trunk"],
          cnsFlow: buildCNSFlow(["squat", "upper_pull", "unilateral_lower", "rotational"], "high", undefined, blockArchetype),
          sportNotes: isHockey ? "Lateral squat variant; weighted chin-up; Copenhagen plank for groin health" : undefined,
        },
      ];
    }
    return [
      {
        dayNumber: 1,
        identity: "Lower Force Production + Power",
        intent: "Bilateral force production via squat strength + vertical/horizontal power output; trunk stiffness under load",
        neuralDemand: "high",
        primaryPattern: "squat",
        emphasizedPatterns: ["squat", "power", "unilateral_lower", "trunk"],
        cnsFlow: buildCNSFlow(["squat", "power", "unilateral_lower", "trunk"], "high", undefined, blockArchetype),
        sportNotes: isHockey ? "Lateral bound before squats; RFESS for single-leg transfer; Pallof press for anti-rotation" : undefined,
      },
      {
        dayNumber: 2,
        identity: "Upper Strength + Structural Balance",
        intent: "Horizontal press and pull strength; scapular and shoulder integrity; upper trunk support",
        neuralDemand: "moderate",
        primaryPattern: "upper_push",
        emphasizedPatterns: ["upper_push", "upper_pull", "trunk"],
        cnsFlow: buildCNSFlow(["upper_push", "upper_pull", "trunk"], "moderate", undefined, blockArchetype),
        sportNotes: isHockey ? "Bias overhead pressing; rotational med ball work; face pull for shoulder cuff" : undefined,
      },
      {
        dayNumber: 3,
        identity: "Full Body Power + Posterior Chain Integration",
        intent: "Full-body integration of force production with posterior chain and unilateral work; reactive and elastic power",
        neuralDemand: "high",
        primaryPattern: "hinge",
        emphasizedPatterns: ["hinge", "power", "unilateral_lower", "lateral", "trunk", "rotational"],
        cnsFlow: buildCNSFlow(["hinge", "power", "unilateral_lower", "lateral", "rotational"], "high", undefined, blockArchetype),
        sportNotes: isHockey ? "Reactive lateral bounds; single-leg RDL; lateral lunge; Copenhagen plank" : undefined,
      },
    ];
  }

  if (daysPerWeek === 4) {
    if (isHockey) {
      return [
        {
          dayNumber: 1,
          identity: "Lower Force Production + Acceleration Mechanics",
          intent: "Bilateral squat strength as the force production base; single-leg positional control; trunk stiffness for edge and change-of-direction",
          neuralDemand: "high",
          primaryPattern: "squat",
          emphasizedPatterns: ["squat", "power", "unilateral_lower", "trunk", "lateral"],
          cnsFlow: buildCNSFlow(["squat", "power", "unilateral_lower", "lateral", "trunk"], "high", undefined, blockArchetype),
          sportNotes: "Lateral bound before squats; RFESS or lateral step-up for edge transfer; Pallof press anti-rotation for body contact stability",
        },
        {
          dayNumber: 2,
          identity: "Upper Structural Strength + Rotational Power",
          intent: "Press and pull balance for structural integrity; rotational power and trunk anti-rotation as hockey-specific overlay",
          neuralDemand: "moderate",
          primaryPattern: "upper_push",
          emphasizedPatterns: ["upper_push", "upper_pull", "rotational", "trunk"],
          cnsFlow: buildCNSFlow(["upper_push", "upper_pull", "rotational", "trunk"], "moderate", undefined, blockArchetype),
          sportNotes: "Med ball rotational throw before pressing; landmine press as sport-specific horizontal force; face pull / band external rotation for cuff tolerance",
        },
        {
          dayNumber: 3,
          identity: "Posterior Chain + Unilateral Control + Elastic Power",
          intent: "Hinge-dominant posterior chain development; single-leg stability under fatigue; reactive power expression",
          neuralDemand: "moderate",
          primaryPattern: "hinge",
          emphasizedPatterns: ["hinge", "unilateral_lower", "power", "lateral", "trunk"],
          cnsFlow: buildCNSFlow(["hinge", "unilateral_lower", "power", "lateral", "trunk"], "moderate", undefined, blockArchetype),
          sportNotes: "Single-leg RDL for posterior chain + balance; lateral lunge for adductor resilience; Copenhagen plank; snap-down drill for deceleration mechanics",
        },
        {
          dayNumber: 4,
          identity: "Full Body Integration + Power Expression",
          intent: "Full-system integration — power output + compound strength + unilateral coordination + trunk under fatigue; athletic transfer session",
          neuralDemand: "high",
          primaryPattern: "power",
          emphasizedPatterns: ["power", "squat", "lateral", "rotational", "trunk", "unilateral_lower"],
          cnsFlow: buildCNSFlow(["power", "squat", "lateral", "rotational", "trunk"], "high", undefined, blockArchetype),
          sportNotes: "Broad jump + lateral bound pairing; sled push or acceleration drill; rotational med ball; carry complex for trunk under locomotion",
        },
      ];
    }

    // Variant C: Hinge-anchored full-body integration — posterior chain leads, upper follows
    if ((variationSeed ?? 0) >= 0.67) {
      return [
        {
          dayNumber: 1,
          identity: "Hinge-Dominant Power + Posterior Chain",
          intent: "Deadlift-pattern peak force as the week's anchor; reactive power primer; single-leg posterior chain resilience",
          neuralDemand: "high",
          primaryPattern: "hinge",
          emphasizedPatterns: ["hinge", "power", "unilateral_lower", "trunk"],
          cnsFlow: buildCNSFlow(["hinge", "power", "unilateral_lower", "trunk"], "high", undefined, blockArchetype),
          sportNotes: isHockey ? "RDL + single-leg RDL as primary hinge; lateral bound as power primer" : undefined,
        },
        {
          dayNumber: 2,
          identity: "Upper Push + Anti-Extension Trunk",
          intent: "Horizontal and vertical press development; push:pull balance built through accessory pulling; anti-extension trunk integrity",
          neuralDemand: "moderate",
          primaryPattern: "upper_push",
          emphasizedPatterns: ["upper_push", "upper_pull", "trunk"],
          cnsFlow: buildCNSFlow(["upper_push", "upper_pull", "trunk"], "moderate", undefined, blockArchetype),
          sportNotes: isHockey ? "Landmine press as sport-specific horizontal force; face pull and external rotation for rotator cuff tolerance" : undefined,
        },
        {
          dayNumber: 3,
          identity: "Squat Strength + Lateral Control",
          intent: "Bilateral squat force production as secondary lower anchor; lateral and unilateral control; reactive power output",
          neuralDemand: "moderate",
          primaryPattern: "squat",
          emphasizedPatterns: ["squat", "power", "unilateral_lower", "lateral", "trunk"],
          cnsFlow: buildCNSFlow(["squat", "power", "unilateral_lower", "lateral", "trunk"], "moderate", undefined, blockArchetype),
          sportNotes: isHockey ? "Lateral step-up and Copenhagen plank in unilateral block; anti-rotation trunk emphasis" : undefined,
        },
        {
          dayNumber: 4,
          identity: "Upper Pull Dominance + Rotational Power",
          intent: "Vertical and horizontal pull as the closing upper anchor; rotational power integration; loaded carry finisher for trunk under fatigue",
          neuralDemand: "high",
          primaryPattern: "upper_pull",
          emphasizedPatterns: ["upper_pull", "rotational", "power", "trunk"],
          cnsFlow: buildCNSFlow(["upper_pull", "rotational", "power", "trunk"], "high", undefined, blockArchetype),
          sportNotes: isHockey ? "Weighted chin-up or bent-over row; med ball rotational throw; carry complex" : undefined,
        },
      ];
    }

    // Variant B: Upper/Lower split emphasis — pull-dominant Day 2, power-focused Day 3
    if ((variationSeed ?? 0) >= 0.33) {
      return [
        {
          dayNumber: 1,
          identity: "Lower Hypertrophy + Power",
          intent: "Volume-biased squat-pattern training; higher rep ranges build structural capacity; power primer to open",
          neuralDemand: "high",
          primaryPattern: "squat",
          emphasizedPatterns: ["squat", "power", "unilateral_lower", "trunk"],
          cnsFlow: buildCNSFlow(["squat", "power", "unilateral_lower", "trunk"], "high", undefined, blockArchetype),
        },
        {
          dayNumber: 2,
          identity: "Pull + Shoulder Structural Integrity",
          intent: "Pull-dominant upper session; scapular integrity before any pressing; vertical and horizontal pull compound work",
          neuralDemand: "moderate",
          primaryPattern: "upper_pull",
          emphasizedPatterns: ["upper_pull", "upper_push", "trunk"],
          cnsFlow: buildCNSFlow(["upper_pull", "upper_push", "trunk"], "moderate", undefined, blockArchetype),
        },
        {
          dayNumber: 3,
          identity: "Hinge Power + Single-Leg Resilience",
          intent: "Deadlift-pattern peak output; posterior chain and hamstring volume; unilateral control and reactive power",
          neuralDemand: "moderate",
          primaryPattern: "hinge",
          emphasizedPatterns: ["hinge", "unilateral_lower", "power", "lateral", "trunk"],
          cnsFlow: buildCNSFlow(["hinge", "unilateral_lower", "power", "lateral", "trunk"], "moderate", undefined, blockArchetype),
        },
        {
          dayNumber: 4,
          identity: "Push Strength + Full Body Integration",
          intent: "Press-dominant upper strength; horizontal and vertical press volume; full-body finisher for integration",
          neuralDemand: "high",
          primaryPattern: "upper_push",
          emphasizedPatterns: ["upper_push", "power", "squat", "unilateral_lower", "trunk"],
          cnsFlow: buildCNSFlow(["upper_push", "power", "squat", "trunk"], "high", undefined, blockArchetype),
        },
      ];
    }
    return [
      {
        dayNumber: 1,
        identity: "Lower Force Production",
        intent: "Bilateral squat strength + posterior chain support + unilateral control; high neural output session",
        neuralDemand: "high",
        primaryPattern: "squat",
        emphasizedPatterns: ["squat", "power", "unilateral_lower", "trunk"],
        cnsFlow: buildCNSFlow(["squat", "power", "unilateral_lower", "trunk"], "high", undefined, blockArchetype),
      },
      {
        dayNumber: 2,
        identity: "Upper Structural Strength",
        intent: "Horizontal press + pull balance; structural shoulder integrity; upper trunk support",
        neuralDemand: "moderate",
        primaryPattern: "upper_push",
        emphasizedPatterns: ["upper_push", "upper_pull", "trunk"],
        cnsFlow: buildCNSFlow(["upper_push", "upper_pull", "trunk"], "moderate", undefined, blockArchetype),
      },
      {
        dayNumber: 3,
        identity: "Posterior Chain + Unilateral + Elastic Power",
        intent: "Hinge-dominant posterior chain; single-leg stability and asymmetry control; reactive power",
        neuralDemand: "moderate",
        primaryPattern: "hinge",
        emphasizedPatterns: ["hinge", "unilateral_lower", "power", "lateral", "trunk"],
        cnsFlow: buildCNSFlow(["hinge", "unilateral_lower", "power", "lateral", "trunk"], "moderate", undefined, blockArchetype),
      },
      {
        dayNumber: 4,
        identity: "Full Body Integration + Power Expression",
        intent: "Full-system power + compound strength + unilateral coordination; week-closing integration session",
        neuralDemand: "high",
        primaryPattern: "power",
        emphasizedPatterns: ["power", "squat", "hinge", "unilateral_lower", "trunk", "rotational"],
        cnsFlow: buildCNSFlow(["power", "squat", "unilateral_lower", "rotational", "trunk"], "high", undefined, blockArchetype),
      },
    ];
  }

  if (daysPerWeek === 5) {
    // Variant B: Push/Pull/Legs emphasis — dedicated push and pull days
    if ((variationSeed ?? 0) >= 0.5) {
      return [
        {
          dayNumber: 1,
          identity: "Squat-Dominant Lower + Power",
          intent: "Squat-first lower session; vertical force production base; power primer before main lift",
          neuralDemand: "high",
          primaryPattern: "squat",
          emphasizedPatterns: ["squat", "power", "unilateral_lower", "trunk"],
          cnsFlow: buildCNSFlow(["squat", "power", "unilateral_lower", "trunk"], "high", undefined, blockArchetype),
          sportNotes: isHockey ? "Lateral drive bias from squat; lateral bound" : undefined,
        },
        {
          dayNumber: 2,
          identity: "Push: Chest + Shoulders + Triceps",
          intent: "Press-dominant upper strength; horizontal bench and overhead pressing as primary movers; anterior delt and tricep volume",
          neuralDemand: "moderate",
          primaryPattern: "upper_push",
          emphasizedPatterns: ["upper_push", "trunk"],
          cnsFlow: buildCNSFlow(["upper_push", "trunk"], "moderate", undefined, blockArchetype),
          sportNotes: isHockey ? "Landmine press; rotational med ball work; face pull between sets" : undefined,
        },
        {
          dayNumber: 3,
          identity: "Pull: Back + Biceps + Posterior Chain",
          intent: "Pull-dominant upper session; vertical and horizontal pull compound work; posterior chain volume finisher",
          neuralDemand: "moderate",
          primaryPattern: "upper_pull",
          emphasizedPatterns: ["upper_pull", "hinge", "trunk"],
          cnsFlow: buildCNSFlow(["upper_pull", "hinge", "trunk"], "moderate", undefined, blockArchetype),
          sportNotes: isHockey ? "Bent-over row; weighted chin-up; rotational trunk work" : undefined,
        },
        {
          dayNumber: 4,
          identity: "Hinge-Dominant Lower + Unilateral Resilience",
          intent: "Deadlift-pattern peak force; posterior chain and hamstring depth; single-leg stability and asymmetry work",
          neuralDemand: "moderate",
          primaryPattern: "hinge",
          emphasizedPatterns: ["hinge", "unilateral_lower", "lateral", "trunk"],
          cnsFlow: buildCNSFlow(["hinge", "unilateral_lower", "lateral", "trunk"], "moderate", undefined, blockArchetype),
          sportNotes: isHockey ? "Single-leg RDL; lateral lunge; Copenhagen plank" : undefined,
        },
        {
          dayNumber: 5,
          identity: "Full Body Power + Integration",
          intent: "Week-closing power expression; full-body integration; explosive compound movements",
          neuralDemand: "high",
          primaryPattern: "power",
          emphasizedPatterns: ["power", "squat", "hinge", "rotational", "lateral", "trunk"],
          cnsFlow: buildCNSFlow(["power", "squat", "lateral", "rotational", "trunk"], "high", undefined, blockArchetype),
          sportNotes: isHockey ? "Broad jump + lateral bound complex; sled push; rotational med ball; carry" : undefined,
        },
      ];
    }
    return [
      {
        dayNumber: 1,
        identity: "Lower Force Production",
        intent: "Squat-dominant bilateral strength; power output; unilateral stability",
        neuralDemand: "high",
        primaryPattern: "squat",
        emphasizedPatterns: ["squat", "power", "unilateral_lower", "trunk"],
        cnsFlow: buildCNSFlow(["squat", "power", "unilateral_lower", "trunk"], "high", undefined, blockArchetype),
        sportNotes: isHockey ? "Lateral drive bias from squat; lateral bound" : undefined,
      },
      {
        dayNumber: 2,
        identity: "Upper Push Strength",
        intent: "Horizontal and vertical pressing strength; shoulder integrity; upper trunk stiffness",
        neuralDemand: "moderate",
        primaryPattern: "upper_push",
        emphasizedPatterns: ["upper_push", "trunk"],
        cnsFlow: buildCNSFlow(["upper_push", "trunk"], "moderate", undefined, blockArchetype),
        sportNotes: isHockey ? "Rotational med ball press; landmine press; face pull" : undefined,
      },
      {
        dayNumber: 3,
        identity: "Posterior Chain + Unilateral",
        intent: "Hinge-dominant posterior chain; single-leg stability; elastic and reactive power",
        neuralDemand: "moderate",
        primaryPattern: "hinge",
        emphasizedPatterns: ["hinge", "unilateral_lower", "lateral", "trunk"],
        cnsFlow: buildCNSFlow(["hinge", "unilateral_lower", "lateral", "trunk"], "moderate", undefined, blockArchetype),
        sportNotes: isHockey ? "Single-leg RDL; lateral lunge; Copenhagen plank" : undefined,
      },
      {
        dayNumber: 4,
        identity: "Upper Pull Strength + Structural Balance",
        intent: "Vertical and horizontal pull dominance; scapular integrity; pressing complement",
        neuralDemand: "moderate",
        primaryPattern: "upper_pull",
        emphasizedPatterns: ["upper_pull", "upper_push", "trunk"],
        cnsFlow: buildCNSFlow(["upper_pull", "upper_push", "trunk"], "moderate", undefined, blockArchetype),
        sportNotes: isHockey ? "Bent-over row; weighted chin-up; rotational trunk" : undefined,
      },
      {
        dayNumber: 5,
        identity: "Full Body Power + Integration",
        intent: "Week-closing power expression; full-body integration; sport transfer",
        neuralDemand: "high",
        primaryPattern: "power",
        emphasizedPatterns: ["power", "squat", "hinge", "rotational", "lateral", "trunk"],
        cnsFlow: buildCNSFlow(["power", "squat", "lateral", "rotational", "trunk"], "high", undefined, blockArchetype),
        sportNotes: isHockey ? "Broad jump + lateral bound complex; sled push; rotational med ball; carry" : undefined,
      },
    ];
  }

  if (daysPerWeek === 6) {
    return [
      {
        dayNumber: 1,
        identity: "Lower Power + Force Production",
        intent: "High CNS squat + vertical power output; week opener",
        neuralDemand: "high",
        primaryPattern: "squat",
        emphasizedPatterns: ["squat", "power", "trunk"],
        cnsFlow: buildCNSFlow(["squat", "power", "trunk"], "high", undefined, blockArchetype),
        sportNotes: isHockey ? "Lateral bound before squats; Pallof press" : undefined,
      },
      {
        dayNumber: 2,
        identity: "Upper Push Strength",
        intent: "Horizontal and vertical pressing; shoulder and trunk integrity",
        neuralDemand: "moderate",
        primaryPattern: "upper_push",
        emphasizedPatterns: ["upper_push", "trunk"],
        cnsFlow: buildCNSFlow(["upper_push", "trunk"], "moderate", undefined, blockArchetype),
      },
      {
        dayNumber: 3,
        identity: "Posterior Chain + Hinge",
        intent: "Hinge-dominant; posterior chain volume; unilateral stability",
        neuralDemand: "moderate",
        primaryPattern: "hinge",
        emphasizedPatterns: ["hinge", "unilateral_lower", "trunk"],
        cnsFlow: buildCNSFlow(["hinge", "unilateral_lower", "trunk"], "moderate", undefined, blockArchetype),
        sportNotes: isHockey ? "Single-leg RDL; lateral lunge; Copenhagen plank" : undefined,
      },
      {
        dayNumber: 4,
        identity: "Upper Pull Strength",
        intent: "Vertical and horizontal pull; structural balance from Days 2–3",
        neuralDemand: "moderate",
        primaryPattern: "upper_pull",
        emphasizedPatterns: ["upper_pull", "trunk"],
        cnsFlow: buildCNSFlow(["upper_pull", "trunk"], "moderate", undefined, blockArchetype),
        sportNotes: isHockey ? "Rotational med ball; face pull; band external rotation" : undefined,
      },
      {
        dayNumber: 5,
        identity: "Full Body Power + Unilateral Integration",
        intent: "Reactive power; full-body compound integration; sport transfer specificity",
        neuralDemand: "high",
        primaryPattern: "power",
        emphasizedPatterns: ["power", "unilateral_lower", "lateral", "rotational", "trunk"],
        cnsFlow: buildCNSFlow(["power", "unilateral_lower", "lateral", "rotational", "trunk"], "high", undefined, blockArchetype),
        sportNotes: isHockey ? "Broad jump + lateral bound; lateral step-up; rotational med ball" : undefined,
      },
      {
        dayNumber: 6,
        identity: "Athlete Finisher + Conditioning",
        intent: "Lower-intensity integration; conditioning and trunk emphasis; structural resilience",
        neuralDemand: "low",
        primaryPattern: "trunk",
        emphasizedPatterns: ["trunk", "lateral", "rotational", "locomotion"],
        cnsFlow: buildCNSFlow(["trunk", "lateral", "rotational"], "low", undefined, blockArchetype),
        sportNotes: isHockey ? "Sled push; lateral band work; carry complex; hip flexor + adductor care" : undefined,
      },
    ];
  }

  return buildSessionsForDayCount(4, sport, goal);
}

// ─── Movement allocation computation ─────────────────────────────────────────

function computeMovementAllocation(sessions: SessionArchitecture[], sport: string | null): MovementAllocation {
  const alloc: MovementAllocation = {
    squat: 0,
    hinge: 0,
    unilateral_lower: 0,
    upper_push: 0,
    upper_pull: 0,
    trunk: sessions.length,
    power: 0,
  };

  const isHockey = sport?.toLowerCase().includes("hockey") ?? false;
  const isAthletic = !!sport;

  for (const s of sessions) {
    for (const p of s.emphasizedPatterns) {
      if (p === "squat") alloc.squat++;
      else if (p === "hinge") alloc.hinge++;
      else if (p === "unilateral_lower") alloc.unilateral_lower++;
      else if (p === "upper_push") alloc.upper_push++;
      else if (p === "upper_pull") alloc.upper_pull++;
      else if (p === "power") alloc.power++;
      else if (p === "lateral") alloc.lateral = (alloc.lateral ?? 0) + 1;
      else if (p === "rotational") alloc.rotational = (alloc.rotational ?? 0) + 1;
    }
  }

  return alloc;
}

// ─── Main: compute weekly architecture ───────────────────────────────────────

// ─── Block-archetype session identity overrides ───────────────────────────────
// Applied as post-processing after buildSessionsForDayCount so sport-specific
// templates are not affected. Only changes identity + intent labels for generic
// (non-sport) programs, giving the AI different framing per block context.
function applyBlockArchetypeIdentityOverride(
  session: SessionArchitecture,
  blockArchetype: string,
  preserveIdentity = false,
): SessionArchitecture {
  const p = session.primaryPattern;

  // Archetype intent annotations — used when preserveIdentity=true (sport sessions)
  // to append loading-philosophy context without erasing sport-specific session names.
  const archetypeIntentSuffix: Record<string, string> = {
    INTENSIFICATION_STRENGTH:
      "BLOCK CONTEXT: Intensification block — fewer total movements, heavier load. Load and quality over volume. Full rest between sets.",
    POWER_ELASTIC_CONVERSION:
      "BLOCK CONTEXT: Power/elastic conversion block — speed and reactive output IS the primary goal. Velocity intent on all compound movements.",
    FOUNDATION_ACCUMULATION:
      "BLOCK CONTEXT: Foundation accumulation block — full movement stack, volume density, work capacity finisher. Building structural and metabolic base.",
    WORK_CAPACITY_BLOCK:
      "BLOCK CONTEXT: Work capacity block — circuit density, shorter rest, accumulation of volume. Volume is the stimulus.",
    REBUILD_DELOAD:
      "BLOCK CONTEXT: Rebuild/deload block — reduced volume and intensity. Recovery-emphasis loading (50-60% 1RM). Maintain movement quality, not chasing performance.",
  };

  if (preserveIdentity) {
    const suffix = archetypeIntentSuffix[blockArchetype];
    if (!suffix) return session;
    return {
      ...session,
      intent: `${session.intent} | ${suffix}`,
    };
  }

  if (blockArchetype === "INTENSIFICATION_STRENGTH") {
    if (p === "squat") {
      return {
        ...session,
        identity: "Maximum Lower Force — Intensification Block",
        intent: "Peak bilateral squat force via progressive overload. Fewer total movements, heavier load. Quality and load density over volume. No superfluous accessory.",
      };
    }
    if (p === "hinge") {
      return {
        ...session,
        identity: "Posterior Chain Intensification — Peak Hinge Force",
        intent: "Heavy deadlift-pattern posterior chain maximal loading. Minimal accessory volume. Two compound movements, heavy loading, full rest between sets.",
      };
    }
    if (p === "upper_push") {
      return {
        ...session,
        identity: "Horizontal Press Strength — Intensification Block",
        intent: "Peak pressing force via heavy bilateral compound with full rest. Pull volume for structural balance. Session density is managed by load, not exercise count.",
      };
    }
    if (p === "upper_pull") {
      return {
        ...session,
        identity: "Vertical + Horizontal Pull Strength — Intensification Block",
        intent: "Maximum pulling load with full rest. Scapular strength and posterior shoulder development. Session identity is pulling strength, not volume.",
      };
    }
  }

  if (blockArchetype === "POWER_ELASTIC_CONVERSION") {
    if (p === "squat" || p === "power") {
      return {
        ...session,
        identity: "Elastic/Reactive Power Development + Lower Contrast",
        intent: "Reactive and elastic output IS the primary performance goal. Bilateral squat is the contrast potentiation vehicle — bar speed on every rep. Session opens with elastic work, compounds are the contrast partner.",
      };
    }
    if (p === "hinge") {
      return {
        ...session,
        identity: "Hip Drive Power + Elastic Posterior Chain",
        intent: "Ballistic hip extension and elastic hamstring loading. Hinge compound as loaded contrast. Speed-strength day — velocity intent throughout.",
      };
    }
    if (p === "upper_push") {
      return {
        ...session,
        identity: "Upper Power Expression + Press Contrast",
        intent: "Upper explosive output via ballistic pressing or med ball. Horizontal press as the contrast compound. Speed and power dominates this session, not grinding load.",
      };
    }
  }

  if (blockArchetype === "FOUNDATION_ACCUMULATION" || blockArchetype === "WORK_CAPACITY_BLOCK") {
    if (p === "squat") {
      return {
        ...session,
        identity: "Lower Volume Accumulation — Squat Foundation",
        intent: "Bilateral squat volume and posterior chain accumulation. Full movement stack. Work capacity finisher closes the session — density is the training stimulus.",
      };
    }
    if (p === "hinge") {
      return {
        ...session,
        identity: "Posterior Chain Volume — Hinge Accumulation",
        intent: "Hinge-dominant volume accumulation with full unilateral and trunk stack. Conditioning finisher to close. Building structural and metabolic capacity.",
      };
    }
  }

  return session;
}

export function computeWeeklyArchitecture(
  daysPerWeek: number,
  sport: string | null,
  goal: string | null,
  variationSeed?: number,
  blockArchetype?: string,
): WeeklyArchitecture {
  const days = Math.max(2, Math.min(6, daysPerWeek));
  let sessions = buildSessionsForDayCount(days, sport, goal, variationSeed, blockArchetype);

  // Apply block-archetype session identity overrides.
  // Generic (non-sport) programs get full identity + intent replacement.
  // Sport-specific programs have their bespoke identity preserved; archetype context
  // is appended to the intent field so the AI understands the loading philosophy.
  const sportLc = sport?.toLowerCase() ?? "";
  const hasSportTemplate = sportLc.includes("hockey") || sportLc.includes("football") ||
    sportLc.includes("basketball") || sportLc.includes("soccer") || sportLc.includes("baseball") ||
    sportLc.includes("softball") || sportLc.includes("tennis") || sportLc.includes("golf") ||
    sportLc.includes("swim") || sportLc.includes("rowing") || sportLc.includes("cycling") ||
    sportLc.includes("mma") || sportLc.includes("boxing") || sportLc.includes("wrestling");

  if (blockArchetype) {
    sessions = sessions.map((s) =>
      applyBlockArchetypeIdentityOverride(s, blockArchetype, hasSportTemplate)
    );
  }

  const movementAllocation = computeMovementAllocation(sessions, sport);
  const isHockey = sportLc.includes("hockey");

  const weeklyRhythm = sessions
    .map((s) => `Day ${s.dayNumber} (${s.neuralDemand.toUpperCase()} CNS): ${s.identity}`)
    .join(" → ");

  const recoveryNotes = isHockey
    ? [
        "High-CNS days are separated by at least one moderate/low day.",
        "Lateral and rotational stress distributed across ≥2 sessions to avoid adductor overload.",
        "Squat and hinge patterns are never on back-to-back days.",
        "No bilateral lower-body high-CNS days run consecutively.",
        "Hockey-specific tissue care: adductor, hip flexor, groin work embedded in unilateral days.",
      ].join(" ")
    : [
        "High-CNS days alternate with moderate/low-demand days.",
        "Squat and hinge are separated — no same-pattern consecutive days.",
        "Upper push and pull are balanced across the week.",
        "Every session has trunk work regardless of focus.",
      ].join(" ");

  return { daysPerWeek: days, sport, goal, sessions, movementAllocation, weeklyRhythm, recoveryNotes };
}

// ─── Build Architecture Brief (AI prompt injection) ──────────────────────────

/** Stores the slot selections from the most recent buildArchitectureBrief call (non-SP path). */
let _lastSlotSelection: SlotExerciseSelection | null = null;
let _lastMonthlyPlan: MonthlyBlockPlan | null = null;

export function buildArchitectureBrief(
  daysPerWeek: number | null,
  sport: string | null,
  goal: string | null,
  userRequest: string,
  variationSeed?: number,
  agentControlDirectives?: AgentControlDirectives,
): string | null {
  if (!daysPerWeek || daysPerWeek < 2) return null;

  const seed = variationSeed ?? Math.random();

  // Always reset side-effect state before any path — stale data from prior builds must never leak.
  _lastSlotSelection = null;
  _lastMonthlyPlan = null;

  // ── Special Population Detection — route BEFORE any athlete logic ──────────
  // If the user request matches an older adult, beginner, post-rehab, pain-sensitive,
  // low-impact, or prenatal profile, route them into the dedicated special populations
  // engine. This is a hard early exit — special populations never reach athlete templates.
  const spProfile = detectSpecialPopulation(userRequest, goal);
  if (spProfile) {
    // Build special-population monthly block plan for audit tracing
    const spMonthlyPlan = buildMonthlyBlockPlan(goal, sport, null, seed, true);
    const spWeeklyPlans = buildWeeklyBlockPlans(spMonthlyPlan, daysPerWeek, sport, seed);

    if (process.env.NODE_ENV !== "production") {
      console.log("[BuildAudit:Architecture]", JSON.stringify({
        path: "special_population",
        spProfile: spProfile.population,
        seed: Number(seed.toFixed(4)),
        daysPerWeek, sport, goal,
        spBlockType: spMonthlyPlan.blockType,
        lockedSelections: null,
      }));
    }
    // Persist SP monthly plan for downstream storage
    _lastMonthlyPlan = spMonthlyPlan;

    // Inject the SP monthly block context into the brief
    const spMonthlyCtx = buildMonthlyBlockContext(spMonthlyPlan);
    const spWeeklyCtx = buildWeeklyBlockContext(spWeeklyPlans, 1);
    const spBrief = buildSpecialPopArchitectureBrief(daysPerWeek, goal, userRequest, spProfile, seed);
    return `${spMonthlyCtx}\n\n${spWeeklyCtx}\n\n${spBrief}`;
  }

  // Detect neural demand from request context
  const reqLc = (userRequest + " " + (goal ?? "")).toLowerCase();
  const isDeload = reqLc.includes("deload") || reqLc.includes("recovery week") || reqLc.includes("back-off week");
  const isConditioningFocus = reqLc.includes("conditioning") || reqLc.includes("endurance") || reqLc.includes("cardio");
  const neuralDemand: "high" | "moderate" | "low" = isDeload ? "low" : isConditioningFocus ? "moderate" : "high";

  // Detect equipment context
  const hasLimitedEquipment = reqLc.includes("home") || reqLc.includes("dumbbell only") || reqLc.includes("no barbell") || reqLc.includes("bodyweight");
  const equipmentLevel: "full_gym" | "dumbbells_only" | "home_limited" | "bodyweight" =
    reqLc.includes("bodyweight only") ? "bodyweight" :
    reqLc.includes("dumbbell only") || reqLc.includes("no barbell") ? "dumbbells_only" :
    hasLimitedEquipment ? "home_limited" : "full_gym";

  // Extract experience/training level from request for monthly block selection
  const experienceHint = reqLc.includes("beginner") ? "beginner" :
    reqLc.includes("novice") ? "novice" :
    reqLc.includes("intermediate") ? "intermediate" :
    reqLc.includes("advanced") ? "advanced" :
    reqLc.includes("just starting") || reqLc.includes("new to") ? "beginner" : null;

  const experienceLevel = (experienceHint ?? "intermediate") as "beginner" | "novice" | "intermediate" | "advanced";
  const recoveryProfile: "fresh" | "normal" | "fatigued" | "overtrained" =
    isDeload ? "fatigued" : reqLc.includes("tired") || reqLc.includes("sore") ? "fatigued" : "normal";

  // ── Block Variation Engine — STEP 2-5: Score and select archetype + split ──
  const auditId = generateAuditId();

  const userConstraints = {
    goal,
    sport,
    daysPerWeek,
    experienceLevel,
    recoveryProfile,
    neuralDemandHint: neuralDemand,
    isDeload,
    isSpecialPopulation: false,
    equipmentLevel,
    seed,
  };

  // First selection attempt
  let blockSelection = selectBlockAndSplit(userConstraints, false, null);

  // ── Hierarchical Planning — Layer 1: Monthly Block (archetype-driven) ───────
  const targetBlockType = archetypeToMonthlyBlockType(blockSelection.archetypeId, userConstraints);
  const monthlyPlan = buildMonthlyBlockPlan(goal, sport, experienceHint, seed, false, targetBlockType);

  // Patch displayName with archetype label so the UI header is accurate
  const enrichedMonthlyPlan = {
    ...monthlyPlan,
    displayName: blockSelection.archetype.label,
    missionStatement: blockSelection.archetype.introCopyTemplate,
    blockType: monthlyPlan.blockType,
  };
  _lastMonthlyPlan = enrichedMonthlyPlan;

  // ── Hierarchical Planning — Layer 2: Weekly Block ──────────────────────────
  const weeklyPlans = buildWeeklyBlockPlans(enrichedMonthlyPlan, daysPerWeek, sport, seed);
  const activeWeekPlan = weeklyPlans[0]; // establish week

  // ── Slot exercise selection with archetype-aware block context ───────────────
  const blockCtx: BlockSelectionContext = {
    blockType: String(enrichedMonthlyPlan.blockType),
    weekRole: activeWeekPlan.role,
  };

  // Estimate novelty pressure from recent fingerprint history (pre-similarity check)
  // Used to amplify exercise variety when recent builds have been too homogeneous.
  const recentFingerprintsPreview = getRecentFingerprints(3);
  const estimatedNoveltyPressure = Math.min(0.8, recentFingerprintsPreview.length * 0.25);

  // Build the unified program context profile — connects Block Variation Engine
  // to Exercise Variation Engine so block archetype drives exercise scoring.
  const programContext = buildProgramContextProfile({
    archetypeId: blockSelection.archetypeId,
    splitId: blockSelection.splitId,
    constraints: userConstraints,
    currentPhase: "establish",
    noveltyPressure: estimatedNoveltyPressure,
    variationSeed: blockSelection.variationSeed,
    generationId: auditId,
    agentControlDirectives,
  });

  // Use the split's variationSeed for session template selection
  const splitVariationSeed = blockSelection.variationSeed;
  // dayIndex=0: architecture brief generates the primary/anchor day template
  const slotSelection = selectSlotExercises(splitVariationSeed, sport, goal, neuralDemand, equipmentLevel, isDeload, blockCtx, programContext, 0);
  _lastSlotSelection = slotSelection;

  // ── STEP 9: Similarity check ──────────────────────────────────────────────
  const elasticCount = blockSelection.split.dayTemplates.filter((d) => d.elasticExposure).length;
  const lowerCount = blockSelection.split.dayTemplates.filter((d) =>
    d.primaryPattern === "squat" || d.primaryPattern === "hinge" || d.primaryPattern === "unilateral_lower",
  ).length;
  const upperCount = blockSelection.split.dayTemplates.filter((d) =>
    d.primaryPattern === "upper_push" || d.primaryPattern === "upper_pull",
  ).length;

  const candidateFingerprint = buildFingerprint({
    blockArchetype: blockSelection.archetypeId,
    splitArchitecture: blockSelection.splitId,
    blockType: String(enrichedMonthlyPlan.blockType),
    weeklyRhythm: blockSelection.split.weeklyRhythmDescription,
    slotSelections: slotSelection as unknown as Record<string, string>,
    neuralDemandProfile: blockSelection.archetype.neuralDemandProfile,
    daysPerWeek,
    elasticExposureCount: elasticCount,
    lowerDaysCount: lowerCount,
    upperDaysCount: upperCount,
    variationTags: blockSelection.archetype.variationTags,
  });

  const recentFingerprints = getRecentFingerprints(3);
  const similarityResult = computeSimilarity(candidateFingerprint, recentFingerprints);
  logSimilarityResult(candidateFingerprint, similarityResult);

  // ── STEP 10: Fallback if too similar ──────────────────────────────────────
  let fallbackTriggered = false;
  let fallbackReason: string | null = null;

  if (similarityResult.isTooSimilar && recentFingerprints.length >= 2) {
    fallbackTriggered = true;
    fallbackReason = `similarity_threshold_exceeded (score=${similarityResult.score.toFixed(2)})`;

    // Try second-best archetype/split
    const fallbackSelection = selectBlockAndSplit(userConstraints, true, fallbackReason);
    if (fallbackSelection.archetypeId !== blockSelection.archetypeId ||
        fallbackSelection.splitId !== blockSelection.splitId) {
      blockSelection = fallbackSelection;

      // Rebuild with new archetype
      const fallbackBlockType = archetypeToMonthlyBlockType(fallbackSelection.archetypeId, userConstraints);
      const fallbackMonthlyPlan = buildMonthlyBlockPlan(goal, sport, experienceHint, seed, false, fallbackBlockType);
      const enrichedFallback = {
        ...fallbackMonthlyPlan,
        displayName: fallbackSelection.archetype.label,
        missionStatement: fallbackSelection.archetype.introCopyTemplate,
      };
      _lastMonthlyPlan = enrichedFallback;
    } else {
      if (process.env.NODE_ENV !== "production") {
        console.warn("[BlockRulesAuditWarning] Similarity threshold bypassed by fallback with no valid alternative — keeping original selection");
      }
    }
  }

  // Record fingerprint for future builds
  recordFingerprint(candidateFingerprint);

  // ── Block Rules Audit ─────────────────────────────────────────────────────
  const fingerprintStr = buildFingerprintString(
    blockSelection.archetypeId,
    blockSelection.splitId,
    [slotSelection.bilateral_squat_strength, slotSelection.bilateral_hinge_strength, slotSelection.lower_power],
    blockSelection.archetype.neuralDemandProfile,
  );

  emitBlockRulesAudit({
    generationId: auditId,
    mode: reqLc.includes("speed") || reqLc.includes("athletic") ? "speed" : reqLc.includes("strength") ? "strength" : "general",
    goal,
    daysPerWeek,
    equipmentSummary: equipmentLevel,
    recentProgramIds: [],
    archetypeCandidates: blockSelection.archetypeCandidates,
    chosenArchetype: blockSelection.archetypeId,
    archetypeRuleHits: blockSelection.archetypeRuleHits,
    archetypeRuleMisses: blockSelection.archetypeRuleMisses,
    splitCandidates: blockSelection.splitCandidates,
    chosenSplit: blockSelection.splitId,
    splitRuleHits: blockSelection.splitRuleHits,
    slotWeightAdjustmentsApplied: blockSelection.archetype.slotWeightAdjustments.map(
      (a) => `${a.slot}×${a.modifier}`,
    ),
    movementBiasesApplied: blockSelection.archetype.movementBiases,
    similarityScore: similarityResult.score,
    fallbackTriggered,
    fallbackReason,
    finalProgramFingerprint: fingerprintStr,
  });

  if (process.env.NODE_ENV !== "production") {
    console.log("[BuildAudit:Architecture]", JSON.stringify({
      path: "athlete_block_engine",
      auditId,
      seed: Number(seed.toFixed(4)),
      splitVariationSeed: Number(splitVariationSeed.toFixed(4)),
      chosenArchetype: blockSelection.archetypeId,
      chosenSplit: blockSelection.splitId,
      blockType: targetBlockType,
      daysPerWeek, sport, goal,
      neuralDemand, equipmentLevel, isDeload,
      fallbackTriggered,
      lockedSelections: {
        lower_power: slotSelection.lower_power,
        bilateral_squat: slotSelection.bilateral_squat_strength,
        bilateral_hinge: slotSelection.bilateral_hinge_strength,
        unilateral_lower: slotSelection.unilateral_lower,
        upper_push: slotSelection.upper_push_primary,
        upper_pull: slotSelection.upper_pull_primary,
        trunk_anti_rotation: slotSelection.trunk_anti_rotation,
      },
    }));
  }

  // ── Program Variance Audit ────────────────────────────────────────────────
  // Build the extended fingerprint AFTER exercises are selected so we have
  // the full picture: block + split + slot exercises + day themes + family counts.
  const extendedFingerprint = buildExtendedFingerprint({
    generationId: auditId,
    blockArchetype: blockSelection.archetypeId,
    currentPhase: "establish",
    progressionStyle: blockSelection.archetype.progressionStyle,
    neuralDemandProfile: blockSelection.archetype.neuralDemandProfile,
    fatigueProfile: blockSelection.archetype.fatigueProfile,
    splitArchitecture: blockSelection.splitId,
    weeklyRhythm: blockSelection.split.weeklyRhythmDescription,
    daysPerWeek,
    dayTemplates: blockSelection.split.dayTemplates,
    slotSelections: slotSelection as unknown as Record<string, unknown>,
    variationTags: blockSelection.archetype.variationTags,
  });

  // Run the variance audit against recent program history.
  // Logs [ProgramVarianceAudit], [ProgramVarianceAuditWarning] in DEV.
  // Returns the audit result including rerollRecommended flag.
  const varianceAuditResult = runProgramVarianceAudit(extendedFingerprint);

  // If variance is too low and we haven't already attempted a re-selection:
  // log the reroll recommendation. The next generation will pick up the
  // boosted novelty pressure from the variance score via the estimatedNoveltyPressure path.
  if (varianceAuditResult.rerollRecommended && !fallbackTriggered) {
    emitRerollLog("boost_novelty_pressure", "low_variance");
  }

  // ── Perceived Variance Audit ──────────────────────────────────────────────
  // Detects visible sameness: same first explosive, squat, unilateral, trunk.
  // Emits [PerceivedVarianceAudit], [PerceivedVarianceAuditWarning], [PerceivedVarianceAuditReroll].
  // The per-slot contrast penalties (injected during scoring) already address
  // the root cause on the next build — this audit tells us if they're working.
  runPerceivedVarianceAudit(
    auditId,
    slotSelection,
    blockSelection.split.dayTemplates,
  );

  const arch = computeWeeklyArchitecture(daysPerWeek, sport, goal, splitVariationSeed, blockSelection.archetypeId);
  const isHockey = sport?.toLowerCase().includes("hockey") ?? false;
  const isFootball = !!(sport && /\bfootball\b/i.test(sport) && !/soccer/.test(sport.toLowerCase()));
  const isBasketball = !!(sport && /basketball/i.test(sport));
  const isSoccer = !!(sport && /soccer|association football/i.test(sport));
  const isBaseball = !!(sport && /baseball|softball/i.test(sport));
  const hasSportProfile = isFootball || isBasketball || isSoccer || isBaseball || isHockey;

  // Sport category detection for validation rules
  const sportLc = sport?.toLowerCase() ?? "";
  const isCat3Sport = sportLc.includes("tennis") || sportLc.includes("pickleball") || sportLc.includes("squash")
    || sportLc.includes("padel") || sportLc.includes("baseball") || sportLc.includes("softball") || sportLc.includes("golf");
  const isCat4Sport = sportLc.includes("swim") || sportLc.includes("rowing") || sportLc.includes("cycling")
    || sportLc.includes("triathlon") || sportLc.includes("cyclist") || sportLc.includes("rower");
  const isCat5Sport = sportLc.includes("mma") || sportLc.includes("boxing") || sportLc.includes("wrestling")
    || sportLc.includes("bjj") || sportLc.includes("judo") || sportLc.includes("muay thai")
    || sportLc.includes("kickboxing") || sportLc.includes("martial art");
  const isPowerOptional = isCat3Sport || isCat4Sport || isCat5Sport;
  const isConditioningGoal = !!(
    goal?.toLowerCase().includes("conditioning") ||
    goal?.toLowerCase().includes("endurance") ||
    goal?.toLowerCase().includes("cardio") ||
    goal?.toLowerCase().includes("aerobic") ||
    goal?.toLowerCase().includes("work capacity")
  );

  // Post-process CNS flow blocks: replace generic descriptions and always inject
  // specific exercises from the variation engine. Prep blocks are ALWAYS replaced
  // with family-aware, week-role-driven, day-varied descriptions.
  function overlayBlockWithSlot(
    block: CNSBlock,
    patterns: MovementPattern[],
    nd: NeuralDemand,
    dayNumber: number,
  ): CNSBlock {
    const isHingeDay = patterns.includes("hinge") && !patterns.includes("squat");

    // ── PREP — always replace with dynamic prep family selection ───────────
    if (block.role === "prep") {
      const prepDesc = selectPrepDescription({
        patterns,
        blockArchetype: blockSelection.archetypeId,
        weekRole: activeWeekPlan.role,
        sport,
        dayNumber,
        seed: splitVariationSeed,
      });

      if (process.env.NODE_ENV !== "production") {
        console.log("[PrepAudit]", JSON.stringify({
          weekNumber: 1,
          dayNumber,
          sessionIdentity: arch.sessions.find(s => s.dayNumber === dayNumber)?.identity ?? "unknown",
          blockArchetype: blockSelection.archetypeId,
          weekRole: activeWeekPlan.role,
          prepDescription: prepDesc.substring(0, 80) + "...",
        }));
      }

      return { ...block, description: prepDesc };
    }

    // ── POWER — use day-specific exercise to prevent same exercise every session ─
    if (block.role === "power") {
      const dayExercise = getDayPowerExercise(slotSelection, dayNumber);
      const weekRole = activeWeekPlan.role;

      if (patterns.includes("rotational") && !patterns.some(p => ["squat", "hinge", "unilateral_lower"].includes(p))) {
        return { ...block, description: buildRotationalPowerDescription(slotSelection) };
      }
      if (patterns.some(p => ["squat", "hinge", "unilateral_lower"].includes(p))) {
        // Check if description is already a specific CNS primer (INTENSIFICATION or POWER_ELASTIC archetypes)
        // — those have specific intent text that should be preserved but exercise swapped
        const isPotentiationPrimer = block.description.includes("CNS POTENTIATION") || block.description.includes("ELASTIC/REACTIVE BLOCK");
        if (isPotentiationPrimer) {
          // Replace the specific exercise name in the existing description with the day exercise
          const updatedDesc = block.description.replace(slotSelection.lower_power, dayExercise);
          if (process.env.NODE_ENV !== "production") {
            console.log("[PowerAudit]", JSON.stringify({ dayNumber, weekRole, dayExercise, lower_power: slotSelection.lower_power }));
          }
          return { ...block, description: updatedDesc };
        }
        const desc = buildLowerPowerDescription(slotSelection, nd, dayExercise, weekRole);
        if (process.env.NODE_ENV !== "production") {
          console.log("[PowerAudit]", JSON.stringify({
            dayNumber,
            weekRole,
            selectedExercise: dayExercise,
            powerIntent: weekRole === "intensify" ? "MAXIMUM intent" : weekRole === "establish" ? "teach movement" : "maximum intent",
          }));
        }
        return { ...block, description: desc };
      }
      // Upper/mixed power block
      if (!block.description.includes(" or ") && !block.description.includes("variation")) return block;
      return { ...block, description: `Med ball power: ${slotSelection.rotational_power} or chest throw (3–4 sets × 3–5 reps)` };
    }

    // ── All other blocks — only replace generic descriptions ──────────────
    const isGeneric = block.description.includes(" or ") || block.description.includes("variation");
    if (!isGeneric) return block;

    if (block.role === "primary" && patterns.includes("squat")) {
      return { ...block, description: buildSquatPrimaryDescription(slotSelection) };
    }
    if (block.role === "primary" && patterns.includes("hinge")) {
      return { ...block, description: buildHingePrimaryDescription(slotSelection) };
    }
    if (block.role === "primary" && patterns.includes("upper_push")) {
      return { ...block, description: buildUpperPushDescription(slotSelection, true) };
    }
    if (block.role === "primary" && patterns.includes("upper_pull")) {
      return { ...block, description: buildUpperPullDescription(slotSelection, true) };
    }
    if (block.role === "secondary" && patterns.includes("squat")) {
      return { ...block, description: `Secondary hinge complement: ${slotSelection.bilateral_hinge_strength} + posterior chain support (3 × 8–10)` };
    }
    if (block.role === "secondary" && patterns.includes("hinge")) {
      return { ...block, description: `Secondary squat complement: ${slotSelection.unilateral_lower} + posterior chain support (3 × 8–10)` };
    }
    if (block.role === "secondary" && (patterns.includes("upper_push") || patterns.includes("upper_pull"))) {
      return { ...block, description: `Structural balance: ${slotSelection.upper_pull_secondary} — horizontal or vertical pull to complement press (3–4 × 8–12)` };
    }
    if (block.role === "unilateral") {
      return { ...block, description: buildUnilateralDescription(slotSelection, isHingeDay) };
    }
    if (block.role === "trunk") {
      return { ...block, description: buildTrunkDescription(slotSelection, patterns.includes("rotational")) };
    }
    return block;
  }

  const sessionLines = arch.sessions.map((s) => {
    const processedFlow = s.cnsFlow.map((b) => overlayBlockWithSlot(b, s.emphasizedPatterns, s.neuralDemand, s.dayNumber));
    const flowRoles = processedFlow.map((b) => `[${b.role.toUpperCase()}] ${b.description}`).join("\n    ");
    const sportLine = s.sportNotes ? `\n  SPORT OVERLAY: ${s.sportNotes}` : "";

    // Audit slot layout for each session
    if (process.env.NODE_ENV !== "production") {
      const weekSessionRole = activeWeekPlan.sessionRoles[s.dayNumber - 1];

      // [SessionGrammarAudit] — full grammar decision trace per day
      const isLowerSession = s.emphasizedPatterns.some(p => ["squat", "hinge", "unilateral_lower"].includes(p));
      const hasUnilateralBlock = processedFlow.some(b => b.role === "unilateral");
      const hasFinisherBlock = processedFlow.some(b => b.role === "finisher");
      const hasPowerBlock = processedFlow.some(b => b.role === "power");
      const hasSecondaryBlock = processedFlow.some(b => b.role === "secondary");
      const mandatoryBlocks = processedFlow.filter(b => ["prep", "primary"].includes(b.role)).map(b => b.role);
      const conditionalBlocks = processedFlow.filter(b => !["prep", "primary"].includes(b.role)).map(b => b.role);
      console.log("[SessionGrammarAudit]", JSON.stringify({
        day: s.dayNumber,
        monthlyBlockType: monthlyPlan.blockType,
        weeklyBlockRole: activeWeekPlan.role,
        sessionRole: weekSessionRole?.sessionRole ?? "unknown",
        blockArchetype: blockSelection.archetypeId,
        isLowerSession,
        requiredBlocks: mandatoryBlocks,
        optionalBlocks: conditionalBlocks,
        finalBlocksUsed: processedFlow.map(b => b.role),
        finalBlockOrder: processedFlow.map(b => b.role),
        blockCount: processedFlow.length,
        hasUnilateralBlock,
        hasPowerBlock,
        hasSecondaryBlock,
        hasFinisherBlock,
        sessionIdentity: s.identity,
        mandateArchetype: blockSelection.archetypeId,
      }));

      console.log("[BuildAudit:SlotLayout]", JSON.stringify({
        day: s.dayNumber,
        identity: s.identity,
        primaryPattern: s.primaryPattern,
        emphasizedPatterns: s.emphasizedPatterns,
        neuralDemand: s.neuralDemand,
        cnsBlocks: processedFlow.map(b => b.role),
        weekRole: activeWeekPlan.role,
        sessionRole: weekSessionRole?.sessionRole ?? "unknown",
        blockType: monthlyPlan.blockType,
        blockArchetype: blockSelection.archetypeId,
      }));
    }

    return [
      `  DAY ${s.dayNumber} — ${s.identity}`,
      `  Neural demand: ${s.neuralDemand.toUpperCase()} | Primary pattern: ${s.primaryPattern.replace("_", " ")}`,
      `  Intent: ${s.intent}`,
      `  CNS Flow (enforce this sequence):`,
      `    ${flowRoles}`,
      sportLine,
    ].filter(Boolean).join("\n");
  }).join("\n\n");

  const allocLines = Object.entries(arch.movementAllocation)
    .filter(([, v]) => v && v > 0)
    .map(([k, v]) => `  ${k.replace("_", " ")}: ${v} session${v === 1 ? "" : "s"} per week`)
    .join("\n");

  const conditioningOverlay = isConditioningGoal ? `
## CONDITIONING PROGRAM ARCHITECTURE — MANDATORY RULES
This program includes dedicated conditioning sessions. Enforce these rules:

- **Conditioning sessions are NOT circuits.** A conditioning session must include named energy system work (aerobic base / lactate threshold / VO2max / anaerobic capacity / repeat sprint ability).
- **Every conditioning session must specify:** modality (run/row/bike/sprint/sled), work duration, rest duration, number of intervals, and intensity zone.
- **Dedicated conditioning days** (days with identity "Conditioning") must be structured intervals — NOT a random mix of exercises.
- **Strength sessions that include conditioning finishers** must place the conditioning block LAST, after all lifting.
- **Do NOT call lifting circuits "conditioning"** — conditioning is energy system work, not resistance training with short rest.
- **Progression must be specified:** State Week 1 → Week 3 → Week 5 targets for every conditioning session.
- **Language must name the energy system:** Instead of "cardio finisher", write "Aerobic Base: 20 min run at 60–70% max HR" or "Lactate Threshold: 4 × 5 min at 85–92% HR with 5 min rest".
` : "";

  const hockeyOverlay = isHockey ? `
## HOCKEY-SPECIFIC OVERLAY — MANDATORY
The athlete plays hockey. Every session must reflect these performance priorities:
- **Lateral force production** — lateral bounds, lateral step-ups, lateral lunge with control
- **Rotational trunk strength** — med ball rotational throw, Pallof press, half-kneeling cable chop, landmine rotation
- **Acceleration/deceleration patterns** — broad jump, snap-down drill, sled push, sprint-mechanic RDL
- **Single-leg stability** — RFESS, single-leg RDL, lateral lunge, Copenhagen plank in every lower session
- **Anti-rotation strength** — Pallof press must appear in ≥2 sessions/week
- **Edge mechanics transfer** — frame exercises as building "push-off power" and "edge control"
- **Adductor/groin resilience** — Copenhagen plank and adductor loading required in unilateral days
REDUCE or ELIMINATE:
- Bilateral-only lower body isolation without sport purpose
- Pure hypertrophy accessory work without athletic transfer
- High-volume quad-dominant loading without corresponding posterior chain balance
` : "";

  const footballOverlay = isFootball ? `
## FOOTBALL-SPECIFIC OVERLAY — MANDATORY
This program is for an American football athlete. Structural rules:
- **Acceleration work COMES FIRST** in every lower/full-body session — sprint before lifting
- **Conditioning is ANAEROBIC ONLY** — short sprint repeats (10–30m), full rest between efforts. NO long aerobic conditioning.
- **Heavy bilateral lower is the strength foundation** — use the LOCKED bilateral squat or hinge primary from the variation mandate (80%+ 1RM)
- **Trunk bracing for collision** — loaded carry or anti-rotation exercise in every session (use the LOCKED trunk selections from the variation mandate)
- **Upper press:pull must be balanced** — contact sport demands shoulder integrity
- **Med ball and contrast pairs** develop rate of force development — use in power sessions
- **EXERCISE SPECIFICITY**: Use the exercises from the LOCKED SELECTIONS table in the variation mandate. Do NOT default to Back Squat, Broad Jump, or Pallof Press unless those are the locked selections.
ELIMINATE from this football program:
- Long-duration steady-state cardio
- Soccer-style aerobic conditioning
- Pure hypertrophy isolation work without collision-transfer purpose
- Generic defaults (Back Squat, Broad Jump, Pallof Press) when the variation mandate specifies different exercises
` : "";

  const basketballOverlay = isBasketball ? `
## BASKETBALL-SPECIFIC OVERLAY — MANDATORY
This program is for a basketball athlete. Structural rules:
- **Reactive plyometrics COME FIRST** in every lower session — jumps before lifting when CNS is fresh
- **Deceleration and landing mechanics** are required — not optional, not substitutable by conditioning
- **Single-leg strength in every lower session** — all basketball actions are single-leg
- **Conditioning is EXPLOSIVE, NOT AEROBIC** — court sprints, line drills, repeat explosive efforts with full rest
- **Trap bar over barbell squat** — joint-friendly bilateral loading for tendon-sensitive athletes
- **Shoulder health is non-negotiable** — push:pull balanced, face pull in warm-up, dumbbell over barbell where appropriate
- **Copenhagen plank** — adductor and groin resilience in every lower session
ELIMINATE from this basketball program:
- Long-duration aerobic conditioning
- Heavy barbell back squat without adequate deceleration and landing mechanics first
- Pure isolated chest/arm hypertrophy without athletic transfer
` : "";

  const soccerOverlay = isSoccer ? `
## SOCCER-SPECIFIC OVERLAY — MANDATORY
This program is for a soccer athlete. Structural rules:
- **Nordic hamstring curl is MANDATORY** in every lower session — most common soccer injury vector. Non-negotiable.
- **Copenhagen plank is MANDATORY** in every lower session — adductor injuries are the second-highest soccer injury type
- **BOTH aerobic conditioning AND repeat sprint ability** are required — they are not interchangeable
- **Single-leg strength in every lower session** — all soccer movement is single-leg
- **Calf and ankle loading** are included — high running volume demands calf tissue resilience
- **Conditioning sessions must include real intervals** — named energy system work with work:rest ratios
ELIMINATE from this soccer program:
- Conditioning sessions that replace real sprint work with circuits
- Programs that ignore hamstring/adductor tissue loading
- Football-style anaerobic-only conditioning without aerobic base component
` : "";

  const baseballOverlay = isBaseball ? `
## BASEBALL-SPECIFIC OVERLAY — MANDATORY
This program is for a baseball athlete. Structural rules:
- **Med ball rotational throws are required** in every power session — rotational power IS baseball training
- **Face pull and band external rotation EVERY upper session** — arm care is non-negotiable for throwing sport athletes
- **Pull volume ≥ push volume** — scapular health demands more pulling than pressing
- **Conditioning is SHORT** — sprint repeats (20–30m) with full recovery only. NO soccer-style aerobic volume.
- **Conditioning preserves power freshness** — never sacrifice rotational power quality for conditioning volume
- **Trap bar over barbell** — safer bilateral loading pattern for rotational athletes
- **Anti-rotation trunk** (Pallof press) is required — stiff trunk converts hip rotation to power
ELIMINATE from this baseball program:
- High-volume internal rotation dominant pressing without arm-care balance
- Soccer-style long-duration conditioning
- Generic bodybuilding shoulder volume without rotator cuff and scapular control work
` : "";

  const sportOverlayBlock = hasSportProfile
    ? `${footballOverlay}${basketballOverlay}${soccerOverlay}${baseballOverlay}${hockeyOverlay}`
    : hockeyOverlay;

  const sportValidationLines = (() => {
    if (isFootball) return "\n- [ ] Acceleration sprint work present (10–20m)\n- [ ] Conditioning is anaerobic only — NO long aerobic sessions\n- [ ] Heavy bilateral lower present (80%+ 1RM)\n- [ ] Anti-rotation trunk work (loaded carry, landmine, or cable anti-rotation) in ≥2 sessions\n- [ ] Upper press:pull balanced\n- [ ] Exercises match the LOCKED SELECTIONS from the variation mandate";
    if (isBasketball) return "\n- [ ] Reactive plyometrics before lifting in lower sessions\n- [ ] Deceleration and landing mechanics session included\n- [ ] Single-leg strength in every lower session\n- [ ] Conditioning is explosive court efforts — NOT aerobic endurance\n- [ ] Push:pull balanced in upper sessions";
    if (isSoccer) return "\n- [ ] Nordic hamstring curl in EVERY lower session\n- [ ] Copenhagen plank in EVERY lower session\n- [ ] BOTH aerobic conditioning AND RSA conditioning included\n- [ ] Single-leg strength in every lower session\n- [ ] Calf or ankle loading present";
    if (isBaseball) return "\n- [ ] Med ball rotational throw in every power session\n- [ ] Face pull or external rotation in every upper session\n- [ ] Pull volume ≥ push volume\n- [ ] Conditioning is short sprint work ONLY — no aerobic endurance volume\n- [ ] Anti-rotation trunk (Pallof press) included";
    if (isHockey) return "\n- [ ] Lateral and rotational patterns present in ≥3 sessions\n- [ ] Copenhagen plank or adductor work in every lower-body day\n- [ ] Pallof press in ≥2 sessions";
    return "";
  })();

  // Build hierarchical context blocks for prompt injection
  // Use enrichedMonthlyPlan so the archetype label appears in the AI context
  const activePlan = (_lastMonthlyPlan ?? monthlyPlan) as typeof monthlyPlan;
  const monthlyBlockContext = buildMonthlyBlockContext(activePlan);
  const weeklyBlockContext = buildWeeklyBlockContext(weeklyPlans, 1);

  // Build session role annotation for the active week
  const sessionRoleAnnotation = activeWeekPlan.sessionRoles
    .map((sr, i) =>
      `  Day ${i + 1} session role: ${sr.sessionRole} — ${sr.emphasis} (Neural: ${sr.neuralDemand}, Stress: ${sr.stressLevel}, Volume bias: ${sr.volumeBias}, Intensity bias: ${sr.intensityBias})`
    )
    .join("\n");

  return `## PROGRAM ARCHITECTURE BRIEF — MANDATORY STRUCTURE
The following architecture MUST be used as the blueprint for this program.
DO NOT begin exercise selection until this structure is established.

### BLOCK IDENTITY
Block Archetype: **${blockSelection.archetype.label}** (${blockSelection.archetypeId})
Split Architecture: **${blockSelection.split.label}** (${blockSelection.splitId})
Neural Demand Profile: ${blockSelection.archetype.neuralDemandProfile.toUpperCase()}
Weekly Rhythm: ${blockSelection.split.weeklyRhythmDescription}

### REQUESTED BUILD
User request: "${userRequest.slice(0, 120)}"
Days/week: ${arch.daysPerWeek} | Sport: ${arch.sport ?? "General"} | Goal: ${arch.goal ?? "Athletic performance"}

${monthlyBlockContext}

${weeklyBlockContext}

### WEEK 1 SESSION ROLE ASSIGNMENTS (inherit into session architecture below)
${sessionRoleAnnotation}

### WEEKLY RHYTHM
${arch.weeklyRhythm}

### SESSION-BY-SESSION ARCHITECTURE
${sessionLines}

### MOVEMENT ALLOCATION ACROSS THE WEEK
${allocLines}

### RECOVERY & SPACING RULES (HARD CONSTRAINTS)
${arch.recoveryNotes}
- No same primary pattern on consecutive days
- No back-to-back high-CNS sessions
- Push:pull ratio must be balanced across the week
- Every session MUST include trunk work (not optional)
- Power/explosive work always comes first when CNS is fresh (after prep only)
${conditioningOverlay}${sportOverlayBlock}
### EXERCISE SELECTION MANDATE
Only AFTER the above architecture is locked, select exercises that:
1. Match the session's primary and secondary patterns AND the session role from the weekly block plan
2. Follow the CNS flow sequence (prep → power → primary → secondary → unilateral → trunk)
3. Use the coaching cue standard: POSITION + INTENT + TRANSFER (not muscle cues)
4. Vary exercises across sessions — no repeated primary lifts
5. Minimum 5 meaningful exercises per session (6–8 optimal for full sessions)
6. Exercise sets/reps/load must reflect the BLOCK TYPE and WEEK ROLE:
   - Accumulation block: 3–5 sets × 8–15 reps, RPE 7–8
   - Intensification block: 3–5 sets × 3–6 reps, RPE 8–9
   - Strength emphasis: 3–5 sets × 3–6 reps, 80–90%+ 1RM language
   - Power conversion: 3–5 sets × 3–5 reps explosive + strength contrast
   - Hypertrophy support: 3–5 sets × 6–12 reps, full ROM priority
   - Work capacity: higher density, circuit-style finishers appropriate
   - Re-entry resilience: 2–3 sets × 10–15 reps, RPE 5–6 MAXIMUM
   - Establish week: loading notes per day role above — RPE ceiling 7
   - Build week: add sets/reps vs Week 1 — RPE ceiling 8
   - Intensify week: peak loads — RPE ceiling 9.5
   - Deload week: 50–60% volume, 65% loads — RPE ceiling 5

${buildVariationMandate(slotSelection, sport, blockSelection.archetypeId)}

### VALIDATION CHECKLIST (apply before outputting JSON)
- [ ] Every session has a clear identity that answers "why does this day exist?"
- [ ] No consecutive high-CNS sessions
- [ ] Squat and hinge not on back-to-back days
- [ ] Push and pull balanced across the week
- [ ] Every session has trunk work
${isPowerOptional
  ? isCat3Sport
    ? "- [ ] Every session has rotational med ball power work (NOT plyometrics or Olympic lifts — rotational power only for this sport category)"
    : isCat4Sport
      ? "- [ ] NO explosive or plyometric work — Category 4 sport (swimming/rowing/cycling) never uses explosive blocks in the gym"
      : "- [ ] Conditioning rounds present in every session (Category 5 combat sport — conditioning is mandatory, not optional)"
  : "- [ ] Every session has power/explosive work (unless injury contraindicates)"}
- [ ] Every session has at least one unilateral lower-body movement (lower/full-body days)
- [ ] No repeated primary lifts across sessions
- [ ] Exercise intents are performance cues, not muscle labels
- [ ] Pre-selected exercises from EXERCISE VARIATION MANDATE are used — no substitution with defaults unless explicitly justified
- [ ] No two sessions share the same power exercise (broad jump, box jump, etc. must not repeat)
- [ ] At least 3 different trunk exercises used across the week (not Pallof press in every session)${sportValidationLines}${isConditioningGoal ? "\n- [ ] Dedicated conditioning sessions include named energy system (aerobic base / lactate threshold / VO2max / anaerobic capacity / RSA)\n- [ ] Every conditioning exercise has work duration, rest duration, and interval count\n- [ ] Conditioning sessions do NOT default to circuits — real intervals required\n- [ ] Progression is stated: Week 1 → Week 3 → Week 5" : ""}`;
}

// ─── Post-generation Validation ───────────────────────────────────────────────

export interface ArchitectureValidationResult {
  valid: boolean;
  issues: string[];
  warnings: string[];
}

export function validateProgramArchitecture(
  days: Array<{ name: string; exercises: Array<{ name: string; classification?: string; intent?: string }> }>,
  sport: string | null,
): ArchitectureValidationResult {
  const issues: string[] = [];
  const warnings: string[] = [];

  for (let i = 0; i < days.length; i++) {
    const day = days[i];
    const ex = day.exercises ?? [];

    if (ex.length < 5) {
      issues.push(`Day ${i + 1} (${day.name}) has only ${ex.length} exercises — minimum is 5.`);
    }

    const hasTrunk = ex.some((e) => {
      const c = (e.classification ?? "").toLowerCase();
      const n = (e.name ?? "").toLowerCase();
      return c.includes("trunk") || c.includes("core") || n.includes("plank") || n.includes("pallof")
        || n.includes("carry") || n.includes("rollout") || n.includes("dead bug") || n.includes("hollow");
    });
    if (!hasTrunk && !day.name.toLowerCase().includes("upper")) {
      warnings.push(`Day ${i + 1} (${day.name}) is missing trunk/core work.`);
    }

    // Only warn about missing power for Category 1/2 sports.
    // Category 3 uses rotational med ball (not classified as "power"), Category 4 never uses explosives, Category 5 uses conditioning rounds.
    const sportStr = (sport ?? "").toLowerCase();
    const isCat3 = sportStr.includes("tennis") || sportStr.includes("pickleball") || sportStr.includes("squash")
      || sportStr.includes("padel") || sportStr.includes("baseball") || sportStr.includes("softball") || sportStr.includes("golf");
    const isCat4 = sportStr.includes("swim") || sportStr.includes("rowing") || sportStr.includes("cycling")
      || sportStr.includes("triathlon");
    const isCat5 = sportStr.includes("mma") || sportStr.includes("boxing") || sportStr.includes("wrestling")
      || sportStr.includes("bjj") || sportStr.includes("judo") || sportStr.includes("muay thai") || sportStr.includes("kickboxing");
    const skipPowerCheck = isCat3 || isCat4 || isCat5;

    if (!skipPowerCheck) {
      const hasPower = ex.some((e) => {
        const c = (e.classification ?? "").toLowerCase();
        const n = (e.name ?? "").toLowerCase();
        return c.includes("power") || c.includes("explosive") || c.includes("prep")
          || n.includes("jump") || n.includes("bound") || n.includes("throw") || n.includes("clean")
          || n.includes("snatch") || n.includes("slam");
      });
      if (!hasPower) {
        warnings.push(`Day ${i + 1} (${day.name}) is missing power/explosive work.`);
      }
    }

    const missingIntent = ex.filter((e) => !e.intent || e.intent.trim().length < 15);
    if (missingIntent.length > 2) {
      warnings.push(`Day ${i + 1}: ${missingIntent.length} exercises are missing meaningful intent cues.`);
    }
  }

  const allPrimaryLifts = days.flatMap((d) =>
    d.exercises
      .filter((e) => (e.classification ?? "").toLowerCase().includes("primary"))
      .map((e) => e.name.toLowerCase()),
  );
  const duplicatePrimaries = allPrimaryLifts.filter((name, i) => allPrimaryLifts.indexOf(name) !== i);
  if (duplicatePrimaries.length > 0) {
    issues.push(`Duplicate primary lifts detected across sessions: ${[...new Set(duplicatePrimaries)].join(", ")}`);
  }

  const sportLower = (sport ?? "").toLowerCase();
  const allExNames = days.flatMap((d) => d.exercises.map((e) => e.name.toLowerCase()));
  const allExClasses = days.flatMap((d) => d.exercises.map((e) => (e.classification ?? "").toLowerCase()));

  // Hockey validation
  const isHockey = sportLower.includes("hockey");
  if (isHockey) {
    const hasLateral = allExNames.some((n) => n.includes("lateral") || n.includes("bound") || n.includes("lunge"));
    const hasRotational = allExNames.some((n) => n.includes("rotational") || n.includes("pallof") || n.includes("chop") || n.includes("landmine"));
    if (!hasLateral) warnings.push("Hockey program missing lateral force production patterns (lateral bound, lateral step-up, lateral lunge).");
    if (!hasRotational) warnings.push("Hockey program missing rotational trunk work (Pallof press, cable chop, landmine rotation).");
  }

  // Football validation
  const isFootball = /\bfootball\b/.test(sportLower) && !sportLower.includes("soccer");
  if (isFootball) {
    const hasSprintOrAcceleration = allExNames.some((n) => n.includes("sprint") || n.includes("acceleration") || n.includes("sled") || n.includes("broad jump"));
    const hasTrunkBracing = allExNames.some((n) => n.includes("pallof") || n.includes("carry") || n.includes("farmer"));
    const hasHeavyLower = allExNames.some((n) => n.includes("squat") || n.includes("deadlift") || n.includes("trap bar") || n.includes("hex bar"));
    if (!hasSprintOrAcceleration) warnings.push("Football program missing acceleration/sprint work — should include 10–30m sprint or sled work.");
    if (!hasTrunkBracing) warnings.push("Football program missing trunk bracing for collision (Pallof press or loaded carry).");
    if (!hasHeavyLower) warnings.push("Football program missing heavy bilateral lower strength (squat or DL variation).");
  }

  // Basketball validation
  const isBasketball = sportLower.includes("basketball");
  if (isBasketball) {
    const hasReactivePlyo = allExNames.some((n) => n.includes("jump") || n.includes("depth") || n.includes("bound") || n.includes("reactive"));
    const hasDecelOrLanding = allExNames.some((n) => n.includes("decel") || n.includes("landing") || n.includes("snap-down") || n.includes("depth jump"));
    const hasSingleLeg = allExNames.some((n) => n.includes("single-leg") || n.includes("rfess") || n.includes("step-up") || n.includes("pistol"));
    if (!hasReactivePlyo) warnings.push("Basketball program missing reactive plyometrics (box jump, depth jump, lateral bound).");
    if (!hasDecelOrLanding) warnings.push("Basketball program missing deceleration/landing mechanics training.");
    if (!hasSingleLeg) warnings.push("Basketball program missing single-leg strength work.");
  }

  // Soccer validation
  const isSoccer = sportLower.includes("soccer") || sportLower.includes("association football");
  if (isSoccer) {
    const hasNordic = allExNames.some((n) => n.includes("nordic") || n.includes("hamstring curl") || n.includes("glute-ham"));
    const hasCopenhagen = allExNames.some((n) => n.includes("copenhagen") || n.includes("adductor") || n.includes("lateral lunge"));
    const hasSingleLeg = allExNames.some((n) => n.includes("single-leg") || n.includes("rfess") || n.includes("rdl") || n.includes("step-up"));
    if (!hasNordic) issues.push("Soccer program MISSING Nordic hamstring curl or equivalent — this is mandatory for soccer athlete injury prevention.");
    if (!hasCopenhagen) warnings.push("Soccer program missing Copenhagen plank or adductor loading — adductor injuries are the second-most common soccer injury.");
    if (!hasSingleLeg) warnings.push("Soccer program missing single-leg strength work — all soccer actions are single-leg.");
  }

  // Baseball validation
  const isBaseball = sportLower.includes("baseball") || sportLower.includes("softball");
  if (isBaseball) {
    const hasRotationalMedBall = allExNames.some((n) => n.includes("rotational") || n.includes("med ball") || n.includes("medicine ball") || n.includes("scoop toss"));
    const hasFacePull = allExNames.some((n) => n.includes("face pull") || n.includes("external rotation") || n.includes("band pull"));
    const hasPallof = allExNames.some((n) => n.includes("pallof") || n.includes("chop") || n.includes("anti-rotation"));
    if (!hasRotationalMedBall) issues.push("Baseball program MISSING med ball rotational throws — rotational power is the primary physical quality in baseball.");
    if (!hasFacePull) warnings.push("Baseball program missing face pull or external rotation work — arm care is mandatory for throwing sport athletes.");
    if (!hasPallof) warnings.push("Baseball program missing anti-rotation trunk work (Pallof press) — stiff trunk is required for rotational power transfer.");
  }

  // allExClasses used for future classification-based validation
  void allExClasses;

  return {
    valid: issues.length === 0,
    issues,
    warnings,
  };
}

// ─── Variation Mandate Enforcement ───────────────────────────────────────────
//
// After the AI generates a program, we run a deterministic enforcer that
// replaces any prohibited default exercise with the locked variation-engine
// selection. This guarantees variety regardless of whether the AI followed
// the mandate in the system prompt.
// ─────────────────────────────────────────────────────────────────────────────

/** Returns the slot selections computed during the last buildArchitectureBrief call. */
export function getLastSlotSelection(): SlotExerciseSelection | null {
  return _lastSlotSelection;
}

export function getLastMonthlyPlan(): MonthlyBlockPlan | null {
  return _lastMonthlyPlan;
}

/**
 * Scans a generated program and replaces any prohibited default exercise with
 * its locked variation-engine alternative.
 *
 * Safe: only replaces exercises where the locked selection DIFFERS from the
 * prohibited default. If Back Squat scored highest this build, it remains.
 */
export function enforceVariationMandateOnProgram(
  program: { days: Array<{ exercises?: Array<{ name: string; [key: string]: unknown }> }> } | null,
  selections: SlotExerciseSelection | null,
): { days: Array<{ exercises?: Array<{ name: string; [key: string]: unknown }> }> } | null {
  if (!program || !selections) return program;

  const replacements: Record<string, string> = {};
  if (selections.bilateral_squat_strength && selections.bilateral_squat_strength !== "Back Squat")
    replacements["Back Squat"] = selections.bilateral_squat_strength;
  if (selections.lower_power) {
    if (selections.lower_power !== "Broad Jump") replacements["Broad Jump"] = selections.lower_power;
    if (selections.lower_power !== "Box Jump") replacements["Box Jump"] = selections.lower_power;
  }
  if (selections.bilateral_hinge_strength && selections.bilateral_hinge_strength !== "Conventional Deadlift")
    replacements["Conventional Deadlift"] = selections.bilateral_hinge_strength;
  if (selections.unilateral_lower && selections.unilateral_lower !== "Bulgarian Split Squat")
    replacements["Bulgarian Split Squat"] = selections.unilateral_lower;
  if (selections.trunk_anti_rotation && selections.trunk_anti_rotation !== "Pallof Press")
    replacements["Pallof Press"] = selections.trunk_anti_rotation;
  if (
    selections.upper_pull_primary &&
    selections.upper_pull_primary !== "Pull-Up" &&
    selections.upper_pull_primary !== "Weighted Pull-Up"
  ) {
    replacements["Pull-Up"] = selections.upper_pull_primary;
    replacements["Weighted Pull-Up"] = selections.upper_pull_primary;
    replacements["Unweighted Pull-Up"] = selections.upper_pull_primary;
  }

  if (Object.keys(replacements).length === 0) return program;

  let enforced = 0;
  const patchedDays = program.days.map((day) => ({
    ...day,
    exercises: (day.exercises ?? []).map((ex) => {
      const replacement = replacements[ex.name];
      if (replacement) {
        enforced++;
        return { ...ex, name: replacement };
      }
      return ex;
    }),
  }));

  if (process.env.NODE_ENV !== "production") {
    console.log("[BuildAudit:Reconciliation]", JSON.stringify({
      stage: "variation_mandate_enforcement",
      replacementsAvailable: Object.keys(replacements).length,
      enforced,
      replacementMap: replacements,
    }));
  }

  if (enforced > 0) {
    const logger = (global as Record<string, unknown>).__trainchatLogger;
    if (logger && typeof (logger as { info: unknown }).info === "function") {
      (logger as { info: (obj: unknown, msg: string) => void }).info(
        { enforced, replacements },
        "[VariationEnforcer] Post-generation enforcement — replaced prohibited defaults",
      );
    } else {
      console.log(`[VariationEnforcer] Replaced ${enforced} prohibited default(s) with locked selections`);
    }
  }

  return { ...program, days: patchedDays };
}

// ─── Sport extraction helper ──────────────────────────────────────────────────

export function extractSportFromRequest(userRequest: string, sportFocus: string | null): string | null {
  if (sportFocus) return sportFocus;
  const text = userRequest.toLowerCase();

  // Position-based detection (before generic sport keywords)
  if (/lineman|linebacker|tight end|wide receiver|running back|quarterback|cornerback|safety|defensive end/.test(text)) return "football";
  if (/point guard|shooting guard|power forward|small forward|center.+basketball|basketball.+center/.test(text)) return "basketball";
  if (/striker|winger.+soccer|soccer.+midfielder|goalkeeper.+soccer/.test(text)) return "soccer";
  if (/pitcher|baseball.+catcher|shortstop|outfield.+baseball/.test(text)) return "baseball";

  // Direct sport name detection
  const sports = [
    "hockey", "soccer", "football", "basketball", "baseball", "softball",
    "tennis", "volleyball", "rugby", "lacrosse", "track and field", "track",
    "sprinting", "swimming", "wrestling", "mma", "boxing", "martial arts",
    "cricket", "golf",
  ];
  for (const s of sports) {
    if (text.includes(s)) return s;
  }

  // Phrase-based detection
  if (/i play.*(football|grid iron)/.test(text)) return "football";
  if (/i play.*(ball|basketball|hoops)/.test(text)) return "basketball";
  if (/i play.*(soccer|futbol)/.test(text)) return "soccer";
  if (/i play.*(baseball|softball)/.test(text)) return "baseball";

  return null;
}
