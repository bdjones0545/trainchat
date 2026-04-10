import { useState, useRef, useCallback } from "react";

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

/** Stage event — replaces generic "thinking" events.
 *  Each event maps to a real code boundary in the build pipeline. */
export interface StageEvent {
  type: "stage";
  stage: BuildStage;
  step: string;
  intentType?: string;
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
  systemEdit?: { applied: boolean; changeSummary?: string; changedIds?: number[]; systemId?: number; changeLogId?: number };
}

export interface StreamErrorEvent {
  type: "error";
  message: string;
  status?: number;
}

export type StreamEvent = AcknowledgedEvent | StageEvent | CompleteEvent | StreamErrorEvent;

// ─── Stream state ─────────────────────────────────────────────────────────────

export type StreamPhase = "idle" | "acknowledged" | "building" | "complete" | "error";

export interface StreamState {
  phase: StreamPhase;
  acknowledgment: string;
  /** Current build stage (from server — real pipeline boundary). */
  buildStage: BuildStage | null;
  /** User-visible label for the current stage. */
  stageLabel: string;
  /** Labels of all completed stages (shown as committed bubbles). */
  stageHistory: string[];
  intentType: string | undefined;
  error: string | null;
}

/** Stages shown as committed message bubbles (milestone stages only). */
const MILESTONE_STAGES = new Set<BuildStage>([
  "planning",
  "applying",
  "validating",
  "saving",
]);

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
  error: null,
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
        error: null,
      });

      try {
        const response = await fetch(
          `/api/conversations/${conversationId}/messages/stream`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
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
                // Real pipeline stage boundary — update display from server truth.
                // If the current stage is a milestone, commit it to history before
                // advancing so it remains visible as a locked bubble.
                setState((s) => {
                  const prevIsMilestone =
                    s.buildStage !== null && MILESTONE_STAGES.has(s.buildStage);
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
                  };
                });

              } else if (event.type === "complete") {
                setState((s) => ({ ...s, phase: "complete" }));
                reader.cancel();
                return event;

              } else if (event.type === "error") {
                setState((s) => ({
                  ...s,
                  phase: "error",
                  error: event.message,
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
