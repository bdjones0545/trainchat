/**
 * TrainChat Special Considerations Engine
 *
 * Handles users with meaningful physical limitations, neurological conditions,
 * balance issues, frailty, or other special considerations that require safer,
 * more conservative programming beyond the standard athletic exercise library.
 *
 * This is NOT a medical diagnosis engine.
 * This is NOT rehab or treatment.
 * This is a safer programming mode for users with meaningful limitations.
 *
 * Core principle:
 * - Normal users: library-first, deterministic, standard engines
 * - Special-consideration users: OpenAI-guided construction allowed beyond the
 *   normal exercise DB, stricter safety constraints, conservative progression,
 *   validator-enforced output quality
 *
 * The system becomes more flexible AND more conservative simultaneously.
 * It does NOT weaken the existing athletic system.
 */

import { logger } from "./logger";

// ─── Special Consideration Types ─────────────────────────────────────────────

export type SpecialConsiderationType =
  | "none"
  | "older_adult"
  | "parkinsons"
  | "neurological_limitations"
  | "balance_fall_risk"
  | "frailty_deconditioning"
  | "mobility_limitations"
  | "joint_sensitive"
  | "multi_factor_special_consideration";

export type SpecialConsiderationSeverity = "mild" | "moderate" | "high";

export interface SpecialConsiderationContext {
  detected: boolean;
  primaryType: SpecialConsiderationType;
  matchedSignals: string[];
  severity: SpecialConsiderationSeverity;
  requiresConservativeProgramming: boolean;
  hasBalanceFallRisk: boolean;
  hasNeurologicalFactors: boolean;
  hasJointSensitivity: boolean;
  hasFrailtyFactors: boolean;
  goalContext: string | null;
  notes: string[];
}

// ─── Session Archetype Types ──────────────────────────────────────────────────

export type SpecialConsiderationsArchetype =
  | "strength_for_function"
  | "supported_balance_and_gait"
  | "movement_confidence_session"
  | "chair_supported_strength"
  | "controlled_mobility_and_tolerance"
  | "low_complexity_conditioning"
  | "recovery_and_movement_day";

// ─── Signal Patterns ─────────────────────────────────────────────────────────

const PARKINSONS_SIGNALS = [
  /\bparkinson[''']?s?\b/i,
  /\btremor(s)?\b/i,
  /\bparkinsonian\b/i,
  /\bdyskinesia\b/i,
  /\bresting\s*tremor\b/i,
];

const NEUROLOGICAL_SIGNALS = [
  /\b(ms|multiple\s*sclerosis)\b/i,
  /\b(stroke(\s*history)?|post.?stroke|had\s*a\s*stroke)\b/i,
  /\b(neuropathy|peripheral\s*neuropathy)\b/i,
  /\b(neurological\s*(condition|disorder|limitation|diagnosis))\b/i,
  /\b(tbi|traumatic\s*brain\s*injury)\b/i,
  /\b(spinal\s*stenosis)\b/i,
  /\b(spinal\s*cord\s*(injury|condition))\b/i,
  /\b(coordination\s*(issues?|problems?|difficulties|impairment))\b/i,
  /\b(dystonia)\b/i,
  /\b(cerebral\s*palsy)\b/i,
  /\b(essential\s*tremor)\b/i,
  /\b(vertigo\s*(condition|persistent|chronic))\b/i,
];

const BALANCE_FALL_RISK_SIGNALS = [
  /\b(balance\s*(issues?|problems?|difficulties|limitations?|impairment|concern))\b/i,
  /\b(fall\s*risk|risk\s*of\s*falling|afraid\s*of\s*falling|fear\s*of\s*falling)\b/i,
  /\b(unstable\s*gait|gait\s*(issues?|instability|impairment))\b/i,
  /\b(difficulty\s*(walking|balancing))\b/i,
  /\b(walker(\s*use)?|uses?\s*a\s*walker)\b/i,
  /\b(cane(\s*use)?|uses?\s*a\s*cane|walks\s*with\s*a\s*cane)\b/i,
  /\b(rollator)\b/i,
  /\b(unsteady|unsteadiness)\b/i,
  /\b(difficulty\s*(getting\s*off|getting\s*up\s*from)\s*the\s*floor)\b/i,
  /\b(balance\s*confidence)\b/i,
  /\b(improve\s*(my\s*)?(confidence|walking|gait|balance))\b/i,
];

const FRAILTY_DECONDITIONING_SIGNALS = [
  /\b(frail|frailty)\b/i,
  /\b(very\s*deconditioned|severely\s*deconditioned|completely\s*deconditioned)\b/i,
  /\b(chair.?(based|bound|supported)\s*(workout|exercise|training))\b/i,
  /\b(can.?t\s*(stand|get\s*up)\s*(for\s*long|without\s*support))\b/i,
  /\b(limited\s*(stamina|endurance|energy))\b/i,
  /\b(chronic\s*fatigue)\b/i,
  /\b(very\s*out\s*of\s*shape|severely\s*out\s*of\s*shape)\b/i,
  /\b(sedentary\s*(lifestyle|for\s*(years|a\s*long\s*time)))\b/i,
  /\b(weakness|muscle\s*weakness)\b/i,
];

const OLDER_ADULT_SIGNALS = [
  /\b(older\s*adult|older\s*(person|individual|man|woman))\b/i,
  /\b(elderly|elder)\b/i,
  /\b(senior(\s*(citizen|fitness|exercise|workout))?)\b/i,
  /\b(in\s*my\s*(60s|70s|80s|90s))\b/i,
  /\bi[''']?m\s*(6[0-9]|7[0-9]|8[0-9]|9[0-9])\b/i,
  /\b(age[d]?\s*(6[0-9]|7[0-9]|8[0-9]|9[0-9]))\b/i,
  /\b(age\s*appropriate|age.?related)\b/i,
  /\b(72|73|74|75|76|77|78|79|80|81|82|83|84|85|86|87|88|89|90)\s*(year|yr)s?\s*old\b/i,
  /\b(over\s*(60|65|70|75|80))\b/i,
  /\bpost.?menopausal\b/i,
];

const MOBILITY_LIMITATIONS_SIGNALS = [
  /\b(limited\s*(mobility|range\s*of\s*motion|movement))\b/i,
  /\b(major\s*mobility\s*limitation)\b/i,
  /\b(wheelchair(\s*user)?|uses?\s*a\s*wheelchair)\b/i,
  /\b(can.?t\s*(do|perform)\s*(many|most|complex)\s*(exercises|movements))\b/i,
  /\b(very\s*limited\s*(movement|mobility|range))\b/i,
  /\b(functional\s*(limitation|impairment))\b/i,
  /\b(restricted\s*(movement|mobility|range))\b/i,
  /\b(post.?surgical\s*(mobility|restriction))\b/i,
];

const JOINT_SENSITIVE_SIGNALS = [
  /\b(arthritis|arthritic)\b/i,
  /\b(osteoporosis|osteopenia)\b/i,
  /\b(joint\s*replacement|hip\s*replacement|knee\s*replacement)\b/i,
  /\b(joint\s*(pain|sensitivity|fragility|sensitivity))\b/i,
  /\b(osteoarthritis)\b/i,
  /\b(joint.?sensitive)\b/i,
  /\b(bone\s*(density|health|fragility))\b/i,
  /\b(chronic\s*joint\s*(pain|inflammation))\b/i,
  /\b(degenerative\s*(joint|disc))\b/i,
  /\b(inflammatory\s*(arthritis|condition))\b/i,
  /\b(rheumatoid)\b/i,
  /\b(gout)\b/i,
  /\b(fibromyalgia)\b/i,
];

// ─── Age-Based Older Adult Detection ─────────────────────────────────────────

function detectOlderAdultByAge(combined: string): boolean {
  // Match explicit age mentions >= 60
  const ageMatch = combined.match(/\b(?:i[''']?m|i\s+am|age[d]?|aged)\s+(\d{2})\b/i);
  if (ageMatch) {
    const age = parseInt(ageMatch[1], 10);
    if (age >= 60) return true;
  }

  // "I'm 72" pattern
  const simpleAge = combined.match(/\bi[''']?m\s+(\d{2})\b/i);
  if (simpleAge) {
    const age = parseInt(simpleAge[1], 10);
    if (age >= 60) return true;
  }

  return false;
}

// ─── Main Detection Function ──────────────────────────────────────────────────

export function detectSpecialConsiderations(
  userMessage: string,
  trainingGoal: string = "",
  injuries: string = "",
): SpecialConsiderationContext {
  const combined = (userMessage + " " + trainingGoal + " " + injuries).toLowerCase();
  const matchedSignals: string[] = [];

  let parkinsonScore = 0;
  let neurologicalScore = 0;
  let balanceFallRiskScore = 0;
  let frailtyScore = 0;
  let olderAdultScore = 0;
  let mobilityScore = 0;
  let jointScore = 0;

  // ── Check Parkinson's signals ──────────────────────────────────────────────
  for (const pattern of PARKINSONS_SIGNALS) {
    const match = combined.match(pattern);
    if (match) {
      matchedSignals.push(match[0].trim());
      parkinsonScore += 3;
    }
  }

  // ── Check neurological signals ─────────────────────────────────────────────
  for (const pattern of NEUROLOGICAL_SIGNALS) {
    const match = combined.match(pattern);
    if (match) {
      matchedSignals.push(match[0].trim());
      neurologicalScore += 2;
    }
  }

  // ── Check balance/fall risk signals ──────────────────────────────────────
  for (const pattern of BALANCE_FALL_RISK_SIGNALS) {
    const match = combined.match(pattern);
    if (match) {
      matchedSignals.push(match[0].trim());
      balanceFallRiskScore += 2;
    }
  }

  // ── Check frailty/deconditioning signals ─────────────────────────────────
  for (const pattern of FRAILTY_DECONDITIONING_SIGNALS) {
    const match = combined.match(pattern);
    if (match) {
      matchedSignals.push(match[0].trim());
      frailtyScore += 2;
    }
  }

  // ── Check older adult signals ─────────────────────────────────────────────
  for (const pattern of OLDER_ADULT_SIGNALS) {
    const match = combined.match(pattern);
    if (match) {
      matchedSignals.push(match[0].trim());
      olderAdultScore += 2;
    }
  }

  // Age-based detection
  if (detectOlderAdultByAge(combined)) {
    if (!matchedSignals.some(s => /\d{2}/.test(s))) {
      matchedSignals.push("age 60+");
    }
    olderAdultScore += 2;
  }

  // ── Check mobility limitations signals ────────────────────────────────────
  for (const pattern of MOBILITY_LIMITATIONS_SIGNALS) {
    const match = combined.match(pattern);
    if (match) {
      matchedSignals.push(match[0].trim());
      mobilityScore += 2;
    }
  }

  // ── Check joint-sensitive signals ─────────────────────────────────────────
  for (const pattern of JOINT_SENSITIVE_SIGNALS) {
    const match = combined.match(pattern);
    if (match) {
      matchedSignals.push(match[0].trim());
      jointScore += 2;
    }
  }

  // De-duplicate signals
  const uniqueSignals = [...new Set(matchedSignals)].slice(0, 8);

  // ── Determine if special considerations apply ────────────────────────────
  const totalScore =
    parkinsonScore +
    neurologicalScore +
    balanceFallRiskScore +
    frailtyScore +
    olderAdultScore +
    mobilityScore +
    jointScore;

  if (totalScore === 0) {
    return {
      detected: false,
      primaryType: "none",
      matchedSignals: [],
      severity: "mild",
      requiresConservativeProgramming: false,
      hasBalanceFallRisk: false,
      hasNeurologicalFactors: false,
      hasJointSensitivity: false,
      hasFrailtyFactors: false,
      goalContext: null,
      notes: [],
    };
  }

  // ── Determine primary type ────────────────────────────────────────────────
  const scores: Record<SpecialConsiderationType, number> = {
    none: 0,
    parkinsons: parkinsonScore,
    neurological_limitations: neurologicalScore,
    balance_fall_risk: balanceFallRiskScore,
    frailty_deconditioning: frailtyScore,
    older_adult: olderAdultScore,
    mobility_limitations: mobilityScore,
    joint_sensitive: jointScore,
    multi_factor_special_consideration: 0,
  };

  // Count how many categories triggered (score > 0)
  const triggeredCategories = Object.entries(scores)
    .filter(([k, v]) => k !== "none" && k !== "multi_factor_special_consideration" && v > 0)
    .length;

  let primaryType: SpecialConsiderationType;

  if (triggeredCategories >= 3) {
    primaryType = "multi_factor_special_consideration";
  } else {
    // Find the highest-scoring type
    const sorted = Object.entries(scores)
      .filter(([k]) => k !== "none" && k !== "multi_factor_special_consideration")
      .sort(([, a], [, b]) => b - a);

    primaryType = (sorted[0]?.[0] as SpecialConsiderationType) ?? "none";
  }

  // ── Determine severity ────────────────────────────────────────────────────
  let severity: SpecialConsiderationSeverity;
  if (parkinsonScore >= 3 || neurologicalScore >= 4 || frailtyScore >= 4 || triggeredCategories >= 3) {
    severity = "high";
  } else if (totalScore >= 4 || triggeredCategories >= 2) {
    severity = "moderate";
  } else {
    severity = "mild";
  }

  // ── Extract goal context ──────────────────────────────────────────────────
  let goalContext: string | null = null;
  const goalLower = trainingGoal.toLowerCase();
  if (/strength|strong/.test(goalLower)) goalContext = "strength";
  else if (/fat.?loss|weight.?loss|conditioning|cardio/.test(goalLower)) goalContext = "conditioning_fat_loss";
  else if (/mobility|flexibility|movement/.test(goalLower)) goalContext = "mobility";
  else if (/balance|walking|gait/.test(goalLower)) goalContext = "balance_gait";
  else if (/general|fitness|active|health/.test(goalLower)) goalContext = "general_fitness";

  // Check for goal in message too
  if (!goalContext) {
    if (/\b(strong|strength|build strength)\b/.test(combined)) goalContext = "strength";
    else if (/\b(conditioning|cardio|fat loss)\b/.test(combined)) goalContext = "conditioning_fat_loss";
    else if (/\b(balance|walking|gait|confident)\b/.test(combined)) goalContext = "balance_gait";
    else if (/\b(mobile|mobility|movement|flexible)\b/.test(combined)) goalContext = "mobility";
  }

  // ── Build notes ───────────────────────────────────────────────────────────
  const notes: string[] = [];
  if (parkinsonScore > 0) notes.push("Parkinson's signals detected — bias toward gait, balance, trunk, supported lower-body");
  if (neurologicalScore > 0) notes.push("Neurological signals — reduce coordination demands, bias toward supported patterns");
  if (balanceFallRiskScore > 0) notes.push("Balance/fall risk — minimize unsupported balance challenges, support-aware selections");
  if (frailtyScore > 0) notes.push("Frailty/deconditioning — tolerance-first, low density, confidence building");
  if (olderAdultScore > 0) notes.push("Older adult — bias toward strength-for-function, chair-supported options, conservative progression");
  if (mobilityScore > 0) notes.push("Mobility limitations — simplify transitions, avoid floor-to-standing unless safe");
  if (jointScore > 0) notes.push("Joint sensitivity — lower-impact options, avoid excessive joint loading");

  logger.info(
    {
      specialConsiderations: {
        detected: true,
        primaryType,
        severity,
        triggeredCategories,
        totalScore,
        matchedSignals: uniqueSignals,
      },
    },
    "[SpecialConsiderationsEngine] Special considerations detected"
  );

  return {
    detected: true,
    primaryType,
    matchedSignals: uniqueSignals,
    severity,
    requiresConservativeProgramming: true,
    hasBalanceFallRisk: balanceFallRiskScore > 0,
    hasNeurologicalFactors: parkinsonScore > 0 || neurologicalScore > 0,
    hasJointSensitivity: jointScore > 0,
    hasFrailtyFactors: frailtyScore > 0,
    goalContext,
    notes,
  };
}

// ─── Clarification Trigger Checker ───────────────────────────────────────────
//
// Returns a clarification question when safety-relevant details are missing.
// Should only trigger for genuinely ambiguous high-risk contexts.

export function getSpecialConsiderationsClarification(
  ctx: SpecialConsiderationContext,
  userMessage: string,
): string | null {
  if (!ctx.detected) return null;

  const lower = userMessage.toLowerCase();

  // Severe balance risk without support environment mentioned
  if (
    ctx.hasBalanceFallRisk &&
    ctx.severity !== "mild" &&
    !/\b(chair|counter|wall|support|bar|railing|seated|sitting)\b/i.test(lower)
  ) {
    return "Do you have a stable chair or counter available for support? I'll use that to anchor the balance work safely.";
  }

  // Parkinson's with unclear function level
  if (
    ctx.primaryType === "parkinsons" &&
    !/\b(walk|stand|sit|mobile|independent|use\s*a\s*(cane|walker))\b/i.test(lower)
  ) {
    return "Are you able to walk and stand independently, or do you use a cane or walker? I'll build around your current functional level.";
  }

  // Frailty/chair-based with unclear ability to get off floor
  if (
    ctx.primaryType === "frailty_deconditioning" &&
    ctx.severity === "high" &&
    !/\b(chair|seated|sit|floor|stand)\b/i.test(lower)
  ) {
    return "Are you able to get up and down from a chair comfortably? That will help me decide how to structure the session.";
  }

  // Joint replacement with unclear tolerance
  if (
    ctx.hasJointSensitivity &&
    /replacement|post.?surgical/i.test(lower) &&
    !/\b(cleared|tolerate|ok\s*with|comfortable\s*with|can\s*do)\b/i.test(lower)
  ) {
    return "Has your doctor or physio cleared you for resistance training? I want to make sure the exercise selection respects any post-surgical restrictions.";
  }

  return null;
}

// ─── Archetype Selector ───────────────────────────────────────────────────────

function selectArchetype(ctx: SpecialConsiderationContext): SpecialConsiderationsArchetype {
  if (ctx.primaryType === "parkinsons") return "supported_balance_and_gait";
  if (ctx.primaryType === "frailty_deconditioning") return "chair_supported_strength";
  if (ctx.hasBalanceFallRisk && ctx.hasNeurologicalFactors) return "supported_balance_and_gait";
  if (ctx.goalContext === "balance_gait") return "movement_confidence_session";
  if (ctx.goalContext === "conditioning_fat_loss") return "low_complexity_conditioning";
  if (ctx.goalContext === "mobility") return "controlled_mobility_and_tolerance";
  if (ctx.primaryType === "older_adult") return "strength_for_function";
  if (ctx.primaryType === "joint_sensitive") return "controlled_mobility_and_tolerance";
  if (ctx.hasFrailtyFactors) return "chair_supported_strength";
  return "strength_for_function";
}

// ─── Archetype Descriptions ───────────────────────────────────────────────────

const ARCHETYPE_DESCRIPTIONS: Record<SpecialConsiderationsArchetype, string> = {
  strength_for_function: "Functional strength emphasis — sit-to-stand, hinge, carry, step, and balance. Lower complexity, conservative loading, strong technique focus. Exercises earn their place by improving daily functional capacity.",
  supported_balance_and_gait: "Balance confidence and gait emphasis — supported balance holds, gait-focused drills, trunk postural control, sit-to-stand mechanics, and manageable lower-body strength. Support environment assumed (chair/wall/counter).",
  movement_confidence_session: "Movement confidence and pattern familiarity — repeatable, low-complexity movements that build coordination and confidence without high-demand challenge. Progress is built through consistency and quality, not load.",
  chair_supported_strength: "Chair-supported or seated session format — exercises anchored to a stable chair or counter. Sit-to-stand progressions, seated upper body, supported lower-body. No floor work unless clearly appropriate.",
  controlled_mobility_and_tolerance: "Controlled mobility and tissue tolerance — gentle range-of-motion work, joint-friendly movement patterns, and tolerated loading. Avoid high-impact, high-load, or complex multi-joint patterns.",
  low_complexity_conditioning: "Low-complexity conditioning — sustainable aerobic activity, walking-based conditioning, or simple circuit formats. No high-intensity work. Manageable fatigue load. Heart rate stays controlled throughout.",
  recovery_and_movement_day: "Restorative movement — very light active recovery, gentle mobility, breathing resets, and basic postural work. Minimal load. Primary goal is movement confidence and parasympathetic recovery.",
};

// ─── Goal-Through-Lens Instructions ──────────────────────────────────────────

function buildGoalLensInstructions(ctx: SpecialConsiderationContext): string {
  if (!ctx.goalContext) return "";

  const lines: string[] = [];
  lines.push("\n### GOAL THROUGH SPECIAL CONSIDERATIONS LENS:");

  switch (ctx.goalContext) {
    case "strength":
      if (ctx.primaryType === "parkinsons") {
        lines.push("Goal = Strength → Apply through Parkinson's lens: functional strength patterns (sit-to-stand, supported squat/hinge, wall-supported pressing), stable base, postural control emphasis. No max-effort, no unstable surfaces, no Olympic derivatives.");
      } else if (ctx.primaryType === "older_adult") {
        lines.push("Goal = Strength → Apply through older adult lens: strength-for-function format. Chair-supported strength, step patterns, hinge to hip height, controlled carries. Conservative loading. Functional transfer over max strength.");
      } else if (ctx.hasFrailtyFactors) {
        lines.push("Goal = Strength → Apply through frailty lens: movement reacclimation strength. Very conservative loading, 2 working sets per pattern, RPE 4–5 max. Session should feel manageable and repeatable, not challenging.");
      } else {
        lines.push("Goal = Strength → Apply through special considerations lens: lower complexity, stability-first strength patterns. Supported when appropriate. Conservative progression. Quality over load.");
      }
      break;

    case "conditioning_fat_loss":
      lines.push("Goal = Conditioning / Fat Loss → Apply through special considerations lens: low-risk sustainable activity. Walking-based conditioning, simple circuits at low intensity, no demanding high-fatigue formats. Metabolic benefit from consistency and manageable volume, not from intensity.");
      if (ctx.hasBalanceFallRisk) {
        lines.push("Balance risk present — avoid any conditioning drill that requires rapid direction changes, reactive footwork, or unsupported movement under fatigue.");
      }
      break;

    case "balance_gait":
      lines.push("Goal = Balance / Gait Confidence → This is the primary goal — every exercise should directly serve gait mechanics, balance confidence, or postural control. Support-aware selections mandatory. Progressive complexity only after confident competency at simpler levels.");
      break;

    case "mobility":
      lines.push("Goal = Mobility → Apply through joint-sensitive / special considerations lens: tolerated range-of-motion work, gentle loaded stretching where appropriate, joint-friendly movement. No forcing end-range. Pain-free movement quality is the standard.");
      break;

    case "general_fitness":
      lines.push("Goal = General Fitness → Apply through special considerations lens: safe, sustainable movement variety. Functional strength, manageable conditioning, balance confidence. Consistency and tolerance are the performance metrics, not load or intensity.");
      break;
  }

  return lines.join("\n");
}

// ─── Safety Rules Builder ─────────────────────────────────────────────────────

function buildSafetyRules(ctx: SpecialConsiderationContext): string {
  const rules: string[] = [];

  rules.push("\n### MANDATORY SAFETY RULES — SPECIAL CONSIDERATIONS MODE:");
  rules.push("The following rules are non-negotiable in this mode. They OVERRIDE the standard athletic programming defaults.");
  rules.push("");
  rules.push("**UNIVERSAL SPECIAL CONSIDERATIONS RULES:**");
  rules.push("- Prioritize stability and support over challenge or novelty");
  rules.push("- Prefer lower complexity movements over technical demands");
  rules.push("- Reduce coordination demands unless clearly appropriate for this user");
  rules.push("- Minimize fall risk in every exercise choice");
  rules.push("- Use conservative volume: 2–3 working sets per pattern, not 4–5");
  rules.push("- Use conservative intensity: RPE 4–6, never max effort");
  rules.push("- Slower progression: weekly or bi-weekly, not session-to-session");
  rules.push("- Fewer exercises per session: 4–6 maximum, not 8–10");
  rules.push("- Simple transitions between movements — no complex flow sequences");
  rules.push("- Reduce unnecessary novelty — repeatable patterns build confidence");
  rules.push("- NO explosive or reactive work unless clearly appropriate");
  rules.push("- NO max-effort loading or PR-oriented prescriptions");
  rules.push("- NO dense fatigue-driven circuits by default");
  rules.push("- Emphasize movement quality, tolerance, confidence, and repeatability over all else");
  rules.push("");

  if (ctx.hasNeurologicalFactors || ctx.primaryType === "parkinsons") {
    rules.push("**NEUROLOGICAL / PARKINSON'S SPECIFIC RULES:**");
    rules.push("- Bias toward: gait mechanics, balance holds, postural control, sit-to-stand patterns, supported lower-body work, manageable trunk work");
    rules.push("- Avoid: highly reactive movements, fast-tempo drills, complex coordination patterns, anything requiring rapid weight transfer");
    rules.push("- Support environment assumed (chair, wall, counter) — anchor movements to stable surfaces");
    rules.push("- Trunk and posture emphasis — forward head/trunk flex is a key issue; include anti-forward-lean work");
    rules.push("- Gait-focused drills are appropriate and valuable: supported marching, step-over patterns, weight shift with support");
    rules.push("- Reduce coordination complexity — two-step instructions, not five-step sequences");
    rules.push("");
  }

  if (ctx.hasBalanceFallRisk) {
    rules.push("**BALANCE / FALL RISK SPECIFIC RULES:**");
    rules.push("- NEVER program unsupported single-leg balance under load without a progression path and support option stated");
    rules.push("- All balance challenges should have a stated support available (chair back, wall, counter)");
    rules.push("- Avoid rapidly alternating stances or quick foot patterns");
    rules.push("- No plyometric or reactive content");
    rules.push("- Seated or supported alternatives available for any exercise with balance demand");
    rules.push("- Step patterns (step-up, lateral step) should be low-height, controlled, and supported");
    rules.push("");
  }

  if (ctx.primaryType === "older_adult") {
    rules.push("**OLDER ADULT SPECIFIC RULES:**");
    rules.push("- Bias toward strength-for-function: sit-to-stand, hinge to hip height, step-up, carry, push, pull");
    rules.push("- Chair-supported work is appropriate and encouraged — not a compromise, a smart tool");
    rules.push("- Balance confidence work is always appropriate — include it");
    rules.push("- Controlled mobility and joint range work appropriate as prep and accessory");
    rules.push("- Conservative loading — this population often under-appreciates how much recovery demands");
    rules.push("- Session density should feel manageable, not exhausting");
    rules.push("");
  }

  if (ctx.hasFrailtyFactors) {
    rules.push("**FRAILTY / DECONDITIONING SPECIFIC RULES:**");
    rules.push("- Treat this like a re-entry situation — movement reacclimation first");
    rules.push("- Session should feel achievable, not challenging: RPE 4–5 max");
    rules.push("- Chair-based or partially supported exercises are the correct starting point");
    rules.push("- Volume is the variable to protect — 2 sets per pattern, not more");
    rules.push("- Encourage tolerance and confidence — these are the performance metrics here");
    rules.push("- No floor work unless the user has clearly indicated they can get up and down safely");
    rules.push("");
  }

  if (ctx.hasJointSensitivity) {
    rules.push("**JOINT SENSITIVITY SPECIFIC RULES:**");
    rules.push("- Avoid high-impact loading: no jumping, bounding, or hard landings");
    rules.push("- Prefer partial range-of-motion when full ROM is painful or inappropriate");
    rules.push("- Machine-based or supported variations over free weight high-load options");
    rules.push("- No max-load on primary joint-stressor lifts (deep squat, full deadlift under load if contraindicated)");
    rules.push("- Include joint-friendly mobility and tissue work as integral to the session");
    rules.push("- Note any specific joint (knee, hip, shoulder) and avoid loading patterns that stress it directly");
    rules.push("");
  }

  return rules.join("\n");
}

// ─── OpenAI Freedom Declaration ───────────────────────────────────────────────

function buildOpenAIConstructionFreedom(ctx: SpecialConsiderationContext): string {
  const lines: string[] = [];

  lines.push("\n### EXERCISE CONSTRUCTION FREEDOM — SPECIAL CONSIDERATIONS MODE:");
  lines.push("In this mode, you are NOT required to draw exercises strictly from the standard exercise library.");
  lines.push("You MAY construct and recommend movements that best serve this user's safety, function, and context.");
  lines.push("");
  lines.push("Appropriate exercises you may construct or use that may not exist in the standard DB:");
  lines.push("- Chair-supported sit-to-stand (standard, partial, or weighted)");
  lines.push("- Supported marching in place");
  lines.push("- Assisted split-stance weight shift with chair support");
  lines.push("- Wall-supported calf raise");
  lines.push("- Balance hold with chair/counter support");
  lines.push("- Seated or supported trunk rotation");
  lines.push("- Gait-focused drills (heel-to-toe walk, sideways step, supported tandem stance)");
  lines.push("- Step-over patterns with stable support");
  lines.push("- Hand-supported hinge or squat variant");
  lines.push("- Breathing and reset drills");
  lines.push("- Low-complexity mobility or resilience circuits");
  lines.push("- Seated resistance band upper body work");
  lines.push("- Supported single-leg weight shift");
  lines.push("- Wall press for supported upper body strengthening");
  lines.push("- Slow controlled stair step");
  lines.push("");
  lines.push("**CONSTRUCTION CONSTRAINT:** This freedom is ONLY active in special_considerations mode. Exercise names should be clear, descriptive, and executable. If an exercise requires support, state it explicitly in the notes.");
  lines.push("**CRITICAL:** This freedom exists to SERVE SAFETY, not to enable reckless novelty. Every constructed exercise must be simpler, safer, and more appropriate than a standard library choice — not more complex.");

  return lines.join("\n");
}

// ─── Agent Language Guidelines ────────────────────────────────────────────────

function buildAgentLanguageGuidelines(ctx: SpecialConsiderationContext): string {
  const lines: string[] = [];

  lines.push("\n### SPECIAL CONSIDERATIONS AGENT LANGUAGE:");
  lines.push("In this mode, your voice should be: calm, conservative, clear, coach-like, confidence-building.");
  lines.push("");
  lines.push("Use language like:");

  switch (ctx.primaryType) {
    case "parkinsons":
      lines.push(`- "Because of Parkinson's, I'm prioritizing posture, gait, balance confidence, and manageable strength."`);
      lines.push(`- "I'm keeping this conservative and support-based so it feels stable and repeatable."`);
      lines.push(`- "This is built around lower fall risk, simpler transitions, and functional strength — the kind that transfers to daily movement."`);
      break;
    case "older_adult":
      lines.push(`- "I built this around functional strength — the patterns that transfer directly to daily life."`);
      lines.push(`- "I'm keeping complexity low and progression conservative — consistency over time is the goal here."`);
      lines.push(`- "I'm biasing toward supported movements first, then we can progress complexity over time."`);
      break;
    case "frailty_deconditioning":
      lines.push(`- "I'm starting conservative so your body can reacclimate — you should finish feeling capable, not wiped out."`);
      lines.push(`- "Tolerance and confidence are the metrics here, not load. We'll build from this foundation."`);
      break;
    case "balance_fall_risk":
      lines.push(`- "I built this around lower fall risk — every movement has a stable anchor."`);
      lines.push(`- "All the balance work here is supported. As confidence builds, we can progressively reduce the support."`);
      break;
    default:
      lines.push(`- "I built this around lower fall risk, simpler transitions, and functional strength."`);
      lines.push(`- "I'm biasing toward supported movements first, then we can progress complexity over time."`);
      lines.push(`- "I'm keeping this conservative and support-based so it feels stable and repeatable."`);
  }

  lines.push("");
  lines.push("**AVOID:**");
  lines.push("- Over-medical language or diagnosis framing");
  lines.push("- False rehab claims ('this will fix your condition')");
  lines.push("- Hypey athletic language when context is fragile");
  lines.push("- Talking down to the user — confident, supportive tone only");
  lines.push("- Generic fitness language that ignores the user's specific context");

  return lines.join("\n");
}

// ─── Main Context Builder ─────────────────────────────────────────────────────

export function buildSpecialConsiderationsContext(
  userMessage: string,
  trainingGoal: string,
  injuries: string,
  daysPerWeek?: number | null,
): string {
  const ctx = detectSpecialConsiderations(userMessage, trainingGoal, injuries);

  if (!ctx.detected) return "";

  const archetype = selectArchetype(ctx);
  const archetypeDescription = ARCHETYPE_DESCRIPTIONS[archetype];

  const lines: string[] = [];

  lines.push("\n\n## SPECIAL CONSIDERATIONS MODE — ACTIVE");
  lines.push("════════════════════════════════════════════════════════════");
  lines.push(`**PROGRAMMING MODE: special_considerations** (not standard athletic mode)`);
  lines.push("");
  lines.push(`**Detected context:** ${ctx.primaryType.replace(/_/g, " ").toUpperCase()}`);
  lines.push(`**Severity:** ${ctx.severity}`);
  lines.push(`**Signals matched:** ${ctx.matchedSignals.join(", ")}`);
  lines.push("");
  lines.push(`**Session archetype:** ${archetype.replace(/_/g, " ")}`);
  lines.push(`${archetypeDescription}`);

  if (ctx.notes.length > 0) {
    lines.push("");
    lines.push("**Active flags:**");
    for (const note of ctx.notes) {
      lines.push(`- ${note}`);
    }
  }

  lines.push("");
  lines.push("**OVERRIDE RULE:** Standard athletic programming defaults (power first, high complexity, NSCA athletic structure, explosive B-block, etc.) are SUSPENDED for this user. Apply the special considerations framework below instead.");
  lines.push("════════════════════════════════════════════════════════════");

  // Safety rules
  lines.push(buildSafetyRules(ctx));

  // Goal through lens
  const goalLens = buildGoalLensInstructions(ctx);
  if (goalLens) lines.push(goalLens);

  // Exercise construction freedom
  lines.push(buildOpenAIConstructionFreedom(ctx));

  // Agent language
  lines.push(buildAgentLanguageGuidelines(ctx));

  // Session structure for special considerations
  lines.push("\n### SPECIAL CONSIDERATIONS SESSION STRUCTURE:");
  lines.push("Replace the standard A→B→C→D→E→F athletic session structure with this safer structure:");
  lines.push("");
  lines.push("**A — GENTLE PREP / ACTIVATION** (Always first)");
  lines.push("Seated or supported activation. Gentle joint mobility, breathing, light band or bodyweight activation. Nothing demanding. 2–3 movements, 1 set each.");
  lines.push("");
  lines.push("**B — FUNCTIONAL STRENGTH ANCHOR** (Main work — 2–3 movements)");
  lines.push("The session's primary functional pattern. Selected from the archetype: sit-to-stand, supported hinge, step pattern, press, pull. 2–3 sets × 8–12 reps (or tolerated). RPE 4–6.");
  lines.push("");
  lines.push("**C — BALANCE / GAIT / STABILITY** (Include when relevant)");
  lines.push("Supported balance work, gait drills, weight shift patterns. Only what the user can safely execute with available support. 2–3 sets.");
  lines.push("");
  lines.push("**D — TRUNK / POSTURE** (Functional, not aesthetic)");
  lines.push("Seated trunk rotation, supported anti-extension, posture hold, breathing with bracing. 2 sets. Simple and clear.");
  lines.push("");
  lines.push("**E — OPTIONAL FINISHER** (Only if session density allows)");
  lines.push("Gentle cool-down mobility or easy conditioning (walking, seated cycle). Never mandatory. Only if tolerated.");
  lines.push("");
  lines.push("**TOTAL EXERCISES:** 4–6 per session. Never more than 8.");
  lines.push("**SESSION DURATION:** 30–45 minutes is appropriate. Not 60–75 minutes of athletic volume.");
  lines.push("**DO NOT include:**");
  lines.push("- Explosive B-block (jumps, throws, Olympic derivatives)");
  lines.push("- Complex unilateral loaded patterns without support");
  lines.push("- High-rep conditioning circuits");
  lines.push("- Any exercise that creates meaningful fall risk");

  // Pre-output validation for this mode
  lines.push("\n### PRE-OUTPUT VALIDATION — SPECIAL CONSIDERATIONS MODE:");
  lines.push("Before outputting the program, verify:");
  lines.push("☑ No explosive or reactive exercises (jumps, bounds, throws) in the program");
  lines.push("☑ No max-effort prescriptions or PR language");
  lines.push("☑ Session exercise count is 4–8, not 9–12");
  lines.push("☑ Volume is conservative: 2–3 working sets per pattern");
  lines.push("☑ All balance-demanding exercises have stated support options");
  lines.push("☑ No high-coordination multi-step movement sequences");
  lines.push("☑ Session should feel achievable and confidence-building, not exhausting");
  lines.push("☑ Language in day names, notes, and intent fields reflects calm, conservative, functional coaching");
  lines.push("☑ The program does NOT look like a standard athletic program with a 'be careful' note appended — it must be structurally different");

  return lines.join("\n");
}

// ─── Detection Wrapper for Routing System ────────────────────────────────────
//
// Lightweight wrapper that returns just the detected flag and context
// for use in the routing decision layer without building the full prompt.

export function needsSpecialConsiderationsContext(
  userMessage: string,
  trainingGoal: string,
  injuries: string,
): boolean {
  const ctx = detectSpecialConsiderations(userMessage, trainingGoal, injuries);
  return ctx.detected;
}

// ─── Validator Helpers ────────────────────────────────────────────────────────

export interface SpecialConsiderationsValidationResult {
  passed: boolean;
  reason: string;
  isWarning: boolean;
}

const EXPLOSIVE_PATTERNS = [
  /\b(box\s*jump|broad\s*jump|vertical\s*jump|depth\s*jump|bound(s|ing)?|plyo(metric)?)\b/i,
  /\b(power\s*clean|hang\s*clean|hang\s*snatch|power\s*snatch|olympic\s*lift)\b/i,
  /\b(sprint\s*drill|acceleration\s*drill|flying\s*sprint|resisted\s*sprint)\b/i,
  /\b(med(icine)?\s*ball\s*(slam|throw|chest\s*pass))\b/i,
];

const MAX_EFFORT_PATTERNS = [
  /\b(1rm|one\s*rep\s*max|max\s*effort|max\s*load|maximal\s*effort|all\s*out)\b/i,
  /\b(rpe\s*(9|10)|rpe\s*9|rpe\s*10|to\s*failure|near\s*failure)\b/i,
  /\b(crush|dominate|beast|grind|push\s*through|no\s*excuses)\b/i,
];

const HIGH_BALANCE_DEMAND_PATTERNS = [
  /\b(single.leg\s*(deadlift|rdl|hop|squat|balance)\s*(?!with\s*support|supported))\b/i,
  /\b(bosu|unstable\s*surface|balance\s*board)\b/i,
];

export function validateSpecialConsiderationsOutput(
  programText: string,
  program: { days: Array<{ exercises: Array<{ name: string; sets: number; classification?: string }> }> },
  ctx: SpecialConsiderationContext,
): SpecialConsiderationsValidationResult {
  const text = programText.toLowerCase();

  // Check for explosive content
  for (const pattern of EXPLOSIVE_PATTERNS) {
    if (pattern.test(text)) {
      return {
        passed: false,
        reason: `Explosive/reactive exercise detected in special considerations mode — not appropriate for this user. Remove and replace with a stability-first or functional pattern.`,
        isWarning: false,
      };
    }
  }

  // Check for max effort language
  for (const pattern of MAX_EFFORT_PATTERNS) {
    if (pattern.test(text)) {
      return {
        passed: false,
        reason: `Max-effort language or prescription detected in special considerations mode — reduce intensity to RPE 4–6 range.`,
        isWarning: false,
      };
    }
  }

  // Check for balance risk without support mention
  if (ctx.hasBalanceFallRisk) {
    for (const pattern of HIGH_BALANCE_DEMAND_PATTERNS) {
      if (pattern.test(text) && !/\b(with\s*support|supported|chair|wall|counter|hand\s*support)\b/i.test(text)) {
        return {
          passed: false,
          reason: `High-balance-demand exercise detected without stated support option — add support notation or replace.`,
          isWarning: false,
        };
      }
    }
  }

  // Check session density (too many exercises per day)
  for (const day of program.days) {
    const nonPrepExercises = day.exercises.filter(
      e => e.classification !== "Prep"
    );
    if (nonPrepExercises.length > 8) {
      return {
        passed: false,
        reason: `Session has ${nonPrepExercises.length} exercises — too many for special considerations mode. Reduce to 4–6 working exercises per session.`,
        isWarning: false,
      };
    }
    if (nonPrepExercises.length > 6) {
      return {
        passed: true,
        reason: `Session has ${nonPrepExercises.length} exercises — slightly high for special considerations. Consider reducing.`,
        isWarning: true,
      };
    }
  }

  // Check for over-volume (too many sets)
  let totalSetCount = 0;
  for (const day of program.days) {
    for (const ex of day.exercises) {
      if (ex.classification !== "Prep") {
        totalSetCount += ex.sets;
      }
    }
  }
  const avgSetsPerDay = totalSetCount / Math.max(program.days.length, 1);

  if (avgSetsPerDay > 20) {
    return {
      passed: false,
      reason: `Average set count per session (${Math.round(avgSetsPerDay)}) is too high for special considerations mode. Target 10–15 working sets per session maximum.`,
      isWarning: false,
    };
  }

  if (avgSetsPerDay > 15) {
    return {
      passed: true,
      reason: `Set count is elevated for special considerations mode (${Math.round(avgSetsPerDay)} avg/session). Consider reducing for this population.`,
      isWarning: true,
    };
  }

  return {
    passed: true,
    reason: "Special considerations output validation passed — no safety violations detected.",
    isWarning: false,
  };
}
