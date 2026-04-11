/**
 * routing.ts — Single source of truth for all routing decisions in TrainChat.
 *
 * RULES:
 * 1. Auth state always wins. If the user is authenticated, guest state is irrelevant.
 * 2. Guest/deviceId state is for analytics only after auth — never for routing after login.
 * 3. A "converted" guest session means the user has an account → they must log in.
 * 4. No routing decision is made before auth is fully resolved.
 */

// ─── Storage keys (centralised so nothing drifts) ────────────────────────────

export const STORAGE_KEYS = {
  DEVICE_ID: "trainchat_device_id",
  GUEST_SESSION: "trainchat_guest_session",   // sessionStorage
  GUEST_CHAT_HISTORY: "trainchat_guest_chat", // localStorage
  ONBOARDING_COMPLETE: "onboardingComplete",  // localStorage — set once user reaches /chat
} as const;

// ─── Diagnostic logger ────────────────────────────────────────────────────────

interface RouteLogEntry {
  pathname: string;
  authResolved: boolean;
  hasUser: boolean;
  authError: boolean;
  deviceId?: string | null;
  guestSessionStatus?: string | null;
  onboardingComplete: boolean;
  target: string;
  reason: string;
}

export function logRouteDecision(entry: RouteLogEntry) {
  console.log("[Router]", JSON.stringify(entry));
}

// ─── State readers ────────────────────────────────────────────────────────────

export function readOnboardingComplete(): boolean {
  try { return localStorage.getItem(STORAGE_KEYS.ONBOARDING_COMPLETE) === "true"; } catch { return false; }
}

export function readDeviceId(): string | null {
  try { return localStorage.getItem(STORAGE_KEYS.DEVICE_ID); } catch { return null; }
}

// ─── Routing decision ─────────────────────────────────────────────────────────

type PublicOnlyRoute = "/start" | "/login" | "/register";
type ProtectedRoute = "/chat" | "/billing" | "/system" | "/admin";

const PUBLIC_ONLY: PublicOnlyRoute[] = ["/start", "/login", "/register"];
const PROTECTED: ProtectedRoute[] = ["/chat", "/billing", "/system", "/admin"];

export interface RoutingDecision {
  target: string;
  reason: string;
}

/**
 * Compute the correct destination given the current auth + location state.
 * Returns null when no redirect is needed (user is on the right page).
 *
 * AUTH ALWAYS WINS:
 * - Authenticated users on public-only pages → /chat
 * - Unauthenticated users on protected pages → /start
 * - Auth not yet resolved → null (wait)
 */
export function computeRoute({
  pathname,
  authResolved,
  hasUser,
  authError,
  deviceId,
  guestSessionStatus,
}: {
  pathname: string;
  authResolved: boolean;
  hasUser: boolean;
  authError: boolean;
  deviceId?: string | null;
  guestSessionStatus?: string | null;
}): RoutingDecision | null {
  const onboardingComplete = readOnboardingComplete();
  const base: Omit<RouteLogEntry, "target" | "reason"> = {
    pathname,
    authResolved,
    hasUser,
    authError,
    deviceId,
    guestSessionStatus,
    onboardingComplete,
  };

  if (!authResolved) return null; // Never route on unresolved state

  if (hasUser) {
    // Authenticated: boot off public-only pages back to the agent
    if (PUBLIC_ONLY.some((p) => pathname === p || pathname.startsWith(p + "?"))) {
      const decision: RoutingDecision = { target: "/chat", reason: "authenticated user on public-only page" };
      logRouteDecision({ ...base, ...decision });
      return decision;
    }
    return null; // Already on a valid page
  }

  // Not authenticated
  if (PROTECTED.some((p) => pathname === p || pathname.startsWith(p + "/"))) {
    const target = "/start";
    const reason = authError
      ? "auth error — session likely expired"
      : "unauthenticated on protected page";
    logRouteDecision({ ...base, target, reason });
    return { target, reason };
  }

  return null;
}

// ─── Cleanup helpers ──────────────────────────────────────────────────────────

/**
 * Full logout cleanup — clears everything auth-related from local and session storage.
 * Call this on explicit logout only, never on session expiry (we keep deviceId always).
 */
export function clearAuthState() {
  // Clear auth-derived flags
  try { localStorage.removeItem(STORAGE_KEYS.ONBOARDING_COMPLETE); } catch {}
  // Clear cached guest session so GuestStart does not replay a stale "converted" redirect
  try { sessionStorage.removeItem(STORAGE_KEYS.GUEST_SESSION); } catch {}
}

/**
 * Mark the user as having completed onboarding (= reached the chat screen).
 * Used as a local fallback so re-entry decisions are stable even if the backend is slow.
 */
export function markOnboardingComplete() {
  try { localStorage.setItem(STORAGE_KEYS.ONBOARDING_COMPLETE, "true"); } catch {}
}
