import { describe, expect, it } from "vitest";
import { formatDate, formatDateTime, fromLocalInput, toLocalInput } from "./dates";

describe("admin dates (IST)", () => {
  it("round trips", () => {
    const iso = "2026-03-15T04:30:00.000Z";
    expect(toLocalInput(iso)).toBe("2026-03-15T10:00");
    expect(fromLocalInput("2026-03-15T10:00")).toBe(iso);
  });
  it("handles empty and invalid input", () => {
    expect(toLocalInput(null)).toBe("");
    expect(fromLocalInput("")).toBeUndefined();
    expect(fromLocalInput("nonsense")).toBeUndefined();
  });
  it("formats a table date in IST", () => {
    expect(formatDate("2026-03-14T20:00:00Z")).toBe("15 Mar 2026");
    expect(formatDate(null)).toBe("-");
  });
  it("formats a date with the time of day in IST", () => {
    expect(formatDateTime("2026-03-14T20:00:00Z")).toBe("15 Mar 2026, 01:30");
    expect(formatDateTime(null)).toBe("-");
  });
});
