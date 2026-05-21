// ─── Meta Conversions API (server-side) ───────────────────────────────────────
// Sends events to our backend which forwards them to Meta's CAPI.
// All PII hashing happens server-side. This file only shapes the payload.

interface CapiUserData {
  email?: string;
  phone?: string;
  firstName?: string;
  lastName?: string;
  externalId?: string;
  fbp?: string;
  fbc?: string;
}

interface CapiEvent {
  eventName: string;
  eventSourceUrl?: string;
  userData?: CapiUserData;
  customData?: Record<string, unknown>;
}

function getCookie(name: string): string | undefined {
  const match = document.cookie.match(new RegExp(`(?:^|;\\s*)${name}=([^;]*)`));
  return match ? decodeURIComponent(match[1]) : undefined;
}

function baseUserData(overrides?: CapiUserData): CapiUserData {
  return {
    fbp: getCookie("_fbp"),
    fbc: getCookie("_fbc"),
    ...overrides,
  };
}

async function send(events: CapiEvent[]): Promise<void> {
  try {
    await fetch("/api/meta-capi", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ events }),
    });
  } catch {
    // CAPI must never crash the app
  }
}

// ─── Event helpers ────────────────────────────────────────────────────────────

function pageView(userData?: CapiUserData): void {
  send([
    {
      eventName: "PageView",
      eventSourceUrl: window.location.href,
      userData: baseUserData(userData),
    },
  ]);
}

function lead(userData?: CapiUserData, customData?: Record<string, unknown>): void {
  send([
    {
      eventName: "Lead",
      eventSourceUrl: window.location.href,
      userData: baseUserData(userData),
      customData,
    },
  ]);
}

function completeRegistration(userData?: CapiUserData, customData?: Record<string, unknown>): void {
  send([
    {
      eventName: "CompleteRegistration",
      eventSourceUrl: window.location.href,
      userData: baseUserData(userData),
      customData,
    },
  ]);
}

function initiateCheckout(userData?: CapiUserData, customData?: Record<string, unknown>): void {
  send([
    {
      eventName: "InitiateCheckout",
      eventSourceUrl: window.location.href,
      userData: baseUserData(userData),
      customData,
    },
  ]);
}

function purchase(
  value: number,
  currency: string,
  userData?: CapiUserData,
  customData?: Record<string, unknown>,
): void {
  send([
    {
      eventName: "Purchase",
      eventSourceUrl: window.location.href,
      userData: baseUserData(userData),
      customData: { value, currency, ...customData },
    },
  ]);
}

function subscribe(userData?: CapiUserData, customData?: Record<string, unknown>): void {
  send([
    {
      eventName: "Subscribe",
      eventSourceUrl: window.location.href,
      userData: baseUserData(userData),
      customData,
    },
  ]);
}

export const capi = {
  pageView,
  lead,
  completeRegistration,
  initiateCheckout,
  purchase,
  subscribe,
};
