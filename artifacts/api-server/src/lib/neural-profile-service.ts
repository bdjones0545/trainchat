/**
 * Neural Profile Service — Gamification + Progression Layer
 *
 * Manages XP, levels, milestones, and neural connection metrics.
 * Tone: performance-driven, scientific, athlete-focused.
 * Philosophy: every metric traces back to a real training behavior.
 */

import { db, neuralProfilesTable, sessionLogsTable, exerciseLogsTable, readinessEntriesTable } from "@workspace/db";
import { eq, desc, count, and, gte } from "drizzle-orm";

// ─── Level System ─────────────────────────────────────────────────────────────
// Total XP required to REACH level N (1-indexed).
// Growth formula: each level costs 100 more XP than the previous.
// Level 2: 500, Level 3: 1100, Level 4: 1800, Level 5: 2600, ...

export function xpRequiredForLevel(level: number): number {
  if (level <= 1) return 0;
  // Cumulative: sum of (500 + (i-1)*100) for i=2..level
  let total = 0;
  for (let i = 2; i <= level; i++) {
    total += 500 + (i - 2) * 100;
  }
  return total;
}

export function levelFromXp(totalXp: number): number {
  let level = 1;
  while (xpRequiredForLevel(level + 1) <= totalXp) level++;
  return level;
}

export function xpToNextLevel(level: number, currentXp: number): number {
  const nextThreshold = xpRequiredForLevel(level + 1);
  return Math.max(0, nextThreshold - currentXp);
}

export function xpProgressInLevel(level: number, currentXp: number): number {
  const levelStart = xpRequiredForLevel(level);
  const levelEnd = xpRequiredForLevel(level + 1);
  const progress = currentXp - levelStart;
  const span = levelEnd - levelStart;
  return Math.round((progress / span) * 100);
}

export function levelLabel(level: number): string {
  if (level <= 2) return "Developing Trainee";
  if (level <= 5) return "Structured Athlete";
  if (level <= 10) return "Disciplined Competitor";
  if (level <= 15) return "High Performance";
  if (level <= 20) return "Elite Adherence";
  return "Neural Master";
}

// ─── XP Awards ───────────────────────────────────────────────────────────────

export type XpEvent =
  | "session_completed"
  | "session_perfect"
  | "progression_achieved"
  | "streak_day"
  | "milestone_unlocked"
  | "first_session"
  | "sessions_5"
  | "sessions_20"
  | "sessions_50"
  | "streak_3"
  | "streak_7"
  | "streak_14"
  | "streak_30";

const XP_AWARDS: Record<XpEvent, number> = {
  session_completed: 50,
  session_perfect: 75,
  progression_achieved: 25,
  streak_day: 10,
  milestone_unlocked: 0,
  first_session: 100,
  sessions_5: 150,
  sessions_20: 300,
  sessions_50: 750,
  streak_3: 75,
  streak_7: 200,
  streak_14: 400,
  streak_30: 1000,
};

// ─── Milestones ───────────────────────────────────────────────────────────────

export interface Milestone {
  id: string;
  label: string;
  description: string;
  xpReward: number;
}

export const MILESTONES: Milestone[] = [
  {
    id: "first_session",
    label: "First Rep",
    description: "Logged your first training session",
    xpReward: XP_AWARDS.first_session,
  },
  {
    id: "sessions_5",
    label: "5 Sessions In",
    description: "Completed 5 training sessions",
    xpReward: XP_AWARDS.sessions_5,
  },
  {
    id: "sessions_20",
    label: "20 Sessions In",
    description: "Completed 20 training sessions — consistent foundation",
    xpReward: XP_AWARDS.sessions_20,
  },
  {
    id: "sessions_50",
    label: "50 Sessions",
    description: "50 sessions completed — this is a system",
    xpReward: XP_AWARDS.sessions_50,
  },
  {
    id: "streak_3",
    label: "3-Day Streak",
    description: "3 consecutive days of training",
    xpReward: XP_AWARDS.streak_3,
  },
  {
    id: "streak_7",
    label: "7-Day Streak",
    description: "Full week of consistent training",
    xpReward: XP_AWARDS.streak_7,
  },
  {
    id: "streak_14",
    label: "14-Day Streak",
    description: "Two weeks of unbroken consistency",
    xpReward: XP_AWARDS.streak_14,
  },
  {
    id: "streak_30",
    label: "30-Day Streak",
    description: "30 days straight — elite adherence",
    xpReward: XP_AWARDS.streak_30,
  },
];

// ─── Score computation ────────────────────────────────────────────────────────

async function computeScores(userId: number): Promise<{
  consistencyScore: number;
  progressionScore: number;
  recoveryScore: number;
}> {
  const thirtyDaysAgo = new Date(Date.now() - 30 * 86400000);

  const [sessionLogs, exerciseLogs, readinessEntries] = await Promise.all([
    db.select().from(sessionLogsTable)
      .where(and(eq(sessionLogsTable.userId, userId), gte(sessionLogsTable.completedAt, thirtyDaysAgo)))
      .orderBy(desc(sessionLogsTable.completedAt))
      .limit(30),
    db.select().from(exerciseLogsTable)
      .where(and(eq(exerciseLogsTable.userId, userId), gte(exerciseLogsTable.loggedAt, thirtyDaysAgo)))
      .orderBy(desc(exerciseLogsTable.loggedAt))
      .limit(60),
    db.select().from(readinessEntriesTable)
      .where(and(eq(readinessEntriesTable.userId, userId), gte(readinessEntriesTable.createdAt, thirtyDaysAgo)))
      .limit(30),
  ]);

  // Consistency: sessions completed / 4 weeks × weekly target (assume 3/week target)
  const targetSessions = 12; // 4 weeks × 3 sessions/week
  const completed = sessionLogs.filter((l) => l.sessionStatus === "completed" || l.sessionStatus === "partial").length;
  const consistencyScore = Math.min(100, Math.round((completed / targetSessions) * 100));

  // Progression: ratio of 'easy'+'solid' to total exercise logs
  const goodLogs = exerciseLogs.filter((l) => l.completionStatus === "easy" || l.completionStatus === "solid").length;
  const progressionScore = exerciseLogs.length > 0
    ? Math.min(100, Math.round((goodLogs / exerciseLogs.length) * 100))
    : 0;

  // Recovery: average readiness × 20 (1-5 → 0-100)
  const avgReadiness = readinessEntries.length > 0
    ? readinessEntries.reduce((sum, r) => sum + (r.readinessScore ?? 3), 0) / readinessEntries.length
    : 3;
  const recoveryScore = Math.min(100, Math.round(((avgReadiness - 1) / 4) * 100));

  return { consistencyScore, progressionScore, recoveryScore };
}

// ─── Core award function ──────────────────────────────────────────────────────

export interface AwardResult {
  xpGained: number;
  newXp: number;
  oldLevel: number;
  newLevel: number;
  leveledUp: boolean;
  newlyUnlockedMilestones: Milestone[];
  neuralConnectionsAdded: number;
  profile: {
    level: number;
    xp: number;
    xpProgressPercent: number;
    xpToNextLevel: number;
    consistencyScore: number;
    progressionScore: number;
    recoveryScore: number;
    totalSessionsCompleted: number;
    neuralConnections: number;
    unlockedMilestones: string[];
    levelLabel: string;
  };
}

export async function awardXpForSession(
  userId: number,
  opts: {
    sessionStatus: string;
    difficultyScore?: number | null;
    streakDays?: number;
    isPerfect?: boolean;
  },
): Promise<AwardResult> {
  // Fetch or initialize profile
  let profile = await db
    .select()
    .from(neuralProfilesTable)
    .where(eq(neuralProfilesTable.userId, userId))
    .limit(1)
    .then((rows) => rows[0] ?? null);

  if (!profile) {
    const [created] = await db
      .insert(neuralProfilesTable)
      .values({ userId })
      .returning();
    profile = created;
  }

  const isCompleted = opts.sessionStatus === "completed" || opts.sessionStatus === "partial";
  if (!isCompleted) {
    return buildResult(profile, 0, [], 0);
  }

  let xpGained = 0;
  const connectionsAdded = 3;

  // Base session XP
  xpGained += opts.isPerfect ? XP_AWARDS.session_perfect : XP_AWARDS.session_completed;

  // Streak bonus
  if (opts.streakDays && opts.streakDays >= 1) {
    xpGained += XP_AWARDS.streak_day * Math.min(opts.streakDays, 5);
  }

  // New session count (after this award)
  const newSessionCount = profile.totalSessionsCompleted + 1;

  // Check milestones
  const alreadyUnlocked = new Set(profile.unlockedMilestones as string[]);
  const newlyUnlocked: Milestone[] = [];

  function checkMilestone(id: string, condition: boolean) {
    if (condition && !alreadyUnlocked.has(id)) {
      const m = MILESTONES.find((ms) => ms.id === id);
      if (m) {
        newlyUnlocked.push(m);
        alreadyUnlocked.add(id);
        xpGained += m.xpReward;
      }
    }
  }

  checkMilestone("first_session", newSessionCount === 1);
  checkMilestone("sessions_5", newSessionCount >= 5);
  checkMilestone("sessions_20", newSessionCount >= 20);
  checkMilestone("sessions_50", newSessionCount >= 50);

  if (opts.streakDays) {
    checkMilestone("streak_3", opts.streakDays >= 3);
    checkMilestone("streak_7", opts.streakDays >= 7);
    checkMilestone("streak_14", opts.streakDays >= 14);
    checkMilestone("streak_30", opts.streakDays >= 30);
  }

  const newXp = profile.xp + xpGained;
  const oldLevel = profile.level;
  const newLevel = levelFromXp(newXp);
  const newConnections = profile.neuralConnections + connectionsAdded;

  // Compute scores
  const scores = await computeScores(userId);

  // Update profile
  const [updated] = await db
    .update(neuralProfilesTable)
    .set({
      xp: newXp,
      level: newLevel,
      consistencyScore: scores.consistencyScore,
      progressionScore: scores.progressionScore,
      recoveryScore: scores.recoveryScore,
      totalSessionsCompleted: newSessionCount,
      neuralConnections: newConnections,
      unlockedMilestones: Array.from(alreadyUnlocked),
      lastUpdated: new Date(),
    })
    .where(eq(neuralProfilesTable.userId, userId))
    .returning();

  return buildResult(updated, xpGained, newlyUnlocked, connectionsAdded, oldLevel);
}

export async function awardXpForProgression(userId: number): Promise<void> {
  let profile = await db
    .select()
    .from(neuralProfilesTable)
    .where(eq(neuralProfilesTable.userId, userId))
    .limit(1)
    .then((rows) => rows[0] ?? null);

  if (!profile) return;

  const newXp = profile.xp + XP_AWARDS.progression_achieved;
  const newLevel = levelFromXp(newXp);

  await db
    .update(neuralProfilesTable)
    .set({ xp: newXp, level: newLevel, lastUpdated: new Date() })
    .where(eq(neuralProfilesTable.userId, userId));
}

export async function getOrCreateProfile(userId: number) {
  let profile = await db
    .select()
    .from(neuralProfilesTable)
    .where(eq(neuralProfilesTable.userId, userId))
    .limit(1)
    .then((rows) => rows[0] ?? null);

  if (!profile) {
    const scores = await computeScores(userId);
    const [created] = await db
      .insert(neuralProfilesTable)
      .values({ userId, ...scores })
      .returning();
    profile = created;
  }

  return formatProfile(profile);
}

// ─── Result helpers ───────────────────────────────────────────────────────────

function formatProfile(profile: typeof neuralProfilesTable.$inferSelect) {
  const lvl = profile.level;
  return {
    level: lvl,
    xp: profile.xp,
    xpProgressPercent: xpProgressInLevel(lvl, profile.xp),
    xpToNextLevel: xpToNextLevel(lvl, profile.xp),
    consistencyScore: profile.consistencyScore,
    progressionScore: profile.progressionScore,
    recoveryScore: profile.recoveryScore,
    totalSessionsCompleted: profile.totalSessionsCompleted,
    neuralConnections: profile.neuralConnections,
    unlockedMilestones: profile.unlockedMilestones as string[],
    levelLabel: levelLabel(lvl),
  };
}

function buildResult(
  profile: typeof neuralProfilesTable.$inferSelect,
  xpGained: number,
  milestones: Milestone[],
  connectionsAdded: number,
  oldLevel?: number,
): AwardResult {
  const newLevel = profile.level;
  const lvlBefore = oldLevel ?? newLevel;
  return {
    xpGained,
    newXp: profile.xp,
    oldLevel: lvlBefore,
    newLevel,
    leveledUp: newLevel > lvlBefore,
    newlyUnlockedMilestones: milestones,
    neuralConnectionsAdded: connectionsAdded,
    profile: formatProfile(profile),
  };
}
