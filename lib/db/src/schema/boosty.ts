import {
  pgTable, serial, text, integer, boolean, timestamp, jsonb, uniqueIndex, index,
} from "drizzle-orm/pg-core";

/**
 * BOOSTY cosmetics store.
 *
 * BOOSTY is a browser arcade game with no user accounts: a player is identified
 * by a random client-generated id surfaced to them as a recovery code
 * (BOOSTY-XXXX-XXXX-XXXX-XXXX). That id — not a TrainChat user id — is what a
 * purchase is bound to, which is what lets the game keep its no-signup flow
 * while still surviving a cleared cache or a change of device.
 *
 * Security note, stated because this involves real money: the player id is a
 * bearer token. Anyone holding it can read and claim those cosmetics. It has 64
 * bits of entropy so it cannot realistically be guessed, but it is shareable,
 * and these tables therefore protect against *loss*, not against *sharing*.
 * Purchases here are cosmetic-only and grant no gameplay advantage, which is
 * what keeps that trade acceptable.
 */
export const boostyEntitlementsTable = pgTable(
  "boosty_entitlements",
  {
    /** The BOOSTY player id ("plr_" + 16 hex). Not a TrainChat user id. */
    playerId: text("player_id").primaryKey(),

    /** Owned SKU ids, e.g. ["wigsby", "trail.void", "bundle.all"]. */
    skus: jsonb("skus").notNull().default([]),

    /** Set by the all-inclusive bundle; implies every current and future cosmetic. */
    bundle: boolean("bundle").notNull().default(false),

    /**
     * Cumulative sparks ever purchased with money. The client credits the
     * DIFFERENCE between this and what it has already applied, so restoring on
     * a second device can never duplicate spendable currency.
     */
    sparksPurchased: integer("sparks_purchased").notNull().default(0),

    /** Optional link to a TrainChat account, when the player has one. */
    userId: integer("user_id"),

    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    userIdx: index("boosty_entitlements_user_idx").on(table.userId),
  })
);

/**
 * Immutable ledger of paid BOOSTY purchases.
 *
 * `stripe_session_id` is UNIQUE: that constraint, not application convention,
 * is what makes a redelivered Stripe webhook harmless. The webhook layer also
 * dedupes by event id, but a database-enforced invariant is the one that still
 * holds when the application logic is wrong.
 */
export const boostyPurchasesTable = pgTable(
  "boosty_purchases",
  {
    id: serial("id").primaryKey(),

    playerId: text("player_id").notNull(),

    /** SKU as sold, e.g. "bundle.all", "trail.void", "sparks.medium". */
    sku: text("sku").notNull(),

    stripeSessionId: text("stripe_session_id").notNull(),
    stripePaymentIntentId: text("stripe_payment_intent_id"),
    stripeEventId: text("stripe_event_id"),

    /** Amount actually charged, from Stripe — never from the client. */
    amountCents: integer("amount_cents").notNull(),
    currency: text("currency").notNull().default("usd"),

    /** Sparks credited by this purchase; 0 for cosmetic SKUs. */
    sparksGranted: integer("sparks_granted").notNull().default(0),

    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    sessionIdx: uniqueIndex("boosty_purchases_session_idx").on(table.stripeSessionId),
    playerIdx: index("boosty_purchases_player_idx").on(table.playerId),
  })
);

export type BoostyEntitlement = typeof boostyEntitlementsTable.$inferSelect;
export type InsertBoostyEntitlement = typeof boostyEntitlementsTable.$inferInsert;
export type BoostyPurchase = typeof boostyPurchasesTable.$inferSelect;
export type InsertBoostyPurchase = typeof boostyPurchasesTable.$inferInsert;
