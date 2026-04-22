import { db } from "@workspace/db";
import {
  trainingSystems,
  trainingPhases,
  trainingWeeks,
  trainingSessions,
  sessionExercises,
  userProfilesTable,
  sessionLogsTable,
  activeSessionsTable,
} from "@workspace/db";
import { eq, and, desc, gte } from "drizzle-orm";
import type { UserProfile } from "@workspace/db";
import {
  selectSessionExercises,
  type SessionType,
  type GoalType as CoachGoalType,
  type ExperienceTier as CoachExperienceTier,
  type EquipmentLevel as CoachEquipmentLevel,
} from "./coach-select";
import { detectInjuryFlags, normalizeExperience } from "./training-intelligence";
import { logger } from "./logger";
import {
  selectStrengthVariantFromLibrary,
  auditExerciseVariantSelection,
} from "./strength-week-expression";

// ─── Types ───────────────────────────────────────────────────────────────────

export type ExerciseCategory =
  | "warmup"
  | "activation"
  | "power"
  | "primary"
  | "secondary"
  | "accessory"
  | "trunk"
  | "conditioning"
  | "recovery"
  | "finisher";

export interface ExerciseTemplate {
  name: string;
  category: ExerciseCategory;
  sets: number;
  reps: string;
  rest: string;
  tempo?: string;
  notes?: string;
}

// Canonical training-flow order — lower index = appears earlier in session
export const CATEGORY_ORDER: Record<ExerciseCategory, number> = {
  warmup:      0,
  activation:  1,
  power:       2,
  primary:     3,
  secondary:   4,
  accessory:   5,
  trunk:       6,
  conditioning: 7,
  recovery:    8,
  finisher:    9,
};

export interface SessionTemplate {
  label: string;
  sessionType: "lifting" | "conditioning" | "mobility" | "recovery" | "sport" | "rest";
  emphasis: string;
  dayOfWeek: number;
  warmupNotes: string;
  coachingNotes: string;
  exercises: ExerciseTemplate[];
}

// ─── Goal / Style Normalizers ────────────────────────────────────────────────

function normalizeGoal(goal: string): string {
  const lower = goal.toLowerCase();
  if (lower.includes("strength") || lower.includes("strong")) return "strength";
  if (lower.includes("muscle") || lower.includes("hypertrophy") || lower.includes("size")) return "hypertrophy";
  if (lower.includes("fat") || lower.includes("weight") || lower.includes("lean")) return "fat_loss";
  if (lower.includes("athletic") || lower.includes("sport") || lower.includes("performance")) return "athletic";
  if (lower.includes("endur") || lower.includes("cardio") || lower.includes("conditioning")) return "endurance";
  return "general_fitness";
}

function normalizeEquipment(equipment: string): string {
  const lower = equipment.toLowerCase();
  // IMPORTANT: Check "home gym" BEFORE generic "gym" — "home gym" must never map to full_gym.
  // A home gym has dumbbells, bands, bodyweight — NOT barbells, pull-up bars, plyo boxes, cables, or machines.
  if (lower.includes("home gym") || lower.includes("home-gym")) return "home_limited";
  if (lower.includes("home") && (lower.includes("dumbbell") || lower.includes("band") || lower.includes("limited") || lower.includes("only"))) return "home_limited";
  if (lower.includes("home") && !lower.includes("full") && !lower.includes("barbell")) return "home_limited";
  if (lower.includes("full") || lower.includes("commercial") || lower.includes("barbell")) return "full_gym";
  // "gym" alone (without "home") means a real gym
  if (lower.includes("gym") && !lower.includes("home")) return "full_gym";
  if (lower.includes("dumbbell")) return "dumbbells";
  if (lower.includes("body") || lower.includes("calisthenics") || lower.includes("no equipment")) return "bodyweight";
  if (lower.includes("minimal") || lower.includes("resistance")) return "minimal";
  return "full_gym";
}


// ─── Session Template Builder ────────────────────────────────────────────────

const dayNames = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

const splitMaps: Record<number, { label: string; sessionType: "lifting" | "conditioning" | "mobility" | "recovery" | "rest"; coachSessionType: SessionType; emphasis: string; dayOfWeek: number }[]> = {
  2: [
    { label: "Full Body A", sessionType: "lifting", coachSessionType: "full_body_a", emphasis: "Squat, horizontal push, horizontal pull", dayOfWeek: 1 },
    { label: "Full Body B", sessionType: "lifting", coachSessionType: "full_body_b", emphasis: "Hinge, vertical pull, vertical push", dayOfWeek: 4 },
  ],
  3: [
    { label: "Lower Body", sessionType: "lifting", coachSessionType: "lower_a", emphasis: "Squat & hinge patterns — full posterior chain", dayOfWeek: 1 },
    { label: "Upper Push", sessionType: "lifting", coachSessionType: "upper_a", emphasis: "Horizontal & vertical press with shoulder stability", dayOfWeek: 3 },
    { label: "Upper Pull", sessionType: "lifting", coachSessionType: "upper_b", emphasis: "Vertical & horizontal pull, arm accessory", dayOfWeek: 5 },
  ],
  4: [
    { label: "Lower A — Squat Focus", sessionType: "lifting", coachSessionType: "lower_a", emphasis: "Quad-dominant squat patterns, hinge accessory", dayOfWeek: 1 },
    { label: "Upper A — Push", sessionType: "lifting", coachSessionType: "upper_a", emphasis: "Horizontal & vertical press, shoulder stability", dayOfWeek: 2 },
    { label: "Lower B — Hinge Focus", sessionType: "lifting", coachSessionType: "lower_b", emphasis: "Hinge-dominant, posterior chain, unilateral legs", dayOfWeek: 4 },
    { label: "Upper B — Pull", sessionType: "lifting", coachSessionType: "upper_b", emphasis: "Vertical & horizontal pull, arm accessory", dayOfWeek: 5 },
  ],
  5: [
    { label: "Lower A — Squat Focus", sessionType: "lifting", coachSessionType: "lower_a", emphasis: "Quad-dominant movements", dayOfWeek: 1 },
    { label: "Upper A — Push", sessionType: "lifting", coachSessionType: "upper_a", emphasis: "Horizontal & vertical press", dayOfWeek: 2 },
    { label: "Lower B — Hinge Focus", sessionType: "lifting", coachSessionType: "lower_b", emphasis: "Posterior chain & hinge patterns", dayOfWeek: 3 },
    { label: "Upper B — Pull", sessionType: "lifting", coachSessionType: "upper_b", emphasis: "Rows, pull-ups, and arm work", dayOfWeek: 4 },
    { label: "Full Body Power / Conditioning", sessionType: "lifting", coachSessionType: "conditioning", emphasis: "Power, speed, and work capacity", dayOfWeek: 6 },
  ],
  6: [
    { label: "Push A", sessionType: "lifting", coachSessionType: "push", emphasis: "Chest, front delts, triceps", dayOfWeek: 1 },
    { label: "Pull A", sessionType: "lifting", coachSessionType: "pull", emphasis: "Back, rear delts, biceps", dayOfWeek: 2 },
    { label: "Legs A", sessionType: "lifting", coachSessionType: "lower_a", emphasis: "Squat-dominant lower body", dayOfWeek: 3 },
    { label: "Push B", sessionType: "lifting", coachSessionType: "push", emphasis: "Incline, overhead, triceps", dayOfWeek: 4 },
    { label: "Pull B", sessionType: "lifting", coachSessionType: "pull", emphasis: "Deadlift, rows, biceps", dayOfWeek: 5 },
    { label: "Legs B", sessionType: "lifting", coachSessionType: "lower_b", emphasis: "Hinge-dominant lower body", dayOfWeek: 6 },
  ],
};

function buildPhaseConfig(goal: string, daysPerWeek: number): {
  phaseName: string;
  phaseGoal: string;
  emphasis: string;
  weekConfigs: { label: string; focus: string; volumeLevel: "low" | "moderate" | "high" | "deload" }[];
} {
  const configs: Record<string, { phaseName: string; phaseGoal: string; emphasis: string; weekConfigs: { label: string; focus: string; volumeLevel: "low" | "moderate" | "high" | "deload" }[] }> = {
    strength: {
      phaseName: "Strength Block",
      phaseGoal: "Build foundational strength across primary movement patterns with real week-to-week progression",
      emphasis: "Compound bilateral lifts, progressive overload arc (Establish → Build → Intensify → Deload), bar speed and technical quality.",
      weekConfigs: [
        { label: "Week 1 — Establish", focus: "Find baseline loads, establish positions, technique priority over load", volumeLevel: "moderate" },
        { label: "Week 2 — Build", focus: "Add 2.5–5% to primary lifts, fuller accessory volume, controlled effort", volumeLevel: "moderate" },
        { label: "Week 3 — Intensify", focus: "Highest neural demand — peak primary loading, 1-2 RIR top sets, biggest week", volumeLevel: "high" },
        { label: "Week 4 — Deload", focus: "Active recovery — 60% load, flush fatigue, protect CNS for next block", volumeLevel: "deload" },
      ],
    },
    hypertrophy: {
      phaseName: "Hypertrophy Accumulation Block",
      phaseGoal: "Maximize muscle growth through volume and metabolic stress",
      emphasis: "High volume, moderate intensity. Prioritize mind-muscle connection and range of motion.",
      weekConfigs: [
        { label: "Week 1 — Base Volume", focus: "Establish training volume and movement quality", volumeLevel: "moderate" },
        { label: "Week 2 — Volume Build", focus: "Add sets and intensification techniques", volumeLevel: "moderate" },
        { label: "Week 3 — Peak Volume", focus: "Maximum training stimulus before deload", volumeLevel: "high" },
        { label: "Week 4 — Deload", focus: "Recover and consolidate muscle adaptations", volumeLevel: "deload" },
      ],
    },
    fat_loss: {
      phaseName: "Fat Loss & Conditioning Block",
      phaseGoal: "Maintain lean muscle while creating a training-driven caloric deficit",
      emphasis: "Higher rep ranges, shorter rest periods, superset-friendly structure.",
      weekConfigs: [
        { label: "Week 1 — Adaptation", focus: "Build work capacity and movement patterns", volumeLevel: "moderate" },
        { label: "Week 2 — Progression", focus: "Increase density and intensity", volumeLevel: "high" },
        { label: "Week 3 — Peak Intensity", focus: "Maximum conditioning stimulus", volumeLevel: "high" },
        { label: "Week 4 — Active Recovery", focus: "Lower intensity, maintain movement quality", volumeLevel: "low" },
      ],
    },
    athletic: {
      phaseName: "Athletic Foundation Block",
      phaseGoal: "Build power, speed, and multi-directional athleticism",
      emphasis: "Explosive movements, sport-specific patterns, power development.",
      weekConfigs: [
        { label: "Week 1 — Technical Foundation", focus: "Movement quality and power mechanics", volumeLevel: "moderate" },
        { label: "Week 2 — Power Build", focus: "Increase explosive loading", volumeLevel: "moderate" },
        { label: "Week 3 — Power Peak", focus: "Peak power output and speed", volumeLevel: "high" },
        { label: "Week 4 — Taper", focus: "Maintain sharpness, reduce fatigue", volumeLevel: "low" },
      ],
    },
    endurance: {
      phaseName: "Aerobic Base Block",
      phaseGoal: "Build aerobic capacity and work capacity across energy systems",
      emphasis: "Zone 2 work, tempo efforts, and supporting strength work.",
      weekConfigs: [
        { label: "Week 1 — Aerobic Introduction", focus: "Establish aerobic base", volumeLevel: "moderate" },
        { label: "Week 2 — Volume Build", focus: "Extend training duration and frequency", volumeLevel: "moderate" },
        { label: "Week 3 — Intensification", focus: "Add tempo work and threshold efforts", volumeLevel: "high" },
        { label: "Week 4 — Recovery", focus: "Reduce load, consolidate aerobic adaptations", volumeLevel: "low" },
      ],
    },
    general_fitness: {
      phaseName: "General Fitness Foundation Block",
      phaseGoal: "Build all-around fitness, movement quality, and consistent training habits",
      emphasis: "Balanced strength, conditioning, and mobility work.",
      weekConfigs: [
        { label: "Week 1 — Foundation", focus: "Establish movement patterns and baseline fitness", volumeLevel: "moderate" },
        { label: "Week 2 — Progression", focus: "Build work capacity and confidence", volumeLevel: "moderate" },
        { label: "Week 3 — Accumulation", focus: "Peak training volume for the block", volumeLevel: "high" },
        { label: "Week 4 — Deload", focus: "Active recovery and consolidation", volumeLevel: "deload" },
      ],
    },
    speed: {
      phaseName: "Speed Foundation Block",
      phaseGoal: "Develop acceleration mechanics, reactive footwork, and elastic output",
      emphasis: "Sprint mechanics, CNS-first sequencing, plyometric foundation, deceleration control.",
      weekConfigs: [
        { label: "Week 1 — Mechanics", focus: "Establish sprint mechanics and CNS activation protocols at sub-maximal intent", volumeLevel: "moderate" },
        { label: "Week 2 — Volume Build", focus: "Add sprint volume, introduce reactive and change-of-direction work", volumeLevel: "moderate" },
        { label: "Week 3 — Full Intent", focus: "Full-intent sprints, reactive integration, elastic output", volumeLevel: "high" },
        { label: "Week 4 — Deload", focus: "50% sprint volume, mechanics review, no max intent", volumeLevel: "deload" },
      ],
    },
    mobility: {
      phaseName: "Mobility Foundation Block",
      phaseGoal: "Restore and build usable range of motion across all primary joints",
      emphasis: "Joint mobility, motor control, tissue tolerance, and progressive range of motion loading.",
      weekConfigs: [
        { label: "Week 1 — Assess & Establish", focus: "Identify restrictions and establish baseline range of motion", volumeLevel: "moderate" },
        { label: "Week 2 — Progressive Loading", focus: "Increase intensity and hold durations across key patterns", volumeLevel: "moderate" },
        { label: "Week 3 — Integration", focus: "Functional integration of mobility under load and movement", volumeLevel: "high" },
        { label: "Week 4 — Consolidate", focus: "Maintain gains, reduce intensity, prime next block", volumeLevel: "low" },
      ],
    },
  };

  return configs[goal] ?? configs.general_fitness;
}

function getSystemName(goal: string, style: string, equipment?: string): string {
  const goalLabel: Record<string, string> = {
    strength: "Strength",
    hypertrophy: "Hypertrophy",
    fat_loss: "Fat Loss",
    athletic: "Athletic Performance",
    endurance: "Endurance",
    general_fitness: "General Fitness",
  };
  const goalName = goalLabel[goal] ?? "Training";
  const isHomeGym = equipment === "home_limited" || equipment === "minimal" || equipment === "dumbbells";
  if (isHomeGym) {
    return `Home Gym ${goalName} System`;
  }
  return `${goalName} System`;
}

function getWarmupNotes(sessionType: string, emphasis: string): string {
  if (sessionType === "rest") return "";
  const e = emphasis.toLowerCase();

  // Power / explosive / reactive / speed sessions
  if (
    e.includes("power") || e.includes("explos") || e.includes("plyometric") ||
    e.includes("acceleration") || e.includes("reactive") || e.includes("speed") ||
    e.includes("jump") || e.includes("sprint")
  ) {
    return "10 min: pogo jumps × 20, A-skips 2 × 20m, snap-downs × 5, hip circles × 10 each, ankle circles × 15, dynamic hip CARs × 5 each";
  }

  // Full body / integration / total body
  if (e.includes("full body") || e.includes("integration") || e.includes("total body") || e.includes("full-body")) {
    return "8 min: inchworms × 5, hip circles × 10, arm swings × 10, glute bridge × 12, pogo hops × 20, band pull-apart × 10";
  }

  // Lower body force / squat / deadlift / hip / leg
  if (
    e.includes("lower") || e.includes("leg") || e.includes("squat") ||
    e.includes("force production") || e.includes("hip") || e.includes("deadlift") ||
    e.includes("hinge") || e.includes("glute")
  ) {
    return "8 min: leg swings × 10 each, hip circles × 10, inchworms × 5, glute bridge × 12, lateral band walk × 10 each direction, bodyweight squat × 10";
  }

  // Upper body — push / press / chest / shoulder
  if (
    e.includes("upper") || e.includes("push") || e.includes("press") ||
    e.includes("chest") || e.includes("shoulder") || e.includes("structural balance") ||
    e.includes("bench")
  ) {
    return "6 min: band pull-apart × 15, wall slides × 10, shoulder CARs × 5 each, push-up plus × 10, scapular pull × 10";
  }

  // Pull / row / back / scap
  if (e.includes("pull") || e.includes("row") || e.includes("back") || e.includes("scap") || e.includes("lat")) {
    return "6 min: thoracic rotation × 10 each, band pull-apart × 15, dead hang × 20 sec, face pull × 15, arm circles × 10";
  }

  // Trunk / core / stability / integrity
  if (e.includes("trunk") || e.includes("core") || e.includes("stability") || e.includes("integrity")) {
    return "5 min: dead bug × 5 each side, cat-cow × 10, bird dog × 10 each, 90-90 breathing × 5 breaths, hip flexor stretch × 30 sec each";
  }

  // Conditioning / metabolic / circuit
  if (e.includes("condition") || e.includes("metabolic") || e.includes("circuit") || e.includes("finisher") || e.includes("endurance")) {
    return "5 min: light jog in place × 90 sec, leg swings × 10 each, arm circles × 10, high knees × 20m, dynamic lateral shuffle × 20m";
  }

  // Generic fallback
  return "5 min: dynamic stretching, joint circles, activation movements — tailor to today's session focus";
}

function getCoachingNotes(goal: string, weekIndex: number, dayLabel: string): string {
  if (goal === "strength") {
    const label = dayLabel.toLowerCase();
    const isUpperSession = label.includes("upper") || label.includes("press") || label.includes("pull");
    const isLowerSession = label.includes("lower") || label.includes("squat") || label.includes("hinge") || label.includes("leg") || label.includes("posterior");
    const isPowerSession = label.includes("power") || label.includes("explosive") || label.includes("full body");

    if (weekIndex === 0) { // Establish
      if (isUpperSession) return "W1 Establish — Find your working loads for the upper body compounds. Technique before load. Log every set — this data drives the rest of the block.";
      if (isLowerSession) return "W1 Establish — Establish your squat and hinge positions. Submaximal loading (RPE 6-7). The load will come. Positions first.";
      if (isPowerSession) return "W1 Establish — Sub-maximal power output. Focus on positions and intent. Learn the pattern, not the load.";
      return "W1 Establish — Learn the session structure. Log your loads for every working set — this is your baseline for the block.";
    }
    if (weekIndex === 1) { // Build
      if (isUpperSession) return "W2 Build — Add 2.5–5% to upper body compounds from Week 1. Maintain bar speed and technical control. 2-3 RIR on working sets.";
      if (isLowerSession) return "W2 Build — Increase primary lift loads 2.5–5% from W1. Fuller accessory volume this week. Keep quality high on the unilateral work.";
      if (isPowerSession) return "W2 Build — Push power output with controlled aggression. More intent than W1 — same quality.";
      return "W2 Build — Progressive overload begins here. Add weight where you can, maintain quality where you can't. Log everything.";
    }
    if (weekIndex === 2) { // Intensify
      if (isUpperSession) return "W3 Intensify — Heaviest upper body week of the block. Work to 1-2 RIR on primaries. Bar speed matters more than weight on the bar.";
      if (isLowerSession) return "W3 Intensify — Peak lower body loading. Highest neural demand. Warm up longer, rest fully. 1-2 RIR on squats and hinges.";
      if (isPowerSession) return "W3 Intensify — Maximum intent on power work. Full rest between sets. Express what the block has built.";
      return "W3 Intensify — Biggest training stimulus of the block. Work to near-failure on primaries. Record your top sets.";
    }
    if (weekIndex === 3) { // Deload
      return "W4 Deload — Drop loads to 60-65% of Week 3. Move well, flush fatigue, protect the CNS. The goal is restoration, not stimulus.";
    }
    return "Log your weights for every set. Progressive overload is the primary driver — even adding 2.5kg to a main lift is a win.";
  }
  if (goal === "hypertrophy") {
    return `Leave 1-2 reps in reserve (RIR) on working sets. Slow eccentrics (2-3s down) will increase time under tension.`;
  }
  if (goal === "fat_loss") {
    return `Rest periods are part of the stimulus — keep them tight. Aim for controlled breathing and consistent pace.`;
  }
  if (goal === "athletic") {
    return `Quality over quantity on power work. CNS fatigue is real — rest fully between explosive efforts.`;
  }
  return `Focus on execution quality. Record any weights used so you can track progress week-to-week.`;
}

// ─── Main Service Functions ───────────────────────────────────────────────────

export async function getActiveTrainingSystem(userId: number, focusMode?: string | null) {
  // Order by id desc so the most recently created system comes first.
  // This ensures the no-focusMode fallback returns the newest system,
  // and when multiple systems share a focusMode (shouldn't happen, but can),
  // we get the most recent one.
  const activeSystems = await db
    .select()
    .from(trainingSystems)
    .where(and(eq(trainingSystems.userId, userId), eq(trainingSystems.status, "active")))
    .orderBy(desc(trainingSystems.id));

  if (!focusMode) {
    return activeSystems[0] ?? null;
  }

  const focusMatch = activeSystems.find(
    (s) => ((s.metadata as any)?.focusMode ?? "strength") === focusMode
  );
  return focusMatch ?? null;
}

export async function getAllActiveSystemsByFocus(userId: number): Promise<{
  strength: typeof trainingSystems.$inferSelect | null;
  speed: typeof trainingSystems.$inferSelect | null;
  mobility: typeof trainingSystems.$inferSelect | null;
}> {
  const activeSystems = await db
    .select()
    .from(trainingSystems)
    .where(and(eq(trainingSystems.userId, userId), eq(trainingSystems.status, "active")));

  const result = { strength: null as any, speed: null as any, mobility: null as any };
  for (const s of activeSystems) {
    const fm = ((s.metadata as any)?.focusMode ?? "strength") as string;
    if (fm === "strength") result.strength = s;
    else if (fm === "speed") result.speed = s;
    else if (fm === "mobility") result.mobility = s;
  }
  return result;
}

export async function getFullTrainingSystem(systemId: number) {
  const [system] = await db
    .select()
    .from(trainingSystems)
    .where(eq(trainingSystems.id, systemId));

  if (!system) return null;

  const phases = await db
    .select()
    .from(trainingPhases)
    .where(eq(trainingPhases.trainingSystemId, systemId))
    .orderBy(trainingPhases.orderIndex);

  const phasesWithContent = await Promise.all(
    phases.map(async (phase) => {
      const weeks = await db
        .select()
        .from(trainingWeeks)
        .where(eq(trainingWeeks.trainingPhaseId, phase.id))
        .orderBy(trainingWeeks.orderIndex);

      const weeksWithContent = await Promise.all(
        weeks.map(async (week) => {
          const sessions = await db
            .select()
            .from(trainingSessions)
            .where(eq(trainingSessions.trainingWeekId, week.id))
            .orderBy(trainingSessions.orderIndex);

          const sessionsWithExercises = await Promise.all(
            sessions.map(async (session) => {
              const exercises = await db
                .select()
                .from(sessionExercises)
                .where(eq(sessionExercises.trainingSessionId, session.id))
                .orderBy(sessionExercises.orderIndex);
              return { ...session, exercises };
            })
          );

          return { ...week, sessions: sessionsWithExercises };
        })
      );

      return { ...phase, weeks: weeksWithContent };
    })
  );

  return { ...system, phases: phasesWithContent };
}

/**
 * Converts a full training system (DB-backed hierarchical structure) into a flat
 * ProgramStructure suitable for AI context injection via generateAIResponse.
 *
 * Source-of-truth rule: when a DB-backed active system exists in refine/edit mode,
 * the AI must reason from DB state — not from stale conversation-history JSON.
 *
 * Algorithm:
 *   1. Find the current/active phase (status === "current"), else first phase.
 *   2. Find the current week within that phase, else first week.
 *   3. Map each session in that week → ProgramDay.
 *   4. Map each exercise in each session → Exercise.
 *
 * Falls back gracefully (returns null) if the system has no usable sessions.
 */
export function dbSystemToProgramStructure(
  fullSystem: NonNullable<Awaited<ReturnType<typeof getFullTrainingSystem>>>
): { programName: string; description: string; splitType?: string; progressionStrategy?: string; days: Array<{ dayNumber: number; name: string; focus?: string; notes?: string; exercises: Array<{ name: string; sets: number; reps: string; rest: string; classification?: string; intent?: string; notes?: string }> }> } | null {
  const phases = fullSystem.phases ?? [];
  if (phases.length === 0) return null;

  const activePhase =
    phases.find((p) => p.status === "current") ?? phases[0];

  const weeks = activePhase.weeks ?? [];
  if (weeks.length === 0) return null;

  const activeWeek =
    weeks.find((w) => w.status === "current") ?? weeks[0];

  const sessions = activeWeek.sessions ?? [];
  if (sessions.length === 0) return null;

  const days = sessions.map((session, idx) => {
    const dayNumber = typeof session.dayOfWeek === "number" ? session.dayOfWeek + 1 : idx + 1;
    const dayName = session.label ?? `Day ${dayNumber}`;
    const focus = session.emphasis ?? session.sessionType ?? undefined;
    const notes = [session.warmupNotes, session.coachingNotes].filter(Boolean).join(" | ") || undefined;

    const exercises = (session.exercises ?? []).map((ex) => ({
      name: ex.name,
      sets: ex.sets ?? 3,
      reps: ex.reps ?? "8",
      rest: ex.rest ?? "60s",
      classification: ex.category ?? undefined,
      intent: ex.notes ?? undefined,
      notes: ex.tempo ? `tempo: ${ex.tempo}` : undefined,
    }));

    return { dayNumber, name: dayName, focus, notes, exercises };
  });

  return {
    programName: fullSystem.name,
    description: [fullSystem.overarchingGoal, fullSystem.constraints].filter(Boolean).join(" — ") || "Training program",
    splitType: fullSystem.trainingStyle ?? undefined,
    progressionStrategy: `Phase: ${activePhase.name} | Week ${activeWeek.weekNumber}`,
    days,
  };
}

export async function getTodaySession(userId: number, focusMode?: string | null) {
  const system = await getActiveTrainingSystem(userId, focusMode);
  if (!system || !system.currentPhaseId) return null;

  const [currentPhase] = await db
    .select()
    .from(trainingPhases)
    .where(and(eq(trainingPhases.id, system.currentPhaseId), eq(trainingPhases.status, "current")));

  if (!currentPhase) return null;

  const [currentWeek] = await db
    .select()
    .from(trainingWeeks)
    .where(and(eq(trainingWeeks.trainingPhaseId, currentPhase.id), eq(trainingWeeks.status, "current")));

  if (!currentWeek) return null;

  const dayOfWeek = new Date().getDay();
  const todayStr = new Date().toISOString().slice(0, 10);
  const resolvedFocus = (focusMode === "strength" || focusMode === "speed" || focusMode === "mobility")
    ? focusMode
    : "strength";

  const sessions = await db
    .select()
    .from(trainingSessions)
    .where(eq(trainingSessions.trainingWeekId, currentWeek.id))
    .orderBy(trainingSessions.orderIndex);

  const todaySession = sessions.find((s) => s.dayOfWeek === dayOfWeek) ?? sessions[0] ?? null;

  if (!todaySession) return null;

  // ── Check if today's session is already completed in active_sessions ────────
  const [completedRow] = await db
    .select()
    .from(activeSessionsTable)
    .where(
      and(
        eq(activeSessionsTable.userId, userId),
        eq(activeSessionsTable.sessionDate, todayStr),
        eq(activeSessionsTable.focusMode, resolvedFocus),
        eq(activeSessionsTable.status, "completed"),
      )
    )
    .limit(1);

  let targetSession = todaySession;
  let isAdvancedFromCompleted = false;
  let isWeekComplete = false;
  let nextWeekNumber: number | null = null;
  let nextWeekLabel: string | null = null;

  if (completedRow) {
    // ── Today's session is done — advance to next actionable session in this week
    const nextSession = sessions.find((s) => s.orderIndex > todaySession.orderIndex) ?? null;

    if (nextSession) {
      targetSession = nextSession;
      isAdvancedFromCompleted = true;

      console.log("[TodayAdvanceAudit]", JSON.stringify({
        focusMode: resolvedFocus,
        completedSessionId: todaySession.id,
        completedSessionLabel: todaySession.label,
        completedDayNumber: todaySession.orderIndex,
        previousTodaySessionId: todaySession.id,
        nextTodaySessionId: nextSession.id,
        nextTodaySessionLabel: nextSession.label,
        nextTodayWeekNumber: currentWeek.weekNumber,
        nextTodayStatus: "not_started",
        advancedSuccessfully: true,
      }));
    } else {
      // ── No more sessions this week — find the next week info ─────────────────
      isWeekComplete = true;

      const allWeeks = await db
        .select()
        .from(trainingWeeks)
        .where(eq(trainingWeeks.trainingPhaseId, currentPhase.id))
        .orderBy(trainingWeeks.orderIndex);

      const currentWeekIdx = allWeeks.findIndex((w) => w.id === currentWeek.id);
      const nextWeek = currentWeekIdx >= 0 ? (allWeeks[currentWeekIdx + 1] ?? null) : null;

      nextWeekNumber = nextWeek?.weekNumber ?? null;
      nextWeekLabel = nextWeek?.label ?? null;

      console.log("[TodayAdvanceAudit]", JSON.stringify({
        focusMode: resolvedFocus,
        completedSessionId: todaySession.id,
        completedDayNumber: todaySession.orderIndex,
        previousTodaySessionId: todaySession.id,
        nextTodaySessionId: null,
        nextTodayWeekNumber: nextWeekNumber,
        nextTodayStatus: "week_complete",
        advancedSuccessfully: false,
        isWeekComplete: true,
      }));

      const exercises = await db
        .select()
        .from(sessionExercises)
        .where(eq(sessionExercises.trainingSessionId, todaySession.id))
        .orderBy(sessionExercises.orderIndex);

      console.log("[TodayResolverAudit]", JSON.stringify({
        focusMode: resolvedFocus,
        displayedSessionId: todaySession.id,
        displayedStatus: "week_complete",
        sourceRule: "week_complete_after_final_session",
        nextWeekNumber,
      }));

      return {
        ...todaySession,
        exercises,
        currentWeek,
        currentPhase,
        isAdvancedFromCompleted: false,
        isWeekComplete: true,
        nextWeekNumber,
        nextWeekLabel,
      };
    }
  }

  const exercises = await db
    .select()
    .from(sessionExercises)
    .where(eq(sessionExercises.trainingSessionId, targetSession.id))
    .orderBy(sessionExercises.orderIndex);

  console.log("[TodayResolverAudit]", JSON.stringify({
    focusMode: resolvedFocus,
    displayedSessionId: targetSession.id,
    displayedStatus: isAdvancedFromCompleted ? "next_after_completion" : (completedRow ? "completed" : "not_started"),
    sourceRule: isAdvancedFromCompleted
      ? "advanced_from_completed"
      : sessions.find((s) => s.dayOfWeek === dayOfWeek)
        ? "day_of_week_match"
        : "first_session_fallback",
  }));

  return {
    ...targetSession,
    exercises,
    currentWeek,
    currentPhase,
    isAdvancedFromCompleted,
    isWeekComplete: false,
    nextWeekNumber: null,
    nextWeekLabel: null,
  };
}

export async function getCurrentWeek(userId: number, weekNumber?: number, focusMode?: string | null) {
  const system = await getActiveTrainingSystem(userId, focusMode);
  if (!system || !system.currentPhaseId) return null;

  const [currentPhase] = await db
    .select()
    .from(trainingPhases)
    .where(and(eq(trainingPhases.id, system.currentPhaseId), eq(trainingPhases.status, "current")));

  if (!currentPhase) return null;

  let targetWeek;
  if (weekNumber != null) {
    const allWeeks = await db
      .select()
      .from(trainingWeeks)
      .where(eq(trainingWeeks.trainingPhaseId, currentPhase.id))
      .orderBy(trainingWeeks.orderIndex);
    targetWeek = allWeeks.find((w) => w.weekNumber === weekNumber) ?? allWeeks[0];
  } else {
    const [currentWeek] = await db
      .select()
      .from(trainingWeeks)
      .where(and(eq(trainingWeeks.trainingPhaseId, currentPhase.id), eq(trainingWeeks.status, "current")));
    targetWeek = currentWeek;
  }

  if (!targetWeek) return null;

  const sessions = await db
    .select()
    .from(trainingSessions)
    .where(eq(trainingSessions.trainingWeekId, targetWeek.id))
    .orderBy(trainingSessions.orderIndex);

  const sessionsWithExercises = await Promise.all(
    sessions.map(async (session) => {
      const exercises = await db
        .select()
        .from(sessionExercises)
        .where(eq(sessionExercises.trainingSessionId, session.id))
        .orderBy(sessionExercises.orderIndex);
      return { ...session, exercises };
    })
  );

  return { ...targetWeek, sessions: sessionsWithExercises, phase: currentPhase };
}

export async function getWeeksList(userId: number, focusMode?: string | null) {
  const system = await getActiveTrainingSystem(userId, focusMode);
  if (!system || !system.currentPhaseId) return null;

  const [currentPhase] = await db
    .select()
    .from(trainingPhases)
    .where(and(eq(trainingPhases.id, system.currentPhaseId), eq(trainingPhases.status, "current")));

  if (!currentPhase) return null;

  const allWeeks = await db
    .select()
    .from(trainingWeeks)
    .where(eq(trainingWeeks.trainingPhaseId, currentPhase.id))
    .orderBy(trainingWeeks.orderIndex);

  const weeksWithSessionCounts = await Promise.all(
    allWeeks.map(async (week) => {
      const sessions = await db
        .select()
        .from(trainingSessions)
        .where(eq(trainingSessions.trainingWeekId, week.id))
        .orderBy(trainingSessions.orderIndex);
      const trainingSessions_ = sessions.filter((s) => !(s as any).isRestDay);
      return {
        id: week.id,
        weekNumber: week.weekNumber,
        label: (week as any).label ?? `Week ${week.weekNumber}`,
        focus: (week as any).focus ?? null,
        volumeLevel: (week as any).volumeLevel ?? "moderate",
        status: week.status,
        totalSessions: trainingSessions_.length,
        totalSessionsIncludingRest: sessions.length,
      };
    })
  );

  const currentWeek = allWeeks.find((w) => w.status === "current");

  return {
    phase: {
      id: currentPhase.id,
      name: currentPhase.name,
      goal: currentPhase.goal,
      weekCount: currentPhase.weekCount ?? allWeeks.length,
    },
    currentWeekNumber: currentWeek?.weekNumber ?? 1,
    weeks: weeksWithSessionCounts,
  };
}

export async function getBlockSummary(userId: number, focusMode?: string | null) {
  const system = await getActiveTrainingSystem(userId, focusMode);
  if (!system) return null;

  const phases = await db
    .select()
    .from(trainingPhases)
    .where(eq(trainingPhases.trainingSystemId, system.id))
    .orderBy(trainingPhases.orderIndex);

  const currentPhase = phases.find((p) => p.status === "current") ?? phases[0] ?? null;

  let currentWeekNum = 1;
  if (currentPhase) {
    const weeks = await db
      .select()
      .from(trainingWeeks)
      .where(eq(trainingWeeks.trainingPhaseId, currentPhase.id))
      .orderBy(trainingWeeks.orderIndex);

    const cw = weeks.find((w) => w.status === "current");
    if (cw) currentWeekNum = cw.weekNumber;
  }

  return { system, phases, currentPhase, currentWeekNumber: currentWeekNum };
}

export async function initializeTrainingSystem(userId: number): Promise<typeof trainingSystems.$inferSelect> {
  const [existingSystem] = await db
    .select()
    .from(trainingSystems)
    .where(and(eq(trainingSystems.userId, userId), eq(trainingSystems.status, "active")));

  if (existingSystem) return existingSystem;

  const [profile] = await db
    .select()
    .from(userProfilesTable)
    .where(eq(userProfilesTable.userId, userId));

  const goal = profile ? normalizeGoal(profile.trainingGoal) : "general_fitness";
  const equipment = profile ? normalizeEquipment(profile.equipmentAccess) : "full_gym";
  const daysPerWeek = profile?.daysPerWeek ?? 3;
  const trainingStyle = profile?.trainingStyle ?? "balanced";
  const experience = profile ? normalizeExperience(profile.experienceLevel ?? "intermediate") : "intermediate";
  const injuryFlags = detectInjuryFlags(profile?.injuries ?? null);

  // Map local normalised goal/equipment to coach-select types
  const coachGoal: CoachGoalType =
    goal === "athletic" ? "athletic_performance" :
    (goal as CoachGoalType);
  const coachEquipment: CoachEquipmentLevel =
    equipment === "dumbbells" ? "dumbbells_only" :
    equipment === "minimal" ? "home_limited" :
    (equipment as CoachEquipmentLevel);

  const phaseConfig = buildPhaseConfig(goal, daysPerWeek);
  const systemName = getSystemName(goal, trainingStyle, equipment);

  const [system] = await db.insert(trainingSystems).values({
    userId,
    name: systemName,
    overarchingGoal: profile?.trainingGoal ?? "Build fitness and improve health",
    trainingStyle: profile?.trainingStyle ?? "Balanced strength and conditioning",
    weeklyFrequency: daysPerWeek,
    equipmentAccess: profile?.equipmentAccess ?? "Full gym",
    constraints: profile?.injuries ?? null,
    status: "active",
  }).returning();

  const [phase] = await db.insert(trainingPhases).values({
    trainingSystemId: system.id,
    name: phaseConfig.phaseName,
    goal: phaseConfig.phaseGoal,
    emphasis: phaseConfig.emphasis,
    weekCount: 4,
    orderIndex: 0,
    status: "current",
    notes: null,
  }).returning();

  await db.update(trainingSystems).set({ currentPhaseId: phase.id }).where(eq(trainingSystems.id, system.id));

  const splitDays = splitMaps[Math.min(daysPerWeek, 6)] ?? splitMaps[3];

  for (let weekIdx = 0; weekIdx < 4; weekIdx++) {
    const weekConfig = phaseConfig.weekConfigs[weekIdx];
    const weekNumber = weekIdx + 1;
    const isDeload = weekConfig.volumeLevel === "deload";

    const [week] = await db.insert(trainingWeeks).values({
      trainingPhaseId: phase.id,
      weekNumber,
      label: weekConfig.label,
      focus: weekConfig.focus,
      volumeLevel: weekConfig.volumeLevel,
      status: weekIdx === 0 ? "current" : "upcoming",
      orderIndex: weekIdx,
    }).returning();

    for (let sessionIdx = 0; sessionIdx < splitDays.length; sessionIdx++) {
      const splitDay = splitDays[sessionIdx];

      const [session] = await db.insert(trainingSessions).values({
        trainingWeekId: week.id,
        label: splitDay.label,
        sessionType: splitDay.sessionType,
        dayOfWeek: splitDay.dayOfWeek,
        emphasis: splitDay.emphasis,
        warmupNotes: getWarmupNotes(splitDay.sessionType, splitDay.emphasis),
        coachingNotes: getCoachingNotes(goal, weekIdx, splitDay.label),
        isRestDay: false,
        orderIndex: sessionIdx,
      }).returning();

      // ── Intelligent coach selection from the 620-exercise DB ──
      // Each week gets the correct week-number scaling (volume, intensity, deload).
      // The coach engine applies NSCA hierarchy, goal-matched prescriptions,
      // equipment filtering, and injury-aware selection automatically.
      const coachExercises = await selectSessionExercises({
        sessionType: splitDay.coachSessionType,
        goal: coachGoal,
        experience: experience as CoachExperienceTier,
        equipment: coachEquipment,
        injuryFlags: injuryFlags.map(String),
        weekNumber: isDeload ? 4 : weekNumber,
      });

      // Deload: keep only the first 60% of exercises (primary + one secondary)
      const rawCoachExercises = isDeload
        ? coachExercises.slice(0, Math.max(Math.ceil(coachExercises.length * 0.6), 2))
        : coachExercises;

      // Map CoachExercise role to DB category, then sort into training-flow order
      const mappedExercises = rawCoachExercises.map((ex) => {
        const category: ExerciseCategory =
          ex.role === "explosive"    ? "power" :
          ex.role === "primary"      ? "primary" :
          ex.role === "secondary"    ? "secondary" :
          ex.role === "conditioning" ? "conditioning" :
          "accessory";
        return { ...ex, category };
      });
      const orderedExercises = sortExercisesByCategory(mappedExercises);

      for (let exIdx = 0; exIdx < orderedExercises.length; exIdx++) {
        const ex = orderedExercises[exIdx];

        await db.insert(sessionExercises).values({
          trainingSessionId: session.id,
          name: ex.name,
          category: ex.category,
          sets: ex.sets,
          reps: ex.reps,
          rest: ex.rest,
          tempo: null,
          notes: ex.notes,
          orderIndex: exIdx,
        });
      }
    }
  }

  return system;
}

// ─── Strength Exercise Variant Map — LAST-RESORT FALLBACK ONLY ───────────────
//
// ⚠ This map is no longer the primary selection system.
//
// PRIMARY path: selectStrengthVariantFromLibrary() in strength-week-expression.ts
//   Uses EXERCISE_EXTENDED_META (family + equivalenceCluster + complexity +
//   stabilityDemand + velocityIntent) to score and select the best week-role
//   variant from the full exercise library. Returns null when no candidate
//   meaningfully outscores the current exercise.
//
// This map is consulted ONLY when the library path returns null — i.e., when:
//   - The exercise has no equivalenceCluster and no useful family candidates
//   - The best library candidate fails to meet the swap threshold
//   - A cross-family deload downgrade is needed (e.g., Back Squat → Goblet Squat)
//
// Do NOT add new exercises here if the library can handle them.
// Extend EXERCISE_EXTENDED_META with equivalenceCluster assignments instead.

const STRENGTH_EXERCISE_VARIANTS: Record<string, { w1?: string; w2?: string; w3?: string; w4?: string }> = {
  // Squat patterns
  "Back Squat": { w1: "Safety Bar Squat", w3: "Pause Back Squat", w4: "Goblet Squat" },
  "Barbell Back Squat": { w1: "Safety Bar Squat", w3: "Pause Back Squat", w4: "Goblet Squat" },
  "Safety Bar Squat": { w3: "Back Squat", w4: "Goblet Squat" },
  "Front Squat": { w1: "Safety Bar Squat", w4: "Goblet Squat" },
  "Squat": { w1: "Safety Bar Squat", w3: "Pause Squat", w4: "Goblet Squat" },
  // Hip hinge / deadlift
  "Deadlift": { w1: "Trap Bar Deadlift", w3: "Deficit Deadlift", w4: "Romanian Deadlift" },
  "Conventional Deadlift": { w1: "Trap Bar Deadlift", w3: "Deficit Deadlift", w4: "Romanian Deadlift" },
  "Sumo Deadlift": { w1: "Trap Bar Deadlift", w3: "Deficit Sumo Deadlift", w4: "Romanian Deadlift" },
  "Romanian Deadlift": { w1: "Dumbbell Romanian Deadlift", w3: "Barbell Romanian Deadlift", w4: "Dumbbell Romanian Deadlift" },
  "RDL": { w1: "Dumbbell RDL", w3: "Barbell RDL", w4: "Dumbbell RDL" },
  "Trap Bar Deadlift": { w3: "Conventional Deadlift", w4: "Romanian Deadlift" },
  // Unilateral lower
  "Bulgarian Split Squat": { w1: "Reverse Lunge", w4: "Reverse Lunge" },
  "Split Squat": { w1: "Reverse Lunge", w3: "Bulgarian Split Squat", w4: "Reverse Lunge" },
  "Reverse Lunge": { w3: "Bulgarian Split Squat" },
  "Walking Lunge": { w1: "Reverse Lunge", w3: "Bulgarian Split Squat", w4: "Reverse Lunge" },
  "Step-Up": { w3: "Rear-Foot Elevated Split Squat", w4: "Reverse Lunge" },
  // Hip thrust / glute
  "Hip Thrust": { w1: "Glute Bridge", w4: "Glute Bridge" },
  "Barbell Hip Thrust": { w1: "Hip Thrust", w4: "Glute Bridge" },
  "Glute Bridge": { w3: "Hip Thrust" },
  // Press
  "Bench Press": { w3: "Pause Bench Press", w4: "Dumbbell Bench Press" },
  "Barbell Bench Press": { w3: "Pause Bench Press", w4: "Dumbbell Bench Press" },
  "Incline Bench Press": { w1: "Dumbbell Incline Press", w3: "Pause Incline Bench Press", w4: "Dumbbell Incline Press" },
  "Overhead Press": { w1: "Seated Dumbbell Press", w4: "Seated Dumbbell Press" },
  "Barbell Overhead Press": { w1: "Seated Dumbbell Press", w3: "Push Press", w4: "Seated Dumbbell Press" },
  // Row
  "Barbell Row": { w1: "Dumbbell Row", w3: "Pendlay Row", w4: "Dumbbell Row" },
  "Bent-Over Row": { w1: "Dumbbell Row", w3: "Pendlay Row", w4: "Dumbbell Row" },
  "Barbell Bent-Over Row": { w1: "Dumbbell Row", w3: "Pendlay Row", w4: "Dumbbell Row" },
  "Pendlay Row": { w1: "Dumbbell Row", w4: "Dumbbell Row" },
  // Pull / lat
  "Pull-Up": { w1: "Lat Pulldown", w4: "Lat Pulldown" },
  "Chin-Up": { w1: "Lat Pulldown", w4: "Lat Pulldown" },
  "Lat Pulldown": { w3: "Pull-Up" },
  // Power / explosive
  "Box Jump": { w1: "Broad Jump", w4: "Broad Jump" },
  "Power Clean": { w1: "Hang Power Clean", w4: "Hang Power Clean" },
  "Hang Power Clean": { w3: "Power Clean" },
  "Push Press": { w1: "Dumbbell Push Press", w4: "Dumbbell Push Press" },
  // Trunk
  "Ab Wheel Rollout": { w1: "Dead Bug", w4: "Dead Bug" },
  "Barbell Rollout": { w1: "Ab Wheel Rollout", w4: "Dead Bug" },
  "Pallof Press": { w3: "Anti-Rotation Press", w4: "Half-Kneeling Pallof Press" },
};

// ─── Rep Range Adjuster ───────────────────────────────────────────────────────
//
// Shifts rep ranges based on week role.
// Parses "4-6", "6-8", "8-10", "10-12" patterns and shifts up/down.
// W1 (establish): nudge toward higher reps (technique-friendly)
// W2 (build): keep as prescribed
// W3 (intensify): nudge primaries toward lower reps (heavier)
// W4 (deload): push toward higher reps with lighter load directive

function adjustRepsForWeek(reps: string, weekNumber: number, isPrimary: boolean): string {
  const rangeMatch = reps.match(/^(\d+)-(\d+)$/);
  if (!rangeMatch) return reps; // non-numeric (e.g., "30 sec") — keep as-is

  let lo = parseInt(rangeMatch[1], 10);
  let hi = parseInt(rangeMatch[2], 10);

  if (weekNumber === 1) {
    // Establish: nudge up 1-2 reps to keep it technical and sub-maximal
    lo = Math.min(lo + 2, 15);
    hi = Math.min(hi + 2, 15);
  } else if (weekNumber === 3 && isPrimary) {
    // Intensify: nudge primaries down 1-2 reps (heavier expression)
    lo = Math.max(lo - 2, 1);
    hi = Math.max(hi - 2, 2);
  } else if (weekNumber === 4) {
    // Deload: push to higher reps, lighter
    lo = Math.min(lo + 4, 15);
    hi = Math.min(hi + 4, 20);
  }

  return `${lo}-${hi}`;
}

// ─── Week-Specific Exercise Notes ─────────────────────────────────────────────

function getStrengthExerciseNote(classification: string, weekNumber: number, isDeload: boolean): string {
  const isPrimary = classification.includes("primary") || classification.includes("power") || classification.includes("explosive");
  const isAccessory = classification.includes("accessory") || classification.includes("unilateral") || classification.includes("secondary");
  const isTrunk = classification.includes("trunk") || classification.includes("carry");
  const isPrep = classification.includes("prep") || classification.includes("warm");

  if (isDeload) {
    if (isPrimary) return "Deload — drop to 60-65% of your W3 load. Bar speed only. No grinding.";
    if (isTrunk) return "Deload — 1-2 sets only. Move well, stay loose.";
    return "Deload — reduce load 30-40%. Flush fatigue and protect the CNS.";
  }

  if (isPrep) return weekNumber === 1
    ? "Establish movement quality — this sets the tone for the whole block."
    : weekNumber === 3
    ? "Prime the CNS before the heaviest training day of the block."
    : "Warm-up well — quality prep transfers directly to the working sets.";

  if (isPrimary) {
    switch (weekNumber) {
      case 1: return "W1 — Establish. Focus on positions and bracing. Work to a load you could hit for 2-3 more reps. Log it.";
      case 2: return "W2 — Build. Add 2.5–5% from Week 1. Maintain bar speed and full range. 2-3 RIR.";
      case 3: return "W3 — Intensify. Heaviest week. Work to 1-2 RIR on top sets. Bar speed is the cue.";
      default: return "W1 — Find your working load for this block.";
    }
  }

  if (isAccessory || classification.includes("unilateral")) {
    switch (weekNumber) {
      case 1: return "W1 — Learn the positions. Leave 3 RIR. Quality over load.";
      case 2: return "W2 — Add a small load increment. Same quality, slightly more effort.";
      case 3: return "W3 — Push the support work. More total reps or more load than W2.";
      default: return "Accumulate quality reps. Controlled tempo.";
    }
  }

  if (isTrunk) {
    switch (weekNumber) {
      case 1: return "W1 — Find the pattern. Brace hard and hold position throughout.";
      case 2: return "W2 — Progress duration or reps slightly. Stiffness over speed.";
      case 3: return "W3 — Peak trunk demand. Maintain quality under fatigue.";
      default: return "Brace hard throughout. Quality over reps.";
    }
  }

  // Fallback
  switch (weekNumber) {
    case 1: return "W1 — Establish baseline. Quality of movement is the metric.";
    case 2: return "W2 — Build. Progressive overload begins here.";
    case 3: return "W3 — Peak effort. Highest demand of the block.";
    default: return "Controlled reps. Record your working loads.";
  }
}

// ─── Strength Week Expression Engine ─────────────────────────────────────────
//
// The primary post-generation variation layer for strength builds.
// Replaces applyWeekProgressionToExercises for strength focus mode.
//
// Applied after each week's exercises are pulled from the chat program.
// Produces genuinely different W1–W4 expressions from a single AI-generated
// program template, matching real periodized programming:
//
// W1 (Establish): stable variants, higher reps, intro sets, technique focus
// W2 (Build): standard version, full sets, baseline load directive
// W3 (Intensify): demanding variants, lower primary reps, +1 set on primaries
// W4 (Deload): easier variants, fewer sets, higher reps, flush-fatigue notes

function applyStrengthWeekExpression(
  exercises: ChatProgramExercise[],
  weekNumber: number,
  isDeload: boolean
): ChatProgramExercise[] {
  // W4 Deload: smaller exercise count + week-specific notes
  // Minimum of 4 exercises — the depth expander in ai.ts guarantees ≥5 before
  // the program is saved, so 60% of 5 = 3 → floor raised to 4 to prevent
  // deload sessions from collapsing below usable depth.
  if (isDeload) {
    const deloadCount = Math.max(Math.ceil(exercises.length * 0.6), 4);
    return exercises.slice(0, deloadCount).map((ex) => {
      const classification = (ex.classification ?? "").toLowerCase();

      // W4 Deload — map-first, library fallback.
      //
      // The hardcoded map holds explicitly curated cross-family downgrades
      // (e.g. Back Squat → Goblet Squat, Deadlift → RDL) that the library
      // cannot find because they cross equivalence-cluster or family boundaries.
      // Library is consulted only when no map entry exists for W4.
      const variantMapEntry = STRENGTH_EXERCISE_VARIANTS[ex.name];
      let swappedName = variantMapEntry?.w4 ?? ex.name;
      let deloadSource: "hardcoded-map" | "library" = "hardcoded-map";

      if (swappedName === ex.name) {
        const libraryResult = selectStrengthVariantFromLibrary(ex.name, 4);
        if (libraryResult.selectedName) {
          swappedName = libraryResult.selectedName;
          deloadSource = "library";
        }
      }

      if (process.env.NODE_ENV !== "production" && swappedName !== ex.name) {
        const libResult = selectStrengthVariantFromLibrary(ex.name, 4);
        console.log("[StrengthVariantSwap]", JSON.stringify({
          week: 4,
          original: ex.name,
          selected: swappedName,
          source: deloadSource,
          reason: deloadSource === "hardcoded-map" ? "map_w4_cross_family_policy" : libResult.reason,
          scoreDelta: libResult.scoreDelta,
          threshold: libResult.thresholdApplied,
          cluster: libResult.equivalenceCluster,
          family: libResult.movementFamily,
          candidateCount: libResult.candidateCount,
        }));
      }

      return {
        ...ex,
        name: swappedName,
        sets: typeof ex.sets === "number" ? Math.max(2, ex.sets - 2) : ex.sets,
        reps: adjustRepsForWeek(ex.reps ?? "8-10", 4, false),
        rest: "60 sec",
        notes: getStrengthExerciseNote(classification, 4, true),
        intent: ex.intent,
      };
    });
  }

  const setModsByWeek: Record<number, { primary: number; accessory: number }> = {
    1: { primary: -1, accessory: -1 },
    2: { primary: 0,  accessory: 0  },
    3: { primary: 1,  accessory: 0  },
  };
  const setMods = setModsByWeek[weekNumber] ?? setModsByWeek[2];

  const restByWeek: Record<number, { primary: string; accessory: string }> = {
    1: { primary: "2-3 min", accessory: "90 sec" },
    2: { primary: "2-3 min", accessory: "90 sec" },
    3: { primary: "3-4 min", accessory: "90 sec" },
  };
  const restConfig = restByWeek[weekNumber] ?? restByWeek[2];

  return exercises.map((ex) => {
    const classification = (ex.classification ?? "").toLowerCase();

    const isPrimary =
      classification.includes("primary") ||
      classification.includes("explosive") ||
      classification.includes("power");
    const isPrep = classification.includes("prep") || classification.includes("warm");

    // ── Set scaling ──────────────────────────────────────────────────────────
    const setMod = (isPrimary || classification.includes("secondary")) ? setMods.primary : setMods.accessory;
    const scaledSets = typeof ex.sets === "number" ? Math.max(2, ex.sets + setMod) : ex.sets;

    // ── Exercise variant swap — library-first, hardcoded map as last resort ──
    //
    // 1. PRIMARY: selectStrengthVariantFromLibrary() scores all cluster/family
    //    candidates from EXERCISE_EXTENDED_META and returns the best fit for
    //    this week role (or null if current exercise is already optimal).
    //
    // 2. FALLBACK: STRENGTH_EXERCISE_VARIANTS consulted only when library returns
    //    null — captures cross-family deload downgrades and pause/deficit
    //    intensification variants the library metadata can't distinguish.

    const libraryResult = selectStrengthVariantFromLibrary(ex.name, weekNumber);
    let swappedName = libraryResult.selectedName ?? ex.name;

    // Fallback to hardcoded map only if library found nothing
    if (swappedName === ex.name) {
      const variantLookup = STRENGTH_EXERCISE_VARIANTS[ex.name];
      if (variantLookup) {
        const weekKey = `w${weekNumber}` as "w1" | "w2" | "w3" | "w4";
        swappedName = variantLookup[weekKey] ?? ex.name;
      }
    }

    // Audit log for non-production (always log — selection or no-change)
    if (process.env.NODE_ENV !== "production") {
      const source = libraryResult.selectedName ? "library" : (swappedName !== ex.name ? "curated_map_fallback" : "kept");
      console.log("[StrengthVariantSwap]", JSON.stringify({
        week: weekNumber,
        original: ex.name,
        selected: swappedName,
        changed: swappedName !== ex.name,
        source,
        reason: libraryResult.reason,
        scoreDelta: libraryResult.scoreDelta,
        threshold: libraryResult.thresholdApplied,
        candidateCount: libraryResult.candidateCount,
        cluster: libraryResult.equivalenceCluster,
        family: libraryResult.movementFamily,
        crossFamily: libraryResult.crossFamily,
      }));
    }

    // ── Rep range adjustment ─────────────────────────────────────────────────
    const adjustedReps = ex.reps ? adjustRepsForWeek(ex.reps, weekNumber, isPrimary) : ex.reps;

    // ── Rest period ──────────────────────────────────────────────────────────
    let rest = ex.rest;
    if (!isPrep) {
      rest = (isPrimary || classification.includes("secondary")) ? restConfig.primary : restConfig.accessory;
    }

    // ── Per-exercise week note ───────────────────────────────────────────────
    const exerciseNote = getStrengthExerciseNote(classification, weekNumber, false);

    return {
      ...ex,
      name: swappedName,
      sets: scaledSets,
      reps: adjustedReps,
      rest,
      notes: exerciseNote,
    };
  });
}

// ─── Strength Week Variation Validator ───────────────────────────────────────
//
// Computes a variation score across the 4 generated weeks and logs audit data.
// Called after all weeks are built to confirm they are genuinely different.
//
// Variation score: percentage of exercises that differ across weeks (name or reps).
// Threshold: 30% variation is the minimum acceptable.

export interface StrengthWeekVariationAuditResult {
  variationScore: number;
  totalExercisesChecked: number;
  identicalExercisesAcrossWeeks: number;
  rotatedExercises: number;
  primaryVariationsChanged: number;
  trunkRotationsApplied: number;
  repRangesChanged: number;
  repairNeeded: boolean;
}

export function validateStrengthWeekVariation(
  weekExerciseLists: ChatProgramExercise[][]
): StrengthWeekVariationAuditResult {
  if (weekExerciseLists.length < 2) {
    return {
      variationScore: 0,
      totalExercisesChecked: 0,
      identicalExercisesAcrossWeeks: 0,
      rotatedExercises: 0,
      primaryVariationsChanged: 0,
      trunkRotationsApplied: 0,
      repRangesChanged: 0,
      repairNeeded: false,
    };
  }

  const baseWeek = weekExerciseLists[0];
  let identical = 0;
  let rotated = 0;
  let primaryChanged = 0;
  let trunkChanged = 0;
  let repChanged = 0;

  for (let i = 1; i < weekExerciseLists.length; i++) {
    const week = weekExerciseLists[i];
    const compareLength = Math.min(baseWeek.length, week.length);

    for (let j = 0; j < compareLength; j++) {
      const base = baseWeek[j];
      const current = week[j];

      const nameChanged = base.name !== current.name;
      const repsChanged = base.reps !== current.reps;

      if (!nameChanged && !repsChanged) {
        identical++;
      } else {
        rotated++;
        if (nameChanged) {
          const classification = (base.classification ?? "").toLowerCase();
          if (classification.includes("primary") || classification.includes("power") || classification.includes("explosive")) {
            primaryChanged++;
          }
          if (classification.includes("trunk")) {
            trunkChanged++;
          }
        }
        if (repsChanged) repChanged++;
      }
    }
  }

  const total = identical + rotated;
  const variationScore = total > 0 ? Math.round((rotated / total) * 100) : 0;

  return {
    variationScore,
    totalExercisesChecked: total,
    identicalExercisesAcrossWeeks: identical,
    rotatedExercises: rotated,
    primaryVariationsChanged: primaryChanged,
    trunkRotationsApplied: trunkChanged,
    repRangesChanged: repChanged,
    repairNeeded: variationScore < 30,
  };
}

// ─── Week Progression Engine (non-strength fallback) ──────────────────────────
//
// Legacy progression for speed/mobility/other focus modes.
// Applies a simple set-count and note-override arc.
// Strength builds use applyStrengthWeekExpression instead.

function applyWeekProgressionToExercises(
  exercises: ChatProgramExercise[],
  weekNumber: number,
  isDeload: boolean
): ChatProgramExercise[] {
  // Week 4 (Deload): reduce volume and exercise count
  if (isDeload) {
    return exercises
      .slice(0, Math.max(Math.ceil(exercises.length * 0.6), 4))
      .map((ex) => ({
        ...ex,
        sets: typeof ex.sets === "number" ? Math.max(2, ex.sets - 2) : ex.sets,
        notes: "Deload week — reduce load by 30-40%. Move well and flush fatigue. Protect CNS for the next block.",
        intent: ex.intent,
      }));
  }

  type WeekProfile = { primarySetMod: number; accessorySetMod: number; intentNote: string };
  const weekProfiles: Record<number, WeekProfile> = {
    1: {
      primarySetMod: -1,
      accessorySetMod: -1,
      intentNote: "Establish baseline loads and movement quality. Prioritise technique over load — find your working weights for this block.",
    },
    2: {
      primarySetMod: 0,
      accessorySetMod: 0,
      intentNote: "Build phase — increase load 5-10% from Week 1. Push working sets with controlled effort. 2-3 RIR on primaries.",
    },
    3: {
      primarySetMod: 1,
      accessorySetMod: 0,
      intentNote: "Intensify — heaviest week of the block. Work to 1-2 RIR on top sets. This is your peak loading week.",
    },
  };

  const profile = weekProfiles[weekNumber] ?? weekProfiles[2];

  return exercises.map((ex) => {
    const classification = (ex.classification ?? "").toLowerCase();
    const isPrimary =
      classification.includes("primary") ||
      classification.includes("explosive") ||
      classification.includes("power") ||
      classification.includes("main");
    const setMod = isPrimary ? profile.primarySetMod : profile.accessorySetMod;
    const scaledSets = typeof ex.sets === "number" ? Math.max(2, ex.sets + setMod) : ex.sets;

    return { ...ex, sets: scaledSets, notes: profile.intentNote };
  });
}

// ─── Shared types for chat-generated program ──────────────────────────────────

export interface ChatProgramExercise {
  name: string;
  classification?: string;
  sets: number;
  reps: string;
  rest: string;
  intent?: string;
  notes?: string;
}

export interface ChatProgramDay {
  dayNumber: number;
  name: string;
  focus?: string;
  exercises: ChatProgramExercise[];
  notes?: string;
}

export interface BlockMetadata {
  blockType: string;
  blockDisplayName: string;
  missionStatement: string;
  weekProgressionArc: string;
  primaryAdaptation: string;
  volumeProfile: "high" | "moderate" | "low";
  intensityProfile: "high" | "moderate" | "low";
}

export interface ChatProgram {
  programName: string;
  description?: string;
  progressionStrategy?: string;
  splitType?: string;
  days: ChatProgramDay[];
  /** Block metadata from the monthly planner — attached server-side before DB save */
  blockMetadata?: BlockMetadata | null;
}

// Maps the AI's exercise classification string to the DB category enum.
// Order of checks matters — most specific first.
function mapClassificationToCategory(classification?: string): ExerciseCategory {
  if (!classification) return "accessory";
  const c = classification.toLowerCase();

  // Warm-up / prep
  if (c.includes("warm") || c.includes("warm-up") || c.includes("warmup") ||
      c.includes("prep") || c.includes("mob") || c.includes("dynamic") || c.includes("movement prep"))
    return "warmup";

  // Activation — glute, neural, low-load prep
  if (c.includes("activat") || c.includes("glute") || c.includes("neural prep") ||
      c.includes("band walk") || c.includes("monster walk"))
    return "activation";

  // Power — explosive, plyometric, olympic
  if (c.includes("power") || c.includes("explos") || c.includes("plyometric") ||
      c.includes("olympic") || c.includes("jump") || c.includes("med ball") ||
      c.includes("broad jump") || c.includes("box jump") || c.includes("sprint"))
    return "power";

  // Primary — main strength lift
  if (c.includes("primary") || c.includes("main lift") || c.includes("main") && c.includes("strength"))
    return "primary";

  // Secondary — important support lift, not the centerpiece
  if (c.includes("secondary") || c.includes("unilateral") || c.includes("support lift"))
    return "secondary";

  // Trunk — anti-rotation, anti-extension, core stiffness
  if (c.includes("trunk") || c.includes("core") || c.includes("anti-rot") ||
      c.includes("anti-ext") || c.includes("pallof") || c.includes("dead bug") ||
      c.includes("rollout") || c.includes("plank") || c.includes("stiffness"))
    return "trunk";

  // Accessory — hypertrophy, isolation, upper back, smaller movements
  if (c.includes("accessory") || c.includes("isolation") || c.includes("hypertrophy") ||
      c.includes("curl") || c.includes("row") || c.includes("pull-up") || c.includes("face pull"))
    return "accessory";

  // Conditioning / metabolic
  if (c.includes("condition") || c.includes("metabolic") || c.includes("finisher") ||
      c.includes("circuit") || c.includes("interval") || c.includes("cardio"))
    return "conditioning";

  // Recovery
  if (c.includes("recovery") || c.includes("cooldown") || c.includes("restoration") ||
      c.includes("breathing"))
    return "recovery";

  // Safe fallback: if the classification string suggests a single movement pattern,
  // treat as secondary (conservative — don't inflate to primary)
  return "accessory";
}

// Sorts a list of exercises into canonical training-flow order.
function sortExercisesByCategory(exercises: { category: ExerciseCategory; [key: string]: any }[]) {
  return [...exercises].sort(
    (a, b) => (CATEGORY_ORDER[a.category] ?? 5) - (CATEGORY_ORDER[b.category] ?? 5)
  );
}

// Assigns sensible day-of-week values based on number of sessions
function assignDaysOfWeek(count: number): number[] {
  const patterns: Record<number, number[]> = {
    1: [1],
    2: [1, 4],
    3: [1, 3, 5],
    4: [1, 2, 4, 5],
    5: [1, 2, 3, 5, 6],
    6: [1, 2, 3, 4, 5, 6],
  };
  return patterns[Math.min(Math.max(count, 1), 6)] ?? [1, 3, 5];
}

function inferGoalFromProgram(program: ChatProgram): string {
  const text = `${program.programName} ${program.description ?? ""}`.toLowerCase();
  if (text.includes("strength") || text.includes("power")) return "strength";
  if (text.includes("hypertrophy") || text.includes("muscle") || text.includes("size")) return "hypertrophy";
  if (text.includes("fat") || text.includes("lean") || text.includes("weight loss")) return "fat_loss";
  if (text.includes("athletic") || text.includes("sport") || text.includes("performance")) return "athletic";
  if (text.includes("endurance") || text.includes("cardio") || text.includes("conditioning")) return "endurance";
  return "general_fitness";
}

// Infer a session type based on the day label / focus text
function inferSessionType(
  day: ChatProgramDay
): "lifting" | "conditioning" | "mobility" | "recovery" | "sport" | "rest" {
  const text = `${day.name} ${day.focus ?? ""}`.toLowerCase();
  if (text.includes("condition") || text.includes("cardio") || text.includes("metabolic")) return "conditioning";
  if (text.includes("mobility") || text.includes("stretch")) return "mobility";
  if (text.includes("rest") || text.includes("recovery")) return "rest";
  return "lifting";
}

/**
 * Creates a full Training System from a chat-generated program and saves it to
 * the training_systems hierarchy (system → phase → weeks → sessions → exercises).
 *
 * This bridges the chat output to the Training System page so both stay in sync.
 *
 * - Archives any existing active system for the user.
 * - Creates one 4-week phase with the program exercises replicated across all weeks.
 * - Week 1 is set as "current"; weeks 2-4 are "upcoming".
 */
export async function createTrainingSystemFromProgram(
  userId: number,
  program: ChatProgram,
  conversationId?: number | null,
  focusMode?: string | null
): Promise<typeof trainingSystems.$inferSelect> {
  logger.info({ userId, programName: program.programName, focusMode }, "[TrainingSystem] createTrainingSystemFromProgram — starting");

  // Validate program has days
  if (!program.days || !Array.isArray(program.days) || program.days.length === 0) {
    throw new Error("Program must have at least one training day");
  }

  const resolvedFocusMode = focusMode ?? "strength";

  // Archive only same-focus active systems — different focus lanes stay active
  const allActiveSystems = await db
    .select()
    .from(trainingSystems)
    .where(and(eq(trainingSystems.userId, userId), eq(trainingSystems.status, "active")));

  const sameFocusSystems = allActiveSystems.filter(
    (s) => ((s.metadata as any)?.focusMode ?? "strength") === resolvedFocusMode
  );

  for (const s of sameFocusSystems) {
    await db
      .update(trainingSystems)
      .set({ status: "archived" })
      .where(eq(trainingSystems.id, s.id));
  }

  logger.info(
    { userId, archivedCount: sameFocusSystems.length, focusMode: resolvedFocusMode },
    "[TrainingSystem] createTrainingSystemFromProgram — archived same-focus systems"
  );

  const inferredGoal = inferGoalFromProgram(program);
  // Speed and mobility programs must use their own phase configs — never default to the strength fallback.
  const goal = resolvedFocusMode === "speed" ? "speed"
             : resolvedFocusMode === "mobility" ? "mobility"
             : inferredGoal;
  const daysPerWeek = program.days.length;
  const phaseConfig = buildPhaseConfig(goal, daysPerWeek);

  // Create the training system
  const [system] = await db.insert(trainingSystems).values({
    userId,
    conversationId: conversationId ?? null,
    name: program.programName,
    overarchingGoal: program.description ?? program.programName,
    trainingStyle: program.splitType ?? phaseConfig.phaseName,
    weeklyFrequency: daysPerWeek,
    equipmentAccess: "As configured in your program",
    constraints: null,
    status: "active",
    metadata: {
      source: "chat",
      focusMode: resolvedFocusMode,
      progressionStrategy: program.progressionStrategy ?? null,
      ...(program.blockMetadata ? {
        blockType: program.blockMetadata.blockType,
        blockDisplayName: program.blockMetadata.blockDisplayName,
        missionStatement: program.blockMetadata.missionStatement,
        weekProgressionArc: program.blockMetadata.weekProgressionArc,
        primaryAdaptation: program.blockMetadata.primaryAdaptation,
        volumeProfile: program.blockMetadata.volumeProfile,
        intensityProfile: program.blockMetadata.intensityProfile,
      } : {}),
    } as any,
  }).returning();

  logger.info({ systemId: system.id }, "[TrainingSystem] system created");

  // Create Phase 1
  const [phase] = await db.insert(trainingPhases).values({
    trainingSystemId: system.id,
    name: phaseConfig.phaseName,
    goal: phaseConfig.phaseGoal,
    emphasis: phaseConfig.emphasis,
    weekCount: 4,
    orderIndex: 0,
    status: "current",
    notes: program.progressionStrategy ?? null,
  }).returning();

  // Link system → phase
  await db.update(trainingSystems)
    .set({ currentPhaseId: phase.id })
    .where(eq(trainingSystems.id, system.id));

  logger.info({ phaseId: phase.id }, "[TrainingSystem] phase created");

  const dayOfWeekMap = assignDaysOfWeek(daysPerWeek);
  const isStrength = resolvedFocusMode === "strength" || goal === "strength";

  // Track per-week exercise lists for variation validation (strength builds only)
  const weekExerciseListsByDay: ChatProgramExercise[][][] = []; // [weekIdx][dayIdx] = exercises

  // Create 4 weeks
  for (let weekIdx = 0; weekIdx < 4; weekIdx++) {
    const weekConfig = phaseConfig.weekConfigs[weekIdx];
    const weekNumber = weekIdx + 1;
    const isDeload = weekConfig.volumeLevel === "deload";

    const [week] = await db.insert(trainingWeeks).values({
      trainingPhaseId: phase.id,
      weekNumber,
      label: weekConfig.label,
      focus: weekConfig.focus,
      volumeLevel: weekConfig.volumeLevel,
      status: weekIdx === 0 ? "current" : "upcoming",
      orderIndex: weekIdx,
    }).returning();

    logger.info({ weekId: week.id, weekNumber }, "[TrainingSystem] week created");

    const weekDayExercises: ChatProgramExercise[][] = [];

    // Create sessions from the chat program days
    for (let dayIdx = 0; dayIdx < program.days.length; dayIdx++) {
      const day = program.days[dayIdx];
      const sessionType = inferSessionType(day);
      const dayOfWeek = dayOfWeekMap[dayIdx] ?? dayIdx + 1;

      const warmupNotes = getWarmupNotes(sessionType, day.focus ?? day.name);
      // For strength builds, always use week-specific session notes to ensure W1-W4 differ.
      // Other focus modes preserve the AI-generated day notes.
      const coachingNotes = isStrength
        ? getCoachingNotes(goal, weekIdx, day.name)
        : (day.notes ? day.notes : getCoachingNotes(goal, weekIdx, day.name));

      const [session] = await db.insert(trainingSessions).values({
        trainingWeekId: week.id,
        label: day.name,
        sessionType,
        dayOfWeek,
        emphasis: day.focus ?? null,
        warmupNotes,
        coachingNotes,
        isRestDay: sessionType === "rest",
        orderIndex: dayIdx,
      }).returning();

      // ── Apply week-aware exercise expression ──────────────────────────────
      // Strength: full expression engine (variant swaps, rep adjustments, rotation)
      // Other modes: simple set/note scaling
      const progressedExercises = isStrength
        ? applyStrengthWeekExpression(day.exercises, weekNumber, isDeload)
        : applyWeekProgressionToExercises(day.exercises, weekNumber, isDeload);

      weekDayExercises.push(progressedExercises);

      // Classify then sort into proper training-flow order
      const classifiedExercises = progressedExercises.map((ex) => ({
        ...ex,
        category: mapClassificationToCategory(ex.classification),
      }));
      const exercises = sortExercisesByCategory(classifiedExercises);

      for (let exIdx = 0; exIdx < exercises.length; exIdx++) {
        const ex = exercises[exIdx];

        await db.insert(sessionExercises).values({
          trainingSessionId: session.id,
          name: ex.name,
          category: ex.category,
          sets: typeof ex.sets === "number" ? ex.sets : null,
          reps: ex.reps ?? null,
          rest: ex.rest ?? null,
          tempo: null,
          notes: ex.notes ?? ex.intent ?? null,
          orderIndex: exIdx,
        });
      }
    }

    weekExerciseListsByDay.push(weekDayExercises);
  }

  logger.info({ systemId: system.id, userId }, "[TrainingSystem] createTrainingSystemFromProgram — complete");

  // ── Variation audit for strength builds ──────────────────────────────────
  if (isStrength && weekExerciseListsByDay.length === 4) {
    // Flatten each week to a single exercise list for Day 1 (primary session)
    const day1PerWeek = weekExerciseListsByDay.map((wk) => wk[0] ?? []);
    const variationAudit = validateStrengthWeekVariation(day1PerWeek);

    logger.info(
      { ...variationAudit, systemId: system.id },
      "[StrengthWeekVariationAudit] Variation check complete"
    );

    if (process.env.NODE_ENV !== "production") {
      console.log("[StrengthWeekVariationAudit]", JSON.stringify({
        systemId: system.id,
        ...variationAudit,
        source: "createTrainingSystemFromProgram",
      }));

      if (variationAudit.repairNeeded) {
        console.log("[StrengthWeekRepairAudit]", JSON.stringify({
          systemId: system.id,
          variationScore: variationAudit.variationScore,
          repairApplied: false,
          note: "Variation below threshold — check STRENGTH_EXERCISE_VARIANTS map coverage for these exercises",
          source: "createTrainingSystemFromProgram",
        }));
      }
    }
  }

  if (process.env.NODE_ENV !== "production") {
    const day1 = program.days[0];
    console.log("[MultiWeekBuildAudit]", JSON.stringify({
      newSystemId: system.id,
      programName: system.name,
      source: "createTrainingSystemFromProgram",
      totalWeeksGenerated: 4,
      weekNumbers: [1, 2, 3, 4],
      sessionsPerWeek: program.days.length,
      totalSessionsGenerated: 4 * program.days.length,
      strengthExpressionApplied: isStrength,
      weekProgressionApplied: true,
      day1Name: day1?.name ?? null,
      day1Exercises: (day1?.exercises ?? []).map((e) => e.name),
    }));
  }

  return system;
}

// ─── Upsert: update existing system or create new ───────────────────────────
//
// The Change Engine calls this instead of createTrainingSystemFromProgram.
// If the user already has an active training system, we UPDATE it in place:
//   - delete the existing phases (cascades to weeks → sessions → exercises)
//   - recreate everything from the new program structure
//   - keep the same system row/ID so the change log links correctly
// If no active system exists, we create a brand-new one.
//
// Returns { system, isUpdate } so callers can log the right message.

export async function upsertTrainingSystemFromProgram(
  userId: number,
  program: ChatProgram,
  focusMode?: string | null
): Promise<{ system: typeof trainingSystems.$inferSelect; isUpdate: boolean }> {
  if (!program.days || !Array.isArray(program.days) || program.days.length === 0) {
    throw new Error("Program must have at least one training day");
  }

  const resolvedFocusMode = focusMode ?? "strength";

  // Focus-aware: find the existing system for THIS focus lane only
  const existingSystem = await getActiveTrainingSystem(userId, resolvedFocusMode);

  // ── No active system for this focus → create fresh ────────────────────────
  if (!existingSystem) {
    const system = await createTrainingSystemFromProgram(userId, program, null, resolvedFocusMode);
    return { system, isUpdate: false };
  }

  // ── Active system exists → update in place ────────────────────────────────
  logger.info(
    { userId, systemId: existingSystem.id, programName: program.programName },
    "[TrainingSystem] upsertTrainingSystemFromProgram — updating existing system"
  );

  const inferredGoalUpsert = inferGoalFromProgram(program);
  // Speed and mobility programs must use their own phase configs.
  const goal = resolvedFocusMode === "speed" ? "speed"
             : resolvedFocusMode === "mobility" ? "mobility"
             : inferredGoalUpsert;
  const daysPerWeek = program.days.length;
  const phaseConfig = buildPhaseConfig(goal, daysPerWeek);

  // Update system-level metadata (goal/style may have changed)
  await db
    .update(trainingSystems)
    .set({
      name: program.programName,
      overarchingGoal: program.description ?? program.programName,
      trainingStyle: program.splitType ?? phaseConfig.phaseName,
      weeklyFrequency: daysPerWeek,
      metadata: {
        source: "chat_edit",
        focusMode: resolvedFocusMode,
        progressionStrategy: program.progressionStrategy ?? null,
        ...(program.blockMetadata ? {
          blockType: program.blockMetadata.blockType,
          blockDisplayName: program.blockMetadata.blockDisplayName,
          missionStatement: program.blockMetadata.missionStatement,
          weekProgressionArc: program.blockMetadata.weekProgressionArc,
          primaryAdaptation: program.blockMetadata.primaryAdaptation,
          volumeProfile: program.blockMetadata.volumeProfile,
          intensityProfile: program.blockMetadata.intensityProfile,
        } : {}),
      } as any,
    })
    .where(eq(trainingSystems.id, existingSystem.id));

  // Delete all existing phases — cascade removes weeks → sessions → exercises
  const existingPhases = await db
    .select({ id: trainingPhases.id })
    .from(trainingPhases)
    .where(eq(trainingPhases.trainingSystemId, existingSystem.id));

  for (const phase of existingPhases) {
    await db.delete(trainingPhases).where(eq(trainingPhases.id, phase.id));
  }

  // Recreate Phase 1 with the new program
  const [phase] = await db.insert(trainingPhases).values({
    trainingSystemId: existingSystem.id,
    name: phaseConfig.phaseName,
    goal: phaseConfig.phaseGoal,
    emphasis: phaseConfig.emphasis,
    weekCount: 4,
    orderIndex: 0,
    status: "current",
    notes: program.progressionStrategy ?? null,
  }).returning();

  // Link system → phase
  await db
    .update(trainingSystems)
    .set({ currentPhaseId: phase.id })
    .where(eq(trainingSystems.id, existingSystem.id));

  const dayOfWeekMap = assignDaysOfWeek(daysPerWeek);
  const isStrengthUpsert = resolvedFocusMode === "strength" || goal === "strength";

  // Track per-week exercise lists for variation validation (strength builds only)
  const weekExerciseListsByDayUpsert: ChatProgramExercise[][][] = []; // [weekIdx][dayIdx] = exercises

  // Recreate 4 weeks of sessions and exercises
  for (let weekIdx = 0; weekIdx < 4; weekIdx++) {
    const weekConfig = phaseConfig.weekConfigs[weekIdx];
    const weekNumber = weekIdx + 1;
    const isDeload = weekConfig.volumeLevel === "deload";

    const [week] = await db.insert(trainingWeeks).values({
      trainingPhaseId: phase.id,
      weekNumber,
      label: weekConfig.label,
      focus: weekConfig.focus,
      volumeLevel: weekConfig.volumeLevel,
      status: weekIdx === 0 ? "current" : "upcoming",
      orderIndex: weekIdx,
    }).returning();

    const weekDayExercisesUpsert: ChatProgramExercise[][] = [];

    for (let dayIdx = 0; dayIdx < program.days.length; dayIdx++) {
      const day = program.days[dayIdx];
      const sessionType = inferSessionType(day);
      const dayOfWeek = dayOfWeekMap[dayIdx] ?? dayIdx + 1;

      const warmupNotes = getWarmupNotes(sessionType, day.focus ?? day.name);
      // For strength builds, always use week-specific session notes to ensure W1-W4 differ.
      const coachingNotes = isStrengthUpsert
        ? getCoachingNotes(goal, weekIdx, day.name)
        : (day.notes ? day.notes : getCoachingNotes(goal, weekIdx, day.name));

      const [session] = await db.insert(trainingSessions).values({
        trainingWeekId: week.id,
        label: day.name,
        sessionType,
        dayOfWeek,
        emphasis: day.focus ?? null,
        warmupNotes,
        coachingNotes,
        isRestDay: sessionType === "rest",
        orderIndex: dayIdx,
      }).returning();

      // ── Apply week-aware exercise expression ──────────────────────────────
      // Strength: full expression engine (variant swaps, rep adjustments, rotation)
      // Other modes: simple set/note scaling
      const progressedExercises = isStrengthUpsert
        ? applyStrengthWeekExpression(day.exercises, weekNumber, isDeload)
        : applyWeekProgressionToExercises(day.exercises, weekNumber, isDeload);

      weekDayExercisesUpsert.push(progressedExercises);

      // Classify then sort into proper training-flow order
      const classifiedExercises = progressedExercises.map((ex) => ({
        ...ex,
        category: mapClassificationToCategory(ex.classification),
      }));
      const exercises = sortExercisesByCategory(classifiedExercises);

      for (let exIdx = 0; exIdx < exercises.length; exIdx++) {
        const ex = exercises[exIdx];

        await db.insert(sessionExercises).values({
          trainingSessionId: session.id,
          name: ex.name,
          category: ex.category,
          sets: typeof ex.sets === "number" ? ex.sets : null,
          reps: ex.reps ?? null,
          rest: ex.rest ?? null,
          tempo: null,
          notes: ex.notes ?? ex.intent ?? null,
          orderIndex: exIdx,
        });
      }
    }

    weekExerciseListsByDayUpsert.push(weekDayExercisesUpsert);
  }

  // ── Variation audit for strength builds ──────────────────────────────────
  if (isStrengthUpsert && weekExerciseListsByDayUpsert.length === 4) {
    const day1PerWeekUpsert = weekExerciseListsByDayUpsert.map((wk) => wk[0] ?? []);
    const variationAuditUpsert = validateStrengthWeekVariation(day1PerWeekUpsert);

    logger.info(
      { ...variationAuditUpsert, systemId: existingSystem.id },
      "[StrengthWeekVariationAudit] Variation check complete (upsert)"
    );

    if (process.env.NODE_ENV !== "production") {
      console.log("[StrengthWeekVariationAudit]", JSON.stringify({
        systemId: existingSystem.id,
        ...variationAuditUpsert,
        source: "upsertTrainingSystemFromProgram",
      }));

      if (variationAuditUpsert.repairNeeded) {
        console.log("[StrengthWeekRepairAudit]", JSON.stringify({
          systemId: existingSystem.id,
          variationScore: variationAuditUpsert.variationScore,
          repairApplied: false,
          note: "Variation below threshold — check STRENGTH_EXERCISE_VARIANTS map coverage",
          source: "upsertTrainingSystemFromProgram",
        }));
      }
    }
  }

  if (process.env.NODE_ENV !== "production") {
    console.log("[MultiWeekBuildAudit]", JSON.stringify({
      existingSystemId: existingSystem.id,
      programName: program.programName,
      source: "upsertTrainingSystemFromProgram",
      totalWeeksGenerated: 4,
      weekNumbers: [1, 2, 3, 4],
      sessionsPerWeek: program.days.length,
      totalSessionsGenerated: 4 * program.days.length,
      strengthExpressionApplied: isStrengthUpsert,
      weekProgressionApplied: true,
    }));
  }

  logger.info(
    { systemId: existingSystem.id, userId },
    "[TrainingSystem] upsertTrainingSystemFromProgram — update complete"
  );

  // Return refreshed system row
  const [updatedSystem] = await db
    .select()
    .from(trainingSystems)
    .where(eq(trainingSystems.id, existingSystem.id));

  return { system: updatedSystem, isUpdate: true };
}

// ─── Block Continuation Engine ─────────────────────────────────────────────────
//
// Handles block completion detection, next-block recommendation, and the
// generation of a true continuation phase on the existing training system.
//
// ─── Speed Continuation Block Configs ─────────────────────────────────────
// Speed chain: SPEED_RETURN_RECOVERY → SPEED_ACCELERATION_DEV → SPEED_MAX_VELOCITY
//              → SPEED_ELASTIC_PLYOMETRIC → (or SPEED_COD_REACTIVE → SPEED_ELASTIC_PLYOMETRIC)

const SPEED_CONTINUATION_BLOCK_CONFIGS: Record<string, {
  phaseName: string;
  phaseGoal: string;
  emphasis: string;
  weekConfigs: { label: string; focus: string; volumeLevel: "low" | "moderate" | "high" | "deload" }[];
}> = {
  SPEED_ACCELERATION_DEV: {
    phaseName: "Acceleration Development Block",
    phaseGoal: "Build drive phase mechanics and first-step power through short sprint work, wall drills, and resisted acceleration",
    emphasis: "Drive phase mechanics, horizontal force production, acceleration posture",
    weekConfigs: [
      { label: "Week 1 — Establish", focus: "Mechanics drills, sub-maximal acceleration at 80–85%, wall series, posture cues", volumeLevel: "moderate" },
      { label: "Week 2 — Build", focus: "Add 1 sprint rep, introduce resisted starts, progress distance to 20m", volumeLevel: "high" },
      { label: "Week 3 — Intensify", focus: "Full intent sprints, contrast method (resisted → free), block start exposure", volumeLevel: "high" },
      { label: "Week 4 — Deload", focus: "50% sprint volume, mechanics review, A-skip quality, no max intent", volumeLevel: "deload" },
    ],
  },
  SPEED_MAX_VELOCITY: {
    phaseName: "Maximum Velocity Block",
    phaseGoal: "Develop top-end speed through flying sprint exposures, stride mechanics, and front-side drive",
    emphasis: "Stride mechanics, front-side drive, elastic stiffness at top speed",
    weekConfigs: [
      { label: "Week 1 — Establish", focus: "Build-up runs, flying 20s at 90%, wicket drills, B-Skip mechanics", volumeLevel: "moderate" },
      { label: "Week 2 — Build", focus: "Flying 30s at 95%, stride count awareness, wicket run cadence", volumeLevel: "high" },
      { label: "Week 3 — Intensify", focus: "Full-intent flying sprints, combine with elastic hops, stride expression", volumeLevel: "high" },
      { label: "Week 4 — Deload", focus: "Sub-maximal build-ups, mechanics review only, no max-intent runs", volumeLevel: "deload" },
    ],
  },
  SPEED_COD_REACTIVE: {
    phaseName: "Change of Direction & Reactive Block",
    phaseGoal: "Develop deceleration control, COD mechanics, and reactive decision-making under sport-relevant pressure",
    emphasis: "Penultimate step mechanics, decel absorption, reactive open-skill agility",
    weekConfigs: [
      { label: "Week 1 — Establish", focus: "Closed COD drills at 80%, decel mechanics, 505 technique, single-leg landing control", volumeLevel: "moderate" },
      { label: "Week 2 — Build", focus: "Increase COD speed, introduce split decisions, L-drill and T-drill combinations", volumeLevel: "high" },
      { label: "Week 3 — Intensify", focus: "Full-speed COD, reactive cues added, sport-pattern integration", volumeLevel: "high" },
      { label: "Week 4 — Deload", focus: "Low-speed technique review, no reactive pressure, movement quality only", volumeLevel: "deload" },
    ],
  },
  SPEED_ELASTIC_PLYOMETRIC: {
    phaseName: "Elastic & Reactive Output Block",
    phaseGoal: "Develop stretch-shortening cycle capacity and reactive strength through progressive plyometric exposure",
    emphasis: "Ground contact time, ankle stiffness, SSC reactive strength index",
    weekConfigs: [
      { label: "Week 1 — Establish", focus: "Stiffness hops, low-amplitude pogo, single-leg ankle hops, depth drop introduction", volumeLevel: "moderate" },
      { label: "Week 2 — Build", focus: "Lateral hurdle hops, bounding, reactive jumps, contact quality cues", volumeLevel: "high" },
      { label: "Week 3 — Intensify", focus: "Complex pairs (elastic → sprint), full plyometric expressions, peak contact force", volumeLevel: "high" },
      { label: "Week 4 — Deload", focus: "Half contact volume, stiffness hops only, full recovery between efforts", volumeLevel: "deload" },
    ],
  },
  SPEED_FOOTWORK_RHYTHM: {
    phaseName: "Footwork & Rhythm Development Block",
    phaseGoal: "Build foot contact quality, coordination patterns, and neuromuscular timing through ladder and rhythm work",
    emphasis: "Foot contact quality, coordination sequencing, neuromuscular timing",
    weekConfigs: [
      { label: "Week 1 — Establish", focus: "Basic ladder patterns, shuffle mechanics, in-out and Ickey shuffle at controlled speed", volumeLevel: "moderate" },
      { label: "Week 2 — Build", focus: "Increase ladder speed, add lateral and diagonal patterns, crossover step complexity", volumeLevel: "high" },
      { label: "Week 3 — Intensify", focus: "Full rhythm speed, combine ladder with sprint, shadow footwork reactive add", volumeLevel: "high" },
      { label: "Week 4 — Deload", focus: "Low speed pattern review, light shadow work, no reactive pressure", volumeLevel: "deload" },
    ],
  },
  SPEED_RETURN_RECOVERY: {
    phaseName: "Return-to-Speed & Tissue Prep Block",
    phaseGoal: "Restore movement quality, prepare tendons and posterior chain for return to sprint and COD demand",
    emphasis: "Sub-maximal exposure, tissue prep, deceleration reintroduction, tendon health",
    weekConfigs: [
      { label: "Week 1 — Reset", focus: "Nordic curls, isometric holds, ankle stiffness prep, straight-leg calf march, no sprinting", volumeLevel: "low" },
      { label: "Week 2 — Restore", focus: "Build-ups at 70%, light ladder, single-leg hip hinge, Copenhagen adductor", volumeLevel: "moderate" },
      { label: "Week 3 — Rebuild", focus: "Build-ups at 80%, closed COD at slow speed, basic plyometric exposure", volumeLevel: "moderate" },
      { label: "Week 4 — Prime", focus: "Sub-maximal sprint exposure at 85%, prepare for acceleration block entry", volumeLevel: "low" },
    ],
  },
};

function inferSpeedBlockTypeFromName(name: string): string {
  const n = name.toLowerCase();
  if (n.includes("return") || n.includes("tissue") || n.includes("recovery") || n.includes("rehab")) return "SPEED_RETURN_RECOVERY";
  if (n.includes("footwork") || n.includes("rhythm") || n.includes("ladder") || n.includes("coordination")) return "SPEED_FOOTWORK_RHYTHM";
  if (n.includes("elastic") || n.includes("plyometric") || n.includes("reactive output") || n.includes("ssc")) return "SPEED_ELASTIC_PLYOMETRIC";
  if (n.includes("cod") || n.includes("change of direction") || n.includes("agility") || n.includes("decel") || n.includes("reactive")) return "SPEED_COD_REACTIVE";
  if (n.includes("max velocity") || n.includes("top speed") || n.includes("flying sprint") || n.includes("velocity")) return "SPEED_MAX_VELOCITY";
  return "SPEED_ACCELERATION_DEV"; // Default entry point for speed programs
}

function buildSpeedNextBlockRecommendation(blockType: string): {
  blockType: string;
  displayName: string;
  rationale: string;
  whatBuilt: string[];
} {
  const chain: Record<string, { blockType: string; displayName: string; rationale: string; whatBuilt: string[] }> = {
    SPEED_RETURN_RECOVERY: {
      blockType: "SPEED_ACCELERATION_DEV",
      displayName: "Acceleration Development Block",
      rationale: "Tissue and posterior chain readiness restored. Next: reintroduce max-intent sprint work starting from the drive phase up.",
      whatBuilt: ["Posterior chain tendon readiness", "Sub-maximal sprint tolerance", "Deceleration control quality", "Foundation for high-intensity sprint work"],
    },
    SPEED_ACCELERATION_DEV: {
      blockType: "SPEED_MAX_VELOCITY",
      displayName: "Maximum Velocity Block",
      rationale: "Drive phase and first-step power established. Next: develop top-end speed and stride mechanics through flying sprint work.",
      whatBuilt: ["Drive phase mechanics and posture", "First-step explosive power", "Horizontal force production", "Resisted sprint tolerance"],
    },
    SPEED_FOOTWORK_RHYTHM: {
      blockType: "SPEED_COD_REACTIVE",
      displayName: "Change of Direction & Reactive Block",
      rationale: "Foot contact quality and coordination patterns established. Next: integrate COD mechanics and reactive decision-making.",
      whatBuilt: ["Foot contact quality and timing", "Coordination pattern fluency", "Neuromuscular sequencing", "Rhythm base for agility work"],
    },
    SPEED_MAX_VELOCITY: {
      blockType: "SPEED_ELASTIC_PLYOMETRIC",
      displayName: "Elastic & Reactive Output Block",
      rationale: "Top-end speed developed. Next: sharpen elastic output and ground contact quality to express speed more efficiently.",
      whatBuilt: ["Top-end sprint mechanics", "Stride rate and length efficiency", "Front-side drive expression", "Flying sprint capacity"],
    },
    SPEED_COD_REACTIVE: {
      blockType: "SPEED_ELASTIC_PLYOMETRIC",
      displayName: "Elastic & Reactive Output Block",
      rationale: "COD control and reactive decisions developed. Next: sharpen elastic output to support faster cuts and direction changes.",
      whatBuilt: ["COD technique and decel absorption", "Reactive decision-making speed", "Penultimate step mechanics", "Sport-specific agility patterns"],
    },
    SPEED_ELASTIC_PLYOMETRIC: {
      blockType: "SPEED_ACCELERATION_DEV",
      displayName: "Acceleration Development Block",
      rationale: "Elastic and reactive capacity built. Cycle back to re-establish drive phase and first-step power with more elastic support.",
      whatBuilt: ["Stretch-shortening cycle capacity", "Ground contact quality and stiffness", "Reactive strength index", "Plyometric force absorption"],
    },
  };
  return chain[blockType] ?? chain["SPEED_ACCELERATION_DEV"];
}

// ─── Strength Continuation Block Configs ──────────────────────────────────
// Block chain: FOUNDATION_ACCUMULATION → INTENSIFICATION_STRENGTH
//              → POWER_ELASTIC_CONVERSION → REBUILD_DELOAD → (cycle repeats)

const CONTINUATION_BLOCK_CONFIGS: Record<string, {
  phaseName: string;
  phaseGoal: string;
  emphasis: string;
  weekConfigs: { label: string; focus: string; volumeLevel: "low" | "moderate" | "high" | "deload" }[];
}> = {
  FOUNDATION_ACCUMULATION: {
    phaseName: "Foundation Strength Block",
    phaseGoal: "Build foundational strength across primary movement patterns with increasing volume",
    emphasis: "Movement quality, progressive volume, tissue adaptation",
    weekConfigs: [
      { label: "Week 1 — Establish", focus: "Baseline loading, technique focus across all patterns", volumeLevel: "moderate" },
      { label: "Week 2 — Accumulate", focus: "Volume building, movement competency at higher loads", volumeLevel: "high" },
      { label: "Week 3 — Peak Volume", focus: "Maximum volume week, full pattern exposure", volumeLevel: "high" },
      { label: "Week 4 — Deload", focus: "Recovery and movement consolidation before intensification", volumeLevel: "deload" },
    ],
  },
  INTENSIFICATION_STRENGTH: {
    phaseName: "Intensification Strength Block",
    phaseGoal: "Convert accumulated volume into peak strength through progressive heavy loading",
    emphasis: "Heavy compound loading, strength expression, CNS adaptation",
    weekConfigs: [
      { label: "Week 1 — Ramp", focus: "Load introduction, technique at higher intensities", volumeLevel: "moderate" },
      { label: "Week 2 — Build", focus: "Loading progression, technical proficiency under fatigue", volumeLevel: "high" },
      { label: "Week 3 — Peak", focus: "Peak intensity week, maximum loading across primary lifts", volumeLevel: "high" },
      { label: "Week 4 — Deload", focus: "CNS recovery and strength consolidation", volumeLevel: "deload" },
    ],
  },
  POWER_ELASTIC_CONVERSION: {
    phaseName: "Power Conversion Block",
    phaseGoal: "Convert peak strength into explosive power and reactive capacity",
    emphasis: "Rate of force development, elastic energy, contrast training",
    weekConfigs: [
      { label: "Week 1 — Introduce", focus: "Power movement exposure, contrast training introduction", volumeLevel: "moderate" },
      { label: "Week 2 — Develop", focus: "Contrast pairs, elastic loading, plyometric volume build", volumeLevel: "high" },
      { label: "Week 3 — Express", focus: "Maximum power output, full elastic chain activation", volumeLevel: "high" },
      { label: "Week 4 — Taper", focus: "CNS freshness, movement quality, competition readiness", volumeLevel: "deload" },
    ],
  },
  REBUILD_DELOAD: {
    phaseName: "Rebuild & Recovery Block",
    phaseGoal: "Restore CNS capacity, address tissue quality, and prime the next training cycle",
    emphasis: "Sub-maximal loading, movement quality, tissue health",
    weekConfigs: [
      { label: "Week 1 — Reset", focus: "Active recovery, movement quality restoration", volumeLevel: "low" },
      { label: "Week 2 — Restore", focus: "Tissue work, sub-maximal loading, pattern reinforcement", volumeLevel: "moderate" },
      { label: "Week 3 — Rebuild", focus: "Quality volume, re-establishing movement competency", volumeLevel: "moderate" },
      { label: "Week 4 — Prime", focus: "Prepare CNS and tissue for the next block", volumeLevel: "low" },
    ],
  },
};

function inferBlockTypeFromName(name: string): string {
  const n = name.toLowerCase();
  if (n.includes("power") || n.includes("conversion") || n.includes("elastic")) return "POWER_ELASTIC_CONVERSION";
  if (n.includes("intensif") || n.includes("strength")) return "INTENSIFICATION_STRENGTH";
  if (n.includes("rebuild") || n.includes("deload") || n.includes("recovery")) return "REBUILD_DELOAD";
  return "FOUNDATION_ACCUMULATION";
}

function buildNextBlockRecommendation(blockType: string): {
  blockType: string;
  displayName: string;
  rationale: string;
  whatBuilt: string[];
} {
  const chain: Record<string, { blockType: string; displayName: string; rationale: string; whatBuilt: string[] }> = {
    FOUNDATION_ACCUMULATION: {
      blockType: "INTENSIFICATION_STRENGTH",
      displayName: "Intensification Strength Block",
      rationale: "You've built the base. Next: convert volume into intensity — heavier loads, peak strength.",
      whatBuilt: [
        "Baseline strength and tissue tolerance",
        "Movement quality across all patterns",
        "Volume base for intensification",
        "Consistent training habits and work capacity",
      ],
    },
    INTENSIFICATION_STRENGTH: {
      blockType: "POWER_ELASTIC_CONVERSION",
      displayName: "Power Conversion Block",
      rationale: "Peak strength achieved. Next: convert that strength into explosive power.",
      whatBuilt: [
        "Peak strength across main lifts",
        "CNS efficiency and neuromuscular drive",
        "High-intensity loading tolerance",
        "Mental toughness under heavy loads",
      ],
    },
    POWER_ELASTIC_CONVERSION: {
      blockType: "REBUILD_DELOAD",
      displayName: "Rebuild & Recovery Block",
      rationale: "High-output block complete. Recover, restore, and prime the system for the next cycle.",
      whatBuilt: [
        "Explosive power and rate of force development",
        "Elastic energy capacity and reactive strength",
        "Athletic movement quality",
        "CNS readiness for high-demand output",
      ],
    },
    REBUILD_DELOAD: {
      blockType: "FOUNDATION_ACCUMULATION",
      displayName: "Foundation Strength Block",
      rationale: "Recovery complete. Begin the next training cycle with a fresh foundation phase.",
      whatBuilt: [
        "CNS and tissue restoration",
        "Movement quality refinement",
        "Psychological freshness for hard training",
        "Foundation primed for the next intensity cycle",
      ],
    },
  };
  return chain[blockType] ?? chain["FOUNDATION_ACCUMULATION"];
}

// ─── getBlockCompletionStatus ─────────────────────────────────────────────────

export async function getBlockCompletionStatus(userId: number, focusMode?: string | null) {
  const system = await getActiveTrainingSystem(userId, focusMode);
  if (!system) return null;

  const allPhases = await db
    .select()
    .from(trainingPhases)
    .where(eq(trainingPhases.trainingSystemId, system.id))
    .orderBy(trainingPhases.orderIndex);

  const currentPhase = allPhases.find((p) => p.status === "current") ?? null;
  const completedPhases = allPhases.filter((p) => p.status === "completed");

  // Check if current phase's Week 4 is marked completed (natural completion)
  let isCurrentPhaseWeek4Complete = false;
  if (currentPhase) {
    const [week4] = await db
      .select()
      .from(trainingWeeks)
      .where(and(eq(trainingWeeks.trainingPhaseId, currentPhase.id), eq(trainingWeeks.weekNumber, 4)));
    isCurrentPhaseWeek4Complete = week4?.status === "completed";
  }

  const isComplete = isCurrentPhaseWeek4Complete || (!currentPhase && completedPhases.length > 0);

  // The phase to use for recommendations
  const completedPhaseForRec = (isCurrentPhaseWeek4Complete && currentPhase)
    ? currentPhase
    : completedPhases[completedPhases.length - 1] ?? null;

  if (!isComplete || !completedPhaseForRec) {
    return {
      isComplete: false,
      completedPhase: null,
      nextRecommendation: null,
      blockChainIndex: completedPhases.length,
    };
  }

  const blockType = (completedPhaseForRec.metadata as any)?.blockType
    ?? inferBlockTypeFromName(completedPhaseForRec.name);
  const nextRecommendation = buildNextBlockRecommendation(blockType);

  return {
    isComplete: true,
    completedPhase: {
      id: completedPhaseForRec.id,
      name: completedPhaseForRec.name,
      goal: completedPhaseForRec.goal,
      blockType,
    },
    nextRecommendation,
    blockChainIndex: completedPhases.length + (isCurrentPhaseWeek4Complete ? 1 : 0),
  };
}

// ─── markBlockComplete ─────────────────────────────────────────────────────────

export async function markBlockComplete(userId: number, focusMode?: string | null) {
  const system = await getActiveTrainingSystem(userId, focusMode);
  if (!system) throw new Error("No active training system found");

  const [currentPhase] = await db
    .select()
    .from(trainingPhases)
    .where(and(eq(trainingPhases.trainingSystemId, system.id), eq(trainingPhases.status, "current")));

  if (!currentPhase) throw new Error("No current phase to mark as complete");

  await db.update(trainingWeeks).set({ status: "completed" }).where(eq(trainingWeeks.trainingPhaseId, currentPhase.id));
  await db.update(trainingPhases).set({ status: "completed" }).where(eq(trainingPhases.id, currentPhase.id));

  logger.info({ userId, phaseId: currentPhase.id }, "[TrainingSystem] markBlockComplete — phase marked as completed");
  return { completedPhaseId: currentPhase.id, phaseName: currentPhase.name };
}

// ─── generateContinuationPhase ────────────────────────────────────────────────

export async function generateContinuationPhase(
  userId: number,
  options: { mode: "next" | "repeat"; adjustments?: string[]; blockTypeOverride?: string; focusMode?: string | null }
): Promise<typeof trainingPhases.$inferSelect> {
  const system = await getActiveTrainingSystem(userId, options.focusMode);
  if (!system) throw new Error("No active training system found");

  const allPhases = await db
    .select()
    .from(trainingPhases)
    .where(eq(trainingPhases.trainingSystemId, system.id))
    .orderBy(trainingPhases.orderIndex);

  const currentPhase = allPhases.find((p) => p.status === "current") ?? null;
  const lastCompletedPhase = [...allPhases].reverse().find((p) => p.status === "completed") ?? null;
  const previousPhase = currentPhase ?? lastCompletedPhase;
  if (!previousPhase) throw new Error("No existing phase to continue from");

  // Mark current phase and all its weeks as completed
  if (currentPhase && currentPhase.status === "current") {
    await db.update(trainingWeeks).set({ status: "completed" }).where(eq(trainingWeeks.trainingPhaseId, currentPhase.id));
    await db.update(trainingPhases).set({ status: "completed" }).where(eq(trainingPhases.id, currentPhase.id));
  }

  // Detect focus mode from system metadata to use the correct block chain
  const systemFocusMode = (system.metadata as any)?.focusMode ?? "strength";
  const isSpeedSystem = systemFocusMode === "speed";

  const previousBlockType = (previousPhase.metadata as any)?.blockType
    ?? (isSpeedSystem ? inferSpeedBlockTypeFromName(previousPhase.name) : inferBlockTypeFromName(previousPhase.name));
  const recommendation = isSpeedSystem
    ? buildSpeedNextBlockRecommendation(previousBlockType)
    : buildNextBlockRecommendation(previousBlockType);

  const [profile] = await db.select().from(userProfilesTable).where(eq(userProfilesTable.userId, userId));
  const goal = profile ? normalizeGoal(profile.trainingGoal) : "general_fitness";
  const daysPerWeek = profile?.daysPerWeek ?? 3;
  const equipment = profile ? normalizeEquipment(profile.equipmentAccess) : "full_gym";
  const experience = profile ? normalizeExperience(profile.experienceLevel ?? "intermediate") : "intermediate";
  const injuryFlags = detectInjuryFlags(profile?.injuries ?? null);

  // Read last 30 days of session logs to carry performance signals into the new block
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
  const recentLogs = await db
    .select({
      sessionStatus: sessionLogsTable.sessionStatus,
      difficultyScore: sessionLogsTable.difficultyScore,
      painScore: sessionLogsTable.painScore,
      energyScore: sessionLogsTable.energyScore,
    })
    .from(sessionLogsTable)
    .where(and(eq(sessionLogsTable.userId, userId), gte(sessionLogsTable.completedAt, thirtyDaysAgo)));

  const completedLogs = recentLogs.filter(
    (f) => f.sessionStatus === "completed" || f.sessionStatus === "partial"
  );
  const avgDifficulty =
    completedLogs.length > 0
      ? completedLogs.reduce((s, f) => s + (f.difficultyScore ?? 3), 0) / completedLogs.length
      : 3;
  const avgEnergy =
    completedLogs.length > 0
      ? completedLogs.reduce((s, f) => s + (f.energyScore ?? 3), 0) / completedLogs.length
      : 3;
  const painFreq =
    completedLogs.length > 0
      ? completedLogs.filter((f) => (f.painScore ?? 0) >= 3).length / completedLogs.length
      : 0;
  const adherenceRate =
    recentLogs.length > 0 ? completedLogs.length / recentLogs.length : 1;
  const fatigueTrend = (avgDifficulty + (6 - avgEnergy)) / 2; // 1–5 composite

  // ── Part 6: Performance-aware block type selection ────────────────────────
  // Override the default chain recommendation when actual signals demand it.
  // Priority: explicit override > performance-based signal > default chain.

  // De-escalation maps — mode-specific
  const blockDeEscalateMap: Record<string, string> = isSpeedSystem ? {
    SPEED_MAX_VELOCITY: "SPEED_ACCELERATION_DEV",
    SPEED_COD_REACTIVE: "SPEED_FOOTWORK_RHYTHM",
    SPEED_ELASTIC_PLYOMETRIC: "SPEED_ACCELERATION_DEV",
    SPEED_ACCELERATION_DEV: "SPEED_RETURN_RECOVERY",
  } : {
    INTENSIFICATION_STRENGTH: "FOUNDATION_ACCUMULATION",
    POWER_ELASTIC_CONVERSION: "INTENSIFICATION_STRENGTH",
    REBUILD_DELOAD: "FOUNDATION_ACCUMULATION",
  };
  const safetyResetBlockType = isSpeedSystem ? "SPEED_RETURN_RECOVERY" : "FOUNDATION_ACCUMULATION";

  let intelligentNextBlockType = options.blockTypeOverride
    ?? (options.mode === "repeat" ? previousBlockType : recommendation.blockType);

  if (!options.blockTypeOverride && options.mode !== "repeat" && completedLogs.length >= 3) {
    if (adherenceRate < 0.55 || (avgDifficulty >= 4.5 && painFreq >= 0.35)) {
      // Severe stress signals — restart at foundation / return-to-speed level
      intelligentNextBlockType = safetyResetBlockType;
    } else if (fatigueTrend >= 4.0 || painFreq >= 0.35 || (avgDifficulty >= 4.2 && adherenceRate < 0.75)) {
      // Significant stress — de-escalate one block type rather than progressing
      intelligentNextBlockType = blockDeEscalateMap[recommendation.blockType] ?? recommendation.blockType;
    } else if (avgDifficulty <= 2.0 && adherenceRate >= 0.90 && fatigueTrend <= 2.5) {
      // Strong performance — standard chain is fine (accelerate note added below)
      intelligentNextBlockType = recommendation.blockType;
    }
  }
  const nextBlockType = intelligentNextBlockType;

  // Build coaching notes from actual performance signals — mode-aware language
  const adaptationNotes: string[] = [];
  if (avgDifficulty >= 4.2) {
    adaptationNotes.push(isSpeedSystem
      ? "Your last block was consistently demanding — CNS load was high. I'm starting this block at conservative sprint volume before building. Walking into a new speed block already fatigued kills quality."
      : "Based on how your last block went — consistently hard — I'm starting this one at a conservative load before building. No point walking into a new block already in a hole."
    );
  } else if (avgDifficulty <= 2.3 && completedLogs.length >= 3) {
    adaptationNotes.push(isSpeedSystem
      ? "Last block felt well within your capacity — you absorbed the sprint work well. I'm starting this block with more challenge built in from the beginning."
      : "Last block felt comfortable throughout — I'm starting this one with more challenge built in from the beginning."
    );
  }
  if (painFreq >= 0.35) {
    adaptationNotes.push(isSpeedSystem
      ? "Discomfort was flagged across a chunk of last block's sessions — sprint and tendon load in this block is managed carefully. Protect the tissue quality first."
      : "Discomfort was flagged across a fair chunk of last block's sessions — exercise selection in this block is kept conservative and injury-aware."
    );
  }
  if (adherenceRate < 0.65 && recentLogs.length >= 3) {
    adaptationNotes.push(isSpeedSystem
      ? "Consistency took a hit last block. Speed sessions in this block are tighter and shorter — easier to execute when life gets in the way. Showing up beats volume."
      : "Consistency took a hit last block. I've kept sessions in this block tighter — less volume, easier to execute when life gets in the way."
    );
  }
  if (fatigueTrend >= 4.0 && completedLogs.length >= 3) {
    adaptationNotes.push(isSpeedSystem
      ? "Fatigue was building into the end of last block. CNS recovery is the priority — first week here is sub-maximal. Sprint quality over sprint quantity."
      : "Fatigue was accumulating into the end of last block. First week here is intentionally easier — give the body time to reset before we build again."
    );
  }

  const coachGoal: CoachGoalType = goal === "athletic" ? "athletic_performance" : (goal as CoachGoalType);
  const coachEquipment: CoachEquipmentLevel =
    equipment === "dumbbells" ? "dumbbells_only" :
    equipment === "minimal" ? "home_limited" :
    (equipment as CoachEquipmentLevel);

  // Select the block config from the correct mode's config map
  const nextBlockConfig = isSpeedSystem
    ? (SPEED_CONTINUATION_BLOCK_CONFIGS[nextBlockType] ?? SPEED_CONTINUATION_BLOCK_CONFIGS["SPEED_ACCELERATION_DEV"])
    : (CONTINUATION_BLOCK_CONFIGS[nextBlockType] ?? CONTINUATION_BLOCK_CONFIGS["FOUNDATION_ACCUMULATION"]);
  const blockChainIndex = allPhases.length;

  const [newPhase] = await db.insert(trainingPhases).values({
    trainingSystemId: system.id,
    name: nextBlockConfig.phaseName,
    goal: nextBlockConfig.phaseGoal,
    emphasis: nextBlockConfig.emphasis,
    weekCount: 4,
    orderIndex: blockChainIndex,
    status: "current",
    notes: [
      options.adjustments?.length ? `Coach adjustments: ${options.adjustments.join(", ")}` : null,
      adaptationNotes.length > 0 ? adaptationNotes.join(" ") : null,
    ].filter(Boolean).join(" ") || null,
    metadata: {
      blockType: nextBlockType,
      blockDisplayName: nextBlockConfig.phaseName,
      previousPhaseId: previousPhase.id,
      blockChainIndex,
      adjustments: options.adjustments ?? [],
      continuationMode: options.mode,
      adaptationSignals: {
        avgDifficulty: Math.round(avgDifficulty * 10) / 10,
        painFrequency: Math.round(painFreq * 100),
        adherenceRate: Math.round(adherenceRate * 100),
        fatigueTrend: Math.round(fatigueTrend * 10) / 10,
        sessionCount: recentLogs.length,
        intelligentOverride: intelligentNextBlockType !== recommendation.blockType,
      },
    },
  }).returning();

  await db.update(trainingSystems).set({ currentPhaseId: newPhase.id }).where(eq(trainingSystems.id, system.id));

  const splitDays = splitMaps[Math.min(daysPerWeek, 6)] ?? splitMaps[3];

  for (let weekIdx = 0; weekIdx < 4; weekIdx++) {
    const weekConfig = nextBlockConfig.weekConfigs[weekIdx];
    const weekNumber = weekIdx + 1;
    const isDeload = weekConfig.volumeLevel === "deload" || weekConfig.volumeLevel === "low";

    const [week] = await db.insert(trainingWeeks).values({
      trainingPhaseId: newPhase.id,
      weekNumber,
      label: weekConfig.label,
      focus: weekConfig.focus,
      volumeLevel: weekConfig.volumeLevel,
      status: weekIdx === 0 ? "current" : "upcoming",
      orderIndex: weekIdx,
    }).returning();

    for (let sessionIdx = 0; sessionIdx < splitDays.length; sessionIdx++) {
      const splitDay = splitDays[sessionIdx];

      const [session] = await db.insert(trainingSessions).values({
        trainingWeekId: week.id,
        label: splitDay.label,
        sessionType: splitDay.sessionType,
        dayOfWeek: splitDay.dayOfWeek,
        emphasis: splitDay.emphasis,
        warmupNotes: getWarmupNotes(splitDay.sessionType, splitDay.emphasis),
        coachingNotes: getCoachingNotes(goal, weekIdx, splitDay.label),
        isRestDay: false,
        orderIndex: sessionIdx,
      }).returning();

      const coachExercises = await selectSessionExercises({
        sessionType: splitDay.coachSessionType,
        goal: coachGoal,
        experience: experience as CoachExperienceTier,
        equipment: coachEquipment,
        injuryFlags: injuryFlags.map(String),
        weekNumber: isDeload ? 4 : weekNumber,
      });

      const rawCoachExercises = isDeload
        ? coachExercises.slice(0, Math.max(Math.ceil(coachExercises.length * 0.6), 2))
        : coachExercises;

      const mappedExercises = rawCoachExercises.map((ex) => {
        const category: ExerciseCategory =
          ex.role === "explosive"    ? "power" :
          ex.role === "primary"      ? "primary" :
          ex.role === "secondary"    ? "secondary" :
          ex.role === "conditioning" ? "conditioning" :
          "accessory";
        return { ...ex, category };
      });
      const orderedExercises = sortExercisesByCategory(mappedExercises);

      for (let exIdx = 0; exIdx < orderedExercises.length; exIdx++) {
        const ex = orderedExercises[exIdx];
        await db.insert(sessionExercises).values({
          trainingSessionId: session.id,
          name: ex.name,
          category: ex.category,
          sets: ex.sets,
          reps: ex.reps,
          rest: ex.rest,
          tempo: null,
          notes: ex.notes,
          orderIndex: exIdx,
        });
      }
    }
  }

  logger.info(
    { userId, systemId: system.id, newPhaseId: newPhase.id, nextBlockType, mode: options.mode },
    "[TrainingSystem] generateContinuationPhase — new block created"
  );
  return newPhase;
}

// ─── advanceToNextWeek ────────────────────────────────────────────────────────
//
// Marks the current training week as completed and advances to the next.
// If the completed week was the final one (Week 4), marks the phase complete too.
// Returns a descriptor of the transition so callers can post chat acknowledgments.

export interface WeekAdvanceResult {
  previousWeek: { id: number; weekNumber: number; label: string | null };
  newWeek: { id: number; weekNumber: number; label: string | null; volumeLevel: string } | null;
  blockCompleted: boolean;
  completedPhaseName?: string;
  completedPhaseId?: number;
}

export async function advanceToNextWeek(userId: number, focusMode?: string | null): Promise<WeekAdvanceResult | null> {
  const system = await getActiveTrainingSystem(userId, focusMode);
  if (!system || !system.currentPhaseId) return null;

  const [currentPhase] = await db
    .select()
    .from(trainingPhases)
    .where(and(eq(trainingPhases.id, system.currentPhaseId), eq(trainingPhases.status, "current")));

  if (!currentPhase) return null;

  const allWeeks = await db
    .select()
    .from(trainingWeeks)
    .where(eq(trainingWeeks.trainingPhaseId, currentPhase.id))
    .orderBy(trainingWeeks.orderIndex);

  const currentWeekIdx = allWeeks.findIndex((w) => w.status === "current");
  if (currentWeekIdx === -1) return null;

  const currentWeek = allWeeks[currentWeekIdx];
  const nextWeek = allWeeks[currentWeekIdx + 1] ?? null;

  // Mark current week complete
  await db.update(trainingWeeks).set({ status: "completed" }).where(eq(trainingWeeks.id, currentWeek.id));

  if (nextWeek) {
    // Advance to next week
    await db.update(trainingWeeks).set({ status: "current" }).where(eq(trainingWeeks.id, nextWeek.id));
    logger.info(
      { userId, fromWeek: currentWeek.weekNumber, toWeek: nextWeek.weekNumber },
      "[TrainingSystem] advanceToNextWeek — week advanced"
    );
    return {
      previousWeek: { id: currentWeek.id, weekNumber: currentWeek.weekNumber, label: currentWeek.label },
      newWeek: { id: nextWeek.id, weekNumber: nextWeek.weekNumber, label: nextWeek.label, volumeLevel: nextWeek.volumeLevel },
      blockCompleted: false,
    };
  } else {
    // This was the final week — mark phase complete
    await db.update(trainingPhases).set({ status: "completed" }).where(eq(trainingPhases.id, currentPhase.id));
    logger.info(
      { userId, phaseId: currentPhase.id, phaseName: currentPhase.name },
      "[TrainingSystem] advanceToNextWeek — final week complete, block marked done"
    );
    return {
      previousWeek: { id: currentWeek.id, weekNumber: currentWeek.weekNumber, label: currentWeek.label },
      newWeek: null,
      blockCompleted: true,
      completedPhaseName: currentPhase.name,
      completedPhaseId: currentPhase.id,
    };
  }
}
