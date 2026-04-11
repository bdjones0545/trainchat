/**
 * Program Specialist Decision Layer
 *
 * An internal coaching agent for program reasoning. Takes messy natural language
 * coaching requests and converts them into structured, prioritized program adjustments.
 *
 * NOT a general autonomous agent — scoped entirely to program modification.
 */

import { logger } from "./logger";

// ─── Intent Types ────────────────────────────────────────────────────────────

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

// Priority order for multi-intent resolution (lower index = higher priority)
const INTENT_PRIORITY: SpecialistIntentType[] = [
  "PAIN_ADJUSTMENT",
  "READINESS_ADJUSTMENT",
  "RECOVERY_SHIFT",
  "TIME_COMPRESSION",
  "EQUIPMENT_ADJUSTMENT",
  "SEASON_SHIFT",
  "SPORT_TRANSFER_SHIFT",
  "SPLIT_CHANGE",
  "BIAS_SHIFT",
  "VOLUME_CHANGE",
  "INTENSITY_CHANGE",
  "EXERCISE_SWAP",
  "AMBIGUOUS",
];

// ─── Mutation Types ───────────────────────────────────────────────────────────

export type MutationType =
  | "update_rest"
  | "update_rep_range"
  | "update_sets"
  | "remove_exercise"
  | "add_exercise"
  | "swap_exercise"
  | "trim_accessories"
  | "add_explosive_opener"
  | "add_conditioning_finisher"
  | "reduce_lower_body_stress"
  | "update_load_emphasis"
  | "compress_session";

export interface SpecialistMutation {
  type: MutationType;
  target: string;
  value?: string;
  from?: string;
  to?: string;
  reason?: string;
}

// ─── Decision Object ─────────────────────────────────────────────────────────

export interface SpecialistDecision {
  primaryIntent: SpecialistIntentType;
  secondaryIntents: SpecialistIntentType[];
  biasTarget?: BiasTarget;
  coachingMove: string;
  preserve: string[];
  modify: string[];
  explanation: string;
  mutations: SpecialistMutation[];
  requiresClarification: boolean;
  clarificationPrompt?: string;
  logContext: Record<string, unknown>;
}

// ─── Program Structure types (inline to avoid circular deps) ─────────────────

interface Exercise {
  name: string;
  classification?: string;
  sets: number;
  reps?: string;
  rest?: string;
  intent?: string;
  notes?: string;
}

interface ProgramDay {
  name: string;
  focus?: string;
  exercises: Exercise[];
}

export interface ProgramStructure {
  programName?: string;
  splitType?: string;
  days: ProgramDay[];
}

// ─── Intent Classification Patterns ─────────────────────────────────────────

const INTENT_PATTERNS: Record<SpecialistIntentType, RegExp[]> = {
  PAIN_ADJUSTMENT: [
    /\b(knee|shoulder|hip|back|wrist|ankle|elbow|neck|lower back|upper back|rotator).{0,30}(pain|hurt|hurts|ache|aches|bothering|issue|problem|injury|limit|sore|inflamed|tweaked|bad)\b/i,
    /\b(pain|hurt|injury|injured|hurting|bothering|aching).{0,30}(knee|shoulder|hip|back|wrist|ankle|elbow|neck)\b/i,
    /\b(shoulder|knee|hip|back|wrist|ankle).{0,20}(hates?|doesn.t like|can.t do|avoid)\b/i,
    /\b(can.t|avoid|no).{0,20}(barbell|squats?|deadlift|press|overhead).{0,20}(because|due to|from).{0,20}(shoulder|knee|back|hip)\b/i,
  ],

  READINESS_ADJUSTMENT: [
    /\b(i.m|i am|feeling).{0,20}(exhausted|wrecked|cooked|drained|dead|destroyed|smashed|toast|wiped|beat)\b/i,
    /\b(can.t|don.t have).{0,20}(energy|it today|much today|anything today)\b/i,
    /\b(slept.{0,20}(badly|terribly|like crap|poorly|3|4|5).{0,10}hours?|no sleep|bad sleep|terrible sleep)\b/i,
    /\b(not feeling.{0,20}(it|great|good|well|strong)|feeling.{0,20}(off|rough|bad|low|terrible))\b/i,
    /\b(too.{0,20}(tired|exhausted|sore|beat up|drained)|completely.{0,20}(drained|exhausted|done))\b/i,
    /\bi.m (just|really|completely|absolutely|totally).{0,10}(cooked|done|dead|finished)\b/i,
  ],

  RECOVERY_SHIFT: [
    /\b(my|the).{0,10}(legs?|quads?|hamstrings?|glutes?|lower body|upper body|back|arms?|chest).{0,20}(are|is|feel).{0,20}(smoked|cooked|dead|trashed|wrecked|sore|beat|fried|smashed)\b/i,
    /\b(legs? are.{0,10}(smoked|cooked|dead)|quads? are.{0,10}(smoked|done))\b/i,
    /\b(need.{0,20}(recovery|to recover|a deload|rest)|want.{0,20}(to recover|recovery))\b/i,
    /\b(deload|recovery week|back off week|lighter week|easy week)\b/i,
    /\b(accumulated fatigue|system is taxed|body is taxed|overtrained|overtraining)\b/i,
  ],

  TIME_COMPRESSION: [
    /\b(only|just).{0,10}(have|got).{0,20}(15|20|25|30|35|40|45).{0,10}(min|minute|minutes)\b/i,
    /\b(30|35|40|45|20|25).{0,5}(min|minute|minutes).{0,20}(tomorrow|today|this session|max)\b/i,
    /\b(short.{0,10}(session|workout)|compress|tighten|I need this tighter|make it.{0,20}shorter|less time|quick.{0,10}session)\b/i,
    /\b(running short on time|don.t have (much|a lot of|enough) time|time.{0,10}constrained)\b/i,
  ],

  EQUIPMENT_ADJUSTMENT: [
    /\b(only|just).{0,20}(have|got|access to).{0,30}(dumbbells?|bands?|resistance bands?|kettlebells?|bodyweight|cables?|machines?|no barbell|no weights?)\b/i,
    /\b(home gym|no.{0,10}(barbell|rack|squat rack|bench|cables?|machine)|hotel gym|limited equipment|minimal equipment)\b/i,
    /\b(without.{0,20}(barbell|squat rack|bench|machine|cables?))\b/i,
    /\b(no barbell|no rack|can.t use.{0,20}barbell|barbell.{0,20}(unavailable|not available))\b/i,
  ],

  SEASON_SHIFT: [
    /\b(season starts?|season begins?|preseason|pre-season|off-season|offseason|in.season|postseason|post.season)\b/i,
    /\b((\d+|a few|couple|several).{0,10}weeks?.{0,10}(until|to|before|till).{0,10}(season|game|competition|tournament|playoffs?))\b/i,
    /\b(playoffs?|tournament|competition|championship|game season|race season)\b/i,
    /\b(return to play|coming back from|coming off|ramp up for season)\b/i,
  ],

  SPORT_TRANSFER_SHIFT: [
    /\b(more|better).{0,20}(soccer|basketball|football|baseball|tennis|volleyball|hockey|rugby|lacrosse|swimming|cycling|running|wrestling|bjj|mma|boxing).{0,20}(specific|focused|training|ready|prep)\b/i,
    /\b(train(ing)? for|prepare for|prep for|built for|geared for|optimize for).{0,20}(my sport|soccer|basketball|football|baseball|tennis|volleyball|hockey|rugby|lacrosse)\b/i,
    /\b(make this (more|better)).{0,30}(sport|game|field|court|ice).{0,20}(specific|ready|based|focused)\b/i,
    /\b(transfer to|carryover to|translate to).{0,20}(my sport|the field|the game|the court|the ice)\b/i,
  ],

  SPLIT_CHANGE: [
    /\b(make it|switch to|change to|convert to|want).{0,30}(\d.day|upper.lower|full body|push.pull.legs?|ppl|bro split)\b/i,
    /\b(\d).?day(s?).{0,20}(instead|version|split|program|schedule)\b/i,
    /\b(add a day|remove a day|one (more|less|fewer) day|different frequency)\b/i,
    /\b(full body|upper.lower|push.pull|ppl).{0,20}(split|version|style|approach|instead)\b/i,
  ],

  BIAS_SHIFT: [
    /\b(focus|shift|bias|lean|move|push).{0,30}(toward|towards|more|on).{0,30}(endurance|conditioning|cardio|aerobic|stamina|work.capacity|engine)\b/i,
    /\b(more|add|increase|build).{0,20}(endurance|conditioning|work.capacity|stamina|aerobic|cardio|engine)\b/i,
    /\b(i want more.{0,10}engine|build my engine|work capacity|aerobic base)\b/i,
    /\b(focus|shift|bias|lean|move|push).{0,30}(toward|towards|more|on).{0,30}(strength|heavy|load|maximal)\b/i,
    /\b(more|add|increase).{0,20}(strength|heavy lifting|heavier|load|maximal strength)\b/i,
    /\b(focus|shift|add|more).{0,30}(power|explosive|speed.strength|explosiv)\b/i,
    /\b(keep it athletic|more athletic|athletic carryover|athletic (focus|emphasis))\b/i,
    /\b(more|add|build).{0,20}(muscle|size|hypertrophy|gains?|mass)\b/i,
    /\b(make it.{0,20}(endurance|strength|power|hypertrophy|athletic).{0,20}(based|focused|heavy|oriented))\b/i,
    /\b(endurance.{0,20}based|strength.{0,20}based|power.{0,20}based)\b/i,
  ],

  VOLUME_CHANGE: [
    /\b(reduce|lower|cut|decrease).{0,20}(total volume|volume|sets?|total work|workload)\b/i,
    /\b(too much volume|too many sets?|too much work|too much accessory)\b/i,
    /\b(add|increase|more).{0,20}(volume|sets?|total work|training volume)\b/i,
    /\b(volume (is|feels|seems).{0,20}(too|very|way).{0,10}(high|much|low|light))\b/i,
  ],

  INTENSITY_CHANGE: [
    /\b(push intensity|more intensity|increase intensity|make it (harder|more intense|more challenging))\b/i,
    /\b(dial it back|less intense|reduce intensity|easier|lighter|make it less brutal)\b/i,
    /\b(intensity.{0,20}(is|feels|seems).{0,20}(too|way).{0,10}(high|low|much|light))\b/i,
    /\b(make it.{0,20}(brutally hard|more brutal|harder|easier|lighter|less demanding))\b/i,
  ],

  EXERCISE_SWAP: [
    /\b(swap|replace|substitute|switch|change).{0,50}(with|for|to)\b/i,
    /\bswap.{0,40}(incline|bench|squat|deadlift|press|row|curl|extension|fly|raise|dip|pulldown|pull.up)\b/i,
    /\b(dumbbell instead of barbell|barbell instead of dumbbell|machine instead|cable instead)\b/i,
    /\b(shoulder|knee|hip|back|wrist).{0,20}(hates?|doesn.t like).{0,20}(barbell|squat|deadlift|press|overhead)\b/i,
  ],

  AMBIGUOUS: [],
};

// ─── Natural Language Bias Detection ─────────────────────────────────────────

function detectBiasTarget(lower: string): BiasTarget | undefined {
  if (/endurance|conditioning|cardio|aerobic|stamina|work.capacity|engine|aerobic base/.test(lower)) return "endurance";
  if (/\b(power|explosive|speed.strength|explosiv|plyometric)\b/.test(lower)) return "power";
  if (/\b(more|increase|focus on|heavier|maximal|pure).{0,20}\b(strength|strong|load)\b/.test(lower)) return "strength";
  if (/hypertrophy|muscle|size|gains?|mass|bodybuilding|bulk/.test(lower)) return "hypertrophy";
  if (/athletic|sport.specific|explosive|agility|game speed|court|field|keep it athletic/.test(lower)) return "athletic";
  return undefined;
}

// ─── Pain Body Part Detection ─────────────────────────────────────────────────

function detectBodyPart(lower: string): string | null {
  if (/\bknee\b/.test(lower)) return "knee";
  if (/\bshoulder\b/.test(lower)) return "shoulder";
  if (/\bhip\b/.test(lower)) return "hip";
  if (/\b(lower back|lumbar|back)\b/.test(lower)) return "back";
  if (/\bwrist\b/.test(lower)) return "wrist";
  if (/\bankle\b/.test(lower)) return "ankle";
  if (/\belbow\b/.test(lower)) return "elbow";
  return null;
}

// ─── Time Detection ───────────────────────────────────────────────────────────

function detectSessionDuration(lower: string): number | null {
  const m = lower.match(/\b(15|20|25|30|35|40|45|50|55|60)\s*(min|minute|minutes)\b/i);
  return m ? parseInt(m[1], 10) : null;
}

// ─── Affected Body Region ─────────────────────────────────────────────────────

function detectFatiguedRegion(lower: string): string | null {
  if (/\b(legs?|quads?|hamstrings?|glutes?|lower body)\b/.test(lower)) return "lower_body";
  if (/\b(upper body|chest|back|shoulders?|arms?|pull|push)\b/.test(lower)) return "upper_body";
  return null;
}

// ─── Core Classifier ─────────────────────────────────────────────────────────

export function classifySpecialistRequest(
  message: string,
  hasActiveProgram: boolean
): {
  primaryIntent: SpecialistIntentType;
  secondaryIntents: SpecialistIntentType[];
  metadata: Record<string, string | number | null>;
} {
  const lower = message.toLowerCase();
  const matched: SpecialistIntentType[] = [];

  for (const [intentType, patterns] of Object.entries(INTENT_PATTERNS) as [SpecialistIntentType, RegExp[]][]) {
    if (intentType === "AMBIGUOUS") continue;
    if (patterns.some((p) => p.test(lower))) {
      matched.push(intentType);
    }
  }

  // No match — mark ambiguous
  if (matched.length === 0 || !hasActiveProgram) {
    return {
      primaryIntent: "AMBIGUOUS",
      secondaryIntents: [],
      metadata: {},
    };
  }

  // Sort by priority order
  matched.sort((a, b) => INTENT_PRIORITY.indexOf(a) - INTENT_PRIORITY.indexOf(b));

  const [primaryIntent, ...secondaryIntents] = matched;

  const metadata: Record<string, string | number | null> = {
    biasTarget: detectBiasTarget(lower) ?? null,
    bodyPart: detectBodyPart(lower),
    sessionDuration: detectSessionDuration(lower),
    fatiguedRegion: detectFatiguedRegion(lower),
  };

  return { primaryIntent, secondaryIntents, metadata };
}

// ─── Decision Engine ─────────────────────────────────────────────────────────

export function decideProgramAdjustment(
  message: string,
  currentProgram: ProgramStructure | null,
  _context?: { profile?: Record<string, unknown> | null }
): SpecialistDecision {
  const lower = message.toLowerCase();
  const { primaryIntent, secondaryIntents, metadata } = classifySpecialistRequest(
    message,
    currentProgram !== null
  );

  logger.info(
    {
      primaryIntent,
      secondaryIntents,
      metadata,
      messagePreview: message.slice(0, 100),
    },
    "[ProgramSpecialist] Request classified"
  );

  if (primaryIntent === "AMBIGUOUS" || !currentProgram) {
    return buildAmbiguousDecision(lower);
  }

  // Build decision based on primary intent (secondary intents layer on top)
  let decision = buildPrimaryDecision(primaryIntent, metadata, lower, secondaryIntents);

  // Layer secondary intent mutations
  for (const secondary of secondaryIntents.slice(0, 2)) {
    const secondaryMutations = getSecondaryMutations(secondary, metadata, lower);
    decision.mutations.push(...secondaryMutations);
    if (!decision.modify.includes(secondary.toLowerCase().replace("_", " "))) {
      decision.modify.push(secondary.toLowerCase().replace("_", " "));
    }
  }

  logger.info(
    {
      primaryIntent,
      coachingMove: decision.coachingMove,
      mutationCount: decision.mutations.length,
      preserved: decision.preserve,
      modified: decision.modify,
    },
    "[ProgramSpecialist] Decision built"
  );

  return decision;
}

// ─── Primary Decision Builder ─────────────────────────────────────────────────

function buildPrimaryDecision(
  intent: SpecialistIntentType,
  metadata: Record<string, string | number | null>,
  lower: string,
  secondaryIntents: SpecialistIntentType[]
): SpecialistDecision {
  const base: Omit<SpecialistDecision, "mutations"> = {
    primaryIntent: intent,
    secondaryIntents,
    coachingMove: "",
    preserve: [],
    modify: [],
    explanation: "",
    requiresClarification: false,
    logContext: { intent, metadata },
  };

  switch (intent) {
    case "BIAS_SHIFT": {
      const biasTarget = (metadata.biasTarget as BiasTarget) ?? detectBiasTarget(lower) ?? "athletic";
      return {
        ...base,
        biasTarget,
        coachingMove: `Shift program toward ${biasTarget} emphasis`,
        preserve: ["primary compound lifts", "training frequency", "program structure"],
        modify: ["rep ranges", "rest periods", "accessory selection", "session density"],
        explanation: buildBiasExplanation(biasTarget),
        mutations: buildBiasMutations(biasTarget),
        logContext: { intent, biasTarget, metadata },
      };
    }

    case "PAIN_ADJUSTMENT": {
      const bodyPart = (metadata.bodyPart as string) ?? "unspecified area";
      return {
        ...base,
        coachingMove: `Remove ${bodyPart}-aggravating movements and substitute pain-free alternatives`,
        preserve: ["training intent", "session volume (around affected area)", "other muscle groups"],
        modify: [`${bodyPart}-loading movements`, "exercise selection on affected days"],
        explanation: `Understood — taking stress off the ${bodyPart} without losing the session's purpose.\n\nI'm removing movements that load that area and replacing them where possible. The rest of the structure stays intact.\n\nYour update is live.`,
        mutations: buildPainMutations(bodyPart),
        logContext: { intent, bodyPart },
      };
    }

    case "READINESS_ADJUSTMENT": {
      return {
        ...base,
        coachingMove: "Scale session intensity and volume to match current readiness",
        preserve: ["session structure", "movement patterns", "training frequency"],
        modify: ["loading targets", "set counts", "effort expectation"],
        explanation: `Got it — today is a managed session, not a max-effort day.\n\nI'm reducing load targets and trimming set counts. Primary compound work stays in — at reduced intensity. Accessories are cut or made optional.\n\nYour update is live.`,
        mutations: [
          { type: "update_sets", target: "accessories", value: "-1", reason: "Readiness reduction — reduce accessory volume" },
          { type: "update_rep_range", target: "primary_lifts", value: "technical quality focus, not maximal", reason: "Readiness flag — keep movement quality, drop max effort" },
          { type: "trim_accessories", target: "lowest_priority", reason: "Compressed session for low readiness" },
        ],
        logContext: { intent },
      };
    }

    case "RECOVERY_SHIFT": {
      const region = metadata.fatiguedRegion as string | null;
      const regionLabel = region === "lower_body" ? "lower body" : region === "upper_body" ? "upper body" : "overall";
      return {
        ...base,
        coachingMove: `Reduce ${regionLabel} stress and support recovery without abandoning the session`,
        preserve: ["training frequency", "upper body work (if lower body flagged)", "primary compound intent"],
        modify: [`${regionLabel} volume`, "accessory density", "session demand"],
        explanation: `Got it — managing ${regionLabel} fatigue.\n\nI'm pulling volume back on the taxed area and reducing overall session demand. The program stays on track — we're just protecting the tissue that needs it.\n\nYour update is live.`,
        mutations: buildRecoveryMutations(region),
        logContext: { intent, region },
      };
    }

    case "TIME_COMPRESSION": {
      const duration = metadata.sessionDuration as number | null;
      const durationLabel = duration ? `${duration}-minute` : "compressed";
      return {
        ...base,
        coachingMove: `Compress session to ${durationLabel} format while preserving primary work`,
        preserve: ["primary compound lifts", "movement patterns", "training intent"],
        modify: ["accessory volume", "rest periods", "total exercise count"],
        explanation: `Got it — compressing the session.\n\nI'm preserving the primary compound work and cutting lowest-priority accessories. Rest periods tightened to match the shorter window.\n\nYour update is live.`,
        mutations: [
          { type: "trim_accessories", target: "all_sessions", value: "remove_lowest_priority", reason: `Time compression to ${durationLabel} session` },
          { type: "update_rest", target: "accessories", value: "45-60 sec", reason: "Tighten rest to fit compressed session" },
          { type: "compress_session", target: "all_sessions", reason: "Session duration constraint" },
        ],
        logContext: { intent, duration },
      };
    }

    case "EQUIPMENT_ADJUSTMENT": {
      const hasNoBarbellHint = /no barbell|dumbbell only|just dumbbells?|home gym|bands only|bodyweight/.test(lower);
      const equipmentLabel = hasNoBarbellHint ? "dumbbell/bodyweight equivalents" : "available equipment";
      return {
        ...base,
        coachingMove: `Substitute barbell movements for ${equipmentLabel}`,
        preserve: ["movement patterns", "session structure", "volume targets"],
        modify: ["exercise selection", "loading tools"],
        explanation: `Got it — adapting to your available equipment.\n\nBarbell movements are swapped for dumbbell or bodyweight equivalents that hit the same patterns. Session structure and volume stay the same.\n\nYour update is live.`,
        mutations: [
          { type: "swap_exercise", target: "barbell_primary", from: "Barbell", to: "Dumbbell equivalent", reason: "Equipment constraint — no barbell available" },
        ],
        logContext: { intent, hasNoBarbellHint },
      };
    }

    case "SEASON_SHIFT": {
      const isPreSeason = /pre.?season|season starts?|season begins?|before season/.test(lower);
      const isInSeason = /in.?season|during season|game (day|week)|playing now/.test(lower);
      const phaseLabel = isPreSeason ? "pre-season" : isInSeason ? "in-season" : "off-season";
      return {
        ...base,
        coachingMove: `Shift program to ${phaseLabel} emphasis`,
        preserve: ["movement quality", "primary compound work", "sport-relevant patterns"],
        modify: ["phase intent", "volume distribution", "fatigue management", "session density"],
        explanation: `Got it — shifting to ${phaseLabel} structure.\n\n${isInSeason ? "In-season: volume reduced, intensity maintained, session fatigue kept low." : isPreSeason ? "Pre-season: volume building, sport-specific conditioning increasing, fatigue managed carefully." : "Off-season: base building, strength emphasis, higher volume."}\n\nYour update is live.`,
        mutations: isInSeason
          ? [
              { type: "trim_accessories", target: "all_sessions", reason: "In-season volume reduction" },
              { type: "update_sets", target: "accessories", value: "-1", reason: "In-season — reduce non-essential volume" },
            ]
          : isPreSeason
          ? [
              { type: "add_conditioning_finisher", target: "all_sessions", reason: "Pre-season conditioning ramp" },
              { type: "update_rep_range", target: "primary_lifts", value: "5-8", reason: "Pre-season strength-endurance range" },
            ]
          : [
              { type: "update_rep_range", target: "primary_lifts", value: "3-5", reason: "Off-season maximal strength emphasis" },
              { type: "update_sets", target: "primary_lifts", value: "+1", reason: "Off-season volume accumulation" },
            ],
        logContext: { intent, phaseLabel },
      };
    }

    case "SPORT_TRANSFER_SHIFT": {
      const sport = detectSportFromText(lower);
      return {
        ...base,
        coachingMove: `Orient program toward ${sport ?? "sport"}-specific demands`,
        preserve: ["primary compound movements", "training frequency"],
        modify: ["exercise selection", "movement emphasis", "conditioning structure", "session intent"],
        explanation: `Got it — orienting this toward ${sport ?? "your sport"}.\n\nAdding explosive openers and conditioning support that transfers to the demands of your sport. Primary compound work stays — it's the foundation. Accessories shifted toward unilateral and sport-pattern work.\n\nYour update is live.`,
        mutations: [
          { type: "add_explosive_opener", target: "all_sessions", reason: `Sport transfer — ${sport ?? "sport"} specific explosiveness` },
          { type: "add_conditioning_finisher", target: "appropriate_sessions", reason: `Sport transfer — conditioning for ${sport ?? "sport"}` },
        ],
        logContext: { intent, sport },
      };
    }

    case "SPLIT_CHANGE": {
      return {
        ...base,
        coachingMove: "Restructure training frequency while preserving program identity",
        preserve: ["primary compound lifts", "training goal", "total weekly volume (approximately)"],
        modify: ["training days", "split structure", "session distribution"],
        explanation: `Got it — changing the split structure.\n\nPrimary compound work is redistributed across the new day count. Total volume stays approximately the same — just organized differently.\n\nYour update is live.`,
        mutations: [],
        requiresClarification: false,
        logContext: { intent },
      };
    }

    case "VOLUME_CHANGE": {
      const isReduce = /reduce|lower|cut|decrease|too much/.test(lower);
      return {
        ...base,
        coachingMove: isReduce ? "Reduce total training volume" : "Increase total training volume",
        preserve: ["primary compound lifts", "movement patterns", "training frequency"],
        modify: [isReduce ? "accessory set counts" : "accessory volume", "session density"],
        explanation: isReduce
          ? `Got it — pulling volume back.\n\nLowest-priority accessories removed. Set counts trimmed on remaining accessory work. Primary compounds are untouched.\n\nYour update is live.`
          : `Got it — adding volume.\n\nAccessory sets expanded and additional work added to appropriate sessions. Primary compound structure unchanged.\n\nYour update is live.`,
        mutations: isReduce
          ? [
              { type: "trim_accessories", target: "all_sessions", reason: "Volume reduction — remove lowest priority accessories" },
              { type: "update_sets", target: "accessories", value: "-1", reason: "Volume reduction — reduce accessory set count" },
            ]
          : [
              { type: "update_sets", target: "accessories", value: "+1", reason: "Volume increase — add accessory sets" },
            ],
        logContext: { intent, direction: isReduce ? "reduce" : "increase" },
      };
    }

    case "INTENSITY_CHANGE": {
      const isIncrease = /push|increase|harder|more intense|more brutal/.test(lower);
      return {
        ...base,
        coachingMove: isIncrease ? "Push intensity across primary work" : "Dial intensity back to a sustainable range",
        preserve: ["program structure", "movement patterns", "frequency"],
        modify: ["loading targets", "rep ranges", "effort expectations"],
        explanation: isIncrease
          ? `Got it — pushing intensity.\n\nPrimary lifts moved to a lower rep range with heavier loading expectation. Rest extended to support the increased effort.\n\nYour update is live.`
          : `Got it — dialing it back.\n\nRep ranges shifted slightly higher, effort expectations at technical quality rather than maximum. This is still productive — just not max-output.\n\nYour update is live.`,
        mutations: isIncrease
          ? [
              { type: "update_rep_range", target: "primary_lifts", value: "3-5", reason: "Intensity increase — strength range" },
              { type: "update_rest", target: "primary_lifts", value: "3 min", reason: "Intensity increase — full CNS recovery between sets" },
            ]
          : [
              { type: "update_rep_range", target: "primary_lifts", value: "8-12", reason: "Intensity reduction — technical quality focus" },
              { type: "update_rep_range", target: "accessories", value: "12-15", reason: "Intensity reduction — higher rep, lower load" },
            ],
        logContext: { intent, direction: isIncrease ? "increase" : "decrease" },
      };
    }

    case "EXERCISE_SWAP": {
      return {
        ...base,
        coachingMove: "Swap specified exercise while preserving session role and volume",
        preserve: ["session structure", "movement classification", "sets/reps prescription"],
        modify: ["specific exercise selection"],
        explanation: `Got it — swapping the exercise.\n\nMovement pattern and session role preserved. Sets and reps stay the same.\n\nYour update is live.`,
        mutations: [
          { type: "swap_exercise", target: "specified_exercise", reason: "Direct swap request" },
        ],
        logContext: { intent },
      };
    }

    default:
      return buildAmbiguousDecision(lower);
  }
}

// ─── Secondary Mutation Layers ────────────────────────────────────────────────

function getSecondaryMutations(
  intent: SpecialistIntentType,
  metadata: Record<string, string | number | null>,
  lower: string
): SpecialistMutation[] {
  switch (intent) {
    case "TIME_COMPRESSION":
      return [
        { type: "trim_accessories", target: "all_sessions", value: "remove_lowest_priority", reason: "Secondary: time constraint" },
      ];
    case "PAIN_ADJUSTMENT":
      return [
        { type: "remove_exercise", target: `${metadata.bodyPart ?? "affected"}_loading_movements`, reason: "Secondary: pain constraint" },
      ];
    case "RECOVERY_SHIFT":
      return [
        { type: "reduce_lower_body_stress", target: "lower_body_days", reason: "Secondary: recovery constraint" },
      ];
    case "EQUIPMENT_ADJUSTMENT":
      return [
        { type: "swap_exercise", target: "barbell_movements", from: "Barbell", to: "Dumbbell equivalent", reason: "Secondary: equipment constraint" },
      ];
    case "VOLUME_CHANGE":
      if (/reduce|lower|cut|too much/.test(lower)) {
        return [{ type: "trim_accessories", target: "lowest_priority", reason: "Secondary: volume reduction" }];
      }
      return [];
    default:
      return [];
  }
}

// ─── Bias-specific builders ───────────────────────────────────────────────────

function buildBiasExplanation(biasTarget: BiasTarget): string {
  const explanations: Record<BiasTarget, string> = {
    endurance: `Got it — shifting your system toward endurance.\n\nRep ranges pushed higher, rest intervals tightened to increase density, and conditioning finishers added to each session to build work capacity.\n\nYour system is updated now.`,
    strength: `Got it — shifting your system toward strength.\n\nPrimary lifts moved into a lower rep range with extended rest. An extra set added to primary movements for volume at intensity. Conditioning trimmed to reduce interference.\n\nYour system is updated now.`,
    power: `Got it — shifting your system toward power.\n\nExplosive work added to session openings — before fatigue accumulates. Trailing accessory trimmed to keep session length controlled.\n\nYour system is updated now.`,
    hypertrophy: `Got it — shifting your system toward hypertrophy.\n\nVolume increased on accessory work. Rep ranges moved into the muscle-building zone (8-15). Rest kept moderate for metabolic stimulus.\n\nYour system is updated now.`,
    athletic: `Got it — keeping this athletic.\n\nExplosive openers added and conditioning support increased. Exercise selection oriented toward multi-joint, sport-pattern movements.\n\nYour system is updated now.`,
  };
  return explanations[biasTarget] ?? `Got it — shifting the program emphasis.\n\nYour system is updated now.`;
}

function buildBiasMutations(biasTarget: BiasTarget): SpecialistMutation[] {
  switch (biasTarget) {
    case "endurance":
      return [
        { type: "update_rep_range", target: "primary_and_secondary_lifts", value: "+3 reps", reason: "Endurance bias — higher rep ranges for work capacity" },
        { type: "update_rest", target: "primary_and_secondary_lifts", value: "-30 sec", reason: "Endurance bias — tighter rest increases density" },
        { type: "add_conditioning_finisher", target: "all_sessions", reason: "Endurance bias — work capacity finisher" },
      ];
    case "strength":
      return [
        { type: "update_rep_range", target: "primary_lifts", value: "3-5", reason: "Strength bias — maximal strength range" },
        { type: "update_rest", target: "primary_lifts", value: "+60 sec", reason: "Strength bias — extended rest supports heavy loading" },
        { type: "update_sets", target: "primary_lifts", value: "+1", reason: "Strength bias — additional set for intensity volume" },
        { type: "trim_accessories", target: "conditioning", reason: "Strength bias — reduce interference with strength adaptation" },
      ];
    case "power":
      return [
        { type: "add_explosive_opener", target: "all_sessions", reason: "Power bias — explosive openers before fatigue" },
        { type: "trim_accessories", target: "lowest_priority_accessory", reason: "Power bias — trim to maintain session length" },
      ];
    case "hypertrophy":
      return [
        { type: "update_rep_range", target: "accessories", value: "8-15", reason: "Hypertrophy bias — muscle building rep range" },
        { type: "update_sets", target: "accessories", value: "+1", reason: "Hypertrophy bias — additional volume" },
        { type: "update_rest", target: "accessories", value: "60-90 sec", reason: "Hypertrophy bias — metabolic rest range" },
      ];
    case "athletic":
      return [
        { type: "add_explosive_opener", target: "all_sessions", reason: "Athletic bias — explosive openers" },
        { type: "add_conditioning_finisher", target: "appropriate_sessions", reason: "Athletic bias — conditioning support" },
      ];
  }
}

function buildPainMutations(bodyPart: string): SpecialistMutation[] {
  const removalMap: Record<string, string> = {
    knee: "squat_pattern|lunge|leg press|step up|box jump",
    shoulder: "overhead press|barbell press|dip|upright row",
    hip: "hip hinge|deadlift|hip thrust|glute bridge",
    back: "barbell deadlift|barbell row|good morning",
    wrist: "barbell curl|front squat|wrist loaded",
    ankle: "box jump|calf raise|lunge",
  };
  return [
    {
      type: "remove_exercise",
      target: removalMap[bodyPart] ?? `${bodyPart}_loading_movements`,
      reason: `${bodyPart} pain — removing aggravating movements`,
    },
  ];
}

function buildRecoveryMutations(region: string | null): SpecialistMutation[] {
  if (region === "lower_body") {
    return [
      { type: "reduce_lower_body_stress", target: "lower_body_days", reason: "Recovery shift — lower body fatigue flagged" },
      { type: "trim_accessories", target: "lower_body_accessories", reason: "Recovery shift — reduce lower body accessory load" },
    ];
  }
  if (region === "upper_body") {
    return [
      { type: "trim_accessories", target: "upper_body_accessories", reason: "Recovery shift — upper body fatigue flagged" },
      { type: "update_sets", target: "upper_body_accessories", value: "-1", reason: "Recovery shift — reduce upper body accessory volume" },
    ];
  }
  return [
    { type: "trim_accessories", target: "all_sessions", reason: "Recovery shift — overall volume reduction" },
    { type: "update_sets", target: "accessories", value: "-1", reason: "Recovery shift — reduce total accessory volume" },
  ];
}

// ─── Ambiguous Request Handler ────────────────────────────────────────────────

function buildAmbiguousDecision(lower: string): SpecialistDecision {
  // Try to give a productive escalation prompt rather than failing silently
  let clarificationPrompt = "Got it — what direction do you want to push this: more strength, more endurance, more athletic carryover, or lower fatigue overall?";

  if (/better|improve|good|fix/.test(lower)) {
    clarificationPrompt = "Got it — what direction do you want to push it: more strength, more endurance, more explosive, or lower overall fatigue?";
  }
  if (/change|different|not (right|great|working|ideal)/.test(lower)) {
    clarificationPrompt = "Got it — what feels off? More volume, less volume, different exercises, or a different training emphasis?";
  }

  return {
    primaryIntent: "AMBIGUOUS",
    secondaryIntents: [],
    coachingMove: "Awaiting direction",
    preserve: [],
    modify: [],
    explanation: clarificationPrompt,
    mutations: [],
    requiresClarification: true,
    clarificationPrompt,
    logContext: { intent: "AMBIGUOUS", lower: lower.slice(0, 80) },
  };
}

// ─── Sport Detection ──────────────────────────────────────────────────────────

function detectSportFromText(lower: string): string | null {
  const sports: [RegExp, string][] = [
    [/\bsoccer\b/, "soccer"],
    [/\bbasketball\b/, "basketball"],
    [/\bfootball\b/, "football"],
    [/\bbaseball\b/, "baseball"],
    [/\btennis\b/, "tennis"],
    [/\bvolleyball\b/, "volleyball"],
    [/\bhockey\b/, "hockey"],
    [/\brugby\b/, "rugby"],
    [/\blacrosse\b/, "lacrosse"],
    [/\bswimming\b/, "swimming"],
    [/\bcycling\b/, "cycling"],
    [/\bwrestling\b/, "wrestling"],
    [/\b(bjj|jiu.jitsu)\b/, "BJJ"],
    [/\bmma\b/, "MMA"],
    [/\bboxing\b/, "boxing"],
  ];
  for (const [pattern, name] of sports) {
    if (pattern.test(lower)) return name;
  }
  return null;
}

// ─── Program Mutation Applier ─────────────────────────────────────────────────
//
// Applies the structured mutation list from a SpecialistDecision to a live program.
// This is the deterministic engine — no AI calls, no randomness.

export function applySpecialistMutations(
  program: ProgramStructure,
  decision: SpecialistDecision
): ProgramStructure {
  const mutated: ProgramStructure = JSON.parse(JSON.stringify(program));

  for (const mutation of decision.mutations) {
    try {
      applyMutation(mutated, mutation, decision);
    } catch (err) {
      logger.warn({ mutation, err }, "[ProgramSpecialist] Mutation failed — skipping");
    }
  }

  logger.info(
    {
      primaryIntent: decision.primaryIntent,
      mutationsApplied: decision.mutations.length,
    },
    "[ProgramSpecialist] Mutations applied"
  );

  return mutated;
}

function applyMutation(
  program: ProgramStructure,
  mutation: SpecialistMutation,
  decision: SpecialistDecision
): void {
  switch (mutation.type) {
    case "trim_accessories": {
      for (const day of program.days) {
        const lastAccessoryIdx = day.exercises
          .map((ex, i) => ({ ex, i }))
          .filter(({ ex }) => ex.classification === "Accessory" || ex.classification === "Conditioning")
          .at(-1)?.i;
        if (lastAccessoryIdx !== undefined && day.exercises.length > 3) {
          day.exercises.splice(lastAccessoryIdx, 1);
        }
      }
      break;
    }

    case "update_rest": {
      const valueSec = mutation.value
        ? parseRestToSeconds(mutation.value)
        : null;
      const delta = mutation.value?.startsWith("+")
        ? parseRestToSeconds(mutation.value.slice(1))
        : mutation.value?.startsWith("-")
        ? -parseRestToSeconds(mutation.value.slice(1))
        : null;

      for (const day of program.days) {
        for (const ex of day.exercises) {
          if (!matchesTarget(ex, mutation.target)) continue;
          if (delta !== null) {
            const current = parseRestToSeconds(ex.rest ?? "90 sec");
            const newVal = Math.max(30, Math.min(360, current + delta));
            ex.rest = formatRestSeconds(newVal);
          } else if (valueSec !== null) {
            ex.rest = mutation.value!;
          }
        }
      }
      break;
    }

    case "update_rep_range": {
      if (!mutation.value) break;
      const isDelta = mutation.value.startsWith("+") || mutation.value.startsWith("-");
      for (const day of program.days) {
        for (const ex of day.exercises) {
          if (!matchesTarget(ex, mutation.target)) continue;
          if (isDelta) {
            const delta = parseInt(mutation.value, 10);
            const repMatch = ex.reps?.match(/(\d+)-?(\d+)?/);
            if (repMatch) {
              const lo = parseInt(repMatch[1], 10);
              const hi = repMatch[2] ? parseInt(repMatch[2], 10) : lo;
              const newLo = Math.max(1, lo + delta);
              const newHi = Math.max(newLo + 1, hi + delta);
              ex.reps = `${newLo}-${newHi}`;
            }
          } else {
            ex.reps = mutation.value;
          }
        }
      }
      break;
    }

    case "update_sets": {
      if (!mutation.value) break;
      const isDelta = mutation.value.startsWith("+") || mutation.value.startsWith("-");
      const delta = parseInt(mutation.value, 10);
      const abs = Math.abs(delta);
      for (const day of program.days) {
        for (const ex of day.exercises) {
          if (!matchesTarget(ex, mutation.target)) continue;
          if (isDelta) {
            ex.sets = Math.max(1, ex.sets + (delta < 0 ? -abs : abs));
          } else {
            ex.sets = abs;
          }
        }
      }
      break;
    }

    case "add_conditioning_finisher": {
      for (const day of program.days) {
        const hasConditioning = day.exercises.some(ex =>
          /(cardio|conditioning|interval|circuit|bike|row|sled|finisher)/i.test(ex.name + (ex.classification ?? ""))
        );
        if (!hasConditioning) {
          day.exercises.push({
            name: "Conditioning Finisher",
            classification: "Conditioning",
            sets: 4,
            reps: "30 sec on / 20 sec off",
            rest: "90 sec between rounds",
            intent: "Work capacity emphasis — maintain output quality across all intervals. Bike, rower, or jump rope.",
          });
        }
      }
      break;
    }

    case "add_explosive_opener": {
      const openers: Exercise[] = [
        { name: "Box Jump", classification: "Plyometric/Explosive", sets: 4, reps: "3-4", rest: "2 min", intent: "Max intent — full triple extension. Land softly. CNS must be fresh." },
        { name: "Medicine Ball Slam", classification: "Plyometric/Explosive", sets: 4, reps: "5", rest: "90 sec", intent: "Full-body explosive force — drive through the hips, not just the arms." },
        { name: "Broad Jump", classification: "Plyometric/Explosive", sets: 3, reps: "4", rest: "90 sec", intent: "Horizontal explosiveness — push the floor away aggressively. Stick each landing." },
      ];
      let added = 0;
      for (const day of program.days) {
        if (added >= 2) break;
        const alreadyHas = day.exercises.some(ex =>
          /(box jump|power clean|hang clean|broad jump|med ball|medicine ball|plyometric)/i.test(ex.name)
        );
        if (!alreadyHas) {
          day.exercises.unshift({ ...openers[added % openers.length] });
          added++;
        }
      }
      break;
    }

    case "reduce_lower_body_stress": {
      for (const day of program.days) {
        const isLower = /(leg|lower|squat|hinge|hamstring|glute)/i.test(day.name + (day.focus ?? ""));
        if (!isLower) continue;
        const lastAccessoryIdx = day.exercises
          .map((ex, i) => ({ ex, i }))
          .filter(({ ex }) => ex.classification === "Accessory")
          .at(-1)?.i;
        if (lastAccessoryIdx !== undefined) {
          day.exercises.splice(lastAccessoryIdx, 1);
        }
        // Reduce set counts on remaining lower-body accessories
        for (const ex of day.exercises) {
          if (ex.classification === "Accessory" && ex.sets > 2) {
            ex.sets -= 1;
          }
        }
      }
      break;
    }

    case "compress_session": {
      for (const day of program.days) {
        const accessories = day.exercises.filter(ex => ex.classification === "Accessory" || ex.classification === "Conditioning");
        const toRemove = accessories.length > 1 ? 1 : 0;
        for (let i = 0; i < toRemove; i++) {
          const lastIdx = day.exercises.map((ex, idx) => ({ ex, idx }))
            .filter(({ ex }) => ex.classification === "Accessory" || ex.classification === "Conditioning")
            .at(-1)?.idx;
          if (lastIdx !== undefined) day.exercises.splice(lastIdx, 1);
        }
      }
      break;
    }

    case "remove_exercise": {
      const targetPatterns = mutation.target.split("|").map(t => new RegExp(t.trim(), "i"));
      for (const day of program.days) {
        day.exercises = day.exercises.filter(ex =>
          !targetPatterns.some(p => p.test(ex.name))
        );
      }
      break;
    }

    case "swap_exercise": {
      // Structural hint only — actual swap handled by AI path with full context
      // This mutation signals to the AI what to do; the fallback just notes it
      break;
    }

    default:
      break;
  }
}

// ─── Target Matcher ───────────────────────────────────────────────────────────

function matchesTarget(ex: Exercise, target: string): boolean {
  const t = target.toLowerCase();
  const cls = (ex.classification ?? "").toLowerCase();
  if (t.includes("primary") && cls === "primary") return true;
  if (t.includes("secondary") && (cls === "secondary compound" || cls === "secondary")) return true;
  if (t.includes("accessor") && cls === "accessory") return true;
  if (t.includes("conditioning") && cls === "conditioning") return true;
  if (t.includes("primary_and_secondary") && (cls === "primary" || cls === "secondary compound" || cls === "secondary")) return true;
  if (t.includes("all") && !t.includes("accessor")) return true;
  return false;
}

// ─── Rest Time Helpers ────────────────────────────────────────────────────────

function parseRestToSeconds(rest: string): number {
  const minMatch = rest.match(/(\d+):(\d+)\s*min/);
  if (minMatch) return parseInt(minMatch[1], 10) * 60 + parseInt(minMatch[2], 10);
  const minSimple = rest.match(/(\d+)\s*min/);
  if (minSimple) return parseInt(minSimple[1], 10) * 60;
  const secMatch = rest.match(/(\d+)\s*sec/);
  if (secMatch) return parseInt(secMatch[1], 10);
  const rawNum = rest.match(/^(\d+)$/);
  if (rawNum) return parseInt(rawNum[1], 10);
  return 90;
}

function formatRestSeconds(secs: number): string {
  if (secs < 60) return `${secs} sec`;
  const m = Math.floor(secs / 60);
  const s = secs % 60;
  return s === 0 ? `${m} min` : `${m}:${s.toString().padStart(2, "0")} min`;
}

// ─── Change Log Formatter ─────────────────────────────────────────────────────
//
// Generates human-readable change entries for the Changes tab.

export function buildSpecialistChangeSummary(decision: SpecialistDecision): string[] {
  const lines: string[] = [];

  switch (decision.primaryIntent) {
    case "BIAS_SHIFT":
      lines.push(`${capitalizeFirst(decision.biasTarget ?? "training")} emphasis applied`);
      if (decision.biasTarget === "endurance") {
        lines.push("Rep ranges increased for work capacity");
        lines.push("Rest intervals tightened for training density");
        lines.push("Conditioning finishers added");
      } else if (decision.biasTarget === "strength") {
        lines.push("Primary lifts shifted to strength rep range (3-5)");
        lines.push("Rest extended on primary movements");
        lines.push("Conditioning reduced to minimize interference");
      } else if (decision.biasTarget === "power") {
        lines.push("Explosive openers added to session starts");
        lines.push("Trailing accessories trimmed");
      } else if (decision.biasTarget === "hypertrophy") {
        lines.push("Accessory volume increased");
        lines.push("Rep ranges moved to hypertrophy zone (8-15)");
      } else if (decision.biasTarget === "athletic") {
        lines.push("Explosive openers added");
        lines.push("Conditioning support increased");
      }
      break;

    case "PAIN_ADJUSTMENT":
      lines.push(`${capitalizeFirst(String(decision.logContext.bodyPart ?? "affected area"))} stress removed`);
      lines.push("Aggravating exercises removed");
      break;

    case "READINESS_ADJUSTMENT":
      lines.push("Session scaled for low readiness");
      lines.push("Accessory volume reduced");
      break;

    case "RECOVERY_SHIFT":
      lines.push(`${capitalizeFirst(String(decision.logContext.region ?? "overall"))} volume reduced for recovery`);
      lines.push("Lowest-priority accessories removed");
      break;

    case "TIME_COMPRESSION":
      lines.push(`Session compressed${decision.logContext.duration ? ` to ${decision.logContext.duration}-minute format` : ""}`);
      lines.push("Lowest-priority accessories removed");
      lines.push("Rest periods tightened");
      break;

    case "EQUIPMENT_ADJUSTMENT":
      lines.push("Barbell movements substituted for dumbbell equivalents");
      break;

    case "SEASON_SHIFT":
      lines.push(`Program shifted to ${String(decision.logContext.phaseLabel ?? "new phase")} structure`);
      break;

    case "SPORT_TRANSFER_SHIFT":
      lines.push(`Program oriented toward ${String(decision.logContext.sport ?? "sport")} demands`);
      lines.push("Explosive openers added");
      lines.push("Conditioning support added");
      break;

    case "VOLUME_CHANGE":
      if (decision.logContext.direction === "reduce") {
        lines.push("Total volume reduced");
        lines.push("Lowest-priority accessories removed");
      } else {
        lines.push("Total volume increased");
        lines.push("Accessory sets expanded");
      }
      break;

    case "INTENSITY_CHANGE":
      if (decision.logContext.direction === "increase") {
        lines.push("Intensity increased — strength rep range applied");
        lines.push("Rest extended on primary lifts");
      } else {
        lines.push("Intensity dialed back");
        lines.push("Rep ranges shifted to technical quality focus");
      }
      break;

    default:
      lines.push("Program adjusted");
      break;
  }

  // Add secondary intent summary lines
  for (const secondary of decision.secondaryIntents.slice(0, 2)) {
    switch (secondary) {
      case "TIME_COMPRESSION":
        lines.push("Session compressed due to time constraint");
        break;
      case "PAIN_ADJUSTMENT":
        lines.push(`${capitalizeFirst(String(decision.logContext.bodyPart ?? "affected area"))} load removed`);
        break;
      case "RECOVERY_SHIFT":
        lines.push("Additional volume reduction for recovery");
        break;
    }
  }

  return lines;
}

function capitalizeFirst(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

// ─── Specialist Coaching Response Builder ─────────────────────────────────────
//
// 4-line mandatory structure (STRICT):
//   LINE 1 — Acknowledge intent
//   LINE 2 — Coaching move (strong verb, no "I'm" / "I will" / "I am going to")
//   LINE 3 — Performance-focused reason
//   LINE 4 — "Updated — check your program."
//
// Called AFTER applySpecialistMutations() so the response reflects what was done.

const CONFIRM_LINE = "Updated — check your program.";

type IntentVoice = {
  acknowledge: (decision: SpecialistDecision) => string;
  move: (decision: SpecialistDecision) => string;
  reason: (decision: SpecialistDecision) => string;
};

const INTENT_VOICE: Partial<Record<SpecialistIntentType, IntentVoice>> = {
  BIAS_SHIFT: {
    acknowledge: (d) => {
      const labels: Record<string, string> = {
        endurance:  "pushing this toward endurance",
        strength:   "shifting this toward strength",
        power:      "shifting toward power",
        hypertrophy:"pushing into hypertrophy",
        athletic:   "keeping this athletic",
      };
      return `Got it — ${labels[d.biasTarget ?? "athletic"] ?? "shifting the emphasis"}.`;
    },
    move: (d) => {
      const moves: Record<string, string> = {
        endurance:  "Tightening rest and increasing work density while keeping core strength work.",
        strength:   "Pulling rep ranges down, extending rest, and trimming conditioning to reduce interference.",
        power:      "Adding explosive openers and trimming fatigue-heavy work.",
        hypertrophy:"Adding accessory volume and shifting rep ranges into the muscle-building zone.",
        athletic:   "Adding explosive openers and conditioning support while keeping primary compound work.",
      };
      return moves[d.biasTarget ?? "athletic"] ?? "Shifting the training emphasis across the program.";
    },
    reason: (d) => {
      const reasons: Record<string, string> = {
        endurance:  "Builds work capacity without losing output.",
        strength:   "Drives maximal strength adaptation without conditioning interference.",
        power:      "Improves output without killing speed.",
        hypertrophy:"Increases muscle-building stimulus without losing movement quality.",
        athletic:   "Improves explosive output and conditioning carryover to sport.",
      };
      return reasons[d.biasTarget ?? "athletic"] ?? "Shifts training toward the requested emphasis.";
    },
  },

  PAIN_ADJUSTMENT: {
    acknowledge: (d) => {
      const part = String(d.logContext.bodyPart ?? "the affected area");
      return `Understood — taking stress off the ${part}.`;
    },
    move: () => "Swapping aggravating movements while preserving training intent.",
    reason: () => "Keeps progress moving without flare-ups.",
  },

  READINESS_ADJUSTMENT: {
    acknowledge: () => "Got it — managing today's session.",
    move: () => "Reducing volume and trimming accessories. Primary compound work stays at reduced intensity.",
    reason: () => "Keeps you training without digging a deeper fatigue hole.",
  },

  RECOVERY_SHIFT: {
    acknowledge: (d) => {
      const region = String(d.logContext.region ?? "overall");
      const label = region === "lower_body" ? "lower body" : region === "upper_body" ? "upper body" : "overall load";
      return `Got it — pulling stress off your ${label}.`;
    },
    move: (d) => {
      const region = String(d.logContext.region ?? "overall");
      if (region === "lower_body") return "Reducing lower-body load and keeping upper work in place.";
      if (region === "upper_body") return "Pulling back upper-body volume and keeping lower work intact.";
      return "Reducing accessory load and trimming the highest-demand work.";
    },
    reason: () => "Helps recovery without breaking consistency.",
  },

  TIME_COMPRESSION: {
    acknowledge: (d) => {
      const mins = d.logContext.duration;
      return mins ? `Got it — tightening this to ${mins} minutes.` : "Got it — tightening the session.";
    },
    move: () => "Cutting low-priority work and compressing rest while keeping main lifts.",
    reason: () => "Keeps it effective without wasting time.",
  },

  EQUIPMENT_ADJUSTMENT: {
    acknowledge: () => "Got it — adapting to your equipment.",
    move: () => "Swapping barbell movements for dumbbell equivalents that hit the same patterns.",
    reason: () => "Preserves the training effect with what you have available.",
  },

  SEASON_SHIFT: {
    acknowledge: (d) => {
      const phase = String(d.logContext.phaseLabel ?? "new phase");
      return `Got it — shifting to ${phase} structure.`;
    },
    move: (d) => {
      const phase = String(d.logContext.phaseLabel ?? "");
      if (phase.includes("in-season"))  return "Reducing non-essential volume and keeping intensity high.";
      if (phase.includes("pre-season")) return "Increasing conditioning support while keeping strength work intact.";
      return "Restructuring emphasis to match the current training phase.";
    },
    reason: (d) => {
      const phase = String(d.logContext.phaseLabel ?? "");
      if (phase.includes("in-season"))  return "Keeps output high without accumulating unnecessary fatigue.";
      if (phase.includes("pre-season")) return "Brings conditioning and performance to a peak ahead of the season.";
      return "Aligns training with where you are in the year.";
    },
  },

  SPORT_TRANSFER_SHIFT: {
    acknowledge: (d) => {
      const sport = String(d.logContext.sport ?? "your sport");
      return `Got it — orienting this toward ${sport}.`;
    },
    move: () => "Adding explosive openers and conditioning support while keeping primary compound work.",
    reason: () => "Builds the physical qualities that carry over most to the game.",
  },

  SPLIT_CHANGE: {
    acknowledge: () => "Got it — restructuring the training frequency.",
    move: () => "Redistributing primary compound work across the new day structure. Total volume stays the same.",
    reason: () => "Different rhythm without losing the program's core intent.",
  },

  VOLUME_CHANGE: {
    acknowledge: (d) => d.logContext.direction === "reduce"
      ? "Got it — pulling total volume back."
      : "Got it — adding volume.",
    move: (d) => d.logContext.direction === "reduce"
      ? "Removing lowest-priority accessories and trimming remaining set counts. Primary lifts untouched."
      : "Expanding accessory sets and adding work to appropriate sessions. Primary structure unchanged.",
    reason: (d) => d.logContext.direction === "reduce"
      ? "Reduces training stress while keeping the core program intact."
      : "Increases weekly stimulus for continued adaptation.",
  },

  INTENSITY_CHANGE: {
    acknowledge: (d) => d.logContext.direction === "increase"
      ? "Got it — pushing intensity."
      : "Got it — dialing intensity back.",
    move: (d) => d.logContext.direction === "increase"
      ? "Pulling rep ranges down and extending rest on primary lifts."
      : "Shifting rep ranges toward technical quality and reducing effort expectations.",
    reason: (d) => d.logContext.direction === "increase"
      ? "Drives a stronger strength stimulus without excess volume."
      : "Keeps you training productively without pushing into a fatigue hole.",
  },

  EXERCISE_SWAP: {
    acknowledge: () => "Got it — making the swap.",
    move: () => "Replacing the exercise while preserving movement pattern, role, and sets/reps.",
    reason: () => "Keeps the program's structure and intent intact.",
  },
};

// ─── Multi-intent: combined acknowledge + move ────────────────────────────────

function buildMultiAcknowledge(primary: string, secondaries: SpecialistIntentType[], metadata: Record<string, unknown>): string | null {
  if (secondaries.length === 0) return null;

  const tags: string[] = [];
  for (const s of secondaries.slice(0, 1)) {
    switch (s) {
      case "TIME_COMPRESSION": {
        const mins = metadata.duration;
        tags.push(mins ? `tightening to ${mins} minutes` : "tightening the session");
        break;
      }
      case "PAIN_ADJUSTMENT":
        tags.push(`taking stress off the ${String(metadata.bodyPart ?? "affected area")}`);
        break;
      case "RECOVERY_SHIFT":
        tags.push("managing recovery");
        break;
      case "VOLUME_CHANGE":
        tags.push("trimming volume");
        break;
      case "EQUIPMENT_ADJUSTMENT":
        tags.push("adapting to equipment");
        break;
    }
  }

  if (tags.length === 0) return null;
  return `Got it — ${primary} and ${tags.join(", ")}.`;
}

function buildSecondaryMoveClause(secondaries: SpecialistIntentType[], metadata: Record<string, unknown>): string {
  if (secondaries.length === 0) return "";
  const clauses: string[] = [];
  for (const s of secondaries.slice(0, 1)) {
    switch (s) {
      case "TIME_COMPRESSION": clauses.push("then trimming accessories to fit the time"); break;
      case "PAIN_ADJUSTMENT":  clauses.push(`then removing load on the ${String(metadata.bodyPart ?? "affected area")}`); break;
      case "RECOVERY_SHIFT":   clauses.push("then further reducing load to support recovery"); break;
      case "VOLUME_CHANGE":    clauses.push("then trimming total volume"); break;
      case "EQUIPMENT_ADJUSTMENT": clauses.push("then substituting barbell movements for dumbbell equivalents"); break;
    }
  }
  return clauses.length > 0 ? `, ${clauses.join(", ")}` : "";
}

export function buildSpecialistResponse(decision: SpecialistDecision): string {
  const { primaryIntent, secondaryIntents, requiresClarification, clarificationPrompt } = decision;

  if (requiresClarification || primaryIntent === "AMBIGUOUS") {
    return clarificationPrompt ?? "What direction do you want to push it — more strength, more endurance, more explosive, or lower overall fatigue?";
  }

  const voice = INTENT_VOICE[primaryIntent];

  if (!voice) {
    return `Got it — adjustment applied.\n\nKeeping primary structure intact.\n\nUpdated — check your program.`;
  }

  const primaryAcknowledgeCore = voice.acknowledge(decision)
    .replace(/^Got it — /, "")
    .replace(/^Understood — /, "")
    .replace(/\.$/, "");

  // Line 1: combined acknowledge if multi-intent, otherwise standard
  const multiAck = buildMultiAcknowledge(primaryAcknowledgeCore, secondaryIntents, decision.logContext);
  const line1 = multiAck ?? voice.acknowledge(decision);

  // Line 2: primary move + secondary clause
  const primaryMove = voice.move(decision);
  const secondaryClause = buildSecondaryMoveClause(secondaryIntents, decision.logContext);
  const line2 = secondaryClause
    ? primaryMove.replace(/\.$/, "") + secondaryClause + "."
    : primaryMove;

  // Line 3: reason
  const line3 = voice.reason(decision);

  return `${line1}\n\n${line2}\n\n${line3}\n\n${CONFIRM_LINE}`;
}
