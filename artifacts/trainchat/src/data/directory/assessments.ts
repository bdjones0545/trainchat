// ─── Types ────────────────────────────────────────────────────────────────────

export type AssessmentCategory =
  | "Speed"
  | "Power"
  | "Strength"
  | "Mobility"
  | "Conditioning"
  | "Recovery"
  | "Readiness"
  | "Movement Quality";

export type DifficultyLevel = "Beginner" | "Intermediate" | "Advanced";

export interface NormativeData {
  elite?: string;
  good?: string;
  average?: string;
  below?: string;
  note?: string;
}

export interface AssessmentQualityLink {
  quality: string;
  linkType: "measures" | "reflects";
}

export interface AssessmentMethodLink {
  method: string;
  weakness: string;
  priority: number;
}

export interface AssessmentProductLink {
  product: string;
  role: "recommended" | "alternative" | "required";
}

export interface AssessmentExerciseLink {
  exercise: string;
  weakness: string;
  prescription: string;
}

export interface Assessment {
  id: number;
  name: string;
  category: AssessmentCategory;
  description: string;
  metric: string;
  unit: string;
  sportRelevance: string[];
  difficulty: DifficultyLevel;
  equipmentRequired: string[];
  normativeData: NormativeData;
  qualities: AssessmentQualityLink[];
  methods: AssessmentMethodLink[];
  products: AssessmentProductLink[];
  exercises: AssessmentExerciseLink[];
  expectedAdaptation: string;
}

// ─── Assessment Data ───────────────────────────────────────────────────────────

export const ASSESSMENTS: Assessment[] = [
  // ─── SPEED ─────────────────────────────────────────────────────────────────

  {
    id: 1,
    name: "10 Yard Sprint",
    category: "Speed",
    description: "Measures initial acceleration from a stationary start over 10 yards. The most widely used short acceleration test in field sports.",
    metric: "Time",
    unit: "seconds",
    sportRelevance: ["Football", "Soccer", "Rugby", "Hockey", "Basketball"],
    difficulty: "Beginner",
    equipmentRequired: ["Timing Gates", "Measuring Tape"],
    normativeData: {
      elite: "< 1.50s",
      good: "1.50–1.60s",
      average: "1.61–1.75s",
      below: "> 1.75s",
      note: "NFL Combine average: ~1.55s",
    },
    qualities: [
      { quality: "Acceleration", linkType: "measures" },
      { quality: "Horizontal Force Production", linkType: "measures" },
      { quality: "Starting Strength", linkType: "measures" },
    ],
    methods: [
      { method: "Resisted Sprint Training", weakness: "Poor Acceleration", priority: 1 },
      { method: "Acceleration Development", weakness: "Poor Acceleration", priority: 2 },
      { method: "Rate of Force Development Training", weakness: "Low Horizontal Force Production", priority: 3 },
    ],
    products: [
      { product: "Sprint Sled", role: "recommended" },
      { product: "Freelap Timing System", role: "recommended" },
      { product: "Resisted Sprint Harness", role: "alternative" },
    ],
    exercises: [
      { exercise: "Resisted Sprint", weakness: "Poor Acceleration", prescription: "3×4 × 10m @ 10–15% body weight load" },
      { exercise: "Wall Drive", weakness: "Poor Acceleration", prescription: "3×8 each leg, 45° body angle, max intent" },
      { exercise: "A-March", weakness: "Poor Acceleration", prescription: "3×20m, exaggerated mechanics, tall posture" },
    ],
    expectedAdaptation: "Reduced 10-yard time, improved horizontal force application, better initial body lean",
  },

  {
    id: 2,
    name: "20 Yard Sprint",
    category: "Speed",
    description: "Tests speed from the transition zone between initial acceleration and top-end velocity. Widely used in NFL Combine and team sport scouting.",
    metric: "Time",
    unit: "seconds",
    sportRelevance: ["Football", "Soccer", "Rugby", "Track & Field"],
    difficulty: "Beginner",
    equipmentRequired: ["Timing Gates", "Measuring Tape"],
    normativeData: {
      elite: "< 2.55s",
      good: "2.55–2.70s",
      average: "2.71–2.90s",
      below: "> 2.90s",
      note: "NFL Combine average: ~2.63s",
    },
    qualities: [
      { quality: "Acceleration", linkType: "measures" },
      { quality: "Speed Endurance (short)", linkType: "measures" },
      { quality: "Stride Length", linkType: "reflects" },
    ],
    methods: [
      { method: "Acceleration Development", weakness: "Poor 20-Yard Speed", priority: 1 },
      { method: "Resisted Sprint Training", weakness: "Poor 20-Yard Speed", priority: 2 },
      { method: "Max Velocity Development", weakness: "Early Velocity Decay", priority: 3 },
    ],
    products: [
      { product: "Freelap Timing System", role: "recommended" },
      { product: "Sprint Sled", role: "recommended" },
      { product: "Speed Bungee Cord System", role: "alternative" },
    ],
    exercises: [
      { exercise: "Flying Sprint (10m Build)", weakness: "Poor 20-Yard Speed", prescription: "4×20m, build over first 10m then max velocity" },
      { exercise: "Resisted Sprint 20m", weakness: "Poor 20-Yard Speed", prescription: "3×4 × 20m @ 10% body weight" },
      { exercise: "Power Skip for Height", weakness: "Early Velocity Decay", prescription: "3×20m, maximal vertical push each stride" },
    ],
    expectedAdaptation: "Improved split times across 0–20 yards, better transition from acceleration to max velocity",
  },

  {
    id: 3,
    name: "Flying 10",
    category: "Speed",
    description: "Measures top-end sprint velocity over 10 meters with a 20–30m running start. Isolates max velocity mechanics without acceleration.",
    metric: "Time",
    unit: "seconds",
    sportRelevance: ["Track & Field", "Football", "Soccer", "Rugby"],
    difficulty: "Intermediate",
    equipmentRequired: ["Timing Gates"],
    normativeData: {
      elite: "< 0.90s",
      good: "0.90–1.00s",
      average: "1.01–1.10s",
      below: "> 1.10s",
      note: "Elite sprinters approach 0.82–0.86s",
    },
    qualities: [
      { quality: "Max Velocity", linkType: "measures" },
      { quality: "Stride Frequency", linkType: "reflects" },
      { quality: "Stride Length", linkType: "reflects" },
    ],
    methods: [
      { method: "Max Velocity Development", weakness: "Low Max Velocity", priority: 1 },
      { method: "Overspeed Training", weakness: "Low Stride Frequency", priority: 2 },
      { method: "Elastic Reactive Training", weakness: "Low Stride Length", priority: 3 },
    ],
    products: [
      { product: "Freelap Timing System", role: "required" },
      { product: "Speed Bungee Cord System", role: "recommended" },
      { product: "Overspeed Pulley System", role: "alternative" },
    ],
    exercises: [
      { exercise: "Wicket Run", weakness: "Low Max Velocity", prescription: "4×40m, wickets at 6–7 ft spacing" },
      { exercise: "Flying Sprint 10m", weakness: "Low Max Velocity", prescription: "6×10m fly, 30m build-up, full recovery" },
      { exercise: "High Knee A-Skip", weakness: "Low Stride Frequency", prescription: "3×20m, rapid cadence, soft ground contact" },
    ],
    expectedAdaptation: "Higher top-end speed, increased stride length at max velocity, improved neuromuscular efficiency",
  },

  {
    id: 4,
    name: "Flying 20",
    category: "Speed",
    description: "Evaluates max velocity over 20 meters from a flying start. Gives a reliable measure of peak sprint speed capability.",
    metric: "Time",
    unit: "seconds",
    sportRelevance: ["Track & Field", "Football", "Soccer"],
    difficulty: "Intermediate",
    equipmentRequired: ["Timing Gates"],
    normativeData: {
      elite: "< 1.80s",
      good: "1.80–2.00s",
      average: "2.01–2.20s",
      below: "> 2.20s",
    },
    qualities: [
      { quality: "Max Velocity", linkType: "measures" },
      { quality: "Neural Drive", linkType: "reflects" },
    ],
    methods: [
      { method: "Max Velocity Development", weakness: "Low Max Velocity", priority: 1 },
      { method: "Overspeed Training", weakness: "Low Max Velocity", priority: 2 },
    ],
    products: [
      { product: "Freelap Timing System", role: "required" },
      { product: "Overspeed Pulley System", role: "recommended" },
    ],
    exercises: [
      { exercise: "Flying Sprint 20m", weakness: "Low Max Velocity", prescription: "5×20m fly, 40m build-up, full recovery" },
      { exercise: "Assisted Sprint 20m", weakness: "Low Max Velocity", prescription: "4×20m, 5–10% assistance" },
    ],
    expectedAdaptation: "Higher peak sprint velocity, improved stride mechanics at max speed",
  },

  {
    id: 5,
    name: "505 Change of Direction",
    category: "Speed",
    description: "Measures the ability to decelerate, change direction 180°, and re-accelerate over 5 meters. A standard COD speed test for team sports.",
    metric: "Time",
    unit: "seconds",
    sportRelevance: ["Soccer", "Basketball", "Rugby", "Netball", "Hockey"],
    difficulty: "Intermediate",
    equipmentRequired: ["Timing Gates", "Cones"],
    normativeData: {
      elite: "< 2.20s",
      good: "2.20–2.40s",
      average: "2.41–2.60s",
      below: "> 2.60s",
    },
    qualities: [
      { quality: "Change of Direction Speed", linkType: "measures" },
      { quality: "Eccentric Strength", linkType: "reflects" },
      { quality: "Reactive Strength", linkType: "reflects" },
    ],
    methods: [
      { method: "Eccentric Overload Training", weakness: "Poor COD Speed", priority: 1 },
      { method: "Plyometric Training", weakness: "Poor COD Speed", priority: 2 },
      { method: "Acceleration Development", weakness: "Poor Re-Acceleration", priority: 3 },
    ],
    products: [
      { product: "Nordic Hamstring Curl Device", role: "recommended" },
      { product: "Plyometric Hurdles", role: "recommended" },
      { product: "Freelap Timing System", role: "required" },
    ],
    exercises: [
      { exercise: "Lateral Bound with Stick", weakness: "Poor COD Speed", prescription: "3×6 each side, stick landing 2s" },
      { exercise: "Deceleration Run", weakness: "Poor COD Speed", prescription: "4×15m, max deceleration last 5m" },
      { exercise: "Pro Agility Shuttle", weakness: "Poor COD Speed", prescription: "3×3, near-max effort, full recovery" },
    ],
    expectedAdaptation: "Faster 505 time, better braking force, improved entry/exit mechanics",
  },

  {
    id: 6,
    name: "40-Yard Dash",
    category: "Speed",
    description: "The gold standard combine speed test measuring full-acceleration sprint over 40 yards. Split times reveal early, mid, and top-end speed.",
    metric: "Time",
    unit: "seconds",
    sportRelevance: ["Football", "Rugby", "General Athletic"],
    difficulty: "Beginner",
    equipmentRequired: ["Timing Gates", "Measuring Tape"],
    normativeData: {
      elite: "< 4.40s",
      good: "4.40–4.60s",
      average: "4.61–4.80s",
      below: "> 4.80s",
      note: "NFL skill positions: 4.40–4.55s",
    },
    qualities: [
      { quality: "Acceleration", linkType: "measures" },
      { quality: "Max Velocity", linkType: "measures" },
      { quality: "Speed Endurance (short)", linkType: "reflects" },
    ],
    methods: [
      { method: "Acceleration Development", weakness: "Slow 40-Yard Dash", priority: 1 },
      { method: "Max Velocity Development", weakness: "Slow 40-Yard Dash", priority: 2 },
    ],
    products: [
      { product: "Freelap Timing System", role: "recommended" },
      { product: "Sprint Sled", role: "recommended" },
    ],
    exercises: [
      { exercise: "3-Point Start Sprint", weakness: "Slow 40-Yard Dash", prescription: "5×40 yards, full recovery, focus on start mechanics" },
      { exercise: "Resisted Sprint 20m", weakness: "Slow 40-Yard Dash", prescription: "3×4 × 20m sled @ 8–12% body weight" },
    ],
    expectedAdaptation: "Improved 40-yard time, better split ratios from 10-to-40 yards",
  },

  // ─── POWER ─────────────────────────────────────────────────────────────────

  {
    id: 7,
    name: "Countermovement Jump",
    category: "Power",
    description: "Measures lower body explosive power via a countermovement squat-to-jump. The most validated field test of lower body power.",
    metric: "Jump Height",
    unit: "cm / inches",
    sportRelevance: ["Basketball", "Football", "Soccer", "Volleyball", "Track & Field"],
    difficulty: "Beginner",
    equipmentRequired: ["Force Plate", "Jump Mat", "Vertec"],
    normativeData: {
      elite: "> 70cm (males), > 55cm (females)",
      good: "60–70cm (males), 45–55cm (females)",
      average: "45–60cm (males), 35–45cm (females)",
      below: "< 45cm (males), < 35cm (females)",
    },
    qualities: [
      { quality: "Lower Body Power", linkType: "measures" },
      { quality: "Reactive Strength", linkType: "measures" },
      { quality: "Rate of Force Development", linkType: "reflects" },
    ],
    methods: [
      { method: "Plyometric Training", weakness: "Low CMJ Height", priority: 1 },
      { method: "Contrast Training", weakness: "Low CMJ Height", priority: 2 },
      { method: "Rate of Force Development Training", weakness: "Low RFD", priority: 3 },
    ],
    products: [
      { product: "Force Plate Dual", role: "recommended" },
      { product: "Jump Mat", role: "alternative" },
      { product: "Vertec", role: "alternative" },
    ],
    exercises: [
      { exercise: "Depth Drop", weakness: "Low CMJ Height", prescription: "3×5, drop from 30–40cm, minimal ground contact" },
      { exercise: "Loaded CMJ", weakness: "Low CMJ Height", prescription: "4×4 @ 20% body weight, maximal intent" },
      { exercise: "Pogo Jump", weakness: "Low Reactive Strength", prescription: "3×10, rapid ground contact < 200ms" },
    ],
    expectedAdaptation: "Increased jump height, improved peak power, faster rate of force development",
  },

  {
    id: 8,
    name: "Squat Jump",
    category: "Power",
    description: "Measures pure concentric lower body power from a static squat position with no countermovement pre-loading. Isolates starting strength.",
    metric: "Jump Height",
    unit: "cm",
    sportRelevance: ["Basketball", "Football", "Powerlifting", "Track & Field"],
    difficulty: "Beginner",
    equipmentRequired: ["Force Plate", "Jump Mat"],
    normativeData: {
      elite: "> 60cm (males)",
      good: "50–60cm (males)",
      average: "38–50cm (males)",
      below: "< 38cm (males)",
    },
    qualities: [
      { quality: "Starting Strength", linkType: "measures" },
      { quality: "Concentric Power", linkType: "measures" },
      { quality: "Rate of Force Development", linkType: "reflects" },
    ],
    methods: [
      { method: "Dynamic Effort Method", weakness: "Low Squat Jump Height", priority: 1 },
      { method: "Rate of Force Development Training", weakness: "Low Starting Strength", priority: 2 },
    ],
    products: [
      { product: "Force Plate Dual", role: "recommended" },
      { product: "Jump Mat", role: "alternative" },
    ],
    exercises: [
      { exercise: "Paused Squat Jump", weakness: "Low Squat Jump Height", prescription: "4×4 @ 0% load, 2s pause at bottom" },
      { exercise: "Trap Bar Jump", weakness: "Low Starting Strength", prescription: "4×4 @ 20% body weight, max intent" },
      { exercise: "Box Squat", weakness: "Low Starting Strength", prescription: "4×4 @ 60% 1RM, max speed concentric" },
    ],
    expectedAdaptation: "Increased starting strength, higher squat jump height, improved concentric rate of force development",
  },

  {
    id: 9,
    name: "Broad Jump",
    category: "Power",
    description: "Horizontal power test measuring how far an athlete can jump forward from a bilateral standing position. Strongly correlated with sprint speed.",
    metric: "Distance",
    unit: "cm / inches",
    sportRelevance: ["Football", "Soccer", "Rugby", "General Athletic"],
    difficulty: "Beginner",
    equipmentRequired: ["Measuring Tape", "Landing Mat"],
    normativeData: {
      elite: "> 280cm (males)",
      good: "250–280cm (males)",
      average: "220–250cm (males)",
      below: "< 220cm (males)",
      note: "NFL Combine average: ~105 inches (266cm)",
    },
    qualities: [
      { quality: "Horizontal Power", linkType: "measures" },
      { quality: "Horizontal Force Production", linkType: "reflects" },
    ],
    methods: [
      { method: "Resisted Sprint Training", weakness: "Poor Broad Jump Distance", priority: 1 },
      { method: "Plyometric Training", weakness: "Poor Broad Jump Distance", priority: 2 },
    ],
    products: [
      { product: "Sprint Sled", role: "recommended" },
      { product: "Plyo Box Set", role: "recommended" },
    ],
    exercises: [
      { exercise: "Broad Jump", weakness: "Poor Broad Jump Distance", prescription: "4×5 max effort, full recovery" },
      { exercise: "Horizontal Bound", weakness: "Poor Horizontal Power", prescription: "3×5 each leg, max distance" },
      { exercise: "Loaded Broad Jump", weakness: "Poor Horizontal Power", prescription: "3×4 @ 10% body weight, max distance" },
    ],
    expectedAdaptation: "Greater horizontal jump distance, improved horizontal force production, faster sprint times",
  },

  {
    id: 10,
    name: "Triple Hop for Distance",
    category: "Power",
    description: "Three consecutive single-leg hops for maximum distance. Tests unilateral horizontal power, reactive strength, and limb symmetry.",
    metric: "Distance",
    unit: "cm",
    sportRelevance: ["Track & Field", "Soccer", "Basketball", "Rugby"],
    difficulty: "Intermediate",
    equipmentRequired: ["Measuring Tape", "Non-slip Surface"],
    normativeData: {
      elite: "> 650cm dominant leg",
      good: "580–650cm",
      average: "480–580cm",
      below: "< 480cm",
      note: "Asymmetry > 10% = injury risk flag",
    },
    qualities: [
      { quality: "Reactive Strength", linkType: "measures" },
      { quality: "Unilateral Power", linkType: "measures" },
      { quality: "Limb Symmetry", linkType: "reflects" },
    ],
    methods: [
      { method: "Elastic Reactive Training", weakness: "Poor Triple Hop Distance", priority: 1 },
      { method: "Plyometric Training", weakness: "Poor Triple Hop Distance", priority: 2 },
      { method: "Eccentric Overload Training", weakness: "Limb Asymmetry", priority: 3 },
    ],
    products: [
      { product: "Plyometric Hurdles", role: "recommended" },
      { product: "Flywheel Training Device", role: "recommended" },
      { product: "Force Plate Dual", role: "alternative" },
    ],
    exercises: [
      { exercise: "Single-Leg Bound", weakness: "Poor Triple Hop Distance", prescription: "3×5 each leg, max horizontal distance" },
      { exercise: "Hurdle Hop (Single Leg)", weakness: "Poor Triple Hop Distance", prescription: "3×6 each, 4 hurdles, min ground contact" },
      { exercise: "Nordic Hamstring Curl", weakness: "Limb Asymmetry", prescription: "3×5 each leg separately" },
    ],
    expectedAdaptation: "Greater triple hop distance, reduced asymmetry, improved reactive strength index",
  },

  {
    id: 11,
    name: "Reactive Strength Index",
    category: "Power",
    description: "Measures the ratio of jump height to ground contact time in a drop jump. The gold standard metric for plyometric efficiency.",
    metric: "RSI Score",
    unit: "ratio (m/s)",
    sportRelevance: ["Track & Field", "Basketball", "Football", "Soccer"],
    difficulty: "Intermediate",
    equipmentRequired: ["Force Plate", "Jump Mat"],
    normativeData: {
      elite: "> 2.50 RSI",
      good: "2.00–2.50",
      average: "1.50–2.00",
      below: "< 1.50",
      note: "Elite sprinters often > 3.0 RSI",
    },
    qualities: [
      { quality: "Reactive Strength", linkType: "measures" },
      { quality: "Tendon Stiffness", linkType: "reflects" },
      { quality: "Ankle Stiffness", linkType: "reflects" },
    ],
    methods: [
      { method: "Elastic Reactive Training", weakness: "Low RSI", priority: 1 },
      { method: "Plyometric Training", weakness: "Low RSI", priority: 2 },
    ],
    products: [
      { product: "Force Plate Dual", role: "required" },
      { product: "Jump Mat", role: "alternative" },
    ],
    exercises: [
      { exercise: "Pogo Jump", weakness: "Low RSI", prescription: "3×10, contact < 200ms, minimal knee bend" },
      { exercise: "Depth Jump", weakness: "Low RSI", prescription: "4×5 from 40cm, minimal ground contact" },
      { exercise: "Repeated Bounds", weakness: "Low RSI", prescription: "3×8, fast, stiff ankle, minimal knee bend" },
    ],
    expectedAdaptation: "Higher RSI score, shorter ground contact time, increased tendon-spring utilization",
  },

  // ─── STRENGTH ───────────────────────────────────────────────────────────────

  {
    id: 12,
    name: "Trap Bar Peak Force",
    category: "Strength",
    description: "Isometric or dynamic peak force measurement on a trap bar. Quantifies absolute lower body force output without the technical demands of a barbell.",
    metric: "Peak Force",
    unit: "N or kg",
    sportRelevance: ["Football", "Rugby", "Powerlifting", "General Strength"],
    difficulty: "Intermediate",
    equipmentRequired: ["Trap Bar (Hex Bar)", "Force Plate"],
    normativeData: {
      elite: "> 3.0× body weight",
      good: "2.5–3.0× body weight",
      average: "2.0–2.5× body weight",
      below: "< 2.0× body weight",
    },
    qualities: [
      { quality: "Maximal Strength", linkType: "measures" },
      { quality: "Structural Strength", linkType: "reflects" },
    ],
    methods: [
      { method: "Maximal Effort Method", weakness: "Low Peak Force", priority: 1 },
      { method: "Submaximal Effort Method", weakness: "Low Peak Force", priority: 2 },
    ],
    products: [
      { product: "Trap Bar (Hex Bar)", role: "required" },
      { product: "Force Plate Dual", role: "recommended" },
    ],
    exercises: [
      { exercise: "Trap Bar Deadlift", weakness: "Low Peak Force", prescription: "4×3 @ 85–90% 1RM, controlled descent" },
      { exercise: "Romanian Deadlift", weakness: "Low Peak Force", prescription: "3×6 @ 70% 1RM, full hip hinge" },
    ],
    expectedAdaptation: "Increased peak force output, greater structural strength base, improved sport transfer",
  },

  {
    id: 13,
    name: "Isometric Mid-Thigh Pull",
    category: "Strength",
    description: "Maximal isometric pulling force against a fixed bar at mid-thigh position. The most reliable force measurement test in strength science.",
    metric: "Peak Force",
    unit: "N",
    sportRelevance: ["All Strength Sports", "Rugby", "Football", "General Strength"],
    difficulty: "Advanced",
    equipmentRequired: ["Power Rack", "Force Plate", "Isometric Bar Setup"],
    normativeData: {
      elite: "> 4500N (males)",
      good: "3500–4500N",
      average: "2500–3500N",
      below: "< 2500N",
    },
    qualities: [
      { quality: "Maximal Strength", linkType: "measures" },
      { quality: "Rate of Force Development", linkType: "measures" },
      { quality: "Neural Drive", linkType: "reflects" },
    ],
    methods: [
      { method: "Isometric Training", weakness: "Low IMTP Force", priority: 1 },
      { method: "Maximal Effort Method", weakness: "Low IMTP Force", priority: 2 },
      { method: "Rate of Force Development Training", weakness: "Low RFD", priority: 3 },
    ],
    products: [
      { product: "Power Rack", role: "required" },
      { product: "Force Plate Dual", role: "required" },
      { product: "Isometric Training Belt", role: "recommended" },
    ],
    exercises: [
      { exercise: "Isometric Pull", weakness: "Low IMTP Force", prescription: "5×5s maximal isometric pulls, full recovery" },
      { exercise: "Heavy Deadlift", weakness: "Low IMTP Force", prescription: "4×2 @ 90–95% 1RM" },
      { exercise: "Rack Pull", weakness: "Low IMTP Force", prescription: "4×3 @ 90% 1RM from mid-thigh" },
    ],
    expectedAdaptation: "Greater peak isometric force, faster rate of force development, improved neural drive",
  },

  {
    id: 14,
    name: "5RM Trap Bar Deadlift",
    category: "Strength",
    description: "5-repetition maximum on the trap bar. A practical measure of maximal strength with less technical error than conventional barbell testing.",
    metric: "Load",
    unit: "kg",
    sportRelevance: ["General Strength", "Football", "Rugby", "All Team Sports"],
    difficulty: "Intermediate",
    equipmentRequired: ["Trap Bar (Hex Bar)", "Weight Plates"],
    normativeData: {
      elite: "> 200kg (males)",
      good: "160–200kg",
      average: "120–160kg",
      below: "< 120kg",
    },
    qualities: [
      { quality: "Maximal Strength", linkType: "measures" },
      { quality: "Structural Strength", linkType: "measures" },
    ],
    methods: [
      { method: "Maximal Effort Method", weakness: "Low 5RM", priority: 1 },
      { method: "Submaximal Effort Method", weakness: "Low 5RM", priority: 2 },
      { method: "Conjugate Method", weakness: "Low 5RM", priority: 3 },
    ],
    products: [
      { product: "Trap Bar (Hex Bar)", role: "required" },
      { product: "Calibrated Olympic Plates", role: "recommended" },
    ],
    exercises: [
      { exercise: "Trap Bar Deadlift", weakness: "Low 5RM", prescription: "4×4 @ 80% 1RM, 3 min rest" },
      { exercise: "Romanian Deadlift", weakness: "Low 5RM", prescription: "3×8 @ 65% 1RM, eccentric focus" },
      { exercise: "Leg Press", weakness: "Low 5RM", prescription: "3×8 high load, full range" },
    ],
    expectedAdaptation: "Increased 5RM load, greater structural strength, improved transfer to sport-specific force demands",
  },

  {
    id: 15,
    name: "1RM Back Squat",
    category: "Strength",
    description: "Maximum single repetition back squat. The benchmark for lower body maximal strength assessment in strength sports and team sports.",
    metric: "Load",
    unit: "kg",
    sportRelevance: ["Powerlifting", "Football", "Rugby", "Weightlifting"],
    difficulty: "Advanced",
    equipmentRequired: ["Power Rack", "Barbell", "Weight Plates"],
    normativeData: {
      elite: "> 2.0× body weight",
      good: "1.5–2.0× body weight",
      average: "1.0–1.5× body weight",
      below: "< 1.0× body weight",
    },
    qualities: [
      { quality: "Maximal Strength", linkType: "measures" },
      { quality: "Structural Strength", linkType: "measures" },
    ],
    methods: [
      { method: "Maximal Effort Method", weakness: "Low 1RM Squat", priority: 1 },
      { method: "Conjugate Method", weakness: "Low 1RM Squat", priority: 2 },
    ],
    products: [
      { product: "Power Rack", role: "required" },
      { product: "Calibrated Olympic Plates", role: "recommended" },
      { product: "Bands & Chains Kit", role: "alternative" },
    ],
    exercises: [
      { exercise: "Back Squat", weakness: "Low 1RM Squat", prescription: "4×3 @ 85–90% 1RM, full depth" },
      { exercise: "Box Squat", weakness: "Low 1RM Squat", prescription: "4×2 @ 90% 1RM, controlled descent" },
      { exercise: "Paused Squat", weakness: "Low 1RM Squat", prescription: "3×3 @ 75% 1RM, 3s pause at bottom" },
    ],
    expectedAdaptation: "Increased 1RM, greater neural drive, improved sport-specific structural strength",
  },

  {
    id: 16,
    name: "Grip Strength",
    category: "Strength",
    description: "Handgrip dynamometer test measuring maximal isometric grip force. A strong independent predictor of overall body strength and health.",
    metric: "Force",
    unit: "kg",
    sportRelevance: ["Rugby", "Wrestling", "Climbing", "Football", "General Athletic"],
    difficulty: "Beginner",
    equipmentRequired: ["Handgrip Dynamometer"],
    normativeData: {
      elite: "> 60kg (males), > 45kg (females)",
      good: "50–60kg (males), 35–45kg (females)",
      average: "40–50kg (males), 25–35kg (females)",
      below: "< 40kg (males), < 25kg (females)",
    },
    qualities: [
      { quality: "Grip Strength", linkType: "measures" },
      { quality: "Structural Strength", linkType: "reflects" },
    ],
    methods: [
      { method: "Maximal Effort Method", weakness: "Weak Grip", priority: 1 },
      { method: "Loaded Carry Training", weakness: "Weak Grip", priority: 2 },
    ],
    products: [
      { product: "Farmer's Walk Handles", role: "recommended" },
      { product: "Thick Bar Attachments", role: "alternative" },
    ],
    exercises: [
      { exercise: "Farmer's Walk", weakness: "Weak Grip", prescription: "4×30m heavy load" },
      { exercise: "Dead Hang", weakness: "Weak Grip", prescription: "3×max time, full bodyweight" },
      { exercise: "Barbell Hold", weakness: "Weak Grip", prescription: "3×30s at 80% 1RM deadlift" },
    ],
    expectedAdaptation: "Stronger grip, improved sport transfer for contact sports and implement-based sports",
  },

  // ─── MOBILITY ───────────────────────────────────────────────────────────────

  {
    id: 17,
    name: "Ankle Dorsiflexion",
    category: "Mobility",
    description: "Weight-bearing lunge test measuring tibial inclination. Ankle dorsiflexion range directly limits squat depth, sprint mechanics, and change of direction.",
    metric: "Distance or Angle",
    unit: "cm (from wall) or degrees",
    sportRelevance: ["All Sports"],
    difficulty: "Beginner",
    equipmentRequired: ["Wall", "Measuring Tape"],
    normativeData: {
      elite: "> 12cm (weight-bearing lunge)",
      good: "10–12cm",
      average: "7–10cm",
      below: "< 7cm",
      note: "< 10cm associated with injury risk",
    },
    qualities: [
      { quality: "Ankle Mobility", linkType: "measures" },
      { quality: "Ankle Dorsiflexion Range", linkType: "measures" },
    ],
    methods: [
      { method: "Mobility Training", weakness: "Restricted Ankle Dorsiflexion", priority: 1 },
    ],
    products: [
      { product: "Resistance Bands Set", role: "recommended" },
      { product: "Foam Roller Set", role: "recommended" },
    ],
    exercises: [
      { exercise: "Banded Ankle Mobilization", weakness: "Restricted Ankle Dorsiflexion", prescription: "3×30s each ankle, band distraction" },
      { exercise: "Wall Ankle Stretch", weakness: "Restricted Ankle Dorsiflexion", prescription: "3×30s each, progressive lean" },
      { exercise: "Calf Foam Roll", weakness: "Restricted Ankle Dorsiflexion", prescription: "2 min each leg, slow rolling" },
    ],
    expectedAdaptation: "Increased dorsiflexion range, improved squat depth, reduced Achilles and knee injury risk",
  },

  {
    id: 18,
    name: "Hip Internal Rotation",
    category: "Mobility",
    description: "Supine or prone hip internal rotation range of motion. Restricted hip IR is correlated with low back pain, hip impingement, and sprint dysfunction.",
    metric: "Range of Motion",
    unit: "degrees",
    sportRelevance: ["All Sports", "Running", "Soccer", "Golf"],
    difficulty: "Beginner",
    equipmentRequired: ["Goniometer", "Treatment Table"],
    normativeData: {
      elite: "> 40° each hip",
      good: "30–40°",
      average: "20–30°",
      below: "< 20°",
      note: "Asymmetry > 15° = injury risk",
    },
    qualities: [
      { quality: "Hip Mobility", linkType: "measures" },
      { quality: "Hip Internal Rotation", linkType: "measures" },
    ],
    methods: [
      { method: "Mobility Training", weakness: "Restricted Hip Internal Rotation", priority: 1 },
    ],
    products: [
      { product: "Resistance Bands Set", role: "recommended" },
      { product: "Foam Roller Set", role: "recommended" },
    ],
    exercises: [
      { exercise: "Hip IR Stretch (90/90)", weakness: "Restricted Hip Internal Rotation", prescription: "3×60s each hip, active and passive holds" },
      { exercise: "Pigeon Pose", weakness: "Restricted Hip Internal Rotation", prescription: "3×60s each, progressive intensity" },
      { exercise: "Hip Capsule Mob", weakness: "Restricted Hip Internal Rotation", prescription: "2×15 reps each side, banded" },
    ],
    expectedAdaptation: "Increased hip IR range, reduced hip impingement risk, better sprint hip mechanics",
  },

  {
    id: 19,
    name: "Shoulder Flexion",
    category: "Mobility",
    description: "Overhead shoulder flexion range of motion. Limits overhead pressing, throwing mechanics, and swimming efficiency.",
    metric: "Range of Motion",
    unit: "degrees",
    sportRelevance: ["Swimming", "Baseball", "Tennis", "Volleyball", "CrossFit"],
    difficulty: "Beginner",
    equipmentRequired: ["Goniometer"],
    normativeData: {
      elite: "> 180°",
      good: "170–180°",
      average: "160–170°",
      below: "< 160°",
    },
    qualities: [
      { quality: "Shoulder Mobility", linkType: "measures" },
      { quality: "Thoracic Extension", linkType: "reflects" },
    ],
    methods: [
      { method: "Mobility Training", weakness: "Restricted Shoulder Flexion", priority: 1 },
    ],
    products: [
      { product: "Resistance Bands Set", role: "recommended" },
      { product: "Foam Roller Set", role: "recommended" },
    ],
    exercises: [
      { exercise: "Overhead Band Stretch", weakness: "Restricted Shoulder Flexion", prescription: "3×30s each arm" },
      { exercise: "T-Spine Extension on Roller", weakness: "Restricted Shoulder Flexion", prescription: "2 min, segment by segment" },
      { exercise: "Wall Slide", weakness: "Restricted Shoulder Flexion", prescription: "3×10, scapular control focus" },
    ],
    expectedAdaptation: "Full overhead range, improved throwing and pressing mechanics",
  },

  {
    id: 20,
    name: "Overhead Squat Assessment",
    category: "Movement Quality",
    description: "Bodyweight squat with arms overhead. Reveals compensations across the entire kinetic chain — from ankles through hips, spine, and shoulders.",
    metric: "Movement Quality Score",
    unit: "qualitative (0–3)",
    sportRelevance: ["All Sports", "CrossFit", "Olympic Weightlifting"],
    difficulty: "Beginner",
    equipmentRequired: ["Dowel Rod"],
    normativeData: {
      elite: "3 — No compensations",
      good: "2 — Minor compensations",
      average: "1 — Major compensation, pain-free",
      below: "0 — Pain during movement",
    },
    qualities: [
      { quality: "Movement Quality", linkType: "measures" },
      { quality: "Ankle Mobility", linkType: "reflects" },
      { quality: "Hip Mobility", linkType: "reflects" },
      { quality: "Thoracic Mobility", linkType: "reflects" },
    ],
    methods: [
      { method: "Mobility Training", weakness: "Poor Overhead Squat Pattern", priority: 1 },
      { method: "Isometric Training", weakness: "Poor Overhead Squat Pattern", priority: 2 },
    ],
    products: [
      { product: "Foam Roller Set", role: "recommended" },
      { product: "Resistance Bands Set", role: "recommended" },
    ],
    exercises: [
      { exercise: "Wall-Facing Squat", weakness: "Poor Overhead Squat Pattern", prescription: "3×8, 2 inches from wall, bodyweight" },
      { exercise: "Goblet Squat", weakness: "Poor Overhead Squat Pattern", prescription: "3×10, light load, exaggerated depth" },
      { exercise: "Banded Good Morning", weakness: "Poor Overhead Squat Pattern", prescription: "3×10, hip hinge pattern reinforcement" },
    ],
    expectedAdaptation: "Improved movement quality score, reduced compensations, injury risk reduction",
  },

  // ─── CONDITIONING ───────────────────────────────────────────────────────────

  {
    id: 21,
    name: "VO2 Max Test (Beep Test)",
    category: "Conditioning",
    description: "Progressive multi-stage shuttle run to exhaustion. Estimates maximal aerobic capacity — the ceiling for sustained sport performance.",
    metric: "Estimated VO2 Max",
    unit: "ml/kg/min",
    sportRelevance: ["Soccer", "Rugby", "Hockey", "Basketball", "Endurance Sports"],
    difficulty: "Advanced",
    equipmentRequired: ["Audio Device", "Cones", "20m Track"],
    normativeData: {
      elite: "> 60 ml/kg/min (males)",
      good: "50–60 ml/kg/min",
      average: "40–50 ml/kg/min",
      below: "< 40 ml/kg/min",
    },
    qualities: [
      { quality: "Aerobic Capacity", linkType: "measures" },
      { quality: "Cardiac Output", linkType: "reflects" },
      { quality: "Lactate Threshold", linkType: "reflects" },
    ],
    methods: [
      { method: "Aerobic Base Building", weakness: "Low VO2 Max", priority: 1 },
      { method: "High-Intensity Interval Training", weakness: "Low VO2 Max", priority: 2 },
      { method: "Lactate Threshold Training", weakness: "Low VO2 Max", priority: 3 },
    ],
    products: [
      { product: "VO2 Max Analyzer", role: "recommended" },
      { product: "Heart Rate Monitor Chest Strap", role: "recommended" },
      { product: "Rowing Machine", role: "alternative" },
    ],
    exercises: [
      { exercise: "Tempo Run", weakness: "Low VO2 Max", prescription: "3×8–12 min @ 65–75% max HR, 2 min rest" },
      { exercise: "Long Interval Run", weakness: "Low VO2 Max", prescription: "4×4 min @ 90–95% max HR, 3 min rest" },
    ],
    expectedAdaptation: "Higher VO2 Max, improved lactate threshold, greater sustained work capacity",
  },

  {
    id: 22,
    name: "Yo-Yo Intermittent Recovery Test",
    category: "Conditioning",
    description: "Repeated shuttle run with active recovery periods. Measures the ability to recover between high-intensity efforts — the key demand of team sports.",
    metric: "Total Distance",
    unit: "meters",
    sportRelevance: ["Soccer", "Rugby", "Hockey", "Basketball"],
    difficulty: "Advanced",
    equipmentRequired: ["Audio Device", "Cones"],
    normativeData: {
      elite: "> 2400m (Level 1)",
      good: "1800–2400m",
      average: "1200–1800m",
      below: "< 1200m",
      note: "Elite soccer players: 1800–2200m Level 2",
    },
    qualities: [
      { quality: "Repeated Sprint Ability", linkType: "measures" },
      { quality: "Aerobic Power", linkType: "measures" },
      { quality: "Metabolic Recovery", linkType: "reflects" },
    ],
    methods: [
      { method: "Repeated Sprint Ability", weakness: "Poor Yo-Yo Score", priority: 1 },
      { method: "High-Intensity Interval Training", weakness: "Poor Yo-Yo Score", priority: 2 },
    ],
    products: [
      { product: "Assault Air Bike", role: "recommended" },
      { product: "Heart Rate Monitor Chest Strap", role: "recommended" },
    ],
    exercises: [
      { exercise: "Repeated Sprint (6×40m)", weakness: "Poor Yo-Yo Score", prescription: "6×40m, 30s rest, near-max effort" },
      { exercise: "Bike HIIT", weakness: "Poor Yo-Yo Score", prescription: "8×30s all-out / 30s easy" },
    ],
    expectedAdaptation: "Improved Yo-Yo distance, faster metabolic recovery, greater repeated sprint capacity",
  },

  {
    id: 23,
    name: "300-Yard Shuttle",
    category: "Conditioning",
    description: "Six 25-yard shuttles (out and back) for total time. Tests repeated speed and metabolic conditioning under fatigue — widely used in football.",
    metric: "Time",
    unit: "seconds",
    sportRelevance: ["Football", "Basketball", "Lacrosse"],
    difficulty: "Advanced",
    equipmentRequired: ["Cones", "Stopwatch"],
    normativeData: {
      elite: "< 52s (males)",
      good: "52–56s",
      average: "57–62s",
      below: "> 62s",
    },
    qualities: [
      { quality: "Speed Endurance", linkType: "measures" },
      { quality: "Anaerobic Capacity", linkType: "measures" },
    ],
    methods: [
      { method: "Repeated Sprint Ability", weakness: "Poor 300-Yard Shuttle Time", priority: 1 },
      { method: "Energy System Development", weakness: "Poor 300-Yard Shuttle Time", priority: 2 },
    ],
    products: [
      { product: "Prowler Push Sled", role: "recommended" },
      { product: "Assault Air Bike", role: "recommended" },
    ],
    exercises: [
      { exercise: "Repeated Shuttle Sprint", weakness: "Poor 300-Yard Shuttle Time", prescription: "4 sets of 300-yard simulation, 5 min rest" },
      { exercise: "Prowler Push", weakness: "Poor 300-Yard Shuttle Time", prescription: "6×20m moderate load, 30s rest" },
    ],
    expectedAdaptation: "Faster shuttle time, greater glycolytic power, improved lactate tolerance",
  },

  // ─── RECOVERY ───────────────────────────────────────────────────────────────

  {
    id: 24,
    name: "Heart Rate Variability",
    category: "Recovery",
    description: "Beat-to-beat variation in heart rate, reflecting autonomic nervous system balance. Low HRV signals accumulated stress and poor recovery.",
    metric: "RMSSD",
    unit: "ms",
    sportRelevance: ["All Sports"],
    difficulty: "Beginner",
    equipmentRequired: ["HRV Monitor", "Heart Rate Monitor Chest Strap"],
    normativeData: {
      elite: "> 80ms RMSSD",
      good: "60–80ms",
      average: "40–60ms",
      below: "< 40ms",
      note: "Individual baselines matter more than population norms",
    },
    qualities: [
      { quality: "Recovery Quality", linkType: "measures" },
      { quality: "Autonomic Nervous System Balance", linkType: "reflects" },
    ],
    methods: [
      { method: "Aerobic Base Building", weakness: "Low HRV", priority: 1 },
    ],
    products: [
      { product: "HRV Monitor", role: "required" },
      { product: "Heart Rate Monitor Chest Strap", role: "recommended" },
    ],
    exercises: [
      { exercise: "Zone 2 Walk", weakness: "Low HRV", prescription: "30–45 min easy walk, HR < 130" },
      { exercise: "Nasal Breathing Run", weakness: "Low HRV", prescription: "20–30 min nasal-only breathing, easy pace" },
    ],
    expectedAdaptation: "Improved HRV score, better autonomic recovery, reduced overtraining risk",
  },

  {
    id: 25,
    name: "Resting Heart Rate",
    category: "Recovery",
    description: "Morning resting heart rate measured upon waking. A chronically elevated RHR indicates inadequate recovery or accumulated training stress.",
    metric: "Heart Rate",
    unit: "bpm",
    sportRelevance: ["All Sports"],
    difficulty: "Beginner",
    equipmentRequired: ["Heart Rate Monitor"],
    normativeData: {
      elite: "< 45 bpm",
      good: "45–55 bpm",
      average: "56–70 bpm",
      below: "> 70 bpm",
    },
    qualities: [
      { quality: "Cardiac Efficiency", linkType: "reflects" },
      { quality: "Recovery Quality", linkType: "measures" },
    ],
    methods: [
      { method: "Aerobic Base Building", weakness: "Elevated RHR", priority: 1 },
    ],
    products: [
      { product: "Heart Rate Monitor Chest Strap", role: "recommended" },
      { product: "Wearable Performance Monitor", role: "alternative" },
    ],
    exercises: [
      { exercise: "Long Slow Distance Run", weakness: "Elevated RHR", prescription: "45–60 min @ 60–65% max HR, 3–4×/week" },
    ],
    expectedAdaptation: "Lower resting heart rate, improved cardiac efficiency, better recovery between sessions",
  },

  {
    id: 26,
    name: "Sleep Quality Score",
    category: "Recovery",
    description: "Composite score from wearable devices measuring sleep duration, efficiency, and stage distribution. Sleep is the primary driver of adaptation.",
    metric: "Sleep Score",
    unit: "score (0–100)",
    sportRelevance: ["All Sports"],
    difficulty: "Beginner",
    equipmentRequired: ["Wearable Sleep Tracker"],
    normativeData: {
      elite: "> 85 / > 8h",
      good: "75–85 / 7–8h",
      average: "60–75 / 6–7h",
      below: "< 60 / < 6h",
    },
    qualities: [
      { quality: "Recovery Quality", linkType: "measures" },
      { quality: "Adaptation Potential", linkType: "reflects" },
    ],
    methods: [
      { method: "Aerobic Base Building", weakness: "Poor Sleep Quality", priority: 1 },
    ],
    products: [
      { product: "Sleep & Recovery Wearable", role: "required" },
    ],
    exercises: [
      { exercise: "Evening Walk", weakness: "Poor Sleep Quality", prescription: "15–20 min easy walk post-dinner" },
    ],
    expectedAdaptation: "Better sleep quality, improved hormonal recovery, enhanced next-day performance",
  },

  // ─── READINESS ──────────────────────────────────────────────────────────────

  {
    id: 27,
    name: "CMJ Readiness",
    category: "Readiness",
    description: "Countermovement jump compared against individual baseline. A drop > 5–10% from personal best signals neuromuscular fatigue and readiness impairment.",
    metric: "% Change from Baseline",
    unit: "%",
    sportRelevance: ["All Sports"],
    difficulty: "Beginner",
    equipmentRequired: ["Force Plate", "Jump Mat"],
    normativeData: {
      elite: "Within 3% of personal best",
      good: "3–5% below baseline",
      average: "5–10% below baseline",
      below: "> 10% below baseline",
      note: "Protocol: 3 jumps, highest retained, compare to 4-week rolling average",
    },
    qualities: [
      { quality: "Neuromuscular Readiness", linkType: "measures" },
      { quality: "Central Fatigue", linkType: "reflects" },
    ],
    methods: [
      { method: "Aerobic Base Building", weakness: "Low CMJ Readiness", priority: 1 },
    ],
    products: [
      { product: "Force Plate Dual", role: "recommended" },
      { product: "Jump Mat", role: "alternative" },
    ],
    exercises: [
      { exercise: "Light Movement Flow", weakness: "Low CMJ Readiness", prescription: "10–15 min easy mobility and light movement" },
    ],
    expectedAdaptation: "Restored neuromuscular baseline, improved training quality, injury risk reduction",
  },

  {
    id: 28,
    name: "Subjective Wellness Score",
    category: "Readiness",
    description: "Athlete-reported composite of sleep, fatigue, mood, motivation, and muscle soreness. Validated alongside HRV and CMJ for readiness screening.",
    metric: "Composite Score",
    unit: "1–10 scale",
    sportRelevance: ["All Sports"],
    difficulty: "Beginner",
    equipmentRequired: ["Questionnaire"],
    normativeData: {
      elite: "8–10",
      good: "6–7",
      average: "4–5",
      below: "< 4",
    },
    qualities: [
      { quality: "Subjective Readiness", linkType: "measures" },
      { quality: "Psychological Readiness", linkType: "reflects" },
    ],
    methods: [
      { method: "Tempo Running", weakness: "Low Subjective Wellness", priority: 1 },
    ],
    products: [
      { product: "Athlete Monitoring Software", role: "recommended" },
    ],
    exercises: [
      { exercise: "Restorative Walk", weakness: "Low Subjective Wellness", prescription: "20–30 min easy outdoor walk" },
    ],
    expectedAdaptation: "Higher subjective wellness scores, improved mood/motivation, better training adherence",
  },

  {
    id: 29,
    name: "Acute:Chronic Workload Ratio",
    category: "Readiness",
    description: "Ratio of acute (7-day) to chronic (28-day) training load. An ACWR of 0.8–1.3 indicates optimal training; > 1.5 signals injury risk zone.",
    metric: "ACWR Ratio",
    unit: "ratio",
    sportRelevance: ["All Sports"],
    difficulty: "Intermediate",
    equipmentRequired: ["Training Load Tracker"],
    normativeData: {
      elite: "0.8–1.3",
      good: "0.8–1.3",
      average: "1.3–1.5 (elevated risk)",
      below: "> 1.5 (high injury risk)",
    },
    qualities: [
      { quality: "Training Load Balance", linkType: "measures" },
      { quality: "Injury Risk", linkType: "reflects" },
    ],
    methods: [
      { method: "Energy System Development", weakness: "Poor ACWR", priority: 1 },
    ],
    products: [
      { product: "Wearable Performance Monitor", role: "recommended" },
    ],
    exercises: [
      { exercise: "Reduced Load Session", weakness: "Poor ACWR", prescription: "40% volume reduction, maintain movement patterns" },
    ],
    expectedAdaptation: "Normalized ACWR ratio, reduced injury risk, sustainable long-term development",
  },

  // ─── MOVEMENT QUALITY ───────────────────────────────────────────────────────

  {
    id: 30,
    name: "Functional Movement Screen",
    category: "Movement Quality",
    description: "7-test battery assessing fundamental movement patterns. Identifies mobility, stability, and asymmetry limitations. Score < 14 predicts elevated injury risk.",
    metric: "Composite Score",
    unit: "0–21",
    sportRelevance: ["All Sports"],
    difficulty: "Beginner",
    equipmentRequired: ["FMS Kit", "Dowel Rod"],
    normativeData: {
      elite: "> 17",
      good: "15–17",
      average: "14–15",
      below: "< 14",
      note: "Any asymmetry score = 0 priority regardless of composite",
    },
    qualities: [
      { quality: "Movement Quality", linkType: "measures" },
      { quality: "Injury Risk", linkType: "reflects" },
    ],
    methods: [
      { method: "Mobility Training", weakness: "Low FMS Score", priority: 1 },
      { method: "Isometric Training", weakness: "Low FMS Score", priority: 2 },
    ],
    products: [
      { product: "Foam Roller Set", role: "recommended" },
      { product: "Resistance Bands Set", role: "recommended" },
    ],
    exercises: [
      { exercise: "Deep Squat Stretch", weakness: "Low FMS Score", prescription: "3×30s, goblet hold, heels elevated if needed" },
      { exercise: "Single-Leg Balance", weakness: "Low FMS Score", prescription: "3×30s each, eyes open then closed" },
    ],
    expectedAdaptation: "Higher FMS composite score, reduced asymmetry, lower injury incidence",
  },

  {
    id: 31,
    name: "Single-Leg Squat Test",
    category: "Movement Quality",
    description: "Observational single-leg squat assessing knee tracking, hip control, and trunk stability. A critical screening tool for lower extremity injury risk.",
    metric: "Movement Quality Score",
    unit: "qualitative (Pass/Fail + compensation count)",
    sportRelevance: ["All Sports", "Running", "Basketball"],
    difficulty: "Beginner",
    equipmentRequired: ["No equipment required"],
    normativeData: {
      elite: "Clean bilateral execution, no compensations",
      good: "1 minor compensation",
      average: "2 compensations",
      below: "3+ compensations or knee valgus",
    },
    qualities: [
      { quality: "Unilateral Stability", linkType: "measures" },
      { quality: "Hip Abductor Strength", linkType: "reflects" },
    ],
    methods: [
      { method: "Eccentric Overload Training", weakness: "Poor Single-Leg Squat", priority: 1 },
      { method: "Isometric Training", weakness: "Poor Single-Leg Squat", priority: 2 },
    ],
    products: [
      { product: "Resistance Bands Set", role: "recommended" },
      { product: "Balance Board", role: "alternative" },
    ],
    exercises: [
      { exercise: "Bulgarian Split Squat", weakness: "Poor Single-Leg Squat", prescription: "3×8 each, rear foot elevated, controlled" },
      { exercise: "Lateral Band Walk", weakness: "Poor Single-Leg Squat", prescription: "3×15 steps each direction, mini band" },
      { exercise: "Glute Bridge Single Leg", weakness: "Poor Single-Leg Squat", prescription: "3×12 each, full hip extension" },
    ],
    expectedAdaptation: "Cleaner single-leg squat pattern, reduced knee valgus, better glute activation",
  },

  {
    id: 32,
    name: "Hip Flexor Length Test",
    category: "Mobility",
    description: "Thomas Test or modified lunge measurement assessing hip flexor extensibility. Tight hip flexors impair sprint mechanics and posterior chain activation.",
    metric: "Degree of Extension",
    unit: "degrees",
    sportRelevance: ["All Sports", "Running", "Cycling"],
    difficulty: "Beginner",
    equipmentRequired: ["Treatment Table", "Goniometer"],
    normativeData: {
      elite: "Full thigh below horizontal",
      good: "Thigh at horizontal",
      average: "Thigh slightly above horizontal",
      below: "Thigh well above horizontal",
    },
    qualities: [
      { quality: "Hip Mobility", linkType: "measures" },
      { quality: "Hip Flexor Length", linkType: "measures" },
    ],
    methods: [
      { method: "Mobility Training", weakness: "Tight Hip Flexors", priority: 1 },
    ],
    products: [
      { product: "Foam Roller Set", role: "recommended" },
    ],
    exercises: [
      { exercise: "Half-Kneeling Hip Flexor Stretch", weakness: "Tight Hip Flexors", prescription: "3×60s each, posterior pelvic tilt" },
      { exercise: "Lunge Walk", weakness: "Tight Hip Flexors", prescription: "3×20m, tall posture, full hip extension" },
    ],
    expectedAdaptation: "Greater hip extension range, improved sprint mechanics, better glute activation",
  },

  {
    id: 33,
    name: "Thoracic Rotation Test",
    category: "Mobility",
    description: "Seated thoracic rotation measured by goniometer or visual assessment. Thoracic restriction compensates through lumbar rotation, increasing injury risk.",
    metric: "Range of Motion",
    unit: "degrees each side",
    sportRelevance: ["Golf", "Tennis", "Baseball", "Swimming", "Rowing"],
    difficulty: "Beginner",
    equipmentRequired: ["Chair", "Goniometer"],
    normativeData: {
      elite: "> 50° each side",
      good: "40–50°",
      average: "30–40°",
      below: "< 30°",
    },
    qualities: [
      { quality: "Thoracic Mobility", linkType: "measures" },
      { quality: "Rotational Power Potential", linkType: "reflects" },
    ],
    methods: [
      { method: "Mobility Training", weakness: "Restricted Thoracic Rotation", priority: 1 },
    ],
    products: [
      { product: "Foam Roller Set", role: "recommended" },
    ],
    exercises: [
      { exercise: "Open Book Stretch", weakness: "Restricted Thoracic Rotation", prescription: "3×10 each side, reach for floor" },
      { exercise: "T-Spine Rotation on Roller", weakness: "Restricted Thoracic Rotation", prescription: "2×10 each side" },
    ],
    expectedAdaptation: "Improved thoracic rotation, reduced lumbar compensation, better rotational sport mechanics",
  },

  {
    id: 34,
    name: "Sprint Momentum Test",
    category: "Speed",
    description: "Product of body mass × sprint velocity. Measures the combined contribution of mass and speed, highly relevant for contact sport collision metrics.",
    metric: "Momentum",
    unit: "kg·m/s",
    sportRelevance: ["Football", "Rugby", "Hockey"],
    difficulty: "Intermediate",
    equipmentRequired: ["Timing Gates", "Scale"],
    normativeData: {
      elite: "> 900 kg·m/s",
      good: "750–900 kg·m/s",
      average: "600–750 kg·m/s",
      below: "< 600 kg·m/s",
    },
    qualities: [
      { quality: "Speed", linkType: "measures" },
      { quality: "Physical Dominance", linkType: "reflects" },
    ],
    methods: [
      { method: "Maximal Effort Method", weakness: "Low Sprint Momentum", priority: 1 },
      { method: "Acceleration Development", weakness: "Low Sprint Momentum", priority: 2 },
    ],
    products: [
      { product: "Freelap Timing System", role: "required" },
      { product: "Sprint Sled", role: "recommended" },
    ],
    exercises: [
      { exercise: "Heavy Resisted Sprint", weakness: "Low Sprint Momentum", prescription: "4×20m @ 20–30% body weight" },
    ],
    expectedAdaptation: "Greater sprint momentum, improved physical dominance in contact situations",
  },

  {
    id: 35,
    name: "Push-Up Test",
    category: "Strength",
    description: "Maximum push-ups with controlled tempo. Measures relative upper body pushing strength and shoulder stability endurance.",
    metric: "Repetitions",
    unit: "reps",
    sportRelevance: ["General Athletic", "Military", "Rugby", "Swimming"],
    difficulty: "Beginner",
    equipmentRequired: ["No equipment required"],
    normativeData: {
      elite: "> 50 reps (males), > 35 reps (females)",
      good: "35–50 (males), 25–35 (females)",
      average: "20–35 (males), 15–25 (females)",
      below: "< 20 (males), < 15 (females)",
    },
    qualities: [
      { quality: "Upper Body Strength Endurance", linkType: "measures" },
      { quality: "Shoulder Stability", linkType: "reflects" },
    ],
    methods: [
      { method: "Submaximal Effort Method", weakness: "Low Push-Up Score", priority: 1 },
    ],
    products: [
      { product: "Push-Up Handles", role: "alternative" },
    ],
    exercises: [
      { exercise: "Push-Up", weakness: "Low Push-Up Score", prescription: "4×max reps, controlled 2s descent" },
      { exercise: "Plank", weakness: "Low Push-Up Score", prescription: "3×max time, rigid body alignment" },
    ],
    expectedAdaptation: "Increased push-up reps, improved upper body muscular endurance",
  },

  {
    id: 36,
    name: "Pull-Up Max Test",
    category: "Strength",
    description: "Maximum bodyweight pull-ups. Tests relative upper body pulling strength and grip endurance.",
    metric: "Repetitions",
    unit: "reps",
    sportRelevance: ["Gymnastics", "Climbing", "Military", "Rugby", "Swimming"],
    difficulty: "Intermediate",
    equipmentRequired: ["Pull-Up Bar"],
    normativeData: {
      elite: "> 20 reps",
      good: "15–20",
      average: "8–15",
      below: "< 8",
    },
    qualities: [
      { quality: "Upper Body Pulling Strength", linkType: "measures" },
      { quality: "Grip Strength", linkType: "reflects" },
    ],
    methods: [
      { method: "Maximal Effort Method", weakness: "Low Pull-Up Count", priority: 1 },
      { method: "Loaded Carry Training", weakness: "Weak Grip", priority: 2 },
    ],
    products: [
      { product: "Pull-Up Bar", role: "required" },
    ],
    exercises: [
      { exercise: "Pull-Up", weakness: "Low Pull-Up Count", prescription: "5×max reps, slow descent" },
      { exercise: "Lat Pulldown", weakness: "Low Pull-Up Count", prescription: "3×8 at challenging load" },
    ],
    expectedAdaptation: "More pull-up reps, improved relative pulling strength and scapular stability",
  },

  {
    id: 37,
    name: "Plank Hold Test",
    category: "Strength",
    description: "Isometric plank hold for maximum time. Measures trunk endurance, anti-extension stability, and core stiffness.",
    metric: "Duration",
    unit: "seconds",
    sportRelevance: ["All Sports"],
    difficulty: "Beginner",
    equipmentRequired: ["No equipment required"],
    normativeData: {
      elite: "> 120s",
      good: "90–120s",
      average: "60–90s",
      below: "< 60s",
    },
    qualities: [
      { quality: "Trunk Stability", linkType: "measures" },
      { quality: "Anti-Extension Strength", linkType: "measures" },
    ],
    methods: [
      { method: "Isometric Training", weakness: "Low Plank Duration", priority: 1 },
    ],
    products: [],
    exercises: [
      { exercise: "Plank", weakness: "Low Plank Duration", prescription: "4×max time, rigid alignment, 60s rest" },
      { exercise: "Dead Bug", weakness: "Low Plank Duration", prescription: "3×10 each side, slow and controlled" },
    ],
    expectedAdaptation: "Longer plank hold, improved trunk stiffness, better force transfer in sport movements",
  },

  {
    id: 38,
    name: "T-Test Agility",
    category: "Speed",
    description: "Cone agility test requiring forward, lateral, and backward movements. Measures multi-directional speed and change of direction capacity.",
    metric: "Time",
    unit: "seconds",
    sportRelevance: ["Basketball", "Soccer", "Tennis", "Football", "Hockey"],
    difficulty: "Beginner",
    equipmentRequired: ["Cones", "Stopwatch"],
    normativeData: {
      elite: "< 9.5s (males), < 10.5s (females)",
      good: "9.5–10.5s",
      average: "10.5–11.5s",
      below: "> 11.5s",
    },
    qualities: [
      { quality: "Multi-Directional Speed", linkType: "measures" },
      { quality: "Change of Direction Speed", linkType: "measures" },
    ],
    methods: [
      { method: "Plyometric Training", weakness: "Poor T-Test Score", priority: 1 },
      { method: "Acceleration Development", weakness: "Poor T-Test Score", priority: 2 },
    ],
    products: [
      { product: "Freelap Timing System", role: "recommended" },
    ],
    exercises: [
      { exercise: "T-Drill Pattern", weakness: "Poor T-Test Score", prescription: "5×, full recovery, focus on foot placement" },
      { exercise: "Lateral Shuffle", weakness: "Poor T-Test Score", prescription: "3×20m each direction, athletic stance" },
    ],
    expectedAdaptation: "Faster T-Test time, improved multi-directional speed, better COD mechanics",
  },

  {
    id: 39,
    name: "Wingate Anaerobic Test",
    category: "Conditioning",
    description: "30-second all-out cycling sprint. Measures peak anaerobic power, mean power, and fatigue index — the gold standard anaerobic power test.",
    metric: "Peak Power / Mean Power",
    unit: "watts",
    sportRelevance: ["Cycling", "Track & Field", "Team Sports", "Combat Sports"],
    difficulty: "Advanced",
    equipmentRequired: ["Cycle Ergometer"],
    normativeData: {
      elite: "> 1200W peak (males)",
      good: "900–1200W",
      average: "700–900W",
      below: "< 700W",
    },
    qualities: [
      { quality: "Anaerobic Power", linkType: "measures" },
      { quality: "Glycolytic Capacity", linkType: "reflects" },
    ],
    methods: [
      { method: "High-Intensity Interval Training", weakness: "Low Anaerobic Power", priority: 1 },
      { method: "Energy System Development", weakness: "Low Anaerobic Power", priority: 2 },
    ],
    products: [
      { product: "Assault Air Bike", role: "recommended" },
      { product: "SkiErg", role: "alternative" },
    ],
    exercises: [
      { exercise: "Bike Sprint", weakness: "Low Anaerobic Power", prescription: "8×10s max / 3 min rest" },
      { exercise: "SkiErg Sprint", weakness: "Low Anaerobic Power", prescription: "6×20s max / 2 min rest" },
    ],
    expectedAdaptation: "Higher peak anaerobic power, improved glycolytic capacity, faster repeated effort recovery",
  },

  {
    id: 40,
    name: "Max Vertical Jump (Vertec)",
    category: "Power",
    description: "Standing reach to max vertical jump height measured against a Vertec device. Simple, equipment-accessible version of the vertical jump test.",
    metric: "Jump Height",
    unit: "inches / cm",
    sportRelevance: ["Basketball", "Volleyball", "Football", "Baseball"],
    difficulty: "Beginner",
    equipmentRequired: ["Vertec"],
    normativeData: {
      elite: "> 40 inches (males)",
      good: "34–40 inches",
      average: "26–34 inches",
      below: "< 26 inches",
      note: "NBA combine average: ~35 inches (standing max)",
    },
    qualities: [
      { quality: "Lower Body Power", linkType: "measures" },
      { quality: "Reactive Strength", linkType: "reflects" },
    ],
    methods: [
      { method: "Plyometric Training", weakness: "Low Vertical Jump", priority: 1 },
      { method: "Contrast Training", weakness: "Low Vertical Jump", priority: 2 },
    ],
    products: [
      { product: "Vertec", role: "required" },
      { product: "Plyo Box Set", role: "recommended" },
    ],
    exercises: [
      { exercise: "Box Jump", weakness: "Low Vertical Jump", prescription: "4×5 from 30–40cm, max height" },
      { exercise: "Depth Jump", weakness: "Low Vertical Jump", prescription: "3×5 from 30cm, max height focus" },
      { exercise: "Weighted Jump Squat", weakness: "Low Vertical Jump", prescription: "3×5 @ 20% body weight" },
    ],
    expectedAdaptation: "Higher vertical jump, improved sport-specific jump performance",
  },

  {
    id: 41,
    name: "Lunge Stability Test",
    category: "Movement Quality",
    description: "Assesses dynamic lunge stability and knee tracking in a split stance. Identifies anterior knee pain, hip weakness, and balance asymmetries.",
    metric: "Movement Quality",
    unit: "pass/fail + compensation count",
    sportRelevance: ["All Sports", "Running", "CrossFit"],
    difficulty: "Beginner",
    equipmentRequired: ["No equipment required"],
    normativeData: {
      elite: "Perfect bilateral execution",
      good: "1 compensation, no pain",
      average: "2 compensations",
      below: "Pain or 3+ compensations",
    },
    qualities: [
      { quality: "Dynamic Stability", linkType: "measures" },
      { quality: "Knee Tracking", linkType: "reflects" },
    ],
    methods: [
      { method: "Eccentric Overload Training", weakness: "Poor Lunge Stability", priority: 1 },
      { method: "Isometric Training", weakness: "Poor Lunge Stability", priority: 2 },
    ],
    products: [
      { product: "Resistance Bands Set", role: "recommended" },
    ],
    exercises: [
      { exercise: "Reverse Lunge", weakness: "Poor Lunge Stability", prescription: "3×10 each, slow descent" },
      { exercise: "Lateral Band Walk", weakness: "Poor Lunge Stability", prescription: "3×15 each direction" },
    ],
    expectedAdaptation: "Improved lunge stability, reduced compensations, better knee tracking",
  },

  {
    id: 42,
    name: "1RM Bench Press",
    category: "Strength",
    description: "Maximum single repetition barbell bench press. Standard measure of upper body pressing strength in strength sports and combine assessments.",
    metric: "Load",
    unit: "kg",
    sportRelevance: ["Powerlifting", "Football", "Rugby", "General Strength"],
    difficulty: "Advanced",
    equipmentRequired: ["Power Rack", "Barbell", "Weight Plates"],
    normativeData: {
      elite: "> 1.5× body weight",
      good: "1.25–1.5× body weight",
      average: "1.0–1.25× body weight",
      below: "< 1.0× body weight",
    },
    qualities: [
      { quality: "Upper Body Pressing Strength", linkType: "measures" },
      { quality: "Neural Drive", linkType: "reflects" },
    ],
    methods: [
      { method: "Maximal Effort Method", weakness: "Low Bench Press 1RM", priority: 1 },
      { method: "Dynamic Effort Method", weakness: "Slow Bar Speed", priority: 2 },
    ],
    products: [
      { product: "Power Rack", role: "required" },
      { product: "Calibrated Olympic Plates", role: "recommended" },
    ],
    exercises: [
      { exercise: "Bench Press", weakness: "Low Bench Press 1RM", prescription: "4×3 @ 88% 1RM, full ROM" },
      { exercise: "Close-Grip Bench Press", weakness: "Low Bench Press 1RM", prescription: "3×5 @ 75% 1RM" },
    ],
    expectedAdaptation: "Higher 1RM, greater upper body pressing power, improved contact sport performance",
  },

  {
    id: 43,
    name: "Hamstring-to-Quad Ratio",
    category: "Strength",
    description: "Isokinetic ratio of hamstring to quadriceps force. H:Q < 0.60 significantly predicts ACL and hamstring injury risk.",
    metric: "H:Q Ratio",
    unit: "ratio",
    sportRelevance: ["Soccer", "Rugby", "Basketball", "Football"],
    difficulty: "Advanced",
    equipmentRequired: ["Isokinetic Dynamometer"],
    normativeData: {
      elite: "> 0.70 H:Q ratio",
      good: "0.60–0.70",
      average: "0.50–0.60",
      below: "< 0.50 (high injury risk)",
    },
    qualities: [
      { quality: "Hamstring Strength", linkType: "measures" },
      { quality: "Limb Symmetry", linkType: "reflects" },
    ],
    methods: [
      { method: "Eccentric Overload Training", weakness: "Low H:Q Ratio", priority: 1 },
    ],
    products: [
      { product: "Nordic Hamstring Curl Device", role: "recommended" },
      { product: "Flywheel Training Device", role: "alternative" },
    ],
    exercises: [
      { exercise: "Nordic Hamstring Curl", weakness: "Low H:Q Ratio", prescription: "3×5, eccentric-focused, full ROM" },
      { exercise: "Romanian Deadlift", weakness: "Low H:Q Ratio", prescription: "3×8 @ 70% 1RM, eccentric 3s" },
      { exercise: "Glute-Ham Raise", weakness: "Low H:Q Ratio", prescription: "3×6, controlled descent" },
    ],
    expectedAdaptation: "Improved H:Q ratio, reduced ACL and hamstring strain risk, better posterior chain balance",
  },

  {
    id: 44,
    name: "Lactate Threshold Test",
    category: "Conditioning",
    description: "Incremental exercise test with blood lactate sampling at each stage. Identifies the exercise intensity at which lactate accumulates exponentially.",
    metric: "Speed/Power at Threshold",
    unit: "km/h or watts",
    sportRelevance: ["Endurance Sports", "Soccer", "Cycling", "Rowing"],
    difficulty: "Advanced",
    equipmentRequired: ["Lactate Analyzer", "Treadmill or Ergometer"],
    normativeData: {
      elite: "> 85% VO2 Max at threshold",
      good: "75–85% VO2 Max",
      average: "65–75% VO2 Max",
      below: "< 65% VO2 Max",
    },
    qualities: [
      { quality: "Lactate Threshold", linkType: "measures" },
      { quality: "Aerobic Power", linkType: "reflects" },
    ],
    methods: [
      { method: "Lactate Threshold Training", weakness: "Low Lactate Threshold", priority: 1 },
      { method: "Tempo Running", weakness: "Low Lactate Threshold", priority: 2 },
    ],
    products: [
      { product: "Lactate Analyzer", role: "required" },
      { product: "Heart Rate Monitor Chest Strap", role: "recommended" },
    ],
    exercises: [
      { exercise: "Threshold Tempo Run", weakness: "Low Lactate Threshold", prescription: "3×20 min @ threshold pace, 5 min rest" },
    ],
    expectedAdaptation: "Higher lactate threshold speed/power, greater sustained aerobic output",
  },

  {
    id: 45,
    name: "Ankle Stability Test (Star Excursion)",
    category: "Movement Quality",
    description: "Star Excursion Balance Test measuring single-leg dynamic balance and ankle/hip stability. Predicts lower extremity injury risk.",
    metric: "Reach Distance",
    unit: "% of limb length",
    sportRelevance: ["Basketball", "Soccer", "Football", "Rugby"],
    difficulty: "Beginner",
    equipmentRequired: ["Tape Measure", "Tape for Floor Markings"],
    normativeData: {
      elite: "> 100% limb length",
      good: "90–100%",
      average: "80–90%",
      below: "< 80% (elevated injury risk)",
    },
    qualities: [
      { quality: "Dynamic Balance", linkType: "measures" },
      { quality: "Ankle Stability", linkType: "measures" },
    ],
    methods: [
      { method: "Elastic Reactive Training", weakness: "Poor Star Excursion Score", priority: 1 },
    ],
    products: [
      { product: "Balance Board", role: "recommended" },
    ],
    exercises: [
      { exercise: "Single-Leg Reach", weakness: "Poor Star Excursion Score", prescription: "3×8 reaches each direction, controlled" },
      { exercise: "Bosu Ball Balance", weakness: "Poor Star Excursion Score", prescription: "3×30s each leg" },
    ],
    expectedAdaptation: "Greater reach distance, improved ankle stability, reduced ankle sprain risk",
  },

  {
    id: 46,
    name: "Shoulder External Rotation Strength",
    category: "Strength",
    description: "Isometric or isokinetic external rotation strength measurement. Weak ER is the primary modifiable risk factor for shoulder injury in overhead athletes.",
    metric: "Force",
    unit: "Nm",
    sportRelevance: ["Baseball", "Tennis", "Swimming", "Volleyball"],
    difficulty: "Intermediate",
    equipmentRequired: ["Handheld Dynamometer"],
    normativeData: {
      elite: "ER/IR ratio > 0.70",
      good: "0.65–0.70",
      average: "0.55–0.65",
      below: "< 0.55 (high risk)",
    },
    qualities: [
      { quality: "Shoulder Stability", linkType: "measures" },
      { quality: "Rotator Cuff Strength", linkType: "measures" },
    ],
    methods: [
      { method: "Isometric Training", weakness: "Weak Shoulder ER", priority: 1 },
      { method: "Eccentric Overload Training", weakness: "Weak Shoulder ER", priority: 2 },
    ],
    products: [
      { product: "Resistance Bands Set", role: "recommended" },
    ],
    exercises: [
      { exercise: "Side-Lying External Rotation", weakness: "Weak Shoulder ER", prescription: "3×15 each arm, light to moderate load" },
      { exercise: "Band Pull-Apart", weakness: "Weak Shoulder ER", prescription: "3×15, full scapular retraction" },
    ],
    expectedAdaptation: "Higher ER:IR ratio, improved rotator cuff balance, reduced shoulder injury risk",
  },

  {
    id: 47,
    name: "Body Composition (DEXA)",
    category: "Readiness",
    description: "DEXA scan measuring fat mass, lean mass, and bone density by segment. The reference standard for body composition assessment in sport.",
    metric: "Body Fat % / Lean Mass",
    unit: "% / kg",
    sportRelevance: ["All Sports", "Combat Sports", "Bodybuilding"],
    difficulty: "Beginner",
    equipmentRequired: ["DEXA Scanner"],
    normativeData: {
      elite: "5–12% BF (male athletes), 12–18% (female athletes)",
      good: "12–16% BF (males)",
      average: "16–22% BF (males)",
      below: "> 22% BF (males) in sport context",
    },
    qualities: [
      { quality: "Body Composition", linkType: "measures" },
      { quality: "Structural Strength", linkType: "reflects" },
    ],
    methods: [
      { method: "Maximal Effort Method", weakness: "Poor Body Composition", priority: 1 },
      { method: "High-Intensity Interval Training", weakness: "Poor Body Composition", priority: 2 },
    ],
    products: [
      { product: "DEXA Scanner", role: "required" },
      { product: "Caliper Set", role: "alternative" },
    ],
    exercises: [
      { exercise: "Compound Strength Circuit", weakness: "Poor Body Composition", prescription: "3–4 compound lifts, 4×6–8 each session" },
    ],
    expectedAdaptation: "Improved body composition ratio, greater power-to-weight, better sport-specific physical profile",
  },

  {
    id: 48,
    name: "Sprint-to-Fatigue Test",
    category: "Conditioning",
    description: "Repeated 30–40m sprints with fixed short rest until time decrement exceeds 5%. Measures speed endurance and fatigue resistance.",
    metric: "Sprint Decrement Score",
    unit: "%",
    sportRelevance: ["Soccer", "Rugby", "Hockey", "Basketball"],
    difficulty: "Advanced",
    equipmentRequired: ["Timing Gates", "Measuring Tape"],
    normativeData: {
      elite: "< 5% decrement",
      good: "5–8% decrement",
      average: "8–12% decrement",
      below: "> 12% decrement",
    },
    qualities: [
      { quality: "Speed Endurance", linkType: "measures" },
      { quality: "Fatigue Resistance", linkType: "measures" },
    ],
    methods: [
      { method: "Repeated Sprint Ability", weakness: "High Sprint Decrement", priority: 1 },
      { method: "Energy System Development", weakness: "High Sprint Decrement", priority: 2 },
    ],
    products: [
      { product: "Freelap Timing System", role: "required" },
    ],
    exercises: [
      { exercise: "Repeated Sprint Protocol", weakness: "High Sprint Decrement", prescription: "6×30m, 30s rest, track decrement" },
    ],
    expectedAdaptation: "Lower sprint decrement, better speed maintenance under fatigue",
  },

  {
    id: 49,
    name: "Rate of Force Development Test",
    category: "Power",
    description: "Force plate measurement of the slope of the force-time curve in an isometric or CMJ task. Directly quantifies explosiveness in the 0–200ms window.",
    metric: "RFD",
    unit: "N/s",
    sportRelevance: ["All Power Sports", "Football", "Rugby", "Track & Field"],
    difficulty: "Advanced",
    equipmentRequired: ["Force Plate Dual"],
    normativeData: {
      elite: "> 8000 N/s",
      good: "6000–8000 N/s",
      average: "4000–6000 N/s",
      below: "< 4000 N/s",
    },
    qualities: [
      { quality: "Rate of Force Development", linkType: "measures" },
      { quality: "Explosive Strength", linkType: "measures" },
      { quality: "Neural Drive", linkType: "reflects" },
    ],
    methods: [
      { method: "Rate of Force Development Training", weakness: "Low RFD", priority: 1 },
      { method: "Dynamic Effort Method", weakness: "Low RFD", priority: 2 },
      { method: "Plyometric Training", weakness: "Low RFD", priority: 3 },
    ],
    products: [
      { product: "Force Plate Dual", role: "required" },
      { product: "Trap Bar (Hex Bar)", role: "recommended" },
    ],
    exercises: [
      { exercise: "Isometric Squat Thrust", weakness: "Low RFD", prescription: "5×3s maximal effort, 3 min rest" },
      { exercise: "Trap Bar Jump", weakness: "Low RFD", prescription: "4×4 @ 20% body weight, max intent" },
      { exercise: "Ballistic Push-Up", weakness: "Low RFD", prescription: "3×5, leave ground, max speed" },
    ],
    expectedAdaptation: "Higher RFD score, faster explosive force production, improved first-movement speed",
  },

  {
    id: 50,
    name: "Gait Analysis",
    category: "Movement Quality",
    description: "Video or force plate analysis of walking and running mechanics. Identifies asymmetries, overstriding, and compensations driving injury and energy waste.",
    metric: "Kinematic Variables",
    unit: "qualitative + quantitative",
    sportRelevance: ["Running", "All Sports", "Track & Field", "Rehabilitation"],
    difficulty: "Intermediate",
    equipmentRequired: ["High-Speed Camera", "Force Plate", "Motion Capture"],
    normativeData: {
      elite: "No asymmetries, efficient propulsion, optimal cadence 170–180 steps/min",
      good: "Minor asymmetry (< 5%), good propulsion",
      average: "Visible compensation, overstride",
      below: "Significant asymmetry or pain-modified gait",
    },
    qualities: [
      { quality: "Movement Quality", linkType: "measures" },
      { quality: "Running Economy", linkType: "reflects" },
      { quality: "Injury Risk", linkType: "reflects" },
    ],
    methods: [
      { method: "Acceleration Development", weakness: "Poor Running Mechanics", priority: 1 },
      { method: "Max Velocity Development", weakness: "Poor Running Mechanics", priority: 2 },
    ],
    products: [
      { product: "Freelap Timing System", role: "recommended" },
      { product: "Force Plate Dual", role: "recommended" },
    ],
    exercises: [
      { exercise: "A-March", weakness: "Poor Running Mechanics", prescription: "3×20m, tall posture, exaggerated mechanics" },
      { exercise: "B-Skip", weakness: "Poor Running Mechanics", prescription: "3×20m, knee drive focus" },
      { exercise: "Strides", weakness: "Poor Running Mechanics", prescription: "4×80m @ 85% effort, relaxed mechanics" },
    ],
    expectedAdaptation: "Improved gait symmetry, better running economy, reduced injury risk from mechanical faults",
  },
];

// ─── Category Metadata ────────────────────────────────────────────────────────

export interface AssessmentCategoryMeta {
  name: AssessmentCategory;
  icon: string;
  description: string;
  color: string;
}

export const ASSESSMENT_CATEGORIES: AssessmentCategoryMeta[] = [
  { name: "Speed", icon: "⚡", description: "Sprint, acceleration, and velocity tests", color: "rgba(251,191,36,0.15)" },
  { name: "Power", icon: "💥", description: "Explosive force and jump assessments", color: "rgba(248,113,113,0.15)" },
  { name: "Strength", icon: "🏋️", description: "Maximal force and structural strength tests", color: "rgba(167,139,250,0.15)" },
  { name: "Mobility", icon: "🔄", description: "Range of motion and tissue flexibility", color: "rgba(74,222,128,0.15)" },
  { name: "Conditioning", icon: "🫀", description: "Aerobic, anaerobic, and metabolic capacity", color: "rgba(14,165,233,0.15)" },
  { name: "Recovery", icon: "🔋", description: "HRV, sleep, and systemic recovery markers", color: "rgba(52,211,153,0.15)" },
  { name: "Readiness", icon: "🎯", description: "Neuromuscular readiness and load monitoring", color: "rgba(251,146,60,0.15)" },
  { name: "Movement Quality", icon: "🧬", description: "Pattern screening and compensatory movement", color: "rgba(129,140,248,0.15)" },
];

// ─── Lookup Helpers ───────────────────────────────────────────────────────────

export function getAssessmentsByCategory(category: AssessmentCategory): Assessment[] {
  return ASSESSMENTS.filter((a) => a.category === category);
}

export function getAssessmentById(id: number): Assessment | undefined {
  return ASSESSMENTS.find((a) => a.id === id);
}

export function getAssessmentByName(name: string): Assessment | undefined {
  return ASSESSMENTS.find((a) => a.name.toLowerCase() === name.toLowerCase());
}

// ─── Assessment Stats ─────────────────────────────────────────────────────────

export const ASSESSMENT_STATS = {
  total: ASSESSMENTS.length,
  categories: ASSESSMENT_CATEGORIES.length,
  qualities: [...new Set(ASSESSMENTS.flatMap((a) => a.qualities.map((q) => q.quality)))].length,
  sports: [...new Set(ASSESSMENTS.flatMap((a) => a.sportRelevance))].length,
};
