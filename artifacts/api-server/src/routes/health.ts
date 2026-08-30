import { Router, type IRouter } from "express";
import { HealthCheckResponse } from "@workspace/api-zod";
import { pool } from "@workspace/db";

const router: IRouter = Router();

router.get("/healthz", (_req, res) => {
  const data = HealthCheckResponse.parse({ status: "ok" });
  res.json(data);
});

router.get("/readyz", async (_req, res) => {
  const requiredConfig = [
    "DATABASE_URL",
    "PORT",
    "SESSION_SECRET",
    "STRIPE_SECRET_KEY",
    "STRIPE_WEBHOOK_SECRET",
  ].every((name) => Boolean(process.env[name]?.trim()));
  const providerConfigured = Boolean(
    process.env.OPENAI_API_KEY?.trim() ||
      process.env.AI_INTEGRATIONS_OPENAI_API_KEY?.trim(),
  );

  let databaseReachable = false;
  let billingSchemaReady = false;
  try {
    const result = await pool.query(
      "select to_regclass('stripe.accounts') as stripe_accounts",
    );
    databaseReachable = true;
    billingSchemaReady = Boolean(result.rows[0]?.stripe_accounts);
  } catch {
    // Readiness fails closed; details belong in server logs, not the response.
  }

  const ready =
    requiredConfig && providerConfigured && databaseReachable && billingSchemaReady;
  res.status(ready ? 200 : 503).json({
    status: ready ? "ready" : "not_ready",
    checks: {
      databaseReachable,
      billingSchemaReady,
      requiredConfig,
      providerConfigured,
    },
    version:
      process.env.REPLIT_DEPLOYMENT_ID ??
      process.env.GIT_COMMIT_SHA ??
      "unknown",
  });
});

export default router;
