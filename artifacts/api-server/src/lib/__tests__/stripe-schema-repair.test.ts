import { beforeEach, describe, expect, it, vi } from "vitest";

const { query } = vi.hoisted(() => ({ query: vi.fn() }));

vi.mock("@workspace/db", () => ({ pool: { query } }));
vi.mock("../logger", () => ({ logger: { info: vi.fn() } }));

import { ensureStripeAccountsTable } from "../stripeSchemaRepair";

describe("ensureStripeAccountsTable", () => {
  beforeEach(() => query.mockReset().mockResolvedValue({ rows: [] }));

  it("applies an additive, idempotent repair for stripe.accounts", async () => {
    await ensureStripeAccountsTable();

    expect(query).toHaveBeenCalledOnce();
    const sql = String(query.mock.calls[0]?.[0]);
    expect(sql).toContain("CREATE SCHEMA IF NOT EXISTS stripe");
    expect(sql).toContain("CREATE TABLE IF NOT EXISTS stripe.accounts");
    expect(sql).toContain("CREATE INDEX IF NOT EXISTS idx_accounts_business_name");
    expect(sql).not.toMatch(/DROP|DELETE|TRUNCATE/i);
  });
});
