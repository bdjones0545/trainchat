/**
 * Decision Memory Service — Phase B: Memory-Driven Collaboration
 *
 * Extracts structured decision history from the change log and long-term memories,
 * then builds two outputs for the AI:
 *
 * 1. decisionMemoryContext — injected into AI system prompts so it can reference
 *    past edits naturally (e.g. "Earlier we reduced lower body load...")
 *
 * 2. continuityPrompt — an optional check-in question the UI can surface
 *    (e.g. "We've been pushing intensity — want to continue or balance recovery?")
 *
 * Focus areas per spec:
 * - Recent changes: last 3-7 interactions
 * - Major structural decisions (isMajorVersion = true)
 * - Injury/pain flags (from memories)
 */

import { db } from "@workspace/db";
import { systemChangeLog } from "@workspace/db";
import { desc, eq, and } from "drizzle-orm";
import type { MemoryEntry } from "./memory";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface RecentEdit {
  id: number;
  intent: string;
  scope: string;
  changeSummary: string;
  requestText: string | null;
  targetType: string | null;
  targetLabel: string | null;
  isMajorVersion: boolean;
  versionLabel: string | null;
  createdAt: Date;
}

export interface DecisionPattern {
  type: "volume_trend" | "intensity_trend" | "injury_flag" | "structural_change" | "consistency";
  label: string;
  detail: string;
  strength: "weak" | "moderate" | "strong";
}

export interface DecisionMemory {
  recentEdits: RecentEdit[];
  patterns: DecisionPattern[];
  decisionMemoryContext: string;
  continuityPrompt: string | null;
  evolutionSummary: string | null;
}

// ─── Fetch recent edits from change log ──────────────────────────────────────

async function fetchRecentEdits(
  userId: number,
  trainingSystemId: number,
  limit = 10
): Promise<RecentEdit[]> {
  const rows = await db
    .select({
      id: systemChangeLog.id,
      intent: systemChangeLog.intent,
      scope: systemChangeLog.scope,
      changeSummary: systemChangeLog.changeSummary,
      requestText: systemChangeLog.requestText,
      targetType: systemChangeLog.targetType,
      targetLabel: systemChangeLog.targetLabel,
      isMajorVersion: systemChangeLog.isMajorVersion,
      versionLabel: systemChangeLog.versionLabel,
      createdAt: systemChangeLog.createdAt,
    })
    .from(systemChangeLog)
    .where(
      and(
        eq(systemChangeLog.userId, userId),
        eq(systemChangeLog.trainingSystemId, trainingSystemId)
      )
    )
    .orderBy(desc(systemChangeLog.createdAt))
    .limit(limit);

  return rows as RecentEdit[];
}

// ─── Pattern extraction ───────────────────────────────────────────────────────

function extractPatterns(edits: RecentEdit[], memories: MemoryEntry[]): DecisionPattern[] {
  const patterns: DecisionPattern[] = [];
  const recent = edits.slice(0, 7);

  if (recent.length === 0) return patterns;

  // ── Volume trend ──
  const volumeReductions = recent.filter((e) =>
    ["reduce_volume", "deload_week", "reduce_session_volume", "reduce_weekly_volume"].includes(e.intent)
  );
  const volumeIncreases = recent.filter((e) =>
    ["increase_weekly_volume", "increase_volume"].includes(e.intent)
  );

  if (volumeReductions.length >= 2) {
    patterns.push({
      type: "volume_trend",
      label: "Consistent volume reduction",
      detail: `Volume has been pulled back ${volumeReductions.length} times recently — the user is managing fatigue or recovering.`,
      strength: volumeReductions.length >= 3 ? "strong" : "moderate",
    });
  } else if (volumeIncreases.length >= 2) {
    patterns.push({
      type: "volume_trend",
      label: "Sustained volume build",
      detail: `Volume has been progressively increased ${volumeIncreases.length} times — the user is in an accumulation phase.`,
      strength: volumeIncreases.length >= 3 ? "strong" : "moderate",
    });
  }

  // ── Intensity trend ──
  const intensityPushes = recent.filter((e) =>
    ["increase_intensity", "harder_variation", "athletic_emphasis", "refocus_block_power"].includes(e.intent)
  );
  if (intensityPushes.length >= 2) {
    patterns.push({
      type: "intensity_trend",
      label: "Progressive intensity push",
      detail: `Intensity has been escalated ${intensityPushes.length} times recently — the user is building toward peak output.`,
      strength: intensityPushes.length >= 3 ? "strong" : "moderate",
    });
  }

  // ── Injury/modification flags ──
  const injuryEdits = recent.filter((e) =>
    ["injury_modification", "change_session_type"].includes(e.intent) ||
    (e.requestText?.toLowerCase().match(/pain|hurt|shoulder|knee|back|injury|ache|sore/) ?? false)
  );
  const injuryMemories = memories.filter((m) => m.type === "pain_pattern" && m.confidence >= 3);

  if (injuryEdits.length > 0 || injuryMemories.length > 0) {
    const injuryDesc = injuryMemories.length > 0
      ? injuryMemories.map((m) => m.subject).join(", ")
      : "specific movement patterns";
    patterns.push({
      type: "injury_flag",
      label: "Active injury/pain management",
      detail: `The user has flagged discomfort with ${injuryDesc}. Continue to handle these areas with care.`,
      strength: injuryMemories.some((m) => m.confidence >= 4) ? "strong" : "moderate",
    });
  }

  // ── Major structural changes ──
  const structuralChanges = edits.filter((e) => e.isMajorVersion);
  if (structuralChanges.length > 0) {
    const latest = structuralChanges[0];
    patterns.push({
      type: "structural_change",
      label: "Recent structural shift",
      detail: `Last major change: "${latest.versionLabel ?? latest.intent}" (${formatRelativeTime(latest.createdAt)}). The system has evolved meaningfully.`,
      strength: "moderate",
    });
  }

  // ── Consistency ──
  const adherenceMemory = memories.find((m) => m.type === "adherence_pattern" && m.confidence >= 3);
  if (adherenceMemory) {
    patterns.push({
      type: "consistency",
      label: adherenceMemory.sentiment === "positive" ? "Strong consistency" : "Irregular adherence",
      detail: adherenceMemory.detail,
      strength: "moderate",
    });
  }

  return patterns;
}

// ─── Continuity prompt generator ──────────────────────────────────────────────

function generateContinuityPrompt(
  edits: RecentEdit[],
  patterns: DecisionPattern[]
): string | null {
  if (edits.length < 2) return null;

  // Don't spam — only generate a prompt if there's a meaningful trend
  const volumePattern = patterns.find((p) => p.type === "volume_trend");
  const intensityPattern = patterns.find((p) => p.type === "intensity_trend");
  const injuryFlag = patterns.find((p) => p.type === "injury_flag" && p.strength !== "weak");
  const structuralChange = patterns.find((p) => p.type === "structural_change");

  // Prioritize injury awareness
  if (injuryFlag) {
    return "We've been managing some discomfort recently — want to keep that cautious approach or push a bit more where it's feeling better?";
  }

  // Intensity escalation check-in
  if (intensityPattern && intensityPattern.strength === "strong") {
    return "We've been building intensity consistently — want to keep pushing, or would a recovery-focused adjustment make sense here?";
  }

  // Volume reduction context
  if (
    volumePattern?.label === "Consistent volume reduction" &&
    volumePattern.strength !== "weak"
  ) {
    return "We've pulled back volume a few times recently — want to keep things conservative, or are you feeling ready to build back up?";
  }

  // Volume build context
  if (
    volumePattern?.label === "Sustained volume build" &&
    volumePattern.strength === "strong"
  ) {
    return "We've been stacking volume — do you want to keep loading, or should we think about a planned back-off?";
  }

  // After major structural shift
  if (structuralChange) {
    const lastMajor = edits.find((e) => e.isMajorVersion);
    if (lastMajor) {
      return `We made a significant change (${lastMajor.versionLabel ?? "structural shift"}) recently — want to build on that direction or adjust course?`;
    }
  }

  return null;
}

// ─── Evolution summary ────────────────────────────────────────────────────────

function buildEvolutionSummary(edits: RecentEdit[]): string | null {
  if (edits.length < 3) return null;

  const majorEdits = edits.filter((e) => e.isMajorVersion);
  const recentEdits = edits.slice(0, 5);

  const intentLabels: Record<string, string> = {
    reduce_volume: "volume reduction",
    deload_week: "deload",
    increase_intensity: "intensity escalation",
    change_session_type: "session restructuring",
    athletic_emphasis: "athletic reorientation",
    refocus_block_power: "power focus",
    refocus_block_hypertrophy: "hypertrophy focus",
    injury_modification: "injury management",
    swap_exercise: "exercise substitution",
    easier_variation: "regression",
    harder_variation: "progression",
    travel_mode: "travel adaptation",
  };

  const recentIntents = recentEdits
    .map((e) => intentLabels[e.intent] ?? e.intent.replace(/_/g, " "))
    .filter(Boolean)
    .slice(0, 3);

  if (recentIntents.length === 0) return null;

  const evolutionLine = majorEdits.length > 0
    ? `This system has gone through ${majorEdits.length} major structural change${majorEdits.length > 1 ? "s" : ""}.`
    : "";

  return `Recent trajectory: ${recentIntents.join(" → ")}. ${evolutionLine}`.trim();
}

// ─── Context builder for AI prompts ──────────────────────────────────────────

function buildDecisionMemoryContext(
  edits: RecentEdit[],
  patterns: DecisionPattern[],
  memories: MemoryEntry[]
): string {
  if (edits.length === 0 && patterns.length === 0) return "";

  const lines: string[] = [];
  lines.push("## DECISION HISTORY & SYSTEM EVOLUTION");
  lines.push("");

  // Recent edits (last 5, brief)
  if (edits.length > 0) {
    lines.push("### Recent Edits (most recent first)");
    const recent = edits.slice(0, 7);
    for (const edit of recent) {
      const target = edit.targetLabel ? ` on "${edit.targetLabel}"` : "";
      const label = edit.versionLabel ? ` [${edit.versionLabel}]` : "";
      const timeAgo = formatRelativeTime(edit.createdAt);
      lines.push(`- [${timeAgo}]${label} ${edit.changeSummary.split(".")[0]}${target}.`);
    }
    lines.push("");
  }

  // Patterns
  if (patterns.length > 0) {
    lines.push("### Detected Patterns");
    for (const p of patterns) {
      lines.push(`- **${p.label}**: ${p.detail}`);
    }
    lines.push("");
  }

  // Injury/pain memories (highest priority)
  const painMemories = memories.filter((m) => m.type === "pain_pattern" && m.confidence >= 3);
  if (painMemories.length > 0) {
    lines.push("### Active Limitations (HIGH PRIORITY)");
    for (const m of painMemories) {
      lines.push(`- ${m.detail}`);
    }
    lines.push("");
  }

  lines.push(
    "USE THIS HISTORY to reference past decisions naturally in your response. " +
    "Say things like 'Earlier we reduced your lower body load — I'll build off that' or " +
    "'You've been consistent, so we can safely progress this.' " +
    "Speak like a coach who has been working with this athlete, not a system reading logs. " +
    "Do NOT list the history robotically. Reference only what is directly relevant."
  );

  return lines.join("\n");
}

// ─── Utility ──────────────────────────────────────────────────────────────────

function formatRelativeTime(date: Date): string {
  const now = Date.now();
  const diffMs = now - date.getTime();
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffDays === 0) return "today";
  if (diffDays === 1) return "yesterday";
  if (diffDays <= 7) return `${diffDays}d ago`;
  if (diffDays <= 30) return `${Math.floor(diffDays / 7)}w ago`;
  return `${Math.floor(diffDays / 30)}mo ago`;
}

// ─── Main export ──────────────────────────────────────────────────────────────

export async function buildDecisionMemory(
  userId: number,
  trainingSystemId: number,
  memories: MemoryEntry[] = []
): Promise<DecisionMemory> {
  const edits = await fetchRecentEdits(userId, trainingSystemId, 10);
  const patterns = extractPatterns(edits, memories);
  const continuityPrompt = generateContinuityPrompt(edits, patterns);
  const evolutionSummary = buildEvolutionSummary(edits);
  const decisionMemoryContext = buildDecisionMemoryContext(edits, patterns, memories);

  return {
    recentEdits: edits,
    patterns,
    decisionMemoryContext,
    continuityPrompt,
    evolutionSummary,
  };
}
