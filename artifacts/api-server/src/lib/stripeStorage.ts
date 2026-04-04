import { db, usersTable } from "@workspace/db";
import { eq, sql } from "drizzle-orm";
import type { PlanTier, BillingInterval } from "@workspace/db";
import { logger } from "./logger";

// ─── Subscription Sync Payload ────────────────────────────────────────────────
//
// Normalised representation of a Stripe Subscription object.
// Built from the raw webhook event and passed to syncUserSubscription().

export interface SubscriptionSyncPayload {
  stripeSubscriptionId: string;
  stripeCustomerId: string;
  stripePriceId: string;
  plan: PlanTier;
  planStatus: string;
  billingInterval: BillingInterval;
  currentPeriodEnd: Date;
  cancelAtPeriodEnd: boolean;
  trialEnd?: Date | null;
}

export class StripeStorage {
  // ── User lookups ─────────────────────────────────────────────────────────────

  async getUser(userId: number) {
    const [user] = await db.select().from(usersTable).where(eq(usersTable.id, userId));
    return user ?? null;
  }

  async getUserByStripeCustomerId(customerId: string) {
    const [user] = await db
      .select()
      .from(usersTable)
      .where(eq(usersTable.stripeCustomerId, customerId));
    return user ?? null;
  }

  async getUserByEmail(email: string) {
    const [user] = await db
      .select()
      .from(usersTable)
      .where(eq(usersTable.email, email));
    return user ?? null;
  }

  // ── Subscription sync ─────────────────────────────────────────────────────────
  //
  // Single method to write all subscription fields atomically.
  // Called from webhook handlers — idempotent by design.

  async syncUserSubscription(userId: number, payload: SubscriptionSyncPayload) {
    const [user] = await db
      .update(usersTable)
      .set({
        stripeCustomerId: payload.stripeCustomerId,
        stripeSubscriptionId: payload.stripeSubscriptionId,
        stripePriceId: payload.stripePriceId,
        plan: payload.plan,
        planStatus: payload.planStatus,
        billingInterval: payload.billingInterval,
        currentPeriodEnd: payload.currentPeriodEnd,
        cancelAtPeriodEnd: payload.cancelAtPeriodEnd,
        trialEnd: payload.trialEnd ?? null,
        updatedAt: new Date(),
      })
      .where(eq(usersTable.id, userId))
      .returning();
    return user ?? null;
  }

  // ── Link customer ID to user ──────────────────────────────────────────────────
  //
  // Used when checkout.session.completed fires before we have a customer ID
  // stored on the user record.

  async linkStripeCustomer(userId: number, customerId: string) {
    await db
      .update(usersTable)
      .set({ stripeCustomerId: customerId, updatedAt: new Date() })
      .where(eq(usersTable.id, userId));
  }

  // ── Revoke subscription access ────────────────────────────────────────────────
  //
  // Called when customer.subscription.deleted fires.
  // Downgrades to free plan immediately.

  async revokeUserSubscription(userId: number) {
    await db
      .update(usersTable)
      .set({
        plan: "free",
        planStatus: "canceled",
        stripeSubscriptionId: null,
        stripePriceId: null,
        billingInterval: null,
        currentPeriodEnd: null,
        cancelAtPeriodEnd: false,
        trialEnd: null,
        updatedAt: new Date(),
      })
      .where(eq(usersTable.id, userId));
    logger.info({ userId }, "[StripeStorage] Subscription revoked — user downgraded to free");
  }

  // ── Legacy write (kept for backwards compat with existing routes) ─────────────

  async updateUserStripeInfo(
    userId: number,
    info: {
      stripeCustomerId?: string;
      stripeSubscriptionId?: string;
      plan?: PlanTier;
      planStatus?: string;
    }
  ) {
    const [user] = await db
      .update(usersTable)
      .set({ ...info, updatedAt: new Date() })
      .where(eq(usersTable.id, userId))
      .returning();
    return user;
  }

  // ── Message counting ──────────────────────────────────────────────────────────

  async incrementMessageCount(userId: number): Promise<number> {
    const [user] = await db
      .update(usersTable)
      .set({ messageCount: sql`${usersTable.messageCount} + 1` })
      .where(eq(usersTable.id, userId))
      .returning({ messageCount: usersTable.messageCount });
    return user?.messageCount ?? 0;
  }

  // ── StripeSync table reads ────────────────────────────────────────────────────
  //
  // Reads from stripe.* schema managed by stripe-replit-sync.
  // These are supplementary — the users table is our primary state.

  async getActiveSubscription(subscriptionId: string) {
    try {
      const result = await db.execute(
        sql`SELECT id, status, metadata, cancel_at_period_end, current_period_end
            FROM stripe.subscriptions
            WHERE id = ${subscriptionId}
            LIMIT 1`
      );
      return result.rows[0] ?? null;
    } catch {
      return null;
    }
  }

  async getSubscriptionPlan(subscriptionId: string): Promise<PlanTier> {
    try {
      const result = await db.execute(
        sql`
          SELECT p.metadata
          FROM stripe.subscriptions s
          JOIN stripe.prices pr ON pr.id = (s.items->0->'price'->>'id')
          JOIN stripe.products p ON p.id = pr.product
          WHERE s.id = ${subscriptionId}
          LIMIT 1
        `
      );
      const meta = result.rows[0]?.metadata as Record<string, string> | null;
      const plan = meta?.plan ?? meta?.trainchat_plan;
      if (plan === "starter" || plan === "pro" || plan === "elite") return plan;
      return "starter";
    } catch {
      return "starter";
    }
  }

  async listProductsWithPrices() {
    try {
      const result = await db.execute(sql`
        WITH paginated_products AS (
          SELECT id, name, description, metadata, active
          FROM stripe.products
          WHERE active = true
          ORDER BY created DESC
        )
        SELECT
          p.id as product_id,
          p.name as product_name,
          p.description as product_description,
          p.active as product_active,
          p.metadata as product_metadata,
          pr.id as price_id,
          pr.unit_amount,
          pr.currency,
          pr.recurring,
          pr.active as price_active
        FROM paginated_products p
        LEFT JOIN stripe.prices pr ON pr.product = p.id AND pr.active = true
        ORDER BY pr.unit_amount ASC
      `);

      const productsMap = new Map<string, any>();
      for (const row of result.rows) {
        if (!productsMap.has(row.product_id as string)) {
          productsMap.set(row.product_id as string, {
            id: row.product_id,
            name: row.product_name,
            description: row.product_description,
            metadata: row.product_metadata,
            prices: [],
          });
        }
        if (row.price_id) {
          productsMap.get(row.product_id as string).prices.push({
            id: row.price_id,
            unit_amount: row.unit_amount,
            currency: row.currency,
            recurring: row.recurring,
          });
        }
      }
      return Array.from(productsMap.values());
    } catch {
      return [];
    }
  }
}

export const stripeStorage = new StripeStorage();
