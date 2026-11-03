import { describe, expect, it } from "vitest";
import {
  formatExperience,
  formatLocation,
  formatPostedAgo,
  formatSalary,
  truncate,
  truncateAtWord,
} from "./format";

describe("formatExperience", () => {
  it.each([
    [7, undefined, "7+ years"],
    [7, null, "7+ years"],
    [7, 10, "7-10 years"],
    [7, 7, "7 years"],
    [1, 1, "1 year"],
    [1, null, "1+ year"],
    [0, 2, "0-2 years"],
  ])("min=%s max=%s -> %s", (min, max, out) => {
    expect(formatExperience(min, max)).toBe(out);
  });
});

describe("formatSalary", () => {
  it("shows LPA for INR yearly", () => {
    expect(formatSalary(1800000, 2500000, "INR", "YEARLY")).toBe("₹18-25 LPA");
    expect(formatSalary(1850000, 2500000, "INR", "YEARLY")).toBe("₹18.5-25 LPA");
  });
  it("shows min only as open ended", () => {
    expect(formatSalary(3000000, null, "INR", "YEARLY")).toBe("₹30+ LPA");
    expect(formatSalary(120000, null, "USD", "YEARLY")).toBe("$120,000+ / year");
  });
  it("shows monthly and yearly for other currencies", () => {
    expect(formatSalary(15000, 20000, "AED", "MONTHLY")).toBe("AED 15,000-20,000 / month");
    expect(formatSalary(120000, 150000, "USD", "YEARLY")).toBe("$120,000-150,000 / year");
  });
  it("handles INR monthly with Indian grouping", () => {
    expect(formatSalary(100000, 150000, "INR", "MONTHLY")).toBe("₹1,00,000-1,50,000 / month");
  });
  it("collapses equal min and max", () => {
    expect(formatSalary(2000000, 2000000, "INR", "YEARLY")).toBe("₹20 LPA");
  });
  it("returns null without data", () => {
    expect(formatSalary(null, null, null, null)).toBeNull();
    expect(formatSalary(undefined, undefined, "INR", "YEARLY")).toBeNull();
    expect(formatSalary(100, 200, null, "YEARLY")).toBeNull();
  });
});

describe("formatPostedAgo (calendar days in Asia/Kolkata)", () => {
  const now = new Date("2026-03-15T10:00:00+05:30");
  const ago = (iso: string) => formatPostedAgo(iso, now);

  it("same calendar day is today, even a few hours apart", () => {
    expect(ago("2026-03-15T00:05:00+05:30")).toBe("today");
  });
  it("counts calendar days, not 24h blocks", () => {
    // 23:30 IST yesterday is only 10.5 hours before now but is 1 calendar day ago
    expect(ago("2026-03-14T23:30:00+05:30")).toBe("1 day ago");
  });
  it("uses IST not UTC for the day boundary", () => {
    // 2026-03-14T19:00Z is 2026-03-15 00:30 IST, so still today
    expect(ago("2026-03-14T19:00:00Z")).toBe("today");
    // 2026-03-14T17:00Z is 22:30 IST on the 14th
    expect(ago("2026-03-14T17:00:00Z")).toBe("1 day ago");
  });
  it.each([
    [2, "2 days ago"],
    [13, "13 days ago"],
    [14, "2 weeks ago"],
    [20, "2 weeks ago"],
    [21, "3 weeks ago"],
    [59, "8 weeks ago"],
    [60, "2 months ago"],
    [89, "2 months ago"],
    [90, "3 months ago"],
    [400, "13 months ago"],
  ])("%s days -> %s", (days, out) => {
    const d = new Date(now.getTime() - days * 86_400_000);
    expect(formatPostedAgo(d, now)).toBe(out);
  });
  it("never goes negative for future dates and is empty without a date", () => {
    expect(ago("2026-03-20T10:00:00+05:30")).toBe("today");
    expect(formatPostedAgo(null, now)).toBe("");
    expect(formatPostedAgo(undefined, now)).toBe("");
  });
});

describe("truncate", () => {
  it("leaves short text alone and cuts long text with an ellipsis", () => {
    expect(truncate("short", 10)).toBe("short");
    expect(truncate("abcdefghij", 10)).toBe("abcdefghij");
    expect(truncate("abcdefghijk", 10)).toBe("abcdefghi…");
    expect(truncate("abcdefghijk", 10)).toHaveLength(10);
  });
  it("trims trailing space before the ellipsis", () => {
    expect(truncate("hello world foo", 7)).toBe("hello…");
  });
  it("truncateAtWord backs up to a word boundary", () => {
    expect(truncateAtWord("one two three four", 12)).toBe("one two…");
    expect(truncateAtWord("one two", 12)).toBe("one two");
    expect(truncateAtWord("abcdefghijklmnop", 8)).toBe("abcdefg…");
  });
});

describe("formatLocation", () => {
  it("joins city and mode", () => {
    expect(formatLocation({ locationCity: "Hyderabad", workMode: "HYBRID" })).toBe("Hyderabad, Hybrid");
  });
  it("avoids saying Remote twice and handles missing city", () => {
    expect(formatLocation({ locationCity: "Remote", workMode: "REMOTE" })).toBe("Remote");
    expect(formatLocation({ locationCity: null, workMode: "REMOTE" })).toBe("Remote");
  });
});
