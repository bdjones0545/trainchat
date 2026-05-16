// ─── Research Retriever ───────────────────────────────────────────────────────
//
// Retrieves relevant research chunks from the database based on user context.
// Uses keyword/tag-based scoring (no vector DB required).
//
// Safety rule: only documents with librarian_recommendation = 'approve', or
// 'needs_review' that were subsequently admin-approved (status=approved), are
// eligible for retrieval. NULL-recommendation (unreviewed) documents are never
// surfaced to the Coach Agent.
//
// Scoring layers (higher = more relevant):
//   Tag overlap:      matched context tags × 3
//   Trust boost:      gold +2, high +1
//   Evidence boost:   meta_analysis +4, systematic_review/position_stand +3, rct +2, review/cohort +1
//   Freshness boost:  ≤3yr +2, ≤7yr +1, >12yr −1 (unless foundational)
//   Chunk-type boost: librarian +2, coaching/programming implications +1
//   Injury boost:     +2 when injuries + rehab/recovery category
//   Population boost: +3 when youth/older and matching tag
//   Warning penalty:  per-flag deductions (see WARNING_FLAG_PENALTIES)
//
// Called inside buildSystemPrompt to inject evidence-informed context.

import { db, researchDocumentsTable, researchChunksTable } from "@workspace/db";
import { eq, and, inArray, or, sql } from "drizzle-orm";
import { logger } from "../lib/logger";

export interface ResearchRetrievalParams {
  userMessage?: string;
  goal?: string | null;
  sport?: string | null;
  injuries?: string | null;
  population?: string | null;
  trainingPhase?: string | null;
  maxChunks?: number;
  userId?: number;
  conversationId?: number;
}

export interface RetrievedResearchChunk {
  documentId: number;
  documentTitle: string;
  documentSource: string;
  trustLevel: string;
  chunkText: string;
  chunkType: string;
  topicTags: string[];
  category: string;
  warningFlags: string[];
}

export interface ResearchContext {
  chunks: RetrievedResearchChunk[];
  sourceLabels: string[];
  hasContent: boolean;
}

// ─── Score breakdown (observability) ──────────────────────────────────────────

export interface ScoreBreakdown {
  chunkId?: number;
  documentId: number;
  tagOverlap: number;
  trustBoost: number;
  evidenceBoost: number;
  freshnessBoost: number;
  chunkTypeBoost: number;
  injuryBoost: number;
  populationBoost: number;
  warningPenalty: number;
  diversityBonus: number;
  finalScore: number;
}

// ─── Retrieval composition (diversity logging) ─────────────────────────────────

export interface RetrievalComposition {
  uniqueDocuments: number;
  chunksPerDocument: Record<string, number>;
  categories: string[];
  evidenceTypes: string[];
}

// ─── Warning flag score penalties ─────────────────────────────────────────────

const WARNING_FLAG_PENALTIES: Record<string, number> = {
  conflicting_evidence: -2,
  medical_claim_risk: -2,
  overclaim_risk: -1,
  expert_consensus: -1,
  old_evidence: -1,
  population_mismatch: -1,
  single_study: -1,
  lacks_replication: -1,
};

const WARNING_FLAG_CAUTION_TEXT: Record<string, string> = {
  conflicting_evidence: "conflicting evidence — apply conservatively",
  medical_claim_risk: "medical claim risk — not for diagnosis or treatment",
  overclaim_risk: "evidence may be overstated",
  expert_consensus: "expert consensus only, not controlled trial data",
  old_evidence: "older evidence — may not reflect current practice",
  population_mismatch: "population mismatch — verify applicability",
  single_study: "single study only — limited generalizability",
  lacks_replication: "not yet replicated",
};

// ─── Evidence-type scoring hierarchy ──────────────────────────────────────────
// Higher-quality study designs rank above weaker evidence automatically.

const EVIDENCE_TYPE_BOOSTS: Record<string, number> = {
  meta_analysis: 4,
  systematic_review: 3,
  consensus_statement: 3,
  position_stand: 3,
  clinical_practice_guideline: 3,
  guideline: 3,
  rct: 2,
  randomized_trial: 2,
  cohort_study: 1,
  prospective_study: 1,
  review: 1,
  expert_consensus: 0,
  observational_study: 0,
  foundational_single_study: 0,
  case_study: 0,
};

// ─── Freshness scoring ────────────────────────────────────────────────────────

function getFreshnessBoost(year: number | null | undefined, isFoundational: boolean): number {
  if (!year) return 0;
  const currentYear = new Date().getFullYear();
  const age = currentYear - year;
  if (age <= 3) return 2;
  if (age <= 7) return 1;
  if (age > 12 && !isFoundational) return -1;
  return 0; // 8–12 yr or foundational older papers: neutral
}

// ─── Evidence-type boost inference ────────────────────────────────────────────
// Use the stored evidence_type if set; otherwise infer conservatively from
// the document title or any publication-type strings stored in tags.

function inferEvidenceBoost(
  evidenceType: string | null | undefined,
  titleHint?: string,
): number {
  // Prefer explicit evidence type stored by librarian
  if (evidenceType && EVIDENCE_TYPE_BOOSTS[evidenceType] !== undefined) {
    return EVIDENCE_TYPE_BOOSTS[evidenceType];
  }
  // Fall back to title-based inference (conservative)
  if (titleHint) {
    const t = titleHint.toLowerCase();
    if (t.includes("meta-analysis") || t.includes("meta analysis")) return 4;
    if (t.includes("systematic review")) return 3;
    if (t.includes("position stand") || t.includes("consensus statement")) return 3;
    if (t.includes("randomized") || t.includes("randomised") || t.includes(" rct")) return 2;
    if (t.includes("cohort") || t.includes("review")) return 1;
  }
  return 0;
}

// ─── Topic Tag Extraction ─────────────────────────────────────────────────────
// Derive retrieval tags from user context without AI calls

function extractContextTags(params: ResearchRetrievalParams): string[] {
  const tags: string[] = [];
  const combined = [
    params.userMessage ?? "",
    params.goal ?? "",
    params.sport ?? "",
    params.injuries ?? "",
    params.population ?? "",
    params.trainingPhase ?? "",
  ]
    .join(" ")
    .toLowerCase();

  // Goal-based tags
  if (/hypertrophy|muscle|size|bulk|mass/.test(combined)) tags.push("hypertrophy");
  if (/strength|strong|power(?!lift)|force/.test(combined)) tags.push("strength_training");
  if (/powerlifting|squat|bench|deadlift/.test(combined)) tags.push("powerlifting");
  if (/fat.?loss|weight.?loss|cut|lean|body.?comp/.test(combined)) tags.push("body_composition");
  if (/endurance|cardio|aerobic|conditioning/.test(combined)) tags.push("endurance");

  // Strength-specific tags
  if (/\bstrength\b|stronger|max.?strength|heavy|compound.?lift|force.?production|strength.?phase|intensification/.test(combined)) tags.push("strength");
  if (/max.?strength|one.?rep.?max|1rm|heavy.?lift|near.?max/.test(combined)) tags.push("max_strength");
  if (/progressive.?overload|overload|progression/.test(combined)) tags.push("progressive_overload");
  if (/periodiz|training.?phase|block|mesocycle/.test(combined)) tags.push("periodization");
  if (/rest.?period|rest.?interval|between.?sets/.test(combined)) tags.push("rest_periods");
  if (/exercise.?selection|movement.?pattern|squat|deadlift|bench|press|pull.?up|row|carry/.test(combined)) tags.push("exercise_selection");
  if (/squat|deadlift|bench|press|pull.?up|row|carry|hinge|push|pull/.test(combined)) tags.push("movement_patterns");
  if (/beginner|novice|new.?to.?lift|starting|first.?program|motor.?learn/.test(combined)) tags.push("motor_learning");
  if (/athletic.?performance|sport.?performance|force.?production|power.?development/.test(combined)) tags.push("athletic_performance");
  if (/deload|deloading|recovery.?week/.test(combined)) tags.push("deload");
  if (/functional.?strength|functional|independence|daily.?life/.test(combined)) tags.push("functional_strength");
  if (/joint.?friendly|low.?impact|pain.?free|modification|modify/.test(combined)) tags.push("joint_friendly");
  if (/volume|weekly.?sets|hard.?sets/.test(combined)) tags.push("volume");
  if (/frequency|times.?per.?week|sessions.?per.?week/.test(combined)) tags.push("frequency");

  // Speed / Power / Sport performance
  if (/sprint|speed|acceleration|velocity|faster|quickness|first.?step|explosiveness/.test(combined)) tags.push("speed");
  if (/sprint|acceleration|velocity|sprint.?mechanic/.test(combined)) tags.push("sprint_mechanics");
  if (/plyometric|jump|explosive|reactive/.test(combined)) tags.push("plyometrics");
  // "explosive" / "power" also maps to speed-adjacent chunk tags used in sprint/power papers
  if (/explosive|power\b|plyometric|jump/.test(combined)) {
    tags.push("speed"); tags.push("speed training"); tags.push("sprint_performance");
    tags.push("force-velocity"); tags.push("athletic_performance"); tags.push("force_velocity");
  }
  if (/change.?of.?direction|agility|lateral|deceleration|cutting|cod\b/.test(combined)) tags.push("agility");
  if (/change.?of.?direction|deceleration|cod\b|cutting/.test(combined)) tags.push("change_of_direction");
  if (/sport|athletic|performance|football.?speed/.test(combined)) tags.push("sport_performance");
  if (/football/.test(combined)) tags.push("football");
  if (/force.?velocity|strength.?speed|speed.?strength|power.?development|explosive|plyometric/.test(combined)) tags.push("force_velocity");
  if (/max.?velocity|top.?speed|top.?end.?speed/.test(combined)) tags.push("max_velocity");

  // Programming
  if (/periodiz|block|linear|undulat|wave/.test(combined)) tags.push("periodization");
  if (/volume|frequency|intensity|load/.test(combined)) tags.push("volume_management");
  if (/concurrent|both.?strength.?and|strength.?and.?cardio|lifting.?and.?running|aerobic.?and.?lifting/.test(combined)) tags.push("concurrent_training");
  if (/concurrent|interference.?effect|cardio.?and.?strength|endurance.?and.?strength/.test(combined)) tags.push("interference_effect");
  if (/overload|progression|progressive/.test(combined)) tags.push("progressive_overload");

  // Hypertrophy
  if (/hypertrophy|muscle|size|bulk|mass|build.?muscle|grow.?muscle/.test(combined)) tags.push("hypertrophy");
  if (/hypertrophy|muscle.?growth|build.?muscle|gain.?muscle/.test(combined)) tags.push("muscle_growth");
  if (/rep.?range|how.?many.?reps|reps.?for.?muscle|sets.?and.?reps/.test(combined)) tags.push("rep_ranges");
  if (/training.?frequency|how.?often.?train|times.?per.?week|sessions.?per.?week/.test(combined)) tags.push("training_frequency");

  // Recovery & Wellness
  if (/recover|rest|sleep|fatigue|overtraining|deload/.test(combined)) tags.push("recovery");
  if (/fatigue|overtrain|burnout|worn.?out|tired|exhausted/.test(combined)) tags.push("fatigue_management");
  if (/sleep/.test(combined)) tags.push("sleep");
  if (/readiness|hrv|heart.?rate.?variab/.test(combined)) tags.push("load_management");
  if (/stress|life.?stress|work.?stress/.test(combined)) tags.push("load_management");

  // Nutrition
  if (/protein|amino/.test(combined)) tags.push("protein_intake");
  if (/creatine/.test(combined)) tags.push("creatine");
  if (/nutrition|diet|fuel|hydrat|eat/.test(combined)) tags.push("sports_nutrition");
  if (/calorie|energy balance/.test(combined)) tags.push("energy_balance");

  // Mobility / Movement Quality
  if (/mobility|flexibility|range.?of.?motion|stiffness|tightness|movement.?quality/.test(combined)) tags.push("mobility");
  if (/warm.?up|warmup|movement.?prep|dynamic.?warm|activation|movement.?prep/.test(combined)) tags.push("dynamic_warmup");
  if (/hip.?mobility|hip.?flexor|hip.?tightness|tight.?hip|hip.?stiffness/.test(combined)) tags.push("hip_mobility");
  if (/ankle.?mobility|ankle.?dorsiflexion|ankle.?stiffness|tight.?ankle|ankle.?tightness/.test(combined)) tags.push("ankle_mobility");
  if (/thoracic|t.?spine|upper.?back.?mob/.test(combined)) tags.push("thoracic_mobility");
  if (/shoulder.?mobility|shoulder.?stiffness|shoulder.?range/.test(combined)) tags.push("shoulder_mobility");
  if (/movement.?quality|movement.?prep|movement.?competency|movement.?pattern/.test(combined)) tags.push("movement_quality");
  if (/rotation|rotational/.test(combined)) tags.push("rotation");

  // Rehab / Pain
  if (/pain|hurt|injur|sore|ache/.test(combined)) tags.push("pain_modification");
  if (/return.?to|after.?injur|post.?op|rehabilit/.test(combined)) tags.push("return_to_training");
  if (/tendon|tendinopathy|tendinitis|achilles|patellar/.test(combined)) tags.push("tendon_health");
  if (/acl|knee.?ligament|anterior.?cruciate/.test(combined)) tags.push("acl_rehab");
  if (/knee/.test(combined)) tags.push("knee");
  if (/shoulder/.test(combined)) tags.push("shoulder");
  if (/back|spine/.test(combined)) tags.push("back");
  if (/hip/.test(combined)) { tags.push("hip"); tags.push("hip_mobility"); }
  if (/ankle/.test(combined)) tags.push("ankle_mobility");

  // Populations
  if (/youth|kid|teen|adolescent|young.?athlete/.test(combined)) tags.push("youth_athlete");
  if (/older|senior|aging|elderly/.test(combined)) tags.push("older_adult");
  if (/women|female/.test(combined)) tags.push("female_athlete");
  if (/beginner|novice|new.?to/.test(combined)) tags.push("beginner");

  // Sport-specific
  if (/football|soccer/.test(combined)) tags.push("soccer");
  if (/basketball/.test(combined)) tags.push("basketball");
  if (/baseball|softball/.test(combined)) tags.push("baseball");
  if (/track|run/.test(combined)) tags.push("track_field");
  if (/swim/.test(combined)) tags.push("swimming");
  if (/combat|mma|wrestling|judo|bjj/.test(combined)) tags.push("combat_sports");

  return [...new Set(tags)];
}

// ─── Core scoring function ────────────────────────────────────────────────────

function scoreChunk(
  chunk: { topicTags: string[]; category: string; trustLevel: string; chunkType: string },
  contextTags: string[],
  hasInjuries: boolean,
  population: string | null | undefined,
  warningFlags: string[] = [],
  docMeta: {
    evidenceType?: string | null;
    year?: number | null;
    isFoundational?: boolean | null;
    documentTitle?: string;
    documentId: number;
    chunkId?: number;
  },
): ScoreBreakdown {
  const chunkTags: string[] = Array.isArray(chunk.topicTags) ? chunk.topicTags : [];
  const overlap = chunkTags.filter((t) => contextTags.includes(t)).length;
  // Expert-consensus documents (curated seeds, weekly updates) get a reduced tag multiplier
  // so broad multi-tag arrays don't overwhelm peer-reviewed systematic reviews / meta-analyses.
  const isExpertConsensus = (docMeta as { evidenceType?: string | null }).evidenceType === "expert_consensus";
  const tagMultiplier = isExpertConsensus ? 2 : 3;
  const tagOverlap = overlap * tagMultiplier;

  // Trust level boost
  let trustBoost = 0;
  if (chunk.trustLevel === "gold") trustBoost = 2;
  else if (chunk.trustLevel === "high") trustBoost = 1;

  // Evidence-type boost (quality hierarchy)
  const isFoundational = docMeta?.isFoundational ?? false;
  const evidenceBoost = inferEvidenceBoost(docMeta?.evidenceType, docMeta?.documentTitle);

  // Freshness boost / penalty
  const freshnessBoost = getFreshnessBoost(docMeta?.year, isFoundational);

  // Injury-adjacent content boost
  let injuryBoost = 0;
  if (hasInjuries && ["medical_rehab", "recovery_wellness"].includes(chunk.category)) injuryBoost = 2;

  // Population match boost
  let populationBoost = 0;
  if (population) {
    const pop = population.toLowerCase();
    if (pop.includes("youth") && chunkTags.includes("youth_athlete")) populationBoost = 3;
    if (pop.includes("older") && chunkTags.includes("older_adult")) populationBoost = 3;
  }

  // Chunk-type boost — librarian-generated summaries preferred
  let chunkTypeBoost = 0;
  if (chunk.chunkType === "librarian") chunkTypeBoost = 2;
  else if (chunk.chunkType === "coaching_implications") chunkTypeBoost = 1;
  else if (chunk.chunkType === "programming_implications") chunkTypeBoost = 1;

  // Warning flag penalties
  let warningPenalty = 0;
  for (const flag of warningFlags) {
    warningPenalty += WARNING_FLAG_PENALTIES[flag] ?? 0;
  }

  const finalScore =
    tagOverlap + trustBoost + evidenceBoost + freshnessBoost +
    injuryBoost + populationBoost + chunkTypeBoost + warningPenalty;

  return {
    chunkId: docMeta.chunkId,
    documentId: docMeta.documentId,
    tagOverlap,
    trustBoost,
    evidenceBoost,
    freshnessBoost,
    chunkTypeBoost,
    injuryBoost,
    populationBoost,
    warningPenalty,
    diversityBonus: 0, // applied externally after candidate pool is known
    finalScore,
  };
}

// ─── Build caution note from warning flags ────────────────────────────────────

function buildCautionNote(warningFlags: string[]): string | null {
  if (!warningFlags || warningFlags.length === 0) return null;
  const notes = warningFlags
    .map((f) => WARNING_FLAG_CAUTION_TEXT[f])
    .filter(Boolean);
  if (notes.length === 0) return null;
  return `*⚠ Note: ${notes.join("; ")}.*`;
}

// ─── Category diversity bonus ─────────────────────────────────────────────────
//
// Complementary category pairs: when both sides are present in the candidate pool,
// all chunks whose category is part of a represented pair receive +1 as a
// tie-breaker. This does NOT override evidence quality — it only resolves
// equal-score situations in favour of broader multi-category context.

const COMPLEMENTARY_CATEGORY_PAIRS: [string, string][] = [
  ["strength_conditioning", "recovery_wellness"],
  ["medical_rehab", "strength_conditioning"],
  ["sport_performance", "recovery_wellness"],
  ["strength_conditioning", "sport_performance"],
  ["medical_rehab", "recovery_wellness"],
];

function computeDiversityBonus(category: string, allCategories: Set<string>): number {
  for (const [a, b] of COMPLEMENTARY_CATEGORY_PAIRS) {
    if (category === a && allCategories.has(b)) return 1;
    if (category === b && allCategories.has(a)) return 1;
  }
  return 0;
}

// ─── Post-ranking diversity filter ────────────────────────────────────────────
//
// Walks the ranked list (highest score first) and enforces a per-document cap.
// The strongest chunk from each document always survives; secondary chunks
// survive only within the cap. Continues until maxChunks slots are filled
// or the list is exhausted — guaranteeing multi-source context.

function applyDiversityFilter<T extends { chunk: { documentId: number } }>(
  ranked: T[],
  maxChunks: number,
  maxPerDoc = 2,
): T[] {
  const docCounts = new Map<number, number>();
  const selected: T[] = [];
  for (const item of ranked) {
    if (selected.length >= maxChunks) break;
    const docId = item.chunk.documentId;
    const count = docCounts.get(docId) ?? 0;
    if (count >= maxPerDoc) continue;
    docCounts.set(docId, count + 1);
    selected.push(item);
  }
  return selected;
}

// ─── Retrieval composition summary ────────────────────────────────────────────

function buildRetrievalComposition(
  selected: Array<{ chunk: { documentId: number; category: string } }>,
  docMap: Map<number, { evidenceType?: string | null }>,
): RetrievalComposition {
  const chunksPerDocument: Record<string, number> = {};
  for (const { chunk } of selected) {
    const key = String(chunk.documentId);
    chunksPerDocument[key] = (chunksPerDocument[key] ?? 0) + 1;
  }
  const categories = [...new Set(selected.map((s) => s.chunk.category).filter(Boolean))];
  const evidenceTypes = [
    ...new Set(
      selected
        .map((s) => docMap.get(s.chunk.documentId)?.evidenceType)
        .filter((e): e is string => Boolean(e)),
    ),
  ];
  return {
    uniqueDocuments: Object.keys(chunksPerDocument).length,
    chunksPerDocument,
    categories,
    evidenceTypes,
  };
}

// ─── Document query helper ────────────────────────────────────────────────────

async function fetchApprovedDocs() {
  return db
    .select({
      id: researchDocumentsTable.id,
      title: researchDocumentsTable.title,
      source: researchDocumentsTable.source,
      trustLevel: researchDocumentsTable.trustLevel,
      warningFlags: researchDocumentsTable.warningFlags,
      evidenceType: researchDocumentsTable.evidenceType,
      year: researchDocumentsTable.year,
      isFoundational: researchDocumentsTable.isFoundational,
    })
    .from(researchDocumentsTable)
    .where(
      and(
        eq(researchDocumentsTable.status, "approved"),
        eq(researchDocumentsTable.isActive, true),
        sql`${researchDocumentsTable.trustLevel} != 'reject'`,
        or(
          eq(researchDocumentsTable.librarianRecommendation, "approve"),
          eq(researchDocumentsTable.librarianRecommendation, "needs_review"),
        ),
      ),
    );
}

// ─── Main Retrieval Function ──────────────────────────────────────────────────
//
// Safety filter: only librarian-reviewed documents (recommendation = 'approve'
// or 'needs_review' + admin-approved status) are eligible for retrieval.
// Unreviewed documents (recommendation IS NULL) are never surfaced.

export async function getRelevantResearchContext(
  params: ResearchRetrievalParams,
): Promise<string> {
  const maxChunks = params.maxChunks ?? 5;

  try {
    const approvedDocs = await fetchApprovedDocs();
    if (approvedDocs.length === 0) return "";

    const approvedIds = approvedDocs.map((d) => d.id);
    const docMap = new Map(approvedDocs.map((d) => [d.id, d]));

    const chunks = await db
      .select()
      .from(researchChunksTable)
      .where(inArray(researchChunksTable.documentId, approvedIds));

    if (chunks.length === 0) return "";

    const contextTags = extractContextTags(params);
    if (contextTags.length === 0) return "";

    const hasInjuries = Boolean(params.injuries && params.injuries.trim().length > 0);

    const baseScored = chunks
      .map((chunk) => {
        const doc = docMap.get(chunk.documentId);
        const breakdown = scoreChunk(
          chunk,
          contextTags,
          hasInjuries,
          params.population,
          (doc?.warningFlags as string[]) ?? [],
          {
            documentId: chunk.documentId,
            chunkId: chunk.id,
            evidenceType: doc?.evidenceType ?? null,
            year: doc?.year ?? null,
            isFoundational: doc?.isFoundational ?? false,
            documentTitle: doc?.title,
          },
        );
        return { chunk, score: breakdown.finalScore };
      })
      // Phase 3: raised threshold from >0 to ≥2 to prevent weakly-matched chunks
      // from being injected into AI prompts (score=1 = single tag hit, low signal).
      .filter((s) => s.score >= 2);

    // Category diversity bonus: +1 tie-breaker when complementary categories are both present
    const candidateCategories = new Set(baseScored.map((s) => (s.chunk.category as string) ?? ""));
    const diversified = baseScored
      .map((s) => ({
        ...s,
        score: s.score + computeDiversityBonus(s.chunk.category as string, candidateCategories),
      }))
      .sort((a, b) => b.score - a.score);

    // Post-ranking diversity filter: max 2 chunks per document
    const scored = applyDiversityFilter(diversified, maxChunks);

    if (scored.length === 0) return "";

    const lines: string[] = ["\n## RESEARCH CONTEXT (Evidence-Informed Coaching Notes)"];
    lines.push(
      "The following evidence-based notes are retrieved from trusted sources to inform this response.",
      "Use these to improve programming quality. Do not cite unless the user asks for sources.",
      "Do not overstate certainty. Research informs — it does not override safety or user constraints.\n",
    );

    const seenDocIds = new Set<number>();

    for (const { chunk } of scored) {
      const doc = docMap.get(chunk.documentId);
      if (!doc) continue;

      const chunkTags: string[] = Array.isArray(chunk.topicTags) ? chunk.topicTags : [];
      const typeLabel =
        chunk.chunkType === "coaching_implications" ? "Coaching Implications"
        : chunk.chunkType === "programming_implications" ? "Programming Implications"
        : chunk.chunkType === "safety" ? "Safety Note"
        : chunk.chunkType === "limitations" ? "Evidence Limitations"
        : "Research Note";

      const docWarningFlags = (doc.warningFlags as string[]) ?? [];
      lines.push(`### [${typeLabel}] — ${doc.source} (${doc.trustLevel} trust)`);
      lines.push(chunk.chunkText);
      if (chunkTags.length > 0) {
        lines.push(`*Relevant for: ${chunkTags.slice(0, 4).join(", ")}*`);
      }
      const cautionNote = buildCautionNote(docWarningFlags);
      if (cautionNote) lines.push(cautionNote);
      lines.push("");

      seenDocIds.add(chunk.documentId);
    }

    const citedDocs = [...seenDocIds].map((id) => docMap.get(id)).filter(Boolean);
    if (citedDocs.length > 0) {
      lines.push(
        "<!-- RESEARCH_SOURCES: " +
          citedDocs.map((d) => `${d!.title} (${d!.source})`).join(" | ") +
          " -->",
      );
    }

    return lines.join("\n");
  } catch (err) {
    logger.warn({ err }, "[ResearchRetriever] Failed to retrieve research — skipping");
    return "";
  }
}

// ─── Rich Retrieval (text + structured chunks) ────────────────────────────────
// Use this when callers need both the injected prompt text AND the raw chunks
// (e.g. to pass into buildResearchProgrammingGuidance).

export interface ResearchContextWithChunks {
  text: string;
  chunks: RetrievedResearchChunk[];
}

export async function getRelevantResearchContextWithChunks(
  params: ResearchRetrievalParams,
): Promise<ResearchContextWithChunks> {
  const maxChunks = params.maxChunks ?? 5;

  try {
    const approvedDocs = await fetchApprovedDocs();
    if (approvedDocs.length === 0) return { text: "", chunks: [] };

    const approvedIds = approvedDocs.map((d) => d.id);
    const docMap = new Map(approvedDocs.map((d) => [d.id, d]));

    const rawChunks = await db
      .select()
      .from(researchChunksTable)
      .where(inArray(researchChunksTable.documentId, approvedIds));

    if (rawChunks.length === 0) return { text: "", chunks: [] };

    const contextTags = extractContextTags(params);
    if (contextTags.length === 0) return { text: "", chunks: [] };

    const hasInjuries = Boolean(params.injuries && params.injuries.trim().length > 0);

    const baseScored = rawChunks
      .map((chunk) => {
        const doc = docMap.get(chunk.documentId);
        const breakdown = scoreChunk(
          chunk,
          contextTags,
          hasInjuries,
          params.population,
          (doc?.warningFlags as string[]) ?? [],
          {
            documentId: chunk.documentId,
            chunkId: chunk.id,
            evidenceType: doc?.evidenceType ?? null,
            year: doc?.year ?? null,
            isFoundational: doc?.isFoundational ?? false,
            documentTitle: doc?.title,
          },
        );
        return { chunk, breakdown, score: breakdown.finalScore };
      })
      // Phase 3: raised threshold from >0 to ≥2 to prevent weakly-matched chunks
      // from being injected into AI prompts (score=1 = single tag hit, low signal).
      .filter((s) => s.score >= 2);

    // Category diversity bonus: +1 tie-breaker when complementary categories co-exist in pool
    const candidateCategories = new Set(baseScored.map((s) => (s.chunk.category as string) ?? ""));
    const diversified = baseScored
      .map((s) => {
        const bonus = computeDiversityBonus(s.chunk.category as string, candidateCategories);
        return { ...s, score: s.score + bonus, breakdown: { ...s.breakdown, diversityBonus: bonus } };
      })
      .sort((a, b) => b.score - a.score);

    // Post-ranking diversity filter: max 2 chunks per document
    const scored = applyDiversityFilter(diversified, maxChunks);

    if (scored.length === 0) return { text: "", chunks: [] };

    // Build structured chunk objects
    const retrievedChunks: RetrievedResearchChunk[] = scored.map(({ chunk }) => {
      const doc = docMap.get(chunk.documentId);
      return {
        documentId: chunk.documentId,
        documentTitle: doc?.title ?? "",
        documentSource: doc?.source ?? "",
        trustLevel: doc?.trustLevel ?? chunk.trustLevel ?? "medium",
        chunkText: chunk.chunkText,
        chunkType: chunk.chunkType,
        topicTags: Array.isArray(chunk.topicTags) ? chunk.topicTags : [],
        category: chunk.category ?? "",
        warningFlags: (doc?.warningFlags as string[]) ?? [],
      };
    });

    // Build the text block
    const lines: string[] = ["\n## RESEARCH CONTEXT (Evidence-Informed Coaching Notes)"];
    lines.push(
      "The following evidence-based notes are retrieved from trusted sources to inform this response.",
      "Use these to improve programming quality. Do not cite unless the user asks for sources.",
      "Do not overstate certainty. Research informs — it does not override safety or user constraints.\n",
    );

    const seenDocIds = new Set<number>();

    for (const chunk of retrievedChunks) {
      const chunkTags: string[] = chunk.topicTags;
      const typeLabel =
        chunk.chunkType === "coaching_implications" ? "Coaching Implications"
        : chunk.chunkType === "programming_implications" ? "Programming Implications"
        : chunk.chunkType === "safety" ? "Safety Note"
        : chunk.chunkType === "limitations" ? "Evidence Limitations"
        : "Research Note";

      lines.push(`### [${typeLabel}] — ${chunk.documentSource} (${chunk.trustLevel} trust)`);
      lines.push(chunk.chunkText);
      if (chunkTags.length > 0) {
        lines.push(`*Relevant for: ${chunkTags.slice(0, 4).join(", ")}*`);
      }
      const cautionNote = buildCautionNote(chunk.warningFlags);
      if (cautionNote) lines.push(cautionNote);
      lines.push("");
      seenDocIds.add(chunk.documentId);
    }

    const citedDocs = [...seenDocIds]
      .map((id) => docMap.get(id))
      .filter(Boolean);
    if (citedDocs.length > 0) {
      lines.push(
        "<!-- RESEARCH_SOURCES: " +
          citedDocs.map((d) => `${d!.title} (${d!.source})`).join(" | ") +
          " -->",
      );
    }

    const text = lines.join("\n");

    // ── Retrieval observability log ───────────────────────────────────────────
    // Full score breakdown per chunk + composition summary for diversity auditing.
    const composition = buildRetrievalComposition(scored, docMap);
    logger.info(
      {
        event: "research_retrieval_hit",
        userId: params.userId ?? null,
        conversationId: params.conversationId ?? null,
        queryPreview: params.userMessage?.slice(0, 100) ?? null,
        contextTags,
        chunksRetrieved: retrievedChunks.length,
        docIds: [...seenDocIds],
        // Diversity composition
        uniqueDocuments: composition.uniqueDocuments,
        chunksPerDocument: composition.chunksPerDocument,
        categorySpread: composition.categories,
        evidenceTypeSpread: composition.evidenceTypes,
        // Per-chunk score breakdown
        scoreBreakdowns: scored.map((s) => ({
          chunkId: s.breakdown.chunkId,
          documentId: s.breakdown.documentId,
          tagOverlap: s.breakdown.tagOverlap,
          trustBoost: s.breakdown.trustBoost,
          evidenceBoost: s.breakdown.evidenceBoost,
          freshnessBoost: s.breakdown.freshnessBoost,
          chunkTypeBoost: s.breakdown.chunkTypeBoost,
          injuryBoost: s.breakdown.injuryBoost,
          populationBoost: s.breakdown.populationBoost,
          warningPenalty: s.breakdown.warningPenalty,
          diversityBonus: s.breakdown.diversityBonus,
          finalScore: s.score,
        })),
        trustLevels: retrievedChunks.map((c) => c.trustLevel),
        warningFlagsPresent: retrievedChunks.flatMap((c) => c.warningFlags).filter(Boolean),
      },
      "[ResearchRetriever] Retrieval hit",
    );

    return { text, chunks: retrievedChunks };
  } catch (err) {
    logger.warn({ err }, "[ResearchRetriever] Failed to retrieve research (rich) — skipping");
    return { text: "", chunks: [] };
  }
}

// ─── Citation Extraction ──────────────────────────────────────────────────────
// Used when agent needs to surface sources to the user

export function extractResearchSourcesFromPrompt(systemPrompt: string): string[] {
  const match = systemPrompt.match(/<!-- RESEARCH_SOURCES: (.+?) -->/);
  if (!match) return [];
  return match[1].split(" | ").filter(Boolean);
}
