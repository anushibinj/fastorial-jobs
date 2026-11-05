import { describe, expect, it } from "vitest";
import { jobsApiPath, PAGE_SIZE } from "@/lib/api/client";
import { EMPTY_FILTERS } from "@/lib/filters";

describe("jobsApiPath", () => {
  it("builds a same-origin URL for one page of GET /api/jobs", () => {
    expect(jobsApiPath(EMPTY_FILTERS, 1)).toBe(`/api/jobs?page=1&size=${PAGE_SIZE}`);
  });

  it("includes the filters in the API's parameter names", () => {
    expect(jobsApiPath({ q: "java", location: "", mode: "REMOTE", exp: "5", tags: ["java", "aws"] }, 0, 10)).toBe(
      "/api/jobs?q=java&workMode=REMOTE&expMin=5&expMax=5&tags=java%2Caws&page=0&size=10",
    );
  });
});
