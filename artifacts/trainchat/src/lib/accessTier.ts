/**
 * Access tier model for TrainChat.
 *
 * Three explicit tiers drive all feature-level gating:
 *   guest_preview  — unauthenticated visitor
 *   free_preview   — authenticated but no active subscription
 *   full_access    — subscribed (pro / elite)
 *
 * Access checks are intentionally feature-level, not route-level, so the
 * same component can render partial content regardless of entry point
 * (chat panel, saved programs, system page, etc.).
 */

export type AccessTier = "guest_preview" | "free_preview" | "full_access";

export function getAccessTier(
  isAuthenticated: boolean,
  subscriptionPlan: string | null | undefined,
): AccessTier {
  if (!isAuthenticated) return "guest_preview";
  if (subscriptionPlan === "pro" || subscriptionPlan === "elite") return "full_access";
  return "free_preview";
}

export function isPreviewOnly(tier: AccessTier): boolean {
  return tier === "guest_preview" || tier === "free_preview";
}

export function isFullAccess(tier: AccessTier): boolean {
  return tier === "full_access";
}
