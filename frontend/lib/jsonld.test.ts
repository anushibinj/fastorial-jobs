import { describe, expect, it } from "vitest";
import { buildJobPostingJsonLd, serializeJsonLd } from "./jsonld";
import type { JobDetail } from "./types";

const job = {
  slug: "x-1", title: "Senior Java Engineer", companyName: "Acme", description: "Do things",
  applyUrl: "https://x.com", source: "OTHER", locationCity: "Hyderabad", locationState: "Telangana",
  workMode: "REMOTE", experienceMinYears: 7, experienceMaxYears: null,
  salaryMin: 1800000, salaryMax: 2500000, salaryCurrency: "INR", salaryPeriod: "YEARLY",
  status: "PUBLISHED", postedAt: "2026-03-01T00:00:00Z", expiresAt: "2026-03-31T00:00:00Z", tags: [{ name: "Java", slug: "java", category: "LANGUAGE" }],
} as unknown as JobDetail;

describe("job posting json-ld", () => {
  it("maps the core fields", () => {
    const ld = buildJobPostingJsonLd(job) as any;
    expect(ld["@type"]).toBe("JobPosting");
    expect(ld.jobLocationType).toBe("TELECOMMUTE");
    expect(ld.experienceRequirements.monthsOfExperience).toBe(84);
    expect(ld.qualifications).toBe("7+ years of experience");
    expect(ld.baseSalary.value.unitText).toBe("YEAR");
    expect(ld.skills).toBe("Java");
  });
  it("omits salary when absent", () => {
    expect(buildJobPostingJsonLd({ ...job, salaryMin: null }) as any).not.toHaveProperty("baseSalary");
  });
  it("escapes angle brackets so the script tag cannot be closed early", () => {
    expect(serializeJsonLd({ a: "</script><b>" })).not.toContain("<");
  });
});
