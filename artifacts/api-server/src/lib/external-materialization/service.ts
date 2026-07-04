/**
 * External materialization service (Phase 2.1 foundation).
 *
 * The service-layer abstraction that WILL own materializing an external program
 * blob into a relational `training_systems` hierarchy so the surgical edit
 * engine can act on it. All heavy collaborators (system builder, service-user
 * resolution) are injected, so:
 *   - this module imports NO engine/AI/training-system code,
 *   - constructing it has zero side effects,
 *   - nothing in production constructs or calls it yet.
 *
 * It is added now purely so later Phase 2 PRs (2.3/2.4) are small. The current
 * `POST /program/edit` regeneration path is completely untouched.
 *
 * See docs/phase-2-external-surgical-edit.md §6 (Materialization Architecture).
 */

import type { ChatProgram } from "../training-system-service";
import type { ExternalProgramRepository } from "./repository";
import { getProgramStructure, isMaterialized } from "./mapping";
import type { ExternalProgramRowView } from "./mapping";

/** Attribution context for the service user that owns a materialized system. */
export interface MaterializationOwnerContext {
  apiKeyId: number | null;
  orgId: string | null;
}

/**
 * Resolve the real `users.id` that will own a materialized system. Injected so
 * the global-vs-per-org decision stays deferred (design doc §12.1).
 */
export type ResolveServiceUserFn = (
  ctx: MaterializationOwnerContext,
) => Promise<number>;

/**
 * Build a training_systems hierarchy from a program. Structural subset of
 * `createTrainingSystemFromProgram` — injected, not imported, so the engine is
 * never pulled in here.
 */
export type CreateSystemFn = (
  userId: number,
  program: ChatProgram,
  conversationId?: number | null,
  focusMode?: string | null,
) => Promise<{ id: number }>;

export interface ExternalMaterializationDeps {
  repository: ExternalProgramRepository;
  resolveServiceUserId: ResolveServiceUserFn;
  createSystem: CreateSystemFn;
}

export interface MaterializationResult {
  trainingSystemId: number;
  alreadyMaterialized: boolean;
}

export class ExternalMaterializationService {
  constructor(private readonly deps: ExternalMaterializationDeps) {}

  /** Delegates to the pure mapping layer. */
  isMaterialized(row: Pick<ExternalProgramRowView, "trainingSystemId">): boolean {
    return isMaterialized(row);
  }

  /**
   * Materialize a program blob into a training system, link it, and return the
   * system id. Idempotent: an already-materialized program is a no-op.
   *
   * NOTE: this method is fully implemented but INVOKED BY NOTHING in production
   * — no route constructs this service yet (Phase 2.3 wires it behind a flag).
   * All effects go through injected collaborators, so importing this module can
   * never materialize anything on its own.
   */
  async materialize(
    row: ExternalProgramRowView,
    ownerCtx: MaterializationOwnerContext,
    focusMode?: string | null,
  ): Promise<MaterializationResult> {
    if (isMaterialized(row)) {
      return { trainingSystemId: row.trainingSystemId as number, alreadyMaterialized: true };
    }

    const program = getProgramStructure(row);
    if (!program) {
      throw new Error(
        `external program ${row.id} has no materializable program data`,
      );
    }

    const userId = await this.deps.resolveServiceUserId(ownerCtx);
    const system = await this.deps.createSystem(userId, program, null, focusMode ?? null);
    await this.deps.repository.linkTrainingSystem(row.id, system.id);

    return { trainingSystemId: system.id, alreadyMaterialized: false };
  }
}
