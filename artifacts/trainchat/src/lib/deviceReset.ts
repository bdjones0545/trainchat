/**
 * deviceReset.ts — Anonymous Device State Reset Utility
 *
 * Provides a safe, complete reset path for anonymous/deviceId users who are
 * stuck in stale, corrupted, or legacy-bugged state.
 *
 * What gets cleared:
 *   - localStorage: trainchat_device_id (forces new identity on next load)
 *   - sessionStorage: trainchat_guest_session (clears cached legacy guest state)
 *   - React Query cache (all in-memory query state including auth/me)
 *   - Server session (via POST /api/debug/reset-anonymous)
 *   - Optionally: all server-side DB data for this anonymous user
 *
 * What is NOT touched:
 *   - Any registered user data
 *   - Other localStorage keys not owned by TrainChat
 *   - Cookies belonging to other origins
 *
 * Trigger: call performAnonymousReset() from the DeviceResetPanel or console.
 */

import { type QueryClient } from "@tanstack/react-query";
import { DEVICE_ID_KEY } from "./deviceId";

export const GUEST_SESSION_KEY = "trainchat_guest_session";

export type ResetPhase =
  | "idle"
  | "checking_server"
  | "resetting_server"
  | "clearing_client"
  | "done"
  | "error";

export interface ResetResult {
  success: boolean;
  userId?: number;
  serverDataCleared: boolean;
  phases: string[];
  error?: string;
}

/**
 * Inspect the current anonymous user's state from the server.
 * Read-only — does not modify anything.
 */
export async function inspectAnonymousState(): Promise<any> {
  const res = await fetch("/api/debug/anonymous-state", {
    credentials: "include",
  });

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error ?? `HTTP ${res.status}`);
  }

  return res.json();
}

/**
 * Full end-to-end anonymous state reset.
 *
 * @param queryClient  The React Query client — its cache is fully cleared.
 * @param clearServerData  If true, also deletes conversations/messages/profile from the DB.
 * @param onPhase  Optional callback to track progress through reset phases.
 */
export async function performAnonymousReset(
  queryClient: QueryClient,
  clearServerData = false,
  onPhase?: (phase: ResetPhase, detail?: string) => void,
): Promise<ResetResult> {
  const phases: string[] = [];

  const report = (phase: ResetPhase, detail?: string) => {
    phases.push(detail ?? phase);
    onPhase?.(phase, detail);
  };

  try {
    // ── Phase 1: Call server to verify this is an anonymous user and destroy session ──
    report("resetting_server", "Calling server to destroy anonymous session…");

    const serverRes = await fetch("/api/debug/reset-anonymous", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({
        confirm: "RESET_ANONYMOUS_STATE",
        clearServerData,
      }),
    });

    if (!serverRes.ok) {
      const body = await serverRes.json().catch(() => ({}));
      const errorMsg = body.error ?? `Server reset failed (HTTP ${serverRes.status})`;
      report("error", errorMsg);
      return { success: false, serverDataCleared: false, phases, error: errorMsg };
    }

    const serverData = await serverRes.json();
    report("resetting_server", `Server session destroyed. userId was: ${serverData.userId}`);

    // ── Phase 2: Clear client-side storage ────────────────────────────────────
    report("clearing_client", "Clearing localStorage (trainchat_device_id)…");
    try {
      localStorage.removeItem(DEVICE_ID_KEY);
    } catch {
      report("clearing_client", "Warning: could not clear localStorage (storage blocked?)");
    }

    report("clearing_client", "Clearing sessionStorage (trainchat_guest_session)…");
    try {
      sessionStorage.removeItem(GUEST_SESSION_KEY);
    } catch {
      report("clearing_client", "Warning: could not clear sessionStorage");
    }

    // ── Phase 3: Clear React Query cache ─────────────────────────────────────
    report("clearing_client", "Clearing React Query cache…");
    queryClient.clear();

    report("done", "Reset complete. Page will reload to start fresh.");

    return {
      success: true,
      userId: serverData.userId,
      serverDataCleared: serverData.serverDataCleared,
      phases,
    };
  } catch (err: any) {
    const errorMsg = err?.message ?? "Unknown error during reset";
    report("error", errorMsg);
    return { success: false, serverDataCleared: false, phases, error: errorMsg };
  }
}

/**
 * Client-only reset — no server call.
 * Clears just the local state. Useful when the server is unreachable or
 * the user has no session at all.
 *
 * @param queryClient The React Query client.
 */
export function clearLocalAnonymousState(queryClient: QueryClient): void {
  try {
    localStorage.removeItem(DEVICE_ID_KEY);
  } catch {}

  try {
    sessionStorage.removeItem(GUEST_SESSION_KEY);
  } catch {}

  queryClient.clear();
}
