import { describe, expect, it } from "vitest";
import golden from "@/server/__fixtures__/legacy-java/urls.golden.json";
import { hashApplyUrl, isHttpUrl, normalizeApplyUrl, replaceLoneSurrogates } from "@/server/url/url-hasher";

describe("normalizeApplyUrl, hashApplyUrl and isHttpUrl against the legacy Java implementation", () => {
  // One test per golden case, so a failure names the exact URL.
  it.each(golden.map((g) => [JSON.stringify(g.input), g] as const))("%s", (_name, g) => {
    expect(normalizeApplyUrl(g.input)).toBe(g.normalized);
    expect(hashApplyUrl(g.input)).toBe(g.hash);
    expect(isHttpUrl(g.input)).toBe(g.isHttpUrl);
  });
});

describe("normalizeApplyUrl", () => {
  it("ignores tracking params, fragments, trailing slash and host case (ported Java unit test)", () => {
    const a = "https://www.linkedin.com/jobs/view/123/?trackingId=abc&utm_source=x#top";
    const b = "https://LinkedIn.com/jobs/view/123";
    expect(normalizeApplyUrl(a)).toBe(normalizeApplyUrl(b));
  });

  it("falls back to the trimmed, lower-cased input when Java could not parse it", () => {
    expect(normalizeApplyUrl("  HTTPS://Example.com/A B  ")).toBe("https://example.com/a b");
  });
});

describe("hashApplyUrl", () => {
  it("keeps meaningful query params (ported Java unit test)", () => {
    expect(hashApplyUrl("https://x.com/job?id=1")).not.toBe(hashApplyUrl("https://x.com/job?id=2"));
  });

  it("does not depend on query param order (ported Java unit test)", () => {
    expect(hashApplyUrl("https://x.com/j?a=1&b=2")).toBe(hashApplyUrl("https://x.com/j?b=2&a=1"));
  });

  it("is 64 lower-case hex characters (ported Java unit test)", () => {
    expect(hashApplyUrl("https://x.com")).toMatch(/^[0-9a-f]{64}$/);
  });
});

describe("isHttpUrl", () => {
  it("accepts http and https URLs with a host, in any case", () => {
    expect(isHttpUrl("https://example.com/x")).toBe(true);
    expect(isHttpUrl(" HTTP://example.com ")).toBe(true);
  });

  it("rejects other schemes, relative references and hosts Java does not accept", () => {
    expect(isHttpUrl("ftp://example.com")).toBe(false);
    expect(isHttpUrl("example.com/x")).toBe(false);
    expect(isHttpUrl("https://exa_mple.com/x")).toBe(false);
    expect(isHttpUrl("https://example.com/a b")).toBe(false);
  });
});

describe("replaceLoneSurrogates", () => {
  it("replaces unpaired high and low surrogates with '?' like Java's UTF-8 encoder", () => {
    expect(replaceLoneSurrogates("a\uD800b\uDC00c")).toBe("a?b?c");
  });

  it("keeps valid surrogate pairs and plain text unchanged", () => {
    expect(replaceLoneSurrogates("rocket 🚀")).toBe("rocket 🚀");
  });
});
