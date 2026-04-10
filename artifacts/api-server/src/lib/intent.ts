// ─── TrainChat Intent Classification Layer ───────────────────────────────────
//
// Phase A of the agent routing architecture.
// Classifies every user message into a structured intent before response generation.
// This is a pure function module — no side effects, no DB calls, no AI calls.

import { logger } from "./logger";

// ─── Intent Types ──────────────────────────────────────────────────────────────

export type IntentType =
  | "CREATE_PROGRAM"
  | "EDIT_PROGRAM"
  | "ADJUST_FOR_READINESS"
  | "ADJUST_FOR_PAIN"
  | "GENERAL_COACHING_QUESTION"
  | "RETRIEVE_CURRENT_PROGRAM"
  | "SAVE_PROGRAM"
  | "START_NEW_PROGRAM";

export interface IntentResult {
  type: IntentType;
  confidence: "high" | "medium" | "low";
  editSubtype?: string;
  metadata?: Record<string, unknown>;
}

export interface ClassificationContext {
  hasActiveProgram: boolean;
  conversationTurnCount: number;
}

// ─── Edit Subtype Classification ────────────────────────────────────────────

export type EditSubtype =
  | "add_core"
  | "add_hamstrings"
  | "add_calves"
  | "add_glutes"
  | "add_upper_back"
  | "add_shoulders"
  | "add_conditioning"
  | "swap_exercise"
  | "remove_exercise"
  | "shorten_sessions"
  | "lengthen_sessions"
  | "reduce_fatigue"
  | "increase_volume"
  | "make_more_athletic"
  | "make_more_strength"
  | "make_more_hypertrophy"
  | "reduce_frequency"
  | "increase_frequency"
  | "structural_edit"
  | "general_modification";

export interface StructuralEditMetadata {
  targetSplit: "full_body" | "upper_lower" | "ppl" | "push_pull" | "unknown";
  targetDays: number | null;
  targetGoalShift: "athletic" | "fat_loss" | "strength" | "hypertrophy" | "conditioning" | null;
  targetSport: string | null;
  preserveExercises: boolean;
}

// ─── Sport Detection ──────────────────────────────────────────────────────────

export function detectSport(lower: string): string | null {
  if (/\b(soccer|football|futbol|pitch)\b/.test(lower)) return "soccer";
  if (/\b(basketball|hoops|court)\b/.test(lower)) return "basketball";
  if (/\b(baseball|softball|pitcher|batter)\b/.test(lower)) return "baseball";
  if (/\b(tennis|racket|racquet)\b/.test(lower)) return "tennis";
  if (/\b(swimming|swim|pool)\b/.test(lower)) return "swimming";
  if (/\b(track|sprint|sprinting|running|runner)\b/.test(lower)) return "track";
  if (/\b(hockey|ice hockey|field hockey)\b/.test(lower)) return "hockey";
  if (/\b(golf)\b/.test(lower)) return "golf";
  if (/\b(mma|jiu.?jitsu|bjj|wrestling|judo|boxing|martial arts|combat)\b/.test(lower)) return "combat_sports";
  if (/\b(volleyball|beach volleyball)\b/.test(lower)) return "volleyball";
  if (/\b(lacrosse)\b/.test(lower)) return "lacrosse";
  if (/\b(rowing|crew)\b/.test(lower)) return "rowing";
  if (/\b(cycling|biking|cyclist)\b/.test(lower)) return "cycling";
  return null;
}

// ─── Main Classifier ────────────────────────────────────────────────────────

export function classifyIntent(
  message: string,
  context: ClassificationContext
): IntentResult {
  const lower = message.toLowerCase().trim();

  // ── Priority 1: SAVE_PROGRAM ─────────────────────────────────────────────
  if (matchesSaveProgram(lower)) {
    logger.debug("[IntentRouter] → SAVE_PROGRAM");
    return { type: "SAVE_PROGRAM", confidence: "high" };
  }

  // ── Priority 2: RETRIEVE_CURRENT_PROGRAM ─────────────────────────────────
  if (matchesRetrieveProgram(lower)) {
    logger.debug("[IntentRouter] → RETRIEVE_CURRENT_PROGRAM");
    return { type: "RETRIEVE_CURRENT_PROGRAM", confidence: "high" };
  }

  // ── Priority 3: START_NEW_PROGRAM ────────────────────────────────────────
  if (matchesStartNewProgram(lower)) {
    logger.debug("[IntentRouter] → START_NEW_PROGRAM");
    return { type: "START_NEW_PROGRAM", confidence: "high" };
  }

  // ── Priority 4: ADJUST_FOR_PAIN ──────────────────────────────────────────
  const painResult = matchesPainAdjustment(lower);
  if (painResult.matched) {
    logger.debug({ bodyPart: painResult.bodyPart }, "[IntentRouter] → ADJUST_FOR_PAIN");
    return {
      type: "ADJUST_FOR_PAIN",
      confidence: painResult.confidence,
      metadata: { bodyPart: painResult.bodyPart },
    };
  }

  // ── Priority 5: ADJUST_FOR_READINESS ─────────────────────────────────────
  const readinessResult = matchesReadinessAdjustment(lower);
  if (readinessResult.matched) {
    logger.debug({ signal: readinessResult.signal }, "[IntentRouter] → ADJUST_FOR_READINESS");
    return {
      type: "ADJUST_FOR_READINESS",
      confidence: readinessResult.confidence,
      metadata: { signal: readinessResult.signal },
    };
  }

  // ── Priority 6a: EDIT_PROGRAM (structural) ───────────────────────────────
  // Run structural detection first — it's more specific and higher stakes
  if (context.hasActiveProgram) {
    const structuralResult = matchesStructuralEdit(lower);
    if (structuralResult.matched) {
      logger.info(
        {
          targetSplit: structuralResult.meta.targetSplit,
          targetDays: structuralResult.meta.targetDays,
          targetGoalShift: structuralResult.meta.targetGoalShift,
        },
        "[IntentRouter] → EDIT_PROGRAM (structural_edit)"
      );
      return {
        type: "EDIT_PROGRAM",
        confidence: structuralResult.confidence,
        editSubtype: "structural_edit",
        metadata: structuralResult.meta as unknown as Record<string, unknown>,
      };
    }
  }

  // ── Priority 6b: EDIT_PROGRAM (atomic) ───────────────────────────────────
  const editResult = matchesEditProgram(lower, context.hasActiveProgram);
  if (editResult.matched) {
    logger.debug({ editSubtype: editResult.subtype, confidence: editResult.confidence }, "[IntentRouter] → EDIT_PROGRAM");
    return {
      type: "EDIT_PROGRAM",
      confidence: editResult.confidence,
      editSubtype: editResult.subtype,
    };
  }

  // ── Priority 7: CREATE_PROGRAM ───────────────────────────────────────────
  const createResult = matchesCreateProgram(lower, context);
  if (createResult.matched) {
    logger.debug("[IntentRouter] → CREATE_PROGRAM");
    return { type: "CREATE_PROGRAM", confidence: createResult.confidence };
  }

  // ── Priority 8: GENERAL_COACHING_QUESTION ────────────────────────────────
  logger.debug("[IntentRouter] → GENERAL_COACHING_QUESTION (default)");
  return { type: "GENERAL_COACHING_QUESTION", confidence: "medium" };
}

// ─── Intent Matchers ─────────────────────────────────────────────────────────

function matchesSaveProgram(lower: string): boolean {
  return /\b(save|save this|save my program|save the program|save it|lock this in|keep this|store (this|my) program)\b/.test(lower);
}

function matchesRetrieveProgram(lower: string): boolean {
  return /\b(show me|show|display|see|view|get|pull up|what('s| is| does| are)|remind me).{0,30}\b(my|the|current|this|existing)\b.{0,20}\b(program|plan|routine|workout|split|schedule)\b/.test(lower)
    || /\b(my (current|existing|active|latest) (program|plan|routine|workout))\b/.test(lower)
    || /\b(what (do|does) (my|the) program look like)\b/.test(lower)
    || /\bshow (me )?(my |the )?(current |active |existing )?program\b/.test(lower);
}

function matchesStartNewProgram(lower: string): boolean {
  return /\b(start (over|fresh|new|from scratch)|new program|fresh (start|program)|reset (my )?(program|plan)|scrap (this|the|it)|let.s start over|start from scratch|completely new)\b/.test(lower)
    && !/\b(add|swap|change|modify|adjust|fix|update)\b/.test(lower);
}

function matchesPainAdjustment(lower: string): {
  matched: boolean;
  confidence: "high" | "medium" | "low";
  bodyPart?: string;
} {
  const bodyPartPatterns: Record<string, RegExp> = {
    shoulder: /\b(shoulder|rotator cuff|ac joint|deltoid)\b/,
    knee: /\b(knee|patellar|patella|mcl|acl|meniscus|kneecap)\b/,
    lower_back: /\b(lower back|lumbar|l4|l5|disc|herniat|back pain)\b/,
    hip: /\b(hip|glute|piriformis|it.?band|iliotibial|hip flexor)\b/,
    wrist: /\b(wrist|forearm|carpal)\b/,
    elbow: /\b(elbow|tennis elbow|golfer.s elbow|lateral epicondyl)\b/,
    ankle: /\b(ankle|achilles|plantar|foot)\b/,
    neck: /\b(neck|cervical|traps?|trapezius)\b/,
  };

  const painSignals = /\b(pain|hurt|hurts|hurting|ache|aching|sore|soreness|injury|injured|strain|sprain|tweak|tweaked|flare|flaring|aggravate|bother|bothering|issue|problem|tight|tightness|uncomfortable|discomfort|inflamed|inflammation|swollen)\b/;
  const acuteSignals = /\b(this week|today|right now|lately|recently|just|started|developed|new|sudden)\b/;

  if (!painSignals.test(lower)) return { matched: false };

  for (const [part, pattern] of Object.entries(bodyPartPatterns)) {
    if (pattern.test(lower)) {
      const isAcute = acuteSignals.test(lower);
      return {
        matched: true,
        confidence: isAcute ? "high" : "medium",
        bodyPart: part,
      };
    }
  }

  // Pain mentioned but no specific body part identified
  return { matched: true, confidence: "medium", bodyPart: "unspecified" };
}

function matchesReadinessAdjustment(lower: string): {
  matched: boolean;
  confidence: "high" | "medium" | "low";
  signal?: string;
} {
  const readinessPatterns: Array<{ signal: string; pattern: RegExp }> = [
    { signal: "poor_sleep", pattern: /\b(slept (badly|poorly|terribly|bad|little)|bad sleep|poor sleep|didn.t sleep|no sleep|sleep deprived|sleep deprivation|insomnia|4 hours?|3 hours?|couldn.t sleep|trouble sleeping|woke up|restless night)\b/ },
    { signal: "high_fatigue", pattern: /\b(exhausted|drained|wiped out|run down|burnout|burnt out|overtrained|overreaching|too tired|very tired|extremely tired|fatigued|no energy today|feeling flat|empty tank)\b/ },
    { signal: "illness", pattern: /\b(sick|ill|fever|cold|flu|under the weather|not feeling well|feeling off|stomach|nauseous|congested)\b/ },
    { signal: "high_stress", pattern: /\b(stressed( out)?|high stress|anxious|anxiety|mentally drained|busy week|crazy week|overwhelming)\b/ },
    { signal: "poor_recovery", pattern: /\b(still sore|not recovered|haven.t recovered|muscles? (are )?(still |super |really )?(sore|tight)|legs? (are )?(dead|toast|shot|cooked)|can.t (recover|bounce back))\b/ },
    { signal: "travel", pattern: /\b(travel(ling|ed|ing)?|jet lag(ged)?|long flight|on the road|different time zone|hotel gym)\b/ },
  ];

  const readinessModifiers = /\b(today|this week|right now|at the moment|currently|lately|this morning)\b/;

  for (const { signal, pattern } of readinessPatterns) {
    if (pattern.test(lower)) {
      const hasTemporalContext = readinessModifiers.test(lower);
      return {
        matched: true,
        confidence: hasTemporalContext ? "high" : "medium",
        signal,
      };
    }
  }

  return { matched: false };
}

// ─── Structural Edit Detection ───────────────────────────────────────────────
//
// Handles high-level program restructuring requests:
//   "make this full body", "convert to upper/lower", "change to 3 days", etc.
// These are detected BEFORE atomic edit patterns because they require a full
// program redesign rather than a surgical modification.

function matchesStructuralEdit(lower: string): {
  matched: boolean;
  confidence: "high" | "medium" | "low";
  meta: StructuralEditMetadata;
} {
  const noMatch = {
    matched: false,
    confidence: "low" as const,
    meta: { targetSplit: "unknown" as const, targetDays: null, targetGoalShift: null, targetSport: null, preserveExercises: true },
  };

  // ── Split type conversion ──────────────────────────────────────────────────
  const fullBodyPattern = /\b(more full.?body|make.{0,20}full.?body|convert.{0,20}(to|into).{0,20}full.?body|full.?body (split|structure|approach|program|style)|full.?body it|go full.?body|switch.{0,20}full.?body|prefer.{0,20}full.?body|rather.{0,30}full.?body|want.{0,20}full.?body)\b/i;
  const upperLowerPattern = /\b(upper.lower|upper\/lower|convert.{0,20}(to|into).{0,20}upper.lower|make.{0,20}upper.lower|upper lower split)\b/i;
  const pplPattern = /\b(push.pull.legs?|ppl.split|ppl.program|convert.{0,20}(to|into).{0,20}(ppl|push.pull))\b/i;
  const pushPullPattern = /\b(push.pull (split|program|style)|convert.{0,20}(to|into).{0,20}push.pull(?!.legs))\b/i;

  // ── Implicit full-body intent — natural language expressions ─────────────
  // These don't use "full body" explicitly but clearly mean more integration
  const implicitFullBodyPattern = /\b(hit.{0,20}everything.{0,20}(more often|each (day|session|workout)|every (day|session))|train.{0,20}everything.{0,20}(more|each|every)|feels?.{0,20}too (split|isolated|separated|broken up|chopped up)|too (isolated|split|separated|siloed)|want.{0,30}(more integrated|more balanced|hit more muscle)|more.{0,20}(integrated|balanced).{0,20}(approach|sessions?|structure)|each (session|day).{0,20}(more|full|complete|comprehensive))\b/i;

  // ── Goal/orientation shift ─────────────────────────────────────────────────
  const fatLossPattern = /\b(more.{0,20}(fat.loss|fat burning|weight.loss|cutting|calorie burning)|better for (fat.loss|cutting|losing weight|burning fat)|fat.loss (focus|oriented|style|version))\b/i;
  const conditioningPattern = /\b(more conditioning focused|conditioning.first|more.{0,20}conditioning|conditioning.heavy|prioritize conditioning|sport.specific conditioning)\b/i;
  const performancePattern = /\b(better for performance|performance.focused|performance.based|more performance|athletic performance|sport performance)\b/i;
  const hypertrophyShiftPattern = /\b(less bodybuilding|more bodybuilding|more.{0,20}muscle building|muscle.building focus|hypertrophy.first|bodybuilding style program)\b/i;
  const strengthShiftPattern = /\b(more powerlifting|powerlifting.style|strength.first|strength.focused program|strength.only|pure strength|upper body strength|lower body strength|want.{0,20}strength)\b/i;

  // ── Structural ambiguity (medium confidence only if has active program) ────
  const structuralVagueness = /\b(restructure|reorganize|redesign|rebalance|rethink|completely change.{0,20}structure|change.{0,20}structure|different structure|different split|different layout|different setup)\b/i;

  // ─────────────────────────────────────────────────────────────────────────

  let targetSplit: StructuralEditMetadata["targetSplit"] = "unknown";
  let targetDays: number | null = null;
  let targetGoalShift: StructuralEditMetadata["targetGoalShift"] = null;
  let targetSport: string | null = null;

  if (fullBodyPattern.test(lower) || implicitFullBodyPattern.test(lower)) targetSplit = "full_body";
  else if (upperLowerPattern.test(lower)) targetSplit = "upper_lower";
  else if (pplPattern.test(lower)) targetSplit = "ppl";
  else if (pushPullPattern.test(lower)) targetSplit = "push_pull";

  const dayMatch = lower.match(/\b(\d)\s*[\-–]?\s*day\b|\b(\d)\s*days?\s*(a|per)\s*week\b/i);
  if (dayMatch) {
    const raw = parseInt(dayMatch[1] ?? dayMatch[2] ?? "", 10);
    if (raw >= 2 && raw <= 7) targetDays = raw;
  }

  if (fatLossPattern.test(lower)) targetGoalShift = "fat_loss";
  else if (conditioningPattern.test(lower) || performancePattern.test(lower)) targetGoalShift = "conditioning";
  else if (hypertrophyShiftPattern.test(lower)) targetGoalShift = "hypertrophy";
  else if (strengthShiftPattern.test(lower)) targetGoalShift = "strength";

  // Sport-specific requests map to athletic goal shift
  targetSport = detectSport(lower);
  const hasSportRequest = targetSport !== null && /\b(for|train(ing)?|optimize|help|prep(are)?|focus|built|program|geared)\b/.test(lower);
  if (hasSportRequest && !targetGoalShift) targetGoalShift = "athletic";

  const hasSplitChange = targetSplit !== "unknown";
  const hasDayChange = targetDays !== null;
  const hasGoalShift = targetGoalShift !== null;
  const hasVagueStructural = structuralVagueness.test(lower);

  if (hasSplitChange || hasDayChange) {
    return {
      matched: true,
      confidence: "high",
      meta: { targetSplit, targetDays, targetGoalShift, targetSport, preserveExercises: true },
    };
  }

  if (hasGoalShift || hasVagueStructural || hasSportRequest) {
    return {
      matched: true,
      confidence: "medium",
      meta: { targetSplit, targetDays, targetGoalShift, targetSport, preserveExercises: true },
    };
  }

  return noMatch;
}

function matchesEditProgram(lower: string, hasActiveProgram: boolean): {
  matched: boolean;
  confidence: "high" | "medium" | "low";
  subtype: EditSubtype;
} {
  const noMatch = { matched: false, confidence: "low" as const, subtype: "general_modification" as EditSubtype };

  // High-confidence edit patterns
  const highConfidencePatterns: Array<{ pattern: RegExp; subtype: EditSubtype }> = [
    { pattern: /\b(add|include|insert|put in|incorporate|need|missing|no)\b.{0,40}\b(core|abs|abdominal|trunk|anti.?rotation|anti.?extension)\b/i, subtype: "add_core" },
    { pattern: /\b(add|include|more|need|missing|no)\b.{0,40}\b(hamstring|hams|leg curl|nordic|glute.ham|rdl|romanian)\b/i, subtype: "add_hamstrings" },
    { pattern: /\b(add|include|more|need|missing|no)\b.{0,40}\b(calv|calves|calf raises?)\b/i, subtype: "add_calves" },
    { pattern: /\b(add|include|more|need|missing|no)\b.{0,40}\b(glute|hip thrust|glute bridge|butt)\b/i, subtype: "add_glutes" },
    { pattern: /\b(add|include|more|need|missing|no)\b.{0,40}\b(upper back|rhomboid|rear delt|face pull|band pull|scapula)\b/i, subtype: "add_upper_back" },
    { pattern: /\b(add|include|more|need|missing|no)\b.{0,40}\b(shoulder|deltoid|press|lateral raise|overhead)\b/i, subtype: "add_shoulders" },
    { pattern: /\b(add|include|more|need|missing|no)\b.{0,40}\b(cardio|conditioning|intervals?|hiit|aerobic|endurance|sled|finisher)\b/i, subtype: "add_conditioning" },
    { pattern: /\b(swap|replace|substitute|change|switch|swap out)\b.{0,60}(with|for|to)\b/i, subtype: "swap_exercise" },
    { pattern: /\bswap\b.{0,40}\b(incline|bench|squat|deadlift|press|row|curl|extension|fly|raise|dip|pulldown|pull.up)\b/i, subtype: "swap_exercise" },
    { pattern: /\b(remove|drop|take out|get rid of|cut|eliminate|ditch)\b.{0,40}\b(exercise|movement|it|that|the|this)\b/i, subtype: "remove_exercise" },
    { pattern: /\b(shorten|make.{0,20}shorter|less.{0,20}time|45 min|30 min|reduce.{0,20}(session|time))\b/i, subtype: "shorten_sessions" },
    { pattern: /\b(lengthen|make.{0,20}longer|more.{0,20}time|90 min|longer sessions?)\b/i, subtype: "lengthen_sessions" },
    { pattern: /\b(less.{0,20}(fatiguing|fatigue|volume|intense|demanding|grueling|exhausting)|reduce.{0,20}(volume|fatigue|load))\b/i, subtype: "reduce_fatigue" },
    { pattern: /\b(more.{0,20}(volume|sets|work)|increase.{0,20}(volume|sets)|add.{0,20}(sets|volume))\b/i, subtype: "increase_volume" },
    { pattern: /\b(more athletic|athletic (focus|training|style)|sport(s)?.specific|explosive|power (work|development)|make.*athletic)\b/i, subtype: "make_more_athletic" },
    { pattern: /\b(more.{0,20}strength|strength.{0,20}focus|heavier|lower reps?|stronger|make.*strength|strength.?based)\b/i, subtype: "make_more_strength" },
    { pattern: /\b(more.{0,20}(hypertrophy|muscle|gains?|size)|make.*hypertrophy|bodybuilding style|pump)\b/i, subtype: "make_more_hypertrophy" },
    { pattern: /\b(less.{0,20}(days?|frequency|sessions?)|train.{0,20}(less|fewer)|reduce.{0,20}(frequency|days?))\b/i, subtype: "reduce_frequency" },
    { pattern: /\b(more.{0,20}(days?|frequency|sessions?)|train.{0,20}more|increase.{0,20}(frequency|days?))\b/i, subtype: "increase_frequency" },
    { pattern: /\b(i (just got|got|received|have|looking at)).{0,40}(my|the|this).{0,20}(program|plan|routine|workout)\b/i, subtype: "general_modification" },
    { pattern: /\bthis program\b.{0,60}\b(needs?|should|doesn.t|does not|is|has no|lacks?)\b/i, subtype: "general_modification" },
    { pattern: /\b(noticed|see|saw|found|realized).{0,40}\b(no|missing|lack|without|not enough)\b/i, subtype: "general_modification" },
  ];

  for (const { pattern, subtype } of highConfidencePatterns) {
    if (pattern.test(lower)) {
      return { matched: true, confidence: "high", subtype };
    }
  }

  // Medium-confidence: requires active program context to interpret as edit
  if (hasActiveProgram) {
    const mediumConfidencePatterns: Array<{ pattern: RegExp; subtype: EditSubtype }> = [
      { pattern: /\b(fix|tweak|rework|redo|update|revise|edit|adjust|change)\b.{0,40}\b(program|plan|routine|workout|session|day|it|this)\b/i, subtype: "general_modification" },
      { pattern: /\b(can you|could you|please).{0,30}\b(add|swap|remove|change|fix|adjust|shorten|update)\b/i, subtype: "general_modification" },
      { pattern: /\bthis (needs?|should have|is missing|doesn.t have|lacks?)\b/i, subtype: "general_modification" },
      { pattern: /\b(the program|my program|this plan|my plan).{0,40}\b(needs?|should|has no|lacks?|doesn.t)\b/i, subtype: "general_modification" },
      // Natural feedback language — user expressing dissatisfaction or wanting change
      { pattern: /\b(not (loving|feeling|vibing with)|don.t love|don.t like|not (great|ideal|sure about)|feels?.{0,20}(off|wrong|weird|awkward|heavy|too much|not right)|something feels)\b/i, subtype: "general_modification" },
      { pattern: /\b(want.{0,20}(something|it).{0,20}(different|changed|adjusted|tweaked|better|easier|lighter)|make.{0,20}it.{0,20}(feel|work|be).{0,20}(better|different|easier|lighter|harder))\b/i, subtype: "general_modification" },
      { pattern: /\b(sessions? (feel|are).{0,30}(too|very|really).{0,20}(long|hard|heavy|much|intense|fatiguing|exhausting|short|easy|light))\b/i, subtype: "general_modification" },
      { pattern: /\b(i.m (always|usually|often|getting|feeling)).{0,30}(sore|tired|beat up|exhausted|drained|fatigued|smashed)\b/i, subtype: "reduce_fatigue" },
      { pattern: /\b(not enough|need more).{0,40}(recovery|rest|time off|days off)\b/i, subtype: "reduce_fatigue" },
      { pattern: /\b(can.t|don.t have).{0,20}(enough time|that long|that much time|90 min|an hour|the time)\b/i, subtype: "shorten_sessions" },
    ];
    for (const { pattern, subtype } of mediumConfidencePatterns) {
      if (pattern.test(lower)) {
        return { matched: true, confidence: "medium", subtype };
      }
    }
  }

  return noMatch;
}

function matchesCreateProgram(lower: string, context: ClassificationContext): {
  matched: boolean;
  confidence: "high" | "medium" | "low";
} {
  const strongCreate = /\b(build|create|design|make|generate|give me|write|put together|develop|set up|draft)\b.{0,40}\b(program|plan|routine|workout|split|schedule|training)\b/i;
  const splitRequest = /\b(\d.?day|upper.lower|push.pull|ppl|full body|bro split)\b.{0,30}\b(program|plan|routine|split|workout)?\b/i;
  const goalWithDays = /\b(train|workout|lift|gym|exercise).{0,40}\b(\d.days?|times? (a|per) week)\b/i;
  const freshRequest = /\b(i want|i need|i.m looking|can you|help me|give me).{0,30}\b(a|an|my|new).{0,20}\b(program|plan|routine|workout)\b/i;

  if (strongCreate.test(lower)) return { matched: true, confidence: "high" };
  if (splitRequest.test(lower)) return { matched: true, confidence: "high" };
  if (goalWithDays.test(lower)) return { matched: true, confidence: "medium" };
  if (freshRequest.test(lower)) return { matched: true, confidence: "medium" };

  // If they have no program yet and say something that sounds like a training goal, treat as create
  if (!context.hasActiveProgram && context.conversationTurnCount <= 2) {
    const goalSignal = /\b(strength|muscle|hypertrophy|performance|athletic|fat loss|body comp|lean|bulk|cut|shred)\b/;
    if (goalSignal.test(lower)) return { matched: true, confidence: "low" };
  }

  return { matched: false, confidence: "low" };
}

// ─── Routing Context Builder ─────────────────────────────────────────────────
// Builds system prompt injections appropriate for each intent type.
// Used by ai.ts to enrich the AI prompt based on the classified intent.

export function buildIntentPromptHint(intent: IntentResult): string | null {
  switch (intent.type) {
    case "ADJUST_FOR_PAIN": {
      const part = (intent.metadata?.bodyPart as string) ?? "unspecified area";
      const partLabel = part.replace("_", " ");
      return `
## SESSION MODIFICATION — PAIN/LIMITATION CONTEXT
The user has flagged a pain or injury concern involving their **${partLabel}**.

Instructions:
- Acknowledge the pain context briefly and professionally
- If you have an active program to modify: adjust exercises that load the affected area, suggest appropriate alternatives
- If you do not: factor this limitation into any program you build
- Do NOT be alarming or dramatic — this is performance coaching, not medical advice
- Remind them to consult a medical professional if appropriate, but keep it brief
- Focus on what they CAN train around the limitation`;
    }

    case "ADJUST_FOR_READINESS": {
      const signal = (intent.metadata?.signal as string) ?? "low_readiness";
      const signalDescriptions: Record<string, string> = {
        poor_sleep: "poor sleep last night",
        high_fatigue: "high accumulated fatigue or burnout",
        illness: "current illness or being under the weather",
        high_stress: "elevated stress levels",
        poor_recovery: "incomplete muscle recovery from previous sessions",
        travel: "travel or schedule disruption",
      };
      const signalDesc = signalDescriptions[signal] ?? "reduced readiness";
      return `
## SESSION MODIFICATION — READINESS CONTEXT
The user has flagged a readiness issue: **${signalDesc}**.

Instructions:
- Acknowledge their situation briefly and normalize it — managing readiness is smart training
- Recommend appropriate training adjustments:
  • Poor sleep/high fatigue → reduce volume 20-30%, avoid max effort, prioritize technique
  • Illness → recommend rest or very light movement only
  • High stress → reduce intensity, stick to lower CNS demand movements
  • Poor recovery → active recovery, mobility, or lighter session
  • Travel → bodyweight or minimal equipment alternatives
- If they have a program: suggest which day/session to scale or swap
- Keep it practical and specific — not generic wellness advice`;
    }

    case "RETRIEVE_CURRENT_PROGRAM":
      return `
## RETRIEVE REQUEST
The user wants to see their current program. Present the active program clearly if it exists in the context. Do not rebuild it from scratch unless asked.`;

    case "START_NEW_PROGRAM":
      return `
## FRESH START REQUEST
The user wants to start fresh with a new program. Treat this as a CREATE_PROGRAM request. Collect any missing profile information, propose a structure, then build the program.`;

    case "GENERAL_COACHING_QUESTION":
      return null;

    default:
      return null;
  }
}

// ─── Debug Summary ───────────────────────────────────────────────────────────

export function logIntentSummary(
  message: string,
  intent: IntentResult,
  hasProgram: boolean
): void {
  logger.info(
    {
      intent: intent.type,
      confidence: intent.confidence,
      editSubtype: intent.editSubtype ?? null,
      metadata: intent.metadata ?? null,
      hasActiveProgram: hasProgram,
      messagePreview: message.slice(0, 80),
    },
    "[IntentRouter] Request classified"
  );
}
