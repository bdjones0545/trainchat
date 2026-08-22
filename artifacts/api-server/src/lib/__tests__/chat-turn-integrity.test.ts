import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockDb, state } = vi.hoisted(() => {
  const state = {
    claimedRows: [] as Array<{ id: number }>,
    existingRows: [] as Array<{ userId: number; status: string; responsePayload: string | null }>,
    lockedRows: [] as Array<{ status: string; quotaCharged: boolean }>,
  };

  const insert = vi.fn(() => ({
    values: vi.fn().mockReturnThis(),
    onConflictDoNothing: vi.fn().mockReturnThis(),
    returning: vi.fn(async () => state.claimedRows),
  }));
  const select = vi.fn(() => ({
    from: vi.fn().mockReturnThis(),
    where: vi.fn().mockImplementation(function (this: any) {
      const rows = state.existingRows;
      const promise: any = Promise.resolve(rows);
      promise.for = vi.fn(async () => state.lockedRows);
      return promise;
    }),
  }));
  const update = vi.fn(() => ({
    set: vi.fn().mockReturnThis(),
    where: vi.fn().mockResolvedValue(undefined),
  }));
  const transaction = vi.fn(async (work: (tx: any) => unknown) => work({ select, update }));

  return { state, mockDb: { insert, select, update, transaction } };
});

vi.mock("@workspace/db", () => ({
  db: mockDb,
  chatTurnsTable: {
    id: "turn.id",
    conversationId: "turn.conversationId",
    userId: "turn.userId",
    clientTurnId: "turn.clientTurnId",
    status: "turn.status",
    responsePayload: "turn.responsePayload",
    quotaCharged: "turn.quotaCharged",
  },
  usersTable: { id: "user.id", messageCount: "user.messageCount" },
}));

vi.mock("drizzle-orm", () => ({
  and: vi.fn((...values: unknown[]) => values),
  eq: vi.fn((column: unknown, value: unknown) => ({ column, value })),
  sql: vi.fn((parts: TemplateStringsArray) => parts.join("")),
}));

import { beginChatTurn, finalizeChatTurn } from "../chat-turn-integrity";

describe("chat-turn-integrity", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    state.claimedRows = [];
    state.existingRows = [];
    state.lockedRows = [];
  });

  it("claims a unique client turn ID", async () => {
    state.claimedRows = [{ id: 17 }];

    await expect(beginChatTurn({
      conversationId: 4,
      userId: 9,
      clientTurnId: "8b779e34-1574-4e43-b455-85cfb39bf513",
    })).resolves.toEqual({ state: "claimed", turnId: 17 });
  });

  it("returns a persisted successful result instead of executing a duplicate", async () => {
    state.existingRows = [{
      userId: 9,
      status: "succeeded",
      responsePayload: JSON.stringify({ assistantMessage: { id: 2 } }),
    }];

    await expect(beginChatTurn({
      conversationId: 4,
      userId: 9,
      clientTurnId: "8b779e34-1574-4e43-b455-85cfb39bf513",
    })).resolves.toEqual({
      state: "duplicate",
      status: "succeeded",
      responsePayload: { assistantMessage: { id: 2 } },
    });
  });

  it("fails closed when a duplicate turn is associated with another user", async () => {
    state.existingRows = [{ userId: 88, status: "succeeded", responsePayload: "{}" }];

    await expect(beginChatTurn({
      conversationId: 4,
      userId: 9,
      clientTurnId: "8b779e34-1574-4e43-b455-85cfb39bf513",
    })).resolves.toEqual({ state: "duplicate", status: "failed", responsePayload: null });
  });

  it("charges quota and records success atomically", async () => {
    state.lockedRows = [{ status: "processing", quotaCharged: false }];

    await finalizeChatTurn({
      turnId: 17,
      userId: 9,
      responsePayload: { type: "complete" },
      successful: true,
      shouldChargeQuota: true,
    });

    expect(mockDb.transaction).toHaveBeenCalledTimes(1);
    expect(mockDb.update).toHaveBeenCalledTimes(2);
    const turnUpdate = mockDb.update.mock.results[1].value.set.mock.calls[0][0];
    expect(turnUpdate).toEqual(expect.objectContaining({ status: "succeeded", quotaCharged: true }));
  });

  it("does not charge a failed turn", async () => {
    state.lockedRows = [{ status: "processing", quotaCharged: false }];

    await finalizeChatTurn({
      turnId: 17,
      userId: 9,
      responsePayload: { type: "error" },
      successful: false,
      shouldChargeQuota: true,
    });

    expect(mockDb.update).toHaveBeenCalledTimes(1);
    expect(mockDb.update.mock.results[0].value.set.mock.calls[0][0])
      .toEqual(expect.objectContaining({ status: "failed", quotaCharged: false }));
  });

  it("does nothing when a terminal turn is finalized again", async () => {
    state.lockedRows = [{ status: "succeeded", quotaCharged: true }];

    await finalizeChatTurn({
      turnId: 17,
      userId: 9,
      responsePayload: { type: "complete" },
      successful: true,
      shouldChargeQuota: true,
    });

    expect(mockDb.update).not.toHaveBeenCalled();
  });
});
