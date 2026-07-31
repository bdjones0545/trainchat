import { describe, it, expect } from "vitest";
import {
  KEVIN_RETRY_DELAYS_MS,
  KEVIN_MAX_RETRIES,
  kevinNextRetryDelay,
  kevinShouldDeadLetter,
  isKevinLocalNonRetryCode,
} from "../kevin-retry";

const S = 1000;
const M = 60 * S;

describe("kevin retry schedule (M2)", () => {
  it("first retry is 30 seconds (the previously-skipped slot)", () => {
    expect(kevinNextRetryDelay(1)).toBe(30 * S);
  });

  it("follows the documented schedule 30s → 2m → 8m → 30m → 2h", () => {
    expect(kevinNextRetryDelay(1)).toBe(30 * S);
    expect(kevinNextRetryDelay(2)).toBe(2 * M);
    expect(kevinNextRetryDelay(3)).toBe(8 * M);
    expect(kevinNextRetryDelay(4)).toBe(30 * M);
    expect(kevinNextRetryDelay(5)).toBe(120 * M); // 2 hours
  });

  it("dead-letters only after all 5 scheduled retries are exhausted", () => {
    // failures 1..5 → still retrying; failure 6 → dead-letter
    expect(kevinShouldDeadLetter(1)).toBe(false);
    expect(kevinShouldDeadLetter(4)).toBe(false);
    expect(kevinShouldDeadLetter(5)).toBe(false);
    expect(kevinShouldDeadLetter(6)).toBe(true);
    expect(KEVIN_MAX_RETRIES).toBe(5);
    expect(KEVIN_RETRY_DELAYS_MS).toHaveLength(5);
  });

  it("clamps out-of-range attempt counts safely", () => {
    expect(kevinNextRetryDelay(0)).toBe(30 * S); // never negative index
    expect(kevinNextRetryDelay(99)).toBe(120 * M); // clamps to last delay
  });
});

describe("local/config failures do not consume retry budget (M2)", () => {
  it("treats KEVIN_NOT_CONFIGURED / KEVIN_CIRCUIT_OPEN / KEVIN_DISABLED as local", () => {
    expect(isKevinLocalNonRetryCode("KEVIN_NOT_CONFIGURED")).toBe(true);
    expect(isKevinLocalNonRetryCode("KEVIN_CIRCUIT_OPEN")).toBe(true);
    expect(isKevinLocalNonRetryCode("KEVIN_DISABLED")).toBe(true);
  });

  it("treats genuine dispatch failures as retryable (not local)", () => {
    expect(isKevinLocalNonRetryCode("KEVIN_HTTP")).toBe(false);
    expect(isKevinLocalNonRetryCode("KEVIN_TIMEOUT")).toBe(false);
    expect(isKevinLocalNonRetryCode("KEVIN_UNAVAILABLE")).toBe(false);
    expect(isKevinLocalNonRetryCode("KEVIN_AUTH")).toBe(false);
    expect(isKevinLocalNonRetryCode(undefined)).toBe(false);
  });
});
