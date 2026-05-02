import { pgTable, text, serial, timestamp, boolean, integer, jsonb } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

// ─── Evidence / Trust Constants ───────────────────────────────────────────────

export const RESEARCH_CATEGORIES = [
  "strength_conditioning",
  "medical_rehab",
  "nutrition",
  "recovery_wellness",
  "sport_performance",
] as const;
export type ResearchCategory = (typeof RESEARCH_CATEGORIES)[number];

export const TRUST_LEVELS = ["gold", "high", "supporting"] as const;
export type TrustLevel = (typeof TRUST_LEVELS)[number];

export const EVIDENCE_TYPES = [
  "meta_analysis",
  "systematic_review",
  "rct",
  "position_stand",
  "guideline",
  "prospective_study",
  "observational_study",
  "expert_consensus",
  "review",
  "case_study",
] as const;
export type EvidenceType = (typeof EVIDENCE_TYPES)[number];

export const RESEARCH_CONFIDENCE = ["strong", "moderate", "limited", "conflicting"] as const;
export type ResearchConfidence = (typeof RESEARCH_CONFIDENCE)[number];

export const DOCUMENT_STATUS = ["pending", "approved", "rejected", "archived"] as const;
export type DocumentStatus = (typeof DOCUMENT_STATUS)[number];

// ─── research_documents ───────────────────────────────────────────────────────
//
// Stores metadata and structured summaries for each ingested research source.
// Only "approved" documents are surfaced to the AI agent.

export const researchDocumentsTable = pgTable("research_documents", {
  id: serial("id").primaryKey(),

  // Bibliographic metadata
  title: text("title").notNull(),
  authors: text("authors"),
  year: integer("year"),
  source: text("source").notNull(),
  journal: text("journal"),
  url: text("url"),
  doi: text("doi"),

  // Classification
  category: text("category", { enum: RESEARCH_CATEGORIES }).notNull(),
  topicTags: jsonb("topic_tags").$type<string[]>().notNull().default([]),
  populationTags: jsonb("population_tags").$type<string[]>().notNull().default([]),
  evidenceType: text("evidence_type", { enum: EVIDENCE_TYPES }),
  trustLevel: text("trust_level", { enum: TRUST_LEVELS }).notNull().default("high"),
  confidence: text("confidence", { enum: RESEARCH_CONFIDENCE }).notNull().default("moderate"),

  // Content
  abstract: text("abstract"),
  plainLanguageSummary: text("plain_language_summary"),
  coachingImplications: text("coaching_implications"),
  programmingImplications: text("programming_implications"),
  safetyConsiderations: text("safety_considerations"),
  limitations: text("limitations"),
  contraindications: text("contraindications"),

  // Workflow
  status: text("status", { enum: DOCUMENT_STATUS }).notNull().default("pending"),
  isActive: boolean("is_active").notNull().default(false),

  // Research Librarian Agent output
  librarianRecommendation: text("librarian_recommendation", {
    enum: ["approve", "reject", "needs_review"],
  }),
  librarianAdminNotes: text("librarian_admin_notes"),
  warningFlags: jsonb("warning_flags").$type<string[]>(),

  // Timestamps
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  lastReviewedAt: timestamp("last_reviewed_at", { withTimezone: true }),
});

export const insertResearchDocumentSchema = createInsertSchema(researchDocumentsTable).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type InsertResearchDocument = z.infer<typeof insertResearchDocumentSchema>;
export type ResearchDocument = typeof researchDocumentsTable.$inferSelect;

// ─── research_chunks ──────────────────────────────────────────────────────────
//
// Each document is broken into retrievable chunks (summary, coaching implications,
// programming implications, safety notes). These are matched at retrieval time.
// The embedding field is reserved for future vector similarity search.

export const researchChunksTable = pgTable("research_chunks", {
  id: serial("id").primaryKey(),

  documentId: integer("document_id").notNull(),

  chunkText: text("chunk_text").notNull(),

  // Structured retrieval context
  topicTags: jsonb("topic_tags").$type<string[]>().notNull().default([]),
  category: text("category", { enum: RESEARCH_CATEGORIES }).notNull(),
  trustLevel: text("trust_level", { enum: TRUST_LEVELS }).notNull().default("high"),
  chunkType: text("chunk_type").notNull().default("summary"),

  // Reserved for future pgvector embedding
  embedding: jsonb("embedding").$type<number[] | null>().default(null),

  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertResearchChunkSchema = createInsertSchema(researchChunksTable).omit({
  id: true,
  createdAt: true,
});
export type InsertResearchChunk = z.infer<typeof insertResearchChunkSchema>;
export type ResearchChunk = typeof researchChunksTable.$inferSelect;
