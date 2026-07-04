/**
 * Observability for the external materialized/surgical path (Phase 2.7).
 *
 * Lightweight, dependency-free structured events + in-process counters. Each
 * event is logged (structured) and increments a counter for local
 * introspection/tests. Not a metrics backend — a rollout-monitoring aid that a
 * real collector can scrape from logs.
 */

import { logger } from "../logger";

export type ExternalEvent =
  // materialization
  | "materialize_attempted"
  | "materialize_succeeded"
  | "materialize_failed"
  | "materialize_skipped"
  // surgical edit
  | "surgical_attempted"
  | "surgical_succeeded"
  | "surgical_fallback"
  | "surgical_edit_partial"
  // history / revert
  | "history_blob"
  | "history_system"
  | "revert_succeeded"
  | "revert_failed";

const counters = new Map<ExternalEvent, number>();

/** Emit a structured external-path event (logs + increments a counter). */
export function emitExternalEvent(
  event: ExternalEvent,
  fields: Record<string, unknown> = {},
): void {
  counters.set(event, (counters.get(event) ?? 0) + 1);
  logger.info({ event, ...fields }, `external-api: ${event}`);
}

/** Snapshot of counters (introspection/tests). */
export function getExternalEventCounts(): Record<string, number> {
  return Object.fromEntries(counters);
}

/** Reset counters (tests only). */
export function resetExternalEventCounts(): void {
  counters.clear();
}
