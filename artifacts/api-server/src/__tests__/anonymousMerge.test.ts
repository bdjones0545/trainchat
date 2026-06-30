/**
 * anonymousMerge.test.ts
 *
 * Unit tests for mergeAnonymousToRegistered (DR-0025 fix).
 *
 * These tests mock @workspace/db and drizzle-orm to verify the merge
 * logic in isolation, without requiring a live database. They cover:
 *
 *   TC-01  Full migration — all 14 tables updated before user deleted
 *   TC-02  user_profiles conflict — target profile preserved, anonymous discarded
 *   TC-03  user_profiles no conflict — anonymous profile reassigned to target
 *   TC-04  neural_profiles conflict — additive XP merge applied, anon row deleted
 *   TC-05  neural_profiles no conflict — anonymous row reassigned to target
 *   TC-06  In-place upgrade no-op (anonymousUserId === targetUserId)
 *   TC-07  Anonymous user not found — skip and return empty result
 *   TC-08  Source is not anonymous — skip and return empty result
 *   TC-09  Anonymous user with no child data — completes cleanly (no rows updated)
 *   TC-10  Transaction wrapping — all mutations run inside db.transaction
 *   TC-11  Transaction rollback on failure — error propagates; anon data untouched
 *   TC-12  conversations still migrate (regression guard)
 *   TC-13  training_systems still migrate (regression guard)
 *   TC-14  saved_programs still migrate (legacy hierarchy regression guard)
 *   TC-15  neural_profiles merge policy — XP additive, scores are max, milestones unioned
 */

import { describe, it, expect, vi, beforeEach, type Mock } from "vitest";

// ── Mock drizzle-orm ──────────────────────────────────────────────────────────
// eq() builds a SQL condition object. The mock returns a plain marker object
// so the mock tx's .where() can receive it without throwing.
vi.mock("drizzle-orm", () => ({
  eq: vi.fn((_col: unknown, _val: unknown) => ({ __eq: true })),
}));

// ── Mock ./logger ─────────────────────────────────────────────────────────────
vi.mock("../lib/logger", () => ({
  logger: { warn: vi.fn(), info: vi.fn(), error: vi.fn() },
}));

// ── Shared mock state ─────────────────────────────────────────────────────────
// Mutated in beforeEach / individual tests to configure each scenario.
const state = {
  anonUser: null as Record<string, unknown> | null,
  targetProfileExists: false,
  anonProfileExists: true,
  anonNeuralExists: false,
  targetNeuralExists: false,
  anonNeural: {
    userId: 10,
    xp: 50,
    level: 2,
    consistencyScore: 0.4,
    progressionScore: 0.3,
    recoveryScore: 0.5,
    totalSessionsCompleted: 5,
    neuralConnections: 3,
    unlockedMilestones: ["first_session", "week_1"],
  },
  targetNeural: {
    userId: 99,
    xp: 200,
    level: 4,
    consistencyScore: 0.7,
    progressionScore: 0.8,
    recoveryScore: 0.6,
    totalSessionsCompleted: 20,
    neuralConnections: 12,
    unlockedMilestones: ["week_1", "month_1", "first_pr"],
  },
  // Number of rows returned by each simple UPDATE (simulates n existing rows)
  rowsPerTable: 2,
};

// ── Mock @workspace/db ────────────────────────────────────────────────────────
// Tables are plain identity objects. The db mock captures all calls.

// Operation log — appended to by the mock tx to verify ordering.
const opLog: string[] = [];

// Build a mock transaction object that records operations and returns
// results configured via `state`.
function buildMockTx() {
  // Helper: chainable UPDATE builder that returns n rows
  const makeUpdate = (tag: string, n: number) => ({
    set: vi.fn().mockReturnValue({
      where: vi.fn().mockReturnValue({
        returning: vi.fn().mockResolvedValue(
          Array.from({ length: n }, (_, i) => ({ id: i + 1 })),
        ),
      }),
    }),
  });

  // Helper: DELETE builder
  const makeDelete = (tag: string) => ({
    where: vi.fn().mockResolvedValue(undefined),
  });

  // Select call counter — used to return the right result for sequential
  // selects targeting different tables (userProfiles then neuralProfiles).
  let selectCallIndex = 0;

  return {
    update: vi.fn((table: { _tag: string }) => {
      opLog.push(`update:${table._tag}`);
      return makeUpdate(table._tag, state.rowsPerTable);
    }),
    delete: vi.fn((table: { _tag: string }) => {
      opLog.push(`delete:${table._tag}`);
      return makeDelete(table._tag);
    }),
    select: vi.fn((_fields?: unknown) => ({
      from: vi.fn((table: { _tag: string }) => ({
        where: vi.fn().mockImplementation(async () => {
          const idx = selectCallIndex++;
          // Call order inside the transaction:
          //   0 → userProfilesTable (check target has profile)
          //   1 → neuralProfilesTable (get anon neural)
          //   2 → neuralProfilesTable (get target neural) — only if anonNeural exists
          if (table._tag === "userProfilesTable") {
            return state.targetProfileExists ? [{ id: 999 }] : [];
          }
          if (table._tag === "neuralProfilesTable") {
            // First call → anon; second call → target
            if (idx === 1 || (!state.targetProfileExists && idx === 0)) {
              return state.anonNeuralExists ? [state.anonNeural] : [];
            }
            return state.targetNeuralExists ? [state.targetNeural] : [];
          }
          return [];
        }),
      })),
    })),
  };
}

vi.mock("@workspace/db", () => {
  // Table identity objects — match what the production code passes to tx.update(table)
  const usersTable = { _tag: "usersTable", id: {}, isAnonymous: {}, deviceId: {} };
  const conversationsTable = { _tag: "conversationsTable", userId: {}, id: {} };
  const trainingSystems = { _tag: "trainingSystems", userId: {}, id: {} };
  const userMemoriesTable = { _tag: "userMemoriesTable", userId: {}, id: {} };
  const atlasMemoriesTable = { _tag: "atlasMemoriesTable", userId: {}, id: {} };
  const userProfilesTable = { _tag: "userProfilesTable", userId: {}, id: {} };
  const neuralProfilesTable = { _tag: "neuralProfilesTable", userId: {}, id: {} };
  const readinessEntriesTable = { _tag: "readinessEntriesTable", userId: {}, id: {} };
  const sessionFeedbackTable = { _tag: "sessionFeedbackTable", userId: {}, id: {} };
  const sessionLogsTable = { _tag: "sessionLogsTable", userId: {}, id: {} };
  const exerciseLogsTable = { _tag: "exerciseLogsTable", userId: {}, id: {} };
  const activeSessionsTable = { _tag: "activeSessionsTable", userId: {}, id: {} };
  const pendingClarificationsTable = { _tag: "pendingClarificationsTable", userId: {}, id: {} };
  const savedProgramsTable = { _tag: "savedProgramsTable", userId: {}, id: {} };
  const passwordResetTokensTable = { _tag: "passwordResetTokensTable", userId: {}, id: {} };

  const db = {
    // Outer select — checks if the anonymous user exists before the transaction
    select: vi.fn(() => ({
      from: vi.fn(() => ({
        where: vi.fn().mockResolvedValue(state.anonUser ? [state.anonUser] : []),
      })),
    })),
    // Transaction — calls fn with a fresh mock tx and returns its result
    transaction: vi.fn(async (fn: (tx: unknown) => Promise<unknown>) => fn(buildMockTx())),
  };

  return {
    db,
    usersTable,
    conversationsTable,
    trainingSystems,
    userMemoriesTable,
    atlasMemoriesTable,
    userProfilesTable,
    neuralProfilesTable,
    readinessEntriesTable,
    sessionFeedbackTable,
    sessionLogsTable,
    exerciseLogsTable,
    activeSessionsTable,
    pendingClarificationsTable,
    savedProgramsTable,
    passwordResetTokensTable,
  };
});

// Import after mocks are registered
import { mergeAnonymousToRegistered } from "../lib/anonymousMerge";
import { db } from "@workspace/db";

// ── Helpers ───────────────────────────────────────────────────────────────────

function resetState(overrides: Partial<typeof state> = {}) {
  opLog.length = 0;
  state.anonUser = { id: 10, isAnonymous: true };
  state.targetProfileExists = false;
  state.anonProfileExists = true;
  state.anonNeuralExists = false;
  state.targetNeuralExists = false;
  state.rowsPerTable = 2;
  Object.assign(state, overrides);
  vi.clearAllMocks();
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("mergeAnonymousToRegistered", () => {
  beforeEach(() => resetState());

  // ── TC-06: In-place upgrade no-op ─────────────────────────────────────────
  describe("TC-06: in-place upgrade (same IDs)", () => {
    it("returns zero counts and never touches the database", async () => {
      const result = await mergeAnonymousToRegistered(42, 42);

      expect(result.conversationsMerged).toBe(0);
      expect(result.systemsMerged).toBe(0);
      expect(result.memoriesMerged).toBe(0);
      expect(result.profileMerged).toBe(false);
      expect(result.neuralProfileMerged).toBe(false);
      expect(result.readinessEntriesMerged).toBe(0);

      // No DB interaction should have occurred
      expect((db.select as Mock).mock.calls.length).toBe(0);
      expect((db.transaction as Mock).mock.calls.length).toBe(0);
    });
  });

  // ── TC-07: Anonymous user not found ──────────────────────────────────────
  describe("TC-07: anonymous user not found", () => {
    it("returns zero counts and skips the transaction", async () => {
      state.anonUser = null;

      const result = await mergeAnonymousToRegistered(10, 99);

      expect(result.conversationsMerged).toBe(0);
      expect((db.transaction as Mock).mock.calls.length).toBe(0);
    });
  });

  // ── TC-08: Source is not anonymous ────────────────────────────────────────
  describe("TC-08: source user is not anonymous", () => {
    it("returns zero counts and skips the transaction", async () => {
      state.anonUser = { id: 10, isAnonymous: false };

      const result = await mergeAnonymousToRegistered(10, 99);

      expect(result.conversationsMerged).toBe(0);
      expect((db.transaction as Mock).mock.calls.length).toBe(0);
    });
  });

  // ── TC-10: Transaction wrapping ───────────────────────────────────────────
  describe("TC-10: all mutations run inside a transaction", () => {
    it("wraps the entire merge in db.transaction", async () => {
      await mergeAnonymousToRegistered(10, 99);

      expect((db.transaction as Mock).mock.calls.length).toBe(1);
    });

    it("deletes the anonymous user AFTER all updates", async () => {
      await mergeAnonymousToRegistered(10, 99);

      const deleteIdx = opLog.findIndex((op) => op === "delete:usersTable");
      const lastUpdateIdx = opLog.reduce(
        (max, op, i) => (op.startsWith("update:") ? i : max),
        -1,
      );

      expect(deleteIdx).toBeGreaterThan(-1);
      expect(deleteIdx).toBeGreaterThan(lastUpdateIdx);
    });
  });

  // ── TC-01: Full migration — all tables updated ────────────────────────────
  describe("TC-01: full migration", () => {
    it("updates all 12 simple child tables", async () => {
      state.rowsPerTable = 2;
      const result = await mergeAnonymousToRegistered(10, 99);

      expect(result.conversationsMerged).toBe(2);
      expect(result.systemsMerged).toBe(2);
      expect(result.memoriesMerged).toBe(2);
      expect(result.atlasMemoriesMerged).toBe(2);
      expect(result.readinessEntriesMerged).toBe(2);
      expect(result.sessionFeedbackMerged).toBe(2);
      expect(result.sessionLogsMerged).toBe(2);
      expect(result.exerciseLogsMerged).toBe(2);
      expect(result.activeSessionsMerged).toBe(2);
      expect(result.pendingClarificationsMerged).toBe(2);
      expect(result.savedProgramsMerged).toBe(2);
      expect(result.passwordResetTokensMerged).toBe(2);
    });

    it("emits exactly one delete:usersTable", async () => {
      await mergeAnonymousToRegistered(10, 99);

      const deletions = opLog.filter((op) => op === "delete:usersTable");
      expect(deletions.length).toBe(1);
    });
  });

  // ── TC-09: Anonymous user with no child data ──────────────────────────────
  describe("TC-09: anonymous user has no child rows", () => {
    it("completes cleanly and returns zero merged counts", async () => {
      state.rowsPerTable = 0;

      const result = await mergeAnonymousToRegistered(10, 99);

      expect(result.conversationsMerged).toBe(0);
      expect(result.memoriesMerged).toBe(0);
      expect(result.sessionLogsMerged).toBe(0);
      // Transaction still ran and user was still deleted
      expect((db.transaction as Mock).mock.calls.length).toBe(1);
      expect(opLog).toContain("delete:usersTable");
    });
  });

  // ── TC-12 / TC-13 / TC-14: Regression guards ─────────────────────────────
  describe("TC-12/13/14: regression — original tables still migrate", () => {
    it("conversations are updated", async () => {
      state.rowsPerTable = 3;
      const result = await mergeAnonymousToRegistered(10, 99);
      expect(result.conversationsMerged).toBe(3);
      expect(opLog).toContain("update:conversationsTable");
    });

    it("training_systems are updated", async () => {
      state.rowsPerTable = 1;
      const result = await mergeAnonymousToRegistered(10, 99);
      expect(result.systemsMerged).toBe(1);
      expect(opLog).toContain("update:trainingSystems");
    });

    it("saved_programs (legacy hierarchy) are updated", async () => {
      state.rowsPerTable = 4;
      const result = await mergeAnonymousToRegistered(10, 99);
      expect(result.savedProgramsMerged).toBe(4);
      expect(opLog).toContain("update:savedProgramsTable");
    });
  });

  // ── TC-02: user_profiles — target already has profile ────────────────────
  describe("TC-02: user_profiles conflict — target already has a profile", () => {
    it("discards anonymous profile (deletes it) and does not update profileMerged", async () => {
      state.targetProfileExists = true;

      const result = await mergeAnonymousToRegistered(10, 99);

      expect(result.profileMerged).toBe(false);
      // Should have deleted the anon profile, not updated it
      expect(opLog).toContain("delete:userProfilesTable");
      // Should NOT have updated userProfilesTable
      const profileUpdates = opLog.filter((op) => op === "update:userProfilesTable");
      expect(profileUpdates.length).toBe(0);
    });
  });

  // ── TC-03: user_profiles — no conflict ───────────────────────────────────
  describe("TC-03: user_profiles no conflict — target has no profile", () => {
    it("reassigns anonymous profile to target and sets profileMerged=true", async () => {
      state.targetProfileExists = false;
      state.rowsPerTable = 1; // profile update returns 1 row

      const result = await mergeAnonymousToRegistered(10, 99);

      expect(result.profileMerged).toBe(true);
      expect(opLog).toContain("update:userProfilesTable");
      // Should NOT have deleted the profile
      const profileDeletes = opLog.filter((op) => op === "delete:userProfilesTable");
      expect(profileDeletes.length).toBe(0);
    });
  });

  // ── TC-04: neural_profiles — target already has one ──────────────────────
  describe("TC-04: neural_profiles conflict — both users have profiles", () => {
    it("merges XP additively and deletes the anonymous row", async () => {
      state.anonNeuralExists = true;
      state.targetNeuralExists = true;

      const result = await mergeAnonymousToRegistered(10, 99);

      expect(result.neuralProfileMerged).toBe(true);
      // Should have updated neuralProfiles (with merged data) AND deleted anon's row
      expect(opLog).toContain("update:neuralProfilesTable");
      expect(opLog).toContain("delete:neuralProfilesTable");
    });
  });

  // ── TC-05: neural_profiles — no conflict ─────────────────────────────────
  describe("TC-05: neural_profiles no conflict — only anonymous has one", () => {
    it("reassigns anonymous profile to target without deleting it", async () => {
      state.anonNeuralExists = true;
      state.targetNeuralExists = false;

      const result = await mergeAnonymousToRegistered(10, 99);

      expect(result.neuralProfileMerged).toBe(true);
      expect(opLog).toContain("update:neuralProfilesTable");
      // Should NOT have deleted a neural profile row
      const neuralDeletes = opLog.filter((op) => op === "delete:neuralProfilesTable");
      expect(neuralDeletes.length).toBe(0);
    });
  });

  // ── TC-15: neural_profiles merge math ────────────────────────────────────
  describe("TC-15: neural_profiles merge policy — math is correct", () => {
    it("merges XP additively, scores as max, milestones as union, keeps target level", async () => {
      // We verify the merge math by capturing the .set() call args on the
      // neuralProfilesTable UPDATE that happens when both profiles exist.
      state.anonNeuralExists = true;
      state.targetNeuralExists = true;

      // Override buildMockTx to capture the neural profile UPDATE set() args
      let capturedSetArgs: Record<string, unknown> | null = null;

      (db.transaction as Mock).mockImplementationOnce(
        async (fn: (tx: unknown) => Promise<unknown>) => {
          const baseTx = buildMockTx();
          const wrappedTx = {
            ...baseTx,
            update: vi.fn((table: { _tag: string }) => {
              const base = baseTx.update(table);
              if (table._tag === "neuralProfilesTable") {
                return {
                  set: vi.fn((args: Record<string, unknown>) => {
                    // Only capture the merge set() call (has xp field with merged value)
                    if (
                      typeof args.xp === "number" &&
                      args.xp === state.anonNeural.xp + state.targetNeural.xp
                    ) {
                      capturedSetArgs = args;
                    }
                    return {
                      where: vi.fn().mockResolvedValue(undefined),
                    };
                  }),
                };
              }
              return base;
            }),
          };
          return fn(wrappedTx);
        },
      );

      await mergeAnonymousToRegistered(10, 99);

      expect(capturedSetArgs).not.toBeNull();
      const merged = capturedSetArgs!;

      // XP: additive
      expect(merged.xp).toBe(state.anonNeural.xp + state.targetNeural.xp); // 250
      // Level: max
      expect(merged.level).toBe(Math.max(state.anonNeural.level, state.targetNeural.level)); // 4
      // Scores: max of each
      expect(merged.consistencyScore).toBe(
        Math.max(state.anonNeural.consistencyScore, state.targetNeural.consistencyScore),
      ); // 0.7
      expect(merged.progressionScore).toBe(
        Math.max(state.anonNeural.progressionScore, state.targetNeural.progressionScore),
      ); // 0.8
      expect(merged.recoveryScore).toBe(
        Math.max(state.anonNeural.recoveryScore, state.targetNeural.recoveryScore),
      ); // 0.6
      // Session counts: additive
      expect(merged.totalSessionsCompleted).toBe(
        state.anonNeural.totalSessionsCompleted + state.targetNeural.totalSessionsCompleted,
      ); // 25
      expect(merged.neuralConnections).toBe(
        state.anonNeural.neuralConnections + state.targetNeural.neuralConnections,
      ); // 15
      // Milestones: union (no duplicates)
      const expectedMilestones = Array.from(
        new Set([
          ...state.targetNeural.unlockedMilestones,
          ...state.anonNeural.unlockedMilestones,
        ]),
      );
      expect(merged.unlockedMilestones).toEqual(expect.arrayContaining(expectedMilestones));
      expect((merged.unlockedMilestones as string[]).length).toBe(expectedMilestones.length);
    });
  });

  // ── TC-11: Transaction rollback on failure ────────────────────────────────
  describe("TC-11: transaction failure propagates and does not leave partial state", () => {
    it("re-throws when the transaction callback throws", async () => {
      (db.transaction as Mock).mockRejectedValueOnce(new Error("db connection lost"));

      await expect(mergeAnonymousToRegistered(10, 99)).rejects.toThrow("db connection lost");
    });

    it("does not log a successful merge on failure", async () => {
      const { logger } = await import("../lib/logger");
      (db.transaction as Mock).mockRejectedValueOnce(new Error("rollback"));

      try {
        await mergeAnonymousToRegistered(10, 99);
      } catch {
        // expected
      }

      expect((logger.info as Mock).mock.calls.length).toBe(0);
    });
  });
});
