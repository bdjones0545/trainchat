/**
 * External API Authentication Middleware
 *
 * Validates Bearer tokens of the form `tc_<64 hex chars>` against hashed keys
 * stored in the external_api_keys table.
 *
 * Usage:
 *   router.post("/some-endpoint", validateExternalApiKey(["generate_program"]), handler)
 *
 * Security guarantees:
 *   - Raw keys are NEVER stored in the DB
 *   - Keys are compared via SHA-256 hash (constant-time comparison not required
 *     for API keys since hashes don't leak timing info for 64-char random strings)
 *   - Revoked and expired keys are rejected
 *   - Inactive keys are rejected
 *   - Rate limiting is enforced per key before the handler runs
 */

import { type Request, type Response, type NextFunction } from "express";
import { createHash } from "crypto";
import { db, externalApiKeysTable, externalApiLogsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import type { ExternalApiKey, ExternalApiPermission } from "@workspace/db";
import { checkRateLimit } from "../lib/external-api-rate-limiter";
import { logger } from "../lib/logger";

declare global {
  namespace Express {
    interface Request {
      apiKey?: ExternalApiKey;
      apiKeyId?: number;
    }
  }
}

export function hashApiKey(rawKey: string): string {
  return createHash("sha256").update(rawKey).digest("hex");
}

export function validateExternalApiKey(requiredPermissions: ExternalApiPermission[] = []) {
  return async function (req: Request, res: Response, next: NextFunction): Promise<void> {
    const startTime = Date.now();

    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      res.status(401).json({
        success: false,
        error: {
          code: "MISSING_API_KEY",
          message: "Authorization header with Bearer token is required.",
        },
      });
      return;
    }

    const rawKey = authHeader.slice(7).trim();

    if (!rawKey.startsWith("tc_") || rawKey.length < 10) {
      res.status(401).json({
        success: false,
        error: {
          code: "INVALID_API_KEY_FORMAT",
          message: "API key must begin with 'tc_'.",
        },
      });
      return;
    }

    const keyHash = hashApiKey(rawKey);

    let apiKey: ExternalApiKey | undefined;
    try {
      const [found] = await db
        .select()
        .from(externalApiKeysTable)
        .where(eq(externalApiKeysTable.keyHash, keyHash))
        .limit(1);
      apiKey = found;
    } catch (err) {
      logger.error({ err }, "external-api-auth: DB lookup failed");
      res.status(500).json({
        success: false,
        error: { code: "INTERNAL_ERROR", message: "Authentication failed." },
      });
      return;
    }

    if (!apiKey) {
      res.status(401).json({
        success: false,
        error: { code: "INVALID_API_KEY", message: "API key not found or invalid." },
      });
      return;
    }

    if (!apiKey.isActive) {
      res.status(401).json({
        success: false,
        error: { code: "KEY_REVOKED", message: "This API key has been revoked." },
      });
      return;
    }

    if (apiKey.expiresAt && new Date(apiKey.expiresAt) < new Date()) {
      res.status(401).json({
        success: false,
        error: { code: "KEY_EXPIRED", message: "This API key has expired." },
      });
      return;
    }

    // ── Permission check ──────────────────────────────────────────────────────
    if (requiredPermissions.length > 0) {
      const keyPerms = apiKey.permissions as ExternalApiPermission[] ?? [];
      const missing = requiredPermissions.filter(p => !keyPerms.includes(p));
      if (missing.length > 0) {
        res.status(403).json({
          success: false,
          error: {
            code: "INSUFFICIENT_PERMISSIONS",
            message: `This key lacks the required permissions: ${missing.join(", ")}`,
          },
        });
        return;
      }
    }

    // ── Rate limiting ─────────────────────────────────────────────────────────
    const rateResult = checkRateLimit(String(apiKey.id));
    res.setHeader("X-RateLimit-Limit", rateResult.limit);
    res.setHeader("X-RateLimit-Remaining", rateResult.remaining);
    res.setHeader("X-RateLimit-Reset", Math.ceil(rateResult.resetAt / 1000));

    if (!rateResult.allowed) {
      res.status(429).json({
        success: false,
        error: {
          code: "RATE_LIMIT_EXCEEDED",
          message: `Rate limit exceeded. Limit is ${rateResult.limit} requests per minute.`,
        },
      });
      return;
    }

    // ── Attach key to request ─────────────────────────────────────────────────
    req.apiKey = apiKey;
    req.apiKeyId = apiKey.id;

    // ── Update lastUsedAt + log request (non-blocking) ────────────────────────
    const originalJson = res.json.bind(res);
    let responseSize = 0;
    res.json = function (body: unknown) {
      responseSize = JSON.stringify(body)?.length ?? 0;
      return originalJson(body);
    };

    res.on("finish", () => {
      const latencyMs = Date.now() - startTime;
      const requestSize = req.headers["content-length"]
        ? parseInt(req.headers["content-length"], 10)
        : (JSON.stringify(req.body)?.length ?? 0);

      db.update(externalApiKeysTable)
        .set({ lastUsedAt: new Date() })
        .where(eq(externalApiKeysTable.id, apiKey!.id))
        .catch(err => logger.error({ err }, "external-api-auth: lastUsedAt update failed"));

      db.insert(externalApiLogsTable)
        .values({
          apiKeyId: apiKey!.id,
          endpoint: req.path,
          method: req.method,
          statusCode: res.statusCode,
          latencyMs,
          requestSize,
          responseSize,
        })
        .catch(err => logger.error({ err }, "external-api-auth: log insert failed"));
    });

    next();
  };
}
