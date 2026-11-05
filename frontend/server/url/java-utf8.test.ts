import { describe, expect, it } from "vitest";
import golden from "@/server/__fixtures__/legacy-java/utf8-paths.golden.json";
import { normalizeApplyUrl } from "@/server/url/url-hasher";
import { decodeUtf8LikeJava } from "@/server/url/java-utf8";

const R = "�";

describe("decodeUtf8LikeJava", () => {
  it("decodes valid 1, 2, 3 and 4 byte sequences", () => {
    expect(decodeUtf8LikeJava([0x41, 0xc3, 0xa9, 0xe2, 0x82, 0xac, 0xf0, 0x9f, 0x9a, 0x80])).toBe("Aé€🚀");
  });

  it("keeps a byte order mark, which TextDecoder would drop by default", () => {
    expect(decodeUtf8LikeJava([0xef, 0xbb, 0xbf, 0x61])).toBe("﻿a");
  });

  it("replaces an encoded surrogate with a single U+FFFD (where TextDecoder gives three)", () => {
    expect(decodeUtf8LikeJava([0xed, 0xa0, 0x80])).toBe(R);
    expect(new TextDecoder().decode(Uint8Array.from([0xed, 0xa0, 0x80]))).toBe(R + R + R);
  });

  it("replaces a lone continuation byte and invalid leads one byte at a time", () => {
    expect(decodeUtf8LikeJava([0x80, 0xc0, 0xaf, 0xff])).toBe(R + R + R + R);
  });

  it("resynchronizes after a two byte prefix of a broken three byte sequence", () => {
    expect(decodeUtf8LikeJava([0xe2, 0x82, 0x41])).toBe(R + "A");
  });

  it("treats an overlong three byte form as malformed after its lead byte", () => {
    expect(decodeUtf8LikeJava([0xe0, 0x80, 0x80])).toBe(R + R + R);
  });

  it("rejects four byte sequences outside U+10000..U+10FFFF", () => {
    expect(decodeUtf8LikeJava([0xf0, 0x80, 0x80, 0x80])).toBe(R + R + R + R); // overlong
    expect(decodeUtf8LikeJava([0xf4, 0x90, 0x80, 0x80])).toBe(R + R + R + R); // above U+10FFFF
    expect(decodeUtf8LikeJava([0xf5, 0x80, 0x80, 0x80])).toBe(R + R + R + R); // invalid lead
  });

  it("replaces a truncated sequence at the end of input with one U+FFFD", () => {
    expect(decodeUtf8LikeJava([0x61, 0xf0, 0x9f, 0x98])).toBe("a" + R);
    expect(decodeUtf8LikeJava([0xe2, 0x82])).toBe(R);
    expect(decodeUtf8LikeJava([0xc3])).toBe(R);
  });

  it("treats a short four byte sequence with a bad second or third byte like Java", () => {
    expect(decodeUtf8LikeJava([0xf0, 0x41])).toBe(R + "A");
    expect(decodeUtf8LikeJava([0xf0, 0x9f, 0x41])).toBe(R + "A");
    expect(decodeUtf8LikeJava([0xf5, 0x80])).toBe(R + R);
  });

  it("returns an empty string for no bytes", () => {
    expect(decodeUtf8LikeJava([])).toBe("");
  });

  // Golden cases: percent-encoded byte sequences decoded by java.net.URI.getPath() in the real backend.
  it.each(golden.map((g) => [g.input, g] as const))("matches Java for %s", (_input, g) => {
    expect(normalizeApplyUrl(g.input)).toBe(g.normalized);
  });
});
