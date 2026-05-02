// ─── Research Ingestion Service ───────────────────────────────────────────────
//
// Manages the lifecycle of research documents in the pipeline:
//   1. Create a document record (admin provides abstract/title/metadata)
//   2. AI-generate structured summaries (plain language, coaching implications, etc.)
//   3. Split document into retrievable chunks
//   4. Approve → activates for agent retrieval
//
// This service does NOT scrape the web. Admins provide abstracts + metadata.
// The AI then generates structured coaching-relevant summaries from the abstract.

import { db, researchDocumentsTable, researchChunksTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { logger } from "../lib/logger";
import type { InsertResearchDocument, ResearchDocument } from "@workspace/db";

// ─── Summarization ────────────────────────────────────────────────────────────

interface GeneratedSummary {
  plainLanguageSummary: string;
  coachingImplications: string;
  programmingImplications: string;
  safetyConsiderations: string;
  limitations: string;
  contraindications: string;
}

export async function generateDocumentSummary(doc: ResearchDocument): Promise<GeneratedSummary> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error("OPENAI_API_KEY not set — cannot generate research summary");
  }

  const sourceText = doc.abstract ?? doc.plainLanguageSummary ?? doc.title;

  const prompt = `You are an expert sports science synthesizer. A coach needs structured notes from the following research:

Title: ${doc.title}
Source: ${doc.source}${doc.journal ? ` / ${doc.journal}` : ""}
Year: ${doc.year ?? "Unknown"}
Category: ${doc.category}
Evidence Type: ${doc.evidenceType ?? "research"}
Topics: ${(doc.topicTags as string[]).join(", ")}
Abstract / Content:
${sourceText}

Generate structured coaching notes in this exact JSON format:
{
  "plainLanguageSummary": "2-3 sentence clear summary of what this research found/established",
  "coachingImplications": "Specific, actionable coaching implications. What does this mean for programming or coaching decisions?",
  "programmingImplications": "How might this influence volume, intensity, frequency, exercise selection, or progression?",
  "safetyConsiderations": "Any safety constraints, contraindicated populations, or risk considerations",
  "limitations": "What this evidence does NOT prove. Important caveats.",
  "contraindications": "Specific situations where this research should NOT be applied"
}

Rules:
- Use cautious, evidence-appropriate language (e.g., "suggests", "may support", "indicates")
- Do not overclaim. Single studies are supporting evidence, not absolute truth
- Never make medical diagnoses or treatment recommendations
- Keep each field to 2-4 sentences
- Focus on practical coaching application`;

  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: "gpt-4o-mini",
      messages: [{ role: "user", content: prompt }],
      response_format: { type: "json_object" },
      temperature: 0.3,
      max_tokens: 1000,
    }),
  });

  if (!response.ok) {
    throw new Error(`OpenAI API error: ${response.status}`);
  }

  const data = await response.json() as { choices: { message: { content: string } }[] };
  const raw = data.choices[0]?.message?.content ?? "{}";
  const parsed = JSON.parse(raw) as Partial<GeneratedSummary>;

  return {
    plainLanguageSummary: parsed.plainLanguageSummary ?? "",
    coachingImplications: parsed.coachingImplications ?? "",
    programmingImplications: parsed.programmingImplications ?? "",
    safetyConsiderations: parsed.safetyConsiderations ?? "",
    limitations: parsed.limitations ?? "",
    contraindications: parsed.contraindications ?? "",
  };
}

// ─── Chunk Creation ───────────────────────────────────────────────────────────

export async function createChunksForDocument(doc: ResearchDocument): Promise<number> {
  await db.delete(researchChunksTable).where(eq(researchChunksTable.documentId, doc.id));

  const topicTags = (doc.topicTags as string[]) ?? [];
  const category = doc.category;
  const trustLevel = doc.trustLevel;

  const chunksToInsert = [];

  if (doc.plainLanguageSummary?.trim()) {
    chunksToInsert.push({
      documentId: doc.id,
      chunkText: `${doc.title}: ${doc.plainLanguageSummary}`,
      topicTags,
      category,
      trustLevel,
      chunkType: "summary",
    });
  }

  if (doc.coachingImplications?.trim()) {
    chunksToInsert.push({
      documentId: doc.id,
      chunkText: doc.coachingImplications,
      topicTags,
      category,
      trustLevel,
      chunkType: "coaching_implications",
    });
  }

  if (doc.programmingImplications?.trim()) {
    chunksToInsert.push({
      documentId: doc.id,
      chunkText: doc.programmingImplications,
      topicTags,
      category,
      trustLevel,
      chunkType: "programming_implications",
    });
  }

  if (doc.safetyConsiderations?.trim()) {
    chunksToInsert.push({
      documentId: doc.id,
      chunkText: doc.safetyConsiderations,
      topicTags,
      category,
      trustLevel,
      chunkType: "safety",
    });
  }

  if (doc.limitations?.trim()) {
    chunksToInsert.push({
      documentId: doc.id,
      chunkText: doc.limitations,
      topicTags,
      category,
      trustLevel,
      chunkType: "limitations",
    });
  }

  if (chunksToInsert.length === 0) return 0;

  await db.insert(researchChunksTable).values(chunksToInsert);
  return chunksToInsert.length;
}

// ─── Summarize + Chunk Pipeline ───────────────────────────────────────────────

export async function summarizeAndChunkDocument(documentId: number): Promise<{
  ok: boolean;
  chunksCreated: number;
  error?: string;
}> {
  const [doc] = await db
    .select()
    .from(researchDocumentsTable)
    .where(eq(researchDocumentsTable.id, documentId));

  if (!doc) {
    return { ok: false, chunksCreated: 0, error: "Document not found" };
  }

  try {
    logger.info({ documentId }, "[ResearchIngestion] Generating AI summary");
    const summary = await generateDocumentSummary(doc);

    await db
      .update(researchDocumentsTable)
      .set({
        plainLanguageSummary: summary.plainLanguageSummary,
        coachingImplications: summary.coachingImplications,
        programmingImplications: summary.programmingImplications,
        safetyConsiderations: summary.safetyConsiderations,
        limitations: summary.limitations,
        contraindications: summary.contraindications,
        updatedAt: new Date(),
      })
      .where(eq(researchDocumentsTable.id, documentId));

    const updatedDoc = { ...doc, ...summary };
    const chunksCreated = await createChunksForDocument(updatedDoc as ResearchDocument);

    logger.info({ documentId, chunksCreated }, "[ResearchIngestion] Summarized and chunked");
    return { ok: true, chunksCreated };
  } catch (err: any) {
    logger.error({ err, documentId }, "[ResearchIngestion] Failed to summarize document");
    return { ok: false, chunksCreated: 0, error: err.message };
  }
}

// ─── Approve Document ─────────────────────────────────────────────────────────

export async function approveDocument(documentId: number): Promise<boolean> {
  const [doc] = await db
    .select()
    .from(researchDocumentsTable)
    .where(eq(researchDocumentsTable.id, documentId));

  if (!doc) return false;

  await db
    .update(researchDocumentsTable)
    .set({
      status: "approved",
      isActive: true,
      lastReviewedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(researchDocumentsTable.id, documentId));

  if (!doc.plainLanguageSummary) {
    await summarizeAndChunkDocument(documentId);
  } else {
    const updated = await db
      .select()
      .from(researchDocumentsTable)
      .where(eq(researchDocumentsTable.id, documentId));
    if (updated[0]) await createChunksForDocument(updated[0]);
  }

  return true;
}

// ─── Reject / Archive ─────────────────────────────────────────────────────────

export async function rejectDocument(documentId: number): Promise<boolean> {
  const result = await db
    .update(researchDocumentsTable)
    .set({ status: "rejected", isActive: false, updatedAt: new Date() })
    .where(eq(researchDocumentsTable.id, documentId))
    .returning({ id: researchDocumentsTable.id });
  return result.length > 0;
}

export async function toggleDocumentActive(documentId: number, isActive: boolean): Promise<boolean> {
  const result = await db
    .update(researchDocumentsTable)
    .set({ isActive, updatedAt: new Date() })
    .where(eq(researchDocumentsTable.id, documentId))
    .returning({ id: researchDocumentsTable.id });
  return result.length > 0;
}

// ─── Create Document ──────────────────────────────────────────────────────────

export async function createResearchDocument(
  data: InsertResearchDocument,
): Promise<ResearchDocument> {
  const [doc] = await db.insert(researchDocumentsTable).values(data).returning();
  return doc;
}
