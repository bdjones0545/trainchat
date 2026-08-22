export interface GenerationAttemptVerdict<T> {
  value: T;
  schemaIssues: readonly string[];
  constraintIssues: readonly unknown[];
  hardConstraintIssues: readonly unknown[];
  criticalPainIssues: readonly unknown[];
}

export type GenerationAttemptResolution<T> =
  | { accepted: true; value: T; attemptCount: number }
  | { accepted: false; attemptCount: number; failureCategory: "exhausted_retry" };

/**
 * Deterministic final selector for provider attempts. A later attempt never
 * weakens an earlier constraint: only a completely clean attempt can cross
 * into persistence, and exhaustion returns no artifact.
 */
export function resolveGenerationAttempts<T>(
  attempts: readonly GenerationAttemptVerdict<T>[],
): GenerationAttemptResolution<T> {
  for (let index = 0; index < attempts.length; index++) {
    const attempt = attempts[index];
    const clean =
      attempt.schemaIssues.length === 0 &&
      attempt.constraintIssues.length === 0 &&
      attempt.hardConstraintIssues.length === 0 &&
      attempt.criticalPainIssues.length === 0;
    if (clean) return { accepted: true, value: attempt.value, attemptCount: index + 1 };
  }
  return { accepted: false, attemptCount: attempts.length, failureCategory: "exhausted_retry" };
}
