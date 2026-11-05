import type { IsoInstant } from "@/lib/api/contract";

/**
 * Formats an instant for the API, or null. JavaScript dates hold milliseconds, so the text always has
 * three fraction digits (`2026-11-03T09:00:00.000Z`); the Java backend printed only the digits it had
 * (`2026-11-03T09:00:00Z`, or up to nanoseconds). Both are valid ISO-8601 instants and parse the same.
 */
export function toIso(date: Date | null): IsoInstant | null {
  return date === null ? null : date.toISOString();
}
