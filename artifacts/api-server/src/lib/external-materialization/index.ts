/**
 * External materialization foundation (Phase 2.1).
 *
 * Additive, dependency-injected building blocks for a FUTURE surgical external
 * edit path. Nothing here is imported by any route yet — the current
 * `POST /program/edit` regeneration path is unchanged.
 *
 * See docs/phase-2-external-surgical-edit.md.
 */

export {
  isMaterialized,
  isMaterializable,
  getProgramStructure,
  describeProgram,
  type ExternalProgramRowView,
  type ProgramShapeSummary,
} from "./mapping";

export {
  ExternalProgramRepository,
  type ExternalProgramRow,
  type ExternalProgramDb,
} from "./repository";

export {
  ExternalMaterializationService,
  type ExternalMaterializationDeps,
  type MaterializationOwnerContext,
  type MaterializationResult,
  type ResolveServiceUserFn,
  type CreateSystemFn,
} from "./service";

export {
  createDefaultRoundTripDeps,
  materializeExternalProgram,
  reserializeTrainingSystem,
  roundTripExternalProgram,
  type RoundTripAdapterDeps,
  type RoundTripResult,
  type FullTrainingSystem,
  type SerializedProgram,
} from "./adapter";

export {
  isExternalMaterializationEnabled,
  EXTERNAL_MATERIALIZATION_FLAG,
  isExternalSurgicalEditEnabled,
  EXTERNAL_SURGICAL_EDIT_FLAG,
} from "./feature-flag";

export {
  maybeApplySurgicalExternalEdit,
  buildSurgicalEditMessage,
  type SurgicalEditParams,
  type SurgicalEditDeps,
  type SurgicalEditResult,
  type SurgicalEditOutcome,
} from "./surgical";

export { createDefaultSurgicalDeps } from "./surgical-deps";

export {
  withExternalProgramLock,
  materializeOnce,
  activeLockKeyCount,
  type MaterializeOnceDeps,
} from "./serialization";

export { reloadExternalTrainingSystemId } from "./program-store";

export {
  resolveExternalServiceUserId,
  externalServiceDeviceId,
} from "./service-user";

export {
  maybeMaterializeOnEdit,
  type LazyMaterializeProgram,
  type LazyMaterializeDeps,
  type LazyMaterializeResult,
  type LazyMaterializeReason,
} from "./lazy";
