import express, { type Express, type Request, type Response, type NextFunction } from "express";
import cors from "cors";
import pinoHttp from "pino-http";
import router from "./routes";
import { logger } from "./lib/logger";
import { sessionMiddleware } from "./lib/session";
import { WebhookHandlers } from "./lib/webhookHandlers";
import { db, usersTable } from "@workspace/db";
import { and, eq } from "drizzle-orm";

const app: Express = express();

// Trust the Replit reverse proxy so that secure cookies and real IPs work
// correctly in production. Without this, Express sees all connections as HTTP
// even though they arrive over HTTPS via the proxy.
app.set("trust proxy", 1);

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

app.use("/api", router);

export default app;
