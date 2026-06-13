export interface KnowledgeChain {
  goal: string;
  icon: string;
  physicalQuality: string;
  trainingMethod: string;
  product: string;
  expectedAdaptation: string;
  sports: string[];
}

export interface GoalNode {
  goal: string;
  icon: string;
  description: string;
  chains: KnowledgeChain[];
}

export const KNOWLEDGE_GRAPH: GoalNode[] = [
  {
    goal: "Improve First Step Explosiveness",
    icon: "⚡",
    description: "Develop rapid acceleration from a standing or rolling start.",
    chains: [
      {
        goal: "Improve First Step Explosiveness",
        icon: "⚡",
        physicalQuality: "Horizontal Force Production",
        trainingMethod: "Resisted Sprint Training",
        product: "Sprint Sled",
        expectedAdaptation: "Faster initial 10m time and improved horizontal impulse",
        sports: ["Football", "Soccer", "Rugby", "Hockey"],
      },
      {
        goal: "Improve First Step Explosiveness",
        icon: "⚡",
        physicalQuality: "Rate of Force Development",
        trainingMethod: "Dynamic Effort Method",
        product: "Trap Bar (Hex Bar)",
        expectedAdaptation: "Increased explosive strength from bottom positions",
        sports: ["Football", "Rugby", "General Strength"],
      },
    ],
  },
  {
    goal: "Maximize Top-End Speed",
    icon: "🏃",
    description: "Reach and sustain peak velocity over 20–60m sprint distances.",
    chains: [
      {
        goal: "Maximize Top-End Speed",
        icon: "🏃",
        physicalQuality: "Max Velocity",
        trainingMethod: "Max Velocity Development",
        product: "Freelap Timing System",
        expectedAdaptation: "Quantified improvement in flying sprint times",
        sports: ["Track & Field", "Football", "Soccer"],
      },
      {
        goal: "Maximize Top-End Speed",
        icon: "🏃",
        physicalQuality: "Stride Frequency",
        trainingMethod: "Overspeed Training",
        product: "Speed Bungee Cord System",
        expectedAdaptation: "Improved stride rate at supramaximal velocities",
        sports: ["Track & Field", "Football"],
      },
    ],
  },
  {
    goal: "Jump Higher",
    icon: "🏀",
    description: "Increase vertical jump height for athletic performance.",
    chains: [
      {
        goal: "Jump Higher",
        icon: "🏀",
        physicalQuality: "Reactive Strength",
        trainingMethod: "Elastic Reactive Training",
        product: "Force Plate Dual",
        expectedAdaptation: "Improved reactive strength index and CMJ height",
        sports: ["Basketball", "Volleyball", "Football"],
      },
      {
        goal: "Jump Higher",
        icon: "🏀",
        physicalQuality: "Lower Body Power",
        trainingMethod: "Contrast Training",
        product: "Belt Squat Machine",
        expectedAdaptation: "Increased concentric power output via PAP",
        sports: ["Basketball", "Volleyball", "Track & Field"],
      },
    ],
  },
  {
    goal: "Build Maximum Strength",
    icon: "🏋️",
    description: "Develop peak force production in primary movement patterns.",
    chains: [
      {
        goal: "Build Maximum Strength",
        icon: "🏋️",
        physicalQuality: "Maximal Strength",
        trainingMethod: "Maximal Effort Method",
        product: "Power Rack",
        expectedAdaptation: "Increased 1-rep max across squat, bench, and deadlift",
        sports: ["Powerlifting", "Football", "Rugby"],
      },
      {
        goal: "Build Maximum Strength",
        icon: "🏋️",
        physicalQuality: "Eccentric Strength",
        trainingMethod: "Eccentric Overload Training",
        product: "Flywheel Training Device",
        expectedAdaptation: "Increased eccentric force capacity and hypertrophy",
        sports: ["Soccer", "Rugby", "Football"],
      },
    ],
  },
  {
    goal: "Optimize Recovery",
    icon: "🔄",
    description: "Accelerate readiness between training sessions and competitions.",
    chains: [
      {
        goal: "Optimize Recovery",
        icon: "🔄",
        physicalQuality: "Soft Tissue Quality",
        trainingMethod: "Percussion Therapy Protocol",
        product: "Percussion Massage Gun",
        expectedAdaptation: "Reduced DOMS and faster return to baseline soreness",
        sports: ["All Sports"],
      },
      {
        goal: "Optimize Recovery",
        icon: "🔄",
        physicalQuality: "Venous Return",
        trainingMethod: "Compression Recovery Protocol",
        product: "Pneumatic Compression Boots",
        expectedAdaptation: "Reduced limb swelling and faster lactate clearance",
        sports: ["All Sports"],
      },
    ],
  },
  {
    goal: "Reduce Injury Risk",
    icon: "🩺",
    description: "Build resilience and identify vulnerabilities before they become injuries.",
    chains: [
      {
        goal: "Reduce Injury Risk",
        icon: "🩺",
        physicalQuality: "Eccentric Hamstring Strength",
        trainingMethod: "Hamstring Injury Prevention",
        product: "Nordic Hamstring Curl Device",
        expectedAdaptation: "Significantly reduced hamstring strain incidence",
        sports: ["Soccer", "Football", "Rugby", "Track & Field"],
      },
      {
        goal: "Reduce Injury Risk",
        icon: "🩺",
        physicalQuality: "Ankle Dorsiflexion",
        trainingMethod: "Ankle Mobility Training",
        product: "Slant Board",
        expectedAdaptation: "Improved dorsiflexion ROM and loading mechanics",
        sports: ["All Sports", "Rehabilitation"],
      },
    ],
  },
  {
    goal: "Monitor Athlete Readiness",
    icon: "📊",
    description: "Quantify daily neuromuscular status to guide load management.",
    chains: [
      {
        goal: "Monitor Athlete Readiness",
        icon: "📊",
        physicalQuality: "Neuromuscular Readiness",
        trainingMethod: "Neuromuscular Readiness Monitoring",
        product: "Force Plate Dual",
        expectedAdaptation: "Data-driven load management preventing overtraining",
        sports: ["All Sports"],
      },
      {
        goal: "Monitor Athlete Readiness",
        icon: "📊",
        physicalQuality: "Training Load",
        trainingMethod: "GPS Load Monitoring",
        product: "GPS Performance Tracker",
        expectedAdaptation: "Quantified external load preventing overreaching",
        sports: ["Soccer", "Rugby", "Football", "AFL"],
      },
    ],
  },
  {
    goal: "Develop Sport Conditioning",
    icon: "🔥",
    description: "Build the energy system capacity specific to competition demands.",
    chains: [
      {
        goal: "Develop Sport Conditioning",
        icon: "🔥",
        physicalQuality: "Repeated Sprint Ability",
        trainingMethod: "Repeated Sprint Ability",
        product: "Prowler Push Sled",
        expectedAdaptation: "Improved capacity to sprint repeatedly with short rest",
        sports: ["Football", "Rugby", "Soccer"],
      },
      {
        goal: "Develop Sport Conditioning",
        icon: "🔥",
        physicalQuality: "Aerobic Power",
        trainingMethod: "High-Intensity Interval Training",
        product: "Assault Air Bike",
        expectedAdaptation: "Elevated VO2max and anaerobic threshold",
        sports: ["CrossFit", "Football", "MMA"],
      },
    ],
  },
];

export type ProductCategory =
  | "Speed Development"
  | "Strength Development"
  | "Recovery & Regeneration"
  | "Monitoring & Assessment"
  | "Conditioning"
  | "Mobility & Rehabilitation";

export const CATEGORY_METHOD_MAP: Record<ProductCategory, string[]> = {
  "Speed Development": [
    "Acceleration Development",
    "Max Velocity Development",
    "Resisted Sprint Training",
    "Overspeed Training",
    "Plyometric Training",
    "Elastic Reactive Training",
    "Sprint Testing Protocol",
    "Force-Velocity Profiling",
    "French Contrast Method",
  ],
  "Strength Development": [
    "Maximal Effort Method",
    "Dynamic Effort Method",
    "Submaximal Effort Method",
    "Conjugate Method",
    "Eccentric Overload Training",
    "Isometric Training",
    "Cluster Training",
    "Accommodating Resistance",
    "Wave Loading",
    "Loaded Carry Training",
    "Olympic Weightlifting",
  ],
  "Recovery & Regeneration": [
    "Active Recovery",
    "Contrast Water Therapy",
    "Blood Flow Restriction Rehab",
    "Percussion Therapy Protocol",
    "Compression Recovery Protocol",
    "Cold Water Immersion Protocol",
  ],
  "Monitoring & Assessment": [
    "Jump Testing Protocol",
    "Sprint Testing Protocol",
    "Force-Velocity Profiling",
    "Neuromuscular Readiness Monitoring",
    "Movement Quality Screening",
    "GPS Load Monitoring",
    "Structural Balance Assessment",
  ],
  "Conditioning": [
    "Repeated Sprint Ability",
    "High-Intensity Interval Training",
    "Tempo Running",
    "Aerobic Base Building",
    "Lactate Threshold Training",
    "Circuit Training",
    "Energy System Development",
    "Small-Sided Games",
  ],
  "Mobility & Rehabilitation": [
    "PNF Stretching",
    "Corrective Exercise",
    "Ankle Mobility Training",
    "Hip Mobility Training",
    "Hamstring Injury Prevention",
    "Return to Sport Protocol",
    "Blood Flow Restriction Rehab",
  ],
};

export const CATEGORY_TOP_QUALITIES: Record<ProductCategory, string[]> = {
  "Speed Development": ["Acceleration", "Max Velocity", "Reactive Speed"],
  "Strength Development": ["Maximal Strength", "Rate of Force Development", "Eccentric Strength"],
  "Recovery & Regeneration": ["Recovery Capacity", "Inflammation Control", "Soft Tissue Quality"],
  "Monitoring & Assessment": ["Neuromuscular Readiness", "Training Load", "Force-Velocity Profile"],
  "Conditioning": ["Aerobic Power", "Repeated Sprint Ability", "Anaerobic Capacity"],
  "Mobility & Rehabilitation": ["ROM", "Movement Quality", "Injury Prevention"],
};
