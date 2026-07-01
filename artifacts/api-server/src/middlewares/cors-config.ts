import cors from "cors";

/**
 * Build the set of origins that may make credentialed cross-origin requests.
 *
 * Evaluated once at module load (server start). A restart is required to pick
 * up env-var changes — consistent with how every other env-backed config works
 * in this codebase.
 *
 * Always included:
 *   https://trainchat.ai
 *   https://www.trainchat.ai
 *
 * From env vars (if set):
 *   CLIENT_URL        — Stripe portal return URL / email CTA base
 *   APP_URL           — Password-reset email base
 *   REPLIT_DOMAINS    — Comma-separated Replit preview domains
 *   REPLIT_DEV_DOMAIN — Replit workspace dev tunnel domain
 *
 * In non-production only:
 *   http://localhost:<common ports>  — local Vite dev server
 */
export function buildAllowedOrigins(): Set<string> {
  const origins = new Set<string>([
    "https://trainchat.ai",
    "https://www.trainchat.ai",
  ]);

  const { CLIENT_URL, APP_URL, REPLIT_DOMAINS, REPLIT_DEV_DOMAIN, NODE_ENV } =
    process.env;

  if (CLIENT_URL) origins.add(CLIENT_URL.replace(/\/$/, ""));
  if (APP_URL) origins.add(APP_URL.replace(/\/$/, ""));

  if (REPLIT_DOMAINS) {
    for (const domain of REPLIT_DOMAINS.split(",")) {
      const d = domain.trim();
      if (d) origins.add(`https://${d}`);
    }
  }

  if (REPLIT_DEV_DOMAIN) {
    origins.add(`https://${REPLIT_DEV_DOMAIN.trim()}`);
  }

  if (NODE_ENV !== "production") {
    // Common local Vite and Express ports — PORT env var drives the actual
    // port in Replit/dev, so we cover the typical range rather than one value.
    for (const port of [3000, 5173, 4173, 8080]) {
      origins.add(`http://localhost:${port}`);
      origins.add(`http://127.0.0.1:${port}`);
    }
  }

  return origins;
}

const allowedOrigins = buildAllowedOrigins();

export const corsMiddleware = cors({
  origin(requestOrigin, callback) {
    // No Origin header → server-to-server or same-origin request (e.g. curl,
    // Stripe webhook, internal health checks, API tools). Allow unconditionally:
    // the browser is not present, so CORS headers are irrelevant and blocking
    // these would break non-browser callers.
    if (!requestOrigin) {
      callback(null, true);
      return;
    }

    if (allowedOrigins.has(requestOrigin)) {
      callback(null, true);
    } else {
      callback(new Error(`CORS: origin '${requestOrigin}' is not in the allowlist`));
    }
  },
  credentials: true,
});
