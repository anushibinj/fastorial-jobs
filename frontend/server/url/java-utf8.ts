/**
 * UTF-8 decoding with Java's replacement behaviour (`sun.nio.cs.UTF_8` with `CodingErrorAction.REPLACE`).
 *
 * Why not `TextDecoder`? Both replace invalid input with U+FFFD, but they do not always agree on *how
 * many* bytes one U+FFFD covers. The difference was found by fuzzing this port against the real Java
 * code: for the 3-byte encoding of a UTF-16 surrogate such as `ED A0 80`, Java reports one malformed
 * sequence of length 3 (one U+FFFD) while the WHATWG decoder rejects each byte separately (three U+FFFD).
 * Since `java.net.URI.getPath()` decodes percent escapes with Java's decoder, and the result is hashed for
 * duplicate detection, the port reproduces Java's rules exactly.
 *
 * The structure follows `UTF_8.Decoder.decodeArrayLoop` and `UTF_8.malformedN` in OpenJDK 21.
 */

const REPLACEMENT = "�";

/** True when `b` is not a continuation byte (`10xxxxxx`). */
function isNotContinuation(b: number): boolean {
  return (b & 0xc0) !== 0x80;
}

/**
 * Three byte sequence check: an overlong form (`E0` followed by `80..9F`) or a missing continuation.
 * Surrogates (`ED A0..BF ..`) pass this check and are rejected afterwards as a whole.
 */
function isMalformed3(b1: number, b2: number, b3: number): boolean {
  return (b1 === 0xe0 && (b2 & 0xe0) === 0x80) || isNotContinuation(b2) || isNotContinuation(b3);
}

/** The same check when only two bytes of a three byte sequence are left. */
function isMalformed3Of2(b1: number, b2: number): boolean {
  return (b1 === 0xe0 && (b2 & 0xe0) === 0x80) || isNotContinuation(b2);
}

/** Four byte sequence: every trailing byte must be a continuation (ranges are checked via the code point). */
function isMalformed4(b2: number, b3: number, b4: number): boolean {
  return isNotContinuation(b2) || isNotContinuation(b3) || isNotContinuation(b4);
}

/** The second byte check of a four byte sequence when fewer than four bytes are left. */
function isMalformed4Of2(b1: number, b2: number): boolean {
  return (b1 === 0xf0 && (b2 < 0x90 || b2 > 0xbf)) || (b1 === 0xf4 && (b2 & 0xf0) !== 0x80) || isNotContinuation(b2);
}

/**
 * Port of `UTF_8.malformedN`: given that the sequence of nominal length `nb` starting at `start` is
 * malformed, how many bytes does Java consume (and replace by one U+FFFD) before resynchronizing?
 */
function malformedLength(bytes: readonly number[], start: number, nb: number): number {
  const b1 = bytes[start];
  const b2 = bytes[start + 1];
  if (nb === 3) {
    return (b1 === 0xe0 && (b2 & 0xe0) === 0x80) || isNotContinuation(b2) ? 1 : 2;
  }
  if (nb === 4) {
    if (b1 > 0xf4 || (b1 === 0xf0 && (b2 < 0x90 || b2 > 0xbf)) || (b1 === 0xf4 && (b2 & 0xf0) !== 0x80) || isNotContinuation(b2)) {
      return 1;
    }
    return isNotContinuation(bytes[start + 2]) ? 2 : 3;
  }
  return 1; // one and two byte sequences always resynchronize after one byte
}

/**
 * Decodes `bytes` (values 0 to 255) the way `new String(bytes, UTF_8)` and `CharsetDecoder.decode(..., true)`
 * do with replacement: each malformed unit becomes one U+FFFD, and an incomplete sequence at the very end
 * of the input becomes a single U+FFFD covering all remaining bytes.
 */
export function decodeUtf8LikeJava(bytes: readonly number[]): string {
  let out = "";
  let sp = 0;
  const sl = bytes.length;
  while (sp < sl) {
    const b1 = bytes[sp];
    const remaining = sl - sp;
    if (b1 < 0x80) {
      // 1 byte: 0xxxxxxx
      out += String.fromCharCode(b1);
      sp++;
    } else if ((b1 & 0xe0) === 0xc0 && (b1 & 0x1e) !== 0) {
      // 2 bytes: 110xxxxx 10xxxxxx, lead C2..DF (C0 and C1 would be overlong and fall to the last branch)
      if (remaining < 2) {
        out += REPLACEMENT; // truncated at the end of input
        break;
      }
      const b2 = bytes[sp + 1];
      if (isNotContinuation(b2)) {
        out += REPLACEMENT;
        sp += 1;
        continue;
      }
      out += String.fromCharCode(((b1 & 0x1f) << 6) | (b2 & 0x3f));
      sp += 2;
    } else if ((b1 & 0xf0) === 0xe0) {
      // 3 bytes: 1110xxxx 10xxxxxx 10xxxxxx
      if (remaining < 3) {
        if (remaining > 1 && isMalformed3Of2(b1, bytes[sp + 1])) {
          out += REPLACEMENT;
          sp += 1;
          continue;
        }
        out += REPLACEMENT; // truncated at the end of input: one U+FFFD for the rest
        break;
      }
      const b2 = bytes[sp + 1];
      const b3 = bytes[sp + 2];
      if (isMalformed3(b1, b2, b3)) {
        out += REPLACEMENT;
        sp += malformedLength(bytes, sp, 3);
        continue;
      }
      const c = ((b1 & 0x0f) << 12) | ((b2 & 0x3f) << 6) | (b3 & 0x3f);
      if (c >= 0xd800 && c <= 0xdfff) {
        // An encoded surrogate: Java rejects all three bytes as one malformed sequence.
        out += REPLACEMENT;
        sp += 3;
        continue;
      }
      out += String.fromCharCode(c);
      sp += 3;
    } else if ((b1 & 0xf8) === 0xf0) {
      // 4 bytes: 11110xxx 10xxxxxx 10xxxxxx 10xxxxxx (lead F0..F7; F5..F7 fail the code point check)
      if (remaining < 4) {
        if (b1 > 0xf4 || (remaining > 1 && isMalformed4Of2(b1, bytes[sp + 1]))) {
          out += REPLACEMENT;
          sp += 1;
          continue;
        }
        if (remaining > 2 && isNotContinuation(bytes[sp + 2])) {
          out += REPLACEMENT;
          sp += 2;
          continue;
        }
        out += REPLACEMENT; // truncated at the end of input
        break;
      }
      const b2 = bytes[sp + 1];
      const b3 = bytes[sp + 2];
      const b4 = bytes[sp + 3];
      const cp = ((b1 & 0x07) << 18) | ((b2 & 0x3f) << 12) | ((b3 & 0x3f) << 6) | (b4 & 0x3f);
      // Supplementary code points are U+10000..U+10FFFF; anything else is overlong or out of range.
      if (isMalformed4(b2, b3, b4) || cp < 0x10000 || cp > 0x10ffff) {
        out += REPLACEMENT;
        sp += malformedLength(bytes, sp, 4);
        continue;
      }
      out += String.fromCodePoint(cp);
      sp += 4;
    } else {
      // A stray continuation byte, C0, C1, or F8..FF.
      out += REPLACEMENT;
      sp += 1;
    }
  }
  return out;
}
