import { describe, expect, it } from "vitest";
import { decodeJavaPath, parseJavaUri, UriSyntaxError } from "@/server/url/java-uri";

describe("parseJavaUri", () => {
  it("splits a server-based URI into scheme, host, port, decoded path and raw query", () => {
    expect(parseJavaUri("HTTPS://user:pw@Example.com:8443/a%20b/?x=%20#frag")).toEqual({
      scheme: "HTTPS",
      host: "Example.com",
      port: 8443,
      path: "/a b/",
      rawQuery: "x=%20",
    });
  });

  it("returns port -1 when the port is absent or empty", () => {
    expect(parseJavaUri("https://example.com/x").port).toBe(-1);
    expect(parseJavaUri("https://example.com:/x").port).toBe(-1);
  });

  it("leaves host null for a registry-based authority (underscore, non-ASCII, bad label)", () => {
    for (const s of ["https://exa_mple.com/x", "https://exämple.com/x", "https://example.123/x", "https://a..b/x"]) {
      expect(parseJavaUri(s).host).toBeNull();
    }
  });

  it("accepts IPv4 addresses and bracketed IPv6 literals, with an optional scope id", () => {
    expect(parseJavaUri("http://192.168.0.1:80/").host).toBe("192.168.0.1");
    expect(parseJavaUri("http://[::ffff:1.2.3.4]/").host).toBe("[::ffff:1.2.3.4]");
    expect(parseJavaUri("http://[fe80::1%25eth0]/").host).toBe("[fe80::1%25eth0]");
  });

  it("rejects malformed IPv6 literals", () => {
    for (const s of ["http://[1:2:3:4:5:6:7:8:9]/", "http://[zz::1]/", "http://[::1/", "http://[1:2:3:4:5:6:7:8::]/"]) {
      expect(() => parseJavaUri(s)).toThrow(UriSyntaxError);
    }
  });

  it("returns null components for an opaque URI", () => {
    expect(parseJavaUri("mailto:someone@example.com")).toEqual({
      scheme: "mailto",
      host: null,
      port: -1,
      path: null,
      rawQuery: null,
    });
  });

  it("parses relative references without a scheme", () => {
    expect(parseJavaUri("//example.com/x")).toMatchObject({ scheme: null, host: "example.com", path: "/x" });
    expect(parseJavaUri("example.com/jobs")).toMatchObject({ scheme: null, host: null, path: "example.com/jobs" });
    expect(parseJavaUri("")).toMatchObject({ scheme: null, host: null, path: "" });
  });

  it("allows an empty authority before a path but not on its own", () => {
    expect(parseJavaUri("https:///x")).toMatchObject({ host: null, path: "/x" });
    expect(() => parseJavaUri("https://")).toThrow(UriSyntaxError);
  });

  it("throws for characters Java does not allow unescaped", () => {
    for (const s of ["https://example.com/a b", "https://example.com/a|b", "https://example.com/a?x={1}",
      "https://example.com/a#b#c", "https://example.com/ ", "https://example.com/a%2", "1http://x.com"]) {
      expect(() => parseJavaUri(s), s).toThrow(UriSyntaxError);
    }
  });

  it("accepts visible non-ASCII characters and square brackets in the query", () => {
    expect(parseJavaUri("https://example.com/über?q=[1]")).toMatchObject({ path: "/über", rawQuery: "q=[1]" });
  });

  it("rejects a port that does not fit in an int, falling back to a null host when the authority is a reg_name", () => {
    expect(parseJavaUri("https://example.com:99999999999/x").host).toBeNull();
  });
});

describe("decodeJavaPath", () => {
  it("returns the input unchanged when there are no escapes", () => {
    expect(decodeJavaPath("/a/b")).toBe("/a/b");
  });

  it("decodes runs of escapes together as UTF-8", () => {
    expect(decodeJavaPath("/caf%C3%A9/%e2%82%ac/%2F")).toBe("/café/€//");
  });

  it("replaces malformed bytes with U+FFFD like Java", () => {
    expect(decodeJavaPath("/%FF%41")).toBe("/�A");
  });
});

describe("UriSyntaxError", () => {
  it("includes the index in its message", () => {
    const e = new UriSyntaxError("Illegal character in path", 21);
    expect(e.message).toBe("Illegal character in path at index 21");
    expect(e.index).toBe(21);
    expect(e.name).toBe("UriSyntaxError");
  });
});
