/**
 * TrainChat Re-Entry / Return-to-Training Engine
 *
 * Phase 5 Intelligence Upgrade — Real re-entry coaching architecture.
 *
 * Identifies users who are detrained, inconsistent, recently returning,
 * post-layoff, or rebuilding capacity — and prescribes a true re-entry
 * plan instead of a standard training plan.
 *
 * Re-entry is an OVERRIDE mode. When triggered, it reshapes the entire
 * program architecture — not just "start lighter." The conservatism is
 * structural, not cosmetic.
 *
 * Primary output: buildReEntryContext() — injected into the system prompt
 * to give the AI explicit, phase-by-phase re-entry instructions that
 * override normal programming aggressiveness.
 */

// ─── Re-Entry Status ──────────────────────────────────────────────────────────

export type ReEntryStatus = "none" | "mild_reentry" | "moderate_reentry" | "major_reentry";

export interface ReEntryClassification {
  status: ReEntryStatus;
  severity: number; // 0–3 scale
  timeAwayMonths: number | null;
  detectedSignals: string[];
  isFormerAdvanced: boolean;
  hasInjuryContext: boolean;
  confidenceLevel: "low" | "medium" | "high";
}

// ─── Re-Entry Phase Types ─────────────────────────────────────────────────────

export type ReEntryPhaseType = "reacclimation" | "capacity_build" | "transition_to_standard";

export interface ReEntryPhaseDefinition {
  phase: ReEntryPhaseType;
  displayName: string;
  durationWeeks: { mild: number; moderate: number; major: number };
  primaryObjective: string;
  volumeTarget: string;
  intensityTarget: string;
  repRangeGuidance: string;
  exerciseComplexity: string;
  accessoryDensity: string;
  conditioningGuidance: string;
  recoveryEmphasis: string;
  progressionStyle: string;
  sorenessManagement: string;
  keyRules: string[];
  agentLanguage: string;
}

export const RE_ENTRY_PHASES: Record<ReEntryPhaseType, ReEntryPhaseDefinition> = {
  reacclimation: {
    phase: "reacclimation",
    displayName: "Reacclimation — Movement Restoration",
    durationWeeks: { mild: 1, moderate: 2, major: 3 },
    primaryObjective: "Restore movement quality, establish tissue tolerance, rebuild consistent training behavior. Nothing should feel hard. The goal is showing up and moving well — not pushing.",
    volumeTarget: "Very low — 2 working sets per primary pattern. Total weekly set count should be 40–50% of what a normal program would prescribe. More is NOT better in this phase.",
    intensityTarget: "50–65% 1RM or RPE 4–5 out of 10. The athlete should finish sessions feeling like they could have done significantly more.",
    repRangeGuidance: "10–15 reps. High rep, low load. This develops movement exposure and tissue tolerance without creating crushing soreness.",
    exerciseComplexity: "Simplified bilateral movements. No highly technical or neurologically demanding exercises. No Olympic lifts, no single-leg work under load, no max-effort speed or power.",
    accessoryDensity: "Minimal — 1–2 accessory exercises per session maximum. Focus on tissue resilience: band work, bodyweight stability, light single-joint movements for joint health.",
    conditioningGuidance: "Walking, easy bike, or light tempo work ONLY. 15–20 minutes. Heart rate below 70% max. No intervals, no conditioning circuits, no high-intensity conditioning of any kind.",
    recoveryEmphasis: "Full. 48–72 hours between sessions involving the same patterns. Soreness is a warning sign in this phase — if it's severe, reduce volume further.",
    progressionStyle: "No load progression in this phase. Add at most 1 rep per set per session. The goal is exposure and consistency, not overload.",
    sorenessManagement: "Soreness MUST be monitored. If the athlete reports moderate-to-severe DOMS, the next session must be reduced further. DOMS in re-entry means the volume was too high, not that training is working.",
    keyRules: [
      "2 working sets per primary pattern — not 3, not 4",
      "RPE 4–5 maximum — sessions should feel easy",
      "No bilateral max effort — no heavy squats, deadlifts, or presses in Week 1",
      "No plyometrics, sprint work, or max velocity in reacclimation",
      "No aggressive conditioning — easy aerobic only",
      "Exercise selection: repeatable, low-complexity, bilateral primary patterns",
      "Duration: 45–50 minutes maximum — do not push session length",
      "End every session with the athlete feeling capable of doing more",
    ],
    agentLanguage: "The first block is your reacclimation phase — your body needs to relearn movement patterns and rebuild tissue tolerance before we add any real load. Sessions will feel easier than you expect. That is intentional and correct.",
  },

  capacity_build: {
    phase: "capacity_build",
    displayName: "Capacity Build — Work Volume Restoration",
    durationWeeks: { mild: 1, moderate: 2, major: 3 },
    primaryObjective: "Gradually rebuild work capacity and training volume. Introduce moderate loading. Exercise complexity can increase slightly. The athlete should feel training is progressing while still feeling manageable.",
    volumeTarget: "Moderate — 3 working sets per primary pattern. Accessory volume increases to 2–3 exercises per session. Still 60–70% of a normal program's volume.",
    intensityTarget: "65–75% 1RM or RPE 5–7 out of 10. Load increases are now acceptable, but only when technique and recovery are solid.",
    repRangeGuidance: "8–12 reps. Strength-hypertrophy range. Focus on controlled eccentric, quality positions.",
    exerciseComplexity: "Primary compound movements with normal technique demands. Single-leg work can be introduced at bodyweight or very light load. No Olympic lifts unless the athlete has a long history with them.",
    accessoryDensity: "Moderate — 2–3 accessory exercises per session. Include unilateral work, tissue resilience, and movement pattern support.",
    conditioningGuidance: "Low-intensity aerobic work 2–3× per week. 20–25 minutes at 65–75% HR max. Optional: short low-intensity interval structures (e.g., 5 × 1 min walk/jog). Still NO all-out conditioning.",
    recoveryEmphasis: "Good. 48 hours between sessions minimum. Monitor energy levels across the week.",
    progressionStyle: "Double progression — progress reps first, then add load only when all reps are achieved with solid technique. Weekly load increases of 2.5–5% are acceptable.",
    sorenessManagement: "Mild DOMS is acceptable and expected in this phase. Severe DOMS signals volume is still too high — reduce next session.",
    keyRules: [
      "3 working sets per primary pattern — do not jump to 4 until transition phase",
      "Add load only when technique is solid and recovery is good",
      "Single-leg work allowed but start light",
      "Conditioning is still gentle — no metabolic finishers",
      "Progress should feel earned, not forced",
      "Monitor fatigue and sleep quality as load increases",
    ],
    agentLanguage: "We're now in the capacity build phase — volume increases and we start real loading. You should feel like training is genuinely challenging but not crushing. If recovery is falling behind, we pull back.",
  },

  transition_to_standard: {
    phase: "transition_to_standard",
    displayName: "Transition — Returning to Goal-Specific Training",
    durationWeeks: { mild: 2, moderate: 2, major: 4 },
    primaryObjective: "Bridge from re-entry programming to the user's actual goal. Training volume and intensity approach normal levels. Exercise complexity matches the goal. The athlete is now cleared to train like an active athlete.",
    volumeTarget: "Normal — 4 working sets per primary pattern. Full accessory menu appropriate to the goal. Total weekly volume matches a standard program.",
    intensityTarget: "75–85% 1RM or RPE 6–8. Working sets feel genuinely challenging. Load increases are expected.",
    repRangeGuidance: "Goal-specific — strength: 4–6 reps; hypertrophy: 6–12; power: 3–5 explosive reps; conditioning: higher rep or interval format.",
    exerciseComplexity: "Full complexity appropriate to the goal. Single-leg loading, Olympic derivatives, plyometrics, and sprint work can all return — introduced progressively, not all at once.",
    accessoryDensity: "Full — complete accessory menu aligned with goal. No restrictions remaining from re-entry.",
    conditioningGuidance: "Goal-appropriate conditioning can now begin. If conditioning is the goal, energy system work escalates normally. If it's a secondary quality, low-moderate conditioning 2×/week.",
    recoveryEmphasis: "Normal. Standard 48-hour recovery windows. The athlete should now be responding like an active athlete.",
    progressionStyle: "Goal-appropriate progression model takes over (see periodization engine). Re-entry caution is no longer needed.",
    sorenessManagement: "Normal DOMS is fine and expected when moving to higher loads and complexity. It is no longer a red flag.",
    keyRules: [
      "Full volume now appropriate — no more artificial restriction",
      "Goal-specific exercise selection takes over",
      "Conditioning scales to goal demands",
      "Transition should feel like a clear upgrade from capacity build",
      "Athlete should feel physically capable of handling normal training",
    ],
    agentLanguage: "You've earned your way back to full training. This phase transitions you fully into your actual goal. The conservative ramp is over — now we program for performance.",
  },
};

// ─── Signal Patterns ──────────────────────────────────────────────────────────

const MAJOR_REENTRY_SIGNALS = [
  /haven[''']?t\s*(trained|worked\s*out|lifted|exercised|been\s*in\s*the\s*gym)/i,
  /(\d+)\s*months?\s*(off|away|break|out|inactive)/i,
  /(\d+)\s*years?\s*(off|away|break|out)/i,
  /been\s*(off|out|inactive|sedentary)\s*(for\s*)?(a\s*(long|while)|\d+\s*(months?|years?))/i,
  /took\s*(a\s*)?(long|extended|big|huge)?\s*(break|time\s*off|layoff|hiatus)/i,
  /completely\s*(stopped|quit|fell\s*off|gave\s*up)/i,
  /starting\s*over\s*(completely|from\s*scratch|from\s*zero)/i,
  /not\s*trained\s*(seriously|at\s*all|in\s*a\s*(long|while))/i,
  /was\s*(sedentary|inactive|out\s*of\s*shape)\s*(for|over|past)/i,
  /lost\s*(all|most|a\s*lot\s*of)\s*(my\s*)?(fitness|strength|muscle|conditioning)/i,
  /haven[''']?t\s*been\s*(to\s*the\s*)?(gym|lifting|training)/i,
];

const MODERATE_REENTRY_SIGNALS = [
  /(\d+)\s*months?\s*(of\s*)?(not\s*(training|working\s*out)|gap|inconsistency)/i,
  /fell\s*(off|behind|out\s*of\s*routine)/i,
  /been\s*inconsistent/i,
  /getting\s*back\s*(into|to)/i,
  /coming\s*back\s*(from|after|to)/i,
  /returning\s*(to|from)\s*(training|the\s*gym|lifting|working\s*out)/i,
  /trying\s*to\s*get\s*back/i,
  /pick\s*(it\s*)?back\s*up/i,
  /re.?start(ing)?/i,
  /after\s*(a\s*)?(break|layoff|gap|pause|hiatus)/i,
  /been\s*out\s*(of\s*)?(the\s*gym|training|shape)/i,
  /barely\s*(worked\s*out|trained|lifted|exercised)/i,
  /on\s*and\s*off/i,
  /off\s*(and\s*on|track)/i,
];

const MILD_REENTRY_SIGNALS = [
  /rusty/i,
  /out\s*of\s*shape/i,
  /lost\s*(some|my)\s*(fitness|strength|conditioning)/i,
  /haven[''']?t\s*(been\s*(as\s*)?consistent|been\s*consistent)/i,
  /need\s*to\s*get\s*back/i,
  /slipped\s*(up|back)/i,
  /haven[''']?t\s*(been\s*)?pushing/i,
  /not\s*(been\s*)?(training|working\s*out)\s*(much|lately|regularly)/i,
  /skipped\s*(a\s*(lot|few)|many|some)\s*(weeks?|months?|sessions?)/i,
];

const FORMER_ADVANCED_SIGNALS = [
  /used\s*to\s*(be|lift|train|compete|play)/i,
  /formerly\s*(trained|lifted|competed)/i,
  /i\s*(was\s*(advanced|strong|athletic|an?\s*(athlete|lifter|competitive))|used\s*to\s*(be\s*(strong|athletic|fit|in\s*shape)))/i,
  /previous\s*(training|athlete|lifter)/i,
  /back\s*when\s*i\s*(was|trained)/i,
  /(\d+)\s*years?\s*(of\s*)?(training|lifting|experience)\s*(before|ago|previously)/i,
  /competed\s*(in|at)/i,
  /played\s*(sports?|football|basketball|soccer)/i,
];

const INJURY_REENTRY_SIGNALS = [
  /coming\s*back\s*(from|after)\s*(an?\s*)?(injury|surgery|procedure|operation)/i,
  /recovering\s*(from|after)\s*(an?\s*)?(injury|surgery|procedure)/i,
  /post.?(surgery|op|operative|rehab)/i,
  /after\s*(my\s*)?(surgery|operation|procedure)/i,
  /just\s*(cleared|got\s*cleared)\s*(by\s*(my\s*)?(doctor|physician|PT|physio))?/i,
  /doctor\s*(cleared|said|told)\s*me/i,
  /finishing\s*(rehab|physical\s*therapy|PT)/i,
];

// ─── Time-Away Extraction ─────────────────────────────────────────────────────

export function detectTimeAway(request: string): number | null {
  const r = request.toLowerCase();

  // Year-based
  const yearMatch = r.match(/(\d+)\s*years?\s*(off|away|break|out|inactive|gap|not\s*training)/);
  if (yearMatch) return parseInt(yearMatch[1]) * 12;

  // Month-based
  const monthMatch = r.match(/(\d+)\s*months?\s*(off|away|break|out|inactive|gap|not|of\s*not)/);
  if (monthMatch) return parseInt(monthMatch[1]);

  // Week-based (convert to months)
  const weekMatch = r.match(/(\d+)\s*weeks?\s*(off|away|break|out|inactive|gap)/);
  if (weekMatch) return Math.round(parseInt(weekMatch[1]) / 4.3);

  // Vague time signals
  if (/a\s*(very\s*)?long\s*(time|while|break)/.test(r)) return 8;
  if (/\b(years?|a\s*year)\b.*\b(off|away|break|inactive)/.test(r)) return 18;
  if (/several\s*months?/.test(r)) return 5;
  if (/a\s*(few|couple)\s*months?/.test(r)) return 3;
  if (/a\s*month\b/.test(r)) return 1;
  if (/few\s*weeks?/.test(r)) return 1;

  return null;
}

// ─── Re-Entry Detection ───────────────────────────────────────────────────────

export function detectReEntryStatus(request: string, trainingGoal: string): ReEntryClassification {
  const combined = (request + " " + trainingGoal).toLowerCase();
  const detectedSignals: string[] = [];
  let severity = 0;

  // Check major signals
  for (const pattern of MAJOR_REENTRY_SIGNALS) {
    if (pattern.test(combined)) {
      const match = combined.match(pattern);
      if (match) detectedSignals.push(match[0].trim());
      severity = Math.max(severity, 3);
    }
  }

  // Check moderate signals
  for (const pattern of MODERATE_REENTRY_SIGNALS) {
    if (pattern.test(combined)) {
      const match = combined.match(pattern);
      if (match) detectedSignals.push(match[0].trim());
      severity = Math.max(severity, 2);
    }
  }

  // Check mild signals
  for (const pattern of MILD_REENTRY_SIGNALS) {
    if (pattern.test(combined)) {
      const match = combined.match(pattern);
      if (match) detectedSignals.push(match[0].trim());
      severity = Math.max(severity, 1);
    }
  }

  // Time-based escalation
  const timeAwayMonths = detectTimeAway(combined);
  if (timeAwayMonths !== null) {
    if (timeAwayMonths >= 6) severity = Math.max(severity, 3);
    else if (timeAwayMonths >= 3) severity = Math.max(severity, 2);
    else if (timeAwayMonths >= 1) severity = Math.max(severity, 1);
  }

  // Detect former advanced status
  const isFormerAdvanced = FORMER_ADVANCED_SIGNALS.some((p) => p.test(combined));
  if (isFormerAdvanced && detectedSignals.length > 0) {
    detectedSignals.push("former advanced/experienced athlete");
  }

  // Detect injury context
  const hasInjuryContext = INJURY_REENTRY_SIGNALS.some((p) => p.test(combined));
  if (hasInjuryContext) {
    detectedSignals.push("injury/surgery context detected");
    severity = Math.max(severity, 2);
  }

  // Map severity to status
  const status: ReEntryStatus =
    severity === 0 ? "none" :
    severity === 1 ? "mild_reentry" :
    severity === 2 ? "moderate_reentry" :
    "major_reentry";

  const confidenceLevel: "low" | "medium" | "high" =
    detectedSignals.length === 0 ? "low" :
    detectedSignals.length === 1 ? "medium" :
    "high";

  return {
    status,
    severity,
    timeAwayMonths,
    detectedSignals: [...new Set(detectedSignals)].slice(0, 5),
    isFormerAdvanced,
    hasInjuryContext,
    confidenceLevel,
  };
}

// ─── Phase Architecture Builder ───────────────────────────────────────────────

export interface ReEntryPhasePlan {
  phase: ReEntryPhaseType;
  phaseName: string;
  weekStart: number;
  weekEnd: number;
  weeks: number;
  objective: string;
  volumeTarget: string;
  intensityTarget: string;
  conditioningGuidance: string;
  progressionStyle: string;
  keyRules: string[];
  agentLanguage: string;
}

export interface ReEntryArchitecture {
  status: ReEntryStatus;
  totalReEntryWeeks: number;
  timeAwayMonths: number | null;
  isFormerAdvanced: boolean;
  phases: ReEntryPhasePlan[];
  transitionNote: string;
  goalIntegration: string;
}

export function buildReEntryPhaseArchitecture(
  classification: ReEntryClassification,
  trainingGoal: string,
  daysPerWeek: number,
): ReEntryArchitecture {
  const { status, timeAwayMonths, isFormerAdvanced } = classification;
  const severity = classification.severity as 0 | 1 | 2 | 3;

  // Determine phase durations based on severity
  const reacclimationWeeks = RE_ENTRY_PHASES.reacclimation.durationWeeks[
    status === "major_reentry" ? "major" : status === "moderate_reentry" ? "moderate" : "mild"
  ];
  const capacityBuildWeeks = RE_ENTRY_PHASES.capacity_build.durationWeeks[
    status === "major_reentry" ? "major" : status === "moderate_reentry" ? "moderate" : "mild"
  ];
  const transitionWeeks = RE_ENTRY_PHASES.transition_to_standard.durationWeeks[
    status === "major_reentry" ? "major" : status === "moderate_reentry" ? "moderate" : "mild"
  ];

  // Former advanced athletes shorten reacclimation (faster neurological reacquisition)
  const effectiveReacclimationWeeks = isFormerAdvanced
    ? Math.max(1, reacclimationWeeks - 1)
    : reacclimationWeeks;

  const phases: ReEntryPhasePlan[] = [];
  let currentWeek = 1;

  // Phase 1: Reacclimation (always present for moderate/major)
  if (status === "major_reentry" || status === "moderate_reentry") {
    const def = RE_ENTRY_PHASES.reacclimation;
    phases.push({
      phase: "reacclimation",
      phaseName: def.displayName,
      weekStart: currentWeek,
      weekEnd: currentWeek + effectiveReacclimationWeeks - 1,
      weeks: effectiveReacclimationWeeks,
      objective: def.primaryObjective,
      volumeTarget: def.volumeTarget,
      intensityTarget: def.intensityTarget,
      conditioningGuidance: def.conditioningGuidance,
      progressionStyle: def.progressionStyle,
      keyRules: def.keyRules,
      agentLanguage: def.agentLanguage,
    });
    currentWeek += effectiveReacclimationWeeks;
  }

  // For mild re-entry with former advanced background, go straight to capacity build
  if (status === "mild_reentry" && !isFormerAdvanced) {
    const def = RE_ENTRY_PHASES.reacclimation;
    phases.push({
      phase: "reacclimation",
      phaseName: "Light Reacclimation",
      weekStart: currentWeek,
      weekEnd: currentWeek,
      weeks: 1,
      objective: "One week of conservative reintroduction before normal training.",
      volumeTarget: "2–3 working sets per pattern. Modest start.",
      intensityTarget: "60–70% 1RM or RPE 5 out of 10.",
      conditioningGuidance: "Light aerobic only — no conditioning circuits.",
      progressionStyle: "Hold load constant. Assess readiness.",
      keyRules: def.keyRules.slice(0, 4),
      agentLanguage: "Starting with a short reacclimation week to assess where your body is before we build.",
    });
    currentWeek += 1;
  }

  // Phase 2: Capacity Build
  const capDef = RE_ENTRY_PHASES.capacity_build;
  phases.push({
    phase: "capacity_build",
    phaseName: capDef.displayName,
    weekStart: currentWeek,
    weekEnd: currentWeek + capacityBuildWeeks - 1,
    weeks: capacityBuildWeeks,
    objective: capDef.primaryObjective,
    volumeTarget: capDef.volumeTarget,
    intensityTarget: capDef.intensityTarget,
    conditioningGuidance: capDef.conditioningGuidance,
    progressionStyle: capDef.progressionStyle,
    keyRules: capDef.keyRules,
    agentLanguage: capDef.agentLanguage,
  });
  currentWeek += capacityBuildWeeks;

  // Phase 3: Transition
  const transDef = RE_ENTRY_PHASES.transition_to_standard;
  phases.push({
    phase: "transition_to_standard",
    phaseName: transDef.displayName,
    weekStart: currentWeek,
    weekEnd: currentWeek + transitionWeeks - 1,
    weeks: transitionWeeks,
    objective: transDef.primaryObjective,
    volumeTarget: transDef.volumeTarget,
    intensityTarget: transDef.intensityTarget,
    conditioningGuidance: buildGoalConditioningNote(trainingGoal),
    progressionStyle: transDef.progressionStyle,
    keyRules: transDef.keyRules,
    agentLanguage: transDef.agentLanguage,
  });
  currentWeek += transitionWeeks;

  const totalWeeks = phases.reduce((sum, p) => sum + p.weeks, 0);

  const transitionNote = buildTransitionNote(classification, trainingGoal, currentWeek);
  const goalIntegration = buildGoalIntegrationNote(trainingGoal, classification);

  return {
    status,
    totalReEntryWeeks: totalWeeks,
    timeAwayMonths,
    isFormerAdvanced,
    phases,
    transitionNote,
    goalIntegration,
  };
}

// ─── Goal Integration ─────────────────────────────────────────────────────────

function buildGoalConditioningNote(trainingGoal: string): string {
  const g = trainingGoal.toLowerCase();

  if (/conditioning|endurance|cardio|aerobic/.test(g)) {
    return "Conditioning can now scale normally — introduce energy system work appropriate to the goal. Aerobic base first, then threshold/interval work. Still build gradually.";
  }
  if (/fat.loss|weight.loss|cut|lean/.test(g)) {
    return "Light conditioning 2–3× per week. Low-intensity steady-state or tempo intervals. Not aggressive fat-loss circuits — training consistency is the metabolic tool at this stage.";
  }
  if (/power|explosive|athletic/.test(g)) {
    return "Plyometrics and sprint work can return. Start with sub-maximal quality — box jumps, broad jumps, short acceleration runs. No maximal sprinting or heavy plyometrics until Week 2 of transition.";
  }
  if (/sport|football|basketball|soccer|rugby|lacrosse|hockey/.test(g)) {
    return "Sport-specific conditioning can reintroduce — start with aerobic tempo work, then RSA. No high-intensity field drills until transition week 2.";
  }
  return "Goal-appropriate conditioning begins now. Build it in proportion to the primary training goal.";
}

function buildGoalIntegrationNote(trainingGoal: string, classification: ReEntryClassification): string {
  const g = trainingGoal.toLowerCase();
  const { status, isFormerAdvanced, hasInjuryContext } = classification;

  const injuryNote = hasInjuryContext
    ? "\n\nIMPORTANT — INJURY CONTEXT DETECTED: The user mentioned an injury, surgery, or medical procedure. This is NOT a rehab program. TrainChat is a coaching system, not a physical therapist. Respect cleared-to-train status, be conservative with loading, and do not program movements that might aggravate the injury. If in doubt, simplify and reduce." 
    : "";

  if (/strength|squat|bench|deadlift|1rm/.test(g)) {
    return `Goal: Strength — filtered through re-entry lens.
Re-entry protocol does NOT abandon the strength goal. It sequences the re-entry correctly first.
- Reacclimation: compound movements at low load, technique focus — no max effort, no grinding sets
- Capacity build: 3×8-10 on primary strength lifts at 65-75%. Double progression.
- Transition: Full strength programming begins. Working sets at 78%+.
${isFormerAdvanced ? "\nFormer advanced athlete: expect strength to return faster than a beginner. Muscle memory and neural patterns reacquire within 3–5 weeks. Do not artificially slow the transition based on how light the early weeks feel." : ""}${injuryNote}`;
  }

  if (/hypertrophy|muscle|size|mass|bulk/.test(g)) {
    return `Goal: Hypertrophy — filtered through re-entry lens.
Re-entry IS compatible with hypertrophy. The risk is DOMS and excessive soreness — not that the goal is wrong.
- Reacclimation: 2 sets × 10-15 reps. No accessory volume overload. The body will respond to any stimulus.
- Capacity build: Add a third set. Introduce accessory work gradually (1–2 per session → 2–3 per session).
- Transition: Full hypertrophy programming — 4 sets, complete accessory menu, double progression.${injuryNote}`;
  }

  if (/fat.loss|weight.loss|cut|lean|body.comp/.test(g)) {
    return `Goal: Fat Loss — filtered through re-entry lens.
CRITICAL: Re-entry users who want fat loss are at high risk of receiving brutal circuit programs that create massive DOMS, cause dropout, and do not serve long-term fat loss.
- Do NOT prescribe metabolic circuits, AMRAP sets, or high-density finishers in re-entry phases
- Strength training IS the primary tool — build and maintain muscle, which drives metabolism
- Light conditioning (walking, bike, easy tempo) is the conditioning tier during re-entry
- Transition: Conditioning can increase — interval-based work, then HIIT if appropriate
- The athlete who trains consistently at moderate intensity burns far more total calories than the athlete who trains brutally once and stops for 2 weeks.${injuryNote}`;
  }

  if (/power|explosive|speed|sprint/.test(g)) {
    return `Goal: Power/Speed — filtered through re-entry lens.
CRITICAL: Sprint and plyometric programming on a detrained athlete = injury risk.
- Reacclimation: NO sprinting, NO plyometrics, NO depth jumps. Strength base only.
- Capacity build: Sub-maximal jumps (box jumps, broad jumps), very short acceleration runs (10–15m at 70% effort). No max velocity.
- Transition: Max velocity and plyometric volume can return — progressively, not all at once.${injuryNote}`;
  }

  if (/athletic|sport|performance/.test(g)) {
    return `Goal: Athletic Performance — filtered through re-entry lens.
Sport-specific training must wait until capacity is restored. Trying to play athlete in Week 1 of re-entry leads to injury.
- Reacclimation: Strength base and movement quality only
- Capacity build: Light sport-quality movement (deceleration, lateral stepping, sub-maximal jumps)
- Transition: Sport-specific training begins — sport conditioning, speed work, full pattern loading${injuryNote}`;
  }

  return `Goal: ${trainingGoal} — filtered through re-entry lens.
The goal is still honored. The re-entry protocol builds the physical platform required to pursue it effectively.${injuryNote}`;
}

function buildTransitionNote(
  classification: ReEntryClassification,
  trainingGoal: string,
  weekAfterReEntry: number,
): string {
  const { isFormerAdvanced, timeAwayMonths } = classification;
  const timeNote = timeAwayMonths
    ? `After ${timeAwayMonths} month${timeAwayMonths === 1 ? "" : "s"} away, `
    : "After a significant break, ";

  return `${timeNote}the re-entry protocol completes around Week ${weekAfterReEntry - 1}. From Week ${weekAfterReEntry - 1} onward, the athlete transitions to standard goal-specific programming. ${isFormerAdvanced ? "Because this is a former experienced athlete, re-adaptation will be faster than a true beginner. The transition into full training should feel natural and the athlete should feel strong by this point." : "The transition is earned — not assumed."}`;
}

// ─── Detrained Advanced vs True Beginner ─────────────────────────────────────

function buildTrainingAgeNote(classification: ReEntryClassification): string {
  if (!classification.isFormerAdvanced) {
    return `TRAINING AGE CONTEXT: This appears to be either a true beginner or an athlete with limited prior training. Treat as a beginner who also needs re-entry conservatism. Skill development and movement quality are both in development — do not assume pattern competency.`;
  }

  return `TRAINING AGE CONTEXT — DETRAINED FORMER EXPERIENCED ATHLETE:
This is NOT a beginner. This athlete has prior training history and will:
- Reacquire movement patterns faster (muscle memory is real)
- Respond more quickly to training stimulus (faster re-adaptation)
- Understand coaching cues without extensive explanation
- Return to higher strength levels faster than a novice would

HOWEVER: Despite prior experience, the tissues, joints, and connective structures STILL need the re-entry ramp. The muscle memory returns fast; the tendons and fascial tissues catch up more slowly. Do NOT skip the conservative early phases just because the athlete used to be strong.
Do NOT: "Because you trained before, let's jump straight to 4×5 at 80%." 
Do: "Because you have prior experience, your patterns will come back faster — but we still start conservatively for tissue safety."`;
}

// ─── Validation Checks ────────────────────────────────────────────────────────

export interface ReEntryValidationResult {
  passed: boolean;
  warnings: string[];
  issues: string[];
}

export function validateReEntryOutput(
  proposedProgram: string,
  classification: ReEntryClassification,
  phase: ReEntryPhaseType,
): ReEntryValidationResult {
  const p = proposedProgram.toLowerCase();
  const warnings: string[] = [];
  const issues: string[] = [];

  if (phase === "reacclimation") {
    if (/4\s*[x×]\s*[1-9]|5\s*[x×]\s*[1-9]/.test(p)) {
      issues.push("Reacclimation: 4-5 sets detected — maximum is 2 working sets in reacclimation.");
    }
    if (/sprint|max.?velocity|fly\s*(sprint|run)|all.?out/.test(p)) {
      issues.push("Reacclimation: Sprint or max velocity work detected — prohibited in reacclimation phase.");
    }
    if (/depth\s*jump|maximal\s*plyometric|reactive\s*jump/.test(p)) {
      issues.push("Reacclimation: High-intensity plyometrics detected — prohibited in reacclimation phase.");
    }
    if (/amrap|max\s*effort|go\s*to\s*failure|failure/.test(p)) {
      issues.push("Reacclimation: Max effort or failure sets detected — RPE must remain below 5 in reacclimation.");
    }
    if (/circuit|finisher|density|superset\s*[a-z]/.test(p)) {
      warnings.push("Reacclimation: Circuits or density methods detected — should not appear until at least capacity build phase.");
    }
    if (/hiit|intervals?\s+at|conditioning\s+(circuit|block)|metabolic/.test(p)) {
      issues.push("Reacclimation: High-intensity conditioning detected — only easy aerobic work in reacclimation.");
    }
    if (/90%|85%|80%|maxim|heavy/.test(p)) {
      issues.push("Reacclimation: Heavy loading signals detected — intensity must stay at 50-65% 1RM.");
    }
  }

  if (phase === "capacity_build") {
    if (/5\s*[x×]\s*[1-9]/.test(p)) {
      warnings.push("Capacity Build: 5-set protocols detected — maximum 3 working sets in capacity build.");
    }
    if (/all.?out\s*sprint|maximal\s*sprint|100%\s*(effort|intensity)/.test(p)) {
      issues.push("Capacity Build: Maximal sprint or all-out effort — not appropriate until transition phase.");
    }
    if (/hiit/.test(p)) {
      warnings.push("Capacity Build: HIIT detected — interval intensity should still be limited in capacity build.");
    }
  }

  return {
    passed: issues.length === 0,
    warnings,
    issues,
  };
}

// ─── Anti-Pattern Rules ───────────────────────────────────────────────────────

const RE_ENTRY_ANTI_PATTERNS = [
  "Do NOT prescribe 4–5 working sets in the first week — 2 sets maximum in reacclimation",
  "Do NOT prescribe sprinting, max velocity runs, or depth jumps in reacclimation",
  "Do NOT prescribe AMRAP, failure sets, or max effort work in reacclimation",
  "Do NOT prescribe metabolic circuits, finishers, or HIIT in reacclimation",
  "Do NOT ignore the layoff and prescribe a normal active-athlete program",
  "Do NOT use 'start light' as a substitute for actual conservative structure — reduce SETS and COMPLEXITY, not just load",
  "Do NOT treat a detrained advanced athlete as a beginner in terms of exercise intelligence — but DO give them the same conservative volume/intensity ramp",
  "Do NOT escalate load week-to-week until the athlete has demonstrated tissue tolerance",
  "Do NOT prescribe aggressive conditioning or high-intensity cardio in the first weeks after a long layoff",
  "Do NOT treat injury-context re-entry as rehab — defer complex injury management, keep loading conservative and simple",
];

// ─── Main Context Builder ─────────────────────────────────────────────────────

export function buildReEntryContext(
  request: string,
  trainingGoal: string,
  experienceLevel: string,
  sport: string | null,
  daysPerWeek: number,
): string {
  const classification = detectReEntryStatus(request, trainingGoal);

  if (classification.status === "none") return "";

  const architecture = buildReEntryPhaseArchitecture(classification, trainingGoal, daysPerWeek);
  const trainingAgeNote = buildTrainingAgeNote(classification);

  const timeAwayLine = classification.timeAwayMonths
    ? `Time away: approximately ${classification.timeAwayMonths} month${classification.timeAwayMonths === 1 ? "" : "s"}.`
    : "Time away: not specified precisely — assume significant.";

  const signalsLine = classification.detectedSignals.length > 0
    ? `Detected re-entry signals: ${classification.detectedSignals.join(", ")}.`
    : "Re-entry signals present in request.";

  const severityLabel =
    classification.status === "major_reentry" ? "MAJOR (6+ months / full reset)" :
    classification.status === "moderate_reentry" ? "MODERATE (2–6 months / significant detraining)" :
    "MILD (recent inconsistency / partial detraining)";

  const phaseDetails = architecture.phases.map((p, idx) => {
    return `
### RE-ENTRY PHASE ${idx + 1}: ${p.phaseName.toUpperCase()} — Weeks ${p.weekStart}–${p.weekEnd} (${p.weeks} week${p.weeks > 1 ? "s" : ""})
Objective: ${p.objective}
Volume: ${p.volumeTarget}
Intensity: ${p.intensityTarget}
Conditioning: ${p.conditioningGuidance}
Progression: ${p.progressionStyle}
Key Rules for This Phase:
${p.keyRules.map((r) => `  • ${r}`).join("\n")}
Coach Language: "${p.agentLanguage}"`;
  }).join("\n");

  return `
## RE-ENTRY / RETURN-TO-TRAINING PROTOCOL — MANDATORY OVERRIDE

⚠️ RE-ENTRY DETECTED. This user is NOT an active athlete. Standard programming would be inappropriate.
This context OVERRIDES normal programming aggressiveness.

### RE-ENTRY CLASSIFICATION
Status: ${severityLabel}
${timeAwayLine}
${signalsLine}
Training history: ${classification.isFormerAdvanced ? "FORMER EXPERIENCED ATHLETE — faster re-adaptation expected, same conservative early volume applies" : "General / beginner background"}
${classification.hasInjuryContext ? "⚠️ INJURY/MEDICAL CONTEXT: Be extra conservative. Do not program anything that could aggravate an injury." : ""}

### WHAT RE-ENTRY PROGRAMMING IS
Return-to-training is NOT:
  - A normal program with "start light"
  - A beginner program
  - "Go hard but listen to your body"
  - Aggressive volume with good intentions

Return-to-training IS:
  - Structured phased re-introduction of training stress
  - Movement quality and tissue tolerance as primary objectives
  - Volume and intensity that earn their way up over weeks
  - A foundation that the real goal-specific programming is built on top of

### PHASE ARCHITECTURE — MANDATORY
Total re-entry program duration: ${architecture.totalReEntryWeeks} weeks before full goal-specific programming
${phaseDetails}

### TRANSITION PLAN
${architecture.transitionNote}

### GOAL INTEGRATION
${architecture.goalIntegration}

### TRAINING AGE CONTEXT
${trainingAgeNote}

### ANTI-PATTERNS — DO NOT DO ANY OF THESE
${RE_ENTRY_ANTI_PATTERNS.map((ap) => `  ✗ ${ap}`).join("\n")}

### REQUIRED AGENT LANGUAGE
The coach MUST acknowledge the time away explicitly and explain the re-entry rationale:
  - Reference the layoff: "Because you've been away for [time], we're starting with a reacclimation phase..."
  - Explain the structure: "Weeks 1–${architecture.phases[0]?.weekEnd ?? 2} focus on movement quality and tissue tolerance, not intensity."
  - Frame capacity build positively: "This phase isn't easy — it's building the foundation for the harder training that comes next."
  - Show the full arc: "By Week ${architecture.totalReEntryWeeks}, you'll be back to full training."
  - Be honest about the process: "This will feel lighter than you expect. That is intentional."

### PROGRAM FORMAT REQUIREMENT
When outputting this program, the coach MUST:
  1. State the re-entry status and acknowledge the time away
  2. Show the phased plan with week ranges explicitly labeled
  3. Explain what each phase is doing and why
  4. Describe when goal-specific programming begins
  5. NOT present a single repeating week as the full program — the phases must be visible
`.trim();
}

// ─── Trigger Detection ────────────────────────────────────────────────────────

export function needsReEntryContext(request: string, trainingGoal: string): boolean {
  const classification = detectReEntryStatus(request, trainingGoal);
  return classification.status !== "none" && classification.confidenceLevel !== "low";
}

export function getReEntryStatus(request: string, trainingGoal: string): ReEntryClassification {
  return detectReEntryStatus(request, trainingGoal);
}
