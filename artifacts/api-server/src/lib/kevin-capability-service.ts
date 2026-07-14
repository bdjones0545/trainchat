// ─── Kevin Capability Service ─────────────────────────────────────────────────
//
// Manages Kevin capability modes per scope (application, organization, user).
// Even when a capability is "auto", Kevin must never bypass TrainChat's
// deterministic validation or safety controls.
//
// All capabilities default to "observe" and "disabled=false" in the seed.
// This service resolves the effective mode for a given scope + capability.

import { db } from "@workspace/db";
import {
  kevinAppCapabilitiesTable,
  type KevinCapability,
  type KevinCapabilityMode,
} from "@workspace/db";
import { and, eq } from "drizzle-orm";
import { logger } from "./logger";

// ─── Resolution ───────────────────────────────────────────────────────────────

/**
 * Returns whether a capability is currently enabled for the application scope.
 * Checks application-level first, then global fallback = disabled.
 */
export async function isKevinCapabilityEnabled(
  capability: KevinCapability,
  scopeType: "application" | "organization" | "user" = "application",
  scopeId: string = "trainchat",
): Promise<boolean> {
  try {
    const [row] = await db
      .select({
        enabled: kevinAppCapabilitiesTable.enabled,
        approvalMode: kevinAppCapabilitiesTable.approvalMode,
      })
      .from(kevinAppCapabilitiesTable)
      .where(
        and(
          eq(kevinAppCapabilitiesTable.scopeType, scopeType),
          eq(kevinAppCapabilitiesTable.scopeId, scopeId),
          eq(kevinAppCapabilitiesTable.capability, capability),
        ),
      )
      .limit(1);

    if (!row) return false;
    return row.enabled && row.approvalMode !== "disabled";
  } catch (err) {
    logger.error(
      { err, capability },
      "[KevinCapability] DB error checking capability — returning false",
    );
    return false;
  }
}

/**
 * Returns the effective approval mode for a capability, or "disabled" if not found.
 */
export async function getKevinCapabilityMode(
  capability: KevinCapability,
  scopeId: string = "trainchat",
): Promise<KevinCapabilityMode> {
  try {
    const [row] = await db
      .select({ approvalMode: kevinAppCapabilitiesTable.approvalMode, enabled: kevinAppCapabilitiesTable.enabled })
      .from(kevinAppCapabilitiesTable)
      .where(
        and(
          eq(kevinAppCapabilitiesTable.scopeType, "application"),
          eq(kevinAppCapabilitiesTable.scopeId, scopeId),
          eq(kevinAppCapabilitiesTable.capability, capability),
        ),
      )
      .limit(1);

    if (!row || !row.enabled) return "disabled";
    return row.approvalMode;
  } catch (err) {
    logger.error({ err, capability }, "[KevinCapability] DB error — defaulting to disabled");
    return "disabled";
  }
}

/**
 * Returns all capability records for admin diagnostics.
 */
export async function getAllKevinCapabilities(): Promise<
  Array<{
    capability: KevinCapability;
    approvalMode: KevinCapabilityMode;
    enabled: boolean;
    updatedAt: Date;
  }>
> {
  return db
    .select({
      capability: kevinAppCapabilitiesTable.capability,
      approvalMode: kevinAppCapabilitiesTable.approvalMode,
      enabled: kevinAppCapabilitiesTable.enabled,
      updatedAt: kevinAppCapabilitiesTable.updatedAt,
    })
    .from(kevinAppCapabilitiesTable)
    .where(
      and(
        eq(kevinAppCapabilitiesTable.scopeType, "application"),
        eq(kevinAppCapabilitiesTable.scopeId, "trainchat"),
      ),
    );
}

/**
 * Seeds default capabilities for the application scope.
 * Idempotent — safe to call on every startup.
 * All capabilities default to "observe" mode and disabled=false.
 * Kevin is not active until KEVIN_INTEGRATION_ENABLED and individual
 * sub-flags are set in environment variables.
 */
export async function seedKevinCapabilities(): Promise<void> {
  const { KEVIN_CAPABILITIES } = await import("@workspace/db");

  for (const capability of KEVIN_CAPABILITIES) {
    await db
      .insert(kevinAppCapabilitiesTable)
      .values({
        scopeType: "application",
        scopeId: "trainchat",
        capability,
        approvalMode: "observe",
        enabled: false,
        updatedBy: "system_seed",
      })
      .onConflictDoNothing();
  }

  logger.info("[KevinCapability] Capability defaults seeded");
}
