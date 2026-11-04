import { describe, expect, it } from "vitest";
import { JOB_SETTINGS } from "@/server/config/app-config";
import { changeStatus, extendedExpiry, initialSchedule, plusDays } from "@/server/jobs/job-lifecycle";
import { toJobDetail, toJobSummary } from "@/server/jobs/job-mapper";
import { buildJobFilter, escapeLike, normalizeTagSlugs, ORDER_BY } from "@/server/jobs/job-query";
import { validateJobRequest } from "@/server/jobs/job-request-validator";
import { offsetOf, resolveTotal, toPageRequest, toPageResponse } from "@/server/jobs/paging";
import { ApiException } from "@/server/shared/api-exception";
import { toIso } from "@/server/shared/iso";
import { AWS, JAVA, jobRecord, jobRequest } from "@/server/testing/fakes.testkit";

const NOW = new Date("2026-11-04T06:00:00.000Z");
const iso = (d: Date | null) => d?.toISOString() ?? null;

describe("job lifecycle", () => {
  it("plusDays adds whole 24 hour days", () => {
    expect(iso(plusDays(NOW, 30))).toBe("2026-12-04T06:00:00.000Z");
  });

  it("initialSchedule posts a published job now and expires it 30 days later", () => {
    const s = initialSchedule("PUBLISHED", null, null, NOW, 30);
    expect([s.status, iso(s.postedAt), iso(s.expiresAt)]).toEqual(["PUBLISHED", iso(NOW), "2026-12-04T06:00:00.000Z"]);
  });

  it("initialSchedule leaves a draft unposted and without expiry", () => {
    expect(initialSchedule("DRAFT", null, null, NOW, 30)).toEqual({ status: "DRAFT", postedAt: null, expiresAt: null });
  });

  it("initialSchedule keeps explicit dates and derives a missing expiry from the posted date", () => {
    const posted = new Date("2026-10-01T00:00:00Z");
    expect(iso(initialSchedule("PUBLISHED", posted, null, NOW, 30).expiresAt)).toBe("2026-10-31T00:00:00.000Z");
    const expires = new Date("2027-01-01T00:00:00Z");
    expect(initialSchedule("DRAFT", null, expires, NOW, 30).expiresAt).toBe(expires);
  });

  it("changeStatus to PUBLISHED posts a draft and opens a fresh window", () => {
    const s = changeStatus({ status: "DRAFT", postedAt: null, expiresAt: null }, "PUBLISHED", NOW, 30);
    expect([iso(s.postedAt), iso(s.expiresAt)]).toEqual([iso(NOW), "2026-12-04T06:00:00.000Z"]);
  });

  it("changeStatus reopening a job whose expiry passed resets the window but keeps the posted date", () => {
    const posted = new Date("2026-09-01T00:00:00Z");
    const s = changeStatus({ status: "CLOSED", postedAt: posted, expiresAt: NOW }, "PUBLISHED", NOW, 30);
    expect([s.postedAt, iso(s.expiresAt)]).toEqual([posted, "2026-12-04T06:00:00.000Z"]);
  });

  it("changeStatus keeps a future expiry and only changes the status otherwise", () => {
    const future = plusDays(NOW, 5);
    expect(changeStatus({ status: "CLOSED", postedAt: NOW, expiresAt: future }, "PUBLISHED", NOW, 30).expiresAt).toBe(future);
    expect(changeStatus({ status: "PUBLISHED", postedAt: NOW, expiresAt: future }, "CLOSED", NOW, 30)).toEqual({
      status: "CLOSED", postedAt: NOW, expiresAt: future,
    });
  });

  it("extendedExpiry adds to a future expiry and restarts from now when it passed", () => {
    expect(iso(extendedExpiry(plusDays(NOW, 10), NOW, 7))).toBe(iso(plusDays(NOW, 17)));
    expect(iso(extendedExpiry(plusDays(NOW, -1), NOW, 14))).toBe(iso(plusDays(NOW, 14)));
    expect(iso(extendedExpiry(null, NOW, 14))).toBe(iso(plusDays(NOW, 14)));
  });
});

describe("paging", () => {
  it("toPageRequest clamps like the Java service", () => {
    expect(toPageRequest(null, null, JOB_SETTINGS)).toEqual({ page: 0, size: 20 });
    expect(toPageRequest(-1, 0, JOB_SETTINGS)).toEqual({ page: 0, size: 20 });
    expect(toPageRequest(2, 1000, JOB_SETTINGS)).toEqual({ page: 2, size: 50 });
    expect(toPageRequest(3, 10, JOB_SETTINGS)).toEqual({ page: 3, size: 10 });
  });

  it("offsetOf multiplies page and size", () => {
    expect(offsetOf({ page: 2, size: 10 })).toBe(20);
  });

  it("toPageResponse computes totalPages and hasNext like Spring's PageImpl", () => {
    expect(toPageResponse(["a"], { page: 2, size: 10 }, 25)).toEqual({
      items: ["a"], page: 2, size: 10, total: 25, totalPages: 3, hasNext: false,
    });
    expect(toPageResponse([], { page: 0, size: 20 }, 0)).toMatchObject({ totalPages: 0, hasNext: false });
    expect(toPageResponse([], { page: 0, size: 10 }, 11)).toMatchObject({ totalPages: 2, hasNext: true });
  });

  it("resolveTotal skips the count query when the page itself tells the total", async () => {
    const neverCount = () => Promise.reject(new Error("count should not run"));
    expect(await resolveTotal({ page: 0, size: 20 }, 3, neverCount)).toBe(3);
    expect(await resolveTotal({ page: 2, size: 10 }, 5, neverCount)).toBe(25);
  });

  it("resolveTotal counts when a page is full, or empty beyond the first", async () => {
    const count = () => Promise.resolve(42);
    expect(await resolveTotal({ page: 0, size: 20 }, 20, count)).toBe(42);
    expect(await resolveTotal({ page: 5, size: 20 }, 0, count)).toBe(42);
  });
});

describe("job mapper", () => {
  it("toIso formats dates and passes null through", () => {
    expect(toIso(NOW)).toBe("2026-11-04T06:00:00.000Z");
    expect(toIso(null)).toBeNull();
  });

  it("toJobSummary keeps the Java record's properties, order and null values, with sorted tags", () => {
    const s = toJobSummary(jobRecord({ tags: [JAVA, AWS] }));
    expect(Object.keys(s)).toEqual([
      "id", "slug", "title", "companyName", "companyLogoUrl", "locationCity", "locationState", "locationCountry",
      "workMode", "experienceMinYears", "experienceMaxYears", "salaryMin", "salaryMax", "salaryCurrency",
      "salaryPeriod", "status", "postedAt", "expiresAt", "tags",
    ]);
    expect(s.companyLogoUrl).toBeNull();
    expect(s.tags.map((t) => t.slug)).toEqual(["aws", "java"]);
  });

  it("toJobDetail adds description, apply URL, source and update time but never the URL hash", () => {
    const d = toJobDetail(jobRecord());
    expect(Object.keys(d)).toEqual([
      "id", "slug", "title", "companyName", "companyLogoUrl", "description", "applyUrl", "source", "locationCity",
      "locationState", "locationCountry", "workMode", "experienceMinYears", "experienceMaxYears", "salaryMin",
      "salaryMax", "salaryCurrency", "salaryPeriod", "status", "postedAt", "expiresAt", "updatedAt", "tags",
    ]);
    expect(d).not.toHaveProperty("applyUrlHash");
  });
});

describe("job query", () => {
  it("escapeLike escapes the LIKE wildcards and the escape character", () => {
    expect(escapeLike("100% _ a\\b")).toBe("100\\% \\_ a\\\\b");
  });

  it("normalizeTagSlugs trims, drops empty values and de-duplicates in order", () => {
    expect(normalizeTagSlugs([" java ", "", "kafka", "java"])).toEqual(["java", "kafka"]);
  });

  it("buildJobFilter matches everything without criteria", () => {
    expect(buildJobFilter({})).toEqual({ where: "TRUE", params: [] });
  });

  it("buildJobFilter binds every value as a parameter", () => {
    const f = buildJobFilter({
      status: "PUBLISHED", liveAt: NOW, workMode: "REMOTE", location: " Hyderabad ", expMin: 7, expMax: 9,
      tags: ["java", " kafka "], q: " 100% ",
    });
    expect(f.params).toEqual(["PUBLISHED", NOW, "REMOTE", "hyderabad", 9, 7, ["java", "kafka"], 2, "100%", "%100\\%%"]);
    expect(f.where).toContain("j.status = $1");
    expect(f.where).toContain("(j.expires_at IS NULL OR j.expires_at > $2)");
    expect(f.where).toContain("lower(j.location_city) = $4");
    expect(f.where).toContain("j.experience_min_years <= $5");
    expect(f.where).toContain("(j.experience_max_years IS NULL OR j.experience_max_years >= $6)");
    expect(f.where).toContain("HAVING count(DISTINCT t.id) = $8");
    expect(f.where).toContain("job_matches(j.title, j.company_name, j.description, $9)");
    expect(f.where).toContain("lower(j.title) LIKE $10 ESCAPE '\\'");
  });

  it("buildJobFilter ignores blank text, blank location and an all-empty tag list", () => {
    expect(buildJobFilter({ q: "  ", location: "", tags: ["", " "] })).toEqual({ where: "TRUE", params: [] });
  });

  it("orders public lists by posted date and admin lists by update time, newest first", () => {
    expect(ORDER_BY.postedDesc).toBe("j.posted_at DESC, j.id DESC");
    expect(ORDER_BY.updatedDesc).toBe("j.updated_at DESC, j.id DESC");
  });
});

describe("validateJobRequest", () => {
  const errors = (extra: Parameters<typeof jobRequest>[0]) => {
    try {
      validateJobRequest(jobRequest(extra));
    } catch (e) {
      return (e as ApiException).fieldErrors;
    }
    return {};
  };

  it("accepts a valid request", () => {
    expect(errors({})).toEqual({});
  });

  it("checks the experience range", () => {
    expect(errors({ experienceMinYears: 7, experienceMaxYears: 3 })).toEqual({
      experienceMaxYears: "Maximum experience must be at least the minimum",
    });
  });

  it("checks the salary rules with the Java messages", () => {
    expect(errors({ salaryMin: 100 })).toEqual({
      salaryCurrency: "Currency is required when a salary is set",
      salaryPeriod: "Period is required when a salary is set",
    });
    expect(errors({ salaryMax: 100, salaryCurrency: "INR", salaryPeriod: "YEARLY" })).toEqual({
      salaryMin: "Minimum salary is required when maximum is set",
    });
    expect(errors({ salaryMin: 100, salaryMax: 50, salaryCurrency: "INR", salaryPeriod: "YEARLY" })).toEqual({
      salaryMax: "Maximum salary must be at least the minimum",
    });
  });

  it("checks URLs with Java's URI rules, allowing a blank logo", () => {
    expect(errors({ applyUrl: "https://example.com/a b" })).toEqual({ applyUrl: "Apply URL must start with http:// or https://" });
    expect(errors({ companyLogoUrl: "ftp://x.com/a.png" })).toEqual({ companyLogoUrl: "Logo URL must start with http:// or https://" });
    expect(errors({ companyLogoUrl: "  " })).toEqual({});
  });

  it("requires the expiry to be after the posted date", () => {
    expect(errors({ postedAt: NOW, expiresAt: NOW })).toEqual({ expiresAt: "Expiry must be after the posted date" });
  });

  it("throws a 400 VALIDATION_FAILED", () => {
    expect(() => validateJobRequest(jobRequest({ salaryMin: 1 }))).toThrow(ApiException);
  });
});
