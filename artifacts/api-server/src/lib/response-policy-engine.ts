/**
 * TrainChat Response Policy Engine
 *
 * Sits between the Language System (AgentIntentProfile) and the AI generation
 * layer. Converts structured intent into an explicit coaching decision:
 *
 *   AgentIntentProfile → ResponsePolicy
 *
 * The ResponsePolicy defines:
 *   - what the agent should DO (actionType)
 *   - what scope it should touch (changeScope)
 *   - how it should respond (responseMode, verbosity, coachVoice)
 *   - whether mutation is needed, whether explanation is needed
 *   - what to preserve, and why the decision was made
 *
 * DESIGN PRINCIPLES:
 *   - Scoring-based, not if/else chain
 *   - Each ActionType has a dedicated scorer
 *   - Scope, mode, and voice are derived from the winning action + profile signals
 *   - Non-destructive: runs alongside existing intent/family/constraint pipeline
 *   - Failures are caught and default to a safe fallback policy
 */

import type {
  AgentIntentProfile,
  RequestType,
  RecoveryState,
  StylePreference,
} from "./language-system";

// ─── Action Types ──────────────────────────────────────────────────────────────

export type ActionType =
  | "CREATE_PROGRAM"
  | "MODIFY_PROGRAM"
  | "MODIFY_BLOCK"
  | "MODIFY_DAY"
  | "ADJUST_TODAY"
  | "SWAP_EXERCISE"
  | "EXPLAIN_REASONING"
  | "ANSWER_QUESTION"
  | "CHECK_IN_RESPONSE"
  | "COACH_CONVERSATION"
  | "PROGRESS_PROGRAM"
  | "REGRESS_PROGRAM"
  | "DELOAD_PROGRAM"
  | "CLARIFY_SOFTLY"
  | "NO_PROGRAM_CHANGE";

// ─── Change Scope ──────────────────────────────────────────────────────────────

export type ChangeScope =
  | "FULL_PROGRAM"
  | "CURRENT_BLOCK"
  | "SINGLE_WEEK"
  | "SINGLE_DAY"
  | "SINGLE_SLOT"
  | "SINGLE_EXERCISE"
  | "NO_CHANGE";

// ─── Response Mode ─────────────────────────────────────────────────────────────

export type ResponseMode =
  | "COACH_CONCISE"
  | "COACH_CONFIRM_AND_ACT"
  | "COACH_EXPLANATORY"
  | "COACH_ANALYTICAL"
  | "COACH_MOTIVATIONAL"
  | "COACH_CONVERSATIONAL"
  | "COACH_LIGHT_CLARIFY";

// ─── Coach Voice Guidance ──────────────────────────────────────────────────────

export type AcknowledgmentStyle =
  | "confirm_and_act"
  | "empathize"
  | "brief_affirm"
  | "question"
  | "none";

export type ToneProfile =
  | "direct"
  | "warm"
  | "analytical"
  | "motivational"
  | "conversational";

export interface CoachVoiceGuidance {
  /** How the agent should open its response */
  acknowledgmentStyle: AcknowledgmentStyle;
  /** Whether to echo slang/metaphor the user used */
  mirrorUserLanguage: boolean;
  /** Whether to explicitly reference the current program */
  referenceCurrentProgram: boolean;
  /** Specific elements of the current program/context worth referencing */
  referenceSpecificContext: string[];
  /** Overall conversational tone */
  toneProfile: ToneProfile;
}

// ─── Policy Warning ────────────────────────────────────────────────────────────

export interface ResponsePolicyWarning {
  code: string;
  message: string;
}

// ─── Policy Context ────────────────────────────────────────────────────────────

export interface ResponsePolicyContext {
  /** Whether the user currently has an active program */
  hasActiveProgram: boolean;
  /** Label of the current training block, if known */
  currentBlock?: string | null;
  /** Label or type of today's session, if known */
  todaySession?: string | null;
  /** Prior preserved preferences the agent remembers */
  preservedLikes?: string[];
  /** Recent user dislikes/complaints */
  preservedDislikes?: string[];
}

// ─── Response Policy ───────────────────────────────────────────────────────────

export interface ResponsePolicy {
  /** What the agent should do */
  actionType: ActionType;
  /** How much of the program to touch */
  changeScope: ChangeScope;
  /** How the response should be framed */
  responseMode: ResponseMode;
  /** 0–1 confidence in this decision */
  confidence: number;
  /** Things the agent must not change */
  preserveTargets: string[];
  /** Whether a DB/program mutation is needed */
  programMutationNeeded: boolean;
  /** Whether the response should include reasoning */
  explanationNeeded: boolean;
  /** How long the response should be */
  verbosityLevel: "short" | "medium" | "long";
  /** Coach personality and phrasing guidance */
  coachVoiceGuidance: CoachVoiceGuidance;
  /** Internal explanation of why this decision was made (for audit) */
  rationale: string;
  /** Non-fatal warnings about potential misclassification */
  warnings: ResponsePolicyWarning[];
}

// ─── Scorer Infrastructure ─────────────────────────────────────────────────────

type Scorer = (
  profile: AgentIntentProfile,
  context: ResponsePolicyContext
) => number;

interface ScoredAction {
  actionType: ActionType;
  score: number;
}

// ─── Helper Signal Extractors ──────────────────────────────────────────────────

/** True if any requestedChange targets the entire program */
function targetsFullProgram(profile: AgentIntentProfile): boolean {
  return profile.requestedChanges.some(
    (c) =>
      c.target === "whole_program" ||
      /\b(whole|entire|full|all|complete|rebuild|redo|restart|totally)\b/i.test(c.raw)
  );
}

/** True if the message targets a specific day or session */
function targetsSpecificDay(profile: AgentIntentProfile): boolean {
  return profile.requestedChanges.some(
    (c) =>
      c.target === "specific_day" ||
      /\b(today|day\s*\d+|this\s+session|this\s+workout|monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b/i.test(c.raw)
  );
}

/** True if the message targets a specific exercise */
function targetsExercise(profile: AgentIntentProfile): boolean {
  return profile.requestedChanges.some(
    (c) =>
      /\b(this exercise|swap this|replace this|change this (exercise|move)|switch this)\b/i.test(c.raw)
  ) || /\b(swap|replace|switch)\b.*(exercise|move|lift)/i.test(profile.sourceUtterance);
}

/** True if the user is signaling a question / wanting explanation */
function isSeekingExplanation(profile: AgentIntentProfile): boolean {
  return /\b(why|how does|what's the reason|explain|tell me why|what is the point|help me understand|rationale|logic)\b/i.test(
    profile.sourceUtterance
  );
}

/** True if the user's message reads as conversational/emotional */
function isConversational(profile: AgentIntentProfile): boolean {
  // Accept explicit conversational classification
  if (
    profile.requestType === "conversational" &&
    profile.requestedChanges.length === 0 &&
    profile.primaryGoal === null
  ) return true;

  // Also catch "unclear" messages that are clearly just affirmations or check-ins
  // with no modification signals at all
  if (
    profile.requestType === "unclear" &&
    profile.requestedChanges.length === 0 &&
    profile.primaryGoal === null &&
    profile.stylePreferences.length === 0 &&
    profile.preserveInstructions.length === 0 &&
    profile.constraints.equipment.unavailable.length === 0 &&
    /\b(looks good|love it|nice|cool|thanks|sounds good|perfect|this works|that makes sense|i like (this|it|that)|awesome|great|solid|not bad|yeah)\b/i.test(profile.sourceUtterance)
  ) return true;

  return false;
}

/** True when there are modification signals regardless of requestType classification */
function hasModificationSignals(profile: AgentIntentProfile): boolean {
  return (
    profile.requestedChanges.length > 0 ||
    profile.preserveInstructions.length > 0 ||
    profile.stylePreferences.length > 0 ||
    profile.constraints.equipment.unavailable.length > 0 ||
    profile.primaryGoal !== null
  );
}

/** True if the user is requesting a deload / back-off */
function isDeloadSignal(profile: AgentIntentProfile): boolean {
  return profile.requestedChanges.some(
    (c) => c.direction === "deload"
  ) || /\b(deload|back off|recovery week|unload|lighter week|easy week|dial back)\b/i.test(
    profile.sourceUtterance
  );
}

/** True if the user is requesting progression */
function isProgressionSignal(profile: AgentIntentProfile): boolean {
  return profile.requestedChanges.some(
    (c) => c.direction === "progress" || c.direction === "intensify"
  ) || /\b(progress|make it harder|level up|advance|increase (the )?difficulty|next level|push harder|harder version)\b/i.test(
    profile.sourceUtterance
  );
}

/** True if the user is requesting regression */
function isRegressionSignal(profile: AgentIntentProfile): boolean {
  return profile.requestedChanges.some(
    (c) => c.direction === "regress"
  ) || /\b(regress|make it easier|dial (it )?back|scale back|step back|less intense|too hard|back off (a bit))\b/i.test(
    profile.sourceUtterance
  );
}

/** True if the user is expressing fatigue / readiness state */
function isFatiguedOrReadiness(profile: AgentIntentProfile): boolean {
  return (
    profile.recoveryState === "very_fatigued" ||
    profile.recoveryState === "beat_up" ||
    profile.recoveryState === "flat" ||
    profile.recoveryState === "low_motivation" ||
    profile.requestType === "adjust_recovery"
  );
}

/** True if user asked an open-ended question (not explanation of existing choice) */
function isOpenQuestion(profile: AgentIntentProfile): boolean {
  return (
    profile.requestType === "ask_question" &&
    !isSeekingExplanation(profile)
  );
}

/** Slang / metaphor signals in the raw message */
function hasSlangOrMetaphor(profile: AgentIntentProfile): boolean {
  return (
    profile.normalizedConcepts.some((c) =>
      /^(recovery:|style:|slang:)/.test(c)
    ) ||
    profile.stylePreferences.includes("more_pop") ||
    profile.stylePreferences.includes("less_grindy") ||
    profile.stylePreferences.includes("cleaner") ||
    profile.stylePreferences.includes("sharper") ||
    /\b(smoked|cooked|gassed|wrecked|beat up|pop|grindy|vibe|same feel|same energy|juice|crispy|fresh)\b/i.test(
      profile.sourceUtterance
    )
  );
}

// ─── Action Scorers ────────────────────────────────────────────────────────────

const ACTION_SCORERS: Record<ActionType, Scorer> = {

  CREATE_PROGRAM: (p, ctx) => {
    let score = 0;
    if (p.requestType === "create_program") score += 0.70;
    if (!ctx.hasActiveProgram && p.requestType !== "conversational") score += 0.15;
    if (p.primaryGoal !== null && p.requestType === "create_program") score += 0.10;
    if (/\b(build|create|make|design|write|generate|give me)\s+(me\s+)?(a|an|my|new)\s+(program|plan|training|schedule|block|split)\b/i.test(p.sourceUtterance)) score += 0.20;
    if (p.requestType === "modify_program" || p.requestType === "preserve_and_modify") score -= 0.30;
    return Math.min(score, 1);
  },

  MODIFY_PROGRAM: (p, ctx) => {
    let score = 0;
    if (p.requestType === "modify_program") score += 0.55;
    if (p.requestType === "preserve_and_modify") score += 0.40;
    // Strong signals from equipment constraints targeted at this week/program
    if (p.constraints.equipment.unavailable.length > 0 && ctx.hasActiveProgram) score += 0.30;
    if (ctx.hasActiveProgram && p.requestedChanges.length > 0) score += 0.20;
    if (p.preserveInstructions.length > 0 && p.requestedChanges.length > 0) score += 0.15;
    if (targetsFullProgram(p)) score += 0.10;
    // Style preferences (vibe, pop, grindy, athletic, etc.) → modify program
    if (p.stylePreferences.length > 0 && ctx.hasActiveProgram) score += 0.25;
    // "same idea / same vibe / same feel" language
    if (/\b(same (idea|vibe|feel|energy|structure|concept)|keep the (vibe|feel|structure)|same (plan|program) but|fix the|change the|update the)\b/i.test(p.sourceUtterance) && ctx.hasActiveProgram) score += 0.30;
    if (isFatiguedOrReadiness(p)) score -= 0.30;
    if (targetsExercise(p)) score -= 0.20;
    if (targetsSpecificDay(p) && !targetsFullProgram(p) && p.preserveInstructions.length === 0) score -= 0.15;
    return Math.min(Math.max(score, 0), 1);
  },

  MODIFY_BLOCK: (p, ctx) => {
    let score = 0;
    if (p.requestType === "modify_program" && !targetsFullProgram(p)) score += 0.30;
    if (p.requestedChanges.some((c) =>
      c.target === "block" ||
      /\b(this block|current block|this phase|lower days|upper days|leg days|push days|pull days)\b/i.test(c.raw)
    )) score += 0.40;
    // Preserve+modify combos strongly suggest block-level work
    if (p.preserveInstructions.some((pi) =>
      /\b(upper|lower|push|pull|day)\b/i.test(pi.raw)
    )) score += 0.35;
    // "Keep X and fix/change/make Y" — classic block-level preserve+modify
    if (
      p.preserveInstructions.length > 0 &&
      p.requestedChanges.some((c) => c.direction !== "preserve")
    ) score += 0.25;
    // Direct language: "fix the lower days", "change the upper", "leave upper alone"
    if (/\b(fix|change|update|rework|clean up|make)\s+the\s+(lower|upper|push|pull|leg)\s+(days?|sessions?|work)\b/i.test(p.sourceUtterance)) score += 0.30;
    if (/\b(keep|leave|preserve)\s+(upper|lower|push|pull)\b/i.test(p.sourceUtterance)) score += 0.25;
    if (!ctx.hasActiveProgram) score -= 0.40;
    return Math.min(Math.max(score, 0), 1);
  },

  MODIFY_DAY: (p, ctx) => {
    let score = 0;
    if (targetsSpecificDay(p) && !isFatiguedOrReadiness(p)) score += 0.50;
    if (p.requestedChanges.some((c) =>
      /\b(day \d+|session \d+|this day|that day|monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b/i.test(c.raw)
    )) score += 0.30;
    // "except day N", "except the X day" — partial approval with day target
    if (/\b(except|aside from|other than|besides)\s+(day\s*\d+|the\s+\w+\s+day)\b/i.test(p.sourceUtterance)) score += 0.45;
    // "liked the last one except" — clearly a day-level modify
    if (/\b(liked?|enjoyed?|good except|great except|fine except|same but)\b.+\b(except|but)\b/i.test(p.sourceUtterance)) score += 0.30;
    if (!ctx.hasActiveProgram) score -= 0.40;
    if (isFatiguedOrReadiness(p)) score -= 0.20;
    return Math.min(Math.max(score, 0), 1);
  },

  ADJUST_TODAY: (p, ctx) => {
    let score = 0;
    if (isFatiguedOrReadiness(p)) score += 0.60;
    if (p.requestType === "adjust_recovery") score += 0.25;
    if (/\b(today|this session|right now|tonight|this morning|this afternoon)\b/i.test(p.sourceUtterance)) score += 0.20;
    if (ctx.todaySession) score += 0.10;
    if (!ctx.hasActiveProgram) score -= 0.40;
    if (targetsFullProgram(p)) score -= 0.30;
    return Math.min(Math.max(score, 0), 1);
  },

  SWAP_EXERCISE: (p, ctx) => {
    let score = 0;
    if (targetsExercise(p)) score += 0.70;
    if (/\b(swap|replace|switch|sub(stitute)?|different (exercise|movement|move|lift))\b/i.test(p.sourceUtterance)) score += 0.20;
    if (p.constraints.equipment.unavailable.length > 0 && !targetsFullProgram(p)) score += 0.15;
    if (!ctx.hasActiveProgram) score -= 0.40;
    return Math.min(Math.max(score, 0), 1);
  },

  EXPLAIN_REASONING: (p, _ctx) => {
    let score = 0;
    if (isSeekingExplanation(p)) score += 0.70;
    if (/\b(why (did you|is this|are these|was this)|what's the thinking|walk me through|explain (this|why|how)|help me understand|rationale|logic behind)\b/i.test(p.sourceUtterance)) score += 0.20;
    return Math.min(Math.max(score, 0), 1);
  },

  ANSWER_QUESTION: (p, _ctx) => {
    let score = 0;
    if (isOpenQuestion(p)) score += 0.60;
    if (/\b(how (would|does|do)|what (is|are|does)|can (you|i)|should i|is it (ok|okay|good|fine)|what happens if|when should|how (long|much|many|often))\b/i.test(p.sourceUtterance)) score += 0.25;
    if (isSeekingExplanation(p)) score -= 0.10;
    return Math.min(Math.max(score, 0), 1);
  },

  CHECK_IN_RESPONSE: (p, ctx) => {
    let score = 0;
    if (p.requestType === "adjust_recovery") score += 0.20;
    if (/\b(i'm (feeling|doing|having)|just (checking in|wanted to|letting you know)|update[: ]|fyi|heads up|not feeling)\b/i.test(p.sourceUtterance)) score += 0.40;
    if (p.recoveryState !== "unknown" && p.requestedChanges.length === 0) score += 0.30;
    return Math.min(Math.max(score, 0), 1);
  },

  COACH_CONVERSATION: (p, _ctx) => {
    let score = 0;
    if (isConversational(p)) score += 0.70;
    if (/\b(looks good|this is great|love it|nice|cool|thanks|sounds good|perfect|this works|that makes sense|i like (this|it|that))\b/i.test(p.sourceUtterance)) score += 0.30;
    if (/\b(just thinking|wondering|curious|had a thought|been thinking|what do you think|your thoughts)\b/i.test(p.sourceUtterance)) score += 0.20;
    return Math.min(Math.max(score, 0), 1);
  },

  PROGRESS_PROGRAM: (p, ctx) => {
    let score = 0;
    if (isProgressionSignal(p)) score += 0.60;
    // Explicit "progress it", "let's progress", "getting easy/boring/too easy"
    if (/\b(progress (it|this|the plan|the program)|let'?s progress|getting (easy|boring|too easy|comfortable)|not challenging|too easy|need more|step it up|level (it|this) up)\b/i.test(p.sourceUtterance)) score += 0.30;
    if (!ctx.hasActiveProgram) score -= 0.40;
    if (isFatiguedOrReadiness(p)) score -= 0.50;
    return Math.min(Math.max(score, 0), 1);
  },

  REGRESS_PROGRAM: (p, ctx) => {
    let score = 0;
    if (isRegressionSignal(p)) score += 0.60;
    if (!ctx.hasActiveProgram) score -= 0.40;
    return Math.min(Math.max(score, 0), 1);
  },

  DELOAD_PROGRAM: (p, ctx) => {
    let score = 0;
    if (isDeloadSignal(p)) score += 0.70;
    // Explicit "deload week" — strong signal, should win over ADJUST_TODAY
    if (/\b(deload\s*week|recovery\s*week|back[- ]off\s*week|unload\s*week|lighter\s*week|easy\s*week|dial[- ]back\s+(\w+\s+)?week)\b/i.test(p.sourceUtterance)) score += 0.40;
    if (!ctx.hasActiveProgram) score -= 0.40;
    if (isFatiguedOrReadiness(p)) score += 0.10;
    return Math.min(Math.max(score, 0), 1);
  },

  CLARIFY_SOFTLY: (p, _ctx) => {
    let score = 0;
    // Only fire if truly ambiguous with NO clear modification signals
    if (p.confidenceScore < 0.35 && p.ambiguityFlags.length >= 2) score += 0.50;
    if (p.requestType === "unclear" && !hasModificationSignals(p)) score += 0.40;
    if (p.requestedChanges.length === 0 && p.primaryGoal === null && p.requestType === "unclear" && !hasModificationSignals(p)) score += 0.25;
    if (p.contradictions.length > 0 && p.confidenceScore < 0.45) score += 0.15;
    // Heavy penalty when clear action signals are present — do not clarify unnecessarily
    if (hasModificationSignals(p)) score -= 0.40;
    if (p.preserveInstructions.length > 0) score -= 0.25;
    if (p.stylePreferences.length > 0) score -= 0.30;
    if (p.constraints.equipment.unavailable.length > 0) score -= 0.35;
    // Penalty for clear affirmation or conversational signals
    if (isConversational(p)) score -= 0.50;
    if (/\b(deload|deload week|recovery week|progress|make it harder|more athletic|no barbell|swap|replace|keep upper|keep lower|fix the|same vibe|same idea|except day|liked except)\b/i.test(p.sourceUtterance)) score -= 0.40;
    return Math.min(Math.max(score, 0), 1);
  },

  NO_PROGRAM_CHANGE: (p, _ctx) => {
    let score = 0;
    if (isConversational(p)) score += 0.70;
    if (/\b(looks good|this is great|love it|nice|cool|thanks|sounds good|perfect|this works|that makes sense|i like (this|it|that)|awesome|great|solid|not bad|love this|this is what i wanted)\b/i.test(p.sourceUtterance)) score += 0.35;
    if (p.requestedChanges.length === 0 && p.stylePreferences.length === 0 && p.primaryGoal === null) score += 0.15;
    if (p.requestedChanges.length > 0) score -= 0.50;
    if (p.stylePreferences.length > 0) score -= 0.30;
    if (p.constraints.equipment.unavailable.length > 0) score -= 0.50;
    return Math.min(Math.max(score, 0), 1);
  },
};

// ─── Scope Derivation ──────────────────────────────────────────────────────────

function deriveChangeScope(
  actionType: ActionType,
  profile: AgentIntentProfile,
  context: ResponsePolicyContext
): ChangeScope {
  switch (actionType) {
    case "CREATE_PROGRAM":
      return "FULL_PROGRAM";

    case "MODIFY_PROGRAM":
      if (targetsFullProgram(profile)) return "FULL_PROGRAM";
      if (profile.preserveInstructions.length > 0) return "CURRENT_BLOCK";
      return "FULL_PROGRAM";

    case "MODIFY_BLOCK":
      return "CURRENT_BLOCK";

    case "MODIFY_DAY":
      return "SINGLE_DAY";

    case "ADJUST_TODAY":
      return "SINGLE_DAY";

    case "SWAP_EXERCISE":
      return "SINGLE_EXERCISE";

    case "DELOAD_PROGRAM":
      return "SINGLE_WEEK";

    case "PROGRESS_PROGRAM":
    case "REGRESS_PROGRAM": {
      if (targetsFullProgram(profile)) return "FULL_PROGRAM";
      if (targetsSpecificDay(profile)) return "SINGLE_DAY";
      return "CURRENT_BLOCK";
    }

    case "EXPLAIN_REASONING":
    case "ANSWER_QUESTION":
    case "CHECK_IN_RESPONSE":
    case "COACH_CONVERSATION":
    case "CLARIFY_SOFTLY":
    case "NO_PROGRAM_CHANGE":
      return "NO_CHANGE";

    default:
      return "NO_CHANGE";
  }
}

// ─── Response Mode Derivation ──────────────────────────────────────────────────

function deriveResponseMode(
  actionType: ActionType,
  profile: AgentIntentProfile,
  _context: ResponsePolicyContext
): ResponseMode {
  if (actionType === "EXPLAIN_REASONING") return "COACH_EXPLANATORY";
  if (actionType === "ANSWER_QUESTION") return "COACH_ANALYTICAL";
  if (actionType === "COACH_CONVERSATION" || actionType === "NO_PROGRAM_CHANGE") return "COACH_CONVERSATIONAL";
  if (actionType === "CHECK_IN_RESPONSE") return "COACH_CONVERSATIONAL";
  if (actionType === "CLARIFY_SOFTLY") return "COACH_LIGHT_CLARIFY";

  if (isFatiguedOrReadiness(profile)) return "COACH_CONCISE";

  if (
    actionType === "PROGRESS_PROGRAM" ||
    profile.stylePreferences.some((s) =>
      ["more_athletic", "more_explosive", "more_game_speed", "more_pop", "more_bounce"].includes(s)
    )
  ) return "COACH_MOTIVATIONAL";

  if (profile.preserveInstructions.length > 0) return "COACH_CONFIRM_AND_ACT";

  if (
    actionType === "SWAP_EXERCISE" ||
    actionType === "MODIFY_DAY" ||
    profile.constraints.equipment.unavailable.length > 0
  ) return "COACH_CONFIRM_AND_ACT";

  if (
    actionType === "CREATE_PROGRAM" ||
    actionType === "MODIFY_PROGRAM" ||
    actionType === "MODIFY_BLOCK"
  ) {
    if (profile.confidenceScore > 0.7) return "COACH_CONFIRM_AND_ACT";
    return "COACH_CONCISE";
  }

  return "COACH_CONFIRM_AND_ACT";
}

// ─── Verbosity Derivation ──────────────────────────────────────────────────────

function deriveVerbosity(
  actionType: ActionType,
  responseMode: ResponseMode,
  profile: AgentIntentProfile
): "short" | "medium" | "long" {
  if (
    responseMode === "COACH_CONVERSATIONAL" ||
    actionType === "NO_PROGRAM_CHANGE" ||
    isFatiguedOrReadiness(profile)
  ) return "short";

  if (
    responseMode === "COACH_EXPLANATORY" ||
    responseMode === "COACH_ANALYTICAL" ||
    actionType === "CREATE_PROGRAM"
  ) return "long";

  return "medium";
}

// ─── Preserve Targets Extraction ──────────────────────────────────────────────

function extractPreserveTargets(profile: AgentIntentProfile): string[] {
  const targets: string[] = [];

  for (const pi of profile.preserveInstructions) {
    if (pi.target && pi.target !== "whole_program") {
      targets.push(pi.target);
    }
    const raw = pi.raw.toLowerCase();
    if (/upper\s*(body|days?|work)?/.test(raw)) targets.push("upper_body");
    if (/lower\s*(body|days?|work)?/.test(raw)) targets.push("lower_body");
    if (/vibe|feel|energy|structure|same\s+(look|flow|style)/.test(raw)) targets.push("program_structure");
    if (/med[- ]ball/.test(raw)) targets.push("med_ball_work");
    if (/sprint/.test(raw)) targets.push("sprint_work");
  }

  for (const change of profile.requestedChanges) {
    if (change.direction === "preserve") {
      targets.push(change.target);
    }
  }

  return [...new Set(targets)];
}

// ─── Coach Voice Guidance ──────────────────────────────────────────────────────

function buildCoachVoiceGuidance(
  actionType: ActionType,
  profile: AgentIntentProfile,
  context: ResponsePolicyContext
): CoachVoiceGuidance {
  const mirrorUserLanguage = hasSlangOrMetaphor(profile);

  const referenceCurrentProgram =
    context.hasActiveProgram &&
    (profile.preserveInstructions.length > 0 ||
      profile.requestType === "modify_program" ||
      profile.requestType === "preserve_and_modify" ||
      actionType === "ADJUST_TODAY" ||
      actionType === "DELOAD_PROGRAM");

  const referenceSpecificContext: string[] = [];
  if (context.currentBlock) referenceSpecificContext.push(`current block: ${context.currentBlock}`);
  if (context.todaySession) referenceSpecificContext.push(`today's session: ${context.todaySession}`);
  if (context.preservedLikes && context.preservedLikes.length > 0) {
    referenceSpecificContext.push(...context.preservedLikes.map((l) => `user liked: ${l}`));
  }

  let acknowledgmentStyle: AcknowledgmentStyle;
  if (isFatiguedOrReadiness(profile)) {
    acknowledgmentStyle = "empathize";
  } else if (actionType === "COACH_CONVERSATION" || actionType === "NO_PROGRAM_CHANGE") {
    acknowledgmentStyle = "brief_affirm";
  } else if (actionType === "CLARIFY_SOFTLY") {
    acknowledgmentStyle = "question";
  } else if (
    actionType === "MODIFY_DAY" ||
    actionType === "SWAP_EXERCISE" ||
    actionType === "ADJUST_TODAY"
  ) {
    acknowledgmentStyle = "confirm_and_act";
  } else if (actionType === "EXPLAIN_REASONING" || actionType === "ANSWER_QUESTION") {
    acknowledgmentStyle = "none";
  } else {
    acknowledgmentStyle = "confirm_and_act";
  }

  let toneProfile: ToneProfile;
  if (
    actionType === "COACH_CONVERSATION" ||
    actionType === "CHECK_IN_RESPONSE" ||
    actionType === "NO_PROGRAM_CHANGE"
  ) {
    toneProfile = "conversational";
  } else if (actionType === "EXPLAIN_REASONING" || actionType === "ANSWER_QUESTION") {
    toneProfile = "analytical";
  } else if (
    actionType === "PROGRESS_PROGRAM" ||
    profile.stylePreferences.some((s) =>
      ["more_athletic", "more_explosive", "more_pop", "more_game_speed"].includes(s)
    )
  ) {
    toneProfile = "motivational";
  } else if (isFatiguedOrReadiness(profile)) {
    toneProfile = "warm";
  } else {
    toneProfile = "direct";
  }

  return {
    acknowledgmentStyle,
    mirrorUserLanguage,
    referenceCurrentProgram,
    referenceSpecificContext,
    toneProfile,
  };
}

// ─── Mutation Flag ─────────────────────────────────────────────────────────────

const NON_MUTATION_ACTIONS = new Set<ActionType>([
  "EXPLAIN_REASONING",
  "ANSWER_QUESTION",
  "CHECK_IN_RESPONSE",
  "COACH_CONVERSATION",
  "CLARIFY_SOFTLY",
  "NO_PROGRAM_CHANGE",
]);

function requiresMutation(actionType: ActionType): boolean {
  return !NON_MUTATION_ACTIONS.has(actionType);
}

// ─── Explanation Flag ──────────────────────────────────────────────────────────

function requiresExplanation(
  actionType: ActionType,
  responseMode: ResponseMode
): boolean {
  return (
    actionType === "EXPLAIN_REASONING" ||
    actionType === "ANSWER_QUESTION" ||
    responseMode === "COACH_EXPLANATORY" ||
    responseMode === "COACH_ANALYTICAL"
  );
}

// ─── Warning Detection ─────────────────────────────────────────────────────────

function detectWarnings(
  actionType: ActionType,
  changeScope: ChangeScope,
  profile: AgentIntentProfile,
  confidence: number
): ResponsePolicyWarning[] {
  const warnings: ResponsePolicyWarning[] = [];

  if (confidence < 0.45 && requiresMutation(actionType)) {
    warnings.push({
      code: "LOW_CONFIDENCE_MUTATION",
      message: `Low-confidence (${(confidence * 100).toFixed(0)}%) action triggered program mutation (${actionType})`,
    });
  }

  if (
    isFatiguedOrReadiness(profile) &&
    changeScope === "FULL_PROGRAM" &&
    actionType !== "DELOAD_PROGRAM"
  ) {
    warnings.push({
      code: "FATIGUE_TRIGGERED_FULL_REBUILD",
      message: "User likely requested a day adjustment but full-program scope was selected",
    });
  }

  if (
    profile.preserveInstructions.length > 0 &&
    changeScope === "FULL_PROGRAM" &&
    actionType !== "CREATE_PROGRAM"
  ) {
    warnings.push({
      code: "PRESERVE_INSTRUCTION_WITH_FULL_REBUILD",
      message: "Preserve instruction detected but full-program scope was selected — ensure preserved targets are respected",
    });
  }

  if (
    isConversational(profile) &&
    requiresMutation(actionType)
  ) {
    warnings.push({
      code: "CONVERSATIONAL_ROUTED_TO_GENERATION",
      message: "Conversational input was routed to a generation action — verify this is correct",
    });
  }

  if (
    targetsSpecificDay(profile) &&
    changeScope === "FULL_PROGRAM" &&
    actionType !== "CREATE_PROGRAM"
  ) {
    warnings.push({
      code: "DAY_SCOPE_INFLATED_TO_FULL_PROGRAM",
      message: "User targeted a specific day but full-program scope was selected",
    });
  }

  return warnings;
}

// ─── Rationale Builder ─────────────────────────────────────────────────────────

function buildRationale(
  actionType: ActionType,
  profile: AgentIntentProfile,
  topScores: ScoredAction[],
  context: ResponsePolicyContext
): string {
  const topTwo = topScores.slice(0, 2);
  const parts: string[] = [];

  parts.push(`requestType=${profile.requestType}`);
  parts.push(`recoveryState=${profile.recoveryState}`);
  parts.push(`confidence=${(profile.confidenceScore * 100).toFixed(0)}%`);
  parts.push(`hasActiveProgram=${context.hasActiveProgram}`);

  if (profile.preserveInstructions.length > 0) {
    parts.push(`preserveInstructions=${profile.preserveInstructions.map((p) => p.target).join(",")}`);
  }
  if (profile.requestedChanges.length > 0) {
    parts.push(`requestedChanges=${profile.requestedChanges.map((c) => c.direction + ":" + c.target).join(",")}`);
  }

  parts.push(
    `scores: ${topTwo
      .map((s) => `${s.actionType}=${s.score.toFixed(2)}`)
      .join(", ")}`
  );

  return `Selected ${actionType}. Signals: ${parts.join(" | ")}`;
}

// ─── Main Entry Point ──────────────────────────────────────────────────────────

/**
 * Resolve a ResponsePolicy from a structured AgentIntentProfile and context.
 *
 * @param profile  Structured interpretation of the user's message.
 * @param context  Program/session state available at call time.
 * @returns        A fully resolved ResponsePolicy.
 */
export function resolveResponsePolicy(
  profile: AgentIntentProfile,
  context: ResponsePolicyContext
): ResponsePolicy {
  // Score every action type
  const scored: ScoredAction[] = (
    Object.keys(ACTION_SCORERS) as ActionType[]
  ).map((actionType) => ({
    actionType,
    score: ACTION_SCORERS[actionType](profile, context),
  }));

  // Sort descending
  scored.sort((a, b) => b.score - a.score);

  const winner = scored[0];
  const actionType = winner.score > 0.05 ? winner.actionType : "COACH_CONVERSATION";
  const confidence = Math.min(
    winner.score,
    // Cap confidence by profile's own confidence score for mutation actions
    requiresMutation(actionType) ? profile.confidenceScore : 1.0
  );

  const changeScope = deriveChangeScope(actionType, profile, context);
  const responseMode = deriveResponseMode(actionType, profile, context);
  const verbosityLevel = deriveVerbosity(actionType, responseMode, profile);
  const preserveTargets = extractPreserveTargets(profile);
  const programMutationNeeded = requiresMutation(actionType);
  const explanationNeeded = requiresExplanation(actionType, responseMode);
  const coachVoiceGuidance = buildCoachVoiceGuidance(actionType, profile, context);
  const warnings = detectWarnings(actionType, changeScope, profile, confidence);
  const rationale = buildRationale(actionType, profile, scored, context);

  return {
    actionType,
    changeScope,
    responseMode,
    confidence,
    preserveTargets,
    programMutationNeeded,
    explanationNeeded,
    verbosityLevel,
    coachVoiceGuidance,
    rationale,
    warnings,
  };
}

// ─── Prompt Section Builder ────────────────────────────────────────────────────

/**
 * Build a prompt section from a ResponsePolicy for injection into AI prompts.
 * Returns null if there is nothing worth injecting (e.g. COACH_CONVERSATION).
 */
export function buildResponsePolicyPromptSection(
  policy: ResponsePolicy
): string | null {
  const lines: string[] = [];

  lines.push("── AGENT RESPONSE POLICY ────────────────────────────────────");
  lines.push(`Action:         ${policy.actionType}`);
  lines.push(`Scope:          ${policy.changeScope}`);
  lines.push(`Response Mode:  ${policy.responseMode}`);
  lines.push(`Verbosity:      ${policy.verbosityLevel}`);

  if (policy.preserveTargets.length > 0) {
    lines.push(`Preserve:       ${policy.preserveTargets.join(", ")}`);
  }

  if (policy.explanationNeeded) {
    lines.push("Explain:        yes — include brief reasoning in the response");
  }

  const voice = policy.coachVoiceGuidance;
  lines.push(`Tone:           ${voice.toneProfile}`);

  if (voice.acknowledgmentStyle !== "none") {
    lines.push(`Open with:      ${voice.acknowledgmentStyle}`);
  }

  if (voice.mirrorUserLanguage) {
    lines.push("Mirror slang:   yes — lightly echo the user's own phrasing");
  }

  if (voice.referenceCurrentProgram && voice.referenceSpecificContext.length > 0) {
    lines.push(`Context refs:   ${voice.referenceSpecificContext.join(" | ")}`);
  }

  if (policy.warnings.length > 0) {
    lines.push(`Warnings:       ${policy.warnings.map((w) => w.code).join(", ")}`);
  }

  lines.push("─────────────────────────────────────────────────────────────");

  lines.push("");
  lines.push("COACH VOICE RULES:");
  lines.push("- Sound like a calm, competent human coach — not a corporate assistant.");
  lines.push("- Do not say 'Constraint received', 'Acknowledged', 'Here is your plan', 'Certainly', or 'Of course'.");
  lines.push("- Use 'we', 'I'll', 'let's' — speak as a coach who knows this athlete.");
  lines.push("- Confirm action in plain language: 'Got it — I'll keep the structure and fix the lower days.'");
  lines.push("- Preserve continuity: reference what's being kept, not just what's changing.");
  lines.push("- Match verbosity: " + (
    policy.verbosityLevel === "short" ? "be brief and direct — one or two sentences max."
      : policy.verbosityLevel === "medium" ? "be clear and grounded — two to four sentences."
      : "be thorough — explain the reasoning, but stay coach-like."
  ));

  return lines.join("\n");
}
