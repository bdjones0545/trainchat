import { useState, useRef, useCallback } from "react";

// ─── SSE event types emitted by the stream endpoint ──────────────────────────

export interface AcknowledgedEvent {
  type: "acknowledged";
  text: string;
}

export interface ThinkingEvent {
  type: "thinking";
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
  intentDebug?: { type: string; confidence: string; editSubtype: string | null };
  systemEdit?: { applied: boolean };
}

export interface ErrorEvent {
  type: "error";
  message: string;
  status?: number;
}

export type StreamEvent = AcknowledgedEvent | ThinkingEvent | CompleteEvent | ErrorEvent;

// ─── Stream state ─────────────────────────────────────────────────────────────

export type StreamPhase = "idle" | "acknowledged" | "thinking" | "complete" | "error";

export interface StreamState {
  phase: StreamPhase;
  acknowledgment: string;
  thinkingStep: string;
  intentType: string | undefined;
  error: string | null;
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
  thinkingStep: "",
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
        thinkingStep: "",
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
              } else if (event.type === "thinking") {
                setState((s) => ({
                  ...s,
                  phase: "thinking",
                  thinkingStep: event.step,
                  intentType: event.intentType ?? s.intentType,
                }));
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
              // ignore malformed event
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
