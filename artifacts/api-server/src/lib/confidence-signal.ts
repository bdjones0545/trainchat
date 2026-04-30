/**
 * Confidence Signal
 *
 * Produces a single closing sentence that subtly confirms the generated or
 * mutated program matches the user's setup — equipment, constraints, or goal.
 *
 * Rules:
 *  - Returns null for guidance-only responses, clarification, or failed verification.
 *  - Max 1 sentence. No internal system terms.
 *  - Content chosen by priority: constraints > equipment > safety > general.
 *  - Always factually accurate given the system state.
 */

import type { HardConstraints } from "./constraint-memory";

export interface ConfidenceSignalInput {
  hardConstraints: HardConstraints;
  equipmentProfile: string | null;
  safetyMode: boolean;
  /** null = build (no mutation verifier ran); object = mutation path */
  verificationResult: { verified: boolean } | null;
  actionType: "build" | "mutation";
}

/**
 * Returns a short confidence sentence to append to the final assistant message,
 * or null if the conditions for showing it are not met.
 */
export function buildConfidenceLine({
  hardConstraints,
  equipmentProfile,
  safetyMode,
  verificationResult,
  actionType,
}: ConfidenceSignalInput): string | null {
  // Only fire for builds and mutations
  if (actionType !== "build" && actionType !== "mutation") return null;

  // For mutations, verification must have passed
  if (actionType === "mutation" && (!verificationResult || !verificationResult.verified)) return null;

  const hasConstraints =
    hardConstraints.bannedItems.length > 0 || hardConstraints.dislikedItems.length > 0;

  // Priority 1: Named constraints are present
  if (hasConstraints) {
    return "Everything is built around your equipment and preferences.";
  }

  // Priority 2: Equipment profile is known
  if (equipmentProfile) {
    return "Everything fits the equipment you have available.";
  }

  // Priority 3: Safety / pain mode active
  if (safetyMode || hardConstraints.painRegions.length > 0) {
    return "This keeps your training aligned with your current limitations.";
  }

  // Priority 4: General fallback
  return "This is set up to match your goal and training setup.";
}
