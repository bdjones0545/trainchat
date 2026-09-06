/**
 * boosty-seed-ids.test.ts
 *
 * Seeding must be safely re-runnable. The original script found existing
 * products with `products.search`, whose index lags creation by up to about a
 * minute — so a run that died halfway and was retried inside that window
 * created DUPLICATE products, and the next run then bound the env var to an
 * arbitrary one of them.
 *
 * Deterministic product ids remove the window entirely: `products.retrieve` is
 * strongly consistent.
 */

import { describe, it, expect } from "vitest";
import { BOOSTY_SKUS, stripeProductIdFor } from "../boostyCatalog";

describe("deterministic Stripe product ids", () => {
  it("is stable for the same SKU", () => {
    expect(stripeProductIdFor("bundle.all")).toBe(stripeProductIdFor("bundle.all"));
  });

  it("produces a distinct id for every SKU in the catalog", () => {
    const ids = BOOSTY_SKUS.map((s) => stripeProductIdFor(s.id));
    expect(new Set(ids).size).toBe(BOOSTY_SKUS.length);
  });

  it("flattens dots, which Stripe ids do not allow to collide", () => {
    expect(stripeProductIdFor("trail.void")).toBe("boosty_trail_void");
    expect(stripeProductIdFor("sparks.large")).toBe("boosty_sparks_large");
    expect(stripeProductIdFor("wigsby")).toBe("boosty_wigsby");
  });

  it("never collides across the dot/underscore boundary", () => {
    // "trail.void" and "trail_void" must not map to the same product.
    expect(BOOSTY_SKUS.some((s) => s.id.includes("_"))).toBe(false);
  });

  it("only emits characters Stripe accepts in an id", () => {
    for (const sku of BOOSTY_SKUS) {
      expect(stripeProductIdFor(sku.id)).toMatch(/^[a-z0-9_]+$/);
    }
  });
});

/**
 * Behavioural check of the retrieve-then-create strategy against a fake Stripe
 * whose search index is deliberately stale — the condition that broke the
 * original script.
 */
describe("seeding is re-runnable while the search index is stale", () => {
  function fakeStripe() {
    const products = new Map<string, any>();
    const prices: any[] = [];
    let priceSeq = 0;
    return {
      products,
      prices,
      api: {
        products: {
          async retrieve(id: string) {
            const p = products.get(id);
            if (!p) { const e: any = new Error("No such product"); e.statusCode = 404; e.code = "resource_missing"; throw e; }
            return p;
          },
          async create(body: any) {
            if (products.has(body.id)) { const e: any = new Error("Product already exists"); e.code = "resource_already_exists"; throw e; }
            const p = { ...body };
            products.set(body.id, p);
            return p;
          },
          // Deliberately always empty: models the eventually-consistent index
          // that made the previous approach unsafe.
          async search() { return { data: [] }; },
        },
        prices: {
          async list({ product }: any) {
            return { data: prices.filter((p) => p.product === product) };
          },
          async create(body: any) {
            const p = { id: `price_${++priceSeq}`, created: priceSeq, ...body };
            prices.push(p);
            return p;
          },
        },
      },
    };
  }

  // Mirrors the script's per-SKU logic.
  async function seedOnce(stripe: any, skus: typeof BOOSTY_SKUS) {
    for (const sku of skus) {
      const id = stripeProductIdFor(sku.id);
      let product: any = null;
      try { product = await stripe.products.retrieve(id); } catch { /* 404 */ }
      if (!product) {
        product = await stripe.products.create({ id, name: sku.name, metadata: { boosty_sku: sku.id } });
      }
      const existing = await stripe.prices.list({ product: product.id, active: true, limit: 100 });
      const match = existing.data.find((p: any) => p.unit_amount === sku.cents && !p.recurring);
      if (!match) {
        await stripe.prices.create({ product: product.id, unit_amount: sku.cents, currency: "usd" });
      }
    }
  }

  it("creates each product exactly once across three consecutive runs", async () => {
    const f = fakeStripe();
    await seedOnce(f.api, BOOSTY_SKUS);
    await seedOnce(f.api, BOOSTY_SKUS);
    await seedOnce(f.api, BOOSTY_SKUS);
    expect(f.products.size).toBe(BOOSTY_SKUS.length);
    expect(f.prices.length).toBe(BOOSTY_SKUS.length);
  });

  it("recovers a partial run without duplicating what already succeeded", async () => {
    const f = fakeStripe();
    const half = BOOSTY_SKUS.slice(0, 8);
    await seedOnce(f.api, half);           // first run dies after 8
    expect(f.products.size).toBe(8);
    await seedOnce(f.api, BOOSTY_SKUS);    // retry the whole set
    expect(f.products.size).toBe(BOOSTY_SKUS.length);
    expect(f.prices.length).toBe(BOOSTY_SKUS.length);
  });
});
