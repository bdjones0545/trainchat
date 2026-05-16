import { logger } from "./logger";

/**
 * safeBackground — fire-and-forget wrapper with structured error logging.
 *
 * Preserves non-blocking behavior while making failures visible in production
 * logs. Replaces bare `.catch(() => {})` patterns so errors are never silently
 * swallowed.
 *
 * @param promise  The async operation to run in the background.
 * @param label    Short descriptive name used in the log entry.
 * @param context  Optional key-value pairs attached to the log entry.
 */
export function safeBackground(
  promise: Promise<unknown>,
  label: string,
  context?: Record<string, unknown>,
): void {
  promise.catch((err: unknown) => {
    logger.warn(
      { err: err instanceof Error ? err.message : String(err), label, ...context },
      `[safeBackground] ${label} failed — non-fatal`,
    );
  });
}
