import { describe, it, expect, vi, beforeEach } from "vitest";

// getKevinConfig is the only dependency of the pseudonym module — mock it so we
// can drive the pseudonymSalt value.
vi.mock("../kevin-config", () => ({
  getKevinConfig: vi.fn(),
}));

import { getKevinConfig } from "../kevin-config";
import {
  deriveKevinPseudonymousId,
  deriveKevinPseudonymousOrgId,
  deriveKevinLocalUserScope,
  KevinPseudonymSaltMissingError,
} from "../kevin-pseudonym";

const mockCfg = vi.mocked(getKevinConfig);
const withSalt = (salt: string | null) => mockCfg.mockReturnValue({ pseudonymSalt: salt } as any);

describe("kevin-pseudonym — exported identifiers (H1)", () => {
  beforeEach(() => mockCfg.mockReset());

  it("throws KevinPseudonymSaltMissingError when the salt is unset", () => {
    withSalt(null);
    expect(() => deriveKevinPseudonymousId(1)).toThrow(KevinPseudonymSaltMissingError);
    expect(() => deriveKevinPseudonymousOrgId("org")).toThrow(KevinPseudonymSaltMissingError);
  });

  it("never emits the predictable fallback token for exported ids", () => {
    withSalt(null);
    try {
      deriveKevinPseudonymousId(1);
      throw new Error("expected throw");
    } catch (err) {
      expect((err as Error).message).not.toContain("fallback");
    }
  });

  it("derives a stable, distinct, opaque id per user when the salt is set", () => {
    withSalt("real-secret-salt");
    const a1 = deriveKevinPseudonymousId(1);
    const a2 = deriveKevinPseudonymousId(1);
    const b = deriveKevinPseudonymousId(2);
    expect(a1).toBe(a2); // deterministic
    expect(a1).not.toBe(b); // distinct per user
    expect(a1).toMatch(/^tc_u_[0-9a-f]{32}$/);
    // Opaque HMAC digest — the raw numeric id is not embedded as its own segment.
    expect(a1.slice("tc_u_".length)).not.toContain(":user:");
  });

  it("changing the salt changes the derived id (salt is actually keyed)", () => {
    withSalt("salt-A");
    const a = deriveKevinPseudonymousId(7);
    withSalt("salt-B");
    const b = deriveKevinPseudonymousId(7);
    expect(a).not.toBe(b);
  });
});

describe("kevin-pseudonym — local scope keys (never exported)", () => {
  beforeEach(() => mockCfg.mockReset());

  it("tolerates a missing salt (consent must keep working while Kevin is off)", () => {
    withSalt(null);
    expect(() => deriveKevinLocalUserScope(1)).not.toThrow();
    expect(deriveKevinLocalUserScope(1)).toMatch(/^tc_u_[0-9a-f]{32}$/);
  });

  it("is deterministic with and without a salt", () => {
    withSalt(null);
    expect(deriveKevinLocalUserScope(5)).toBe(deriveKevinLocalUserScope(5));
    withSalt("real-secret-salt");
    expect(deriveKevinLocalUserScope(5)).toBe(deriveKevinLocalUserScope(5));
  });

  it("matches the exported pseudonym when the real salt is configured", () => {
    withSalt("real-secret-salt");
    expect(deriveKevinLocalUserScope(9)).toBe(deriveKevinPseudonymousId(9));
  });
});
