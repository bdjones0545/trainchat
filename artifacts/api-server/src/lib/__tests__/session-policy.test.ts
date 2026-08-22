import { describe, expect, it } from "vitest";
import { resolveSessionPolicy } from "../session-policy";

describe("session cookie and proxy policy", () => {
  it("uses browser-testable cookies for isolated local HTTP", () => {
    expect(resolveSessionPolicy({ NODE_ENV: "development" })).toEqual({
      cookieSecure: false,
      cookieSameSite: "lax",
      trustProxy: false,
    });
  });

  it("preserves Secure SameSite=None cookies in production", () => {
    expect(resolveSessionPolicy({ NODE_ENV: "production" })).toEqual({
      cookieSecure: true,
      cookieSameSite: "none",
      trustProxy: false,
    });
  });

  it("trusts exactly one proxy hop for Replit HTTPS termination", () => {
    expect(resolveSessionPolicy({
      NODE_ENV: "development",
      REPLIT_DOMAINS: "trainchat.example.replit.app",
    })).toEqual({
      cookieSecure: true,
      cookieSameSite: "none",
      trustProxy: 1,
    });
  });

  it("requires an explicit opt-in for a non-Replit proxy", () => {
    expect(resolveSessionPolicy({
      NODE_ENV: "development",
      SESSION_TRUST_PROXY: "1",
    })).toEqual({
      cookieSecure: false,
      cookieSameSite: "lax",
      trustProxy: 1,
    });
  });
});
