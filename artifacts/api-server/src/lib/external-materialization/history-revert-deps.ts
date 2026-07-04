/**
 * Default relational wiring for the Phase 2.5 history/revert dispatcher.
 *
 * Provides only the SYSTEM-backed collaborators (change log read + relational
 * restore + reload + reserialize + service-user resolution). The blob-backed
 * collaborators are built in the route from its own `db`, so the existing
 * external_program_versions behavior stays byte-identical and testable against
 * the mocked db.
 *
 * Kept separate from the pure `history-revert.ts` dispatcher so unit tests of
 * the dispatcher don't load the engine; the route (and tests that want the real
 * engine) import this.
 */

import { getChangeHistory } from "../change-log-service";
import { restoreFromChange } from "../restore-service";
import {
  getFullTrainingSystem,
  dbSystemToProgramStructure,
} from "../training-system-service";
import { resolveExternalServiceUserId } from "./service-user";
import type { HistoryRevertDeps } from "./history-revert";

/** The relational subset of HistoryRevertDeps, wired to the real functions. */
export type HistoryRevertSystemDeps = Pick<
  HistoryRevertDeps,
  | "resolveServiceUserId"
  | "readChangeHistory"
  | "restoreFromChange"
  | "loadFullSystem"
  | "serializeToProgram"
>;

export function createHistoryRevertSystemDeps(): HistoryRevertSystemDeps {
  return {
    resolveServiceUserId: (programId) => resolveExternalServiceUserId(programId),
    readChangeHistory: (userId, trainingSystemId) =>
      getChangeHistory(userId, trainingSystemId),
    restoreFromChange: (userId, changeId, trainingSystemId) =>
      restoreFromChange(userId, changeId, trainingSystemId),
    loadFullSystem: (trainingSystemId) => getFullTrainingSystem(trainingSystemId),
    serializeToProgram: (fullSystem) =>
      dbSystemToProgramStructure(fullSystem as Parameters<typeof dbSystemToProgramStructure>[0]),
  };
}
