/**
 * Focus Engine Interface
 *
 * Every focus-mode engine (Strength, Speed, Mobility) exposes this contract.
 * The shell (ai.ts, conversations.ts) stays stable while the underlying logic
 * changes by active focus.
 *
 * Engines are NOT called on every AI request — they are consulted to produce
 * prompt context strings that are injected into the system prompt for the AI.
 */

export type FocusMode = "strength" | "speed" | "mobility";

// ─── Block Archetypes ─────────────────────────────────────────────────────────

export interface BlockArchetypeDescriptor {
  id: string;
  label: string;
  description: string;
  phase: string;
  neuralDemand: "high" | "moderate" | "low";
  fatigueProfile: "high" | "moderate" | "low";
}

// ─── Movement Family ──────────────────────────────────────────────────────────

export interface MovementFamilyDescriptor {
  id: string;
  label: string;
  examples: string[];
  primaryAdaptation: string;
}

// ─── Session Grammar ──────────────────────────────────────────────────────────

export interface SessionGrammarDescriptor {
  primarySlotCount: number;
  secondarySlotCount: number;
  repRangeGuidance: string;
  restGuidance: string;
  intensityGuidance: string;
  specialNotes: string;
}

// ─── Continuation Rules ───────────────────────────────────────────────────────

export interface ContinuationRuleDescriptor {
  nextBlockOptions: string[];
  progressionDirection: string;
  deescalationTriggers: string[];
  adaptationCues: string[];
}

// ─── Quick Command Semantics ──────────────────────────────────────────────────

export interface QuickCommandDescriptor {
  label: string;
  intentMapping: string;
  engineBias: string;
}

// ─── Memory Namespace ─────────────────────────────────────────────────────────

export interface MemoryNamespaceDescriptor {
  namespace: string;
  exampleKeys: string[];
  sharedWithGlobal: boolean;
}

// ─── Full Engine Interface ────────────────────────────────────────────────────

export interface FocusEngineInterface {
  focusMode: FocusMode;
  label: string;

  getBlockArchetypes(): BlockArchetypeDescriptor[];
  getMovementFamilies(): MovementFamilyDescriptor[];
  getSessionGrammar(): SessionGrammarDescriptor;
  getContinuationRules(): ContinuationRuleDescriptor;
  getQuickCommandSemantics(): QuickCommandDescriptor[];
  getMemoryNamespace(): MemoryNamespaceDescriptor;

  /**
   * Produces a focused prompt context string injected into the AI system prompt.
   * This is the primary mechanism for mode-based agent behavior differentiation.
   */
  buildPromptContext(userMessage: string): string;

  /**
   * Returns adaptation heuristic guidance for this mode.
   * Used by the continuation logic to determine next block direction.
   */
  getAdaptationHeuristics(): string;
}
