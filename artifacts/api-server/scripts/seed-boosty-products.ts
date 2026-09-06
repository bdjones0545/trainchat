#!/usr/bin/env tsx
/**
 * Seed Stripe Products & Prices for the BOOSTY cosmetics store.
 *
 *   pnpm --filter @workspace/api-server run seed:boosty
 *
 * Creates one product + one ONE-TIME price per SKU (BOOSTY sells cosmetics and
 * currency, never subscriptions), then prints the env block to paste into the
 * deployment. Idempotent: a product carrying the same boosty_sku metadata is
 * reused rather than duplicated, so re-running after adding a SKU is safe.
 *
 * Nothing here writes to the database. Prices are created in whichever Stripe
 * account STRIPE_SECRET_KEY points at — run it against test keys first.
 */

import "../src/lib/stripeClient";
import { getUncachableStripeClient } from "../src/lib/stripeClient";
import { BOOSTY_SKUS } from "../src/lib/boostyCatalog";

async function main(): Promise<void> {
  const stripe = await getUncachableStripeClient();
  const env: string[] = [];
  let created = 0;
  let reused = 0;

  for (const sku of BOOSTY_SKUS) {
    // Find an existing product for this SKU.
    const search = await stripe.products.search({
      query: `metadata['boosty_sku']:'${sku.id}'`,
      limit: 1,
    });

    let product = search.data[0];
    if (product) {
      reused++;
    } else {
      product = await stripe.products.create({
        name: `BOOSTY — ${sku.name}`,
        description:
          sku.kind === "sparks"
            ? `${sku.sparks?.toLocaleString("en-US")} sparks, the in-game cosmetic currency.`
            : sku.kind === "bundle"
              ? "Every BOOSTY pilot and trail, now and in future."
              : "A cosmetic item for BOOSTY. Grants no gameplay advantage.",
        metadata: { boosty_sku: sku.id, boosty_kind: sku.kind, product: "boosty" },
      });
      created++;
    }

    // Reuse an active one-time price at the right amount if one exists.
    const prices = await stripe.prices.list({ product: product.id, active: true, limit: 20 });
    let price = prices.data.find(
      (p) => p.unit_amount === sku.cents && p.currency === "usd" && !p.recurring
    );
    if (!price) {
      price = await stripe.prices.create({
        product: product.id,
        unit_amount: sku.cents,
        currency: "usd",
        // No `recurring`: these are one-time payments, which is exactly why the
        // webhook needed its own branch — the subscription path drops them.
        metadata: { boosty_sku: sku.id },
      });
    }

    env.push(`${sku.priceEnv}=${price.id}`);
    console.log(`  ${sku.id.padEnd(22)} $${(sku.cents / 100).toFixed(2).padStart(6)}  ${price.id}`);
  }

  console.log(`\n${created} product(s) created, ${reused} reused.\n`);
  console.log("Add these to the api-server environment:\n");
  console.log(env.join("\n"));
  console.log(
    "\nAlso required:\n" +
      "  BOOSTY_PUBLIC_URL=https://<where the game is served>\n" +
      "\nAnd in the game (src/payments.js or at runtime):\n" +
      "  CONFIG.mode = MODES.API\n" +
      "  CONFIG.apiBase = 'https://<api-server origin>'\n"
  );
}

main().catch((err) => {
  console.error("[seed-boosty] failed:", err?.message ?? err);
  process.exit(1);
});
