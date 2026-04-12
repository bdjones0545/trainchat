import { useState, useEffect, useCallback } from "react";

const DEVICE_ID_KEY = "trainchat_device_id";
const GUEST_SESSION_KEY = "trainchat_guest_session";

export interface GuestSession {
  id: number;
  deviceId: string;
  status: "active" | "converted" | "expired" | "blocked";
  createdAt: string;
  updatedAt: string;
  lastActiveAt: string;
  teaserUsesCount: number;
  onboardingStartedAt: string | null;
  onboardingCompletedAt: string | null;
  firstProgramGeneratedAt: string | null;
  paywallShownAt: string | null;
  convertedAt: string | null;
  linkedUserId: number | null;
  metadata: Record<string, unknown> | null;
}

function generateDeviceId(): string {
  const array = new Uint8Array(16);
  crypto.getRandomValues(array);
  return Array.from(array, (b) => b.toString(16).padStart(2, "0")).join("");
}

function getOrCreateDeviceId(): string {
  try {
    const stored = localStorage.getItem(DEVICE_ID_KEY);
    if (stored && stored.length >= 8) return stored;

    const id = generateDeviceId();
    localStorage.setItem(DEVICE_ID_KEY, id);
    return id;
  } catch {
    return generateDeviceId();
  }
}

interface GuestSessionState {
  deviceId: string | null;
  guestSession: GuestSession | null;
  guestSessionStatus: GuestSession["status"] | null;
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
}

/**
 * useGuestSession — manages device ID and guest session lifecycle.
 *
 * - Generates a stable deviceId in localStorage on first visit.
 * - Calls POST /api/guest/session to init/resume a backend guest session.
 * - Caches the session in sessionStorage to avoid repeat calls per tab.
 * - Does nothing if the user is authenticated (isAuthenticated = true).
 *
 * Future phases can call `refresh()` after onboarding or paywall events
 * to pick up the latest session state from the server.
 */
export function useGuestSession(isAuthenticated: boolean): GuestSessionState {
  const [deviceId, setDeviceId] = useState<string | null>(null);
  const [guestSession, setGuestSession] = useState<GuestSession | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const initSession = useCallback(async (id: string) => {
    setLoading(true);
    setError(null);

    try {
      const res = await fetch("/api/guest/session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ deviceId: id }),
      });

      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? `HTTP ${res.status}`);
      }

      const data = await res.json();
      const session: GuestSession = data.session;

      setGuestSession(session);

      try {
        sessionStorage.setItem(GUEST_SESSION_KEY, JSON.stringify(session));
      } catch {
        // sessionStorage unavailable — ignore
      }
    } catch (err: any) {
      setError(err.message ?? "Failed to initialize guest session");
    } finally {
      setLoading(false);
    }
  }, []);

  const refresh = useCallback(async () => {
    if (!deviceId) return;
    await initSession(deviceId);
  }, [deviceId, initSession]);

  useEffect(() => {
    if (isAuthenticated) return;

    const id = getOrCreateDeviceId();
    setDeviceId(id);

    try {
      const cached = sessionStorage.getItem(GUEST_SESSION_KEY);
      if (cached) {
        const parsed: GuestSession = JSON.parse(cached);
        // Skip "converted" sessions from cache — they require a live API check
        // so the authoritative status is always used for routing decisions.
        // Also skip "blocked" sessions.
        if (
          parsed.deviceId === id &&
          parsed.status !== "blocked" &&
          parsed.status !== "converted"
        ) {
          setGuestSession(parsed);
          return;
        }
      }
    } catch {
      // ignore cache read errors
    }

    initSession(id);
  }, [isAuthenticated, initSession]);

  return {
    deviceId,
    guestSession,
    guestSessionStatus: guestSession?.status ?? null,
    loading,
    error,
    refresh,
  };
}
