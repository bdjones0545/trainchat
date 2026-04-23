// ─── TrainChat Build Threshold Engine ────────────────────────────────────────
//
// Determines whether the agent has gathered enough information to stop
// consulting and start building a training program.
//
// DESIGN PRINCIPLE:
//   Normal uncertainty should NOT delay generation.
//   Only genuine blockers (medical red flags, impossible requests,
//   missing information that would make a safe draft impossible) justify
//   holding back from building.
//
// THRESHOLD TIERS:
//   TIER 1 — IMMEDIATE BUILD: enough context to produce a safe first draft
//   TIER 2 — SOFT HOLD:       some useful context is missing but defaults are safe
//   TIER 3 — HARD BLOCK:      a genuine blocker exists (safety or zero context)
//
// Usage:
//   evaluateBuildThreshold(inputs) → BuildThresholdResult
//   buildThresholdPromptSection(result) → string injected into system prompt

import { logger } from "./logger";
import type { ExtractedConstraints } from "./intent";
import type { UserProfile } from "./training-intelligence";

// ─── Types ────────────────────────────────────────────────────────────────────

export type BuildThresholdTier = "IMMEDIATE_BUILD" | "SOFT_HOLD" | "HARD_BLOCK";

export interface KnownInputs {
  primaryGoal: string | null;
  sport: string | null;
  daysPerWeek: number | null;
  equipment: string | null;
  experienceLevel: string | null;
  age: number | null;
  injuries: string | null;
  populationContext: string | null; // "older_adult", "senior", "youth", etc.
  seasonContext: string | null;
  hasSafetyFlag: boolean;
  safetyFlagReason: string | null;
}

export interface BuildThresholdResult {
  tier: BuildThresholdTier;
  thresholdMet: boolean;
  knownInputs: KnownInputs;
  missingBlockerFields: string[];
  startReason: string | null;
  holdReason: string | null;
  transitionMessage: string | null;
}

// ─── Medical / Safety Red-Flag Detector ──────────────────────────────────────
//
// Detects genuine medical blockers that require clarification before building.
// Conservative: only flags patterns that MATERIALLY affect programming safety.

const HARD_MEDICAL_FLAG_PATTERNS = [
  /\b(heart (condition|disease|attack|failure|problem)|cardiac)\b/i,
  /\b(pacemaker|defibrillator|heart.?stent)\b/i,
  /\b(seizure|epilepsy|epileptic)\b/i,
  /\b(osteoporosis|bone.?density|fracture risk)\b/i,
  /\b(dialysis|kidney (failure|disease))\b/i,
  /\b(recently (had|completed|underwent|finished)\s+(surgery|chemo|radiation|transplant))\b/i,
  /\b(post.?surgery|post.?op)\s+(clearance|cleared|cleared to train)\b/i,
  /\b(cancer|chemotherapy|radiation therapy)\b/i,
  /\b(uncontrolled (diabetes|hypertension|blood pressure))\b/i,
  /\b(vertigo|balance (disorder|condition)|vestibular)\b/i,
];

function detectHardMedicalFlag(message: string, profileInjuries: string): { flag: boolean; reason: string | null } {
  const combined = `${message} ${profileInjuries}`.toLowerCase();
  for (const pattern of HARD_MEDICAL_FLAG_PATTERNS) {
    if (pattern.test(combined)) {
      return { flag: true, reason: `Medical flag detected: ${pattern.toString()}` };
    }
  }
  return { flag: false, reason: null };
}

// ─── Population Context Detector ─────────────────────────────────────────────

function detectPopulationContext(
  message: string,
  constraints: ExtractedConstraints | null,
  _profile: UserProfile | null,
): string | null {
  const age = constraints?.userAge ?? null;
  if (age !== null && age >= 50) return "older_adult";
  if (/\b(senior|older adult|elderly|retiree|retired)\b/i.test(message)) return "older_adult";
  if (/\b(youth|junior|teen|teenager|high school)\b/i.test(message)) return "youth";
  if (/\b(postpartum|post.?natal|post.?pregnancy|new mom|after.?birth)\b/i.test(message)) return "postpartum";
  return null;
}

// ─── Primary Goal Resolver ────────────────────────────────────────────────────
//
// Resolves a primary goal from multiple sources: message, constraints, profile.
// If a sport is detected, athletic performance is the inferred goal.

function resolvePrimaryGoal(
  constraints: ExtractedConstraints | null,
  profile: UserProfile | null,
): string | null {
  if (constraints?.primaryGoal) return constraints.primaryGoal;
  if (constraints?.sportFocus) return "athletic_performance";
  if (profile?.trainingGoal) {
    const g = profile.trainingGoal.toLowerCase();
    if (/strength|power|strong/i.test(g)) return "strength";
    if (/hypertrophy|muscle|mass|bulk/i.test(g)) return "hypertrophy";
    if (/athletic|performance|sport|explosive/i.test(g)) return "athletic_performance";
    if (/fat.?loss|weight.?loss|cut|lean|conditioning/i.test(g)) return "fat_loss";
    if (/fitness|general|health/i.test(g)) return "general_fitness";
    if (profile.trainingGoal.length > 0) return "general_fitness";
  }
  return null;
}

// ─── Zero-Context Detector ────────────────────────────────────────────────────
//
// Detects messages that are completely uninterpretable — no goal, no sport,
// no population context, no directional signal at all.
// This is the only case where HARD_BLOCK fires without a safety flag.

const GENERIC_INTENT_PATTERNS = [
  /\b(workout|program|plan|routine|training)\b/i, // Has any training intent
  /\b(strength|muscle|fit|athletic|sport|cardio|conditioning|weight|lean|bulk)\b/i,
  /\b(help|build|make|create|give|need|want)\b/i,
];

function hasAnyIntentSignal(message: string): boolean {
  return GENERIC_INTENT_PATTERNS.some((p) => p.test(message));
}

// ─── Core Threshold Evaluator ─────────────────────────────────────────────────

export function evaluateBuildThreshold({
  userMessage,
  constraints,
  profile,
  conversationTurnCount,
  previousAssistantMessages,
}: {
  userMessage: string;
  constraints: ExtractedConstraints | null;
  profile: UserProfile | null;
  conversationTurnCount: number;
  previousAssistantMessages: string[];
}): BuildThresholdResult {

  // ── Step 1: Resolve what we know ─────────────────────────────────────────
  const primaryGoal = resolvePrimaryGoal(constraints, profile);
  const sport = constraints?.sportFocus ?? profile?.sportFocus ?? null;
  const daysPerWeek = constraints?.daysPerWeek ?? null;
  const equipment = constraints?.equipment ?? profile?.equipmentAccess ?? null;
  const experienceLevel = constraints?.experienceLevel ?? profile?.experienceLevel ?? null;
  const age = constraints?.userAge ?? null;
  const injuries = constraints?.limitations ?? profile?.injuries ?? null;
  const populationContext = detectPopulationContext(userMessage, constraints, profile);
  const seasonContext = constraints?.seasonContext ?? null;

  const { flag: hasSafetyFlag, reason: safetyFlagReason } = detectHardMedicalFlag(
    userMessage,
    profile?.injuries ?? "",
  );

  const knownInputs: KnownInputs = {
    primaryGoal,
    sport,
    daysPerWeek,
    equipment,
    experienceLevel,
    age,
    injuries,
    populationContext,
    seasonContext,
    hasSafetyFlag,
    safetyFlagReason,
  };

  // ── Step 2: Check for HARD_BLOCK conditions ───────────────────────────────

  // Hard block 1: Genuine medical safety flag requiring clarification before building
  if (hasSafetyFlag) {
    const result: BuildThresholdResult = {
      tier: "HARD_BLOCK",
      thresholdMet: false,
      knownInputs,
      missingBlockerFields: ["medical_context"],
      startReason: null,
      holdReason: safetyFlagReason ?? "Medical flag detected",
      transitionMessage: null,
    };

    logger.info(
      {
        tier: result.tier,
        thresholdMet: result.thresholdMet,
        knownInputs,
        missingBlockerFields: result.missingBlockerFields,
        holdReason: result.holdReason,
        conversationTurnCount,
      },
      "[BuildThreshold] HARD_BLOCK — medical safety flag requires clarification before building"
    );

    return result;
  }

  // Hard block 2: Completely zero context — can't build anything safe
  const hasIntent = hasAnyIntentSignal(userMessage);
  const hasProfileContext = !!(profile?.trainingGoal || profile?.sportFocus || profile?.experienceLevel);

  if (!hasIntent && !hasProfileContext && !primaryGoal && !sport) {
    const result: BuildThresholdResult = {
      tier: "HARD_BLOCK",
      thresholdMet: false,
      knownInputs,
      missingBlockerFields: ["primary_goal"],
      startReason: null,
      holdReason: "Zero context — no goal, sport, or training intent detected",
      transitionMessage: null,
    };

    logger.info(
      {
        tier: result.tier,
        thresholdMet: result.thresholdMet,
        knownInputs,
        missingBlockerFields: result.missingBlockerFields,
        holdReason: result.holdReason,
        conversationTurnCount,
      },
      "[BuildThreshold] HARD_BLOCK — zero context, cannot produce safe first draft"
    );

    return result;
  }

  // ── Step 3: Anti-over-consulting guard ────────────────────────────────────
  //
  // If the agent has already asked questions in a previous turn (turn count > 1),
  // force IMMEDIATE_BUILD regardless of remaining gaps.
  // Normal uncertainty does not justify repeated consultative loops.

  const hasAlreadyConsulted = conversationTurnCount > 1 && previousAssistantMessages.length > 0;
  const previousMessageAskedQuestion = previousAssistantMessages.some((msg) =>
    /\?\s*$/.test(msg.trim())
  );

  if (hasAlreadyConsulted && previousMessageAskedQuestion && (primaryGoal || sport || hasIntent)) {
    const startReason = "Anti-over-consulting guard: agent already asked a question — forcing build on this turn";

    const result: BuildThresholdResult = {
      tier: "IMMEDIATE_BUILD",
      thresholdMet: true,
      knownInputs,
      missingBlockerFields: [],
      startReason,
      holdReason: null,
      transitionMessage: buildTransitionMessage(knownInputs),
    };

    logger.info(
      {
        tier: result.tier,
        thresholdMet: result.thresholdMet,
        knownInputs,
        startReason,
        conversationTurnCount,
        hasAlreadyConsulted,
      },
      "[BuildThreshold] IMMEDIATE_BUILD — anti-over-consulting guard triggered"
    );

    return result;
  }

  // ── Step 4: Check for IMMEDIATE_BUILD (threshold met) ────────────────────
  //
  // Enough to start building when ANY of the following are true:
  //   A. Primary goal is stated (strength, hypertrophy, athletic, etc.)
  //   B. Sport is detected (implies athletic performance goal)
  //   C. Population context is clear (older adult, youth → safe defaults exist)
  //   D. Conversational context makes intent clear enough for a draft

  const hasPrimaryGoal = !!primaryGoal;
  const hasSport = !!sport;
  const hasPopulation = !!populationContext;

  if (hasPrimaryGoal || hasSport || hasPopulation) {
    const startReason = [
      hasPrimaryGoal && `primaryGoal="${primaryGoal}"`,
      hasSport && `sport="${sport}"`,
      hasPopulation && `populationContext="${populationContext}"`,
    ].filter(Boolean).join(", ");

    // Determine missing non-blocker fields (for post-build refinement)
    const missingNonBlockers: string[] = [];
    if (!daysPerWeek) missingNonBlockers.push("daysPerWeek");
    if (!equipment) missingNonBlockers.push("equipment");
    if (!experienceLevel && !hasSport) missingNonBlockers.push("experienceLevel");

    const result: BuildThresholdResult = {
      tier: "IMMEDIATE_BUILD",
      thresholdMet: true,
      knownInputs,
      missingBlockerFields: [],
      startReason,
      holdReason: null,
      transitionMessage: buildTransitionMessage(knownInputs),
    };

    logger.info(
      {
        tier: result.tier,
        thresholdMet: result.thresholdMet,
        knownInputs,
        missingNonBlockers,
        startReason,
        conversationTurnCount,
      },
      "[BuildThreshold] IMMEDIATE_BUILD — threshold met, proceeding to generation"
    );

    return result;
  }

  // ── Step 5: SOFT_HOLD — has some intent but not enough goal context ───────
  //
  // Example: user said "help me with fitness" with no additional context.
  // We have intent but the direction is genuinely unclear.
  // Still prefer building over asking — use SOFT_HOLD only when turn count is 0.

  if (hasIntent && conversationTurnCount === 0) {
    const result: BuildThresholdResult = {
      tier: "SOFT_HOLD",
      thresholdMet: false,
      knownInputs,
      missingBlockerFields: ["primary_goal"],
      startReason: null,
      holdReason: "Has intent but goal direction is unclear — asking one clarifying question first",
      transitionMessage: null,
    };

    logger.info(
      {
        tier: result.tier,
        thresholdMet: result.thresholdMet,
        knownInputs,
        missingBlockerFields: result.missingBlockerFields,
        holdReason: result.holdReason,
        conversationTurnCount,
      },
      "[BuildThreshold] SOFT_HOLD — intent detected but goal direction unclear on first message"
    );

    return result;
  }

  // ── Step 6: Fallback — build with general fitness defaults ───────────────
  //
  // If we reach here: there's some intent but no clear goal after multiple turns.
  // Rather than looping indefinitely, build with safe general fitness defaults.

  const result: BuildThresholdResult = {
    tier: "IMMEDIATE_BUILD",
    thresholdMet: true,
    knownInputs,
    missingBlockerFields: [],
    startReason: "Fallback: building with general fitness defaults to avoid over-consulting loop",
    holdReason: null,
    transitionMessage: buildTransitionMessage(knownInputs),
  };

  logger.info(
    {
      tier: result.tier,
      thresholdMet: result.thresholdMet,
      knownInputs,
      startReason: result.startReason,
      conversationTurnCount,
    },
    "[BuildThreshold] IMMEDIATE_BUILD — fallback to general fitness defaults"
  );

  return result;
}

// ─── Transition Message Builder ───────────────────────────────────────────────
//
// Produces the explicit "I have enough to build" transition message.
// Injected into the system prompt to tell the AI what to say before outputting JSON.

function buildTransitionMessage(inputs: KnownInputs): string {
  const parts: string[] = [];

  if (inputs.sport) {
    parts.push(inputs.sport.replace(/_/g, " "));
  }
  if (inputs.primaryGoal && inputs.primaryGoal !== "athletic_performance") {
    parts.push(inputs.primaryGoal.replace(/_/g, " "));
  }

  const contextStr = parts.length > 0 ? ` for ${parts.join(", ")}` : "";
  return `Got it — I have enough to start building${contextStr}. Building your plan now.`;
}

// ─── System Prompt Section Builder ───────────────────────────────────────────
//
// Injects threshold evaluation into the AI system prompt as a mandatory directive.
// This is the enforcement layer — it tells the AI exactly what to do based on
// the server-side threshold decision.

export function buildThresholdPromptSection(result: BuildThresholdResult): string {
  const lines: string[] = [];

  lines.push(`## BUILD THRESHOLD EVALUATION — SERVER-SIDE DECISION`);
  lines.push(`**Tier:** ${result.tier} | **Threshold Met:** ${result.thresholdMet}`);
  lines.push(``);

  lines.push(`**Known Inputs:**`);
  lines.push(`- Primary Goal: ${result.knownInputs.primaryGoal ?? "not stated"}`);
  lines.push(`- Sport: ${result.knownInputs.sport ?? "none"}`);
  lines.push(`- Days/Week: ${result.knownInputs.daysPerWeek ?? "not stated (use smart default)"}`);
  lines.push(`- Equipment: ${result.knownInputs.equipment ?? "not stated (assume full gym)"}`);
  lines.push(`- Experience: ${result.knownInputs.experienceLevel ?? "not stated (assume intermediate)"}`);
  lines.push(`- Age: ${result.knownInputs.age ?? "not stated"}`);
  lines.push(`- Population Context: ${result.knownInputs.populationContext ?? "none"}`);
  lines.push(`- Season Context: ${result.knownInputs.seasonContext ?? "none"}`);
  lines.push(`- Safety Flag: ${result.knownInputs.hasSafetyFlag ? `YES — ${result.knownInputs.safetyFlagReason}` : "none"}`);
  lines.push(``);

  if (result.tier === "IMMEDIATE_BUILD") {
    lines.push(`### ✅ THRESHOLD MET — BUILD NOW`);
    lines.push(`Start reason: ${result.startReason}`);
    lines.push(``);
    lines.push(`**MANDATORY RESPONSE SEQUENCE:**`);
    lines.push(`1. Output the complete JSON program block immediately.`);
    lines.push(`2. After the JSON, write EXACTLY ONE transition line (do not modify it):`);
    lines.push(`   "${result.transitionMessage}"`);
    lines.push(`3. Then confirm what was built in 1-2 specific lines.`);
    lines.push(`4. Ask ONE smart refinement question (see priority order below).`);
    lines.push(``);
    lines.push(`**FORBIDDEN (threshold is met — do not do these):**`);
    lines.push(`- DO NOT ask broad exploratory questions before generating`);
    lines.push(`- DO NOT explain your approach or methodology before building`);
    lines.push(`- DO NOT write advisory paragraphs about what you're about to do`);
    lines.push(`- DO NOT stay in planning/consulting mode — BUILD NOW`);
    lines.push(`- Missing fields (equipment, days, experience) must be handled via smart defaults, NOT by asking`);
    lines.push(``);
    lines.push(`**Smart defaults when fields are missing:**`);
    lines.push(`- daysPerWeek not stated → use 3-4 days (appropriate for most users)`);
    lines.push(`- equipment not stated → assume full gym (most versatile starting point)`);
    lines.push(`- experienceLevel not stated → assume intermediate`);
    lines.push(`- session duration not stated → design for 45-60 minutes`);

  } else if (result.tier === "SOFT_HOLD") {
    lines.push(`### ⚠️ SOFT HOLD — ASK ONE QUESTION THEN BUILD`);
    lines.push(`Hold reason: ${result.holdReason}`);
    lines.push(`Missing blocker fields: ${result.missingBlockerFields.join(", ")}`);
    lines.push(``);
    lines.push(`**MANDATORY RESPONSE SEQUENCE:**`);
    lines.push(`Ask exactly ONE sharp, focused question to determine: ${result.missingBlockerFields.join(" or ")}.`);
    lines.push(`No preamble. No explanations. No lists. One question only.`);
    lines.push(`The NEXT user message MUST trigger IMMEDIATE_BUILD — do not ask another question.`);

  } else if (result.tier === "HARD_BLOCK") {
    lines.push(`### 🚫 HARD BLOCK — MUST CLARIFY BEFORE BUILDING`);
    lines.push(`Block reason: ${result.holdReason}`);
    lines.push(`Missing blocker fields: ${result.missingBlockerFields.join(", ")}`);
    lines.push(``);
    lines.push(`A genuine blocker exists that prevents safe program generation.`);
    lines.push(`Ask ONE precise clarifying question to resolve: ${result.missingBlockerFields.join(", ")}.`);
    lines.push(`Do not build until the blocker is resolved.`);
  }

  return lines.join("\n");
}
