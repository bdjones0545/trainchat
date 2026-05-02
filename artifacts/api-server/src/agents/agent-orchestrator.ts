// ─── Agent Orchestrator ──────────────────────────────────────────────────────
//
// Central coordination layer for TrainChat's three-agent architecture.
//
// ┌──────────────────────────────────────────────────────────────────────────────┐
// │                    THREE-AGENT ARCHITECTURE MAP                              │
// ├───────────────────────────────┬──────────────────────────────────────────────┤
// │ Agent (Internal Persona)      │ Responsibility                               │
// ├───────────────────────────────┼──────────────────────────────────────────────┤
// │ Coach Agent                   │ All user-facing conversation, program        │
// │ [Coach Atlas]                 │ building, program editing, coaching          │
// │ (lib/ai.ts)                   │ responses. Single OpenAI system prompt.      │
// │                               │ Never touches research ingestion.            │
// │                               │ User only knows this as "TrainChat."         │
// ├───────────────────────────────┼──────────────────────────────────────────────┤
// │ Performance Architect         │ Deterministic (no AI call). Generates        │
// │ [Architect Vale]              │ CNS-driven architecture briefs, validates    │
// │ (program-architecture-        │ session structures, selects exercises via    │
// │  engine.ts)                   │ the variation engine. Called FROM the Coach  │
// │                               │ on build paths, never on edit paths.         │
// │                               │ Never speaks to users.                       │
// ├───────────────────────────────┼──────────────────────────────────────────────┤
// │ Research Librarian            │ Separate AI agent. Evaluates, summarizes,    │
// │ [Dr. Sable]                   │ and chunks research documents. Admin-only.   │
// │ (research/research-           │ NEVER called during user chat sessions.      │
// │  librarian-agent.ts)          │ Never speaks to users.                       │
// └───────────────────────────────┴──────────────────────────────────────────────┘
//
// Internal persona names (Coach Atlas / Architect Vale / Dr. Sable) are for
// dev/admin logs only. They must NEVER appear in user-facing responses.
// See: src/agents/agent-personas.ts for full persona definitions.
//
// This module provides:
//   1. Typed handoff contracts between agents
//   2. Routing rules (which agents participate in each turn)
//   3. Conflict resolution hierarchy (typed priority rules)
//   4. Architecture validation gate (pre-send program integrity check)
//   5. Observability logging (structured events for every orchestration decision)
//
// CRITICAL INVARIANTS (never break):
//   • Research Librarian is NEVER called during normal user chat
//   • Simple edits skip the Performance Architect (fast path)
//   • Agent names are NEVER exposed to users in any response text
//   • The validation gate is non-blocking — it warns, logs, but never silently drops a program
//   • All conflict resolution follows the 5-tier hierarchy below, in strict order
// ─────────────────────────────────────────────────────────────────────────────

import { logger } from "../lib/logger";

// ─── Agent Roles ─────────────────────────────────────────────────────────────

export type AgentRole =
  | "coach"                 // User-facing Coach Agent — internal persona: Coach Atlas
  | "performance_architect" // Deterministic engine   — internal persona: Architect Vale
  | "research_librarian";   // Admin-only AI agent    — internal persona: Dr. Sable

/** Maps AgentRole to its internal persona name for dev/admin log labels. */
export const AGENT_PERSONA_LABELS: Record<AgentRole, string> = {
  coach: "Coach Atlas",
  performance_architect: "Architect Vale",
  research_librarian: "Dr. Sable",
};

/**
 * Returns the persona label for a log message.
 * Returns the label only in non-production or admin contexts to prevent leakage.
 */
export function personaLabel(
  role: AgentRole,
  opts: { isAdmin?: boolean } = {}
): string {
  if (process.env.NODE_ENV !== "production" || opts.isAdmin) {
    return AGENT_PERSONA_LABELS[role];
  }
  return role;
}

// ─── Orchestrator Route ───────────────────────────────────────────────────────
//
// Determines which agents participate in handling this conversation turn.
// Derived from the execution planner's action + intent classification.

export type OrchestratorRoute =
  | "DIRECT_EDIT"          // Atomic surgical edit — Coach only. No architect involvement.
  | "BUILD_WITH_ARCHITECT" // New build or structural rebuild — Architect brief → Coach.
  | "GUIDANCE"             // Coaching/question response — Coach only, no program output.
  | "RETRIEVE"             // Return current program — no AI call needed.
  | "LIBRARIAN_ADMIN"      // Admin-only research ingestion — Librarian only. Never user-facing.
  | "NO_OP";               // Error, paywall, or unroutable turn.

// ─── Conflict Resolution Hierarchy ───────────────────────────────────────────
//
// When programming decisions conflict, the system resolves them in this exact
// priority order (1 = highest, 5 = lowest). This mirrors the system prompt's
// CONFLICT RESOLUTION PRIORITY ORDER section and is the authoritative source
// for all typed conflict resolution in the codebase.
//
// Every agent is bound by this hierarchy. No user preference overrides a safety rule.

export type ConflictPriority =
  | "SAFETY"              // 1 — Never program movements that cause harm
  | "MOVEMENT_QUALITY"    // 2 — Degraded mechanics override volume or load targets
  | "GOAL_OUTPUT"         // 3 — Program must serve the stated goal
  | "FATIGUE_MANAGEMENT"  // 4 — Recovery capacity constrains everything else
  | "USER_PREFERENCE";    // 5 — Honored within safety and quality bounds

export interface ConflictResolutionRule {
  priority: ConflictPriority;
  rank: 1 | 2 | 3 | 4 | 5;
  description: string;
  triggerConditions: string[];
  agentBehavior: string;
  exampleViolations: string[];
}

export const CONFLICT_RESOLUTION_HIERARCHY: ConflictResolutionRule[] = [
  {
    priority: "SAFETY",
    rank: 1,
    description: "Safety and joint integrity override all other considerations.",
    triggerConditions: [
      "User has flagged injury or pain region",
      "Return-from-injury mode is active",
      "Special considerations mode is active",
      "Request asks for training that directly risks harm",
    ],
    agentBehavior:
      "Acknowledge the intent in one line. State the safety concern briefly. Redirect and execute a safe alternative immediately.",
    exampleViolations: [
      "User requests same-muscle-to-failure every session → blocked (recovery violation)",
      "Injury flagged + explosive B block requested → explosive block removed, safer pattern selected",
      "Return-from-injury + heavy axial loading → load reduced to RPE 4-7, no max-effort sets",
      "Shoulder restriction + overhead pressing → replaced with horizontal push or landmine pattern",
    ],
  },
  {
    priority: "MOVEMENT_QUALITY",
    rank: 2,
    description: "Degraded movement mechanics override volume or load targets.",
    triggerConditions: [
      "User reports form breakdown under current load",
      "Experience level is beginner (technique before load)",
      "Re-entry phase is active (returning from break)",
    ],
    agentBehavior:
      "Reduce load or volume to restore movement quality. Never chase intensity at the cost of mechanics.",
    exampleViolations: [
      "Beginner asking for 5x5 heavy squat → use goblet squat, reduce load, focus on pattern",
      "User reporting form breakdown → reduce weight, not add reps",
    ],
  },
  {
    priority: "GOAL_OUTPUT",
    rank: 3,
    description: "The program must serve the stated goal.",
    triggerConditions: [
      "Sport-specific goal detected (athletic performance)",
      "Explicit goal stated (strength, hypertrophy, fat loss, speed)",
      "Season context is active (in-season vs off-season changes programming)",
    ],
    agentBehavior:
      "Apply the correct sport category framework and rep/set prescriptions for the stated goal. Never apply generic bodybuilding splits for performance athletes unless explicitly requested.",
    exampleViolations: [
      "Soccer athlete getting generic push/pull/legs split → apply Category 2 framework",
      "Swimmer getting plyometrics → remove, apply Category 4 corrective structure",
    ],
  },
  {
    priority: "FATIGUE_MANAGEMENT",
    rank: 4,
    description: "Recovery capacity constrains programming decisions.",
    triggerConditions: [
      "Readiness signal detected (poor sleep, high fatigue, 'cooked')",
      "Volume is excessive for the stated experience level",
      "User's training frequency exceeds reasonable recovery window",
    ],
    agentBehavior:
      "Reduce accessory volume before primary work. Never sacrifice primary compound movements to save tokens or time — cut accessories first.",
    exampleViolations: [
      "Beginner asking for 5-day high-volume split → suggest 3 days, explain recovery constraint once",
      "Readiness signal + high-volume day → compress accessories, preserve primary work",
    ],
  },
  {
    priority: "USER_PREFERENCE",
    rank: 5,
    description: "User preferences are honored within safety and quality bounds.",
    triggerConditions: [
      "User states equipment preference",
      "User states style or exercise preference",
      "User states scheduling or duration preference",
    ],
    agentBehavior:
      "Honor the preference when it doesn't violate a higher-priority rule. Never explain why you're complying — just apply it.",
    exampleViolations: [
      "User prefers dumbbell-only → apply home gym framework, no need to discuss the constraint",
    ],
  },
];

// ─── Routing Rules ────────────────────────────────────────────────────────────
//
// Maps execution action + intent type → orchestrator route.
// The execution planner's action is the primary signal; intent type is secondary.
//
// ROUTING RULE PRIORITY ORDER:
//   1. LIBRARIAN_ADMIN — admin-only, never user-facing (highest specificity)
//   2. RETRIEVE — no AI call needed, return immediately
//   3. NO_OP — error / paywall
//   4. DIRECT_EDIT — fast path, skip architect
//   5. BUILD_WITH_ARCHITECT — build paths always use architect
//   6. GUIDANCE — fallback for coaching/question responses
//
// AGENT PARTICIPATION RULES (Phase 8 — Updated Agent Flow):
//
//   User message
//     → Coach Agent intent/constraint extraction
//     → MutationScopeDecision (Intent Scaling — determineMutationScope)
//     → Behavioral Intelligence signals (if session history exists)
//     → Performance Architect (BUILD_WITH_ARCHITECT path only)
//     → Progression Intelligence (if "4 weeks" / progression block detected)
//     → CEO Heartbeat + Coaching Identity Filter (BUILD paths — always last)
//     → Final user response via Coach Agent
//
//   FAST PATH (DIRECT_EDIT):
//     Coach Agent only — no other layers called.
//     Simple edits stay fast. Research Librarian never called during user chat.
//
//   Research Librarian (Dr. Sable): ADMIN-ONLY. Never triggered by user messages.

export interface RoutingInput {
  execPlanAction: "APPLY_MUTATION" | "ASK_CLARIFICATION" | "GUIDANCE" | "REBUILD_PROGRAM" | "NO_OP";
  intentType: string;
  focusMode: "strength" | "speed" | "mobility";
  hasActiveProgram: boolean;
  isAdminRequest: boolean;
  isFreshBuildSession: boolean;
}

export function resolveOrchestratorRoute(input: RoutingInput): {
  route: OrchestratorRoute;
  participatingAgents: AgentRole[];
  routingReason: string;
} {
  const { execPlanAction, intentType, isAdminRequest, isFreshBuildSession } = input;

  // Rule 1 — LIBRARIAN_ADMIN (admin-only, never triggered by user messages)
  if (isAdminRequest) {
    return {
      route: "LIBRARIAN_ADMIN",
      participatingAgents: ["research_librarian"],
      routingReason: "Admin request routed to Research Librarian — user chat agents bypassed",
    };
  }

  // Rule 2 — RETRIEVE (no AI call)
  if (intentType === "RETRIEVE_CURRENT_PROGRAM") {
    return {
      route: "RETRIEVE",
      participatingAgents: [],
      routingReason: "RETRIEVE_CURRENT_PROGRAM intent — returning existing program without AI call",
    };
  }

  // Rule 3 — NO_OP (error, paywall, or unroutable)
  if (execPlanAction === "NO_OP") {
    return {
      route: "NO_OP",
      participatingAgents: [],
      routingReason: "Execution plan returned NO_OP — no agent invoked",
    };
  }

  // Rule 4 — DIRECT_EDIT (fast path — skip Performance Architect)
  // Covers: atomic surgical edits, clarification answers, readiness/pain adjustments
  if (
    execPlanAction === "APPLY_MUTATION" ||
    execPlanAction === "ASK_CLARIFICATION"
  ) {
    return {
      route: "DIRECT_EDIT",
      participatingAgents: ["coach"],
      routingReason: `APPLY_MUTATION/ASK_CLARIFICATION: surgical edit path — Performance Architect skipped to preserve latency`,
    };
  }

  // Rule 5 — BUILD_WITH_ARCHITECT (new builds and structural rebuilds)
  // Covers: CREATE_PROGRAM, START_NEW_PROGRAM, REBUILD_PROGRAM action
  const isBuildIntent =
    intentType === "CREATE_PROGRAM" ||
    intentType === "START_NEW_PROGRAM" ||
    execPlanAction === "REBUILD_PROGRAM" ||
    isFreshBuildSession;

  if (isBuildIntent) {
    return {
      route: "BUILD_WITH_ARCHITECT",
      participatingAgents: ["performance_architect", "coach"],
      routingReason: `Build intent (${intentType} / ${execPlanAction}): Performance Architect generates brief, Coach Agent builds program`,
    };
  }

  // Rule 6 — GUIDANCE (coaching/question response — no program output expected)
  if (execPlanAction === "GUIDANCE") {
    return {
      route: "GUIDANCE",
      participatingAgents: ["coach"],
      routingReason: "GUIDANCE action: Coach Agent responds to coaching question or program inquiry",
    };
  }

  // Fallback — treat as guidance
  return {
    route: "GUIDANCE",
    participatingAgents: ["coach"],
    routingReason: `Unclassified action (${execPlanAction}): defaulting to Coach Agent guidance path`,
  };
}

// ─── Handoff Contracts ────────────────────────────────────────────────────────
//
// Typed data shapes for information flowing between agents.
// These contracts are the formal interface boundary between agent components.

// Coach Agent → Performance Architect
// Sent at the start of every build path, before the architect generates a brief.
export interface CoachToArchitectHandoff {
  /** Days per week extracted from user message or profile. */
  daysPerWeek: number | null;
  /** Sport context (e.g. "soccer", "powerlifting", "general"). */
  sport: string | null;
  /** Primary goal (e.g. "strength", "hypertrophy", "athletic_performance"). */
  goal: string | null;
  /** Raw user message for semantic sport/goal extraction. */
  userMessage: string;
  /** Active focus mode — drives which architecture brief type is built. */
  focusMode: "strength" | "speed" | "mobility";
  /** Random seed for variation engine to prevent program repetition. */
  variationSeed: number;
  /** Persisted user hard constraints (bans, dislikes, pain regions, sport). */
  hardConstraints: {
    bannedItems: string[];
    dislikedItems: string[];
    painRegions: string[];
    sport: string | null;
  } | null;
}

// Performance Architect → Coach Agent
// Returned after the architect builds the architecture brief.
// The Coach injects this into the system prompt before calling OpenAI.
export interface ArchitectToCoachHandoff {
  /** Injected into the Coach's system prompt as the architecture blueprint. Null on SP path or failure. */
  architectureBriefText: string | null;
  /** Locked exercise selections from the variation engine. Used post-generation to enforce mandate. */
  lockedExerciseSelections: Record<string, unknown> | null;
  /** Structured weekly architecture object. Used by the validation gate. */
  weeklyArchitecture: Record<string, unknown> | null;
  /** Which architect path was taken (determines validation rules). */
  briefSource: "strength" | "speed" | "mobility" | "none";
  /** Number of sessions in this build. Drives token budget decisions. */
  sessionCount: number;
  /** Whether the brief was successfully generated. False on error/fallback. */
  briefGenerated: boolean;
  /** Error message if brief generation failed (informational only). */
  briefError: string | null;
}

// Research Librarian → Research Database
// Written after the Librarian evaluates a research document (admin-only pipeline).
// NEVER populated during user chat sessions.
export interface LibrarianToResearchDatabaseHandoff {
  /** ID of the research_documents row being processed. */
  documentId: number;
  /** Document title for audit logging. */
  candidateTitle: string;
  /** Source identifier (journal, URL, or "Weekly Curated Update"). */
  candidateSource: string;
  /** Research category assigned to this document. */
  candidateCategory: string;
  /** Structured evaluation result from the Librarian AI call. */
  librarianResult: {
    recommendation: "approve" | "reject" | "needs_review";
    confidence: "strong" | "moderate" | "limited" | "conflicting";
    evidenceType: string;
    trustLevel: "gold" | "high" | "supporting" | "reject";
    chunksGenerated: number;
    warningFlags: string[];
  };
  /** Always "admin" — enforces that this handoff never originates from user sessions. */
  triggeredBy: "admin";
  /** ISO timestamp of the handoff. */
  handoffAt: string;
}

// ─── Architecture Validation Gate ────────────────────────────────────────────
//
// Pre-send integrity check on any generated program structure.
// Called AFTER generateAIResponse() returns a program, BEFORE saving to DB.
//
// Rules:
//   • Non-blocking — always returns a result; never throws
//   • Critical issues are logged as errors; non-critical as warnings
//   • Does NOT silently drop programs — callers decide what to do with the result
//   • Focus-mode-aware validation (speed programs have different rules than strength)

export interface ArchitectureIssue {
  type:
    | "day_count_mismatch"
    | "empty_days"
    | "missing_exercises"
    | "no_trunk_work"
    | "no_unilateral"
    | "focus_bleed"
    | "explosive_block_violation"
    | "rep_range_violation"
    | "empty_program";
  description: string;
  severity: "critical" | "warning" | "info";
}

export interface ArchitectureValidationResult {
  /** True if no critical issues were found. Warnings may still be present. */
  passed: boolean;
  /** True if one or more critical issues were found (program should be flagged). */
  hasCriticalIssues: boolean;
  /** List of specific issues found. Empty when passed is true with no warnings. */
  issues: ArchitectureIssue[];
  /** Human-readable summary for logging. */
  summary: string;
}

export interface ArchitectureValidationInput {
  program: {
    programName?: string;
    days: Array<{
      name?: string;
      exercises: Array<{
        name: string;
        classification?: string;
        sets?: number;
        reps?: string;
      }>;
    }>;
  };
  focusMode: "strength" | "speed" | "mobility";
  requestedDays: number | null;
  isBuildIntent: boolean;
}

export function validateArchitectureGate(
  input: ArchitectureValidationInput
): ArchitectureValidationResult {
  const { program, focusMode, requestedDays, isBuildIntent } = input;
  const issues: ArchitectureIssue[] = [];

  // Gate only runs on build intents
  if (!isBuildIntent) {
    return {
      passed: true,
      hasCriticalIssues: false,
      issues: [],
      summary: "Validation skipped — non-build intent",
    };
  }

  // ── Check 1: Program has days ──────────────────────────────────────────────
  if (!program.days || program.days.length === 0) {
    issues.push({
      type: "empty_program",
      description: "Program has no days — generation failed to produce a session structure",
      severity: "critical",
    });
    return {
      passed: false,
      hasCriticalIssues: true,
      issues,
      summary: "CRITICAL: Program has no days",
    };
  }

  // ── Check 2: Day count matches request ────────────────────────────────────
  if (requestedDays !== null && program.days.length !== requestedDays) {
    issues.push({
      type: "day_count_mismatch",
      description: `Program has ${program.days.length} day(s) but user requested ${requestedDays}`,
      severity: "critical",
    });
  }

  // ── Check 3: Each day has exercises ───────────────────────────────────────
  for (const [i, day] of program.days.entries()) {
    if (!day.exercises || day.exercises.length === 0) {
      issues.push({
        type: "empty_days",
        description: `Day ${i + 1} ("${day.name ?? "unnamed"}") has no exercises`,
        severity: "critical",
      });
    } else if (day.exercises.length < 4) {
      issues.push({
        type: "missing_exercises",
        description: `Day ${i + 1} has only ${day.exercises.length} exercise(s) — minimum for a complete session is 4`,
        severity: "warning",
      });
    }
  }

  // ── Check 4: Trunk/core work present (all modes) ──────────────────────────
  // NOTE: This is an informational check only. Unconventional but justified programming
  // is allowed — a program without traditional trunk classification may still be structurally
  // sound (e.g. carry-led programs, loaded-movement programs, or intentionally minimalist builds).
  const classifications = program.days.flatMap((d) =>
    d.exercises.map((e) => (e.classification ?? "").toLowerCase())
  );
  const hasTrunk = classifications.some((c) => c.includes("trunk") || c.includes("carry"));
  if (!hasTrunk && focusMode !== "speed") {
    issues.push({
      type: "no_trunk_work",
      description: "No trunk/carry classification detected — verify this is intentional (creative programming allowed)",
      severity: "info",
    });
  }

  // ── Check 5: Unilateral work present for strength programs ────────────────
  // NOTE: Informational only. A strength program may legitimately omit traditional
  // unilateral classification if it uses asymmetrical loading, single-leg variations
  // under a different classification label, or a justified programming style choice.
  if (focusMode === "strength") {
    const hasUnilateral = classifications.some((c) => c.includes("unilateral"));
    if (!hasUnilateral) {
      issues.push({
        type: "no_unilateral",
        description: "No unilateral lower body classification detected — verify this is intentional (creative programming allowed)",
        severity: "info",
      });
    }
  }

  // ── Check 6: Speed programs must not have strength-primary session names ──
  // NOTE: Informational only. A speed program may legitimately include strength session
  // naming if the session serves a dual purpose (e.g. strength-speed day in a concurrent block).
  if (focusMode === "speed") {
    const sessionNames = program.days.map((d) => (d.name ?? "").toLowerCase());
    const strengthBleed = sessionNames.some(
      (n) => n.includes("strength") || n.includes("hypertrophy") || n.includes("muscle")
    );
    if (strengthBleed) {
      issues.push({
        type: "focus_bleed",
        description: "Speed program has session names with strength/hypertrophy language — verify this reflects intent (concurrent programming allowed)",
        severity: "info",
      });
    }
  }

  const criticalIssues = issues.filter((i) => i.severity === "critical");
  const hasCriticalIssues = criticalIssues.length > 0;
  const passed = !hasCriticalIssues;

  const summary =
    issues.length === 0
      ? `Validation passed — ${program.days.length}-day ${focusMode} program is structurally sound`
      : issues.map((i) => `[${i.severity.toUpperCase()}] ${i.description}`).join("; ");

  return { passed, hasCriticalIssues, issues, summary };
}

// ─── Observability Events ─────────────────────────────────────────────────────
//
// Structured log events emitted at each orchestration decision point.
// All events include the [AgentOrchestrator] tag for easy log filtering.
// Events are logged at INFO level for routing decisions and WARN/ERROR for issues.

export interface OrchestratorObservabilityEvent {
  route: OrchestratorRoute;
  participatingAgents: AgentRole[];
  routingReason: string;
  focusMode: "strength" | "speed" | "mobility";
  intentType: string;
  execPlanAction: string;
  isBuildPath: boolean;
  architectUsed: boolean;
  librarianUsed: boolean;
  conflictRulesApplied: ConflictPriority[];
  validationResult?: Pick<ArchitectureValidationResult, "passed" | "hasCriticalIssues" | "summary">;
}

export function logOrchestratorDecision(event: OrchestratorObservabilityEvent): void {
  logger.info(
    {
      route: event.route,
      participatingAgents: event.participatingAgents,
      focusMode: event.focusMode,
      intentType: event.intentType,
      execPlanAction: event.execPlanAction,
      isBuildPath: event.isBuildPath,
      architectUsed: event.architectUsed,
      librarianUsed: event.librarianUsed,
      conflictRulesApplied: event.conflictRulesApplied,
    },
    `[AgentOrchestrator] ${event.routingReason}`
  );
}

export function logArchitectHandoff(
  handoff: CoachToArchitectHandoff,
  result: ArchitectToCoachHandoff
): void {
  logger.info(
    {
      focusMode: handoff.focusMode,
      daysPerWeek: handoff.daysPerWeek,
      sport: handoff.sport,
      goal: handoff.goal,
      briefGenerated: result.briefGenerated,
      briefSource: result.briefSource,
      sessionCount: result.sessionCount,
      hasLockedSelections: result.lockedExerciseSelections !== null,
      briefError: result.briefError ?? null,
    },
    `[AgentOrchestrator] ${personaLabel("performance_architect")} → ${personaLabel("coach")} handoff complete`
  );
}

export function logValidationGateResult(
  result: ArchitectureValidationResult,
  context: { focusMode: string; programName?: string; dayCount: number }
): void {
  if (result.hasCriticalIssues) {
    logger.error(
      {
        focusMode: context.focusMode,
        programName: context.programName ?? "unnamed",
        dayCount: context.dayCount,
        issues: result.issues.filter((i) => i.severity === "critical"),
        summary: result.summary,
      },
      "[AgentOrchestrator] Architecture validation gate FAILED — critical issues detected"
    );
  } else if (result.issues.length > 0) {
    logger.warn(
      {
        focusMode: context.focusMode,
        programName: context.programName ?? "unnamed",
        dayCount: context.dayCount,
        warnings: result.issues.filter((i) => i.severity === "warning"),
        summary: result.summary,
      },
      "[AgentOrchestrator] Architecture validation gate passed with warnings"
    );
  } else {
    logger.info(
      {
        focusMode: context.focusMode,
        programName: context.programName ?? "unnamed",
        dayCount: context.dayCount,
      },
      "[AgentOrchestrator] Architecture validation gate passed cleanly"
    );
  }
}

export function logLibrarianHandoff(handoff: LibrarianToResearchDatabaseHandoff): void {
  logger.info(
    {
      documentId: handoff.documentId,
      candidateTitle: handoff.candidateTitle,
      candidateCategory: handoff.candidateCategory,
      recommendation: handoff.librarianResult.recommendation,
      confidence: handoff.librarianResult.confidence,
      trustLevel: handoff.librarianResult.trustLevel,
      chunksGenerated: handoff.librarianResult.chunksGenerated,
      warningFlags: handoff.librarianResult.warningFlags,
      triggeredBy: handoff.triggeredBy,
    },
    `[AgentOrchestrator] ${personaLabel("research_librarian")} → Research Database handoff logged`
  );
}

// ─── Main Orchestrate Function ────────────────────────────────────────────────
//
// Entry point called from the conversations route handler BEFORE generateAIResponse.
// Returns a typed OrchestratorDecision that drives downstream routing.
//
// Usage in conversations.ts:
//   const orchDecision = orchestrate({ ... });
//   logOrchestratorDecision(orchDecision.observabilityEvent);
//   // Then use orchDecision.route to verify routing matches expected path

export interface OrchestratorInput {
  message: string;
  userId: number;
  conversationId: string;
  intentType: string;
  execPlanAction: "APPLY_MUTATION" | "ASK_CLARIFICATION" | "GUIDANCE" | "REBUILD_PROGRAM" | "NO_OP";
  focusMode: "strength" | "speed" | "mobility";
  hasActiveProgram: boolean;
  isAdminRequest: boolean;
  isFreshBuildSession: boolean;
}

export interface OrchestratorDecision {
  route: OrchestratorRoute;
  participatingAgents: AgentRole[];
  routingReason: string;
  isBuildPath: boolean;
  /** Conflict resolution rules that were considered for this turn. */
  conflictRulesApplied: ConflictPriority[];
  observabilityEvent: OrchestratorObservabilityEvent;
}

export function orchestrate(input: OrchestratorInput): OrchestratorDecision {
  const { route, participatingAgents, routingReason } = resolveOrchestratorRoute({
    execPlanAction: input.execPlanAction,
    intentType: input.intentType,
    focusMode: input.focusMode,
    hasActiveProgram: input.hasActiveProgram,
    isAdminRequest: input.isAdminRequest,
    isFreshBuildSession: input.isFreshBuildSession,
  });

  const isBuildPath = route === "BUILD_WITH_ARCHITECT";
  const architectUsed = participatingAgents.includes("performance_architect");
  const librarianUsed = participatingAgents.includes("research_librarian");

  // Determine which conflict resolution rules are active for this turn
  const conflictRulesApplied: ConflictPriority[] = ["SAFETY", "MOVEMENT_QUALITY"];
  if (isBuildPath) {
    conflictRulesApplied.push("GOAL_OUTPUT", "FATIGUE_MANAGEMENT");
  }
  conflictRulesApplied.push("USER_PREFERENCE");

  const observabilityEvent: OrchestratorObservabilityEvent = {
    route,
    participatingAgents,
    routingReason,
    focusMode: input.focusMode,
    intentType: input.intentType,
    execPlanAction: input.execPlanAction,
    isBuildPath,
    architectUsed,
    librarianUsed,
    conflictRulesApplied,
  };

  return {
    route,
    participatingAgents,
    routingReason,
    isBuildPath,
    conflictRulesApplied,
    observabilityEvent,
  };
}

// ─── Agent Boundary Enforcement ──────────────────────────────────────────────
//
// Runtime guards that enforce agent separation rules.
// These are pure boolean checks, not throws — callers decide what to do.

export function assertLibrarianIsAdminOnly(isAdminRequest: boolean): {
  allowed: boolean;
  reason: string;
} {
  if (!isAdminRequest) {
    return {
      allowed: false,
      reason:
        "Research Librarian Agent may only be invoked from admin routes. User chat sessions must never call the Librarian.",
    };
  }
  return { allowed: true, reason: "Admin request — Librarian invocation is permitted" };
}

export function assertArchitectSkippedOnEditPath(
  route: OrchestratorRoute
): { correct: boolean; reason: string } {
  if (route === "DIRECT_EDIT" || route === "GUIDANCE") {
    return {
      correct: true,
      reason: "Edit/guidance path confirmed — Performance Architect correctly skipped",
    };
  }
  return {
    correct: false,
    reason: `Performance Architect involvement requires BUILD_WITH_ARCHITECT route (current: ${route})`,
  };
}

// ─── Conflict Resolution Resolver ────────────────────────────────────────────
//
// Resolves which conflict rule applies when two programming decisions conflict.
// Returns the higher-priority rule that should govern the decision.

export function resolveConflict(
  a: ConflictPriority,
  b: ConflictPriority
): { winner: ConflictPriority; loser: ConflictPriority; reason: string } {
  const rankA = CONFLICT_RESOLUTION_HIERARCHY.find((r) => r.priority === a)?.rank ?? 99;
  const rankB = CONFLICT_RESOLUTION_HIERARCHY.find((r) => r.priority === b)?.rank ?? 99;

  if (rankA <= rankB) {
    return {
      winner: a,
      loser: b,
      reason: `${a} (rank ${rankA}) overrides ${b} (rank ${rankB}) per conflict resolution hierarchy`,
    };
  }
  return {
    winner: b,
    loser: a,
    reason: `${b} (rank ${rankB}) overrides ${a} (rank ${rankA}) per conflict resolution hierarchy`,
  };
}
