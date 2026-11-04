/**
 * Source of "now" for every time-dependent rule (expiry, publishing, key usage).
 *
 * This replaces the Spring `Clock` bean of the former backend. Depending on this interface instead of
 * calling `new Date()` directly keeps services deterministic in tests (Dependency Inversion).
 */
export interface Clock {
  /** Returns the current instant. Each call returns a new `Date`, so callers may not mutate shared state. */
  now(): Date;
}

/** The production clock, backed by the system time (UTC instants, like `Clock.systemUTC()`). */
export const systemClock: Clock = {
  now: () => new Date(),
};
