import { ApiException } from "@/server/shared/api-exception";
import { javaTrim } from "@/server/shared/java-text";

/**
 * Reading JSON request bodies the way the former backend (Spring MVC with Jackson) did.
 *
 * Jackson is lenient in specific, documented ways, and automations built against the old API may rely
 * on them, so these helpers reproduce the behaviour that was observed by sending the same payloads to
 * the real Spring Boot application:
 *
 * | JSON value                 | integer field | enum field          | string field | instant field             |
 * |----------------------------|---------------|---------------------|--------------|---------------------------|
 * | `5`, `5.7`                 | 5             | ordinal (index 5)   | `"5"`        | epoch seconds             |
 * | `"5"`, `" 5 "`, `"+5"`     | 5             | rejected            | as is        | epoch seconds (digits)    |
 * | `""`                       | null          | rejected            | `""`         | null                      |
 * | `" REMOTE "`               | rejected      | `REMOTE` (trimmed)  | as is        | rejected                  |
 * | `true`                     | rejected      | rejected            | `"true"`     | rejected                  |
 * | array or object            | rejected      | rejected            | rejected     | rejected                  |
 *
 * "Rejected" means `400 BAD_REQUEST "Malformed request body"`, which is what Spring answered when Jackson
 * could not bind the body. Constraint checks such as "required" happen afterwards (see `constraints.ts`).
 */

const MALFORMED = "Malformed request body";

const INT32_MIN = -2147483648;
const INT32_MAX = 2147483647;

/** Throws the error Spring returned for an unreadable body. */
export function malformedBody(): never {
  throw ApiException.badRequest(MALFORMED);
}

/**
 * Parses a raw request body as JSON.
 *
 * @param text the body as received (may be empty).
 * @param required when true, an empty body or a literal `null` is an error, like `@RequestBody`;
 *   when false (`@RequestBody(required = false)`), both give null.
 * @returns the parsed JSON value, or null for an absent optional body.
 */
export function parseJsonBody(text: string, required: boolean): unknown {
  if (text.trim() === "") {
    if (required) malformedBody();
    return null;
  }
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    malformedBody();
  }
  if (value === null && required) malformedBody();
  return value;
}

/**
 * Requires a JSON object (a Java record is bound from an object only). Arrays and primitives are
 * malformed. Unknown properties are simply ignored later, as Spring Boot configures Jackson to do.
 */
export function expectObject(value: unknown): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) malformedBody();
  return value as Record<string, unknown>;
}

/**
 * Jackson's `String` binding: strings as is, numbers and booleans as their text, null or absent as null.
 * Note: JavaScript's JSON parser does not keep the original spelling of numbers, so `5.0` becomes `"5"`
 * where Jackson would give `"5.0"`. Sending numbers for text fields is unusual enough to accept this.
 */
export function coerceString(value: unknown): string | null {
  if (value === undefined || value === null) return null;
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  return malformedBody();
}

/**
 * Shared integer binding for `Integer` and `Long` fields.
 * Numbers are truncated toward zero (Jackson's `ACCEPT_FLOAT_AS_INT`); strings are trimmed and must be
 * an optionally signed run of digits; an empty string is null; anything out of range is malformed.
 */
function coerceInteger(value: unknown, min: number, max: number): number | null {
  if (value === undefined || value === null) return null;
  let n: number;
  if (typeof value === "number") {
    n = Math.trunc(value);
  } else if (typeof value === "string") {
    const s = javaTrim(value);
    if (s === "") return null;
    if (!/^[+-]?\d+$/.test(s)) malformedBody();
    n = Number(s);
  } else {
    return malformedBody();
  }
  if (!Number.isFinite(n) || n < min || n > max) malformedBody();
  return n === 0 ? 0 : n; // normalize -0, which Java does not have
}

/** Binds a Java `Integer` field (32 bit). */
export function coerceInt32(value: unknown): number | null {
  return coerceInteger(value, INT32_MIN, INT32_MAX);
}

/**
 * Binds a Java `Long` field. JavaScript numbers are exact only up to 2^53 - 1, so larger values are
 * rejected as malformed instead of being silently rounded (Java would have accepted up to 2^63 - 1;
 * salaries in that range are not realistic).
 */
export function coerceInt64(value: unknown): number | null {
  return coerceInteger(value, Number.MIN_SAFE_INTEGER, Number.MAX_SAFE_INTEGER);
}

/**
 * Binds a Java enum: the trimmed constant name (case sensitive), or its ordinal as a JSON integer
 * (Jackson accepts `"workMode": 2` for `REMOTE`). An empty string or an unknown name is malformed.
 */
export function coerceEnum<T extends string>(value: unknown, constants: readonly T[]): T | null {
  if (value === undefined || value === null) return null;
  if (typeof value === "string") {
    const name = javaTrim(value);
    const found = constants.find((c) => c === name);
    return found ?? malformedBody();
  }
  if (typeof value === "number" && Number.isInteger(value) && value >= 0 && value < constants.length) {
    return constants[value];
  }
  return malformedBody();
}

/**
 * Days per month for the strict calendar check (February is handled separately for leap years).
 * Java's `ISO_INSTANT` uses `ResolverStyle.STRICT`, so `2026-02-30` is an error, not 2 March.
 */
const DAYS_IN_MONTH = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];

function isLeapYear(year: number): boolean {
  return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
}

/**
 * ISO-8601 instant as accepted by `DateTimeFormatter.ISO_INSTANT`: date, `T`, time with seconds and up
 * to nine fraction digits, then `Z` or an `+HH:MM` / `+HH:MM:SS` offset. Case insensitive, because the
 * formatter is built with `parseCaseInsensitive()` (`2026-11-03t09:00:00z` was accepted by the backend).
 */
const ISO_INSTANT =
  /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.(\d{1,9}))?(Z|([+-])(\d{2}):(\d{2})(?::(\d{2}))?)$/i;

/**
 * Parses an ISO-8601 instant string strictly, or returns null when it is not one.
 * Fractions beyond milliseconds are truncated, because a JavaScript `Date` holds milliseconds only.
 */
export function parseIsoInstant(text: string): Date | null {
  const m = ISO_INSTANT.exec(text);
  if (!m) return null;
  const [year, month, day, hour, minute, second] = m.slice(1, 7).map(Number);
  const daysInMonth = month === 2 && isLeapYear(year) ? 29 : DAYS_IN_MONTH[month - 1];
  if (month < 1 || month > 12 || day < 1 || day > daysInMonth || hour > 23 || minute > 59 || second > 59) {
    return null;
  }
  const millis = m[7] ? Number(m[7].slice(0, 3).padEnd(3, "0")) : 0;
  let offsetSeconds = 0;
  if (m[8].toUpperCase() !== "Z") {
    const [oh, om, os] = [Number(m[10]), Number(m[11]), Number(m[12] ?? 0)];
    const total = oh * 3600 + om * 60 + os;
    // java.time.ZoneOffset allows at most +/-18:00:00.
    if (om > 59 || os > 59 || total > 18 * 3600) return null;
    offsetSeconds = (m[9] === "-" ? -1 : 1) * total;
  }
  // Build the wall clock time in UTC first. setUTCFullYear is used instead of Date.UTC because Date.UTC
  // maps the years 0 to 99 to 1900 to 1999.
  const wallClock = new Date(0);
  wallClock.setUTCFullYear(year, month - 1, day);
  wallClock.setUTCHours(hour, minute, second, millis);
  // The text is local time at the given offset, so subtract the offset to get the instant.
  return new Date(wallClock.getTime() - offsetSeconds * 1000);
}

/**
 * Binds a Java `Instant` field like Jackson's `InstantDeserializer`:
 * - a JSON number is epoch **seconds** (`1762160400`), with an optional fraction (`1762160400.5`);
 * - a string is trimmed; empty means null; a string of digits with at most one dot is also epoch seconds;
 * - otherwise it must be an ISO-8601 instant with seconds and a zone (`Z` or an offset).
 */
export function coerceInstant(value: unknown): Date | null {
  if (value === undefined || value === null) return null;
  if (typeof value === "number") return epochSecondsToDate(value);
  if (typeof value !== "string") return malformedBody();
  const s = javaTrim(value);
  if (s === "") return null;
  if (/^[0-9.]+$/.test(s)) {
    const dots = s.split(".").length - 1;
    // Jackson tries the numeric reading first and falls back to ISO parsing when it fails.
    if (dots <= 1 && s !== ".") {
      const seconds = Number(s);
      if (Number.isFinite(seconds) && (dots === 1 || Number.isSafeInteger(seconds))) return epochSecondsToDate(seconds);
    }
  }
  return parseIsoInstant(s) ?? malformedBody();
}

/** Converts epoch seconds (possibly fractional) to a Date, rounding to the nearest millisecond. */
function epochSecondsToDate(seconds: number): Date {
  // Rounding undoes binary floating point noise: 1762160400.123 * 1000 is 1762160400122.9998.
  const date = new Date(Math.round(seconds * 1000));
  if (Number.isNaN(date.getTime())) malformedBody();
  return date;
}

/**
 * Binds a `List<String>`: an array whose elements are bound like `coerceString`. A single string is
 * not accepted as a one element list (Jackson's default). A null element is rejected as malformed;
 * the Java backend let it through and then failed with a 500, so this is a deliberate improvement.
 */
export function coerceStringList(value: unknown): string[] | null {
  if (value === undefined || value === null) return null;
  if (!Array.isArray(value)) return malformedBody();
  return value.map((element) => (element === null ? malformedBody() : (coerceString(element) as string)));
}
