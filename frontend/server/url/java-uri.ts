/**
 * A faithful port of the parts of `java.net.URI` (OpenJDK 21) that the former backend observed through
 * `URI.create(s)`: whether the string parses, and `getScheme()`, `getHost()`, `getPort()`, `getPath()`
 * and `getRawQuery()`.
 *
 * Why not use the WHATWG `URL` class? Because it answers differently for many real inputs. It
 * percent-encodes spaces instead of rejecting them, resolves `..` segments, lower-cases and punycodes
 * hosts, accepts `_` in host names, and returns the raw (encoded) path. Java does the opposite in every
 * one of those cases. Duplicate detection hashes a normalized form of each apply URL, and the hashes of
 * existing production rows were computed by Java, so the TypeScript port must agree with Java exactly.
 * `server/__fixtures__/legacy-java/urls.golden.json` holds outputs captured from the real Java code and
 * the tests compare against it.
 *
 * The grammar is RFC 2396 with the JDK's documented deviations (IPv6 literals per RFC 2732, empty
 * authority and empty path allowed). Character classes are expressed as strings of the allowed ASCII
 * characters rather than Java's 128 bit masks; `allowEscapes` corresponds to Java's `L_ESCAPED` bit.
 */

import { errorBrand } from "@/server/shared/error-brand";
import { decodeUtf8LikeJava } from "@/server/url/java-utf8";

/** The components of a parsed URI, named after the `java.net.URI` getters they reproduce. */
export interface JavaUri {
  /** `getScheme()`: the scheme as written (not lower-cased), or null for a relative reference. */
  scheme: string | null;
  /** `getHost()`: only set for a server-based authority, so `exa_mple.com` gives null. */
  host: string | null;
  /** `getPort()`: -1 when there is no port, or the port is empty (`example.com:`). */
  port: number;
  /** `getPath()`: the path with `%XX` escapes decoded as UTF-8, or null for opaque URIs like `mailto:`. */
  path: string | null;
  /** `getRawQuery()`: the query exactly as written (escapes kept), or null when there is no `?`. */
  rawQuery: string | null;
}

const URI_SYNTAX_BRAND = errorBrand("UriSyntaxError");

/** Thrown when Java's `URI.create` would throw `IllegalArgumentException` (wrapping `URISyntaxException`). */
export class UriSyntaxError extends Error {
  constructor(message: string, readonly index: number) {
    super(`${message} at index ${index}`);
    this.name = "UriSyntaxError";
    URI_SYNTAX_BRAND.mark(this);
  }

  /** Type check that works across module copies (see `error-brand.ts`); use instead of `instanceof`. */
  static is(value: unknown): value is UriSyntaxError {
    return URI_SYNTAX_BRAND.has(value);
  }
}

// ---- character classes, copied from the RFC 2396 productions documented in java.net.URI ----

const DIGIT = "0123456789";
const ALPHA = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz";
const ALPHANUM = ALPHA + DIGIT;
const HEX = DIGIT + "ABCDEFabcdef";
const MARK = "-_.!~*'()";
const UNRESERVED = ALPHANUM + MARK;
// RFC 2732 added "[" and "]" to the reserved set, which is why Java accepts `?x=[1]` in a query.
const RESERVED = ";/?:@&=+$,[]";

/** A set of allowed ASCII characters plus whether `%XX` escapes and visible non-ASCII characters are allowed. */
interface CharClass {
  chars: ReadonlySet<string>;
  allowEscapes: boolean;
}

function charClass(chars: string, allowEscapes: boolean): CharClass {
  return { chars: new Set(chars), allowEscapes };
}

const C_ALPHA = charClass(ALPHA, false);
const C_DIGIT = charClass(DIGIT, false);
const C_HEX = charClass(HEX, false);
const C_ALPHANUM = charClass(ALPHANUM, false);
const C_ALPHANUM_DASH = charClass(ALPHANUM + "-", false);
const C_DIGIT_DOT = charClass(DIGIT + ".", false);
const C_SCHEME = charClass(ALPHA + DIGIT + "+-.", false);
const C_URIC = charClass(RESERVED + UNRESERVED, true);
const C_PATH = charClass(UNRESERVED + ":@&=+$," + ";/", true);
const C_USERINFO = charClass(UNRESERVED + ";:&=+$,", true);
const C_REG_NAME = charClass(UNRESERVED + "$,;:@&=+", true);
// Java builds L_SERVER from L_USERINFO, so it inherits the escape bit.
const C_SERVER = charClass(UNRESERVED + ";:&=+$," + ALPHANUM + "-" + ".:@[]", true);
// Inside an IPv6 literal "%" introduces a scope id (`[fe80::1%25eth0]`) rather than an escape.
const C_SERVER_PERCENT = charClass(UNRESERVED + ";:&=+$," + ALPHANUM + "-" + ".:@[]" + "%", true);
const C_SCOPE_ID = charClass(ALPHANUM + "_.", false);

/**
 * Port of `Character.isSpaceChar`: Unicode space, line and paragraph separators (including U+00A0).
 * Used to decide whether a non-ASCII character may appear unescaped.
 */
function isSpaceChar(code: number): boolean {
  return /^\p{Z}$/u.test(String.fromCharCode(code));
}

/** Port of `Character.isISOControl`: U+0000 to U+001F and U+007F to U+009F. */
function isIsoControl(code: number): boolean {
  return code <= 0x1f || (code >= 0x7f && code <= 0x9f);
}

/**
 * Parses `input` the way `java.net.URI.create(input)` does.
 *
 * @throws UriSyntaxError when Java would reject the string.
 */
export function parseJavaUri(input: string): JavaUri {
  return new JavaUriParser(input).parse();
}

/**
 * Decodes the `%XX` escapes of a path exactly like the private `java.net.URI.decode(String)`:
 * every run of consecutive escapes is collected into bytes and decoded as UTF-8, with malformed
 * byte sequences replaced by U+FFFD (Java's `CodingErrorAction.REPLACE`, see `java-utf8.ts` for why
 * `TextDecoder` cannot be used). Characters outside escapes are copied unchanged. The input must already
 * have passed the parser, so every `%` starts a valid two hex digit escape.
 */
export function decodeJavaPath(path: string): string {
  if (!path.includes("%")) return path;
  let out = "";
  let i = 0;
  while (i < path.length) {
    if (path[i] !== "%") {
      out += path[i];
      i++;
      continue;
    }
    // Gather the whole run "%E2%82%AC" before decoding, because one character may span several escapes.
    const bytes: number[] = [];
    while (i < path.length && path[i] === "%") {
      bytes.push(Number.parseInt(path.slice(i + 1, i + 3), 16));
      i += 3;
    }
    out += decodeUtf8LikeJava(bytes);
  }
  return out;
}

/**
 * Recursive descent parser mirroring `java.net.URI.Parser`. Method names and the order of the checks
 * follow the JDK source so the two can be compared side by side. Positions are UTF-16 indexes, like
 * Java `char` indexes.
 */
class JavaUriParser {
  private scheme: string | null = null;
  private host: string | null = null;
  private port = -1;
  private path: string | null = null;
  private rawQuery: string | null = null;
  /** Bytes counted while parsing an IPv6 literal, to reject too long or too short addresses. */
  private ipv6ByteCount = 0;

  constructor(private readonly input: string) {}

  /** Top level: `[scheme:]scheme-specific-part[#fragment]`. */
  parse(): JavaUri {
    const n = this.input.length;
    // Look for a ':' before any of "/?#". If one of those comes first there is no scheme.
    let p = this.scanUntil(0, n, "/?#", ":");
    if (p >= 0 && this.at(p, n, ":")) {
      if (p === 0) this.fail("Expected scheme name", 0);
      this.checkChar(0, C_ALPHA, "scheme name");
      this.checkChars(1, p, C_SCHEME, "scheme name");
      this.scheme = this.input.slice(0, p);
      p++; // skip ':'
      if (this.at(p, n, "/")) {
        p = this.parseHierarchical(p, n);
      } else {
        // Opaque URI such as "mailto:a@b": no authority, path or query, Java returns null for them.
        const q = this.scanUntil(p, n, "", "#");
        if (q <= p) this.fail("Expected scheme-specific part", p);
        this.checkChars(p, q, C_URIC, "opaque part");
        p = q;
      }
    } else {
      p = this.parseHierarchical(0, n);
    }
    if (this.at(p, n, "#")) {
      // The fragment is validated (a second '#' is illegal) but otherwise ignored by the backend.
      this.checkChars(p + 1, n, C_URIC, "fragment");
      p = n;
    }
    if (p < n) this.fail("End of URI", p);
    return {
      scheme: this.scheme,
      host: this.host,
      port: this.port,
      path: this.path === null ? null : decodeJavaPath(this.path),
      rawQuery: this.rawQuery,
    };
  }

  /** `["//" authority] path ["?" query]`, where Java allows the authority and path to be empty. */
  private parseHierarchical(start: number, n: number): number {
    let p = start;
    if (this.at(p, n, "/") && this.at(p + 1, n, "/")) {
      p += 2;
      const q = this.scanUntil(p, n, "", "/?#");
      if (q > p) {
        p = this.parseAuthority(p, q);
      } else if (q >= n) {
        // "https://" with nothing after it. An empty authority is only allowed before a path,
        // query or fragment ("https:///x" is accepted, with a null host).
        this.fail("Expected authority", p);
      }
    }
    let q = this.scanUntil(p, n, "", "?#");
    this.checkChars(p, q, C_PATH, "path");
    this.path = this.input.slice(p, q);
    p = q;
    if (this.at(p, n, "?")) {
      p++;
      q = this.scanUntil(p, n, "", "#");
      this.checkChars(p, q, C_URIC, "query");
      this.rawQuery = this.input.slice(p, q);
      p = q;
    }
    return p;
  }

  /**
   * An authority is either server-based (`[userinfo@]host[:port]`, which sets host and port) or
   * registry-based (any `reg_name`, which leaves host null). Java first tries server-based parsing
   * when the characters allow it; if that fails and the characters also form a valid reg_name, the
   * URI is still valid but has no host. That is how `https://exa_mple.com/x` parses with a null host.
   */
  private parseAuthority(start: number, n: number): number {
    const p = start;
    let q = p;
    let error: UriSyntaxError | null = null;

    // Java checks for "]" (an IPv6 literal) to decide whether "%" is a scope id separator.
    // Either way an invalid "%" is rejected later, so the result is the same as Java's scan.
    const serverClass = this.input.slice(p, n).includes("]") ? C_SERVER_PERCENT : C_SERVER;
    const serverChars = this.scan(p, n, serverClass) === n;
    const regChars = this.scan(p, n, C_REG_NAME) === n;

    if (regChars && !serverChars) return n; // registry-based authority, host stays null

    if (serverChars) {
      try {
        q = this.parseServer(p, n);
        if (q < n) this.fail("Expected end of authority", q);
      } catch (e) {
        if (!UriSyntaxError.is(e)) throw e;
        // Undo the partial server parse, then fall back to a registry-based authority below.
        this.host = null;
        this.port = -1;
        error = e;
        q = p;
      }
    }

    if (q < n) {
      if (regChars) return n; // registry-based authority, host stays null
      if (error) throw error; // most likely a malformed IPv6 literal
      this.fail("Illegal character in authority", q);
    }
    return n;
  }

  /** `[userinfo@](IPv6 literal | IPv4 address | hostname)[:port]`. */
  private parseServer(start: number, n: number): number {
    let p = start;
    let q = this.scanUntil(p, n, "/?#", "@");
    if (q >= p && this.at(q, n, "@")) {
      this.checkChars(p, q, C_USERINFO, "user info");
      p = q + 1; // user info is validated but not needed by the backend
    }

    if (this.at(p, n, "[")) {
      p++;
      q = this.scanUntil(p, n, "/?#", "]");
      if (q > p && this.at(q, n, "]")) {
        // An optional "%" scope id follows the address inside the brackets.
        const r = this.scanUntil(p, q, "", "%");
        if (r > p) {
          this.parseIPv6Reference(p, r);
          if (r + 1 === q) this.fail("Scope id expected", r);
          this.checkChars(r + 1, q, C_SCOPE_ID, "scope id");
        } else {
          this.parseIPv6Reference(p, q);
        }
        this.host = this.input.slice(p - 1, q + 1); // Java keeps the brackets in getHost()
        p = q + 1;
      } else {
        this.fail("Expected closing bracket for IPv6 address", q);
      }
    } else {
      q = this.parseIPv4Address(p, n);
      if (q <= p) q = this.parseHostname(p, n);
      p = q;
    }

    if (this.at(p, n, ":")) {
      p++;
      q = this.scanUntil(p, n, "", "/");
      if (q > p) {
        this.checkChars(p, q, C_DIGIT, "port number");
        const value = Number(this.input.slice(p, q));
        // Integer.parseInt rejects anything above Integer.MAX_VALUE.
        if (value > 2147483647) this.fail("Malformed port number", p);
        this.port = value;
        p = q;
      }
    }
    if (p < n) this.fail("Expected port number", p);
    return p;
  }

  /**
   * Accepts a dotted IPv4 address only when it is exactly four numbers of at most 255 and is followed
   * by the end or a ':'. Otherwise returns -1 so the caller tries a hostname instead (Java swallows the
   * exception here).
   */
  private parseIPv4Address(start: number, n: number): number {
    let p: number;
    try {
      p = this.scanIPv4Address(start, n, false);
    } catch (e) {
      if (UriSyntaxError.is(e)) return -1;
      throw e;
    }
    if (p > start && p < n && this.input[p] !== ":") p = -1;
    if (p > start) this.host = this.input.slice(start, p);
    return p;
  }

  /** Scans `byte.byte.byte.byte`; `strict` requires the address to fill the whole range. */
  private scanIPv4Address(start: number, n: number, strict: boolean): number {
    let p = start;
    const m = this.scan(p, n, C_DIGIT_DOT);
    if (m <= p || (strict && m !== n)) return -1;
    // Exactly four bytes separated by three dots, each at most 255, consuming the whole digit/dot run.
    let q = p;
    for (let part = 0; part < 4; part++) {
      if (part > 0) {
        q = this.scanChar(p, m, ".");
        if (q <= p) this.fail("Malformed IPv4 address", q);
        p = q;
      }
      q = this.scanByte(p, m);
      if (q <= p) this.fail("Malformed IPv4 address", q);
      p = q;
    }
    if (q < m) this.fail("Malformed IPv4 address", q);
    return q;
  }

  /** IPv4 address that must be present (used for the IPv4 tail of an IPv6 literal). */
  private takeIPv4Address(start: number, n: number, expected: string): number {
    const p = this.scanIPv4Address(start, n, true);
    if (p <= start) this.fail(`Expected ${expected}`, start);
    return p;
  }

  /** One decimal byte: digits whose value is at most 255. Returns `start` when the value is too large. */
  private scanByte(start: number, n: number): number {
    const q = this.scan(start, n, C_DIGIT);
    if (q <= start) return q;
    if (Number(this.input.slice(start, q)) > 255) return start;
    return q;
  }

  /**
   * RFC 2396 hostname: dot separated labels of letters, digits and inner dashes. When there is more than
   * one label, the last one must start with a letter, so `example.123` and `999.1.1.1` are not
   * hostnames. A trailing dot (`example.com.`) is allowed.
   */
  private parseHostname(start: number, n: number): number {
    let p = start;
    let lastLabel = -1;
    do {
      // A label starts with a letter or digit ...
      let q = this.scan(p, n, C_ALPHANUM);
      if (q <= p) break;
      lastLabel = p;
      p = q;
      // ... continues with letters, digits and dashes, but must not end with a dash.
      q = this.scan(p, n, C_ALPHANUM_DASH);
      if (q > p) {
        if (this.input[q - 1] === "-") this.fail("Illegal character in hostname", q - 1);
        p = q;
      }
      q = this.scanChar(p, n, ".");
      if (q <= p) break;
      p = q;
    } while (p < n);

    if (p < n && !this.at(p, n, ":")) this.fail("Illegal character in hostname", p);
    if (lastLabel < 0) this.fail("Expected hostname", start);
    if (lastLabel > start && !C_ALPHA.chars.has(this.input[lastLabel])) {
      this.fail("Illegal character in hostname", lastLabel);
    }
    this.host = this.input.slice(start, p);
    return p;
  }

  /**
   * RFC 2373 IPv6 address, with "::" compression and an optional trailing IPv4 address. Counts bytes
   * so an address is exactly 16 bytes, or shorter when "::" stands in for the missing zero groups.
   */
  private parseIPv6Reference(start: number, n: number): number {
    let p = start;
    let compressedZeros = false;
    const q = this.scanHexSeq(p, n);
    if (q > p) {
      p = q;
      if (this.atString(p, n, "::")) {
        compressedZeros = true;
        p = this.scanHexPost(p + 2, n);
      } else if (this.at(p, n, ":")) {
        p = this.takeIPv4Address(p + 1, n, "IPv4 address");
        this.ipv6ByteCount += 4;
      }
    } else if (this.atString(p, n, "::")) {
      compressedZeros = true;
      p = this.scanHexPost(p + 2, n);
    }
    if (p < n) this.fail("Malformed IPv6 address", start);
    if (this.ipv6ByteCount > 16) this.fail("IPv6 address too long", start);
    if (!compressedZeros && this.ipv6ByteCount < 16) this.fail("IPv6 address too short", start);
    if (compressedZeros && this.ipv6ByteCount === 16) this.fail("Malformed IPv6 address", start);
    return p;
  }

  /** What may follow "::": nothing, hex groups optionally ending in an IPv4 address, or an IPv4 address. */
  private scanHexPost(start: number, n: number): number {
    let p = start;
    if (p === n) return p;
    const q = this.scanHexSeq(p, n);
    if (q > p) {
      p = q;
      if (this.at(p, n, ":")) {
        p++;
        p = this.takeIPv4Address(p, n, "hex digits or IPv4 address");
        this.ipv6ByteCount += 4;
      }
    } else {
      p = this.takeIPv4Address(p, n, "hex digits or IPv4 address");
      this.ipv6ByteCount += 4;
    }
    return p;
  }

  /**
   * `hex4 *(":" hex4)`, stopping before "::" and before a group that turns out to start an IPv4 address.
   * Returns -1 when no group can be scanned.
   */
  private scanHexSeq(start: number, n: number): number {
    let p = start;
    let q = this.scan(p, n, C_HEX);
    if (q <= p) return -1;
    if (this.at(q, n, ".")) return -1; // the digits belong to an IPv4 address
    if (q > p + 4) this.fail("IPv6 hexadecimal digit sequence too long", p);
    this.ipv6ByteCount += 2;
    p = q;
    while (p < n) {
      if (!this.at(p, n, ":")) break;
      if (this.at(p + 1, n, ":")) break; // "::"
      p++;
      q = this.scan(p, n, C_HEX);
      if (q <= p) this.fail("Expected digits for an IPv6 address", p);
      if (this.at(q, n, ".")) {
        p--; // give the ':' back, the rest is an IPv4 address
        break;
      }
      if (q > p + 4) this.fail("IPv6 hexadecimal digit sequence too long", p);
      this.ipv6ByteCount += 2;
      p = q;
    }
    return p;
  }

  // ---- scanning primitives, same contracts as the JDK's private helpers ----

  /** True when the character at `index` (< end) equals `ch`. */
  private at(index: number, end: number, ch: string): boolean {
    return index < end && this.input[index] === ch;
  }

  /** True when `s` starts at `index` and fits before `end`. */
  private atString(index: number, end: number, s: string): boolean {
    return index + s.length <= end && this.input.startsWith(s, index);
  }

  /** Returns `start + 1` when the character at `start` is `ch`, otherwise `start`. */
  private scanChar(start: number, end: number, ch: string): number {
    return this.at(start, end, ch) ? start + 1 : start;
  }

  /**
   * Moves forward until a character from `stop` (returns its index) or the end (returns `end`).
   * Meeting a character from `err` first returns -1.
   */
  private scanUntil(start: number, end: number, err: string, stop: string): number {
    let p = start;
    while (p < end) {
      const c = this.input[p];
      if (err.includes(c)) return -1;
      if (stop.includes(c)) break;
      p++;
    }
    return p;
  }

  /**
   * Moves forward over characters of `cls` and returns the index of the first one that is not in it.
   * When the class allows escapes, a valid `%XX` is skipped as a unit and a visible non-ASCII character
   * is accepted; a `%` that does not start a valid escape throws (Java: "Malformed escape pair").
   */
  private scan(start: number, end: number, cls: CharClass): number {
    let p = start;
    while (p < end) {
      const code = this.input.charCodeAt(p);
      // Java's match(): NUL never matches, and only ASCII can be in a mask.
      if (code !== 0 && code < 128 && cls.chars.has(this.input[p])) {
        p++;
        continue;
      }
      if (cls.allowEscapes) {
        const q = this.scanEscape(p, end, code);
        if (q > p) {
          p = q;
          continue;
        }
      }
      break;
    }
    return p;
  }

  /** An escape pair, or an unescaped but visible non-ASCII character (Java allows those, RFC 2396 does not). */
  private scanEscape(start: number, end: number, code: number): number {
    if (code === 0x25 /* % */) {
      if (
        start + 3 <= end &&
        C_HEX.chars.has(this.input[start + 1] ?? "") &&
        C_HEX.chars.has(this.input[start + 2] ?? "")
      ) {
        return start + 3;
      }
      this.fail("Malformed escape pair", start);
    } else if (code > 128 && !isSpaceChar(code) && !isIsoControl(code)) {
      return start + 1;
    }
    return start;
  }

  /** Requires every character in [start, end) to belong to `cls`. */
  private checkChars(start: number, end: number, cls: CharClass, what: string): void {
    const p = this.scan(start, end, cls);
    if (p < end) this.fail(`Illegal character in ${what}`, p);
  }

  /** Requires the single character at `index` to belong to `cls`. */
  private checkChar(index: number, cls: CharClass, what: string): void {
    this.checkChars(index, index + 1, cls, what);
  }

  private fail(message: string, index: number): never {
    throw new UriSyntaxError(message, index);
  }
}
