/**
 * DEV-ONLY: Reset all user-generated program data.
 *
 * Clears: training_systems hierarchy, saved_programs hierarchy,
 *         system_change_log, pending_clarifications.
 * Preserves: exercise_library, coaching_knowledge, users,
 *            conversations, memory, readiness, neural_profiles, etc.
 *
 * Run: pnpm --filter @workspace/api-server reset:dev-programs
 *
 * Hard-fails in production.
 */

import { pool } from "@workspace/db";

// ─── Safety Gate ─────────────────────────────────────────────────────────────

const env = process.env.NODE_ENV ?? "development";

if (env === "production") {
  console.error(
    "❌  ABORT: NODE_ENV is 'production'. This script must NEVER run in production."
  );
  process.exit(1);
}

const dbUrl = process.env.DATABASE_URL;
if (!dbUrl) {
  console.error("❌  ABORT: DATABASE_URL is not set.");
  process.exit(1);
}

// Parse and log the connection target (host + dbname only — no credentials)
try {
  const parsed = new URL(dbUrl);
  console.log(`\n🔌  Database target: ${parsed.hostname}${parsed.pathname}`);
} catch {
  console.log("🔌  DATABASE_URL set (could not parse for display)");
}

console.log(`🌍  NODE_ENV: ${env}`);
console.log("⚠️   DEV DATABASE RESET — USER PROGRAM DATA ONLY\n");

// ─── Deletion order (leaf → root, respecting FK constraints) ─────────────────
//
//  Training System hierarchy:
//    session_exercises → training_sessions → training_weeks
//    system_change_log → training_phases → training_systems
//
//  Programs hierarchy:
//    exercises → program_days → saved_programs
//
//  Loose references:
//    pending_clarifications (targetProgramId / targetSessionId — no FK constraint)

const DELETE_STEPS: { table: string; sql: string }[] = [
  {
    table: "session_exercises",
    sql: "DELETE FROM session_exercises",
  },
  {
    table: "training_sessions",
    sql: "DELETE FROM training_sessions",
  },
  {
    table: "training_weeks",
    sql: "DELETE FROM training_weeks",
  },
  {
    table: "system_change_log",
    sql: "DELETE FROM system_change_log",
  },
  {
    table: "training_phases",
    sql: "DELETE FROM training_phases",
  },
  {
    table: "training_systems",
    sql: "DELETE FROM training_systems",
  },
  {
    table: "pending_clarifications",
    sql: "DELETE FROM pending_clarifications",
  },
  {
    table: "exercises",
    sql: "DELETE FROM exercises",
  },
  {
    table: "program_days",
    sql: "DELETE FROM program_days",
  },
  {
    table: "saved_programs",
    sql: "DELETE FROM saved_programs",
  },
];

// Reference tables whose counts must remain non-zero after the reset
const REFERENCE_TABLES = ["exercise_library", "coaching_knowledge"];

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  const client = await pool.connect();

  try {
    // ── 1. Capture BEFORE counts ───────────────────────────────────────────
    console.log("📊  Row counts BEFORE reset:\n");

    const allTables = [
      ...DELETE_STEPS.map((s) => s.table),
      ...REFERENCE_TABLES,
    ];

    const beforeCounts: Record<string, number> = {};
    for (const table of allTables) {
      try {
        const { rows } = await client.query(
          `SELECT COUNT(*)::int AS cnt FROM ${table}`
        );
        beforeCounts[table] = rows[0].cnt;
        console.log(`  ${table}: ${rows[0].cnt}`);
      } catch {
        beforeCounts[table] = -1;
        console.log(`  ${table}: (table not found — skipping)`);
      }
    }

    // ── 2. Run deletes inside a transaction ───────────────────────────────
    console.log("\n🗑️   Deleting user-generated program data…\n");
    await client.query("BEGIN");

    for (const { table, sql } of DELETE_STEPS) {
      if (beforeCounts[table] === -1) {
        console.log(`  ⏭️   ${table}: table not found — skipping`);
        continue;
      }
      const result = await client.query(sql);
      console.log(`  ✅  ${table}: ${result.rowCount ?? 0} rows deleted`);
    }

    await client.query("COMMIT");
    console.log("\n✅  Transaction committed.\n");

    // ── 3. Capture AFTER counts ────────────────────────────────────────────
    console.log("📊  Row counts AFTER reset:\n");

    const afterCounts: Record<string, number> = {};
    for (const table of allTables) {
      if (beforeCounts[table] === -1) {
        afterCounts[table] = -1;
        continue;
      }
      const { rows } = await client.query(
        `SELECT COUNT(*)::int AS cnt FROM ${table}`
      );
      afterCounts[table] = rows[0].cnt;
    }

    // Print program tables
    console.log("  User-generated program tables:");
    for (const { table } of DELETE_STEPS) {
      const after = afterCounts[table];
      const marker = after === 0 ? "✅" : after === -1 ? "⏭️ " : "❌";
      console.log(
        `    ${marker}  ${table}: ${after === -1 ? "n/a" : after} rows`
      );
    }

    // Print reference tables
    console.log("\n  Reference / seed tables (must be non-zero):");
    for (const table of REFERENCE_TABLES) {
      const after = afterCounts[table];
      const before = beforeCounts[table];
      const marker = after === -1 ? "⏭️ " : after > 0 ? "✅" : "⚠️ ";
      console.log(
        `    ${marker}  ${table}: ${after === -1 ? "n/a" : after} rows (was ${before === -1 ? "n/a" : before})`
      );
    }

    // ── 4. Validate ───────────────────────────────────────────────────────
    const programErrors = DELETE_STEPS.filter(
      ({ table }) => afterCounts[table] !== -1 && afterCounts[table] !== 0
    );
    const referenceErrors = REFERENCE_TABLES.filter(
      (t) => afterCounts[t] !== -1 && afterCounts[t] === 0
    );

    console.log("\n─────────────────────────────────────────");

    if (programErrors.length > 0) {
      console.error("\n❌  WARNING: These tables still have rows after reset:");
      programErrors.forEach(({ table }) =>
        console.error(`     • ${table}: ${afterCounts[table]}`)
      );
    }

    if (referenceErrors.length > 0) {
      console.error(
        "\n⚠️   WARNING: These reference tables are now empty (unexpected):"
      );
      referenceErrors.forEach((t) => console.error(`     • ${t}`));
    }

    if (programErrors.length === 0 && referenceErrors.length === 0) {
      console.log(
        "\n🎉  Reset complete. Development database is clean and ready for fresh builds."
      );
      console.log("     • Zero user-generated programs");
      console.log(
        "     • Reference data (exercise_library, coaching_knowledge) preserved"
      );
    }
  } catch (err) {
    await client.query("ROLLBACK");
    console.error("\n❌  Error during reset — transaction rolled back.");
    console.error(err);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}

main();
