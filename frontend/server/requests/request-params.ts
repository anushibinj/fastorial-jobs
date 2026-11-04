import { ApiException } from "@/server/shared/api-exception";
import { isJavaWhitespace, javaTrim } from "@/server/shared/java-text";

/**
 * Query string and path variable conversion with the rules Spring MVC applied in the former backend.
 * Observed against the running Spring Boot application:
 *
 * - `?page=` (empty) is absent; `?page=%202` is 2 (all white space is removed); `?page=0x2` is 2
 *   (Spring's `NumberUtils.parseNumber` decodes hex); `?page=abc` or an out of range number is
 *   `400 BAD_REQUEST "Invalid value for 'page'"`.
 * - `?workMode=%20REMOTE%20` is `REMOTE` (trimmed, case sensitive); `?workMode=` is absent.
 * - `?tags=java,kafka` and `?tags=java&tags=kafka` both give two tags.
 */

const INT32: readonly [bigint, bigint] = [BigInt("-2147483648"), BigInt("2147483647")];
const INT64: readonly [bigint, bigint] = [BigInt("-9223372036854775808"), BigInt("9223372036854775807")];

/** The 400 error Spring returned when a request parameter could not be converted. */
export function invalidParameter(name: string): ApiException {
  return ApiException.badRequest(`Invalid value for '${name}'`);
}

/** Port of Spring's `StringUtils.trimAllWhitespace`: removes white space anywhere, not just at the ends. */
export function trimAllWhitespace(s: string): string {
  let out = "";
  for (const ch of s) if (!isJavaWhitespace(ch)) out += ch;
  return out;
}

/**
 * Port of Spring's `NumberUtils.parseNumber` for `Integer` and `Long`: white space is removed, a value
 * starting with `0x`, `0X` or `#` (optionally after `-`) is hexadecimal, anything else must be an
 * optionally signed decimal integer. Returns null when the text is not a number in [min, max].
 */
export function parseSpringInteger(text: string, [min, max]: readonly [bigint, bigint]): bigint | null {
  const t = trimAllWhitespace(text);
  let value: bigint;
  const hex = /^(-?)(?:0x|0X|#)([0-9a-fA-F]+)$/.exec(t);
  if (hex) {
    value = BigInt(`0x${hex[2]}`) * BigInt(hex[1] === "-" ? -1 : 1);
  } else if (/^[+-]?\d+$/.test(t)) {
    value = BigInt(t);
  } else {
    return null;
  }
  return value >= min && value <= max ? value : null;
}

/** The first value of a query parameter, like Spring when a single valued parameter is repeated. */
function first(params: URLSearchParams, name: string): string | null {
  return params.get(name);
}

/**
 * An optional `Integer` query parameter. An empty value means absent.
 *
 * @throws ApiException 400 when the value is not a 32 bit integer.
 */
export function intParam(params: URLSearchParams, name: string): number | null {
  const raw = first(params, name);
  if (raw === null || raw === "") return null;
  const value = parseSpringInteger(raw, INT32);
  if (value === null) throw invalidParameter(name);
  return Number(value);
}

/**
 * An optional enum query parameter: trimmed (Java `trim()`), case sensitive, empty means absent.
 *
 * @throws ApiException 400 when the value is not one of `constants`.
 */
export function enumParam<T extends string>(params: URLSearchParams, name: string, constants: readonly T[]): T | null {
  const raw = first(params, name);
  if (raw === null || raw === "") return null;
  const found = constants.find((c) => c === javaTrim(raw));
  if (found === undefined) throw invalidParameter(name);
  return found;
}

/**
 * An optional `String` query parameter. When repeated (`?q=a&q=b`), Spring joined the values with
 * commas when converting the `String[]` to a `String`.
 */
export function stringParam(params: URLSearchParams, name: string): string | null {
  const values = params.getAll(name);
  return values.length === 0 ? null : values.join(",");
}

/**
 * An optional `List<String>` query parameter. A single value is split on commas and each element
 * trimmed (Spring's `StringToCollectionConverter`); repeated parameters are taken as they are.
 */
export function listParam(params: URLSearchParams, name: string): string[] | null {
  const values = params.getAll(name);
  if (values.length === 0) return null;
  if (values.length > 1) return values;
  return values[0] === "" ? [] : values[0].split(",").map((v) => javaTrim(v));
}

/**
 * A `{id}` path variable bound to a Java `long`.
 *
 * Ids above 2^53 - 1 are valid longs but cannot be represented exactly in JavaScript. No row can have
 * such an id (the identity sequence would need to hand out nine quadrillion ids first), so they are
 * answered with the entity's 404 straight away instead of being rounded to some other id.
 *
 * @param notFoundMessage the 404 message of the entity, e.g. "Job not found".
 * @throws ApiException 400 when the text is not a long, 404 when it cannot exist.
 */
export function pathId(raw: string, notFoundMessage: string): number {
  const value = parseSpringInteger(raw, INT64);
  if (value === null) throw invalidParameter("id");
  if (value > BigInt(Number.MAX_SAFE_INTEGER) || value < BigInt(Number.MIN_SAFE_INTEGER)) {
    throw ApiException.notFound(notFoundMessage);
  }
  return Number(value);
}
