import session from "express-session";
import connectPgSimple from "connect-pg-simple";
import { pool } from "@workspace/db";
import { logger } from "./logger";

if (!process.env.SESSION_SECRET) {
  throw new Error("SESSION_SECRET environment variable is required");
}

const PgSession = connectPgSimple(session);

const store = new PgSession({
  pool,
  tableName: "user_sessions",
  createTableIfMissing: true,
  errorLog: (...args: unknown[]) =>
    logger.error({ args }, "session store error"),
});

// Detect whether we are running behind an HTTPS-terminating proxy.
// On Replit, REPLIT_DOMAINS is always set (dev and prod), and all traffic
// arrives over HTTPS via the Replit reverse proxy. In production the
// NODE_ENV will be "production". Either condition means we need Secure
// cookies and SameSite=none so that cross-context cookie delivery works
// correctly (especially on iOS Safari / WebKit ITP).
const isHttpsContext =
  process.env.NODE_ENV === "production" ||
  Boolean(process.env.REPLIT_DOMAINS);

export const sessionMiddleware = session({
  store,
  secret: process.env.SESSION_SECRET,
  resave: false,
  saveUninitialized: false,
  cookie: {
    secure: isHttpsContext,
    httpOnly: true,
    maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
    sameSite: isHttpsContext ? "none" : "lax",
    path: "/",
  },
});

declare module "express-session" {
  interface SessionData {
    userId: number;
  }
}
