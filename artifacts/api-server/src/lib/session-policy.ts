export interface SessionEnvironment {
  NODE_ENV?: string;
  REPLIT_DOMAINS?: string;
  SESSION_TRUST_PROXY?: string;
}

export interface SessionPolicy {
  cookieSecure: boolean;
  cookieSameSite: "lax" | "none";
  trustProxy: boolean | number;
}

/**
 * Resolve cookie and proxy policy without weakening production for local HTTP.
 *
 * Replit is an HTTPS-terminating single-hop proxy. Other deployments must opt
 * in explicitly with SESSION_TRUST_PROXY=1 after validating their topology.
 * Local HTTP remains non-Secure/SameSite=Lax so real browser sessions can be
 * exercised through the same-origin Vite proxy.
 */
export function resolveSessionPolicy(env: SessionEnvironment): SessionPolicy {
  const replitProxy = Boolean(env.REPLIT_DOMAINS?.trim());
  const explicitTrustedProxy = env.SESSION_TRUST_PROXY === "1";
  const production = env.NODE_ENV === "production";
  const cookieSecure = production || replitProxy;

  return {
    cookieSecure,
    cookieSameSite: cookieSecure ? "none" : "lax",
    trustProxy: replitProxy || explicitTrustedProxy ? 1 : false,
  };
}
