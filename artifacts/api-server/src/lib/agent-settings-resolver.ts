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

  /**
   * Coaching voice preference.
   * "direct"     → performance-focused, blunt, no padding
   * "supportive" → encouraging, warm, motivational (default)
   * "analytical" → data-driven, educational, clinical
   */
  coachingStyle: "direct" | "supportive" | "analytical";

  /**
   * How much reasoning and context Atlas provides.
   * "minimal"  → conclusions only, no rationale
   * "balanced" → brief rationale when it adds value (default)
   * "detailed" → full explanation of decisions and periodization logic
   */
  explanationDepth: "minimal" | "balanced" | "detailed";

  /**
   * Training progression aggression.
   * "conservative"  → prioritize recovery, stability, and sustainability
   * "balanced"      → standard progression with appropriate recovery (default)
   * "aggressive"    → bias toward overload and progression
   * "competition"   → maximize performance while maintaining safety floor
   */
  trainingAggression: "conservative" | "balanced" | "aggressive" | "competition";

  /**
   * Require explicit user approval before applying structural program changes.
   * Structural = phase shifts, program rebuilds, focus mode changes.
   */
  requireApprovalStructural: boolean;

  /**
   * Require explicit user approval before scheduling deload weeks.
   */
  requireApprovalDeload: boolean;

  /**
   * Allow Atlas to auto-adapt training based on readiness check-ins.
   */
  adaptFromReadiness: boolean;

  /**
   * Allow Atlas to auto-adapt training when sessions are missed.
   */
  adaptFromMissedSessions: boolean;
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
  coachingStyle: "supportive",
  explanationDepth: "balanced",
  trainingAggression: "balanced",
  requireApprovalStructural: false,
  requireApprovalDeload: false,
  adaptFromReadiness: true,
  adaptFromMissedSessions: true,
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
  const behaviorSettings: CoachBehaviorSettings = {
    conciseResponses: clientSettings?.conciseResponses ?? DEFAULT_BEHAVIOR.conciseResponses,
    proactiveInsights: clientSettings?.proactiveInsights ?? DEFAULT_BEHAVIOR.proactiveInsights,
    autoAdjustRecommendations: clientSettings?.autoAdjustRecommendations ?? DEFAULT_BEHAVIOR.autoAdjustRecommendations,
    memoryPersonalization: clientSettings?.memoryPersonalization ?? DEFAULT_BEHAVIOR.memoryPersonalization,
    coachingStyle: clientSettings?.coachingStyle ?? DEFAULT_BEHAVIOR.coachingStyle,
    explanationDepth: clientSettings?.explanationDepth ?? DEFAULT_BEHAVIOR.explanationDepth,
    trainingAggression: clientSettings?.trainingAggression ?? DEFAULT_BEHAVIOR.trainingAggression,
    requireApprovalStructural: clientSettings?.requireApprovalStructural ?? DEFAULT_BEHAVIOR.requireApprovalStructural,
    requireApprovalDeload: clientSettings?.requireApprovalDeload ?? DEFAULT_BEHAVIOR.requireApprovalDeload,
    adaptFromReadiness: clientSettings?.adaptFromReadiness ?? DEFAULT_BEHAVIOR.adaptFromReadiness,
    adaptFromMissedSessions: clientSettings?.adaptFromMissedSessions ?? DEFAULT_BEHAVIOR.adaptFromMissedSessions,
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
      coachingStyle: ctx.behavior.coachingStyle,
      explanationDepth: ctx.behavior.explanationDepth,
      trainingAggression: ctx.behavior.trainingAggression,
      requireApprovalStructural: ctx.behavior.requireApprovalStructural,
      requireApprovalDeload: ctx.behavior.requireApprovalDeload,
      adaptFromReadiness: ctx.behavior.adaptFromReadiness,
      adaptFromMissedSessions: ctx.behavior.adaptFromMissedSessions,
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
 * Controls response style, proactive behavior, coaching voice, aggression, and mutation authority.
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
    const depthMap = {
      minimal: `## RESPONSE DEPTH — MINIMAL [user preference: conclusions only]
- State the answer or action directly. No rationale unless asked.
- Skip the 'why'. The user wants outcomes, not explanations.
- Bullet points over paragraphs. Numbers over narrative.`,
      balanced: `## RESPONSE STYLE — STANDARD MODE [user preference: balanced]
- Provide educational depth when it adds value.
- Explain the 'why' behind key programming decisions briefly.
- More rationale is welcome when discussing periodization, injury management, or adaptation.
- Still eliminate filler — every sentence must carry information.`,
      detailed: `## RESPONSE DEPTH — DETAILED [user preference: full reasoning]
- Provide thorough context and reasoning for programming decisions.
- Explain periodization logic, exercise selection rationale, and adaptation mechanisms.
- Use your full coaching knowledge — the user wants to understand the system.
- Walk through your thinking when relevant. This user values education.`,
    };
    lines.push(depthMap[ctx.behavior.explanationDepth] ?? depthMap.balanced);
  }

  // ── Coaching style / voice ─────────────────────────────────────────────────
  if (ctx.behavior.coachingStyle === "direct") {
    lines.push(`## COACHING VOICE — DIRECT & PERFORMANCE-FOCUSED [user preference]
- Communicate with precision and economy. No softening, no filler.
- Lead with the performance outcome, not the emotional frame.
- Skip motivational padding — this user knows why they train.
- Corrections: direct and specific. "That's wrong, here's why, here's the fix."
- Reinforcement: acknowledge what's working, move on.
- Sentence structure: short, active voice, action-first.`);
  } else if (ctx.behavior.coachingStyle === "analytical") {
    lines.push(`## COACHING VOICE — ANALYTICAL & EDUCATIONAL [user preference]
- Lead with data, mechanisms, and evidence.
- Frame decisions in terms of systems: load, adaptation, recovery, performance curves.
- Explain *why* something works or doesn't — mechanisms matter.
- Use specific numbers, ranges, and thresholds rather than vague guidance.
- Reinforcement: reference observed trends or data points.
- This user values understanding the model, not just the prescription.`);
  } else {
    lines.push(`## COACHING VOICE — SUPPORTIVE & ENCOURAGING [user preference]
- Balance honesty with encouragement — truth delivered warmly.
- Acknowledge effort and progress before pivoting to improvements.
- Use motivational framing when appropriate, but anchor it in real coaching value.
- Corrections: specific and constructive, never harsh.
- Reinforcement: genuine and specific — not generic praise.`);
  }

  // ── Training aggression ────────────────────────────────────────────────────
  if (ctx.behavior.trainingAggression === "conservative") {
    lines.push(`## PROGRESSION PHILOSOPHY — CONSERVATIVE [user preference]
CRITICAL: This user prioritizes recovery, sustainability, and injury prevention over rapid progression.
- Favor sub-maximal loads (70–80% of capacity) over pushing limits.
- Default to longer adaptation periods before increasing load.
- When in doubt: reduce, not increase. Protect long-term capacity.
- Autoregulation thresholds: back off at first signs of accumulated fatigue.
- Structural changes: only when the user is clearly handling current load well.
- Deload frequency: err toward more frequent, shorter deloads.`);
  } else if (ctx.behavior.trainingAggression === "aggressive") {
    lines.push(`## PROGRESSION PHILOSOPHY — AGGRESSIVE [user preference]
This user tolerates and seeks high training stimulus. They can handle more.
- Bias toward progressive overload — advance load, volume, or density when adaptations show.
- Push close to but not through failure. Performance over comfort.
- Autoregulation thresholds: hold load through normal fatigue; only back off at clear breakdown.
- Structural changes: move faster through progressions when the user is responding well.
- Deload: use strategically, not conservatively. Short and purposeful.`);
  } else if (ctx.behavior.trainingAggression === "competition") {
    lines.push(`## PROGRESSION PHILOSOPHY — COMPETITION MODE [user preference]
This user is in a performance phase. Every session counts.
- Maximize performance output within safety constraints.
- Programming: peak-focused. Intensity and specificity over variety.
- Recovery: managed actively, not passively. Protect competition readiness.
- Autoregulation: intelligent, not conservative. Preserve sharpness.
- Structural changes: require strong evidence; stability is competitive advantage.
- Safety floor: never compromise. Injury prevention is non-negotiable in comp prep.`);
  }
  // "balanced" is the default — no additional block needed

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
  } else {
    // Granular approval constraints even in auto-apply mode
    const approvalLines: string[] = [];
    if (ctx.behavior.requireApprovalStructural) {
      approvalLines.push("- STRUCTURAL changes (phase shifts, program rebuilds, focus mode changes): ALWAYS require explicit user confirmation before applying.");
    }
    if (ctx.behavior.requireApprovalDeload) {
      approvalLines.push("- DELOAD weeks: propose and describe, then ask 'Want me to schedule this deload?' before applying.");
    }
    if (approvalLines.length > 0) {
      lines.push(`## MUTATION APPROVAL — GRANULAR GATES [user preference]\nMinor adjustments can be applied automatically. However:\n${approvalLines.join("\n")}`);
    }

    const adaptLines: string[] = [];
    if (!ctx.behavior.adaptFromReadiness) {
      adaptLines.push("- Do NOT automatically adapt programming based on readiness check-in scores. Acknowledge the check-in but preserve current program structure unless explicitly asked.");
    }
    if (!ctx.behavior.adaptFromMissedSessions) {
      adaptLines.push("- Do NOT automatically compress or restructure the program when sessions are missed. Note the missed session but hold the plan.");
    }
    if (adaptLines.length > 0) {
      lines.push(`## ADAPTATION GATES — USER PREFERENCE\n${adaptLines.join("\n")}`);
    }
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
