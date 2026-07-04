/**
 * external-materialization-serialization.test.ts
 *
 * Unit tests for the Phase 2.6 per-key serialization lock.
 */

import { describe, it, expect, vi } from "vitest";
import {
  withExternalProgramLock,
  activeLockKeyCount,
} from "../external-materialization/serialization";

const tick = () => new Promise((r) => setTimeout(r, 5));

describe("withExternalProgramLock", () => {
  it("LOCK-01: serializes operations on the same key (no interleaving)", async () => {
    const events: string[] = [];
    const op = (id: string) =>
      withExternalProgramLock("100", async () => {
        events.push(`${id}:start`);
        await tick();
        events.push(`${id}:end`);
      });

    await Promise.all([op("A"), op("B")]);

    // Whichever ran first must fully finish before the other starts.
    const first = events[0].split(":")[0];
    const second = first === "A" ? "B" : "A";
    expect(events).toEqual([`${first}:start`, `${first}:end`, `${second}:start`, `${second}:end`]);
  });

  it("LOCK-02: different keys run concurrently", async () => {
    const events: string[] = [];
    const op = (key: string) =>
      withExternalProgramLock(key, async () => {
        events.push(`${key}:start`);
        await tick();
        events.push(`${key}:end`);
      });

    await Promise.all([op("1"), op("2")]);

    // Both start before either ends (interleaved) — distinct keys don't block.
    expect(events.slice(0, 2).sort()).toEqual(["1:start", "2:start"]);
  });

  it("LOCK-03: releases and cleans up even when the operation throws", async () => {
    await expect(
      withExternalProgramLock("err", async () => {
        throw new Error("boom");
      }),
    ).rejects.toThrow("boom");

    // A subsequent op on the same key still runs.
    const ran = vi.fn();
    await withExternalProgramLock("err", async () => {
      ran();
    });
    expect(ran).toHaveBeenCalledTimes(1);
    // No key leak after all ops drain.
    expect(activeLockKeyCount()).toBe(0);
  });

  it("LOCK-04: a later waiter observes writes made by the earlier holder", async () => {
    let shared = 0;
    const first = withExternalProgramLock("s", async () => {
      await tick();
      shared = 42;
    });
    const second = withExternalProgramLock("s", async () => shared);
    const [, secondValue] = await Promise.all([first, second]);
    expect(secondValue).toBe(42);
  });
});
