import { db, usersTable } from "@workspace/db";
import { eq, sql } from "drizzle-orm";
import type { PlanTier } from "@workspace/db";

export class StripeStorage {
  async getUser(userId: number) {
    const [user] = await db.select().from(usersTable).where(eq(usersTable.id, userId));
    return user ?? null;
  }

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

  async incrementMessageCount(userId: number): Promise<number> {
    const [user] = await db
      .update(usersTable)
      .set({ messageCount: sql`${usersTable.messageCount} + 1` })
      .where(eq(usersTable.id, userId))
      .returning({ messageCount: usersTable.messageCount });
    return user?.messageCount ?? 0;
  }

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
      const plan = meta?.plan;
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
