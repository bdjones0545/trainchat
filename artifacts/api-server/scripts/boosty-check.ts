#!/usr/bin/env tsx
/**
 * Verify the BOOSTY store configuration against the live Stripe account.
 *
 *   pnpm --filter @workspace/api-server run boosty:check
 *
 * Run this after seeding prices and after any change to the BOOSTY_PRICE_* env
 * vars. It catches the failures that do not announce themselves: a price id
 * from the wrong Stripe mode, an archived price, a recurring price where a
 * one-time one is required, or an amount that disagrees with what the shop
 * displays.
 *
 * Read-only. Creates and modifies nothing.
 */

import "../src/lib/stripeClient";
import { getUncachableStripeClient } from "../src/lib/stripeClient";
import { checkBoostyEnv, checkBoostyPrices } from "../src/lib/boostyConfigCheck";
import { BOOSTY_SKUS, unconfiguredSkus, priceIdFor } from "../src/lib/boostyCatalog";

async function main(): Promise<void> {
  const unconfigured = unconfiguredSkus();
  console.log(
    `BOOSTY store: ${BOOSTY_SKUS.length - unconfigured.length}/${BOOSTY_SKUS.length} SKUs have a price id\n`
  );

  const problems = [...checkBoostyEnv()];

  if (unconfigured.length === BOOSTY_SKUS.length) {
    console.log("The store is entirely off. Nothing to verify against Stripe.");
    console.log("Run `pnpm --filter @workspace/api-server run seed:boosty` to create prices.");
    return;
  }

  console.log("Checking each configured price against Stripe...\n");
  const stripe = await getUncachableStripeClient();
  problems.push(...(await checkBoostyPrices(stripe as any)));

  for (const sku of BOOSTY_SKUS) {
    const id = priceIdFor(sku);
    const bad = problems.some((p) => p.sku === sku.id && p.severity === "error");
    const mark = !id ? "  --  " : bad ? "  FAIL" : "  ok  ";
    console.log(`${mark}  ${sku.id.padEnd(22)} $${(sku.cents / 100).toFixed(2).padStart(6)}  ${id ?? "(no price id)"}`);
  }

  const errors = problems.filter((p) => p.severity === "error");
  const warnings = problems.filter((p) => p.severity === "warning");

  if (warnings.length) {
    console.log("\nWarnings:");
    for (const w of warnings) console.log(`  - ${w.message}`);
  }
  if (errors.length) {
    console.log("\nErrors:");
    for (const e of errors) console.log(`  - ${e.message}`);
    console.log(`\n${errors.length} problem(s). The store is not safe to sell from.`);
    process.exit(1);
  }

  console.log("\nEvery configured price exists, is active, is one-time, and matches the catalog.");
  if (!process.env.BOOSTY_PUBLIC_URL) console.log("BOOSTY_PUBLIC_URL is still unset.");
}

main().catch((err) => {
  console.error("[boosty-check] failed:", err?.message ?? err);
  process.exit(1);
});
