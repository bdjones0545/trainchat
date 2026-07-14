// ─── Kevin Consent Service ────────────────────────────────────────────────────
//
// Manages Kevin memory consent for users and organizations.
// Cross-application context defaults to "not_requested" and must never be
// granted automatically or inferred from matching emails.
//
// Rules:
//   - A user may only change their own consent
//   - Org admins cannot access personal memory without an authorized policy
//   - Revocation immediately stops future Kevin context retrieval
//   - Consent records are audited (grantedAt / revokedAt timestamps)

import { db } from "@workspace/db";
import {
  kevinMemoryConsentsTable,
  type KevinMemoryType,
  type KevinConsentStatus,
  KEVIN_MEMORY_TYPES,
} from "@workspace/db";
import { and, eq } from "drizzle-orm";
import { logger } from "./logger";
import { deriveKevinPseudonymousId } from "./kevin-pseudonym";

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Returns whether a user has granted consent for the given memory type.
 * Defaults to false (not granted) when no record exists.
 */
export async function hasKevinConsent(
  userId: number,
  memoryType: KevinMemoryType,
): Promise<boolean> {
  try {
    const scopeId = deriveKevinPseudonymousId(userId);
    const [row] = await db
      .select({ consentStatus: kevinMemoryConsentsTable.consentStatus })
      .from(kevinMemoryConsentsTable)
      .where(
        and(
          eq(kevinMemoryConsentsTable.scopeType, "user"),
          eq(kevinMemoryConsentsTable.scopeId, scopeId),
          eq(kevinMemoryConsentsTable.memoryType, memoryType),
        ),
      )
      .limit(1);

    return row?.consentStatus === "granted";
  } catch (err) {
    logger.error({ err, memoryType }, "[KevinConsent] DB error checking consent — defaulting to false");
    return false;
  }
}

/**
 * Returns all consent records for a user.
 * Safe to expose in the user-facing Memory Settings page.
 */
export async function getUserKevinConsents(userId: number): Promise<
  Array<{ memoryType: KevinMemoryType; consentStatus: KevinConsentStatus; grantedAt: Date | null; revokedAt: Date | null }>
> {
  const scopeId = deriveKevinPseudonymousId(userId);
  const rows = await db
    .select({
      memoryType: kevinMemoryConsentsTable.memoryType,
      consentStatus: kevinMemoryConsentsTable.consentStatus,
      grantedAt: kevinMemoryConsentsTable.grantedAt,
      revokedAt: kevinMemoryConsentsTable.revokedAt,
    })
    .from(kevinMemoryConsentsTable)
    .where(
      and(
        eq(kevinMemoryConsentsTable.scopeType, "user"),
        eq(kevinMemoryConsentsTable.scopeId, scopeId),
      ),
    );

  // Return all known memory types, using the DB row if present, otherwise "not_requested"
  return KEVIN_MEMORY_TYPES.filter(
    (t) => t !== "cross_application_context",
  ).map((memoryType) => {
    const row = rows.find((r) => r.memoryType === memoryType);
    return {
      memoryType,
      consentStatus: row?.consentStatus ?? "not_requested",
      grantedAt: row?.grantedAt ?? null,
      revokedAt: row?.revokedAt ?? null,
    };
  });
}

/**
 * Grants Kevin memory consent for a user.
 * Cross-application context requires separate explicit authorization
 * and is blocked here until Phase 13 is implemented.
 */
export async function grantKevinConsent(
  userId: number,
  memoryType: KevinMemoryType,
): Promise<void> {
  if (memoryType === "cross_application_context") {
    throw new Error(
      "Cross-application context consent requires explicit authorization " +
        "and is not available in this release.",
    );
  }

  const scopeId = deriveKevinPseudonymousId(userId);
  const now = new Date();

  await db
    .insert(kevinMemoryConsentsTable)
    .values({
      scopeType: "user",
      scopeId,
      memoryType,
      consentStatus: "granted",
      grantedAt: now,
      revokedAt: null,
    })
    .onConflictDoUpdate({
      target: [
        kevinMemoryConsentsTable.scopeType,
        kevinMemoryConsentsTable.scopeId,
        kevinMemoryConsentsTable.memoryType,
      ],
      set: {
        consentStatus: "granted",
        grantedAt: now,
        revokedAt: null,
        updatedAt: now,
      },
    });

  logger.info({ userId, memoryType }, "[KevinConsent] Consent granted");
}

/**
 * Revokes Kevin memory consent for a user.
 * After revocation, future context requests return consent_required.
 */
export async function revokeKevinConsent(
  userId: number,
  memoryType: KevinMemoryType,
): Promise<void> {
  const scopeId = deriveKevinPseudonymousId(userId);
  const now = new Date();

  await db
    .insert(kevinMemoryConsentsTable)
    .values({
      scopeType: "user",
      scopeId,
      memoryType,
      consentStatus: "revoked",
      grantedAt: null,
      revokedAt: now,
    })
    .onConflictDoUpdate({
      target: [
        kevinMemoryConsentsTable.scopeType,
        kevinMemoryConsentsTable.scopeId,
        kevinMemoryConsentsTable.memoryType,
      ],
      set: {
        consentStatus: "revoked",
        revokedAt: now,
        updatedAt: now,
      },
    });

  logger.info({ userId, memoryType }, "[KevinConsent] Consent revoked");
}

/**
 * Revokes all Kevin memory consents for a user (e.g., on account deletion).
 */
export async function revokeAllKevinConsents(userId: number): Promise<void> {
  const scopeId = deriveKevinPseudonymousId(userId);
  const now = new Date();

  await db
    .update(kevinMemoryConsentsTable)
    .set({ consentStatus: "revoked", revokedAt: now, updatedAt: now })
    .where(
      and(
        eq(kevinMemoryConsentsTable.scopeType, "user"),
        eq(kevinMemoryConsentsTable.scopeId, scopeId),
      ),
    );

  logger.info({ userId }, "[KevinConsent] All consents revoked");
}
