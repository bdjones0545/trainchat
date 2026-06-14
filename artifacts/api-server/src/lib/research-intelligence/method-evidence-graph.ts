// ─── Training Method Evidence Graph ───────────────────────────────────────────
//
// Phase 2 — Evidence records for 17+ training methods.
//
// Each method entry contains:
//   - Supported adaptations (with evidence strength, confidence, study level)
//   - Contradictory findings (where science disagrees)
//   - Timeline data (minimum, expected, optimal weeks)
//   - Primary populations where evidence was generated
//
// Evidence strengths reflect published sport science consensus as of 2024.
// This is a structured knowledge layer — NOT a citation database.
// ─────────────────────────────────────────────────────────────────────────────

import type { TrainingMethodEvidence, ContradictoryFinding } from "./evidence-models.js";

// ─── Evidence Graph ────────────────────────────────────────────────────────────

export const METHOD_EVIDENCE_GRAPH: TrainingMethodEvidence[] = [

  // ─── Sprinting ──────────────────────────────────────────────────────────────
  {
    method: "Sprinting",
    category: "speed_power",
    minimumEffectiveWeeks: 3,
    expectedWeeks: 6,
    optimalWeeks: 12,
    primaryPopulations: ["college", "professional", "team_sport", "individual_sport"],
    equipmentRequired: false,
    intensityRange: "maximal",
    fatigueRating: 4,
    technicalDemand: "high",
    supportedAdaptations: [
      {
        adaptation: "Max Velocity",
        strength: "strong",
        confidence: 94,
        primaryLevel: "meta_analysis",
        populationSupport: ["professional", "college", "team_sport", "individual_sport"],
        notes: "Best evidence at 95–100% max sprint velocity; sub-maximal sprinting shows weak stimulus",
      },
      {
        adaptation: "Acceleration",
        strength: "strong",
        confidence: 88,
        primaryLevel: "systematic_review",
        populationSupport: ["college", "professional", "team_sport"],
        notes: "Free sprinting at 30–60m primarily develops acceleration through repetition; resisted variants stronger for early acceleration",
      },
      {
        adaptation: "Neural Drive",
        strength: "moderate",
        confidence: 78,
        primaryLevel: "controlled_study",
        populationSupport: ["college", "professional"],
        notes: "High-velocity sprinting recruits near-maximal motor units and increases rate coding",
      },
      {
        adaptation: "Running Economy",
        strength: "moderate",
        confidence: 72,
        primaryLevel: "systematic_review",
        populationSupport: ["professional", "individual_sport"],
        notes: "Repeated sprinting improves stride mechanics and metabolic efficiency at speed",
      },
    ],
    contradictions: [],
  },

  // ─── Resisted Sprint Training ────────────────────────────────────────────────
  {
    method: "Resisted Sprint Training",
    category: "speed_power",
    minimumEffectiveWeeks: 4,
    expectedWeeks: 8,
    optimalWeeks: 12,
    primaryPopulations: ["college", "professional", "team_sport", "high_school"],
    equipmentRequired: true,
    intensityRange: "maximal",
    fatigueRating: 4,
    technicalDemand: "high",
    supportedAdaptations: [
      {
        adaptation: "Acceleration",
        strength: "strong",
        confidence: 94,
        primaryLevel: "meta_analysis",
        populationSupport: ["college", "professional", "team_sport"],
        notes: "Sled loading 10–20% BM shows greatest acceleration improvements without mechanics disruption (Cahill et al., consensus position)",
      },
      {
        adaptation: "Horizontal Force Production",
        strength: "strong",
        confidence: 92,
        primaryLevel: "meta_analysis",
        populationSupport: ["college", "professional"],
        notes: "Resisted sprinting directly overloads the horizontal propulsive force vector during early sprint phase",
      },
      {
        adaptation: "Max Velocity",
        strength: "moderate",
        confidence: 62,
        primaryLevel: "controlled_study",
        populationSupport: ["college", "professional"],
        notes: "Some transfer to max velocity via acceleration improvements; direct max velocity stimulus is lower than free sprinting",
      },
      {
        adaptation: "Lower Body Power",
        strength: "moderate",
        confidence: 70,
        primaryLevel: "controlled_study",
        populationSupport: ["college", "team_sport"],
        notes: "Resisted sprinting improves force application patterns that transfer to jumping performance",
      },
    ],
    contradictions: [],
  },

  // ─── Overspeed / Assisted Sprint Training ────────────────────────────────────
  {
    method: "Overspeed Training",
    category: "speed_power",
    minimumEffectiveWeeks: 4,
    expectedWeeks: 8,
    optimalWeeks: 10,
    primaryPopulations: ["college", "professional", "individual_sport"],
    equipmentRequired: true,
    intensityRange: "maximal",
    fatigueRating: 3,
    technicalDemand: "high",
    supportedAdaptations: [
      {
        adaptation: "Max Velocity",
        strength: "moderate",
        confidence: 78,
        primaryLevel: "systematic_review",
        populationSupport: ["college", "professional", "individual_sport"],
        notes: "Assisted sprinting at 100–110% max velocity increases stride frequency ceiling; evidence is solid but less replicated than resisted",
      },
      {
        adaptation: "Stride Frequency",
        strength: "moderate",
        confidence: 74,
        primaryLevel: "controlled_study",
        populationSupport: ["college", "professional"],
        notes: "Supramaximal exposure trains the neural system to cycle limbs faster; requires very precise load — too much assistance disrupts mechanics",
      },
      {
        adaptation: "Neural Drive",
        strength: "emerging",
        confidence: 55,
        primaryLevel: "controlled_study",
        populationSupport: ["professional", "college"],
        notes: "Preliminary evidence for motor unit firing rate adaptations; needs more replication",
      },
    ],
    contradictions: [
      {
        topic: "Optimal Overspeed Load",
        strongEvidence: [{ adaptation: "Stride Frequency", confidence: 74, notes: "3–5% assistance is well-supported" }],
        mixedEvidence: [{ adaptation: "Mechanics Disruption Threshold", confidence: 48, notes: "Some studies show mechanics break down above 5% assistance; others show tolerance up to 10%" }],
        emergingEvidence: [],
        insufficientEvidence: [],
        resolutionGuidance: "Use 3–5% assistance for performance athletes. Avoid >8% — mechanics disruption risk outweighs benefit.",
      },
    ],
  },

  // ─── Plyometric Training ─────────────────────────────────────────────────────
  {
    method: "Plyometric Training",
    category: "plyometric",
    minimumEffectiveWeeks: 4,
    expectedWeeks: 8,
    optimalWeeks: 12,
    primaryPopulations: ["college", "professional", "team_sport", "high_school"],
    equipmentRequired: false,
    intensityRange: "high",
    fatigueRating: 3,
    technicalDemand: "moderate",
    supportedAdaptations: [
      {
        adaptation: "Lower Body Power",
        strength: "strong",
        confidence: 92,
        primaryLevel: "meta_analysis",
        populationSupport: ["college", "professional", "team_sport", "high_school", "recreational"],
        notes: "One of the most replicated findings in sport science; CMJ improvements consistently shown across populations",
      },
      {
        adaptation: "Reactive Strength",
        strength: "strong",
        confidence: 88,
        primaryLevel: "systematic_review",
        populationSupport: ["college", "professional", "team_sport"],
        notes: "SSC-focused plyometrics directly develop the reactive strength index; short GCT variants are most effective",
      },
      {
        adaptation: "Acceleration",
        strength: "moderate",
        confidence: 72,
        primaryLevel: "systematic_review",
        populationSupport: ["college", "team_sport", "high_school"],
        notes: "Positive transfer to 0–10m sprint time; not the primary stimulus but consistently supportive",
      },
      {
        adaptation: "Rate of Force Development",
        strength: "strong",
        confidence: 85,
        primaryLevel: "meta_analysis",
        populationSupport: ["college", "professional", "team_sport"],
        notes: "Ballistic plyometrics are among the most effective stimuli for early-phase RFD development",
      },
      {
        adaptation: "Change of Direction Speed",
        strength: "moderate",
        confidence: 78,
        primaryLevel: "systematic_review",
        populationSupport: ["college", "team_sport"],
        notes: "Reactive plyometrics show consistent COD improvements; braking-focused variants (lateral) are most specific",
      },
      {
        adaptation: "Injury Resilience",
        strength: "moderate",
        confidence: 70,
        primaryLevel: "systematic_review",
        populationSupport: ["college", "team_sport", "female"],
        notes: "ACL injury prevention programs (Fosbury, FIFA 11+) that include plyometrics show significant injury reduction",
      },
    ],
    contradictions: [],
  },

  // ─── Depth Jumps ─────────────────────────────────────────────────────────────
  {
    method: "Elastic Reactive Training",
    category: "plyometric",
    minimumEffectiveWeeks: 4,
    expectedWeeks: 8,
    optimalWeeks: 12,
    primaryPopulations: ["college", "professional", "individual_sport", "team_sport"],
    equipmentRequired: false,
    intensityRange: "high",
    fatigueRating: 3,
    technicalDemand: "high",
    supportedAdaptations: [
      {
        adaptation: "Reactive Strength",
        strength: "strong",
        confidence: 94,
        primaryLevel: "meta_analysis",
        populationSupport: ["college", "professional", "individual_sport"],
        notes: "High-speed short-contact plyometrics (depth jumps, pogo hops) are the gold standard for RSI development",
      },
      {
        adaptation: "Tendon Stiffness",
        strength: "strong",
        confidence: 88,
        primaryLevel: "systematic_review",
        populationSupport: ["college", "professional"],
        notes: "Reactive training drives Achilles and patellar tendon stiffness adaptations; slower plyometrics do not",
      },
      {
        adaptation: "Lower Body Power",
        strength: "moderate",
        confidence: 78,
        primaryLevel: "systematic_review",
        populationSupport: ["college", "professional", "team_sport"],
        notes: "Elastic energy return amplifies jump power; complements CMJ-type plyometrics",
      },
      {
        adaptation: "Elasticity",
        strength: "strong",
        confidence: 86,
        primaryLevel: "systematic_review",
        populationSupport: ["professional", "college", "individual_sport"],
        notes: "Elastic energy storage and return (SSC efficiency) directly targeted by short GCT drills",
      },
    ],
    contradictions: [],
  },

  // ─── Bounding ────────────────────────────────────────────────────────────────
  {
    method: "Bounding",
    category: "plyometric",
    minimumEffectiveWeeks: 3,
    expectedWeeks: 6,
    optimalWeeks: 10,
    primaryPopulations: ["college", "professional", "individual_sport"],
    equipmentRequired: false,
    intensityRange: "high",
    fatigueRating: 3,
    technicalDemand: "moderate",
    supportedAdaptations: [
      {
        adaptation: "Horizontal Power",
        strength: "moderate",
        confidence: 80,
        primaryLevel: "systematic_review",
        populationSupport: ["college", "professional", "individual_sport"],
        notes: "Bounding specifically loads horizontal force production patterns relevant to sprint acceleration",
      },
      {
        adaptation: "Acceleration",
        strength: "moderate",
        confidence: 72,
        primaryLevel: "controlled_study",
        populationSupport: ["college", "professional"],
        notes: "Transfer to early sprint acceleration is moderate; resisted sprinting more specific",
      },
      {
        adaptation: "Running Economy",
        strength: "moderate",
        confidence: 68,
        primaryLevel: "systematic_review",
        populationSupport: ["individual_sport", "college"],
        notes: "Bounding supplementation improves running economy in distance runners (stiffness and SSC efficiency)",
      },
      {
        adaptation: "Lower Body Power",
        strength: "moderate",
        confidence: 74,
        primaryLevel: "controlled_study",
        populationSupport: ["college", "professional"],
        notes: "Triple hop for distance correlates with sprint and jump performance",
      },
    ],
    contradictions: [],
  },

  // ─── Maximal Effort Method (Heavy Strength Training) ─────────────────────────
  {
    method: "Maximal Effort Method",
    category: "strength",
    minimumEffectiveWeeks: 6,
    expectedWeeks: 12,
    optimalWeeks: 16,
    primaryPopulations: ["college", "professional", "recreational", "team_sport"],
    equipmentRequired: true,
    intensityRange: "maximal",
    fatigueRating: 5,
    technicalDemand: "high",
    supportedAdaptations: [
      {
        adaptation: "Maximal Strength",
        strength: "strong",
        confidence: 98,
        primaryLevel: "meta_analysis",
        populationSupport: ["college", "professional", "recreational", "team_sport", "individual_sport", "male", "female"],
        notes: "One of the most established findings in exercise science. Heavy resistance training (>85% 1RM) consistently increases 1RM across all populations",
      },
      {
        adaptation: "Neural Drive",
        strength: "strong",
        confidence: 92,
        primaryLevel: "meta_analysis",
        populationSupport: ["college", "professional", "recreational"],
        notes: "Near-maximal loading is the primary stimulus for increased motor unit recruitment and rate coding — robust, replicated finding",
      },
      {
        adaptation: "Rate of Force Development",
        strength: "moderate",
        confidence: 72,
        primaryLevel: "systematic_review",
        populationSupport: ["college", "professional"],
        notes: "Heavy strength training improves late-phase RFD (>200ms); less effective for early-phase (<100ms) compared to ballistic training",
      },
      {
        adaptation: "Structural Strength",
        strength: "strong",
        confidence: 88,
        primaryLevel: "meta_analysis",
        populationSupport: ["college", "recreational", "professional", "masters"],
        notes: "Progressive heavy loading drives tendon, bone, and connective tissue adaptations across training ages",
      },
      {
        adaptation: "Injury Resilience",
        strength: "moderate",
        confidence: 78,
        primaryLevel: "systematic_review",
        populationSupport: ["college", "team_sport", "recreational"],
        notes: "Strength training is among the most evidence-backed injury prevention strategies across joint groups",
      },
    ],
    contradictions: [
      {
        topic: "Maximal Effort vs. Moderate Volume for Power Transfer",
        strongEvidence: [
          { adaptation: "Maximal Strength", confidence: 98, notes: "Heavy training clearly develops maximal strength" },
        ],
        mixedEvidence: [
          { adaptation: "Power Output Transfer", confidence: 55, notes: "Whether gains in 1RM translate to explosive power depends heavily on concurrent programming. Strength-only programs show weaker power transfer than conjugate approaches" },
        ],
        emergingEvidence: [],
        insufficientEvidence: [],
        resolutionGuidance: "Pair maximal effort work with ballistic/plyometric training for optimal power transfer. Strength-only programs are sufficient for hypertrophy and injury resilience goals.",
      },
    ],
  },

  // ─── Submaximal Effort Method ────────────────────────────────────────────────
  {
    method: "Submaximal Effort Method",
    category: "strength",
    minimumEffectiveWeeks: 6,
    expectedWeeks: 12,
    optimalWeeks: 16,
    primaryPopulations: ["recreational", "college", "team_sport", "masters", "general_fitness"],
    equipmentRequired: true,
    intensityRange: "high",
    fatigueRating: 4,
    technicalDemand: "moderate",
    supportedAdaptations: [
      {
        adaptation: "Hypertrophy",
        strength: "strong",
        confidence: 94,
        primaryLevel: "meta_analysis",
        populationSupport: ["recreational", "college", "masters", "male", "female"],
        notes: "Volume-equated moderate (65–80% 1RM) and high-load training produce equivalent hypertrophy. Consistent consensus across reviews",
      },
      {
        adaptation: "Muscular Endurance",
        strength: "strong",
        confidence: 86,
        primaryLevel: "systematic_review",
        populationSupport: ["recreational", "college", "general_fitness"],
        notes: "Higher-rep submaximal training consistently improves local muscular endurance",
      },
      {
        adaptation: "Work Capacity",
        strength: "moderate",
        confidence: 76,
        primaryLevel: "systematic_review",
        populationSupport: ["college", "team_sport", "recreational"],
        notes: "Progressive volume-load builds work capacity and fatigue resistance across sessions",
      },
      {
        adaptation: "Structural Strength",
        strength: "strong",
        confidence: 82,
        primaryLevel: "meta_analysis",
        populationSupport: ["recreational", "college", "masters"],
        notes: "Connective tissue adaptations driven by training volume; submaximal loading is sufficient",
      },
    ],
    contradictions: [],
  },

  // ─── Olympic Weightlifting ────────────────────────────────────────────────────
  {
    method: "Olympic Weightlifting",
    category: "speed_power",
    minimumEffectiveWeeks: 6,
    expectedWeeks: 12,
    optimalWeeks: 20,
    primaryPopulations: ["college", "professional", "individual_sport", "team_sport"],
    equipmentRequired: true,
    intensityRange: "maximal",
    fatigueRating: 4,
    technicalDemand: "high",
    supportedAdaptations: [
      {
        adaptation: "Explosive Strength",
        strength: "strong",
        confidence: 90,
        primaryLevel: "systematic_review",
        populationSupport: ["college", "professional", "individual_sport"],
        notes: "Olympic lifts require maximal explosive force production across the full kinetic chain; well-replicated across strength sports literature",
      },
      {
        adaptation: "Rate of Force Development",
        strength: "strong",
        confidence: 86,
        primaryLevel: "systematic_review",
        populationSupport: ["college", "professional"],
        notes: "Cleans and snatches train explosive RFD under load; peak RFD values are among the highest of any resistance exercise",
      },
      {
        adaptation: "Lower Body Power",
        strength: "moderate",
        confidence: 78,
        primaryLevel: "systematic_review",
        populationSupport: ["college", "team_sport"],
        notes: "Moderate transfer to jump performance; primary driver is the triple extension pattern",
      },
    ],
    contradictions: [
      {
        topic: "Olympic Lifting vs. Jump Squat for Power Development",
        strongEvidence: [],
        mixedEvidence: [
          { adaptation: "Power Output", confidence: 55, notes: "Some meta-analyses show Olympic variants are superior; others show equivalent results with loaded jump squats at lower technical demand" },
        ],
        emergingEvidence: [],
        insufficientEvidence: [],
        resolutionGuidance: "Both approaches develop power. Olympic lifts may have a higher ceiling; jump squats are preferred when technical coaching is limited or time to skill acquisition is short.",
      },
    ],
  },

  // ─── Ballistic Training ──────────────────────────────────────────────────────
  {
    method: "Rate of Force Development Training",
    category: "speed_power",
    minimumEffectiveWeeks: 3,
    expectedWeeks: 6,
    optimalWeeks: 10,
    primaryPopulations: ["college", "professional", "team_sport", "individual_sport"],
    equipmentRequired: false,
    intensityRange: "maximal",
    fatigueRating: 3,
    technicalDemand: "moderate",
    supportedAdaptations: [
      {
        adaptation: "Rate of Force Development",
        strength: "strong",
        confidence: 92,
        primaryLevel: "meta_analysis",
        populationSupport: ["college", "professional", "team_sport", "individual_sport"],
        notes: "Ballistic/explosive intent training (isometrics, jump squats, MB throws) consistently improves early-phase RFD in the 0–200ms window",
      },
      {
        adaptation: "Explosive Strength",
        strength: "strong",
        confidence: 88,
        primaryLevel: "systematic_review",
        populationSupport: ["college", "professional"],
        notes: "Maximal-intent training with submaximal loads produces superior explosive adaptations compared to heavy slow strength alone",
      },
      {
        adaptation: "Neural Drive",
        strength: "moderate",
        confidence: 80,
        primaryLevel: "systematic_review",
        populationSupport: ["college", "professional"],
        notes: "Explosive intent training increases motor unit firing rates and neural efficiency even when loads are submaximal",
      },
      {
        adaptation: "Acceleration",
        strength: "moderate",
        confidence: 72,
        primaryLevel: "controlled_study",
        populationSupport: ["college", "team_sport"],
        notes: "Improvements in RFD transfer to early sprint acceleration; less direct than resisted sprinting",
      },
    ],
    contradictions: [],
  },

  // ─── Medicine Ball Training ──────────────────────────────────────────────────
  {
    method: "Medicine Ball Training",
    category: "speed_power",
    minimumEffectiveWeeks: 4,
    expectedWeeks: 8,
    optimalWeeks: 12,
    primaryPopulations: ["college", "team_sport", "high_school", "professional"],
    equipmentRequired: true,
    intensityRange: "high",
    fatigueRating: 2,
    technicalDemand: "moderate",
    supportedAdaptations: [
      {
        adaptation: "Rotational Power",
        strength: "strong",
        confidence: 88,
        primaryLevel: "systematic_review",
        populationSupport: ["college", "team_sport", "professional"],
        notes: "Medicine ball rotational throws are the primary evidence-based tool for upper body rotational power development in sport",
      },
      {
        adaptation: "Rate of Force Development",
        strength: "moderate",
        confidence: 74,
        primaryLevel: "systematic_review",
        populationSupport: ["college", "team_sport"],
        notes: "Explosive throwing develops upper body RFD; less evidence than lower body ballistic training",
      },
      {
        adaptation: "Lower Body Power",
        strength: "moderate",
        confidence: 68,
        primaryLevel: "controlled_study",
        populationSupport: ["college", "team_sport"],
        notes: "MB scoop throws and slam variations provide a lower-body explosive stimulus with lower technical demand than Olympic lifting",
      },
    ],
    contradictions: [],
  },

  // ─── COD Training ────────────────────────────────────────────────────────────
  {
    method: "Acceleration Development",
    category: "speed_power",
    minimumEffectiveWeeks: 3,
    expectedWeeks: 6,
    optimalWeeks: 12,
    primaryPopulations: ["college", "professional", "team_sport", "high_school"],
    equipmentRequired: false,
    intensityRange: "high",
    fatigueRating: 3,
    technicalDemand: "high",
    supportedAdaptations: [
      {
        adaptation: "Acceleration",
        strength: "strong",
        confidence: 90,
        primaryLevel: "systematic_review",
        populationSupport: ["college", "professional", "team_sport"],
        notes: "Technical sprint mechanics training improves sprint time at 10–30m; combined with resisted sprinting most effective",
      },
      {
        adaptation: "Horizontal Force Production",
        strength: "moderate",
        confidence: 76,
        primaryLevel: "systematic_review",
        populationSupport: ["college", "professional"],
        notes: "Sprint mechanics coaching improves horizontal force vector application; quantified via force-velocity profiling",
      },
      {
        adaptation: "Change of Direction Speed",
        strength: "moderate",
        confidence: 70,
        primaryLevel: "controlled_study",
        populationSupport: ["college", "team_sport"],
        notes: "Re-acceleration mechanics from change of direction follow the same mechanical principles as initial acceleration",
      },
    ],
    contradictions: [],
  },

  // ─── High-Intensity Interval Training ────────────────────────────────────────
  {
    method: "High-Intensity Interval Training",
    category: "aerobic",
    minimumEffectiveWeeks: 4,
    expectedWeeks: 8,
    optimalWeeks: 12,
    primaryPopulations: ["recreational", "college", "team_sport", "general_fitness"],
    equipmentRequired: false,
    intensityRange: "high",
    fatigueRating: 4,
    technicalDemand: "low",
    supportedAdaptations: [
      {
        adaptation: "Aerobic Capacity",
        strength: "strong",
        confidence: 90,
        primaryLevel: "meta_analysis",
        populationSupport: ["recreational", "college", "team_sport", "general_fitness"],
        notes: "HIIT consistently increases VO2 Max with lower volume than continuous training; 4×4 min format is most replicated",
      },
      {
        adaptation: "Lactate Threshold",
        strength: "moderate",
        confidence: 76,
        primaryLevel: "systematic_review",
        populationSupport: ["recreational", "college", "team_sport"],
        notes: "HIIT raises lactate threshold, but threshold-specific training (tempo) may be more efficient at this goal",
      },
      {
        adaptation: "Work Capacity",
        strength: "strong",
        confidence: 82,
        primaryLevel: "systematic_review",
        populationSupport: ["recreational", "college", "team_sport", "general_fitness"],
        notes: "Repeated high-intensity bouts develop the anaerobic-aerobic transition system and improve repeated effort capacity",
      },
      {
        adaptation: "Repeated Sprint Ability",
        strength: "moderate",
        confidence: 72,
        primaryLevel: "systematic_review",
        populationSupport: ["team_sport", "college"],
        notes: "Aerobic power improvements from HIIT support recovery between repeated sprint efforts",
      },
    ],
    contradictions: [
      {
        topic: "HIIT vs. Continuous Training for VO2 Max",
        strongEvidence: [
          { adaptation: "VO2 Max Improvement Magnitude", confidence: 90, notes: "HIIT produces comparable or superior VO2 Max gains at lower volume" },
        ],
        mixedEvidence: [
          { adaptation: "Long-term Adherence", confidence: 45, notes: "High drop-out rates in HIIT programs challenge long-term applicability" },
        ],
        emergingEvidence: [],
        insufficientEvidence: [],
        resolutionGuidance: "HIIT is the most time-efficient VO2 Max stimulus, but requires adequate recovery and periodization. Novice athletes should build aerobic base before HIIT.",
      },
    ],
  },

  // ─── Aerobic Base Building ────────────────────────────────────────────────────
  {
    method: "Aerobic Base Building",
    category: "aerobic",
    minimumEffectiveWeeks: 6,
    expectedWeeks: 12,
    optimalWeeks: 20,
    primaryPopulations: ["recreational", "college", "individual_sport", "general_fitness", "masters"],
    equipmentRequired: false,
    intensityRange: "low",
    fatigueRating: 2,
    technicalDemand: "low",
    supportedAdaptations: [
      {
        adaptation: "Aerobic Capacity",
        strength: "strong",
        confidence: 92,
        primaryLevel: "meta_analysis",
        populationSupport: ["recreational", "college", "individual_sport", "masters", "general_fitness"],
        notes: "Zone 2 training builds the foundational aerobic machinery; strong evidence across all populations",
      },
      {
        adaptation: "Fat Oxidation",
        strength: "strong",
        confidence: 86,
        primaryLevel: "systematic_review",
        populationSupport: ["individual_sport", "recreational", "college"],
        notes: "Sub-threshold training is the primary driver of fat oxidation adaptation and mitochondrial biogenesis",
      },
      {
        adaptation: "Work Capacity",
        strength: "moderate",
        confidence: 78,
        primaryLevel: "systematic_review",
        populationSupport: ["team_sport", "college", "recreational"],
        notes: "Aerobic base supports recovery between high-intensity training sessions and repeated sprint ability",
      },
      {
        adaptation: "Muscular Endurance",
        strength: "moderate",
        confidence: 72,
        primaryLevel: "systematic_review",
        populationSupport: ["individual_sport", "recreational"],
        notes: "Long slow distance training builds local muscular endurance alongside systemic aerobic adaptation",
      },
    ],
    contradictions: [],
  },

  // ─── Lactate Threshold / Tempo Running ───────────────────────────────────────
  {
    method: "Lactate Threshold Training",
    category: "aerobic",
    minimumEffectiveWeeks: 6,
    expectedWeeks: 10,
    optimalWeeks: 16,
    primaryPopulations: ["individual_sport", "college", "professional"],
    equipmentRequired: false,
    intensityRange: "moderate",
    fatigueRating: 3,
    technicalDemand: "low",
    supportedAdaptations: [
      {
        adaptation: "Lactate Threshold",
        strength: "strong",
        confidence: 94,
        primaryLevel: "meta_analysis",
        populationSupport: ["individual_sport", "college", "professional"],
        notes: "Training at or slightly above lactate threshold is the most effective way to raise it; highly replicated",
      },
      {
        adaptation: "Running Economy",
        strength: "moderate",
        confidence: 76,
        primaryLevel: "systematic_review",
        populationSupport: ["individual_sport", "college"],
        notes: "Tempo running at threshold improves economy through mechanical efficiency gains",
      },
      {
        adaptation: "Aerobic Capacity",
        strength: "moderate",
        confidence: 72,
        primaryLevel: "systematic_review",
        populationSupport: ["individual_sport", "college"],
        notes: "Threshold training provides secondary VO2 Max stimulus; not as potent as HIIT",
      },
    ],
    contradictions: [],
  },

  // ─── Isometric Training ───────────────────────────────────────────────────────
  {
    method: "Isometric Training",
    category: "strength",
    minimumEffectiveWeeks: 4,
    expectedWeeks: 8,
    optimalWeeks: 12,
    primaryPopulations: ["college", "professional", "recreational", "tactical", "masters"],
    equipmentRequired: false,
    intensityRange: "maximal",
    fatigueRating: 2,
    technicalDemand: "moderate",
    supportedAdaptations: [
      {
        adaptation: "Rate of Force Development",
        strength: "strong",
        confidence: 88,
        primaryLevel: "systematic_review",
        populationSupport: ["college", "professional", "recreational"],
        notes: "Maximal intent isometric training (especially IMTP) produces the highest recorded RFD values; particularly effective for early-phase RFD",
      },
      {
        adaptation: "Maximal Strength",
        strength: "moderate",
        confidence: 76,
        primaryLevel: "systematic_review",
        populationSupport: ["college", "professional", "recreational"],
        notes: "Isometric strength is highly joint-angle specific; needs to be complemented with dynamic training for full ROM strength",
      },
      {
        adaptation: "Trunk Stability",
        strength: "strong",
        confidence: 88,
        primaryLevel: "systematic_review",
        populationSupport: ["college", "recreational", "tactical", "masters"],
        notes: "Anti-movement isometrics (Pallof, plank variants) show consistent trunk stability improvements with low injury risk",
      },
      {
        adaptation: "Tendon Stiffness",
        strength: "moderate",
        confidence: 70,
        primaryLevel: "systematic_review",
        populationSupport: ["college", "professional"],
        notes: "Long-duration isometrics (>30s) drive tendon stiffness adaptations; pain reduction in tendinopathy is well-documented",
      },
    ],
    contradictions: [
      {
        topic: "Isometric Training for Tendinopathy",
        strongEvidence: [
          { adaptation: "Pain Reduction", confidence: 85, notes: "Robust evidence for immediate pain reduction in patellar and Achilles tendinopathy" },
        ],
        mixedEvidence: [
          { adaptation: "Tendon Structure", confidence: 48, notes: "Debate continues on whether pain relief reflects structural change or neurophysiological modulation" },
        ],
        emergingEvidence: [],
        insufficientEvidence: [],
        resolutionGuidance: "Use isometrics confidently for pain management. Do not assume structural healing has occurred — continue progressive loading regardless of symptom relief.",
      },
    ],
  },

  // ─── Eccentric Training ───────────────────────────────────────────────────────
  {
    method: "Eccentric Overload Training",
    category: "strength",
    minimumEffectiveWeeks: 4,
    expectedWeeks: 8,
    optimalWeeks: 12,
    primaryPopulations: ["college", "professional", "team_sport", "individual_sport"],
    equipmentRequired: true,
    intensityRange: "high",
    fatigueRating: 4,
    technicalDemand: "moderate",
    supportedAdaptations: [
      {
        adaptation: "Maximal Strength",
        strength: "strong",
        confidence: 86,
        primaryLevel: "meta_analysis",
        populationSupport: ["college", "professional", "recreational"],
        notes: "Eccentric loading enables supra-maximal loading; consistently superior for 1RM vs. concentric-only training",
      },
      {
        adaptation: "Injury Resilience",
        strength: "strong",
        confidence: 90,
        primaryLevel: "meta_analysis",
        populationSupport: ["college", "team_sport", "professional"],
        notes: "Nordic hamstring curl and eccentric protocols show 50–70% reduction in hamstring injury rates; one of the strongest injury prevention findings in sport science",
      },
      {
        adaptation: "Hypertrophy",
        strength: "strong",
        confidence: 86,
        primaryLevel: "meta_analysis",
        populationSupport: ["college", "recreational", "male", "female"],
        notes: "Eccentric phase produces greater muscle damage and protein synthesis response than concentric alone",
      },
      {
        adaptation: "Change of Direction Speed",
        strength: "moderate",
        confidence: 74,
        primaryLevel: "systematic_review",
        populationSupport: ["college", "team_sport"],
        notes: "Eccentric strength of the lower limb is the primary limiter of deceleration capacity — key for COD speed",
      },
    ],
    contradictions: [
      {
        topic: "Nordic Hamstring for Sprint Speed",
        strongEvidence: [
          { adaptation: "Hamstring Injury Reduction", confidence: 90, notes: "Consistent 50–70% injury reduction across field sport populations" },
        ],
        mixedEvidence: [
          { adaptation: "Sprint Speed", confidence: 52, notes: "Some studies show no direct sprint speed improvement; others show small positive effects. Primary benefit appears to be injury prevention rather than speed enhancement" },
        ],
        emergingEvidence: [],
        insufficientEvidence: [],
        resolutionGuidance: "Use Nordic curls for injury prevention — the evidence is unambiguous. Do not rely on it as a sprint speed intervention.",
      },
    ],
  },

  // ─── Mobility Training ────────────────────────────────────────────────────────
  {
    method: "Mobility Training",
    category: "mobility_flexibility",
    minimumEffectiveWeeks: 4,
    expectedWeeks: 8,
    optimalWeeks: 12,
    primaryPopulations: ["recreational", "masters", "general_fitness", "college", "tactical"],
    equipmentRequired: false,
    intensityRange: "low",
    fatigueRating: 1,
    technicalDemand: "low",
    supportedAdaptations: [
      {
        adaptation: "Movement Quality",
        strength: "strong",
        confidence: 86,
        primaryLevel: "systematic_review",
        populationSupport: ["recreational", "masters", "general_fitness", "college"],
        notes: "Targeted mobility work consistently improves range of motion and movement quality scores",
      },
      {
        adaptation: "Injury Resilience",
        strength: "moderate",
        confidence: 68,
        primaryLevel: "systematic_review",
        populationSupport: ["recreational", "masters", "team_sport"],
        notes: "Mobility restriction is an injury risk factor; addressing it has moderate evidence for injury prevention",
      },
    ],
    contradictions: [
      {
        topic: "Stretching Before Exercise and Performance",
        strongEvidence: [
          { adaptation: "Range of Motion", confidence: 88, notes: "Chronic stretching consistently increases ROM" },
        ],
        mixedEvidence: [
          { adaptation: "Acute Power Output", confidence: 40, notes: "Acute static stretching pre-exercise is associated with small reductions in power and strength output; dynamic warm-up does not show this effect" },
        ],
        emergingEvidence: [],
        insufficientEvidence: [],
        resolutionGuidance: "Avoid prolonged static stretching immediately before power-dependent training. Use dynamic mobility for warm-up; static work post-training or in dedicated sessions.",
      },
    ],
  },

  // ─── Contrast Training ────────────────────────────────────────────────────────
  {
    method: "Contrast Training",
    category: "speed_power",
    minimumEffectiveWeeks: 4,
    expectedWeeks: 8,
    optimalWeeks: 10,
    primaryPopulations: ["college", "professional", "team_sport", "individual_sport"],
    equipmentRequired: true,
    intensityRange: "maximal",
    fatigueRating: 5,
    technicalDemand: "high",
    supportedAdaptations: [
      {
        adaptation: "Lower Body Power",
        strength: "strong",
        confidence: 86,
        primaryLevel: "systematic_review",
        populationSupport: ["college", "professional", "team_sport"],
        notes: "PAP-based contrast training (heavy strength followed by explosive exercise) consistently shows superior jump and sprint improvements vs. single-mode training",
      },
      {
        adaptation: "Rate of Force Development",
        strength: "moderate",
        confidence: 76,
        primaryLevel: "systematic_review",
        populationSupport: ["college", "professional"],
        notes: "PAP potentiation from heavy loading increases motor unit recruitment for subsequent explosive exercise",
      },
      {
        adaptation: "Explosive Strength",
        strength: "moderate",
        confidence: 74,
        primaryLevel: "controlled_study",
        populationSupport: ["college", "professional"],
        notes: "French contrast method covers the full force-velocity curve and shows multi-quality improvements",
      },
    ],
    contradictions: [],
  },

  // ─── Repeated Sprint Ability ──────────────────────────────────────────────────
  {
    method: "Repeated Sprint Ability",
    category: "anaerobic",
    minimumEffectiveWeeks: 4,
    expectedWeeks: 8,
    optimalWeeks: 12,
    primaryPopulations: ["team_sport", "college", "professional"],
    equipmentRequired: false,
    intensityRange: "maximal",
    fatigueRating: 5,
    technicalDemand: "moderate",
    supportedAdaptations: [
      {
        adaptation: "Repeated Sprint Ability",
        strength: "strong",
        confidence: 92,
        primaryLevel: "systematic_review",
        populationSupport: ["team_sport", "college", "professional"],
        notes: "Repeated sprint protocols (6–10 sprints, <20s recovery) are the most specific training stimulus for RSA; robust evidence in team sport contexts",
      },
      {
        adaptation: "Work Capacity",
        strength: "strong",
        confidence: 84,
        primaryLevel: "systematic_review",
        populationSupport: ["team_sport", "college"],
        notes: "RSA training develops the anaerobic-aerobic transition zone required for maintaining sprint quality through fatigue",
      },
      {
        adaptation: "Aerobic Capacity",
        strength: "moderate",
        confidence: 68,
        primaryLevel: "controlled_study",
        populationSupport: ["team_sport", "college"],
        notes: "Secondary aerobic benefit from RSA work; not the most efficient VO2 Max stimulus",
      },
    ],
    contradictions: [],
  },
];

// ─── Lookup Interface ─────────────────────────────────────────────────────────

/**
 * Retrieve the evidence record for a specific training method by name.
 * Case-insensitive, partial match supported.
 */
export function getMethodEvidence(methodName: string): TrainingMethodEvidence | null {
  const key = methodName.toLowerCase().trim();
  return (
    METHOD_EVIDENCE_GRAPH.find(
      (m) =>
        m.method.toLowerCase() === key ||
        m.method.toLowerCase().includes(key) ||
        key.includes(m.method.toLowerCase().slice(0, 8))
    ) ?? null
  );
}

/**
 * Get the highest-confidence evidence finding for a method targeting a specific adaptation.
 */
export function getBestEvidenceForAdaptation(
  methodName: string,
  adaptation: string
): import("./evidence-models.js").ResearchFinding | null {
  const method = getMethodEvidence(methodName);
  if (!method) return null;

  const key = adaptation.toLowerCase();
  const findings = method.supportedAdaptations.filter(
    (f) =>
      f.adaptation.toLowerCase().includes(key) ||
      key.includes(f.adaptation.toLowerCase().split(" ")[0] ?? "")
  );

  return findings.sort((a, b) => b.confidence - a.confidence)[0] ?? null;
}

/**
 * Retrieve all contradictions for a method — used to surface uncertainty in coaching output.
 */
export function getMethodContradictions(methodName: string): ContradictoryFinding[] {
  return getMethodEvidence(methodName)?.contradictions ?? [];
}

/**
 * Get a summary evidence strength for a method based on its best-supported adaptation.
 */
export function getMethodTopEvidenceStrength(methodName: string): import("./evidence-models.js").EvidenceStrength {
  const method = getMethodEvidence(methodName);
  if (!method) return "insufficient";
  const best = method.supportedAdaptations.sort((a, b) => b.confidence - a.confidence)[0];
  return best?.strength ?? "insufficient";
}
