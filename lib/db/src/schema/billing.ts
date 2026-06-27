import { pgTable, text, timestamp } from "drizzle-orm/pg-core";

// ─── Stripe Processed Events ──────────────────────────────────────────────────
//
// Tracks Stripe event IDs that have been fully processed by our business-logic
// webhook handlers. Used for event-ID–level idempotency so that Stripe retries
// or duplicate deliveries do not re-run business logic (e.g. double emails).
//
// StripeSync already stores the raw event, but does not expose a "processed"
// flag to our layer. This table fills that gap.
//
// TTL: Events older than 30 days can be pruned — Stripe will not replay them.

export const stripeProcessedEventsTable = pgTable("stripe_processed_events", {
  eventId:   text("event_id").primaryKey(),
  eventType: text("event_type").notNull(),
  processedAt: timestamp("processed_at", { withTimezone: true }).notNull().defaultNow(),
});
