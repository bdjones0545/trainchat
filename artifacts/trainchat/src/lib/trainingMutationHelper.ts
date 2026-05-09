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
  systemEdit?: { applied?: boolean; systemId?: number };
  trainingSystemId?: number;
  systemId?: number;
}

/**
 * Invalidates/refetches all training-system query keys after a mutation.
 * Safe to call even when no mutation actually occurred (returns early).
 *
 * @param conversationId  The active conversationId. When provided the
 *                        ["training-system-conv", conversationId] key is
 *                        refetched so the right sidebar hydrates immediately.
 */
export function handleTrainingSystemMutationResult(
  result: TrainingMutationResult,
  queryClient: QueryClient,
  focusMode?: string | null,
  conversationId?: string | number | null,
): void {
  const hasMutation =
    result.systemSaved ||
    result.systemEdit?.applied ||
    result.trainingSystemId != null ||
    result.systemId != null;

  if (!hasMutation) return;

  const returnedTrainingSystemId =
    result.systemEdit?.systemId ?? result.trainingSystemId ?? result.systemId ?? null;

  // ── Conversation-scoped refetch (right sidebar source of truth) ────────────
  // This is the key the sidebar's activeSystem is derived from. Without this
  // refetch the sidebar stays stale and shows the "Ready to build" empty state
  // even though the program was successfully updated.
  if (conversationId != null) {
    queryClient.refetchQueries({ queryKey: ["training-system-conv", conversationId] });
  }

  // Primary active-system refetch — not just invalidate, to get the new ID immediately.
  queryClient.refetchQueries({ queryKey: ["training-system-active", focusMode] });

  // Week / panel data — include the specific system key so it refetches with the new data
  if (returnedTrainingSystemId != null) {
    queryClient.invalidateQueries({ queryKey: ["training-system-week", returnedTrainingSystemId] });
    queryClient.invalidateQueries({ queryKey: ["live-panel-week-ids", returnedTrainingSystemId] });
    queryClient.invalidateQueries({ queryKey: ["week-view-select", returnedTrainingSystemId] });
  }
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
  // Refetch (not just invalidate) so focus lane dots update immediately after any mutation.
  queryClient.refetchQueries({ queryKey: ["training-system-library"] });
  queryClient.invalidateQueries({ queryKey: ["mutation-audit-receipts"] });
}
