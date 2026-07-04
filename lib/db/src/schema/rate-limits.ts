import { pgTable, text, integer, timestamp, primaryKey, index } from "drizzle-orm/pg-core";

/**
 * Shared fixed-window rate-limit counters (audit F10).
 *
 * One row per (key, window). `key` encodes category + principal, e.g.
 * "external:key:123", "chat:user:45", "auth:ip:1.2.3.4". Counters are
 * incremented atomically via INSERT ... ON CONFLICT DO UPDATE, so limits hold
 * across app instances under autoscale — no process memory involved.
 *
 * `expires_at` (window end) makes cleanup window-size-agnostic: any row past
 * its own expiry is dead regardless of which limiter wrote it.
 */
export const rateLimitCountersTable = pgTable(
  "rate_limit_counters",
  {
    key: text("key").notNull(),
    windowStart: timestamp("window_start", { withTimezone: true }).notNull(),
    count: integer("count").notNull().default(0),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  },
  (table) => ({
    pk: primaryKey({ columns: [table.key, table.windowStart] }),
    expiresAtIdx: index("rate_limit_counters_expires_at_idx").on(table.expiresAt),
  }),
);
