/**
 * Per-key serialization for materialized external-program operations (Phase 2.6).
 *
 * A narrow, in-process async mutex keyed by external program id (or training
 * system id). It guarantees that materialization, surgical edits, and reverts
 * targeting the SAME program never interleave, which is what makes the
 * multi-step (non-transactional) relational + blob flows safe: operations run
 * one at a time per program instead of racing.
 *
 * SCOPE (updated for audit F9): this lock is **per process** and serializes the
 * FULL multi-transaction operation (materialize → surgical edit → blob write)
 * within one instance. Cross-instance correctness now comes from Postgres
 * advisory xact locks (lib/advisory-lock.ts) taken inside each write
 * transaction: relational edits lock the training system, blob writes lock the
 * external program. Those locks are transaction-scoped, so ACROSS instances
 * the individual transactions serialize but the whole operation does not —
 * keep this in-process mutex as the first line of defense within an instance.
 *
 * See docs/phase-2-external-surgical-edit.md §9 (Risk) and §11 (Rollout).
 */

// Tail promise per key. Each waiter chains onto the previous tail and only runs
// after it resolves; the tail always resolves (release() runs in finally), so
// the chain never deadlocks.
const tails = new Map<string, Promise<void>>();

export async function withExternalProgramLock<T>(
  key: string | number,
  fn: () => Promise<T>,
): Promise<T> {
  const k = String(key);
  const prevTail = tails.get(k) ?? Promise.resolve();

  let release!: () => void;
  const held = new Promise<void>((res) => {
    release = res;
  });
  const newTail = prevTail.then(() => held);
  tails.set(k, newTail);

  // Wait for the previous holder to finish (prevTail never rejects).
  await prevTail;

  try {
    return await fn();
  } finally {
    release();
    // If nobody queued behind us, drop the key so the map doesn't grow.
    if (tails.get(k) === newTail) tails.delete(k);
  }
}

/** Testing/introspection helper: number of keys with a live tail. */
export function activeLockKeyCount(): number {
  return tails.size;
}

export interface MaterializeOnceDeps {
  /** Re-read the program's current trainingSystemId from the DB. */
  reload: (programId: number) => Promise<number | null>;
  /** Materialize + link, returning the new trainingSystemId (or null on failure). */
  materialize: () => Promise<number | null>;
}

/**
 * Materialize a program at most once under concurrency (Phase 2.6). Serialized
 * per program: the first caller materializes; every subsequent caller re-reads
 * the now-linked trainingSystemId and reuses it (materialize runs once). Also
 * avoids orphan systems from a lost link-write race, since only one link occurs.
 */
export async function materializeOnce(
  programId: number,
  deps: MaterializeOnceDeps,
): Promise<number | null> {
  return withExternalProgramLock(programId, async () => {
    const current = await deps.reload(programId);
    if (current != null) return current;
    return deps.materialize();
  });
}
