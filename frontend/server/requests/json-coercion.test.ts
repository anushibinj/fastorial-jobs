import { describe, expect, it } from "vitest";
import { ApiException } from "@/server/shared/api-exception";
import {
  coerceEnum,
  coerceInstant,
  coerceInt32,
  coerceInt64,
  coerceString,
  coerceStringList,
  expectObject,
  malformedBody,
  parseIsoInstant,
  parseJsonBody,
} from "@/server/requests/json-coercion";

/** Asserts that `fn` throws the 400 Spring returned for an unreadable body. */
function expectMalformed(fn: () => unknown) {
  try {
    fn();
  } catch (e) {
    expect(e).toBeInstanceOf(ApiException);
    expect((e as ApiException).status).toBe(400);
    expect((e as ApiException).code).toBe("BAD_REQUEST");
    expect((e as ApiException).message).toBe("Malformed request body");
    return;
  }
  throw new Error("expected a malformed body error");
}

describe("malformedBody", () => {
  it("throws 400 BAD_REQUEST 'Malformed request body'", () => {
    expectMalformed(() => malformedBody());
  });
});

describe("parseJsonBody", () => {
  it("parses JSON", () => {
    expect(parseJsonBody('{"a":1}', true)).toEqual({ a: 1 });
  });

  it("rejects an empty body or a literal null when the body is required", () => {
    expectMalformed(() => parseJsonBody("", true));
    expectMalformed(() => parseJsonBody("  \n", true));
    expectMalformed(() => parseJsonBody("null", true));
  });

  it("returns null for an empty body or null when the body is optional", () => {
    expect(parseJsonBody("", false)).toBeNull();
    expect(parseJsonBody("null", false)).toBeNull();
  });

  it("rejects invalid JSON", () => {
    expectMalformed(() => parseJsonBody("{bad json", true));
  });
});

describe("expectObject", () => {
  it("returns objects", () => {
    expect(expectObject({ a: 1 })).toEqual({ a: 1 });
  });

  it("rejects arrays, primitives and null", () => {
    for (const v of [[], "x", 1, true, null]) expectMalformed(() => expectObject(v));
  });
});

describe("coerceString", () => {
  it("keeps strings and stringifies numbers and booleans like Jackson", () => {
    expect(coerceString(" x ")).toBe(" x ");
    expect(coerceString(123)).toBe("123");
    expect(coerceString(true)).toBe("true");
  });

  it("maps null and undefined to null", () => {
    expect(coerceString(null)).toBeNull();
    expect(coerceString(undefined)).toBeNull();
  });

  it("rejects arrays and objects", () => {
    expectMalformed(() => coerceString(["x"]));
    expectMalformed(() => coerceString({ a: 1 }));
  });
});

describe("coerceInt32", () => {
  it("accepts integers, truncated floats and numeric strings (observed Spring behaviour)", () => {
    expect(coerceInt32(5)).toBe(5);
    expect(coerceInt32(5.7)).toBe(5);
    expect(coerceInt32(-5.7)).toBe(-5);
    expect(coerceInt32("5")).toBe(5);
    expect(coerceInt32(" 5 ")).toBe(5);
    expect(coerceInt32("+5")).toBe(5);
  });

  it("maps null, undefined and the empty string to null", () => {
    expect(coerceInt32(null)).toBeNull();
    expect(coerceInt32(undefined)).toBeNull();
    expect(coerceInt32("")).toBeNull();
  });

  it("rejects booleans, decimals in strings, hex strings and out of range values", () => {
    for (const v of [true, "5.5", "0x10", 3000000000, "3000000000", -2147483649, [1], {}]) {
      expectMalformed(() => coerceInt32(v));
    }
  });

  it("does not return negative zero", () => {
    expect(Object.is(coerceInt32(-0.5), 0)).toBe(true);
  });
});

describe("coerceInt64", () => {
  it("accepts large but exact integers and numeric strings", () => {
    expect(coerceInt64(4_500_000_000)).toBe(4_500_000_000);
    expect(coerceInt64("1800000")).toBe(1_800_000);
  });

  it("rejects values JavaScript cannot represent exactly", () => {
    expectMalformed(() => coerceInt64(1e20));
    expectMalformed(() => coerceInt64("9007199254740993"));
  });
});

describe("coerceEnum", () => {
  const modes = ["ONSITE", "HYBRID", "REMOTE"] as const;

  it("accepts exact and trimmed constant names", () => {
    expect(coerceEnum("REMOTE", modes)).toBe("REMOTE");
    expect(coerceEnum(" REMOTE ", modes)).toBe("REMOTE");
  });

  it("accepts an ordinal, as Jackson does", () => {
    expect(coerceEnum(2, modes)).toBe("REMOTE");
  });

  it("maps null to null", () => {
    expect(coerceEnum(null, modes)).toBeNull();
  });

  it("rejects other cases, empty strings, out of range ordinals and other types", () => {
    for (const v of ["remote", "", 3, -1, 1.5, true, ["REMOTE"]]) expectMalformed(() => coerceEnum(v, modes));
  });
});

describe("parseIsoInstant", () => {
  it("parses UTC and offset instants", () => {
    expect(parseIsoInstant("2026-11-03T09:00:00Z")?.toISOString()).toBe("2026-11-03T09:00:00.000Z");
    expect(parseIsoInstant("2026-11-03T14:30:00+05:30")?.toISOString()).toBe("2026-11-03T09:00:00.000Z");
    expect(parseIsoInstant("2026-11-03T04:00:00-05:00")?.toISOString()).toBe("2026-11-03T09:00:00.000Z");
  });

  it("is case insensitive and truncates fractions to milliseconds", () => {
    expect(parseIsoInstant("2026-11-03t09:00:00.123456789z")?.toISOString()).toBe("2026-11-03T09:00:00.123Z");
    expect(parseIsoInstant("2026-11-03T09:00:00.5Z")?.toISOString()).toBe("2026-11-03T09:00:00.500Z");
  });

  it("handles leap days and two digit years correctly", () => {
    expect(parseIsoInstant("2028-02-29T00:00:00Z")?.toISOString()).toBe("2028-02-29T00:00:00.000Z");
    expect(parseIsoInstant("0050-01-01T00:00:00Z")?.getUTCFullYear()).toBe(50);
  });

  it("returns null for anything ISO_INSTANT rejects", () => {
    for (const s of ["2026-11-03T09:00Z", "2026-11-03", "2026-11-03T09:00:00", "2026-11-03T14:30:00+0530",
      "2026-02-30T00:00:00Z", "2027-02-29T00:00:00Z", "2026-13-01T00:00:00Z", "2026-11-03T24:00:00Z", "2026-11-03T09:00:00+19:00"]) {
      expect(parseIsoInstant(s), s).toBeNull();
    }
  });
});

describe("coerceInstant", () => {
  it("reads numbers and digit strings as epoch seconds (observed Spring behaviour)", () => {
    expect(coerceInstant(1762160400)?.toISOString()).toBe("2025-11-03T09:00:00.000Z");
    expect(coerceInstant("1762160400")?.toISOString()).toBe("2025-11-03T09:00:00.000Z");
    expect(coerceInstant(1762160400.5)?.toISOString()).toBe("2025-11-03T09:00:00.500Z");
    expect(coerceInstant("1762160400.123")?.toISOString()).toBe("2025-11-03T09:00:00.123Z");
  });

  it("trims strings and maps empty strings and null to null", () => {
    expect(coerceInstant(" 2026-11-03T09:00:00Z ")?.toISOString()).toBe("2026-11-03T09:00:00.000Z");
    expect(coerceInstant("")).toBeNull();
    expect(coerceInstant(null)).toBeNull();
  });

  it("rejects malformed strings and other types", () => {
    for (const v of ["2026-11-03", "1.2.3", ".", true, {}, ["2026-11-03T09:00:00Z"]]) expectMalformed(() => coerceInstant(v));
  });
});

describe("coerceStringList", () => {
  it("binds arrays and stringifies scalar elements", () => {
    expect(coerceStringList(["java", 1, true])).toEqual(["java", "1", "true"]);
  });

  it("maps null to null", () => {
    expect(coerceStringList(null)).toBeNull();
  });

  it("rejects a single string, null elements and nested values", () => {
    expectMalformed(() => coerceStringList("java"));
    expectMalformed(() => coerceStringList(["java", null]));
    expectMalformed(() => coerceStringList([["java"]]));
  });
});
