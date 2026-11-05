import { describe, expect, it } from "vitest";
import names from "@/server/__fixtures__/legacy-java/names.golden.json";
import { compareIgnoreCase, isJavaBlank, isJavaWhitespace, javaTrim } from "@/server/shared/java-text";

describe("isJavaWhitespace", () => {
  it("accepts ASCII white space and the information separators", () => {
    for (const ch of [" ", "\t", "\n", "\u000B", "\f", "\r", "\u001C", "\u001F"]) {
      expect(isJavaWhitespace(ch)).toBe(true);
    }
  });

  it("accepts Unicode space, line and paragraph separators", () => {
    for (const ch of [" ", "　", " ", " ", " "]) {
      expect(isJavaWhitespace(ch)).toBe(true);
    }
  });

  it("rejects the non-breaking spaces and ordinary characters", () => {
    for (const ch of [" ", " ", " ", "a", "-", "\u0000"]) {
      expect(isJavaWhitespace(ch)).toBe(false);
    }
  });
});

describe("isJavaBlank", () => {
  it("is true for empty and white space only strings", () => {
    expect(isJavaBlank("")).toBe(true);
    expect(isJavaBlank(" \t\n　")).toBe(true);
  });

  it("is false when a non-breaking space or any other character is present", () => {
    expect(isJavaBlank(" ")).toBe(false);
    expect(isJavaBlank("  x ")).toBe(false);
  });
});

describe("javaTrim", () => {
  it("strips control characters and spaces up to U+0020 from both ends", () => {
    expect(javaTrim("\t\n  Acme \u0000\r")).toBe("Acme");
  });

  it("keeps Unicode spaces that JavaScript's trim would remove", () => {
    expect(javaTrim(" Acme　")).toBe(" Acme　");
  });

  it("returns an empty string when everything is trimmed", () => {
    expect(javaTrim(" \t ")).toBe("");
  });
});

describe("compareIgnoreCase", () => {
  it("sorts exactly like Java's String.CASE_INSENSITIVE_ORDER (golden output)", () => {
    const sorted = [...names.input].sort(compareIgnoreCase);
    expect(sorted).toEqual(names.sorted);
  });

  it("returns zero for strings that differ only in case", () => {
    expect(compareIgnoreCase("Spring Boot", "spring boot")).toBe(0);
  });

  it("orders a prefix before the longer string", () => {
    expect(compareIgnoreCase("Java", "JavaScript")).toBeLessThan(0);
    expect(compareIgnoreCase("JavaScript", "java")).toBeGreaterThan(0);
  });

  it("keeps characters without a single character case mapping unchanged (ß)", () => {
    // Java's Character.toUpperCase('ß') is 'ß', so "ß" and "SS" are different and ß (U+00DF) sorts after S.
    expect(compareIgnoreCase("ß", "ss")).toBeGreaterThan(0);
  });
});
