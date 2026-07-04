/**
 * Default wiring for the Phase 2.4 surgical edit (real engine functions).
 *
 * Kept in a separate module from the pure `surgical.ts` helper so that unit
 * tests of `maybeApplySurgicalExternalEdit` don't pull the engine/DB. Only the
 * route (and its integration wiring) imports this.
 */

import {
  getFullTrainingSystem,
  dbSystemToProgramStructure,
} from "../training-system-service";
import { interpretEditRequest, serializeSystemForPrompt } from "../edit-intent-service";
import { applyEditPlan } from "../edit-engine";
import type { SurgicalEditDeps } from "./surgical";

/**
 * Wire the real internal surgical functions. `onError` is injected for
 * logging/audit. Pure construction — invokes nothing.
 */
export function createDefaultSurgicalDeps(
  onError?: (err: unknown, stage: string) => void,
): SurgicalEditDeps {
  return {
    loadFullSystem: (systemId) => getFullTrainingSystem(systemId),
    serializeSystemForPrompt: (system) => serializeSystemForPrompt(system),
    interpretEditRequest: (userRequest, systemContext) =>
      interpretEditRequest(userRequest, systemContext),
    applyEditPlan: (plan, intentFamily, trainingSystemId) =>
      applyEditPlan(plan, intentFamily, trainingSystemId),
    serializeToProgram: (system) => dbSystemToProgramStructure(system),
    onError,
  };
}
