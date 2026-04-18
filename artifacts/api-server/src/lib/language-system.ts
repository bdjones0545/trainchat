/**
 * TrainChat Language System — Broad English Coaching Language Interpreter
 *
 * ARCHITECTURE:
 *   This module sits ALONGSIDE the existing intent/constraint/family pipeline.
 *   It does NOT replace existing working logic.
 *
 *   Layer 1 — NORMALIZATION
 *     Concept normalization: synonym grouping, slang, fuzzy metaphor, typo tolerance.
 *
 *   Layer 2 — STRUCTURED EXTRACTION
 *     Produces an AgentIntentProfile from a single user message.
 *     Captures all coaching-relevant categories at once:
 *     goal, changes, preservations, constraints, style, recovery, ambiguity, etc.
 *
 *   Layer 3 — PROGRAMMING DIRECTIVE TRANSLATION
 *     Maps extracted language meaning → structured programming directives.
 *     These are injected into the AI prompt as additional coaching context.
 *
 *   Layer 4 — CONFLICT / AMBIGUITY HANDLING
 *     Detects vague, contradictory, and underspecified requests.
 *     Assigns confidence. Chooses safest grounded interpretation.
 *     Logs every decision via language-audit.ts.
 *
 * INTEGRATION:
 *   Call extractAgentIntentProfile() anywhere in the pipeline where you need
 *   richer language understanding. The result supplements ExtractedConstraints
 *   and IntentFamilyResult — it does not replace them.
 */

// ─── Types ────────────────────────────────────────────────────────────────────

export type RequestType =
  | "create_program"
  | "modify_program"
  | "preserve_and_modify"
  | "adjust_recovery"
  | "adjust_pain"
  | "ask_question"
  | "conversational"
  | "unclear";

export type GoalConcept =
  | "strength"
  | "hypertrophy"
  | "fat_loss"
  | "athleticism"
  | "speed"
  | "power"
  | "conditioning"
  | "recovery"
  | "movement_quality"
  | "return_to_training"
  | "general_fitness"
  | "look_better"
  | "feel_better";

export type RecoveryState =
  | "fresh"
  | "tired"
  | "sore"
  | "beat_up"
  | "very_fatigued"
  | "low_motivation"
  | "sharp"
  | "flat"
  | "unknown";

export type StylePreference =
  | "more_athletic"
  | "less_bodybuilding"
  | "more_explosive"
  | "less_grindy"
  | "more_variety"
  | "more_structure"
  | "simpler"
  | "more_advanced"
  | "lower_impact"
  | "lower_fatigue"
  | "more_game_speed"
  | "cleaner"
  | "sharper"
  | "more_pop"
  | "more_bounce"
  | "less_stiff"
  | "less_boring"
  | "more_performance_bias"
  | "more_hypertrophy_bias";

export type ModificationConcept =
  | "increase"
  | "decrease"
  | "replace"
  | "preserve"
  | "simplify"
  | "intensify"
  | "deload"
  | "rebalance"
  | "shorten"
  | "lengthen"
  | "progress"
  | "regress";

export type ProgramPartReference =
  | "whole_program"
  | "block"
  | "week"
  | "lower_days"
  | "upper_days"
  | "leg_day"
  | "speed_work"
  | "med_ball_work"
  | "finisher"
  | "warm_up"
  | "sprint_work"
  | "mobility"
  | "specific_day";

export interface RequestedChange {
  target: ProgramPartReference | string;
  direction: ModificationConcept;
  concept: string;
  raw: string;
}

export interface PreserveInstruction {
  target: ProgramPartReference | string;
  raw: string;
}

export interface ScheduleConstraint {
  daysPerWeek: number | null;
  sessionDurationMinutes: number | null;
  weekContext: "this_week" | "general" | null;
}

export interface EquipmentConstraint {
  available: string[];
  unavailable: string[];
}

export interface ProgrammingDirective {
  directive: string;
  priority: "high" | "medium" | "low";
  source: string;
}

export interface AmbiguityFlag {
  type: "vague_preference" | "underspecified_target" | "missing_context" | "unclear_intent";
  description: string;
  raw: string;
}

export interface ContradictionFlag {
  description: string;
  conflictA: string;
  conflictB: string;
}

/**
 * AgentIntentProfile — unified structured interpretation of a single user message.
 *
 * This is the primary output of the language system upgrade.
 * It supplements ExtractedConstraints and IntentFamilyResult.
 */
export interface AgentIntentProfile {
  requestType: RequestType;
  primaryGoal: GoalConcept | null;
  secondaryGoals: GoalConcept[];
  requestedChanges: RequestedChange[];
  preserveInstructions: PreserveInstruction[];
  constraints: {
    schedule: ScheduleConstraint;
    equipment: EquipmentConstraint;
    bodyLimitations: string[];
    locationContext: string | null;
  };
  stylePreferences: StylePreference[];
  recoveryState: RecoveryState;
  ambiguityFlags: AmbiguityFlag[];
  contradictions: ContradictionFlag[];
  confidenceScore: number;
  sourceUtterance: string;
  normalizedConcepts: string[];
  programmingDirectives: ProgrammingDirective[];
}

// ─── Concept Dictionaries ─────────────────────────────────────────────────────
//
// Centralized concept grouping. Extend these clusters rather than adding
// scattered phrase checks throughout the codebase.

const GOAL_CLUSTERS: Record<GoalConcept, RegExp[]> = {
  strength: [
    /\b(get stronger|build strength|more strength|stronger|powerlifting|pure strength|max strength|heavy compound|lift heavier|get strong)\b/i,
    /\b(strength (focus|based|training|development|phase|block|bias))\b/i,
  ],
  hypertrophy: [
    /\b(build muscle|gain muscle|more muscle|muscle building|muscle mass|hypertrophy|bulk|size|gains?|add mass)\b/i,
    /\b(bodybuilding|pump|isolation|more muscle mass|get bigger|grow|muscle growth)\b/i,
  ],
  fat_loss: [
    /\b(lose fat|fat loss|weight loss|cut|cutting|lean out|burn fat|drop weight|shred|body comp|body composition|calorie burning|leaner|slim)\b/i,
    /\b(lose weight|drop (some )?weight|get lean|lose (some )?fat)\b/i,
  ],
  athleticism: [
    /\b(more athletic|athletic performance|athletic (focus|development|training)|be more athletic|feel more athletic|improve athleticism|sport performance|game performance)\b/i,
    /\b(move better|move more efficiently|better movement|athletic carryover|translate to (the )?field|translate to (the )?court|translate to (the )?game)\b/i,
  ],
  speed: [
    /\b(get faster|more speed|improve speed|speed work|sprint training|run faster|first step|acceleration|quickness|agility)\b/i,
    /\b(speed (focus|training|development|work)|faster (on the field|off the line|in the game))\b/i,
  ],
  power: [
    /\b(more explosive|more power|explosive (power|training|work)|power development|power (focus|output|bias)|build power|be more explosive)\b/i,
    /\b(plyometric|jump (higher|training)|vertical (jump|leap|power)|rate of force|ballistic|force expression)\b/i,
  ],
  conditioning: [
    /\b(conditioning|cardio|aerobic|gas tank|work capacity|engine|gassed|wind|endurance|stamina)\b/i,
    /\b(get in (better )?shape|game shape|get fit|fitness|cardiovascular|repeat sprint|out of breath|breathing heavy)\b/i,
  ],
  recovery: [
    /\b(recover|recovery|deload|back off|lighter (week|program)|unload|rest week|recovery week|active recovery|restoration)\b/i,
    /\b(let my body recover|give my body a break|recovery phase|easier week)\b/i,
  ],
  movement_quality: [
    /\b(move better|movement quality|better movement|move more efficiently|improve movement|movement (prep|work)|mobility|flexibility|range of motion)\b/i,
    /\b(feel better (moving|in the gym)|less stiff|more fluid|smoother movement|cleaner movement)\b/i,
  ],
  return_to_training: [
    /\b(return to (training|the gym|lifting)|getting back (to|into) training|ease back in|start back|coming back from|rebuild|restart|after (a )?break)\b/i,
    /\b(gradually (return|build|increase|progress)|return gradually|slow build back|build back slowly)\b/i,
  ],
  general_fitness: [
    /\b(general fitness|overall (fitness|health)|stay fit|stay active|general (health|conditioning)|fit and healthy|overall (shape|conditioning))\b/i,
    /\b(be (more )?fit|get in shape|improve (overall )?fitness|general (training|program))\b/i,
  ],
  look_better: [
    /\b(look better|look good|aesthetic|aesthetics|physique|body (image|composition goals?)|look (more )?fit|look (more )?muscular|look (more )?athletic)\b/i,
    /\b(look my best|appearance|how i look|visual (goals?|result))\b/i,
  ],
  feel_better: [
    /\b(feel better|feel (more )?energetic|feel (more )?confident|feel (more )?capable|feel alive|feel good|feel great)\b/i,
    /\b(feel (fresher|sharper|healthier|stronger|lighter)|improve (how i feel|energy levels?|daily energy))\b/i,
  ],
};

const RECOVERY_STATE_CLUSTERS: Record<RecoveryState, RegExp[]> = {
  very_fatigued: [
    /\b(smoked|cooked|fried|toasted|wrecked|hammered|destroyed|annihilated|crushed|beat up|beaten up|run into the ground|exhausted|drained|wiped out|completely drained|totally drained|dead tired)\b/i,
    /\b(i('m| am) (smoked|cooked|fried|toasted|wrecked|beat up|exhausted|drained))\b/i,
  ],
  beat_up: [
    /\b(beat up|banged up|rough shape|not 100|not fully (fresh|recovered)|a bit beat|feeling (rough|beaten|battered|worn))\b/i,
    /\b(body feels? (rough|heavy|sluggish|off)|not at (100|full|my best))\b/i,
  ],
  tired: [
    /\b(tired|fatigued|low energy|not much energy|energy is low|feeling (flat|drained|heavy|sluggish)|running on empty)\b/i,
    /\b(low (motivation|drive|energy)|energy dip|fatigue today|a bit (tired|flat|drained))\b/i,
  ],
  sore: [
    /\b(sore|soreness|still sore|really sore|sore (legs?|arms?|back|shoulders?|chest|body)|body is sore|aching|tender|stiff)\b/i,
    /\b(sore from|haven.t (fully )?recovered|muscles? (are )?(still |pretty |very )?sore|tight and sore)\b/i,
  ],
  low_motivation: [
    /\b(low motivation|no motivation|not motivated|hard to get going|mentally (tired|drained|flat)|don.t (feel like|want to) (train|work out)|struggling to (motivate|get going|get started))\b/i,
    /\b(motivation is low|not feeling it (today|right now)?|want to train but|not into it)\b/i,
  ],
  flat: [
    /\b(feeling flat|flat (today|right now)|legs? (are|feel) (flat|dead|heavy)|feeling (dull|off|not sharp|sluggish))\b/i,
    /\b(just feel flat|performance feels? flat|low output|not clicking)\b/i,
  ],
  fresh: [
    /\b(feeling fresh|feel fresh|fully (fresh|recovered|rested)|well rested|good to go|ready to go|feeling (great|amazing|strong|sharp|good))\b/i,
    /\b(fully recovered|100%|at my best|feeling (energized|sharp|locked in)|ready to train hard)\b/i,
  ],
  sharp: [
    /\b(feeling sharp|sharp (today|right now)|feel (sharp|dialed in|locked in|snappy|crisp|reactive))\b/i,
    /\b(on today|feeling on|snap is there|CNS (feels? )?(good|sharp|dialed|reactive))\b/i,
  ],
  unknown: [],
};

const STYLE_CLUSTERS: Record<StylePreference, RegExp[]> = {
  more_athletic: [
    /\b(more athletic|athletic (feel|focus|vibe|bias|emphasis)|more sport-like|more (performance|sport) (based|focused)|athletic carryover)\b/i,
    /\b(make it (more )?athletic|lean it (toward|to) athletic|more game (relevant|like|speed))\b/i,
  ],
  less_bodybuilding: [
    /\b(less bodybuilding|not (so )?bodybuilding|less isolation|less (pump-chasing|pump work)|less bro|not a bodybuilding (program|style))\b/i,
    /\b(more than just bodybuilding|not (just )?bodybuilding|reduce (the )?bodybuilding (style|bias))\b/i,
  ],
  more_explosive: [
    /\b(more explosive|more (power|pop|snap|bounce|spring|reactivity)|explosive (feel|emphasis|focus)|feel more explosive|more elastic|more reactive|more dynamic)\b/i,
    /\b(more (springy|bouncy|snappy)|feel springy|feel (more )?(bouncy|reactive|elastic|snappy))\b/i,
  ],
  less_grindy: [
    /\b(less grindy|not (so )?grindy|less (grind|grinding)|less heavy (grind|grinding|slog)|feel less like a grind|less (of a )?slog)\b/i,
    /\b(not (so )?(heavy|slow|sluggish|grinding|grinding)|less (brutal|punishing|heavy)|lighter feel|less dense)\b/i,
  ],
  more_variety: [
    /\b(more variety|mix it up|more (variation|variation|variety in)|less (repetitive|boring|same|monotonous)|different exercises|switch things up|more (diverse|different))\b/i,
    /\b(less of the same|change it up|need (some|more) variety|vary (it|the exercises|the movements))\b/i,
  ],
  more_structure: [
    /\b(more structure|better (structure|organization|layout)|more (organized|structured|clear)|clearer (structure|layout|plan))\b/i,
    /\b(needs? (more )?structure|want (more )?structure|structured (approach|feel|program)|more (organized|programmatic))\b/i,
  ],
  simpler: [
    /\b(simpler|simplify|keep it simple|less (complicated|complex|busy)|more straightforward|clean(er)? (program|approach|structure)|pare (it )?down|strip (it )?back|less (stuff|complexity))\b/i,
    /\b(not (so )?complicated|easier to follow|more manageable|less busy|simplify (it|this))\b/i,
  ],
  more_advanced: [
    /\b(more advanced|step it up|level up|more (complex|sophisticated|technical|challenging)|higher (level|complexity))\b/i,
    /\b(advanced (program|approach|version|feel)|graduate (the program|it|this))\b/i,
  ],
  lower_impact: [
    /\b(lower (impact|stress)|low impact|joint (friendly|safe)|easy on (my|the) joints?|reduce (joint|impact) (stress|load))\b/i,
    /\b(less (pounding|impact|joint stress|wear and tear)|gentler (on the body|on joints?))\b/i,
  ],
  lower_fatigue: [
    /\b(lower (fatigue|neural demand|CNS demand|systemic stress)|reduce fatigue|less fatiguing|easier to recover from|more recoverable|less demanding on recovery)\b/i,
    /\b(don.t (crush|destroy|demolish|annihilate) me|don.t want to get (crushed|destroyed|hammered)|without getting (crushed|wrecked|killed))\b/i,
  ],
  more_game_speed: [
    /\b(more game.?speed|game (speed|pace|tempo)|at game speed|game-like|sport-speed|training speed)\b/i,
    /\b(more like (the )?game|feel like (the )?game|transfer to (the )?game)\b/i,
  ],
  cleaner: [
    /\b(cleaner|clean(er)? (program|movements|exercises|sessions?|structure)|more (clean|refined|polished|crisp))\b/i,
    /\b(cleaner feel|cleaner (approach|movements|execution)|neater (program|layout))\b/i,
  ],
  sharper: [
    /\b(sharper|feel sharper|more (sharp|crisp|snappy|precise|dialed)|sharper (movements|execution|feel))\b/i,
    /\b(sharper not smoked|sharp (and )?not (smoked|cooked|fried|wrecked))\b/i,
  ],
  more_pop: [
    /\b(more pop|more (bounce|spring|snap|springiness|elasticity)|more reactive|add (pop|bounce|snap|spring))\b/i,
    /\b(feel (more )?(springy|bouncy|reactive|snappy|elastic)|feel (more )?alive|more explosive (feel|quality))\b/i,
  ],
  more_bounce: [
    /\b(more bounce|feel (more )?(bouncy|light|airy|elastic)|more (elastic|springy|light on feet|bouncy))\b/i,
  ],
  less_stiff: [
    /\b(less (stiff|stiffness|rigid|tight)|move (more )?freely|loosen (up|me up)|reduce (stiffness|tightness|rigidity)|less locked up|feel (looser|less stiff|more fluid|more mobile))\b/i,
  ],
  less_boring: [
    /\b(less boring|not (so )?boring|more (interesting|engaging|fun|enjoyable|exciting)|spice (it )?up|more (fun|enjoyable)|not as (dull|repetitive|bland))\b/i,
  ],
  more_performance_bias: [
    /\b(more (performance|performance.?based|performance.?focused|sport.?performance|high.?performance))\b/i,
    /\b(performance (bias|emphasis|focus)|bias (toward|to) performance|performance (first|priority))\b/i,
  ],
  more_hypertrophy_bias: [
    /\b(more (hypertrophy|muscle building|mass building|size)|shift toward (hypertrophy|muscle)|hypertrophy (bias|emphasis|first))\b/i,
  ],
};

const PRESERVE_TOKENS: RegExp[] = [
  /\b(keep|leave|don.t (remove|change|touch|alter|mess with)|preserve|maintain|hold on to|hang on to|same|unchanged|as.is|intact|don.t lose|make sure to keep|don.t drop|keep in)\b/i,
];

const PROGRAM_PART_MAP: Array<{ part: ProgramPartReference; patterns: RegExp[] }> = [
  { part: "lower_days", patterns: [/\b(lower (body |day[s]?|session[s]?)|lower day[s]?|the lower day[s]?|lower work|legs? day[s]?)\b/i] },
  { part: "upper_days", patterns: [/\b(upper (body |day[s]?|session[s]?)|upper day[s]?|the upper day[s]?|upper work)\b/i] },
  { part: "leg_day", patterns: [/\b(leg day|leg session|the leg day|legs? day)\b/i] },
  { part: "speed_work", patterns: [/\b(speed work|speed (session|day|training)|the speed (work|day)|sprint work|acceleration work)\b/i] },
  { part: "med_ball_work", patterns: [/\b(med(icine)? ball (work|training|drills?|exercises?)|the med ball (work|stuff)|med ball)\b/i] },
  { part: "finisher", patterns: [/\b(finisher[s]?|the finisher|conditioning finisher|burnout|metabolic finisher)\b/i] },
  { part: "warm_up", patterns: [/\b(warm.?up|warmup|warm up (work|routine|block)|the warm.?up|prep work|activation)\b/i] },
  { part: "sprint_work", patterns: [/\b(sprint work|sprinting|the sprint (work|sessions?|training)|sprint (training|day))\b/i] },
  { part: "mobility", patterns: [/\b(mobility (work|session|day|training)|the mobility (work|stuff)|flexibility work|movement prep)\b/i] },
  { part: "block", patterns: [/\b(this block|current block|the block|this (phase|cycle)|the (phase|cycle))\b/i] },
  { part: "week", patterns: [/\b(this week|the week|current week|weekly)\b/i] },
  { part: "whole_program", patterns: [/\b(the (whole|entire|full) program|all (of it|sessions?|days?)|everything|the whole thing|overall)\b/i] },
];

const MODIFICATION_VERBS: Array<{ direction: ModificationConcept; patterns: RegExp[] }> = [
  { direction: "increase", patterns: [/\b(add|more|increase|add (more )?|crank up|ramp up|step up|level up|add in|include more|build in more|extra)\b/i] },
  { direction: "decrease", patterns: [/\b(reduce|less|decrease|tone down|dial (back|down)|cut (down|back)|lower|trim|scale back|pull back|reduce the|cut the|fewer|less of)\b/i] },
  { direction: "replace", patterns: [/\b(replace|swap (out)?|switch|sub(stitute)?|change (out)?|instead of|in place of)\b/i] },
  { direction: "simplify", patterns: [/\b(simplify|simplify (it|this)|simpler|keep it simple|strip (back|down)|pare (down|back))\b/i] },
  { direction: "intensify", patterns: [/\b(intensify|harder|tougher|more intense|more demanding|more challenging|push harder|step (it )?up)\b/i] },
  { direction: "deload", patterns: [/\b(deload|back off|unload|light(en) (it )?up|ease (off|back|up))\b/i] },
  { direction: "rebalance", patterns: [/\b(rebalance|restructure|reorganize|redistribute|shift emphasis|change the balance)\b/i] },
  { direction: "shorten", patterns: [/\b(shorter|shorten|cut (it )?short|compress|trim (it )?down|reduce (the )?duration)\b/i] },
  { direction: "lengthen", patterns: [/\b(longer|lengthen|extend|add (more )?time|expand|more work in)\b/i] },
  { direction: "preserve", patterns: [/\b(keep|leave|preserve|maintain|same|don.t change|don.t touch|hold on to|keep (the )?same)\b/i] },
  { direction: "progress", patterns: [/\b(progress|advance|level up|step up|harder version|next level|more advanced)\b/i] },
  { direction: "regress", patterns: [/\b(regress|easier version|step down|scale back|simpler version|back off)\b/i] },
];

// ─── Layer 1: Normalization ───────────────────────────────────────────────────

/**
 * Normalize a raw user message into a cleaned lowercase string and
 * return a list of recognized concept tokens for audit.
 */
export function normalizeMessage(raw: string): { normalized: string; concepts: string[] } {
  let normalized = raw.toLowerCase().trim();

  // Collapse extra whitespace
  normalized = normalized.replace(/\s+/g, " ");

  // Expand common contractions and shorthand
  normalized = normalized
    .replace(/\bi'm\b/g, "i am")
    .replace(/\bdon't\b/g, "do not")
    .replace(/\bcan't\b/g, "cannot")
    .replace(/\bwon't\b/g, "will not")
    .replace(/\bdidn't\b/g, "did not")
    .replace(/\bwasn't\b/g, "was not")
    .replace(/\bhaven't\b/g, "have not")
    .replace(/\bhad't\b/g, "had not")
    .replace(/\bit's\b/g, "it is")
    .replace(/\bthat's\b/g, "that is")
    .replace(/\blet's\b/g, "let us");

  // Common typo corrections for high-frequency coaching terms
  normalized = normalized
    .replace(/\bexpolsive\b/g, "explosive")
    .replace(/\bexpolsiveness\b/g, "explosiveness")
    .replace(/\bexercies\b/g, "exercises")
    .replace(/\bstregth\b/g, "strength")
    .replace(/\bhypertrophe\b/g, "hypertrophy")
    .replace(/\bexerices\b/g, "exercises")
    .replace(/\bsession[s]?\b/g, (m) => m)
    .replace(/\bplyo[s]?\b/g, "plyometrics")
    .replace(/\bplyos\b/g, "plyometrics");

  // Slang / metaphor normalization into recognizable coaching terms
  const slangMap: Array<[RegExp, string]> = [
    // Explosive / power synonyms
    [/\b(springy|bouncy|pop|snap|snappy)\b/g, "elastic explosive"],
    [/\bmore (bounce|spring)\b/g, "more explosive elastic"],
    [/\b(game.speed|game speed)\b/g, "game-speed explosive"],

    // Fatigue state synonyms
    [/\b(smoked|cooked|fried|toasted|wrecked|hammered|toast|nuked)\b/g, "very fatigued exhausted"],
    [/\bbeat.?up\b/g, "beat up fatigued"],
    [/\b(gassed|gassed out)\b/g, "fatigued low energy"],
    [/\b(flat today|feeling flat)\b/g, "flat low energy"],

    // Style synonyms
    [/\b(grindy|grinder|slog|sluggish)\b/g, "grindy fatiguing"],
    [/\bless grindy\b/g, "less grindy reduce fatigue"],
    [/\b(cleaner|crisp|clean)\b/g, "cleaner simpler"],
    [/\bsharper\b/g, "sharper more reactive"],

    // Preservation
    [/\bsame vibe\b/g, "same vibe preserve feel preserve structure"],
    [/\bkeep the vibe\b/g, "preserve vibe preserve structure"],
    [/\bkeep the feel\b/g, "preserve feel preserve structure"],
  ];

  for (const [pattern, replacement] of slangMap) {
    normalized = normalized.replace(pattern, replacement);
  }

  // Extract recognized concept tokens
  const concepts: string[] = [];
  for (const [goal, patterns] of Object.entries(GOAL_CLUSTERS)) {
    if (patterns.some((p) => p.test(normalized))) concepts.push(`goal:${goal}`);
  }
  for (const [state, patterns] of Object.entries(RECOVERY_STATE_CLUSTERS)) {
    if (state !== "unknown" && patterns.some((p) => p.test(normalized))) concepts.push(`recovery:${state}`);
  }
  for (const [style, patterns] of Object.entries(STYLE_CLUSTERS)) {
    if (patterns.some((p) => p.test(normalized))) concepts.push(`style:${style}`);
  }
  for (const { part, patterns } of PROGRAM_PART_MAP) {
    if (patterns.some((p) => p.test(normalized))) concepts.push(`part:${part}`);
  }
  if (PRESERVE_TOKENS.some((p) => p.test(normalized))) concepts.push("has:preservation_signal");

  return { normalized, concepts };
}

// ─── Layer 2: Structured Extraction ──────────────────────────────────────────

/**
 * Detect request type from normalized message.
 */
function detectRequestType(normalized: string, hasActiveProgram: boolean): RequestType {
  const createSignals = /\b(build|create|design|generate|make me a|give me a|write|put together|develop)\b.{0,50}\b(program|plan|routine|workout|split|schedule|training)\b/i;
  const editSignals = /\b(make it|change|adjust|modify|update|switch|tweak|add|remove|replace|swap|reduce|increase|shorten|lengthen)\b/i;
  const preserveSignals = /\b(keep|leave|preserve|don.t (remove|change|touch)|maintain|same|unchanged)\b/i;
  const recoverySignals = /\b(deload|lighter|rest|recover|back off|easy week|smoked|cooked|fried|exhausted|beat up|too tired)\b/i;
  const painSignals = /\b(pain|hurts?|aching|injury|sore|bothering|knee|shoulder|back|hip|wrist|ankle)\b/i;
  const questionSignals = /^(what|how|why|should|can|is|are|do|does|will|would|which)\b/i;

  if (questionSignals.test(normalized.trim())) return "ask_question";
  if (createSignals.test(normalized) && !hasActiveProgram) return "create_program";
  if (recoverySignals.test(normalized)) return "adjust_recovery";
  if (painSignals.test(normalized)) return "adjust_pain";
  if (preserveSignals.test(normalized) && editSignals.test(normalized)) return "preserve_and_modify";
  if (editSignals.test(normalized) && hasActiveProgram) return "modify_program";
  if (createSignals.test(normalized)) return "create_program";

  return "unclear";
}

/**
 * Detect primary and secondary goals from normalized message.
 */
function detectGoals(normalized: string): { primary: GoalConcept | null; secondary: GoalConcept[] } {
  const matched: GoalConcept[] = [];

  for (const [goal, patterns] of Object.entries(GOAL_CLUSTERS)) {
    if (patterns.some((p) => p.test(normalized))) {
      matched.push(goal as GoalConcept);
    }
  }

  if (matched.length === 0) return { primary: null, secondary: [] };

  // Priority order for primary goal selection
  const priority: GoalConcept[] = [
    "recovery", "return_to_training", "fat_loss", "strength", "power",
    "speed", "athleticism", "conditioning", "hypertrophy", "movement_quality",
    "general_fitness", "look_better", "feel_better",
  ];

  let primary: GoalConcept | null = null;
  for (const p of priority) {
    if (matched.includes(p)) { primary = p; break; }
  }
  if (!primary) primary = matched[0];

  const secondary = matched.filter((g) => g !== primary);

  return { primary, secondary };
}

/**
 * Detect recovery/fatigue state from normalized message.
 */
function detectRecoveryState(normalized: string): RecoveryState {
  for (const [state, patterns] of Object.entries(RECOVERY_STATE_CLUSTERS)) {
    if (state !== "unknown" && patterns.some((p) => p.test(normalized))) {
      return state as RecoveryState;
    }
  }
  return "unknown";
}

/**
 * Detect style preferences from normalized message.
 */
function detectStylePreferences(normalized: string): StylePreference[] {
  const found: StylePreference[] = [];
  for (const [style, patterns] of Object.entries(STYLE_CLUSTERS)) {
    if (patterns.some((p) => p.test(normalized))) {
      found.push(style as StylePreference);
    }
  }
  return found;
}

/**
 * Detect preservation instructions from normalized message.
 */
function detectPreserveInstructions(normalized: string, raw: string): PreserveInstruction[] {
  const instructions: PreserveInstruction[] = [];

  if (!PRESERVE_TOKENS.some((p) => p.test(normalized))) return instructions;

  // Check for "keep the vibe / same vibe / keep the feel"
  if (/\b(same vibe|keep the vibe|keep the feel|same feel|keep the energy|same energy|keep the identity|same identity)\b/i.test(raw)) {
    instructions.push({ target: "whole_program", raw: "preserve overall feel and identity" });
  }

  // Check for "keep the structure"
  if (/\b(keep the structure|same structure|same (split|layout)|keep the (split|layout|rhythm|weekly (rhythm|structure)))\b/i.test(raw)) {
    instructions.push({ target: "whole_program", raw: "preserve program structure" });
  }

  // Check each program part for preservation language
  for (const { part, patterns: partPatterns } of PROGRAM_PART_MAP) {
    for (const partPattern of partPatterns) {
      if (!partPattern.test(raw)) continue;
      // Look for a preservation verb near this part reference
      const preserveNearby = new RegExp(
        `(keep|leave|preserve|maintain|don.t (remove|change|touch)|same|unchanged).{0,30}${partPattern.source}|${partPattern.source}.{0,30}(keep|leave|preserve|maintain|don.t (remove|change|touch)|same|unchanged)`,
        "i"
      );
      if (preserveNearby.test(raw)) {
        instructions.push({ target: part, raw: `preserve ${part}` });
      }
    }
  }

  // "I liked the last program except day X" pattern
  if (/\b(liked|like|enjoyed|preferred|loved).{0,20}(the last|the previous|the old|my old|my last|that).{0,20}(program|plan|routine|block|week)\b/i.test(raw)) {
    const exceptMatch = raw.match(/except (.{3,60}?)(\.|,|$)/i);
    instructions.push({
      target: "whole_program",
      raw: exceptMatch
        ? `preserve most of the program except: ${exceptMatch[1].trim()}`
        : "preserve most of the program",
    });
  }

  // "keep upper body the same" / "leave the upper days alone"
  if (/\b(keep|leave).{0,20}upper.{0,30}(same|alone|as.?is|unchanged|intact)\b/i.test(raw)) {
    instructions.push({ target: "upper_days", raw: "preserve upper body days" });
  }
  if (/\b(keep|leave).{0,20}lower.{0,30}(same|alone|as.?is|unchanged|intact)\b/i.test(raw)) {
    instructions.push({ target: "lower_days", raw: "preserve lower body days" });
  }

  // Deduplicate by target
  const seen = new Set<string>();
  return instructions.filter((i) => {
    if (seen.has(i.target)) return false;
    seen.add(i.target);
    return true;
  });
}

/**
 * Detect requested changes from normalized message.
 */
function detectRequestedChanges(normalized: string, raw: string): RequestedChange[] {
  const changes: RequestedChange[] = [];

  for (const { direction, patterns: dirPatterns } of MODIFICATION_VERBS) {
    for (const dirPattern of dirPatterns) {
      if (!dirPattern.test(normalized)) continue;

      // Find what concept is being modified nearby
      for (const { part, patterns: partPatterns } of PROGRAM_PART_MAP) {
        for (const partPattern of partPatterns) {
          if (!partPattern.test(raw)) continue;
          // Check both verb-before-target and target-before-verb patterns
          const combined = new RegExp(
            `${dirPattern.source}.{0,40}${partPattern.source}|${partPattern.source}.{0,40}${dirPattern.source}`,
            "i"
          );
          if (combined.test(raw)) {
            changes.push({ target: part, direction, concept: part, raw: `${direction} ${part}` });
          }
        }
      }

      // Style-level changes
      for (const [style, stylePatterns] of Object.entries(STYLE_CLUSTERS)) {
        if (stylePatterns.some((p) => p.test(raw))) {
          const alreadyAdded = changes.some((c) => c.concept === style);
          if (!alreadyAdded) {
            changes.push({ target: "whole_program", direction, concept: style, raw: `${direction} ${style}` });
          }
        }
      }

      break; // Only match one direction pattern per direction type
    }
  }

  // Deduplicate
  const seen = new Set<string>();
  return changes.filter((c) => {
    const key = `${c.direction}:${c.concept}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  }).slice(0, 10); // Cap to prevent noise
}

/**
 * Detect schedule constraints from normalized message.
 */
function detectScheduleConstraints(normalized: string): ScheduleConstraint {
  let daysPerWeek: number | null = null;
  const dayMatch = normalized.match(/\b(\d)\s*(?:days?|sessions?|times?)\s*(?:a|per)\s*week\b/i)
    ?? normalized.match(/\b(?:only|just|can)?.{0,10}(\d)\s*days?\b/i);
  if (dayMatch) {
    const raw = parseInt(dayMatch[1], 10);
    if (raw >= 1 && raw <= 7) daysPerWeek = raw;
  }

  let sessionDurationMinutes: number | null = null;
  const durMatch = normalized.match(/\b(\d{2,3})\s*(?:minutes?|mins?)\b/i)
    ?? normalized.match(/\b(\d)\s*hours?\b/i);
  if (durMatch) {
    const raw = parseInt(durMatch[1], 10);
    const isHour = /hour/.test(durMatch[0]);
    const minutes = isHour ? raw * 60 : raw;
    if (minutes >= 10 && minutes <= 180) sessionDurationMinutes = minutes;
  }

  // Week context: "this week" vs general
  const weekContext: ScheduleConstraint["weekContext"] =
    /\bthis week\b/i.test(normalized) ? "this_week"
    : daysPerWeek !== null || sessionDurationMinutes !== null ? "general"
    : null;

  return { daysPerWeek, sessionDurationMinutes, weekContext };
}

/**
 * Detect equipment constraints from normalized message.
 */
function detectEquipmentConstraints(normalized: string): EquipmentConstraint {
  const available: string[] = [];
  const unavailable: string[] = [];

  const equipmentMap: Array<{ name: string; havePatterns: RegExp[]; noHavePatterns: RegExp[] }> = [
    {
      name: "barbell",
      havePatterns: [/\b(barbell|squat rack|power rack)\b/i],
      noHavePatterns: [/\b(no barbell|no rack|no squat rack|no power rack|without (a )?barbell|barbell.{0,10}available)\b/i],
    },
    {
      name: "dumbbells",
      havePatterns: [/\b(dumbbells?|dumbbells? only|only dumbbells?)\b/i],
      noHavePatterns: [/\b(no dumbbells?)\b/i],
    },
    {
      name: "gym",
      havePatterns: [/\b(full gym|gym access|commercial gym|at the gym)\b/i],
      noHavePatterns: [/\b(no gym|hotel|traveling|at home|home gym|minimal equipment|limited equipment)\b/i],
    },
    {
      name: "cables",
      havePatterns: [/\b(cable (machine|station|system)|cables)\b/i],
      noHavePatterns: [/\b(no cables?)\b/i],
    },
    {
      name: "kettlebells",
      havePatterns: [/\b(kettlebell[s]?)\b/i],
      noHavePatterns: [/\b(no kettlebells?)\b/i],
    },
    {
      name: "resistance_bands",
      havePatterns: [/\b(resistance bands?|bands? only|bands)\b/i],
      noHavePatterns: [/\b(no bands?)\b/i],
    },
  ];

  for (const { name, havePatterns, noHavePatterns } of equipmentMap) {
    if (noHavePatterns.some((p) => p.test(normalized))) {
      unavailable.push(name);
    } else if (havePatterns.some((p) => p.test(normalized))) {
      available.push(name);
    }
  }

  return { available, unavailable };
}

/**
 * Detect body limitation signals from normalized message.
 */
function detectBodyLimitations(raw: string): string[] {
  const limitations: string[] = [];
  const bodyPartPatterns: Array<[RegExp, string]> = [
    [/\b(knee|knees?).{0,20}(hurt|pain|sore|bothering|aching|issue|problem|bad)\b/i, "knee pain/limitation"],
    [/\b(shoulder|shoulders?).{0,20}(hurt|pain|sore|bothering|aching|issue|problem|bad)\b/i, "shoulder pain/limitation"],
    [/\b(back|lower back|lumbar).{0,20}(hurt|pain|sore|bothering|aching|issue|problem|bad)\b/i, "back pain/limitation"],
    [/\b(hip|hips?).{0,20}(hurt|pain|sore|bothering|aching|issue|problem|bad)\b/i, "hip pain/limitation"],
    [/\b(ankle|ankles?).{0,20}(hurt|pain|sore|bothering|aching|issue|problem|bad)\b/i, "ankle pain/limitation"],
    [/\b(wrist|wrists?).{0,20}(hurt|pain|sore|bothering|aching|issue|problem|bad)\b/i, "wrist pain/limitation"],
    [/\b(elbow|elbows?).{0,20}(hurt|pain|sore|bothering|aching|issue|problem|bad)\b/i, "elbow pain/limitation"],
    [/\b(easy on (my|the) knees?)\b/i, "knee sensitive - reduce knee stress"],
    [/\b(easy on (my|the) (shoulder|back|hip|ankle)s?)\b/i, "joint sensitive"],
  ];
  for (const [pattern, label] of bodyPartPatterns) {
    if (pattern.test(raw)) limitations.push(label);
  }
  return limitations;
}

// ─── Layer 4: Ambiguity & Contradiction Detection ─────────────────────────────

function detectAmbiguities(
  normalized: string,
  raw: string,
  profile: Partial<AgentIntentProfile>
): AmbiguityFlag[] {
  const flags: AmbiguityFlag[] = [];

  // Vague preference: "make it better", "improve it", "fix it" with no specific target
  if (/\b(make it better|improve it|fix it|make it good|make it great|make it work)\b/i.test(raw)) {
    const hasSpecificTarget = profile.requestedChanges && profile.requestedChanges.length > 0;
    if (!hasSpecificTarget) {
      flags.push({ type: "vague_preference", description: "Vague improvement request with no specific target", raw: raw.slice(0, 80) });
    }
  }

  // Underspecified target: preserve instruction present but no target resolved
  if (profile.preserveInstructions && profile.preserveInstructions.length > 0) {
    const hasVaguePreserve = profile.preserveInstructions.some((i) => i.target === "whole_program" && !i.raw.includes("except"));
    if (hasVaguePreserve && profile.requestedChanges && profile.requestedChanges.length === 0) {
      flags.push({ type: "underspecified_target", description: "Preservation language used but no specific change requested — unclear what to change vs keep", raw: raw.slice(0, 80) });
    }
  }

  // Unclear intent: very short message with no clear signals
  if (raw.trim().split(/\s+/).length <= 3 && profile.requestType === "unclear") {
    flags.push({ type: "unclear_intent", description: "Very short message with no clear intent signals", raw: raw.trim() });
  }

  return flags;
}

function detectContradictions(
  profile: Partial<AgentIntentProfile>
): ContradictionFlag[] {
  const flags: ContradictionFlag[] = [];

  // "more volume" + "shorter sessions" + "less fatigue"
  const wantsMoreVolume = profile.requestedChanges?.some((c) => c.direction === "increase" && c.concept.includes("volume"));
  const wantsShorter = profile.constraints?.schedule.sessionDurationMinutes !== null &&
    profile.requestedChanges?.some((c) => c.direction === "shorten");
  const wantsLessFatigue = profile.stylePreferences?.includes("lower_fatigue") ||
    profile.requestedChanges?.some((c) => c.direction === "decrease" && c.concept.includes("fatigue"));

  if (wantsMoreVolume && wantsShorter) {
    flags.push({ description: "Requested more volume but also shorter sessions — these conflict", conflictA: "more volume", conflictB: "shorter sessions" });
  }
  if (wantsMoreVolume && wantsLessFatigue) {
    flags.push({ description: "Requested more volume but also less fatigue — tradeoff exists", conflictA: "more volume", conflictB: "less fatigue" });
  }

  // "same vibe but different everything"
  const wantsPreserve = (profile.preserveInstructions?.length ?? 0) > 0;
  const wantsLargeChanges = (profile.requestedChanges?.length ?? 0) >= 3;
  const preservesEverything = profile.preserveInstructions?.some((i) => i.target === "whole_program");
  if (wantsPreserve && preservesEverything && wantsLargeChanges) {
    flags.push({ description: "Requesting to preserve everything while also requesting many changes — contradiction", conflictA: "preserve whole program", conflictB: "multiple large changes" });
  }

  // Strength + cardio/conditioning as primary + secondary goal
  const primaryIsStrength = profile.primaryGoal === "strength";
  const hasConditioningGoal = profile.secondaryGoals?.includes("conditioning") || profile.secondaryGoals?.includes("fat_loss");
  if (primaryIsStrength && hasConditioningGoal) {
    // Not a contradiction per se, but worth flagging as a tradeoff
    flags.push({ description: "Strength + conditioning/fat loss — tradeoff in session design (rest periods, volume bias)", conflictA: "strength (low rep, long rest)", conflictB: "conditioning/fat loss (short rest, high density)" });
  }

  return flags;
}

// ─── Layer 3: Programming Directive Translation ───────────────────────────────

function translateToProgrammingDirectives(
  profile: Omit<AgentIntentProfile, "programmingDirectives">
): ProgrammingDirective[] {
  const directives: ProgrammingDirective[] = [];

  // Style → Programming directives
  const styleDirectiveMap: Partial<Record<StylePreference, ProgrammingDirective>> = {
    more_athletic: {
      directive: "Increase power/movement quality/performance bias. Reduce bodybuilding isolation bias. Favor multi-directional, elastic, and rotational movements. Add speed or reactive elements where appropriate.",
      priority: "high",
      source: "style:more_athletic",
    },
    less_bodybuilding: {
      directive: "Reduce isolation exercise volume. Replace single-joint movements with multi-joint athletic patterns. Reduce pump-chasing rep ranges (15+). Bias toward compound, functional, and performance-focused movements.",
      priority: "high",
      source: "style:less_bodybuilding",
    },
    less_grindy: {
      directive: "Reduce high-fatigue bilateral grinding (e.g., heavy barbell-only clusters). Reduce excessive density. Increase movement variety and velocity intent. Favor cleaner movement selection over pure loading volume.",
      priority: "high",
      source: "style:less_grindy",
    },
    more_explosive: {
      directive: "Add plyometric or ballistic movements to session openers. Increase power rep ranges (1-5 reps at high intent). Add velocity cues (3-1-X-0 tempo on primary lifts). Include elastic and reactive exercises.",
      priority: "high",
      source: "style:more_explosive",
    },
    cleaner: {
      directive: "Simplify exercise selection. Reduce redundant accessory work. Ensure each exercise has a clear purpose. Remove exercises that don't fit the session identity. Prefer fewer, higher-quality movements.",
      priority: "medium",
      source: "style:cleaner",
    },
    simpler: {
      directive: "Reduce complexity. Remove exercises beyond what is essential. Limit exercise count to 4-6 per session. Prefer well-known, reliable movement patterns over complex variations.",
      priority: "medium",
      source: "style:simpler",
    },
    lower_fatigue: {
      directive: "Lower neural demand. Reduce bilateral grinding and high-fatigue patterns. Extend rest periods. Reduce session density. Prefer easier completion over maximal output. Avoid max-effort intensity on primary lifts.",
      priority: "high",
      source: "style:lower_fatigue",
    },
    more_pop: {
      directive: "Add elastic, springy, and reactive elements. Include low-load plyometrics, hurdle hops, or band resisted jumps. Prioritize force expression over force production. Add velocity-based cues.",
      priority: "medium",
      source: "style:more_pop",
    },
    sharper: {
      directive: "Improve movement quality and reactivity. Add reactive drills or fast-tempo work. Reduce fatigue-accumulating volume. Prioritize sharp, intentional reps over grinding through fatigue.",
      priority: "medium",
      source: "style:sharper",
    },
    more_game_speed: {
      directive: "Incorporate movements at sport-relevant velocities. Add reactive, multi-directional, and game-speed drills. Reduce maximal strength emphasis in favor of speed-strength continuum work.",
      priority: "high",
      source: "style:more_game_speed",
    },
    more_variety: {
      directive: "Rotate exercise selection within the same movement patterns. Use exercise variation to prevent staleness. Introduce 1-2 novel exercises while keeping the structural core intact.",
      priority: "medium",
      source: "style:more_variety",
    },
    lower_impact: {
      directive: "Replace high-impact bilateral exercises (e.g., barbell back squat, bilateral jumps) with lower-impact alternatives (e.g., box step-up, leg press, unilateral squat variations). Avoid heavy eccentric loading in aggravating patterns.",
      priority: "high",
      source: "style:lower_impact",
    },
  };

  for (const style of profile.stylePreferences) {
    const directive = styleDirectiveMap[style];
    if (directive) directives.push(directive);
  }

  // Recovery state → Programming directives
  const recoveryDirectiveMap: Partial<Record<RecoveryState, ProgrammingDirective>> = {
    very_fatigued: {
      directive: "LOWER FATIGUE CEILING ACTIVE: Reduce volume 30-40%. Avoid max-effort or near-maximal intensity. Lower neural demand. Prefer easier completion over performance. Consider triggering lighter-day or deload logic instead of a full session rewrite.",
      priority: "high",
      source: "recovery:very_fatigued",
    },
    beat_up: {
      directive: "REDUCED READINESS: Reduce volume 15-20%. Reduce intensity on primary lifts. Avoid explosive or high-CNS-demand work. Keep the session shorter. Allow more rest.",
      priority: "high",
      source: "recovery:beat_up",
    },
    tired: {
      directive: "LOW ENERGY STATE: Moderate volume reduction (10-15%). Avoid max-effort sets. Prioritize movement quality over intensity. Allow extra rest if needed.",
      priority: "medium",
      source: "recovery:tired",
    },
    sore: {
      directive: "RESIDUAL SORENESS: Avoid re-loading the sore muscle group at high intensity. Prioritize blood flow and movement quality. Consider substituting high-load exercises for lighter alternatives in the affected region.",
      priority: "medium",
      source: "recovery:sore",
    },
    low_motivation: {
      directive: "LOW MOTIVATION: Reduce session complexity. Prioritize enjoyable or familiar exercises. Keep the session shorter than planned. Build confidence through achievable targets.",
      priority: "medium",
      source: "recovery:low_motivation",
    },
    flat: {
      directive: "FLAT PERFORMANCE STATE: Reduce intensity on power/speed work. Avoid CNS-demanding movements first (plyometrics, max effort). Prioritize movement quality and moderate intensity.",
      priority: "medium",
      source: "recovery:flat",
    },
    fresh: {
      directive: "FRESH AND READY: Full session intensity appropriate. Good session for testing heavier loads or pushing volume. CNS-demanding work (power, heavy compound) well-timed.",
      priority: "low",
      source: "recovery:fresh",
    },
    sharp: {
      directive: "SHARP AND REACTIVE: Excellent session for power, speed, or high-skill work. CNS is primed. Good session for maximal effort or technical practice.",
      priority: "low",
      source: "recovery:sharp",
    },
  };

  if (profile.recoveryState !== "unknown") {
    const directive = recoveryDirectiveMap[profile.recoveryState];
    if (directive) directives.push(directive);
  }

  // Goal → Programming directives
  const goalDirectiveMap: Partial<Record<GoalConcept, ProgrammingDirective>> = {
    power: {
      directive: "Increase power/force-expression emphasis. Add explosive openers (plyometrics, jumps, throws). Shift primary lift rep ranges to 2-5 with maximal intent. Extend rest for CNS recovery (2-3 min). Reduce pure hypertrophy accessories.",
      priority: "high",
      source: "goal:power",
    },
    speed: {
      directive: "Add speed-focused work (sprint mechanics, acceleration drills, change-of-direction). Reduce heavy grinding. Bias toward velocity-based loading. Include elastic and reactive elements.",
      priority: "high",
      source: "goal:speed",
    },
    athleticism: {
      directive: "Bias toward multi-directional, reactive, and sport-transferable movements. Reduce pure bodybuilding isolation. Add movement quality and speed-strength work. Maintain compound strength base.",
      priority: "high",
      source: "goal:athleticism",
    },
    conditioning: {
      directive: "Add energy system work. Include conditioning finishers, interval blocks, or circuit structures. Reduce rest to elevate heart rate response. Target sport-relevant energy system demands.",
      priority: "high",
      source: "goal:conditioning",
    },
    movement_quality: {
      directive: "Add mobility and activation work. Prioritize movement prep at session start. Include unilateral and stability exercises. Reduce heavy bilateral grinding that compromises movement quality.",
      priority: "medium",
      source: "goal:movement_quality",
    },
    recovery: {
      directive: "Reduce volume and intensity significantly. Add low-intensity movement or restoration work. Prioritize mobility, blood flow, and nervous system recovery. Keep all exercise sub-maximal.",
      priority: "high",
      source: "goal:recovery",
    },
  };

  if (profile.primaryGoal) {
    const directive = goalDirectiveMap[profile.primaryGoal];
    if (directive) directives.push(directive);
  }

  // Preservation → Programming directives
  for (const instruction of profile.preserveInstructions) {
    directives.push({
      directive: `PRESERVE INSTRUCTION: ${instruction.raw}. Do NOT change or remove the specified elements unless the user's change request explicitly overrides this.`,
      priority: "high",
      source: `preserve:${instruction.target}`,
    });
  }

  // Equipment constraints → Programming directives
  if (profile.constraints.equipment.unavailable.length > 0) {
    directives.push({
      directive: `EQUIPMENT CONSTRAINT: User does NOT have access to: ${profile.constraints.equipment.unavailable.join(", ")}. All exercises must use only available equipment.`,
      priority: "high",
      source: "equipment:unavailable",
    });
  }

  // Contradiction handling → Programming directives
  for (const contradiction of profile.contradictions) {
    directives.push({
      directive: `TRADEOFF RESOLUTION: ${contradiction.description}. Prioritize the first-stated intent. Acknowledge the tradeoff in the response if relevant.`,
      priority: "medium",
      source: "contradiction",
    });
  }

  return directives;
}

// ─── Confidence Scoring ───────────────────────────────────────────────────────

function computeConfidenceScore(profile: Omit<AgentIntentProfile, "confidenceScore" | "programmingDirectives">): number {
  let score = 0.5; // baseline

  // More signals = higher confidence
  if (profile.primaryGoal) score += 0.1;
  if (profile.requestType !== "unclear") score += 0.1;
  if (profile.recoveryState !== "unknown") score += 0.05;
  if (profile.stylePreferences.length > 0) score += 0.05;
  if (profile.requestedChanges.length > 0) score += 0.05;
  if (profile.preserveInstructions.length > 0) score += 0.05;
  if (profile.normalizedConcepts.length >= 3) score += 0.05;
  if (profile.constraints.equipment.unavailable.length > 0) score += 0.05;
  if (profile.constraints.schedule.daysPerWeek !== null) score += 0.05;

  // Ambiguity and contradictions reduce confidence
  score -= profile.ambiguityFlags.length * 0.08;
  score -= profile.contradictions.length * 0.05;

  return Math.max(0.05, Math.min(1.0, score));
}

// ─── Main Entry Point ─────────────────────────────────────────────────────────

/**
 * Extract a full AgentIntentProfile from a raw user message.
 *
 * @param rawMessage - The raw user message
 * @param hasActiveProgram - Whether the user has an active program (affects request type detection)
 * @returns AgentIntentProfile with all extracted fields
 */
export function extractAgentIntentProfile(
  rawMessage: string,
  hasActiveProgram: boolean = false
): AgentIntentProfile {
  const { normalized, concepts } = normalizeMessage(rawMessage);

  const requestType = detectRequestType(normalized, hasActiveProgram);
  const { primary: primaryGoal, secondary: secondaryGoals } = detectGoals(normalized);
  const recoveryState = detectRecoveryState(normalized);
  const stylePreferences = detectStylePreferences(normalized);
  const preserveInstructions = detectPreserveInstructions(normalized, rawMessage);
  const requestedChanges = detectRequestedChanges(normalized, rawMessage);

  const constraints = {
    schedule: detectScheduleConstraints(normalized),
    equipment: detectEquipmentConstraints(normalized),
    bodyLimitations: detectBodyLimitations(rawMessage),
    locationContext: /\b(hotel|travel|on the road|traveling|away)\b/i.test(rawMessage) ? "travel"
      : /\b(home|house|apartment)\b/i.test(rawMessage) ? "home"
      : /\b(gym|fitness center)\b/i.test(rawMessage) ? "gym"
      : null,
  };

  const partialProfile: Omit<AgentIntentProfile, "ambiguityFlags" | "contradictions" | "confidenceScore" | "programmingDirectives"> = {
    requestType,
    primaryGoal,
    secondaryGoals,
    requestedChanges,
    preserveInstructions,
    constraints,
    stylePreferences,
    recoveryState,
    sourceUtterance: rawMessage,
    normalizedConcepts: concepts,
  };

  const ambiguityFlags = detectAmbiguities(normalized, rawMessage, partialProfile);
  const contradictions = detectContradictions(partialProfile);

  const preConfidenceBase = { ...partialProfile, ambiguityFlags, contradictions };
  const confidenceScore = computeConfidenceScore(preConfidenceBase);
  const preConfidenceProfile = { ...preConfidenceBase, confidenceScore };

  const programmingDirectives = translateToProgrammingDirectives(preConfidenceProfile);

  return {
    ...preConfidenceProfile,
    confidenceScore,
    programmingDirectives,
  };
}

// ─── AI Prompt Builder ────────────────────────────────────────────────────────

/**
 * Build a prompt section from an AgentIntentProfile for injection into AI prompts.
 * Only emits a section if there are meaningful signals worth injecting.
 */
export function buildAgentIntentProfilePromptSection(profile: AgentIntentProfile): string {
  const lines: string[] = [];

  const hasSignals =
    profile.primaryGoal !== null ||
    profile.stylePreferences.length > 0 ||
    profile.recoveryState !== "unknown" ||
    profile.preserveInstructions.length > 0 ||
    profile.requestedChanges.length > 0 ||
    profile.programmingDirectives.length > 0;

  if (!hasSignals) return "";

  lines.push("## AGENT INTENT PROFILE — LANGUAGE SYSTEM INTERPRETATION");
  lines.push(`Confidence: ${(profile.confidenceScore * 100).toFixed(0)}%`);
  lines.push(`Request type: ${profile.requestType}`);

  if (profile.primaryGoal) lines.push(`Primary goal: ${profile.primaryGoal}`);
  if (profile.secondaryGoals.length > 0) lines.push(`Secondary goals: ${profile.secondaryGoals.join(", ")}`);
  if (profile.recoveryState !== "unknown") lines.push(`Recovery state: ${profile.recoveryState}`);
  if (profile.stylePreferences.length > 0) lines.push(`Style preferences: ${profile.stylePreferences.join(", ")}`);

  if (profile.preserveInstructions.length > 0) {
    lines.push("\nPRESERVATION INSTRUCTIONS (do NOT override unless user explicitly requests it):");
    for (const inst of profile.preserveInstructions) lines.push(`  • ${inst.raw}`);
  }

  if (profile.requestedChanges.length > 0) {
    lines.push("\nREQUESTED CHANGES:");
    for (const change of profile.requestedChanges) {
      lines.push(`  • ${change.direction} → ${change.concept} (target: ${change.target})`);
    }
  }

  if (profile.constraints.equipment.unavailable.length > 0) {
    lines.push(`\nEQUIPMENT NOT AVAILABLE: ${profile.constraints.equipment.unavailable.join(", ")}`);
  }

  if (profile.constraints.bodyLimitations.length > 0) {
    lines.push(`BODY LIMITATIONS: ${profile.constraints.bodyLimitations.join("; ")}`);
  }

  if (profile.contradictions.length > 0) {
    lines.push("\nCONFLICTS DETECTED (use best-judgment resolution):");
    for (const c of profile.contradictions) lines.push(`  ⚠ ${c.description}`);
  }

  if (profile.programmingDirectives.length > 0) {
    lines.push("\nPROGRAMMING DIRECTIVES (apply in priority order):");
    const sorted = [...profile.programmingDirectives].sort((a, b) => {
      const order = { high: 0, medium: 1, low: 2 };
      return order[a.priority] - order[b.priority];
    });
    for (const d of sorted) {
      lines.push(`  [${d.priority.toUpperCase()}] ${d.directive}`);
    }
  }

  return lines.join("\n");
}
