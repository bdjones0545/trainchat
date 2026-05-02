type EventName =
  | "program_generated"
  | "program_saved"
  | "program_edited"
  | "session_started"
  | "session_completed"
  | "upgrade_clicked"
  | "paywall_shown"
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
  | "session_returned";

interface EventProperties {
  [key: string]: string | number | boolean | null | undefined;
}

function track(event: EventName, properties?: EventProperties): void {
  if (import.meta.env.DEV) {
    console.log(`[analytics] ${event}`, properties ?? {});
  }
  // TODO: forward to analytics provider (e.g. PostHog, Mixpanel, Segment)
  // Example: posthog.capture(event, properties);
}

function identify(userId: string | number, traits?: EventProperties): void {
  if (import.meta.env.DEV) {
    console.log(`[analytics] identify`, { userId, traits });
  }
  // TODO: forward to analytics provider
  // Example: posthog.identify(String(userId), traits);
}

function page(name: string, properties?: EventProperties): void {
  if (import.meta.env.DEV) {
    console.log(`[analytics] page:${name}`, properties ?? {});
  }
  // TODO: forward to analytics provider
  // Example: posthog.capture("$pageview", { page: name, ...properties });
}

export const analytics = { track, identify, page };
