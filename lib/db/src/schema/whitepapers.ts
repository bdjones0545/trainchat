import {
  pgTable,
  text,
  serial,
  integer,
  timestamp,
  jsonb,
  boolean,
} from "drizzle-orm/pg-core";

// ─── Status Enums ─────────────────────────────────────────────────────────────

export const WHITEPAPER_TOPIC_STATUSES = [
  "queued",
  "drafting",
  "needs_review",
  "approved",
  "published",
  "rejected",
] as const;
export type WhitepaperTopicStatus = (typeof WHITEPAPER_TOPIC_STATUSES)[number];

export const WHITEPAPER_PUB_STATUSES = [
  "needs_review",
  "approved",
  "published",
  "rejected",
] as const;
export type WhitepaperPubStatus = (typeof WHITEPAPER_PUB_STATUSES)[number];

// ─── Shared JSON Types ─────────────────────────────────────────────────────────

export interface WhitepaperSection {
  number: string;
  heading: string;
  content: string[];
  pullQuote?: string;
}

export interface WhitepaperCitationBlock {
  formatted: string;
  related: string[];
  framework?: string[];
  canonicalUrl: string;
}

export interface WhitepaperSeoMetadata {
  metaTitle: string;
  metaDescription: string;
  ogTitle: string;
  ogDescription: string;
}

// ─── Topic Queue ───────────────────────────────────────────────────────────────
//
// Each row represents one whitepaper idea in the pipeline.
// Topics move through: queued → drafting → needs_review → approved → published
// or: queued → rejected

export const whitepaperTopicQueueTable = pgTable("whitepaper_topic_queue", {
  id: serial("id").primaryKey(),

  title: text("title").notNull(),

  slug: text("slug").notNull().unique(),

  code: text("code").notNull(),

  subtitle: text("subtitle"),

  thesis: text("thesis"),

  targetAudience: text("target_audience"),

  status: text("status")
    .$type<WhitepaperTopicStatus>()
    .notNull()
    .default("queued"),

  scheduledFor: timestamp("scheduled_for", { withTimezone: true }),

  sortOrder: integer("sort_order").notNull().default(0),

  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),

  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
});

export type WhitepaperTopic = typeof whitepaperTopicQueueTable.$inferSelect;
export type InsertWhitepaperTopic =
  typeof whitepaperTopicQueueTable.$inferInsert;

// ─── Publications ──────────────────────────────────────────────────────────────
//
// Generated whitepaper drafts ready for review and optional publishing.
// bodyJson holds the section array; citationsJson the citation block;
// seoMetadataJson the open-graph / meta fields.

export const whitepaperPublicationsTable = pgTable("whitepaper_publications", {
  id: serial("id").primaryKey(),

  topicId: integer("topic_id").references(
    () => whitepaperTopicQueueTable.id,
    { onDelete: "set null" },
  ),

  title: text("title").notNull(),

  slug: text("slug").notNull().unique(),

  code: text("code").notNull(),

  subtitle: text("subtitle"),

  abstract: text("abstract"),

  bodyJson: jsonb("body_json").$type<WhitepaperSection[]>(),

  citationsJson: jsonb("citations_json").$type<WhitepaperCitationBlock>(),

  seoMetadataJson: jsonb("seo_metadata_json").$type<WhitepaperSeoMetadata>(),

  keywords: text("keywords").array(),

  estimatedPages: text("estimated_pages"),

  status: text("status")
    .$type<WhitepaperPubStatus>()
    .notNull()
    .default("needs_review"),

  publishedAt: timestamp("published_at", { withTimezone: true }),

  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),

  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
});

export type WhitepaperPublication =
  typeof whitepaperPublicationsTable.$inferSelect;
export type InsertWhitepaperPublication =
  typeof whitepaperPublicationsTable.$inferInsert;

// ─── Settings (singleton row, id = 1) ─────────────────────────────────────────

export const whitepaperSettingsTable = pgTable("whitepaper_settings", {
  id: integer("id").primaryKey().default(1),

  autoGenerate: boolean("auto_generate").notNull().default(true),

  autoPublish: boolean("auto_publish").notNull().default(false),

  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
});

export type WhitepaperSettings = typeof whitepaperSettingsTable.$inferSelect;
