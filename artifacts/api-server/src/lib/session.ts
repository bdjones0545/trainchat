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

export const sessionMiddleware = session({
  store,
  secret: process.env.SESSION_SECRET,
  resave: false,
  saveUninitialized: false,
  cookie: {
    secure: process.env.NODE_ENV === "production",
    httpOnly: true,
    maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
    sameSite: process.env.NODE_ENV === "production" ? "none" : "lax",
  },
});

declare module "express-session" {
  interface SessionData {
    userId: number;
  }
}
