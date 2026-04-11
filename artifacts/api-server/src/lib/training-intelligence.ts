/**
 * TrainChat Training Intelligence Engine
 *
 * A rules-driven training logic layer that:
 * - Computes goal-specific programming specs from user profiles
 * - Provides a curated exercise library organized by movement pattern and constraints
 * - Generates rich AI prompt context to guide OpenAI responses
 * - Powers the fallback program generator with intelligent selection
 *
 * Architecture note: This module is intentionally decoupled from AI/OpenAI.
 * It represents the "training brain" that can evolve independently.
 */

// ─── Core Types ──────────────────────────────────────────────────────────────

export type SeasonContext =
  | "off_season"
  | "pre_season"
  | "in_season"
  | "post_season"
  | "return_to_play";

export interface UserProfile {
  trainingGoal: string;
  experienceLevel: string;
  trainingStyle: string;
  daysPerWeek: number;
  sessionDuration: number;
  equipmentAccess: string;
  injuries: string | null;
  sportFocus: string | null;
  exercisePreferences: string | null;
  exercisesToAvoid: string | null;
  seasonContext?: SeasonContext | null;
  gameFrequencyPerWeek?: number | null;
  practiceFrequencyPerWeek?: number | null;
}

// Normalized goal categories
export type GoalType =
  | "hypertrophy"
  | "strength"
  | "athletic_performance"
  | "general_fitness"
  | "fat_loss"
  | "endurance";

// Normalized experience tiers
export type ExperienceTier = "beginner" | "intermediate" | "advanced";

// Normalized equipment level
export type EquipmentLevel = "full_gym" | "dumbbells_only" | "bodyweight" | "home_limited";

// Movement patterns — the vocabulary of structured programming
export type MovementPattern =
  | "squat"
  | "hinge"
  | "push_horizontal"
  | "push_vertical"
  | "pull_horizontal"
  | "pull_vertical"
  | "carry"
  | "core"
  | "power_explosive"
  | "iso_chest"
  | "iso_back"
  | "iso_shoulders"
  | "iso_arms"
  | "iso_legs"
  | "conditioning";

// Equipment tags on exercises
export type EquipmentTag =
  | "barbell"
  | "dumbbell"
  | "cable"
  | "machine"
  | "bodyweight"
  | "kettlebell"
  | "band"
  | "trap_bar";

// Joint stress flags for injury-aware filtering
export type JointStress =
  | "knee_dominant"
  | "shoulder_dominant"
  | "spine_load"
  | "low_back_stress"
  | "hip_stress"
  | "elbow_stress"
  | "wrist_stress";

// Difficulty rating
export type DifficultyLevel = "beginner" | "intermediate" | "advanced";

// Exercise entry in the library
export interface ExerciseEntry {
  name: string;
  pattern: MovementPattern;
  equipment: EquipmentTag[];
  difficulty: DifficultyLevel;
  jointStress: JointStress[];
  goalBias: GoalType[]; // which goals this exercise is best suited for
  notes?: string; // default coaching note
}

// Computed training specification from profile
export interface TrainingSpec {
  // Normalized inputs
  goal: GoalType;
  experience: ExperienceTier;
  equipment: EquipmentLevel;

  // Split design
  splitType: string;
  splitDescription: string;
  daysPerWeek: number;

  // Volume targets (per session, per week)
  setsPerMuscleGroupPerWeek: { min: number; max: number };
  exercisesPerSession: { min: number; max: number };

  // Intensity prescription
  primaryRepRange: string;
  secondaryRepRange: string;
  primaryRest: string;
  secondaryRest: string;
  accessoryRest: string;
  primarySets: number;
  secondarySets: number;
  accessorySets: number;

  // Progression model
  progressionModel: string;
  progressionRate: string;
  deloadFrequency: string;

  // Fatigue management
  backToBackWarning: string;
  weeklyIntensityNotes: string;

  // Pain flags (derived from injury field)
  injuryFlags: JointStress[];
  injuryGuidance: string;

  // Session efficiency
  sessionDuration: number;
  sessionDensity: "tight" | "moderate" | "extended";

  // Rationale hooks
  splitRationale: string;
  goalRationale: string;
}

// ─── Normalization helpers ───────────────────────────────────────────────────

export function normalizeGoal(rawGoal: string): GoalType {
  const g = rawGoal.toLowerCase();
  if (g.includes("hypertrophy") || g.includes("muscle") || g.includes("size") || g.includes("mass")) return "hypertrophy";
  if (g.includes("strength") || g.includes("strong") || g.includes("powerlifting") || g.includes("1rm")) return "strength";
  if (g.includes("athletic") || g.includes("performance") || g.includes("sport") || g.includes("speed") || g.includes("power") || g.includes("agility")) return "athletic_performance";
  if (g.includes("fat") || g.includes("weight loss") || g.includes("lean") || g.includes("cut")) return "fat_loss";
  if (g.includes("endurance") || g.includes("cardio") || g.includes("aerobic")) return "endurance";
  return "general_fitness";
}

export function normalizeExperience(rawLevel: string): ExperienceTier {
  const l = rawLevel.toLowerCase();
  if (l.includes("beginner") || l.includes("novice") || l.includes("new") || l.includes("start")) return "beginner";
  if (l.includes("advanced") || l.includes("expert") || l.includes("elite") || l.includes("competitive")) return "advanced";
  return "intermediate";
}

export function normalizeEquipment(rawEquipment: string): EquipmentLevel {
  const e = rawEquipment.toLowerCase();
  if (e.includes("bodyweight") || e.includes("no equipment") || e.includes("home") && !e.includes("dumbbell") && !e.includes("barbell")) return "bodyweight";
  if ((e.includes("dumbbell") || e.includes("dumbbells")) && !e.includes("barbell") && !e.includes("full")) return "dumbbells_only";
  if (e.includes("home") || e.includes("limited") || (e.includes("dumbbell") && e.includes("some"))) return "home_limited";
  return "full_gym"; // full gym, barbell, commercial, etc.
}

export function detectInjuryFlags(rawInjuries: string | null): JointStress[] {
  if (!rawInjuries) return [];
  const i = rawInjuries.toLowerCase();
  const flags: JointStress[] = [];
  if (i.includes("knee") || i.includes("patellar") || i.includes("acl") || i.includes("mcl")) flags.push("knee_dominant");
  if (i.includes("shoulder") || i.includes("rotator") || i.includes("labrum") || i.includes("ac joint")) flags.push("shoulder_dominant");
  if (i.includes("back") || i.includes("spine") || i.includes("disc") || i.includes("lumbar") || i.includes("vertebr")) {
    flags.push("spine_load");
    flags.push("low_back_stress");
  }
  if (i.includes("hip") || i.includes("si joint") || i.includes("groin") || i.includes("glute")) flags.push("hip_stress");
  if (i.includes("elbow") || i.includes("tennis") || i.includes("golfer")) flags.push("elbow_stress");
  if (i.includes("wrist") || i.includes("carpal")) flags.push("wrist_stress");
  return flags;
}

// ─── Exercise Library ────────────────────────────────────────────────────────

export const EXERCISE_LIBRARY: ExerciseEntry[] = [
  // ── SQUAT PATTERNS ──
  { name: "Back Squat", pattern: "squat", equipment: ["barbell"], difficulty: "intermediate", jointStress: ["knee_dominant", "spine_load"], goalBias: ["strength", "hypertrophy", "athletic_performance"], notes: "Brace hard, maintain upright torso through the descent" },
  { name: "Front Squat", pattern: "squat", equipment: ["barbell"], difficulty: "advanced", jointStress: ["knee_dominant", "spine_load", "wrist_stress"], goalBias: ["strength", "athletic_performance"], notes: "Aggressive upper-back tightness — elbows high throughout" },
  { name: "Goblet Squat", pattern: "squat", equipment: ["dumbbell", "kettlebell"], difficulty: "beginner", jointStress: ["knee_dominant"], goalBias: ["general_fitness", "hypertrophy", "fat_loss"], notes: "Use the weight as a counterbalance — sit into it" },
  { name: "Bulgarian Split Squat", pattern: "squat", equipment: ["dumbbell", "barbell", "bodyweight"], difficulty: "intermediate", jointStress: ["knee_dominant", "hip_stress"], goalBias: ["hypertrophy", "athletic_performance", "general_fitness"], notes: "Front foot far enough forward that shin stays mostly vertical" },
  { name: "Leg Press", pattern: "squat", equipment: ["machine"], difficulty: "beginner", jointStress: ["knee_dominant"], goalBias: ["hypertrophy", "general_fitness"], notes: "Full ROM — don't let the sled lock out your knees at the top" },
  { name: "Hack Squat", pattern: "squat", equipment: ["machine"], difficulty: "intermediate", jointStress: ["knee_dominant"], goalBias: ["hypertrophy"], notes: "Drive knees out, control the descent" },
  { name: "Box Squat", pattern: "squat", equipment: ["barbell"], difficulty: "intermediate", jointStress: ["knee_dominant", "spine_load"], goalBias: ["strength", "athletic_performance"], notes: "Pause and reset on the box — no bouncing" },
  { name: "Step-Up", pattern: "squat", equipment: ["dumbbell", "bodyweight", "barbell"], difficulty: "beginner", jointStress: ["knee_dominant"], goalBias: ["general_fitness", "athletic_performance", "fat_loss"], notes: "Drive through the heel of the elevated leg" },
  { name: "Wall Sit", pattern: "squat", equipment: ["bodyweight"], difficulty: "beginner", jointStress: ["knee_dominant"], goalBias: ["general_fitness", "fat_loss"], notes: "90 degree knee angle, full isometric hold" },

  // ── HINGE PATTERNS ──
  { name: "Conventional Deadlift", pattern: "hinge", equipment: ["barbell"], difficulty: "intermediate", jointStress: ["spine_load", "low_back_stress", "hip_stress"], goalBias: ["strength", "hypertrophy", "athletic_performance"], notes: "Bar stays over mid-foot, lat tension before the pull" },
  { name: "Sumo Deadlift", pattern: "hinge", equipment: ["barbell"], difficulty: "intermediate", jointStress: ["hip_stress", "spine_load"], goalBias: ["strength"], notes: "Wide stance, toes out, hips drop into it — less back lever" },
  { name: "Romanian Deadlift", pattern: "hinge", equipment: ["barbell", "dumbbell"], difficulty: "intermediate", jointStress: ["low_back_stress", "hip_stress"], goalBias: ["hypertrophy", "strength", "athletic_performance"], notes: "Push hips back, keep bar close — feel the hamstring stretch at the bottom" },
  { name: "Single-Leg Romanian Deadlift", pattern: "hinge", equipment: ["dumbbell", "kettlebell", "bodyweight"], difficulty: "intermediate", jointStress: ["hip_stress"], goalBias: ["athletic_performance", "hypertrophy", "general_fitness"], notes: "Hip hinge dominant — the balance is secondary to the hip drive" },
  { name: "Trap Bar Deadlift", pattern: "hinge", equipment: ["trap_bar"], difficulty: "beginner", jointStress: ["spine_load"], goalBias: ["strength", "athletic_performance", "general_fitness"], notes: "More upright torso than conventional — great for athletic populations" },
  { name: "Hip Thrust", pattern: "hinge", equipment: ["barbell", "dumbbell", "machine", "bodyweight"], difficulty: "beginner", jointStress: ["hip_stress"], goalBias: ["hypertrophy", "athletic_performance", "general_fitness"], notes: "Full hip extension at top — drive through heels" },
  { name: "Glute Bridge", pattern: "hinge", equipment: ["bodyweight", "barbell", "dumbbell"], difficulty: "beginner", jointStress: ["hip_stress"], goalBias: ["general_fitness", "fat_loss", "hypertrophy"], notes: "Posterior pelvic tilt at top — squeeze hard" },
  { name: "Good Morning", pattern: "hinge", equipment: ["barbell", "band"], difficulty: "intermediate", jointStress: ["low_back_stress", "spine_load"], goalBias: ["strength"], notes: "Soft knee bend, feel the hamstring load through the hinge" },
  { name: "Kettlebell Swing", pattern: "hinge", equipment: ["kettlebell"], difficulty: "intermediate", jointStress: ["low_back_stress", "hip_stress"], goalBias: ["athletic_performance", "fat_loss", "general_fitness"], notes: "Hip hinge, not a squat — power comes from the glutes" },

  // ── HORIZONTAL PUSH ──
  { name: "Barbell Bench Press", pattern: "push_horizontal", equipment: ["barbell"], difficulty: "intermediate", jointStress: ["shoulder_dominant", "elbow_stress"], goalBias: ["strength", "hypertrophy"], notes: "Slight arch, retract scapula, elbows ~45-60° from torso" },
  { name: "Dumbbell Bench Press", pattern: "push_horizontal", equipment: ["dumbbell"], difficulty: "beginner", jointStress: ["shoulder_dominant"], goalBias: ["hypertrophy", "general_fitness"], notes: "Greater ROM than barbell — control the stretch at the bottom" },
  { name: "Incline Barbell Press", pattern: "push_horizontal", equipment: ["barbell"], difficulty: "intermediate", jointStress: ["shoulder_dominant"], goalBias: ["strength", "hypertrophy"], notes: "30-45° incline — upper chest and anterior delt emphasis" },
  { name: "Incline Dumbbell Press", pattern: "push_horizontal", equipment: ["dumbbell"], difficulty: "beginner", jointStress: ["shoulder_dominant"], goalBias: ["hypertrophy", "general_fitness"], notes: "30-45° angle for upper chest emphasis" },
  { name: "Dumbbell Fly", pattern: "iso_chest", equipment: ["dumbbell"], difficulty: "beginner", jointStress: ["shoulder_dominant", "elbow_stress"], goalBias: ["hypertrophy"], notes: "Slight bend in elbows — feel the stretch, don't force range" },
  { name: "Cable Fly", pattern: "iso_chest", equipment: ["cable"], difficulty: "beginner", jointStress: ["shoulder_dominant"], goalBias: ["hypertrophy"], notes: "Constant tension through the movement — don't let cables go slack" },
  { name: "Push-Up", pattern: "push_horizontal", equipment: ["bodyweight"], difficulty: "beginner", jointStress: ["shoulder_dominant", "wrist_stress"], goalBias: ["general_fitness", "fat_loss"], notes: "Straight line from heel to head — full ROM" },
  { name: "Close-Grip Bench Press", pattern: "push_horizontal", equipment: ["barbell"], difficulty: "intermediate", jointStress: ["shoulder_dominant", "elbow_stress"], goalBias: ["strength", "hypertrophy"], notes: "Hands shoulder-width — tricep emphasis while still loading the chest" },

  // ── VERTICAL PUSH ──
  { name: "Barbell Overhead Press", pattern: "push_vertical", equipment: ["barbell"], difficulty: "intermediate", jointStress: ["shoulder_dominant", "spine_load", "elbow_stress"], goalBias: ["strength", "athletic_performance"], notes: "Full lockout at top, slight forward lean is acceptable" },
  { name: "Dumbbell Shoulder Press", pattern: "push_vertical", equipment: ["dumbbell"], difficulty: "beginner", jointStress: ["shoulder_dominant"], goalBias: ["hypertrophy", "general_fitness"], notes: "Neutral or pronated grip — do not force range if it causes pain" },
  { name: "Arnold Press", pattern: "push_vertical", equipment: ["dumbbell"], difficulty: "intermediate", jointStress: ["shoulder_dominant"], goalBias: ["hypertrophy"], notes: "Rotation targets all three deltoid heads — controlled tempo" },
  { name: "Landmine Press", pattern: "push_vertical", equipment: ["barbell"], difficulty: "intermediate", jointStress: ["shoulder_dominant"], goalBias: ["athletic_performance", "general_fitness"], notes: "Excellent shoulder-friendly pressing option — natural arc of motion" },
  { name: "Pike Push-Up", pattern: "push_vertical", equipment: ["bodyweight"], difficulty: "beginner", jointStress: ["shoulder_dominant", "wrist_stress"], goalBias: ["general_fitness", "fat_loss"], notes: "Hips high, head through the arms at the bottom" },

  // ── HORIZONTAL PULL ──
  { name: "Barbell Row", pattern: "pull_horizontal", equipment: ["barbell"], difficulty: "intermediate", jointStress: ["low_back_stress", "spine_load"], goalBias: ["strength", "hypertrophy"], notes: "Chest up, drive elbows back — not just pulling the bar" },
  { name: "Dumbbell Row", pattern: "pull_horizontal", equipment: ["dumbbell"], difficulty: "beginner", jointStress: [], goalBias: ["hypertrophy", "general_fitness"], notes: "Full retraction at top — don't let the shoulder roll forward" },
  { name: "Seated Cable Row", pattern: "pull_horizontal", equipment: ["cable"], difficulty: "beginner", jointStress: [], goalBias: ["hypertrophy", "general_fitness"], notes: "Drive elbows past the torso — don't lean back excessively" },
  { name: "Machine Row", pattern: "pull_horizontal", equipment: ["machine"], difficulty: "beginner", jointStress: [], goalBias: ["hypertrophy", "general_fitness"], notes: "Consistent setup each set — chest pad for stability" },
  { name: "Face Pull", pattern: "iso_shoulders", equipment: ["cable", "band"], difficulty: "beginner", jointStress: ["shoulder_dominant"], goalBias: ["general_fitness", "hypertrophy", "strength"], notes: "External rotation emphasis — critical for shoulder health in pressing programs" },
  { name: "Chest-Supported Row", pattern: "pull_horizontal", equipment: ["dumbbell", "machine"], difficulty: "beginner", jointStress: [], goalBias: ["hypertrophy", "general_fitness"], notes: "Chest support eliminates lower back involvement — great for volume work" },
  { name: "Inverted Row", pattern: "pull_horizontal", equipment: ["bodyweight"], difficulty: "beginner", jointStress: [], goalBias: ["general_fitness", "athletic_performance"], notes: "Body as straight as a deadlift — squeeze at top" },

  // ── VERTICAL PULL ──
  { name: "Pull-Up", pattern: "pull_vertical", equipment: ["bodyweight"], difficulty: "intermediate", jointStress: ["shoulder_dominant", "elbow_stress"], goalBias: ["strength", "hypertrophy", "athletic_performance"], notes: "Full hang at bottom — dead hang to activate the lats properly" },
  { name: "Weighted Pull-Up", pattern: "pull_vertical", equipment: ["barbell", "dumbbell"], difficulty: "advanced", jointStress: ["shoulder_dominant", "elbow_stress"], goalBias: ["strength", "hypertrophy"], notes: "Reduce weight before you reduce range of motion" },
  { name: "Lat Pulldown", pattern: "pull_vertical", equipment: ["cable", "machine"], difficulty: "beginner", jointStress: ["shoulder_dominant"], goalBias: ["hypertrophy", "general_fitness"], notes: "Pull to upper chest — don't pull behind the neck" },
  { name: "Cable Pullover", pattern: "pull_vertical", equipment: ["cable"], difficulty: "intermediate", jointStress: ["shoulder_dominant"], goalBias: ["hypertrophy"], notes: "Long head of lat emphasis — keep arms mostly straight" },
  { name: "Straight-Arm Pulldown", pattern: "pull_vertical", equipment: ["cable", "band"], difficulty: "intermediate", jointStress: ["shoulder_dominant"], goalBias: ["hypertrophy"], notes: "Isolates the lat without bicep involvement" },
  { name: "Chin-Up", pattern: "pull_vertical", equipment: ["bodyweight"], difficulty: "intermediate", jointStress: ["shoulder_dominant", "elbow_stress"], goalBias: ["hypertrophy", "strength", "general_fitness"], notes: "Supinated grip recruits biceps more than pull-ups" },

  // ── POWER / EXPLOSIVE ──
  { name: "Power Clean", pattern: "power_explosive", equipment: ["barbell"], difficulty: "advanced", jointStress: ["wrist_stress", "spine_load"], goalBias: ["athletic_performance", "strength"], notes: "Maximum intent on every rep — not a cardio exercise" },
  { name: "Hang Power Clean", pattern: "power_explosive", equipment: ["barbell"], difficulty: "intermediate", jointStress: ["wrist_stress"], goalBias: ["athletic_performance", "strength"], notes: "Hips back, violent extension — meet the bar high" },
  { name: "Hang High Pull", pattern: "power_explosive", equipment: ["barbell"], difficulty: "intermediate", jointStress: ["wrist_stress", "shoulder_dominant"], goalBias: ["athletic_performance", "strength"], notes: "Triple extension is the goal — the pull is just the result" },
  { name: "Box Jump", pattern: "power_explosive", equipment: ["bodyweight"], difficulty: "intermediate", jointStress: ["knee_dominant", "hip_stress"], goalBias: ["athletic_performance"], notes: "Land softly — absorb force through the whole chain" },
  { name: "Depth Jump", pattern: "power_explosive", equipment: ["bodyweight"], difficulty: "advanced", jointStress: ["knee_dominant", "hip_stress"], goalBias: ["athletic_performance"], notes: "Minimize ground contact time — reactive strength, not just a jump" },
  { name: "Broad Jump", pattern: "power_explosive", equipment: ["bodyweight"], difficulty: "intermediate", jointStress: ["knee_dominant", "hip_stress"], goalBias: ["athletic_performance"], notes: "Horizontal power — arm swing drives the jump" },
  { name: "Vertical Jump", pattern: "power_explosive", equipment: ["bodyweight"], difficulty: "beginner", jointStress: ["knee_dominant", "hip_stress"], goalBias: ["athletic_performance"], notes: "Max effort each rep — triple extension (ankle, knee, hip)" },
  { name: "Lateral Bound", pattern: "power_explosive", equipment: ["bodyweight"], difficulty: "intermediate", jointStress: ["knee_dominant", "hip_stress"], goalBias: ["athletic_performance"], notes: "Lateral force production — stick the landing, pause, repeat" },
  { name: "Alternating Bounds", pattern: "power_explosive", equipment: ["bodyweight"], difficulty: "intermediate", jointStress: ["knee_dominant", "hip_stress"], goalBias: ["athletic_performance"], notes: "Horizontal single-leg power — aggressive arm drive, full extension" },
  { name: "Medicine Ball Slam", pattern: "power_explosive", equipment: ["bodyweight"], difficulty: "beginner", jointStress: ["spine_load"], goalBias: ["athletic_performance", "fat_loss"], notes: "Full body extension then aggressive flexion — total effort" },
  { name: "Medicine Ball Rotational Throw", pattern: "power_explosive", equipment: ["bodyweight"], difficulty: "intermediate", jointStress: ["spine_load"], goalBias: ["athletic_performance"], notes: "Power from the hips, not the arms — rotate through the thorax" },
  { name: "Medicine Ball Chest Pass", pattern: "power_explosive", equipment: ["bodyweight"], difficulty: "beginner", jointStress: ["shoulder_dominant"], goalBias: ["athletic_performance", "strength"], notes: "Explosive horizontal force — full upper body extension" },
  { name: "Medicine Ball Overhead Scoop Toss", pattern: "power_explosive", equipment: ["bodyweight"], difficulty: "intermediate", jointStress: ["spine_load", "shoulder_dominant"], goalBias: ["athletic_performance"], notes: "Hip-driven posterior chain power — extension is everything" },
  { name: "Push Press", pattern: "power_explosive", equipment: ["barbell", "dumbbell"], difficulty: "intermediate", jointStress: ["shoulder_dominant", "knee_dominant"], goalBias: ["athletic_performance", "strength"], notes: "Leg drive loads the bar — press follows the momentum" },
  { name: "Dumbbell Jump Squat", pattern: "power_explosive", equipment: ["dumbbell"], difficulty: "intermediate", jointStress: ["knee_dominant", "spine_load"], goalBias: ["athletic_performance"], notes: "Maximum ground contact — land heel-to-toe and reset" },

  // ── ISOLATION: SHOULDERS ──
  { name: "Lateral Raise", pattern: "iso_shoulders", equipment: ["dumbbell", "cable", "machine"], difficulty: "beginner", jointStress: ["shoulder_dominant"], goalBias: ["hypertrophy"], notes: "Slight forward lean, lead with the elbow — pinky up" },
  { name: "Rear Delt Fly", pattern: "iso_shoulders", equipment: ["dumbbell", "cable", "machine"], difficulty: "beginner", jointStress: ["shoulder_dominant"], goalBias: ["hypertrophy", "general_fitness"], notes: "Maintain scapular retraction throughout" },
  { name: "Cable Lateral Raise", pattern: "iso_shoulders", equipment: ["cable"], difficulty: "beginner", jointStress: ["shoulder_dominant"], goalBias: ["hypertrophy"], notes: "Cross-body cable keeps tension at the bottom — better than dumbbell at full ROM" },

  // ── ISOLATION: ARMS ──
  { name: "Barbell Curl", pattern: "iso_arms", equipment: ["barbell"], difficulty: "beginner", jointStress: ["elbow_stress", "wrist_stress"], goalBias: ["hypertrophy"], notes: "Elbows stay at the sides — no swinging" },
  { name: "Dumbbell Curl", pattern: "iso_arms", equipment: ["dumbbell"], difficulty: "beginner", jointStress: ["elbow_stress"], goalBias: ["hypertrophy", "general_fitness"], notes: "Full supination at the top — don't rush the eccentric" },
  { name: "Hammer Curl", pattern: "iso_arms", equipment: ["dumbbell"], difficulty: "beginner", jointStress: ["elbow_stress"], goalBias: ["hypertrophy", "general_fitness"], notes: "Neutral grip targets brachialis and brachioradialis — adds arm thickness" },
  { name: "Incline Dumbbell Curl", pattern: "iso_arms", equipment: ["dumbbell"], difficulty: "beginner", jointStress: ["shoulder_dominant", "elbow_stress"], goalBias: ["hypertrophy"], notes: "Stretches the long head of the bicep — great for mass" },
  { name: "Preacher Curl", pattern: "iso_arms", equipment: ["barbell", "dumbbell", "cable", "machine"], difficulty: "beginner", jointStress: ["elbow_stress"], goalBias: ["hypertrophy"], notes: "No cheating possible — pure elbow flexion" },
  { name: "Tricep Pushdown", pattern: "iso_arms", equipment: ["cable"], difficulty: "beginner", jointStress: ["elbow_stress"], goalBias: ["hypertrophy", "general_fitness"], notes: "Elbows stay at sides — lockout at the bottom" },
  { name: "Overhead Tricep Extension", pattern: "iso_arms", equipment: ["dumbbell", "cable", "barbell"], difficulty: "beginner", jointStress: ["elbow_stress", "shoulder_dominant"], goalBias: ["hypertrophy"], notes: "Long head stretch position — keep upper arms close to ears" },
  { name: "Skull Crusher", pattern: "iso_arms", equipment: ["barbell", "dumbbell"], difficulty: "intermediate", jointStress: ["elbow_stress"], goalBias: ["hypertrophy"], notes: "Elbows track forward slightly at the bottom — protects the joint" },
  { name: "Cable Curl", pattern: "iso_arms", equipment: ["cable"], difficulty: "beginner", jointStress: ["elbow_stress"], goalBias: ["hypertrophy"], notes: "Constant tension through full ROM" },
  { name: "Diamond Push-Up", pattern: "iso_arms", equipment: ["bodyweight"], difficulty: "beginner", jointStress: ["elbow_stress", "wrist_stress"], goalBias: ["general_fitness"], notes: "Hands close — tricep emphasis" },

  // ── ISOLATION: LEGS ──
  { name: "Leg Extension", pattern: "iso_legs", equipment: ["machine"], difficulty: "beginner", jointStress: ["knee_dominant"], goalBias: ["hypertrophy"], notes: "Full extension with a peak contraction — slow the eccentric" },
  { name: "Leg Curl", pattern: "iso_legs", equipment: ["machine"], difficulty: "beginner", jointStress: ["knee_dominant"], goalBias: ["hypertrophy", "athletic_performance"], notes: "Both lying and seated work — seated provides more stretch" },
  { name: "Calf Raise", pattern: "iso_legs", equipment: ["machine", "dumbbell", "bodyweight", "barbell"], difficulty: "beginner", jointStress: ["knee_dominant"], goalBias: ["hypertrophy", "general_fitness"], notes: "Full ROM — all the way down, all the way up. Calves respond to volume" },
  { name: "Nordic Hamstring Curl", pattern: "iso_legs", equipment: ["bodyweight"], difficulty: "advanced", jointStress: ["knee_dominant"], goalBias: ["athletic_performance"], notes: "Extreme eccentric load — builds hamstring resilience for athletes" },
  { name: "Walking Lunge", pattern: "iso_legs", equipment: ["dumbbell", "barbell", "bodyweight"], difficulty: "beginner", jointStress: ["knee_dominant", "hip_stress"], goalBias: ["hypertrophy", "general_fitness", "athletic_performance"], notes: "Knee tracks over the front foot — step length affects muscle emphasis" },
  { name: "Lateral Lunge", pattern: "iso_legs", equipment: ["dumbbell", "bodyweight", "barbell"], difficulty: "intermediate", jointStress: ["knee_dominant", "hip_stress"], goalBias: ["athletic_performance", "general_fitness"], notes: "Push hips back as you lower — frontal plane loading for COD prep" },
  { name: "Lateral Step-Up", pattern: "iso_legs", equipment: ["dumbbell", "bodyweight"], difficulty: "intermediate", jointStress: ["knee_dominant", "hip_stress"], goalBias: ["athletic_performance", "general_fitness"], notes: "Drive through the elevated leg — builds single-leg lateral force production" },
  { name: "Rear-Foot Elevated Split Squat", pattern: "iso_legs", equipment: ["dumbbell", "barbell", "bodyweight"], difficulty: "intermediate", jointStress: ["knee_dominant", "hip_stress"], goalBias: ["athletic_performance", "hypertrophy", "strength"], notes: "Upright torso — glute and quad loading under single-leg demand" },
  { name: "Curtsy Lunge", pattern: "iso_legs", equipment: ["dumbbell", "bodyweight"], difficulty: "intermediate", jointStress: ["knee_dominant", "hip_stress"], goalBias: ["athletic_performance", "general_fitness"], notes: "Glute med and hip external rotator emphasis — frontal and transverse plane" },
  { name: "Deficit Split Squat", pattern: "iso_legs", equipment: ["dumbbell", "barbell", "bodyweight"], difficulty: "advanced", jointStress: ["knee_dominant", "hip_stress"], goalBias: ["athletic_performance", "strength", "hypertrophy"], notes: "Increased ROM loads the quad and hip flexor — elite unilateral strength builder" },

  // ── CARRY ──
  { name: "Farmer Carry", pattern: "carry", equipment: ["dumbbell", "kettlebell", "barbell"], difficulty: "beginner", jointStress: ["spine_load"], goalBias: ["general_fitness", "athletic_performance", "strength"], notes: "Tall posture, short strides — this is full-body integration" },
  { name: "Suitcase Carry", pattern: "carry", equipment: ["dumbbell", "kettlebell"], difficulty: "beginner", jointStress: ["spine_load"], goalBias: ["general_fitness", "athletic_performance"], notes: "Anti-lateral flexion — resist the lean" },

  // ── CORE ──
  { name: "Plank", pattern: "core", equipment: ["bodyweight"], difficulty: "beginner", jointStress: ["wrist_stress", "spine_load"], goalBias: ["general_fitness", "athletic_performance", "strength"], notes: "Straight line — squeeze glutes, brace the abs" },
  { name: "RKC Plank", pattern: "core", equipment: ["bodyweight"], difficulty: "intermediate", jointStress: ["wrist_stress", "spine_load"], goalBias: ["athletic_performance", "strength"], notes: "Maximum whole-body tension — squeeze everything, posterior pelvic tilt throughout" },
  { name: "Pallof Press", pattern: "core", equipment: ["cable", "band"], difficulty: "intermediate", jointStress: [], goalBias: ["athletic_performance", "general_fitness", "strength"], notes: "Anti-rotation under load — resist lateral pull, no trunk rotation" },
  { name: "Half-Kneeling Pallof Press", pattern: "core", equipment: ["cable", "band"], difficulty: "intermediate", jointStress: ["knee_dominant"], goalBias: ["athletic_performance", "general_fitness"], notes: "Hip stability and anti-rotation combined — key for athletic trunk control" },
  { name: "Dead Bug", pattern: "core", equipment: ["bodyweight"], difficulty: "beginner", jointStress: ["low_back_stress"], goalBias: ["general_fitness", "strength"], notes: "Lower back presses into the floor throughout — no gap" },
  { name: "Ab Wheel Rollout", pattern: "core", equipment: ["bodyweight"], difficulty: "intermediate", jointStress: ["low_back_stress", "wrist_stress"], goalBias: ["strength", "hypertrophy"], notes: "Posterior pelvic tilt first — prevent the low back from loading" },
  { name: "Stir the Pot", pattern: "core", equipment: ["bodyweight"], difficulty: "intermediate", jointStress: ["wrist_stress", "spine_load"], goalBias: ["athletic_performance", "strength"], notes: "Anti-extension with rotational challenge — dynamic bracing demand" },
  { name: "Copenhagen Plank", pattern: "core", equipment: ["bodyweight"], difficulty: "advanced", jointStress: ["hip_stress"], goalBias: ["athletic_performance"], notes: "Adductor and oblique integration — key for groin health in athletes" },
  { name: "Landmine Rotation", pattern: "core", equipment: ["barbell"], difficulty: "intermediate", jointStress: ["spine_load", "shoulder_dominant"], goalBias: ["athletic_performance", "strength"], notes: "Rotational power from a stable base — thoracic rotation with loaded resistance" },
  { name: "Half-Kneeling Cable Chop", pattern: "core", equipment: ["cable", "band"], difficulty: "intermediate", jointStress: [], goalBias: ["athletic_performance", "general_fitness"], notes: "Anti-rotation and rotational power — diagonal force production pattern" },
  { name: "Hollow Body Hold", pattern: "core", equipment: ["bodyweight"], difficulty: "intermediate", jointStress: ["spine_load"], goalBias: ["athletic_performance", "general_fitness"], notes: "Total anterior chain stiffness — ribs down, lower back pressed to floor" },
  { name: "Side Plank", pattern: "core", equipment: ["bodyweight"], difficulty: "beginner", jointStress: ["shoulder_dominant"], goalBias: ["general_fitness", "athletic_performance"], notes: "Lateral stability — hip stacked, resist lateral flexion" },
  { name: "Side Plank with Hip Abduction", pattern: "core", equipment: ["bodyweight"], difficulty: "intermediate", jointStress: ["shoulder_dominant", "hip_stress"], goalBias: ["athletic_performance"], notes: "Combines lateral stability with hip abductor demand — glute med and oblique together" },

  // ── CONDITIONING ──
  { name: "Sled Push", pattern: "conditioning", equipment: ["machine"], difficulty: "beginner", jointStress: ["knee_dominant"], goalBias: ["athletic_performance", "fat_loss"], notes: "Drive through the balls of the feet — stay low and powerful" },
  { name: "Battle Ropes", pattern: "conditioning", equipment: ["machine"], difficulty: "beginner", jointStress: ["shoulder_dominant"], goalBias: ["fat_loss", "general_fitness"], notes: "Alternate arms — power from the core and hips, not just the arms" },
  { name: "Assault Bike", pattern: "conditioning", equipment: ["machine"], difficulty: "beginner", jointStress: [], goalBias: ["fat_loss", "general_fitness", "endurance"], notes: "True full-body conditioning — match power output to your goal" },
];

// ─── Exercise Selection Logic ─────────────────────────────────────────────────

export interface ExerciseFilter {
  patterns: MovementPattern[];
  equipment: EquipmentLevel;
  experience: ExperienceTier;
  injuryFlags: JointStress[];
  goal: GoalType;
  excludeNames?: string[];
  maxCount?: number;
  preferStressLevel?: "low" | "moderate" | "any";
}

/**
 * Filters the exercise library by constraints and returns a prioritized list.
 * Priority: goal-biased + experience-appropriate + equipment-available + injury-safe
 */
export function selectExercises(filter: ExerciseFilter): ExerciseEntry[] {
  const equipmentMap: Record<EquipmentLevel, EquipmentTag[]> = {
    full_gym: ["barbell", "dumbbell", "cable", "machine", "bodyweight", "kettlebell", "band", "trap_bar"],
    dumbbells_only: ["dumbbell", "bodyweight", "band", "kettlebell"],
    home_limited: ["dumbbell", "bodyweight", "band", "kettlebell"],
    bodyweight: ["bodyweight", "band"],
  };

  const allowedEquipment = equipmentMap[filter.equipment];
  const excludedNames = new Set(filter.excludeNames ?? []);

  const experienceOrder: Record<ExperienceTier, number> = { beginner: 0, intermediate: 1, advanced: 2 };
  const userLevel = experienceOrder[filter.experience];

  const candidates = EXERCISE_LIBRARY.filter((ex) => {
    // Must be in requested patterns
    if (!filter.patterns.includes(ex.pattern)) return false;

    // Must have at least one available equipment option
    const hasEquipment = ex.equipment.some((eq) => allowedEquipment.includes(eq));
    if (!hasEquipment) return false;

    // Must not exceed user experience (only offer advanced to intermediate/advanced)
    if (ex.difficulty === "advanced" && userLevel < 1) return false;
    if (ex.difficulty === "intermediate" && userLevel < 1 && filter.patterns.includes("power_explosive")) return false;

    // Must not conflict with injury flags
    const hasInjuryConflict = ex.jointStress.some((stress) => filter.injuryFlags.includes(stress));
    if (hasInjuryConflict && (filter.preferStressLevel === "low")) return false;

    // Exclude specific names
    if (excludedNames.has(ex.name)) return false;

    return true;
  });

  // Sort: goal-biased first, then by experience match, then injury-safeness
  const sorted = candidates.sort((a, b) => {
    const aGoalScore = a.goalBias.includes(filter.goal) ? 2 : 0;
    const bGoalScore = b.goalBias.includes(filter.goal) ? 2 : 0;
    const aInjuryScore = a.jointStress.some((s) => filter.injuryFlags.includes(s)) ? -1 : 0;
    const bInjuryScore = b.jointStress.some((s) => filter.injuryFlags.includes(s)) ? -1 : 0;
    return (bGoalScore + bInjuryScore) - (aGoalScore + aInjuryScore);
  });

  const limit = filter.maxCount ?? sorted.length;
  return sorted.slice(0, limit);
}

// ─── Training Specification Builder ─────────────────────────────────────────

/**
 * Core intelligence function: converts a user profile into a detailed
 * training specification that drives both the AI prompt and fallback generator.
 */
export function buildTrainingSpec(profile: UserProfile): TrainingSpec {
  const goal = normalizeGoal(profile.trainingGoal);
  const experience = normalizeExperience(profile.experienceLevel);
  const equipment = normalizeEquipment(profile.equipmentAccess);
  const injuryFlags = detectInjuryFlags(profile.injuries);
  const { daysPerWeek, sessionDuration } = profile;

  // ── Split selection ──
  const { splitType, splitDescription, splitRationale } = selectSplit(
    daysPerWeek,
    goal,
    experience
  );

  // ── Volume targets (sets per muscle group per week, by goal + experience) ──
  const setsPerMuscleGroupPerWeek = computeVolume(goal, experience);

  // ── Session efficiency tier ──
  const sessionDensity: TrainingSpec["sessionDensity"] =
    sessionDuration <= 45 ? "tight" : sessionDuration <= 65 ? "moderate" : "extended";

  // ── Exercises per session based on density ──
  const exercisesPerSession = computeExerciseCount(sessionDensity, goal);

  // ── Intensity and prescription ──
  const prescription = computePrescription(goal, experience);

  // ── Progression model ──
  const { progressionModel, progressionRate, deloadFrequency } = computeProgression(goal, experience);

  // ── Fatigue management ──
  const { backToBackWarning, weeklyIntensityNotes } = computeFatigueNotes(goal, experience, daysPerWeek);

  // ── Pain/injury guidance ──
  const injuryGuidance = buildInjuryGuidance(injuryFlags, goal);

  // ── Goal rationale ──
  const goalRationale = buildGoalRationale(goal, experience);

  return {
    goal,
    experience,
    equipment,
    splitType,
    splitDescription,
    daysPerWeek,
    setsPerMuscleGroupPerWeek,
    exercisesPerSession,
    ...prescription,
    progressionModel,
    progressionRate,
    deloadFrequency,
    backToBackWarning,
    weeklyIntensityNotes,
    injuryFlags,
    injuryGuidance,
    sessionDuration,
    sessionDensity,
    splitRationale,
    goalRationale,
  };
}

// ─── Split selector ───────────────────────────────────────────────────────────

function selectSplit(
  days: number,
  goal: GoalType,
  experience: ExperienceTier
): { splitType: string; splitDescription: string; splitRationale: string } {
  if (days <= 2) {
    return {
      splitType: "Full Body × 2",
      splitDescription: "Two full-body sessions with at least one rest day between them",
      splitRationale: `With 2 days, full body is the only sensible option — it gives every muscle group frequency without requiring excessive session density.`,
    };
  }

  if (days === 3) {
    if (goal === "strength") {
      return {
        splitType: "Full Body × 3 (Strength Focus)",
        splitDescription: "Three full-body sessions built around the big compound lifts",
        splitRationale: `3-day full body is ideal for strength — high frequency on the main lifts (squat, press, pull) with enough recovery between sessions.`,
      };
    }
    return {
      splitType: "Full Body × 3",
      splitDescription: "Three full-body sessions covering all major movement patterns",
      splitRationale: `3 days is best used as full body — each session covers all patterns, giving every muscle 3× per week contact at manageable volume.`,
    };
  }

  if (days === 4) {
    if (goal === "hypertrophy") {
      return {
        splitType: "Upper / Lower × 4",
        splitDescription: "Two upper days, two lower days — each muscle group trained twice per week",
        splitRationale: `4-day upper/lower is the most proven structure for hypertrophy — 2× frequency with enough volume per session, and meaningful recovery between matching days.`,
      };
    }
    if (goal === "strength") {
      return {
        splitType: "Upper / Lower × 4 (Strength Priority)",
        splitDescription: "Strength-biased upper/lower with distinct intensity/volume days",
        splitRationale: `4-day upper/lower allows heavy compound work twice per week per pattern with intelligent intensity variation between sessions.`,
      };
    }
    if (goal === "athletic_performance") {
      return {
        splitType: "Upper / Lower × 4 (Athletic Bias)",
        splitDescription: "Upper/lower with explosive work integrated on appropriate days",
        splitRationale: `For athletic performance at 4 days, upper/lower with power work integrated early in each session provides both strength and explosive capacity.`,
      };
    }
    return {
      splitType: "Upper / Lower × 4",
      splitDescription: "Four sessions split between upper and lower body",
      splitRationale: `Upper/lower over 4 days is balanced, efficient, and provides the right recovery ratio for your schedule.`,
    };
  }

  if (days === 5) {
    if (goal === "hypertrophy" && experience !== "beginner") {
      return {
        splitType: "Push / Pull / Legs + Upper / Full",
        splitDescription: "5-day hybrid — 3 dedicated + 2 overlapping sessions for frequency and volume",
        splitRationale: `At 5 days with hypertrophy goals, a PPL hybrid gives you both the volume of a split and the frequency of an upper/lower.`,
      };
    }
    return {
      splitType: "Upper × 2 / Lower × 2 / Full Body × 1",
      splitDescription: "5-day week: two upper, two lower, one full-body integration session",
      splitRationale: `5 days gives enough room for a true split with one full-body integration day — balances frequency and volume without overcrowding.`,
    };
  }

  // 6+ days
  if (experience === "beginner") {
    return {
      splitType: "Push / Pull / Legs × 2 (Modified)",
      splitDescription: "PPL run twice weekly with reduced volume per session for recovery",
      splitRationale: `6 days is high frequency. For your experience level, we'll reduce per-session volume so you can recover — quality over quantity.`,
    };
  }
  return {
    splitType: "Push / Pull / Legs × 2",
    splitDescription: "PPL run twice per week — each pattern trained every 72 hours",
    splitRationale: `6-day PPL provides maximum frequency (2× per muscle per week) and allows serious volume accumulation across the week.`,
  };
}

// ─── Volume calculator ────────────────────────────────────────────────────────

function computeVolume(
  goal: GoalType,
  experience: ExperienceTier
): { min: number; max: number } {
  const base: Record<GoalType, { min: number; max: number }> = {
    hypertrophy: { min: 12, max: 20 },
    strength: { min: 8, max: 14 },
    athletic_performance: { min: 10, max: 16 },
    fat_loss: { min: 8, max: 14 },
    general_fitness: { min: 8, max: 12 },
    endurance: { min: 6, max: 10 },
  };

  const multiplier = experience === "beginner" ? 0.7 : experience === "advanced" ? 1.15 : 1.0;
  const v = base[goal];
  return {
    min: Math.round(v.min * multiplier),
    max: Math.round(v.max * multiplier),
  };
}

// ─── Exercise count per session (based on session duration) ──────────────────

function computeExerciseCount(
  density: TrainingSpec["sessionDensity"],
  goal: GoalType
): { min: number; max: number } {
  if (density === "tight") return { min: 4, max: 6 };
  if (density === "moderate") {
    if (goal === "strength") return { min: 5, max: 7 };
    return { min: 5, max: 8 };
  }
  if (goal === "strength") return { min: 6, max: 8 };
  return { min: 6, max: 10 };
}

// ─── Prescription (sets / reps / rest) ──────────────────────────────────────

function computePrescription(goal: GoalType, experience: ExperienceTier): {
  primaryRepRange: string;
  secondaryRepRange: string;
  primaryRest: string;
  secondaryRest: string;
  accessoryRest: string;
  primarySets: number;
  secondarySets: number;
  accessorySets: number;
} {
  switch (goal) {
    case "strength":
      return {
        primaryRepRange: experience === "beginner" ? "5-6" : "3-5",
        secondaryRepRange: "6-8",
        primaryRest: experience === "beginner" ? "2 min" : "3-4 min",
        secondaryRest: "2 min",
        accessoryRest: "90s",
        primarySets: experience === "beginner" ? 4 : 5,
        secondarySets: 4,
        accessorySets: 3,
      };

    case "hypertrophy":
      return {
        primaryRepRange: "6-10",
        secondaryRepRange: "10-15",
        primaryRest: "90s",
        secondaryRest: "75s",
        accessoryRest: "60s",
        primarySets: 4,
        secondarySets: 4,
        accessorySets: 3,
      };

    case "athletic_performance":
      return {
        primaryRepRange: "3-5",
        secondaryRepRange: "6-8",
        primaryRest: "2-3 min",
        secondaryRest: "90s",
        accessoryRest: "75s",
        primarySets: 4,
        secondarySets: 4,
        accessorySets: 3,
      };

    case "fat_loss":
      return {
        primaryRepRange: "10-15",
        secondaryRepRange: "12-20",
        primaryRest: "60s",
        secondaryRest: "45-60s",
        accessoryRest: "45s",
        primarySets: 3,
        secondarySets: 3,
        accessorySets: 3,
      };

    case "general_fitness":
    default:
      return {
        primaryRepRange: "8-12",
        secondaryRepRange: "12-15",
        primaryRest: "75s",
        secondaryRest: "60s",
        accessoryRest: "45-60s",
        primarySets: 3,
        secondarySets: 3,
        accessorySets: 2,
      };
  }
}

// ─── Progression model ───────────────────────────────────────────────────────

function computeProgression(
  goal: GoalType,
  experience: ExperienceTier
): { progressionModel: string; progressionRate: string; deloadFrequency: string } {
  switch (goal) {
    case "strength":
      return {
        progressionModel: "Linear load progression (add weight when top of rep range is achieved cleanly)",
        progressionRate: experience === "beginner"
          ? "2.5–5kg on compound lifts per week when technique is solid"
          : "2.5kg on upper body, 5kg on lower body — hold weight if bar speed degrades",
        deloadFrequency: experience === "beginner" ? "Every 6 weeks" : "Every 4 weeks",
      };

    case "hypertrophy":
      return {
        progressionModel: "Double progression (add reps first, then load)",
        progressionRate: "Add 1 rep per set each week until hitting the top of the range — then add 2.5–5% load and return to the bottom",
        deloadFrequency: "Every 4–5 weeks",
      };

    case "athletic_performance":
      return {
        progressionModel: "Quality-based progression (speed and power output drive load decisions)",
        progressionRate: "Add load only when movement quality and bar speed are maintained — no grinding reps for athletes",
        deloadFrequency: "Every 3–4 weeks, or after competition blocks",
      };

    case "fat_loss":
      return {
        progressionModel: "Volume progression (increase density — more work in same time)",
        progressionRate: "Add reps or reduce rest before adding load — focus on density, not raw strength",
        deloadFrequency: "Every 5–6 weeks",
      };

    default:
      return {
        progressionModel: "Simple progressive overload",
        progressionRate: "Add reps each week until the top of the range, then add a small load increment",
        deloadFrequency: "Every 5–6 weeks",
      };
  }
}

// ─── Fatigue management notes ────────────────────────────────────────────────

function computeFatigueNotes(
  goal: GoalType,
  experience: ExperienceTier,
  daysPerWeek: number
): { backToBackWarning: string; weeklyIntensityNotes: string } {
  const highFrequency = daysPerWeek >= 5;
  const isStrength = goal === "strength";

  return {
    backToBackWarning: highFrequency
      ? "With 5+ days, avoid scheduling heavy lower body sessions back-to-back. Alternate lower/upper or insert a less demanding day between high-CNS sessions."
      : "Avoid scheduling two heavy lower-body or two high-intensity CNS sessions on consecutive days without reason.",
    weeklyIntensityNotes: isStrength
      ? "Not every session should be at maximum intensity. Vary between heavy (85-90% effort), moderate (75-80%), and lighter technique sessions weekly."
      : experience === "beginner"
      ? "Keep intensity honest at this stage — you're building movement patterns and GPP, not testing limits. Every session should feel challenging but completable."
      : "Distribute intensity across the week — 1-2 high-intensity sessions, 1-2 moderate. Accumulating fatigue without proper recovery eliminates progress.",
  };
}

// ─── Injury guidance ─────────────────────────────────────────────────────────

function buildInjuryGuidance(flags: JointStress[], goal: GoalType): string {
  if (flags.length === 0) return "";

  const notes: string[] = [];

  if (flags.includes("knee_dominant")) {
    notes.push("Knee limitation: Reduce depth or load on knee-dominant patterns (deep squats, lunges). Prioritize hip-dominant work (RDLs, hip thrusts, step-ups). Avoid leg press if it causes pain at end range. Monitor quad volume — don't eliminate it, just manage it.");
  }
  if (flags.includes("shoulder_dominant")) {
    notes.push("Shoulder limitation: Avoid behind-the-neck movements and high-volume overhead work until resolved. Favor neutral-grip pressing and landmine patterns. Include face pulls and rear delt work every session for balance. Reduce external rotation demand on pressing exercises.");
  }
  if (flags.includes("spine_load") || flags.includes("low_back_stress")) {
    notes.push("Spinal limitation: Avoid heavy axial loading (back squat, barbell deadlift from floor) if it causes pain. Substitute trap bar deadlift, belt squat, or machine work. Prioritize core stability work (dead bug, anti-rotation) before loading spinal patterns. Do not program Good Mornings or Barbell Rows if lower back is flaring.");
  }
  if (flags.includes("hip_stress")) {
    notes.push("Hip limitation: Avoid deep hip flexion under load and single-leg work that causes pinching. Prioritize hip thrusts, cable pull-throughs, and partial-range movements that are pain-free. Do not force full-depth squatting.");
  }
  if (flags.includes("elbow_stress")) {
    notes.push("Elbow limitation: Reduce straight-bar curl and close-grip pressing volume. Neutral grip alternatives (hammer curls, dumbbell press with neutral grip) are preferred. Avoid skull crushers if they aggravate the elbow.");
  }

  return notes.join("\n\n");
}

// ─── Goal rationale ──────────────────────────────────────────────────────────

function buildGoalRationale(goal: GoalType, experience: ExperienceTier): string {
  switch (goal) {
    case "hypertrophy":
      return experience === "beginner"
        ? "Hypertrophy at the beginner stage is best achieved through consistent compound work, full ROM, and progressive overload — not complex methods or high frequency. Keep it simple and execute well."
        : "Hypertrophy requires sufficient mechanical tension, metabolic stress, and muscle damage. This means moderate-to-high volume, varied rep ranges, and close-to-failure execution on later sets.";

    case "strength":
      return experience === "beginner"
        ? "Strength at the beginner stage comes primarily from nervous system adaptation. Focus on movement quality and linear progression — every session should be a personal best opportunity."
        : "Strength requires progressive intensity on the main compound lifts. Volume should support, not compete with, the primary lifts. CNS fatigue management is critical.";

    case "athletic_performance":
      return "Athletic performance training must develop force production, reactivity, and conditioning simultaneously. The order within sessions matters: explosive work first (when CNS is fresh), strength second, conditioning last.";

    case "fat_loss":
      return "Fat loss is driven by the energy balance created outside the gym, but training should preserve muscle mass. High-effort resistance training with shorter rest periods maximizes caloric demand while protecting lean tissue.";

    case "general_fitness":
      return "General fitness training should be sustainable, balanced across movement patterns, and progressively challenging. Complexity should increase with competence.";

    default:
      return "Program structure should reflect the primary outcome and build systematically over time.";
  }
}

// ─── Season Context Builder ───────────────────────────────────────────────────

function buildSeasonContext(profile: UserProfile): string {
  if (!profile.seasonContext) return "";

  const sport = profile.sportFocus ? `${profile.sportFocus} ` : "";
  const gameLoad = profile.gameFrequencyPerWeek
    ? `\nGame/match load: ${profile.gameFrequencyPerWeek} game(s)/match(es) per week — lower-body eccentric stress and session fatigue must be managed accordingly.`
    : "";
  const practiceLoad = profile.practiceFrequencyPerWeek
    ? `\nPractice/field load: ${profile.practiceFrequencyPerWeek} practice(s)/field session(s) per week — total weekly training stress must account for this.`
    : "";

  const phaseRules: Record<SeasonContext, string> = {
    off_season: `
SEASON PHASE: OFF-SEASON ${sport}PROGRAM
This is the highest-tolerance training phase. The athlete has no game or competition demands — this is the time to build.

Programming priorities:
- Build force production and maximum strength (highest volume and loading of the year)
- Develop tissue tolerance and structural capacity
- Improve movement quality, asymmetry, and weak links
- Broader exercise menu — more unilateral support, more accessory development
- More robust posterior chain and structural work
- Hypertrophy support is appropriate if there is a genuine structural gap

Volume/intensity guidance:
- Highest weekly set volume of any phase
- Aggressive progressive overload — load is the primary adaptation lever
- More exercises per session (6–9) when session duration allows
- More accessory and development work is appropriate
- Sessions can be longer and more demanding

Day naming convention: "Lower Force Production", "Upper Strength + Trunk", "Full Body Strength + Positional Support"
Coach note tone: "This phase emphasizes force production and structural development while there is room to tolerate higher loading and build capacity for next season."`,

    pre_season: `
SEASON PHASE: PRE-SEASON ${sport}PROGRAM
The athlete is transitioning from strength to power and readiness. Volume decreases, speed/quality of output increases.

Programming priorities:
- Convert built strength into explosive power output
- Increase sport specificity — more acceleration, deceleration, change-of-direction prep
- Maintain strength while reducing pure volume
- Increase reactive and elastic work (jumps, bounds, reactive drills)
- Remove accessory junk — every exercise must have sport transfer

Volume/intensity guidance:
- Moderate volume — down from off-season, but intensity of key lifts is maintained
- Power output emphasis on explosive work — max intent, low volume
- Fewer total exercises per session (5–7)
- Less accessory clutter — tighter, higher-quality sessions
- Session density increases — less total rest, more purposeful movement

Day naming convention: "Acceleration Support + Lower Strength", "Upper Power + Trunk Integrity", "Full Body Reactive Strength"
Coach note tone: "This phase shifts toward faster force expression, power transfer, and readiness for field demands while maintaining the strength built in the off-season."`,

    in_season: `
SEASON PHASE: IN-SEASON ${sport}PROGRAM
The athlete is competing. The gym's job is to SUPPORT performance, not create fatigue. Minimal effective dose.

Programming priorities:
- MAINTAIN strength and neural output — do not try to build during this phase
- Reduce total fatigue — soreness interferes with performance and readiness
- Preserve power expression with low-volume, high-quality work
- Avoid excessive eccentric stress in lower body (no heavy soreness before games)
- Support structural durability — tissue tolerance, trunk stiffness, hip stability

Volume/intensity guidance:
- LOWEST volume of any phase — quality over quantity
- Fewer total lifts per session (4–6 maximum)
- Maintain intensity on primary compound lifts (do not reduce load, reduce sets instead)
- Careful lower-body loading — prefer trap bar, DB, or controlled machines over high-eccentric barbell
- More isometric and low-fatigue-cost options for trunk and accessory work
- Power work: low volume, high quality (1–2 sets × 3–5 reps), maintain neural activation
- Session duration is shorter — 30–50 min max for most in-season lifts
${gameLoad}${practiceLoad}

Day naming convention: "Strength Maintenance + Lower Power", "Neural Primer + Upper", "Recovery / Durability Session"
Coach note tone: "This phase is built to maintain strength and neural output without interfering with match performance or recovery. Every exercise is here for a specific readiness or durability reason."

CRITICAL IN-SEASON RULES:
- Do NOT program high-volume leg work the day before a game
- Do NOT include heavy eccentric-dominant lower-body work that causes 48+ hours of soreness
- Do NOT try to add new volume or development work — maintain what exists
- If the user has 2+ games/week, consider reducing to 2 lift days total`,

    post_season: `
SEASON PHASE: POST-SEASON ${sport}PROGRAM
The athlete has just finished competing. Accumulated fatigue is real. This phase restores, not builds.

Programming priorities:
- Recovery and deload — allow the body to reset after a competitive season
- Restore movement quality — address restrictions, asymmetry, and accumulated tightness
- Reduce accumulated fatigue — lower intensity and volume
- Gradually rebuild strength baseline
- Address any lingering pain, restrictions, or structural issues from the season

Volume/intensity guidance:
- LOW intensity — primary lifts at 60–70% of normal working load
- Low-to-moderate volume — 3–4 sets per movement, fewer exercises
- More mobility, positional, and tissue quality work than a standard training phase
- Progressive re-entry — start light, build back over 2–4 weeks
- No heavy eccentrics, no max effort lifting in the first 2–3 weeks

Day naming convention: "Restoration + Movement Quality", "Light Strength Re-Entry", "Mobility + Tissue Work"
Coach note tone: "This phase is about restoration, not development. The goal is to reduce accumulated fatigue, restore movement quality, and rebuild a baseline before the next training phase begins."`,

    return_to_play: `
SEASON PHASE: RETURN TO PLAY ${sport}PROGRAM
The athlete is returning from injury or extended absence. Progressive loading with structural protection.

Programming priorities:
- Rebuild movement quality and neuromuscular confidence
- Restore positional control and single-leg stability before loading
- Conservative exercise progression — do not rush loading
- Protect irritated or healing structures — avoid aggravating movements
- Regain sport-specific movement capacity gradually

Volume/intensity guidance:
- Conservative loading — start at 50–60% of prior working weights
- Low volume — quality reps over quantity
- Prefer bilateral before unilateral, machines before free weights where appropriate
- Emphasize positional control, bracing, and movement mechanics over load
- More isometric work — builds tolerance without high-force eccentrics

Day naming convention: "Movement Re-Entry + Positional Strength", "Controlled Loading + Trunk Stability", "Single-Leg Rebuild + Structural Work"
Coach note tone: "This phase prioritizes rebuilding movement quality, neuromuscular confidence, and structural resilience. Loading is conservative and progressive — the goal is to regain capacity safely, not rush back to prior performance levels."`,
  };

  return `\n### SEASON PHASE RULES — MANDATORY\n${phaseRules[profile.seasonContext]}`;
}

// ─── AI Prompt Context Builder ───────────────────────────────────────────────

/**
 * The main export: generates a rich, structured training intelligence context
 * to be injected into the system prompt before sending to OpenAI.
 *
 * This is the bridge between the rules engine and the AI model.
 */
export function buildIntelligenceContext(profile: UserProfile): string {
  const spec = buildTrainingSpec(profile);
  const injurySection = spec.injuryGuidance
    ? `\n⚠️ INJURY / LIMITATION RULES:\n${spec.injuryGuidance}\nThese are non-negotiable constraints. Apply them to every exercise selection decision.`
    : "";

  const excludedExercises = profile.exercisesToAvoid
    ? `\nEXCLUDED EXERCISES (user-specified, do not program these under any circumstance):\n${profile.exercisesToAvoid}`
    : "";

  const sportContext = profile.sportFocus
    ? `\nSPORT CONTEXT: User trains for ${profile.sportFocus}.\nThis is not a generic fitness program — it is a sport performance program. Every element must serve athletic output.\n\nBias the program toward:\n- Acceleration and deceleration mechanics (horizontal and lateral force production)\n- Change of direction resilience (unilateral lower body, frontal plane loading)\n- Trunk stiffness and anti-rotation (Pallof press, Copenhagen plank, landmine rotation)\n- Posterior chain and single-leg stability (single-leg RDL, RFESS, step-up, Nordic curl where applicable)\n- Power development specific to ${profile.sportFocus} demands (jumps, bounds, med ball throws appropriate to the sport)\n\nExercise names, day names, focus notes, and coaching cues must ALL reflect ${profile.sportFocus} performance — not generic fitness language.`
    : "";

  const seasonContext = buildSeasonContext(profile);

  return `
## COMPUTED TRAINING SPECIFICATION
(Generated by the training intelligence engine from this user's profile. Follow these rules precisely.)

### GOAL INTELLIGENCE
Primary Goal: ${spec.goal.replace("_", " ").toUpperCase()}
Rationale: ${spec.goalRationale}

### SPLIT DESIGN
Recommended Split: ${spec.splitType}
Structure: ${spec.splitDescription}
Why: ${spec.splitRationale}

### VOLUME TARGETS
Target sets per muscle group per week: ${spec.setsPerMuscleGroupPerWeek.min}–${spec.setsPerMuscleGroupPerWeek.max}
Exercises per session: ${spec.exercisesPerSession.min}–${spec.exercisesPerSession.max} (session is ${spec.sessionDuration} min — ${spec.sessionDensity} density)

### PRESCRIPTION GUIDELINES
Primary compound work: ${spec.primarySets} sets × ${spec.primaryRepRange} reps | Rest: ${spec.primaryRest}
Secondary compound/accessory: ${spec.secondarySets} sets × ${spec.secondaryRepRange} reps | Rest: ${spec.secondaryRest}
Isolation/finishing work: ${spec.accessorySets} sets | Rest: ${spec.accessoryRest}

### MANDATORY SESSION STRUCTURE (A→G) — APPLIES TO EVERY DAY
Build every training day in this exact sequence — this is the non-negotiable performance architecture:
A: NEURAL / DYNAMIC PREP — purposeful prep connected to the session goal (1–3 movements, 1–2 sets, no rest). Lower body days: hip mobility + glute activation + ankle stiffness pogo series. Upper body days: scapular positioning + thoracic mobility + shoulder activation. Full body / power days: dynamic full-body prep (leg swings, inchworm+reach, hip circles). The prep primes exactly what the session will demand.
B: POWER / EXPLOSIVE — jumps, med ball throws, Olympic lift variation (3–5 sets × 3–5 reps, full rest, CNS must be completely fresh). Tie every power selection to a reason: broad jumps → horizontal force projection; lateral bound → lateral force and deceleration; med ball scoop toss → posterior chain power; snap-down drill → deceleration mechanics.
C: PRIMARY STRENGTH — squat, hinge, press, or pull (compound anchor of the session)
D: SECONDARY STRENGTH — supports or complements the primary — not just another big lift
E: UNILATERAL / POSITIONAL — at least one single-leg lower body movement per lower/full body day (RFESS, step-up, lateral lunge, single-leg RDL, lateral step-up). Used for position control, asymmetry management, and sport transfer — not just "included."
F: TRUNK / INTEGRITY — purposeful only: anti-rotation (Pallof press, half-kneeling cable chop), anti-extension (dead bug, ab wheel rollout), bracing (RKC plank, suitcase carry, Copenhagen plank, side plank). Every trunk selection must earn its place.
G: OPTIONAL TISSUE / RECOVERY FINISHER — only when there is a genuine structural gap AND session density allows. If nothing is genuinely needed, omit it.

Prep (A block) is MANDATORY on every day — connects to the session goal, never a generic checklist.
Power (B block) is MANDATORY on every day — skip only for explicit injury or in-season minimal-dose sessions.
Unilateral lower body (E block) is MANDATORY in every lower/full body day — bilateral-only programs are structurally incomplete for athletic goals.
Trunk (F block) is MANDATORY — never replace with random crunches, sit-ups, or generic "ab finishers."

### PROGRESSION MODEL
Model: ${spec.progressionModel}
Rate: ${spec.progressionRate}
Deload: ${spec.deloadFrequency}

### FATIGUE MANAGEMENT
${spec.backToBackWarning}
${spec.weeklyIntensityNotes}

### SESSION EFFICIENCY RULE
Session target: ${spec.sessionDuration} minutes
${spec.sessionDensity === "tight" ? "TIGHT SESSION: Maximum 5-6 exercises. Pair accessories as supersets if needed. No fluff." : spec.sessionDensity === "moderate" ? "MODERATE SESSION: 5-8 exercises. Efficient transitions. Include main work and meaningful accessories." : "EXTENDED SESSION: 6-10 exercises. Room for warm-up sets, accessories, and quality work without rushing."}

### QUALITY GUARDRAILS
- Do not repeat the same exercise twice in a session
- Do not place two heavy lower-body compound movements consecutively without a reason
- Do not give beginners more than 16 working sets per session
- Do not program explosive/power work at the end of a session
- Do not exceed realistic exercise count for the session duration
- Do not ignore any injury flag in the user's profile
- Do NOT explain structural decisions in chat — the program panel is the output
${seasonContext}${injurySection}${excludedExercises}${sportContext}
`.trim();
}

// ─── DB-Backed Exercise Library Context ──────────────────────────────────────
// Augments the AI system prompt with a structured exercise list from the DB.
// Use this instead of the hardcoded EXERCISE_LIBRARY for AI prompt injection.

/**
 * Builds a rich exercise library context from the DB for AI program generation.
 * Called asynchronously before building AI prompts.
 *
 * Returns formatted text to be appended to buildIntelligenceContext output.
 */
export async function buildDBExerciseContext(profile: UserProfile): Promise<string> {
  try {
    const { buildExerciseContext } = await import("./exercise-service");
    const spec = buildTrainingSpec(profile);
    const equipment = spec.equipment;

    // Map training patterns to DB movement patterns
    const patterns = [
      "squat", "hinge", "push_horizontal", "push_vertical",
      "pull_horizontal", "pull_vertical", "core", "carry",
      // power_explosive is included for ALL goals — every session starts with power
      "power_explosive",
      // iso_legs always included for unilateral lower body access
      "iso_legs",
    ];

    // Add iso patterns for hypertrophy
    if (spec.goal === "hypertrophy" || spec.goal === "general_fitness") {
      patterns.push("iso_chest", "iso_shoulders", "iso_arms");
    }

    // Add conditioning for fat loss / athletic
    if (spec.goal === "fat_loss" || spec.goal === "athletic_performance") {
      patterns.push("conditioning");
    }

    const context = await buildExerciseContext({
      patterns,
      equipmentLevel: equipment,
      injuryFlags: spec.injuryFlags,
      difficultyMax: spec.experience,
      intentTags: [spec.goal],
      perPatternMax: 10,
    });

    return `\n### EXERCISE LIBRARY\n${context}\n\nIMPORTANT: When selecting exercises, use ONLY names from the EXERCISE LIBRARY above. These are verified exercise names. Do not invent or modify names.`;
  } catch (err) {
    // If DB is unavailable, fall back gracefully (no crash)
    return "";
  }
}

// ─── Scaffold hooks for Phase 4 ──────────────────────────────────────────────
// These are intentionally minimal now — type-safe scaffolding for future layers.

export interface ReadinessInput {
  sleepQuality?: 1 | 2 | 3 | 4 | 5;
  energyLevel?: 1 | 2 | 3 | 4 | 5;
  stressLevel?: 1 | 2 | 3 | 4 | 5;
  sorenessAreas?: string[];
}

export interface PriorSessionFeedback {
  sessionId: number;
  felt: "too_easy" | "appropriate" | "too_hard" | "unable_to_complete";
  painNotes?: string;
  completedSets?: number;
  totalSets?: number;
}

export interface ProgressionMemory {
  userId: number;
  exerciseName: string;
  lastWeight?: number;
  lastReps?: number;
  lastSets?: number;
  sessionsCompleted: number;
  trendDirection: "improving" | "plateau" | "regressing";
}

/**
 * Phase 4 hook: modulate program intensity based on daily readiness.
 * Not yet implemented — returns input spec unchanged.
 */
export function applyReadinessModulation(
  spec: TrainingSpec,
  _readiness: ReadinessInput
): TrainingSpec {
  // TODO Phase 4: reduce volume/intensity when readiness is low
  return spec;
}

/**
 * Phase 4 hook: update progression based on prior session feedback.
 * Not yet implemented.
 */
export function processSessionFeedback(
  _feedback: PriorSessionFeedback
): void {
  // TODO Phase 4: store feedback and adjust load recommendations
}
