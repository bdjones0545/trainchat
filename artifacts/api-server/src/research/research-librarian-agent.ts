// ─── Research Librarian Agent ─────────────────────────────────────────────────
//
// ┌─────────────────────────────────────────────────────────────────────────┐
// │  AGENT ROLE: Research Librarian                                         │
// │  Type: AI agent (own system prompt, separate from Coach Agent)          │
// │  Invoked by: Admin routes only (routes/admin.ts)                        │
// │  Orchestration: src/agents/agent-orchestrator.ts → LIBRARIAN_ADMIN      │
// │                                                                         │
// │  !! CRITICAL INVARIANT !!                                               │
// │  This agent is NEVER called during user chat sessions.                 │
// │  It is NEVER called from conversations.ts.                             │
// │  It is NEVER called from lib/ai.ts.                                    │
// │  Any invocation outside of admin routes is a critical architecture      │
// │  violation. See assertLibrarianIsAdminOnly() in agent-orchestrator.ts. │
// └─────────────────────────────────────────────────────────────────────────┘
//
// Internal-only AI agent that evaluates, summarizes, tags, and generates
// retrieval chunks for research documents. It is strictly separated from the
// user-facing Coach Agent — the coach only consumes approved documents.
//
// Flow:
//   Admin provides abstract + metadata
//   → Librarian Agent evaluates quality, confidence, evidence type
//   → Structured result written back to research_documents
//   → Admin makes final approve / reject decision
//   → Only approved docs enter agent retrieval

import { db, researchDocumentsTable, researchChunksTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { logger } from "../lib/logger";
import type { ResearchDocument } from "@workspace/db";
import {
  TRAINCHAT_SYSTEM_BRAIN_PROMPT,
  LIBRARIAN_HARD_LAWS_PROMPT_BLOCK,
  logSystemBrainAudit,
} from "../agents/trainchat-constitution";

// ─── Output Schema ────────────────────────────────────────────────────────────

export interface LibrarianRetrievalChunk {
  chunkText: string;
  topicTags: string[];
  populationTags: string[];
  confidence: string;
}

export interface ResearchLibrarianResult {
  recommendation: "approve" | "reject" | "needs_review";
  confidence: "strong" | "moderate" | "limited" | "conflicting";
  evidenceType:
    | "meta_analysis"
    | "systematic_review"
    | "position_stand"
    | "clinical_guideline"
    | "randomized_trial"
    | "observational"
    | "expert_consensus"
    | "textbook"
    | "unknown";
  trustLevel: "gold" | "high" | "supporting" | "reject";

  plainLanguageSummary: string;
  coachingImplications: string[];
  programmingImplications: string[];
  safetyConsiderations: string[];
  contraindications: string[];
  limitations: string[];
  whatThisDoesNotProve: string[];

  topicTags: string[];
  populationTags: string[];
  sportTags: string[];
  goalTags: string[];

  retrievalChunks: LibrarianRetrievalChunk[];

  adminNotes: string;
  warningFlags: string[];
  /**
   * Structured conflict profile for topics with mixed or contested evidence.
   * Populated whenever research findings are inconsistent across studies.
   * When hasConflict is true, the confidence field should reflect this
   * (typically "conflicting" or "limited").
   */
  evidenceConflictProfile?: {
    hasConflict: boolean;
    /** Plain-language description of what the studies disagree on */
    conflictSummary?: string;
    /** Conservative, defensible middle-ground coaching recommendation */
    practicalResolution?: string;
    /** How the conflict should affect the overall confidence rating */
    confidenceImpact?: "none" | "downgrade_to_moderate" | "downgrade_to_limited";
  };
}

// ─── Candidate Input (for pre-ingestion review) ───────────────────────────────

export interface ResearchCandidate {
  title: string;
  authors?: string;
  year?: number;
  source: string;
  journal?: string;
  url?: string;
  doi?: string;
  abstract?: string;
  category: string;
}

// ─── System Prompt ────────────────────────────────────────────────────────────

const LIBRARIAN_SYSTEM_PROMPT = `${TRAINCHAT_SYSTEM_BRAIN_PROMPT}

## INTERNAL IDENTITY — DR. SABLE
You are Dr. Sable — TrainChat's internal Research Librarian. You are the quality gate for all evidence that enters the TrainChat knowledge base. You are skeptical by design, conservative by principle, and methodical in execution.

Your standard: if a source would not be accepted in a peer-reviewed coaching journal, it does not belong in TrainChat's gold-standard context. You protect the integrity of the evidence layer.

## PREMIUM RESEARCH SKILLS

**1. Evidence Quality Evaluation**
Prefer meta-analyses, systematic reviews, position stands, consensus guidelines, and strong peer-reviewed work. Single studies are treated as limited evidence only. Actively identify what the research supports AND what it does not prove.

**2. Conflict Detection**
When evidence is mixed or contested, identify the conflict explicitly. Lower confidence to "conflicting" or "limited" when appropriate. Prefer conservative, practical middle-ground recommendations over false certainty.

**3. Practical Translation**
Convert research findings into coaching implications, programming implications, safety notes, and limitations. Every approved chunk should make a downstream coaching AI smarter about a real programming decision.

**4. Contextual Application**
Explain when evidence applies differently by population, training age, goal, sport, or limitation. The same study may support different conclusions in different contexts — flag this explicitly.

**5. Retrieval Chunk Crafting**
Create concise, high-signal chunks that directly help programming decisions. Each chunk should be immediately usable without additional interpretation.

**6. Claim Discipline**
Actively distinguish what "supports," "suggests," and "does not prove." Avoid overclaiming. Use the weakest accurate language: "suggests," "may support," "preliminary evidence indicates," "consistent with." The claim ceiling is set by the evidence quality — never exceed it.

---

${LIBRARIAN_HARD_LAWS_PROMPT_BLOCK}

---

You are TrainChat's internal Research Librarian Agent.

Your job is to evaluate and transform research into safe, practical, evidence-informed coaching knowledge. You work exclusively for the internal admin team — your output never reaches users directly.

EVALUATION STANDARDS:
- Prefer systematic reviews, meta-analyses, position stands, consensus guidelines, and high-quality peer-reviewed research.
- Treat single studies as limited evidence only.
- Identify precisely what the research supports AND what it does NOT prove.
- Translate findings into practical programming implications.
- Flag any contraindications or safety concerns.
- Be skeptical of industry-funded research, small samples, and short-duration studies.

CONFIDENCE LEVELS:
- strong: Multiple high-quality studies, meta-analyses, or official position stands with consistent findings
- moderate: Good-quality evidence with some limitations or mixed results
- limited: Single studies, small samples, or preliminary findings
- conflicting: Studies exist on both sides without clear consensus

EVIDENCE TYPES (map to nearest):
meta_analysis | systematic_review | position_stand | clinical_guideline | randomized_trial | observational | expert_consensus | textbook | unknown

TRUST LEVELS:
- gold: Meta-analyses, systematic reviews, position stands from major sports science bodies (ACSM, NSCA, etc.)
- high: Well-designed RCTs, prospective studies, clinical guidelines
- supporting: Observational studies, expert consensus, textbook references
- reject: Influencer content, SEO blogs, Reddit, unsourced claims, supplement marketing

WARNING FLAGS (include any that apply):
old_evidence | single_study | population_mismatch | overclaim_risk | medical_claim_risk | supplement_claim_risk | low_quality_source | conflicting_evidence | no_abstract | unknown_source

HARD REJECT RULES (set recommendation to "reject" if any apply):
- Source is clearly an SEO blog, influencer content, Reddit, or social media
- Makes medical treatment claims without clinical guideline basis
- Makes supplement efficacy claims without strong RCT support
- Has no abstract, title, or usable summary
- Cannot identify any evidence type
- Source is completely unknown or cannot be verified as legitimate

EVIDENCE CONFLICT HANDLING:
When research evidence is mixed or contested, you MUST handle it honestly:
- Acknowledge the conflict explicitly — do not manufacture false certainty
- Prefer conservative, practical middle-ground recommendations
- Single studies do NOT override meta-analyses, position stands, or clinical guidelines
- Conflicting evidence MUST lower confidence to "conflicting" or "limited"
- Never overstate conclusions when evidence is divided
- Context and population determine application — the same evidence may support different conclusions

Include "evidenceConflictProfile" in your output when:
- You detect disagreement between the source and established guidelines or meta-analyses
- The topic has known mixed evidence (e.g. stretching and injury prevention, certain recovery methods, supplement claims)
- The source itself acknowledges significant limitations or opposing findings

"confidenceImpact" values for evidenceConflictProfile:
- "none": Evidence is consistent with established consensus — no confidence penalty
- "downgrade_to_moderate": Some conflicting evidence but majority supports the finding
- "downgrade_to_limited": Evidence is significantly mixed — use cautious language throughout

SKILL APPLICATION RULES:
- Preserve safety by never making medical diagnosis or treatment claims
- Assign confidence only to the degree the evidence supports — use cautious language throughout: "suggests", "may support", "indicates", "preliminary evidence"
- Research informs coaching decisions; it does not override pain, injury, or safety constraints
- All evaluations are pending admin review — your recommendation guides, it does not finalize
- Keep coaching implications practical and specific — immediately applicable to a training context
- Retrieval chunks must be concise, practical, and immediately useful for a coaching AI

OUTPUT: Respond with valid JSON matching the exact schema provided. Do not add any text outside the JSON object.`;

// ─── Helpers ─────────────────────────────────────────────────────────────────

function buildAnalysisPrompt(doc: ResearchDocument | ResearchCandidate): string {
  const title = doc.title;
  const authors = "authors" in doc ? doc.authors : null;
  const year = "year" in doc ? doc.year : null;
  const source = doc.source;
  const journal = "journal" in doc ? doc.journal : null;
  const category = doc.category;
  const abstract = "abstract" in doc ? doc.abstract : null;
  const existingSummary = "plainLanguageSummary" in doc ? doc.plainLanguageSummary : null;

  const content = abstract ?? existingSummary ?? "(no abstract provided)";

  return `Evaluate this research document and return a structured analysis:

Title: ${title}
Authors: ${authors ?? "Unknown"}
Year: ${year ?? "Unknown"}
Source: ${source}${journal ? ` / ${journal}` : ""}
Category: ${category}
Content / Abstract:
${content}

Return a single JSON object with this exact structure:
{
  "recommendation": "approve" | "reject" | "needs_review",
  "confidence": "strong" | "moderate" | "limited" | "conflicting",
  "evidenceType": "meta_analysis" | "systematic_review" | "position_stand" | "clinical_guideline" | "randomized_trial" | "observational" | "expert_consensus" | "textbook" | "unknown",
  "trustLevel": "gold" | "high" | "supporting" | "reject",
  "plainLanguageSummary": "2-3 sentence plain-language summary of findings",
  "coachingImplications": ["implication 1", "implication 2"],
  "programmingImplications": ["implication 1", "implication 2"],
  "safetyConsiderations": ["consideration 1"],
  "contraindications": ["contraindication 1"],
  "limitations": ["limitation 1", "limitation 2"],
  "whatThisDoesNotProve": ["point 1", "point 2"],
  "topicTags": ["tag1", "tag2"],
  "populationTags": ["general_adults", "athletes"],
  "sportTags": ["strength", "endurance"],
  "goalTags": ["hypertrophy", "fat_loss"],
  "retrievalChunks": [
    {
      "chunkText": "Concise, practical coaching insight that stands alone without context",
      "topicTags": ["tag1"],
      "populationTags": ["general_adults"],
      "confidence": "moderate"
    }
  ],
  "adminNotes": "Brief notes for the admin reviewer about this document's quality or concerns",
  "warningFlags": ["single_study", "old_evidence"],
  "evidenceConflictProfile": {
    "hasConflict": false,
    "conflictSummary": "Optional — describe what the studies disagree on",
    "practicalResolution": "Optional — conservative, defensible middle-ground recommendation",
    "confidenceImpact": "none | downgrade_to_moderate | downgrade_to_limited"
  }
}

Generate 3–8 retrieval chunks. Each chunk must be standalone, practical, and directly useful for a coaching AI retrieving evidence during a session.`;
}

function mapEvidenceType(
  raw: string,
): "meta_analysis" | "systematic_review" | "position_stand" | "guideline" | "rct" | "observational_study" | "expert_consensus" | "review" | "prospective_study" | undefined {
  const map: Record<string, any> = {
    meta_analysis: "meta_analysis",
    systematic_review: "systematic_review",
    position_stand: "position_stand",
    clinical_guideline: "guideline",
    randomized_trial: "rct",
    observational: "observational_study",
    expert_consensus: "expert_consensus",
    textbook: "review",
    unknown: undefined,
  };
  return map[raw] ?? undefined;
}

function mapTrustLevel(raw: string): "gold" | "high" | "supporting" {
  if (raw === "gold") return "gold";
  if (raw === "high") return "high";
  return "supporting";
}

function safeJoin(arr: unknown): string {
  if (Array.isArray(arr)) return arr.filter((x) => typeof x === "string").join(". ");
  if (typeof arr === "string") return arr;
  return "";
}

// ─── Soft quality pre-filter ──────────────────────────────────────────────────

const LOW_QUALITY_PATTERNS = [
  /reddit\.com/i,
  /instagram\.com/i,
  /tiktok\.com/i,
  /youtube\.com/i,
  /pinterest\.com/i,
  /bodybuilding\.com\/articles/i,
  /menshealth\.com/i,
  /muscleandfitness\.com/i,
  /supplementreview/i,
];

function detectPrefilterFlags(doc: ResearchDocument | ResearchCandidate): string[] {
  const flags: string[] = [];
  const url = "url" in doc ? (doc.url ?? "") : "";
  const source = doc.source ?? "";

  if (LOW_QUALITY_PATTERNS.some((p) => p.test(url) || p.test(source))) {
    flags.push("low_quality_source");
  }

  const abstract = "abstract" in doc ? doc.abstract : null;
  const summary = "plainLanguageSummary" in doc ? (doc as any).plainLanguageSummary : null;
  if (!abstract && !summary) {
    flags.push("no_abstract");
  }

  if (!doc.source || doc.source.trim().length < 3) {
    flags.push("unknown_source");
  }

  const year = "year" in doc ? doc.year : null;
  if (year && year < 2000 && !("position_stand" as string).includes("position")) {
    flags.push("old_evidence");
  }

  return flags;
}

// ─── Core Agent Call ──────────────────────────────────────────────────────────

async function callLibrarianAgent(
  doc: ResearchDocument | ResearchCandidate,
): Promise<{ result: ResearchLibrarianResult; parseOk: boolean }> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error("OPENAI_API_KEY not set");

  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: "gpt-4o-mini",
      messages: [
        { role: "system", content: LIBRARIAN_SYSTEM_PROMPT },
        { role: "user", content: buildAnalysisPrompt(doc) },
      ],
      response_format: { type: "json_object" },
      temperature: 0.2,
      max_tokens: 2500,
    }),
  });

  if (!response.ok) {
    throw new Error(`OpenAI API error: ${response.status} ${response.statusText}`);
  }

  const data = (await response.json()) as { choices: { message: { content: string } }[] };
  const raw = data.choices[0]?.message?.content ?? "{}";

  try {
    const parsed = JSON.parse(raw) as Partial<ResearchLibrarianResult>;
    const preflags = detectPrefilterFlags(doc);

    const result: ResearchLibrarianResult = {
      recommendation: (["approve", "reject", "needs_review"].includes(parsed.recommendation ?? "")
        ? parsed.recommendation
        : "needs_review") as ResearchLibrarianResult["recommendation"],
      confidence: (["strong", "moderate", "limited", "conflicting"].includes(parsed.confidence ?? "")
        ? parsed.confidence
        : "limited") as ResearchLibrarianResult["confidence"],
      evidenceType: parsed.evidenceType ?? "unknown",
      trustLevel: (["gold", "high", "supporting", "reject"].includes(parsed.trustLevel ?? "")
        ? parsed.trustLevel
        : "supporting") as ResearchLibrarianResult["trustLevel"],

      plainLanguageSummary: parsed.plainLanguageSummary ?? "",
      coachingImplications: Array.isArray(parsed.coachingImplications) ? parsed.coachingImplications : [],
      programmingImplications: Array.isArray(parsed.programmingImplications) ? parsed.programmingImplications : [],
      safetyConsiderations: Array.isArray(parsed.safetyConsiderations) ? parsed.safetyConsiderations : [],
      contraindications: Array.isArray(parsed.contraindications) ? parsed.contraindications : [],
      limitations: Array.isArray(parsed.limitations) ? parsed.limitations : [],
      whatThisDoesNotProve: Array.isArray(parsed.whatThisDoesNotProve) ? parsed.whatThisDoesNotProve : [],

      topicTags: Array.isArray(parsed.topicTags) ? parsed.topicTags : [],
      populationTags: Array.isArray(parsed.populationTags) ? parsed.populationTags : [],
      sportTags: Array.isArray(parsed.sportTags) ? parsed.sportTags : [],
      goalTags: Array.isArray(parsed.goalTags) ? parsed.goalTags : [],

      retrievalChunks: Array.isArray(parsed.retrievalChunks) ? parsed.retrievalChunks.slice(0, 8) : [],

      adminNotes: parsed.adminNotes ?? "",
      warningFlags: [...new Set([...(Array.isArray(parsed.warningFlags) ? parsed.warningFlags : []), ...preflags])],
    };

    if (preflags.includes("low_quality_source")) {
      result.recommendation = "reject";
    }

    return { result, parseOk: true };
  } catch {
    const preflags = detectPrefilterFlags(doc);
    return {
      result: {
        recommendation: "needs_review",
        confidence: "limited",
        evidenceType: "unknown",
        trustLevel: "supporting",
        plainLanguageSummary: "",
        coachingImplications: [],
        programmingImplications: [],
        safetyConsiderations: [],
        contraindications: [],
        limitations: [],
        whatThisDoesNotProve: [],
        topicTags: [],
        populationTags: [],
        sportTags: [],
        goalTags: [],
        retrievalChunks: [],
        adminNotes: `JSON parse failed. Raw output saved. Raw: ${raw.substring(0, 500)}`,
        warningFlags: preflags,
      },
      parseOk: false,
    };
  }
}

// ─── Service: analyzeResearchDocument ────────────────────────────────────────

export async function analyzeResearchDocument(documentId: number): Promise<{
  ok: boolean;
  result?: ResearchLibrarianResult;
  chunksCreated?: number;
  error?: string;
}> {
  const [doc] = await db
    .select()
    .from(researchDocumentsTable)
    .where(eq(researchDocumentsTable.id, documentId));

  if (!doc) return { ok: false, error: "Document not found" };

  logger.info({ documentId }, "[Librarian] Starting analysis");

  try {
    const { result, parseOk } = await callLibrarianAgent(doc);

    const dbEvidenceType = mapEvidenceType(result.evidenceType);
    const dbTrustLevel = mapTrustLevel(result.trustLevel);

    const allLimitations = [...result.limitations, ...result.whatThisDoesNotProve];

    await db
      .update(researchDocumentsTable)
      .set({
        plainLanguageSummary: result.plainLanguageSummary || doc.plainLanguageSummary,
        coachingImplications: safeJoin(result.coachingImplications) || doc.coachingImplications,
        programmingImplications: safeJoin(result.programmingImplications) || doc.programmingImplications,
        safetyConsiderations: safeJoin(result.safetyConsiderations) || doc.safetyConsiderations,
        contraindications: safeJoin(result.contraindications) || doc.contraindications,
        limitations: safeJoin(allLimitations) || doc.limitations,
        confidence: result.confidence,
        evidenceType: dbEvidenceType ?? doc.evidenceType ?? undefined,
        trustLevel: dbTrustLevel,
        topicTags: result.topicTags.length ? result.topicTags : (doc.topicTags as string[]),
        populationTags: result.populationTags.length ? result.populationTags : (doc.populationTags as string[]),
        librarianRecommendation: result.recommendation,
        librarianAdminNotes: result.adminNotes,
        warningFlags: result.warningFlags,
        lastReviewedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(researchDocumentsTable.id, documentId));

    let chunksCreated = 0;
    if (parseOk && result.retrievalChunks.length > 0) {
      chunksCreated = await saveLibrarianChunks(documentId, result, doc);
    }

    logger.info({ documentId, recommendation: result.recommendation, chunksCreated }, "[Librarian] Analysis complete");
    return { ok: true, result, chunksCreated };
  } catch (err: any) {
    logger.error({ err, documentId }, "[Librarian] Analysis failed");
    return { ok: false, error: err.message };
  }
}

// ─── Service: reviewResearchCandidate ────────────────────────────────────────

export async function reviewResearchCandidate(candidate: ResearchCandidate): Promise<{
  ok: boolean;
  result?: ResearchLibrarianResult;
  error?: string;
}> {
  logger.info({ title: candidate.title }, "[Librarian] Reviewing candidate");

  try {
    const { result } = await callLibrarianAgent(candidate);
    return { ok: true, result };
  } catch (err: any) {
    logger.error({ err }, "[Librarian] Candidate review failed");
    return { ok: false, error: err.message };
  }
}

// ─── Service: generateResearchChunks ─────────────────────────────────────────

export async function generateResearchChunks(documentId: number): Promise<{
  ok: boolean;
  chunksCreated?: number;
  error?: string;
}> {
  const [doc] = await db
    .select()
    .from(researchDocumentsTable)
    .where(eq(researchDocumentsTable.id, documentId));

  if (!doc) return { ok: false, error: "Document not found" };

  logger.info({ documentId }, "[Librarian] Regenerating chunks");

  try {
    const { result, parseOk } = await callLibrarianAgent(doc);

    if (!parseOk || result.retrievalChunks.length === 0) {
      return { ok: false, error: "Agent returned no valid chunks" };
    }

    const chunksCreated = await saveLibrarianChunks(documentId, result, doc);
    return { ok: true, chunksCreated };
  } catch (err: any) {
    logger.error({ err, documentId }, "[Librarian] Chunk generation failed");
    return { ok: false, error: err.message };
  }
}

// ─── Service: batchAnalyzeDocuments ──────────────────────────────────────────

export async function batchAnalyzeDocuments(documentIds: number[]): Promise<{
  results: { id: number; ok: boolean; recommendation?: string; error?: string }[];
}> {
  const MAX_BATCH = 10;
  const ids = documentIds.slice(0, MAX_BATCH);

  logger.info({ count: ids.length }, "[Librarian] Starting batch analysis");

  const results = [];
  for (const id of ids) {
    const outcome = await analyzeResearchDocument(id);
    results.push({
      id,
      ok: outcome.ok,
      recommendation: outcome.result?.recommendation,
      error: outcome.error,
    });
  }

  return { results };
}

// ─── Internal: save librarian chunks ─────────────────────────────────────────

async function saveLibrarianChunks(
  documentId: number,
  result: ResearchLibrarianResult,
  doc: ResearchDocument,
): Promise<number> {
  await db.delete(researchChunksTable).where(eq(researchChunksTable.documentId, documentId));

  const trustLevel = mapTrustLevel(result.trustLevel);
  const category = doc.category;

  const rows = result.retrievalChunks
    .filter((c) => c.chunkText?.trim())
    .map((chunk) => ({
      documentId,
      chunkText: chunk.chunkText,
      topicTags: chunk.topicTags?.length ? chunk.topicTags : result.topicTags,
      category,
      trustLevel,
      chunkType: "librarian",
    }));

  if (rows.length === 0) return 0;

  await db.insert(researchChunksTable).values(rows);
  return rows.length;
}
