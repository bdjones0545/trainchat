// ─── Kevin worker concurrency — REAL Postgres integration ────────────────────
//
// Proves the two primitives that a mocked DB cannot: FOR UPDATE SKIP LOCKED
// atomic claiming (H2) and processing_started_at-based stale recovery (H3/M7).
//
// SKIPPED unless KEVIN_IT_DATABASE_URL is set. It uses the app's own `db` (from
// @workspace/db), so the runner must point DATABASE_URL at the SAME real
// Postgres, e.g.:
//
//   KEVIN_IT_DATABASE_URL=1 DATABASE_URL=postgres://… \
//     pnpm --filter @workspace/api-server test -- kevin-worker-claim
//
// Self-contained: creates and drops its own scratch table mirroring the
// claim-relevant columns of kevin_app_events, so it needs no migrations and
// touches no real Kevin data. This is the concurrency verification the PR
// requires and must be run against a real Postgres before merge.

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { pgTable, serial, text, timestamp } from "drizzle-orm/pg-core";
import { and, or, eq, isNull, lte, inArray, sql } from "drizzle-orm";
import { db } from "@workspace/db";

const run = process.env["KEVIN_IT_DATABASE_URL"] ? describe : describe.skip;

const claimTable = pgTable("kevin_it_claim_scratch", {
  id: serial("id").primaryKey(),
  status: text("status").notNull().default("pending"),
  nextRetryAt: timestamp("next_retry_at", { withTimezone: true }),
  processingStartedAt: timestamp("processing_started_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

run("Kevin worker atomic claim + stale recovery (real Postgres)", () => {
  beforeAll(async () => {
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS kevin_it_claim_scratch (
        id serial PRIMARY KEY,
        status text NOT NULL DEFAULT 'pending',
        next_retry_at timestamptz,
        processing_started_at timestamptz,
        created_at timestamptz NOT NULL DEFAULT now()
      )`);
  });

  afterAll(async () => {
    await db.execute(sql`DROP TABLE IF EXISTS kevin_it_claim_scratch`);
  });

  // Mirrors the workers' claim transaction exactly.
  async function claim(now: Date, batch: number): Promise<number[]> {
    return db.transaction(async (tx) => {
      const rows = await tx
        .select({ id: claimTable.id })
        .from(claimTable)
        .where(
          and(
            or(eq(claimTable.status, "pending"), eq(claimTable.status, "failed")),
            or(isNull(claimTable.nextRetryAt), lte(claimTable.nextRetryAt, now)),
          ),
        )
        .limit(batch)
        .for("update", { skipLocked: true });
      if (rows.length === 0) return [];
      const ids = rows.map((r) => r.id);
      await tx
        .update(claimTable)
        .set({ status: "processing", processingStartedAt: now })
        .where(inArray(claimTable.id, ids));
      return ids;
    });
  }

  it("four concurrent claims return DISJOINT ids — no row claimed twice (H2)", async () => {
    await db.execute(sql`TRUNCATE kevin_it_claim_scratch RESTART IDENTITY`);
    await db.insert(claimTable).values(
      Array.from({ length: 40 }, () => ({ status: "pending" })),
    );

    const now = new Date();
    // Four overlapping workers (autoscale simulation) claim concurrently.
    const results = await Promise.all([
      claim(now, 20),
      claim(now, 20),
      claim(now, 20),
      claim(now, 20),
    ]);

    const all = results.flat();
    expect(new Set(all).size).toBe(all.length); // every claimed id unique
    expect(all.length).toBe(40); // all rows claimed, none skipped forever

    const processing = await db
      .select({ id: claimTable.id })
      .from(claimTable)
      .where(eq(claimTable.status, "processing"));
    expect(processing.length).toBe(40);
  });

  it("stale recovery reclaims by processing_started_at, never created_at (H3/M7)", async () => {
    await db.execute(sql`TRUNCATE kevin_it_claim_scratch RESTART IDENTITY`);

    const now = new Date();
    const old = new Date(now.getTime() - 20 * 60_000); // 20 min ago
    const recent = new Date(now.getTime() - 1 * 60_000); // 1 min ago

    // A: stuck long ago → should be reclaimed.
    await db.insert(claimTable).values({ status: "processing", processingStartedAt: old });
    // B: genuinely in-flight (recent processing start) → must NOT be reclaimed,
    //    even though we force its created_at old (the createdAt bug M7 fixes).
    await db.insert(claimTable).values({ status: "processing", processingStartedAt: recent });
    await db.execute(
      sql`UPDATE kevin_it_claim_scratch SET created_at = ${old.toISOString()}`,
    );

    const staleThreshold = new Date(now.getTime() - 10 * 60_000);
    await db
      .update(claimTable)
      .set({ status: "pending", nextRetryAt: now })
      .where(
        and(
          eq(claimTable.status, "processing"),
          or(
            isNull(claimTable.processingStartedAt),
            lte(claimTable.processingStartedAt, staleThreshold),
          ),
        ),
      );

    const pending = await db
      .select({ id: claimTable.id })
      .from(claimTable)
      .where(eq(claimTable.status, "pending"));
    const stillProcessing = await db
      .select({ id: claimTable.id })
      .from(claimTable)
      .where(eq(claimTable.status, "processing"));

    expect(pending.length).toBe(1); // only the truly-stale row recovered
    expect(stillProcessing.length).toBe(1); // the recent in-flight row untouched
  });
});
