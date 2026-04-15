import { pgTable, text, serial, timestamp, boolean, integer } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const PLAN_TIERS = ["free", "starter", "pro", "elite"] as const;
export type PlanTier = (typeof PLAN_TIERS)[number];

export const BILLING_INTERVALS = ["monthly", "yearly"] as const;
export type BillingInterval = (typeof BILLING_INTERVALS)[number];

export const usersTable = pgTable("users", {
  id: serial("id").primaryKey(),

  // Device-ID anonymous auth — every visitor gets a real user row.
  // For anonymous users, email/passwordHash/name are null until they register.
  deviceId: text("device_id").unique(),
  isAnonymous: boolean("is_anonymous").notNull().default(false),

  // Nullable for anonymous users; set on registration/upgrade
  email: text("email").unique(),
  passwordHash: text("password_hash"),
  name: text("name"),

  onboardingComplete: boolean("onboarding_complete").notNull().default(false),

  // Stripe identifiers
  stripeCustomerId: text("stripe_customer_id"),
  stripeSubscriptionId: text("stripe_subscription_id"),
  stripePriceId: text("stripe_price_id"),

  // Subscription state — source of truth is webhook events
  plan: text("plan", { enum: PLAN_TIERS }).notNull().default("free"),
  planStatus: text("plan_status").notNull().default("active"),
  billingInterval: text("billing_interval", { enum: BILLING_INTERVALS }),
  currentPeriodEnd: timestamp("current_period_end", { withTimezone: true }),
  cancelAtPeriodEnd: boolean("cancel_at_period_end").notNull().default(false),
  trialEnd: timestamp("trial_end", { withTimezone: true }),

  messageCount: integer("message_count").notNull().default(0),

  tenantId: text("tenant_id"),

  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const insertUserSchema = createInsertSchema(usersTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertUser = z.infer<typeof insertUserSchema>;
export type User = typeof usersTable.$inferSelect;
