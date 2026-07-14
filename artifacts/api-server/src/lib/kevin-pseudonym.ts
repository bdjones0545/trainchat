// ─── Kevin Pseudonymous User ID ───────────────────────────────────────────────
//
// Kevin must never receive raw user IDs, emails, or names.
// This module derives a stable, application-scoped pseudonymous identifier
// using a one-way HMAC-SHA256 keyed transformation.
//
// SECURITY:
//   - The transformation key (KEVIN_PSEUDONYM_SALT) must remain server-only.
//   - The mapping is deterministic — the same userId always produces the same
//     pseudonymous ID — but irreversible without the key.
//   - If the salt is not configured, a fallback is used that is still opaque
//     to Kevin but is less resistant to offline attacks.

import crypto from "crypto";
import { getKevinConfig } from "./kevin-config";

const APPLICATION_ID = "trainchat";

/**
 * Derives a stable pseudonymous identifier for a TrainChat user.
 * Safe to send to Kevin as the user_id field.
 * Never reveals the raw userId, email, or any PII.
 */
export function deriveKevinPseudonymousId(userId: number): string {
  const config = getKevinConfig();
  const salt = config.pseudonymSalt ?? `${APPLICATION_ID}_pseudonym_fallback`;

  const hmac = crypto.createHmac("sha256", salt);
  hmac.update(`${APPLICATION_ID}:user:${userId}`);
  return `tc_u_${hmac.digest("hex").slice(0, 32)}`;
}

/**
 * Derives a pseudonymous org ID when an org/tenant scope is present.
 */
export function deriveKevinPseudonymousOrgId(orgId: string): string {
  const config = getKevinConfig();
  const salt = config.pseudonymSalt ?? `${APPLICATION_ID}_pseudonym_fallback`;

  const hmac = crypto.createHmac("sha256", salt);
  hmac.update(`${APPLICATION_ID}:org:${orgId}`);
  return `tc_o_${hmac.digest("hex").slice(0, 32)}`;
}
