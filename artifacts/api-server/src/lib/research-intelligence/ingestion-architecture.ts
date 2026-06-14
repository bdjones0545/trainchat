// ─── Future Research Ingestion Architecture ───────────────────────────────────
//
// Phase 8 — Designed for future research ingestion without requiring a redesign.
//
// Pipeline:
//   ResearchSource (PubMed, NSCA, ACSM, internal reviews)
//     ↓
//   EvidenceExtractor (parse raw text/abstract into structured findings)
//     ↓
//   EvidenceNormalizer (map to canonical adaptations, methods, populations)
//     ↓
//   EvidenceGraph (merge into the live evidence database)
//     ↓
//   PerformanceIntelligence (confidence scores update automatically)
//
// Nothing in this file should be built out yet beyond interfaces.
// The architecture is designed so ingestion can be wired in without breaking
// the existing pure-TS engine.
// ─────────────────────────────────────────────────────────────────────────────

import type {
  ResearchSource,
  NormalizedEvidence,
  EvidenceLevel,
  EvidenceStrength,
  PopulationCategory,
} from "./evidence-models.js";

// ─── Ingestion Source Definitions ─────────────────────────────────────────────

/** Supported research source types for future ingestion. */
export type ResearchSourceType =
  | "pubmed"           // PubMed API (NLM)
  | "nsca"             // NSCA Journal of Strength & Conditioning Research
  | "acsm"             // ACSM Medicine & Science in Sports & Exercise
  | "cochrane"         // Cochrane Database of Systematic Reviews
  | "sports_medicine"  // British Journal of Sports Medicine / JOSPT
  | "internal_review"  // Internal TrainChat evidence review
  | "position_stand"   // NSCA / ACSM / ISAK position stands
  | "consensus_panel"; // Custom consensus panel (e.g., athlete data pools)

/** Configuration for a research ingestion source. */
export interface IngestionSourceConfig {
  sourceType: ResearchSourceType;
  enabled: boolean;
  priority: number;            // 1 = highest priority; determines merge conflict resolution
  rateLimit?: number;          // requests per minute (for API sources)
  authentication?: string;     // env var name (never a raw key)
  filterCriteria: IngestionFilter;
  lastIngested?: string;       // ISO timestamp
}

/** Filters that control what gets ingested from a source. */
export interface IngestionFilter {
  keywords?: string[];         // e.g. ["sprint", "plyometric", "resistance training"]
  minYear?: number;            // only ingest research from this year onward
  minSampleSize?: number;      // exclude n < X studies
  studyTypes?: EvidenceLevel[];// only ingest these study types
  populations?: PopulationCategory[];
  excludeTopics?: string[];    // topics to filter out (e.g., "doping", "pediatric surgery")
}

// ─── Extraction Pipeline ───────────────────────────────────────────────────────

/**
 * EvidenceExtractor contract.
 * Implementations parse raw research data into structured ResearchSources.
 * Different extractors handle different source formats.
 */
export interface EvidenceExtractor {
  sourceType: ResearchSourceType;

  /**
   * Parse raw content (API response, PDF text, HTML) into a ResearchSource.
   * Should be idempotent — the same input always produces the same output.
   */
  extract(rawContent: string | Record<string, unknown>): Promise<ResearchSource[]>;

  /**
   * Validate that a source meets minimum quality thresholds for ingestion.
   * Returns validation errors (empty array = pass).
   */
  validate(source: ResearchSource): string[];
}

/**
 * EvidenceNormalizer contract.
 * Maps free-text adaptations, methods, and populations from extracted sources
 * onto canonical terms used by the Research Intelligence Engine.
 */
export interface EvidenceNormalizer {
  /**
   * Normalize a raw adaptation name to a canonical adaptation string.
   * e.g. "sprint speed", "20m time", "running velocity" → "Acceleration"
   */
  normalizeAdaptation(rawAdaptation: string): string | null;

  /**
   * Normalize a training method name to a canonical method string.
   * e.g. "sled towing", "resisted running" → "Resisted Sprint Training"
   */
  normalizeMethod(rawMethod: string): string | null;

  /**
   * Normalize a population descriptor to a PopulationCategory.
   * e.g. "NCAA Division I athletes", "competitive sprinters" → "college" | "professional"
   */
  normalizePopulation(rawPopulation: string): PopulationCategory | null;

  /**
   * Classify an effect size value into a strength category.
   * Uses Cohen's d conventions (0.2 small, 0.5 medium, 0.8 large).
   */
  classifyEffectSize(cohensD: number): EvidenceStrength;

  /**
   * Convert a raw source into normalized evidence records.
   */
  normalize(source: ResearchSource): NormalizedEvidence[];
}

// ─── Evidence Graph Merger ─────────────────────────────────────────────────────

/** Result of merging normalized evidence into the live graph. */
export interface MergeResult {
  method: string;
  adaptation: string;
  previousConfidence: number;
  updatedConfidence: number;
  delta: number;
  sourcesAdded: number;
  conflictsDetected: string[];
  outcome: "updated" | "unchanged" | "conflict_escalated" | "rejected";
}

/**
 * EvidenceGraphMerger contract.
 * Takes normalized evidence and merges it into the live evidence database.
 * Handles conflict resolution when new findings contradict existing ones.
 */
export interface EvidenceGraphMerger {
  /**
   * Merge a batch of normalized evidence into the evidence graph.
   * Returns a summary of all changes made.
   */
  merge(evidence: NormalizedEvidence[]): Promise<MergeResult[]>;

  /**
   * Check whether a normalized finding conflicts with existing evidence.
   * Returns a description of the conflict or null if no conflict.
   */
  detectConflict(evidence: NormalizedEvidence): string | null;

  /**
   * Resolve a detected conflict between new and existing evidence.
   * Default resolution: higher-quality source wins; log to conflict registry.
   */
  resolveConflict(
    existing: NormalizedEvidence,
    incoming: NormalizedEvidence
  ): { winner: NormalizedEvidence; resolution: string };
}

// ─── Full Ingestion Pipeline ───────────────────────────────────────────────────

/**
 * IngestionPipeline contract.
 * Orchestrates the full flow from raw source → updated evidence graph.
 *
 * Future implementation steps:
 *   1. Fetch raw content from source (PubMed API, file upload, webhook)
 *   2. Extract with appropriate EvidenceExtractor
 *   3. Validate extracted sources
 *   4. Normalize with EvidenceNormalizer
 *   5. Merge with EvidenceGraphMerger
 *   6. Emit MergeResult summary
 *   7. Invalidate affected confidence caches
 */
export interface IngestionPipeline {
  sourceConfig: IngestionSourceConfig;

  /**
   * Run a full ingestion cycle for this source.
   * Should be designed to run idempotently (safe to re-run).
   */
  run(): Promise<IngestionRunSummary>;

  /**
   * Preview what would be ingested without committing changes.
   * Useful for reviewing research before it affects live confidence scores.
   */
  dryRun(): Promise<IngestionRunSummary>;
}

export interface IngestionRunSummary {
  sourceType: ResearchSourceType;
  startedAt: string;
  completedAt: string;
  sourcesDiscovered: number;
  sourcesIngested: number;
  sourcesRejected: number;
  mergeResults: MergeResult[];
  errors: string[];
  isDryRun: boolean;
}

// ─── Canonical Term Registry ───────────────────────────────────────────────────
// When a normalizer encounters unknown terms, they are added here for review.
// A human or AI review step maps them to canonical terms and adds to the registry.

export interface TermRegistryEntry {
  rawTerm: string;
  canonicalTerm: string | null;    // null = not yet mapped
  termType: "adaptation" | "method" | "population";
  sourceType: ResearchSourceType;
  occurrenceCount: number;
  reviewStatus: "pending" | "approved" | "rejected";
  reviewedBy?: string;
  reviewedAt?: string;
}

// ─── Conflict Registry ────────────────────────────────────────────────────────
// All detected conflicts are logged here for human review.
// The system never silently overwrites evidence — conflicts are surfaced.

export interface EvidenceConflictRecord {
  id: string;
  method: string;
  adaptation: string;
  existingConfidence: number;
  incomingConfidence: number;
  existingSourceType: EvidenceLevel;
  incomingSourceType: EvidenceLevel;
  detectedAt: string;
  resolution: "existing_wins" | "incoming_wins" | "merged" | "escalated" | "pending";
  notes?: string;
}

// ─── Ingestion Registry ────────────────────────────────────────────────────────
// A lightweight runtime registry of configured ingestion sources.
// Sources are registered at startup and run on schedule or on demand.

const _registeredSources: IngestionSourceConfig[] = [];

export function registerIngestionSource(config: IngestionSourceConfig): void {
  const existing = _registeredSources.findIndex((s) => s.sourceType === config.sourceType);
  if (existing >= 0) {
    _registeredSources[existing] = config;
  } else {
    _registeredSources.push(config);
  }
}

export function getRegisteredSources(): IngestionSourceConfig[] {
  return [..._registeredSources];
}

export function getEnabledSources(): IngestionSourceConfig[] {
  return _registeredSources.filter((s) => s.enabled).sort((a, b) => a.priority - b.priority);
}

// ─── Effect Size Classifier (reusable utility) ────────────────────────────────

/**
 * Classify a Cohen's d effect size into an EvidenceStrength.
 * Follows Hopkins (2002) magnitude thresholds common in sport science.
 */
export function classifyEffectSizeAsStrength(cohensD: number): EvidenceStrength {
  const d = Math.abs(cohensD);
  if (d >= 1.2) return "strong";
  if (d >= 0.6) return "moderate";
  if (d >= 0.2) return "mixed";    // small effect — not conclusive enough for strong
  return "insufficient";
}

/**
 * Estimate confidence from an effect size and sample size.
 * Larger effects and larger samples yield higher confidence.
 */
export function estimateConfidenceFromEffectSize(cohensD: number, sampleSize: number): number {
  const d = Math.abs(cohensD);
  const baseConfidence = Math.min(95, Math.round(d * 60)); // scale effect size to 0–95

  // Sample size penalty for very small studies
  const samplePenalty = sampleSize < 10 ? -20 : sampleSize < 20 ? -10 : sampleSize < 50 ? -5 : 0;

  return Math.max(10, baseConfidence + samplePenalty);
}
