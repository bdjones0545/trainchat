// ─── Kevin Pseudonymous User ID ───────────────────────────────────────────────
//
// Kevin must never receive raw user IDs, emails, or names.
// This module derives a stable, application-scoped pseudonymous identifier
// using a one-way HMAC-SHA256 keyed transformation.
//
// SECURITY (H1):
//   - The transformation key (KEVIN_PSEUDONYM_SALT) must remain server-only.
//   - The mapping is deterministic — the same userId always produces the same
//     pseudonymous ID — but irreversible without the key.
//   - There is NO predictable fallback for EXPORTED identifiers. If the salt is
//     unset, deriving an identifier that will be sent to Kevin throws
//     KevinPseudonymSaltMissingError (fail closed). Startup validation
//     (assertKevinExportConfig) turns this into a boot-time failure whenever an
//     export feature flag is enabled, so the throw is a defense-in-depth guard,
//     not the primary gate.
//   - Consent storage is LOCAL and never leaves this server, so it uses a
//     separate tolerant scope key (deriveKevinLocalUserScope) that does not
//     require the salt — this keeps user-facing consent settings working even
//     when Kevin is disabled/misconfigured, with zero behaviour change.

import crypto from "crypto";
import { getKevinConfig } from "./kevin-config";

const APPLICATION_ID = "trainchat";

// Salt used only for LOCAL, never-exported scope keys when no real salt is set.
// Intentionally the SAME string the pre-H1 code used as its global fallback, so
// consent scope keys written in a salt-less environment resolve unchanged after
// this change (zero behaviour change while Kevin is off / no salt).
const LOCAL_FALLBACK_SALT = `${APPLICATION_ID}_pseudonym_fallback`;

/**
 * Thrown when a pseudonymous identifier that would be EXPORTED to Kevin is
 * requested but KEVIN_PSEUDONYM_SALT is not configured. Never produce a
 * predictable/guessable pseudonym for outbound data.
 */
export class KevinPseudonymSaltMissingError extends Error {
  readonly code = "KEVIN_PSEUDONYM_SALT_MISSING";
  constructor() {
    super(
      "KEVIN_PSEUDONYM_SALT is not configured; refusing to derive an exportable pseudonymous identifier",
    );
    this.name = "KevinPseudonymSaltMissingError";
  }
}

function hmacHex(salt: string, message: string): string {
  return crypto.createHmac("sha256", salt).update(message).digest("hex").slice(0, 32);
}

/**
 * Derives a stable pseudonymous identifier for a TrainChat user, for EXPORT to
 * Kevin as the user_id field. Never reveals the raw userId, email, or any PII.
 *
 * @throws KevinPseudonymSaltMissingError if KEVIN_PSEUDONYM_SALT is unset.
 */
export function deriveKevinPseudonymousId(userId: number): string {
  const salt = getKevinConfig().pseudonymSalt;
  if (!salt) throw new KevinPseudonymSaltMissingError();
  return `tc_u_${hmacHex(salt, `${APPLICATION_ID}:user:${userId}`)}`;
}

/**
 * Derives a pseudonymous org ID for EXPORT to Kevin when an org/tenant scope is
 * present.
 *
 * @throws KevinPseudonymSaltMissingError if KEVIN_PSEUDONYM_SALT is unset.
 */
export function deriveKevinPseudonymousOrgId(orgId: string): string {
  const salt = getKevinConfig().pseudonymSalt;
  if (!salt) throw new KevinPseudonymSaltMissingError();
  return `tc_o_${hmacHex(salt, `${APPLICATION_ID}:org:${orgId}`)}`;
}

/**
 * Derives a stable LOCAL scope key for a user — used only as a database scope
 * key (e.g. consent records) and NEVER sent to Kevin. Tolerates a missing salt
 * (falls back to a fixed local salt) because the value never leaves the server;
 * when the real salt is set it matches deriveKevinPseudonymousId, so local
 * scope keys and exported pseudonyms coincide in a correctly-configured deploy.
 */
export function deriveKevinLocalUserScope(userId: number): string {
  const salt = getKevinConfig().pseudonymSalt ?? LOCAL_FALLBACK_SALT;
  return `tc_u_${hmacHex(salt, `${APPLICATION_ID}:user:${userId}`)}`;
}
