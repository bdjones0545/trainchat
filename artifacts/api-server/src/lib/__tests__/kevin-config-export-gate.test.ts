import { describe, it, expect } from "vitest";
import {
  assertKevinExportConfig,
  kevinExportsPseudonyms,
  type KevinConfig,
} from "../kevin-config";

// Build a config object directly (assertKevinExportConfig accepts one), so this
// test needs no env / singleton juggling.
function cfg(over: Partial<KevinConfig>): KevinConfig {
  return {
    integrationEnabled: true,
    contextRetrievalEnabled: false,
    eventDispatchEnabled: false,
    outcomeForwardingEnabled: false,
    signalIntakeEnabled: false,
    hermesBaseUrl: null,
    hermesApiKey: null,
    internalServiceToken: null,
    applicationId: "trainchat",
    pseudonymSalt: null,
    contextTimeoutMs: 3000,
    eventTimeoutMs: 5000,
    healthTimeoutMs: 2000,
    maxContextMemories: 10,
    maxContextResponseBytes: 16384,
    ...over,
  };
}

describe("assertKevinExportConfig (H1 boot gate)", () => {
  const exportFlags = [
    "contextRetrievalEnabled",
    "eventDispatchEnabled",
    "outcomeForwardingEnabled",
  ] as const;

  for (const flag of exportFlags) {
    it(`throws when ${flag} is on but no salt is configured`, () => {
      expect(() => assertKevinExportConfig(cfg({ [flag]: true, pseudonymSalt: null }))).toThrow(
        /KEVIN_PSEUDONYM_SALT/,
      );
    });

    it(`passes when ${flag} is on and a salt is configured`, () => {
      expect(() =>
        assertKevinExportConfig(cfg({ [flag]: true, pseudonymSalt: "secret" })),
      ).not.toThrow();
    });
  }

  it("does NOT throw for integration-enabled alone (no export sub-flags, no salt)", () => {
    expect(() => assertKevinExportConfig(cfg({ pseudonymSalt: null }))).not.toThrow();
    expect(kevinExportsPseudonyms(cfg({}))).toBe(false);
  });

  it("does NOT throw for signal intake only (inbound, does not export pseudonyms)", () => {
    expect(() =>
      assertKevinExportConfig(cfg({ signalIntakeEnabled: true, pseudonymSalt: null })),
    ).not.toThrow();
  });

  it("kevinExportsPseudonyms reflects only the three export flags", () => {
    expect(kevinExportsPseudonyms(cfg({ contextRetrievalEnabled: true }))).toBe(true);
    expect(kevinExportsPseudonyms(cfg({ eventDispatchEnabled: true }))).toBe(true);
    expect(kevinExportsPseudonyms(cfg({ outcomeForwardingEnabled: true }))).toBe(true);
    expect(kevinExportsPseudonyms(cfg({ signalIntakeEnabled: true }))).toBe(false);
  });
});
