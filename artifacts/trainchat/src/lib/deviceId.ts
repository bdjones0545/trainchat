/**
 * deviceId.ts — Single source of truth for device identity.
 *
 * Every visitor gets a persistent deviceId stored in localStorage.
 * This ID is used to bootstrap an anonymous user account on the backend
 * so guests use the real TrainChat system from first contact.
 *
 * The ID is never regenerated unless localStorage is cleared — it survives
 * page refreshes, tab closes, and browser restarts.
 */

export const DEVICE_ID_KEY = "trainchat_device_id";

/** Generate a cryptographically random device ID. */
function generateDeviceId(): string {
  if (typeof crypto !== "undefined" && crypto.randomUUID) {
    return crypto.randomUUID().replace(/-/g, "");
  }
  // Fallback for environments without crypto.randomUUID
  return Array.from({ length: 32 }, () =>
    Math.floor(Math.random() * 16).toString(16),
  ).join("");
}

/**
 * Get the existing deviceId from localStorage, or create and persist a new one.
 * Safe to call multiple times — always returns the same ID for a given device.
 */
export function getOrCreateDeviceId(): string {
  try {
    const existing = localStorage.getItem(DEVICE_ID_KEY);
    if (existing && existing.length >= 16) return existing;

    const id = generateDeviceId();
    localStorage.setItem(DEVICE_ID_KEY, id);
    return id;
  } catch {
    // localStorage unavailable (e.g., incognito with storage blocked)
    // Return a session-scoped ID so the app still works
    return generateDeviceId();
  }
}

/** Read the current deviceId without creating one. Returns null if not set. */
export function readDeviceId(): string | null {
  try {
    return localStorage.getItem(DEVICE_ID_KEY);
  } catch {
    return null;
  }
}
