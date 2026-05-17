/**
 * External API Key Management Routes
 *
 * POST   /api/external/keys          — create a new API key (requireAuth)
 * GET    /api/external/keys          — list API keys for the authenticated user
 * DELETE /api/external/keys/:id      — revoke a key
 *
 * SECURITY:
 *   - Raw key is returned ONLY at creation time and never again
 *   - Only the SHA-256 hash is stored in the database
 *   - Key prefix (first 8 chars after tc_) is stored for display only
 */

import { Router } from "express";
import { randomBytes, createHash } from "crypto";
import { z } from "zod/v4";
import { db, externalApiKeysTable, externalApiLogsTable } from "@workspace/db";
import { eq, and, desc } from "drizzle-orm";
import { requireAuth } from "../../middlewares/auth";
import { validateExternalApiKey } from "../../middlewares/external-api-auth";
import { EXTERNAL_API_PERMISSIONS, type ExternalApiPermission } from "@workspace/db";
import { logger } from "../../lib/logger";

const router = Router();

// ── Zod schemas ───────────────────────────────────────────────────────────────

const CreateKeyBodySchema = z.object({
  name: z.string().min(1).max(100),
  orgId: z.string().max(100).optional(),
  permissions: z
    .array(z.enum(EXTERNAL_API_PERMISSIONS))
    .min(1)
    .default(["generate_program", "edit_program", "generate_session", "exercise_swap", "explain_program", "retrieve_program", "list_exercises"]),
  expiresAt: z.string().datetime().optional().nullable(),
});

// ── Helpers ───────────────────────────────────────────────────────────────────

function generateRawKey(): string {
  return "tc_" + randomBytes(32).toString("hex");
}

function hashKey(raw: string): string {
  return createHash("sha256").update(raw).digest("hex");
}

function buildPrefix(raw: string): string {
  return raw.slice(0, 11);
}

// ── POST /api/external/keys ───────────────────────────────────────────────────

router.post("/external/keys", requireAuth, async (req, res): Promise<void> => {
  const parsed = CreateKeyBodySchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({
      success: false,
      error: {
        code: "VALIDATION_ERROR",
        message: "Invalid request body.",
        details: parsed.error.issues,
      },
    });
    return;
  }

  const { name, orgId, permissions, expiresAt } = parsed.data;
  const userId = req.session.userId!;

  const rawKey = generateRawKey();
  const keyHash = hashKey(rawKey);
  const prefix = buildPrefix(rawKey);

  try {
    const [created] = await db
      .insert(externalApiKeysTable)
      .values({
        name,
        orgId: orgId ?? null,
        keyHash,
        prefix,
        permissions: permissions as ExternalApiPermission[],
        isActive: true,
        createdBy: userId,
        expiresAt: expiresAt ? new Date(expiresAt) : null,
      })
      .returning();

    logger.info(
      { keyId: created.id, prefix, userId, permissions },
      "external-api-keys: key created",
    );

    res.status(201).json({
      success: true,
      data: {
        id: created.id,
        name: created.name,
        prefix: created.prefix,
        permissions: created.permissions,
        orgId: created.orgId,
        isActive: created.isActive,
        createdAt: created.createdAt,
        expiresAt: created.expiresAt,
        key: rawKey,
      },
      meta: {
        warning: "This is the only time the full API key will be shown. Store it securely.",
      },
    });
  } catch (err) {
    logger.error({ err }, "external-api-keys: create failed");
    res.status(500).json({
      success: false,
      error: { code: "INTERNAL_ERROR", message: "Failed to create API key." },
    });
  }
});

// ── GET /api/external/keys ────────────────────────────────────────────────────

router.get("/external/keys", requireAuth, async (req, res): Promise<void> => {
  const userId = req.session.userId!;

  try {
    const keys = await db
      .select({
        id: externalApiKeysTable.id,
        name: externalApiKeysTable.name,
        prefix: externalApiKeysTable.prefix,
        orgId: externalApiKeysTable.orgId,
        permissions: externalApiKeysTable.permissions,
        isActive: externalApiKeysTable.isActive,
        lastUsedAt: externalApiKeysTable.lastUsedAt,
        createdAt: externalApiKeysTable.createdAt,
        expiresAt: externalApiKeysTable.expiresAt,
      })
      .from(externalApiKeysTable)
      .where(eq(externalApiKeysTable.createdBy, userId))
      .orderBy(externalApiKeysTable.createdAt);

    res.json({
      success: true,
      data: keys,
      meta: { total: keys.length },
    });
  } catch (err) {
    logger.error({ err }, "external-api-keys: list failed");
    res.status(500).json({
      success: false,
      error: { code: "INTERNAL_ERROR", message: "Failed to list API keys." },
    });
  }
});

// ── DELETE /api/external/keys/:id ─────────────────────────────────────────────

router.delete("/external/keys/:id", requireAuth, async (req, res): Promise<void> => {
  const keyId = parseInt(req.params["id"] as string, 10);
  if (isNaN(keyId)) {
    res.status(400).json({
      success: false,
      error: { code: "INVALID_ID", message: "Key ID must be a number." },
    });
    return;
  }

  const userId = req.session.userId!;

  try {
    const [existing] = await db
      .select({ id: externalApiKeysTable.id, createdBy: externalApiKeysTable.createdBy })
      .from(externalApiKeysTable)
      .where(
        and(
          eq(externalApiKeysTable.id, keyId),
          eq(externalApiKeysTable.createdBy, userId),
        ),
      )
      .limit(1);

    if (!existing) {
      res.status(404).json({
        success: false,
        error: { code: "NOT_FOUND", message: "API key not found." },
      });
      return;
    }

    await db
      .update(externalApiKeysTable)
      .set({ isActive: false })
      .where(eq(externalApiKeysTable.id, keyId));

    logger.info({ keyId, userId }, "external-api-keys: key revoked");

    res.json({
      success: true,
      data: { id: keyId, revoked: true },
      meta: null,
    });
  } catch (err) {
    logger.error({ err }, "external-api-keys: revoke failed");
    res.status(500).json({
      success: false,
      error: { code: "INTERNAL_ERROR", message: "Failed to revoke API key." },
    });
  }
});

// ── GET /api/external/keys/:id/logs ──────────────────────────────────────────
// View request logs for a specific key

router.get("/external/keys/:id/logs", requireAuth, async (req, res): Promise<void> => {
  const keyId = parseInt(req.params["id"] as string, 10);
  if (isNaN(keyId)) {
    res.status(400).json({
      success: false,
      error: { code: "INVALID_ID", message: "Key ID must be a number." },
    });
    return;
  }

  const userId = req.session.userId!;
  const limit = Math.min(parseInt(String(req.query.limit ?? "50"), 10), 200);

  try {
    const [key] = await db
      .select({ id: externalApiKeysTable.id })
      .from(externalApiKeysTable)
      .where(
        and(
          eq(externalApiKeysTable.id, keyId),
          eq(externalApiKeysTable.createdBy, userId),
        ),
      )
      .limit(1);

    if (!key) {
      res.status(404).json({
        success: false,
        error: { code: "NOT_FOUND", message: "API key not found." },
      });
      return;
    }

    const logs = await db
      .select()
      .from(externalApiLogsTable)
      .where(eq(externalApiLogsTable.apiKeyId, keyId))
      .orderBy(desc(externalApiLogsTable.createdAt))
      .limit(limit);

    res.json({
      success: true,
      data: logs,
      meta: { total: logs.length, limit },
    });
  } catch (err) {
    logger.error({ err }, "external-api-keys: logs fetch failed");
    res.status(500).json({
      success: false,
      error: { code: "INTERNAL_ERROR", message: "Failed to fetch logs." },
    });
  }
});

export default router;
