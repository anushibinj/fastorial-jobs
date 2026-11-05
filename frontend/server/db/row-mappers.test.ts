import { describe, expect, it } from "vitest";
import { toJobRecord } from "@/server/jobs/job-repository";
import { toTagRecord } from "@/server/tags/tag-repository";

describe("toTagRecord", () => {
  it("copies the tag columns and drops anything else selected alongside", () => {
    const row = { id: 1, name: "Java", slug: "java", category: "LANGUAGE" as const, job_id: 7 };
    expect(toTagRecord(row)).toEqual({ id: 1, name: "Java", slug: "java", category: "LANGUAGE" });
  });
});

describe("toJobRecord", () => {
  it("maps snake_case columns to the record and attaches the tags", () => {
    const at = new Date("2026-11-04T06:00:00Z");
    const row = {
      id: 3, slug: "s-3", title: "T", company_name: "C", company_logo_url: null, description: "", apply_url: "https://x.com",
      apply_url_hash: "h", source: "NAUKRI" as const, location_city: "Pune", location_state: null, location_country: "India",
      work_mode: "ONSITE" as const, experience_min_years: 2, experience_max_years: 4, salary_min: 100, salary_max: 200,
      salary_currency: "INR", salary_period: "MONTHLY" as const, status: "CLOSED" as const, posted_at: at, expires_at: null,
      created_at: at, updated_at: at,
    };
    const tags = [{ id: 1, name: "Java", slug: "java", category: "LANGUAGE" as const }];
    expect(toJobRecord(row, tags)).toEqual({
      id: 3, slug: "s-3", title: "T", companyName: "C", companyLogoUrl: null, description: "", applyUrl: "https://x.com",
      applyUrlHash: "h", source: "NAUKRI", locationCity: "Pune", locationState: null, locationCountry: "India",
      workMode: "ONSITE", experienceMinYears: 2, experienceMaxYears: 4, salaryMin: 100, salaryMax: 200,
      salaryCurrency: "INR", salaryPeriod: "MONTHLY", status: "CLOSED", postedAt: at, expiresAt: null,
      createdAt: at, updatedAt: at, tags,
    });
  });
});
