export type RelationshipType =
  | "PRIMARY"      // Exercise requires this product
  | "SUPPORTED_BY" // Exercise is enhanced / measured by this product
  | "OPTIONAL"     // Product adds value but not required
  | "ALTERNATIVE"  // This exercise is an alternative when product unavailable
  | "SUBSTITUTION"; // Direct substitution preserving training method

export interface ExerciseLink {
  name: string;
  relationshipType: RelationshipType;
  description: string;
  trainingMethod?: string;
  physicalQuality?: string;
}

export interface SubstitutionRule {
  withProduct: ExerciseLink[];
  withoutProduct: ExerciseLink[];
  preservedMethod: string;
  preservedQuality: string;
  note: string;
}

export interface ProductExerciseData {
  relatedExercises: ExerciseLink[];
  substitutionRule?: SubstitutionRule;
}

export const PRODUCT_EXERCISE_DATA: Record<string, ProductExerciseData> = {
  "Sprint Sled": {
    relatedExercises: [
      { name: "Resisted Sprint", relationshipType: "PRIMARY", description: "Sprint against sled resistance at 10–20% body weight load for 20–30m", trainingMethod: "Acceleration Development", physicalQuality: "Horizontal Force Production" },
      { name: "Heavy Sled March", relationshipType: "PRIMARY", description: "Slow, high-force march with 30–50% body weight sled load", trainingMethod: "Resisted Sprint Training", physicalQuality: "Horizontal Force Production" },
      { name: "Acceleration Start", relationshipType: "SUPPORTED_BY", description: "Drive phase from blocks or falling start with light sled resistance", trainingMethod: "Acceleration Development", physicalQuality: "Acceleration" },
      { name: "Falling Start Sprint", relationshipType: "SUPPORTED_BY", description: "Falling start mechanics into resisted acceleration", trainingMethod: "Acceleration Development", physicalQuality: "Acceleration" },
      { name: "Hill Sprint", relationshipType: "SUBSTITUTION", description: "6–10° gradient sprint preserves horizontal force demand without equipment", trainingMethod: "Resisted Sprint Training", physicalQuality: "Horizontal Force Production" },
      { name: "Band Resisted Sprint", relationshipType: "SUBSTITUTION", description: "Partner or anchored resistance band replicates sled resistance vector", trainingMethod: "Acceleration Development", physicalQuality: "Acceleration" },
    ],
    substitutionRule: {
      withProduct: [
        { name: "Resisted Sprint", relationshipType: "PRIMARY", description: "3×4 × 20m @ 10% BW sled" },
        { name: "Heavy Sled March", relationshipType: "PRIMARY", description: "3×20m @ 30% BW" },
      ],
      withoutProduct: [
        { name: "Hill Sprint", relationshipType: "SUBSTITUTION", description: "3×4 × 30m uphill @ 6–8° grade" },
        { name: "Band Resisted Sprint", relationshipType: "SUBSTITUTION", description: "3×4 × 20m with partner band" },
        { name: "Acceleration March", relationshipType: "SUBSTITUTION", description: "Bodyweight A-march into sprint for mechanics focus" },
      ],
      preservedMethod: "Acceleration Development",
      preservedQuality: "Horizontal Force Production",
      note: "Sled load recommendation: 10–20% body weight for speed, 30–50% for force development",
    },
  },

  "Freelap Timing System": {
    relatedExercises: [
      { name: "10m Sprint", relationshipType: "SUPPORTED_BY", description: "Acceleration phase — split at 10m captures peak force application window", trainingMethod: "Sprint Testing Protocol", physicalQuality: "Acceleration" },
      { name: "20m Sprint", relationshipType: "SUPPORTED_BY", description: "Acceleration into early top-end — most common team sport benchmark", trainingMethod: "Sprint Testing Protocol", physicalQuality: "Acceleration" },
      { name: "Flying Sprint", relationshipType: "SUPPORTED_BY", description: "10–20m flying gate — pure max velocity measurement", trainingMethod: "Max Velocity Development", physicalQuality: "Max Velocity" },
      { name: "40m Sprint", relationshipType: "SUPPORTED_BY", description: "American football standard — split at 10, 20, 40m", trainingMethod: "Sprint Testing Protocol", physicalQuality: "Sprint Performance" },
    ],
    substitutionRule: {
      withProduct: [
        { name: "Flying Sprint", relationshipType: "SUPPORTED_BY", description: "Freelap gates at 20m + 30m for flying 10m time" },
      ],
      withoutProduct: [
        { name: "Vertical Jump", relationshipType: "SUBSTITUTION", description: "App-based CMJ as proxy neuromuscular readiness marker" },
        { name: "Partner-Timed Sprint", relationshipType: "SUBSTITUTION", description: "Stopwatch-timed sprint testing — less precise but available" },
      ],
      preservedMethod: "Sprint Testing Protocol",
      preservedQuality: "Sprint Performance",
      note: "Freelap provides sub-0.001s accuracy vs stopwatch ±0.15s — testing frequency may need to decrease without gates",
    },
  },

  "Trap Bar (Hex Bar)": {
    relatedExercises: [
      { name: "Trap Bar Deadlift", relationshipType: "PRIMARY", description: "Foundational hip hinge — load at sides reduces shear vs conventional bar", trainingMethod: "Maximal Effort Method", physicalQuality: "Lower Body Strength" },
      { name: "Trap Bar Jump", relationshipType: "PRIMARY", description: "Loaded explosive jump — trap bar handles allow natural arm swing and safe landing", trainingMethod: "Contrast Training", physicalQuality: "Lower Body Power" },
      { name: "Trap Bar Romanian Deadlift", relationshipType: "SUPPORTED_BY", description: "Eccentric-focused hip hinge with neutral grip", trainingMethod: "Eccentric Overload Training", physicalQuality: "Eccentric Strength" },
      { name: "Trap Bar Carry", relationshipType: "OPTIONAL", description: "Loaded carry for grip and trunk stability", trainingMethod: "Loaded Carry Training", physicalQuality: "Grip Strength" },
      { name: "Conventional Deadlift", relationshipType: "ALTERNATIVE", description: "Primary alternative when trap bar unavailable", trainingMethod: "Maximal Effort Method", physicalQuality: "Lower Body Strength" },
    ],
    substitutionRule: {
      withProduct: [
        { name: "Trap Bar Deadlift", relationshipType: "PRIMARY", description: "3×5 @ 85% for maximal strength" },
        { name: "Trap Bar Jump", relationshipType: "PRIMARY", description: "4×4 @ 20% BW for power" },
      ],
      withoutProduct: [
        { name: "Conventional Deadlift", relationshipType: "ALTERNATIVE", description: "3×5 @ 82% — same strength quality, higher spinal shear" },
        { name: "Romanian Deadlift", relationshipType: "ALTERNATIVE", description: "Eccentric hip hinge alternative" },
      ],
      preservedMethod: "Maximal Effort Method",
      preservedQuality: "Lower Body Strength",
      note: "Trap bar reduces spinal shear ~30% vs conventional deadlift — prefer for athletes with lumbar sensitivity",
    },
  },

  "Flywheel Training Device": {
    relatedExercises: [
      { name: "Flywheel Squat", relationshipType: "PRIMARY", description: "Bilateral squat with inertia-based eccentric overload — supramaximal eccentric loads", trainingMethod: "Eccentric Overload Training", physicalQuality: "Eccentric Strength" },
      { name: "Flywheel Hamstring Curl", relationshipType: "PRIMARY", description: "Eccentric hamstring overload — primary injury prevention application", trainingMethod: "Eccentric Overload Training", physicalQuality: "Eccentric Strength" },
      { name: "Flywheel Romanian Deadlift", relationshipType: "SUPPORTED_BY", description: "Hip hinge with eccentric overload", trainingMethod: "Eccentric Overload Training", physicalQuality: "Eccentric Strength" },
      { name: "Flywheel Row", relationshipType: "SUPPORTED_BY", description: "Horizontal pull with eccentric emphasis", trainingMethod: "Eccentric Overload Training", physicalQuality: "Upper Body Pulling Strength" },
      { name: "Slow Eccentric Romanian Deadlift", relationshipType: "SUBSTITUTION", description: "5–6 second lowering approximates flywheel eccentric demand", trainingMethod: "Eccentric Overload Training", physicalQuality: "Eccentric Strength" },
      { name: "Nordic Hamstring Curl", relationshipType: "SUBSTITUTION", description: "Bodyweight eccentric hamstring load when flywheel unavailable", trainingMethod: "Hamstring Injury Prevention", physicalQuality: "Eccentric Strength" },
    ],
    substitutionRule: {
      withProduct: [
        { name: "Flywheel Squat", relationshipType: "PRIMARY", description: "3×6 — match concentric effort to inertia load" },
        { name: "Flywheel Hamstring Curl", relationshipType: "PRIMARY", description: "3×6 — control the rebound for eccentric overload" },
      ],
      withoutProduct: [
        { name: "Slow Eccentric Romanian Deadlift", relationshipType: "SUBSTITUTION", description: "3×8 @ 6s lowering — tempo creates eccentric emphasis" },
        { name: "Nordic Hamstring Curl", relationshipType: "SUBSTITUTION", description: "3×6 — bodyweight eccentric alternative" },
      ],
      preservedMethod: "Eccentric Overload Training",
      preservedQuality: "Eccentric Strength",
      note: "Flywheel provides genuine supramaximal eccentric — tempo training is a useful but incomplete substitute",
    },
  },

  "Force Plate Dual": {
    relatedExercises: [
      { name: "Countermovement Jump", relationshipType: "SUPPORTED_BY", description: "CMJ is the primary force plate metric — measures force, power, impulse, and RFD", trainingMethod: "Jump Testing Protocol", physicalQuality: "Lower Limb Power" },
      { name: "Squat Jump", relationshipType: "SUPPORTED_BY", description: "Concentric-only jump separates elastic from concentric contribution", trainingMethod: "Jump Testing Protocol", physicalQuality: "Lower Limb Power" },
      { name: "Drop Jump", relationshipType: "SUPPORTED_BY", description: "Ground contact time measurement for RSI — requires dual plates", trainingMethod: "Elastic Reactive Training", physicalQuality: "Reactive Strength" },
      { name: "Single Leg Hop", relationshipType: "SUPPORTED_BY", description: "Bilateral asymmetry detection during rehab or return-to-sport", trainingMethod: "Return to Sport Protocol", physicalQuality: "Neuromuscular Readiness" },
      { name: "Vertical Jump", relationshipType: "ALTERNATIVE", description: "App or jump mat measurement when force plate unavailable", trainingMethod: "Jump Testing Protocol", physicalQuality: "Lower Limb Power" },
    ],
    substitutionRule: {
      withProduct: [
        { name: "Countermovement Jump", relationshipType: "SUPPORTED_BY", description: "Daily CMJ — RSI, peak force, eccentric impulse tracked" },
        { name: "Drop Jump", relationshipType: "SUPPORTED_BY", description: "Weekly RSI monitoring for reactive strength tracking" },
      ],
      withoutProduct: [
        { name: "Vertical Jump", relationshipType: "ALTERNATIVE", description: "App-based CMJ (MyJump 2) — height metric preserved" },
        { name: "Broad Jump", relationshipType: "SUBSTITUTION", description: "Horizontal power proxy — tape measure accessible" },
      ],
      preservedMethod: "Neuromuscular Readiness Monitoring",
      preservedQuality: "Neuromuscular Readiness",
      note: "Force plate captures kinetics (force, RFD) — app/mat only captures jump height. Trend direction remains valid.",
    },
  },

  "Assault Air Bike": {
    relatedExercises: [
      { name: "Air Bike Sprint", relationshipType: "PRIMARY", description: "10–30s all-out effort at maximum wattage — primary HIIT application", trainingMethod: "High-Intensity Interval Training", physicalQuality: "Anaerobic Capacity" },
      { name: "Air Bike HIIT Interval", relationshipType: "PRIMARY", description: "Structured 20:40 or 30:30 work-rest interval protocol", trainingMethod: "High-Intensity Interval Training", physicalQuality: "Aerobic Power" },
      { name: "Air Bike Steady State", relationshipType: "SUPPORTED_BY", description: "20–45 min at 60–70% max HR for aerobic base", trainingMethod: "Aerobic Base Building", physicalQuality: "Aerobic Capacity" },
      { name: "Rowing Interval", relationshipType: "SUBSTITUTION", description: "500m row intervals replicate air bike metabolic demand", trainingMethod: "High-Intensity Interval Training", physicalQuality: "Anaerobic Capacity" },
      { name: "400m Run", relationshipType: "SUBSTITUTION", description: "Running-based interval when air bike unavailable", trainingMethod: "High-Intensity Interval Training", physicalQuality: "Aerobic Power" },
    ],
    substitutionRule: {
      withProduct: [
        { name: "Air Bike Sprint", relationshipType: "PRIMARY", description: "10×10s all-out, 50s rest — Tabata-style HIIT" },
        { name: "Air Bike HIIT Interval", relationshipType: "PRIMARY", description: "8×30s work / 30s rest @ 85-95% max HR" },
      ],
      withoutProduct: [
        { name: "Rowing Interval", relationshipType: "SUBSTITUTION", description: "8×250m row @ max effort, 90s rest" },
        { name: "Hill Sprint", relationshipType: "SUBSTITUTION", description: "8×30m hill sprint, 90s walk back recovery" },
        { name: "Jump Rope Sprint", relationshipType: "SUBSTITUTION", description: "10×30s maximal jump rope, 30s rest" },
      ],
      preservedMethod: "High-Intensity Interval Training",
      preservedQuality: "Aerobic Power",
      note: "Air bike uniquely loads both upper and lower body — single-modality substitutes may underload one system",
    },
  },

  "Prowler Push Sled": {
    relatedExercises: [
      { name: "Prowler Sprint Push", relationshipType: "PRIMARY", description: "20–30m maximal sprint push with moderate load (plate + bar)", trainingMethod: "Repeated Sprint Ability", physicalQuality: "Work Capacity" },
      { name: "Heavy Prowler Walk", relationshipType: "PRIMARY", description: "Slow, heavy-loaded push for leg drive and mental toughness", trainingMethod: "Loaded Carry Training", physicalQuality: "Work Capacity" },
      { name: "Resisted Sprint", relationshipType: "ALTERNATIVE", description: "Sled pull or band resisted sprint when Prowler unavailable", trainingMethod: "Resisted Sprint Training", physicalQuality: "Acceleration" },
      { name: "400m Run", relationshipType: "SUBSTITUTION", description: "Running interval to replicate metabolic demand", trainingMethod: "Energy System Development", physicalQuality: "Aerobic Power" },
    ],
    substitutionRule: {
      withProduct: [
        { name: "Prowler Sprint Push", relationshipType: "PRIMARY", description: "6×25m @ moderate load, 60s rest" },
      ],
      withoutProduct: [
        { name: "Hill Sprint", relationshipType: "SUBSTITUTION", description: "6×30m hill sprint — gradient creates similar leg drive demand" },
        { name: "400m Run", relationshipType: "SUBSTITUTION", description: "4×400m @ 85% effort, 2-3min rest" },
      ],
      preservedMethod: "Repeated Sprint Ability",
      preservedQuality: "Work Capacity",
      note: "Prowler has no eccentric component — substitutes with eccentric loading (e.g. hills) will increase DOMS",
    },
  },

  "Nordic Hamstring Curl Device": {
    relatedExercises: [
      { name: "Nordic Hamstring Curl", relationshipType: "PRIMARY", description: "Eccentric knee flexion lowering — most evidence-backed hamstring injury prevention exercise", trainingMethod: "Hamstring Injury Prevention", physicalQuality: "Eccentric Strength" },
      { name: "Assisted Nordic Hamstring Curl", relationshipType: "SUPPORTED_BY", description: "Band-assisted regression for athletes new to Nordic training", trainingMethod: "Hamstring Injury Prevention", physicalQuality: "Eccentric Strength" },
      { name: "Romanian Deadlift", relationshipType: "SUBSTITUTION", description: "Hip-dominant hamstring loading when Nordic device unavailable", trainingMethod: "Hamstring Injury Prevention", physicalQuality: "Eccentric Strength" },
      { name: "Glute Ham Raise", relationshipType: "ALTERNATIVE", description: "GHD machine alternative for eccentric hamstring work", trainingMethod: "Eccentric Overload Training", physicalQuality: "Eccentric Strength" },
    ],
    substitutionRule: {
      withProduct: [
        { name: "Nordic Hamstring Curl", relationshipType: "PRIMARY", description: "3×6 progressive loading — eccentric-only or full ROM" },
      ],
      withoutProduct: [
        { name: "Romanian Deadlift", relationshipType: "SUBSTITUTION", description: "3×10 @ 70% with 4s lowering — prioritize eccentric control" },
        { name: "Glute Ham Raise", relationshipType: "ALTERNATIVE", description: "3×6 on GHD machine — similar knee flexion eccentric demand" },
        { name: "Partner-Assisted Nordic Curl", relationshipType: "SUBSTITUTION", description: "Improvised Nordic using partner to anchor ankles" },
      ],
      preservedMethod: "Hamstring Injury Prevention",
      preservedQuality: "Eccentric Strength",
      note: "Nordic curl reduces hamstring injury risk by 51% in soccer — substitutes provide eccentric load but with different kinetics",
    },
  },

  "Slant Board": {
    relatedExercises: [
      { name: "Slant Board Squat", relationshipType: "PRIMARY", description: "Knee-over-toe squat on incline — loads ankle dorsiflexion under body weight", trainingMethod: "Ankle Mobility Training", physicalQuality: "Ankle Dorsiflexion" },
      { name: "ATG Split Squat", relationshipType: "PRIMARY", description: "Full-depth split squat with tibialis loading on slant board", trainingMethod: "Corrective Exercise", physicalQuality: "Ankle Dorsiflexion" },
      { name: "Single Leg Slant Board Squat", relationshipType: "SUPPORTED_BY", description: "Unilateral progression for hip and ankle control", trainingMethod: "Return to Sport Protocol", physicalQuality: "Ankle Dorsiflexion" },
      { name: "Calf Raise", relationshipType: "SUPPORTED_BY", description: "Incline calf strengthening for Achilles tendon loading", trainingMethod: "Corrective Exercise", physicalQuality: "Ankle Strength" },
      { name: "Heel Elevated Goblet Squat", relationshipType: "SUBSTITUTION", description: "25mm plates under heels approximate slant board ROM for squatting", trainingMethod: "Ankle Mobility Training", physicalQuality: "Ankle Dorsiflexion" },
    ],
    substitutionRule: {
      withProduct: [
        { name: "Slant Board Squat", relationshipType: "PRIMARY", description: "3×10 with progressive depth — heel-to-toe angle increases ROM" },
        { name: "ATG Split Squat", relationshipType: "PRIMARY", description: "3×8/leg — focus on knee travel over toe at bottom" },
      ],
      withoutProduct: [
        { name: "Heel Elevated Goblet Squat", relationshipType: "SUBSTITUTION", description: "3×12 on 25mm plates — preserves ROM intent" },
        { name: "Ankle Circles and PNF", relationshipType: "SUBSTITUTION", description: "Passive ankle mobility work to maintain dorsiflexion" },
      ],
      preservedMethod: "Ankle Mobility Training",
      preservedQuality: "Ankle Dorsiflexion",
      note: "Slant board uniquely provides progressive angle loading — plate elevation is functional but less controllable",
    },
  },

  "Resistance Band Set": {
    relatedExercises: [
      { name: "Band Hip Abduction", relationshipType: "PRIMARY", description: "Seated or standing hip external rotation and abduction — glute med activation", trainingMethod: "Corrective Exercise", physicalQuality: "Hip Stability" },
      { name: "Monster Walk", relationshipType: "PRIMARY", description: "Lateral banded walk for glute med and hip abductor endurance", trainingMethod: "Corrective Exercise", physicalQuality: "Hip Stability" },
      { name: "Band Pull Apart", relationshipType: "SUPPORTED_BY", description: "Horizontal band pull for rear delt and shoulder health", trainingMethod: "Corrective Exercise", physicalQuality: "Shoulder Stability" },
      { name: "Banded Glute Bridge", relationshipType: "SUPPORTED_BY", description: "Hip extension with band resistance at knee for glute activation", trainingMethod: "Corrective Exercise", physicalQuality: "Glute Activation" },
      { name: "Band Terminal Knee Extension", relationshipType: "SUPPORTED_BY", description: "VMO activation and knee stability rehab exercise", trainingMethod: "Return to Sport Protocol", physicalQuality: "Knee Stability" },
      { name: "Bodyweight Hip Abduction", relationshipType: "SUBSTITUTION", description: "Side-lying abduction without band — preserves movement pattern", trainingMethod: "Corrective Exercise", physicalQuality: "Hip Stability" },
    ],
    substitutionRule: {
      withProduct: [
        { name: "Monster Walk", relationshipType: "PRIMARY", description: "3×20 steps lateral with medium band around ankles" },
        { name: "Band Hip Abduction", relationshipType: "PRIMARY", description: "3×15/side against light band" },
      ],
      withoutProduct: [
        { name: "Bodyweight Hip Abduction", relationshipType: "SUBSTITUTION", description: "3×20/side side-lying — no load but movement preserved" },
        { name: "Clamshell", relationshipType: "SUBSTITUTION", description: "3×20/side bodyweight clamshell for glute med isolation" },
      ],
      preservedMethod: "Corrective Exercise",
      preservedQuality: "Hip Stability",
      note: "Bands are highly portable — primary substitution for home/travel contexts where no other equipment is available",
    },
  },

  "Belt Squat Machine": {
    relatedExercises: [
      { name: "Belt Squat", relationshipType: "PRIMARY", description: "Axial-load-free squat — hip loading without spinal compression", trainingMethod: "Submaximal Effort Method", physicalQuality: "Lower Body Strength" },
      { name: "Heel Elevated Belt Squat", relationshipType: "PRIMARY", description: "Quad-dominant squat variation with heel elevation", trainingMethod: "Submaximal Effort Method", physicalQuality: "Quad Hypertrophy" },
      { name: "Belt Squat Walking Lunge", relationshipType: "SUPPORTED_BY", description: "Unilateral loaded lunge without spinal compression", trainingMethod: "Submaximal Effort Method", physicalQuality: "Unilateral Strength" },
      { name: "Goblet Squat", relationshipType: "ALTERNATIVE", description: "Anterior-loaded squat approximation when belt squat unavailable", trainingMethod: "Submaximal Effort Method", physicalQuality: "Lower Body Strength" },
      { name: "Leg Press", relationshipType: "ALTERNATIVE", description: "Machine-based axial-load-free leg press alternative", trainingMethod: "Submaximal Effort Method", physicalQuality: "Lower Body Strength" },
    ],
    substitutionRule: {
      withProduct: [
        { name: "Belt Squat", relationshipType: "PRIMARY", description: "4×8 @ 75% — axial load free, high volume" },
      ],
      withoutProduct: [
        { name: "Leg Press", relationshipType: "ALTERNATIVE", description: "4×10 — horizontal force vector but no trunk load" },
        { name: "Goblet Squat", relationshipType: "ALTERNATIVE", description: "4×10 — limited by upper body hold, not leg capacity" },
      ],
      preservedMethod: "Submaximal Effort Method",
      preservedQuality: "Lower Body Strength",
      note: "Belt squat uniquely eliminates spinal compression — essential for athletes with back pain or post-surgery loading",
    },
  },

  "Linear Position Transducer": {
    relatedExercises: [
      { name: "Barbell Back Squat", relationshipType: "SUPPORTED_BY", description: "Bar speed monitoring — 0.6 m/s = ~75% 1RM, 0.8 m/s = ~65%", trainingMethod: "Velocity Based Training", physicalQuality: "Power" },
      { name: "Deadlift", relationshipType: "SUPPORTED_BY", description: "Pull velocity tracking — early fatigue detection via speed loss", trainingMethod: "Velocity Based Training", physicalQuality: "Maximal Strength" },
      { name: "Bench Press", relationshipType: "SUPPORTED_BY", description: "VBT pressing — zone 1 (>1.0 m/s) power, zone 4 (<0.35 m/s) maximal strength", trainingMethod: "Velocity Based Training", physicalQuality: "Power" },
      { name: "Power Clean", relationshipType: "SUPPORTED_BY", description: "Peak velocity monitoring for load management in Olympic lifting", trainingMethod: "Olympic Weightlifting", physicalQuality: "Rate of Force Development" },
      { name: "Push Press", relationshipType: "SUPPORTED_BY", description: "Bar speed monitoring for overhead VBT", trainingMethod: "Velocity Based Training", physicalQuality: "Power" },
    ],
  },

  "Percussion Massage Gun": {
    relatedExercises: [
      { name: "Pre-Training Percussion Protocol", relationshipType: "PRIMARY", description: "3–5 min targeted percussion to target muscles before training session", trainingMethod: "Percussion Therapy Protocol", physicalQuality: "Soft Tissue Quality" },
      { name: "Post-Training Recovery Protocol", relationshipType: "PRIMARY", description: "10–15 min full-body percussion post-session for DOMS reduction", trainingMethod: "Percussion Therapy Protocol", physicalQuality: "Recovery Capacity" },
      { name: "Foam Rolling Circuit", relationshipType: "SUBSTITUTION", description: "Manual foam rolling preserves soft tissue quality benefit without device", trainingMethod: "Active Recovery", physicalQuality: "Soft Tissue Quality" },
    ],
  },

  "Pneumatic Compression Boots": {
    relatedExercises: [
      { name: "Post-Game Compression Session", relationshipType: "PRIMARY", description: "30–60 min compression boots post-match for venous return enhancement", trainingMethod: "Compression Recovery Protocol", physicalQuality: "Recovery Capacity" },
      { name: "Active Recovery Bike", relationshipType: "ALTERNATIVE", description: "Low-intensity cycling promotes venous return via muscle pump", trainingMethod: "Active Recovery", physicalQuality: "Lactate Clearance" },
      { name: "Compression Sleeve Wear", relationshipType: "SUBSTITUTION", description: "Passive compression garments replicate pressure benefit at lower cost", trainingMethod: "Compression Recovery Protocol", physicalQuality: "Recovery Capacity" },
    ],
  },
};

// ─── Equipment Substitution Matrix ───────────────────────────────────────────
// Quick lookup: product availability → alternative exercises that preserve the training method

export interface EquipmentScenario {
  goal: string;
  sport: string;
  withEquipment: {
    product: string;
    exercises: string[];
    method: string;
  };
  withoutEquipment: {
    alternatives: string[];
    method: string;
    adaptationPreserved: string;
  };
}

export const EQUIPMENT_SCENARIOS: EquipmentScenario[] = [
  {
    goal: "Improve Acceleration",
    sport: "Football / Soccer / Rugby",
    withEquipment: {
      product: "Sprint Sled",
      exercises: ["Resisted Sprint", "Heavy Sled March", "Acceleration Start"],
      method: "Resisted Sprint Training",
    },
    withoutEquipment: {
      alternatives: ["Hill Sprint", "Band Resisted Sprint", "Acceleration March"],
      method: "Acceleration Development",
      adaptationPreserved: "Horizontal Force Production",
    },
  },
  {
    goal: "Prevent Hamstring Injury",
    sport: "Soccer / Football / Track & Field",
    withEquipment: {
      product: "Nordic Hamstring Curl Device",
      exercises: ["Nordic Hamstring Curl", "Assisted Nordic Hamstring Curl"],
      method: "Hamstring Injury Prevention",
    },
    withoutEquipment: {
      alternatives: ["Romanian Deadlift", "Glute Ham Raise", "Partner Nordic Curl"],
      method: "Eccentric Overload Training",
      adaptationPreserved: "Eccentric Hamstring Strength",
    },
  },
  {
    goal: "Monitor Athlete Readiness",
    sport: "All Sports",
    withEquipment: {
      product: "Force Plate Dual",
      exercises: ["Countermovement Jump", "Drop Jump", "Single Leg Hop"],
      method: "Neuromuscular Readiness Monitoring",
    },
    withoutEquipment: {
      alternatives: ["App-Based Vertical Jump", "Broad Jump", "Grip Strength Test"],
      method: "Jump Testing Protocol",
      adaptationPreserved: "Neuromuscular Readiness",
    },
  },
  {
    goal: "Build Conditioning",
    sport: "CrossFit / MMA / Football",
    withEquipment: {
      product: "Assault Air Bike",
      exercises: ["Air Bike Sprint", "Air Bike HIIT Interval"],
      method: "High-Intensity Interval Training",
    },
    withoutEquipment: {
      alternatives: ["Hill Sprint", "Jump Rope Sprint", "Bodyweight Burpee Circuit"],
      method: "High-Intensity Interval Training",
      adaptationPreserved: "Aerobic Power",
    },
  },
  {
    goal: "Improve Ankle Mobility",
    sport: "All Sports",
    withEquipment: {
      product: "Slant Board",
      exercises: ["Slant Board Squat", "ATG Split Squat"],
      method: "Ankle Mobility Training",
    },
    withoutEquipment: {
      alternatives: ["Heel Elevated Goblet Squat", "Ankle PNF Stretching", "Wall Ankle Stretch"],
      method: "Corrective Exercise",
      adaptationPreserved: "Ankle Dorsiflexion",
    },
  },
  {
    goal: "Develop Hip Stability",
    sport: "All Sports / Rehabilitation",
    withEquipment: {
      product: "Resistance Band Set",
      exercises: ["Monster Walk", "Band Hip Abduction", "Band Pull Apart"],
      method: "Corrective Exercise",
    },
    withoutEquipment: {
      alternatives: ["Clamshell", "Bodyweight Hip Abduction", "Side-Lying Hip Rotation"],
      method: "Corrective Exercise",
      adaptationPreserved: "Hip Stability",
    },
  },
];
