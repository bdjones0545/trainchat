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

// ─── research_discovery_runs ──────────────────────────────────────────────────
//
// Audit log for each automated or manual discovery pipeline run.

export const DISCOVERY_RUN_STATUS = ["running", "completed", "failed"] as const;
export type DiscoveryRunStatus = (typeof DISCOVERY_RUN_STATUS)[number];

export const researchDiscoveryRunsTable = pgTable("research_discovery_runs", {
  id: serial("id").primaryKey(),
  startedAt: timestamp("started_at", { withTimezone: true }).notNull().defaultNow(),
  completedAt: timestamp("completed_at", { withTimezone: true }),
  status: text("status", { enum: DISCOVERY_RUN_STATUS }).notNull().default("running"),
  source: text("source"),
  querySet: jsonb("query_set").$type<string[]>().notNull().default([]),
  candidatesFound: integer("candidates_found").notNull().default(0),
  candidatesStored: integer("candidates_stored").notNull().default(0),
  duplicatesSkipped: integer("duplicates_skipped").notNull().default(0),
  librarianReviewed: integer("librarian_reviewed").notNull().default(0),
  approvedSuggested: integer("approved_suggested").notNull().default(0),
  needsReview: integer("needs_review").notNull().default(0),
  rejected: integer("rejected").notNull().default(0),
  errors: jsonb("errors").$type<string[]>().notNull().default([]),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type ResearchDiscoveryRun = typeof researchDiscoveryRunsTable.$inferSelect;

// ─── research_paper_candidates ────────────────────────────────────────────────
//
// Papers discovered via automated pipeline, pending Librarian evaluation and
// admin approval. Never enters retrieval until admin approves.

export const CANDIDATE_STATUS = [
  "discovered",
  "librarian_reviewed",
  "pending_admin",
  "rejected",
  "approved",
] as const;
export type CandidateStatus = (typeof CANDIDATE_STATUS)[number];

export const researchPaperCandidatesTable = pgTable("research_paper_candidates", {
  id: serial("id").primaryKey(),

  // Bibliographic metadata
  title: text("title").notNull(),
  authors: text("authors"),
  year: integer("year"),
  journal: text("journal"),
  doi: text("doi"),
  pubmedId: text("pubmed_id"),
  semanticScholarId: text("semantic_scholar_id"),
  abstract: text("abstract"),
  sourceUrl: text("source_url"),
  sourceApi: text("source_api"),

  // Classification
  category: text("category", { enum: RESEARCH_CATEGORIES }).notNull(),
  discoveryQuery: text("discovery_query"),
  citationCount: integer("citation_count"),
  publicationTypes: jsonb("publication_types").$type<string[]>().notNull().default([]),

  // Lifecycle
  discoveredAt: timestamp("discovered_at", { withTimezone: true }).notNull().defaultNow(),
  status: text("status", { enum: CANDIDATE_STATUS }).notNull().default("discovered"),

  // Librarian review output
  librarianRecommendation: text("librarian_recommendation", {
    enum: ["approve", "reject", "needs_review"],
  }),
  trustLevel: text("trust_level", { enum: ["gold", "high", "supporting", "reject"] }),
  confidence: text("confidence", { enum: RESEARCH_CONFIDENCE }),
  warningFlags: jsonb("warning_flags").$type<string[]>(),
  librarianNotes: text("librarian_notes"),

  // Deduplication reference
  duplicateOfDocumentId: integer("duplicate_of_document_id"),

  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export type ResearchPaperCandidate = typeof researchPaperCandidatesTable.$inferSelect;

export const insertResearchPaperCandidateSchema = createInsertSchema(
  researchPaperCandidatesTable,
).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertResearchPaperCandidate = z.infer<typeof insertResearchPaperCandidateSchema>;
