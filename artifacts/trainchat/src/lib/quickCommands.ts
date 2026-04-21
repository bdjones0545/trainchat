import type { FocusMode } from "@/lib/focusMode";

type QuickCommandFocus = FocusMode;
type CommandScope = "exercise" | "session" | "week" | "phase" | "block" | "system";

type UserCommandPreference = {
  commandKey: string;
  selectionCount: number;
  lastSelectedAt: string;
  suppressionCount?: number;
  createdAt: string;
  updatedAt: string;
};

type RecentCommandHistoryItem = {
  commandKey: string;
  label: string;
  selectedAt: string;
  blockType?: string | null;
  sessionIntent?: string | null;
};

interface QuickCommand {
  key: string;
  label: string;
  focus: QuickCommandFocus;
  scopes: CommandScope[];
  tags: string[];
  safety?: "increase_load" | "reduce_load" | "neutral";
}

interface QuickCommandContext {
  focusMode?: string | null;
  blockType?: string | null;
  sessionIntent?: string | null;
  currentContext?: string | string[] | null;
  activeModifiers?: string[] | null;
  userId?: string | number | null;
  limit?: number;
  includeScoreBreakdown?: boolean;
}

interface RecordQuickCommandSelectionInput {
  focusMode?: string | null;
  commandLabel: string;
  blockType?: string | null;
  sessionIntent?: string | null;
  userId?: string | number | null;
}

interface FocusCommandStore {
  preferences: Record<string, UserCommandPreference>;
  recentHistory: RecentCommandHistoryItem[];
}

type CommandStore = Record<string, Partial<Record<FocusMode, FocusCommandStore>>>;

const VALID_FOCUSES: FocusMode[] = ["strength", "speed", "mobility"];
const STORAGE_KEY = "trainchat_quick_command_preferences_v1";
const DEFAULT_USER_KEY = "guest";

const COMMANDS: QuickCommand[] = [
  { key: "speed_acceleration", label: "More acceleration", focus: "speed", scopes: ["session", "week", "phase", "block", "system"], tags: ["acceleration", "start", "projection", "force", "resisted"], safety: "neutral" },
  { key: "speed_max_velocity", label: "Increase max velocity exposure", focus: "speed", scopes: ["session", "week", "phase", "block", "system"], tags: ["max", "velocity", "upright", "elasticity", "stiffness"], safety: "neutral" },
  { key: "speed_reactive", label: "More reactive work", focus: "speed", scopes: ["session", "week", "phase", "block", "system"], tags: ["reactive", "cod", "change", "direction", "agility"], safety: "neutral" },
  { key: "speed_deceleration", label: "More deceleration", focus: "speed", scopes: ["exercise", "session", "week", "phase", "block", "system"], tags: ["deceleration", "landing", "braking", "control"], safety: "neutral" },
  { key: "speed_ground_contact", label: "Reduce ground contact time", focus: "speed", scopes: ["exercise", "session", "week", "phase", "block", "system"], tags: ["max", "velocity", "elasticity", "stiffness", "ground", "contact"], safety: "neutral" },
  { key: "speed_lower_cns", label: "Reduce CNS load", focus: "speed", scopes: ["session", "week", "phase", "block", "system"], tags: ["recovery", "fatigue", "deload", "cns", "lower"], safety: "reduce_load" },
  { key: "speed_shorten_sprint", label: "Shorten sprint distance", focus: "speed", scopes: ["exercise", "session", "week"], tags: ["acceleration", "distance", "fatigue", "shorten"], safety: "reduce_load" },
  { key: "speed_reduce_volume_keep_intensity", label: "Reduce volume keep intensity", focus: "speed", scopes: ["session", "week", "phase", "block", "system"], tags: ["recovery", "fatigue", "intensity", "volume", "reduce"], safety: "reduce_load" },
  { key: "strength_increase_load", label: "Increase load", focus: "strength", scopes: ["exercise", "session", "week", "phase", "block", "system"], tags: ["strength", "intensity", "load", "force", "squat", "deadlift", "bench", "lower", "upper"], safety: "increase_load" },
  { key: "strength_increase_volume", label: "Add volume", focus: "strength", scopes: ["exercise", "session", "week", "phase", "block", "system"], tags: ["volume", "hypertrophy", "sets", "muscle", "squat", "lower"], safety: "increase_load" },
  { key: "strength_hypertrophy", label: "Shift toward hypertrophy", focus: "strength", scopes: ["session", "week", "phase", "block", "system"], tags: ["hypertrophy", "muscle", "volume", "accessory"], safety: "increase_load" },
  { key: "strength_intensity", label: "Increase intensity", focus: "strength", scopes: ["session", "week", "phase", "block", "system"], tags: ["intensity", "load", "strength", "neural"], safety: "increase_load" },
  { key: "strength_accessory", label: "Add accessory work", focus: "strength", scopes: ["session", "week", "phase", "block", "system"], tags: ["accessory", "hypertrophy", "volume", "support"], safety: "neutral" },
  { key: "strength_explosive", label: "More explosive", focus: "strength", scopes: ["session", "week", "phase", "block", "system"], tags: ["explosive", "power", "rate", "force", "neural"], safety: "neutral" },
  { key: "strength_lower_impact", label: "Lower impact", focus: "strength", scopes: ["exercise", "session", "week", "phase", "block", "system"], tags: ["deload", "pain", "joint", "impact", "fatigue", "recovery"], safety: "reduce_load" },
  { key: "mobility_end_range", label: "More end-range control", focus: "mobility", scopes: ["exercise", "session", "week", "phase", "block", "system"], tags: ["end", "range", "control", "positional", "hip", "shoulder", "ankle"], safety: "neutral" },
  { key: "mobility_passive_range", label: "Increase passive range", focus: "mobility", scopes: ["exercise", "session", "week", "phase", "block", "system"], tags: ["passive", "range", "tissue", "hip", "shoulder", "ankle"], safety: "neutral" },
  { key: "mobility_isometric_holds", label: "Add isometric holds", focus: "mobility", scopes: ["exercise", "session", "week", "phase", "block", "system"], tags: ["isometric", "holds", "pails", "rails", "control", "positional"], safety: "neutral" },
  { key: "mobility_joint_control", label: "Improve joint control", focus: "mobility", scopes: ["exercise", "session", "week", "phase", "block", "system"], tags: ["joint", "control", "cars", "articulation", "hip", "shoulder", "ankle"], safety: "neutral" },
  { key: "mobility_flow_recovery", label: "More recovery flow", focus: "mobility", scopes: ["session", "week", "phase", "block", "system"], tags: ["flow", "recovery", "restore", "decompression", "lower"], safety: "reduce_load" },
  { key: "mobility_hip_focus", label: "More hip focus", focus: "mobility", scopes: ["exercise", "session", "week", "phase", "block", "system"], tags: ["hip", "rotation", "flexor", "capsule", "end", "range"], safety: "neutral" },
  { key: "mobility_lower_intensity", label: "Lower intensity", focus: "mobility", scopes: ["session", "week", "phase", "block", "system"], tags: ["lower", "intensity", "recovery", "decompression", "flow", "pain"], safety: "reduce_load" },
];

function normalizeFocus(focusMode?: string | null): FocusMode {
  return VALID_FOCUSES.includes(focusMode as FocusMode) ? (focusMode as FocusMode) : "strength";
}

function normalize(value?: string | string[] | null): string {
  if (Array.isArray(value)) return value.map((item) => normalize(item)).join(" ");
  return String(value ?? "").toLowerCase().replace(/[_-]/g, " ");
}

function userKey(userId?: string | number | null): string {
  return userId === undefined || userId === null || userId === "" ? DEFAULT_USER_KEY : String(userId);
}

function readStore(): CommandStore {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

function writeStore(store: CommandStore) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(store));
  } catch {
  }
}

function getFocusStore(store: CommandStore, inputUserKey: string, focusMode: FocusMode): FocusCommandStore {
  return store[inputUserKey]?.[focusMode] ?? { preferences: {}, recentHistory: [] };
}

function findCommandByLabel(label: string, focusMode: FocusMode): QuickCommand | undefined {
  return COMMANDS.find((command) => command.focus === focusMode && command.label === label);
}

function tagMatches(command: QuickCommand, text: string): number {
  if (!text) return 0;
  return command.tags.reduce((total, tag) => total + (text.includes(tag) ? 1 : 0), 0);
}

function recencyPenalty(lastSelectedAt?: string): number {
  if (!lastSelectedAt) return 0;
  const elapsedMs = Date.now() - new Date(lastSelectedAt).getTime();
  if (Number.isNaN(elapsedMs)) return 0;
  if (elapsedMs < 30 * 60 * 1000) return -10;
  if (elapsedMs < 24 * 60 * 60 * 1000) return -5;
  if (elapsedMs < 7 * 24 * 60 * 60 * 1000) return -2;
  return 0;
}

function safetyScore(command: QuickCommand, contextText: string): number {
  const fatigueSignals = ["fatigue", "tired", "sore", "pain", "deload", "recovery", "low energy", "high stress"];
  const hasFatigueSignal = fatigueSignals.some((signal) => contextText.includes(signal));
  if (!hasFatigueSignal) return 0;
  if (command.safety === "reduce_load") return 8;
  if (command.safety === "increase_load") return -12;
  return 0;
}

function activeModifierPenalty(command: QuickCommand, activeModifiers: string[]): number {
  const normalizedModifiers = normalize(activeModifiers);
  if (!normalizedModifiers) return 0;
  if (normalizedModifiers.includes(normalize(command.label))) return -8;
  const overlappingTags = tagMatches(command, normalizedModifiers);
  return overlappingTags > 0 ? -Math.min(overlappingTags * 2, 6) : 0;
}

function rankQuickCommands({
  focusMode,
  blockType,
  sessionIntent,
  currentContext,
  candidateCommands,
  userCommandPreferences,
  recentCommandHistory,
  activeModifiers,
  includeScoreBreakdown,
}: {
  focusMode: FocusMode;
  blockType: string;
  sessionIntent: string;
  currentContext: string;
  candidateCommands: QuickCommand[];
  userCommandPreferences: Record<string, UserCommandPreference>;
  recentCommandHistory: RecentCommandHistoryItem[];
  activeModifiers: string[];
  includeScoreBreakdown?: boolean;
}) {
  const contextText = normalize([blockType, sessionIntent, currentContext]);
  const ranked = candidateCommands.map((command, originalIndex) => {
    const preference = userCommandPreferences[command.key];
    const exactRecentSelections = recentCommandHistory.filter((item) => item.commandKey === command.key).length;
    const blockRelevance = tagMatches(command, blockType) * 5;
    const sessionRelevance = tagMatches(command, sessionIntent) * 6;
    const exerciseRelevance = tagMatches(command, currentContext) * 4;
    const preferenceScore = Math.min((preference?.selectionCount ?? 0) * 4, 20);
    const recentPatternScore = Math.min(exactRecentSelections * 2, 6);
    const recentPenalty = recencyPenalty(preference?.lastSelectedAt);
    const clutterPenalty = activeModifierPenalty(command, activeModifiers);
    const safety = safetyScore(command, contextText);
    const noveltyPenalty = exactRecentSelections >= 3 ? -6 : 0;
    const score = 100 + blockRelevance + sessionRelevance + exerciseRelevance + preferenceScore + recentPatternScore + safety + recentPenalty + clutterPenalty + noveltyPenalty;

    return {
      command,
      score,
      originalIndex,
      breakdown: {
        focusMatch: 100,
        blockRelevance,
        sessionRelevance,
        exerciseRelevance,
        preferenceScore,
        recentPatternScore,
        recentPenalty,
        clutterPenalty,
        safety,
        noveltyPenalty,
        total: score,
      },
    };
  }).sort((a, b) => b.score - a.score || a.originalIndex - b.originalIndex);

  return includeScoreBreakdown ? ranked : ranked.map(({ command, score, originalIndex }) => ({ command, score, originalIndex }));
}

export function recordQuickCommandSelection({ focusMode, commandLabel, blockType, sessionIntent, userId }: RecordQuickCommandSelectionInput) {
  const currentFocus = normalizeFocus(focusMode);
  const command = findCommandByLabel(commandLabel, currentFocus);
  if (!command) return;

  const store = readStore();
  const inputUserKey = userKey(userId);
  const now = new Date().toISOString();
  const focusStore = getFocusStore(store, inputUserKey, currentFocus);
  const existing = focusStore.preferences[command.key];
  const nextPreference: UserCommandPreference = {
    commandKey: command.key,
    selectionCount: (existing?.selectionCount ?? 0) + 1,
    lastSelectedAt: now,
    suppressionCount: existing?.suppressionCount ?? 0,
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
  };
  const recentHistory = [
    { commandKey: command.key, label: command.label, selectedAt: now, blockType, sessionIntent },
    ...focusStore.recentHistory.filter((item) => item.commandKey !== command.key || item.selectedAt !== now),
  ].slice(0, 12);

  store[inputUserKey] = {
    ...(store[inputUserKey] ?? {}),
    [currentFocus]: {
      preferences: { ...focusStore.preferences, [command.key]: nextPreference },
      recentHistory,
    },
  };
  writeStore(store);

  console.info("[QuickCommandPreferenceAudit]", {
    userId: inputUserKey,
    focusMode: currentFocus,
    commandKey: command.key,
    selectionCount: nextPreference.selectionCount,
    lastSelectedAt: nextPreference.lastSelectedAt,
  });
}

export function getQuickCommands({
  focusMode,
  blockType,
  sessionIntent,
  currentContext,
  activeModifiers,
  userId,
  limit,
  includeScoreBreakdown,
}: QuickCommandContext): string[] {
  const currentFocus = normalizeFocus(focusMode);
  const normalizedBlockType = normalize(blockType) || "system";
  const normalizedSessionIntent = normalize(sessionIntent);
  const normalizedCurrentContext = normalize(currentContext);
  const store = readStore();
  const focusStore = getFocusStore(store, userKey(userId), currentFocus);
  const candidateCommands = COMMANDS
    .filter((command) => command.focus === currentFocus)
    .filter((command) => command.scopes.includes(normalizedBlockType as CommandScope) || normalizedBlockType === "block");
  const ranked = rankQuickCommands({
    focusMode: currentFocus,
    blockType: normalizedBlockType,
    sessionIntent: normalizedSessionIntent,
    currentContext: normalizedCurrentContext,
    candidateCommands,
    userCommandPreferences: focusStore.preferences,
    recentCommandHistory: focusStore.recentHistory,
    activeModifiers: activeModifiers ?? [],
    includeScoreBreakdown,
  });
  const commandsReturned = ranked.slice(0, limit ?? ranked.length).map((item) => item.command.label);

  console.info("[QuickCommandAudit]", {
    focusMode: currentFocus,
    blockType: normalizedBlockType,
    sessionIntent: normalizedSessionIntent || null,
    commandsReturned,
  });

  console.info("[QuickCommandRankingAudit]", {
    focusMode: currentFocus,
    blockType: normalizedBlockType,
    sessionIntent: normalizedSessionIntent || null,
    candidateCommands: candidateCommands.map((command) => command.label),
    rankedCommands: commandsReturned,
    topCommand: commandsReturned[0] ?? null,
    personalizationSignalsUsed: {
      preferenceCount: Object.keys(focusStore.preferences).length,
      recentHistoryCount: focusStore.recentHistory.length,
      activeModifierCount: activeModifiers?.length ?? 0,
      userScope: userKey(userId),
    },
    scoreBreakdown: includeScoreBreakdown ? ranked.map((item) => ({ label: item.command.label, score: item.score, breakdown: "breakdown" in item ? item.breakdown : undefined })) : undefined,
  });

  return commandsReturned;
}
