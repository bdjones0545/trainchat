/**
 * TrainChat Exercise Library — Seed Script
 *
 * Run: pnpm --filter @workspace/api-server tsx scripts/seed-exercises.ts
 *
 * Exercise data lives in: src/lib/exercise-library-data.ts
 * Seeding logic lives in: src/lib/exercise-seeder.ts
 */

import { seedExerciseLibrary } from "../src/lib/exercise-seeder";
import { EXERCISES } from "../src/lib/exercise-library-data";

async function main() {
  const { inserted, updated } = await seedExerciseLibrary();
  console.log(`Done. ${inserted} inserted, ${updated} updated.`);

  const byPattern: Record<string, number> = {};
  for (const ex of EXERCISES) {
    byPattern[ex.movementPattern] = (byPattern[ex.movementPattern] ?? 0) + 1;
  }
  console.log("\nMovement Bucket Summary:");
  for (const [pattern, count] of Object.entries(byPattern).sort()) {
    console.log(`  ${pattern.padEnd(25)} ${count} exercises`);
  }

  process.exit(0);
}

main().catch((err) => {
  console.error("Seed failed:", err);
  process.exit(1);
});
