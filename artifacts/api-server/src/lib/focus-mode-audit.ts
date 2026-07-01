/**
 * Focus Mode Audit Logger
 *
 * Provides structured audit logging for the focus mode system.
 * Allows verification that the correct engine is being used consistently
 * and that cross-contamination between modes is not occurring.
 */

import { logger } from "./logger";
import type { FocusMode } from "./focus-engines/engine-interface";

// ─── Audit Event Types ────────────────────────────────────────────────────────

export interface FocusModeAuditEvent {
  activeFocusMode: FocusMode;
  route: string;
  engineUsed: string;
  uiModeApplied: boolean;
  memoryNamespaceUsed: string;
  blockTypeGenerated?: string;
  userId?: number;
  conversationId?: number;
}

export interface CrossContaminationAuditEvent {
  focusMode: FocusMode;
  attemptedReadFromWrongEngine: string;
  blocked: boolean;
  detail?: string;
}

// ─── Audit Functions ──────────────────────────────────────────────────────────

export function logFocusModeAudit(event: FocusModeAuditEvent): void {
  logger.info({
    ...event,
    timestamp: new Date().toISOString(),
  }, "[FocusModeAudit]");
}

export function logCrossContaminationAudit(event: CrossContaminationAuditEvent): void {
  if (event.blocked) {
    logger.warn({
      ...event,
      timestamp: new Date().toISOString(),
    }, "[CrossContaminationAudit] BLOCKED cross-mode access");
  } else {
    logger.error({
      ...event,
      timestamp: new Date().toISOString(),
    }, "[CrossContaminationAudit] UNBLOCKED cross-mode access detected");
  }
}

/**
 * Validates that the focus mode from the frontend is a valid value.
 * Falls back to "strength" if invalid or missing.
 */
export function resolveFocusMode(rawValue: unknown): FocusMode {
  if (rawValue === "strength" || rawValue === "speed" || rawValue === "mobility") {
    return rawValue;
  }
  if (rawValue) {
    logger.warn({ received: rawValue }, "[FocusModeAudit] Invalid focusMode received — falling back to strength");
  }
  return "strength";
}

/**
 * Returns a human-readable label for a focus mode.
 */
export function getFocusModeLabel(mode: FocusMode): string {
  const labels: Record<FocusMode, string> = {
    strength: "Strength",
    speed: "Speed / Footwork",
    mobility: "Mobility",
  };
  return labels[mode];
}
