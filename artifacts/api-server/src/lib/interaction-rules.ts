/**
 * TrainChat Population × Intent Interaction Rules
 *
 * Deterministic layer that modifies how a transformation bundle executes
 * based on the detected user population. Population is layered on top of
 * intent — intent is never rejected outright; instead it is:
 *   - allowed        (unchanged)
 *   - softened       (scale down intensity, restrict variables)
 *   - redirected     (same goal, safer movement path)
 *   - constrained    (joint-friendly, complexity cap)
 *
 * PRIORITY ORDER:
 *   special considerations > population rules > intent bundle defaults
 *
 * DESIGN:
 *   - Pure function — no side effects, no I/O.
 *   - Returns notes[] that get appended to the AI prompt directive.
 *   - modifiedBundle overrides specific bundle fields if needed.
 *   - Covers 10 intent families across 5 active populations.
 */

import { logger } from "./logger";
import type { PopulationContext } from "./population-engine";
import type { IntentFamily, TransformationBundle } from "./intent-family-engine";
import type { FocusMode } from "./focus-engines/engine-interface";

// ─── Result Type ──────────────────────────────────────────────────────────────

export interface InteractionRuleResult {
  allowed: boolean;
  modifiedBundle?: Partial<TransformationBundle>;
  notes?: string[];
  reason?: string;
}

// ─── Rule Factories ───────────────────────────────────────────────────────────
// Each factory returns an InteractionRuleResult. Returning null means no rule
// applies for this combination (falls through to default "allowed, unchanged").

type RuleFactory = (
  intentFamily: IntentFamily,
  mode: FocusMode,
  bundle: TransformationBundle,
) => InteractionRuleResult | null;

// ── ACTIVE_OLDER_ADULT ────────────────────────────────────────────────────────

const ACTIVE_OLDER_ADULT_RULES: RuleFactory = (intentFamily, _mode, bundle) => {
  switch (intentFamily) {

    case "power_explosive_focus":
      return {
        allowed: true,
        notes: [
          "ACTIVE_OLDER_ADULT — redirect explosive intent toward controlled-velocity alternatives.",
          "Use: band pull-through, medicine ball slam (standing, controlled), quick step-up, rhythmic resistance work.",
          "Do NOT use true plyometrics (box jump, depth jump, broad jump), Olympic derivatives (power clean, hang clean, snatch), or high-impact landing patterns.",
          "Target RPE 6–7 max. Rest full 90 sec between sets.",
        ],
        modifiedBundle: {
          aiDirective: bundle.aiDirective +
            " — FOR ACTIVE OLDER ADULT: redirect to controlled-velocity power expressions. No true explosive loading. RPE cap: 7.",
          antiPatterns: [
            ...bundle.antiPatterns,
            "Do NOT program box jumps, power cleans, hang cleans, depth jumps, or any high-impact explosive patterns for this population.",
          ],
        },
        reason: "ACTIVE_OLDER_ADULT + power_explosive_focus → redirect to safer dynamic intent",
      };

    case "increase_difficulty":
      return {
        allowed: true,
        notes: [
          "ACTIVE_OLDER_ADULT — increase intensity conservatively (RPE +0.5–1 only).",
          "Increase only ONE variable: sets OR load OR rep quality — not all at once.",
          "Hard cap: RPE 7. No max-effort sets. No aggressive load jumps.",
          "Prefer: controlled tempo increase, 1 additional set on primary movement, or tighter form standard over load escalation.",
        ],
        modifiedBundle: {
          aiDirective: bundle.aiDirective +
            " — FOR ACTIVE OLDER ADULT: conservative increase only. One variable at a time. Max RPE 7.",
        },
        reason: "ACTIVE_OLDER_ADULT + increase_difficulty → moderate progression only",
      };

    case "reduce_time":
    case "session_reduction":
      return {
        allowed: true,
        notes: [
          "ACTIVE_OLDER_ADULT — preserve full movement balance when shortening.",
          "Remove ONLY lowest-priority accessories (trunk isolation, extra sets, finishers).",
          "Keep minimum 4 exercises: one push, one pull, one hinge/squat, one unilateral or trunk.",
          "Do NOT remove primary structural movements to shorten the session.",
        ],
        reason: "ACTIVE_OLDER_ADULT + shorten_session → preserve movement balance",
      };

    case "reactive_focus":
      return {
        allowed: true,
        notes: [
          "ACTIVE_OLDER_ADULT — simplify reactive patterns to low-complexity, controlled options.",
          "Use: lateral step + pause, controlled shuffle, resistance band lateral walk, agility ladder slow tempo.",
          "Do NOT use high-speed change-of-direction, reactive chaos drills, or short ground contact plyo.",
        ],
        modifiedBundle: {
          aiDirective: bundle.aiDirective +
            " — FOR ACTIVE OLDER ADULT: simplified reactive patterns only. Low complexity, controlled tempo.",
        },
        reason: "ACTIVE_OLDER_ADULT + reactive_focus → simplified reactive patterns",
      };

    case "cod_decel_focus":
      return {
        allowed: true,
        notes: [
          "ACTIVE_OLDER_ADULT — use basic deceleration mechanics only.",
          "Use: slow shuffle + stop, lateral step-touch, band-resisted walking deceleration.",
          "Do NOT use multi-directional reactive COD, short ground contact patterns, or agility drills requiring rapid explosive direction changes.",
        ],
        reason: "ACTIVE_OLDER_ADULT + cod_decel_focus → basic deceleration only",
      };

    case "unilateral_emphasis":
      return {
        allowed: true,
        notes: [
          "ACTIVE_OLDER_ADULT — select joint-friendly unilateral options.",
          "Prefer: step-up, split squat (range-controlled), single-leg deadlift with hand support, single-leg glute bridge.",
          "Avoid: heavy Bulgarian split squat, pistol squat, single-leg landing drills.",
        ],
        reason: "ACTIVE_OLDER_ADULT + unilateral_emphasis → joint-friendly selections",
      };

    case "posterior_chain_emphasis":
      return {
        allowed: true,
        notes: [
          "ACTIVE_OLDER_ADULT — joint-friendly posterior chain bias.",
          "Prefer: trap bar deadlift, Romanian deadlift (DB), cable pull-through, hip thrust, glute bridge, single-leg RDL (supported).",
          "Avoid: conventional deadlift with heavy axial load, good morning, Nordic curl (high load).",
        ],
        reason: "ACTIVE_OLDER_ADULT + posterior_chain_emphasis → safe hinge/pull options",
      };

    case "trunk_core_emphasis":
      return {
        allowed: true,
        notes: [
          "ACTIVE_OLDER_ADULT — anti-flexion/anti-rotation core work is ideal.",
          "Prefer: dead bug, bird-dog, side plank, Pallof press, suitcase carry.",
          "Avoid: heavy weighted sit-ups, GHD, high-speed rotational throws under load.",
        ],
        reason: "ACTIVE_OLDER_ADULT + trunk_core_emphasis → appropriate core selection",
      };

    case "recovery_focus":
      return {
        allowed: true,
        notes: [
          "ACTIVE_OLDER_ADULT — recovery focus is well-suited for this population.",
          "Include light tissue prep, gentle activation, controlled breathing, and low-intensity movement.",
        ],
        reason: "ACTIVE_OLDER_ADULT + recovery_focus → fully appropriate",
      };

    default:
      return null;
  }
};

// ── BEGINNER ──────────────────────────────────────────────────────────────────

const BEGINNER_RULES: RuleFactory = (intentFamily, _mode, bundle) => {
  switch (intentFamily) {

    case "power_explosive_focus":
      return {
        allowed: true,
        notes: [
          "BEGINNER — simplify explosive intent to controlled-velocity basics.",
          "Use: jump squat (focus on landing mechanics), overhead medicine ball slam (full stop between reps), explosive bodyweight squat (intent-based, not max effort).",
          "Do NOT use Olympic lifts, box jumps, depth jumps, or multi-step complex plyometrics.",
        ],
        modifiedBundle: {
          aiDirective: bundle.aiDirective +
            " — FOR BEGINNER: basic controlled-velocity expressions only. No Olympic lifts or advanced plyometrics.",
        },
        reason: "BEGINNER + power_explosive_focus → simplified controlled-velocity movements",
      };

    case "reactive_focus":
      return {
        allowed: true,
        notes: [
          "BEGINNER — use low-complexity reactive drills only.",
          "Use: shuffle to pause, simple cone touch drill, ladder drill (slow tempo), band-resisted walk.",
          "Do NOT use reactive chaos drills, high-speed multi-directional work, or short ground contact plyometrics.",
        ],
        modifiedBundle: {
          aiDirective: bundle.aiDirective +
            " — FOR BEGINNER: low-complexity reactive drills only. Avoid high-skill or chaotic movement patterns.",
        },
        reason: "BEGINNER + reactive_focus → simplified reactive drills",
      };

    case "cod_decel_focus":
      return {
        allowed: true,
        notes: [
          "BEGINNER — basic linear deceleration mechanics only.",
          "Use: deceleration run + stop, band-resisted march, slow shuffle + step.",
          "Avoid multi-directional COD drills, sharp cuts, reactive agility.",
        ],
        reason: "BEGINNER + cod_decel_focus → basic deceleration mechanics",
      };

    case "increase_difficulty":
      return {
        allowed: true,
        notes: [
          "BEGINNER — increase only ONE variable at a time.",
          "Options: add 1 set to the primary exercise, OR increase reps by 2, OR decrease rest by 15 sec.",
          "Do NOT increase load AND reps AND sets simultaneously.",
          "Do NOT substitute a more complex exercise variation as the difficulty increase.",
        ],
        modifiedBundle: {
          aiDirective: bundle.aiDirective +
            " — FOR BEGINNER: one variable increase only. No complexity jumps. No advanced variation swaps.",
        },
        reason: "BEGINNER + increase_difficulty → single variable progression only",
      };

    case "posterior_chain_emphasis":
    case "unilateral_emphasis":
      return {
        allowed: true,
        notes: [
          "BEGINNER — select simple, technically accessible versions.",
          "Posterior chain: Romanian deadlift (DB), glute bridge, cable pull-through.",
          "Unilateral: step-up, reverse lunge, single-arm row.",
          "Avoid: heavy conventional deadlift, Bulgarian split squat with load, single-leg RDL without support.",
        ],
        reason: `BEGINNER + ${intentFamily} → simplified, technically accessible selections`,
      };

    case "trunk_core_emphasis":
      return {
        allowed: true,
        notes: [
          "BEGINNER — foundational core progression: stability before movement under load.",
          "Use: dead bug, plank (full + side), bird-dog, hollow body hold.",
          "Avoid: weighted rotational throws, heavy loaded carries, GHD.",
        ],
        reason: "BEGINNER + trunk_core_emphasis → foundational stability patterns",
      };

    default:
      return null;
  }
};

// ── ATHLETIC ──────────────────────────────────────────────────────────────────

const ATHLETIC_RULES: RuleFactory = (intentFamily, _mode, _bundle) => {
  switch (intentFamily) {

    case "power_explosive_focus":
    case "reactive_focus":
    case "cod_decel_focus":
      return {
        allowed: true,
        notes: [
          `ATHLETIC — full ${intentFamily.replace(/_/g, " ")} prescription allowed.`,
          "Can increase neural demand. Prioritize primary performance outputs.",
          "Complex movement patterns, plyometric loading, and high-speed reactive work are all appropriate.",
        ],
        reason: `ATHLETIC + ${intentFamily} → full prescription, no modification needed`,
      };

    case "reduce_time":
    case "session_reduction":
      return {
        allowed: true,
        notes: [
          "ATHLETIC — when shortening, trim lower-priority accessories first.",
          "Preserve ALL primary performance outputs: power expressions, primary strength movements, speed work.",
          "Do NOT remove explosive openers, primary lifts, or sport-specific patterns to save time.",
          "Trim: extra accessory sets, isolation work, lower-priority finishers.",
        ],
        reason: "ATHLETIC + shorten_session → preserve performance outputs, trim accessories",
      };

    default:
      return null;
  }
};

// ── JOINT_SENSITIVE ───────────────────────────────────────────────────────────

const JOINT_SENSITIVE_RULES: RuleFactory = (intentFamily, _mode, bundle) => {
  switch (intentFamily) {

    case "increase_difficulty":
      return {
        allowed: true,
        notes: [
          "JOINT_SENSITIVE — intensity increase must remain on joint-friendly movement options only.",
          "Add sets or reduce rest — do NOT add load to aggravating patterns.",
          "Do NOT increase difficulty via a more joint-demanding exercise variation (e.g., do not swap goblet squat → back squat).",
          "Valid difficulty increase: +1 set on trap bar deadlift, reduce rest on cable row, add controlled tempo.",
        ],
        modifiedBundle: {
          aiDirective: bundle.aiDirective +
            " — FOR JOINT_SENSITIVE: joint-friendly options only. No load increase on aggravating patterns. Prefer: trap bar, DB, cables, machines.",
        },
        reason: "JOINT_SENSITIVE + increase_difficulty → joint-safe intensification only",
      };

    case "power_explosive_focus":
      return {
        allowed: true,
        notes: [
          "JOINT_SENSITIVE — redirect explosive focus toward controlled-velocity, low-impact options.",
          "Use: resistance band pull-through (fast tempo), medicine ball slam (absorb landing), wall ball throw, controlled-tempo jump squat with full landing absorption.",
          "Do NOT use: box jumps, depth jumps, high-impact landings, or any pattern that produces significant joint stress at impact.",
        ],
        modifiedBundle: {
          aiDirective: bundle.aiDirective +
            " — FOR JOINT_SENSITIVE: low-impact power expressions only. Avoid high-impact landings. Redirect to controlled-velocity alternatives.",
          antiPatterns: [
            ...bundle.antiPatterns,
            "Do NOT program box jumps, depth jumps, broad jumps, or any high-impact explosive patterns for this population.",
          ],
        },
        reason: "JOINT_SENSITIVE + power_explosive_focus → controlled-velocity, low-impact redirect",
      };

    case "posterior_chain_emphasis":
      return {
        allowed: true,
        notes: [
          "JOINT_SENSITIVE — joint-friendly posterior chain options only.",
          "Use: trap bar deadlift, DB Romanian deadlift, cable pull-through, hip thrust, glute bridge, single-leg press (controlled range).",
          "Avoid: conventional barbell deadlift (heavy axial load), good morning, Nordic curl (high tensile), heavy conventional RDL with spine flexion.",
        ],
        reason: "JOINT_SENSITIVE + posterior_chain_emphasis → safe hinge/pull selections",
      };

    case "unilateral_emphasis":
      return {
        allowed: true,
        notes: [
          "JOINT_SENSITIVE — joint-friendly unilateral selections.",
          "Use: step-up (box height controlled), split squat (range of motion managed), single-leg press (machine), single-arm DB row.",
          "Avoid: heavy Bulgarian split squat, pistol squat, single-leg landing drills.",
        ],
        reason: "JOINT_SENSITIVE + unilateral_emphasis → range-managed unilateral options",
      };

    case "trunk_core_emphasis":
      return {
        allowed: true,
        notes: [
          "JOINT_SENSITIVE — anti-flexion and anti-rotation patterns are ideal (minimal spinal/joint stress).",
          "Use: Pallof press, plank, side plank, dead bug, bird-dog, suitcase carry.",
          "Avoid: heavy weighted rotational throws, GHD sit-up, heavy barbell good morning.",
        ],
        reason: "JOINT_SENSITIVE + trunk_core_emphasis → low-stress core selections",
      };

    case "reactive_focus":
    case "cod_decel_focus":
      return {
        allowed: true,
        notes: [
          "JOINT_SENSITIVE — low-impact reactive and deceleration patterns only.",
          "Use: lateral step + controlled stop, band-resisted lateral walk, shuffle at moderate pace.",
          "Avoid: sharp cuts, high-speed direction changes, reactive landing drills.",
        ],
        reason: `JOINT_SENSITIVE + ${intentFamily} → low-impact reactive patterns`,
      };

    case "recovery_focus":
      return {
        allowed: true,
        notes: [
          "JOINT_SENSITIVE — recovery focus is especially appropriate here.",
          "Include tissue prep, gentle activation, light mobility work on affected joints.",
        ],
        reason: "JOINT_SENSITIVE + recovery_focus → fully appropriate",
      };

    default:
      return null;
  }
};

// ── DETRAINED ─────────────────────────────────────────────────────────────────

const DETRAINED_RULES: RuleFactory = (intentFamily, _mode, bundle) => {
  switch (intentFamily) {

    case "increase_difficulty":
      return {
        allowed: true,
        notes: [
          "DETRAINED — small, single-variable progression only.",
          "Add max 1 set to the primary movement, OR increase reps by 2, OR reduce rest by 10–15 sec.",
          "Do NOT add load AND volume simultaneously — avoid large fatigue spikes.",
          "Prioritize: rep quality and movement consistency over intensity escalation.",
        ],
        modifiedBundle: {
          aiDirective: bundle.aiDirective +
            " — FOR DETRAINED: small single-variable increase only. Max 1 set added. No simultaneous load + volume increase.",
        },
        reason: "DETRAINED + increase_difficulty → small conservative progression only",
      };

    case "reduce_time":
    case "session_reduction":
      return {
        allowed: true,
        notes: [
          "DETRAINED — preserve foundational movement patterns when shortening.",
          "Keep: one squat/hinge pattern, one push, one pull. These are non-negotiable for rebuilding tolerance.",
          "Remove: highest-fatigue accessories, extra isolation work, conditioning finishers.",
        ],
        reason: "DETRAINED + shorten_session → preserve foundational patterns",
      };

    case "power_explosive_focus":
      return {
        allowed: true,
        notes: [
          "DETRAINED — basic power expressions only. No advanced plyometrics.",
          "Use: explosive bodyweight squat (intent-based), medicine ball overhead slam (light ball), jump rope (if tolerated).",
          "Do NOT use box jumps, depth jumps, Olympic derivatives, or advanced plyo patterns.",
          "Keep volume low: 2–3 sets max. Rest fully between sets (90+ sec).",
        ],
        modifiedBundle: {
          aiDirective: bundle.aiDirective +
            " — FOR DETRAINED: basic power intent only. Low volume (2–3 sets). No advanced plyometrics.",
        },
        reason: "DETRAINED + power_explosive_focus → simplified basic power expressions",
      };

    case "reactive_focus":
    case "cod_decel_focus":
      return {
        allowed: true,
        notes: [
          "DETRAINED — very low complexity reactive or deceleration work.",
          "Use: shuffle + stop, lateral step drill, slow agility ladder. Keep volume minimal.",
          "Avoid: multi-directional reactive patterns, high-speed cutting, chaos drills.",
        ],
        reason: `DETRAINED + ${intentFamily} → low-volume, low-complexity version`,
      };

    case "trunk_core_emphasis":
      return {
        allowed: true,
        notes: [
          "DETRAINED — rebuild trunk strength from foundational patterns.",
          "Use: dead bug, plank, bird-dog, modified hollow hold. Progress slowly.",
          "Avoid: heavy weighted core work, GHD, high-volume loaded rotation.",
        ],
        reason: "DETRAINED + trunk_core_emphasis → foundational rebuild priority",
      };

    default:
      return null;
  }
};

// ─── Population → Rule Factory Map ────────────────────────────────────────────

const POPULATION_RULE_MAP: Partial<Record<string, RuleFactory>> = {
  ACTIVE_OLDER_ADULT: ACTIVE_OLDER_ADULT_RULES,
  BEGINNER: BEGINNER_RULES,
  ATHLETIC: ATHLETIC_RULES,
  JOINT_SENSITIVE: JOINT_SENSITIVE_RULES,
  DETRAINED: DETRAINED_RULES,
};

// ─── Core Interaction Rule Evaluator ──────────────────────────────────────────

export function applyPopulationIntentRules(
  population: PopulationContext,
  intentFamily: IntentFamily,
  mode: FocusMode,
  bundle: TransformationBundle,
): InteractionRuleResult {
  // GENERAL_ADULT: no modification — pass through unchanged
  if (population.type === "GENERAL_ADULT") {
    return { allowed: true };
  }

  const factory = POPULATION_RULE_MAP[population.type];
  if (!factory) {
    return { allowed: true };
  }

  const result = factory(intentFamily, mode, bundle) ?? { allowed: true };

  if (process.env.NODE_ENV !== "production") {
    logger.info(
      {
        population: population.type,
        mode,
        intentFamily,
        allowed: result.allowed,
        modified: !!result.modifiedBundle,
        hasNotes: !!(result.notes?.length),
        reason: result.reason ?? "no rule matched — pass-through",
      },
      "[PopulationIntentRule]"
    );
  }

  return result;
}

// ─── Directive Appender ───────────────────────────────────────────────────────
// Appends population interaction notes to an existing intent family directive.
// Returns the original directive unchanged if no notes apply.

export function appendPopulationNotesToDirective(
  directive: string,
  ruleResult: InteractionRuleResult,
): string {
  if (!ruleResult.notes?.length) return directive;
  return `${directive}\n\n[POPULATION CONSTRAINTS — MANDATORY]\n${ruleResult.notes.map((n) => `• ${n}`).join("\n")}`;
}
