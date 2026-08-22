import { beforeEach, describe, expect, it, vi } from "vitest";

const mockDb = vi.hoisted(() => ({ select: vi.fn() }));
vi.mock("@workspace/db", () => ({ db: mockDb, usersTable: { id: "id", email: "email" } }));
vi.mock("drizzle-orm", () => ({ eq: vi.fn() }));

import { requireAdmin } from "../../middlewares/admin";

function response() {
  return { status: vi.fn().mockReturnThis(), json: vi.fn().mockReturnThis() } as any;
}

function selectEmail(email: string | null) {
  mockDb.select.mockReturnValue({
    from: vi.fn().mockReturnThis(),
    where: vi.fn().mockResolvedValue(email === null ? [] : [{ email }]),
  });
}

describe("administrative authorization", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    delete process.env.ADMIN_EMAILS;
  });

  it("rejects missing sessions even when a legacy header is supplied", async () => {
    const res = response();
    await requireAdmin({ session: {}, headers: { "x-admin-key": "old-value" } } as any, res, vi.fn());
    expect(res.status).toHaveBeenCalledWith(401);
  });

  it("fails closed when ADMIN_EMAILS is missing", async () => {
    const res = response();
    await requireAdmin({ session: { userId: 1 } } as any, res, vi.fn());
    expect(res.status).toHaveBeenCalledWith(403);
  });

  it("rejects an ordinary authenticated user", async () => {
    process.env.ADMIN_EMAILS = "admin@example.com";
    selectEmail("user@example.com");
    const res = response();
    await requireAdmin({ session: { userId: 1 } } as any, res, vi.fn());
    expect(res.status).toHaveBeenCalledWith(403);
  });

  it("allows an explicitly configured authenticated administrator", async () => {
    process.env.ADMIN_EMAILS = "Admin@Example.com";
    selectEmail("admin@example.com");
    const next = vi.fn();
    await requireAdmin({ session: { userId: 1 } } as any, response(), next);
    expect(next).toHaveBeenCalledOnce();
  });
});
