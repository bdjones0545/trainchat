/**
 * Neural Profile Service — Training Adaptation Tracking Layer
 *
 * Models the user's training system as a graph of neural nodes and connections.
 * Each node represents a training quality. Each connection reflects behavioral patterns.
 * Connection strength grows with consistent, specific training behaviors.
 *
 * Language: coaching and performance science only.
 * Internal: uses XP as a volume proxy. External: exposes only coaching language.
 */

import { db, neuralProfilesTable, sessionLogsTable, exerciseLogsTable, readinessEntriesTable } from "@workspace/db";
import { eq, desc, and, gte } from "drizzle-orm";

// ─── Graph definitions ────────────────────────────────────────────────────────

export const NODE_DEFS = [
  { id: "consistency",      label: "Consistency" },
  { id: "strength",         label: "Strength" },
  { id: "power",            label: "Power" },
  { id: "movement_quality", label: "Movement" },
  { id: "recovery",         label: "Recovery" },
  { id: "lower_body",       label: "Lower Body" },
  { id: "upper_body",       label: "Upper Body" },
  { id: "trunk",            label: "Trunk" },
] as const;

export type NodeId = typeof NODE_DEFS[number]["id"];

// Meaningful connections (undirected — each can reinforce in both directions)
export const CONNECTION_DEFS: Array<[NodeId, NodeId]> = [
  ["consistency", "strength"],
  ["consistency", "recovery"],
  ["consistency", "trunk"],
  ["consistency", "lower_body"],
  ["consistency", "upper_body"],
  ["strength",    "power"],
  ["strength",    "lower_body"],
  ["strength",    "upper_body"],
  ["strength",    "movement_quality"],
  ["power",       "lower_body"],
  ["power",       "movement_quality"],
  ["movement_quality", "trunk"],
  ["movement_quality", "recovery"],
  ["recovery",    "strength"],
  ["lower_body",  "trunk"],
  ["upper_body",  "trunk"],
];

// ─── Graph state types ────────────────────────────────────────────────────────

export interface GraphNode {
  id: string;
  activationLevel: number; // 0-1
}

export interface GraphConnection {
  from: string;
  to: string;
  strength: number;        // 0-1
  lastReinforced: string;  // ISO date
}

export interface GraphState {
  nodes: GraphNode[];
  connections: GraphConnection[];
  version: number;
}

export interface ReinforcedConnection {
  from: string;
  to: string;
  fromLabel: string;
  toLabel: string;
}

// ─── Graph initialization ─────────────────────────────────────────────────────

function initializeGraphState(): GraphState {
  const nodes: GraphNode[] = NODE_DEFS.map((n) => ({ id: n.id, activationLevel: 0 }));
  const connections: GraphConnection[] = CONNECTION_DEFS.map(([from, to]) => ({
    from,
    to,
    strength: 0,
    lastReinforced: new Date(0).toISOString(),
  }));
  return { nodes, connections, version: 1 };
}

// ─── Connection reinforcement ─────────────────────────────────────────────────

const REINFORCE_AMOUNT = 0.12;
const MAX_STRENGTH = 1.0;

function reinforce(
  graphState: GraphState,
  pairs: Array<[NodeId, NodeId]>,
): { newState: GraphState; reinforced: ReinforcedConnection[] } {
  const now = new Date().toISOString();
  const reinforced: ReinforcedConnection[] = [];

  const newConnections = graphState.connections.map((c) => {
    const hit = pairs.some(
      ([a, b]) => (c.from === a && c.to === b) || (c.from === b && c.to === a),
    );
    if (!hit) return c;

    // Only record if connection actually exists in our defs
    const fromDef = NODE_DEFS.find((n) => n.id === c.from);
    const toDef = NODE_DEFS.find((n) => n.id === c.to);
    if (fromDef && toDef) {
      reinforced.push({
        from: c.from,
        to: c.to,
        fromLabel: fromDef.label,
        toLabel: toDef.label,
      });
    }

    return {
      ...c,
      strength: Math.min(MAX_STRENGTH, c.strength + REINFORCE_AMOUNT),
      lastReinforced: now,
    };
  });

  // Recompute node activation levels
  const newNodes = graphState.nodes.map((node) => {
    const adjacent = newConnections.filter((c) => c.from === node.id || c.to === node.id);
    const active = adjacent.filter((c) => c.strength > 0);
    const avgStrength = active.length > 0
      ? active.reduce((sum, c) => sum + c.strength, 0) / active.length
      : 0;
    return { ...node, activationLevel: Math.min(1, avgStrength) };
  });

  return {
    newState: { ...graphState, nodes: newNodes, connections: newConnections },
    reinforced,
  };
}

// ─── Determine which connections to reinforce ─────────────────────────────────

function selectConnectionsToReinforce(opts: {
  sessionStatus: string;
  isPerfect: boolean;
  progressionScore: number;
  recoveryScore: number;
  consistencyScore: number;
  streakDays: number;
  difficultyScore?: number | null;
}): Array<[NodeId, NodeId]> {
  const pairs: Array<[NodeId, NodeId]> = [];
  const { sessionStatus, isPerfect, progressionScore, recoveryScore, consistencyScore, streakDays } = opts;

  const isCompleted = sessionStatus === "completed";
  const isPartial = sessionStatus === "partial";

  if (!isCompleted && !isPartial) return pairs;

  // Every completed session strengthens the master signal
  pairs.push(["consistency", "strength"]);
  pairs.push(["consistency", "trunk"]);

  // Good recovery logging → recovery ↔ consistency link
  if (recoveryScore >= 50) {
    pairs.push(["consistency", "recovery"]);
    pairs.push(["recovery", "strength"]);
  }

  // Progression → activate the power pathway
  if (progressionScore >= 60) {
    pairs.push(["strength", "power"]);
    pairs.push(["power", "movement_quality"]);
  }

  // High movement quality (low difficulty, good progression)
  if (isPerfect || (progressionScore >= 70 && (opts.difficultyScore ?? 3) <= 3)) {
    pairs.push(["strength", "movement_quality"]);
    pairs.push(["movement_quality", "trunk"]);
    pairs.push(["movement_quality", "recovery"]);
  }

  // Body output connections grow as session count grows (via consistency score)
  if (consistencyScore >= 30) {
    pairs.push(["strength", "lower_body"]);
    pairs.push(["lower_body", "trunk"]);
  }
  if (consistencyScore >= 50) {
    pairs.push(["strength", "upper_body"]);
    pairs.push(["upper_body", "trunk"]);
    pairs.push(["consistency", "lower_body"]);
    pairs.push(["consistency", "upper_body"]);
  }

  // Sustained streaks → consistency ↔ recovery bond
  if (streakDays >= 7) {
    pairs.push(["consistency", "recovery"]);
    pairs.push(["power", "lower_body"]);
  }

  // Deduplicate
  const seen = new Set<string>();
  return pairs.filter(([a, b]) => {
    const key = [a, b].sort().join(":");
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

// ─── Internal progression math ────────────────────────────────────────────────

function xpRequiredForLevel(level: number): number {
  if (level <= 1) return 0;
  let total = 0;
  for (let i = 2; i <= level; i++) total += 500 + (i - 2) * 100;
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
  return Math.max(0, Math.min(100, Math.round(((currentXp - levelStart) / (levelEnd - levelStart)) * 100)));
}

function maturityLabel(level: number): string {
  if (level <= 2) return "Developing Foundation";
  if (level <= 5) return "Building Structure";
  if (level <= 10) return "Consistent Athlete";
  if (level <= 15) return "High Compliance";
  if (level <= 20) return "Elite Adherence";
  return "Neural Master";
}

// ─── XP constants ─────────────────────────────────────────────────────────────

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

// ─── Milestones ───────────────────────────────────────────────────────────────

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

// ─── Neural feedback (coaching language) ─────────────────────────────────────

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
  reinforced: ReinforcedConnection[];
}): NeuralFeedback {
  const { sessionStatus, isPerfect, consistencyScore, progressionScore, recoveryScore, streakDays, difficultyScore, reinforced } = opts;
  const isCompleted = sessionStatus === "completed";
  const isPartial = sessionStatus === "partial";
  const metrics: NeuralMetric[] = [];

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

  if (progressionScore >= 75) {
    metrics.push({ label: "Movement efficiency", direction: "up", detail: "improving — movement quality confirmed" });
  } else if (difficultyScore && difficultyScore >= 4) {
    metrics.push({ label: "Movement efficiency", direction: "challenged", detail: "load tolerance being tested" });
  } else {
    metrics.push({ label: "Movement efficiency", direction: "stable", detail: "patterns holding" });
  }

  if (isCompleted && progressionScore >= 70 && (difficultyScore ?? 3) <= 3) {
    metrics.push({ label: "Force production", direction: "up", detail: "reinforced — capacity expanding" });
  } else if (difficultyScore && difficultyScore >= 4) {
    metrics.push({ label: "Force production", direction: "challenged", detail: "near-maximal output — adaptation in progress" });
  } else if (isCompleted) {
    metrics.push({ label: "Force production", direction: "stable", detail: "maintained — tissue loading adequate" });
  } else {
    metrics.push({ label: "Force production", direction: "down", detail: "below target — review next session" });
  }

  const systemUpdates: string[] = [];
  if (isCompleted) systemUpdates.push("Movement patterns logged");
  if (isCompleted && progressionScore >= 60) systemUpdates.push("Progression pathway active next session");
  if (isPartial) systemUpdates.push("Partial load recorded — full session next");
  if (streakDays >= 3) systemUpdates.push(`Continuity maintained — ${streakDays} sessions in sequence`);
  if (recoveryScore >= 70) systemUpdates.push("Recovery markers within optimal range");
  if (recoveryScore < 40 && isCompleted) systemUpdates.push("Recovery signal low — monitor readiness next session");
  opts.newMilestones.forEach((m) => systemUpdates.push(m.description));
  if (systemUpdates.length === 0) systemUpdates.push("Session data recorded");

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

async function computeScores(userId: number) {
  const thirtyDaysAgo = new Date(Date.now() - 30 * 86400000);
  const [sessionLogs, exerciseLogs, readinessEntries] = await Promise.all([
    db.select().from(sessionLogsTable)
      .where(and(eq(sessionLogsTable.userId, userId), gte(sessionLogsTable.completedAt, thirtyDaysAgo)))
      .orderBy(desc(sessionLogsTable.completedAt)).limit(30),
    db.select().from(exerciseLogsTable)
      .where(and(eq(exerciseLogsTable.userId, userId), gte(exerciseLogsTable.loggedAt, thirtyDaysAgo)))
      .orderBy(desc(exerciseLogsTable.loggedAt)).limit(60),
    db.select().from(readinessEntriesTable)
      .where(and(eq(readinessEntriesTable.userId, userId), gte(readinessEntriesTable.createdAt, thirtyDaysAgo)))
      .limit(30),
  ]);

  const completed = sessionLogs.filter((l) => l.sessionStatus === "completed" || l.sessionStatus === "partial").length;
  const consistencyScore = Math.min(100, Math.round((completed / 12) * 100));

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
  neuralConnectionsAdded: number;
  newlyUnlockedMilestones: Milestone[];
  neuralFeedback: NeuralFeedback;
  recentlyReinforced: ReinforcedConnection[];
  profile: {
    maturityLabel: string;
    maturityProgress: number;
    consistencyScore: number;
    progressionScore: number;
    recoveryScore: number;
    totalSessionsCompleted: number;
    neuralConnections: number;
    unlockedMilestones: string[];
    graphState: GraphState;
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
  let profile = await db
    .select().from(neuralProfilesTable)
    .where(eq(neuralProfilesTable.userId, userId))
    .limit(1)
    .then((rows) => rows[0] ?? null);

  if (!profile) {
    const [created] = await db.insert(neuralProfilesTable).values({ userId }).returning();
    profile = created;
  }

  const currentGraph: GraphState = (profile.graphState as GraphState) ?? initializeGraphState();
  const isCompleted = opts.sessionStatus === "completed" || opts.sessionStatus === "partial";

  if (!isCompleted) {
    const emptyFeedback = generateNeuralFeedback({
      sessionStatus: opts.sessionStatus, isPerfect: false,
      consistencyScore: profile.consistencyScore, progressionScore: profile.progressionScore,
      recoveryScore: profile.recoveryScore, streakDays: opts.streakDays ?? 0,
      newMilestones: [], difficultyScore: opts.difficultyScore, reinforced: [],
    });
    return buildResult(profile, currentGraph, emptyFeedback, [], [], 0);
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
      if (m) { newlyUnlocked.push(m); alreadyUnlocked.add(id); xpGained += XP[id as keyof typeof XP] ?? 0; }
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
  const scores = await computeScores(userId);

  // Graph: determine which connections to reinforce
  const connectionPairs = selectConnectionsToReinforce({
    sessionStatus: opts.sessionStatus,
    isPerfect: opts.isPerfect ?? false,
    progressionScore: scores.progressionScore,
    recoveryScore: scores.recoveryScore,
    consistencyScore: scores.consistencyScore,
    streakDays: opts.streakDays ?? 0,
    difficultyScore: opts.difficultyScore,
  });

  const { newState: newGraphState, reinforced } = reinforce(currentGraph, connectionPairs);
  const connectionsAdded = reinforced.length;

  const [updated] = await db
    .update(neuralProfilesTable)
    .set({
      xp: newXp, level: newLevel,
      consistencyScore: scores.consistencyScore,
      progressionScore: scores.progressionScore,
      recoveryScore: scores.recoveryScore,
      totalSessionsCompleted: newSessionCount,
      neuralConnections: profile.neuralConnections + connectionsAdded,
      unlockedMilestones: Array.from(alreadyUnlocked),
      graphState: newGraphState,
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
    reinforced,
  });

  return buildResult(updated, newGraphState, feedback, newlyUnlocked, reinforced, connectionsAdded);
}

export async function awardXpForProgression(userId: number): Promise<void> {
  const profile = await db.select().from(neuralProfilesTable)
    .where(eq(neuralProfilesTable.userId, userId)).limit(1)
    .then((rows) => rows[0] ?? null);
  if (!profile) return;
  const newXp = profile.xp + 25;
  await db.update(neuralProfilesTable)
    .set({ xp: newXp, level: levelFromXp(newXp), lastUpdated: new Date() })
    .where(eq(neuralProfilesTable.userId, userId));
}

export async function getOrCreateProfile(userId: number) {
  let profile = await db.select().from(neuralProfilesTable)
    .where(eq(neuralProfilesTable.userId, userId)).limit(1)
    .then((rows) => rows[0] ?? null);

  if (!profile) {
    const scores = await computeScores(userId);
    const [created] = await db.insert(neuralProfilesTable)
      .values({ userId, ...scores, graphState: initializeGraphState() }).returning();
    profile = created;
  }

  const graphState = (profile.graphState as GraphState) ?? initializeGraphState();
  return formatProfile(profile, graphState);
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatProfile(profile: typeof neuralProfilesTable.$inferSelect, graphState: GraphState) {
  return {
    maturityLabel: maturityLabel(profile.level),
    maturityProgress: xpProgressInLevel(profile.level, profile.xp),
    consistencyScore: profile.consistencyScore,
    progressionScore: profile.progressionScore,
    recoveryScore: profile.recoveryScore,
    totalSessionsCompleted: profile.totalSessionsCompleted,
    neuralConnections: profile.neuralConnections,
    unlockedMilestones: profile.unlockedMilestones as string[],
    graphState,
  };
}

function buildResult(
  profile: typeof neuralProfilesTable.$inferSelect,
  graphState: GraphState,
  feedback: NeuralFeedback,
  milestones: Milestone[],
  reinforced: ReinforcedConnection[],
  connectionsAdded: number,
): AwardResult {
  return {
    neuralConnectionsAdded: connectionsAdded,
    newlyUnlockedMilestones: milestones,
    neuralFeedback: feedback,
    recentlyReinforced: reinforced,
    profile: formatProfile(profile, graphState),
  };
}
