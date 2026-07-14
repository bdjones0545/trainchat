// ─── Kevin Navigation Registry ────────────────────────────────────────────────
//
// Allowlist of TrainChat routes that Kevin may suggest for navigation assistance.
// Kevin may ONLY suggest routes from this registry — arbitrary URLs are rejected.
//
// Rules:
//   - Kevin selects from the allowlist only; no arbitrary URLs
//   - Authentication requirements are enforced before any suggestion is acted on
//   - Users must click to navigate — no automatic redirects
//   - Usefulness is recorded per suggestion
//
// Add new routes here as the product grows. This is the ONLY source of truth
// for Kevin navigation suggestions.

export interface KevinNavEntry {
  intent: string;
  route: string;
  label: string;
  description: string;
  requiredAuth: boolean;
  requiredRole?: string[];
  requiredFeature?: string;
}

export const KEVIN_NAVIGATION_REGISTRY: KevinNavEntry[] = [
  {
    intent: "change_equipment",
    route: "/profile",
    label: "Equipment Settings",
    description: "Update your available equipment and training environment",
    requiredAuth: true,
  },
  {
    intent: "edit_workout",
    route: "/",
    label: "Edit Workout",
    description: "Use the chat or right panel to request edits to your current workout",
    requiredAuth: true,
  },
  {
    intent: "update_goals",
    route: "/profile",
    label: "Profile & Goals",
    description: "Update your training goals and preferences",
    requiredAuth: true,
  },
  {
    intent: "view_prior_programs",
    route: "/",
    label: "Program History",
    description: "View your prior training programs in the History tab of the Live Program Panel",
    requiredAuth: true,
  },
  {
    intent: "manage_subscription",
    route: "/billing",
    label: "Subscription & Billing",
    description: "Manage your TrainChat subscription and billing",
    requiredAuth: true,
  },
  {
    intent: "training_memory_settings",
    route: "/settings/memory",
    label: "Training Memory",
    description: "Control what training preferences Kevin remembers for you",
    requiredAuth: true,
    requiredFeature: "kevin_memory",
  },
  {
    intent: "view_program",
    route: "/",
    label: "Live Program",
    description: "View your current active training program in the Live Program Panel",
    requiredAuth: true,
  },
  {
    intent: "session_feedback",
    route: "/",
    label: "Session Feedback",
    description: "Submit feedback on how a training session went",
    requiredAuth: true,
  },
  {
    intent: "exercise_logs",
    route: "/exercise-logs",
    label: "Exercise Logs",
    description: "View your exercise history and performance logs",
    requiredAuth: true,
  },
  {
    intent: "start_new_conversation",
    route: "/",
    label: "New Conversation",
    description: "Start a new conversation with your AI coach",
    requiredAuth: false,
  },
];

// ─── Route resolution ─────────────────────────────────────────────────────────

/**
 * Resolves a Kevin navigation intent to an allowlisted route entry.
 * Returns null for any intent not in the registry.
 * Arbitrary URLs are always rejected.
 */
export function resolveKevinNavigationIntent(
  intent: string,
): KevinNavEntry | null {
  return KEVIN_NAVIGATION_REGISTRY.find((e) => e.intent === intent) ?? null;
}

/**
 * Returns all navigation entries safe to return to the client.
 * Strips requiredRole for entries the current user doesn't qualify for.
 */
export function getPublicNavigationRegistry(
  isAuthenticated: boolean,
): KevinNavEntry[] {
  return KEVIN_NAVIGATION_REGISTRY.filter(
    (e) => !e.requiredAuth || isAuthenticated,
  );
}

/**
 * Validates that a route string matches an allowlisted entry.
 * Used when Kevin returns a suggested route to ensure it hasn't been fabricated.
 */
export function isKevinRouteAllowlisted(route: string): boolean {
  return KEVIN_NAVIGATION_REGISTRY.some((e) => e.route === route);
}
