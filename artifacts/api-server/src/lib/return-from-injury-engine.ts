/**
 * TrainChat Return-From-Injury Engine
 *
 * Phase 8 Intelligence Upgrade — Injury-aware programming mode.
 *
 * PURPOSE:
 * Handle users who are actively returning from injury, pain flare, or
 * tissue-specific setbacks with a distinct, conservative, symptom-aware
 * programming mode.
 *
 * THIS IS NOT:
 * - A medical diagnosis engine
 * - A rehab/treatment system
 * - A replacement for a physical therapist or clinician
 *
 * THIS IS:
 * - A safer training-construction mode
 * - Symptom-aware load management
 * - Region-appropriate exercise selection and progression
 * - Gradual exposure with confidence-building framing
 */

import { logger } from "./logger";

// ─── Types ─────────────────────────────────────────────────────────────────────

export type InjuredRegion =
  | "ankle"
  | "knee"
  | "hip"
  | "hamstring"
  | "adductor"
  | "low_back"
  | "thoracic"
  | "shoulder"
  | "elbow"
  | "wrist"
  | "neck"
  | "multi_region"
  | "unknown";

export type InjurySeverity = "mild" | "moderate" | "high" | "unknown";

export type InjuryStage =
  | "recent"       // just happened, likely still symptomatic
  | "subacute"     // past acute phase, still healing
  | "returning"    // cleared or near-cleared, rebuilding
  | "unclear";     // not enough info to determine

export interface ReturnFromInjuryContext {
  detected: boolean;
  injuredRegion: InjuredRegion;
  severity: InjurySeverity;
  stage: InjuryStage;
  matchedSignals: string[];
  requiresConservativeProgramming: boolean;
  hasMultipleRegions: boolean;
  goalContext: string;
  notes: string[];
}

export interface ReturnFromInjuryValidationResult {
  passed: boolean;
  isWarning: boolean;
  reason: string;
}

// ─── Detection Signal Banks ───────────────────────────────────────────────────

const INJURY_RETURN_SIGNALS = [
  // "coming back from [a/an] [region] injury/surgery/etc" — allows body-part qualifier
  /coming\s*back\s*(from|after)\s*(an?\s*)?(\w+\s+)?(injury|sprain|strain|tear|surgery|procedure|operation|flare|setback)/i,
  // "returning [from|after] [a/an] [region] injury/surgery/etc"
  /returning\s*(from|after)\s*(an?\s*)?(\w+\s+)?(injury|surgery|procedure|sprain|strain|tear|flare)/i,
  // "recovering from [a/an] [region] injury/surgery/etc"
  /recovering\s*(from|after)\s*(an?\s*)?(\w+\s+)?(injury|surgery|procedure|sprain|strain|tear)/i,
  // "return to training after ..."
  /return\s*(to training|to the gym|to lifting|to exercise|to working out)\s*(after|from|following)/i,
  /post.?injury/i,
  /post.?surgery/i,
  /post.?op/i,
  // "rebuilding after [a/an] [region] injury/surgery"
  /rebuilding\s*after\s*(an?\s*)?(\w+\s+)?(injury|surgery|setback)/i,
  /cleared\s*(to train|to exercise|to lift|to work out|to play|to return)/i,
  // "easing back in/into training/gym after/following"
  /easing\s*back\s*(in|into)\s*(training|the gym|lifting|working out|exercise)?\s*(after|following)/i,
  // "getting back [to training] after/following my injury"
  /getting\s*back\s*(to training|to lifting|after|following)\s*(my|a|an)?\s*(\w+\s+)?(injury|surgery|setback|flare)/i,
  /pain\s*flare/i,
  /flared\s*(up|my)/i,
  /tweaked\s*my/i,
  /\b(strained|sprained|tweaked|hurt|injured)\s*my\s*(knee|shoulder|back|hamstring|hip|ankle|elbow|wrist|adductor|groin|neck|spine)/i,
  /my\s*(knee|shoulder|back|hamstring|hip|ankle|elbow|wrist|adductor|groin|neck)\s*(has been|is|keeps?|been)\s*(bothering|hurting|aching|sore|injured|painful|inflamed|flaring)/i,
  /\b(injury|injuries)\s*(is|was|are|were)?\s*(recent|new|still|ongoing|healed|healing|better|improving|worse)/i,
  /recently\s*(injured|strained|sprained|hurt|had surgery|had an injury)/i,
  /just\s*(got over|recovering from|coming back from|had)\s*(an?\s*)?(\w+\s+)?(injury|surgery|strain|sprain)/i,
  /after\s*(my|the)\s*(injury|surgery|operation|procedure|rehab|recovery)/i,
  /during\s*(rehab|recovery|physical therapy|PT)/i,
  /done\s*with\s*(rehab|PT|physical therapy)/i,
  /finished\s*(rehab|PT|physical therapy)/i,
];

const SEVERITY_HIGH_SIGNALS = [
  /surgery/i,
  /surgical/i,
  /operation/i,
  /post.?op/i,
  /complete\s*(tear|rupture|break|fracture)/i,
  /\b(ACL|PCL|MCL|LCL|labrum|rotator.?cuff|meniscus)\b/i,
  /fracture/i,
  /broken/i,
  /disc\s*(herniation|herniated|bulge|bulging|protrusion)/i,
  /nerve\s*(damage|compression|impingement)/i,
];

const SEVERITY_MODERATE_SIGNALS = [
  /partial\s*(tear|strain)/i,
  /grade\s*[23]\s*(strain|sprain|tear)/i,
  /significant\s*(pain|discomfort|injury)/i,
  /chronic\s*(pain|issue|injury)/i,
  /persistent\s*pain/i,
  /still\s*(in pain|hurting|sore|bothering me)/i,
];

const SEVERITY_MILD_SIGNALS = [
  /mild\s*(strain|sprain|discomfort|pain)/i,
  /grade\s*1\s*(strain|sprain)/i,
  /minor\s*(strain|sprain|injury|issue)/i,
  /tweaked/i,
  /a\s*little\s*(sore|tight|achy|stiff)/i,
  /feeling\s*(better|good|okay|improved)/i,
  /almost\s*(healed|fully|back to normal)/i,
  /95\s*%/i,
];

const STAGE_RECENT_SIGNALS = [
  /just\s*(happened|occurred|got injured|tweaked|strained|sprained)/i,
  /very\s*recent/i,
  /\b(last week|days ago|this week|recently happened)\b/i,
  /still\s*(can'?t|unable to|struggling to)/i,
  /still\s*(in|having)\s*(a lot of)?\s*pain/i,
];

const STAGE_RETURNING_SIGNALS = [
  /cleared\s*(to train|to exercise|to lift|to return)/i,
  /doctor\s*(cleared|said|told me)/i,
  /PT\s*(cleared|released|finished|done)/i,
  /healed\s*(up|enough|well)/i,
  /much\s*better/i,
  /feeling\s*(much\s*)?(better|good|great|strong)/i,
  /almost\s*fully/i,
  /back\s*to\s*(training|the gym|normal)/i,
];

// ─── Region Detection ─────────────────────────────────────────────────────────

const REGION_PATTERNS: Record<InjuredRegion, RegExp> = {
  ankle:
    /\b(ankle|achilles|plantar.?fascia|foot|heel|toe)\b/i,
  knee:
    /\b(knee|patellar|ACL|PCL|MCL|LCL|meniscus|patella|kneecap|IT.?band|quad.?tendon|patellar.?tendon)\b/i,
  hip:
    /\b(hip|glute|gluteal|piriformis|hip\s*flexor|iliopsoas|SI\s*joint|sacroiliac|greater\s*trochanter)\b/i,
  hamstring:
    /\b(hamstring|bicep.?femoris|semitendinosus|semimembranosus|posterior\s*thigh)\b/i,
  adductor:
    /\b(adductor|groin|inner\s*thigh|adductor\s*strain)\b/i,
  low_back:
    /\b(low\s*back|lower\s*back|lumbar|L[1-5]|disc\s*(herniation|bulge|issue)|SI\s*joint|sacroiliac|sciatica|sciatic)\b/i,
  thoracic:
    /\b(thoracic|upper\s*back|mid\s*back|T[1-9]|T1[0-2]|rib|intercostal)\b/i,
  shoulder:
    /\b(shoulder|rotator\s*cuff|labrum|AC\s*joint|acromioclavicular|supraspinatus|infraspinatus|subscapularis|glenohumeral|impingement|SLAP)\b/i,
  elbow:
    /\b(elbow|tennis\s*elbow|golfer'?s?\s*elbow|lateral\s*epicondylitis|medial\s*epicondylitis|olecranon|tricep\s*tendon)\b/i,
  wrist:
    /\b(wrist|carpal|TFCC|de.?quervain|scaphoid|distal\s*radius)\b/i,
  neck:
    /\b(neck|cervical|C[1-7]|whiplash|cervical\s*strain)\b/i,
  multi_region: /never_direct_match/,
  unknown: /never_direct_match/,
};

// ─── Main Detection Function ──────────────────────────────────────────────────

export function detectReturnFromInjury(
  userMessage: string,
  profileGoal: string = "",
  profileInjuries: string = "",
): ReturnFromInjuryContext {
  const combined = `${userMessage} ${profileGoal} ${profileInjuries}`;
  const matchedSignals: string[] = [];
  const notes: string[] = [];

  // ── 1. Check for return-from-injury signals ───────────────────────────────
  let injuryReturnDetected = false;
  for (const pattern of INJURY_RETURN_SIGNALS) {
    if (pattern.test(combined)) {
      injuryReturnDetected = true;
      const match = combined.match(pattern);
      if (match) matchedSignals.push(match[0].trim().substring(0, 40));
      break;
    }
  }

  if (!injuryReturnDetected) {
    return {
      detected: false,
      injuredRegion: "unknown",
      severity: "unknown",
      stage: "unclear",
      matchedSignals: [],
      requiresConservativeProgramming: false,
      hasMultipleRegions: false,
      goalContext: "",
      notes: [],
    };
  }

  // ── 2. Detect injured region ──────────────────────────────────────────────
  const regionsFound: InjuredRegion[] = [];
  for (const [region, pattern] of Object.entries(REGION_PATTERNS)) {
    if (region === "multi_region" || region === "unknown") continue;
    if (pattern.test(combined)) {
      regionsFound.push(region as InjuredRegion);
    }
  }

  let injuredRegion: InjuredRegion;
  if (regionsFound.length === 0) {
    injuredRegion = "unknown";
  } else if (regionsFound.length === 1) {
    injuredRegion = regionsFound[0];
  } else {
    injuredRegion = "multi_region";
    notes.push(`Multiple injury regions detected: ${regionsFound.join(", ")}`);
  }

  // ── 3. Detect severity ────────────────────────────────────────────────────
  let severity: InjurySeverity = "unknown";
  const highSigs = SEVERITY_HIGH_SIGNALS.filter((p) => p.test(combined));
  const modSigs = SEVERITY_MODERATE_SIGNALS.filter((p) => p.test(combined));
  const mildSigs = SEVERITY_MILD_SIGNALS.filter((p) => p.test(combined));

  if (highSigs.length > 0) {
    severity = "high";
    notes.push("High-severity context detected (surgery/major structural injury)");
  } else if (modSigs.length > 0) {
    severity = "moderate";
  } else if (mildSigs.length > 0) {
    severity = "mild";
  } else {
    severity = "moderate"; // default conservative assumption
  }

  // ── 4. Detect stage ───────────────────────────────────────────────────────
  let stage: InjuryStage = "unclear";
  const recentSigs = STAGE_RECENT_SIGNALS.filter((p) => p.test(combined));
  const returnSigs = STAGE_RETURNING_SIGNALS.filter((p) => p.test(combined));

  if (recentSigs.length > 0) {
    stage = "recent";
    notes.push("Recent/acute injury stage — maximum conservatism warranted");
  } else if (returnSigs.length > 0) {
    stage = "returning";
    notes.push("User indicates clearance or near-clearance — tolerance-based progression appropriate");
  } else {
    stage = "subacute";
  }

  // ── 5. Extract goal context ────────────────────────────────────────────────
  const goalContext = profileGoal.trim();

  // ── 6. Conservative programming requirement ───────────────────────────────
  const requiresConservativeProgramming = true; // always true when detected

  logger.debug(
    {
      injuredRegion,
      severity,
      stage,
      matchedSignals: matchedSignals.length,
      regionsFound,
    },
    "[ReturnFromInjuryEngine] Detection complete",
  );

  return {
    detected: true,
    injuredRegion,
    severity,
    stage,
    matchedSignals,
    requiresConservativeProgramming,
    hasMultipleRegions: regionsFound.length > 1,
    goalContext,
    notes,
  };
}

// ─── Region-Specific Programming Filters ─────────────────────────────────────

function buildRegionFilters(region: InjuredRegion, stage: InjuryStage, severity: InjurySeverity): string {
  const isRecentOrHigh = stage === "recent" || severity === "high";

  const filters: Record<InjuredRegion, string> = {
    ankle: `
ANKLE / FOOT INJURY FILTERS:
- Avoid high-reactivity plyometrics, bounding, box jumps, depth drops ${isRecentOrHigh ? "(ALL impact work removed)" : "(limit until tolerance confirmed)"}
- Avoid aggressive lateral cutting or reactive agility drills early
- Bias calf/foot/ankle strengthening: seated/partial-range calf raises, banded ankle work, foot intrinsic exercises
- Progress: stationary calf work → slow eccentric → single-leg tolerance → light impact → reactive work (last)
- Upper body and core work can be trained near-normally — bias seated/lying options to reduce standing demand
- If standing, ensure stable base and avoid heel raises with load until cleared`,

    knee: `
KNEE INJURY FILTERS:
- Manage deep knee flexion exposure progressively — start with partial range (quarter squat) and progress gradually
- Avoid high-impact plyometrics, explosive deceleration, jump landings early
- Bias stable lower-body patterns: leg press, partial-range squat, step-up with control, hip hinge, glute bridge
- Include controlled quad and glute work: leg extension (limited ROM if needed), hip-focused patterns
- Progress: partial-range stable work → full-range controlled → single-leg stable → loaded bilateral → reactive/impact last
- NO ballistic deceleration drills, box jumps, or aggressive lateral cutting ${isRecentOrHigh ? "at this stage" : "until explicitly cleared"}`,

    hip: `
HIP INJURY FILTERS:
- Avoid aggressive hip extension under high load early
- Reduce end-range hip flexion loading (deep squat, full-range lunge with load)
- Bias: hip hinge (controlled), lateral band work, glute isolation, supine hip exercises
- Progress: supine/lying hip work → supported standing → bilateral loaded hinge → single-leg patterns → full range
- Avoid aggressive hip labrum stressors (deep squat + load, hip external rotation under high stress) ${isRecentOrHigh ? "— restrict all loading to pain-free ROM" : ""}`,

    hamstring: `
HAMSTRING INJURY FILTERS (HIGH PRIORITY — hamstring re-injury risk is significant):
- Avoid high-speed sprinting, aggressive loaded long-length hamstring work in early stages
- Avoid aggressive eccentric loading at long muscle length early (stiff-leg DL at depth, aggressive Nordic curl)
- Bias: prone leg curl, supine bridge, glute bridge, controlled hip hinge at limited ROM, isometric holds
- Progress: short-range isometric → supine/prone controlled → hip hinge mid-range → loaded hinge at mid-range → full-range → eccentric → speed work (last)
- Sprint-based work is the LAST thing reintroduced — never in early stages
- NEVER program max-speed sprinting or aggressive repeated sprint work ${isRecentOrHigh ? "at this phase" : "without confirmed tissue tolerance"}`,

    adductor: `
ADDUCTOR / GROIN INJURY FILTERS:
- Avoid wide-stance loaded patterns initially (sumo DL, wide-stance squat under heavy load, lateral lunge with load)
- Avoid aggressive hip abduction/adduction resistance training early
- Bias: neutral-stance lower-body work, hip-dominant patterns, controlled unilateral work in narrow stance
- Progress: isometric adduction holds → short-range controlled → full-range unloaded → loaded moderate range → wide stance last`,

    low_back: `
LOW BACK INJURY FILTERS:
- Avoid high-fatigue axial spinal loading early (heavy barbell squat, heavy deadlift, loaded carries under fatigue)
- Avoid aggressive lumbar flexion under load early
- Bias: trunk stability work (bird dog, dead bug, supported anti-rotation), hip hinge pattern with light load, supported squat
- Core stability is the foundation — begin with isometric and anti-movement patterns before dynamic loading
- Progress: supine stability → supported hinge → light bilateral hinge → moderate loading → full loading (volume and intensity build gradually)
- NO heavy axial loading until movement quality is confirmed and symptoms are stable ${isRecentOrHigh ? "— keep all loading very conservative" : ""}`,

    thoracic: `
THORACIC / UPPER BACK INJURY FILTERS:
- Avoid aggressive thoracic rotation under load, heavy shrugs, and high-volume overhead pressing early
- Bias: scapular control work, supported pulling, chest-supported rowing, band pull-aparts, controlled rotator cuff work
- Progress: scapular/postural work → light horizontal pull → moderate horizontal pull → overhead with control → loaded rotation last`,

    shoulder: `
SHOULDER INJURY FILTERS:
- Avoid aggressive overhead pressing, heavy unsupported pressing, and instability-focused exercises early
- Reduce pressing volume significantly — pressing fatigue can aggravate shoulder structures
- Bias: scapular control (band pull-apart, face pull, wall slide), supported horizontal pull, neutral-grip pull, rotator cuff activation
- Progress: scapular activation → supported horizontal pull → light cable press → moderate DB press → barbell overhead last (if cleared)
- NO unstable pressing (dumbbells at end range, chest flies at long shoulder position) ${isRecentOrHigh ? "at this stage" : "until tolerance is confirmed"}
- Monitor pushing-to-pulling ratio: bias 1:2 or 1:3 (pulls:pushes) early`,

    elbow: `
ELBOW INJURY FILTERS:
- Avoid heavy barbell pressing variations that load the elbow under maximum tension
- Avoid aggressive elbow flexion/extension at end range under load early
- Bias: neutral-grip work (hammer curls, neutral press), light supinated work, controlled loading
- Avoid repetitive gripping under fatigue (reduces forearm/elbow irritation)
- Progress: no-load ROM → light neutral-grip → moderate grip work → end-range loading last`,

    wrist: `
WRIST INJURY FILTERS:
- Avoid compression-heavy loading (barbell pressing in wrist extension, heavy deadlift grip demands)
- Bias: neutral-grip patterns, pulling vs. pressing focus, exercises that minimize wrist extension under load
- Use straps for pulling work if grip strength is the limiting factor
- Progress: pain-free ROM work → light neutral grip → controlled loading → full loading last`,

    neck: `
NECK / CERVICAL INJURY FILTERS:
- Avoid heavy overhead pressing, heavy shrugs/traps work, and exercises requiring extreme neck positioning under load
- Bias: thoracic mobility, scapular control, light pressing, horizontal pulling
- Reduce loading on upper trap and posterior cervical muscles
- NO contact-sport simulation, high-velocity head motion, or unstable cervical loading ${isRecentOrHigh ? "— keep all loading very conservative" : ""}`,

    multi_region: `
MULTI-REGION INJURY FILTERS:
- Multiple injury sites are detected. Apply the most conservative interpretation for any overlapping patterns.
- Simplify the session: fewer exercises, controlled tempo, no complex movement chains under fatigue
- Any exercise that loads multiple affected regions simultaneously should be deprioritized or removed
- Prefer unilateral, single-joint, or supported exercises that allow isolated loading away from injured areas`,

    unknown: `
UNKNOWN INJURY REGION:
- No specific region was detected from the user's message, but injury return context is confirmed
- Apply universal conservative return-from-injury defaults: lower volume, controlled intensity, simpler movement choices
- Avoid explosive, ballistic, or high-complexity movements until more context is available
- If clarification is needed, ask ONE targeted question about the affected area before or after building`,
  };

  return filters[region] ?? filters.unknown;
}

// ─── Goal-Through-Injury-Lens Filter ─────────────────────────────────────────

function buildGoalThroughInjuryLens(goalContext: string, region: InjuredRegion, stage: InjuryStage): string {
  const goal = goalContext.toLowerCase();

  if (/fat.?loss|weight\s*loss|lose\s*(weight|fat)|body.?comp|cut(ting)?|lean/.test(goal)) {
    return `
GOAL LENS — FAT LOSS THROUGH INJURY:
- Fat loss goal does NOT change the conservative injury-return mandate
- Use metabolic-style circuits only with injury-safe exercise selections
- Prioritize consistent training over aggressive caloric demand from the gym
- Recommend sustainable activity first: walking, stationary bike (if knee-safe), rowing (if back-safe), swimming (if available)
- Do NOT program aggressive conditioning circuits that load the injured region`;
  }

  if (/strength|strong|lift|powerlifting|1rm|max/.test(goal)) {
    return `
GOAL LENS — STRENGTH THROUGH INJURY:
- Strength goal is valid but loading must wait for tissue tolerance
- Build the movement quality and exposure base FIRST — loading comes after
- Early phases: higher reps (10–15), controlled tempo, conservative loads (RPE 4–6)
- DO NOT program max-effort sets, near-maximal loading, or 1RM attempts in early return stages
- Progress: volume tolerance confirmed → load added gradually → intensity increased last`;
  }

  if (/hypertrophy|muscle|size|mass|body.?build|physique/.test(goal)) {
    return `
GOAL LENS — HYPERTROPHY THROUGH INJURY:
- Hypertrophy training is highly compatible with injury return when done conservatively
- Bias moderate rep ranges (10–15), controlled tempo, and mind-muscle focus
- Avoid chasing muscle damage (excessive DOMS) in early stages — this can provoke re-injury
- Focus on high-quality reps in pain-free range rather than maximum loading
- Use the injury as an opportunity to develop lagging areas that don't overlap with the injured region`;
  }

  if (/conditioning|cardio|endurance|aerobic|stamina|athletic|sport/.test(goal)) {
    return `
GOAL LENS — CONDITIONING / SPORT THROUGH INJURY:
- Conditioning remains achievable — but modality must be injury-appropriate
- ${region === "ankle" || region === "knee" ? "Bias upper-body cardio (bike with controlled knee angle, rowing if back-safe, arm crank) early" : ""}
- ${region === "shoulder" ? "Bias lower-body cardio: stationary bike, walking, sled push (light), banded leg work" : ""}
- ${region === "low_back" ? "Avoid high-impact running and loaded carries under fatigue; stationary bike, swimming, and walking are lower irritation" : ""}
- Sport-specific drills should NOT be programmed until the injured region is confirmed tolerating sport-appropriate load
- Prioritize aerobic base and non-irritating modalities early`;
  }

  return `
GOAL LENS — GENERAL FITNESS THROUGH INJURY:
- General fitness goal is fully achievable with conservative construction
- Build a full-body program that simply avoids loading the injured region aggressively
- Identify what CAN be trained safely and build around it — the rest of the body can be developed normally
- The injured region gets conservative, gradual reintroduction — not complete avoidance`;
}

// ─── Safe Progression Model ───────────────────────────────────────────────────

function buildProgressionModel(stage: InjuryStage, severity: InjurySeverity, region: InjuredRegion): string {
  const earlyStage = stage === "recent" || severity === "high";
  const midStage = stage === "subacute" || (stage === "unclear" && severity === "moderate");
  const lateStage = stage === "returning" && (severity === "mild" || severity === "moderate");

  if (earlyStage) {
    return `
PROGRESSION MODEL — EARLY/CONSERVATIVE PHASE:
Week 1–2 approach:
- Focus: tolerated exposure and movement quality, not loading
- Volume: 2–3 sets, 10–15 reps, RPE 3–5
- Intensity: light — confirming movement is pain-free before adding load
- Complexity: simple, single-joint or supported patterns only
- Progression trigger: pain-free movement with no post-session flare → progress
- If ANY flare: reduce load/ROM/sets, do not push through pain
- Speed/reactivity: not appropriate at this stage`;
  }

  if (midStage) {
    return `
PROGRESSION MODEL — SUBACUTE / BUILDING PHASE:
Week 1–3 approach:
- Focus: volume tolerance and controlled loading
- Volume: 3 sets, 8–15 reps, RPE 5–7
- Intensity: moderate — 60–75% effort, no near-maximal loading
- Complexity: controlled bilateral patterns, progressing toward more challenging variations
- Progression trigger: consistent good response for 2+ sessions → progress exercise difficulty or load
- Speed/reactivity: still restricted — no explosive work yet`;
  }

  if (lateStage) {
    return `
PROGRESSION MODEL — RETURN PHASE:
Week 1–2 approach:
- Focus: reestablishing training capacity and progressive loading
- Volume: 3–4 sets, 6–15 reps, RPE 6–8
- Intensity: moderate-high — controlled progressive loading
- Complexity: full movement patterns reintroduced with monitoring
- Progression trigger: consistent performance → add load systematically
- Speed/reactivity: can be reintroduced conservatively — monitor response carefully`;
  }

  return `
PROGRESSION MODEL — CONSERVATIVE PHASE (stage unclear):
Default conservative approach:
- Start with tolerated exposure: 2–3 sets, 10–15 reps, RPE 4–6
- Confirm movement is pain-free before adding load
- Progress volume before intensity
- Progress intensity before complexity
- Progress complexity before speed/reactivity
- If uncertain, use the more conservative option`;
}

// ─── Clarification Logic ──────────────────────────────────────────────────────

export function getReturnFromInjuryClarification(ctx: ReturnFromInjuryContext): string | null {
  if (ctx.injuredRegion === "unknown") {
    return "Can you tell me which body part or area you're returning from injury on? That will help me design a safer plan around it.";
  }

  if (ctx.stage === "recent" && ctx.severity !== "high") {
    return `Are you still experiencing active symptoms around your ${ctx.injuredRegion.replace("_", " ")}, or are you in the recovery phase and cleared for training?`;
  }

  if (ctx.severity === "high" && ctx.stage !== "returning") {
    return `You mentioned a significant injury — have you been cleared by a doctor or physiotherapist to return to training? I want to make sure I'm programming within safe boundaries.`;
  }

  if (ctx.injuredRegion === "low_back" && ctx.stage !== "returning") {
    return "Is your low back currently pain-free with basic movements (like walking and sitting), or are you still managing symptoms day-to-day?";
  }

  if (ctx.injuredRegion === "hamstring" && ctx.stage !== "returning") {
    return "Can you tell me how far along you are — are you still dealing with tightness or discomfort, or are you past the pain stage and focused on rebuilding strength?";
  }

  return null;
}

// ─── Main Context Builder ─────────────────────────────────────────────────────

export function buildReturnFromInjuryContext(ctx: ReturnFromInjuryContext): string {
  const regionLabel = ctx.injuredRegion.replace(/_/g, " ").toUpperCase();
  const stageLabel = ctx.stage.replace(/_/g, " ");
  const severityLabel = ctx.severity;

  const regionFilters = buildRegionFilters(ctx.injuredRegion, ctx.stage, ctx.severity);
  const progressionModel = buildProgressionModel(ctx.stage, ctx.severity, ctx.injuredRegion);
  const goalLens = buildGoalThroughInjuryLens(ctx.goalContext, ctx.injuredRegion, ctx.stage);

  return `

## ⚠️ RETURN-FROM-INJURY MODE ACTIVE

**Injury region:** ${regionLabel}
**Severity:** ${severityLabel}
**Stage:** ${stageLabel}
${ctx.hasMultipleRegions ? "**Note:** Multiple injury regions detected — apply conservative filters for all affected areas." : ""}
${ctx.notes.length > 0 ? ctx.notes.map((n) => `**Note:** ${n}`).join("\n") : ""}

---

### RETURN-FROM-INJURY MANDATE

You are building a training program for a user returning from injury. This is a distinct, conservative programming mode.

**THIS IS NOT:**
- Standard athletic programming
- Generic "go lighter" advice
- A rehab or physical therapy program
- A medical diagnosis

**THIS IS:**
- Symptom-aware load management
- Region-appropriate exercise selection
- Gradual, confidence-building progressive exposure
- Safe training around the injury while rebuilding tolerance

---

### UNIVERSAL SAFETY RULES (apply regardless of region)

1. NO explosive or reactive exercises in the affected region during early return
2. NO near-maximal loading or max-effort sets
3. Start with TOLERATED EXPOSURE first — confirm pain-free movement before adding load
4. Volume is conservative: 2–3 sets per pattern, 3–4 exercises per session in early return
5. Intensity ceiling: RPE 5–7 in early-to-mid phases; RPE 8 is the max for confirmed returning users
6. No complex, multi-joint fatigue patterns under load when a joint is still in recovery
7. If the movement or load would provoke symptoms, USE A REGRESSION — not a modification of the same risky pattern
8. NEVER suggest pushing through pain. The signal is always: pain-free → progress; pain present → reduce or regress

---

${regionFilters}

---

${progressionModel}

---

${goalLens}

---

### AGENT LANGUAGE GUIDELINES

Sound: calm, practical, confidence-building, symptom-aware.

GOOD EXAMPLES:
- "I'm building this conservatively around your ${ctx.injuredRegion.replace(/_/g, " ")} while we rebuild strength and tolerance."
- "Because you're returning from a ${ctx.injuredRegion.replace(/_/g, " ")} injury, I'm keeping the loading simple and gradual — we'll progress as you confirm good responses."
- "The goal here is consistent training, not max output. Your body needs to re-establish tolerance before we push intensity."
- "I've biased this toward lower irritation so you can train reliably. Once you're feeling strong responses, we'll progress the loading."

AVOID:
- Diagnosis language ("you have X condition", "this is a grade X injury")
- Treatment claims ("this will fix your injury", "this will heal your ${ctx.injuredRegion.replace(/_/g, " ")}")
- Rehab guarantees ("this protocol will rehabilitate your injury")
- Catastrophizing ("be very careful", "this could be dangerous")
- Excessive medical language that would belong in a clinical setting, not a coaching conversation

DO NOT FREEZE the program or remove all exercise. The user should receive:
- A clear, useful training plan
- Exercises they can DO safely, not just a list of things to avoid
- Confidence that they can train, progress, and get stronger while respecting their injury

---

### PRE-OUTPUT VALIDATION CHECKLIST

Before finalizing the program, verify:
□ No explosive/ballistic exercises for the affected region in early stages
□ Volume is appropriate (2–4 sets, 3–5 exercises, no excessive density)
□ Intensity is conservative (RPE 4–7, no max-effort prescriptions)
□ Region-specific filters are applied (see above)
□ Progression is gradual — no aggressive jumps between sessions or weeks
□ Goal is still honored through the injury lens
□ Agent language is calm, practical, and confidence-building`;
}

// ─── Safety Validator ─────────────────────────────────────────────────────────

export function validateReturnFromInjuryOutput(
  generatedText: string,
  program: { days: { exercises: { name: string; sets?: number; reps?: string }[] }[] },
  ctx: ReturnFromInjuryContext,
): ReturnFromInjuryValidationResult {
  const lower = generatedText.toLowerCase();
  const isEarlyStage = ctx.stage === "recent" || ctx.severity === "high";

  // ── Hard fail: explosive/reactive exercises for acute or high-severity ─────
  if (isEarlyStage) {
    const explosivePatterns = [
      /\b(box\s*jump|depth\s*jump|power\s*clean|hang\s*clean|snatch|clean\s*and\s*jerk|plyometric|plyo\s*box)\b/i,
      /\bmax\s*(effort|velocity|speed)\b/i,
      /\b(sprint|sprint work|sprint session|max.?speed)\b/i,
    ];
    for (const p of explosivePatterns) {
      if (p.test(lower)) {
        return {
          passed: false,
          isWarning: false,
          reason: `Explosive/reactive exercise detected for early-stage injury return (${ctx.injuredRegion.replace(/_/g, " ")}). Remove explosive work entirely for this stage.`,
        };
      }
    }
  }

  // ── Hard fail: hamstring-specific — no sprint work in early/subacute ───────
  if ((ctx.injuredRegion === "hamstring" || ctx.hasMultipleRegions) && ctx.stage !== "returning") {
    if (/\b(sprint|max.?speed|reactive\s*agility|repeated\s*sprint)\b/i.test(lower)) {
      return {
        passed: false,
        isWarning: false,
        reason: "Sprint work detected for hamstring injury return in non-returning stage. Sprint reintroduction must wait until full hamstring tolerance is confirmed.",
      };
    }
  }

  // ── Hard fail: shoulder — high-volume overhead pressing ───────────────────
  if (ctx.injuredRegion === "shoulder" && isEarlyStage) {
    const overheadPressPatterns = /\b(overhead\s*press|military\s*press|OHP|barbell\s*press\s*(overhead|above|up))\b/i;
    if (overheadPressPatterns.test(lower)) {
      return {
        passed: false,
        isWarning: false,
        reason: "Overhead pressing detected for early-stage shoulder injury return. Overhead pressing must be eliminated or heavily restricted in early shoulder return.",
      };
    }
  }

  // ── Hard fail: low back — heavy axial loading in recent/high stage ────────
  if ((ctx.injuredRegion === "low_back" || ctx.hasMultipleRegions) && isEarlyStage) {
    if (/\b(heavy\s*(deadlift|squat|barbell\s*squat)|max\s*effort|near.?maximal)\b/i.test(lower)) {
      return {
        passed: false,
        isWarning: false,
        reason: "Heavy axial loading detected for early-stage low back injury return. Heavy deadlifts and barbell squats must be replaced with lighter, supported patterns.",
      };
    }
  }

  // ── Hard fail: knee — high-impact plyometrics in early stage ─────────────
  if ((ctx.injuredRegion === "knee" || ctx.hasMultipleRegions) && isEarlyStage) {
    if (/\b(box\s*jump|depth\s*jump|broad\s*jump|squat\s*jump|tuck\s*jump)\b/i.test(lower)) {
      return {
        passed: false,
        isWarning: false,
        reason: "High-impact plyometrics detected for early-stage knee injury return. Remove all jump/plyometric work for this stage.",
      };
    }
  }

  // ── Warning: excessive session density ───────────────────────────────────
  for (const day of program.days) {
    if (day.exercises.length > 8) {
      return {
        passed: false,
        isWarning: true,
        reason: `Session has ${day.exercises.length} exercises — too many for injury return programming. Keep sessions to 3–6 exercises max.`,
      };
    }

    const totalSets = day.exercises.reduce((sum, ex) => sum + (ex.sets ?? 3), 0);
    if (totalSets > 24) {
      return {
        passed: false,
        isWarning: true,
        reason: `Total session set count (${totalSets}) is high for injury return programming. Reduce to 10–18 sets per session.`,
      };
    }
  }

  // ── Warning: max-effort language ─────────────────────────────────────────
  if (/\b(1RM|max\s*(effort|out|rep)|all.?out|failure|to\s*failure|push\s*through\s*(the\s*)?(pain|discomfort))\b/i.test(lower)) {
    return {
      passed: false,
      isWarning: true,
      reason: "Max-effort or failure-based language detected in return-from-injury program. Use RPE-based prescriptions instead.",
    };
  }

  return {
    passed: true,
    isWarning: false,
    reason: "Return-from-injury validation passed",
  };
}
