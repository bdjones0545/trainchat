// ======================================================
// TRAINCHAT AGENT ACTION CONTRACT LAYER
// ======================================================
//
// For every user message, this module builds a central ActionContract
// that makes it impossible for the agent to do the wrong kind of thing.
//
// Decision logic:
//  1. Is this a command that changes the program/system?      → MUTATE_ACTIVE_PROGRAM
//  2. Is this a question that needs guidance only?            → GUIDANCE_ONLY
//  3. Is this ambiguous and needs clarification?              → ASK_CLARIFICATION
//  4. Is this unsafe or medically sensitive?                  → SAFETY_RESPONSE
//  5. Is this a preference/constraint to remember?            → PERSIST_CONSTRAINT_ONLY
//  6. Is this a temporary adjustment only?                    → TEMPORARY_ADJUSTMENT
//  7. Is this a full rebuild request?                         → REBUILD_PROGRAM
//
// Every field in ActionContract is a BINDING RULE for the agent.
// The enforcer verifies the final response obeys it.
//
// ======================================================

import { logger } from "./logger";

// ─── Action Types ─────────────────────────────────────────────────────────────

export type ActionType =
  | "MUTATE_ACTIVE_PROGRAM"
  | "TEMPORARY_ADJUSTMENT"
  | "REBUILD_PROGRAM"
  | "PERSIST_CONSTRAINT_ONLY"
  | "GUIDANCE_ONLY"
  | "ASK_CLARIFICATION"
  | "SAFETY_RESPONSE"
  | "NO_OP";

// ─── Response Types ────────────────────────────────────────────────────────────
//
// Every agent response must include exactly one of these.

export type ResponseType =
  | "change_confirmed"
  | "temporary_adjustment_confirmed"
  | "remembered_preference"
  | "guidance_answer"
  | "clarification_question"
  | "safety_adjustment"
  | "rebuild_started"
  | "unable_to_verify";

// ─── Target Scope ─────────────────────────────────────────────────────────────

export type TargetScope =
  | "today"
  | "this_week"
  | "program_wide"
  | "specific_day"
  | "specific_exercise"
  | "preference_memory"
  | "unknown";

// ─── Action Contract ──────────────────────────────────────────────────────────
//
// The central binding contract for one agent turn.
// Built from the user message + program state. Never mutated after creation.

export interface ActionContract {
  userMessage: string;
  detectedIntentFamily: string | null;

  // Primary action the agent MUST take
  actionType: ActionType;

  // Where the action is scoped
  targetScope: TargetScope;

  // Classification confidence
  confidence: "high" | "medium" | "low";

  // Binding flags — agent is required to honor all true flags
  shouldMutate: boolean;
  shouldPersistConstraint: boolean;
  shouldAskClarification: boolean;
  shouldRebuild: boolean;
  shouldRespondGuidanceOnly: boolean;
  safetyMode: boolean;

  // Whether the agent must verify a state change occurred
  requiredVerification: boolean;

  // Human-readable description of expected state change (if mutation)
  expectedStateChange: string | null;

  // Response types the agent is FORBIDDEN from using
  forbiddenResponseTypes: string[];

  // Response types the agent is ALLOWED to use (exactly one must be used)
  allowedResponseTypes: ResponseType[];

  // Reasons this contract was built this way (for debugging + audit)
  contractReasons: string[];
}

// ─── Signal Detectors ─────────────────────────────────────────────────────────

const TEMPORAL_TODAY_PATTERNS = [
  /\b(today|this session|this workout|just (for )?today|this (one|time)|only today|for now|right now|this morning|tonight)\b/i,
  /\b(make (today|this session|this workout) (easier|harder|lighter|shorter|longer))\b/i,
  /\b(for today|just today|today only|this day only)\b/i,
];

const PREFERENCE_PATTERNS = [
  /\b(i hate|i don't like|i dislike|i can't stand|i loathe|i despise)\b/i,
  /\b(i love|i prefer|i enjoy|i like|i want to (always|never))\b/i,
  /\b(never (give|add|include|put|use) .{1,40} (again|to my|in my))\b/i,
  /\b(always (include|add|use|give me))\b/i,
  /\b(i don't (want|like) .{1,30} in my (program|plan|training))\b/i,
  /\b(avoid .{1,30} (in my|from my|going forward|from now on))\b/i,
];

const EQUIPMENT_CONSTRAINT_PATTERNS = [
  /\b(i don't have|i don't own|i have no|no access to|i can't access|i lack)\b/i,
  /\b(not available|unavailable|out of commission|broken|i can't use|can't do)\b/i,
];

const PAIN_SAFETY_PATTERNS = [
  /\b(my (knee|shoulder|back|hip|wrist|ankle|elbow|neck|hamstring|quad|calf|chest|lower back) (hurts?|is sore|is painful|aches?|is bothering|is tight))\b/i,
  /\b(pain in (my )?(knee|shoulder|back|hip|wrist|ankle|elbow|neck))\b/i,
  /\b(i (hurt|injured|tweaked|strained|sprained) my)\b/i,
  /\b(knee pain|shoulder pain|back pain|hip pain|wrist pain|ankle pain)\b/i,
  /\b(i (feel|am feeling) pain|it (hurts?|is painful))\b/i,
  /\b(injury|injured|rehab|recovering from)\b/i,
];

const REBUILD_PATTERNS = [
  /\b(build (me )?(a )?new|create (me )?(a )?new|give me (a )?new|make (me )?(a )?new)\b.{0,40}\b(program|plan|routine|workout|split)\b/i,
  /\b(start (over|fresh|from scratch)|completely new|brand new|restart|new program|new plan)\b/i,
  /\b(rebuild (my|the) program|scrap (this|the)|throw (this|it) out|start again)\b/i,
  /\b(design .{0,30} (program|plan|routine))\b/i,
  /\b(\d[\-–]?day .{0,30} (program|plan|routine|split))\b/i,
];

const MUTATION_COMMAND_PATTERNS = [
  // Explicit removal — with or without exercise type word
  /\b(remove|delete|take out|drop|get rid of)\b.{0,60}/i,
  // Swap/replace — any phrasing
  /\b(swap|replace|substitute|switch)\b.{0,50}\b(with|for|to)\b/i,
  // Explicit add
  /\b(add|include|put in|insert)\b.{0,40}\b(exercise|movement|lift|set|rep|finisher|accessory)\b/i,
  // Change/modify with specific training parameters
  /\b(change|modify|update|adjust|alter)\b.{0,40}\b(exercise|movement|sets?|reps?|weight|load|volume|day|session|program)\b/i,
  // Equipment unavailability
  /\b(i don't have|i can't do)\b.{0,30}\b(barbell|squat rack|cables?|machine|belt squat|smith machine|bench|dumbbells?|kettlebell)\b/i,
  // Day/session modification commands
  /\b(swap|change|fix|update|edit|modify) (day|session|the)\b/i,
];

const GUIDANCE_QUESTION_PATTERNS = [
  /^(why|how|what|when|where|who|which|can|should|is|are|do|does|will|would|could|should)\b/i,
  /\b(explain|tell me (about|why|how)|what is the reason|what's the reason|why did you|how does|why does|can you explain)\b/i,
  /\b(what (does|do|is|are|should|would)|how (do|does|should|would|can))\b/i,
  /\?(^$)*/,
];

const AMBIGUOUS_PRONOUN_PATTERNS = [
  /\b(can i do this instead|swap (it|this) (out|for)|replace (it|this) with|do (it|this) instead)\b/i,
  /\b(what about (this|it)|use (this|it) instead|try (this|it) instead)\b/i,
];

// ─── Signal Detection Functions ───────────────────────────────────────────────

function detectTemporalToday(message: string): boolean {
  return TEMPORAL_TODAY_PATTERNS.some((p) => p.test(message));
}

function detectPreference(message: string): boolean {
  return PREFERENCE_PATTERNS.some((p) => p.test(message));
}

function detectEquipmentConstraint(message: string): boolean {
  return EQUIPMENT_CONSTRAINT_PATTERNS.some((p) => p.test(message));
}

function detectPainSafety(message: string): boolean {
  return PAIN_SAFETY_PATTERNS.some((p) => p.test(message));
}

function detectRebuild(message: string): boolean {
  return REBUILD_PATTERNS.some((p) => p.test(message));
}

function detectMutationCommand(message: string): boolean {
  return MUTATION_COMMAND_PATTERNS.some((p) => p.test(message));
}

function detectGuidanceQuestion(message: string): boolean {
  return GUIDANCE_QUESTION_PATTERNS.some((p) => p.test(message));
}

function detectAmbiguousPronoun(message: string): boolean {
  return AMBIGUOUS_PRONOUN_PATTERNS.some((p) => p.test(message));
}

function detectTargetScope(message: string): TargetScope {
  const lower = message.toLowerCase();
  if (TEMPORAL_TODAY_PATTERNS.some((p) => p.test(lower))) return "today";
  if (/\b(this week|week \d+|current week)\b/i.test(lower)) return "this_week";
  if (/\b(day \d+|session \d+|the (first|second|third|fourth|fifth|sixth|seventh) (day|session))\b/i.test(lower)) return "specific_day";
  if (/\b(whole program|entire program|all sessions|program.?wide|everything)\b/i.test(lower)) return "program_wide";
  if (/\b(this exercise|this movement|this lift|squat|bench|deadlift|press|row|curl|lunge|plank)\b/i.test(lower)) return "specific_exercise";
  if (PREFERENCE_PATTERNS.some((p) => p.test(lower))) return "preference_memory";
  return "unknown";
}

// ─── Allowed / Forbidden Response Type Maps ───────────────────────────────────

const ALLOWED_RESPONSE_TYPES: Record<ActionType, ResponseType[]> = {
  MUTATE_ACTIVE_PROGRAM: ["change_confirmed", "unable_to_verify"],
  TEMPORARY_ADJUSTMENT: ["temporary_adjustment_confirmed", "unable_to_verify"],
  REBUILD_PROGRAM: ["rebuild_started"],
  PERSIST_CONSTRAINT_ONLY: ["remembered_preference"],
  GUIDANCE_ONLY: ["guidance_answer"],
  ASK_CLARIFICATION: ["clarification_question"],
  SAFETY_RESPONSE: ["safety_adjustment", "clarification_question"],
  NO_OP: ["guidance_answer"],
};

const UNIVERSAL_FORBIDDEN = [
  "I processed your request",
  "I applied the change",   // without verification
  "Here's what I would do", // when mutation was requested
];

const FORBIDDEN_BY_ACTION: Record<ActionType, string[]> = {
  MUTATE_ACTIVE_PROGRAM: [
    ...UNIVERSAL_FORBIDDEN,
    "guidance_answer",       // don't pretend a program changed
    "clarification_question", // don't ask — mutate
  ],
  TEMPORARY_ADJUSTMENT: [
    ...UNIVERSAL_FORBIDDEN,
    "change_confirmed",      // must be temporary, not permanent confirmation
    "future_weeks_changed",  // never touch future when user said today
  ],
  REBUILD_PROGRAM: [
    ...UNIVERSAL_FORBIDDEN,
    "guidance_answer",
  ],
  PERSIST_CONSTRAINT_ONLY: [
    ...UNIVERSAL_FORBIDDEN,
    "change_confirmed",      // nothing was changed in program
  ],
  GUIDANCE_ONLY: [
    "change_confirmed",           // do not pretend a program changed
    "temporary_adjustment_confirmed",
    "rebuild_started",
  ],
  ASK_CLARIFICATION: [
    "change_confirmed",
    "rebuild_started",
    "guidance_answer",
  ],
  SAFETY_RESPONSE: [
    ...UNIVERSAL_FORBIDDEN,
    "generic_safety_disclaimer", // must have coaching action, not just disclaimer
  ],
  NO_OP: [],
};

// ─── Contract Builder ─────────────────────────────────────────────────────────
//
// Builds the ActionContract from a raw user message and program state.
// Pure function — no side effects, no DB calls, no AI calls.

export function buildActionContract(
  userMessage: string,
  hasActiveProgram: boolean,
  intentFamily: string | null = null,
): ActionContract {
  const reasons: string[] = [];
  const lower = userMessage.toLowerCase().trim();

  // ── Signal Detection ────────────────────────────────────────────────────────
  const isTodayScoped = detectTemporalToday(lower);
  const isPreference = detectPreference(lower);
  const isEquipmentConstraint = detectEquipmentConstraint(lower);
  const isPain = detectPainSafety(lower);
  const isRebuild = detectRebuild(lower);
  const isMutationCommand = detectMutationCommand(lower);
  const isQuestion = detectGuidanceQuestion(lower);
  const isAmbiguousPronoun = detectAmbiguousPronoun(lower);
  const targetScope = detectTargetScope(lower);

  // Composite signals
  const hasMutationSignal = isMutationCommand || isEquipmentConstraint || (isPreference && hasActiveProgram);
  const hasPersistSignal = isPreference || isEquipmentConstraint;

  // ── Action Type Resolution — Priority Order ──────────────────────────────────
  //
  // Priority 1: Safety (overrides everything else)
  // Priority 2: Rebuild (explicit fresh build)
  // Priority 3: Temporary adjustment (today-scoped mutation)
  // Priority 4: Guidance question (no mutation)
  // Priority 5: Ambiguous pronoun (need clarification before acting)
  // Priority 6: Mutation command
  // Priority 7: Preference-only (no active program context to mutate)
  // Priority 8: NO_OP

  let actionType: ActionType;
  let confidence: "high" | "medium" | "low" = "medium";
  let shouldMutate = false;
  let shouldPersistConstraint = false;
  let shouldAskClarification = false;
  let shouldRebuild = false;
  let shouldRespondGuidanceOnly = false;
  let safetyMode = false;
  let requiredVerification = false;
  let expectedStateChange: string | null = null;

  if (isPain) {
    // Safety first — may or may not mutate depending on severity
    // If we also have a program and pain is in a specific body part, we can potentially mutate
    // But if severity/location is unclear, ask clarification
    const isClear = /\b(knee|shoulder|back|hip|wrist|ankle|elbow|neck|hamstring)\b/i.test(lower);

    if (isClear && hasActiveProgram) {
      actionType = "SAFETY_RESPONSE";
      shouldMutate = true;
      safetyMode = true;
      requiredVerification = true;
      confidence = "medium";
      reasons.push("Pain signal detected with clear body part — safety mode active, conservative mutation possible");
      expectedStateChange = "Exercises stressing the affected region reduced or removed";
    } else {
      actionType = "SAFETY_RESPONSE";
      shouldAskClarification = !isClear; // ask if body part unclear
      safetyMode = true;
      confidence = "medium";
      reasons.push(
        isClear
          ? "Pain signal detected — safety mode active, no active program to mutate"
          : "Pain signal detected but body part unclear — asking for clarification"
      );
    }
  } else if (isRebuild) {
    actionType = "REBUILD_PROGRAM";
    shouldRebuild = true;
    confidence = "high";
    reasons.push("Explicit rebuild/new program request detected");
    expectedStateChange = "Entire program replaced with a newly generated one";
  } else if (isTodayScoped && (hasMutationSignal || /\b(easier|harder|lighter|heavier|shorter|longer|simpler|tougher)\b/i.test(lower))) {
    actionType = "TEMPORARY_ADJUSTMENT";
    shouldMutate = true;
    requiredVerification = true;
    confidence = "high";
    reasons.push("Temporal 'today/this session' scope detected with modification intent — TEMPORARY_ADJUSTMENT only");
    expectedStateChange = "Today's session modified only; future weeks unchanged";
  } else if (isAmbiguousPronoun && !hasMutationSignal) {
    // Ambiguous pronoun must be checked BEFORE generic question detection.
    // "Can I do this instead?" starts with a question word but is primarily
    // an unresolved pronoun reference, not a coaching question.
    actionType = "ASK_CLARIFICATION";
    shouldAskClarification = true;
    confidence = "medium";
    reasons.push("Ambiguous pronoun (this/it) with no clear referent — clarification required before any mutation");
  } else if (isQuestion && !hasMutationSignal) {
    actionType = "GUIDANCE_ONLY";
    shouldRespondGuidanceOnly = true;
    confidence = "high";
    reasons.push("Question pattern detected with no mutation signal — GUIDANCE_ONLY");
  } else if (isMutationCommand || (isEquipmentConstraint && hasActiveProgram)) {
    actionType = "MUTATE_ACTIVE_PROGRAM";
    shouldMutate = true;
    shouldPersistConstraint = hasPersistSignal;
    requiredVerification = true;
    confidence = isMutationCommand ? "high" : "medium";
    reasons.push("Direct mutation command detected — MUTATE_ACTIVE_PROGRAM");
    if (hasPersistSignal) reasons.push("Preference/equipment signal also detected — constraint will be persisted");
    expectedStateChange = "Program modified per user command";
  } else if (isPreference && hasActiveProgram) {
    // Preference about something that likely exists in the program
    actionType = "MUTATE_ACTIVE_PROGRAM";
    shouldMutate = true;
    shouldPersistConstraint = true;
    requiredVerification = true;
    confidence = "medium";
    reasons.push("Preference signal ('I hate/love/dislike X') with active program — mutate AND persist");
    expectedStateChange = "Disliked/unavailable exercise removed from program if present, constraint remembered for future";
  } else if (isPreference && !hasActiveProgram) {
    actionType = "PERSIST_CONSTRAINT_ONLY";
    shouldPersistConstraint = true;
    confidence = "medium";
    reasons.push("Preference signal detected but no active program — persist constraint only");
  } else if (isQuestion) {
    actionType = "GUIDANCE_ONLY";
    shouldRespondGuidanceOnly = true;
    confidence = "low";
    reasons.push("Possible question (low confidence) — defaulting to GUIDANCE_ONLY");
  } else {
    actionType = "NO_OP";
    confidence = "low";
    reasons.push("No clear action signal detected — NO_OP, respond with coaching guidance");
  }

  // ── Override: if it's guidance-only, never allow mutation ─────────────────
  if (shouldRespondGuidanceOnly) {
    shouldMutate = false;
    shouldRebuild = false;
    requiredVerification = false;
  }

  const contract: ActionContract = {
    userMessage,
    detectedIntentFamily: intentFamily,
    actionType,
    targetScope,
    confidence,
    shouldMutate,
    shouldPersistConstraint,
    shouldAskClarification,
    shouldRebuild,
    shouldRespondGuidanceOnly,
    safetyMode,
    requiredVerification,
    expectedStateChange,
    forbiddenResponseTypes: FORBIDDEN_BY_ACTION[actionType] ?? [],
    allowedResponseTypes: ALLOWED_RESPONSE_TYPES[actionType] ?? ["guidance_answer"],
    contractReasons: reasons,
  };

  logger.info(
    {
      actionType: contract.actionType,
      targetScope: contract.targetScope,
      confidence: contract.confidence,
      shouldMutate: contract.shouldMutate,
      shouldPersistConstraint: contract.shouldPersistConstraint,
      shouldAskClarification: contract.shouldAskClarification,
      shouldRebuild: contract.shouldRebuild,
      shouldRespondGuidanceOnly: contract.shouldRespondGuidanceOnly,
      safetyMode: contract.safetyMode,
      reasons: contract.contractReasons,
      messageSnippet: userMessage.slice(0, 80),
    },
    "[ActionContract] Built"
  );

  return contract;
}

// ─── Response Type Resolver ───────────────────────────────────────────────────
//
// Given the final state after the agent response, determine which ResponseType
// was actually used. This is called by the enforcer after the turn completes.

export function resolveResponseType(
  contract: ActionContract,
  mutationApplied: boolean,
  verificationStatus: "verified" | "partial" | "unclear" | "not_applicable",
  clarificationAsked: boolean,
  programRebuilt: boolean,
  constraintPersisted: boolean,
): ResponseType {
  const { actionType } = contract;

  if (actionType === "REBUILD_PROGRAM" && programRebuilt) return "rebuild_started";
  if (actionType === "ASK_CLARIFICATION" || clarificationAsked) return "clarification_question";
  if (actionType === "GUIDANCE_ONLY") return "guidance_answer";
  if (actionType === "PERSIST_CONSTRAINT_ONLY" && constraintPersisted) return "remembered_preference";

  if (actionType === "SAFETY_RESPONSE") {
    if (mutationApplied && verificationStatus === "verified") return "safety_adjustment";
    if (clarificationAsked) return "clarification_question";
    return "safety_adjustment"; // best effort
  }

  if (actionType === "TEMPORARY_ADJUSTMENT") {
    if (mutationApplied && verificationStatus === "verified") return "temporary_adjustment_confirmed";
    return "unable_to_verify";
  }

  if (actionType === "MUTATE_ACTIVE_PROGRAM") {
    if (mutationApplied) {
      if (verificationStatus === "verified" || verificationStatus === "partial") return "change_confirmed";
      return "unable_to_verify";
    }
    return "unable_to_verify";
  }

  return "guidance_answer";
}

// ─── Contract Validator ────────────────────────────────────────────────────────
//
// Checks that a resolved ResponseType is allowed by the contract.
// Returns a list of violations (empty = contract honored).

export function validateContractCompliance(
  contract: ActionContract,
  actualResponseType: ResponseType,
  mutationApplied: boolean,
  verificationStatus: "verified" | "partial" | "unclear" | "not_applicable",
): { violations: string[]; passed: boolean } {
  const violations: string[] = [];

  // Check: allowed response types
  if (!contract.allowedResponseTypes.includes(actualResponseType)) {
    violations.push(
      `Response type "${actualResponseType}" is not in allowedResponseTypes [${contract.allowedResponseTypes.join(", ")}] for action "${contract.actionType}"`
    );
  }

  // Check: shouldMutate = true means mutation must have occurred
  if (contract.shouldMutate && !mutationApplied && actualResponseType === "change_confirmed") {
    violations.push(
      `Contract required mutation (shouldMutate=true) but agent claimed "change_confirmed" without applying a mutation`
    );
  }

  // Check: requiredVerification means cannot return "change_confirmed" on "unclear" verification
  if (contract.requiredVerification && verificationStatus === "unclear" && actualResponseType === "change_confirmed") {
    violations.push(
      `Contract requires verification but status was "unclear" — response type should be "unable_to_verify", not "change_confirmed"`
    );
  }

  // Check: guidance-only must not claim mutation
  if (contract.shouldRespondGuidanceOnly && mutationApplied) {
    violations.push(
      `Contract flagged shouldRespondGuidanceOnly=true but a mutation was applied — guidance answers must not modify program state`
    );
  }

  // Check: temporary adjustment must not produce permanent change_confirmed
  if (contract.actionType === "TEMPORARY_ADJUSTMENT" && actualResponseType === "change_confirmed") {
    violations.push(
      `TEMPORARY_ADJUSTMENT must produce "temporary_adjustment_confirmed", not "change_confirmed" — future weeks must be unchanged`
    );
  }

  const passed = violations.length === 0;

  if (!passed) {
    logger.warn(
      { violations, actionType: contract.actionType, actualResponseType },
      "[ActionContract] CONTRACT VIOLATION DETECTED"
    );
  }

  return { violations, passed };
}
