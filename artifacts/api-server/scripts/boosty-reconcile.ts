#!/usr/bin/env tsx
/**
 * Repair BOOSTY entitlements that do not match their own payment ledger.
 *
 *   pnpm --filter @workspace/api-server run boosty:reconcile          # report
 *   pnpm --filter @workspace/api-server run boosty:reconcile --apply  # repair
 *
 * The grant is written in a transaction with the ledger row, so in normal
 * operation this finds nothing. It exists for the case that transaction cannot
 * cover: the database being unavailable for Stripe's whole retry window, or a
 * row edited by hand. The ledger records what was PAID FOR and is always the
 * side to trust.
 *
 * Run this from an alert on the log line:
 *   "grant transaction failed and rolled back"
 */

import { boostyStorage } from "../src/lib/boostyStorage";

async function main(): Promise<void> {
  const apply = process.argv.includes("--apply");

  const drifted = await boostyStorage.findUnreconciled(500);
  if (!drifted.length) {
    console.log("No drift: every entitlement matches its ledger.");
    return;
  }

  console.log(`${drifted.length} player(s) whose entitlements do not match their ledger:\n`);
  for (const playerId of drifted) console.log(`  ${playerId}`);

  if (!apply) {
    console.log("\nDry run. Re-run with --apply to repair.");
    return;
  }

  const result = await boostyStorage.reconcileAll(500);
  console.log(`\nRepaired ${result.repaired.length} of ${result.checked}.`);
  if (result.repaired.length !== result.checked) {
    console.error("Some repairs failed — see the logs.");
    process.exit(1);
  }
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("[boosty-reconcile] failed:", err?.message ?? err);
    process.exit(1);
  });
