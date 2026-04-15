import { useState, useRef, useCallback } from "react";
import { getDefaultHeaders } from "@workspace/api-client-react";

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
}

export interface CompleteEvent {
  type: "complete";
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
// Which stages appear as committed message bubbles depends on the action type:
//
//   PROGRAM_GENERATION  — full build: planning, applying, validating, saving
//   STRUCTURAL_REBUILD  — medium:     planning, applying, saving
//   DIRECT_MUTATION     — fast:       applying, saving
//   SESSION_ADJUSTMENT  — fast:       applying, saving
//   default             — full:       planning, applying, validating, saving

function getMilestoneStages(actionType?: string): Set<BuildStage> {
  switch (actionType) {
    case "DIRECT_MUTATION":
    case "SESSION_ADJUSTMENT":
      return new Set(["applying", "saving"]);
    case "STRUCTURAL_REBUILD":
      return new Set(["planning", "applying", "saving"]);
    case "PROGRAM_GENERATION":
    default:
      return new Set(["planning", "applying", "validating", "saving"]);
  }
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

interface UseStreamMessageResult {
  state: StreamState;
  isActive: boolean;
  send: (conversationId: number, content: string) => Promise<CompleteEvent | null>;
  reset: () => void;
}

const INITIAL_STATE: StreamState = {
  phase: "idle",
  acknowledgment: "",
  buildStage: null,
  stageLabel: "",
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
    async (conversationId: number, content: string): Promise<CompleteEvent | null> => {
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;

      setState({
        phase: "acknowledged",
        acknowledgment: "",
        buildStage: null,
        stageLabel: "",
        stageHistory: [],
        intentType: undefined,
        actionType: undefined,
        error: null,
      });

      try {
        const response = await fetch(
          `/api/conversations/${conversationId}/messages/stream`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json", ...getDefaultHeaders() },
            credentials: "include",
            body: JSON.stringify({ content }),
            signal: controller.signal,
          }
        );

        if (!response.ok) {
          const status = response.status;
          setState((s) => ({ ...s, phase: "error", error: `Request failed (${status})` }));
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

                  return {
                    ...s,
                    phase: "building",
                    buildStage: event.stage,
                    stageLabel: event.step,
                    stageHistory: newHistory,
                    intentType: event.intentType ?? s.intentType,
                    actionType: resolvedActionType,
                  };
                });

              } else if (event.type === "complete") {
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
