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
  | "athletic_performance_focus"
  | "fatigue_management"
  | "recovery_focus"
  | "mobility_support"
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
  | "add_prep_block"
  | "add_mobility_work"
  | "remove_aggravating_pattern"
  | "add_tolerance_work"
  | "swap_to_equipment_available"
  | "update_session_emphasis"
  | "update_week_focus";

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

  // ── Equipment Constraint ──────────────────────────────────────────────────
  {
    family: "equipment_constraint",
    patterns: [
      /\b(only|just).{0,20}(have|got|access to).{0,30}(dumbbells?|bands?|resistance bands?|kettlebells?|bodyweight|cables?|machines?)\b/i,
      /\b(no barbell|no rack|no squat rack|no bench press|home gym|hotel gym|limited equipment|minimal equipment|no weights?|no gym)\b/i,
      /\b(without.{0,15}(barbell|squat rack|bench|machine|cable))\b/i,
      /\b(dumbbell.?only|bodyweight.?only|bands?.?only|kettlebell.?only)\b/i,
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
      /\b(shorten (this )?session|cut (this )?session|remove (some )?exercises?|fewer exercises?)\b/i,
      /\b(reduce.{0,20}exercises?|trim (this )?session|simplify (this )?session)\b/i,
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
    ],
  },

  // ── Exercise Regression ───────────────────────────────────────────────────
  {
    family: "exercise_regression",
    patterns: [
      /\b(regress|easier version|simpler version|step down|scale back|scale down).{0,30}(this exercise|the exercise|the movement|this movement)\b/i,
      /\b(make (this |the )?(exercise|movement|lift) easier)\b/i,
      /\b(regression|regress the movement|easier variation|simplified version)\b/i,
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
      /\b(more pop|first step|acceleration|change of direction|quickness)\b/i,
      /\b(faster and more powerful|faster.{0,20}powerful|power (output|development))\b/i,
      /\b(speed.?strength|rate of force|reactive strength|ballistic)\b/i,
      // "make it more for power" — casual "for X" phrasing
      /\bmake\s+(?:this|it|the\s+program|my\s+program)\s+(?:more\s+)?(?:for\s+)?(?:power|explosiveness?|explosive)\b/i,
      /\b(?:more|geared)\s+(?:toward[s]?\s+|for\s+)?(?:power|explosiveness?|explosive\s+(?:work|training))\b/i,
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

  // ── Mobility Support ─────────────────────────────────────────────────────
  {
    family: "mobility_support",
    patterns: [
      /\b(add (mobility|flexibility|stretching|warm.?up|prep|activation|cool.?down))\b/i,
      /\b(more mobility|mobility work|flexibility work|movement prep)\b/i,
      /\b(tight (hips?|hamstrings?|shoulders?|back|ankles?|thoracic))\b/i,
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

export function normalizeToIntentFamily(message: string): IntentFamilyResult {
  const lower = message.toLowerCase().trim();

  for (const { family, patterns } of FAMILY_PATTERNS) {
    const matched = patterns.filter((p) => p.test(lower));
    if (matched.length > 0) {
      const targetScope = resolveTargetScope(lower);
      const result: IntentFamilyResult = {
        family,
        confidence: matched.length >= 2 ? "high" : "medium",
        matchedPatterns: matched.map((p) => p.source.slice(0, 60)),
        targetScope: targetScope.scope,
        scopeSource: targetScope.source,
        debugInfo: {
          patternMatchCount: matched.length,
          firstMatch: matched[0].source.slice(0, 80),
        },
      };

      logger.debug(
        {
          originalMessage: message.slice(0, 120),
          resolvedFamily: family,
          confidence: result.confidence,
          targetScope: result.targetScope,
          scopeSource: result.scopeSource,
        },
        "[IntentFamilyEngine] Family resolved",
      );

      return result;
    }
  }

  // No match — clarification required
  const targetScope = resolveTargetScope(lower);
  return {
    family: "clarification_required",
    confidence: "low",
    matchedPatterns: [],
    targetScope: targetScope.scope,
    scopeSource: targetScope.source,
    debugInfo: { noMatch: true },
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
    ],
    validationRules: [
      "Intensity or volume must decrease",
      "At least 1 real workload reduction or recovery addition",
    ],
    aiDirective: "RECOVERY FOCUS: Reduce intensity and volume. Add low-intensity movement or restoration work. If a recovery day, convert to movement quality / mobility focus. Preserve basic movement patterns at very low intensity.\n\nIDENTITY UPDATE REQUIRED: You MUST also produce an update_session change that refreshes the session's `label` and `emphasis` to reflect its new recovery identity. Example label: 'Active Recovery — Movement Quality'. Example emphasis: 'Low-intensity tissue restoration, mobility work, and CNS readiness preparation'. Adapt to the actual body region. Do NOT leave the original label and emphasis unchanged.",
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
      requestPreview: log.originalRequest.slice(0, 120),
    },
    `[IntentFamilyEngine] ${log.normalizedFamily.toUpperCase()} → ${log.targetScope} (${log.confidence}) via ${log.chosenPath}`,
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
): IntentFamilyPipelineResult {
  const familyResult = normalizeToIntentFamily(message);
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
  });

  return { familyResult, bundle, bridge, promptDirective };
}
