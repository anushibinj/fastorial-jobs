import { describe, expect, it } from "vitest";
import { emptyFormValues, formValuesToRequest, jobFormSchema, jobToFormValues, type JobFormValues } from "./schema";
import type { JobDetail } from "@/lib/types";

const valid = (over: Partial<JobFormValues> = {}): JobFormValues => ({
  ...emptyFormValues(), title: " Java Dev ", companyName: "Acme", applyUrl: "https://x.com/1", experienceMinYears: "7", ...over,
});
const issues = (v: JobFormValues) => {
  const r = jobFormSchema.safeParse(v);
  return r.success ? {} : Object.fromEntries(r.error.issues.map((i) => [i.path.join("."), i.message]));
};

describe("jobFormSchema", () => {
  it("accepts a minimal valid job", () => expect(jobFormSchema.safeParse(valid()).success).toBe(true));
  it("requires the basics", () => {
    const i = issues(valid({ title: "", companyName: "", applyUrl: "" }));
    expect(i.title).toBe("Title is required");
    expect(i.companyName).toBe("Company is required");
    expect(i.applyUrl).toBeDefined();
  });
  it("max experience must be at least min", () => {
    expect(issues(valid({ experienceMaxYears: "3" })).experienceMaxYears).toBe("Maximum experience must be at least the minimum");
    expect(issues(valid({ experienceMaxYears: "7" }))).toEqual({});
  });
  it("salary rules: max needs min, max >= min, currency required", () => {
    expect(issues(valid({ salaryMax: "100" })).salaryMin).toBeDefined();
    expect(issues(valid({ salaryMin: "200", salaryMax: "100" })).salaryMax).toBeDefined();
    expect(issues(valid({ salaryMin: "200", salaryCurrency: "" })).salaryCurrency).toBeDefined();
    expect(issues(valid({ salaryMin: "200" }))).toEqual({});
  });
  it("expiry must be after posted", () => {
    expect(issues(valid({ postedAt: "2026-03-10T10:00", expiresAt: "2026-03-09T10:00" })).expiresAt).toBeDefined();
  });
  it("rejects non http urls", () => expect(issues(valid({ applyUrl: "javascript:alert(1)" })).applyUrl).toBeDefined());
});

describe("formValuesToRequest", () => {
  it("trims, converts numbers and leaves empty optionals out", () => {
    const r = formValuesToRequest(valid({ tags: ["java", "kafka"] }));
    expect(r.title).toBe("Java Dev");
    expect(r.experienceMinYears).toBe(7);
    expect(r.experienceMaxYears).toBeUndefined();
    expect(r.locationCity).toBeUndefined();
    expect(r.tags).toEqual(["java", "kafka"]);
    expect(r.salaryCurrency).toBeUndefined();
    expect(r.salaryPeriod).toBeUndefined();
  });
  it("keeps salary fields together, accepts grouped digits and upper cases the currency", () => {
    const r = formValuesToRequest(valid({ salaryMin: "18,00,000", salaryMax: "2500000", salaryCurrency: "inr" }));
    expect(r).toMatchObject({ salaryMin: 1800000, salaryMax: 2500000, salaryCurrency: "INR", salaryPeriod: "YEARLY" });
  });
  it("converts IST datetime-local values", () => {
    expect(formValuesToRequest(valid({ expiresAt: "2026-04-01T10:00" })).expiresAt).toBe("2026-04-01T04:30:00.000Z");
  });
});

describe("jobToFormValues", () => {
  it("round trips an existing job", () => {
    const job = { id: 1, title: "T", companyName: "C", applyUrl: "https://x.com", source: "NAUKRI", workMode: "REMOTE",
      experienceMinYears: 2, experienceMaxYears: 4, status: "DRAFT", expiresAt: "2026-04-01T04:30:00.000Z",
      tags: [{ name: "Java", slug: "java", category: "LANGUAGE" }] } as unknown as JobDetail;
    const v = jobToFormValues(job);
    expect(v).toMatchObject({ experienceMinYears: "2", experienceMaxYears: "4", expiresAt: "2026-04-01T10:00", tags: ["java"], salaryMin: "" });
    expect(jobFormSchema.safeParse(v).success).toBe(true);
  });
});
