/**
 * DeviceResetPanel — Anonymous Session Reset / Stale Device State Recovery
 *
 * Hidden debug panel for clearing stale anonymous device state after major
 * architecture changes. Accessible via:
 *
 *   1. URL parameter:   /chat?__debug=reset
 *   2. Browser console: window.__trainchat_reset()
 *   3. URL parameter:   /chat?__debug=inspect  (read-only state dump)
 *
 * SAFETY:
 * - Only operates on anonymous sessions
 * - Registered accounts are protected server-side (returns 403)
 * - Requires explicit confirmation before any destructive action
 *
 * After reset, the page reloads so a fresh anonymous bootstrap fires
 * with a new deviceId.
 */

import { useState, useEffect, useCallback } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  performAnonymousReset,
  inspectAnonymousState,
  clearLocalAnonymousState,
  type ResetPhase,
} from "@/lib/deviceReset";

interface DeviceResetPanelProps {
  mode: "reset" | "inspect";
  onClose: () => void;
}

export function DeviceResetPanel({ mode, onClose }: DeviceResetPanelProps) {
  const queryClient = useQueryClient();
  const [phase, setPhase] = useState<ResetPhase>("idle");
  const [phases, setPhases] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [stateMap, setStateMap] = useState<any>(null);
  const [clearServerData, setClearServerData] = useState(false);
  const [inspecting, setInspecting] = useState(false);

  const handleInspect = useCallback(async () => {
    setInspecting(true);
    setError(null);
    try {
      const data = await inspectAnonymousState();
      setStateMap(data);
    } catch (err: any) {
      setError(err.message ?? "Inspection failed");
    } finally {
      setInspecting(false);
    }
  }, []);

  useEffect(() => {
    if (mode === "inspect") {
      handleInspect();
    }
  }, [mode, handleInspect]);

  const handleReset = useCallback(async () => {
    setPhase("resetting_server");
    setPhases([]);
    setError(null);

    const result = await performAnonymousReset(
      queryClient,
      clearServerData,
      (p, detail) => {
        setPhase(p);
        if (detail) setPhases((prev) => [...prev, detail]);
      },
    );

    if (result.success) {
      setPhase("done");
      // Reload after a short delay so the user can see the success message
      setTimeout(() => {
        window.location.href = "/chat";
      }, 1800);
    } else {
      setPhase("error");
      setError(result.error ?? "Reset failed");
    }
  }, [queryClient, clearServerData]);

  const handleLocalOnlyReset = useCallback(() => {
    clearLocalAnonymousState(queryClient);
    setPhases(["Local storage cleared", "React Query cache cleared"]);
    setPhase("done");
    setTimeout(() => {
      window.location.href = "/chat";
    }, 1200);
  }, [queryClient]);

  const isDone = phase === "done";
  const isRunning = phase === "resetting_server" || phase === "clearing_client" || phase === "checking_server";

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 9999,
        background: "rgba(0,0,0,0.85)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "16px",
        fontFamily: "ui-monospace, monospace",
      }}
    >
      <div
        style={{
          background: "#0f1117",
          border: "1px solid #2d3748",
          borderRadius: "12px",
          padding: "24px",
          width: "100%",
          maxWidth: "560px",
          maxHeight: "90vh",
          overflowY: "auto",
          color: "#e2e8f0",
          fontSize: "13px",
        }}
      >
        {/* Header */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "20px" }}>
          <div>
            <div style={{ color: "#f6ad55", fontWeight: 700, fontSize: "14px", marginBottom: "4px" }}>
              ⚠ TRAINCHAT DEBUG
            </div>
            <div style={{ color: "#718096", fontSize: "11px" }}>
              {mode === "inspect" ? "Anonymous State Inspector" : "Anonymous Session Reset"}
            </div>
          </div>
          <button
            onClick={onClose}
            style={{ color: "#718096", background: "none", border: "none", cursor: "pointer", fontSize: "18px", lineHeight: 1 }}
          >
            ×
          </button>
        </div>

        {/* ── INSPECT MODE ── */}
        {mode === "inspect" && (
          <>
            {inspecting && (
              <div style={{ color: "#718096" }}>Fetching state map from server…</div>
            )}
            {error && (
              <div style={{ color: "#fc8181", marginBottom: "12px" }}>
                {error}
                {error.includes("registered") && (
                  <div style={{ color: "#718096", marginTop: "8px", fontSize: "11px" }}>
                    This panel is only for anonymous device sessions.
                  </div>
                )}
              </div>
            )}
            {stateMap && (
              <>
                <div style={{ marginBottom: "12px" }}>
                  <Label>User ID</Label>
                  <Value>{stateMap.userId}</Value>
                </div>
                <div style={{ marginBottom: "12px" }}>
                  <Label>Device ID</Label>
                  <Value>{stateMap.deviceId ?? "—"}</Value>
                </div>
                <div style={{ marginBottom: "12px" }}>
                  <Label>Is Anonymous</Label>
                  <Value>{String(stateMap.isAnonymous)}</Value>
                </div>
                <div style={{ marginBottom: "12px" }}>
                  <Label>Created At</Label>
                  <Value>{stateMap.createdAt}</Value>
                </div>

                <Divider />
                <SectionTitle>Server State</SectionTitle>
                <div style={{ marginBottom: "8px" }}>
                  <Label>Conversations</Label>
                  <Value>{stateMap.serverState?.conversationCount}</Value>
                </div>
                <div style={{ marginBottom: "8px" }}>
                  <Label>Messages</Label>
                  <Value>{stateMap.serverState?.messageCount}</Value>
                </div>
                <div style={{ marginBottom: "12px" }}>
                  <Label>Has Neural Profile</Label>
                  <Value>{String(stateMap.serverState?.hasNeuralProfile)}</Value>
                </div>

                <Divider />
                <SectionTitle>Stale Detection</SectionTitle>
                <div style={{ marginBottom: "4px" }}>
                  <Label>Likely Stale</Label>
                  <Value style={{ color: stateMap.staleDetection?.isLikelyStale ? "#fc8181" : "#68d391" }}>
                    {String(stateMap.staleDetection?.isLikelyStale)}
                  </Value>
                </div>
                {stateMap.staleDetection?.warnings?.length > 0 && (
                  <ul style={{ margin: "8px 0 12px", paddingLeft: "16px", color: "#f6ad55" }}>
                    {stateMap.staleDetection.warnings.map((w: string, i: number) => (
                      <li key={i} style={{ marginBottom: "4px" }}>{w}</li>
                    ))}
                  </ul>
                )}
                {stateMap.staleDetection?.warnings?.length === 0 && (
                  <div style={{ color: "#68d391", marginBottom: "12px" }}>No stale signals detected.</div>
                )}

                <Divider />
                <SectionTitle>Client State (check browser)</SectionTitle>
                <div style={{ color: "#718096", marginBottom: "4px" }}>localStorage: {stateMap.clientState?.knownLocalStorageKeys?.join(", ")}</div>
                <div style={{ color: "#718096", marginBottom: "4px" }}>sessionStorage: {stateMap.clientState?.knownSessionStorageKeys?.join(", ")}</div>
                <div style={{ color: "#718096" }}>Cookie: sid (HttpOnly)</div>

                <Divider />
                <button
                  onClick={() => {
                    setStateMap(null);
                    onClose();
                    // Navigate to reset mode
                    window.location.href = "/chat?__debug=reset";
                  }}
                  style={buttonStyle("#553c9a")}
                >
                  Open Reset Panel →
                </button>
              </>
            )}
            <button onClick={handleInspect} disabled={inspecting} style={{ ...buttonStyle("#2d3748"), marginTop: "8px" }}>
              {inspecting ? "Refreshing…" : "Refresh State"}
            </button>
          </>
        )}

        {/* ── RESET MODE ── */}
        {mode === "reset" && phase === "idle" && (
          <>
            <div style={{ background: "#1a202c", border: "1px solid #2d3748", borderRadius: "8px", padding: "14px", marginBottom: "20px" }}>
              <div style={{ color: "#fc8181", fontWeight: 600, marginBottom: "8px" }}>What will be cleared:</div>
              <ul style={{ margin: 0, paddingLeft: "16px", color: "#a0aec0", lineHeight: 1.8 }}>
                <li>Server session (forces fresh anonymous bootstrap)</li>
                <li>localStorage: <code style={{ color: "#f6ad55" }}>trainchat_device_id</code></li>
                <li>sessionStorage: <code style={{ color: "#f6ad55" }}>trainchat_guest_session</code></li>
                <li>React Query cache (all in-memory query state)</li>
                {clearServerData && <li style={{ color: "#fc8181" }}>DB: conversations, messages, neural profile for this anonymous user</li>}
              </ul>
            </div>

            <div style={{ background: "#1a202c", border: "1px solid #2d3748", borderRadius: "8px", padding: "14px", marginBottom: "20px" }}>
              <div style={{ color: "#68d391", fontWeight: 600, marginBottom: "8px" }}>What is NOT touched:</div>
              <ul style={{ margin: 0, paddingLeft: "16px", color: "#a0aec0", lineHeight: 1.8 }}>
                <li>Registered user accounts (protected server-side)</li>
                <li>Other localStorage keys outside of TrainChat</li>
                <li>Other users' data</li>
              </ul>
            </div>

            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: "10px",
                marginBottom: "20px",
                padding: "12px",
                background: "#1a202c",
                border: "1px solid #2d3748",
                borderRadius: "8px",
                cursor: "pointer",
              }}
              onClick={() => setClearServerData(!clearServerData)}
            >
              <div
                style={{
                  width: "18px",
                  height: "18px",
                  border: "2px solid #4a5568",
                  borderRadius: "4px",
                  background: clearServerData ? "#fc8181" : "transparent",
                  flexShrink: 0,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                {clearServerData && <span style={{ color: "#0f1117", fontSize: "12px", fontWeight: 700 }}>✓</span>}
              </div>
              <div>
                <div style={{ color: "#e2e8f0", fontWeight: 600, fontSize: "12px" }}>Also clear server-side DB data</div>
                <div style={{ color: "#718096", fontSize: "11px" }}>
                  Deletes conversations, messages, and neural profile for this anonymous user.
                  Use when you want a completely fresh start — not just a new device ID.
                </div>
              </div>
            </div>

            <button onClick={handleReset} style={buttonStyle("#c53030")}>
              Reset Anonymous State
            </button>
            <button onClick={handleLocalOnlyReset} style={{ ...buttonStyle("#2d3748"), marginTop: "8px" }}>
              Client-Only Reset (no server call)
            </button>
            <button
              onClick={() => { window.location.href = "/chat?__debug=inspect"; }}
              style={{ ...buttonStyle("#2d3748"), marginTop: "8px" }}
            >
              Inspect State First →
            </button>
          </>
        )}

        {/* ── IN PROGRESS ── */}
        {isRunning && (
          <div>
            <div style={{ color: "#f6ad55", marginBottom: "12px" }}>Resetting…</div>
            {phases.map((p, i) => (
              <div key={i} style={{ color: "#718096", marginBottom: "4px" }}>› {p}</div>
            ))}
          </div>
        )}

        {/* ── DONE ── */}
        {isDone && (
          <div>
            <div style={{ color: "#68d391", fontWeight: 700, marginBottom: "12px" }}>✓ Reset complete</div>
            {phases.map((p, i) => (
              <div key={i} style={{ color: "#718096", marginBottom: "4px" }}>› {p}</div>
            ))}
            <div style={{ color: "#a0aec0", marginTop: "12px" }}>
              Reloading to fresh state…
            </div>
          </div>
        )}

        {/* ── ERROR ── */}
        {phase === "error" && (
          <div>
            <div style={{ color: "#fc8181", fontWeight: 700, marginBottom: "8px" }}>Reset failed</div>
            <div style={{ color: "#fc8181", marginBottom: "16px" }}>{error}</div>
            {error?.includes("registered") ? (
              <div style={{ color: "#718096", fontSize: "12px" }}>
                This device is linked to a registered account and cannot be reset anonymously.
                Log out first if you want to test as a fresh anonymous user.
              </div>
            ) : (
              <>
                <div style={{ color: "#718096", fontSize: "12px", marginBottom: "12px" }}>
                  Try a client-only reset if the server is unreachable:
                </div>
                <button onClick={handleLocalOnlyReset} style={buttonStyle("#2d3748")}>
                  Client-Only Reset
                </button>
              </>
            )}
            <button
              onClick={() => { setPhase("idle"); setError(null); setPhases([]); }}
              style={{ ...buttonStyle("#2d3748"), marginTop: "8px" }}
            >
              ← Back
            </button>
          </div>
        )}

        {/* Footer */}
        <div style={{ marginTop: "20px", color: "#4a5568", fontSize: "10px", borderTop: "1px solid #2d3748", paddingTop: "12px" }}>
          DEBUG PANEL — not visible in normal use.
          Trigger: /chat?__debug=reset | /chat?__debug=inspect | window.__trainchat_reset()
        </div>
      </div>
    </div>
  );
}

// ── Style helpers ─────────────────────────────────────────────────────────────

function Label({ children }: { children: React.ReactNode }) {
  return <div style={{ color: "#718096", fontSize: "11px", marginBottom: "2px" }}>{children}</div>;
}

function Value({ children, style }: { children: React.ReactNode; style?: React.CSSProperties }) {
  return (
    <div style={{ color: "#e2e8f0", fontFamily: "ui-monospace, monospace", fontSize: "12px", ...style }}>
      {children}
    </div>
  );
}

function Divider() {
  return <div style={{ borderTop: "1px solid #2d3748", margin: "14px 0" }} />;
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ color: "#a0aec0", fontWeight: 700, fontSize: "11px", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: "10px" }}>
      {children}
    </div>
  );
}

function buttonStyle(bg: string): React.CSSProperties {
  return {
    display: "block",
    width: "100%",
    padding: "10px 16px",
    background: bg,
    border: "none",
    borderRadius: "8px",
    color: "#e2e8f0",
    fontFamily: "ui-monospace, monospace",
    fontSize: "12px",
    fontWeight: 600,
    cursor: "pointer",
    textAlign: "left",
  };
}
