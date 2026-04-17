/**
 * ══════════════════════════════════════════════════════════════════════════════
 * AGENT SETTINGS INTEGRATION LAYER — TrainChat
 * ══════════════════════════════════════════════════════════════════════════════
 *
 * SINGLE SOURCE OF TRUTH for all user settings that affect agent behavior.
 *
 * This resolver:
 *   1. Loads training preferences from the DB profile
 *   2. Merges client-sent behavior settings (concise, proactive, etc.)
 *   3. Returns a typed AgentSettingsContext / AgentConstraintContract
 *   4. Produces prompt strings to inject downstream
 *
 * SETTINGS PRECEDENCE (highest → lowest):
 *   1. Explicit current user message (prompt-level overrides)
 *   2. Resolved settings / training preferences (this layer)
 *   3. Stored memory / profile defaults
 *   4. Generic system defaults
 *
 * Examples:
 *   - Profile says "soccer" but prompt says "football" → prompt wins
 *   - Prompt is silent on days/week → settings fill the gap
 *   - Settings are empty → memory/defaults inform
 *
 * ══════════════════════════════════════════════════════════════════════════════
 */

import { db, userProfilesTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { logger } from "./logger";

// ─── Behavior Settings (from client — stored in localStorage) ─────────────────
//
// These control HOW the agent communicates and acts.
// Sent by the frontend with each message since they live in localStorage.

export interface CoachBehaviorSettings {
  /** If true: shorter, more direct responses. No verbose reasoning. */
  conciseResponses: boolean;
  /** If true: agent may surface trends and suggestions unprompted. */
  proactiveInsights: boolean;
  /** If true: agent may apply mutations directly. If false: suggest-only mode. */
  autoAdjustRecommendations: boolean;
  /** If true: read+write long-term memory. If false: stateless responses only. */
  memoryPersonalization: boolean;
}

// ─── Training Preferences (from DB profile) ──────────────────────────────────
//
// These define WHAT the agent builds and how it constrains the program.
// Loaded from the DB; override with prompt when prompt is explicit.

export interface AgentTrainingContext {
  goal: string | null;
  sport: string | null;
  experience: string | null;
  trainingStyle: string | null;
  daysPerWeek: number | null;
  sessionLength: number | null;
  equipment: string | null;
  limitations: string | null;
}

// ─── Execution Permission ────────────────────────────────────────────────────
//
// Derived from autoAdjustRecommendations.
// Controls whether the agent can apply mutations or must only suggest.

export type ExecutionPermission = "apply_mutation" | "suggest_only";

// ─── Full Settings Contract ───────────────────────────────────────────────────
//
// Single canonical object passed through the full agent pipeline.
// This is AgentConstraintContract as described in the spec.

export interface AgentSettingsContext {
  behavior: CoachBehaviorSettings & {
    executionPermission: ExecutionPermission;
  };
  training: AgentTrainingContext;
  source: {
    profileLoaded: boolean;
    settingsFromClient: boolean;
    profileId: number | null;
  };
}

// ─── Defaults ─────────────────────────────────────────────────────────────────

const DEFAULT_BEHAVIOR: CoachBehaviorSettings = {
  conciseResponses: false,
  proactiveInsights: true,
  autoAdjustRecommendations: true,
  memoryPersonalization: true,
};

// ─── Resolver ─────────────────────────────────────────────────────────────────

/**
 * Resolves the full AgentSettingsContext for a user on every request.
 *
 * @param userId - The authenticated user's ID
 * @param clientSettings - Behavior settings sent from the client (from localStorage).
 *                         Partial — defaults are applied for missing fields.
 */
export async function resolveAgentSettingsContext(
  userId: number,
  clientSettings?: Partial<CoachBehaviorSettings> | null,
): Promise<AgentSettingsContext> {
  // ── 1. Load training profile from DB ────────────────────────────────────────
  let profileRow: typeof userProfilesTable.$inferSelect | null = null;
  try {
    const [row] = await db
      .select()
      .from(userProfilesTable)
      .where(eq(userProfilesTable.userId, userId))
      .limit(1);
    profileRow = row ?? null;
  } catch (err) {
    logger.warn({ err, userId }, "[AgentSettings] Failed to load profile — using defaults");
  }

  const profileLoaded = profileRow !== null;

  // ── 2. Merge behavior settings ──────────────────────────────────────────────
  // Client-sent settings take precedence over defaults.
  // If the client sends no settings (e.g. server-to-server call), use defaults.
  const behaviorSettings: CoachBehaviorSettings = {
    conciseResponses: clientSettings?.conciseResponses ?? DEFAULT_BEHAVIOR.conciseResponses,
    proactiveInsights: clientSettings?.proactiveInsights ?? DEFAULT_BEHAVIOR.proactiveInsights,
    autoAdjustRecommendations: clientSettings?.autoAdjustRecommendations ?? DEFAULT_BEHAVIOR.autoAdjustRecommendations,
    memoryPersonalization: clientSettings?.memoryPersonalization ?? DEFAULT_BEHAVIOR.memoryPersonalization,
  };

  // ── 3. Derive execution permission ──────────────────────────────────────────
  const executionPermission: ExecutionPermission = behaviorSettings.autoAdjustRecommendations
    ? "apply_mutation"
    : "suggest_only";

  // ── 4. Build training context from profile ──────────────────────────────────
  const training: AgentTrainingContext = {
    goal: profileRow?.trainingGoal ?? null,
    sport: profileRow?.sportFocus ?? null,
    experience: profileRow?.experienceLevel ?? null,
    trainingStyle: profileRow?.trainingStyle ?? null,
    daysPerWeek: profileRow?.daysPerWeek ?? null,
    sessionLength: profileRow?.sessionDuration ?? null,
    equipment: profileRow?.equipmentAccess ?? null,
    limitations: profileRow?.injuries ?? null,
  };

  const ctx: AgentSettingsContext = {
    behavior: { ...behaviorSettings, executionPermission },
    training,
    source: {
      profileLoaded,
      settingsFromClient: clientSettings != null,
      profileId: profileRow?.id ?? null,
    },
  };

  // ── 5. Audit log ─────────────────────────────────────────────────────────────
  logger.info(
    {
      userId,
      conciseResponses: ctx.behavior.conciseResponses,
      proactiveInsights: ctx.behavior.proactiveInsights,
      autoAdjustRecommendations: ctx.behavior.autoAdjustRecommendations,
      memoryPersonalization: ctx.behavior.memoryPersonalization,
      executionPermission: ctx.behavior.executionPermission,
      goal: ctx.training.goal,
      sport: ctx.training.sport,
      experience: ctx.training.experience,
      trainingStyle: ctx.training.trainingStyle,
      daysPerWeek: ctx.training.daysPerWeek,
      sessionLength: ctx.training.sessionLength,
      equipment: ctx.training.equipment ? ctx.training.equipment.slice(0, 60) : null,
      limitations: ctx.training.limitations ? ctx.training.limitations.slice(0, 60) : null,
      source: ctx.source,
    },
    "[AgentSettingsAudit] Settings resolved — contract active for this request"
  );

  return ctx;
}

// ─── Prompt Builders ──────────────────────────────────────────────────────────
//
// These convert the settings context into injectable prompt strings.
// Each function is single-responsibility and can be used independently.

/**
 * Builds behavior instruction block for the AI system prompt.
 * Controls response style, proactive behavior, and mutation authority.
 * Injected into every AI call.
 */
export function buildBehaviorInstructions(ctx: AgentSettingsContext): string {
  const lines: string[] = [];

  // ── Response length / depth ────────────────────────────────────────────────
  if (ctx.behavior.conciseResponses) {
    lines.push(`## RESPONSE STYLE — CONCISE MODE [user preference: on]
- Keep all responses SHORT: 1–3 sentences for conversational turns.
- Lead with the answer or action. Never open with context-setting.
- Omit reasoning and educational tangents unless explicitly requested.
- Program confirmations: one line + direct to program panel. No elaboration.
- Even for complex topics: state the conclusion first, skip the journey.`);
  } else {
    lines.push(`## RESPONSE STYLE — STANDARD MODE [user preference: detailed]
- Provide educational depth when it adds value.
- Explain the 'why' behind key programming decisions briefly.
- More rationale is welcome when discussing periodization, injury management, or adaptation.
- Still eliminate filler — every sentence must carry information.`);
  }

  // ── Proactive insights ─────────────────────────────────────────────────────
  if (!ctx.behavior.proactiveInsights) {
    lines.push(`## PROACTIVE INSIGHTS — DISABLED [user preference: off]
CRITICAL: Do NOT offer unsolicited suggestions, trends, observations, or pattern notes.
- Answer ONLY what the user directly asked. Nothing more.
- Do not surface readiness trends, future recommendations, or coaching asides.
- Do not mention "I've noticed" or "Something worth flagging..." patterns.
- Respond. Stop. Do not extend the conversation unprompted.`);
  }

  // ── Mutation authority ─────────────────────────────────────────────────────
  if (ctx.behavior.executionPermission === "suggest_only") {
    lines.push(`## MUTATION AUTHORITY — SUGGEST-ONLY MODE [user preference: auto-adjust off]
IMPORTANT: The user has turned off auto-adjust recommendations.
- When asked for a program change: DESCRIBE the recommended change clearly.
- Do NOT apply the change. Do NOT modify the program structure directly.
- End your suggestion with an explicit confirmation prompt: "Want me to apply this change?"
- Only proceed with mutation after the user explicitly confirms.
- Example: "I'd recommend replacing the Romanian Deadlift with a Trap Bar Deadlift here for your knee. Want me to make that swap?"
This mode applies to ALL mutation paths — edit engine, specialist layer, and AI-generated edits.`);
  }

  return lines.join("\n\n");
}

/**
 * Builds a profile fill context block for the AI system prompt.
 * Provides training preferences as defaults when the user's message is silent.
 * Precedence: explicit message > this context > memory > defaults.
 */
export function buildProfileFillContext(ctx: AgentSettingsContext): string {
  const t = ctx.training;
  const parts: string[] = [];

  if (t.goal) parts.push(`- Primary goal: ${t.goal.replace(/_/g, " ")}`);
  if (t.sport) parts.push(`- Sport / activity context: ${t.sport}`);
  if (t.experience) parts.push(`- Experience level: ${t.experience}`);
  if (t.trainingStyle) parts.push(`- Training style: ${t.trainingStyle.replace(/_/g, " ")}`);
  if (t.daysPerWeek) parts.push(`- Preferred training frequency: ${t.daysPerWeek} days/week`);
  if (t.sessionLength) parts.push(`- Session duration target: ${t.sessionLength} minutes`);
  if (t.equipment) parts.push(`- Equipment access: ${t.equipment}`);
  if (t.limitations) parts.push(`- Injuries / limitations: ${t.limitations}`);

  if (parts.length === 0) return "";

  return `## TRAINING PROFILE — DEFAULT CONTEXT [fill gaps when prompt is silent]
Use these to fill in unstated preferences. They represent the user's saved training profile.

PRECEDENCE RULE: The user's explicit message ALWAYS wins.
- If message says "60 minutes" but profile says 45 → use 60 minutes.
- If message says "home gym" but profile says full gym → use home gym.
- If message says "football" but profile says soccer → football wins for this request.
- If message is silent on a dimension → use the profile default below.

${parts.join("\n")}`;
}

/**
 * Builds the suggest-only coaching response when a mutation was requested
 * but autoAdjustRecommendations is off.
 */
export function buildSuggestOnlyResponse(
  changeType: string,
  targetLabel?: string | null,
): string {
  const target = targetLabel ? ` for ${targetLabel}` : "";
  return `Here's what I'd recommend${target}: ${changeType}\n\nWant me to apply this change to your program?`;
}
