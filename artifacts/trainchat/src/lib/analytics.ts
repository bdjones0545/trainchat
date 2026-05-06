import posthog from "posthog-js";

// ── Provider bootstrap (runs once) ────────────────────────────────────────────
// PostHog is initialised lazily on first call so tree-shaking works cleanly.
let _booted = false;

function boot(): void {
  if (_booted) return;
  _booted = true;

  const key = (import.meta as any).env?.VITE_POSTHOG_KEY as string | undefined;
  if (!key) return;

  posthog.init(key, {
    api_host: (import.meta as any).env?.VITE_POSTHOG_HOST ?? "https://us.i.posthog.com",
    capture_pageview: false,
    capture_pageleave: false,
    autocapture: false,
    disable_session_recording: true,
    loaded: () => {
      if ((import.meta as any).env?.DEV) {
        console.log("[analytics] PostHog ready");
      }
    },
  });
}

// ── Typed event catalogue ─────────────────────────────────────────────────────
type EventName =
  | "program_generated"
  | "program_saved"
  | "program_edited"
  | "session_started"
  | "session_completed"
  | "session_logged"
  | "upgrade_clicked"
  | "paywall_shown"
  | "paywall_dismissed"
  | "pricing_modal_opened"
  | "checkout_started"
  | "checkout_completed"
  | "checkout_abandoned"
  | "subscription_activated"
  | "suggestion_chip_clicked"
  | "focus_mode_changed"
  | "share_program_clicked"
  | "first_program_generated"
  | "first_edit_performed"
  | "second_edit_performed"
  | "save_prompt_shown"
  | "save_clicked"
  | "account_created_from_save"
  | "upgrade_hint_shown"
  | "session_returned"
  | "panel_opened"
  | "mobile_panel_auto_opened"
  | "return_session_started"
  | "streak_extended"
  | "week_advanced"
  | "tab_viewed"
  | "mutation_completed"
  | "edit_failed"
  | "day_unlock_attempted";

interface EventProperties {
  [key: string]: string | number | boolean | null | undefined;
}

// ── Core helpers ──────────────────────────────────────────────────────────────

function track(event: EventName, properties?: EventProperties): void {
  try {
    boot();
    if ((import.meta as any).env?.DEV) {
      console.log(`[analytics] ${event}`, properties ?? {});
    }
    if (_booted && (import.meta as any).env?.VITE_POSTHOG_KEY) {
      posthog.capture(event, properties);
    }
  } catch {
    // analytics must never crash the app
  }
}

function identify(userId: string | number, traits?: EventProperties): void {
  try {
    boot();
    if ((import.meta as any).env?.DEV) {
      console.log("[analytics] identify", { userId, traits });
    }
    if (_booted && (import.meta as any).env?.VITE_POSTHOG_KEY) {
      posthog.identify(String(userId), traits);
    }
  } catch {
    // analytics must never crash the app
  }
}

function reset(): void {
  try {
    if (_booted && (import.meta as any).env?.VITE_POSTHOG_KEY) {
      posthog.reset();
    }
  } catch {
    // analytics must never crash the app
  }
}

function page(name: string, properties?: EventProperties): void {
  try {
    boot();
    if ((import.meta as any).env?.DEV) {
      console.log(`[analytics] page:${name}`, properties ?? {});
    }
    if (_booted && (import.meta as any).env?.VITE_POSTHOG_KEY) {
      posthog.capture("$pageview", { page: name, ...properties });
    }
  } catch {
    // analytics must never crash the app
  }
}

function captureException(err: unknown, context?: EventProperties): void {
  try {
    const message = err instanceof Error ? err.message : String(err);
    if ((import.meta as any).env?.DEV) {
      console.error("[analytics] exception", message, context);
    }
    if (_booted && (import.meta as any).env?.VITE_POSTHOG_KEY) {
      posthog.capture("$exception", { message, ...context });
    }
  } catch {
    // analytics must never crash the app
  }
}

export const analytics = { track, identify, reset, page, captureException };
