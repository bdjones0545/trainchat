/**
 * Global Learning Service
 *
 * Controlled product-wide learning pipeline for TrainChat.
 *
 * ARCHITECTURE PRINCIPLE:
 *   The live agent NEVER reads from this layer.
 *   This layer only: collect → aggregate → suggest.
 *   Promotion into the core system requires explicit admin review.
 *
 * Flow:
 *   User interaction → trackLearningEvent() [fire-and-forget]
 *                    → normalizeRequestKey() [applied before storage]
 *                    ↓
 *   Aggregation pipeline → buildAggregates()
 *                        → generateCandidates()
 *                        ↓
 *   Admin review surface → getLearningReport()
 */

import {
  db,
  globalLearningEventsTable,
  learningCandidatesTable,
} from "@workspace/db";
import type {
  GlobalLearningEventType,
  InsertGlobalLearningEvent,
  LearningCandidateType,
  RiskLevel,
  RecommendationType,
} from "@workspace/db";
import { eq, and, gte, sql, desc, count, inArray } from "drizzle-orm";
import { logger } from "./logger";

// ─── Public Types ──────────────────────────────────────────────────────────────

export type { GlobalLearningEventType };

export interface LearningEventPayload {
  userId?: number;
  eventType: GlobalLearningEventType;
  routeUsed?: "deterministic" | "openai" | "library_progression" | "rule_based" | "structured_intent";
  intentType?: string;
  editSubtype?: string;
  programGoal?: string;
  sport?: string;
  trainingLevel?: string;
  uiPage?: string;
  targetScope?: string;
  requestText?: string;
  mutationApplied?: boolean;
  validatorPassed?: boolean;
  followupAction?: string;
  metadata?: Record<string, unknown>;
}

export interface LearningAggregate {
  key: string;
  totalCount: number;
  successRate: number;
  clarificationRate: number;
  revertRate: number;
  acceptanceRate: number;
  dominantContexts: string[];
  recommendedAction: string;
  confidenceScore: number;
}

export interface LearningReport {
  topEditPatterns: PatternRow[];
  topFailurePatterns: PatternRow[];
  topClarificationTriggers: PatternRow[];
  topRevertedSubstitutions: PatternRow[];
  frequentFollowupEdits: PatternRow[];
  candidateCount: number;
  safeToPromoteCount: number;
  generatedAt: string;
}

interface PatternRow {
  key: string;
  count: number;
  successRate?: number;
  revertRate?: number;
}

// ─── Normalization Dictionary ──────────────────────────────────────────────────
//
// Maps surface-level request phrases → canonical normalized keys.
// These keys are the unit of aggregation. Add entries here to broaden coverage.

const NORMALIZATION_MAP: Array<{ patterns: RegExp[]; key: string }> = [
  {
    patterns: [
      /make\s+(it|this)\s+harder/i,
      /harder\s*please/i,
      /too\s+easy/i,
      /increase\s+(the\s+)?difficulty/i,
      /ramp\s+(it\s+)?up/i,
      /more\s+challenging/i,
    ],
    key: "increase_difficulty_general",
  },
  {
    patterns: [
      /make\s+(it|this)\s+easier/i,
      /easier\s*please/i,
      /too\s+hard/i,
      /reduce\s+(the\s+)?difficulty/i,
      /tone\s+(it\s+)?down/i,
      /less\s+intense/i,
    ],
    key: "decrease_difficulty_general",
  },
  {
    patterns: [
      /add\s+more\s+(exercises?\s+to|to)\s+day/i,
      /expand\s+day/i,
      /more\s+exercises\s+on\s+day/i,
      /add\s+more\s+to\s+day/i,
      /extend\s+day\s*\d/i,
    ],
    key: "expand_session_volume_day",
  },
  {
    patterns: [
      /add\s+more\s+exercises/i,
      /more\s+exercises/i,
      /add\s+(some\s+)?more\s+(work|sets|volume)/i,
      /increase\s+volume/i,
    ],
    key: "add_volume_general",
  },
  {
    patterns: [
      /shorten\s+(the\s+)?session/i,
      /less\s+(exercises?|work|volume)/i,
      /reduce\s+volume/i,
      /make\s+(it\s+)?shorter/i,
      /cut\s+it\s+down/i,
    ],
    key: "reduce_session_volume",
  },
  {
    patterns: [
      /swap\s+(out\s+)?(the\s+)?\w+/i,
      /replace\s+(the\s+)?\w+/i,
      /substitute\s+(the\s+)?\w+/i,
      /instead\s+of\s+\w+/i,
      /change\s+(the\s+)?\w+\s+to/i,
    ],
    key: "exercise_substitution_request",
  },
  {
    patterns: [
      /no\s+equipment/i,
      /at\s+home/i,
      /bodyweight\s+only/i,
      /without\s+(a\s+)?gym/i,
    ],
    key: "equipment_constraint_home",
  },
  {
    patterns: [
      /only\s+(have\s+)?dumbbells?/i,
      /just\s+dumbbells?/i,
      /dumbbell\s+only/i,
    ],
    key: "equipment_constraint_dumbbells",
  },
  {
    patterns: [
      /skip\s+(the\s+)?\w+/i,
      /don't?\s+(want|do)\s+(the\s+)?\w+/i,
      /remove\s+(the\s+)?\w+/i,
      /take\s+out\s+\w+/i,
    ],
    key: "remove_exercise_request",
  },
  {
    patterns: [
      /my\s+(knee|shoulder|back|hip|ankle|wrist|elbow)\s+(hurts|is\s+sore|is\s+injured|is\s+bothering)/i,
      /pain\s+in\s+my\s+(knee|shoulder|back|hip|ankle|wrist|elbow)/i,
      /injured\s+my\s+(knee|shoulder|back|hip|ankle|wrist|elbow)/i,
    ],
    key: "injury_modification_request",
  },
  {
    patterns: [
      /add\s+(a\s+)?rest\s+day/i,
      /need\s+(a\s+)?rest\s+day/i,
      /more\s+rest/i,
      /too\s+many\s+days/i,
    ],
    key: "add_rest_day_request",
  },
  {
    patterns: [
      /change\s+(the\s+)?split/i,
      /different\s+split/i,
      /upper\s+lower\s+split/i,
      /push\s+pull\s+legs/i,
      /full\s+body\s+(instead|split)/i,
    ],
    key: "program_split_change",
  },
  {
    patterns: [
      /more\s+cardio/i,
      /add\s+cardio/i,
      /add\s+(some\s+)?conditioning/i,
      /cardio\s+days?/i,
    ],
    key: "add_cardio_request",
  },
  {
    patterns: [
      /how\s+(long|many|much)/i,
      /what\s+(does|is|are)/i,
      /why\s+(is|did|does|are)/i,
      /explain/i,
      /what\s+should\s+I/i,
    ],
    key: "information_question",
  },
];

/**
 * Normalize a raw user request string into a canonical key for aggregation.
 * Falls back to "unclassified_request" when no pattern matches.
 */
export function normalizeRequestKey(requestText: string): string {
  const trimmed = requestText.trim();
  for (const entry of NORMALIZATION_MAP) {
    for (const pattern of entry.patterns) {
      if (pattern.test(trimmed)) {
        return entry.key;
      }
    }
  }
  return "unclassified_request";
}

// ─── Risk Classification ───────────────────────────────────────────────────────
//
// Certain domains must never be auto-promoted regardless of confidence.
// They require explicit human review due to safety sensitivity.

const SAFETY_SENSITIVE_KEYS = new Set([
  "injury_modification_request",
  "return_from_injury",
  "special_population_adaptation",
  "clinical_consideration",
]);

const HIGH_RISK_CANDIDATE_TYPES = new Set<LearningCandidateType>([
  "validator_rule_update",
  "prompt_guidance_update",
]);

function classifyRisk(
  key: string,
  candidateType: LearningCandidateType
): RiskLevel {
  if (SAFETY_SENSITIVE_KEYS.has(key)) return "high";
  if (HIGH_RISK_CANDIDATE_TYPES.has(candidateType)) return "medium";
  return "low";
}

function computeRecommendation(
  confidenceScore: number,
  evidenceCount: number,
  riskLevel: RiskLevel
): RecommendationType {
  if (riskLevel === "high") return "review";
  if (evidenceCount < 10) return "needs_more_data";
  if (confidenceScore >= 0.8 && riskLevel === "low") return "safe_to_promote";
  if (confidenceScore >= 0.6) return "review";
  return "needs_more_data";
}

// ─── Event Tracking ────────────────────────────────────────────────────────────

/**
 * Record a structured learning signal. Fire-and-forget safe — callers
 * do not need to await, and failures are swallowed (never surface to users).
 */
export async function trackLearningEvent(
  payload: LearningEventPayload
): Promise<void> {
  try {
    const normalizedKey = payload.requestText
      ? normalizeRequestKey(payload.requestText)
      : undefined;

    const row: InsertGlobalLearningEvent = {
      userId: payload.userId ?? null,
      eventType: payload.eventType,
      routeUsed: payload.routeUsed ?? null,
      intentType: payload.intentType ?? null,
      editSubtype: payload.editSubtype ?? null,
      programGoal: payload.programGoal ?? null,
      sport: payload.sport ?? null,
      trainingLevel: payload.trainingLevel ?? null,
      uiPage: payload.uiPage ?? null,
      targetScope: payload.targetScope ?? null,
      normalizedRequestKey: normalizedKey ?? null,
      mutationApplied: payload.mutationApplied ?? null,
      validatorPassed: payload.validatorPassed ?? null,
      followupAction: payload.followupAction ?? null,
      metadata: payload.metadata ?? null,
    };

    await db.insert(globalLearningEventsTable).values(row);
  } catch (err) {
    logger.warn({ err }, "[GlobalLearning] Failed to track learning event — suppressed");
  }
}

// ─── Aggregation ───────────────────────────────────────────────────────────────

type WindowDays = 7 | 30 | "all";

function windowStart(days: WindowDays): Date | undefined {
  if (days === "all") return undefined;
  return new Date(Date.now() - days * 86_400_000);
}

/**
 * Build aggregated patterns for a given normalized key and time window.
 */
export async function buildAggregateForKey(
  key: string,
  window: WindowDays = 30
): Promise<LearningAggregate> {
  const since = windowStart(window);
  const base = eq(globalLearningEventsTable.normalizedRequestKey, key);
  const condition = since
    ? and(base, gte(globalLearningEventsTable.createdAt, since))
    : base;

  const rows = await db
    .select()
    .from(globalLearningEventsTable)
    .where(condition);

  const total = rows.length;
  if (total === 0) {
    return {
      key,
      totalCount: 0,
      successRate: 0,
      clarificationRate: 0,
      revertRate: 0,
      acceptanceRate: 0,
      dominantContexts: [],
      recommendedAction: "insufficient_data",
      confidenceScore: 0,
    };
  }

  const mutations = rows.filter((r) => r.mutationApplied);
  const successes = mutations.filter((r) => r.validatorPassed !== false);
  const clarifications = rows.filter(
    (r) => r.eventType === "clarification_required"
  );
  const reverts = rows.filter((r) => r.eventType === "user_reverted_change");
  const accepted = rows.filter((r) => r.eventType === "user_accepted_change");

  const successRate = total > 0 ? successes.length / total : 0;
  const clarificationRate = clarifications.length / total;
  const revertRate = reverts.length / Math.max(mutations.length, 1);
  const acceptanceRate = accepted.length / Math.max(mutations.length, 1);

  // Extract dominant contexts (goals, sports) from metadata
  const goalCounts = new Map<string, number>();
  const sportCounts = new Map<string, number>();
  for (const r of rows) {
    if (r.programGoal) goalCounts.set(r.programGoal, (goalCounts.get(r.programGoal) ?? 0) + 1);
    if (r.sport) sportCounts.set(r.sport, (sportCounts.get(r.sport) ?? 0) + 1);
  }
  const topGoal = [...goalCounts.entries()].sort((a, b) => b[1] - a[1])[0];
  const topSport = [...sportCounts.entries()].sort((a, b) => b[1] - a[1])[0];
  const dominantContexts: string[] = [];
  if (topGoal) dominantContexts.push(`goal:${topGoal[0]}`);
  if (topSport) dominantContexts.push(`sport:${topSport[0]}`);

  // Route performance
  const routeCounts = new Map<string, number>();
  for (const r of rows) {
    if (r.routeUsed) routeCounts.set(r.routeUsed, (routeCounts.get(r.routeUsed) ?? 0) + 1);
  }
  const bestRoute = [...routeCounts.entries()].sort((a, b) => b[1] - a[1])[0];
  const recommendedAction = bestRoute
    ? `route_via_${bestRoute[0]}`
    : "no_dominant_route";

  // Confidence: weighted combination of sample size, success, and low revert
  const sampleWeight = Math.min(total / 50, 1.0); // caps at n=50
  const qualityScore = successRate * 0.5 + acceptanceRate * 0.3 + (1 - revertRate) * 0.2;
  const confidenceScore = parseFloat((sampleWeight * qualityScore).toFixed(3));

  return {
    key,
    totalCount: total,
    successRate: parseFloat(successRate.toFixed(3)),
    clarificationRate: parseFloat(clarificationRate.toFixed(3)),
    revertRate: parseFloat(revertRate.toFixed(3)),
    acceptanceRate: parseFloat(acceptanceRate.toFixed(3)),
    dominantContexts,
    recommendedAction,
    confidenceScore,
  };
}

/**
 * Aggregate ALL distinct normalized keys and return sorted by total count.
 */
export async function buildAllAggregates(
  window: WindowDays = 30
): Promise<LearningAggregate[]> {
  const since = windowStart(window);
  const condition = since
    ? gte(globalLearningEventsTable.createdAt, since)
    : undefined;

  const keyRows = await db
    .selectDistinct({ key: globalLearningEventsTable.normalizedRequestKey })
    .from(globalLearningEventsTable)
    .where(
      and(
        condition,
        sql`${globalLearningEventsTable.normalizedRequestKey} IS NOT NULL`
      )
    );

  const keys = keyRows.map((r) => r.key).filter(Boolean) as string[];
  const aggregates = await Promise.all(
    keys.map((k) => buildAggregateForKey(k, window))
  );

  return aggregates.sort((a, b) => b.totalCount - a.totalCount);
}

// ─── Candidate Generation ──────────────────────────────────────────────────────

/**
 * Analyse aggregates and produce (or upsert) improvement candidates in the DB.
 *
 * This function is intended to be called periodically (e.g. nightly cron)
 * or on-demand from the admin dashboard. It NEVER modifies the core system.
 */
export async function generateCandidates(window: WindowDays = 30): Promise<number> {
  const aggregates = await buildAllAggregates(window);
  let generated = 0;

  for (const agg of aggregates) {
    if (agg.totalCount < 5) continue; // not enough signal

    const candidatesToCreate: Array<{
      type: LearningCandidateType;
      condition: boolean;
      summary: string;
    }> = [
      // Routing improvement: many events on a key that uses OpenAI but high success
      {
        type: "routing_rule_update",
        condition:
          agg.totalCount >= 10 &&
          agg.successRate >= 0.8 &&
          agg.clarificationRate < 0.1,
        summary: `"${agg.key}" resolves successfully ${Math.round(agg.successRate * 100)}% of the time without clarification — consider adding a deterministic routing rule.`,
      },
      // Default execution: clarification not needed
      {
        type: "default_execution_rule",
        condition:
          agg.totalCount >= 15 &&
          agg.clarificationRate < 0.05 &&
          agg.acceptanceRate >= 0.75,
        summary: `"${agg.key}" succeeds without clarification ${Math.round(agg.acceptanceRate * 100)}% of the time — consider adding auto-apply default execution.`,
      },
      // Anti-pattern: high revert rate suggests poor output quality
      {
        type: "anti_pattern_rule",
        condition: agg.revertRate >= 0.3 && agg.totalCount >= 10,
        summary: `"${agg.key}" has a ${Math.round(agg.revertRate * 100)}% revert rate — current handling produces outputs users frequently undo. Investigate and add anti-pattern guard.`,
      },
      // Exercise mapping: high rejection on substitution requests
      {
        type: "exercise_relationship_update",
        condition:
          agg.key === "exercise_substitution_request" &&
          agg.revertRate >= 0.25,
        summary: `Exercise substitution requests are reverted ${Math.round(agg.revertRate * 100)}% of the time — substitution mappings may need review.`,
      },
      // Clarification reduction: prompts triggering unnecessary clarifications
      {
        type: "clarification_policy_update",
        condition:
          agg.clarificationRate >= 0.3 &&
          agg.totalCount >= 10 &&
          agg.acceptanceRate >= 0.6,
        summary: `"${agg.key}" triggers clarification ${Math.round(agg.clarificationRate * 100)}% of the time but then usually succeeds — clarification may be unnecessary for this request class.`,
      },
    ];

    for (const candidate of candidatesToCreate) {
      if (!candidate.condition) continue;

      const riskLevel = classifyRisk(agg.key, candidate.type);
      const recommendation = computeRecommendation(
        agg.confidenceScore,
        agg.totalCount,
        riskLevel
      );

      // Check if a non-promoted, non-dismissed candidate already exists for this key + type
      const existing = await db
        .select({ id: learningCandidatesTable.id })
        .from(learningCandidatesTable)
        .where(
          and(
            eq(learningCandidatesTable.key, agg.key),
            eq(learningCandidatesTable.type, candidate.type),
            eq(learningCandidatesTable.promoted, false),
            eq(learningCandidatesTable.dismissed, false)
          )
        )
        .limit(1);

      if (existing.length > 0) {
        // Update evidence count and confidence on existing candidate
        await db
          .update(learningCandidatesTable)
          .set({
            evidenceCount: agg.totalCount,
            confidenceScore: agg.confidenceScore,
            recommendation,
            summary: candidate.summary,
            updatedAt: new Date(),
            metadata: {
              successRate: agg.successRate,
              revertRate: agg.revertRate,
              clarificationRate: agg.clarificationRate,
              acceptanceRate: agg.acceptanceRate,
              dominantContexts: agg.dominantContexts,
              recommendedAction: agg.recommendedAction,
              window: String(window),
            },
          })
          .where(eq(learningCandidatesTable.id, existing[0].id));
      } else {
        await db.insert(learningCandidatesTable).values({
          type: candidate.type,
          key: agg.key,
          summary: candidate.summary,
          evidenceCount: agg.totalCount,
          confidenceScore: agg.confidenceScore,
          riskLevel,
          recommendation,
          metadata: {
            successRate: agg.successRate,
            revertRate: agg.revertRate,
            clarificationRate: agg.clarificationRate,
            acceptanceRate: agg.acceptanceRate,
            dominantContexts: agg.dominantContexts,
            recommendedAction: agg.recommendedAction,
            window: String(window),
          },
        });
        generated++;
      }
    }
  }

  return generated;
}

// ─── Admin Report Queries ──────────────────────────────────────────────────────

/**
 * Return a structured learning report for the admin dashboard.
 * Covers the most actionable insight categories.
 */
export async function getLearningReport(window: WindowDays = 30): Promise<LearningReport> {
  const since = windowStart(window);

  const baseCondition = since
    ? gte(globalLearningEventsTable.createdAt, since)
    : undefined;

  const keyCondition = and(
    baseCondition,
    sql`${globalLearningEventsTable.normalizedRequestKey} IS NOT NULL`
  );

  // Top edit request patterns by volume
  const topEditRows = await db
    .select({
      key: globalLearningEventsTable.normalizedRequestKey,
      count: count(),
    })
    .from(globalLearningEventsTable)
    .where(and(keyCondition, eq(globalLearningEventsTable.eventType, "edit_request")))
    .groupBy(globalLearningEventsTable.normalizedRequestKey)
    .orderBy(sql`count(*) DESC`)
    .limit(10);

  // Top failure patterns (mutation_failure events)
  const topFailureRows = await db
    .select({
      key: globalLearningEventsTable.normalizedRequestKey,
      count: count(),
    })
    .from(globalLearningEventsTable)
    .where(and(keyCondition, eq(globalLearningEventsTable.eventType, "mutation_failure")))
    .groupBy(globalLearningEventsTable.normalizedRequestKey)
    .orderBy(sql`count(*) DESC`)
    .limit(10);

  // Top clarification triggers
  const topClarificationRows = await db
    .select({
      key: globalLearningEventsTable.normalizedRequestKey,
      count: count(),
    })
    .from(globalLearningEventsTable)
    .where(and(keyCondition, eq(globalLearningEventsTable.eventType, "clarification_required")))
    .groupBy(globalLearningEventsTable.normalizedRequestKey)
    .orderBy(sql`count(*) DESC`)
    .limit(10);

  // Most reverted changes
  const topRevertRows = await db
    .select({
      key: globalLearningEventsTable.normalizedRequestKey,
      count: count(),
    })
    .from(globalLearningEventsTable)
    .where(and(keyCondition, eq(globalLearningEventsTable.eventType, "user_reverted_change")))
    .groupBy(globalLearningEventsTable.normalizedRequestKey)
    .orderBy(sql`count(*) DESC`)
    .limit(10);

  // Requests most often followed by another edit (program_followup_edit)
  const topFollowupRows = await db
    .select({
      key: globalLearningEventsTable.normalizedRequestKey,
      count: count(),
    })
    .from(globalLearningEventsTable)
    .where(and(keyCondition, eq(globalLearningEventsTable.eventType, "program_followup_edit")))
    .groupBy(globalLearningEventsTable.normalizedRequestKey)
    .orderBy(sql`count(*) DESC`)
    .limit(10);

  // Candidate summary counts
  const [candidateCountRow] = await db
    .select({ n: count() })
    .from(learningCandidatesTable)
    .where(
      and(
        eq(learningCandidatesTable.promoted, false),
        eq(learningCandidatesTable.dismissed, false)
      )
    );

  const [safeCountRow] = await db
    .select({ n: count() })
    .from(learningCandidatesTable)
    .where(
      and(
        eq(learningCandidatesTable.promoted, false),
        eq(learningCandidatesTable.dismissed, false),
        eq(learningCandidatesTable.recommendation, "safe_to_promote")
      )
    );

  return {
    topEditPatterns: topEditRows.map((r) => ({
      key: r.key ?? "unknown",
      count: Number(r.count),
    })),
    topFailurePatterns: topFailureRows.map((r) => ({
      key: r.key ?? "unknown",
      count: Number(r.count),
    })),
    topClarificationTriggers: topClarificationRows.map((r) => ({
      key: r.key ?? "unknown",
      count: Number(r.count),
    })),
    topRevertedSubstitutions: topRevertRows.map((r) => ({
      key: r.key ?? "unknown",
      count: Number(r.count),
    })),
    frequentFollowupEdits: topFollowupRows.map((r) => ({
      key: r.key ?? "unknown",
      count: Number(r.count),
    })),
    candidateCount: Number(candidateCountRow?.n ?? 0),
    safeToPromoteCount: Number(safeCountRow?.n ?? 0),
    generatedAt: new Date().toISOString(),
  };
}

/**
 * Fetch all open (non-promoted, non-dismissed) candidates, newest first.
 */
export async function getOpenCandidates(limit = 50) {
  return db
    .select()
    .from(learningCandidatesTable)
    .where(
      and(
        eq(learningCandidatesTable.promoted, false),
        eq(learningCandidatesTable.dismissed, false)
      )
    )
    .orderBy(
      desc(learningCandidatesTable.confidenceScore),
      desc(learningCandidatesTable.evidenceCount)
    )
    .limit(limit);
}

/**
 * Mark a candidate as promoted (reviewed and accepted into the core system).
 * This is a human-controlled action — it does not auto-modify any live logic.
 */
export async function promoteCandidate(id: number): Promise<boolean> {
  const [updated] = await db
    .update(learningCandidatesTable)
    .set({ promoted: true, promotedAt: new Date(), updatedAt: new Date() })
    .where(eq(learningCandidatesTable.id, id))
    .returning({ id: learningCandidatesTable.id });
  return !!updated;
}

/**
 * Dismiss a candidate (won't resurface unless regenerated with new data).
 */
export async function dismissCandidate(id: number): Promise<boolean> {
  const [updated] = await db
    .update(learningCandidatesTable)
    .set({ dismissed: true, updatedAt: new Date() })
    .where(eq(learningCandidatesTable.id, id))
    .returning({ id: learningCandidatesTable.id });
  return !!updated;
}

/**
 * Fetch recent raw learning events for the admin event stream view.
 */
export async function getRecentLearningEvents(limit = 100, window: WindowDays = 30) {
  const since = windowStart(window);
  const condition = since
    ? gte(globalLearningEventsTable.createdAt, since)
    : undefined;

  return db
    .select()
    .from(globalLearningEventsTable)
    .where(condition)
    .orderBy(desc(globalLearningEventsTable.createdAt))
    .limit(limit);
}

// ─── Safety Gate ───────────────────────────────────────────────────────────────
//
// Explicit documentation of what the Global Learning Layer is NOT allowed to do.
//
// These functions do not exist intentionally.
// If you find yourself needing them, re-read the architecture principles above.
//
// PROHIBITED:
//   - applyPromptChange(candidate)       // no live prompt rewriting
//   - updateValidatorFromCandidate()     // no auto-modifying validators
//   - injectBeliefFromConversation()     // no absorbing raw user assertions
//   - rewriteProgrammingRule()           // no doctrine changes from production
//   - autoPromoteSafetySensitive()       // safety domains always require review
