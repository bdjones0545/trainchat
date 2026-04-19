/**
 * Focus Mode Router
 *
 * Routes to the correct focus engine based on the active focus mode.
 * This is the single entry point the shell (ai.ts, conversations.ts)
 * uses to get focus-mode-specific context.
 *
 * CROSS-CONTAMINATION PREVENTION:
 * - Each mode has its own engine instance
 * - The router enforces strict mode isolation
 * - Cross-mode reads are blocked and logged
 * - Shared user facts (age, injury, equipment, sport) remain global
 */

import type { FocusMode, FocusEngineInterface } from "./engine-interface";
import { strengthEngine } from "./strength-engine";
import { speedEngine } from "./speed-engine";
import { mobilityEngine } from "./mobility-engine";
import { logger } from "../logger";

// ─── Engine Registry ──────────────────────────────────────────────────────────

const ENGINE_REGISTRY: Record<FocusMode, FocusEngineInterface> = {
  strength: strengthEngine,
  speed: speedEngine,
  mobility: mobilityEngine,
};

// ─── Router ───────────────────────────────────────────────────────────────────

/**
 * Returns the correct engine for the active focus mode.
 * Logs the routing decision for audit purposes.
 */
export function getEngineForMode(focusMode: FocusMode): FocusEngineInterface {
  const engine = ENGINE_REGISTRY[focusMode];

  if (!engine) {
    logger.warn(`[FocusModeRouter] Unknown focus mode "${focusMode}" — falling back to strength engine`);
    return ENGINE_REGISTRY.strength;
  }

  return engine;
}

/**
 * Builds the focus-mode-specific prompt context string.
 * This is injected into the AI system prompt to differentiate agent behavior.
 *
 * ISOLATION GUARANTEE:
 * - Only the engine for the ACTIVE mode is consulted
 * - No context from other mode engines is mixed in
 */
export function buildFocusModePromptContext(
  focusMode: FocusMode,
  userMessage: string,
  goal?: string,
  sport?: string,
  experience?: string,
): string {
  const engine = getEngineForMode(focusMode);
  const context = engine.buildPromptContext(userMessage, goal, sport, experience);

  logger.info(`[FocusModeRouter] Context built`, {
    focusMode,
    engineUsed: engine.label,
    contextLength: context.length,
    goal: goal ?? "none",
    sport: sport ?? "none",
  });

  return context;
}

/**
 * Returns adaptation heuristics for the active mode.
 * Used by continuation logic to determine next block direction.
 */
export function getFocusModeAdaptationHeuristics(focusMode: FocusMode): string {
  const engine = getEngineForMode(focusMode);
  return engine.getAdaptationHeuristics();
}

/**
 * Returns the memory namespace identifier for the active mode.
 * Used to scope focus-specific memories without polluting global memory.
 */
export function getFocusModeMemoryNamespace(focusMode: FocusMode): string {
  const engine = getEngineForMode(focusMode);
  return engine.getMemoryNamespace().namespace;
}

/**
 * Validates that a memory key belongs to the correct focus namespace.
 * Prevents cross-contamination in memory reads/writes.
 */
export function validateMemoryNamespace(
  focusMode: FocusMode,
  memoryNamespace: string
): boolean {
  const expected = getFocusModeMemoryNamespace(focusMode);

  if (memoryNamespace !== expected && memoryNamespace !== "global") {
    logger.warn(`[CrossContaminationAudit]`, {
      focusMode,
      attemptedReadFromWrongNamespace: memoryNamespace,
      expectedNamespace: expected,
      blocked: true,
    });
    return false;
  }

  return true;
}

/**
 * Returns all block archetypes for the active mode.
 * Used by program generation to select the correct block family.
 */
export function getFocusModeBlockArchetypes(focusMode: FocusMode) {
  return getEngineForMode(focusMode).getBlockArchetypes();
}

/**
 * Returns movement families for the active mode.
 * Used by exercise selection to filter appropriate movement patterns.
 */
export function getFocusModeMovementFamilies(focusMode: FocusMode) {
  return getEngineForMode(focusMode).getMovementFamilies();
}

/**
 * Returns session grammar for the active mode.
 * Used by session generation to set rep/set/rest profiles.
 */
export function getFocusModeSessionGrammar(focusMode: FocusMode) {
  return getEngineForMode(focusMode).getSessionGrammar();
}

/**
 * Returns continuation rules for the active mode.
 * Used by block continuation logic.
 */
export function getFocusModeContinuationRules(focusMode: FocusMode) {
  return getEngineForMode(focusMode).getContinuationRules();
}
