import express, { type Express, type Request, type Response, type NextFunction } from "express";
import cors from "cors";
import helmet from "helmet";
import pinoHttp from "pino-http";
import router from "./routes";
import { logger } from "./lib/logger";
import { sessionMiddleware } from "./lib/session";
import { WebhookHandlers } from "./lib/webhookHandlers";
import { db, usersTable } from "@workspace/db";
import { and, eq } from "drizzle-orm";
import { startWhitepaperCron } from "./lib/whitepaper-cron";
import { Sentry, sentryEnabled, captureWithTags, setSentryUser, generateRequestId } from "./lib/sentry";

const app: Express = express();

// Trust the Replit reverse proxy so that secure cookies and real IPs work
// correctly in production. Without this, Express sees all connections as HTTP
// even though they arrive over HTTPS via the proxy.
app.set("trust proxy", 1);

// Security headers via Helmet. Applied globally before any route handler.
// CSP is disabled because the API server serves JSON only — no HTML documents.
// crossOriginEmbedderPolicy is disabled to avoid breaking Replit's preview iframe.
app.use(helmet({
  contentSecurityPolicy: false,
  crossOriginEmbedderPolicy: false,
}));

// Attach a unique request ID to every request before any other middleware runs.
// The ID is written to the X-Request-ID response header and added to the Sentry
// scope so errors can be correlated with specific requests in logs.
app.use((req: Request, res: Response, next: NextFunction): void => {
  const requestId = generateRequestId();
  (req as Request & { requestId: string }).requestId = requestId;
  res.setHeader("X-Request-ID", requestId);
  next();
});

app.use(
  pinoHttp({
    logger,
    serializers: {
      req(req) {
        return {
          id: req.id,
          method: req.method,
          url: req.url?.split("?")[0],
        };
      },
      res(res) {
        return {
          statusCode: res.statusCode,
        };
      },
    },
  }),
);

app.use(cors({ origin: true, credentials: true }));

app.post(
  "/api/stripe/webhook",
  express.raw({ type: "application/json" }),
  async (req, res) => {
    const signature = req.headers["stripe-signature"];
    if (!signature) {
      res.status(400).json({ error: "Missing stripe-signature header" });
      return;
    }
    try {
      const sig = Array.isArray(signature) ? signature[0] : signature;
      await WebhookHandlers.processWebhook(req.body as Buffer, sig);
      res.status(200).json({ received: true });
    } catch (err: any) {
      logger.error({ err }, "Stripe webhook error");
      captureWithTags(err, { subsystem: "stripe_webhook", endpoint: "/api/stripe/webhook" });
      res.status(400).json({ error: "Webhook processing error" });
    }
  }
);

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(sessionMiddleware);

/**
 * Anonymous user fallback: if the request has no session userId but carries an
 * X-Device-Id header, look up the matching anonymous user and attach their ID
 * to the session for this request only (not persisted).
 *
 * This allows anonymous users to be authenticated via their device ID even
 * when session cookies are blocked (e.g. HTTP dev environment, strict browsers).
 * Registered user sessions always take precedence because they're checked first.
 */
app.use(async (req: Request, _res: Response, next: NextFunction): Promise<void> => {
  if (req.session?.userId) {
    next();
    return;
  }

  const rawDeviceId = req.headers["x-device-id"];
  const deviceId = typeof rawDeviceId === "string" ? rawDeviceId.trim() : undefined;

  if (!deviceId) {
    next();
    return;
  }

  try {
    const [user] = await db
      .select({ id: usersTable.id })
      .from(usersTable)
      .where(and(eq(usersTable.deviceId, deviceId), eq(usersTable.isAnonymous, true)));

    if (user) {
      req.session.userId = user.id;
    }
  } catch (err) {
    logger.warn({ err, deviceId }, "device-id auth fallback: DB lookup failed — skipping");
  }

  next();
});

// Set Sentry user context from the resolved session once all auth middleware
// has run. This ensures every subsequent error captured in this request is
// tagged with the user ID (authenticated or anonymous).
app.use((req: Request, _res: Response, next: NextFunction): void => {
  const r = req as Request & { requestId?: string };
  const userId = req.session?.userId;
  setSentryUser(userId);
  if (sentryEnabled && r.requestId) {
    Sentry.withScope((scope) => {
      scope.setTag("request_id", r.requestId!);
      if (userId !== undefined) scope.setTag("user_id", String(userId));
    });
  }
  next();
});

app.use("/api", router);

// Sentry's Express error handler — must be registered AFTER all routes.
// Captures any error passed to next(err) or thrown from async route handlers.
// Only registered when Sentry is enabled to avoid adding middleware overhead
// in environments without a DSN.
if (sentryEnabled) {
  Sentry.setupExpressErrorHandler(app);
}

// Final fallback error handler — returns a JSON error rather than Express's
// default HTML response. Runs after Sentry so the event is already captured.
app.use((err: Error, _req: Request, res: Response, _next: NextFunction): void => {
  logger.error({ err }, "[GlobalErrorHandler] Unhandled Express error");
  res.status(500).json({ error: "Internal server error" });
});

startWhitepaperCron();

export default app;
