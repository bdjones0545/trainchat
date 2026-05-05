/**
 * Training System Mutation Result Helper — shared invalidation logic.
 *
 * Centralises the React Query cache invalidation/refetch that must happen
 * after ANY successful training-system mutation, whether it comes through the
 * SSE complete handler or the non-SSE JSON response handler.
 *
 * Rules:
 *  - result.systemSaved     — new program was built and persisted (new system ID)
 *  - result.systemEdit.applied — an existing system was mutated in-place
 *  - result.trainingSystemId / result.systemId — auto-created system hydration
 *
 * Call this helper INSTEAD OF inline queryClient.invalidate* blocks so both
 * paths always invalidate exactly the same key set.
 */

import type { QueryClient } from "@tanstack/react-query";

export interface TrainingMutationResult {
  systemSaved?: boolean;
  systemEdit?: { applied?: boolean };
  trainingSystemId?: number;
  systemId?: number;
}

/**
 * Invalidates/refetches all training-system query keys after a mutation.
 * Safe to call even when no mutation actually occurred (returns early).
 */
export function handleTrainingSystemMutationResult(
  result: TrainingMutationResult,
  queryClient: QueryClient,
  focusMode?: string | null,
): void {
  const hasMutation =
    result.systemSaved ||
    result.systemEdit?.applied ||
    result.trainingSystemId != null ||
    result.systemId != null;

  if (!hasMutation) return;

  // Primary active-system refetch — not just invalidate, to get the new ID immediately.
  queryClient.refetchQueries({ queryKey: ["training-system-active", focusMode] });

  // Week / panel data
  queryClient.invalidateQueries({ queryKey: ["training-system-week"] });
  queryClient.invalidateQueries({ queryKey: ["live-panel-week-ids"] });
  queryClient.invalidateQueries({ queryKey: ["week-view-select"] });

  // History tabs
  queryClient.invalidateQueries({ queryKey: ["training-system-history", "changes"] });
  queryClient.invalidateQueries({ queryKey: ["training-system-history", "versions"] });

  // Secondary keys (today / block / library / audit)
  queryClient.invalidateQueries({ queryKey: ["training-system-today"] });
  queryClient.invalidateQueries({ queryKey: ["training-system-block"] });
  queryClient.invalidateQueries({ queryKey: ["training-system-history"] });
  queryClient.invalidateQueries({ queryKey: ["training-system-library"] });
  queryClient.invalidateQueries({ queryKey: ["mutation-audit-receipts"] });
}
