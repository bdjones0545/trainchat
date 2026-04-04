import {
  pgTable,
  text,
  serial,
  timestamp,
  integer,
  jsonb,
} from "drizzle-orm/pg-core";
import { usersTable } from "./users";

export const GUEST_SESSION_STATUSES = ["active", "converted", "expired", "blocked"] as const;
export type GuestSessionStatus = (typeof GUEST_SESSION_STATUSES)[number];

export const guestSessionsTable = pgTable("guest_sessions", {
  id: serial("id").primaryKey(),

  deviceId: text("device_id").notNull().unique(),

  status: text("status", { enum: GUEST_SESSION_STATUSES })
    .notNull()
    .default("active"),

  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
  lastActiveAt: timestamp("last_active_at", { withTimezone: true }).notNull().defaultNow(),

  teaserUsesCount: integer("teaser_uses_count").notNull().default(0),

  onboardingStartedAt: timestamp("onboarding_started_at", { withTimezone: true }),
  onboardingCompletedAt: timestamp("onboarding_completed_at", { withTimezone: true }),
  firstProgramGeneratedAt: timestamp("first_program_generated_at", { withTimezone: true }),
  paywallShownAt: timestamp("paywall_shown_at", { withTimezone: true }),
  convertedAt: timestamp("converted_at", { withTimezone: true }),

  linkedUserId: integer("linked_user_id").references(() => usersTable.id, {
    onDelete: "set null",
  }),

  metadata: jsonb("metadata"),

  abVariant: text("ab_variant").default("control"),
});

export type GuestSession = typeof guestSessionsTable.$inferSelect;
export type InsertGuestSession = typeof guestSessionsTable.$inferInsert;
