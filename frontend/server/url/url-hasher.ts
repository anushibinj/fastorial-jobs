import { createHash } from "node:crypto";
import { javaTrim } from "@/server/shared/java-text";
import { parseJavaUri, UriSyntaxError } from "@/server/url/java-uri";

/**
 * Query parameters that only track where a click came from. They never identify a different job,
 * so they are dropped before hashing. Compared lower-cased; anything starting with `utm_` is dropped too.
 */
const TRACKING_PARAMS: ReadonlySet<string> = new Set([
  "trackingid", "refid", "trk", "ref", "gclid", "fbclid", "source", "src", "utm_source",
  "utm_medium", "utm_campaign", "utm_term", "utm_content", "midtoken", "midsig", "lipi",
]);

/**
 * Normalizes an apply URL so that links to the same posting compare equal.
 * Port of the former backend's `UrlHasher.normalize`, step by step:
 *
 * 1. Parse with Java URI semantics (see `java-uri.ts`). A URL Java could not parse falls back to the
 *    trimmed, lower-cased input, exactly like the Java `catch (IllegalArgumentException)` branch.
 * 2. Lower-case the scheme (default `https` when missing) and host, and drop a leading `www.`.
 * 3. Use the *decoded* path (`URI.getPath()`), with trailing slashes removed but a lone `/` kept.
 * 4. Drop tracking parameters, lower-case the remaining parameter names and sort them. A repeated name
 *    keeps its last value (Java put them in a `TreeMap`). Values keep their raw encoding, and a
 *    parameter without a value, or with an empty one, is written without `=`.
 * 5. Keep the port unless it is absent, 0, 80 or 443, and drop the fragment.
 *
 * Examples: `https://www.LinkedIn.com/jobs/view/42/?trackingId=abc#top` gives
 * `https://linkedin.com/jobs/view/42`, and `https://x.com/j?b=2&a=1` gives `https://x.com/j?a=1&b=2`.
 */
export function normalizeApplyUrl(url: string): string {
  const trimmed = javaTrim(url);
  let uri;
  try {
    uri = parseJavaUri(trimmed);
  } catch (e) {
    if (UriSyntaxError.is(e)) return trimmed.toLowerCase();
    throw e;
  }

  const scheme = uri.scheme === null ? "https" : uri.scheme.toLowerCase();
  let host = uri.host === null ? "" : uri.host.toLowerCase();
  if (host.startsWith("www.")) host = host.slice(4);

  let path = uri.path ?? "";
  while (path.length > 1 && path.endsWith("/")) path = path.slice(0, -1);

  // A plain object would be fine, but a Map with explicit sorting states the TreeMap semantics clearly.
  const query = new Map<string, string>();
  if (uri.rawQuery !== null) {
    for (const pair of uri.rawQuery.split("&")) {
      if (pair === "") continue; // "a=1&&b=2" has an empty pair in the middle
      const eq = pair.indexOf("=");
      const key = (eq < 0 ? pair : pair.slice(0, eq)).toLowerCase();
      if (TRACKING_PARAMS.has(key) || key.startsWith("utm_")) continue;
      query.set(key, eq < 0 ? "" : pair.slice(eq + 1));
    }
  }

  let out = `${scheme}://${host}`;
  if (uri.port > 0 && uri.port !== 80 && uri.port !== 443) out += `:${uri.port}`;
  out += path;
  if (query.size > 0) {
    // TreeMap orders String keys by UTF-16 code units, which is also what the default sort does.
    const keys = [...query.keys()].sort();
    out += "?" + keys.map((k) => (query.get(k) === "" ? k : `${k}=${query.get(k)}`)).join("&");
  }
  return out;
}

/**
 * Replaces unpaired UTF-16 surrogates with `?`. Java's `String.getBytes(UTF_8)` encodes them that way,
 * while Node's UTF-8 encoder would write U+FFFD, which would change the hash. Valid pairs are kept.
 */
export function replaceLoneSurrogates(s: string): string {
  return s.replace(/[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/g, "?");
}

/**
 * SHA-256 (lower-case hex, 64 characters) of the normalized URL. Stored in `jobs.apply_url_hash`,
 * which has a unique index, so the same posting cannot be added twice.
 */
export function hashApplyUrl(url: string): string {
  return createHash("sha256").update(replaceLoneSurrogates(normalizeApplyUrl(url)), "utf8").digest("hex");
}

/**
 * True when the URL is an absolute `http` or `https` URL with a host, according to Java's URI rules.
 * Port of the former backend's `JobValidator.isHttpUrl`, used for the apply and logo URLs.
 */
export function isHttpUrl(url: string): boolean {
  try {
    const uri = parseJavaUri(javaTrim(url));
    const scheme = uri.scheme?.toLowerCase();
    return (scheme === "http" || scheme === "https") && uri.host !== null;
  } catch (e) {
    if (UriSyntaxError.is(e)) return false;
    throw e;
  }
}
