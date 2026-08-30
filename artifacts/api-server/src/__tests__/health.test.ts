import express from "express";
import request from "supertest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { query } = vi.hoisted(() => ({ query: vi.fn() }));

vi.mock("@workspace/db", () => ({
  pool: { query },
}));

import healthRouter from "../routes/health";

const app = express().use("/api", healthRouter);
const requiredEnvironment = {
  DATABASE_URL: "postgresql://localhost/test",
  PORT: "8080",
  SESSION_SECRET: "test-session-secret",
  STRIPE_SECRET_KEY: "sk_test_placeholder",
  STRIPE_WEBHOOK_SECRET: "whsec_placeholder",
  OPENAI_API_KEY: "test-provider-key",
};

describe("operational health", () => {
  beforeEach(() => {
    query.mockReset().mockResolvedValue({
      rows: [{ stripe_accounts: "stripe.accounts" }],
    });
    Object.assign(process.env, requiredEnvironment);
  });

  afterEach(() => {
    for (const name of Object.keys(requiredEnvironment)) delete process.env[name];
  });

  it("keeps liveness independent of dependencies", async () => {
    query.mockRejectedValue(new Error("database unavailable"));
    const response = await request(app).get("/api/healthz");
    expect(response.status).toBe(200);
    expect(response.body).toEqual({ status: "ok" });
  });

  it("reports ready only when database and required integrations are available", async () => {
    const response = await request(app).get("/api/readyz");
    expect(response.status).toBe(200);
    expect(response.body.status).toBe("ready");
    expect(response.body.checks).toEqual({
      databaseReachable: true,
      billingSchemaReady: true,
      requiredConfig: true,
      providerConfigured: true,
    });
  });

  it("fails readiness when the managed billing schema is incomplete", async () => {
    query.mockResolvedValue({ rows: [{ stripe_accounts: null }] });
    const response = await request(app).get("/api/readyz");
    expect(response.status).toBe(503);
    expect(response.body.checks.billingSchemaReady).toBe(false);
  });

  it("fails readiness closed without exposing configuration values", async () => {
    delete process.env.OPENAI_API_KEY;
    query.mockRejectedValue(new Error("database unavailable: secret detail"));
    const response = await request(app).get("/api/readyz");
    expect(response.status).toBe(503);
    expect(response.body.status).toBe("not_ready");
    expect(JSON.stringify(response.body)).not.toContain("secret detail");
  });
});
