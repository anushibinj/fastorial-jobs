import { describe, expect, it } from "vitest";
import { buildPreviewMeta } from "./preview";
import type { JobLike } from "./types";

const NOW = new Date("2026-03-15T10:00:00+05:30");
const tag = (name: string) => ({ name, slug: name.toLowerCase(), category: "TOOL" as const });

function job(over: Partial<JobLike> = {}): JobLike {
  return {
    slug: "senior-java-engineer-acme-hyderabad-1",
    title: "Senior Java Engineer",
    companyName: "Acme Corp",
    locationCity: "Hyderabad",
    workMode: "HYBRID",
    experienceMinYears: 7,
    experienceMaxYears: null,
    status: "PUBLISHED",
    postedAt: "2026-03-12T09:00:00+05:30",
    tags: [tag("Java"), tag("Spring Boot"), tag("Kafka")],
    ...over,
  };
}

describe("buildPreviewMeta", () => {
  it("puts title, experience, age and tags in order of importance", () => {
    const m = buildPreviewMeta(job(), NOW);
    expect(m.ogTitle).toBe("Senior Java Engineer at Acme Corp");
    expect(m.description).toBe("7+ years · Posted 3 days ago · Java, Spring Boot, Kafka");
    expect(m.imageAlt).toBe("Senior Java Engineer, 7+ years, Posted 3 days ago");
    expect(m.agePill).toBe("Posted 3 days ago");
    expect(m.closed).toBe(false);
  });

  it("cuts long titles with an ellipsis around 70 characters", () => {
    const m = buildPreviewMeta(job({ title: "Principal Staff Senior Distinguished Software Engineer, Platform Reliability and Developer Experience" }), NOW);
    expect(m.ogTitle.length).toBeLessThanOrEqual(70);
    expect(m.ogTitle.endsWith("…")).toBe(true);
    expect(m.imageTitle.length).toBeLessThanOrEqual(60);
  });

  it("shows a range and a single value for experience", () => {
    expect(buildPreviewMeta(job({ experienceMaxYears: 10 }), NOW).description).toMatch(/^7-10 years · /);
    expect(buildPreviewMeta(job({ experienceMaxYears: 7 }), NOW).description).toMatch(/^7 years · /);
  });

  it("handles zero tags", () => {
    const m = buildPreviewMeta(job({ tags: [] }), NOW);
    expect(m.description).toBe("7+ years · Posted 3 days ago");
    expect(m.tags).toEqual([]);
    expect(m.moreTags).toBe(0);
  });

  it("shows at most 5 tags then +N more", () => {
    const tags = ["Java", "Kotlin", "Kafka", "Docker", "AWS", "Redis", "Go"].map(tag);
    const m = buildPreviewMeta(job({ tags }), NOW);
    expect(m.tags).toHaveLength(5);
    expect(m.moreTags).toBe(2);
    expect(m.description).toBe("7+ years · Posted 3 days ago · Java, Kotlin, Kafka, Docker, AWS +2 more");
  });

  it("caps the description near 160 characters and cuts at a word", () => {
    const long = ["Distributed Systems Engineering", "Infrastructure Automation", "Observability and Monitoring Platforms", "Site Reliability", "Cloud Native Computing Foundation Tooling"].map(tag);
    const m = buildPreviewMeta(job({ tags: long }), NOW);
    expect(m.description.length).toBeLessThanOrEqual(160);
    expect(m.description.endsWith("…")).toBe(true);
    expect(m.description.startsWith("7+ years · Posted 3 days ago")).toBe(true);
  });

  it("closed jobs start with Closed and drop the age", () => {
    const m = buildPreviewMeta(job({ status: "CLOSED" }), NOW);
    expect(m.description).toBe("Closed · 7+ years · Java, Spring Boot, Kafka");
    expect(m.description).not.toMatch(/Posted/);
    expect(m.agePill).toBe("Closed");
    expect(m.imageAlt).toBe("Senior Java Engineer, 7+ years, Closed");
  });

  it("age edge cases: today, weeks, months", () => {
    expect(buildPreviewMeta(job({ postedAt: "2026-03-15T01:00:00+05:30" }), NOW).description).toContain("Posted today");
    expect(buildPreviewMeta(job({ postedAt: "2026-02-20T01:00:00+05:30" }), NOW).description).toContain("Posted 3 weeks ago");
    expect(buildPreviewMeta(job({ postedAt: "2025-10-01T01:00:00+05:30" }), NOW).description).toContain("Posted 5 months ago");
  });

  it("a published job past its expiry is previewed as closed", () => {
    const m = buildPreviewMeta(job({ expiresAt: "2026-03-14T00:00:00Z" }), NOW);
    expect(m.closed).toBe(true);
    expect(m.description.startsWith("Closed · ")).toBe(true);
  });

  it("omits the age part when postedAt is missing", () => {
    expect(buildPreviewMeta(job({ postedAt: null }), NOW).description).toBe("7+ years · Java, Spring Boot, Kafka");
  });

  it("truncates company, location and tag text for the image", () => {
    const m = buildPreviewMeta(job({
      companyName: "Umbrella Systems International Private Limited",
      locationCity: "Thiruvananthapuram Technopark Campus",
      tags: [tag("Extraordinarily Long Tag Name")],
    }), NOW);
    expect(m.imageCompany.length).toBeLessThanOrEqual(30);
    expect(m.imageLocation.length).toBeLessThanOrEqual(24);
    expect(m.imageTags[0].length).toBeLessThanOrEqual(14);
  });
});
