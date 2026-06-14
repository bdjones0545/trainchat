// ─── Performance Intelligence Engine ─────────────────────────────────────────
//
// Phase 5 — Program Intelligence Engine
// Phase 7 — Research Intelligence Integration
//
// Transforms raw athlete context (goals, sport, position, assessments, equipment)
// into a structured Performance Profile that drives program architecture,
// exercise selection, and coaching explanations.
//
// Phase 7 upgrades single-number method confidence to a multi-dimensional
// Research Confidence Score:
//   ProfileMatch × ResearchSupport × PopulationTransfer × AdaptationRelevance
//
// All functions are pure (no DB or AI calls). The engine is called on BUILD
// paths in ai.ts and the output is injected into the system prompt + API.
// ─────────────────────────────────────────────────────────────────────────────

import {
  applyResearchIntelligence,
  buildResearchIntelligencePromptSection,
  buildResearchIntelligenceApiResponse,
} from "../research-intelligence/index.js";
import type { ResearchConfidenceScore, ResearchIntelligenceOutput } from "../research-intelligence/index.js";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface AssessmentResult {
  assessmentName: string;
  score: string;
  tier: "elite" | "good" | "average" | "below";
}

export interface PerformanceProfileInput {
  goal: string;
  sport?: string | null;
  position?: string | null;
  age?: number | null;
  trainingAge?: string | null;
  availableEquipment?: string | null;
  assessmentResults?: AssessmentResult[];
  constraints?: string[];
  sessionFrequency?: number | null;
  sessionDuration?: number | null;
  focusMode?: string | null;
}

export interface PrioritizedQuality {
  quality: string;
  score: number;
  reason: string;
  priority: number;
}

export interface LimitingFactor {
  factor: string;
  detail: string;
  severity: "critical" | "moderate" | "minor";
  sourceAssessment?: string;
}

export interface RankedMethod {
  method: string;
  confidence: number;
  targetQuality: string;
  rationale: string;
  /** Phase 7 — multi-dimensional research confidence breakdown */
  researchConfidence?: ResearchConfidenceScore;
  /** Phase 7 — short evidence summary */
  evidenceSummary?: string;
  /** Phase 7 — whether contradictory evidence exists for key claims */
  hasContradictions?: boolean;
}

export interface ExercisePool {
  tier1: string[];
  tier2: string[];
  substitutions: string[];
  progressions: string[];
  regressions: string[];
}

export interface ExerciseReason {
  exercise: string;
  targetQuality: string;
  method: string;
  limitingFactor?: string;
  expectedAdaptation: string;
  confidence: number;
}

export interface AdaptationForecast {
  primary: string[];
  secondary: string[];
  timeline: string;
}

export interface PerformanceProfile {
  goal: string;
  sport: string | null;
  focusMode: string | null;
  priorityQualities: PrioritizedQuality[];
  limitingFactors: LimitingFactor[];
  recommendedMethods: RankedMethod[];
  equipmentOpportunities: string[];
  recommendedExercisePool: ExercisePool;
  riskFactors: string[];
  expectedAdaptations: AdaptationForecast;
  exerciseRationale: ExerciseReason[];
  confidence: number;
  version: number;
  /** Phase 7 — Research Intelligence Layer output. Populated after research layer runs. */
  researchIntelligence?: ResearchIntelligenceOutput;
}

// ─── Knowledge Base ───────────────────────────────────────────────────────────
// Embedded knowledge maps so the engine runs with zero external dependencies.

const GOAL_QUALITY_MAP: Record<string, Array<{ quality: string; score: number; reason: string }>> = {
  strength: [
    { quality: "Maximal Strength", score: 95, reason: "Primary driver of strength adaptation" },
    { quality: "Neural Drive", score: 88, reason: "Neural efficiency gates strength expression" },
    { quality: "Structural Strength", score: 82, reason: "Tissue capacity enables max loading" },
    { quality: "Rate of Force Development", score: 72, reason: "Explosive strength supports total strength gains" },
    { quality: "Trunk Stability", score: 65, reason: "Core stiffness transfers force during heavy lifts" },
  ],
  athletic_performance: [
    { quality: "Acceleration", score: 92, reason: "First-step speed is the most trainable athletic quality" },
    { quality: "Lower Body Power", score: 90, reason: "Explosive power underpins all athletic movements" },
    { quality: "Reactive Strength", score: 88, reason: "Elastic power drives sport-specific explosiveness" },
    { quality: "Rate of Force Development", score: 85, reason: "Rapid force production separates athletic tiers" },
    { quality: "Max Velocity", score: 80, reason: "Top-end speed creates separation from opponents" },
    { quality: "Maximal Strength", score: 75, reason: "Strength base enables power transfer to movement" },
    { quality: "Change of Direction Speed", score: 72, reason: "Multi-directional speed is critical in field sports" },
  ],
  hypertrophy: [
    { quality: "Hypertrophy", score: 95, reason: "Direct target of muscle growth programming" },
    { quality: "Muscular Endurance", score: 78, reason: "Volume tolerance drives hypertrophic stimulus" },
    { quality: "Structural Strength", score: 72, reason: "Strength base allows progressive overload" },
    { quality: "Metabolic Stress", score: 68, reason: "Metabolic fatigue drives sarcoplasmic growth" },
  ],
  fat_loss: [
    { quality: "Aerobic Capacity", score: 85, reason: "Aerobic metabolism is the primary fat oxidation system" },
    { quality: "Metabolic Conditioning", score: 82, reason: "EPOC and elevated metabolism drive fat loss" },
    { quality: "Muscular Endurance", score: 72, reason: "Endurance base enables sustained higher-intensity work" },
    { quality: "Lactate Threshold", score: 68, reason: "Threshold raises intensity ceiling for conditioning" },
  ],
  general_fitness: [
    { quality: "Aerobic Base", score: 80, reason: "Cardiovascular fitness is the foundation of general health" },
    { quality: "Structural Strength", score: 75, reason: "Baseline strength supports all physical activities" },
    { quality: "Movement Quality", score: 72, reason: "Fundamental patterns must be sound before loading" },
    { quality: "Muscular Endurance", score: 68, reason: "Endurance enables sustained daily activity" },
    { quality: "Flexibility", score: 58, reason: "Mobility supports safe movement across activity types" },
  ],
  endurance: [
    { quality: "Aerobic Capacity", score: 95, reason: "VO2 Max is the primary ceiling for endurance performance" },
    { quality: "Lactate Threshold", score: 90, reason: "Threshold speed determines sustainable race pace" },
    { quality: "Running Economy", score: 85, reason: "Efficiency determines energy cost per kilometer" },
    { quality: "Fat Oxidation", score: 78, reason: "Metabolic efficiency fuels long-duration efforts" },
    { quality: "Muscular Endurance", score: 72, reason: "Structural endurance delays fatigue at distance" },
  ],
  power: [
    { quality: "Rate of Force Development", score: 95, reason: "RFD is the core expression of explosive power" },
    { quality: "Explosive Strength", score: 90, reason: "Maximal ballistic force drives power output" },
    { quality: "Lower Body Power", score: 88, reason: "Ground reaction force generates athletic power" },
    { quality: "Neural Drive", score: 85, reason: "High motor unit recruitment is essential for power" },
    { quality: "Reactive Strength", score: 80, reason: "Elastic energy return amplifies power output" },
    { quality: "Maximal Strength", score: 72, reason: "Strength base directly scales power potential" },
  ],
};

const SPORT_QUALITY_BONUSES: Record<string, Array<{ quality: string; bonus: number }>> = {
  football: [
    { quality: "Acceleration", bonus: 25 },
    { quality: "Horizontal Force Production", bonus: 20 },
    { quality: "Lower Body Power", bonus: 18 },
    { quality: "Maximal Strength", bonus: 15 },
    { quality: "Change of Direction Speed", bonus: 12 },
  ],
  soccer: [
    { quality: "Max Velocity", bonus: 20 },
    { quality: "Aerobic Capacity", bonus: 18 },
    { quality: "Repeated Sprint Ability", bonus: 15 },
    { quality: "Change of Direction Speed", bonus: 14 },
    { quality: "Acceleration", bonus: 12 },
  ],
  basketball: [
    { quality: "Vertical Power", bonus: 22 },
    { quality: "Reactive Strength", bonus: 18 },
    { quality: "Change of Direction Speed", bonus: 16 },
    { quality: "Aerobic Power", bonus: 14 },
    { quality: "Acceleration", bonus: 12 },
  ],
  rugby: [
    { quality: "Maximal Strength", bonus: 22 },
    { quality: "Lower Body Power", bonus: 18 },
    { quality: "Repeated Sprint Ability", bonus: 15 },
    { quality: "Acceleration", bonus: 14 },
    { quality: "Structural Strength", bonus: 12 },
  ],
  "track & field": [
    { quality: "Max Velocity", bonus: 25 },
    { quality: "Reactive Strength", bonus: 20 },
    { quality: "Rate of Force Development", bonus: 18 },
    { quality: "Acceleration", bonus: 16 },
  ],
  tennis: [
    { quality: "Change of Direction Speed", bonus: 20 },
    { quality: "Reactive Strength", bonus: 16 },
    { quality: "Shoulder Stability", bonus: 14 },
    { quality: "Aerobic Power", bonus: 12 },
  ],
  swimming: [
    { quality: "Aerobic Capacity", bonus: 22 },
    { quality: "Shoulder Mobility", bonus: 18 },
    { quality: "Shoulder Stability", bonus: 16 },
    { quality: "Lactate Threshold", bonus: 14 },
  ],
  baseball: [
    { quality: "Rotational Power", bonus: 22 },
    { quality: "Rate of Force Development", bonus: 18 },
    { quality: "Shoulder Stability", bonus: 16 },
    { quality: "Acceleration", bonus: 14 },
  ],
  volleyball: [
    { quality: "Vertical Power", bonus: 22 },
    { quality: "Reactive Strength", bonus: 18 },
    { quality: "Shoulder Stability", bonus: 14 },
  ],
  hockey: [
    { quality: "Acceleration", bonus: 18 },
    { quality: "Change of Direction Speed", bonus: 18 },
    { quality: "Repeated Sprint Ability", bonus: 15 },
    { quality: "Lower Body Power", bonus: 14 },
  ],
  powerlifting: [
    { quality: "Maximal Strength", bonus: 30 },
    { quality: "Neural Drive", bonus: 20 },
    { quality: "Structural Strength", bonus: 18 },
  ],
  "olympic weightlifting": [
    { quality: "Rate of Force Development", bonus: 25 },
    { quality: "Lower Body Power", bonus: 22 },
    { quality: "Explosive Strength", bonus: 20 },
    { quality: "Coordination", bonus: 16 },
  ],
  crossfit: [
    { quality: "Aerobic Capacity", bonus: 18 },
    { quality: "Muscular Endurance", bonus: 18 },
    { quality: "Structural Strength", bonus: 15 },
    { quality: "Movement Quality", bonus: 14 },
  ],
  running: [
    { quality: "Aerobic Capacity", bonus: 25 },
    { quality: "Lactate Threshold", bonus: 22 },
    { quality: "Running Economy", bonus: 20 },
  ],
};

const QUALITY_METHOD_MAP: Record<string, Array<{ method: string; confidence: number; rationale: string }>> = {
  "Maximal Strength": [
    { method: "Maximal Effort Method", confidence: 95, rationale: "Lifting >90% 1RM directly develops maximal strength via neural drive and structural adaptation" },
    { method: "Conjugate Method", confidence: 82, rationale: "Concurrent max and dynamic effort builds multiple strength qualities simultaneously" },
    { method: "Submaximal Effort Method", confidence: 78, rationale: "70–85% loading builds the hypertrophy base that supports maximal strength" },
  ],
  "Rate of Force Development": [
    { method: "Rate of Force Development Training", confidence: 95, rationale: "Maximal-intent isometric and ballistic training directly targets the 0–200ms force window" },
    { method: "Dynamic Effort Method", confidence: 90, rationale: "Submaximal loads at maximal speed develop explosive rate of force development" },
    { method: "Plyometric Training", confidence: 80, rationale: "Reactive jump training improves the speed of force expression through the SSC" },
  ],
  "Acceleration": [
    { method: "Resisted Sprint Training", confidence: 92, rationale: "External resistance overloads horizontal force application — the key driver of acceleration" },
    { method: "Acceleration Development", confidence: 90, rationale: "Technical mechanics training optimizes body position and force angles for short sprints" },
    { method: "Plyometric Training", confidence: 75, rationale: "Lower body explosive training supports the force demands of acceleration" },
  ],
  "Max Velocity": [
    { method: "Max Velocity Development", confidence: 92, rationale: "Training at 95%+ max speed overloads stride mechanics and neural drive at top speed" },
    { method: "Overspeed Training", confidence: 82, rationale: "Assisted sprinting at >100% max speed increases stride frequency ceiling" },
    { method: "Elastic Reactive Training", confidence: 72, rationale: "Ankle/tendon stiffness training improves force transfer at top-end stride mechanics" },
  ],
  "Lower Body Power": [
    { method: "Plyometric Training", confidence: 90, rationale: "Jump and bound training directly develops explosive lower body power through the SSC" },
    { method: "Contrast Training", confidence: 85, rationale: "PAP from heavy strength loads potentiates explosive output in the subsequent power exercise" },
    { method: "French Contrast Method", confidence: 78, rationale: "Four-exercise complex covers the full force-velocity curve for comprehensive power development" },
  ],
  "Reactive Strength": [
    { method: "Elastic Reactive Training", confidence: 92, rationale: "High-speed, short-contact plyometrics specifically develop tendon stiffness and elastic power" },
    { method: "Plyometric Training", confidence: 85, rationale: "SSC-based jump training develops the reactive strength index" },
  ],
  "Aerobic Capacity": [
    { method: "Aerobic Base Building", confidence: 90, rationale: "Long slow distance work builds cardiac output and mitochondrial density — the aerobic foundation" },
    { method: "High-Intensity Interval Training", confidence: 82, rationale: "HIIT drives VO2 Max adaptations more rapidly than low-intensity training alone" },
    { method: "Lactate Threshold Training", confidence: 75, rationale: "Threshold work pushes the lactate threshold higher, increasing sustainable intensity" },
  ],
  "Lactate Threshold": [
    { method: "Lactate Threshold Training", confidence: 92, rationale: "Training at or slightly above threshold directly elevates it over time" },
    { method: "Tempo Running", confidence: 82, rationale: "Sustained moderate intensity develops the aerobic machinery that clears lactate" },
  ],
  "Repeated Sprint Ability": [
    { method: "Repeated Sprint Ability", confidence: 92, rationale: "Structured repeated sprint protocols with brief recovery directly trains this quality" },
    { method: "High-Intensity Interval Training", confidence: 80, rationale: "HIIT improves the aerobic recovery between sprint efforts" },
    { method: "Energy System Development", confidence: 78, rationale: "Comprehensive ESD ensures all three energy systems are developed optimally" },
  ],
  "Hypertrophy": [
    { method: "Submaximal Effort Method", confidence: 90, rationale: "Moderate loads and high volume maximize the metabolic stress driving hypertrophy" },
    { method: "Eccentric Overload Training", confidence: 82, rationale: "Greater eccentric loading produces more muscle damage and subsequent hypertrophic response" },
  ],
  "Change of Direction Speed": [
    { method: "Plyometric Training", confidence: 85, rationale: "Reactive plyometrics develop the braking force and re-acceleration needed for COD" },
    { method: "Eccentric Overload Training", confidence: 80, rationale: "Eccentric strength enables rapid deceleration — the primary limiter of COD speed" },
    { method: "Acceleration Development", confidence: 72, rationale: "Re-acceleration after direction change follows the same mechanics as straight-line acceleration" },
  ],
  "Explosive Strength": [
    { method: "Rate of Force Development Training", confidence: 92, rationale: "Maximal explosive intent training directly targets rapid force production" },
    { method: "Olympic Weightlifting", confidence: 85, rationale: "The snatch and clean demand explosive force production across the full kinetic chain" },
    { method: "Contrast Training", confidence: 78, rationale: "PAP potentiation protocol maximizes explosive output after heavy strength loading" },
  ],
  "Trunk Stability": [
    { method: "Isometric Training", confidence: 85, rationale: "Anti-movement isometric exercises build trunk stiffness without spinal loading" },
    { method: "Loaded Carry Training", confidence: 82, rationale: "Carrying heavy loads develops functional trunk stability under real movement demands" },
  ],
  "Horizontal Force Production": [
    { method: "Resisted Sprint Training", confidence: 95, rationale: "Sled and band resistance directly trains horizontal force application in sprint mechanics" },
    { method: "Acceleration Development", confidence: 88, rationale: "Acceleration mechanics training optimizes horizontal force angle during early sprint phase" },
  ],
  "Neural Drive": [
    { method: "Maximal Effort Method", confidence: 92, rationale: "Near-maximal loading is the primary stimulus for increased motor unit recruitment" },
    { method: "Dynamic Effort Method", confidence: 82, rationale: "Maximal intent at submaximal loads enhances rate coding and neural efficiency" },
  ],
  "Movement Quality": [
    { method: "Mobility Training", confidence: 88, rationale: "Mobility work addresses the range-of-motion and tissue quality limiting movement patterns" },
    { method: "Isometric Training", confidence: 72, rationale: "Joint-angle-specific strengthening reinforces stable movement patterns" },
  ],
};

const QUALITY_EXERCISE_MAP: Record<string, { tier1: string[]; tier2: string[]; progressions: string[]; regressions: string[] }> = {
  "Maximal Strength": {
    tier1: ["Trap Bar Deadlift", "Back Squat", "Bench Press", "Barbell Row"],
    tier2: ["Romanian Deadlift", "Front Squat", "Dumbbell Bench Press", "Incline Press"],
    progressions: ["Paused Squat", "Competition-Style Deadlift", "Floor Press with Chains"],
    regressions: ["Goblet Squat", "Dumbbell Deadlift", "Push-Up", "Inverted Row"],
  },
  "Rate of Force Development": {
    tier1: ["Trap Bar Jump", "Isometric Mid-Thigh Pull", "Ballistic Push-Up"],
    tier2: ["Box Squat Jump", "Medicine Ball Slam", "Kneeling Cable Pull"],
    progressions: ["Isometric Pull with Force Plate", "Loaded CMJ", "Single-Leg Trap Bar Jump"],
    regressions: ["Jump Squat (bodyweight)", "Clap Push-Up", "Vertical Jump"],
  },
  "Acceleration": {
    tier1: ["Resisted Sprint 10m", "Wall Drive", "A-March"],
    tier2: ["Standing Broad Jump", "Prowler Push 20m", "Band Resisted Sprint"],
    progressions: ["Sled Sprint 20m", "Flying Start Sprint", "Heavy Resisted Sprint 30m"],
    regressions: ["Standing Broad Jump", "Bounding", "A-Skip"],
  },
  "Max Velocity": {
    tier1: ["Flying 10m Sprint", "Wicket Run", "Assisted Sprint"],
    tier2: ["Strides 80m", "High Knee A-Skip", "Bounding"],
    progressions: ["Flying 20m Sprint", "Overspeed Bungee Sprint"],
    regressions: ["Strides 60m", "A-Skip", "High Knee March"],
  },
  "Lower Body Power": {
    tier1: ["Countermovement Jump", "Depth Jump", "Box Jump"],
    tier2: ["Broad Jump", "Triple Hop", "Loaded CMJ"],
    progressions: ["Depth Drop to Box Jump", "Reactive CMJ Series", "French Contrast Complex"],
    regressions: ["Squat Jump (bodyweight)", "Standing Broad Jump", "Vertical Jump"],
  },
  "Reactive Strength": {
    tier1: ["Pogo Jump", "Depth Jump", "Repeated Bounds"],
    tier2: ["Hurdle Hops", "Ankle Hops", "Single-Leg Pogo"],
    progressions: ["Depth Drop 50cm", "Single-Leg Bounds for Distance", "Continuous Hurdle Jump"],
    regressions: ["Bilateral Ankle Hop", "Low Hurdle Hop", "Pogo Jump in Place"],
  },
  "Aerobic Capacity": {
    tier1: ["Long Slow Distance Run", "Rowing Machine Zone 2", "Nasal Breathing Bike"],
    tier2: ["Tempo Run 5–8km", "SkiErg Steady State", "Cross-Training Walk"],
    progressions: ["Long Interval Run 4×4min", "Progressive Tempo Run", "Zone 3 Threshold Run"],
    regressions: ["Walk-Run Intervals", "Easy Cycling 30min", "Short Tempo 2–3km"],
  },
  "Hypertrophy": {
    tier1: ["Romanian Deadlift", "Bulgarian Split Squat", "Dumbbell Press"],
    tier2: ["Leg Press", "Cable Row", "Lateral Raise"],
    progressions: ["Paused RDL", "Tempo Split Squat", "Eccentric Dumbbell Press"],
    regressions: ["Leg Curl", "Chest-Supported Row", "Machine Press"],
  },
  "Change of Direction Speed": {
    tier1: ["Lateral Bound with Stick", "Deceleration Run 15m", "505 COD Drill"],
    tier2: ["T-Drill", "Pro Agility Shuttle", "Lateral Shuffle Sprint"],
    progressions: ["Reactive COD (visual cue)", "Resisted COD Drill", "Triple Broad Jump + COD"],
    regressions: ["Lateral Step and Stick", "Short Shuffle 5m", "Cone Figure-8 Walk"],
  },
  "Explosive Strength": {
    tier1: ["Power Clean", "Hang Clean", "Squat Jump"],
    tier2: ["Clean Pull", "Hang Snatch", "Jump Shrug"],
    progressions: ["Full Snatch", "Full Clean and Jerk", "Loaded Drop Jump"],
    regressions: ["Dumbbell Hang Clean", "Medicine Ball Scoop Throw", "Trap Bar Jump"],
  },
  "Trunk Stability": {
    tier1: ["Plank", "Pallof Press", "Dead Bug"],
    tier2: ["Suitcase Carry", "Copenhagen Plank", "Ab Wheel Rollout"],
    progressions: ["Single-Arm Plank", "Pallof Press Walk-Out", "Stir the Pot"],
    regressions: ["Kneeling Plank", "Half-Kneeling Pallof Press", "Bird Dog"],
  },
  "Neural Drive": {
    tier1: ["Heavy Deadlift", "Back Squat", "Trap Bar Deadlift"],
    tier2: ["Rack Pull", "Pause Squat", "Isometric Push-Up"],
    progressions: ["Accommodating Resistance Squat", "Max Effort Deadlift", "Cluster Sets"],
    regressions: ["Submaximal Deadlift", "Goblet Squat", "Controlled Push-Up"],
  },
};

const LIMITING_FACTOR_MAP: Record<string, Array<{ factor: string; detail: string; severity: "critical" | "moderate" | "minor" }>> = {
  "Acceleration": [
    { factor: "Horizontal Force Production Deficit", detail: "Insufficient horizontal force application prevents rapid acceleration from rest", severity: "critical" },
    { factor: "Starting Strength Deficit", detail: "Low concentric starting strength limits initial propulsion at zero velocity", severity: "moderate" },
    { factor: "Body Position Error", detail: "Suboptimal trunk lean angle reduces horizontal force application efficiency", severity: "minor" },
  ],
  "Max Velocity": [
    { factor: "Stride Frequency Limitation", detail: "Below-ceiling stride rate caps achievable top speed", severity: "critical" },
    { factor: "Stride Length Inefficiency", detail: "Poor hip extension mechanics and ground contact position limit effective stride length", severity: "moderate" },
    { factor: "Neural Drive Ceiling", detail: "Submaximal motor unit recruitment at high velocities limits speed expression", severity: "moderate" },
  ],
  "Lower Body Power": [
    { factor: "Power Deficit", detail: "Gap between strength base and the rate at which force can be expressed explosively", severity: "critical" },
    { factor: "RFD Limitation", detail: "Slow rate of force development prevents full power expression in short time windows", severity: "moderate" },
  ],
  "Reactive Strength": [
    { factor: "Tendon Stiffness Deficit", detail: "Low tendon stiffness reduces elastic energy storage and return efficiency", severity: "critical" },
    { factor: "Ankle Stiffness Limitation", detail: "Excessive ankle compliance dissipates ground reaction force during reactive contacts", severity: "moderate" },
  ],
  "Maximal Strength": [
    { factor: "Neural Drive Deficit", detail: "Motor unit recruitment and rate coding are the primary limiters of maximal strength expression", severity: "critical" },
    { factor: "Structural Strength Deficit", detail: "Insufficient musculotendinous capacity limits loading and force production", severity: "moderate" },
  ],
  "Aerobic Capacity": [
    { factor: "Cardiac Output Limitation", detail: "Below-ceiling stroke volume and cardiac output cap oxygen delivery to working muscles", severity: "critical" },
    { factor: "Mitochondrial Density Deficit", detail: "Low mitochondrial concentration limits oxidative phosphorylation and aerobic power", severity: "moderate" },
  ],
  "Lactate Threshold": [
    { factor: "Lactate Clearance Deficit", detail: "Insufficient lactate clearance capacity forces intensity reduction at suboptimal effort levels", severity: "critical" },
  ],
  "Hypertrophy": [
    { factor: "Mechanical Tension Deficit", detail: "Insufficient loading stimulus reduces the primary driver of myofibrillar growth", severity: "moderate" },
    { factor: "Metabolic Stress Deficit", detail: "Low training volume or density reduces the metabolic stimulus for sarcoplasmic growth", severity: "minor" },
  ],
  "Change of Direction Speed": [
    { factor: "Braking Force Limitation", detail: "Insufficient eccentric strength to rapidly decelerate body mass before direction change", severity: "critical" },
    { factor: "Re-Acceleration Deficit", detail: "Slow transition from braking to propulsion extends change of direction time", severity: "moderate" },
  ],
  "Repeated Sprint Ability": [
    { factor: "Aerobic Recovery Deficit", detail: "Insufficient aerobic capacity to restore phosphocreatine between sprint efforts", severity: "critical" },
    { factor: "Lactate Tolerance Limitation", detail: "Premature acidosis limits repeated sprint quality across a session", severity: "moderate" },
  ],
};

const ADAPTATION_FORECAST_MAP: Record<string, { primary: string[]; secondary: string[]; timeline: string }> = {
  strength: {
    primary: ["Increased 1RM across primary lifts", "Greater neural drive and motor unit recruitment", "Improved structural strength and tissue capacity"],
    secondary: ["Enhanced rate of force development", "Better injury resistance through tendon and ligament adaptation", "Improved sport-specific force production"],
    timeline: "4–8 weeks for neural adaptations, 8–16 weeks for significant structural strength gains",
  },
  athletic_performance: {
    primary: ["Faster 10-yard sprint time", "Higher countermovement jump height", "Improved change of direction speed"],
    secondary: ["Better horizontal force production", "Enhanced reactive strength index", "Greater max velocity potential"],
    timeline: "2–4 weeks for neuromuscular efficiency, 6–12 weeks for measurable speed improvements",
  },
  hypertrophy: {
    primary: ["Increased lean muscle mass", "Improved body composition", "Greater metabolic rate"],
    secondary: ["Enhanced strength base", "Improved structural capacity for loading", "Better insulin sensitivity"],
    timeline: "4–6 weeks for initial neuromuscular changes, 8–16 weeks for visible hypertrophy",
  },
  fat_loss: {
    primary: ["Reduced body fat percentage", "Improved aerobic conditioning", "Enhanced metabolic efficiency"],
    secondary: ["Preserved lean muscle mass", "Improved insulin sensitivity", "Greater work capacity at all intensities"],
    timeline: "2–4 weeks for aerobic adaptations, 8–16 weeks for significant body composition change",
  },
  general_fitness: {
    primary: ["Improved cardiovascular fitness", "Greater functional strength", "Enhanced movement quality"],
    secondary: ["Better recovery between sessions", "Improved body composition", "Increased daily energy levels"],
    timeline: "2–4 weeks for initial adaptations, 8–12 weeks for measurable fitness improvements",
  },
  endurance: {
    primary: ["Higher VO2 Max", "Elevated lactate threshold speed/power", "Improved running economy"],
    secondary: ["Enhanced fat oxidation at submaximal intensities", "Greater cardiac output", "Better muscular endurance"],
    timeline: "4–8 weeks for threshold adaptations, 12–20 weeks for significant VO2 Max changes",
  },
  power: {
    primary: ["Higher peak power output", "Faster rate of force development", "Greater explosive jump performance"],
    secondary: ["Improved sprint performance", "Enhanced neuromuscular efficiency", "Better stretch-shortening cycle utilization"],
    timeline: "2–4 weeks for neural RFD adaptations, 6–10 weeks for power output improvements",
  },
};

const EQUIPMENT_METHOD_CONSTRAINTS: Record<string, string[]> = {
  full_gym: ["Maximal Effort Method", "Dynamic Effort Method", "Conjugate Method", "Eccentric Overload Training", "Olympic Weightlifting", "Resisted Sprint Training", "Rate of Force Development Training", "Plyometric Training", "Elastic Reactive Training", "Contrast Training"],
  home_gym: ["Submaximal Effort Method", "Isometric Training", "Plyometric Training", "Elastic Reactive Training", "Loaded Carry Training"],
  minimal: ["Isometric Training", "Plyometric Training", "Elastic Reactive Training", "Aerobic Base Building", "Mobility Training"],
  bodyweight: ["Plyometric Training", "Elastic Reactive Training", "Isometric Training", "Aerobic Base Building", "Mobility Training"],
};

// ─── Sub-Engines ──────────────────────────────────────────────────────────────

export function prioritizePerformanceQualities(input: PerformanceProfileInput): PrioritizedQuality[] {
  const normalizedGoal = normalizeGoalKey(input.goal);
  const baseQualities = GOAL_QUALITY_MAP[normalizedGoal] ?? GOAL_QUALITY_MAP["general_fitness"];

  // Build a score map
  const scoreMap = new Map<string, { score: number; reason: string }>();
  for (const q of baseQualities) {
    scoreMap.set(q.quality, { score: q.score, reason: q.reason });
  }

  // Apply sport bonuses
  if (input.sport) {
    const sportKey = input.sport.toLowerCase();
    // Find matching sport (partial match)
    const matchedSport = Object.keys(SPORT_QUALITY_BONUSES).find(
      (k) => sportKey.includes(k) || k.includes(sportKey)
    );
    if (matchedSport) {
      for (const bonus of SPORT_QUALITY_BONUSES[matchedSport]) {
        const existing = scoreMap.get(bonus.quality);
        if (existing) {
          scoreMap.set(bonus.quality, { ...existing, score: Math.min(100, existing.score + bonus.bonus) });
        } else {
          scoreMap.set(bonus.quality, {
            score: Math.min(100, bonus.bonus + 55),
            reason: `Required for ${input.sport} performance`,
          });
        }
      }
    }
  }

  // Apply focus mode bonuses
  if (input.focusMode === "speed") {
    ["Acceleration", "Max Velocity", "Horizontal Force Production", "Reactive Strength"].forEach((q) => {
      const e = scoreMap.get(q);
      if (e) scoreMap.set(q, { ...e, score: Math.min(100, e.score + 10) });
      else scoreMap.set(q, { score: 70, reason: "Speed focus mode priority" });
    });
  } else if (input.focusMode === "mobility") {
    ["Movement Quality", "Ankle Mobility", "Hip Mobility", "Flexibility"].forEach((q) => {
      const e = scoreMap.get(q);
      if (e) scoreMap.set(q, { ...e, score: Math.min(100, e.score + 10) });
      else scoreMap.set(q, { score: 70, reason: "Mobility focus mode priority" });
    });
  }

  // Apply assessment result adjustments
  if (input.assessmentResults?.length) {
    for (const result of input.assessmentResults) {
      if (result.tier === "below" || result.tier === "average") {
        // Boost qualities related to this assessment
        const assessmentName = result.assessmentName.toLowerCase();
        if (assessmentName.includes("sprint") || assessmentName.includes("yard")) {
          boostQuality(scoreMap, "Acceleration", 15, "Assessment deficit identified");
          boostQuality(scoreMap, "Horizontal Force Production", 12, "Assessment deficit identified");
        }
        if (assessmentName.includes("jump") || assessmentName.includes("cmj")) {
          boostQuality(scoreMap, "Lower Body Power", 15, "Assessment deficit identified");
          boostQuality(scoreMap, "Reactive Strength", 12, "Assessment deficit identified");
        }
        if (assessmentName.includes("squat") || assessmentName.includes("deadlift")) {
          boostQuality(scoreMap, "Maximal Strength", 15, "Assessment deficit identified");
        }
        if (assessmentName.includes("rsi") || assessmentName.includes("reactive")) {
          boostQuality(scoreMap, "Reactive Strength", 18, "Assessment deficit identified");
        }
        if (assessmentName.includes("vo2") || assessmentName.includes("beep") || assessmentName.includes("yoyo")) {
          boostQuality(scoreMap, "Aerobic Capacity", 15, "Assessment deficit identified");
        }
        if (assessmentName.includes("ankle") || assessmentName.includes("hip") || assessmentName.includes("shoulder")) {
          boostQuality(scoreMap, "Movement Quality", 14, "Mobility assessment deficit identified");
        }
        if (assessmentName.includes("rfd") || assessmentName.includes("force development")) {
          boostQuality(scoreMap, "Rate of Force Development", 18, "Assessment deficit identified");
        }
      }
    }
  }

  // Sort and rank
  return [...scoreMap.entries()]
    .map(([quality, { score, reason }]) => ({ quality, score, reason, priority: 0 }))
    .sort((a, b) => b.score - a.score)
    .slice(0, 6)
    .map((q, i) => ({ ...q, priority: i + 1 }));
}

function boostQuality(map: Map<string, { score: number; reason: string }>, quality: string, boost: number, reason: string) {
  const e = map.get(quality);
  if (e) map.set(quality, { ...e, score: Math.min(100, e.score + boost) });
  else map.set(quality, { score: Math.min(100, 55 + boost), reason });
}

export function identifyLimitingFactors(
  priorityQualities: PrioritizedQuality[],
  assessmentResults: AssessmentResult[] = []
): LimitingFactor[] {
  const factors: LimitingFactor[] = [];

  // Derive from assessment deficits first
  for (const result of assessmentResults) {
    if (result.tier !== "below" && result.tier !== "average") continue;
    const name = result.assessmentName;

    const specificFactors = deriveFactorsFromAssessment(name, result.tier);
    for (const f of specificFactors) {
      factors.push({ ...f, sourceAssessment: name });
    }
  }

  // Derive from priority qualities (for qualities without assessment data)
  for (const q of priorityQualities.slice(0, 3)) {
    const qualityFactors = LIMITING_FACTOR_MAP[q.quality] ?? [];
    for (const f of qualityFactors.slice(0, 2)) {
      const alreadyExists = factors.some((existing) => existing.factor === f.factor);
      if (!alreadyExists) {
        factors.push(f);
      }
    }
  }

  return factors
    .sort((a, b) => {
      const severityOrder = { critical: 0, moderate: 1, minor: 2 };
      return severityOrder[a.severity] - severityOrder[b.severity];
    })
    .slice(0, 5);
}

function deriveFactorsFromAssessment(name: string, tier: string): LimitingFactor[] {
  const n = name.toLowerCase();
  if (n.includes("10 yard") || n.includes("20 yard") || n.includes("40-yard") || n.includes("40 yard")) {
    return [
      { factor: "Horizontal Force Production Deficit", detail: `${name} testing revealed deficits in acceleration force application`, severity: "critical" },
      { factor: "Starting Strength Deficit", detail: "Slow sprint start indicates underdeveloped starting strength from zero velocity", severity: "moderate" },
    ];
  }
  if (n.includes("flying") || n.includes("max velocity")) {
    return [
      { factor: "Max Velocity Ceiling", detail: `${name} testing identified a below-target top speed`, severity: "critical" },
      { factor: "Stride Frequency Limitation", detail: "Stride rate at maximum speed is below neuromuscular potential", severity: "moderate" },
    ];
  }
  if (n.includes("cmj") || n.includes("countermovement jump")) {
    return [
      { factor: "Lower Body Power Deficit", detail: `${name} testing identified below-target explosive power output`, severity: "critical" },
      { factor: "RFD Limitation", detail: "Slow rate of force development reduces jump height ceiling", severity: "moderate" },
    ];
  }
  if (n.includes("squat jump")) {
    return [
      { factor: "Starting Strength Deficit", detail: `${name} testing identified low concentric starting strength`, severity: "critical" },
    ];
  }
  if (n.includes("rsi") || n.includes("reactive strength")) {
    return [
      { factor: "Tendon Stiffness Deficit", detail: `${name} score indicates insufficient elastic energy storage in the Achilles-plantar complex`, severity: "critical" },
      { factor: "Ankle Stiffness Limitation", detail: "Excessive ground contact time suggests suboptimal ankle stiffness", severity: "moderate" },
    ];
  }
  if (n.includes("broad jump") || n.includes("triple hop")) {
    return [
      { factor: "Horizontal Power Deficit", detail: `${name} testing revealed gaps in horizontal force production and elastic power`, severity: "critical" },
    ];
  }
  if (n.includes("trap bar") || n.includes("isometric mid-thigh") || n.includes("deadlift") || n.includes("squat")) {
    return [
      { factor: "Maximal Strength Deficit", detail: `${name} testing identified below-target maximal force production`, severity: "critical" },
      { factor: "Neural Drive Deficit", detail: "Below-normative strength levels indicate neural efficiency limitations", severity: "moderate" },
    ];
  }
  if (n.includes("vo2") || n.includes("beep") || n.includes("yo-yo")) {
    return [
      { factor: "Cardiac Output Limitation", detail: `${name} testing revealed below-target aerobic capacity`, severity: "critical" },
      { factor: "Mitochondrial Density Deficit", detail: "Low aerobic capacity indicates insufficient oxidative infrastructure", severity: "moderate" },
    ];
  }
  if (n.includes("ankle") || n.includes("hip") || n.includes("shoulder") || n.includes("mobility")) {
    return [
      { factor: "Range of Motion Limitation", detail: `${name} testing identified mobility restrictions that limit movement quality and injury risk`, severity: "moderate" },
      { factor: "Force Transfer Limitation", detail: "Mobility restrictions reduce the athlete's ability to express force through full range", severity: "moderate" },
    ];
  }
  if (n.includes("505") || n.includes("t-test") || n.includes("agility")) {
    return [
      { factor: "Braking Force Limitation", detail: `${name} testing identified deficits in eccentric deceleration force`, severity: "critical" },
      { factor: "Re-Acceleration Deficit", detail: "Slow transition from braking to drive phase extends total COD time", severity: "moderate" },
    ];
  }
  if (n.includes("rfd") || n.includes("rate of force")) {
    return [
      { factor: "Rate of Force Development Deficit", detail: `${name} testing identified slow force production in the critical 0–200ms window`, severity: "critical" },
      { factor: "Explosive Strength Gap", detail: "Below-normative RFD limits sport movements that require rapid force expression", severity: "moderate" },
    ];
  }
  return [];
}

export function selectTrainingMethods(
  qualities: PrioritizedQuality[],
  limitingFactors: LimitingFactor[],
  input: PerformanceProfileInput
): RankedMethod[] {
  const methodScores = new Map<string, { score: number; rationale: string; targetQuality: string }>();

  // Score methods based on priority qualities
  for (const q of qualities.slice(0, 5)) {
    const methods = QUALITY_METHOD_MAP[q.quality] ?? [];
    for (const m of methods) {
      const existing = methodScores.get(m.method);
      const scaledConfidence = Math.round(m.confidence * (q.score / 100));
      if (existing) {
        if (scaledConfidence > existing.score) {
          methodScores.set(m.method, { score: scaledConfidence, rationale: m.rationale, targetQuality: q.quality });
        }
      } else {
        methodScores.set(m.method, { score: scaledConfidence, rationale: m.rationale, targetQuality: q.quality });
      }
    }
  }

  // Boost methods that address critical limiting factors
  for (const factor of limitingFactors) {
    if (factor.severity === "critical") {
      if (factor.factor.includes("Horizontal Force") || factor.factor.includes("Acceleration")) {
        const entry = methodScores.get("Resisted Sprint Training");
        if (entry) methodScores.set("Resisted Sprint Training", { ...entry, score: Math.min(99, entry.score + 8) });
      }
      if (factor.factor.includes("Tendon") || factor.factor.includes("Ankle Stiffness")) {
        const entry = methodScores.get("Elastic Reactive Training");
        if (entry) methodScores.set("Elastic Reactive Training", { ...entry, score: Math.min(99, entry.score + 8) });
      }
      if (factor.factor.includes("Maximal Strength") || factor.factor.includes("Neural Drive")) {
        const entry = methodScores.get("Maximal Effort Method");
        if (entry) methodScores.set("Maximal Effort Method", { ...entry, score: Math.min(99, entry.score + 8) });
      }
    }
  }

  // Filter by available equipment
  const equipmentKey = resolveEquipmentKey(input.availableEquipment ?? "");
  const allowedMethods = EQUIPMENT_METHOD_CONSTRAINTS[equipmentKey] ?? EQUIPMENT_METHOD_CONSTRAINTS["full_gym"];

  const filtered = [...methodScores.entries()]
    .filter(([method]) => {
      if (equipmentKey === "full_gym") return true;
      return allowedMethods.some((m) => m.toLowerCase().includes(method.toLowerCase().slice(0, 8)));
    });

  return filtered
    .map(([method, { score, rationale, targetQuality }]) => ({
      method,
      confidence: score,
      targetQuality,
      rationale,
    }))
    .sort((a, b) => b.confidence - a.confidence)
    .slice(0, 6);
}

export function buildExercisePool(
  methods: RankedMethod[],
  qualities: PrioritizedQuality[],
  _constraints: string[] = []
): ExercisePool {
  const tier1 = new Set<string>();
  const tier2 = new Set<string>();
  const progressions = new Set<string>();
  const regressions = new Set<string>();

  for (const q of qualities.slice(0, 3)) {
    const pool = QUALITY_EXERCISE_MAP[q.quality];
    if (pool) {
      pool.tier1.forEach((e) => tier1.add(e));
      pool.tier2.forEach((e) => tier2.add(e));
      pool.progressions.forEach((e) => progressions.add(e));
      pool.regressions.forEach((e) => regressions.add(e));
    }
  }

  // Also draw from method-quality associations
  for (const m of methods.slice(0, 3)) {
    const pool = QUALITY_EXERCISE_MAP[m.targetQuality];
    if (pool) {
      pool.tier1.forEach((e) => tier1.add(e));
      pool.tier2.forEach((e) => tier2.add(e));
    }
  }

  const substitutions = [...regressions].slice(0, 5);

  return {
    tier1: [...tier1].slice(0, 8),
    tier2: [...tier2].slice(0, 8),
    substitutions,
    progressions: [...progressions].slice(0, 5),
    regressions: [...regressions].slice(0, 5),
  };
}

export function forecastAdaptations(
  goal: string,
  qualities: PrioritizedQuality[],
  methods: RankedMethod[]
): AdaptationForecast {
  const normalizedGoal = normalizeGoalKey(goal);
  const base = ADAPTATION_FORECAST_MAP[normalizedGoal] ?? ADAPTATION_FORECAST_MAP["general_fitness"];

  // Augment with quality-specific adaptations
  const qualityAdaptations: string[] = [];
  for (const q of qualities.slice(0, 2)) {
    const qualityAdaptation = QUALITY_ADAPTATION_LABELS[q.quality];
    if (qualityAdaptation && !base.primary.includes(qualityAdaptation)) {
      qualityAdaptations.push(qualityAdaptation);
    }
  }

  return {
    primary: [...base.primary, ...qualityAdaptations].slice(0, 4),
    secondary: base.secondary.slice(0, 4),
    timeline: base.timeline,
  };
}

const QUALITY_ADAPTATION_LABELS: Record<string, string> = {
  "Acceleration": "Faster 10-yard sprint and first-step explosiveness",
  "Max Velocity": "Increased peak sprint velocity",
  "Lower Body Power": "Higher jump height and greater explosive power",
  "Reactive Strength": "Improved reactive strength index and ground contact efficiency",
  "Maximal Strength": "Greater 1RM across primary movements",
  "Rate of Force Development": "Faster force production in the critical 0–200ms window",
  "Aerobic Capacity": "Elevated VO2 Max and sustained aerobic power",
  "Lactate Threshold": "Higher sustainable effort intensity across longer durations",
  "Hypertrophy": "Measurable increases in lean muscle mass",
  "Change of Direction Speed": "Faster change of direction time with better mechanics",
  "Repeated Sprint Ability": "Maintained sprint quality across multiple sprint bouts",
  "Trunk Stability": "Improved force transfer and spinal stability under load",
  "Movement Quality": "Cleaner fundamental movement patterns and reduced injury risk",
};

export function generateExerciseReason(
  exercise: string,
  profile: PerformanceProfile
): ExerciseReason | null {
  // Find the most relevant quality for this exercise
  for (const [quality, pool] of Object.entries(QUALITY_EXERCISE_MAP)) {
    const allExercises = [...pool.tier1, ...pool.tier2, ...pool.progressions, ...pool.regressions];
    if (allExercises.some((e) => e.toLowerCase().includes(exercise.toLowerCase()) || exercise.toLowerCase().includes(e.toLowerCase()))) {
      // Find the method for this quality
      const methods = QUALITY_METHOD_MAP[quality];
      const topMethod = methods?.[0]?.method ?? "Targeted Training";

      // Find if this quality is in priority list
      const qualityEntry = profile.priorityQualities.find((q) => q.quality === quality);
      const limitingFactor = profile.limitingFactors.find((f) =>
        f.factor.toLowerCase().includes(quality.toLowerCase().split(" ")[0])
      );

      const adaptation = QUALITY_ADAPTATION_LABELS[quality] ?? `Improved ${quality.toLowerCase()}`;

      return {
        exercise,
        targetQuality: quality,
        method: topMethod,
        limitingFactor: limitingFactor?.factor,
        expectedAdaptation: adaptation,
        confidence: qualityEntry ? Math.round(qualityEntry.score * 0.9) : 72,
      };
    }
  }
  return null;
}

// ─── Main Orchestrator ────────────────────────────────────────────────────────

export function buildPerformanceProfile(input: PerformanceProfileInput): PerformanceProfile {
  const priorityQualities = prioritizePerformanceQualities(input);
  const limitingFactors = identifyLimitingFactors(priorityQualities, input.assessmentResults ?? []);
  const recommendedMethods = selectTrainingMethods(priorityQualities, limitingFactors, input);
  const recommendedExercisePool = buildExercisePool(recommendedMethods, priorityQualities, input.constraints ?? []);
  const expectedAdaptations = forecastAdaptations(input.goal, priorityQualities, recommendedMethods);

  const equipmentOpportunities = deriveEquipmentOpportunities(priorityQualities, recommendedMethods);
  const riskFactors = deriveRiskFactors(input, limitingFactors);

  // ─── Phase 7: Apply Research Intelligence Layer ────────────────────────────
  // Upgrade single-number method confidence to multi-dimensional research scores.
  const researchIntelligence = applyResearchIntelligence({
    goal: input.goal,
    sport: input.sport,
    age: input.age,
    trainingAge: input.trainingAge,
    methods: recommendedMethods,
    priorityQualities: priorityQualities.map((q) => ({ quality: q.quality, score: q.score })),
    tier1Exercises: recommendedExercisePool.tier1,
  });

  // Merge research-enhanced confidence back into methods
  const researchEnhancedMethods: RankedMethod[] = recommendedMethods.map((m) => {
    const enhanced = researchIntelligence.methods.find((rm) => rm.method === m.method);
    if (!enhanced) return m;
    return {
      ...m,
      confidence: enhanced.confidence,
      researchConfidence: enhanced.researchConfidence,
      evidenceSummary: enhanced.evidenceSummary,
      hasContradictions: enhanced.hasContradictions,
    };
  });

  // Generate overall confidence score — now research-weighted
  const confidence = Math.round(
    (priorityQualities.slice(0, 3).reduce((sum, q) => sum + q.score, 0) / 3) * 0.70 +
    researchIntelligence.systemConfidence * 0.30
  );

  const profile: PerformanceProfile = {
    goal: input.goal,
    sport: input.sport ?? null,
    focusMode: input.focusMode ?? null,
    priorityQualities,
    limitingFactors,
    recommendedMethods: researchEnhancedMethods,
    equipmentOpportunities,
    recommendedExercisePool,
    riskFactors,
    expectedAdaptations,
    exerciseRationale: [],
    confidence: Math.min(99, confidence),
    version: 2, // v2: research-intelligence integrated
    researchIntelligence,
  };

  // Generate rationale for tier-1 exercises
  profile.exerciseRationale = recommendedExercisePool.tier1
    .map((e) => generateExerciseReason(e, profile))
    .filter(Boolean) as ExerciseReason[];

  return profile;
}

function deriveEquipmentOpportunities(qualities: PrioritizedQuality[], methods: RankedMethod[]): string[] {
  const opportunities: string[] = [];
  const topMethod = methods[0]?.method ?? "";

  if (topMethod.includes("Sprint")) opportunities.push("Sprint Sled", "Freelap Timing System");
  if (topMethod.includes("Plyometric") || topMethod.includes("Elastic")) opportunities.push("Force Plate", "Plyometric Hurdles");
  if (topMethod.includes("Maximal Effort") || topMethod.includes("Conjugate")) opportunities.push("Power Rack", "Calibrated Plates");
  if (topMethod.includes("Aerobic") || topMethod.includes("HIIT")) opportunities.push("Assault Air Bike", "Rowing Machine");
  if (topMethod.includes("Velocity")) opportunities.push("Linear Position Transducer");

  // Add based on qualities
  for (const q of qualities.slice(0, 2)) {
    if (q.quality.includes("Power") || q.quality.includes("Reactive")) {
      if (!opportunities.includes("Force Plate")) opportunities.push("Jump Mat");
    }
  }

  return [...new Set(opportunities)].slice(0, 4);
}

function deriveRiskFactors(input: PerformanceProfileInput, factors: LimitingFactor[]): string[] {
  const risks: string[] = [];

  if (input.constraints?.length) {
    risks.push(...input.constraints.map((c) => `Pain/injury constraint: ${c}`));
  }

  const criticalFactors = factors.filter((f) => f.severity === "critical");
  if (criticalFactors.length > 2) {
    risks.push("Multiple critical limiting factors — conservative loading recommended initially");
  }

  const trainingAge = input.trainingAge?.toLowerCase() ?? "";
  if (trainingAge === "beginner") {
    risks.push("Beginner training age — prioritize technique and pattern quality before intensity");
  }

  if ((input.sessionFrequency ?? 0) > 5) {
    risks.push("High session frequency — recovery monitoring is critical");
  }

  return risks.slice(0, 3);
}

// ─── System Prompt Section Builder ───────────────────────────────────────────

export function buildPerformanceProfilePromptSection(profile: PerformanceProfile): string {
  const qualitiesList = profile.priorityQualities
    .slice(0, 4)
    .map((q, i) => `  ${i + 1}. ${q.quality} (Priority Score: ${q.score})`)
    .join("\n");

  const factorsList = profile.limitingFactors
    .slice(0, 3)
    .map((f) => `  • ${f.factor} [${f.severity}] — ${f.detail}`)
    .join("\n");

  const methodsList = profile.recommendedMethods
    .slice(0, 3)
    .map((m) => {
      const breakdown = m.researchConfidence
        ? ` [Match:${m.researchConfidence.profileMatch} | Research:${m.researchConfidence.researchSupport} | Transfer:${m.researchConfidence.populationTransfer}]`
        : "";
      const contradictionFlag = m.hasContradictions ? " ⚠ mixed evidence" : "";
      return `  • ${m.method} (Confidence: ${m.confidence}%)${breakdown}${contradictionFlag} → targets ${m.targetQuality}`;
    })
    .join("\n");

  const adaptationsList = profile.expectedAdaptations.primary
    .slice(0, 3)
    .map((a) => `  • ${a}`)
    .join("\n");

  const exercisePoolList = profile.recommendedExercisePool.tier1
    .slice(0, 5)
    .join(", ");

  // Phase 7 — include research intelligence section when available
  const researchSection = profile.researchIntelligence
    ? "\n" + buildResearchIntelligencePromptSection(profile.researchIntelligence)
    : "";

  return `
══════════════════════════════════════════
PERFORMANCE INTELLIGENCE PROFILE (v2 — Research-Backed)
══════════════════════════════════════════

The following analysis has been computed from the athlete's goals, sport, training age, and
assessment data. Use this intelligence to guide exercise selection, method rationale, and
coaching explanations. Every exercise you select should have a performance reason.

PRIORITY PHYSICAL QUALITIES (ranked):
${qualitiesList}

IDENTIFIED LIMITING FACTORS:
${factorsList || "  • No specific deficits identified — build from goal-based quality priorities"}

RECOMMENDED TRAINING METHODS (research-weighted confidence):
${methodsList}

EVIDENCE-BASED EXERCISE POOL (Tier 1):
  ${exercisePoolList}

EXPECTED ADAPTATIONS:
${adaptationsList}
${researchSection}
EXERCISE SELECTION DIRECTIVE:
When building the program, prioritize Tier 1 exercises from the pool above. For every
included exercise, reference the quality it targets and the expected adaptation.
When a method has ⚠ mixed evidence, acknowledge uncertainty rather than false consensus.
Confidence breakdowns: Performance Match | Research Support | Population Transfer.
If the user asks "why was this exercise selected?", respond using this intelligence profile.
══════════════════════════════════════════`.trim();
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function normalizeGoalKey(goal: string): string {
  const g = goal.toLowerCase().replace(/[_\s]/g, "");
  if (g.includes("strength")) return "strength";
  if (g.includes("athletic") || g.includes("sport") || g.includes("performance")) return "athletic_performance";
  if (g.includes("hyper") || g.includes("muscle") || g.includes("mass")) return "hypertrophy";
  if (g.includes("fat") || g.includes("weight") || g.includes("loss") || g.includes("lean")) return "fat_loss";
  if (g.includes("endurance") || g.includes("cardio") || g.includes("aerobic")) return "endurance";
  if (g.includes("power") || g.includes("explosive")) return "power";
  return "general_fitness";
}

function resolveEquipmentKey(equipment: string): string {
  const e = equipment.toLowerCase();
  if (e.includes("full") || e.includes("gym") || e.includes("commercial")) return "full_gym";
  if (e.includes("home") || e.includes("rack") || e.includes("barbell")) return "home_gym";
  if (e.includes("minimal") || e.includes("limited") || e.includes("bodyweight")) return "minimal";
  if (e.includes("body") || e.includes("no equipment")) return "bodyweight";
  return "full_gym";
}
