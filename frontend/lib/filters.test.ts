import { describe, expect, it } from "vitest";
import { hasFilters, parseFilters, toApiParams, toSearchParams } from "./filters";

describe("filters", () => {
  it("parses and ignores junk", () => {
    const f = parseFilters({ q: " java ", location: "Pune", mode: "remote", exp: "7", tags: "java, kafka,," });
    expect(f).toEqual({ q: "java", location: "Pune", mode: "REMOTE", exp: "7", tags: ["java", "kafka"] });
    expect(parseFilters({ mode: "nope", exp: "99" })).toMatchObject({ mode: "", exp: "" });
    expect(parseFilters({ exp: "-1" }).exp).toBe("");
    expect(parseFilters({ exp: "abc" }).exp).toBe("");
  });

  it("accepts URLSearchParams and arrays", () => {
    expect(parseFilters(new URLSearchParams("exp=0&tags=go")).exp).toBe("0");
    expect(parseFilters({ q: ["a", "b"] }).q).toBe("a");
  });

  it("round trips through the URL and drops empties", () => {
    const f = parseFilters({ exp: "0", tags: "java" });
    expect(toSearchParams(f).toString()).toBe("exp=0&tags=java");
    expect(toSearchParams(parseFilters({})).toString()).toBe("");
  });

  it("sends exp as expMin=expMax to the API", () => {
    const p = toApiParams(parseFilters({ exp: "7", mode: "hybrid", tags: "java,kafka" }), 2, 20);
    expect(p.get("expMin")).toBe("7");
    expect(p.get("expMax")).toBe("7");
    expect(p.get("workMode")).toBe("HYBRID");
    expect(p.get("tags")).toBe("java,kafka");
    expect(p.get("page")).toBe("2");
    expect(toApiParams(parseFilters({})).has("expMin")).toBe(false);
  });

  it("hasFilters treats exp=0 as active", () => {
    expect(hasFilters(parseFilters({ exp: "0" }))).toBe(true);
    expect(hasFilters(parseFilters({}))).toBe(false);
  });
});
