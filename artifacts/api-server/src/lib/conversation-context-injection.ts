import { buildAdaptationContext } from "./adaptation";
import { syncMemoriesFromData, listMemories, buildMemoryContext, extractMemoriesFromMessage } from "./memory";
import { generateInsights, buildInsightPromptHint } from "./insights";
import { buildSessionLogContext } from "./session-log-adaptation-analyzer";
import { loadHardConstraints, buildConstraintEnforcementDirective, type HardConstraints } from "./constraint-memory";
import { safeBackground } from "./safe-background";
import type { AgentSettingsContext } from "./agent-settings-resolver";

// ─── Types ────────────────────────────────────────────────────────────────────

export type ContextInjectionOptions = {
  userId: number;
  /** True when planInfo.features.adaptationContext is set — unlocks Pro memory/adaptation paths. */
  isPro: boolean;
  agentSettings: AgentSettingsContext;
  /** Already-resolved focus mode string (pass null when unavailable). */
  sessionFocusMode: string | null;
  /** True when this is the first user message in the conversation — enables the returning-athlete opener. */
  isFirstUserMessage: boolean;
  /** Raw content of the user's current message — used for background memory extraction. */
  userMessageContent: string;
};

export type ContextInjectionResult = {
  adaptationCtx: string;
  memoryCtx: string;
  insightHint: string;
  hardConstraints: HardConstraints;
  constraintDirective: string | null;
};

// ─── Constants ────────────────────────────────────────────────────────────────

const EMPTY_HARD_CONSTRAINTS: HardConstraints = {
  bannedItems: [],
  dislikedItems: [],
  painRegions: [],
  monitorRegions: [],
  sport: null,
};

const OPENER_PRIORITY = [
  "pain_pattern",
  "sport_context",
  "exercise_preference",
  "adherence_pattern",
  "volume_response",
  "training_preference",
];

// ─── Core function ────────────────────────────────────────────────────────────

/**
 * Builds the memory and adaptation prompt context blocks injected into every
 * AI call. Encapsulates plan-gated branching (Pro vs free), constraint loading,
 * returning-athlete opener, behavioral signals, session-log grounding, and the
 * mutation-language directive. Background memory sync/extract ops are fired
 * inside here when allowed.
 *
 * Output is identical to what the two inline blocks in conversations.ts produced
 * — this is a pure extraction with no behavior change.
 */
export async function buildConversationContext(
  opts: ContextInjectionOptions,
): Promise<ContextInjectionResult> {
  const { userId, isPro, agentSettings, sessionFocusMode, isFirstUserMessage, userMessageContent } = opts;

  const allowMemory = isPro && agentSettings.behavior.memoryPersonalization;
  const allowInsights = agentSettings.behavior.proactiveInsights;

  let adaptationCtx = "";
  let memoryCtx = "";
  let insightHint = "";
  let hardConstraints: HardConstraints = { ...EMPTY_HARD_CONSTRAINTS };
  let constraintDirective: string | null = null;

  if (isPro) {
    const [adaptation, memories, sessionLogCtx] = await Promise.all([
      buildAdaptationContext(userId, sessionFocusMode).catch(() => ({ promptContext: "" })),
      allowMemory ? listMemories(userId).catch(() => []) : Promise.resolve([]),
      buildSessionLogContext(userId).catch(() => ""),
    ]);

    adaptationCtx = adaptation.promptContext;
    memoryCtx = allowMemory ? buildMemoryContext(memories) : "";

    if (sessionLogCtx) {
      memoryCtx += `\n\n${sessionLogCtx}`;
    }

    if (allowInsights && allowMemory) {
      const insights = await generateInsights(userId, memories).catch(() => []);
      insightHint = buildInsightPromptHint(insights);
    }

    if (allowMemory) {
      safeBackground(syncMemoriesFromData(userId), "sync-memories", { userId });
      safeBackground(extractMemoriesFromMessage(userId, userMessageContent), "extract-memories", { userId });
    }

    hardConstraints = loadHardConstraints(allowMemory ? memories : []);
    constraintDirective = buildConstraintEnforcementDirective(hardConstraints);

    // ── Priority 5 / 2: Returning-athlete opener + proactive behavioral signal ──
    // Appended only on the first message of a conversation so the coach can
    // open with a natural reference to what it already knows about the athlete.
    if (allowMemory && memories.length > 0 && isFirstUserMessage) {
      const highConfMemories = memories.filter((m: any) => m.confidence >= 3);

      if (highConfMemories.length > 0) {
        const topMemory = [...highConfMemories].sort((a: any, b: any) => {
          const pa = OPENER_PRIORITY.indexOf(a.type);
          const pb = OPENER_PRIORITY.indexOf(b.type);
          if (pa !== pb) return (pa === -1 ? 999 : pa) - (pb === -1 ? 999 : pb);
          return b.confidence - a.confidence;
        })[0] as any;

        memoryCtx +=
          `\n\n## RETURNING ATHLETE — PROACTIVE OPENER\n` +
          `This is the first message of a new conversation. Before answering, open with one brief, ` +
          `coach-like sentence referencing what you already know about this athlete. Make it feel ` +
          `natural — like a real coach who remembers their client. DO NOT say "Based on my memory" ` +
          `or "I know that you". Examples: "Good to be back — how's that shoulder holding up?" or ` +
          `"We've been building more athletically lately — continuing that direction?" ` +
          `Memory to reference: [${topMemory.type}] "${topMemory.detail}"`;
      }

      const behavioralSignals = memories.filter(
        (m: any) =>
          ["adherence_pattern", "volume_response", "recovery_pattern"].includes(m.type) &&
          m.sentiment === "negative" &&
          m.confidence >= 3,
      );
      if (behavioralSignals.length > 0) {
        const signal = behavioralSignals[0] as any;
        memoryCtx +=
          `\n\n## PROACTIVE BEHAVIORAL SIGNAL\n` +
          `Pattern observed: ${signal.detail}. If clearly relevant to what the user is asking today, ` +
          `briefly and naturally surface it before answering. Keep it coaching-toned and concise. ` +
          `Example: "I've noticed [pattern] — want me to factor that in?" Only include if genuinely ` +
          `relevant. Do NOT force it into every response.`;
      }
    }
  } else {
    // Non-Pro path: load memories only for hard-constraint enforcement, not prompt injection.
    const constraintMemories = await listMemories(userId).catch(() => []);
    hardConstraints = loadHardConstraints(constraintMemories);
    constraintDirective = buildConstraintEnforcementDirective(hardConstraints);

    // Session log context is injected for all users — grounds the coach in real feedback.
    const sessionLogCtxFree = await buildSessionLogContext(userId).catch(() => "");
    if (sessionLogCtxFree) {
      memoryCtx += `\n\n${sessionLogCtxFree}`;
    }
  }

  // Always injected regardless of plan — prevents past-tense confirmation language on mutations.
  memoryCtx +=
    `\n\n## MUTATION RESPONSE LANGUAGE\n` +
    `When applying program changes: never use past-tense confirmation ("Done", "I've updated", ` +
    `"Your program has been changed"). Use present-tense or forward-looking language: ` +
    `"Applying that now — see the changes in your program panel" or "On it — the panel will show ` +
    `the update." The verification indicator in the UI confirms success.`;

  return { adaptationCtx, memoryCtx, insightHint, hardConstraints, constraintDirective };
}
