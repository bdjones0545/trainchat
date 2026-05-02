// ─── Research Retriever ───────────────────────────────────────────────────────
//
// Retrieves relevant research chunks from the database based on user context.
// Uses keyword/tag-based scoring (no vector DB required).
// Only approved, active documents are included.
//
// Called inside buildSystemPrompt to inject evidence-informed context.

import { db, researchDocumentsTable, researchChunksTable } from "@workspace/db";
import { eq, and, inArray, sql } from "drizzle-orm";
import { logger } from "../lib/logger";

export interface ResearchRetrievalParams {
  userMessage?: string;
  goal?: string | null;
  sport?: string | null;
  injuries?: string | null;
  population?: string | null;
  trainingPhase?: string | null;
  maxChunks?: number;
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
}

export interface ResearchContext {
  chunks: RetrievedResearchChunk[];
  sourceLabels: string[];
  hasContent: boolean;
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

  // Speed / Power / Sport performance (expanded)
  if (/sprint|speed|acceleration|velocity|faster|quickness|first.?step|explosiveness/.test(combined)) tags.push("speed");
  if (/sprint|acceleration|velocity|sprint.?mechanic/.test(combined)) tags.push("sprint_mechanics");
  if (/plyometric|jump|explosive|reactive/.test(combined)) tags.push("plyometrics");
  if (/change.?of.?direction|agility|lateral|deceleration|cutting|cod\b/.test(combined)) tags.push("agility");
  if (/change.?of.?direction|deceleration|cod\b|cutting/.test(combined)) tags.push("change_of_direction");
  if (/sport|athletic|performance|football.?speed/.test(combined)) tags.push("sport_performance");
  if (/football/.test(combined)) tags.push("football");
  if (/force.?velocity|strength.?speed|speed.?strength|power.?development/.test(combined)) tags.push("force_velocity");
  if (/max.?velocity|top.?speed|top.?end.?speed/.test(combined)) tags.push("max_velocity");

  // Programming
  if (/periodiz|block|linear|undulat|wave/.test(combined)) tags.push("periodization");
  if (/volume|frequency|intensity|load/.test(combined)) tags.push("volume_management");
  if (/concurrent|aerobic|lifting together/.test(combined)) tags.push("concurrent_training");
  if (/overload|progression|progressive/.test(combined)) tags.push("progressive_overload");

  // Recovery & Wellness
  if (/recover|rest|sleep|fatigue|overtraining|deload/.test(combined)) tags.push("recovery");
  if (/sleep/.test(combined)) tags.push("sleep");
  if (/readiness|hrv|stress/.test(combined)) tags.push("load_management");

  // Nutrition
  if (/protein|amino/.test(combined)) tags.push("protein_intake");
  if (/creatine/.test(combined)) tags.push("creatine");
  if (/nutrition|diet|fuel|hydrat|eat/.test(combined)) tags.push("sports_nutrition");
  if (/calorie|energy balance/.test(combined)) tags.push("energy_balance");

  // Mobility / Movement Quality (expanded)
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

// ─── Scoring ──────────────────────────────────────────────────────────────────

function scoreChunk(
  chunk: { topicTags: string[]; category: string; trustLevel: string; chunkType: string },
  contextTags: string[],
  hasInjuries: boolean,
  population: string | null | undefined,
): number {
  let score = 0;

  const chunkTags: string[] = Array.isArray(chunk.topicTags) ? chunk.topicTags : [];
  const overlap = chunkTags.filter((t) => contextTags.includes(t)).length;
  score += overlap * 3;

  // Trust level boost
  if (chunk.trustLevel === "gold") score += 2;
  if (chunk.trustLevel === "high") score += 1;

  // Injury-adjacent content boost
  if (hasInjuries && ["medical_rehab", "recovery_wellness"].includes(chunk.category)) score += 2;

  // Population match boost
  if (population) {
    const pop = population.toLowerCase();
    if (pop.includes("youth") && chunkTags.includes("youth_athlete")) score += 3;
    if (pop.includes("older") && chunkTags.includes("older_adult")) score += 3;
  }

  // Prefer high-signal chunk types
  // "librarian" chunks are generated by the Research Librarian Agent — highest priority
  if (chunk.chunkType === "librarian") score += 2;
  if (chunk.chunkType === "coaching_implications") score += 1;
  if (chunk.chunkType === "programming_implications") score += 1;

  return score;
}

// ─── Main Retrieval Function ──────────────────────────────────────────────────

export async function getRelevantResearchContext(
  params: ResearchRetrievalParams,
): Promise<string> {
  const maxChunks = params.maxChunks ?? 5;

  try {
    // Fetch all approved, active, non-rejected document IDs
    // trustLevel "reject" is a defensive guard — documents with reject trust are excluded
    // regardless of approval status. Librarian Agent owns all trust classification.
    const approvedDocs = await db
      .select({ id: researchDocumentsTable.id, title: researchDocumentsTable.title, source: researchDocumentsTable.source, trustLevel: researchDocumentsTable.trustLevel })
      .from(researchDocumentsTable)
      .where(
        and(
          eq(researchDocumentsTable.status, "approved"),
          eq(researchDocumentsTable.isActive, true),
          sql`${researchDocumentsTable.trustLevel} != 'reject'`,
        ),
      );

    if (approvedDocs.length === 0) return "";

    const approvedIds = approvedDocs.map((d) => d.id);
    const docMap = new Map(approvedDocs.map((d) => [d.id, d]));

    // Fetch chunks for approved documents
    const chunks = await db
      .select()
      .from(researchChunksTable)
      .where(inArray(researchChunksTable.documentId, approvedIds));

    if (chunks.length === 0) return "";

    const contextTags = extractContextTags(params);
    if (contextTags.length === 0) return "";

    const hasInjuries = Boolean(params.injuries && params.injuries.trim().length > 0);

    // Score and rank chunks
    const scored = chunks
      .map((chunk) => ({
        chunk,
        score: scoreChunk(chunk, contextTags, hasInjuries, params.population),
      }))
      .filter((s) => s.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, maxChunks);

    if (scored.length === 0) return "";

    // Build output
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

      lines.push(`### [${typeLabel}] — ${doc.source} (${doc.trustLevel} trust)`);
      lines.push(chunk.chunkText);
      if (chunkTags.length > 0) {
        lines.push(`*Relevant for: ${chunkTags.slice(0, 4).join(", ")}*`);
      }
      lines.push("");

      seenDocIds.add(chunk.documentId);
    }

    // Citation footer (hidden by default, shown when user asks for sources)
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
    const approvedDocs = await db
      .select({ id: researchDocumentsTable.id, title: researchDocumentsTable.title, source: researchDocumentsTable.source, trustLevel: researchDocumentsTable.trustLevel })
      .from(researchDocumentsTable)
      .where(
        and(
          eq(researchDocumentsTable.status, "approved"),
          eq(researchDocumentsTable.isActive, true),
          sql`${researchDocumentsTable.trustLevel} != 'reject'`,
        ),
      );

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

    const scored = rawChunks
      .map((chunk) => ({
        chunk,
        score: scoreChunk(chunk, contextTags, hasInjuries, params.population),
      }))
      .filter((s) => s.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, maxChunks);

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
      };
    });

    // Build the text block (same logic as getRelevantResearchContext)
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

    return { text: lines.join("\n"), chunks: retrievedChunks };
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
