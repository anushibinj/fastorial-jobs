import { describe, expect, it } from "vitest";
import { DuplicateApplyUrlError } from "@/server/jobs/job-repository";
import { ApiException } from "@/server/shared/api-exception";
import { errorBrand } from "@/server/shared/error-brand";
import { UriSyntaxError } from "@/server/url/java-uri";

describe("errorBrand", () => {
  it("has() is true only for marked objects", () => {
    const brand = errorBrand("Test");
    const marked = new Error("x");
    brand.mark(marked);
    expect(brand.has(marked)).toBe(true);
    expect(brand.has(new Error("y"))).toBe(false);
    expect(brand.has(null)).toBe(false);
    expect(brand.has("Test")).toBe(false);
  });

  it("recognizes objects marked by another copy of the module (same name, separate brand object)", () => {
    // Two calls stand in for two bundled copies of the same module: each creates its own brand.
    const copyA = errorBrand("Copied");
    const copyB = errorBrand("Copied");
    const error = new Error("from copy A");
    copyA.mark(error);
    expect(copyB.has(error)).toBe(true);
  });

  it("keeps different error types apart", () => {
    const error = new Error("x");
    errorBrand("One").mark(error);
    expect(errorBrand("Two").has(error)).toBe(false);
  });

  it("does not add an enumerable property (JSON and logs are unchanged)", () => {
    const error = { a: 1 };
    errorBrand("Hidden").mark(error);
    expect(JSON.stringify(error)).toBe('{"a":1}');
  });
});

describe("static is() guards", () => {
  it("ApiException.is", () => {
    expect(ApiException.is(ApiException.notFound("x"))).toBe(true);
    expect(ApiException.is(new Error("x"))).toBe(false);
  });

  it("DuplicateApplyUrlError.is", () => {
    expect(DuplicateApplyUrlError.is(new DuplicateApplyUrlError())).toBe(true);
    expect(DuplicateApplyUrlError.is(ApiException.notFound("x"))).toBe(false);
  });

  it("UriSyntaxError.is", () => {
    expect(UriSyntaxError.is(new UriSyntaxError("bad", 0))).toBe(true);
    expect(UriSyntaxError.is(new Error("bad"))).toBe(false);
  });
});
