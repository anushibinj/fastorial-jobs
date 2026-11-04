import { afterEach, describe, expect, it, vi } from "vitest";
import { ApiException } from "@/server/shared/api-exception";
import { systemClock } from "@/server/shared/clock";
import { consoleLogger } from "@/server/shared/logger";

describe("systemClock.now", () => {
  it("returns the current system time as a new Date each call", () => {
    const before = Date.now();
    const a = systemClock.now();
    const b = systemClock.now();
    expect(a.getTime()).toBeGreaterThanOrEqual(before);
    expect(b.getTime()).toBeLessThanOrEqual(Date.now());
    expect(a).not.toBe(b);
  });
});

describe("ApiException", () => {
  it("keeps status, code, message and field errors", () => {
    const e = new ApiException(409, "DUPLICATE_APPLY_URL", "dup", { applyUrl: "x" });
    expect(e).toBeInstanceOf(Error);
    expect([e.status, e.code, e.message, e.fieldErrors]).toEqual([409, "DUPLICATE_APPLY_URL", "dup", { applyUrl: "x" }]);
    expect(e.name).toBe("ApiException");
  });

  it("defaults to no field errors", () => {
    expect(new ApiException(500, "X", "y").fieldErrors).toEqual({});
  });

  it("notFound builds a 404 NOT_FOUND error", () => {
    const e = ApiException.notFound("Job not found");
    expect([e.status, e.code, e.message]).toEqual([404, "NOT_FOUND", "Job not found"]);
  });

  it("badRequest builds a 400 BAD_REQUEST error", () => {
    const e = ApiException.badRequest("Malformed request body");
    expect([e.status, e.code, e.message]).toEqual([400, "BAD_REQUEST", "Malformed request body"]);
  });

  it("validationFailed builds a 400 VALIDATION_FAILED error with fields", () => {
    const e = ApiException.validationFailed("Please fix the highlighted fields", { title: "Title is required" });
    expect([e.status, e.code, e.fieldErrors]).toEqual([400, "VALIDATION_FAILED", { title: "Title is required" }]);
  });
});

describe("consoleLogger", () => {
  afterEach(() => vi.restoreAllMocks());

  it("info writes a prefixed line to console.info", () => {
    const spy = vi.spyOn(console, "info").mockImplementation(() => undefined);
    consoleLogger.info("Closed 2 expired job(s)");
    expect(spy).toHaveBeenCalledWith("[jobs] Closed 2 expired job(s)");
  });

  it("error writes the message and the error to console.error", () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const err = new Error("boom");
    consoleLogger.error("Unhandled error", err);
    expect(spy).toHaveBeenCalledWith("[jobs] Unhandled error", err);
  });

  it("error writes an empty second argument when no error is given", () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => undefined);
    consoleLogger.error("Something");
    expect(spy).toHaveBeenCalledWith("[jobs] Something", "");
  });
});
