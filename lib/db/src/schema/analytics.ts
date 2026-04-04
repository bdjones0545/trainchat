import { pgTable, text, serial, integer, timestamp, jsonb } from "drizzle-orm/pg-core";

/**
 * analytics_events — structured funnel event store
 *
 * Every significant user action in the guest → paywall → signup → payment funnel
 * is written here. Queryable by event type, device, session, user, and date.
 *
 * Event naming convention: snake_case noun_verb (e.g. "paywall_shown")
 */
export const analyticsEventsTable = pgTable("analytics_events", {
  id: serial("id").primaryKey(),

  event: text("event").notNull(),

  deviceId: text("device_id"),

  guestSessionId: integer("guest_session_id"),

  userId: integer("user_id"),

  properties: jsonb("properties"),

  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type AnalyticsEvent = typeof analyticsEventsTable.$inferSelect;
export type InsertAnalyticsEvent = typeof analyticsEventsTable.$inferInsert;
