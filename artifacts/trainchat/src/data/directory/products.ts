export type ProductCostTier = "$" | "$$" | "$$$" | "$$$$";
export type ProductCategory =
  | "Speed Development"
  | "Strength Development"
  | "Recovery & Regeneration"
  | "Monitoring & Assessment"
  | "Conditioning"
  | "Mobility & Rehabilitation";

export interface DirectoryProduct {
  id: number;
  name: string;
  brand?: string;
  category: ProductCategory;
  subcategory?: string;
  primaryUse: string;
  sports: string[];
  costTier: ProductCostTier;
  isFeatured: boolean;
  description?: string;
}

export const DIRECTORY_STATS = {
  exercises: "1,500+",
  products: "150+",
  methods: "50+",
  sports: "20+",
};

export const CATEGORY_DEFINITIONS: {
  name: ProductCategory;
  icon: string;
  examples: string[];
}[] = [
  {
    name: "Speed Development",
    icon: "⚡",
    examples: [
      "Sprint Sleds",
      "Timing Gates",
      "Laser Timing Systems",
      "Resisted Sprint Devices",
      "Overspeed Training Systems",
    ],
  },
  {
    name: "Strength Development",
    icon: "🏋️",
    examples: [
      "Trap Bars",
      "Safety Squat Bars",
      "Belt Squat Systems",
      "Flywheel Devices",
      "Specialty Bars",
    ],
  },
  {
    name: "Recovery & Regeneration",
    icon: "🔄",
    examples: [
      "Percussion Therapy",
      "Compression Systems",
      "Recovery Boots",
      "Mobility Tools",
      "Recovery Platforms",
    ],
  },
  {
    name: "Monitoring & Assessment",
    icon: "📊",
    examples: [
      "Force Plates",
      "Velocity Tracking",
      "GPS Monitoring",
      "Jump Testing Systems",
      "Heart Rate Monitoring",
    ],
  },
  {
    name: "Conditioning",
    icon: "🔥",
    examples: [
      "Air Bikes",
      "Ski Ergs",
      "Rowers",
      "Sled Systems",
      "Circuit Equipment",
    ],
  },
  {
    name: "Mobility & Rehabilitation",
    icon: "🧘",
    examples: [
      "Resistance Bands",
      "Balance Training",
      "Isometric Devices",
      "Manual Therapy Tools",
      "Corrective Exercise Equipment",
    ],
  },
];

export const ALL_PRODUCTS: DirectoryProduct[] = [
  // ─── Speed Development ─────────────────────────────────────────────────────
  { id: 1, name: "Sprint Sled", brand: "Rogue", category: "Speed Development", subcategory: "Resisted Sprint", primaryUse: "Acceleration Training", sports: ["Football", "Hockey", "Soccer", "Track & Field"], costTier: "$$", isFeatured: true },
  { id: 2, name: "Freelap Timing System", brand: "Freelap", category: "Speed Development", subcategory: "Timing Gates", primaryUse: "Sprint Timing & Speed Testing", sports: ["Track & Field", "Football", "Soccer", "Rugby"], costTier: "$$$", isFeatured: true },
  { id: 3, name: "Laser Timing Gate System", brand: "Brower Timing", category: "Speed Development", subcategory: "Timing Gates", primaryUse: "Sprint & Agility Timing", sports: ["Track & Field", "Football", "Basketball", "Soccer"], costTier: "$$$$", isFeatured: false },
  { id: 4, name: "Resisted Sprint Harness", brand: "SKLZ", category: "Speed Development", subcategory: "Resisted Sprint", primaryUse: "Acceleration & Power Development", sports: ["Football", "Soccer", "Rugby", "Basketball"], costTier: "$", isFeatured: false },
  { id: 5, name: "Overspeed Pulley System", brand: "Exergenie", category: "Speed Development", subcategory: "Overspeed Training", primaryUse: "Top-End Speed Development", sports: ["Track & Field", "Football", "Soccer"], costTier: "$$$", isFeatured: false },
  { id: 6, name: "Wicket Training Set", brand: "Athletics Canada", category: "Speed Development", subcategory: "Technique Tools", primaryUse: "Sprint Mechanics & Stride Development", sports: ["Track & Field", "Football", "Soccer"], costTier: "$", isFeatured: false },
  { id: 7, name: "Speed Hurdles", brand: "Rogue", category: "Speed Development", subcategory: "Hurdles", primaryUse: "Sprint Mechanics & Agility", sports: ["Track & Field", "Football", "Soccer", "Hockey"], costTier: "$", isFeatured: false },
  { id: 8, name: "Agility Ladder", brand: "SKLZ", category: "Speed Development", subcategory: "Agility Tools", primaryUse: "Foot Speed & Coordination", sports: ["Soccer", "Basketball", "Football", "Tennis"], costTier: "$", isFeatured: false },
  { id: 9, name: "Sprint Parachute", brand: "Cheetah", category: "Speed Development", subcategory: "Resisted Sprint", primaryUse: "Top-End Speed & Acceleration", sports: ["Track & Field", "Football", "Soccer"], costTier: "$", isFeatured: false },
  { id: 10, name: "Reaction Ball", brand: "Pro Impact", category: "Speed Development", subcategory: "Reaction Training", primaryUse: "Reactive Agility & Hand Speed", sports: ["Baseball", "Tennis", "Boxing", "Soccer"], costTier: "$", isFeatured: false },
  { id: 11, name: "Starting Blocks", brand: "NELCO", category: "Speed Development", subcategory: "Technique Tools", primaryUse: "Sprint Start Development", sports: ["Track & Field"], costTier: "$$", isFeatured: false },
  { id: 12, name: "Speed Resistance Band System", brand: "EliteFTS", category: "Speed Development", subcategory: "Resisted Sprint", primaryUse: "Acceleration & Force Development", sports: ["Football", "Rugby", "Soccer", "Basketball"], costTier: "$", isFeatured: false },
  { id: 13, name: "Force Velocity Profiling App", brand: "MyJump Lab", category: "Speed Development", subcategory: "Assessment", primaryUse: "Sprint Force-Velocity Profiling", sports: ["Track & Field", "Football", "Soccer", "Rugby"], costTier: "$$", isFeatured: false },
  { id: 14, name: "High-Speed Camera", brand: "Casio Exilim", category: "Speed Development", subcategory: "Video Analysis", primaryUse: "Sprint Technique Analysis", sports: ["Track & Field", "Football", "Soccer"], costTier: "$$$", isFeatured: false },
  { id: 15, name: "Power Speed Sled", brand: "Westside Barbell", category: "Speed Development", subcategory: "Resisted Sprint", primaryUse: "Acceleration & Strength Speed", sports: ["Football", "Rugby", "Hockey"], costTier: "$$", isFeatured: false },
  { id: 16, name: "Multi-Direction Agility Cones", brand: "Pro Performance", category: "Speed Development", subcategory: "Agility Tools", primaryUse: "Change of Direction Speed", sports: ["Soccer", "Basketball", "Football", "Tennis"], costTier: "$", isFeatured: false },
  { id: 17, name: "Plyometric Hurdles", brand: "Rogue", category: "Speed Development", subcategory: "Plyometrics", primaryUse: "Reactive Strength & Leg Speed", sports: ["Track & Field", "Football", "Basketball", "Soccer"], costTier: "$$", isFeatured: false },
  { id: 18, name: "Hip Circle Band Set", brand: "Mark Bell Sling Shot", category: "Speed Development", subcategory: "Warm-Up Tools", primaryUse: "Glute Activation & Sprint Warm-Up", sports: ["Football", "Soccer", "Track & Field", "Rugby"], costTier: "$", isFeatured: false },
  { id: 19, name: "Reactive Agility Light System", brand: "FitLight", category: "Speed Development", subcategory: "Reaction Training", primaryUse: "Cognitive Speed & Reactive Agility", sports: ["Soccer", "Basketball", "Tennis", "MMA"], costTier: "$$$$", isFeatured: false },
  { id: 20, name: "Velocity Tracking Pod", brand: "STATSports", category: "Speed Development", subcategory: "GPS & Tracking", primaryUse: "Speed Monitoring in Training", sports: ["Soccer", "Rugby", "AFL", "GAA"], costTier: "$$$", isFeatured: false },
  { id: 21, name: "Ankle Resistance Band Kit", brand: "TheraBand", category: "Speed Development", subcategory: "Resisted Sprint", primaryUse: "Hip Drive & Glute Strength for Speed", sports: ["Football", "Soccer", "Track & Field"], costTier: "$", isFeatured: false },
  { id: 22, name: "Quick Release Sprint Belt", brand: "SKLZ", category: "Speed Development", subcategory: "Resisted Sprint", primaryUse: "Partner-Assisted Speed Training", sports: ["Football", "Soccer", "Rugby"], costTier: "$", isFeatured: false },
  { id: 23, name: "Acceleration Sleds (Broad Array)", brand: "Rogue", category: "Speed Development", subcategory: "Resisted Sprint", primaryUse: "Short Acceleration Mechanics", sports: ["Football", "Hockey", "Soccer", "Rugby"], costTier: "$$", isFeatured: false },
  { id: 24, name: "Speed Bungee Cord System", brand: "Perform Better", category: "Speed Development", subcategory: "Overspeed Training", primaryUse: "Supramaximal Speed Work", sports: ["Track & Field", "Football", "Soccer"], costTier: "$", isFeatured: false },
  { id: 25, name: "Coordination Rings", brand: "Generic", category: "Speed Development", subcategory: "Agility Tools", primaryUse: "Footwork & Change of Direction", sports: ["Soccer", "Basketball", "Football", "Volleyball"], costTier: "$", isFeatured: false },

  // ─── Strength Development ──────────────────────────────────────────────────
  { id: 26, name: "Trap Bar (Hex Bar)", brand: "Kabuki Strength", category: "Strength Development", subcategory: "Specialty Bars", primaryUse: "Hip-Dominant Pulling & Jump Training", sports: ["Football", "Rugby", "Track & Field", "General Strength"], costTier: "$$", isFeatured: true },
  { id: 27, name: "Safety Squat Bar", brand: "Titan Fitness", category: "Strength Development", subcategory: "Specialty Bars", primaryUse: "Squat Variation & Shoulder Relief", sports: ["Powerlifting", "Football", "Rugby", "General Strength"], costTier: "$$", isFeatured: false },
  { id: 28, name: "Belt Squat Machine", brand: "Pit Shark", category: "Strength Development", subcategory: "Machines", primaryUse: "Axial-Load-Free Squat Training", sports: ["Powerlifting", "Football", "Rehabilitation"], costTier: "$$$", isFeatured: true },
  { id: 29, name: "Flywheel Training Device", brand: "exxentric", category: "Strength Development", subcategory: "Flywheel", primaryUse: "Eccentric Overload & Power Development", sports: ["Soccer", "Rugby", "Football", "Track & Field"], costTier: "$$$$", isFeatured: true },
  { id: 30, name: "Cambered Bar", brand: "EliteFTS", category: "Strength Development", subcategory: "Specialty Bars", primaryUse: "Squat Variation & Posterior Chain", sports: ["Powerlifting", "Football", "General Strength"], costTier: "$$", isFeatured: false },
  { id: 31, name: "Swiss Bar (Multi-Grip)", brand: "Rogue", category: "Strength Development", subcategory: "Specialty Bars", primaryUse: "Pressing Variation & Shoulder Health", sports: ["Powerlifting", "Football", "General Strength"], costTier: "$$", isFeatured: false },
  { id: 32, name: "Football Bar (Neutral Grip)", brand: "EliteFTS", category: "Strength Development", subcategory: "Specialty Bars", primaryUse: "Neutral-Grip Bench Press", sports: ["Powerlifting", "Football", "Shoulder Rehab"], costTier: "$$", isFeatured: false },
  { id: 33, name: "Log Bar (Strongman)", brand: "Rogue", category: "Strength Development", subcategory: "Specialty Bars", primaryUse: "Overhead Pressing & Event Training", sports: ["Strongman", "Football", "General Strength"], costTier: "$$", isFeatured: false },
  { id: 34, name: "Axle Bar", brand: "EliteFTS", category: "Strength Development", subcategory: "Specialty Bars", primaryUse: "Grip Strength & Pulling Variations", sports: ["Strongman", "Powerlifting", "General Strength"], costTier: "$$", isFeatured: false },
  { id: 35, name: "Bands & Chains Kit", brand: "EliteFTS", category: "Strength Development", subcategory: "Accommodating Resistance", primaryUse: "Accommodating Resistance Training", sports: ["Powerlifting", "Football", "General Strength"], costTier: "$$", isFeatured: false },
  { id: 36, name: "Calibrated Olympic Plates", brand: "Eleiko", category: "Strength Development", subcategory: "Plates & Weights", primaryUse: "Precise Loading for Competition", sports: ["Powerlifting", "Weightlifting", "General Strength"], costTier: "$$$", isFeatured: false },
  { id: 37, name: "Power Rack", brand: "Rogue", category: "Strength Development", subcategory: "Racks & Platforms", primaryUse: "Free-Weight Training Foundation", sports: ["General Strength", "Powerlifting", "Football", "Rugby"], costTier: "$$", isFeatured: false },
  { id: 38, name: "Monolift", brand: "EliteFTS", category: "Strength Development", subcategory: "Racks & Platforms", primaryUse: "Competitive Squat Without Walk-Out", sports: ["Powerlifting"], costTier: "$$$", isFeatured: false },
  { id: 39, name: "Deadlift Platform", brand: "Rogue", category: "Strength Development", subcategory: "Racks & Platforms", primaryUse: "Safe & Noise-Reducing Dead Lifting", sports: ["Powerlifting", "Weightlifting", "General Strength"], costTier: "$$", isFeatured: false },
  { id: 40, name: "Grip Training System", brand: "IronMind", category: "Strength Development", subcategory: "Grip", primaryUse: "Grip Strength & Crushing Endurance", sports: ["Strongman", "Powerlifting", "MMA", "Climbing"], costTier: "$", isFeatured: false },
  { id: 41, name: "Farmer's Walk Handles", brand: "Rogue", category: "Strength Development", subcategory: "Strongman Equipment", primaryUse: "Loaded Carry & Conditioning", sports: ["Strongman", "Football", "General Strength"], costTier: "$$", isFeatured: false },
  { id: 42, name: "Yoke Carry Frame", brand: "Rogue", category: "Strength Development", subcategory: "Strongman Equipment", primaryUse: "Yoke Walk & Strongman Training", sports: ["Strongman", "Football", "General Strength"], costTier: "$$", isFeatured: false },
  { id: 43, name: "Weight Releasers", brand: "EliteFTS", category: "Strength Development", subcategory: "Accommodating Resistance", primaryUse: "Eccentric Overload Training", sports: ["Powerlifting", "Football", "General Strength"], costTier: "$$", isFeatured: false },
  { id: 44, name: "Reverse Hyper Machine", brand: "Westside Barbell", category: "Strength Development", subcategory: "Machines", primaryUse: "Posterior Chain Strength & Recovery", sports: ["Powerlifting", "Football", "General Strength"], costTier: "$$$", isFeatured: false },
  { id: 45, name: "Wrist Roller", brand: "IronMind", category: "Strength Development", subcategory: "Grip", primaryUse: "Forearm & Grip Endurance", sports: ["Strongman", "Wrestling", "Climbing", "MMA"], costTier: "$", isFeatured: false },
  { id: 46, name: "Glute Ham Developer (GHD)", brand: "Rogue", category: "Strength Development", subcategory: "Machines", primaryUse: "Posterior Chain & Core Strength", sports: ["Football", "Rugby", "Powerlifting", "General Strength"], costTier: "$$", isFeatured: false },
  { id: 47, name: "Pendulum Squat Machine", brand: "Pit Shark", category: "Strength Development", subcategory: "Machines", primaryUse: "Quad-Dominant Squat Variation", sports: ["Bodybuilding", "Football", "General Strength"], costTier: "$$$", isFeatured: false },
  { id: 48, name: "Atlas Stone Set", brand: "Rogue", category: "Strength Development", subcategory: "Strongman Equipment", primaryUse: "Stone Load & Carry", sports: ["Strongman", "General Strength"], costTier: "$$", isFeatured: false },
  { id: 49, name: "Olympic Weightlifting Set", brand: "Eleiko", category: "Strength Development", subcategory: "Olympic Lifting", primaryUse: "Snatch & Clean & Jerk", sports: ["Weightlifting", "CrossFit", "Football"], costTier: "$$$", isFeatured: false },
  { id: 50, name: "Box Squat Box Set", brand: "EliteFTS", category: "Strength Development", subcategory: "Technique Tools", primaryUse: "Box Squat & Conjugate Programming", sports: ["Powerlifting", "Football", "General Strength"], costTier: "$", isFeatured: false },

  // ─── Recovery & Regeneration ───────────────────────────────────────────────
  { id: 51, name: "Percussion Massage Gun", brand: "Theragun", category: "Recovery & Regeneration", subcategory: "Soft Tissue", primaryUse: "Soft Tissue Recovery & Warm-Up", sports: ["All Sports"], costTier: "$$", isFeatured: true },
  { id: 52, name: "Pneumatic Compression Boots", brand: "Normatec", category: "Recovery & Regeneration", subcategory: "Compression", primaryUse: "Lower Limb Recovery & Blood Flow", sports: ["All Sports"], costTier: "$$$", isFeatured: true },
  { id: 53, name: "Cold Water Immersion Tub", brand: "Ice Barrel", category: "Recovery & Regeneration", subcategory: "Cold Therapy", primaryUse: "Acute Recovery & Inflammation Control", sports: ["All Sports"], costTier: "$$", isFeatured: false },
  { id: 54, name: "Infrared Sauna", brand: "Sunlighten", category: "Recovery & Regeneration", subcategory: "Heat Therapy", primaryUse: "Deep Tissue Recovery & Detox", sports: ["All Sports"], costTier: "$$$$", isFeatured: false },
  { id: 55, name: "Foam Roller Set", brand: "TriggerPoint", category: "Recovery & Regeneration", subcategory: "Self-Myofascial Release", primaryUse: "Myofascial Release & Mobility", sports: ["All Sports"], costTier: "$", isFeatured: false },
  { id: 56, name: "Lacrosse Ball Set", brand: "Generic", category: "Recovery & Regeneration", subcategory: "Self-Myofascial Release", primaryUse: "Targeted Trigger Point Release", sports: ["All Sports"], costTier: "$", isFeatured: false },
  { id: 57, name: "Electric Muscle Stimulation (EMS)", brand: "Compex", category: "Recovery & Regeneration", subcategory: "Electrical Stimulation", primaryUse: "Neuromuscular Recovery & Strength", sports: ["All Sports"], costTier: "$$$", isFeatured: false },
  { id: 58, name: "TENS Unit", brand: "Omron", category: "Recovery & Regeneration", subcategory: "Electrical Stimulation", primaryUse: "Pain Management & Nerve Stimulation", sports: ["All Sports"], costTier: "$$", isFeatured: false },
  { id: 59, name: "Red Light Therapy Device", brand: "Joovv", category: "Recovery & Regeneration", subcategory: "Photobiomodulation", primaryUse: "Cellular Recovery & Inflammation", sports: ["All Sports"], costTier: "$$$", isFeatured: false },
  { id: 60, name: "Vibration Plate", brand: "LifePro", category: "Recovery & Regeneration", subcategory: "Vibration Therapy", primaryUse: "Circulation & Warm-Up Recovery", sports: ["All Sports"], costTier: "$$", isFeatured: false },
  { id: 61, name: "Blood Flow Restriction Cuffs", brand: "Delfi Medical", category: "Recovery & Regeneration", subcategory: "BFR Training", primaryUse: "Low-Load Strength During Rehab", sports: ["Rehabilitation", "Football", "Soccer"], costTier: "$$$", isFeatured: false },
  { id: 62, name: "Cupping Set", brand: "ACE Massage Cupping", category: "Recovery & Regeneration", subcategory: "Manual Therapy", primaryUse: "Myofascial Decompression", sports: ["All Sports"], costTier: "$", isFeatured: false },
  { id: 63, name: "Graston Tool Set", brand: "Graston Technique", category: "Recovery & Regeneration", subcategory: "Manual Therapy", primaryUse: "Instrument-Assisted Soft Tissue Mobilization", sports: ["All Sports"], costTier: "$$", isFeatured: false },
  { id: 64, name: "Contrast Bath System", brand: "Generic", category: "Recovery & Regeneration", subcategory: "Hydrotherapy", primaryUse: "Hot/Cold Contrast for Recovery", sports: ["All Sports"], costTier: "$", isFeatured: false },
  { id: 65, name: "Compression Sleeves (Limb)", brand: "2XU", category: "Recovery & Regeneration", subcategory: "Compression", primaryUse: "Post-Exercise Recovery & Circulation", sports: ["Running", "Cycling", "Soccer", "Basketball"], costTier: "$", isFeatured: false },
  { id: 66, name: "Tiger Tail Roller", brand: "Tiger Tail USA", category: "Recovery & Regeneration", subcategory: "Self-Myofascial Release", primaryUse: "Targeted Rolling for Legs & Back", sports: ["Running", "Soccer", "Track & Field"], costTier: "$", isFeatured: false },
  { id: 67, name: "Percussion Ball Device", brand: "Compex", category: "Recovery & Regeneration", subcategory: "Soft Tissue", primaryUse: "Targeted Deep Tissue Percussion", sports: ["All Sports"], costTier: "$$", isFeatured: false },
  { id: 68, name: "Active Recovery Bike", brand: "Concept2 BikeErg", category: "Recovery & Regeneration", subcategory: "Active Recovery", primaryUse: "Low-Intensity Flush Recovery", sports: ["All Sports"], costTier: "$$", isFeatured: false },
  { id: 69, name: "Acupuncture Mat", brand: "Nayoya", category: "Recovery & Regeneration", subcategory: "Pressure Point Therapy", primaryUse: "Tension Relief & Circulation", sports: ["All Sports"], costTier: "$", isFeatured: false },
  { id: 70, name: "Massage Table", brand: "Oakworks", category: "Recovery & Regeneration", subcategory: "Manual Therapy", primaryUse: "Professional Soft Tissue & Manual Therapy", sports: ["All Sports"], costTier: "$$", isFeatured: false },
  { id: 71, name: "Cryotherapy Chamber Access", brand: "KryoLife", category: "Recovery & Regeneration", subcategory: "Cold Therapy", primaryUse: "Whole-Body Cold Exposure", sports: ["All Sports"], costTier: "$$$$", isFeatured: false },
  { id: 72, name: "Hyperbaric Oxygen Chamber", brand: "Summit to Sea", category: "Recovery & Regeneration", subcategory: "Oxygen Therapy", primaryUse: "Accelerated Tissue Repair", sports: ["All Sports"], costTier: "$$$$", isFeatured: false },
  { id: 73, name: "Sleep Optimization Tracker", brand: "Whoop", category: "Recovery & Regeneration", subcategory: "Recovery Monitoring", primaryUse: "Sleep Quality & Recovery Tracking", sports: ["All Sports"], costTier: "$$", isFeatured: false },
  { id: 74, name: "Soft Tissue Therapy Kit", brand: "RockTape", category: "Recovery & Regeneration", subcategory: "Kinesiology Taping", primaryUse: "Kinesiology Taping & Fascial Support", sports: ["All Sports"], costTier: "$", isFeatured: false },
  { id: 75, name: "Postural Recovery Wedge", brand: "Align-Pillow", category: "Recovery & Regeneration", subcategory: "Passive Recovery", primaryUse: "Positional Recovery & Spinal Decompression", sports: ["All Sports"], costTier: "$", isFeatured: false },

  // ─── Monitoring & Assessment ───────────────────────────────────────────────
  { id: 76, name: "Force Plate (Dual)", brand: "Vald Performance", category: "Monitoring & Assessment", subcategory: "Force Plates", primaryUse: "Jump Testing & Force Production", sports: ["Football", "Rugby", "Track & Field", "Basketball"], costTier: "$$$$", isFeatured: true },
  { id: 77, name: "Linear Position Transducer", brand: "GymAware", category: "Monitoring & Assessment", subcategory: "Velocity Tracking", primaryUse: "Velocity-Based Training & Bar Speed", sports: ["Powerlifting", "Football", "Weightlifting"], costTier: "$$$", isFeatured: true },
  { id: 78, name: "GPS Performance Tracker", brand: "Catapult", category: "Monitoring & Assessment", subcategory: "GPS Wearables", primaryUse: "External Load & Movement Monitoring", sports: ["Soccer", "Rugby", "AFL", "Football"], costTier: "$$$$", isFeatured: false },
  { id: 79, name: "Jump Mat", brand: "Just Jump", category: "Monitoring & Assessment", subcategory: "Jump Testing", primaryUse: "Vertical Jump Assessment", sports: ["Basketball", "Volleyball", "Football", "Track & Field"], costTier: "$$", isFeatured: false },
  { id: 80, name: "Heart Rate Monitor (Chest Strap)", brand: "Polar", category: "Monitoring & Assessment", subcategory: "Cardiac Monitoring", primaryUse: "Training Load & Zone Monitoring", sports: ["All Sports"], costTier: "$", isFeatured: false },
  { id: 81, name: "HRV Monitor", brand: "Polar Ignite", category: "Monitoring & Assessment", subcategory: "Readiness Testing", primaryUse: "Recovery & Autonomic Readiness", sports: ["All Sports"], costTier: "$$", isFeatured: false },
  { id: 82, name: "Lactate Analyzer", brand: "Lactate Pro", category: "Monitoring & Assessment", subcategory: "Metabolic Testing", primaryUse: "Threshold Testing & Energy System Assessment", sports: ["Cycling", "Running", "Rowing", "Swimming"], costTier: "$$$", isFeatured: false },
  { id: 83, name: "Portable VO2 Max System", brand: "COSMED K5", category: "Monitoring & Assessment", subcategory: "Metabolic Testing", primaryUse: "Aerobic Capacity Testing", sports: ["Running", "Cycling", "Soccer", "Cross-Country"], costTier: "$$$$", isFeatured: false },
  { id: 84, name: "Isokinetic Dynamometer", brand: "Biodex", category: "Monitoring & Assessment", subcategory: "Strength Testing", primaryUse: "Muscle Strength & Imbalance Assessment", sports: ["Rehabilitation", "Football", "Rugby"], costTier: "$$$$", isFeatured: false },
  { id: 85, name: "Accelerometer (Wearable)", brand: "PUSH Band", category: "Monitoring & Assessment", subcategory: "Velocity Tracking", primaryUse: "Bar Velocity & Power Output Tracking", sports: ["Powerlifting", "Football", "General Strength"], costTier: "$$", isFeatured: false },
  { id: 86, name: "High-Speed Video System", brand: "Dartfish", category: "Monitoring & Assessment", subcategory: "Video Analysis", primaryUse: "Biomechanical Video Analysis", sports: ["Track & Field", "Football", "Swimming", "Gymnastics"], costTier: "$$$$", isFeatured: false },
  { id: 87, name: "3D Motion Capture System", brand: "Vicon", category: "Monitoring & Assessment", subcategory: "Biomechanics", primaryUse: "Full Kinematic Analysis", sports: ["Track & Field", "Rehabilitation", "Research"], costTier: "$$$$", isFeatured: false },
  { id: 88, name: "Handheld Dynamometer", brand: "Chatillon", category: "Monitoring & Assessment", subcategory: "Strength Testing", primaryUse: "Muscle Force Testing & Injury Screening", sports: ["All Sports", "Rehabilitation"], costTier: "$$", isFeatured: false },
  { id: 89, name: "Grip Strength Dynamometer", brand: "Jamar", category: "Monitoring & Assessment", subcategory: "Strength Testing", primaryUse: "Grip & Hand Strength Assessment", sports: ["All Sports", "Strongman", "Rock Climbing"], costTier: "$$", isFeatured: false },
  { id: 90, name: "Blood Oxygen Monitor", brand: "Masimo", category: "Monitoring & Assessment", subcategory: "Physiological Monitoring", primaryUse: "SpO2 & Altitude Training Monitoring", sports: ["Running", "Cycling", "Swimming", "All Sports"], costTier: "$$", isFeatured: false },
  { id: 91, name: "Jump Testing App System", brand: "My Jump 2", category: "Monitoring & Assessment", subcategory: "Jump Testing", primaryUse: "Phone-Based Jump Height Assessment", sports: ["Basketball", "Football", "Volleyball", "Track & Field"], costTier: "$", isFeatured: false },
  { id: 92, name: "Tensiometer", brand: "Dyno", category: "Monitoring & Assessment", subcategory: "Strength Testing", primaryUse: "Isometric Force Testing", sports: ["All Sports", "Rehabilitation"], costTier: "$$", isFeatured: false },
  { id: 93, name: "Balance Assessment Platform", brand: "Bertec", category: "Monitoring & Assessment", subcategory: "Balance & Stability", primaryUse: "Postural Stability & Return-to-Sport Testing", sports: ["All Sports", "Rehabilitation"], costTier: "$$$", isFeatured: false },
  { id: 94, name: "EMG System", brand: "Delsys", category: "Monitoring & Assessment", subcategory: "Neuromuscular", primaryUse: "Muscle Activation & Neuromuscular Analysis", sports: ["Research", "Rehabilitation", "All Sports"], costTier: "$$$$", isFeatured: false },
  { id: 95, name: "Goniometer Set", brand: "North Coast Medical", category: "Monitoring & Assessment", subcategory: "Range of Motion", primaryUse: "Joint Angle & ROM Assessment", sports: ["Rehabilitation", "All Sports"], costTier: "$", isFeatured: false },
  { id: 96, name: "Reactive Strength Index Timer", brand: "Dashr", category: "Monitoring & Assessment", subcategory: "Jump Testing", primaryUse: "RSI & Reactive Strength Monitoring", sports: ["Track & Field", "Football", "Basketball"], costTier: "$$", isFeatured: false },
  { id: 97, name: "Resting Metabolic Rate Analyzer", brand: "COSMED", category: "Monitoring & Assessment", subcategory: "Metabolic Testing", primaryUse: "Caloric Needs & Metabolic Baseline", sports: ["All Sports", "Weight-Class Sports"], costTier: "$$$", isFeatured: false },
  { id: 98, name: "Inertial Measurement Unit (IMU)", brand: "Xsens", category: "Monitoring & Assessment", subcategory: "Biomechanics", primaryUse: "Movement Quality & Segment Tracking", sports: ["All Sports"], costTier: "$$$", isFeatured: false },
  { id: 99, name: "Postural Screen Software", brand: "PostureScreen", category: "Monitoring & Assessment", subcategory: "Posture", primaryUse: "Postural Assessment & Deviation Screening", sports: ["All Sports", "Rehabilitation"], costTier: "$", isFeatured: false },
  { id: 100, name: "Ultrasound Imaging Device", brand: "Telemed", category: "Monitoring & Assessment", subcategory: "Tissue Imaging", primaryUse: "Muscle Architecture & Injury Assessment", sports: ["All Sports", "Rehabilitation"], costTier: "$$$$", isFeatured: false },

  // ─── Conditioning ──────────────────────────────────────────────────────────
  { id: 101, name: "Assault Air Bike", brand: "Assault Fitness", category: "Conditioning", subcategory: "Cardio Equipment", primaryUse: "High-Intensity Interval Training", sports: ["CrossFit", "Football", "MMA", "General Fitness"], costTier: "$$", isFeatured: true },
  { id: 102, name: "SkiErg", brand: "Concept2", category: "Conditioning", subcategory: "Cardio Equipment", primaryUse: "Upper Body Aerobic Conditioning", sports: ["Nordic Skiing", "CrossFit", "Football", "General Fitness"], costTier: "$$", isFeatured: true },
  { id: 103, name: "Rowing Machine", brand: "Concept2", category: "Conditioning", subcategory: "Cardio Equipment", primaryUse: "Full-Body Aerobic & Anaerobic Training", sports: ["Rowing", "CrossFit", "General Fitness", "Football"], costTier: "$$", isFeatured: false },
  { id: 104, name: "Prowler Push Sled", brand: "EliteFTS", category: "Conditioning", subcategory: "Sled Training", primaryUse: "Metabolic Conditioning & Leg Drive", sports: ["Football", "Rugby", "CrossFit", "General Strength"], costTier: "$$", isFeatured: true },
  { id: 105, name: "Battle Ropes", brand: "Onnit", category: "Conditioning", subcategory: "Functional Training", primaryUse: "Upper Body Endurance & Power", sports: ["MMA", "Football", "CrossFit", "General Fitness"], costTier: "$", isFeatured: false },
  { id: 106, name: "Slam Balls", brand: "Rogue", category: "Conditioning", subcategory: "Functional Training", primaryUse: "Power Endurance & Core Conditioning", sports: ["CrossFit", "MMA", "Football", "General Fitness"], costTier: "$", isFeatured: false },
  { id: 107, name: "Flip Tire (Various Weights)", brand: "Generic", category: "Conditioning", subcategory: "Strongman Conditioning", primaryUse: "Total-Body Power & Conditioning", sports: ["Strongman", "Football", "CrossFit"], costTier: "$", isFeatured: false },
  { id: 108, name: "Versaclimber", brand: "Versaclimber", category: "Conditioning", subcategory: "Cardio Equipment", primaryUse: "Vertical Climbing Cardio", sports: ["CrossFit", "MMA", "General Fitness", "Football"], costTier: "$$$", isFeatured: false },
  { id: 109, name: "Jacob's Ladder", brand: "Jacob's Ladder", category: "Conditioning", subcategory: "Cardio Equipment", primaryUse: "Full-Body Low-Impact Cardio", sports: ["CrossFit", "MMA", "General Fitness", "Rehabilitation"], costTier: "$$$", isFeatured: false },
  { id: 110, name: "Echo Bike", brand: "Rogue", category: "Conditioning", subcategory: "Cardio Equipment", primaryUse: "Air Resistance HIIT Cycling", sports: ["CrossFit", "Football", "MMA", "General Fitness"], costTier: "$$", isFeatured: false },
  { id: 111, name: "Kettlebell Set", brand: "Rogue", category: "Conditioning", subcategory: "Kettlebells", primaryUse: "Ballistic Conditioning & Strength", sports: ["CrossFit", "MMA", "General Fitness", "All Sports"], costTier: "$$", isFeatured: false },
  { id: 112, name: "Medicine Ball Set", brand: "Dynamax", category: "Conditioning", subcategory: "Medicine Balls", primaryUse: "Power & Rotational Conditioning", sports: ["CrossFit", "Baseball", "Football", "General Fitness"], costTier: "$", isFeatured: false },
  { id: 113, name: "Jump Rope Set (Speed & Weighted)", brand: "Buddy Lee", category: "Conditioning", subcategory: "Jump Rope", primaryUse: "Footwork, Cardio & Conditioning", sports: ["Boxing", "MMA", "CrossFit", "Track & Field"], costTier: "$", isFeatured: false },
  { id: 114, name: "Sled Drag Rope & Harness", brand: "EliteFTS", category: "Conditioning", subcategory: "Sled Training", primaryUse: "Backward Sled Drag & Pull Conditioning", sports: ["Football", "Rugby", "General Strength"], costTier: "$", isFeatured: false },
  { id: 115, name: "Commercial Treadmill", brand: "Woodway", category: "Conditioning", subcategory: "Cardio Equipment", primaryUse: "Run Training & Cardio", sports: ["Running", "Football", "Soccer", "General Fitness"], costTier: "$$$", isFeatured: false },
  { id: 116, name: "Stair Climber Machine", brand: "StairMaster", category: "Conditioning", subcategory: "Cardio Equipment", primaryUse: "Lower Body Cardio & Endurance", sports: ["General Fitness", "Football", "Basketball"], costTier: "$$$", isFeatured: false },
  { id: 117, name: "Sandbag Training Set", brand: "GORUCK", category: "Conditioning", subcategory: "Functional Training", primaryUse: "Loaded Carry & Functional Conditioning", sports: ["CrossFit", "Military Fitness", "Football", "General Fitness"], costTier: "$", isFeatured: false },
  { id: 118, name: "Bulgarian Bag", brand: "SUPLES", category: "Conditioning", subcategory: "Functional Training", primaryUse: "Rotational Power & Conditioning", sports: ["Wrestling", "MMA", "CrossFit", "General Fitness"], costTier: "$", isFeatured: false },
  { id: 119, name: "Steel Mace", brand: "Onnit", category: "Conditioning", subcategory: "Functional Training", primaryUse: "Shoulder Stability & Rotational Power", sports: ["MMA", "CrossFit", "General Fitness", "Wrestling"], costTier: "$", isFeatured: false },
  { id: 120, name: "Functional Training Rig", brand: "Rogue", category: "Conditioning", subcategory: "Training Infrastructure", primaryUse: "Multi-Station Circuit & Functional Training", sports: ["CrossFit", "Football", "General Fitness"], costTier: "$$$", isFeatured: false },
  { id: 121, name: "Spin Bike (Indoor Cycling)", brand: "Peloton", category: "Conditioning", subcategory: "Cardio Equipment", primaryUse: "Aerobic Base & Interval Training", sports: ["Cycling", "Triathlon", "General Fitness"], costTier: "$$$", isFeatured: false },
  { id: 122, name: "Airdyne Bike", brand: "Schwinn", category: "Conditioning", subcategory: "Cardio Equipment", primaryUse: "Full-Body Air Resistance Cardio", sports: ["CrossFit", "MMA", "General Fitness"], costTier: "$$", isFeatured: false },
  { id: 123, name: "Heavy Bag (Boxing)", brand: "Everlast", category: "Conditioning", subcategory: "Combat Conditioning", primaryUse: "Strike Conditioning & Power Endurance", sports: ["Boxing", "MMA", "Kickboxing"], costTier: "$", isFeatured: false },
  { id: 124, name: "Tabata / Interval Timer", brand: "Gymboss", category: "Conditioning", subcategory: "Training Tools", primaryUse: "Work/Rest Interval Management", sports: ["All Sports"], costTier: "$", isFeatured: false },
  { id: 125, name: "Plyo Box Set (3-in-1)", brand: "Rogue", category: "Conditioning", subcategory: "Plyometrics", primaryUse: "Box Jump & Depth Jump Conditioning", sports: ["CrossFit", "Football", "Basketball", "Track & Field"], costTier: "$", isFeatured: false },

  // ─── Mobility & Rehabilitation ─────────────────────────────────────────────
  { id: 126, name: "Resistance Band Set", brand: "TheraBand", category: "Mobility & Rehabilitation", subcategory: "Bands", primaryUse: "Corrective Exercise & Mobility Work", sports: ["All Sports", "Rehabilitation"], costTier: "$", isFeatured: true },
  { id: 127, name: "BOSU Balance Trainer", brand: "BOSU", category: "Mobility & Rehabilitation", subcategory: "Balance Training", primaryUse: "Balance, Stability & Rehab Training", sports: ["All Sports", "Rehabilitation"], costTier: "$$", isFeatured: false },
  { id: 128, name: "Balance Board", brand: "REP Fitness", category: "Mobility & Rehabilitation", subcategory: "Balance Training", primaryUse: "Proprioception & Ankle Stability", sports: ["Surfing", "Snowboarding", "All Sports", "Rehabilitation"], costTier: "$", isFeatured: false },
  { id: 129, name: "Slant Board", brand: "Knees Over Toes", category: "Mobility & Rehabilitation", subcategory: "Mobility Tools", primaryUse: "Ankle Mobility & Knee Rehabilitation", sports: ["All Sports", "Rehabilitation"], costTier: "$", isFeatured: true },
  { id: 130, name: "Isometric Training Belt", brand: "EliteFTS", category: "Mobility & Rehabilitation", subcategory: "Isometric Devices", primaryUse: "Isometric Force & Tendon Rehab", sports: ["All Sports", "Rehabilitation"], costTier: "$", isFeatured: false },
  { id: 131, name: "PNF Stretching Strap", brand: "Stretch Out Strap", category: "Mobility & Rehabilitation", subcategory: "Stretching Tools", primaryUse: "PNF & Assisted Flexibility Work", sports: ["All Sports", "Dance", "Gymnastics"], costTier: "$", isFeatured: false },
  { id: 132, name: "Yoga Blocks Set", brand: "Manduka", category: "Mobility & Rehabilitation", subcategory: "Yoga & Flexibility", primaryUse: "Pose Modification & Mobility Progression", sports: ["All Sports", "Yoga", "Dance"], costTier: "$", isFeatured: false },
  { id: 133, name: "Gymnastics Rings", brand: "Rogue", category: "Mobility & Rehabilitation", subcategory: "Bodyweight Training", primaryUse: "Upper Body Stability & Shoulder Rehab", sports: ["Gymnastics", "CrossFit", "General Fitness"], costTier: "$", isFeatured: false },
  { id: 134, name: "Hip Flexor Stretch Wedge", brand: "Generic", category: "Mobility & Rehabilitation", subcategory: "Stretching Tools", primaryUse: "Hip Flexor & Thoracic Mobility", sports: ["All Sports", "Rehabilitation"], costTier: "$", isFeatured: false },
  { id: 135, name: "Foot Roller", brand: "TriggerPoint", category: "Mobility & Rehabilitation", subcategory: "Soft Tissue Tools", primaryUse: "Plantar Fascia & Foot Arch Release", sports: ["Running", "Basketball", "Soccer", "All Sports"], costTier: "$", isFeatured: false },
  { id: 136, name: "Calf Stretcher Board", brand: "Pro-Tec", category: "Mobility & Rehabilitation", subcategory: "Stretching Tools", primaryUse: "Achilles & Calf Flexibility", sports: ["Running", "Basketball", "Soccer", "Rehabilitation"], costTier: "$", isFeatured: false },
  { id: 137, name: "Wobble Cushion", brand: "Airex", category: "Mobility & Rehabilitation", subcategory: "Balance Training", primaryUse: "Core Activation & Proprioception", sports: ["All Sports", "Rehabilitation"], costTier: "$", isFeatured: false },
  { id: 138, name: "Pulley Cable Rehab System", brand: "Samson Equipment", category: "Mobility & Rehabilitation", subcategory: "Cable Systems", primaryUse: "Rotator Cuff & Shoulder Rehabilitation", sports: ["All Sports", "Rehabilitation"], costTier: "$$", isFeatured: false },
  { id: 139, name: "Parallel Dip Station", brand: "Rogue", category: "Mobility & Rehabilitation", subcategory: "Bodyweight Tools", primaryUse: "Tricep & Shoulder Rehabilitation", sports: ["General Fitness", "Gymnastics", "Rehabilitation"], costTier: "$", isFeatured: false },
  { id: 140, name: "Inversion Table", brand: "Teeter", category: "Mobility & Rehabilitation", subcategory: "Spinal Decompression", primaryUse: "Spinal Decompression & Back Relief", sports: ["All Sports", "Rehabilitation"], costTier: "$$", isFeatured: false },
  { id: 141, name: "Kinesiology Tape (Bulk)", brand: "RockTape", category: "Mobility & Rehabilitation", subcategory: "Taping", primaryUse: "Joint Support & Movement Facilitation", sports: ["All Sports", "Rehabilitation"], costTier: "$", isFeatured: false },
  { id: 142, name: "Postural Assessment Grid", brand: "Whitehall Manufacturing", category: "Mobility & Rehabilitation", subcategory: "Assessment Tools", primaryUse: "Posture Alignment & Deviation Screening", sports: ["All Sports", "Rehabilitation"], costTier: "$", isFeatured: false },
  { id: 143, name: "Suspension Trainer (TRX)", brand: "TRX", category: "Mobility & Rehabilitation", subcategory: "Suspension Training", primaryUse: "Bodyweight Rehab & Stability Training", sports: ["All Sports", "Rehabilitation"], costTier: "$$", isFeatured: false },
  { id: 144, name: "Proprioceptive Balance Discs", brand: "Airex", category: "Mobility & Rehabilitation", subcategory: "Balance Training", primaryUse: "Ankle Stability & Rehab Progression", sports: ["All Sports", "Rehabilitation"], costTier: "$", isFeatured: false },
  { id: 145, name: "Functional Movement Screen Kit", brand: "FMS", category: "Mobility & Rehabilitation", subcategory: "Screening Tools", primaryUse: "Movement Quality Screening & Injury Risk", sports: ["All Sports"], costTier: "$$", isFeatured: false },
  { id: 146, name: "Wall-Mounted Pulley System", brand: "Samson Equipment", category: "Mobility & Rehabilitation", subcategory: "Cable Systems", primaryUse: "Functional Movement & Rotator Cuff Rehab", sports: ["All Sports", "Rehabilitation"], costTier: "$$", isFeatured: false },
  { id: 147, name: "Manual Therapy Instrument Set", brand: "Graston Technique", category: "Mobility & Rehabilitation", subcategory: "Manual Therapy", primaryUse: "IASTM & Fascial Mobilization", sports: ["All Sports", "Rehabilitation"], costTier: "$$", isFeatured: false },
  { id: 148, name: "Corrective Exercise Band Kit", brand: "TheraBand", category: "Mobility & Rehabilitation", subcategory: "Corrective Tools", primaryUse: "Movement Pattern Correction & Prehab", sports: ["All Sports", "Rehabilitation"], costTier: "$", isFeatured: false },
  { id: 149, name: "Nordic Hamstring Curl Device", brand: "Vald NordBord", category: "Mobility & Rehabilitation", subcategory: "Hamstring Rehab", primaryUse: "Eccentric Hamstring Strength & Injury Prevention", sports: ["Soccer", "Football", "Track & Field", "Rugby"], costTier: "$$$", isFeatured: true },
  { id: 150, name: "Hip Rehab Band System", brand: "EliteFTS", category: "Mobility & Rehabilitation", subcategory: "Corrective Tools", primaryUse: "Hip Stability & Glute Activation Rehab", sports: ["All Sports", "Rehabilitation"], costTier: "$", isFeatured: false },
];

export const FEATURED_PRODUCTS = ALL_PRODUCTS.filter((p) => p.isFeatured);
