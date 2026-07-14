// ─── Kevin Circuit Breaker ────────────────────────────────────────────────────
//
// Process-local circuit breaker protecting all Kevin network calls.
// When open, all Kevin calls fail fast without hitting the network.
// TrainChat generation, editing, and feedback always continue.
//
// States: closed → open (after N failures) → half_open (probe) → closed/open
//
// Rules:
//   - Opens after FAILURE_THRESHOLD failures in WINDOW_MS
//   - Stays open for OPEN_DURATION_MS (~60s)
//   - Allows one half-open probe after the open period
//   - Local validation errors (bad config, disabled flag) do NOT count as failures
//   - Circuit state is exposed via getKevinCircuitStatus() for admin diagnostics

import { logger } from "./logger";

export type CircuitState = "closed" | "open" | "half_open";

const FAILURE_THRESHOLD = 5;
const WINDOW_MS = 60_000; // failures are counted in a 60s rolling window
const OPEN_DURATION_MS = 60_000; // stay open for 60s

interface CircuitBreaker {
  state: CircuitState;
  failures: number[];  // timestamps of recent failures (used for rolling window)
  openedAt: number | null;
  halfOpenProbeInFlight: boolean;
  totalTrips: number;
  lastError: string | null;
  lastSuccessAt: number | null;
}

const breaker: CircuitBreaker = {
  state: "closed",
  failures: [],
  openedAt: null,
  halfOpenProbeInFlight: false,
  totalTrips: 0,
  lastError: null,
  lastSuccessAt: null,
};

function pruneOldFailures(): void {
  const cutoff = Date.now() - WINDOW_MS;
  breaker.failures = breaker.failures.filter((t) => t > cutoff);
}

function trip(error: string): void {
  breaker.state = "open";
  breaker.openedAt = Date.now();
  breaker.totalTrips++;
  breaker.lastError = error;
  breaker.halfOpenProbeInFlight = false;
  logger.warn(
    { totalTrips: breaker.totalTrips, error },
    "[KevinCircuitBreaker] Circuit OPENED — Kevin calls will fail fast",
  );
}

function close(): void {
  breaker.state = "closed";
  breaker.failures = [];
  breaker.openedAt = null;
  breaker.halfOpenProbeInFlight = false;
  breaker.lastSuccessAt = Date.now();
  logger.info("[KevinCircuitBreaker] Circuit CLOSED — Kevin calls resumed");
}

/**
 * Checks whether a Kevin call is allowed right now.
 * Returns false when the circuit is open or half-open with a probe in flight.
 * Transitions the circuit from open → half_open when the cooldown expires.
 */
export function isKevinCircuitAllowed(): boolean {
  switch (breaker.state) {
    case "closed":
      return true;

    case "open": {
      const elapsed = Date.now() - (breaker.openedAt ?? 0);
      if (elapsed >= OPEN_DURATION_MS) {
        breaker.state = "half_open";
        logger.info(
          "[KevinCircuitBreaker] Circuit transitioned to HALF_OPEN — allowing probe",
        );
        return true;
      }
      return false;
    }

    case "half_open": {
      if (breaker.halfOpenProbeInFlight) {
        // Only one probe at a time
        return false;
      }
      breaker.halfOpenProbeInFlight = true;
      return true;
    }
  }
}

/**
 * Records a Kevin call failure.
 * Local validation errors (KEVIN_DISABLED, KEVIN_NOT_CONFIGURED) should NOT
 * be passed to this function — they don't indicate Kevin unavailability.
 */
export function recordKevinFailure(error: string): void {
  const now = Date.now();
  breaker.lastError = error;

  if (breaker.state === "half_open") {
    // Probe failed — reopen immediately
    logger.warn(
      { error },
      "[KevinCircuitBreaker] Half-open probe FAILED — reopening circuit",
    );
    trip(error);
    return;
  }

  pruneOldFailures();
  breaker.failures.push(now);

  if (breaker.failures.length >= FAILURE_THRESHOLD) {
    trip(error);
  }
}

/**
 * Records a Kevin call success.
 */
export function recordKevinSuccess(): void {
  if (breaker.state === "half_open") {
    close();
    return;
  }
  // In closed state, clear rolling failures on success
  breaker.lastSuccessAt = Date.now();
  pruneOldFailures();
}

/**
 * Returns the current circuit status for diagnostics.
 * Safe to expose in admin views — contains no secrets.
 */
export interface KevinCircuitStatus {
  state: CircuitState;
  recentFailures: number;
  totalTrips: number;
  openedAt: string | null;
  lastError: string | null;
  lastSuccessAt: string | null;
  nextProbeEligibleAt: string | null;
}

export function getKevinCircuitStatus(): KevinCircuitStatus {
  pruneOldFailures();
  const nextProbeMs =
    breaker.state === "open" && breaker.openedAt
      ? breaker.openedAt + OPEN_DURATION_MS
      : null;

  return {
    state: breaker.state,
    recentFailures: breaker.failures.length,
    totalTrips: breaker.totalTrips,
    openedAt: breaker.openedAt ? new Date(breaker.openedAt).toISOString() : null,
    lastError: breaker.lastError,
    lastSuccessAt: breaker.lastSuccessAt
      ? new Date(breaker.lastSuccessAt).toISOString()
      : null,
    nextProbeEligibleAt: nextProbeMs
      ? new Date(nextProbeMs).toISOString()
      : null,
  };
}

/** Force-reset for tests only */
export function _resetKevinCircuitForTest(): void {
  breaker.state = "closed";
  breaker.failures = [];
  breaker.openedAt = null;
  breaker.halfOpenProbeInFlight = false;
  breaker.totalTrips = 0;
  breaker.lastError = null;
  breaker.lastSuccessAt = null;
}
