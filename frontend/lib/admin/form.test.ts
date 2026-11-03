import { describe, expect, it } from "vitest";
import { jobRequestFromForm } from "./form";

function form(entries: Record<string, string | string[]>): FormData {
  const f = new FormData();
  for (const [k, v] of Object.entries(entries)) (Array.isArray(v) ? v : [v]).forEach((x) => f.append(k, x));
  return f;
}

describe("jobRequestFromForm", () => {
  const base = { title: " Java Dev ", companyName: "Acme", applyUrl: "https://x.com/1", source: "LINKEDIN", workMode: "HYBRID", experienceMinYears: "7" };

  it("trims, converts numbers and leaves empty optionals out", () => {
    const r = jobRequestFromForm(form({ ...base, experienceMaxYears: "", locationCity: "", tags: ["java", "kafka"] }));
    expect(r.title).toBe("Java Dev");
    expect(r.experienceMinYears).toBe(7);
    expect(r.experienceMaxYears).toBeUndefined();
    expect(r.locationCity).toBeUndefined();
    expect(r.tags).toEqual(["java", "kafka"]);
    expect(r.salaryCurrency).toBeUndefined();
  });

  it("keeps salary fields together and upper cases the currency", () => {
    const r = jobRequestFromForm(form({ ...base, salaryMin: "18,00,000", salaryMax: "2500000", salaryCurrency: "inr", salaryPeriod: "YEARLY" }));
    expect(r.salaryMin).toBe(1800000);
    expect(r.salaryMax).toBe(2500000);
    expect(r.salaryCurrency).toBe("INR");
    expect(r.salaryPeriod).toBe("YEARLY");
  });

  it("drops currency and period when no amount is given", () => {
    const r = jobRequestFromForm(form({ ...base, salaryCurrency: "INR", salaryPeriod: "YEARLY" }));
    expect(r.salaryCurrency).toBeUndefined();
    expect(r.salaryPeriod).toBeUndefined();
  });

  it("converts IST datetime-local values", () => {
    const r = jobRequestFromForm(form({ ...base, expiresAt: "2026-04-01T10:00" }));
    expect(r.expiresAt).toBe("2026-04-01T04:30:00.000Z");
  });
});
