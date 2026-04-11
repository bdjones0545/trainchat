/**
 * Neural Profile Service — Training Adaptation Tracking Layer
 *
 * Tracks and interprets how consistent training shapes neural efficiency,
 * movement quality, and force production capacity.
 *
 * Internally uses XP/level math as a proxy for training volume, but the
 * public-facing API speaks only in coaching and performance language.
 *
 * Philosophy: every signal traces back to a real training behavior.
 */

import { db, neuralProfilesTable, sessionLogsTable, exerciseLogsTable, readinessEntriesTable } from "@workspace/db";
import { eq, desc, and, gte } from "drizzle-orm";

// ─── Internal progression math (not exposed to UI) ───────────────────────────

function xpRequiredForLevel(level: number): number {
  if (level <= 1) return 0;
  let total = 0;
  for (let i = 2; i <= level; i++) {
    total += 500 + (i - 2) * 100;
  }
  return total;
}

function levelFromXp(totalXp: number): number {
  let level = 1;
  while (xpRequiredForLevel(level + 1) <= totalXp) level++;
  return level;
}

function xpProgressInLevel(level: number, currentXp: number): number {
  const levelStart = xpRequiredForLevel(level);
  const levelEnd = xpRequiredForLevel(level + 1);
  const progress = currentXp - levelStart;
  const span = levelEnd - levelStart;
  return Math.max(0, Math.min(100, Math.round((progress / span) * 100)));
}

// ─── Maturity label (replaces "level" in the UI) ─────────────────────────────

function maturityLabel(level: number): string {
  if (level <= 2) return "Developing Foundation";
  if (level <= 5) return "Building Structure";
  if (level <= 10) return "Consistent Athlete";
  if (level <= 15) return "High Compliance";
  if (level <= 20) return "Elite Adherence";
  return "Neural Master";
}

// ─── XP Award constants ───────────────────────────────────────────────────────

const XP = {
  session_completed: 50,
  session_perfect: 75,
  streak_day: 10,
  first_session: 100,
  sessions_5: 150,
  sessions_20: 300,
  sessions_50: 750,
  streak_3: 75,
  streak_7: 200,
  streak_14: 400,
  streak_30: 1000,
};

// ─── Milestones (for internal tracking — unlocking these signals adaptation) ──

export interface Milestone {
  id: string;
  label: string;
  description: string;
}

export const MILESTONES: Milestone[] = [
  { id: "first_session",  label: "First Session",      description: "Training system activated" },
  { id: "sessions_5",     label: "5 Sessions",         description: "Consistent foundation forming" },
  { id: "sessions_20",    label: "20 Sessions",        description: "Neural pathways reinforcing" },
  { id: "sessions_50",    label: "50 Sessions",        description: "System operating at high output" },
  { id: "streak_3",       label: "3-Day Continuity",   description: "Short-term pattern established" },
  { id: "streak_7",       label: "7-Day Continuity",   description: "Weekly rhythm locked in" },
  { id: "streak_14",      label: "14-Day Continuity",  description: "Sustained adaptation in progress" },
  { id: "streak_30",      label: "30-Day Continuity",  description: "Long-term structural adaptation" },
];

// ─── Neural Feedback (coaching-language interpretation) ───────────────────────

export interface NeuralMetric {
  label: string;
  direction: "up" | "stable" | "down" | "challenged";
  detail: string;
}

export interface NeuralFeedback {
  metrics: NeuralMetric[];
  systemUpdates: string[];
  summary: string;
}

function generateNeuralFeedback(opts: {
  sessionStatus: string;
  isPerfect: boolean;
  consistencyScore: number;
  progressionScore: number;
  recoveryScore: number;
  streakDays: number;
  newMilestones: Milestone[];
  difficultyScore?: number | null;
}): NeuralFeedback {
  const { sessionStatus, isPerfect, consistencyScore, progressionScore, recoveryScore, streakDays, difficultyScore } = opts;
  const isCompleted = sessionStatus === "completed";
  const isPartial = sessionStatus === "partial";
  const isSkipped = sessionStatus === "skipped";

  const metrics: NeuralMetric[] = [];

  // Neural output — based on session completion and consistency
  if (isCompleted && isPerfect) {
    metrics.push({ label: "Neural output", direction: "up", detail: "peak activation — full session at optimal intensity" });
  } else if (isCompleted && consistencyScore >= 70) {
    metrics.push({ label: "Neural output", direction: "up", detail: "increasing — session demand met" });
  } else if (isCompleted) {
    metrics.push({ label: "Neural output", direction: "stable", detail: "maintained — session completed" });
  } else if (isPartial) {
    metrics.push({ label: "Neural output", direction: "challenged", detail: "partial — adaptation still occurring" });
  } else {
    metrics.push({ label: "Neural output", direction: "down", detail: "session not completed" });
  }

  // Movement efficiency — based on progression score and difficulty
  if (progressionScore >= 75) {
    metrics.push({ label: "Movement efficiency", direction: "up", detail: "improving — movement quality confirmed" });
  } else if (progressionScore >= 50) {
    metrics.push({ label: "Movement efficiency", direction: "stable", detail: "maintained — patterns reinforcing" });
  } else if (difficultyScore && difficultyScore >= 4) {
    metrics.push({ label: "Movement efficiency", direction: "challenged", detail: "load tolerance being tested" });
  } else {
    metrics.push({ label: "Movement efficiency", direction: "stable", detail: "patterns holding" });
  }

  // Force production — based on progression and difficulty interaction
  if (isCompleted && progressionScore >= 70 && (difficultyScore ?? 3) <= 3) {
    metrics.push({ label: "Force production", direction: "up", detail: "reinforced — capacity expanding" });
  } else if (difficultyScore && difficultyScore >= 4) {
    metrics.push({ label: "Force production", direction: "challenged", detail: "near-maximal output — adaptation in progress" });
  } else if (isCompleted) {
    metrics.push({ label: "Force production", direction: "stable", detail: "maintained — tissue loading adequate" });
  } else {
    metrics.push({ label: "Force production", direction: "down", detail: "below target — review next session" });
  }

  // System updates
  const systemUpdates: string[] = [];
  if (isCompleted) systemUpdates.push("Movement patterns logged");
  if (isCompleted && progressionScore >= 60) systemUpdates.push("Progression pathway active next session");
  if (isPartial) systemUpdates.push("Partial load recorded — full session next");
  if (streakDays >= 3) systemUpdates.push(`Continuity maintained — ${streakDays} sessions in sequence`);
  if (recoveryScore >= 70) systemUpdates.push("Recovery markers within optimal range");
  if (recoveryScore < 40 && isCompleted) systemUpdates.push("Recovery signal low — monitor readiness next session");
  opts.newMilestones.forEach((m) => systemUpdates.push(m.description));

  // Fallback
  if (systemUpdates.length === 0) {
    systemUpdates.push("Session data recorded");
  }

  // Summary
  const summary = isPerfect
    ? "System operating at peak output. All training signals positive."
    : isCompleted && consistencyScore >= 60
    ? "Training signals consistent. Neural pathways reinforcing."
    : isCompleted
    ? "Session completed. Adaptation accumulating."
    : isPartial
    ? "Partial session logged. Consistency drives long-term adaptation."
    : "Session skipped. Resume as soon as recovery allows.";

  return { metrics, systemUpdates, summary };
}

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

  const targetSessions = 12;
  const completed = sessionLogs.filter((l) => l.sessionStatus === "completed" || l.sessionStatus === "partial").length;
  const consistencyScore = Math.min(100, Math.round((completed / targetSessions) * 100));

  const goodLogs = exerciseLogs.filter((l) => l.completionStatus === "easy" || l.completionStatus === "solid").length;
  const progressionScore = exerciseLogs.length > 0
    ? Math.min(100, Math.round((goodLogs / exerciseLogs.length) * 100))
    : 0;

  const avgReadiness = readinessEntries.length > 0
    ? readinessEntries.reduce((sum, r) => sum + (r.readinessScore ?? 3), 0) / readinessEntries.length
    : 3;
  const recoveryScore = Math.min(100, Math.round(((avgReadiness - 1) / 4) * 100));

  return { consistencyScore, progressionScore, recoveryScore };
}

// ─── AwardResult ─────────────────────────────────────────────────────────────

export interface AwardResult {
  // Internal — used for neural profile data tracking
  neuralConnectionsAdded: number;
  newlyUnlockedMilestones: Milestone[];

  // Coaching output — what the UI shows
  neuralFeedback: NeuralFeedback;

  // Profile state
  profile: {
    maturityLabel: string;
    maturityProgress: number;        // 0-100 — how far through current maturity tier
    consistencyScore: number;
    progressionScore: number;
    recoveryScore: number;
    totalSessionsCompleted: number;
    neuralConnections: number;
    unlockedMilestones: string[];
  };
}

// ─── Core award function ──────────────────────────────────────────────────────

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
    const [created] = await db.insert(neuralProfilesTable).values({ userId }).returning();
    profile = created;
  }

  const isCompleted = opts.sessionStatus === "completed" || opts.sessionStatus === "partial";
  if (!isCompleted) {
    const skippedFeedback = generateNeuralFeedback({
      sessionStatus: opts.sessionStatus,
      isPerfect: false,
      consistencyScore: profile.consistencyScore,
      progressionScore: profile.progressionScore,
      recoveryScore: profile.recoveryScore,
      streakDays: opts.streakDays ?? 0,
      newMilestones: [],
      difficultyScore: opts.difficultyScore,
    });
    return buildResult(profile, skippedFeedback, [], 0);
  }

  let xpGained = opts.isPerfect ? XP.session_perfect : XP.session_completed;
  if (opts.streakDays && opts.streakDays >= 1) {
    xpGained += XP.streak_day * Math.min(opts.streakDays, 5);
  }

  const newSessionCount = profile.totalSessionsCompleted + 1;
  const alreadyUnlocked = new Set(profile.unlockedMilestones as string[]);
  const newlyUnlocked: Milestone[] = [];

  function checkMilestone(id: string, condition: boolean) {
    if (condition && !alreadyUnlocked.has(id)) {
      const m = MILESTONES.find((ms) => ms.id === id);
      if (m) {
        newlyUnlocked.push(m);
        alreadyUnlocked.add(id);
        xpGained += XP[id as keyof typeof XP] ?? 0;
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
  const newLevel = levelFromXp(newXp);
  const connectionsAdded = 3;

  const scores = await computeScores(userId);

  const [updated] = await db
    .update(neuralProfilesTable)
    .set({
      xp: newXp,
      level: newLevel,
      consistencyScore: scores.consistencyScore,
      progressionScore: scores.progressionScore,
      recoveryScore: scores.recoveryScore,
      totalSessionsCompleted: newSessionCount,
      neuralConnections: profile.neuralConnections + connectionsAdded,
      unlockedMilestones: Array.from(alreadyUnlocked),
      lastUpdated: new Date(),
    })
    .where(eq(neuralProfilesTable.userId, userId))
    .returning();

  const feedback = generateNeuralFeedback({
    sessionStatus: opts.sessionStatus,
    isPerfect: opts.isPerfect ?? false,
    consistencyScore: scores.consistencyScore,
    progressionScore: scores.progressionScore,
    recoveryScore: scores.recoveryScore,
    streakDays: opts.streakDays ?? 0,
    newMilestones: newlyUnlocked,
    difficultyScore: opts.difficultyScore,
  });

  return buildResult(updated, feedback, newlyUnlocked, connectionsAdded);
}

export async function awardXpForProgression(userId: number): Promise<void> {
  const profile = await db
    .select()
    .from(neuralProfilesTable)
    .where(eq(neuralProfilesTable.userId, userId))
    .limit(1)
    .then((rows) => rows[0] ?? null);

  if (!profile) return;

  const newXp = profile.xp + 25;
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
    const [created] = await db.insert(neuralProfilesTable).values({ userId, ...scores }).returning();
    profile = created;
  }

  return formatProfile(profile);
}

// ─── Result helpers ───────────────────────────────────────────────────────────

function formatProfile(profile: typeof neuralProfilesTable.$inferSelect) {
  return {
    maturityLabel: maturityLabel(profile.level),
    maturityProgress: xpProgressInLevel(profile.level, profile.xp),
    consistencyScore: profile.consistencyScore,
    progressionScore: profile.progressionScore,
    recoveryScore: profile.recoveryScore,
    totalSessionsCompleted: profile.totalSessionsCompleted,
    neuralConnections: profile.neuralConnections,
    unlockedMilestones: profile.unlockedMilestones as string[],
  };
}

function buildResult(
  profile: typeof neuralProfilesTable.$inferSelect,
  feedback: NeuralFeedback,
  milestones: Milestone[],
  connectionsAdded: number,
): AwardResult {
  return {
    neuralConnectionsAdded: connectionsAdded,
    newlyUnlockedMilestones: milestones,
    neuralFeedback: feedback,
    profile: formatProfile(profile),
  };
}
