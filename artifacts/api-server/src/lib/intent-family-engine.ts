/**
 * Intent Family Engine
 *
 * Full Intent Family System + Transformation Engine for TrainChat.
 *
 * ARCHITECTURE:
 *   1. User message → normalizeToIntentFamily() → stable IntentFamily
 *   2. IntentFamily → getTargetScope() → TargetScope
 *   3. IntentFamily + TargetScope → getTransformationBundle() → TransformationBundle
 *   4. TransformationBundle → validateTransformationResult() → pass/fail with reason
 *   5. buildIntentFamilyPromptDirective() → injects guidance into AI prompt
 *
 * CORE PRINCIPLE:
 *   Humans speak in infinite ways. Training changes happen in finite ways.
 *   Collapse messy language into stable intent families.
 *   Map intent families into real transformation bundles.
 *   Validate: reject cosmetic-only changes.
 */

import { logger } from "./logger";
import type { FocusMode } from "./focus-engines/engine-interface";

// ─── Intent Families ──────────────────────────────────────────────────────────

export type IntentFamily =
  | "increase_difficulty"
  | "decrease_difficulty"
  | "increase_volume"
  | "decrease_volume"
  | "reduce_time"
  | "increase_time"
  | "strength_focus"
  | "hypertrophy_focus"
  | "endurance_focus"
  | "conditioning_focus"
  | "power_explosive_focus"
  | "speed_focus"
  | "reactive_focus"
  | "cod_decel_focus"
  | "footwork_rhythm_focus"
  | "athletic_performance_focus"
  | "fatigue_management"
  | "recovery_focus"
  | "mobility_support"
  | "rom_restoration_focus"
  | "tissue_stiffness_focus"
  | "tendon_resilience_focus"
  | "end_range_control_focus"
  | "mobility_flow_focus"
  | "unilateral_emphasis"
  | "posterior_chain_emphasis"
  | "trunk_core_emphasis"
  | "injury_modification"
  | "joint_friendly_modification"
  | "equipment_constraint"
  | "session_expansion"
  | "session_reduction"
  | "add_exercise"
  | "exercise_swap"
  | "exercise_progression"
  | "exercise_regression"
  // ── Day-level progression / regression (button-driven, identity-preserving) ──
  | "day_progression"
  | "day_regression"
  // ── Program-question families — NEVER mutate, always route to GUIDANCE ──────
  | "program_safety_question"
  | "program_explanation_question"
  | "coaching_question"
  // ── Greeting — short social opener, context-aware response ────────────────
  | "greeting"
  // ── Fresh build request — always REBUILD_PROGRAM, ignores active program ──
  | "new_program_request"
  // ── Training State Families ───────────────────────────────────────────────
  | "readiness_low"
  | "missed_sessions_reentry"
  | "environment_temporary_switch"
  | "sport_context_update"
  | "exercise_dislike_or_preference"
  | "bulk_session_sets_increase"
  | "clarification_required";

// ─── Target Scopes ────────────────────────────────────────────────────────────

export type TargetScope =
  | "exercise"
  | "session"
  | "day"
  | "week"
  | "program";

// ─── Transformation Change Types ─────────────────────────────────────────────

export type TransformationChangeType =
  | "add_sets"
  | "remove_sets"
  | "reduce_reps"
  | "increase_reps"
  | "reduce_rest"
  | "increase_rest"
  | "add_exercise"
  | "remove_exercise"
  | "replace_exercise"
  | "add_explosive_opener"
  | "add_conditioning_finisher"
  | "add_circuit_structure"
  | "add_interval_block"
  | "add_superset_structure"
  | "shift_to_compound_emphasis"
  | "add_isolation_work"
  | "reduce_accessories"
  | "add_accessories"
  | "increase_density"
  | "reduce_density"
  | "shift_rep_range_strength"
  | "shift_rep_range_hypertrophy"
  | "shift_rep_range_endurance"
  | "shift_rep_range_power"
  | "swap_to_progression"
  | "swap_to_regression"
  | "add_velocity_intent"
  | "swap_to_reactive_drill"
  | "add_reactive_emphasis"
  | "add_decel_drill"
  | "add_footwork_drill"
  | "add_rom_holds"
  | "add_tissue_release"
  | "add_prep_block"
  | "add_mobility_work"
  | "remove_aggravating_pattern"
  | "add_tolerance_work"
  | "swap_to_equipment_available"
  | "update_session_emphasis"
  | "update_week_focus"
  | "add_tendon_prep"
  | "add_end_range_strength"
  | "add_flow_sequence"
  | "add_unilateral_work"
  | "add_posterior_chain"
  | "add_core_stability";

export interface TransformationChange {
  type: TransformationChangeType;
  description: string;
  countAs: number; // How many "real structural changes" this counts as
}

// ─── Transformation Bundle ────────────────────────────────────────────────────

export interface TransformationBundle {
  intentFamily: IntentFamily;
  minimumStructuralChanges: number;
  primaryChanges: TransformationChange[];
  secondaryChanges: TransformationChange[];
  antiPatterns: string[];
  validationRules: string[];
  aiDirective: string;
  scopeGuidance: string;
}

// ─── Phrase → Intent Family Map ───────────────────────────────────────────────
//
// Patterns are tested in priority order (early match wins for each group).
// Each entry is { family, patterns[] }.
// Pattern design: broad enough to catch messy language, specific enough to be accurate.

interface FamilyPattern {
  family: IntentFamily;
  patterns: RegExp[];
}

const FAMILY_PATTERNS: FamilyPattern[] = [
  // ── Greeting — short social openers, matched before all other families ─────
  // These use anchors to ensure the ENTIRE message is a greeting, not a mixed request.
  // "Hey, can you reduce rest?" must NOT match here — only pure openers do.
  {
    family: "greeting",
    patterns: [
      /^(hey|hi|hello|yo|sup|hiya|howdy|hola|what's good)\s*[!\.\?]?\s*$/i,
      /^whats?\s*up\s*[!\.\?]?\s*$/i,
      /^how'?s\s*(it|things|everything|life|you|ya|u)\s*(going|goin|been|doing|doin)?\s*[!\.\?]?\s*$/i,
      /^how\s*are\s*(you|u|ya)\s*(doing|goin|going|been)?\s*[!\.\?]?\s*$/i,
      /^(wassup|wazzup|sup\s*dude|yoo+|heyyy+|heyy+)\s*[!\.\?]?\s*$/i,
      /^(what('?s| is) (up|good|new))\s*[!\.\?]?\s*$/i,
    ],
  },

  // ── Fresh Program Build Request — ALWAYS routes to REBUILD_PROGRAM ──────────
  // Catches explicit "build/create/make me a program" intent.
  // Must appear before mutation families so "build a program" is never
  // misclassified as a mutation or clarification_required.
  // IMPORTANT: patterns are specific to program-creation language — they must
  // NOT match mutation-style phrases like "build more endurance" or "make it harder".
  {
    family: "new_program_request",
    patterns: [
      // "build a 3 day soccer program" / "build me a program"
      /\b(build|create|make|design|write|generate|put together|give me|set me up with)\s+(me\s+)?(a|an|my|new)\s+.{0,60}(program|plan|routine|split|workout plan|training plan|schedule)\b/i,
      // "I want a new program" / "I need a new program" / "I need a program"
      /\b(i want|i need|i'd like|i'd love|can you (make|build|create|give me|design))\s+(a|an|my|new)\s+.{0,60}(program|plan|routine|split|workout plan|training plan)\b/i,
      // "new program" / "start fresh" / "start a new program"
      /\b(start|create|build|make|generate)\s+(a\s+)?(new|fresh)\s+(program|plan|routine|split|workout|training)\b/i,
      // "start fresh" / "start over" / "build from scratch"
      /\b(start fresh|start over|build from scratch|create from scratch|new training program|new workout program|new strength program|new athletic program)\b/i,
      // FIX 4D: Structural split changes — changing frequency or training split always needs a full rebuild
      /\b(make it|change it to|switch to|change to|go to)\s+(upper.?lower|push.?pull.?legs?|full body|full.?body split|ppl)\b/i,
      /\b(make it|change to|switch to)\s+(3|4|5|6)\s*days?\s*(a week|per week|per\s+week|weekly)?\b/i,
      // "Progress this for 4 weeks" / "Plan out 6 weeks of progression"
      /\bprogress\s+(this|the|my)\s*(?:program|training|plan)?\s+(?:for|over|across)\s+\d+\s+weeks?\b/i,
      /\bplan\s+(?:out\s+)?\d+\s+weeks?\s+of\s+(?:progression|progressive|training|programming)\b/i,
    ],
  },

  // ── Injury / Joint Modification (highest priority — safety first) ──────────
  {
    family: "injury_modification",
    patterns: [
      /\b(my|the)\s*(knee|shoulder|back|hip|wrist|ankle|elbow|neck|rotator|hamstring).{0,30}(hurts?|hurt|pain|aches?|aching|bothering|issue|sore|inflamed|bad|tweaked|injured)\b/i,
      /\b(pain|hurt|injury|sore)\s.{0,20}(knee|shoulder|back|hip|wrist|ankle|elbow|neck)\b/i,
      /\b(train|work)\s*(around|with)\s*(pain|injury|my|the)\b/i,
      /\b(knee|shoulder|back|hip|wrist|ankle)\s*(friendly|safe|pain.free)\b/i,
      /\b(avoid|no|can.t do)\s*(squats?|deadlifts?|pressing|running|jumping|overhead)\s*(because|due to|from|with)?\s*(pain|injury|knee|shoulder|back)\b/i,
      /\b(make this|modify|adjust).{0,20}(knee|shoulder|back|hip|ankle|wrist)\s*(friendly|safe)\b/i,
      /\btweak(ed|ing)?\s*(around|for|with)\s*(my|the|this)?\s*(knee|shoulder|back|hip|ankle|wrist|injury|pain)\b/i,
      // FIX 4C: Negation commands for impact/plyometric avoidance → injury_modification
      /\b(no jumping|avoid jumping|no plyometrics?|no high.?impact|avoid high.?impact|without jumping|jump.?free|plyometric.?free)\b/i,
    ],
  },

  {
    family: "joint_friendly_modification",
    patterns: [
      /\b(joint.?friendly|low.?impact|easy on the joints|protect my joints|joint.?safe|soft on)\b/i,
      /\b(no barbell|avoid barbell|barbell.{0,15}aggravat).{0,20}(knee|shoulder|back|hip)\b/i,
      /\b(arthritis|tendinitis|tendinopathy|bursitis)\b/i,
    ],
  },

  // ── Tendon Resilience Focus ───────────────────────────────────────────────
  // IMPORTANT: Must appear BEFORE injury_modification is bypassed BUT AFTER it
  // so that explicit pain language routes to injury_modification first.
  // Tendon resilience is load management WITHOUT pain — no injury accommodation needed.
  {
    family: "tendon_resilience_focus",
    patterns: [
      /\b(protect\s+(my\s+)?(tendons?|Achilles|patellar\s+tendon|elbow\s+tendon|hamstring\s+tendon))\b/i,
      /\b(reduce\s+tendon\s+(load|stress|strain|demand|volume|frequency))\b/i,
      /\b(easier\s+on\s+(my\s+)?(Achilles|patellar(\s+tendon)?|tendons?|elbow(\s+tendon)?))\b/i,
      /\b(less\s+(Achilles|patellar|tendon)(\s+tendon)?\s+(stress|load|strain|demand|pressure))\b/i,
      /\b(more\s+tendon.?friendly|tendon.?friendly\s+(sessions?|work|training|program|exercises?))\b/i,
      /\b(tendon\s+(health|resilience|conditioning|prep|care|protection|management))\b/i,
      /\b(Achilles.?friendly|patellar.?friendly|elbow.?friendly)\b/i,
      /\b(reduce\s+(plyometric|jump|landing|reactive)\s+(volume|load|demand|stress|frequency)\b)/i,
      /\b(less\s+(plyometric|reactive\s+contact|tendon\s+aggravating)\s+(work|training|volume|load))\b/i,
    ],
  },

  // ── Equipment Constraint ──────────────────────────────────────────────────
  {
    family: "equipment_constraint",
    patterns: [
      /\b(only|just).{0,20}(have|got|access to).{0,30}(dumbbells?|bands?|resistance bands?|kettlebells?|bodyweight|cables?|machines?)\b/i,
      /\b(no barbell|no rack|no squat rack|no bench press|home gym|limited equipment|minimal equipment|no weights?|no gym)\b/i,
      /\b(without.{0,15}(barbell|squat rack|bench|machine|cable))\b/i,
      /\b(dumbbell.?only|bodyweight.?only|bands?.?only|kettlebell.?only)\b/i,
      // Belt Squat specific — specialty machine not found at most gyms
      /\bno\s+belt.?squat\b/i,
      /\bdon.?t\s+have\s+(a\s+)?belt.?squat\b/i,
      /\bdont\s+have\s+(a\s+)?belt.?squat\b/i,
      /\bmy\s+gym\s+doesn.?t\s+have\s+(a\s+)?belt.?squat\b/i,
      /\bno\s+belt.?squat\s+machine\b/i,
      /\bwithout\s+(a\s+)?belt.?squat\b/i,
      /\bcan.?t\s+(do|use|access)\s+(a\s+)?belt.?squat\b/i,
      // FIX 4C: "No machines", machine-free, remove-all-equipment-class patterns
      /\b(no machines?|machine.?free|machines?.?free|no cable machines?)\b/i,
      /\b(remove all|take out all|no more)\s+(?:barbell|machine|cable|dumbbell)\s+(?:exercises?|work|movements?)\b/i,
    ],
  },

  // ── Recovery Focus ────────────────────────────────────────────────────────
  {
    family: "recovery_focus",
    patterns: [
      /\b(deload|recovery week|back off week|lighter week|easy week|unload)\b/i,
      /\b(need.{0,20}(recovery|to recover|a deload|rest day))\b/i,
      /\b(accumulated fatigue|overtrained|overtraining|system is taxed|body is taxed)\b/i,
      /\b(active recovery|restoration|flush|movement quality day)\b/i,
    ],
  },

  // ── Fatigue Management ────────────────────────────────────────────────────
  {
    family: "fatigue_management",
    patterns: [
      /\b(too.{0,20}(fatiguing|crushing|brutal|intense|taxing|demanding)|this is too much)\b/i,
      /\b(make it.{0,20}(easier to recover|less fatiguing|less crushing|less brutal|more manageable|more sustainable))\b/i,
      /\b(i.?m (beat up|beat|drained|fried|toasted|cooked|smashed|wrecked))\b/i,
      /\b(dial back|dial down).{0,20}(fatigue|intensity|demand|stress)\b/i,
      /\b(less fatiguing|lower fatigue|reduce fatigue|fatigue reduction)\b/i,
      /\b(getting beat up|getting hammered|taking a beating)\b/i,
      /\b(easier to recover from|recover faster|improve recovery)\b/i,
    ],
  },

  // ── Time Reduction ────────────────────────────────────────────────────────
  {
    family: "reduce_time",
    patterns: [
      /\b(shorter workouts?|shorter sessions?|less time|make (this|it).{0,20}shorter)\b/i,
      /\b(compress|tighten|trim).{0,20}(session|workout|program|down)\b/i,
      /\b(only|just).{0,15}have.{0,15}(15|20|25|30|35|40|45)\s*(min|minutes?)\b/i,
      /\b(30|35|40|45|20|25|15)\s*(min|minutes?).{0,20}(session|max|cap|limit|workout)\b/i,
      /\b(make.{0,15}more efficient|streamline|cut.{0,10}down)\b/i,
      // FIX 4D: "Make Day 2 shorter" / "Make these sessions shorter" — day-referenced time reduction
      /\bmake\s+(?:day\s*\d+|this\s+day|session\s*\d+|these\s+sessions?|the\s+sessions?)\s+(?:\w+\s+)?shorter\b/i,
    ],
  },

  // ── Time Increase ─────────────────────────────────────────────────────────
  {
    family: "increase_time",
    patterns: [
      /\b(longer (workouts?|sessions?)|more time|extend.{0,15}session|make.{0,15}longer)\b/i,
      /\b(add.{0,15}(warm.?up|cool.?down|prep|more work|extra work))\b/i,
      /\b(expand.{0,15}(session|workout))\b/i,
    ],
  },

  // ── Add Exercise (STRICT — single exercise insertion) ─────────────────────
  // Must appear BEFORE session_expansion so "add an exercise" is captured
  // as a precise structural add, not a loose volume/expansion request.
  {
    family: "add_exercise",
    patterns: [
      // "add an exercise / add a new exercise / add one exercise / add another exercise"
      /\badd (an?|one|another|a new) (exercise|movement|lift|drill)\b/i,
      // "add a new exercise to day 1 / add an exercise to this session"
      /\badd (an?|one|a new) (exercise|movement|lift) to (day|session|this)\b/i,
      // "add one more exercise"
      /\badd one more (exercise|movement|lift)\b/i,
      // "put an exercise on day 1"
      /\bput (an?|one|another) (exercise|movement|lift) (in|on|into) (day|session)\b/i,
    ],
  },

  // ── Session Expansion ─────────────────────────────────────────────────────
  {
    family: "session_expansion",
    patterns: [
      // Requires "more" before exercises — prevents matching "add an exercise to Day X"
      /\b(add more (exercises?|work|movements?|accessories?|upper body work|lower body work|core work))\s*(to\s*(day\s*\d|session|this))?\b/i,
      /\b(make (day\s*\d|this session|day|session).{0,20}longer)\b/i,
      /\b(expand (day\s*\d|this session|this day|the session))\b/i,
      /\b(more work in|more volume in|throw in.{0,20}exercises?)\b/i,
    ],
  },

  // ── Session Reduction ─────────────────────────────────────────────────────
  {
    family: "session_reduction",
    patterns: [
      /\b(shorten (this )?(session|block|day|workout)|cut (this )?(session|block|day)|remove (some )?exercises?|fewer exercises?)\b/i,
      /\b(reduce.{0,20}exercises?|trim (this )?(session|block)|simplify (this )?(session|block))\b/i,
      /\b(take out|cut out|remove).{0,20}(exercises?|work|movements?)\b/i,
    ],
  },

  // ── Exercise Progression ──────────────────────────────────────────────────
  {
    family: "exercise_progression",
    patterns: [
      /\b(progress|advance|harder version|more advanced version|level up|step up).{0,30}(this exercise|the exercise|the movement|this movement)\b/i,
      /\b(make (this |the )?(exercise|movement|lift) harder)\b/i,
      /\b(progress (this|the) movement|harder variation|more complex version)\b/i,
      // "Make [named exercise] harder/tougher/more challenging" — e.g., "Make goblet squat harder"
      // Negative lookahead blocks deictic ("it","this","the") and day references ("day 3")
      /\bmake\s+(?!(?:it|this|the)\b|day\s*\d+)[a-z][a-z\s\-']{1,35}\s+(?:harder|tougher|more\s+(?:challenging|difficult|demanding|advanced|complex|intense))\b/i,
    ],
  },

  // ── Exercise Regression ───────────────────────────────────────────────────
  {
    family: "exercise_regression",
    patterns: [
      /\b(regress|easier version|simpler version|step down|scale back|scale down).{0,30}(this exercise|the exercise|the movement|this movement)\b/i,
      /\b(make (this |the )?(exercise|movement|lift) easier)\b/i,
      /\b(regression|regress the movement|easier variation|simplified version)\b/i,
      // "Make [named exercise] easier/simpler/less challenging" — e.g., "Make goblet squat easier"
      /\bmake\s+(?!(?:it|this|the)\b|day\s*\d+)[a-z][a-z\s\-']{1,35}\s+(?:easier|simpler|less\s+(?:challenging|difficult|demanding|intense|advanced))\b/i,
    ],
  },

  // ── Exercise Swap ─────────────────────────────────────────────────────────
  {
    family: "exercise_swap",
    patterns: [
      /\b(swap|replace|substitute|switch|change).{0,60}(with|for|to)\b/i,
      /\b(swap out|take out|remove).{0,30}(exercise|movement|lift|drill)\b/i,
      /\b(instead of|in place of|rather than).{0,40}(exercise|movement|squat|press|deadlift|row|pull)\b/i,
    ],
  },

  // ── Endurance Focus ───────────────────────────────────────────────────────
  {
    family: "endurance_focus",
    patterns: [
      /\b(more endurance|endurance.?based|endurance.?focused|build endurance)\b/i,
      /\b(more (stamina|work capacity|aerobic|gas.?tank|engine))\b/i,
      /\b(improve.{0,20}(endurance|stamina|work capacity|aerobic|conditioning capacity))\b/i,
      /\b(last longer|better endurance|less strength more endurance)\b/i,
      /\b(increase (reps|time under tension) for endurance)\b/i,
      /\b(make (this|it|day\s*\d).{0,20}endurance.?(based|focused))\b/i,
    ],
  },

  // ── Conditioning Focus ────────────────────────────────────────────────────
  {
    family: "conditioning_focus",
    patterns: [
      /\b(more (cardio|conditioning)|add (cardio|conditioning)|conditioning.?focused)\b/i,
      /\b(heart rate|aerobic work|interval work|metabolic work|finisher)\b/i,
      /\b(circuit (training|work)|hiit|high intensity interval|work.?to.?rest)\b/i,
      /\b(game shape|in shape|get in shape|improve cardio)\b/i,
      /\b(gassed|out of breath|breathing heavy|gas.?tank)\b/i,
      /\b(repeat sprint|energy system|aerobic base|vo2|cardiovascular)\b/i,
    ],
  },

  // ── Power / Explosive Focus ───────────────────────────────────────────────
  {
    family: "power_explosive_focus",
    patterns: [
      /\b(more explosive|more power|add (power|explosiveness|explosive work|plyometrics?))\b/i,
      /\b(explosive.?focused|power.?focused|jump (higher|training)|plyometric)\b/i,
      /\b(first step|acceleration|quickness)\b/i,
      /\b(faster and more powerful|faster.{0,20}powerful|power (output|development))\b/i,
      /\b(speed.?strength|rate of force|reactive strength|ballistic)\b/i,
      // "make it more for power" — casual "for X" phrasing
      /\bmake\s+(?:this|it|the\s+program|my\s+program)\s+(?:more\s+)?(?:for\s+)?(?:power|explosiveness?|explosive)\b/i,
      /\b(?:more|geared)\s+(?:toward[s]?\s+|for\s+)?(?:power|explosiveness?|explosive\s+(?:work|training))\b/i,
    ],
  },

  // ── Reactive / Stiffness / Ground Contact Focus ───────────────────────────
  // IMPORTANT: Must appear BEFORE speed_focus and decrease_volume so that
  // reactive-quality commands like "reduce ground contact time" are never
  // routed to generic shortening or volume-reduction transformations.
  {
    family: "reactive_focus",
    patterns: [
      // Ground contact / contact time — the core trigger phrase
      /\b(ground.?contact.?time|contact.?time)\b/i,
      /\b(reduce|improve|lower|shorten|decrease|minimize|less).{0,25}(contact.?time|ground.?contact)\b/i,
      // Reactivity
      /\b(more reactive|be (more )?reactive|improve.{0,15}reactivity|reactive training|reactivity)\b/i,
      // Stiffness
      /\b(improve|increase|add|more|build).{0,20}(tendon )?stiffness\b/i,
      // Elasticity / elastic quality
      /\b(more elastic|improve.{0,15}elasticity|elastic.?strength|elastic bias|elastic.?quality|more elasticity)\b/i,
      // Spring / springiness
      /\b(more spring|springier|spring.?like|improve.{0,15}spring(iness)?)\b/i,
      // Amortization reduction
      /\b(less amortization|reduce amortization|amortization phase|minimize amortization)\b/i,
      // Quicker / faster contacts
      /\b(quicker (off the floor|contacts?)|faster contacts?|quick contacts?)\b/i,
      // Bounce / bounce quality
      /\b(more bounce|improve.{0,10}bounce|bouncy|less.{0,10}sink)\b/i,
      // Reactive strength / stiffness training terms
      /\b(reactive strength index|ankle stiffness|leg stiffness|pliometric stiffness)\b/i,
      // "off the floor" speed cue
      /\b(off the floor (faster|quicker)|quicker.{0,15}off the floor)\b/i,
      // Snappy / crisp / light-on-ground synonyms
      /\b(snappier|more snap|snap(py)? (off|from) the (ground|floor))\b/i,
      /\b(lighter on the (ground|floor)|light.?foot(ed)?|light on (my|the) feet)\b/i,
      /\b(crisp(er)? contacts?|more crisp|crisp.?(off|from) the (ground|floor))\b/i,
      /\b(pop off the (ground|floor)|more pop.{0,15}(ground|landing|off))\b/i,
    ],
  },

  // ── COD / Deceleration Focus ──────────────────────────────────────────────
  // IMPORTANT: Must appear BEFORE power_explosive_focus so that decel/COD-specific
  // commands like "more decel", "better agility", "change of direction" are not
  // routed to the power/barbell explosive bundle.
  {
    family: "cod_decel_focus",
    patterns: [
      /\b(more decel|better deceleration|decel mechanics|deceleration training|decel drills?)\b/i,
      /\b(improve.{0,20}deceleration|decel.?to.?re.?accel|re.?acceleration from stop)\b/i,
      /\b(change of direction|change.?direction|cutting ability|plant and cut|planted cut|cutting mechanics)\b/i,
      /\b(less braking|improve braking|braking mechanics|brake faster|stop faster)\b/i,
      /\b(stop and go|stop.?start speed|lateral stop|hard stop|absorb (the )?impact)\b/i,
      /\b(T.?drill|L.?drill|505 drill|5.?10.?5|pro.?agility drill|agility cone drill)\b/i,
      /\b(decel strength|landing mechanics|penultimate step|hip sink on decel)\b/i,
      /\b(better agility|improve agility|agility drills?|agility training|agility work)\b/i,
      /\b(COD work|COD training|COD drills?)\b/i,
    ],
  },

  // ── Footwork / Rhythm Focus ───────────────────────────────────────────────
  // IMPORTANT: Must appear BEFORE speed_focus so that footwork and rhythm commands
  // like "more footwork", "quicker feet", "faster feet" are captured here
  // rather than being routed to the generic sprint/acceleration speed bundle.
  {
    family: "footwork_rhythm_focus",
    patterns: [
      /\b(more footwork|better footwork|improve.{0,15}footwork|footwork drills?|footwork work)\b/i,
      /\b(quicker feet|faster feet|quick feet|faster.?foot(work)?|quicker.?foot(work)?)\b/i,
      /\b(ladder work|ladder drills?|speed ladder|agility ladder|ladder patterns?)\b/i,
      /\b(foot speed|foot coordination|foot contact quality|foot rhythm)\b/i,
      /\b(rhythm (training|drills?|work|patterns?)|timing (work|drills?)|coordination drills?)\b/i,
      /\b(shuffle (patterns?|drills?|steps?)|lateral shuffle|Ickey shuffle|in.?and.?out drill)\b/i,
      /\b(cone touch(es)?|box drill footwork|shadow footwork|mirror drill)\b/i,
    ],
  },

  // ── Speed Focus ───────────────────────────────────────────────────────────
  {
    family: "speed_focus",
    patterns: [
      /\b(more speed|add speed|improve speed|speed.?focused|sprint training|speed work)\b/i,
      /\b(max velocity|acceleration (work|training)|sprint mechanics)\b/i,
      /\b(faster|get faster|run faster|move faster)\b/i,
    ],
  },

  // ── Athletic Performance ──────────────────────────────────────────────────
  {
    family: "athletic_performance_focus",
    patterns: [
      /\b(more athletic|athletic (performance|focus|carryover|output|emphasis))\b/i,
      /\b(keep it athletic|stay athletic|make (it|this|day\s*\d) (more )?athletic)\b/i,
      /\b(sport performance|performance.?focused|athletic (training|development))\b/i,
    ],
  },

  // ── Strength Focus ────────────────────────────────────────────────────────
  {
    family: "strength_focus",
    patterns: [
      /\b(more strength|strength.?focused|strength.?based|push (the )?strength|heavier|more heavy)\b/i,
      /\b(maximal strength|strength (emphasis|focus|bias)|pull (the )?weight up|go heavier)\b/i,
      /\b(make (it|this|day\s*\d).{0,20}(strength.?(based|focused)|heavier))\b/i,
      /\b(push (hypertrophy|strength) more)\b/i,
      // "make it more for strength" — casual "for X" phrasing
      /\bmake\s+(?:this|it|the\s+program|my\s+program)\s+(?:more\s+)?(?:for\s+)?strength\b/i,
      /\b(?:more|geared)\s+(?:toward[s]?\s+|for\s+)?strength(?:\s+training)?\b/i,
    ],
  },

  // ── Unilateral Emphasis ───────────────────────────────────────────────────
  // Must appear AFTER strength_focus (to allow strength framing) and BEFORE
  // hypertrophy_focus so that explicit single-leg/split-stance language is
  // caught as a programming bias shift rather than a generic variation.
  {
    family: "unilateral_emphasis",
    patterns: [
      /\b(more\s+unilateral|unilateral\s+(emphasis|focus|bias|work|training|dominant))\b/i,
      /\b(more\s+single.?leg\s+(work|training|exercises?|movements?)|single.?leg\s+(focus|bias|emphasis))\b/i,
      /\b(more\s+one.?leg(ged)?\s+(work|training|movements?)|one.?legged\s+(focus|training|work))\b/i,
      /\b(less\s+bilateral|fewer\s+bilateral|reduce\s+bilateral|more\s+split\s+stance)\b/i,
      /\b(split.?stance\s+(emphasis|focus|bias|work|training))\b/i,
      /\b(unilateral\s+(lower|upper)\s+(emphasis|focus|bias|work|training))\b/i,
      /\b(single.?arm\s+(work|focus|training|emphasis|bias))\b/i,
    ],
  },

  // ── Posterior Chain Emphasis ───────────────────────────────────────────────
  // Must appear AFTER strength_focus and BEFORE hypertrophy_focus so that
  // explicit posterior chain / hinge / glute / hamstring language is caught here
  // rather than being routed to generic hypertrophy or pulling-only bundles.
  {
    family: "posterior_chain_emphasis",
    patterns: [
      /\b(more\s+posterior\s+chain|posterior\s+chain\s+(emphasis|focus|bias|work|training))\b/i,
      /\b(more\s+hamstrings?|more\s+hamstring\s+(work|training|emphasis|volume))\b/i,
      /\b(more\s+glutes?|glute\s+(emphasis|focus|work|training|dominant|bias))\b/i,
      /\b(more\s+hinge|hinge.?dominant|hinge\s+(emphasis|focus|work|training|bias))\b/i,
      /\b(more\s+(RDL|Romanian\s+deadlift|hip\s+hinge\s+work|deadlift\s+variation))\b/i,
      /\b(backside\s+(emphasis|focus|work|training)|back\s+of\s+(the\s+)?body\s+(emphasis|focus))\b/i,
      /\b(hip\s+extension\s+(focus|emphasis|bias|work)|glute.?ham\s+(emphasis|focus|work))\b/i,
      /\b(more\s+pulling|pulling\s+(emphasis|focus|bias|dominant)|pull.?dominant)\b/i,
      /\b(hamstring\s+(dominant|emphasis|focus|bias)|posterior\s+focused)\b/i,
    ],
  },

  // ── Trunk / Core Emphasis ─────────────────────────────────────────────────
  // Valid across strength, speed, and mobility modes but must appear BEFORE
  // hypertrophy_focus so "more core" and "anti-rotation" language does not fall
  // into generic accessory / hypertrophy filler logic.
  {
    family: "trunk_core_emphasis",
    patterns: [
      /\bmore\s+core\b/i,
      /\b(more\s+(trunk|core)\s+(work|training|stability|control|stiffness|strength|emphasis|focus))\b/i,
      /\b(more\s+(anti.?rotation|anti.?extension|anti.?flexion|anti.?lateral\s+flexion))\b/i,
      /\b(trunk\s+(stability|stiffness|control|strength|emphasis|focus|bias)|core\s+(emphasis|focus|bias|dominant))\b/i,
      /\b(midline\s+(stability|control|stiffness)|pillar\s+(strength|stability|work))\b/i,
      /\b(more\s+core\s+(control|stiffness|bracing|dominant|stability|anti.?rotation))\b/i,
      /\b(more\s+planks?|plank\s+(variations?|progressions?|work)|core.?focused\s+(session|block|work))\b/i,
      /\b(positional\s+(trunk|core)\s+(control|strength|stability))\b/i,
    ],
  },

  // ── Hypertrophy Focus ─────────────────────────────────────────────────────
  {
    family: "hypertrophy_focus",
    patterns: [
      /\b(more hypertrophy|hypertrophy.?(focused|based|emphasis)|push hypertrophy)\b/i,
      /\b(more muscle|build (more )?muscle|muscle building|add (muscle|mass|size))\b/i,
      /\b(bodybuilding (style|focus)|more isolation|more accessory work)\b/i,
      /\b(time under tension|pump|muscle size|mass building)\b/i,
    ],
  },

  // ── End-Range Control Focus (Mobility mode) ───────────────────────────────
  // IMPORTANT: Must appear BEFORE rom_restoration_focus so that PAILs/RAILs,
  // "end-range control", and "own the position" language is caught here rather
  // than being routed to the passive ROM restoration bundle.
  // End-range control = active isometric strength at end range (PAILs/RAILs).
  // ROM restoration = gaining passive range. They are distinct families.
  {
    family: "end_range_control_focus",
    patterns: [
      /\b(end.?range\s+(control|strength|stability|capacity|work|loading|isometric))\b/i,
      /\b(PAILs|RAILs|PAILs\s+(and|&)\s+RAILs|progressive\s+angular\s+isometric|regressive\s+angular\s+isometric)\b/i,
      /\b(own\s+(the|my)\s+(position|range|end.?range|deep\s+position|end\s+position))\b/i,
      /\b(stronger\s+(in|at)\s+(the\s+)?end.?range|strength\s+(in|at)\s+(the\s+)?end.?range)\b/i,
      /\b(active\s+(end.?range\s+(control|strength|work|loading)|range\s+control))\b/i,
      /\b(functional\s+range\s+conditioning|FRC\s+(work|protocol|method|training))\b/i,
      /\b(isometric\s+(at|in)\s+(the\s+)?end.?range|end.?range\s+isometric(s)?)\b/i,
      /\b(positional\s+(ownership|control|strength)|loaded\s+end.?range)\b/i,
    ],
  },

  // ── ROM / Range Restoration Focus (Mobility mode) ─────────────────────────
  // Covers the most common Mobility mode edit commands for range of motion.
  // IMPORTANT: Must appear BEFORE mobility_support so specific joint-range phrases
  // like "hip mobility work", "ankle mobility", "open up my hips" are caught here
  // rather than the generic mobility_support bundle.
  // Must also appear BEFORE decrease_difficulty so "less aggressive" mobility phrases
  // are not routed to generic difficulty reduction.
  {
    family: "rom_restoration_focus",
    patterns: [
      /\b(more range|restore.{0,20}(range|ROM)|gain.{0,15}range|increase.{0,15}(ROM|range of motion)|better range)\b/i,
      // "open up my hips" / "open my hips" / "open up the shoulders" — handles both "open [up] [my/the] [bodypart]"
      // Note: ((?:my|the)\s+)? — must include the trailing \s+ to consume space before bodypart
      /\bopen\s+(up\s+)?((?:my|the)\s+)?(hips?|shoulders?|thoracic|chest|ankles?|spine|back)\b/i,
      /\b(loosen (up|my|the)|feel less tight|unlock.{0,20}(hips?|shoulders?|ankles?|thoracic|spine))\b/i,
      /\b(restore.{0,20}(flexibility|range|mobility|movement))\b/i,
      /\b(less (restricted|restriction)|more freedom.{0,15}(joint|movement|hip|shoulder))\b/i,
      /\b(hip (opening|opener|mobility work|capsule work|flexor work))\b/i,
      /\b(thoracic (mobility|extension|rotation|work|opener))\b/i,
      /\b(ankle (mobility|dorsiflexion|flexibility|freedom))\b/i,
      /\b(shoulder (opener|capsule work|mobility focus))\b/i,
      // "less aggressive on the stretching" — trailing \w* ensures "stretching" is matched beyond the "stretch" stem
      /\b(less aggressive.{0,30}stretch\w*)\b/i,
      /\b(less aggressive.{0,30}(program|session|mobility|flow))\b/i,
    ],
  },

  // ── Tissue Stiffness Focus (Mobility mode) ────────────────────────────────
  // Covers stiffness, tightness, and tissue-release requests.
  // IMPORTANT: Must appear BEFORE mobility_support so that specific stiffness
  // and tissue-release phrases are not routed to the generic mobility bundle.
  // Must also appear BEFORE decrease_difficulty so stiffness complaints are not
  // routed to generic difficulty reduction.
  {
    family: "tissue_stiffness_focus",
    patterns: [
      /\b(less stiffness|reduce stiffness|improve.{0,15}stiffness|feel less stiff|too stiff)\b/i,
      /\b(chronic (tightness|stiffness)|morning stiffness|post.training (tightness|stiffness))\b/i,
      /\b(tissue (release|work|rolling|therapy)|myofascial (release|work)|foam roll(ing)?)\b/i,
      /\b(release (tension|tightness)|reduce (tension|tightness))\b/i,
      // "stiff [bodypart]" and "[bodypart] is/are stiff" (reversed word order)
      /\b(feel stuck|stuck in.{0,15}(hips?|shoulders?|back)|stiff.{0,15}(hips?|back|thoracic|ankles?))\b/i,
      /\b(hips?|back|thoracic|ankles?|shoulders?|knees?).{0,20}(is|are)\s+stiff\b/i,
      /\b(loaded (stretching|stretch)|contract.?relax|PNF (stretch|work|sequences?))\b/i,
    ],
  },

  // ── Mobility Flow Focus ───────────────────────────────────────────────────
  // IMPORTANT: Must appear BEFORE mobility_support and BEFORE recovery_focus
  // in the mobility domain so that flow/continuity language is not routed to
  // the generic "add mobility work" bundle or the restorative recovery bundle.
  // Mobility flow = continuous linked movement sequences (structural reorganization).
  // Recovery focus = lower intensity / restoration. These are distinct families.
  {
    family: "mobility_flow_focus",
    patterns: [
      /\b(mobility\s+flow|movement\s+flow|flowing\s+(mobility|movement\s+sequence|practice))\b/i,
      /\b(connective\s+movement|connected\s+mobility|connected\s+movement\s+sequence)\b/i,
      /\b(continuous\s+(mobility\s+)?flow|integrated\s+mobility\s+sequence)\b/i,
      /\b(smoother\s+(mobility|transitions?|movement\s+flow|sequencing|practice))\b/i,
      /\b(less\s+segmented\s+(mobility|practice|session)|linked\s+mobility\s+(sequence|work))\b/i,
      /\b(kinetic\s+chain\s+flow|flow\s+sequence\s+(work|training|protocol))\b/i,
      /\b(more\s+integrated\s+(movement\s+)?sequence|ground.?based\s+flow)\b/i,
    ],
  },

  // ── Mobility Support ─────────────────────────────────────────────────────
  // Generic mobility/flexibility additions. Must appear AFTER rom_restoration_focus
  // and tissue_stiffness_focus so more-specific range/stiffness patterns fire first.
  {
    family: "mobility_support",
    patterns: [
      /\b(add (mobility|flexibility|stretching|warm.?up|prep|activation|cool.?down))\b/i,
      /\b(more mobility|mobility work|flexibility work|movement prep)\b/i,
      // "tight hips" (adjective first) AND "hips are tight" (noun first)
      /\b(tight (hips?|hamstrings?|shoulders?|back|ankles?|thoracic))\b/i,
      /\b(hips?|hamstrings?|shoulders?|back|ankles?|thoracic).{0,15}(is|are)\s+tight\b/i,
      /\b(improve (flexibility|mobility|range of motion|movement quality))\b/i,
    ],
  },

  // ── Day-Level Progression (MUST appear before increase_difficulty) ──────────
  // Triggered by button (day_progression) or text explicitly targeting a day.
  // "Make Day 3 harder" — same session, same intent, just harder.
  {
    family: "day_progression",
    patterns: [
      // "Make Day 3 harder / more challenging"
      /\b(make|making)\s+day\s*\d+\s.{0,30}(harder|tougher|more\s+(challenging|difficult|demanding|intense))\b/i,
      // "Day 3 harder" / "harder on day 3"
      /\bday\s*\d+\s.{0,20}(harder|progression|more\s+(challenging|difficult|demanding))\b/i,
      /\b(harder|more\s+(challenging|difficult|demanding))\s+on\s+day\s*\d+\b/i,
      // "progress day 3" / "day 3 progression"
      /\b(progress|progress\s+up|advance)\s+day\s*\d+\b/i,
      /\bday\s*\d+\s+(progression|step\s+up)\b/i,
    ],
  },

  // ── Day-Level Regression (MUST appear before decrease_difficulty) ───────────
  // Triggered by button (day_regression) or text explicitly targeting a day.
  // "Make Day 3 easier" — same session, same intent, just easier.
  {
    family: "day_regression",
    patterns: [
      // "Make Day 3 easier / less demanding"
      /\b(make|making)\s+day\s*\d+\s.{0,30}(easier|lighter|less\s+(demanding|challenging|difficult|intense))\b/i,
      // "Day 3 easier" / "easier on day 3"
      /\bday\s*\d+\s.{0,20}(easier|regression|less\s+(demanding|challenging|difficult))\b/i,
      /\b(easier|less\s+(challenging|demanding|difficult))\s+on\s+day\s*\d+\b/i,
      // "regress day 3" / "day 3 regression"
      /\b(regress|step\s+down)\s+day\s*\d+\b/i,
      /\bday\s*\d+\s+(regression|step\s+down)\b/i,
    ],
  },

  // ── Increase Difficulty ───────────────────────────────────────────────────
  {
    family: "increase_difficulty",
    patterns: [
      /\b(make it harder|make (this|the program|the workout|it) (harder|tougher|more challenging|more difficult))\b/i,
      /\b(too easy|not (challenging|hard|difficult) enough|need more challenge|push me more)\b/i,
      /\b(harder please|step it up|crank it up|increase (the )?difficulty|up the difficulty)\b/i,
      /\b(more challenging|tougher program|more intense(ly)?|raise the bar)\b/i,
      /\b(make this tougher|push (the|this) program harder|harder version of this)\b/i,
      // FIX 4A: Catch "Make this program harder", "Make my training harder", "Make the sessions more challenging"
      // Uses a lookahead pattern that allows 0–4 noun words between the subject and the difficulty modifier
      /\bmake\s+(this|my|the|these)\s+(?:\w+\s+){0,4}(harder|tougher|more\s+(?:challenging|difficult|demanding|intense))\b/i,
    ],
  },

  // ── Decrease Difficulty ───────────────────────────────────────────────────
  {
    family: "decrease_difficulty",
    patterns: [
      /\b(make it easier|make (this|the program|the workout|it) (easier|lighter|less demanding|more manageable|more accessible))\b/i,
      /\b(too hard|too difficult|too intense|too brutal|lighten (it|this) up|too much for me)\b/i,
      /\b(less intense|dial (it|this) back|scale (it|this) (back|down)|tone (it|this) down)\b/i,
      /\b(easier program|beginner friendly|more accessible|less demanding)\b/i,
      /\b(this is too much|can.t keep up|overwhelming|struggling with the volume)\b/i,
      // FIX 4B: Catch "Make my training easier", "Make the sessions less intense", "Lower the impact"
      /\bmake\s+(this|my|the|these)\s+(?:\w+\s+){0,4}(easier|lighter|less\s+(?:demanding|intense|challenging|difficult))\b/i,
      /\b(lower the impact|lower impact|make it lower impact|less overall impact|reduce the impact)\b/i,
    ],
  },

  // ── Bulk Session Sets Adjustment ─────────────────────────────────────────
  // "Add N set(s) to each/every exercise for Day X" — deterministic executor.
  // Must appear BEFORE increase_volume so numbered "add N sets" requests with
  // "each / every / all" are captured here rather than the generic volume family.
  {
    family: "bulk_session_sets_increase",
    patterns: [
      // "add N set(s) to each/every/all exercise(s) for/in day X"
      /\badd\s+\d+\s+sets?\s+to\s+(each|every|all)\s+(exercise|movement|lift)/i,
      // "add N set(s) to each/every exercise" (no day ref — scope resolved from context)
      /\badd\s+(a|one|an extra|another|\d+)\s+sets?\s+to\s+(each|every|all)\s+(exercise|movement|lift)/i,
      // "remove/take off/cut N set(s) from each/every exercise"
      /\b(remove|take off|cut|subtract|drop)\s+\d+\s+sets?\s+from\s+(each|every|all)\s+(exercise|movement|lift)/i,
      // "increase sets by N for each/every exercise"
      /\b(increase|bump up|raise)\s+(sets?|the sets?)\s+by\s+\d+\s+(for|on|across)\s+(each|every|all)\s+(exercise|movement|lift)/i,
      // "give each exercise N more sets"
      /\bgive\s+(each|every)\s+(exercise|movement|lift)\s+\d+\s+more\s+sets?/i,
      // "add N more sets to every exercise"
      /\badd\s+\d+\s+more\s+sets?\s+to\s+(each|every|all)\s+(exercise|movement|lift)/i,
    ],
  },

  // ── Increase Volume ───────────────────────────────────────────────────────
  {
    family: "increase_volume",
    patterns: [
      /\b(more volume|increase volume|add (more )?sets?|add (more )?volume|more total work)\b/i,
      /\b(volume is too low|not enough volume|need more volume|increase training volume)\b/i,
      // NOTE: "add exercises?" (with optional s) removed — that greedily matched "add an exercise"
      // which is a strict structural add and belongs in the add_exercise family.
      /\b(add more exercises|more training|more weekly volume)\b/i,
    ],
  },

  // ── Decrease Volume ───────────────────────────────────────────────────────
  {
    family: "decrease_volume",
    patterns: [
      /\b(reduce|lower|cut|decrease).{0,20}(volume|sets?|total work|workload)\b/i,
      /\b(too much volume|too many sets?|too much work|too much accessory)\b/i,
      /\b(volume is too (high|much)|less total work|lower total volume)\b/i,
    ],
  },

  // ── Readiness Low / Low Energy Today ─────────────────────────────────────
  // Distinct from fatigue_management (which is about cumulative overtraining).
  // Readiness_low is TODAY's signal — tired right now, didn't sleep, low energy.
  // → Convert today's session to lower-intensity version, NOT rebuild the program.
  {
    family: "readiness_low",
    patterns: [
      /\b(i.?m (tired|exhausted|wiped out|drained|low energy|feeling off|not feeling it|sluggish|run down|worn out))\b/i,
      /\b(didn.?t (sleep|sleep well|get enough sleep)|bad night.?s? sleep|poor sleep|low sleep)\b/i,
      /\b(low energy (today|right now|tonight|this morning)?|energy is (low|down|off|not there))\b/i,
      /\b(not feeling (it|great|good|my best|well|up to it|100|100%))\b/i,
      /\b(feeling (off|flat|heavy|sluggish|blah|rough|run down|beat up today))\b/i,
      /\b(low (hrv|readiness|recovery score|body battery)|hrv (is|looks|shows) (low|bad|poor|down))\b/i,
      /\b(didn.?t recover|didn.?t recover well|poor recovery|bad recovery today)\b/i,
      /\b(struggling (to|with) (motivation|energy|getting started|this today))\b/i,
      /\b(just going through the motions|low motivation today|can.?t get going today)\b/i,
    ],
  },

  // ── Missed Sessions Re-entry ───────────────────────────────────────────────
  // User is returning after a break — needs reduced spike in intensity/volume.
  // → Reentry deload: reduce intensity, resume progression gradually.
  {
    family: "missed_sessions_reentry",
    patterns: [
      /\b(missed (a week|two weeks|a month|several weeks|some sessions?|a few sessions?|training))\b/i,
      /\b(haven.?t (trained|worked out|exercised|lifted|been to the gym) (in|for) (a few|a couple|several|10|two|three|four|one|a) (days?|weeks?|months?))\b/i,
      /\b(coming back (after|from) (a break|time off|being sick|injury|a layoff|two weeks|a month|vacation))\b/i,
      /\b(getting back (into it|into training|back to training|back to the gym|after a break))\b/i,
      /\b(took (a break|time off|two weeks off|a month off|some time off))\b/i,
      /\b(been (out|away|off) for (a week|a few weeks|two weeks|a month|a while))\b/i,
      /\b(returning (to training|after|from) (a break|rest|injury|travel|vacation|time off))\b/i,
      /\b(restarting|re.?entering|resuming (training|the program|my program|working out))\b/i,
      /\b(start back|start fresh|ease back in|ease back into)\b/i,
    ],
  },

  // ── Environment Temporary Switch ─────────────────────────────────────────
  // User is in a DIFFERENT environment TODAY — hotel, home, traveling.
  // Temporary by default — does NOT permanently rewrite the program.
  // Distinct from equipment_constraint which is persistent.
  {
    family: "environment_temporary_switch",
    patterns: [
      /\b(i.?m (traveling|at a hotel|at the hotel|on the road|away|out of town|on a trip|at home today|working from home))\b/i,
      /\b(hotel (gym|workout|training)|at a hotel gym today)\b/i,
      /\b(traveling (this week|today|for work|for a few days|for a trip))\b/i,
      /\b(away (from home|this week|for a few days|on a trip|for work))\b/i,
      /\b(just for today.{0,30}(hotel|home|travel|limited)|today.{0,20}only.{0,20}(hotel|home|travel))\b/i,
      /\b(training (at home|from home) (today|this week|temporarily|for now))\b/i,
      /\b(working out (at home|at the hotel|in my room|with limited equipment) today)\b/i,
      /\b(can.?t (get to|make it to|access|use) (the gym|my gym) today)\b/i,
      /\b(stuck (at a hotel|at home|without a gym|with no gym) (today|tonight|this week))\b/i,
    ],
  },

  // ── Sport Context Update ──────────────────────────────────────────────────
  // User is declaring or updating their sport/activity context.
  // → Update sport-specific emphasis, exercise selection, and coaching cues.
  {
    family: "sport_context_update",
    patterns: [
      /\b(i (play|do|compete in|train for|am a|am an|play competitive|play recreational|am playing))\s+(golf|football|soccer|basketball|baseball|tennis|hockey|volleyball|rugby|swimming|cycling|running|track|wrestling|bjj|jiu.?jitsu|mma|boxing|lacrosse|cricket|squash|padel|pickleball|rowing|triathlon|cross.?fit|olympic lifting)\b/i,
      /\b(this (is|program is) for\s+(golf|football|soccer|basketball|baseball|tennis|hockey|volleyball|rugby|swimming|cycling|running|track|wrestling|bjj|mma|boxing|lacrosse))\b/i,
      /\b(i.?m a\s+(golfer|footballer|soccer player|basketball player|baseball player|tennis player|hockey player|volleyball player|rugby player|swimmer|cyclist|runner|wrestler|boxer|lacrosse player|rower|triathlete))\b/i,
      /\b(training for\s+(golf|football|soccer|basketball|baseball|tennis|hockey|volleyball|rugby|a race|a marathon|a triathlon|a competition|a tournament|a season|a match))\b/i,
      /\b(my sport is|i box|i row|i cycle|i swim|i run track|i play golf|i play tennis|i wrestle|i do bjj|i do mma)\b/i,
      /\b(athletic (context|focus|bias).{0,20}(golf|football|soccer|basketball|tennis|hockey|rugby|swimming|cycling|running|boxing|wrestling|mma|lacrosse))\b/i,
    ],
  },

  // ── Exercise Dislike / Preference ────────────────────────────────────────
  // User dislikes or prefers a specific exercise or type of equipment.
  // Distinct from exercise_swap (which is "swap X for Y") and
  // equipment_constraint (which is "I don't have X").
  // → Store preference, replace disliked exercise if present.
  {
    family: "exercise_dislike_or_preference",
    patterns: [
      /\b(i (hate|dislike|can.?t stand|don.?t like|really dislike|loathe|despise|avoid|am not a fan of))\s+(lunges?|deadlifts?|squats?|burpees?|running|cardio|bench press|push.?ups?|pull.?ups?|planks?|sit.?ups?|crunches?|barbell|dumbbells?|machines?|cables?)\b/i,
      /\b(hate|dislike|don.?t like|not a fan of|can.?t stand)\s+(doing\s+)?(lunges?|deadlifts?|squats?|burpees?|running|cardio|bench|push.?ups?|pull.?ups?|planks?|sit.?ups?)\b/i,
      /\b(prefer\s+(not|to avoid|to skip)\s+(lunges?|deadlifts?|squats?|burpees?|running|cardio|barbell|machines?|cables?))\b/i,
      /\b(i prefer\s+(machines?|dumbbells?|cables?|barbells?|bodyweight|free weights?|resistance bands?))\b/i,
      /\b(i like\s+(machines?|dumbbells?|cables?|barbells?|bodyweight|free weights?|resistance bands?)\s+(better|more|over|instead))\b/i,
      /\b(no\s+(lunges?|deadlifts?|squats?|burpees?|bench press|running|cardio)\s+(please|for me|in (the|my) program))\b/i,
      /\b(take out\s+(all\s+)?(the\s+)?(lunges?|deadlifts?|squats?|burpees?|bench press|running|planks?)\s+(from|in)\s+(the|my)\s+program)\b/i,
      /\b(i.?d rather (not|avoid)\s+(do|doing)\s+(lunges?|deadlifts?|squats?|burpees?|running|bench press|planks?))\b/i,
      /\b(remove\s+(all\s+)?(lunges?|deadlifts?|squats?|burpees?|planks?|sit.?ups?)\s+from (the|my) program)\b/i,
    ],
  },

  // ── Program Safety Question (NEVER mutates — always GUIDANCE) ─────────────
  // Matches questions about whether the current program is appropriate, safe,
  // or suitable given the user's condition, sport, or context.
  {
    family: "program_safety_question",
    patterns: [
      /\bis\s+(this|the)\s+(program|plan|workout|session|exercise|training).{0,40}(safe|okay|ok|appropriate|suitable|too (much|hard|intense|heavy|demanding)|right for me)\b/i,
      /\b(safe|okay|ok)\s+(for me|to do|to follow|to use)\b/i,
      /\bshould i (do|follow|use|run|try) this.{0,30}(if|with|when).{0,40}(pain|hurt|injury|knee|shoulder|back|hip|sore|weak|limited|old|pregnant|new to|beginner)/i,
      /\b(is this|are these).{0,20}(too much|too hard|too intense|too heavy|too demanding|excessive|overtraining|overtrain)\b/i,
      /\b(is this|will this).{0,30}(cause|lead to|result in|risk|increase|hurt|damage|injure|aggravate|irritate)\b/i,
      /\b(not (sure|certain)) if (this|the program|it).{0,30}(is|will|can|would)\b/i,
      /\b(worried|concerned|nervous).{0,30}(about|with|this|program|plan|exercise|volume|intensity)\b/i,
      /\b(is.{0,20}enough|is.{0,20}too (little|few|much|many)).{0,30}(recovery|rest|days?|volume|sets?|frequency)\b/i,
      /\bcould (this|it|the program) (hurt|harm|damage|be bad for|be dangerous|cause issues)\b/i,
      /\b(program|plan|training).{0,30}(safe|appropriate|suitable|recommended|advisable)\s*(for|if|when|with)\b/i,
    ],
  },

  // ── Program Explanation Question (NEVER mutates — always GUIDANCE) ────────
  // Matches questions asking WHY something is in the program, or whether the
  // structure makes sense for a given goal, sport, or context.
  {
    family: "program_explanation_question",
    patterns: [
      /\bwhy (is|are|do|does|did).{0,30}(this|the|these|here|in (the|this|my))\b/i,
      /\bwhat (is|are) (this|these|the).{0,30}(for|doing|here|about)\b/i,
      /\b(does|do) (this|the program|it|these).{0,30}(make sense|work|fit|apply|help|translate|carry over|target|address)\b/i,
      /\b(for|for a).{0,20}(soccer|football|basketball|baseball|tennis|rugby|hockey|volleyball|swimming|cycling|running|track|wrestling|bjj|mma|crossfit|triathlon|golf|lacrosse)\b.{0,40}\?/i,
      /\bwhat('s| is) the (point|purpose|reason|idea|goal|rationale).{0,30}(of|behind|for|with) (this|the|these)\b/i,
      /\bhow (does|do|will) (this|these|the program|it).{0,40}(help|work|fit|apply|translate|build|develop|improve|benefit)\b/i,
      /\b(why|what) (did you|did the|was this|is this|are these).{0,30}(choose|pick|select|include|add|put here|program|structure)\b/i,
      /\b(makes sense|makes any sense|makes no sense).{0,20}(for|with|to|given)\b/i,
    ],
  },

  // ── Coaching Question (NEVER mutates — always GUIDANCE) ───────────────────
  // Matches open-ended coaching questions about the current program's effect,
  // suitability, or logic — without requesting a change.
  {
    family: "coaching_question",
    patterns: [
      /\bwill (this|the program|it|these).{0,40}(help|work|build|develop|improve|increase|boost|enhance|train)\b/i,
      /\b(is|are) (this|these|the program).{0,40}(good|effective|optimal|efficient|ideal|the right|a good|the best) (for|way|approach|choice|option)\b/i,
      /\b(should|would) (i|this|the).{0,30}(use|follow|do|be|help|work|apply|carry)\b/i,
      /\bhow (effective|good|well|much|long|often|many).{0,40}(is|are|will|does|do) (this|the|it|these)\b/i,
      /\b(is there|are there).{0,20}(a better|an alternative|another|a different|a smarter) (way|option|approach|exercise|structure|method)\b/i,
      /\bwhat (should|would|can|do) (i|you|we).{0,30}(expect|see|get|notice|feel|achieve)\b/i,
    ],
  },
];

// ─── Intent Family Normalization ──────────────────────────────────────────────

export interface IntentFamilyResult {
  family: IntentFamily;
  confidence: "high" | "medium" | "low";
  matchedPatterns: string[];
  targetScope: TargetScope;
  scopeSource: "explicit" | "context_inferred" | "default";
  debugInfo: Record<string, unknown>;
}

// ─── Mode-Aware Priority Patterns ─────────────────────────────────────────────
//
// These patterns run BEFORE the global FAMILY_PATTERNS when a focusMode is known.
// They resolve known ambiguities where the same phrase means different things
// depending on the active training domain (Speed / Mobility / Strength).
//
// Layering rule:
//   1. Mode-specific pre-pass (below) — fires first when mode is known
//   2. Global FAMILY_PATTERNS — existing universal classification
//   3. Fallback → clarification_required
//
// Each entry documents WHY the mode override is needed (reason field).

interface ModePriorityEntry {
  family: IntentFamily;
  patterns: RegExp[];
  reason: string;
}

const MODE_PRIORITY_PATTERNS: Record<FocusMode, ModePriorityEntry[]> = {
  // ── SPEED MODE ──────────────────────────────────────────────────────────────
  // Key conflict zones in Speed:
  //   "quickness" globally → power_explosive_focus; in Speed → footwork_rhythm_focus
  //   "more pop" / "lighter on ground" → must always mean reactive quality, not load change
  //   COD/agility phrases → cod_decel_focus, never barbell-power bundle
  speed: [
    {
      family: "reactive_focus",
      patterns: [
        // "lighter on the ground/floor" and raw "lighter on feet" — in speed, always reactive
        /\blighter\s+on\s+(my\s+)?(feet|the\s+(ground|floor))\b/i,
        // Snappy / pop / crisp — reactive quality cues
        /\b(more pop|pop off|snappier|crisp(er)? contacts?)\b/i,
        // Quicker off the floor / faster contacts — reactive
        /\b(quick(er)?\s+off\s+the\s+(floor|ground)|faster\s+contacts?)\b/i,
      ],
      reason: "Speed mode: 'more pop', 'lighter on the ground', 'snappy' always = reactive quality — not load reduction or general difficulty change",
    },
    {
      family: "footwork_rhythm_focus",
      patterns: [
        // "quickness" in speed mode = footwork (globally it hits power_explosive_focus)
        /\bquickness\b/i,
        // Explicit footwork / foot-speed cues
        /\b(foot\s+speed|foot\s+coordination|quick(er)?\s+feet|faster\s+feet|ladder\s+(work|drills?)|footwork)\b/i,
        // Lateral movement cues
        /\b(lateral\s+(shuffle|speed|quickness|movement)|shuffle\s+(patterns?|steps?|drills?))\b/i,
      ],
      reason: "Speed mode: quickness/footwork/ladder phrases = footwork_rhythm_focus, not power_explosive_focus",
    },
    {
      family: "cod_decel_focus",
      patterns: [
        // COD / agility / decel — in speed, always change-of-direction domain
        /\b(change\s+of\s+direction|better\s+agility|agility\s+(drills?|work|training)|decel\w*|cutting\s+(ability|work|drills?)|cut\s+faster|sharper\s+cuts?)\b/i,
        // COD drill names
        /\b(T.?drill|505\s+drill|pro.?agility|5.?10.?5|COD\s+(work|training|drills?))\b/i,
      ],
      reason: "Speed mode: COD/agility/decel requests must be classified as change-of-direction work, not routed to barbell power bundle",
    },
    {
      family: "tendon_resilience_focus",
      patterns: [
        // Protect / manage specific tendons — in speed context always = load management, NOT injury rehab
        /\b(protect\s+(my\s+)?(tendons?|Achilles|patellar(\s+tendon)?|elbow(\s+tendon)?))\b/i,
        /\b(reduce\s+tendon\s+(load|stress|strain|demand|volume|frequency))\b/i,
        /\b(easier\s+on\s+(my\s+)?(Achilles|patellar(\s+tendon)?|tendons?|elbow(\s+tendon)?))\b/i,
        /\b(less\s+(Achilles|patellar|tendon)(\s+tendon)?\s+(stress|load|strain|demand|pressure))\b/i,
        /\b(more\s+tendon.?friendly|tendon.?friendly)\b/i,
        /\b(Achilles.?friendly|patellar.?friendly)\b/i,
        /\b(tendon\s+(health|resilience|conditioning|prep|care|protection|management))\b/i,
      ],
      reason: "Speed mode: tendon protection/load-management phrases = tendon_resilience_focus (manage plyometric load, swap to eccentrics/isometrics) — NOT injury_modification (no pain/injury language) and NOT joint_friendly or recovery_focus",
    },
    {
      family: "trunk_core_emphasis",
      patterns: [
        /\bmore\s+core\b/i,
        // Trunk stiffness / bracing in speed context = sprint/COD mechanics transfer
        /\b(trunk\s+stiffness|core\s+stiffness|bracing\s+(for\s+)?(speed|sprint|COD|cutting|decel))\b/i,
        /\b(anti.?rotation\s+(for\s+)?(speed|sprint|COD|cutting)|core\s+(for\s+)?(speed|sprint|COD))\b/i,
        /\b(more\s+anti.?rotation|more\s+anti.?extension|midline\s+(stability|control|stiffness))\b/i,
        /\b(trunk\s+(stability|control|emphasis|focus|work)\s*(for\s+)?(speed|sprint|cutting|COD|mechanics)?)\b/i,
        /\b(core\s+(emphasis|focus|dominant|control|stability)\s*(for\s+)?(speed|sprint|cutting)?)\b/i,
        /\b(pillar\s+(strength|stability|work))\b/i,
      ],
      reason: "Speed mode: trunk/core stability = trunk_core_emphasis (stiffness and bracing for sprint/COD transfer mechanics), NOT generic session_expansion or accessory filler",
    },
  ],

  // ── MOBILITY MODE ────────────────────────────────────────────────────────────
  // Key conflict zones in Mobility:
  //   "more restorative" / "yin style" globally → may not match anything → clarification_required
  //   "deeper stretch/holds" → rom_restoration_focus (range challenge), not generic increase_difficulty
  //   "less intense" in mobility → recovery_focus (slower holds), not barbell load reduction
  mobility: [
    {
      family: "recovery_focus",
      patterns: [
        // "More restorative" / yin-style — recovery focus with mobility guard
        /\b(more\s+restorative|restorative\s+(session|flow|practice|work)|yin\s+(style|approach|focus|session))\b/i,
        // "Softer session", "gentler flow" — mobility recovery language
        /\b(soften\s+(it|this|the\s+practice)|gentler\s+(session|flow|work|practice))\b/i,
        // "Less intense session/flow" — in mobility means slower holds, not load reduction
        /\b(less\s+intense\s+(session|flow|sequence|practice)|dial\s+(it|this)\s+back\s+(a\s+bit)?)\b/i,
        // "Easier on my body" — mobility context = restorative, not lighter weights
        /\b(easier\s+on\s+my\s+(body|joints?|muscles?|system))\b/i,
      ],
      reason: "Mobility mode: restorative/yin/gentler requests = recovery_focus (bundle has mobility guard preventing volume removal, not barbell deload)",
    },
    {
      family: "rom_restoration_focus",
      patterns: [
        // Depth / range challenge — in mobility means push range further
        /\b(more\s+depth|deeper\s+(stretch|holds?|into\s+(the\s+)?pose|position)|further\s+into\s+(the\s+)?range)\b/i,
        /\b(push\s+(the\s+)?range|challenge\s+(my|the)\s+(range|flexibility|mobility)|more\s+depth\s+in)\b/i,
        // Unlock / open language — strongly ROM in any mode but particularly targeted in mobility
        /\b(unlock\s+(my\s+)?(hips?|shoulders?|thoracic|ankles?|spine))\b/i,
        // "CARs" / controlled articular rotations — always ROM restoration
        /\bCARs?\b/i,
        /\b(controlled\s+articular\s+rotations?|joint\s+circle)\b/i,
      ],
      reason: "Mobility mode: depth/range challenge and CAR-style phrases = ROM restoration (range challenge), not generic difficulty progression",
    },
    {
      family: "end_range_control_focus",
      patterns: [
        // PAILs / RAILs — always end-range strength work, never passive ROM restoration
        /\b(PAILs|RAILs|PAILs\s+(and|&)\s+RAILs|progressive\s+angular\s+isometric|regressive\s+angular\s+isometric)\b/i,
        // "Own the position / range" — active positional ownership
        /\b(own\s+(the|my)\s+(position|range|end.?range|deep\s+position|end\s+position))\b/i,
        // Stronger at end range — active, not passive
        /\b(stronger\s+(in|at)\s+(the\s+)?end.?range|strength\s+(in|at)\s+(the\s+)?end.?range)\b/i,
        // End-range control / strength / stability
        /\b(end.?range\s+(control|strength|stability|capacity|work|loading|isometric))\b/i,
        // Active range control
        /\b(active\s+(end.?range\s+(control|strength|work|loading)|range\s+control))\b/i,
        // FRC (Functional Range Conditioning) — active system
        /\b(functional\s+range\s+conditioning|FRC\s+(work|protocol|method|training))\b/i,
        // End-range isometrics
        /\b(isometric\s+(at|in)\s+(the\s+)?end.?range|end.?range\s+isometric(s)?)\b/i,
        // Positional ownership / loaded end range
        /\b(positional\s+(ownership|control|strength)|loaded\s+end.?range)\b/i,
      ],
      reason: "Mobility mode: PAILs/RAILs, end-range control/strength, positional ownership = end_range_control_focus (active isometric strength at end range) — NOT rom_restoration_focus (passive range acquisition) — these are distinct families",
    },
    {
      family: "mobility_flow_focus",
      patterns: [
        // "more flow" — unambiguous in mobility context
        /\bmore\s+flow\b/i,
        // Mobility/movement flow
        /\b(mobility\s+flow|movement\s+flow|flowing\s+(mobility|movement|practice))\b/i,
        // Smoother mobility / transitions
        /\b(smoother\s+(mobility|transitions?|sequencing|movement\s+flow|practice))\b/i,
        // Connective / integrated sequences
        /\b(connective\s+movement|connected\s+mobility|continuous\s+(mobility\s+)?flow)\b/i,
        /\b(integrated\s+mobility\s+sequence|linked\s+mobility|less\s+segmented\s+(mobility|practice))\b/i,
      ],
      reason: "Mobility mode: 'more flow', 'smoother mobility flow', 'connective movement', 'continuous flow' = mobility_flow_focus (linked continuous movement sequences) — NOT recovery_focus (restorative/yin/lower-intensity) — these are structurally distinct requests",
    },
    {
      family: "trunk_core_emphasis",
      patterns: [
        /\bmore\s+core\b/i,
        // Positional trunk control in mobility context
        /\b(positional\s+(trunk|core)\s+(control|strength|stability))\b/i,
        /\b(trunk\s+(stability|control|strength|focus|emphasis|work))\b/i,
        /\b(core\s+(control|stability|dominant|emphasis|focus|positional\s+strength))\b/i,
        /\b(more\s+anti.?rotation|more\s+anti.?extension|midline\s+(stability|control))\b/i,
        /\b(more\s+(trunk|core)\s+(work|training|stability|control|strength))\b/i,
        /\b(pillar\s+(strength|stability)|deadbug|bird.?dog|hollow\s+body\s+(hold|work))\b/i,
      ],
      reason: "Mobility mode: trunk/core emphasis = trunk_core_emphasis (positional trunk control, deadbug/bird-dog/hollow body) — NOT generic session_expansion and NOT accessory filler",
    },
  ],

  // ── STRENGTH MODE ────────────────────────────────────────────────────────────
  // Strength mode currently has strong global coverage.
  // The pre-pass here only guards a few phrases that could misfire if future
  // pattern additions create conflicts.
  strength: [
    {
      family: "power_explosive_focus",
      patterns: [
        // Keep explosive/power firmly in power_explosive in strength context
        // (guards against future reactive/speed patterns accidentally stealing these)
        /\b(more\s+explosive|more\s+power|add\s+(power|explosiveness|plyometrics?))\b/i,
        /\b(rate\s+of\s+force|first\s+step\s+power|ballistic\s+(work|training))\b/i,
      ],
      reason: "Strength mode: explosive/power requests stay in power_explosive_focus (barbell-first bundle), not routed to speed-mode reactive bundles",
    },
    {
      family: "unilateral_emphasis",
      patterns: [
        /\b(more\s+unilateral|unilateral\s+(emphasis|focus|bias|work|training|dominant))\b/i,
        /\b(more\s+single.?leg\s+(work|training|exercises?|movements?)|single.?leg\s+(focus|bias|emphasis))\b/i,
        /\b(more\s+one.?leg(ged)?\s+(work|training|movements?)|one.?legged\s+(focus|training|work))\b/i,
        /\b(less\s+bilateral|fewer\s+bilateral|reduce\s+bilateral|more\s+split\s+stance)\b/i,
        /\b(split.?stance\s+(emphasis|focus|bias|work|training))\b/i,
        /\b(unilateral\s+(lower|upper)\s+(emphasis|focus|bias|work|training))\b/i,
        /\b(single.?arm\s+(work|focus|training|emphasis|bias))\b/i,
      ],
      reason: "Strength mode: single-leg/unilateral/split-stance language = unilateral_emphasis (systematic programming bias shift) — NOT generic exercise variation or add_exercise",
    },
    {
      family: "posterior_chain_emphasis",
      patterns: [
        /\b(more\s+posterior\s+chain|posterior\s+chain\s+(emphasis|focus|bias|work|training))\b/i,
        /\b(more\s+hamstrings?|more\s+hamstring\s+(work|training|emphasis|volume))\b/i,
        /\b(more\s+glutes?|glute\s+(emphasis|focus|work|training|dominant|bias))\b/i,
        /\b(more\s+hinge|hinge.?dominant|hinge\s+(emphasis|focus|work|training|bias))\b/i,
        /\b(more\s+(RDL|Romanian\s+deadlift|hip\s+hinge\s+work))\b/i,
        /\b(backside\s+(emphasis|focus|work|training)|hip\s+extension\s+(focus|emphasis|bias))\b/i,
        /\b(more\s+pulling|pulling\s+(emphasis|focus|bias|dominant)|pull.?dominant)\b/i,
        /\b(hamstring\s+(dominant|emphasis|focus|bias)|glute.?ham\s+(emphasis|focus|work))\b/i,
      ],
      reason: "Strength mode: posterior chain / hamstring / glute / hinge / pulling emphasis = posterior_chain_emphasis (hinge/glute/hamstring bias shift) — NOT generic hypertrophy and NOT pulling-only or generic variation",
    },
    {
      family: "trunk_core_emphasis",
      patterns: [
        /\bmore\s+core\b/i,
        /\b(more\s+(trunk|core)\s+(work|training|stability|control|stiffness|strength|emphasis|focus))\b/i,
        /\b(more\s+(anti.?rotation|anti.?extension|anti.?flexion|anti.?lateral\s+flexion))\b/i,
        /\b(trunk\s+(stability|stiffness|control|strength|emphasis|focus|bias))\b/i,
        /\b(core\s+(emphasis|focus|bias|dominant|stiffness|control|stability))\b/i,
        /\b(midline\s+(stability|control|stiffness)|pillar\s+(strength|stability|work))\b/i,
        /\b(more\s+core\s+(control|stiffness|bracing|dominant|stability|anti.?rotation))\b/i,
        /\b(more\s+planks?|plank\s+(variations?|progressions?|work)|core.?focused)\b/i,
      ],
      reason: "Strength mode: trunk/core stability = trunk_core_emphasis (anti-rotation/anti-extension under load, carries, Pallof press) — NOT generic session_expansion or accessory filler",
    },
  ],
};

// ─── Competing Family Guard ────────────────────────────────────────────────────
//
// For reactive/performance-quality intents, detect if the raw message also
// matches a generic reduction/shortening family that could have fired instead.
// This prevents silent misclassification of performance commands as volume cuts.

const REDUCTION_FAMILY_GUARD_PATTERNS: { family: IntentFamily; patterns: RegExp[] }[] = [
  {
    family: "decrease_volume",
    patterns: [
      /\b(reduce|lower|cut|decrease).{0,20}(volume|sets?|total work|workload)\b/i,
    ],
  },
  {
    family: "reduce_time",
    patterns: [
      /\b(shorter workouts?|shorter sessions?|less time|make (this|it).{0,20}shorter)\b/i,
      /\b(compress|tighten|trim).{0,20}(session|workout|program|down)\b/i,
    ],
  },
  {
    family: "session_reduction",
    patterns: [
      /\b(shorten (this )?(session|block|day|workout)|cut (this )?(session|block|day)|remove (some )?exercises?|fewer exercises?)\b/i,
      /\b(reduce.{0,20}exercises?|trim (this )?(session|block)|simplify (this )?(session|block))\b/i,
    ],
  },
];

function detectRejectedCompetingFamily(lower: string): IntentFamily | undefined {
  for (const { family, patterns } of REDUCTION_FAMILY_GUARD_PATTERNS) {
    if (patterns.some((p) => p.test(lower))) {
      return family;
    }
  }
  return undefined;
}

/**
 * Normalize a user message to a stable IntentFamily.
 *
 * @param message    The raw user message.
 * @param focusMode  Optional. The active training mode (strength / speed / mobility).
 *                   When supplied, a mode-specific priority pre-pass runs first,
 *                   resolving ambiguous phrases that mean different things across modes.
 *                   Callers that do not yet supply focusMode continue to use global patterns.
 */
export function normalizeToIntentFamily(message: string, focusMode?: FocusMode): IntentFamilyResult {
  const lower = message.toLowerCase().trim();

  // ── LAYER 1: Mode-specific priority pre-pass ────────────────────────────────
  // When focusMode is known, run mode-specific patterns BEFORE the global list.
  // These resolve known ambiguities (e.g. "quickness" in speed = footwork, not power;
  // "more restorative" in mobility = recovery, not a generic deload).
  if (focusMode) {
    const modePriorities = MODE_PRIORITY_PATTERNS[focusMode];
    for (const { family, patterns, reason } of modePriorities) {
      const matched = patterns.filter((p) => p.test(lower));
      if (matched.length > 0) {
        const targetScope = resolveTargetScope(lower);
        const rejectedCompetingFamily = detectRejectedCompetingFamily(lower);

        const result: IntentFamilyResult = {
          family,
          confidence: matched.length >= 2 ? "high" : "medium",
          matchedPatterns: matched.map((p) => p.source.slice(0, 60)),
          targetScope: targetScope.scope,
          scopeSource: targetScope.source,
          debugInfo: {
            patternMatchCount: matched.length,
            firstMatch: matched[0].source.slice(0, 80),
            rejectedCompetingFamily: rejectedCompetingFamily ?? null,
            matchedBy: "mode-specific",
            focusMode,
          },
        };

        logger.debug(
          {
            rawCommand: message.slice(0, 120),
            focusMode,
            matchedFamily: family,
            matchedBy: "mode-specific",
            competingFamilyRejected: rejectedCompetingFamily ?? null,
            confidence: result.confidence,
            modeReason: reason,
          },
          `[IntentResolution] focusMode=${focusMode} raw="${message.slice(0, 80)}" → MODE-SPECIFIC=${family.toUpperCase()}`,
        );

        return result;
      }
    }
  }

  // ── LAYER 2: Global pattern matching (existing behavior) ────────────────────
  // Runs when mode is absent OR when no mode-specific pattern matched.
  // This preserves full backward compatibility for call sites that do not yet
  // supply focusMode.
  for (const { family, patterns } of FAMILY_PATTERNS) {
    const matched = patterns.filter((p) => p.test(lower));
    if (matched.length > 0) {
      const targetScope = resolveTargetScope(lower);

      // Guard: if the resolved family is a performance-quality intent, detect
      // any competing reduction/shortening families that could have fired instead
      // and log them as explicitly rejected.
      const rejectedCompetingFamily = detectRejectedCompetingFamily(lower);

      const result: IntentFamilyResult = {
        family,
        confidence: matched.length >= 2 ? "high" : "medium",
        matchedPatterns: matched.map((p) => p.source.slice(0, 60)),
        targetScope: targetScope.scope,
        scopeSource: targetScope.source,
        debugInfo: {
          patternMatchCount: matched.length,
          firstMatch: matched[0].source.slice(0, 80),
          rejectedCompetingFamily: rejectedCompetingFamily ?? null,
          matchedBy: "global",
          focusMode: focusMode ?? null,
        },
      };

      logger.debug(
        {
          rawCommand: message.slice(0, 120),
          focusMode: focusMode ?? null,
          matchedFamily: family,
          matchedBy: "global",
          competingFamilyRejected: rejectedCompetingFamily ?? null,
          confidence: result.confidence,
        },
        `[IntentResolution] raw="${message.slice(0, 80)}" → GLOBAL=${family.toUpperCase()} | mode=${focusMode ?? "none"}`,
      );

      return result;
    }
  }

  // ── LAYER 3: No match — clarification required ──────────────────────────────
  const targetScope = resolveTargetScope(lower);
  logger.debug(
    {
      rawCommand: message.slice(0, 120),
      focusMode: focusMode ?? null,
      matchedFamily: "clarification_required",
      matchedBy: "fallback",
    },
    `[IntentResolution] raw="${message.slice(0, 80)}" → NO MATCH | mode=${focusMode ?? "none"}`,
  );
  return {
    family: "clarification_required",
    confidence: "low",
    matchedPatterns: [],
    targetScope: targetScope.scope,
    scopeSource: targetScope.source,
    debugInfo: { noMatch: true, matchedBy: "fallback", focusMode: focusMode ?? null },
  };
}

// ─── Target Scope Resolution ──────────────────────────────────────────────────
//
// Determines WHERE a change should apply.
// Priority: explicit language > UI context > structural default

interface ScopeResult {
  scope: TargetScope;
  source: "explicit" | "context_inferred" | "default";
}

function resolveTargetScope(lower: string): ScopeResult {
  // Explicit exercise scope
  if (
    /\b(this exercise|the exercise|this movement|the movement|this lift|the lift)\b/.test(lower) ||
    /\b(make (this|the) exercise)\b/.test(lower)
  ) {
    return { scope: "exercise", source: "explicit" };
  }

  // Explicit session/day scope
  if (/\b(day\s*\d|session\s*\d|this session|this day|on day|for day|day one|day two|day three)\b/.test(lower)) {
    return { scope: "session", source: "explicit" };
  }

  // Explicit week scope
  if (/\b(this week|for the week|week\s*\d|weekly|for week)\b/.test(lower)) {
    return { scope: "week", source: "explicit" };
  }

  // Explicit program scope
  if (/\b(the whole program|overall|across the program|all sessions|everything|the entire program)\b/.test(lower)) {
    return { scope: "program", source: "explicit" };
  }

  // Context-inferred from language
  if (/\badd (more )?exercises? to\b/.test(lower)) {
    return { scope: "session", source: "context_inferred" };
  }

  // Default: program scope for bias/difficulty/focus changes
  return { scope: "program", source: "default" };
}

// ─── Transformation Bundles ───────────────────────────────────────────────────
//
// Each family maps to a real transformation bundle.
// minimumStructuralChanges: number of REAL structural changes required to pass validation.

const TRANSFORMATION_BUNDLES: Record<IntentFamily, TransformationBundle> = {

  increase_difficulty: {
    intentFamily: "increase_difficulty",
    minimumStructuralChanges: 1,
    primaryChanges: [
      { type: "add_sets", description: "Add 1 set to primary movements", countAs: 1 },
      { type: "reduce_rest", description: "Reduce rest periods by 15-30 seconds", countAs: 1 },
      { type: "shift_rep_range_strength", description: "Pull rep ranges lower for heavier loading", countAs: 1 },
      { type: "swap_to_progression", description: "Swap to a harder exercise variation", countAs: 1 },
    ],
    secondaryChanges: [
      { type: "increase_density", description: "Add density work (supersets or reduced transitions)", countAs: 1 },
    ],
    antiPatterns: [
      "Do NOT add +1 set as the only change if difficulty request is strong",
      "Do NOT just add a note saying 'push harder' without structural change",
      "Do NOT increase all sets by the same flat amount — vary by priority",
    ],
    validationRules: [
      "At least 1 real structural change required (set count, rest, rep range, or exercise swap)",
      "Cosmetic text additions alone = invalid",
    ],
    aiDirective: "INCREASE DIFFICULTY: Change at least one structural element. Options: add sets to primary lifts, reduce rest by 15-30 sec, lower rep range (e.g. 8-10 → 5-7), or swap to a harder variation. Do NOT only add a coaching note.",
    scopeGuidance: "Apply to targeted scope. If program-wide, affect primary lifts first. If session, affect all primary and secondary movements in that session.",
  },

  decrease_difficulty: {
    intentFamily: "decrease_difficulty",
    minimumStructuralChanges: 1,
    primaryChanges: [
      { type: "remove_sets", description: "Remove 1 set from primary movements", countAs: 1 },
      { type: "increase_rest", description: "Extend rest periods by 20-30 seconds", countAs: 1 },
      { type: "shift_rep_range_hypertrophy", description: "Shift rep ranges to more manageable zone (10-15)", countAs: 1 },
      { type: "swap_to_regression", description: "Swap to an easier exercise variation", countAs: 1 },
    ],
    secondaryChanges: [
      { type: "reduce_accessories", description: "Remove lowest-priority accessories", countAs: 1 },
      { type: "reduce_density", description: "Remove density constraints or supersets", countAs: 1 },
    ],
    antiPatterns: [
      "Do NOT just add a note saying 'take it easy'",
      "Do NOT reduce only accessories while leaving primary lifts unchanged if difficulty is the concern",
      "Do NOT make the session so easy it loses all training value",
    ],
    validationRules: [
      "At least 1 real structural reduction (sets, rest extension, rep range shift, or regression swap)",
    ],
    aiDirective: "DECREASE DIFFICULTY: Reduce structural demand. Options: remove a set from primary lifts, extend rest by 20-30 sec, shift rep range to 10-15, or swap to a simpler variation. Remove 1-2 lowest-priority accessories.",
    scopeGuidance: "Apply conservatively — preserve training integrity while reducing demand.",
  },

  increase_volume: {
    intentFamily: "increase_volume",
    minimumStructuralChanges: 1,
    primaryChanges: [
      { type: "add_sets", description: "Add sets to primary and secondary movements", countAs: 1 },
      { type: "add_accessories", description: "Add 1-2 relevant accessory exercises", countAs: 1 },
      { type: "add_exercise", description: "Add a new exercise that fills a training gap", countAs: 1 },
    ],
    secondaryChanges: [
      { type: "update_session_emphasis", description: "Update session notes to reflect added volume", countAs: 0 },
    ],
    antiPatterns: [
      "Do NOT add random exercises unrelated to the session's purpose",
      "Do NOT add so much volume it becomes unreasonable",
    ],
    validationRules: [
      "At least 1 real set or exercise addition",
      "Added exercises must fit the session's existing pattern and intent",
    ],
    aiDirective: "INCREASE VOLUME: Add meaningful training work. Add sets to existing movements OR add 1-2 well-chosen accessory exercises that complement the session's purpose. Do not add random exercises.",
    scopeGuidance: "If session-scoped: add within that session. If program-scoped: add across sessions proportionally.",
  },

  decrease_volume: {
    intentFamily: "decrease_volume",
    minimumStructuralChanges: 1,
    primaryChanges: [
      { type: "remove_sets", description: "Remove 1 set from accessories/secondary lifts", countAs: 1 },
      { type: "remove_exercise", description: "Remove lowest-priority accessory exercises", countAs: 1 },
      { type: "reduce_accessories", description: "Trim accessory work to essentials only", countAs: 1 },
    ],
    secondaryChanges: [
      { type: "reduce_density", description: "Remove superset or density structures", countAs: 1 },
    ],
    antiPatterns: [
      "Do NOT remove primary compound lifts to reduce volume — cut accessories first",
      "Do NOT gut the session so it loses purpose",
    ],
    validationRules: [
      "At least 1 real set or exercise removal",
      "Primary compound lifts must remain intact unless specifically targeted",
    ],
    aiDirective: "DECREASE VOLUME: Remove lowest-priority work first. Remove accessories before compounds. Remove 1 set from secondary lifts if needed. Preserve the session's core purpose.",
    scopeGuidance: "Cut proportionally across the scope. Protect primary movements.",
  },

  reduce_time: {
    intentFamily: "reduce_time",
    minimumStructuralChanges: 2,
    primaryChanges: [
      { type: "remove_exercise", description: "Remove lowest-priority accessory exercises", countAs: 1 },
      { type: "reduce_rest", description: "Tighten rest periods across accessories", countAs: 1 },
      { type: "add_superset_structure", description: "Compress compatible exercises into supersets", countAs: 1 },
    ],
    secondaryChanges: [
      { type: "remove_sets", description: "Remove trailing sets from accessories", countAs: 1 },
    ],
    antiPatterns: [
      "Do NOT preserve full volume while claiming session was compressed",
      "Do NOT remove only warm-up while leaving all work sets",
      "Do NOT compress without actually reducing work or time",
    ],
    validationRules: [
      "At least 2 structural changes that actually reduce session duration",
      "Total exercise count OR set count must decrease",
      "Cannot pass if workload is unchanged",
    ],
    aiDirective: "REDUCE TIME: Compress the session. Remove lowest-priority accessories (1-2 exercises), tighten accessory rest to 45-60 sec, and optionally superset compatible exercises. Primary compound work stays. Total exercises or sets MUST decrease.",
    scopeGuidance: "Apply to the targeted session(s). If program-wide, compress every session proportionally.",
  },

  increase_time: {
    intentFamily: "increase_time",
    minimumStructuralChanges: 1,
    primaryChanges: [
      { type: "add_exercise", description: "Add 1-2 relevant exercises to expand session", countAs: 1 },
      { type: "add_prep_block", description: "Add a structured warm-up/prep block", countAs: 1 },
      { type: "add_accessories", description: "Expand accessory work", countAs: 1 },
    ],
    secondaryChanges: [
      { type: "add_conditioning_finisher", description: "Add a conditioning finisher if appropriate", countAs: 1 },
    ],
    antiPatterns: [
      "Do NOT add random unrelated exercises to fill time",
    ],
    validationRules: [
      "At least 1 exercise, set, or block addition",
    ],
    aiDirective: "INCREASE TIME/EXPAND SESSION: Add meaningful work. Options: add a structured warm-up, add 1-2 accessory exercises that fit the session's purpose, or add a conditioning finisher. Match the session's existing goal and identity.",
    scopeGuidance: "Add to the targeted session. Preserve the session's identity and purpose.",
  },

  strength_focus: {
    intentFamily: "strength_focus",
    minimumStructuralChanges: 2,
    primaryChanges: [
      { type: "shift_rep_range_strength", description: "Shift primary lifts to strength rep range (3-6)", countAs: 1 },
      { type: "increase_rest", description: "Extend rest on primary lifts to 3-5 min", countAs: 1 },
      { type: "shift_to_compound_emphasis", description: "Prioritize compound lifts, reduce isolation fluff", countAs: 1 },
    ],
    secondaryChanges: [
      { type: "reduce_accessories", description: "Remove high-fatigue isolation accessories", countAs: 1 },
    ],
    antiPatterns: [
      "Do NOT keep rep ranges in 8-15 zone and call it strength",
      "Do NOT keep short rest periods and call it strength",
      "Do NOT add more accessories when strength focus reduces accessory need",
    ],
    validationRules: [
      "Rep ranges MUST shift to 3-6 range for primary lifts",
      "Rest MUST extend on primary lifts (3+ min)",
      "At least 2 structural changes required",
    ],
    aiDirective: "STRENGTH FOCUS: Shift primary lifts to 3-6 rep range. Extend rest to 3-5 min on compounds. Reduce or remove high-fatigue isolation accessories. Prioritize maximal force output. Rep ranges MUST change — this is not optional.\n\nIDENTITY UPDATE REQUIRED: You MUST also produce an update_session change that refreshes the session's `label` and `emphasis` to reflect its new strength identity. Example label: 'Lower Strength — Maximal Force Output'. Example emphasis: 'Heavy compound loading, peak force development, and bilateral strength expression'. Adapt to the actual body region (upper/lower/full body) of the session. Do NOT leave the original label and emphasis unchanged.",
    scopeGuidance: "Apply to all primary and secondary compound lifts in scope. Accessories can stay but reduce fluff.",
  },

  hypertrophy_focus: {
    intentFamily: "hypertrophy_focus",
    minimumStructuralChanges: 2,
    primaryChanges: [
      { type: "shift_rep_range_hypertrophy", description: "Shift to hypertrophy rep range (8-15)", countAs: 1 },
      { type: "add_isolation_work", description: "Add targeted isolation/accessory exercises", countAs: 1 },
      { type: "add_sets", description: "Add sets to accessory movements", countAs: 1 },
    ],
    secondaryChanges: [
      { type: "reduce_rest", description: "Moderate rest periods (60-90 sec on accessories)", countAs: 1 },
    ],
    antiPatterns: [
      "Do NOT keep low rep ranges (3-5) and claim it's hypertrophy",
      "Do NOT remove accessories — hypertrophy NEEDS more accessory volume",
      "Do NOT focus purely on explosive movements for hypertrophy",
    ],
    validationRules: [
      "Rep ranges MUST include 8-15 zone on primary and secondary lifts",
      "Accessory volume must increase or be maintained",
      "At least 2 structural changes required",
    ],
    aiDirective: "HYPERTROPHY FOCUS: Shift to 8-15 rep range on primary and secondary lifts. Add or maintain accessory volume. Add targeted isolation work (e.g. curls, lateral raises, leg curls, face pulls). Rest can be moderate (60-90 sec on accessories). Volume increases.\n\nIDENTITY UPDATE REQUIRED: You MUST also produce an update_session change that refreshes the session's `label` and `emphasis` to reflect its new hypertrophy identity. Example label: 'Upper Hypertrophy — Volume + Mechanical Tension'. Example emphasis: 'Isolation volume, metabolic stress, and progressive mechanical tension for muscle-building'. Adapt to the actual body region. Do NOT leave the original label and emphasis unchanged.",
    scopeGuidance: "Apply to primary, secondary, and accessory movements in scope.",
  },

  endurance_focus: {
    intentFamily: "endurance_focus",
    minimumStructuralChanges: 2,
    primaryChanges: [
      { type: "shift_rep_range_endurance", description: "Shift to higher rep ranges (12-20+) or time-based", countAs: 1 },
      { type: "reduce_rest", description: "Tighten rest periods (30-60 sec)", countAs: 1 },
      { type: "add_circuit_structure", description: "Add circuit or superset structure for density", countAs: 1 },
      { type: "add_conditioning_finisher", description: "Add an aerobic/conditioning finisher", countAs: 1 },
    ],
    secondaryChanges: [
      { type: "increase_density", description: "Increase training density across session", countAs: 1 },
    ],
    antiPatterns: [
      "Do NOT keep heavy 3-5 rep ranges and call it endurance",
      "Do NOT keep 3-minute rest periods and call it endurance",
      "Do NOT change only tempo notes without structural changes",
      "Do NOT just add a coaching note about 'staying aerobic'",
    ],
    validationRules: [
      "Rep ranges MUST shift (higher reps or time-based) OR rest MUST tighten significantly",
      "At least 2 structural changes required — cannot pass with only tempo notes",
      "Density must increase: less rest OR more reps OR circuit structure",
    ],
    aiDirective: "ENDURANCE FOCUS: Two or more structural changes required. Shift rep ranges to 12-20+ or make time-based. Tighten rest to 30-60 sec. Add a circuit or density block. Optionally add conditioning finisher. You CANNOT pass this with only a tempo change or coaching note.\n\nIDENTITY UPDATE REQUIRED: You MUST also produce an update_session change that refreshes the session's `label` and `emphasis` to reflect its new endurance identity. Example label: 'Lower Strength Endurance — Work Capacity'. Example emphasis: 'High-rep density, compressed rest intervals, and aerobic capacity integration across the session'. Adapt to the actual body region. Do NOT leave the original label and emphasis unchanged.",
    scopeGuidance: "Apply across the full scope. Reduce heavy strength emphasis proportionally.",
  },

  conditioning_focus: {
    intentFamily: "conditioning_focus",
    minimumStructuralChanges: 2,
    primaryChanges: [
      { type: "add_interval_block", description: "Add a structured interval or conditioning block", countAs: 2 },
      { type: "add_conditioning_finisher", description: "Add a cardio/conditioning finisher with defined work:rest ratios", countAs: 1 },
      { type: "add_circuit_structure", description: "Restructure accessories into conditioning circuits", countAs: 1 },
    ],
    secondaryChanges: [
      { type: "reduce_rest", description: "Tighten rest to support aerobic development", countAs: 1 },
    ],
    antiPatterns: [
      "Do NOT replace conditioning with resistance circuits and call it cardio",
      "Do NOT add conditioning without defining work:rest ratios",
      "Do NOT pretend a single finisher is conditioning programming",
    ],
    validationRules: [
      "A real conditioning block or interval block must be added",
      "Work:rest ratios should be defined",
      "At least 2 structural changes required",
    ],
    aiDirective: "CONDITIONING FOCUS: Add real conditioning work. Add a structured interval block (e.g. 5x200m at 85% / 90 sec rest, or 5 rounds 30 sec on/30 sec off) OR a conditioning finisher with defined work:rest. Define work:rest ratios explicitly. Pure resistance circuits alone are insufficient.\n\nIDENTITY UPDATE REQUIRED: You MUST also produce an update_session change that refreshes the session's `label` and `emphasis` to reflect its new conditioning identity. Example label: 'Full Body Conditioning — Metabolic Output'. Example emphasis: 'High-intensity interval conditioning, circuit density, and cardiovascular work capacity'. Adapt to the actual body region. Do NOT leave the original label and emphasis unchanged.",
    scopeGuidance: "Add conditioning to targeted sessions. If program-wide, add conditioning work proportionally across days.",
  },

  power_explosive_focus: {
    intentFamily: "power_explosive_focus",
    minimumStructuralChanges: 2,
    primaryChanges: [
      { type: "add_explosive_opener", description: "Add explosive movement at session start (jump, throw, power variation)", countAs: 1 },
      { type: "shift_rep_range_power", description: "Shift to power rep range (2-5 reps) with velocity intent", countAs: 1 },
      { type: "add_velocity_intent", description: "Add velocity/speed intent to primary movements", countAs: 1 },
      { type: "increase_rest", description: "Extend rest for CNS recovery (2-3 min between power sets)", countAs: 1 },
    ],
    secondaryChanges: [
      { type: "reduce_accessories", description: "Trim fatigue-heavy accessories to protect power quality", countAs: 1 },
    ],
    antiPatterns: [
      "Do NOT only add descriptive text about being 'explosive'",
      "Do NOT leave bodybuilding rep ranges (10-15) and call it power",
      "Do NOT skip the explosive opener and call it power training",
      "Do NOT add power work without extending rest for CNS recovery",
    ],
    validationRules: [
      "At least 1 explosive exercise addition (jumps, throws, power clean, sprint, med ball) AND at least 1 other structural change",
      "At least 2 structural changes total",
      "Text-only changes = invalid",
    ],
    aiDirective: "POWER/EXPLOSIVE FOCUS: Two or more structural changes required. Add an explosive opener (box jump, broad jump, med ball slam, power clean, sprint). Shift primary lifting to 2-5 reps with speed intent. Extend rest to 2-3 min. Trim fatigue-heavy accessories. You CANNOT pass with only coaching text.\n\nIDENTITY UPDATE REQUIRED: You MUST also produce an update_session change that refreshes the session's `label` and `emphasis` to reflect its new explosive/power identity. Example label: 'Lower Power — Explosive Output + Bar Speed'. Example emphasis: 'Horizontal power, elastic force expression, and high-velocity lower-body force development'. Adapt to the actual body region (use Upper, Lower, Full Body as appropriate). Do NOT leave the original label and emphasis unchanged.",
    scopeGuidance: "Add explosive work early in session (pre-fatigue). Apply to sessions with suitable compound movements.",
  },

  speed_focus: {
    intentFamily: "speed_focus",
    minimumStructuralChanges: 2,
    primaryChanges: [
      { type: "add_explosive_opener", description: "Add acceleration/sprint-based work at session start", countAs: 1 },
      { type: "reduce_accessories", description: "Reduce fatigue-heavy accessories to protect speed quality", countAs: 1 },
      { type: "shift_rep_range_power", description: "Shift to speed-support rep ranges (low reps, fast intent)", countAs: 1 },
    ],
    secondaryChanges: [
      { type: "add_velocity_intent", description: "Add velocity cues to primary lifts", countAs: 1 },
    ],
    antiPatterns: [
      "Do NOT add endurance-style work for a speed request",
      "Do NOT ignore fatigue management — speed quality degrades under high fatigue",
    ],
    validationRules: [
      "Sprint or acceleration work must be added OR speed-support training must be restructured",
      "At least 2 structural changes required",
    ],
    aiDirective: "SPEED FOCUS: Add acceleration or max velocity work at session start. Reduce fatigue-heavy accessories that compromise speed quality. Add speed-support lifting (low reps, explosive intent). Protect movement quality over volume.\n\nIDENTITY UPDATE REQUIRED: You MUST also produce an update_session change that refreshes the session's `label` and `emphasis` to reflect its new speed identity. Example label: 'Lower Speed + Power — Acceleration Development'. Example emphasis: 'Sprint mechanics, acceleration-deceleration quality, and velocity-support strength'. Adapt to the actual body region. Do NOT leave the original label and emphasis unchanged.",
    scopeGuidance: "Add speed work early in sessions. Protect from excessive fatigue.",
  },

  reactive_focus: {
    intentFamily: "reactive_focus",
    minimumStructuralChanges: 2,
    primaryChanges: [
      { type: "swap_to_reactive_drill", description: "Add or swap toward drills that train short contact time and stiffness (ankle pogo jumps, hurdle hops, reactive drop jumps, single-leg reactive hops)", countAs: 1 },
      { type: "add_reactive_emphasis", description: "Add cues to relevant exercises emphasizing minimal ground contact, stiff ankle/knee mechanics, and elastic rebound", countAs: 1 },
      { type: "add_explosive_opener", description: "Add low-amplitude reactive work early in session (ankle pogo, reactive hops) before fatigue accumulates", countAs: 1 },
    ],
    secondaryChanges: [
      { type: "add_velocity_intent", description: "Add speed/velocity cues to sprint-adjacent movements", countAs: 1 },
      { type: "reduce_accessories", description: "Trim high-fatigue accessories that compromise reactive CNS quality", countAs: 1 },
    ],
    antiPatterns: [
      "Do NOT reduce sets, rest, or total volume as the default response to reactive/stiffness commands",
      "Do NOT interpret 'contact time', 'ground contact', or 'stiffness' as a session duration or scheduling command",
      "Do NOT route reactive commands to SHORTEN_BLOCK, REDUCE_VOLUME, REDUCE_REST, or DeLoad transformations",
      "Do NOT add endurance-style circuit density that degrades reactive quality",
      "Do NOT shorten the block structure unless the user explicitly asks for a shorter session",
      "Do NOT confuse 'more spring / elastic' with 'more hypertrophy or volume'",
    ],
    validationRules: [
      "At least 1 reactive drill (pogo hop, hurdle hop, reactive drop jump, ankle stiffness drill, or equivalent) must be added or existing explosive work must be upgraded toward reactive/short-contact mechanics",
      "At least 1 coaching cue emphasizing short ground contact, stiff ankle/knee mechanics, or elastic rebound must be present",
      "Sets and rest must NOT decrease from baseline unless explicitly part of the reactive quality strategy",
    ],
    aiDirective: "REACTIVE / STIFFNESS FOCUS — GROUND CONTACT TIME OPTIMIZATION:\n\nThis is a PERFORMANCE QUALITY instruction, NOT a volume or duration reduction. Do NOT reduce sets, rest, or overall block length as a default action.\n\nRequired changes:\n1. DRILL SELECTION: Add or swap toward exercises that build reactive stiffness and short contact time: ankle pogo jumps, hurdle hops, reactive drop jumps, single-leg reactive hops, or band-resisted ankle stiffness drills. Replace any slow, amortization-heavy plyometrics (e.g., deep box jumps, slow depth drops) with quick, stiff-contact alternatives.\n2. COACHING EMPHASIS: Add cues to relevant exercises emphasizing 'minimal ground contact time', 'stiff ankle/knee on landing', 'think of the ground as hot', 'elastic rebound — not absorbed', 'short, sharp contacts'.\n3. STRUCTURE PRESERVATION: Preserve overall session structure, set counts, and rest periods. Only modify rest or sets if it directly serves reactive quality (e.g., longer rest between reactive sets to protect CNS quality).\n4. EXERCISE UPGRADE: Where appropriate, swap a slow-tempo accessory for a reactive alternative (e.g., slow calf raise → pogo jump progression; slow box step-up → reactive single-leg hop).\n\nIDENTITY UPDATE REQUIRED: You MUST produce an update_session change that refreshes the session label and emphasis. Example label: 'Lower Power — Reactive Stiffness + Ground Contact Optimization'. Example emphasis: 'Short contact mechanics, tendon stiffness, elastic force expression, and reactive lower-body development'. Adapt to the actual body region. Do NOT leave the original label and emphasis unchanged.",
    scopeGuidance: "Apply to sessions with lower-body or plyometric content. Add reactive drills early in session (pre-fatigue). Preserve primary lifting structure.",
  },

  cod_decel_focus: {
    intentFamily: "cod_decel_focus",
    minimumStructuralChanges: 2,
    primaryChanges: [
      { type: "add_decel_drill", description: "Add deceleration or COD drill (braking sprint, 505 drill, T-drill, controlled lateral cut, single-leg decel landing, plant-and-cut sequence)", countAs: 1 },
      { type: "swap_to_reactive_drill", description: "Swap existing sprint or plyo work toward COD-appropriate alternatives (reactive cone drill, lateral stop, mirror drill)", countAs: 1 },
      { type: "add_explosive_opener", description: "Add a COD warm-up primer post warm-up (short cone touches, mirror footwork, directional reaction drill)", countAs: 1 },
    ],
    secondaryChanges: [
      { type: "increase_rest", description: "Extend rest between COD efforts to preserve movement quality and decision speed", countAs: 1 },
      { type: "reduce_accessories", description: "Trim high-fatigue accessories that compromise COD sharpness", countAs: 1 },
    ],
    antiPatterns: [
      "Do NOT respond to a COD/decel request with barbell power lifting (power clean, trap bar jump) as the primary change",
      "Do NOT prescribe rep-range strength work as the primary response to a deceleration or change-of-direction request",
      "Do NOT confuse deceleration training with max-effort plyometric jumps — COD is about force absorption and re-direction, not peak vertical production",
      "Do NOT reduce session volume as the default response to a COD-improvement request",
      "Do NOT route COD requests to session_reduction or decrease_volume transformations",
    ],
    validationRules: [
      "At least 1 COD-specific drill must be added or upgraded (T-drill, L-drill, 505, braking sprint, single-leg decel landing, controlled cut, mirror drill)",
      "At least 2 structural changes total required",
      "Changes must address deceleration mechanics, directional change, or force absorption — not just general explosiveness",
    ],
    aiDirective: "COD / DECELERATION FOCUS: This is a change-of-direction and braking mechanics request — NOT a general explosiveness or power request.\n\nRequired changes:\n1. DRILL SELECTION: Add or swap toward COD-specific drills: T-drill, L-drill, 505 drill, 5-10-5, braking sprints, single-leg decel landing, controlled lateral cuts, plant-and-cut sequences, or mirror drills. These train force absorption, penultimate step mechanics, and re-acceleration from a stop.\n2. STRUCTURE: Place COD work early in session (post warm-up, before fatigue accumulates). Prescribe full recovery between efforts — quality over quantity.\n3. COACHING CUES: Add cues for 'low center of gravity on decel', 'hip sink to absorb braking force', 'stiff ankle on re-direction', 'penultimate step loading', 'eyes up on the cut', 'drive through the ground on re-acceleration'.\n4. REST: Extend rest between COD reps (30–90s depending on drill intensity) to preserve decision-making speed and movement quality.\n\nIDENTITY UPDATE REQUIRED: Produce an update_session change. Example label: 'Speed + COD — Deceleration Mechanics'. Example emphasis: 'Change of direction quality, braking force absorption, and re-acceleration from deceleration positions'.",
    scopeGuidance: "Apply to sessions with speed or agility content. Place COD work post warm-up, before heavy conditioning. Preserve existing sprint and plyometric structure.",
  },

  footwork_rhythm_focus: {
    intentFamily: "footwork_rhythm_focus",
    minimumStructuralChanges: 1,
    primaryChanges: [
      { type: "add_footwork_drill", description: "Add ladder, footwork, or rhythm drills (speed ladder patterns, Ickey shuffle, in-and-out, lateral shuffle, cone touches, shadow footwork, mirror drill)", countAs: 1 },
      { type: "add_explosive_opener", description: "Add a footwork primer at session start as a coordination warm-up (low-CNS ladder or footwork pattern)", countAs: 1 },
    ],
    secondaryChanges: [
      { type: "add_reactive_emphasis", description: "Add foot contact quality cues to existing speed or plyometric work", countAs: 1 },
      { type: "reduce_accessories", description: "Reduce heavy accessories if footwork quality is the primary goal and session is already full", countAs: 1 },
    ],
    antiPatterns: [
      "Do NOT respond to footwork/rhythm requests with barbell strength work",
      "Do NOT respond with long sprint-distance work (30m, 40m sprints) for a footwork/coordination request",
      "Do NOT confuse footwork with plyometric power — footwork is about rhythm, timing, and coordination, not peak force production",
      "Do NOT reduce session volume as the default response to a footwork-improvement request",
      "Do NOT route footwork requests to speed_focus sprint bundles",
    ],
    validationRules: [
      "At least 1 footwork or rhythm drill must be structurally added (ladder pattern, shuffle, box drill, mirror drill, or equivalent)",
      "Drills must target foot contact quality, coordination, or timing — not maximal speed or power output",
    ],
    aiDirective: "FOOTWORK / RHYTHM FOCUS: This is a coordination, timing, and foot contact quality request — NOT a max-speed sprint request.\n\nRequired changes:\n1. DRILL SELECTION: Add speed ladder patterns (in-out, Ickey shuffle, lateral, 2-in-1-out), cone touches, shadow footwork, box drill, lateral shuffle, or mirror drills. Volume is LOW — 3–5 sets of 10–20 seconds at high coordination effort.\n2. PLACEMENT: Add footwork as a warm-up block before primary speed work, or as a standalone early-session block.\n3. COACHING CUES: 'Light on the feet', 'precise foot placement', 'stay on the balls of your feet', 'maintain upright posture through the pattern', 'rhythm over raw speed'.\n4. REST: 30–60s between footwork sets (lower CNS demand than sprints or COD drills).\n\nIDENTITY UPDATE REQUIRED: Produce an update_session change. Example label: 'Speed + Footwork — Rhythm and Coordination'. Example emphasis: 'Foot contact quality, neuromuscular timing, and coordination speed under speed demands'.",
    scopeGuidance: "Add footwork drills to the beginning of speed sessions or as a dedicated coordination block. Preserve all existing primary sprint and COD work.",
  },

  athletic_performance_focus: {
    intentFamily: "athletic_performance_focus",
    minimumStructuralChanges: 2,
    primaryChanges: [
      { type: "add_explosive_opener", description: "Add explosive opener (jump, throw, sprint drill)", countAs: 1 },
      { type: "add_conditioning_finisher", description: "Add conditioning support work", countAs: 1 },
      { type: "shift_to_compound_emphasis", description: "Prioritize multi-joint, athletic compound movements", countAs: 1 },
    ],
    secondaryChanges: [
      { type: "add_isolation_work", description: "Add unilateral/trunk/coordination work for sport transfer", countAs: 1 },
    ],
    antiPatterns: [
      "Do NOT produce generic bodybuilding structure for an athletic request",
      "Do NOT skip explosive work for an 'athletic' request",
      "Do NOT ignore conditioning if sport performance is the goal",
    ],
    validationRules: [
      "Explosive OR speed-support work must be added",
      "Conditioning support must be present or added",
      "At least 2 structural changes required",
    ],
    aiDirective: "ATHLETIC PERFORMANCE FOCUS: Blend explosive, conditioning, trunk/resilience, and compound movement quality. Add explosive opener. Add conditioning support. Prioritize multi-joint movements with athletic carryover. Avoid generic bodybuilding structure.\n\nIDENTITY UPDATE REQUIRED: You MUST also produce an update_session change that refreshes the session's `label` and `emphasis` to reflect its new athletic identity. Example label: 'Full Body Athletic — Power + Conditioning'. Example emphasis: 'Explosive movement quality, multi-directional athleticism, and sport-transfer conditioning'. Adapt to the actual body region and sport context. Do NOT leave the original label and emphasis unchanged.",
    scopeGuidance: "Apply across program or targeted sessions. Maintain sport-relevant balance.",
  },

  fatigue_management: {
    intentFamily: "fatigue_management",
    minimumStructuralChanges: 1,
    primaryChanges: [
      { type: "remove_exercise", description: "Remove lowest-priority fatigue sources", countAs: 1 },
      { type: "remove_sets", description: "Reduce set counts on accessories", countAs: 1 },
      { type: "reduce_density", description: "Remove density work (circuits, supersets)", countAs: 1 },
      { type: "increase_rest", description: "Extend rest to reduce density", countAs: 1 },
    ],
    secondaryChanges: [
      { type: "reduce_accessories", description: "Cut accessory count", countAs: 1 },
    ],
    antiPatterns: [
      "Do NOT only add recovery notes without reducing actual workload",
      "Do NOT preserve exact same volume and call it fatigue management",
    ],
    validationRules: [
      "At least 1 actual workload or fatigue reduction — set removed, exercise removed, or density reduced",
      "Workload must demonstrably decrease",
    ],
    aiDirective: "FATIGUE MANAGEMENT: Reduce actual workload. Remove 1-2 lowest-priority accessories. Remove 1 set from secondary lifts. Reduce density. Preserve primary compound movements. Workload MUST decrease — do not just add coaching notes.\n\nIDENTITY UPDATE REQUIRED: You MUST also produce an update_session change that refreshes the session's `label` and `emphasis` to reflect reduced-volume intent. Example label: 'Lower Strength — Reduced Volume / Fatigue Management'. Example emphasis: 'Preserved compound strength with reduced accessory load and extended recovery windows'. Adapt to the actual body region. Do NOT leave the original label and emphasis unchanged.",
    scopeGuidance: "Apply to full scope. Preserve primary movement patterns while reducing cumulative fatigue.",
  },

  recovery_focus: {
    intentFamily: "recovery_focus",
    minimumStructuralChanges: 1,
    primaryChanges: [
      { type: "remove_exercise", description: "Remove high-intensity work", countAs: 1 },
      { type: "remove_sets", description: "Reduce volume across the board", countAs: 1 },
      { type: "add_mobility_work", description: "Add low-intensity movement support work", countAs: 1 },
      { type: "add_prep_block", description: "Add restoration/movement quality work", countAs: 1 },
    ],
    secondaryChanges: [
      { type: "increase_rest", description: "Extend rest to reduce intensity demands", countAs: 1 },
    ],
    antiPatterns: [
      "Do NOT keep the same intensity and call it recovery",
      "Do NOT add high-intensity work to a recovery session",
      "MOBILITY MODE GUARD: Do NOT remove exercises from a Mobility program as the default response to 'more restorative' — Mobility sessions are already low-load. In a Mobility context, 'more restorative' means longer holds, slower pacing, breathing integration, and yin-style work — NOT cutting exercises from a flow that may already be 30–45 minutes",
      "MOBILITY MODE GUARD: Do NOT apply volume reduction (remove_exercise, remove_sets) to a program that is already a mobility/restoration session — reduce intensity and pace instead, not structural content",
    ],
    validationRules: [
      "Intensity or volume must decrease",
      "At least 1 real workload reduction or recovery addition",
    ],
    aiDirective: "RECOVERY FOCUS: Reduce intensity and volume. Add low-intensity movement or restoration work. If a recovery day, convert to movement quality / mobility focus. Preserve basic movement patterns at very low intensity.\n\nMOBILITY MODE NOTE: If the active program is a Mobility program, 'more restorative' does NOT mean removing exercises. Instead: extend hold durations, reduce contraction demands (PAILs % down), shift toward parasympathetic holds and breathing integration, add recovery-flow style work (yin holds, breathing sequences). The session stays intact — it becomes softer and slower, not shorter.\n\nIDENTITY UPDATE REQUIRED: You MUST also produce an update_session change that refreshes the session's `label` and `emphasis` to reflect its new recovery identity. Example label: 'Active Recovery — Movement Quality'. Example emphasis: 'Low-intensity tissue restoration, mobility work, and CNS readiness preparation'. Adapt to the actual body region. Do NOT leave the original label and emphasis unchanged.",
    scopeGuidance: "Apply to the targeted session(s). Do not compromise performance sessions.",
  },

  mobility_support: {
    intentFamily: "mobility_support",
    minimumStructuralChanges: 1,
    primaryChanges: [
      { type: "add_prep_block", description: "Add structured warm-up/activation block", countAs: 1 },
      { type: "add_mobility_work", description: "Add targeted mobility work by region", countAs: 1 },
    ],
    secondaryChanges: [
      { type: "add_exercise", description: "Add relevant mobility/activation exercises", countAs: 1 },
    ],
    antiPatterns: [
      "Do NOT just add a coaching note to 'stretch more'",
      "Do NOT add random mobility exercises without targeting a specific region",
    ],
    validationRules: [
      "At least 1 mobility, activation, or prep exercise must be added structurally",
    ],
    aiDirective: "MOBILITY SUPPORT: Add structured mobility/activation work. Identify the target region (hips, thoracic, ankles, shoulders) and add appropriate exercises. Add a proper warm-up block or cool-down if missing. Exercises must appear in the program — coaching notes alone are insufficient.",
    scopeGuidance: "Add to the beginning (prep/activation) or end (cooldown) of targeted sessions.",
  },

  rom_restoration_focus: {
    intentFamily: "rom_restoration_focus",
    minimumStructuralChanges: 1,
    primaryChanges: [
      { type: "add_rom_holds", description: "Add passive range restoration holds (2–5 min per position) targeting the specified joint or region", countAs: 1 },
      { type: "add_mobility_work", description: "Add CARs (controlled articular rotations) for the target joint — 3–5 slow reps per direction — as both diagnostic and training tool", countAs: 1 },
      { type: "replace_exercise", description: "Swap appropriate exercises toward longer-hold passive or active range work for the target region", countAs: 1 },
    ],
    secondaryChanges: [
      { type: "add_prep_block", description: "Add a structured joint-specific range restoration block", countAs: 1 },
      { type: "add_tolerance_work", description: "Add PNF contract-relax sequences to accelerate passive range gains", countAs: 1 },
    ],
    antiPatterns: [
      "Do NOT remove exercises from the session as the default response to a range-of-motion request — ADD appropriate ROM work",
      "Do NOT reduce volume or total session content — ROM restoration requires targeted additions, not less work",
      "Do NOT add generic unspecified stretches without targeting the stated joint region",
      "Do NOT add strength-biased loading (sets/reps/load) as the primary response to a range or opening request",
      "Do NOT confuse ROM restoration with joint-friendly modification — this is about gaining range, not reducing load",
    ],
    validationRules: [
      "At least 1 passive or active range exercise must be structurally added (hip CARs, 90/90 holds, PNF stretches, thoracic extensions, ankle distraction, pigeon stretch, sleeper stretch, etc.)",
      "Added exercises must target the specified body region or default to hips/thoracic if region is unspecified",
      "Coaching notes alone are insufficient — exercises must appear structurally in the program",
    ],
    aiDirective: "ROM / RANGE RESTORATION FOCUS: The user wants to restore or improve range of motion at a specific joint or generally.\n\nRequired changes:\n1. JOINT IDENTIFICATION: Identify the target region from context (hips, shoulders, thoracic, ankles, etc.). If 'open up' or 'loosen up' with no specifics, default to hip mobility as the most common unaddressed restriction.\n2. EXERCISE SELECTION: Add passive range restoration holds (2–5 min per position), CARs (3–5 slow controlled articular rotations), and/or PNF contract-relax (10s contract at 30% effort → deep exhale release, repeat 3–5x).\n   Hip examples: 90/90 hip stretch, pigeon pose, frog stretch, hip CARs, hip PAILs/RAILs, couch stretch.\n   Shoulder examples: sleeper stretch, wall slides, shoulder CARs, banded distraction, doorway chest stretch.\n   Thoracic examples: thoracic foam roll extension, open book stretch, thoracic CARs, quadruped T-spine rotation.\n   Ankle examples: ankle CAR, banded ankle distraction, wall ankle stretch, heel drop stretch.\n3. STRUCTURE: Add as a dedicated restoration block (5–15 min) at the start of session or as a standalone mobility day.\n4. PROGRESSION PRINCIPLE: Passive range first (long holds, relaxed), then active control (CARs, light end-range contraction) once passive range is accessible — never train control beyond available range.\n\nIDENTITY UPDATE REQUIRED: Produce an update_session change. Example label: 'Hip Mobility — Range Restoration'. Example emphasis: 'Passive joint range restoration, capsule work, and progressive ROM development through targeted holds and CARs'.",
    scopeGuidance: "Add to the beginning of relevant sessions as a priority restoration block. Do not remove existing work — this is additive. If standalone mobility session, build the session around ROM restoration.",
  },

  tissue_stiffness_focus: {
    intentFamily: "tissue_stiffness_focus",
    minimumStructuralChanges: 1,
    primaryChanges: [
      { type: "add_tissue_release", description: "Add tissue preparation work (foam rolling protocol, lacrosse ball work, or loaded stretching) targeting the identified chronic stiffness regions", countAs: 1 },
      { type: "add_prep_block", description: "Add a systematic tissue prep / stiffness reduction block at session start", countAs: 1 },
      { type: "add_mobility_work", description: "Add contract-relax (PNF) or dynamic mobility sequences to address the identified stiffness pattern", countAs: 1 },
    ],
    secondaryChanges: [
      { type: "add_rom_holds", description: "Add sustained passive holds (2–3 min) to the stiff region after tissue prep to lock in new length", countAs: 1 },
    ],
    antiPatterns: [
      "Do NOT remove exercises as the default response to a stiffness complaint — ADD tissue prep and release work",
      "Do NOT confuse tissue stiffness with injury modification — stiffness without reported pain means add targeted prep, not remove load",
      "Do NOT add generic stretches without addressing the identified stiff region specifically",
      "Do NOT reduce total session volume as the default response — stiffness reduction requires progressive targeted loading, not deloading",
    ],
    validationRules: [
      "At least 1 tissue prep or release exercise must be structurally added (foam rolling protocol, lacrosse ball work, loaded stretching, or PNF contract-relax sequence)",
      "Work must target the specified or inferred stiff region",
    ],
    aiDirective: "TISSUE STIFFNESS FOCUS: The user is experiencing chronic tightness or stiffness and wants targeted relief — this is NOT a volume reduction request.\n\nRequired changes:\n1. REGION IDENTIFICATION: Identify the stiff area from context (hips, thoracic, quads, hamstrings, calves, etc.). If general, prioritize hip flexors and thoracic spine.\n2. TISSUE PREP SEQUENCE: Add foam rolling or lacrosse ball protocol (60–90s per site, 2–3 sites). Add loaded stretching (weighted holds at comfortable end-range: 1–2 min per position). Add contract-relax sequences (10s isometric contraction at 30% → full exhale release, repeat 3–5x).\n3. STRUCTURE: Place tissue prep at session start (5–10 min) as its own block before active mobility work.\n4. PROGRESSION PRINCIPLE: Acute tissue prep reduces session stiffness; consistent loaded stretching changes chronic tissue state. Frame as a multi-session protocol — results build over weeks.\n\nIDENTITY UPDATE REQUIRED: Produce an update_session change. Example label: 'Mobility — Tissue Stiffness Reduction'. Example emphasis: 'Systematic tissue prep, loaded stretching, and contract-relax sequences targeting chronic stiffness patterns'.",
    scopeGuidance: "Add tissue prep to the beginning of all relevant sessions. If a standalone mobility session, build around stiffness reduction sequencing (tissue prep → passive holds → active control).",
  },

  tendon_resilience_focus: {
    intentFamily: "tendon_resilience_focus",
    minimumStructuralChanges: 1,
    primaryChanges: [
      { type: "add_tendon_prep", description: "Add tendon-specific preparation and progressive loading work (isometric holds 30–45s, slow eccentrics 4–6s lowering, submaximal tempo contacts) targeting the identified tendon or highest-demand regional movement", countAs: 1 },
      { type: "replace_exercise", description: "Swap tendon-aggravating exercises (high-volume plyometrics, aggressive reactive contacts, depth jumps, high-frequency bouncing) with tendon-friendlier alternatives (slow eccentrics, isometric pauses, lower contact-frequency reactive work)", countAs: 1 },
    ],
    secondaryChanges: [
      { type: "reduce_density", description: "Reduce contact-intensive volume or reactive drill density to lower cumulative tendon stress without eliminating all tendon-loading", countAs: 1 },
      { type: "add_prep_block", description: "Add a structured tendon warm-up block (isometrics, slow tempo movements) before the session's highest-demand work", countAs: 1 },
    ],
    antiPatterns: [
      "Do NOT default to injury_modification (remove exercises, work around pain) — tendon resilience requests do NOT imply pain or injury; they are load management requests",
      "Do NOT remove all plyometric or reactive content by default — reduce volume and contact frequency first, then rebuild progressively; maintain some tendon-loading stimulus",
      "Do NOT apply generic joint_friendly modifications (lower-impact exercises) as the primary response — tendon resilience is about load management and progressive conditioning, not joint protection from impact",
      "Do NOT add coaching notes alone — structural changes to exercise selection or loading parameters are required",
      "Do NOT reduce session identity or the day's training theme — preserve the session character while managing tendon load",
    ],
    validationRules: [
      "At least 1 exercise substitution, contact reduction, or structured tendon prep addition is required",
      "Changes must specifically address tendon load or tendon-aggravating movement patterns — not generic difficulty reduction",
      "Session identity must be preserved — this is load management, not injury accommodation",
    ],
    aiDirective: "TENDON RESILIENCE FOCUS: The user wants to protect tendon health or reduce tendon stress — this is a LOAD MANAGEMENT request, NOT an injury modification.\n\nRequired changes:\n1. TENDON IDENTIFICATION: Identify the target tendon from context (Achilles = calf/ankle work, patellar = knee extension loading, proximal hamstring = hip hinge loading, elbow = pressing/gripping). If unspecified, assess the session's highest-demand movements.\n2. LOAD MANAGEMENT: Replace or reduce high-tendon-stress exercises (reactive contacts, high-frequency plyometrics, depth jumps) with tendon-friendlier alternatives:\n   • Slow eccentrics: 4–6s lowering phase (e.g., slow eccentric calf raise, slow eccentric hamstring curl)\n   • Isometric holds: 30–45s at comfortable tension (e.g., isometric calf holds in plantarflexion, isometric wall sit for patellar)\n   • Lower contact frequency: reduce jumps/bounds per set, increase rest between contacts\n3. TENDON PREP BLOCK: Add a brief isometric tendon warm-up (2–3 sets × 30–45s) before the session's highest-demand work — this primes the tendon for load without aggravating it.\n4. PROGRESSIVE PRINCIPLE: Tendons adapt to load progressively — the goal is to maintain training stimulus while reducing rate and magnitude of load. Do NOT eliminate all tendon-loading; reduce and rebuild.\n\nIDENTITY UPDATE REQUIRED: Produce an update_session change. Example label: 'Speed Training — Tendon-Resilient Build'. Example emphasis: 'Progressive speed development with managed tendon load through eccentric control, isometric preparation, and reduced contact frequency'.",
    scopeGuidance: "Apply to sessions with the highest tendon-stress exercises. Preserve overall training identity and volume where possible.",
  },

  end_range_control_focus: {
    intentFamily: "end_range_control_focus",
    minimumStructuralChanges: 1,
    primaryChanges: [
      { type: "add_end_range_strength", description: "Add active end-range isometric strength work: PAILs (Progressive Angular Isometric Loading — contract INTO the stretch at 20-100% effort) and RAILs (Regressive Angular Isometric Loading — contract AWAY from the stretch at max effort) at the identified joint/position", countAs: 1 },
      { type: "replace_exercise", description: "Swap passive-only stretching or generic ROM holds toward active end-range loading exercises (loaded end-range holds with active muscular engagement, positional isometrics, FRC-style active CARs)", countAs: 1 },
    ],
    secondaryChanges: [
      { type: "add_mobility_work", description: "Add controlled articular rotations (CARs) at the target joint — 3–5 slow reps maximizing active range expression with muscular engagement throughout the arc — to develop active range ownership before loading end-range positions", countAs: 1 },
      { type: "add_tolerance_work", description: "Add progressive isometric holds at end-range with increasing duration or increasing force output over sessions", countAs: 1 },
    ],
    antiPatterns: [
      "Do NOT collapse into rom_restoration_focus — ROM restoration is about gaining passive range; end-range control is about strengthening and actively owning the range you already have — they are distinct goals",
      "Do NOT add more passive holds or long static stretching as the primary response — this request is explicitly about ACTIVE CONTRACTION and isometric strength at end range",
      "Do NOT add generic mobility or flexibility work without emphasizing the active contraction and positional ownership component",
      "Do NOT ignore the active strength element — PAILs/RAILs require genuine muscular contraction, not passive position-holding",
      "Do NOT confuse PAILs/RAILs with PNF contract-relax — they are different: PAILs/RAILs are isometric holds at end range for strength development, not neurological inhibition for range gains",
    ],
    validationRules: [
      "At least 1 active end-range strength exercise must be structurally added (PAILs, RAILs, end-range isometric hold with engagement, loaded end-range position)",
      "Added work must include an active muscular contraction component — passive holds alone are insufficient",
      "Target region must be specified — do not add generic unlabeled 'end-range work'",
    ],
    aiDirective: "END-RANGE CONTROL FOCUS: The user wants to develop strength and active control at the end of their range of motion — this is ACTIVE END-RANGE STRENGTH TRAINING, NOT passive stretching or ROM restoration.\n\nRequired changes:\n1. POSITION IDENTIFICATION: Identify the target joint/position from context (hips at 90/90 end range, shoulder in full overhead position, ankle at max dorsiflexion, etc.).\n2. PAILs / RAILs PROTOCOL (primary):\n   • Enter passive end-range position → hold passively for 1–2 min (accumulate range)\n   • PAILs: gradually contract the muscles that would take you FURTHER into the stretch (push INTO the floor/resistance) — start at 20% effort, build to 100% over 20s\n   • RAILs: contract the muscles that pull the joint OUT of the stretch (lift/pull AWAY from the end position) — max effort for 20s\n   • Rest → repeat 2–3 rounds\n3. ACTIVE CARs: Add controlled articular rotations — 3–5 slow reps at the target joint, actively expressing maximum range in every direction. These prepare the nervous system for end-range loading.\n4. LOADED END-RANGE HOLDS: If PAILs/RAILs are unfamiliar, use loaded end-range isometrics: hold a position at full end-range with active muscular engagement (not passive sink) for 30–60s with light resistance (band, weight).\n\nIDENTITY UPDATE REQUIRED: Produce an update_session change. Example label: 'Mobility — End-Range Strength & Control'. Example emphasis: 'Active positional ownership through PAILs/RAILs protocols and end-range isometric loading at target joints'.",
    scopeGuidance: "Add as a focused 10–20 minute block within or following passive mobility work. Passive range first to access the position, then active contraction to own it.",
  },

  mobility_flow_focus: {
    intentFamily: "mobility_flow_focus",
    minimumStructuralChanges: 1,
    primaryChanges: [
      { type: "add_flow_sequence", description: "Add or design a continuous linked mobility sequence (e.g., ground-based flow: lying → seated → kneeling → standing; hip flow: pigeon → frog → deep squat → active hip CAR; spinal wave: floor through spinal articulation to standing; beast-to-crab flow integrating spine, hips, and shoulders)", countAs: 1 },
      { type: "replace_exercise", description: "Replace segmented isolated stretches with multi-joint continuous movement sequences that link postures through active transitions (e.g., from pigeon → rotate into thread-the-needle → seated twist → roll to standing)", countAs: 1 },
    ],
    secondaryChanges: [
      { type: "update_session_emphasis", description: "Update session structure from isolated-hold format to flowing-sequence format: reduce instruction density between exercises, cue breath-guided transitions, reduce hold durations slightly and increase transition repetitions", countAs: 1 },
      { type: "add_mobility_work", description: "Add connective flow exercises that link the session's key movement themes into a continuous practice", countAs: 1 },
    ],
    antiPatterns: [
      "Do NOT default to recovery_focus or restorative logic — mobility flow is about connected movement sequences, NOT lower intensity or deloading",
      "Do NOT collapse into generic mobility_support (add mobility exercises) — mobility flow is about the STRUCTURE and CONTINUITY of movement, not simply adding more mobility work",
      "Do NOT add isolated single-joint stretches as the primary response — the request is specifically about CONTINUOUS, LINKED, multi-joint sequences",
      "Do NOT reduce total session content — this is a structural reorganization toward flow, not simplification or volume reduction",
      "Do NOT add coaching notes about 'flowing between exercises' without actually restructuring the exercise sequence to be physically linked",
    ],
    validationRules: [
      "At least 1 continuous multi-joint movement sequence must be structurally added or created from existing exercises",
      "Transitions between movements must be described as active and connected — not 'rest, then move to next station'",
      "Session emphasis must be updated to reflect the linked/continuous character of the updated work",
    ],
    aiDirective: "MOBILITY FLOW FOCUS: The user wants connected, continuous mobility sequences rather than segmented isolated exercises — this is a STRUCTURAL REORGANIZATION request.\n\nRequired changes:\n1. SEQUENCE DESIGN: Identify 3–6 existing or new exercises that can be linked into a continuous ground-based or standing flow. Common flow structures:\n   • Ground flow: lying → supine twist → seated → kneeling → standing (breath-guided transitions)\n   • Hip flow: pigeon → frog → deep squat → hip CAR → lateral lunge → reverse lunge\n   • Spinal wave: floor press-up → child's pose → cat-cow → beast → kneeling → standing\n   • Shoulder/upper body flow: thread-the-needle → open book → quadruped reach → downward dog → arm circles\n2. TRANSITION DESIGN: Each exercise should EXIT into the next through an active transition — not 'stand up and walk to next station'. Describe the transition explicitly.\n3. BREATH INTEGRATION: Cue breath-guided pacing — inhale to open/prepare, exhale to deepen/transition. This is what gives mobility flow its 'flow' quality.\n4. RESTRUCTURE FORMAT: Reorganize the session exercises into a flowing sequence. Reduce hold durations to 30–45s per position (vs 2–5 min isolated holds). Increase transition repetitions. Remove stopping points between exercises.\n\nIDENTITY UPDATE REQUIRED: Produce an update_session change. Example label: 'Mobility Flow — Integrated Movement Sequence'. Example emphasis: 'Continuous linked multi-joint movement flow with active transitions and breath-guided pacing'.",
    scopeGuidance: "Restructure the target session(s) from isolated-exercise format into a continuous flowing sequence. Can be applied to the full session or to a major block within it.",
  },

  unilateral_emphasis: {
    intentFamily: "unilateral_emphasis",
    minimumStructuralChanges: 1,
    primaryChanges: [
      { type: "add_unilateral_work", description: "Add or substitute toward unilateral lower body and/or upper body exercises appropriate to the session's movement theme: single-leg deadlifts, Bulgarian split squats, reverse lunges, single-arm rows, single-arm press variations", countAs: 1 },
      { type: "replace_exercise", description: "Replace bilateral exercises with unilateral alternatives that preserve the movement pattern and intent: barbell squat → Bulgarian split squat or barbell reverse lunge; barbell RDL → single-leg RDL or B-stance RDL; two-arm cable row → single-arm cable row", countAs: 1 },
    ],
    secondaryChanges: [
      { type: "add_accessories", description: "Add targeted unilateral accessory work addressing lateral stability, single-leg hip strength, or unilateral loading asymmetries (Copenhagen plank, single-leg hip thrust, lateral step-up, single-arm carry)", countAs: 1 },
      { type: "update_session_emphasis", description: "Update session label/emphasis to reflect unilateral bias", countAs: 0 },
    ],
    antiPatterns: [
      "Do NOT remove all bilateral exercises — preserve at least one bilateral anchor per session to maintain absolute load expression and inter-limb coordination (often the main lift stays bilateral; accessories shift unilateral)",
      "Do NOT collapse into generic exercise_swap or exercise variation — this is a SYSTEMATIC BIAS SHIFT across the session, not a one-off swap",
      "Do NOT add generic 'single-leg work' without identifying which movement pattern to shift (lower push: squat; lower pull: hinge; upper push: press; upper pull: row)",
      "Do NOT reduce total training volume — replace bilateral work with unilateral at equivalent total load (both legs/arms combined)",
      "Do NOT treat unilateral exercises as light accessory filler — load them appropriately (typically 50–60% per limb for lower, higher for upper)",
    ],
    validationRules: [
      "At least 1 bilateral exercise replaced or supplemented with a unilateral alternative",
      "Replacement must preserve the movement pattern intent (squat pattern stays squat pattern, hinge stays hinge, row stays row)",
      "At least 1 bilateral anchor must remain in the session",
    ],
    aiDirective: "UNILATERAL EMPHASIS: The user wants to shift training bias toward single-limb work — this is a SYSTEMATIC PROGRAMMING BIAS SHIFT, not a one-off exercise swap.\n\nRequired changes:\n1. PATTERN IDENTIFICATION: Identify the session's primary movement patterns (lower push: squat; lower pull: hinge; upper push: press; upper pull: row/pull). Apply unilateral bias to 2–3 patterns per session.\n2. SUBSTITUTION LOGIC — Match the movement pattern:\n   • Lower push: Barbell Back Squat → Bulgarian Split Squat, Barbell Reverse Lunge, or Barbell Step-Up\n   • Lower pull: Barbell RDL → Single-Leg RDL (bilateral loading), B-Stance RDL (asymmetric loading)\n   • Upper push: Barbell Bench → Single-Arm DB Press, or keep bilateral bench and shift accessories\n   • Upper pull: Two-Arm Cable Row → Single-Arm Cable Row; Lat Pulldown → Single-Arm Lat Pulldown\n3. BILATERAL ANCHOR RULE: Keep at least one bilateral exercise (often the session's primary lift) to preserve absolute load expression and prevent inter-limb coordination loss. The anchor stays; the accessory tier shifts unilateral.\n4. LOADING PRINCIPLE: Unilateral lower body loads at 50–60% of bilateral load per limb. Upper body unilateral loads at higher fraction. Do not default to bodyweight or underpowered alternatives.\n\nIDENTITY UPDATE REQUIRED: Produce an update_session change. Example label: 'Strength — Unilateral Emphasis Block'. Example emphasis: 'Single-limb loading bias for asymmetry correction, lateral stability development, and sport-specific unilateral strength'.",
    scopeGuidance: "Apply to targeted sessions. If program-wide, shift the accessory tier first across all days. If a single session, shift 1–2 main movements and all accessories toward unilateral.",
  },

  posterior_chain_emphasis: {
    intentFamily: "posterior_chain_emphasis",
    minimumStructuralChanges: 1,
    primaryChanges: [
      { type: "add_posterior_chain", description: "Add or bias toward posterior chain exercises (Romanian deadlifts, single-leg RDL, hip thrusts, barbell glute bridges, GHD work, Nordic hamstring curls, back extensions, cable pull-throughs, glute-ham raises)", countAs: 1 },
      { type: "replace_exercise", description: "Replace anterior-chain dominant exercises (quad-dominant squats, leg press, leg extension, knee flexion accessories) with posterior-chain alternatives (hip hinge patterns, glute/hamstring emphasis exercises)", countAs: 1 },
    ],
    secondaryChanges: [
      { type: "add_accessories", description: "Add targeted glute/hamstring accessory work (hip thrusts, glute bridges, Nordic curls, hamstring curls, face pulls, cable pull-throughs, banded clamshells) as posterior chain supplementation", countAs: 1 },
      { type: "update_session_emphasis", description: "Update session emphasis to reflect posterior chain / hinge-dominant bias", countAs: 0 },
    ],
    antiPatterns: [
      "Do NOT remove all anterior chain or quad work — shift emphasis, not eliminate; a posterior chain bias session still has some knee-dominant work for balance",
      "Do NOT collapse into generic hypertrophy_focus — posterior chain emphasis is about the hinge/glute/hamstring movement cluster specifically, not general muscle building",
      "Do NOT collapse into generic 'more pulling' if the context is lower posterior chain — upper back pulling (rows, pull-ups) is NOT the primary target unless explicitly requested",
      "Do NOT add only bodyweight glute bridges if the session already has heavy loaded exercises — match the loading context and intensity level",
      "Do NOT reduce session identity to generic back work — maintain movement pattern diversity while shifting emphasis",
    ],
    validationRules: [
      "At least 1 posterior chain exercise (hip hinge, glute, or hamstring pattern) must be structurally added or substituted",
      "Changes must specifically target the hip hinge, glute, or hamstring movement pattern — not upper back pulling only",
      "Session identity (the day's primary training focus) must be preserved",
    ],
    aiDirective: "POSTERIOR CHAIN EMPHASIS: The user wants to shift training bias toward the posterior chain — this means HINGE, GLUTE, and HAMSTRING dominant work, NOT generic upper body pulling.\n\nRequired changes:\n1. PATTERN PRIORITIZATION: Assess the current movement balance. Identify what is most underrepresented in the posterior chain: hip hinge loading, glute isolation, or hamstring volume.\n2. EXERCISE ADDITIONS by pattern:\n   Hip hinge: Romanian deadlift (RDL), single-leg RDL, stiff-leg deadlift, good morning, cable pull-through, hex bar deadlift.\n   Glute dominant: barbell hip thrust, banded hip thrust, glute bridge, 45-degree back extension (rounded back), hip abduction.\n   Hamstring: Nordic hamstring curl, lying/seated leg curl, GHD hamstring curl, hamstring walkout, Swiss ball leg curl.\n3. SUBSTITUTIONS: Swap quad-dominant accessories (leg press, leg extension, goblet squat accessories) with hip/hamstring alternatives where logical.\n4. UPPER BODY PULLING (if 'more pulling' language used): Add rowing variations as upper posterior chain complement (cable row, DB row, Pendlay row, face pull) — but do not let upper pulling dominate if the request context is lower posterior chain emphasis.\n\nIDENTITY UPDATE REQUIRED: Produce an update_session change. Example label: 'Strength — Posterior Chain Emphasis'. Example emphasis: 'Hip hinge, glute, and hamstring dominant loading with posterior chain bias across all movement tiers'.",
    scopeGuidance: "Apply to targeted session(s). If program-wide, shift accessories first across all days. If a single session, shift 1–2 main movements and all accessories toward posterior chain.",
  },

  trunk_core_emphasis: {
    intentFamily: "trunk_core_emphasis",
    minimumStructuralChanges: 1,
    primaryChanges: [
      { type: "add_core_stability", description: "Add structured trunk stability work appropriate to the active mode: anti-rotation (Pallof press, Copenhagen plank), anti-extension (ab wheel rollout, RKC plank, weighted hollow body), anti-flexion (suitcase carry, lateral plank), or positional isometrics (deadbug, bird-dog, hollow body hold)", countAs: 1 },
      { type: "replace_exercise", description: "Replace generic accessory work with targeted trunk stability exercises relevant to the session's movement context and active training mode", countAs: 1 },
    ],
    secondaryChanges: [
      { type: "add_accessories", description: "Add core-focused accessories as a dedicated trunk stability block: carries (farmer, suitcase, overhead), anti-rotation presses, plank progressions, rotational work appropriate to the mode", countAs: 1 },
      { type: "update_session_emphasis", description: "Update session label/emphasis to reflect trunk/core emphasis", countAs: 0 },
    ],
    antiPatterns: [
      "Do NOT add crunches or sit-ups as the primary response — trunk stability emphasis means anti-movement isometric control and bracing, NOT spinal flexion exercises",
      "Do NOT reduce this to generic 'core accessory filler' (random ab exercises) — this requires STRUCTURED trunk stability programming with specific anti-movement patterns",
      "Do NOT collapse into generic session_expansion — trunk_core_emphasis requires exercises specifically targeting spinal stability, anti-rotation, or anti-extension patterns",
      "Do NOT ignore mode context: Strength = trunk stability under heavy load (carries, Pallof press, heavy planks, ab wheel); Speed = trunk stiffness and bracing for sprint/COD transfer (anti-rotation during decel, standing Pallof, rapid bracing drills); Mobility = positional trunk control (deadbug, bird-dog, hollow body, breath-locked IAP holds)",
      "Do NOT add generic planks without progressive loading or variation — if adding planks, progress them (weighted, ring planks, plank with perturbation, RKC plank cues)",
    ],
    validationRules: [
      "At least 1 structured trunk stability exercise must be added (anti-rotation, anti-extension, anti-flexion, or positional isometric)",
      "Added exercises must specifically target trunk stability — not generic abdominal exercises (avoid crunches as the sole or primary response)",
      "Mode context must be respected: Strength = load-bearing stability; Speed = transfer-specific bracing; Mobility = positional control",
    ],
    aiDirective: "TRUNK/CORE EMPHASIS: The user wants structured trunk stability work — this is ANTI-MOVEMENT ISOMETRIC CONTROL, not generic abdominal exercises.\n\nMode-specific implementation:\n\nSTRENGTH MODE — Trunk stability under load:\n  Anti-extension: ab wheel rollout, RKC plank (posterior pelvic tilt under tension), weighted hollow body (plate on chest), heavy plank (vest/plate).\n  Anti-rotation: Pallof press (cable or band, standing/half-kneeling/kneeling), Copenhagen plank (adductor + lateral trunk), single-arm carries.\n  Anti-flexion: suitcase carry (one-sided), single-arm overhead carry, lateral plank with hip drop.\n  Full integration: Farmer's carry, trap bar carry — pillar stability under bilateral load.\n\nSPEED MODE — Trunk stability for sprint/COD transfer:\n  Rapid bracing: reactive Pallof press (partner perturbation or sudden load), standing anti-rotation holds with hip load.\n  Deceleration trunk: single-leg Pallof press, lateral bound to plank hold, anti-rotation during decel drills.\n  Sprint posture: hollow body holds (sprint body position isometric), standing anti-extension with hip flexor drive.\n\nMOBILITY MODE — Positional trunk control:\n  Deadbug (extending opposite arm/leg from hollow body base), bird-dog (quadruped reach with spinal neutral).\n  Hollow body hold (2–3 sets × 20–30s): full exhale → brace → tuck ribs → hold.\n  Breath-locked IAP: exhale fully → brace → hold position while breathing shallowly (teaches intra-abdominal pressure and spinal control).\n  Bear crawl hold, quadruped hold with reach — positional isometrics.\n\nIDENTITY UPDATE REQUIRED: Produce an update_session change with mode-specific label. Examples: 'Strength — Pillar Stability Block' / 'Speed — Trunk Transfer Training' / 'Mobility — Positional Core Control'. Adapt emphasis to actual mode and exercises selected.",
    scopeGuidance: "Add trunk stability work as a dedicated block — either at session start (potentiation/warm-up) or at the end (accessory tier). In Strength mode, carry work integrates naturally with main training. In Speed/Mobility, add as a standalone block of 10–15 minutes.",
  },

  injury_modification: {
    intentFamily: "injury_modification",
    minimumStructuralChanges: 1,
    primaryChanges: [
      { type: "remove_aggravating_pattern", description: "Remove or swap exercises aggravating the injury", countAs: 1 },
      { type: "replace_exercise", description: "Replace with pain-free alternative preserving pattern", countAs: 1 },
      { type: "add_tolerance_work", description: "Add appropriate tolerance/support work for the region", countAs: 1 },
    ],
    secondaryChanges: [
      { type: "reduce_density", description: "Reduce loading on affected area", countAs: 1 },
    ],
    antiPatterns: [
      "Do NOT ignore the affected body region",
      "Do NOT swap a painful exercise with another painful exercise for the same joint",
      "Do NOT just add a note to 'be careful' without actually modifying exercises",
      "Do NOT remove all lower body work for a knee issue — find pain-free alternatives",
    ],
    validationRules: [
      "At least 1 exercise removed or replaced that was aggravating the injury",
      "Replacement must be pain-free for the affected region",
      "Training intent must be preserved where possible",
    ],
    aiDirective: "INJURY MODIFICATION: Identify the affected body part. Remove or swap exercises that load that region provocatively. Replace with pain-free alternatives that preserve movement intent where possible. Add tolerance/support exercises if appropriate. Preserving training intent while filtering through injury constraints is the goal.",
    scopeGuidance: "Apply wherever the aggravating exercises appear in the program.",
  },

  joint_friendly_modification: {
    intentFamily: "joint_friendly_modification",
    minimumStructuralChanges: 1,
    primaryChanges: [
      { type: "remove_aggravating_pattern", description: "Remove high-joint-load exercises", countAs: 1 },
      { type: "replace_exercise", description: "Replace with lower-impact alternatives", countAs: 1 },
    ],
    secondaryChanges: [
      { type: "add_tolerance_work", description: "Add joint-support/strengthening work", countAs: 1 },
    ],
    antiPatterns: [
      "Do NOT keep barbell back squats and call it knee-friendly",
      "Do NOT keep behind-neck press and call it shoulder-friendly",
    ],
    validationRules: [
      "At least 1 high-joint-stress exercise replaced or removed",
    ],
    aiDirective: "JOINT FRIENDLY MODIFICATION: Swap high-joint-stress exercises for lower-impact alternatives. For knee: prefer box squats, leg press, Bulgarian split squats over deep knee flexion. For shoulder: prefer neutral-grip pressing, cable work over behind-neck or impingement-prone positions. Preserve movement patterns.",
    scopeGuidance: "Apply across the full program wherever joint-stressful exercises appear.",
  },

  equipment_constraint: {
    intentFamily: "equipment_constraint",
    minimumStructuralChanges: 1,
    primaryChanges: [
      { type: "swap_to_equipment_available", description: "Swap barbell movements to dumbbell/bodyweight equivalents", countAs: 1 },
      { type: "replace_exercise", description: "Replace unavailable equipment exercises with available alternatives", countAs: 1 },
    ],
    secondaryChanges: [
      { type: "update_session_emphasis", description: "Update session to reflect available equipment", countAs: 0 },
    ],
    antiPatterns: [
      "Do NOT keep exercises requiring equipment the user doesn't have",
      "Do NOT list unavailable equipment as 'alternatives'",
    ],
    validationRules: [
      "All replaced exercises must use only the specified available equipment",
      "At least 1 real exercise substitution required",
    ],
    aiDirective: "EQUIPMENT CONSTRAINT: Substitute all exercises requiring unavailable equipment. If no barbell: use dumbbells, cables, machines, or bodyweight equivalents. Preserve movement patterns and training intent while adapting to available tools.",
    scopeGuidance: "Apply across all sessions in scope wherever unavailable equipment appears.",
  },

  session_expansion: {
    intentFamily: "session_expansion",
    minimumStructuralChanges: 1,
    primaryChanges: [
      { type: "add_exercise", description: "Add 1-3 relevant exercises to the session", countAs: 1 },
      { type: "add_accessories", description: "Add support/accessory work fitting the day identity", countAs: 1 },
    ],
    secondaryChanges: [
      { type: "add_conditioning_finisher", description: "Add a conditioning finisher if appropriate", countAs: 1 },
      { type: "add_mobility_work", description: "Add mobility or trunk work if appropriate", countAs: 1 },
    ],
    antiPatterns: [
      "Do NOT add random exercises unrelated to the day's purpose",
      "Do NOT add so many exercises the session becomes unreasonable",
    ],
    validationRules: [
      "At least 1 new exercise or work block must be added",
      "Added exercises must fit the session's identity",
    ],
    aiDirective: "SESSION EXPANSION: Add 1-3 well-chosen exercises that fit the day's identity and purpose. If upper body day: add upper-body accessory or trunk work. If lower body day: add lower-body accessory or trunk work. Preserve the day's structural flow (power → primary → secondary → accessory).",
    scopeGuidance: "Apply to the specified session only. Do not affect other sessions.",
  },

  session_reduction: {
    intentFamily: "session_reduction",
    minimumStructuralChanges: 1,
    primaryChanges: [
      { type: "remove_exercise", description: "Remove lowest-priority exercises from session", countAs: 1 },
      { type: "remove_sets", description: "Remove trailing sets from secondary/accessories", countAs: 1 },
    ],
    secondaryChanges: [
      { type: "reduce_accessories", description: "Cut accessory block to essentials", countAs: 1 },
    ],
    antiPatterns: [
      "Do NOT remove primary compound lifts to reduce session length — cut accessories",
      "Do NOT gut the session beyond recognition",
    ],
    validationRules: [
      "At least 1 exercise removed OR sets reduced",
      "Primary lifts must remain unless specifically targeted",
    ],
    aiDirective: "SESSION REDUCTION: Remove lowest-priority work first. Cut accessories before compounds. Remove trailing sets. Keep the primary movement pattern intact. Reduce total time/volume while preserving the session's core purpose.",
    scopeGuidance: "Apply to the specified session only.",
  },

  // ── Add Exercise ──────────────────────────────────────────────────────────
  // Strict single-exercise insertion — triggered by the right panel "Add Exercise"
  // button and unambiguous text like "add an exercise to Day X".
  // This is intentionally separate from session_expansion (which is looser).
  add_exercise: {
    intentFamily: "add_exercise",
    minimumStructuralChanges: 1,
    primaryChanges: [
      { type: "add_exercise", description: "Insert exactly one new exercise row into the target session", countAs: 1 },
    ],
    secondaryChanges: [],
    antiPatterns: [
      "Do NOT add sets or reps to existing exercises instead of inserting a new exercise row",
      "Do NOT increase generic volume without adding a new discrete exercise entry",
      "Do NOT substitute a conditioning finisher or accessory block for a real new exercise row",
      "Do NOT say 'adding volume', 'expanding the session', or 'primary structure unchanged' in the changeSummary",
    ],
    validationRules: [
      "Exactly 1 new exercise must be inserted (add_exercise change type)",
      "The new exercise must have a real canonical name — no placeholder text",
      "The changeSummary MUST name the specific exercise added and which day it targets",
    ],
    aiDirective: `ADD EXERCISE (STRICT STRUCTURAL): The user explicitly requested adding a new exercise. You MUST produce exactly one add_exercise change. NEVER return 0 changes — if you are unsure of the perfect slot, use a safe canonical fallback from the list below.

STEP 1 — IDEAL SLOT INFERENCE: Look at the target session's existing exercises and identify the best gap:
- Missing trunk/core work → add a core stability exercise
- Missing unilateral work → add a single-leg or single-arm movement
- Missing posterior chain → add a hip hinge or hamstring accessory
- Missing conditioning / finisher → add a time-based conditioning exercise
- Session is already complete → add a complementary accessory that does NOT duplicate anchor movements

STEP 2 — FALLBACK EXERCISE SELECTION (if slot is unclear, use one of these canonical options):
- Lower body session → Romanian Deadlift, Step-Up, Copenhagen Plank, Nordic Hamstring Curl, or Reverse Lunge
- Upper body session → Face Pull, Cable Row, Dumbbell Bicep Curl, Band Pull-Apart, or Incline Dumbbell Press
- Full body session → Pallof Press, Dead Bug, Farmer's Carry, Goblet Squat, or Split Squat
- Any session → Plank, Side Plank, Glute Bridge, or Band Clamshell

CRITICAL: You MUST pick one of the above fallbacks if you cannot determine the ideal exercise. Returning 0 changes is NOT acceptable.

Do NOT add sets to existing exercises. Do NOT produce update_exercise or update_session changes as the primary response. The changeSummary MUST state the specific exercise name added and which day (e.g. 'Added Copenhagen Plank to Day 1 to support trunk stability' or 'Added Face Pull to Day 2 to improve upper back health').`,
    scopeGuidance: "Apply to the specific target session only. Insert at the end of the session's exercise list unless a specific position was requested.",
  },

  exercise_swap: {
    intentFamily: "exercise_swap",
    minimumStructuralChanges: 1,
    primaryChanges: [
      { type: "replace_exercise", description: "Replace the target exercise with a quality alternative", countAs: 1 },
    ],
    secondaryChanges: [],
    antiPatterns: [
      "Do NOT swap for an inferior exercise that breaks the movement pattern",
      "Do NOT swap without preserving sets and reps",
    ],
    validationRules: [
      "The target exercise must be replaced with a quality alternative",
      "Sets and reps should be preserved unless the user specified otherwise",
    ],
    aiDirective: "EXERCISE SWAP: Replace the target exercise with the best available alternative that preserves the movement pattern, role, and prescription. Keep sets and reps the same unless the user said otherwise.",
    scopeGuidance: "Apply only to the targeted exercise. Do not affect other exercises.",
  },

  exercise_progression: {
    intentFamily: "exercise_progression",
    minimumStructuralChanges: 1,
    primaryChanges: [
      { type: "swap_to_progression", description: "Swap to a harder exercise variation (progression)", countAs: 1 },
    ],
    secondaryChanges: [
      { type: "add_sets", description: "Optionally increase difficulty via additional set", countAs: 1 },
    ],
    antiPatterns: [
      "Do NOT just add a note saying 'increase weight' without structural change",
    ],
    validationRules: [
      "The exercise must be swapped to a harder variation OR prescription must increase meaningfully",
    ],
    aiDirective: "EXERCISE PROGRESSION: Swap to a harder variation of the exercise. Example: Goblet Squat → Bulgarian Split Squat → Barbell Back Squat. Or: Push-up → Ring Push-up → Weighted Ring Push-up. Preserve movement pattern family.",
    scopeGuidance: "Apply only to the targeted exercise.",
  },

  exercise_regression: {
    intentFamily: "exercise_regression",
    minimumStructuralChanges: 1,
    primaryChanges: [
      { type: "swap_to_regression", description: "Swap to an easier exercise variation (regression)", countAs: 1 },
    ],
    secondaryChanges: [
      { type: "remove_sets", description: "Optionally reduce demand via set reduction", countAs: 1 },
    ],
    antiPatterns: [
      "Do NOT just add a coaching note to 'go lighter'",
      "Do NOT regress to a completely different movement family",
    ],
    validationRules: [
      "The exercise must be swapped to an easier variation OR prescription must decrease meaningfully",
    ],
    aiDirective: "EXERCISE REGRESSION: Swap to an easier variation of the exercise. Example: Barbell Back Squat → Goblet Squat → Box Squat. Or: Pull-up → Band-Assisted Pull-up → Lat Pulldown. Preserve movement pattern family.",
    scopeGuidance: "Apply only to the targeted exercise.",
  },

  // ── Day-Level Progression ─────────────────────────────────────────────────
  // Same session, same training identity — just increased difficulty.
  // IDENTITY IS PRESERVED — do NOT change session label or emphasis.
  day_progression: {
    intentFamily: "day_progression",
    minimumStructuralChanges: 1,
    primaryChanges: [
      { type: "swap_to_progression", description: "Replace exercises with harder progression variants from the library", countAs: 2 },
      { type: "reduce_rest", description: "Tighten rest intervals to increase session demand", countAs: 1 },
      { type: "shift_rep_range_strength", description: "Tighten rep range to reflect higher intensity (e.g. 8-10 → 6-8)", countAs: 1 },
      { type: "add_sets", description: "Add 1 set to primary movements to increase volume demand", countAs: 1 },
    ],
    secondaryChanges: [
      { type: "add_velocity_intent", description: "Add a tempo constraint (e.g. 3-1-X-0) to an existing primary exercise", countAs: 1 },
      { type: "add_exercise", description: "Add ONE aligned challenge (e.g. unilateral, trunk, elastic) if session can support it", countAs: 1 },
    ],
    antiPatterns: [
      "NEVER change the session label or emphasis — identity MUST be preserved",
      "NEVER add exercises unrelated to the session's existing identity",
      "NEVER duplicate existing primary or anchor movements",
      "NEVER ask a clarification question — execute the progression",
      "NEVER just add a coaching note without structural change",
      "Do NOT change training intent (that is handled by strength_focus, power_explosive_focus, etc.)",
    ],
    validationRules: [
      "At least 1 replace_exercise to a harder variant OR at least 2 prescription updates (rest, reps, sets, tempo)",
      "Session label and emphasis must remain unchanged",
      "Added exercises (if any) must match the session's existing training character",
    ],
    aiDirective: `DAY-LEVEL PROGRESSION: Make this training session HARDER while PRESERVING its current training identity completely.

SESSION IDENTITY IS FROZEN — do NOT produce any update_session changes. The label and emphasis stay exactly as they are.

EXECUTION ORDER (strict priority):
1. PRIMARY — Exercise upgrades: For each primary/secondary exercise, check if a harder progression exists (e.g. Back Squat → Pause Back Squat, Pull-Up → Weighted Pull-Up, Box Jump → Depth Jump). Use replace_exercise changes. The new exercise MUST stay in the same category role.
2. SECONDARY — Prescription tightening: Tighten rest intervals (e.g. 90 sec → 60 sec), reduce rep range by 2 (e.g. 8-10 → 6-8), add 1 set to primary lifts, or add tempo constraint (e.g. "3-1-X-0").
3. OPTIONAL — ONE complementary challenge only if the session has room and it aligns with existing identity (e.g. add unilateral variation, trunk stability, elastic primer if already present). Do not add random exercises.

RULES:
- Produce at least 1 replace_exercise OR at least 2 prescription updates (rest, sets, reps, or tempo)
- changeSummary must state specifically what got harder and how — name the exercises and changes
- Do NOT route to clarification — execute directly`,
    scopeGuidance: "Apply to the specified session only. All changes stay within that session.",
  },

  // ── Day-Level Regression ──────────────────────────────────────────────────
  // Same session, same training identity — just decreased difficulty.
  // IDENTITY IS PRESERVED — do NOT change session label or emphasis.
  day_regression: {
    intentFamily: "day_regression",
    minimumStructuralChanges: 1,
    primaryChanges: [
      { type: "swap_to_regression", description: "Replace exercises with easier regression variants from the library", countAs: 2 },
      { type: "increase_rest", description: "Extend rest intervals to reduce session demand", countAs: 1 },
      { type: "shift_rep_range_hypertrophy", description: "Widen rep range to reflect lower intensity (e.g. 4-6 → 6-10)", countAs: 1 },
      { type: "remove_sets", description: "Remove 1 set from accessories to reduce session load", countAs: 1 },
    ],
    secondaryChanges: [
      { type: "reduce_accessories", description: "Remove lowest-priority accessory if simplification is needed", countAs: 1 },
    ],
    antiPatterns: [
      "NEVER change the session label or emphasis — identity MUST be preserved",
      "NEVER gut the session — the core compound structure stays intact",
      "NEVER remove primary compound lifts — cut accessories and sets first",
      "NEVER ask a clarification question — execute the regression",
      "Do NOT change training intent (that is handled by recovery_focus, fatigue_management, etc.)",
    ],
    validationRules: [
      "At least 1 replace_exercise to an easier variant OR at least 2 prescription reductions (rest, reps, sets)",
      "Session label and emphasis must remain unchanged",
      "Primary compound movements must be preserved",
    ],
    aiDirective: `DAY-LEVEL REGRESSION: Make this training session EASIER while PRESERVING its current training identity completely.

SESSION IDENTITY IS FROZEN — do NOT produce any update_session changes. The label and emphasis stay exactly as they are.

EXECUTION ORDER (strict priority):
1. PRIMARY — Exercise regressions: For each primary/secondary exercise, use an easier regression variant if one exists (e.g. Back Squat → Box Squat or Goblet Squat, Pull-Up → Band-Assisted Pull-Up, Depth Jump → Box Jump). Use replace_exercise changes. The replacement MUST stay in the same category role.
2. SECONDARY — Reduce prescription load: extend rest intervals (e.g. 60 sec → 90 sec), reduce sets by 1 on accessories, shift rep range to an easier zone (e.g. 4-6 → 6-10), remove any tempo constraints that increase difficulty.
3. OPTIONAL — Remove 1 lowest-priority accessory if the session needs further simplification. Protect all primary and secondary movements.

RULES:
- Produce at least 1 replace_exercise OR at least 2 prescription reductions (rest, sets, reps)
- changeSummary must state specifically what got easier and how — name the exercises and changes
- Do NOT route to clarification — execute directly`,
    scopeGuidance: "Apply to the specified session only. Protect primary compound movements.",
  },

  // ── Readiness Low ──────────────────────────────────────────────────────────
  readiness_low: {
    intentFamily: "readiness_low",
    minimumStructuralChanges: 1,
    primaryChanges: [
      { type: "remove_sets", description: "Reduce set counts on accessories by 1", countAs: 1 },
      { type: "remove_exercise", description: "Remove the highest-demand exercise from today's session", countAs: 1 },
      { type: "increase_rest", description: "Extend rest periods to reduce neural demand", countAs: 1 },
    ],
    secondaryChanges: [
      { type: "swap_to_regression", description: "Swap primary lift to a lower-complexity regression", countAs: 1 },
      { type: "reduce_density", description: "Remove supersets or density blocks for today", countAs: 1 },
    ],
    antiPatterns: [
      "Do NOT rebuild the entire program — today's session only",
      "Do NOT remove all exercises — keep a productive session",
      "Do NOT add high-intensity or new complex movements",
      "Do NOT affect future sessions — future weeks stay unchanged",
    ],
    validationRules: [
      "Today's session must have reduced volume, intensity, or neural demand",
      "Future sessions must remain unchanged",
      "At least 1 workload reduction required",
    ],
    aiDirective: "READINESS LOW: The user is tired or low-energy TODAY. Convert today's session to a lower-intensity version. Remove 1 accessory. Reduce sets by 1 on compound lifts. Extend rest. Keep the session useful but reduce total demand. Do NOT affect future sessions — this is a TODAY-only adjustment.\n\nIDENTITY UPDATE REQUIRED: Update the session label and emphasis to reflect the lower-demand intent. Example label: 'Lower Body — Readiness-Adjusted'. Example emphasis: 'Reduced-demand session preserving movement quality with lowered intensity for recovery'. Adapt to the actual body region.",
    scopeGuidance: "Apply to today's session ONLY. Do not affect other sessions or future weeks.",
  },

  // ── Missed Sessions Re-Entry ───────────────────────────────────────────────
  missed_sessions_reentry: {
    intentFamily: "missed_sessions_reentry",
    minimumStructuralChanges: 1,
    primaryChanges: [
      { type: "remove_sets", description: "Reduce sets by 1–2 across all compound lifts", countAs: 1 },
      { type: "remove_exercise", description: "Remove 1–2 highest-volume accessories", countAs: 1 },
      { type: "swap_to_regression", description: "Regress primary lifts to reduce injury risk on first session back", countAs: 1 },
    ],
    secondaryChanges: [
      { type: "increase_rest", description: "Extend rest periods — nervous system is less conditioned", countAs: 1 },
      { type: "reduce_density", description: "Remove density blocks for the first week back", countAs: 1 },
    ],
    antiPatterns: [
      "Do NOT resume at previous intensity immediately — risk of injury and excessive soreness",
      "Do NOT rebuild the entire program — apply a re-entry deload to the next 1–2 sessions",
      "Do NOT over-reduce — the user should still feel like they trained",
    ],
    validationRules: [
      "Volume must be reduced relative to normal session",
      "Primary movement patterns must be preserved at lower intensity",
      "At least 1 regression or set reduction required",
    ],
    aiDirective: "MISSED SESSIONS RE-ENTRY: User is returning after a break. Apply a re-entry deload to the immediate session(s). Reduce volume by ~30%. Reduce weights/intensity on primary lifts. Keep all primary movement patterns but remove 1–2 accessories. Extend rest. Resume normal progression from the next week. Acknowledge the break and reassure about the plan to ramp back up.\n\nIDENTITY UPDATE REQUIRED: Update the session label to indicate re-entry status. Example label: 'Upper Body — Re-Entry (Reduced Load)'. Example emphasis: 'Gradual re-entry after break — preserved movement patterns at reduced intensity to manage DOMS and rebuild work capacity'.",
    scopeGuidance: "Apply to the next 1–2 sessions. Resume full progression from the following week.",
  },

  // ── Environment Temporary Switch ──────────────────────────────────────────
  environment_temporary_switch: {
    intentFamily: "environment_temporary_switch",
    minimumStructuralChanges: 1,
    primaryChanges: [
      { type: "swap_to_equipment_available", description: "Swap all exercises to hotel/home-available alternatives (dumbbells, bodyweight, bands)", countAs: 1 },
      { type: "replace_exercise", description: "Replace machine or barbell exercises with bodyweight/dumbbell equivalents", countAs: 1 },
    ],
    secondaryChanges: [
      { type: "update_session_emphasis", description: "Update session emphasis to reflect temporary environment", countAs: 0 },
    ],
    antiPatterns: [
      "Do NOT permanently rewrite the user's program — this is a temporary session adaptation only",
      "Do NOT remove entire movement categories — find bodyweight/dumbbell equivalents",
      "Do NOT ask clarifying questions — assume hotel or home gym with dumbbells and bodyweight",
    ],
    validationRules: [
      "All exercises must be executable without specialty equipment",
      "Barbell exercises must be replaced with dumbbell or bodyweight alternatives",
      "Permanent program structure must remain unchanged",
    ],
    aiDirective: "ENVIRONMENT TEMPORARY SWITCH: The user is training somewhere without their usual gym today (hotel, home, traveling). Adapt TODAY's session to available equipment. Assume: dumbbells, resistance bands, bodyweight, and possibly a pull-up bar. Swap barbell exercises to dumbbell equivalents, machines to bodyweight/dumbbell work. Preserve movement patterns and session structure.\n\nCRITICAL: This is a TEMPORARY adaptation for today only. Do NOT permanently modify the program structure. The user returns to their normal environment after this session. In your response, acknowledge the environment and confirm the temporary nature of the adaptation.",
    scopeGuidance: "Apply to today's session ONLY. Permanent program structure stays unchanged.",
  },

  // ── Sport Context Update ───────────────────────────────────────────────────
  sport_context_update: {
    intentFamily: "sport_context_update",
    minimumStructuralChanges: 0,
    primaryChanges: [
      { type: "update_session_emphasis", description: "Update session emphasis to reflect sport context", countAs: 0 },
      { type: "replace_exercise", description: "Swap exercises to sport-specific alternatives where appropriate", countAs: 1 },
    ],
    secondaryChanges: [
      { type: "add_exercise", description: "Add sport-specific movement work if missing", countAs: 1 },
    ],
    antiPatterns: [
      "Do NOT rebuild the entire program without confirmation",
      "Do NOT ignore the user's current goal when applying sport bias",
      "Do NOT remove primary strength work unless the sport context makes it clearly inappropriate",
    ],
    validationRules: [
      "Sport context must be stored for future program generation",
      "If program exists, exercise selection must be re-oriented toward sport demands",
    ],
    aiDirective: "SPORT CONTEXT UPDATE: The user has declared or updated their sport/activity context. Acknowledge the sport. If a program exists, review the current exercise selection and update where appropriate — add sport-relevant movements, adjust emphasis, and re-orient session coaching cues toward sport demands. Store the sport context for future program generation. If the change is significant enough to warrant a rebuild, ask the user — otherwise adjust in place.",
    scopeGuidance: "Update sport context globally. Adjust the active program's emphasis and exercise selection where appropriate without full rebuild.",
  },

  // ── Exercise Dislike / Preference ─────────────────────────────────────────
  exercise_dislike_or_preference: {
    intentFamily: "exercise_dislike_or_preference",
    minimumStructuralChanges: 0,
    primaryChanges: [
      { type: "replace_exercise", description: "Replace the disliked exercise with a suitable alternative preserving the movement pattern", countAs: 1 },
      { type: "remove_exercise", description: "Remove the disliked exercise if no equivalent is needed", countAs: 1 },
    ],
    secondaryChanges: [
      { type: "update_session_emphasis", description: "Note preference in session coaching cues", countAs: 0 },
    ],
    antiPatterns: [
      "Do NOT remove the entire movement pattern unless the user explicitly asks",
      "Do NOT replace the disliked exercise with another version of the same movement if the user generically dislikes the movement",
      "Do NOT repeatedly program the disliked exercise in future sessions",
    ],
    validationRules: [
      "Disliked exercise must be absent from the session after mutation",
      "Movement pattern must be preserved with an alternative",
      "Preference must be noted for future program generation",
    ],
    aiDirective: "EXERCISE DISLIKE OR PREFERENCE: The user has expressed a dislike for a specific exercise or a preference for equipment/style. If the disliked exercise appears in the current program, replace it with a suitable alternative that preserves the movement pattern. If they prefer a certain equipment style (e.g., dumbbells over barbells), shift appropriate exercises accordingly. Store the preference for future program generation.\n\nRULE: Do NOT remove the movement pattern entirely — replace, don't delete. Exception: if the user says 'no lunges at all, ever', then remove the pattern and explain the trade-off.",
    scopeGuidance: "Apply to all instances of the disliked exercise in the current program. Store preference for future generations.",
  },

  clarification_required: {
    intentFamily: "clarification_required",
    minimumStructuralChanges: 0,
    primaryChanges: [],
    secondaryChanges: [],
    antiPatterns: [],
    validationRules: ["Clarification must be requested before acting"],
    aiDirective: "CLARIFICATION NEEDED: Ask one specific, targeted question to determine intent. Do not make assumptions. Do not apply any changes without understanding the request.",
    scopeGuidance: "No scope inference — clarify first.",
  },

  greeting: {
    intentFamily: "greeting",
    minimumStructuralChanges: 0,
    primaryChanges: [],
    secondaryChanges: [],
    antiPatterns: [
      "Do NOT ask intake questions",
      "Do NOT rebuild or re-announce the program",
      "Do NOT ask about goals, days, or training history",
      "Do NOT use build-template language",
    ],
    validationRules: ["No structural changes — context-aware greeting only"],
    aiDirective: "GREETING: Respond as a coach would to a casual greeting. Keep it to 1-2 short sentences. If the user has an active program, reference it briefly. If not, prompt them to build one. No intake questions.",
    scopeGuidance: "No scope — conversational response only.",
  },

  program_safety_question: {
    intentFamily: "program_safety_question",
    minimumStructuralChanges: 0,
    primaryChanges: [],
    secondaryChanges: [],
    antiPatterns: [
      "Do NOT rebuild or re-announce the program",
      "Do NOT say 'Built' or 'Check the Program tab'",
      "Do NOT use generic legal disclaimers",
    ],
    validationRules: ["No structural changes — coaching/safety answer only"],
    aiDirective: "PROGRAM SAFETY QUESTION: Answer directly about the current program's safety/appropriateness. Reference the program's structure, volume, and intensity. Offer to modify if there's a concern. No build language.",
    scopeGuidance: "Program-level assessment — no changes unless the user requests them.",
  },

  program_explanation_question: {
    intentFamily: "program_explanation_question",
    minimumStructuralChanges: 0,
    primaryChanges: [],
    secondaryChanges: [],
    antiPatterns: [
      "Do NOT rebuild the program to explain it",
      "Do NOT say 'Built' or 'Check the Program tab'",
      "Do NOT re-list the entire program structure",
    ],
    validationRules: ["No structural changes — explanation only"],
    aiDirective: "PROGRAM EXPLANATION QUESTION: Explain WHY the current structure, exercise, or session exists. Reference the training goal, sport context, or programming logic. No build language.",
    scopeGuidance: "Explain the specific element asked about — do not restructure.",
  },

  coaching_question: {
    intentFamily: "coaching_question",
    minimumStructuralChanges: 0,
    primaryChanges: [],
    secondaryChanges: [],
    antiPatterns: [
      "Do NOT rebuild the program to answer the question",
      "Do NOT say 'Built' or 'Check the Program tab'",
    ],
    validationRules: ["No structural changes — coaching guidance only"],
    aiDirective: "COACHING QUESTION: Answer the coaching/guidance question directly. Reference the current program if relevant. Be authoritative and concise. No build language.",
    scopeGuidance: "Coaching guidance — no program changes unless explicitly requested.",
  },

  new_program_request: {
    intentFamily: "new_program_request",
    minimumStructuralChanges: 0,
    primaryChanges: [],
    secondaryChanges: [],
    antiPatterns: [
      "Do NOT reuse or modify the existing program — this is a fresh build",
      "Do NOT use mutation or update language",
    ],
    validationRules: ["No mutation validation needed — this routes to REBUILD_PROGRAM"],
    aiDirective: "FRESH PROGRAM BUILD: Generate a completely new program from scratch based on the user's request. Ignore any existing program structure.",
    scopeGuidance: "Full program — fresh generation from scratch.",
  },
};

// ─── Transformation Result Validation ────────────────────────────────────────

export interface ValidationResult {
  valid: boolean;
  structuralChangeCount: number;
  requiredMinimum: number;
  failureReason?: string;
  antiPatternHit?: string;
  recommendation?: string;
}

interface DetectedChange {
  type: string;
  countAs?: number;
}

export interface TransformationResult {
  intentFamily: IntentFamily;
  detectedChanges: DetectedChange[];
  onlyTextChanges?: boolean;
}

export function getTransformationBundle(family: IntentFamily): TransformationBundle {
  return TRANSFORMATION_BUNDLES[family];
}

export function validateTransformationResult(
  result: TransformationResult,
): ValidationResult {
  const bundle = TRANSFORMATION_BUNDLES[result.intentFamily];
  if (!bundle) {
    return {
      valid: false,
      structuralChangeCount: 0,
      requiredMinimum: 1,
      failureReason: `No bundle defined for family: ${result.intentFamily}`,
    };
  }

  // Non-mutation families — always "valid" (no structural changes needed or expected)
  if (result.intentFamily === "clarification_required" ||
      result.intentFamily === "greeting" ||
      result.intentFamily === "program_safety_question" ||
      result.intentFamily === "program_explanation_question" ||
      result.intentFamily === "coaching_question" ||
      result.intentFamily === "new_program_request") {
    return { valid: true, structuralChangeCount: 0, requiredMinimum: 0 };
  }

  // Count structural changes
  const structuralChangeCount = result.detectedChanges.reduce(
    (sum, c) => sum + (c.countAs ?? 1),
    0,
  );

  // Pure text changes = always invalid for non-clarification families
  if (result.onlyTextChanges) {
    return {
      valid: false,
      structuralChangeCount: 0,
      requiredMinimum: bundle.minimumStructuralChanges,
      failureReason: "Only cosmetic/text changes detected — no structural mutations applied",
      recommendation: bundle.aiDirective,
    };
  }

  // Check minimum structural change threshold
  if (structuralChangeCount < bundle.minimumStructuralChanges) {
    return {
      valid: false,
      structuralChangeCount,
      requiredMinimum: bundle.minimumStructuralChanges,
      failureReason: `Insufficient structural changes: got ${structuralChangeCount}, need ${bundle.minimumStructuralChanges}`,
      recommendation: bundle.aiDirective,
    };
  }

  return {
    valid: true,
    structuralChangeCount,
    requiredMinimum: bundle.minimumStructuralChanges,
  };
}

// ─── AI Prompt Directive Builder ──────────────────────────────────────────────
//
// Called before sending to OpenAI to inject intent-family-specific instructions.

export function buildIntentFamilyPromptDirective(
  familyResult: IntentFamilyResult,
  programContext?: { dayCount?: number; sessionLabel?: string },
): string {
  const bundle = TRANSFORMATION_BUNDLES[familyResult.family];
  if (!bundle) return "";

  const lines: string[] = [
    `## INTENT FAMILY CLASSIFICATION`,
    `Normalized Intent: **${familyResult.family.toUpperCase()}**`,
    `Target Scope: **${familyResult.targetScope}** (${familyResult.scopeSource})`,
    `Confidence: ${familyResult.confidence}`,
    ``,
    `## TRANSFORMATION DIRECTIVE`,
    bundle.aiDirective,
    ``,
    `## SCOPE GUIDANCE`,
    bundle.scopeGuidance,
  ];

  if (programContext?.dayCount) {
    lines.push(``, `Program has ${programContext.dayCount} training days.`);
  }
  if (programContext?.sessionLabel) {
    lines.push(`Target session: ${programContext.sessionLabel}`);
  }

  lines.push(
    ``,
    `## MINIMUM STRUCTURAL CHANGES REQUIRED`,
    `This intent family requires at least **${bundle.minimumStructuralChanges}** real structural change(s).`,
    `Cosmetic updates (coaching notes, description text, rationale only) do NOT count.`,
    ``,
    `## ANTI-PATTERNS — DO NOT DO THESE`,
    ...bundle.antiPatterns.map((ap) => `- ${ap}`),
    ``,
    `## VALIDATION`,
    ...bundle.validationRules.map((vr) => `- ${vr}`),
  );

  return lines.join("\n");
}

// ─── Debug Logger ─────────────────────────────────────────────────────────────

export interface IntentFamilyDebugLog {
  originalRequest: string;
  normalizedFamily: IntentFamily;
  targetScope: TargetScope;
  scopeSource: string;
  confidence: string;
  chosenPath: "deterministic" | "openai" | "fallback";
  transformationBundle: string;
  minimumStructuralChanges: number;
  validationResult?: ValidationResult;
  clarificationBypassed?: boolean;
  matchedPatterns?: string[];
  rejectedCompetingFamily?: IntentFamily;
}

export function logIntentFamilyDebug(log: IntentFamilyDebugLog): void {
  logger.info(
    {
      intentFamily: log.normalizedFamily,
      targetScope: log.targetScope,
      scopeSource: log.scopeSource,
      confidence: log.confidence,
      chosenPath: log.chosenPath,
      minimumStructuralChanges: log.minimumStructuralChanges,
      validationResult: log.validationResult,
      clarificationBypassed: log.clarificationBypassed ?? false,
      matchedPatterns: log.matchedPatterns ?? [],
      rejectedCompetingFamily: log.rejectedCompetingFamily ?? null,
      requestPreview: log.originalRequest.slice(0, 120),
    },
    `[IntentResolution] raw="${log.originalRequest.slice(0, 80)}" → resolved=${log.normalizedFamily.toUpperCase()} | rejected=${log.rejectedCompetingFamily ? log.rejectedCompetingFamily.toUpperCase() : "none"} | bundle=${log.transformationBundle} | scope=${log.targetScope} (${log.confidence}) via ${log.chosenPath}`,
  );
}

// ─── Intent Family → SpecialistIntent Bridge ──────────────────────────────────
//
// Maps intent families back to the SpecialistIntentType system for
// backwards compatibility with existing mutation builders.
//
// Note: These types are duplicated here to avoid circular imports.
// They are structurally identical to SpecialistIntentType and BiasTarget
// in program-specialist.ts.

export type SpecialistIntentType =
  | "BIAS_SHIFT"
  | "EXERCISE_SWAP"
  | "PAIN_ADJUSTMENT"
  | "TIME_COMPRESSION"
  | "READINESS_ADJUSTMENT"
  | "SEASON_SHIFT"
  | "SPORT_TRANSFER_SHIFT"
  | "SPLIT_CHANGE"
  | "VOLUME_CHANGE"
  | "INTENSITY_CHANGE"
  | "EQUIPMENT_ADJUSTMENT"
  | "RECOVERY_SHIFT"
  | "AMBIGUOUS";

export type BiasTarget = "endurance" | "strength" | "power" | "hypertrophy" | "athletic";

export interface FamilyBridgeResult {
  specialistIntent: SpecialistIntentType;
  biasTarget?: BiasTarget;
  supplementalData: Record<string, unknown>;
}

export function bridgeToSpecialistIntent(family: IntentFamily): FamilyBridgeResult {
  switch (family) {
    case "increase_difficulty":
    case "decrease_difficulty":
      return {
        specialistIntent: "INTENSITY_CHANGE",
        supplementalData: { direction: family === "increase_difficulty" ? "increase" : "decrease", family },
      };

    case "increase_volume":
    case "decrease_volume":
      return {
        specialistIntent: "VOLUME_CHANGE",
        supplementalData: { direction: family === "increase_volume" ? "increase" : "reduce", family },
      };

    case "reduce_time":
      return {
        specialistIntent: "TIME_COMPRESSION",
        supplementalData: { family },
      };

    case "increase_time":
    case "session_expansion":
      return {
        specialistIntent: "VOLUME_CHANGE",
        supplementalData: { direction: "increase", family },
      };

    case "session_reduction":
      return {
        specialistIntent: "VOLUME_CHANGE",
        supplementalData: { direction: "reduce", family },
      };

    case "strength_focus":
      return {
        specialistIntent: "BIAS_SHIFT",
        biasTarget: "strength",
        supplementalData: { family },
      };

    case "hypertrophy_focus":
      return {
        specialistIntent: "BIAS_SHIFT",
        biasTarget: "hypertrophy",
        supplementalData: { family },
      };

    case "endurance_focus":
      return {
        specialistIntent: "BIAS_SHIFT",
        biasTarget: "endurance",
        supplementalData: { family },
      };

    case "conditioning_focus":
      return {
        specialistIntent: "BIAS_SHIFT",
        biasTarget: "endurance",
        supplementalData: { family, isConditioningSpecific: true },
      };

    case "power_explosive_focus":
    case "speed_focus":
    case "reactive_focus":
      return {
        specialistIntent: "BIAS_SHIFT",
        biasTarget: "power",
        supplementalData: { family },
      };

    case "athletic_performance_focus":
      return {
        specialistIntent: "BIAS_SHIFT",
        biasTarget: "athletic",
        supplementalData: { family },
      };

    case "fatigue_management":
    case "recovery_focus":
      return {
        specialistIntent: "RECOVERY_SHIFT",
        supplementalData: { family },
      };

    case "mobility_support":
      return {
        specialistIntent: "RECOVERY_SHIFT",
        supplementalData: { family, isMobilitySpecific: true },
      };

    case "injury_modification":
    case "joint_friendly_modification":
      return {
        specialistIntent: "PAIN_ADJUSTMENT",
        supplementalData: { family },
      };

    case "equipment_constraint":
      return {
        specialistIntent: "EQUIPMENT_ADJUSTMENT",
        supplementalData: { family },
      };

    case "add_exercise":
      return {
        specialistIntent: "VOLUME_CHANGE",
        supplementalData: { direction: "add_exercise_strict", family },
      };

    case "exercise_swap":
      return {
        specialistIntent: "EXERCISE_SWAP",
        supplementalData: { family },
      };

    case "exercise_progression":
    case "exercise_regression":
      return {
        specialistIntent: "EXERCISE_SWAP",
        supplementalData: {
          family,
          direction: family === "exercise_progression" ? "progression" : "regression",
        },
      };

    case "tendon_resilience_focus":
      return {
        specialistIntent: "PAIN_ADJUSTMENT",
        supplementalData: { family, isTendonLoadManagement: true },
      };

    case "end_range_control_focus":
    case "mobility_flow_focus":
      return {
        specialistIntent: "RECOVERY_SHIFT",
        supplementalData: { family, isMobilitySpecific: true },
      };

    case "unilateral_emphasis":
    case "posterior_chain_emphasis":
      return {
        specialistIntent: "BIAS_SHIFT",
        biasTarget: "strength",
        supplementalData: { family },
      };

    case "trunk_core_emphasis":
      return {
        specialistIntent: "BIAS_SHIFT",
        supplementalData: { family, isCrossMode: true },
      };

    case "readiness_low":
      return {
        specialistIntent: "RECOVERY_SHIFT",
        supplementalData: { family, isReadinessAdjustment: true, temporaryToday: true },
      };

    case "missed_sessions_reentry":
      return {
        specialistIntent: "RECOVERY_SHIFT",
        supplementalData: { family, isReentryDeload: true },
      };

    case "environment_temporary_switch":
      return {
        specialistIntent: "EQUIPMENT_ADJUSTMENT",
        supplementalData: { family, isTemporaryEnvironment: true },
      };

    case "sport_context_update":
      return {
        specialistIntent: "BIAS_SHIFT",
        biasTarget: "athletic",
        supplementalData: { family, isSportContextUpdate: true },
      };

    case "exercise_dislike_or_preference":
      return {
        specialistIntent: "EXERCISE_SWAP",
        supplementalData: { family, isPreferenceUpdate: true },
      };

    case "clarification_required":
    default:
      return {
        specialistIntent: "AMBIGUOUS",
        supplementalData: { family },
      };
  }
}

// ─── Convenience: Full Pipeline Entry Point ───────────────────────────────────
//
// Single call to get family, scope, bundle, bridge, and directive.

export interface IntentFamilyPipelineResult {
  familyResult: IntentFamilyResult;
  bundle: TransformationBundle;
  bridge: FamilyBridgeResult;
  promptDirective: string;
}

export function runIntentFamilyPipeline(
  message: string,
  programContext?: { dayCount?: number; sessionLabel?: string },
  focusMode?: FocusMode,
): IntentFamilyPipelineResult {
  const familyResult = normalizeToIntentFamily(message, focusMode);
  const bundle = TRANSFORMATION_BUNDLES[familyResult.family];
  const bridge = bridgeToSpecialistIntent(familyResult.family);
  const promptDirective = buildIntentFamilyPromptDirective(familyResult, programContext);

  logIntentFamilyDebug({
    originalRequest: message,
    normalizedFamily: familyResult.family,
    targetScope: familyResult.targetScope,
    scopeSource: familyResult.scopeSource,
    confidence: familyResult.confidence,
    chosenPath: "deterministic",
    transformationBundle: familyResult.family,
    minimumStructuralChanges: bundle.minimumStructuralChanges,
    matchedPatterns: familyResult.matchedPatterns,
    rejectedCompetingFamily: familyResult.debugInfo.rejectedCompetingFamily as IntentFamily | undefined,
  });

  return { familyResult, bundle, bridge, promptDirective };
}
