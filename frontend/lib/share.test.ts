import { describe, expect, it } from "vitest";
import { buildShareText } from "./share";
import type { JobLike } from "./types";

const base: JobLike = {
  slug: "senior-java-engineer-acme-hyderabad-1",
  title: "Senior Java Engineer",
  companyName: "Acme",
  locationCity: "Hyderabad",
  workMode: "HYBRID",
  experienceMinYears: 7,
  experienceMaxYears: null,
  status: "PUBLISHED",
  tags: [
    { name: "Java", slug: "java", category: "LANGUAGE" },
    { name: "React", slug: "react", category: "FRAMEWORK" },
  ],
};

describe("buildShareText", () => {
  it("uses exactly the agreed format", () => {
    expect(buildShareText(base, "https://jobs.fastorial.dev")).toBe(
      [
        "Senior Java Engineer",
        "",
        "Company: Acme",
        "",
        "Location: Hyderabad, Hybrid",
        "",
        "Experience: 7+ years",
        "",
        "Tags: java,react",
        "",
        "Link: https://jobs.fastorial.dev/jobs/senior-java-engineer-acme-hyderabad-1",
      ].join("\n"),
    );
  });

  it("leaves out tags when there are none and trims a trailing slash on the site url", () => {
    const text = buildShareText({ ...base, tags: [] }, "https://example.com/");
    expect(text).not.toContain("Tags:");
    expect(text.endsWith("Link: https://example.com/jobs/senior-java-engineer-acme-hyderabad-1")).toBe(true);
  });

  it("shows ranges", () => {
    expect(buildShareText({ ...base, experienceMaxYears: 10 }, "https://x.dev")).toContain("Experience: 7-10 years");
  });
});
