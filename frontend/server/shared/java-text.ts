/**
 * Java `String` semantics that the former Spring Boot backend relied on.
 *
 * JavaScript's built-ins look similar but differ at the edges: `String.prototype.trim()` strips every
 * Unicode white space (including the non-breaking space U+00A0), whereas Java's `trim()` strips only
 * code units up to U+0020, and Java's `isBlank()` uses `Character.isWhitespace`, which deliberately
 * treats the non-breaking spaces as *not* white space. Titles, company names and URLs are stored
 * exactly as the Java code stored them, so the port uses these helpers wherever Java called the
 * corresponding method. That keeps slugs, duplicate detection and validation identical.
 */

/** Non-breaking spaces are Unicode space separators, but `Character.isWhitespace` excludes them. */
const NON_BREAKING_SPACES = new Set([" ", " ", " "]);

/** ASCII control characters that `Character.isWhitespace` accepts in addition to space separators. */
const JAVA_CONTROL_WHITESPACE = /^[\t\n\u000B\f\r\u001C-\u001F]$/;

/** Unicode space (`Zs`), line (`Zl`) and paragraph (`Zp`) separators. */
const UNICODE_SEPARATOR = /^\p{Z}$/u;

/**
 * Port of `java.lang.Character.isWhitespace(char)`.
 *
 * True for the Unicode space, line and paragraph separators except the three non-breaking spaces,
 * and for `\t \n \u000B \f \r` and the four information separators `\u001C` to `\u001F`.
 *
 * @param ch a single UTF-16 code unit.
 */
export function isJavaWhitespace(ch: string): boolean {
  if (JAVA_CONTROL_WHITESPACE.test(ch)) return true;
  return UNICODE_SEPARATOR.test(ch) && !NON_BREAKING_SPACES.has(ch);
}

/**
 * Port of `java.lang.String.isBlank()`: true when the string is empty or contains only
 * `Character.isWhitespace` characters.
 */
export function isJavaBlank(s: string): boolean {
  for (const ch of s) {
    if (!isJavaWhitespace(ch)) return false;
  }
  return true;
}

/**
 * Port of `java.lang.String.trim()`: removes every leading and trailing code unit whose value is
 * at most U+0020 (space and all ASCII control characters). Unlike JavaScript's `trim()`, it keeps
 * non-breaking and other Unicode spaces.
 */
export function javaTrim(s: string): string {
  let start = 0;
  let end = s.length;
  while (start < end && s.charCodeAt(start) <= 0x20) start++;
  while (end > start && s.charCodeAt(end - 1) <= 0x20) end--;
  return s.slice(start, end);
}

/**
 * Java's per character *simple* case mapping. JavaScript only offers full case mapping, which can
 * turn one character into several (`"ß".toUpperCase()` is `"SS"`), while Java's
 * `Character.toUpperCase('ß')` leaves it unchanged. A mapping that would change the length is
 * therefore treated as "no simple mapping", which is what Java does for those characters.
 */
function simpleCase(ch: string, upper: boolean): string {
  const mapped = upper ? ch.toUpperCase() : ch.toLowerCase();
  return mapped.length === ch.length ? mapped : ch;
}

/**
 * Port of `String.CASE_INSENSITIVE_ORDER`, used by the backend to sort tags by name.
 *
 * Java compares the strings code unit by code unit. When two units differ it compares their upper
 * case forms, and if those still differ it compares their lower case forms (needed for alphabets such
 * as Georgian whose case pairs are not symmetric). The first remaining difference decides; otherwise
 * the shorter string sorts first. This is *not* the same as `localeCompare`, which would, for
 * example, sort `"_x"` and `"[y]"` differently.
 *
 * @returns a negative number, zero or a positive number, like any `Array.prototype.sort` comparator.
 */
export function compareIgnoreCase(a: string, b: string): number {
  const min = Math.min(a.length, b.length);
  for (let i = 0; i < min; i++) {
    let c1 = a[i];
    let c2 = b[i];
    if (c1 === c2) continue;
    c1 = simpleCase(c1, true);
    c2 = simpleCase(c2, true);
    if (c1 === c2) continue;
    c1 = simpleCase(c1, false);
    c2 = simpleCase(c2, false);
    if (c1 !== c2) return c1.charCodeAt(0) - c2.charCodeAt(0);
  }
  return a.length - b.length;
}
