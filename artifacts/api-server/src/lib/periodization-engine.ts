/**
 * TrainChat Advanced Progression & Block Periodization Engine
 *
 * Phase 4 Intelligence Upgrade — Real multi-week coaching architecture.
 *
 * Upgrades TrainChat from "strong weekly programming" to "real long-horizon
 * coaching": block periodization, progression models that change across time,
 * deload logic tied to block structure, training age modulation, and
 * advanced loading frameworks.
 *
 * The primary output is `buildPeriodizationContext()` — a detailed AI prompt
 * context block injected into the system prompt that gives the AI explicit
 * block-by-block instructions for multi-week program design.
 */

// ─── Training Level ───────────────────────────────────────────────────────────

export type TrainingLevel = "beginner" | "novice" | "intermediate" | "advanced";

export interface TrainingLevelProfile {
  level: TrainingLevel;
  yearsRange: string;
  description: string;
  progressionStyle: string;
  blockStructureRequired: boolean;
  deloadFrequency: string;
  volumeTolerance: string;
  intensityRange: string;
}

export const TRAINING_LEVEL_PROFILES: Record<TrainingLevel, TrainingLevelProfile> = {
  beginner: {
    level: "beginner",
    yearsRange: "0–12 months",
    description: "New to structured training. Responds to nearly any stimulus. Does not need complexity.",
    progressionStyle: "Linear — add weight every session or every week. Simple is best.",
    blockStructureRequired: false,
    deloadFrequency: "Every 8–12 weeks or when performance stagnates",
    volumeTolerance: "Low. 3–4 sets per primary pattern. More is NOT better.",
    intensityRange: "65–80% 1RM — learning technique is the priority",
  },
  novice: {
    level: "novice",
    yearsRange: "6–18 months",
    description: "Consistent training, good fundamentals. Starting to benefit from slightly more structure.",
    progressionStyle: "Linear to double progression — progress load week-to-week when reps are achieved.",
    blockStructureRequired: false,
    deloadFrequency: "Every 6–8 weeks",
    volumeTolerance: "Moderate. 3–5 sets per primary pattern.",
    intensityRange: "67–83% 1RM",
  },
  intermediate: {
    level: "intermediate",
    yearsRange: "1.5–5 years",
    description: "Cannot progress every session. Benefits significantly from structured variation and load management.",
    progressionStyle: "Double progression + volume progression. Can use wave loading. Benefits from block structure.",
    blockStructureRequired: true,
    deloadFrequency: "Every 4–6 weeks within block structure",
    volumeTolerance: "Moderate-High. 4–5 sets per primary pattern.",
    intensityRange: "70–88% 1RM with planned variation",
  },
  advanced: {
    level: "advanced",
    yearsRange: "4+ years",
    description: "Requires planned variation, block structure, and deliberate fatigue management to progress.",
    progressionStyle: "Block periodization, wave loading, exposure-based. Linear progression is ineffective.",
    blockStructureRequired: true,
    deloadFrequency: "Every 3–5 weeks within block structure. Deload is planned, not reactive.",
    volumeTolerance: "High but fatigue-sensitive. 4–6 sets. Junk volume is counterproductive.",
    intensityRange: "72–93%+ 1RM with planned periodization",
  },
};

// ─── Block Types ──────────────────────────────────────────────────────────────

export type BlockType = "re_entry" | "accumulation" | "intensification" | "realization" | "deload";

export interface BlockDefinition {
  type: BlockType;
  displayName: string;
  primaryObjective: string;
  durationWeeks: { min: number; max: number; typical: number };
  volumeGuidance: string;
  intensityGuidance: string;
  repRangeGuidance: string;
  restPeriods: string;
  exerciseStrategy: string;
  fatigueExpectation: string;
  progressionStyle: string;
  accessoryStrategy: string;
  deloadNotes?: string;
}

export const BLOCK_DEFINITIONS: Record<BlockType, BlockDefinition> = {
  re_entry: {
    type: "re_entry",
    displayName: "Re-Entry / Structural Rebuilding",
    primaryObjective: "Safe return to training after a long break — restore movement quality, rebuild tissue tolerance, establish pattern proficiency before any real loading",
    durationWeeks: { min: 2, max: 4, typical: 3 },
    volumeGuidance: "Very low — 2–3 sets per primary pattern. Volume increases weekly but starts conservative.",
    intensityGuidance: "50–65% 1RM. Technical proficiency is the only metric that matters.",
    repRangeGuidance: "10–15 reps — high rep, low load. Perfect for technique, joint prep, and tissue adaptation.",
    restPeriods: "90 sec–2 min. No metabolic stress — recovery quality.",
    exerciseStrategy: "Primary compound movements at reduced load. Focus on movement quality. Limit single-leg and rotational loading until baseline is re-established.",
    fatigueExpectation: "Minimal. You should finish sessions feeling capable of doing more.",
    progressionStyle: "Add 1 set per session or increase reps by 2-3 per week. Small steps only.",
    accessoryStrategy: "Minimal. 1–2 accessories per session. Focus on movement prep and tissue resilience.",
    deloadNotes: "This entire block IS the deload equivalent. No deload needed within re-entry.",
  },
  accumulation: {
    type: "accumulation",
    displayName: "Accumulation — Volume Base",
    primaryObjective: "Build work capacity, movement quality, hypertrophy base, and structural strength. High volume, moderate intensity. The foundation block.",
    durationWeeks: { min: 3, max: 5, typical: 4 },
    volumeGuidance: "High — 4–5 sets per primary pattern. Accessory volume is highest here. Total weekly volume is maximized.",
    intensityGuidance: "Moderate — 65–78% 1RM. You must be able to sustain this volume at this intensity across 3–5 weeks.",
    repRangeGuidance: "6–12 reps on primary lifts. 10–15 reps on accessories. Strength-hypertrophy range throughout.",
    restPeriods: "2–3 min between primary compound sets. 60–90 sec for accessories.",
    exerciseStrategy: "More exercise variety. Include support and accessory work that builds structural base. Multiple exercises per pattern are acceptable. Include variation lifts (deficit DL, pause squat, close-grip bench).",
    fatigueExpectation: "Cumulative fatigue builds across the block. Week 3–4 should feel demanding. This is expected and required.",
    progressionStyle: "Progressive overload via reps and sets first, then load. Double progression: when all reps hit, add load next session.",
    accessoryStrategy: "Full accessory menu. Include tissue resilience work, unilateral loading, and GPP support. This is where you build the capacity that later blocks express.",
  },
  intensification: {
    type: "intensification",
    displayName: "Intensification — Force Expression",
    primaryObjective: "Convert the volume base into force output. Lower volume, higher intensity. The program narrows toward primary lifts and stops building new capacity.",
    durationWeeks: { min: 2, max: 4, typical: 3 },
    volumeGuidance: "Moderate — 3–4 sets per primary pattern. Accessory volume reduced by 25–40%.",
    intensityGuidance: "High — 78–88% 1RM. Loads are demanding. Technical breakdown is a sign the load is too high.",
    repRangeGuidance: "3–6 reps on primary lifts. 6–10 reps on key accessories. Hypertrophy accessories reduced.",
    restPeriods: "3–5 min between primary compound sets. Full recovery between top-end sets.",
    exerciseStrategy: "Reduce exercise variety. Move toward primary competition/goal lifts. Eliminate variation lifts from accumulation that served as base work. Keep highest-transfer exercises only.",
    fatigueExpectation: "Lower than accumulation. Volume reduction should dissipate some fatigue. Freshness returns as intensity rises.",
    progressionStyle: "Wave loading: Week 1 moderate load → Week 2 higher → Week 3 highest → optional backoff. Or: prescribed percentage increases 2–3% per week.",
    accessoryStrategy: "Minimal. Only highest-transfer accessories survive into intensification. Drop what doesn't serve the primary lift.",
  },
  realization: {
    type: "realization",
    displayName: "Realization — Peak Expression",
    primaryObjective: "Express the quality built across prior blocks. Highest specificity, lowest fatigue. Volume is at its minimum. Intensity is at its maximum. The athlete should feel the best they have in the entire cycle.",
    durationWeeks: { min: 1, max: 2, typical: 1 },
    volumeGuidance: "Minimal — 2–3 sets per primary. This is NOT the time to build anything. You express, not accumulate.",
    intensityGuidance: "Highest — 88–95%+ 1RM. Top singles, doubles, or triples. Full warm-up sets only, no junk volume.",
    repRangeGuidance: "1–3 reps at top intensity. Support sets at 80–85% for quality maintenance. No high-rep work.",
    restPeriods: "5–8 min between top sets. Quality over efficiency.",
    exerciseStrategy: "Maximum specificity. Only the competition/target lifts and their closest accessories. All variation lifts removed. Session is simple, direct, powerful.",
    fatigueExpectation: "Minimal. The athlete should feel capable and sharp. If fatigue is high, the preceding deload was insufficient.",
    progressionStyle: "Exposure-based: prescribed attempt slots (opener, second attempt, third attempt). No guessing — planned loads.",
    accessoryStrategy: "None or minimal. A few key accessories for tissue maintenance only. The primary lift and its direct support. Nothing else.",
  },
  deload: {
    type: "deload",
    displayName: "Deload — Fatigue Dissipation",
    primaryObjective: "Dissipate accumulated fatigue to allow supercompensation. NOT a rest week — maintain movement quality and technical preparation at reduced stress.",
    durationWeeks: { min: 1, max: 1, typical: 1 },
    volumeGuidance: "40–60% reduction from the preceding training week's volume. Typically 2–3 sets per pattern.",
    intensityGuidance: "60–70% 1RM. Keep movement patterns alive but remove mechanical stress.",
    repRangeGuidance: "5–8 reps at reduced load. Technically perfect. No grinding.",
    restPeriods: "2 min. Full recovery between sets.",
    exerciseStrategy: "Same primary lifts as the preceding block — maintain motor patterns. No new exercises. No challenges to novelty. Predictability is the point.",
    fatigueExpectation: "Minimal. Session 1 should feel surprisingly easy. Session 3 should feel like the athlete is 'waking up'.",
    progressionStyle: "No progression — this is recovery, not training. Hold weights constant or reduce by 10%.",
    accessoryStrategy: "Minimal. 1–2 key accessory exercises per session for structural maintenance. No new stimulus.",
    deloadNotes: "Deload method varies by athlete: VOLUME deload (reduce sets) or INTENSITY deload (reduce weight) or BOTH. Most athletes benefit from volume deload first — keep intensity moderate to prevent detraining.",
  },
};

// ─── Goal Block Structures ────────────────────────────────────────────────────

export type GoalKey =
  | "strength"
  | "hypertrophy"
  | "power"
  | "speed"
  | "conditioning"
  | "athletic_performance"
  | "fat_loss"
  | "return_to_training";

interface BlockSequenceEntry {
  blockType: BlockType;
  weeks: number;
  emphasis?: string;
}

interface GoalBlockStructure {
  goal: GoalKey;
  description: string;
  beginnerStructure: BlockSequenceEntry[];
  intermediateStructure: BlockSequenceEntry[];
  advancedStructure: BlockSequenceEntry[];
  peakingNotes: string;
  goalDistinction: string;
}

export const GOAL_BLOCK_STRUCTURES: Record<GoalKey, GoalBlockStructure> = {
  strength: {
    goal: "strength",
    description: "Max strength — squat, bench, deadlift, overhead. Defined by force output at high percentage of max.",
    peakingNotes: "Strength peaking is real and should be respected. Accumulation builds the base; intensification raises force output; realization tests/demonstrates the peak.",
    goalDistinction: "Strength is NOT hypertrophy — heavy low-rep sets are the primary tool. Volume cycling is used to manage fatigue, not for muscle growth.",
    beginnerStructure: [
      { blockType: "accumulation", weeks: 4, emphasis: "Linear load progression on squat, deadlift, bench, and row. Technical quality over intensity." },
      { blockType: "deload", weeks: 1, emphasis: "Full deload after first training cycle." },
    ],
    intermediateStructure: [
      { blockType: "accumulation", weeks: 4, emphasis: "4×6-8 primary lifts at 70-78%. Volume base for intensification." },
      { blockType: "intensification", weeks: 3, emphasis: "4×3-5 at 80-87%. Load increases weekly. Reduce accessory volume." },
      { blockType: "deload", weeks: 1, emphasis: "Volume deload — same movements, 60% intensity, 3 sets only." },
    ],
    advancedStructure: [
      { blockType: "accumulation", weeks: 4, emphasis: "4-5×5-8 at 68-77%. Variation lifts (pause squat, deficit DL, close-grip bench). Build capacity and movement quality." },
      { blockType: "intensification", weeks: 3, emphasis: "4×3-5 at 79-88%. Wave loading. Eliminate variation lifts. Primary competition movements only." },
      { blockType: "realization", weeks: 1, emphasis: "2-3×1-3 at 88-95%+. Attempt-based loading. Express strength." },
      { blockType: "deload", weeks: 1, emphasis: "40% volume reduction. 65-70% intensity. Recovery and supercompensation." },
    ],
  },

  hypertrophy: {
    goal: "hypertrophy",
    description: "Muscle growth — primary driver is volume in appropriate rep ranges (6–15) with progressive overload.",
    peakingNotes: "Hypertrophy does NOT peak like powerlifting. No realization block needed — the goal is sustained volume accumulation with progressive overload over months.",
    goalDistinction: "Hypertrophy is NOT strength — rep ranges are higher (6–15), volume is the primary overload variable, accessory work is legitimate and valued (not just noise).",
    beginnerStructure: [
      { blockType: "accumulation", weeks: 6, emphasis: "3×10-12 primary. Progressive overload: add reps first, then load. Simple linear." },
      { blockType: "deload", weeks: 1, emphasis: "Recovery week at 50% volume." },
    ],
    intermediateStructure: [
      { blockType: "accumulation", weeks: 5, emphasis: "4×8-12 primary. High accessory volume. Double progression — hit all reps, add weight." },
      { blockType: "accumulation", weeks: 4, emphasis: "4-5×6-10 primary. Increase load 2.5-5% weekly. Introduce volume progression (add sets)." },
      { blockType: "deload", weeks: 1, emphasis: "50% volume reduction. Maintain all movement patterns." },
    ],
    advancedStructure: [
      { blockType: "accumulation", weeks: 4, emphasis: "4×10-15 moderate intensity. High accessory volume. Build volume tolerance and GPP." },
      { blockType: "accumulation", weeks: 4, emphasis: "4-5×6-10 at moderate-high intensity. Increase both volume and load. Peak volume phase." },
      { blockType: "intensification", weeks: 3, emphasis: "4-5×4-8 at higher intensity. Reduce accessory volume. Strength stimulus maintains hypertrophy and adds density." },
      { blockType: "deload", weeks: 1, emphasis: "50% volume reduction. Movement quality maintenance." },
    ],
  },

  power: {
    goal: "power",
    description: "Rate of force development, speed-strength, explosive output — jumps, throws, sprints, Olympic derivatives.",
    peakingNotes: "Power peaking is about freshness and neural readiness — volume reduction is more important than intensity manipulation. A fatigued athlete cannot express power.",
    goalDistinction: "Power is NOT strength — the goal is rate of force development, not maximal force. Heavy loading is a TOOL for power development (contrast training) not the end goal. Plyometrics and sprints are primary.",
    beginnerStructure: [
      { blockType: "accumulation", weeks: 4, emphasis: "Strength base + basic plyometrics. Box jumps, broad jumps, med ball work. 3×6 primary lifts at 70%. Learn movement quality first." },
      { blockType: "deload", weeks: 1, emphasis: "Recovery week." },
    ],
    intermediateStructure: [
      { blockType: "accumulation", weeks: 3, emphasis: "Broader power base — jumps, bounds, med ball, Olympic derivatives. 4×5 strength at 72-78%. High variety." },
      { blockType: "intensification", weeks: 3, emphasis: "Contrast pairs (heavy squat → box jump). Reduce variety. Higher intensity strength sets (4×3 at 82-88%). PAP-focused." },
      { blockType: "deload", weeks: 1, emphasis: "Volume deload — halve jump and sprint volume. Maintain primary lifts at low sets." },
    ],
    advancedStructure: [
      { blockType: "accumulation", weeks: 3, emphasis: "Broad power base. Med ball rotational + overhead, broad/lateral/box jumps, short sprints. 4-5×4-5 strength at 70-78%. Full arsenal." },
      { blockType: "intensification", weeks: 3, emphasis: "Contrast training priority. Heavier loading (4×2-3 at 82-90%) paired with plyometrics. Sprint quality raised. Reduce variety." },
      { blockType: "realization", weeks: 1, emphasis: "Maximum power expression. Reduce volume 50%. Highest-quality sprints, jumps, contrast pairs. Full rest between efforts." },
      { blockType: "deload", weeks: 1, emphasis: "Neural recovery — halve all plyometric and sprint volume. Submaximal strength only." },
    ],
  },

  speed: {
    goal: "speed",
    description: "Sprint quality — acceleration, max velocity, change of direction. Gym work is in SERVICE of sprint mechanics.",
    peakingNotes: "Speed does NOT peak in the gym. Sprint sessions are the primary training stimulus. Gym work reduces in volume as sprint quality approaches its peak.",
    goalDistinction: "Speed is NOT conditioning — low volume, high quality, full recovery between efforts. Sprint sessions are quality work, not volume work.",
    beginnerStructure: [
      { blockType: "accumulation", weeks: 4, emphasis: "Acceleration mechanics (0-20m). Strength base for force application (trap bar DL, squat). 3×6 at 70%. Sprint form coaching." },
      { blockType: "deload", weeks: 1, emphasis: "Recovery week." },
    ],
    intermediateStructure: [
      { blockType: "accumulation", weeks: 3, emphasis: "Acceleration block (0-20m). Strength base at 72-78%. Sprint volume build." },
      { blockType: "intensification", weeks: 3, emphasis: "Max velocity introduction (fly sprints, 30-60m). Strength shifts to speed-strength emphasis. Reduce volume." },
      { blockType: "deload", weeks: 1, emphasis: "Sprint quality only — 2 sessions. No new sprint distance. Full rest between reps." },
    ],
    advancedStructure: [
      { blockType: "accumulation", weeks: 3, emphasis: "Acceleration block — drive phase mechanics (10-30m). Force-velocity training at strength end. Higher sprint volume." },
      { blockType: "intensification", weeks: 3, emphasis: "Max velocity (fly 30m+). Speed-strength (trap bar jump, power clean). Reduce sprint volume, raise quality." },
      { blockType: "realization", weeks: 1, emphasis: "Competition prep — timed trials, race-specific efforts. Minimal gym load. All for the track." },
      { blockType: "deload", weeks: 1, emphasis: "Active recovery sprint work only (50% volume). No max effort running." },
    ],
  },

  conditioning: {
    goal: "conditioning",
    description: "Energy system development — aerobic base, lactate threshold, repeat sprint ability. Work capacity across time.",
    peakingNotes: "Conditioning peaks through progressive overload of energy systems — not strength peaking. More volume, higher intensity, then sport-specific expression.",
    goalDistinction: "Conditioning is NOT cardio — it requires energy system progression (aerobic base → lactate threshold → VO2max → RSA). Circuits are NOT conditioning.",
    beginnerStructure: [
      { blockType: "accumulation", weeks: 4, emphasis: "Aerobic base — sustained moderate-intensity work. 20-30 min steady state, 3×/week. Heart rate below threshold." },
      { blockType: "deload", weeks: 1, emphasis: "50% volume reduction." },
    ],
    intermediateStructure: [
      { blockType: "accumulation", weeks: 4, emphasis: "Aerobic base and work capacity. Steady-state at 65-75% HR. Increase duration weekly." },
      { blockType: "intensification", weeks: 3, emphasis: "Lactate threshold intervals — 4-6 × 5 min at 85-90% HR with 3 min rest. Reduce total volume." },
      { blockType: "deload", weeks: 1, emphasis: "Aerobic maintenance only. No high-intensity work." },
    ],
    advancedStructure: [
      { blockType: "accumulation", weeks: 3, emphasis: "Aerobic base — 25-35 min sustained at 65-72% HR max. Build cardiac output and fat oxidation capacity." },
      { blockType: "intensification", weeks: 3, emphasis: "Lactate threshold + VO2max intervals — 3-5 min work at 88-95% HR with full recovery. Reduce aerobic volume." },
      { blockType: "realization", weeks: 2, emphasis: "Sport-specific expression — RSA, time-trial effort, competition-pace simulation. Minimal base volume." },
      { blockType: "deload", weeks: 1, emphasis: "Light aerobic flushing only. No high-intensity work." },
    ],
  },

  athletic_performance: {
    goal: "athletic_performance",
    description: "Multi-quality athletic development — strength, power, speed, and conditioning in proportion.",
    peakingNotes: "Athletic performance peaks are sport-season-specific. Off-season accumulation → pre-season intensification → in-season maintenance.",
    goalDistinction: "Athletic performance is NOT single-quality optimization — it balances strength, power, speed, and conditioning in proportion to the sport's demands.",
    beginnerStructure: [
      { blockType: "accumulation", weeks: 5, emphasis: "Strength base + basic power (jumps, med ball). Conditioning appropriate to sport. Learn patterns." },
      { blockType: "deload", weeks: 1, emphasis: "Recovery week." },
    ],
    intermediateStructure: [
      { blockType: "accumulation", weeks: 4, emphasis: "Strength and power base. Higher volume. All physical qualities trained." },
      { blockType: "intensification", weeks: 3, emphasis: "Sharpen — raise intensity on strength, raise quality on power/speed. Reduce volume." },
      { blockType: "deload", weeks: 1, emphasis: "Deload before in-season or peak competition period." },
    ],
    advancedStructure: [
      { blockType: "accumulation", weeks: 4, emphasis: "All quality base work — strength volume, broad power development, conditioning base. High variety and volume." },
      { blockType: "intensification", weeks: 3, emphasis: "Reduce volume, increase specificity. Contrast training. Sport-specific conditioning." },
      { blockType: "realization", weeks: 1, emphasis: "Express all qualities. Minimal gym load. Sport-specific emphasis." },
      { blockType: "deload", weeks: 1, emphasis: "Recovery." },
    ],
  },

  fat_loss: {
    goal: "fat_loss",
    description: "Body composition — muscle preservation with progressive work capacity. NOT a conditioning program.",
    peakingNotes: "Fat loss does NOT peak in the traditional sense — it is sustained over months. Block structure is used to prevent adaptation, not to peak performance.",
    goalDistinction: "Fat loss programs must maintain strength and muscle tissue — NOT replace strength work with circuits. Conditioning finishers are added, not substituted.",
    beginnerStructure: [
      { blockType: "accumulation", weeks: 5, emphasis: "Strength focus — preserve and build muscle. Add conditioning finishers (2-3×/week) after lifting. Linear progression." },
      { blockType: "deload", weeks: 1, emphasis: "50% volume reduction." },
    ],
    intermediateStructure: [
      { blockType: "accumulation", weeks: 4, emphasis: "Strength maintenance at moderate volume. Higher conditioning frequency (3-4×/week). Double progression." },
      { blockType: "intensification", weeks: 3, emphasis: "Maintain strength, increase conditioning intensity. Interval training replaces some steady-state." },
      { blockType: "deload", weeks: 1, emphasis: "Reduce all volume. Preserve movement patterns." },
    ],
    advancedStructure: [
      { blockType: "accumulation", weeks: 4, emphasis: "Strength foundation maintained. Conditioning volume built. Both develop in parallel." },
      { blockType: "intensification", weeks: 3, emphasis: "Strength maintained, conditioning switches to HIIT and interval-focus. Reduce lifting volume slightly." },
      { blockType: "deload", weeks: 1, emphasis: "Recovery week — body composition goals benefit from strategic recovery too." },
    ],
  },

  return_to_training: {
    goal: "return_to_training",
    description: "Return from extended break (4+ weeks off). Tissue, movement quality, and work capacity are the priorities — NOT performance.",
    peakingNotes: "There is no peaking in return-to-training. The goal is safe re-establishment of training readiness before any real accumulation begins.",
    goalDistinction: "Return to training is NOT a regular program — loading must be conservative, the early weeks are deliberately sub-maximal, and tissue tolerance is the limiting factor.",
    beginnerStructure: [
      { blockType: "re_entry", weeks: 3, emphasis: "Movement quality focus. 2-3 sets at 50-60% 1RM. Learn to train again." },
      { blockType: "accumulation", weeks: 4, emphasis: "Begin proper loading. Linear progression from a conservative baseline." },
      { blockType: "deload", weeks: 1, emphasis: "Recovery." },
    ],
    intermediateStructure: [
      { blockType: "re_entry", weeks: 2, emphasis: "Conservative reintroduction. 2-3 sets × 10-15 reps at 55-65%. Assess tolerance." },
      { blockType: "accumulation", weeks: 4, emphasis: "Gradual volume and load increase. 4×8-10 at 70-78%. Double progression from here." },
      { blockType: "deload", weeks: 1, emphasis: "Recovery." },
    ],
    advancedStructure: [
      { blockType: "re_entry", weeks: 2, emphasis: "Even advanced athletes need conservative re-entry after 4+ months off. 3 sets × 10-12 at 60-68%. Assess tissue tolerance." },
      { blockType: "accumulation", weeks: 4, emphasis: "Restore volume base. 4×6-10 at 70-78%. Double progression." },
      { blockType: "intensification", weeks: 3, emphasis: "Return to working intensities. 4×4-6 at 78-85%. Wave loading." },
      { blockType: "deload", weeks: 1, emphasis: "Recovery before full return to regular training cycle." },
    ],
  },
};

// ─── Progression Models ───────────────────────────────────────────────────────

export type ProgressionModel =
  | "linear"
  | "double_progression"
  | "wave_loading"
  | "undulating"
  | "block_periodized"
  | "density_progression"
  | "exposure_based"
  | "accumulation_volume";

export interface ProgressionModelDefinition {
  model: ProgressionModel;
  displayName: string;
  description: string;
  mechanicDescription: string;
  exampleWeeks: string;
  bestFor: string[];
  avoidFor: string[];
}

export const PROGRESSION_MODELS: Record<ProgressionModel, ProgressionModelDefinition> = {
  linear: {
    model: "linear",
    displayName: "Linear Progression",
    description: "Add a small fixed amount to the bar every session or every week. The simplest and most effective model for beginners.",
    mechanicDescription: "Week 1: 100kg × 5 → Week 2: 102.5kg × 5 → Week 3: 105kg × 5. Progress is made by adding weight on a fixed schedule.",
    exampleWeeks: "Week 1: 3×5 @ 80kg | Week 2: 3×5 @ 82.5kg | Week 3: 3×5 @ 85kg",
    bestFor: ["beginner", "novice", "re_entry block", "simple strength goals"],
    avoidFor: ["advanced athletes", "peaking", "power development"],
  },
  double_progression: {
    model: "double_progression",
    displayName: "Double Progression",
    description: "Progress reps first within a given rep range, then increase load and reset reps. Highly effective for intermediate athletes.",
    mechanicDescription: "Set a rep RANGE (e.g., 6–10). When you hit the top of the range for all sets, add load and drop reps. Repeat.",
    exampleWeeks: "Week 1: 4×7 @ 80kg | Week 2: 4×9 @ 80kg | Week 3: 4×10 @ 80kg → Week 4: 4×7 @ 82.5kg",
    bestFor: ["intermediate", "hypertrophy", "strength", "accumulation block"],
    avoidFor: ["beginners who overthink it", "realization blocks"],
  },
  wave_loading: {
    model: "wave_loading",
    displayName: "Wave Loading",
    description: "Volume and intensity alternate in planned waves — higher load weeks followed by a slight reduction, then exceed the previous peak. Creates planned variation while driving adaptation.",
    mechanicDescription: "3-week wave: Week 1 moderate → Week 2 higher → Week 3 highest → Week 4 reload and begin next wave heavier than Wave 1 started.",
    exampleWeeks: "Wave A: W1: 4×5 @ 80% → W2: 4×4 @ 83% → W3: 3×3 @ 87% → Wave B: W1: 4×5 @ 82% (higher than Wave A start)",
    bestFor: ["intermediate", "advanced", "strength", "intensification block"],
    avoidFor: ["beginners", "hypertrophy primary goals"],
  },
  undulating: {
    model: "undulating",
    displayName: "Undulating Periodization (DUP/WUP)",
    description: "Vary volume and intensity within the same week or across close sessions. Different sessions target different rep ranges and qualities.",
    mechanicDescription: "Each week has distinct session emphases: Session A = strength (4×4-5), Session B = hypertrophy (3×8-12), Session C = power/speed (4×2-3 explosive).",
    exampleWeeks: "Mon: 4×5 @ 83% (strength) | Wed: 3×10 @ 68% (hypertrophy) | Fri: 4×3 @ 75% (speed-strength)",
    bestFor: ["intermediate", "advanced", "athletic performance", "power"],
    avoidFor: ["beginners", "pure strength peaking phases"],
  },
  block_periodized: {
    model: "block_periodized",
    displayName: "Block Periodization",
    description: "Distinct training blocks each target a different quality (accumulation → intensification → realization → deload). Each block has a single dominant objective.",
    mechanicDescription: "Block 1 (weeks 1-4): volume base. Block 2 (weeks 5-7): intensity expression. Block 3 (week 8): peak output. Block 4 (week 9): deload.",
    exampleWeeks: "Wk 1-4: 4-5×6-8 @ 70-78% | Wk 5-7: 4×3-5 @ 80-88% | Wk 8: 2-3×1-2 @ 88-93%",
    bestFor: ["advanced", "strength", "power", "athletic performance", "multi-quality goals"],
    avoidFor: ["beginners", "short programs (under 8 weeks)"],
  },
  density_progression: {
    model: "density_progression",
    displayName: "Density Progression",
    description: "Perform more total work within the same time window. Progression is tracked by volume completed in a fixed time. Highly effective for conditioning and fat loss.",
    mechanicDescription: "Session A: Complete 100 total reps in 30 min. Session B: Complete 110 reps in 30 min. Load increases when density target is met consistently.",
    exampleWeeks: "Week 1: 100 total reps per session | Week 2: 110 reps | Week 3: 120 reps | Week 4: Add load, reset to 100",
    bestFor: ["conditioning", "fat_loss", "work capacity", "athletic performance"],
    avoidFor: ["strength peaking", "power development", "realization blocks"],
  },
  exposure_based: {
    model: "exposure_based",
    displayName: "Exposure-Based Progression",
    description: "Quality increases through planned exposures to target intensities. Used in power and speed development where adaptation is neurological, not structural.",
    mechanicDescription: "Plan the exposures: Week 1: 3 exposure sessions at 70% output. Week 2: 3 sessions at 80%. Week 3: 2 sessions at 90%. Progress is quality, not quantity.",
    exampleWeeks: "W1: 4×4 box jump (sub-max) | W2: 4×4 box jump (higher box, max intent) | W3: 3×3 depth jump (full reactive quality)",
    bestFor: ["power", "speed", "plyometrics", "sprint development", "realization block"],
    avoidFor: ["hypertrophy", "beginners", "conditioning"],
  },
  accumulation_volume: {
    model: "accumulation_volume",
    displayName: "Volume Accumulation Progression",
    description: "Sets increase progressively across weeks at similar relative intensity. Then volume drops and intensity rises in the next block. Classic hypertrophy overload.",
    mechanicDescription: "Week 1: 3×10. Week 2: 4×10. Week 3: 5×10 (same weight). Week 4: Deload. Next block: 4×8 heavier weight.",
    exampleWeeks: "W1: 3×10 @ 70kg | W2: 4×10 @ 70kg | W3: 5×10 @ 70kg | Deload → W5: 4×8 @ 75kg",
    bestFor: ["hypertrophy", "intermediate", "accumulation block"],
    avoidFor: ["strength peaking", "power", "advanced athletes in intensification"],
  },
};

// ─── Training Level Detection ─────────────────────────────────────────────────

export function detectTrainingLevel(
  experienceLevel: string,
  request: string,
): TrainingLevel {
  const combined = (experienceLevel + " " + request).toLowerCase();

  // Explicit markers
  if (/\b(advanced|elite|competitive|8\+?\s*years?|10\s*years?|decade|national|professional|lifter\s*for)\b/.test(combined)) return "advanced";
  if (/\b(6|7|8|9|10)\s*years?\s*(of\s*)?(training|lifting|lifting|experience)\b/.test(combined)) return "advanced";
  if (/\b(4|5)\s*years?\s*(of\s*)?(training|lifting|experience)\b/.test(combined)) return "intermediate";
  if (/\b(intermediate|3\s*years?|2\s*years?|1\.5\s*years?|somewhat\s*experienced)\b/.test(combined)) return "intermediate";
  if (/\b(novice|beginner|new|newbie|just\s*start|first\s*time|6\s*months?|starting\s*out)\b/.test(combined)) return "beginner";

  // Goal-based markers that imply training age
  if (/\b(structured\s*blocks|block\s*perio|peaking|wave\s*load|periodized|periodization)\b/.test(combined)) return "advanced";
  if (/\b(peak\s*block|competition|meet|race)\b/.test(combined)) return "advanced";
  if (/\b(seriously|years|long.term)\b.*\b(training|lifting|training)\b/.test(combined)) return "intermediate";

  // Experience level string mapping
  if (/advanced/.test(experienceLevel.toLowerCase())) return "advanced";
  if (/intermediate/.test(experienceLevel.toLowerCase())) return "intermediate";
  if (/beginner|novice/.test(experienceLevel.toLowerCase())) return "beginner";

  return "intermediate"; // default for unknown
}

// ─── Program Duration Detection ───────────────────────────────────────────────

export interface ProgramDuration {
  weeks: number | null;
  durationLabel: string;
  hasExplicitDuration: boolean;
}

export function detectProgramDuration(request: string): ProgramDuration {
  const r = request.toLowerCase();

  // Explicit week counts
  const match = r.match(/\b(\d+)[- ]?week/);
  if (match) {
    const weeks = parseInt(match[1]);
    return { weeks, durationLabel: `${weeks}-week program`, hasExplicitDuration: true };
  }

  // Month-based
  const monthMatch = r.match(/\b(\d+)[- ]?month/);
  if (monthMatch) {
    const weeks = parseInt(monthMatch[1]) * 4;
    return { weeks, durationLabel: `${monthMatch[1]}-month (${weeks} weeks)`, hasExplicitDuration: true };
  }

  // Keyword-based duration hints
  if (/\b(quick|short|brief)\b/.test(r)) return { weeks: 4, durationLabel: "short-term (4 weeks)", hasExplicitDuration: false };
  if (/\b(long.term|extended|full\s+cycle)\b/.test(r)) return { weeks: 12, durationLabel: "long-term (12 weeks)", hasExplicitDuration: false };
  if (/\b(block|periodized|structured)\b/.test(r)) return { weeks: 9, durationLabel: "structured block cycle (9 weeks)", hasExplicitDuration: false };

  return { weeks: null, durationLabel: "program (duration not specified)", hasExplicitDuration: false };
}

// ─── Goal Normalization ───────────────────────────────────────────────────────

export function detectGoalKey(trainingGoal: string): GoalKey {
  const g = trainingGoal.toLowerCase();
  if (/strength|squat|bench|deadlift|1rm|lift/.test(g)) return "strength";
  if (/hypertrophy|muscle|size|mass|bulk/.test(g)) return "hypertrophy";
  if (/power|explosive|jump|plyometric/.test(g)) return "power";
  if (/speed|sprint|acceleration|velocity/.test(g)) return "speed";
  if (/conditioning|endurance|cardio|aerobic|work\s*capacity/.test(g)) return "conditioning";
  if (/fat.loss|weight.loss|cut|lean|body.comp/.test(g)) return "fat_loss";
  if (/return|coming\s*back|starting\s*over|took.*off|break|haven.t\s*trained|haven't\s*trained/.test(g)) return "return_to_training";
  if (/athletic|performance|sport/.test(g)) return "athletic_performance";
  return "athletic_performance"; // default
}

// ─── Progression Model Selection ─────────────────────────────────────────────

export function selectProgressionModel(
  goalKey: GoalKey,
  trainingLevel: TrainingLevel,
  blockType: BlockType,
): ProgressionModel {
  if (blockType === "re_entry") return "linear";
  if (blockType === "realization") return "exposure_based";
  if (blockType === "deload") return "linear";

  if (trainingLevel === "beginner" || trainingLevel === "novice") {
    if (goalKey === "hypertrophy") return "double_progression";
    return "linear";
  }

  if (trainingLevel === "intermediate") {
    if (goalKey === "strength") return blockType === "intensification" ? "wave_loading" : "double_progression";
    if (goalKey === "hypertrophy") return blockType === "intensification" ? "double_progression" : "accumulation_volume";
    if (goalKey === "power") return blockType === "intensification" ? "undulating" : "double_progression";
    if (goalKey === "conditioning") return "density_progression";
    if (goalKey === "fat_loss") return "density_progression";
    return "double_progression";
  }

  // Advanced
  if (goalKey === "strength") return blockType === "intensification" ? "wave_loading" : "block_periodized";
  if (goalKey === "hypertrophy") return blockType === "intensification" ? "double_progression" : "accumulation_volume";
  if (goalKey === "power") return blockType === "intensification" ? "undulating" : "block_periodized";
  if (goalKey === "speed") return "exposure_based";
  if (goalKey === "conditioning") return "density_progression";
  if (goalKey === "athletic_performance") return "block_periodized";
  return "block_periodized";
}

// ─── Block Architecture Builder ───────────────────────────────────────────────

export interface WeeklyBlock {
  blockType: BlockType;
  blockName: string;
  weekStart: number;
  weekEnd: number;
  weeks: number;
  objective: string;
  volumeTarget: string;
  intensityTarget: string;
  repRange: string;
  progressionModel: ProgressionModel;
  exerciseStrategy: string;
  accessoryStrategy: string;
  keyDistinctions: string;
  coachNote: string;
}

export interface BlockArchitecture {
  totalWeeks: number;
  durationLabel: string;
  trainingLevel: TrainingLevel;
  goalKey: GoalKey;
  blocks: WeeklyBlock[];
  periodizationSummary: string;
  progressionNarrative: string;
}

export function buildBlockArchitecture(
  goalKey: GoalKey,
  trainingLevel: TrainingLevel,
  totalWeeks: number | null,
  sport: string | null,
): BlockArchitecture {
  const structure = GOAL_BLOCK_STRUCTURES[goalKey];

  let blockSequence: BlockSequenceEntry[];
  if (trainingLevel === "beginner" || trainingLevel === "novice") {
    blockSequence = structure.beginnerStructure;
  } else if (trainingLevel === "intermediate") {
    blockSequence = structure.intermediateStructure;
  } else {
    blockSequence = structure.advancedStructure;
  }

  // Fit blocks to requested duration if specified
  if (totalWeeks && totalWeeks > 0) {
    blockSequence = fitBlocksToWeeks(blockSequence, totalWeeks, trainingLevel);
  }

  // Build detailed weekly blocks
  let currentWeek = 1;
  const blocks: WeeklyBlock[] = blockSequence.map((entry) => {
    const def = BLOCK_DEFINITIONS[entry.blockType];
    const progressionModel = selectProgressionModel(goalKey, trainingLevel, entry.blockType);
    const progModelDef = PROGRESSION_MODELS[progressionModel];

    const block: WeeklyBlock = {
      blockType: entry.blockType,
      blockName: def.displayName,
      weekStart: currentWeek,
      weekEnd: currentWeek + entry.weeks - 1,
      weeks: entry.weeks,
      objective: def.primaryObjective,
      volumeTarget: def.volumeGuidance,
      intensityTarget: def.intensityGuidance,
      repRange: def.repRangeGuidance,
      progressionModel,
      exerciseStrategy: entry.emphasis ?? def.exerciseStrategy,
      accessoryStrategy: def.accessoryStrategy,
      keyDistinctions: getBlockKeyDistinctions(entry.blockType, goalKey, trainingLevel),
      coachNote: buildBlockCoachNote(entry.blockType, goalKey, trainingLevel, currentWeek, currentWeek + entry.weeks - 1, progModelDef),
    };

    currentWeek += entry.weeks;
    return block;
  });

  const computedTotalWeeks = blocks.reduce((sum, b) => sum + b.weeks, 0);

  return {
    totalWeeks: computedTotalWeeks,
    durationLabel: `${computedTotalWeeks}-week ${structure.description.split("—")[0].trim()} program`,
    trainingLevel,
    goalKey,
    blocks,
    periodizationSummary: buildPeriodizationSummary(blocks, goalKey, trainingLevel, sport),
    progressionNarrative: buildProgressionNarrative(blocks, goalKey, trainingLevel),
  };
}

// ─── Internal helpers ─────────────────────────────────────────────────────────

function fitBlocksToWeeks(
  blocks: BlockSequenceEntry[],
  targetWeeks: number,
  level: TrainingLevel,
): BlockSequenceEntry[] {
  const currentTotal = blocks.reduce((sum, b) => sum + b.weeks, 0);

  if (currentTotal === targetWeeks) return blocks;

  // Scale the accumulation block(s) up/down first
  const result = [...blocks];
  const diff = targetWeeks - currentTotal;

  // Find accumulation blocks to scale
  const accIdx = result.findIndex((b) => b.blockType === "accumulation");
  if (accIdx !== -1) {
    const current = result[accIdx].weeks;
    const adjusted = Math.max(2, Math.min(8, current + diff));
    result[accIdx] = { ...result[accIdx], weeks: adjusted };
  }

  // If still off, add another accumulation block (for long programs)
  const newTotal = result.reduce((sum, b) => sum + b.weeks, 0);
  const remaining = targetWeeks - newTotal;

  if (remaining > 0 && remaining >= 2) {
    // Insert a second accumulation block before intensification
    const intIdx = result.findIndex((b) => b.blockType === "intensification");
    if (intIdx !== -1 && remaining >= 3) {
      result.splice(intIdx, 0, {
        blockType: "accumulation",
        weeks: remaining,
        emphasis: "Second accumulation phase — increase volume and introduce more variation. Progressive overload from Block 1.",
      });
    } else {
      // Add to last accumulation
      const lastAccIdx = result.map((b) => b.blockType).lastIndexOf("accumulation");
      if (lastAccIdx !== -1) {
        result[lastAccIdx] = { ...result[lastAccIdx], weeks: result[lastAccIdx].weeks + remaining };
      }
    }
  }

  return result;
}

function getBlockKeyDistinctions(
  blockType: BlockType,
  goalKey: GoalKey,
  level: TrainingLevel,
): string {
  const distinctions: string[] = [];

  if (blockType === "accumulation") {
    distinctions.push("Higher volume than other blocks", "More exercise variety", "Moderate intensity", "Double progression or volume progression");
    if (goalKey === "hypertrophy") distinctions.push("Accessories are valued — not noise", "Rep range: 6-15 for primary and accessory");
    if (goalKey === "strength") distinctions.push("Variation lifts acceptable (pause squat, deficit DL, close-grip bench)", "Work capacity for intensification");
  }

  if (blockType === "intensification") {
    distinctions.push("Reduced volume vs accumulation", "Higher intensity", "More specific primary lifts", "Eliminate variation lifts from accumulation");
    if (level === "advanced") distinctions.push("Wave loading: planned load increases each week of the block", "Accessory volume cut 30-40%");
  }

  if (blockType === "realization") {
    distinctions.push("Minimum volume — 2-3 sets only", "Maximum intensity (88-95%+)", "Only primary competition lifts", "No accessory work except tissue maintenance", "Feel SHARP, not fatigued");
  }

  if (blockType === "deload") {
    distinctions.push("40-50% volume reduction", "60-70% intensity", "Same exercises as preceding block", "NO new stimulus", "This is supercompensation, not weakness");
  }

  if (blockType === "re_entry") {
    distinctions.push("All reps should be technically perfect", "Load should feel light", "Focus: movement quality and tissue adaptation", "No grinding, no failure");
  }

  return distinctions.join(" | ");
}

function buildBlockCoachNote(
  blockType: BlockType,
  goalKey: GoalKey,
  level: TrainingLevel,
  weekStart: number,
  weekEnd: number,
  progModel: ProgressionModelDefinition,
): string {
  const weekRange = weekStart === weekEnd ? `Week ${weekStart}` : `Weeks ${weekStart}–${weekEnd}`;

  const notes: Record<BlockType, string> = {
    accumulation: `${weekRange}: This block builds the foundation. Volume is highest here. The athlete will feel fatigue accumulate by Week ${weekEnd - 1 > weekStart ? weekEnd - 1 : weekEnd}. That's expected — it's why the next block exists. Progression via ${progModel.displayName}: ${progModel.mechanicDescription}`,
    intensification: `${weekRange}: This block converts the volume base into force output. Reduce accessories. The athlete should feel STRONGER than in accumulation by Week ${weekEnd}. If they feel worse, check recovery and volume distribution. Progression via ${progModel.displayName}: ${progModel.mechanicDescription}`,
    realization: `${weekRange}: This is expression week. The athlete should feel capable of high output. Sessions are short, specific, and powerful. No new stimulus. Trust the process and the preceding blocks.`,
    deload: `${weekRange}: Recovery is MANDATORY. Do not skip this or replace it with "light training." 40-50% volume reduction at 65-70% intensity. Same movements, much less work. The athlete will feel strong afterward — that's the supercompensation window.`,
    re_entry: `${weekRange}: Conservative return. Nothing should feel hard. If sessions feel easy, that is CORRECT. Tissue and joint preparation takes weeks regardless of the athlete's prior fitness level.`,
  };

  return notes[blockType];
}

function buildPeriodizationSummary(
  blocks: WeeklyBlock[],
  goalKey: GoalKey,
  level: TrainingLevel,
  sport: string | null,
): string {
  const levelProfile = TRAINING_LEVEL_PROFILES[level];
  const goalStructure = GOAL_BLOCK_STRUCTURES[goalKey];
  const totalWeeks = blocks.reduce((sum, b) => sum + b.weeks, 0);

  const blockSummaryLines = blocks.map((b) =>
    `  ${b.blockType === "deload" ? "🔽" : b.blockType === "re_entry" ? "🔄" : b.blockType === "realization" ? "⚡" : b.blockType === "intensification" ? "⬆️" : "📈"} ` +
    `Weeks ${b.weekStart}–${b.weekEnd}: ${b.blockName} (${b.weeks} wk) → ${b.objective.split(".")[0]}`
  ).join("\n");

  const sportNote = sport ? `\nSport context (${sport}): Season timing should inform block placement — off-season = full accumulation → intensification; in-season = maintenance only.` : "";

  return `${totalWeeks}-week ${goalStructure.goal} program for a ${level} athlete.
${goalStructure.goalDistinction}
Training level context: ${levelProfile.description}
${levelProfile.blockStructureRequired ? "Block structure IS required at this level." : "Block structure optional — simple progression may suffice."}

BLOCK OVERVIEW:
${blockSummaryLines}
${sportNote}`;
}

function buildProgressionNarrative(
  blocks: WeeklyBlock[],
  goalKey: GoalKey,
  level: TrainingLevel,
): string {
  if (level === "beginner" || level === "novice") {
    return `Because this athlete is at ${level} level, progression is linear and simple. Complex block structures are unnecessary and counterproductive. Add weight each week when reps are completed. Consistency and technical quality drive progress more than sophisticated programming at this stage.`;
  }

  const blockDescriptions = blocks.map((b) => {
    const range = b.weekStart === b.weekEnd ? `Week ${b.weekStart}` : `Weeks ${b.weekStart}–${b.weekEnd}`;
    return `${range} (${b.blockName}): ${b.exerciseStrategy.split(". ")[0]}. ${b.coachNote.split(".")[0]}.`;
  }).join(" Then: ");

  return `This program uses block periodization because the athlete is ${level} — linear weekly progression would be ineffective. ${blockDescriptions}.`;
}

// ─── Main Context Builder (AI Prompt Injection) ───────────────────────────────

export function buildPeriodizationContext(
  trainingGoal: string,
  experienceLevel: string,
  request: string,
  sport: string | null,
  daysPerWeek: number,
): string {
  const trainingLevel = detectTrainingLevel(experienceLevel, request);
  const durationResult = detectProgramDuration(request);
  const goalKey = detectGoalKey(trainingGoal);
  const levelProfile = TRAINING_LEVEL_PROFILES[trainingLevel];
  const goalStructure = GOAL_BLOCK_STRUCTURES[goalKey];

  // Only build full block architecture if duration is specified OR user is intermediate/advanced requesting blocks
  const requestsBlockStructure =
    durationResult.hasExplicitDuration ||
    /\b(block|periodized|periodization|structured|peak|wave|8[- ]?week|12[- ]?week|advance|long.term)\b/i.test(request) ||
    trainingLevel === "advanced" ||
    trainingLevel === "intermediate";

  const architecture = requestsBlockStructure
    ? buildBlockArchitecture(goalKey, trainingLevel, durationResult.weeks, sport)
    : null;

  const progModel = architecture
    ? selectProgressionModel(goalKey, trainingLevel, architecture.blocks[0]?.blockType ?? "accumulation")
    : (trainingLevel === "beginner" ? selectProgressionModel(goalKey, "beginner", "accumulation") : selectProgressionModel(goalKey, trainingLevel, "accumulation"));
  const progDef = PROGRESSION_MODELS[progModel];

  if (!architecture) {
    // Simple context for beginners or unspecified duration
    return buildSimpleProgressionContext(goalKey, trainingLevel, levelProfile, progDef, daysPerWeek);
  }

  // Full block periodization context
  const blockDetails = architecture.blocks.map((b, idx) => {
    const progModelDef = PROGRESSION_MODELS[b.progressionModel];
    return `
### BLOCK ${idx + 1}: ${b.blockName.toUpperCase()} — Weeks ${b.weekStart}–${b.weekEnd} (${b.weeks} weeks)
Primary Objective: ${b.objective}
Volume Target: ${b.volumeTarget}
Intensity Target: ${b.intensityTarget}
Rep Range: ${b.repRange}
Rest Periods: ${BLOCK_DEFINITIONS[b.blockType].restPeriods}
Progression Model: ${progModelDef.displayName} — ${progModelDef.mechanicDescription}
Exercise Strategy: ${b.exerciseStrategy}
Accessory Strategy: ${b.accessoryStrategy}
Key Distinctions for This Block: ${b.keyDistinctions}
Coach Note: ${b.coachNote}`;
  }).join("\n");

  const deloadBlock = architecture.blocks.find((b) => b.blockType === "deload");
  const deloadNote = deloadBlock
    ? `\nDELOAD CONTEXT: ${BLOCK_DEFINITIONS.deload.deloadNotes}`
    : "";

  return `
## ADVANCED PERIODIZATION ARCHITECTURE — MANDATORY

This program requires BLOCK PERIODIZATION. A single repeating week is NOT acceptable.
The AI must generate a multi-week plan with DISTINCT phases that change structure meaningfully.

### PROGRAM OVERVIEW
${architecture.periodizationSummary}

### WHY THIS LEVEL REQUIRES BLOCK STRUCTURE
${levelProfile.description}
Progression style at this level: ${levelProfile.progressionStyle}
Deload frequency: ${levelProfile.deloadFrequency}
Volume tolerance: ${levelProfile.volumeTolerance}
Working intensity range: ${levelProfile.intensityRange}

### GOAL-SPECIFIC ARCHITECTURE RULES
${goalStructure.goalDistinction}
Peaking notes: ${goalStructure.peakingNotes}

### BLOCK-BY-BLOCK ARCHITECTURE (MANDATORY STRUCTURE)
The program MUST follow this block sequence. Each block has distinct objectives and rules.
${blockDetails}
${deloadNote}

### PROGRESSION NARRATIVE (Use This Language With the User)
${architecture.progressionNarrative}

### MULTI-WEEK LANGUAGE REQUIREMENT
When presenting this program, the coach MUST describe the multi-week structure explicitly:
- Name each block and its week range: "Weeks 1–4: Accumulation — building your volume base..."
- Explain what changes from block to block: "In Weeks 5–7, volume drops and intensity rises..."
- Explain the deload rationale: "Week 8 is a planned deload — this is where adaptation happens, not during the hard weeks."
- Reference the athlete's training level: "Because you're ${trainingLevel}, I structured this with ${architecture.blocks.length > 2 ? "block periodization" : "progressive loading"} rather than simple linear progression."

### ANTI-PATTERNS TO AVOID (MANDATORY)
- Do NOT output "add 5lbs each week" as the progression model for an ${trainingLevel} athlete — this is beginner programming
- Do NOT repeat the same sets × reps across all ${architecture.totalWeeks} weeks
- Do NOT keep the same exercise menu throughout all blocks — exercise specificity must shift
- Do NOT ignore the deload — it is NOT optional and is NOT "just going lighter"
- Do NOT present Week 1 as identical to Week ${architecture.totalWeeks} in volume or intensity
- Do NOT use realization-block logic for a hypertrophy goal — no peaking for muscle building
${trainingLevel === "advanced" ? "- Do NOT give an advanced athlete beginner linear progression — this is explicitly wrong\n- Do NOT use the same weekly template for 8+ weeks" : ""}

### PROGRAM STRUCTURE FORMAT REQUIREMENT
When outputting this program, present the multi-week overview as part of the response text (NOT just the first week):
- Brief program overview with block names and week ranges
- What each block is designed to accomplish
- The progression model being used
- What the athlete will feel/experience across the program
`.trim();
}

function buildSimpleProgressionContext(
  goalKey: GoalKey,
  level: TrainingLevel,
  levelProfile: TrainingLevelProfile,
  progDef: ProgressionModelDefinition,
  daysPerWeek: number,
): string {
  const goalStructure = GOAL_BLOCK_STRUCTURES[goalKey];

  const progressionInstructions = (() => {
    if (level === "beginner" || level === "novice") {
      return `For this ${level} athlete, use LINEAR PROGRESSION:
- Add weight every session (beginner) or every week (novice) when all reps are completed
- Do NOT use complex block periodization — it creates unnecessary cognitive load for beginners
- 3–4 sets per primary lift, 10-15 reps initially, progress to 5-8 reps as load increases
- Technique comes before load — never sacrifice form to add weight
- A deload is only needed if stagnation occurs (3 consecutive failures to progress)`;
    }

    return `For this ${level} athlete, use ${progDef.displayName}:
${progDef.mechanicDescription}
Example progression: ${progDef.exampleWeeks}
${progDef.description}`;
  })();

  return `
## PROGRESSION ARCHITECTURE — ${level.toUpperCase()} ATHLETE

### ATHLETE TRAINING PROFILE
Level: ${levelProfile.description}
Appropriate progression: ${levelProfile.progressionStyle}
Volume tolerance: ${levelProfile.volumeTolerance}
Intensity range: ${levelProfile.intensityRange}
Deload frequency: ${levelProfile.deloadFrequency}

### GOAL ARCHITECTURE RULES
${goalStructure.goalDistinction}

### PROGRESSION MODEL
${progressionInstructions}

### LANGUAGE REQUIREMENT
When presenting this program, reference the athlete's level and progression logic:
- "${level === "beginner" ? "Because you're building your foundation, we'll keep progression simple — add weight each week when your reps are there." : `Because you're ${level}, I'm using ${progDef.displayName} to drive adaptation without plateauing.`}"
`.trim();
}

// ─── Trigger Detection ────────────────────────────────────────────────────────

export function needsPeriodizationContext(
  trainingGoal: string,
  experienceLevel: string,
  request: string,
): boolean {
  const level = detectTrainingLevel(experienceLevel, request);
  const { hasExplicitDuration } = detectProgramDuration(request);

  // Always inject for intermediate/advanced
  if (level === "intermediate" || level === "advanced") return true;

  // Inject for explicit duration requests
  if (hasExplicitDuration) return true;

  // Inject for block-related requests
  if (/\b(block|periodized|periodization|structured|peak|wave\s*load|deload|cycle|12.week|8.week)\b/i.test(request)) return true;

  // Inject for goal-specific requests that benefit from structure
  const goalKey = detectGoalKey(trainingGoal);
  if (["strength", "power", "athletic_performance"].includes(goalKey) && level !== "beginner") return true;

  return false;
}
