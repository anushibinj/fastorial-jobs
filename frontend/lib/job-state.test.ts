import { describe, expect, it } from "vitest";
import { isClosed } from "./job-state";

const now = new Date("2026-03-15T10:00:00Z");

describe("isClosed", () => {
  it("closed status is closed", () => expect(isClosed({ status: "CLOSED", expiresAt: "2030-01-01T00:00:00Z" }, now)).toBe(true));
  it("published and in the future is open", () => expect(isClosed({ status: "PUBLISHED", expiresAt: "2026-04-01T00:00:00Z" }, now)).toBe(false));
  it("published but expired counts as closed before cleanup runs", () => expect(isClosed({ status: "PUBLISHED", expiresAt: "2026-03-15T09:59:59Z" }, now)).toBe(true));
  it("published without an expiry is open", () => expect(isClosed({ status: "PUBLISHED", expiresAt: null }, now)).toBe(false));
});
