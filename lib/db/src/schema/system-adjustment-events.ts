import { pgTable, text, serial, integer, boolean, timestamp, jsonb } from "drizzle-orm/pg-core";

/**
 * system_adjustment_events — visible adaptation events for the System Adjustments layer
 *
 * Each row represents a meaningful system adaptation that the user should be aware of:
 * - check-in driven adjustments
 * - focus or block direction changes
 * - fatigue / pain protection applied
 * - next-session or week-load shifts
 *
 * Only high-signal events are persisted. Micro-edits and internal cleanup
 * do NOT create rows here.
 *
 * visiblePriority: "high" surfaces at top regardless of focus sorting.
 */
export const systemAdjustmentEventsTable = pgTable("system_adjustment_events", {
  id: serial("id").primaryKey(),

  userId: integer("user_id").notNull(),

  trainingSystemId: integer("training_system_id"),

  /** Focus mode the event is most relevant to */
  focusMode: text("focus_mode").notNull().default("strength"),

  /** Machine-readable event category */
  eventType: text("event_type").notNull(),

  /** Short human-readable title (coach tone) */
  title: text("title").notNull(),

  /** One-line coach summary */
  summary: text("summary").notNull(),

  /** Scope the change affected */
  scope: text("scope"),

  /** What triggered this event */
  source: text("source"),

  /** How prominently to surface this event */
  visiblePriority: text("visible_priority").notNull().default("medium"),

  /** True until the user has seen this event in the UI */
  isNew: boolean("is_new").notNull().default(true),

  /** Arbitrary structured context (scores, intent, etc.) */
  metadata: jsonb("metadata"),

  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type SystemAdjustmentEvent = typeof systemAdjustmentEventsTable.$inferSelect;
export type InsertSystemAdjustmentEvent = typeof systemAdjustmentEventsTable.$inferInsert;
