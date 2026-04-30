import { useState, useRef, useCallback } from "react";
import { getDefaultHeaders } from "@workspace/api-client-react";

// ─── Agent outcome type ────────────────────────────────────────────────────────
// Explicit classification of what a complete agent response represents.
// Drives all UI decisions: panel open, toasts, scroll anchoring, etc.

export type AgentOutcomeType =
  | "mutation_applied"      // DB/program state was changed — show changes, open panel
  | "clarification_needed"  // Agent needs more input — NOT an error, no panel open
  | "conversation_only"     // Normal coaching reply — NOT an error, no panel open
  | "true_failure";         // Something genuinely failed — show error toast

// ─── Build pipeline stage type (mirrors build-pipeline.ts on the server) ──────

export type BuildStage =
  | "understanding"
  | "loading"
  | "classifying"
  | "planning"
  | "applying"
  | "validating"
  | "saving"
  | "complete";

// ─── SSE event types emitted by the stream endpoint ──────────────────────────

export interface AcknowledgedEvent {
  type: "acknowledged";
  text: string;
}

/** Stage event — maps to a real code boundary in the build pipeline. */
export interface StageEvent {
  type: "stage";
  stage: BuildStage;
  step: string;
  intentType?: string;
  actionType?: string;
  /** Coach-voiced narration for this stage — context-specific, 1–2 sentences. */
  narration?: string;
}

export interface CompleteEvent {
  type: "complete";
  /** Explicit outcome classification — drives panel, toast, and scroll behavior. */
  outcomeType: AgentOutcomeType;
  userMessage: {
    id: number;
    conversationId: number;
    role: string;
    content: string;
    createdAt: string;
    structuredData: string | null;
  };
  assistantMessage: {
    id: number;
    conversationId: number;
    role: string;
    content: string;
    createdAt: string;
    structuredData: string | null;
  };
  planInfo: { plan: string; messagesRemaining: number } | null;
  systemSaved: boolean;
  systemId?: number;
  changeLogId?: number;
  intentDebug?: { type: string; confidence: string; editSubtype: string | null };
  systemEdit?: {
    applied: boolean;
    changeSummary?: string;
    changedIds?: { exercises: number[]; sessions: number[]; weeks: number[]; phases: number[] };
    changeTargets?: Array<{ type: string; id: number; label: string }>;
    systemId?: number;
    changeLogId?: number;
    /** Phase 2: whether the edit was verified in the post-mutation state */
    verificationStatus?: "verified" | "partial" | "failed" | "noop" | "unclear";
    requiresReview?: boolean;
  };
  editFailure?: { reason: "no_changes_applied" | "pipeline_error" | "verification_failed"; skippedCount?: number; verificationSummary?: string };
  saveFailure?: { reason: string };
  /** Whether the DB mutation was actually executed, independent of verification outcome. */
  mutationApplied?: boolean;
  /** Debug info from the edit-intent routing layer. Present in dev and when pathUsed is available. */
  routeDebug?: { pathUsed?: "deterministic" | "library_progression" | "rule_based" | "openai"; openaiCalled?: boolean; openaiSucceeded?: boolean; [key: string]: unknown };
  /** Full audit receipt from the action contract enforcer. Present when contract enforcement ran. */
  auditReceipt?: {
    receiptId: string;
    timestamp: string;
    userMessage: string;
    contract: {
      actionType: string;
      targetScope: string;
      confidence: string;
      shouldMutate: boolean;
      shouldPersistConstraint: boolean;
      shouldAskClarification: boolean;
      shouldRebuild: boolean;
      shouldRespondGuidanceOnly: boolean;
      safetyMode: boolean;
      requiredVerification: boolean;
      expectedStateChange: string | null;
      allowedResponseTypes: string[];
      contractReasons: string[];
    };
    outcome: {
      actualResponseType: string;
      mutationApplied: boolean;
      constraintPersisted: boolean;
      clarificationAsked: boolean;
      programRebuilt: boolean;
      verificationStatus: "verified" | "partial" | "unclear" | "not_applicable";
    };
    compliance: {
      passed: boolean;
      violations: string[];
    };
  } | null;
}

export interface StreamErrorEvent {
  type: "error";
  message: string;
  status?: number;
  code?: string;
  isAnonymous?: boolean;
}

export type StreamEvent = AcknowledgedEvent | StageEvent | CompleteEvent | StreamErrorEvent;

// ─── Stream state ─────────────────────────────────────────────────────────────

export type StreamPhase = "idle" | "acknowledged" | "building" | "complete" | "error";

export interface StreamState {
  phase: StreamPhase;
  acknowledgment: string;
  /** Current build stage (from server — real pipeline boundary). */
  buildStage: BuildStage | null;
  /** User-visible label for the current stage (intent-specific from server). */
  stageLabel: string;
  /** Coach-voiced narration for the current stage — context-specific, updates per stage. */
  stageNarration: string;
  /** Labels of committed milestone stages, shown as locked bubbles. */
  stageHistory: string[];
  intentType: string | undefined;
  /** Action type (PROGRAM_GENERATION, STRUCTURAL_REBUILD, DIRECT_MUTATION, SESSION_ADJUSTMENT). */
  actionType: string | undefined;
  error: string | null;
  /** Set to true when error is a PAYWALL 402 — triggers upgrade modal in Chat. */
  paywallTriggered: boolean;
  /** Whether the paywalled user is anonymous (vs a registered free-tier user). */
  paywallIsAnonymous: boolean;
}

// ─── Milestone stage logic ─────────────────────────────────────────────────────
//
// Which stages appear as committed message bubbles depends on the action type.
//
// Legacy action types (decision.ts):
//   PROGRAM_GENERATION  — full build:  planning, applying, validating, saving
//   STRUCTURAL_REBUILD  — medium:      planning, applying, saving
//   DIRECT_MUTATION     — fast edit:   applying, saving
//   SESSION_ADJUSTMENT  — fast edit:   applying, saving
//
// New execPlan.action types:
//   REBUILD_PROGRAM     — medium:      planning, applying, saving
//   APPLY_MUTATION      — fast edit:   applying, saving
//   GUIDANCE            — Q&A only:    applying  (no save — nothing was saved)
//   ASK_CLARIFICATION   — short:       applying
//   NO_OP               — short:       applying

function getMilestoneStages(actionType?: string): Set<BuildStage> {
  switch (actionType) {
    // Fast edits — just applying + saving
    case "DIRECT_MUTATION":
    case "SESSION_ADJUSTMENT":
    case "APPLY_MUTATION":
      return new Set(["applying", "saving"]);
    // Medium rebuilds — planning + applying + saving
    case "STRUCTURAL_REBUILD":
    case "REBUILD_PROGRAM":
      return new Set(["planning", "applying", "saving"]);
    // Q&A / guidance — applying only (no mutation, nothing saved)
    case "GUIDANCE":
    case "ASK_CLARIFICATION":
    case "NO_OP":
      return new Set(["applying"]);
    // Full program build (default)
    case "PROGRAM_GENERATION":
    default:
      return new Set(["planning", "applying", "validating", "saving"]);
  }
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

export interface UIContext {
  page?: string;
  activeProgramId?: number | null;
  activeProgramName?: string | null;
  selectedWeek?: number | null;
  selectedSessionId?: number | null;
  selectedSessionName?: string | null;
  selectedExerciseId?: number | null;
  selectedExerciseName?: string | null;
  panelState?: string | null;
  /**
   * True when the user has explicitly started a new builder session.
   * Tells the backend to treat this conversation as a clean slate:
   * - Only use conversation-scoped history for intent classification
   * - Do NOT inject old active program context into the AI prompt
   * - Route ambiguous messages toward CREATE rather than EDIT
   */
  newBuildSession?: boolean;
  /** Source of the message — "right_panel" for vibe coding actions */
  source?: string;
  /** Day index (0-based) for session-scoped refinement actions */
  dayIndex?: number;
  /** Exercise ID for exercise-scoped refinement actions */
  exerciseId?: number;
}

interface UseStreamMessageResult {
  state: StreamState;
  isActive: boolean;
  send: (conversationId: number, content: string, uiContext?: UIContext) => Promise<CompleteEvent | null>;
  reset: () => void;
}

const INITIAL_STATE: StreamState = {
  phase: "idle",
  acknowledgment: "",
  buildStage: null,
  stageLabel: "",
  stageNarration: "",
  stageHistory: [],
  intentType: undefined,
  actionType: undefined,
  error: null,
  paywallTriggered: false,
  paywallIsAnonymous: false,
};

export function useStreamMessage(): UseStreamMessageResult {
  const [state, setState] = useState<StreamState>(INITIAL_STATE);
  const abortRef = useRef<AbortController | null>(null);

  const reset = useCallback(() => {
    abortRef.current?.abort();
    setState(INITIAL_STATE);
  }, []);

  const send = useCallback(
    async (conversationId: number, content: string, uiContext?: UIContext): Promise<CompleteEvent | null> => {
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;

      setState({
        phase: "acknowledged",
        acknowledgment: "",
        buildStage: null,
        stageLabel: "",
        stageNarration: "",
        stageHistory: [],
        intentType: undefined,
        actionType: undefined,
        error: null,
        paywallTriggered: false,
        paywallIsAnonymous: false,
      });

      // ── Read coach behavior settings from localStorage ────────────────────
      // Keys match the Settings page localStorage conventions.
      const coachSettings = {
        conciseResponses: localStorage.getItem("coach_concise") === "true",
        proactiveInsights: localStorage.getItem("coach_proactive") !== "false",
        autoAdjustRecommendations: localStorage.getItem("coach_autoadjust") !== "false",
        memoryPersonalization: localStorage.getItem("coach_memory") !== "false",
      };

      try {
        const response = await fetch(
          `/api/conversations/${conversationId}/messages/stream`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json", ...getDefaultHeaders() },
            credentials: "include",
            body: JSON.stringify({ content, coachSettings, ...(uiContext ? { uiContext } : {}) }),
            signal: controller.signal,
          }
        );

        if (!response.ok) {
          const status = response.status;
          if (status === 402) {
            // Paywall response — parse body to extract isAnonymous and message.
            // This is NOT a generic error; it is a conversion trigger.
            // Set paywallTriggered so the UI can show the correct upgrade modal
            // instead of a generic error toast.
            try {
              const body = await response.json() as {
                code?: string;
                error?: string;
                message?: string;
                isAnonymous?: boolean;
              };
              const isPaywall = body.code === "PAYWALL" || body.error === "MESSAGE_LIMIT_REACHED";
              setState((s) => ({
                ...s,
                phase: "error",
                error: body.message ?? `Request failed (${status})`,
                paywallTriggered: isPaywall,
                paywallIsAnonymous: isPaywall ? (body.isAnonymous ?? false) : false,
              }));
            } catch {
              setState((s) => ({
                ...s,
                phase: "error",
                error: `Request failed (${status})`,
                paywallTriggered: true,
                paywallIsAnonymous: false,
              }));
            }
          } else {
            setState((s) => ({ ...s, phase: "error", error: `Request failed (${status})` }));
          }
          return null;
        }

        const reader = response.body?.getReader();
        if (!reader) {
          setState((s) => ({ ...s, phase: "error", error: "No response stream" }));
          return null;
        }

        const decoder = new TextDecoder();
        let buffer = "";

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });

          // Parse complete SSE events from buffer
          const lines = buffer.split("\n");
          buffer = lines.pop() ?? ""; // Keep incomplete line in buffer

          for (const line of lines) {
            if (!line.startsWith("data: ")) continue;
            const raw = line.slice(6).trim();
            if (!raw || raw === "[DONE]") continue;

            try {
              const event = JSON.parse(raw) as StreamEvent;

              if (event.type === "acknowledged") {
                setState((s) => ({
                  ...s,
                  phase: "acknowledged",
                  acknowledgment: event.text,
                }));

              } else if (event.type === "stage") {
                // Real pipeline stage boundary.
                // Resolve the current and incoming action types to determine milestones.
                setState((s) => {
                  const resolvedActionType = event.actionType ?? s.actionType;
                  const milestones = getMilestoneStages(resolvedActionType);

                  // Commit the previous stage to history if it was a milestone
                  const prevIsMilestone =
                    s.buildStage !== null && milestones.has(s.buildStage);
                  const newHistory =
                    prevIsMilestone && s.stageLabel
                      ? [...s.stageHistory, s.stageLabel]
                      : s.stageHistory;

                  // [AssistantUiStateAudit] — confirms UI state matches the real action
                  if (resolvedActionType && resolvedActionType !== s.actionType) {
                    const isBuilding = ["PROGRAM_GENERATION", "STRUCTURAL_REBUILD", "REBUILD_PROGRAM"].includes(resolvedActionType);
                    const isEditing  = ["DIRECT_MUTATION", "SESSION_ADJUSTMENT", "APPLY_MUTATION"].includes(resolvedActionType);
                    const isQA       = ["GUIDANCE", "ASK_CLARIFICATION", "NO_OP"].includes(resolvedActionType);
                    console.log("[AssistantUiStateAudit]", {
                      intentType: event.intentType ?? s.intentType,
                      resolvedActionType,
                      uiStateCategory: isBuilding ? "build_program" : isEditing ? "edit_program" : isQA ? "answer_question" : "unknown",
                      stage: event.stage,
                      stageLabel: event.step,
                    });
                  }

                  return {
                    ...s,
                    phase: "building",
                    buildStage: event.stage,
                    stageLabel: event.step,
                    stageNarration: event.narration ?? s.stageNarration,
                    stageHistory: newHistory,
                    intentType: event.intentType ?? s.intentType,
                    actionType: resolvedActionType,
                  };
                });

              } else if (event.type === "complete") {
                // Ensure outcomeType is always present — fallback for older backend responses.
                // Derive from existing fields if the server did not send the field.
                if (!event.outcomeType) {
                  const raw = event as Partial<CompleteEvent> & { systemEdit?: { applied?: boolean }; systemSaved?: boolean; editFailure?: { reason?: string } };
                  if (raw.systemEdit?.applied || raw.systemSaved) {
                    event.outcomeType = "mutation_applied";
                  } else if (raw.editFailure?.reason === "pipeline_error" || raw.editFailure?.reason === "verification_failed") {
                    event.outcomeType = "true_failure";
                  } else {
                    event.outcomeType = "conversation_only";
                  }
                }
                setState((s) => ({ ...s, phase: "complete" }));
                reader.cancel();
                return event;

              } else if (event.type === "error") {
                const isPaywall = event.status === 402 || event.code === "PAYWALL";
                setState((s) => ({
                  ...s,
                  phase: "error",
                  error: event.message,
                  paywallTriggered: isPaywall,
                  paywallIsAnonymous: isPaywall ? (event.isAnonymous ?? false) : false,
                }));
                reader.cancel();
                return null;
              }
            } catch {
              // ignore malformed SSE event
            }
          }
        }

        return null;
      } catch (err: any) {
        if (err?.name === "AbortError") return null;
        setState((s) => ({
          ...s,
          phase: "error",
          error: err?.message ?? "Stream failed",
        }));
        return null;
      }
    },
    []
  );

  return {
    state,
    isActive: state.phase !== "idle" && state.phase !== "complete" && state.phase !== "error",
    send,
    reset,
  };
}

// ─── Re-export getMilestoneStages for use in components ──────────────────────
export { getMilestoneStages };
