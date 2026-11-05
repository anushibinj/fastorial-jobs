import { describe, expect, it } from "vitest";
import { ApiException } from "@/server/shared/api-exception";
import {
  parseApiKeyRequest,
  parseDetectRequest,
  parseExtendRequest,
  parseStatusRequest,
} from "@/server/requests/admin-requests";
import {
  ConstraintViolations,
  defaultSizeMessage,
  fitsMaxLength,
  isAtLeast,
  isAtMost,
  isNotBlank,
  matchesFully,
} from "@/server/requests/constraints";
import { parseJobRequest } from "@/server/requests/job-request";
import {
  enumParam,
  intParam,
  invalidParameter,
  listParam,
  parseSpringInteger,
  pathId,
  stringParam,
  trimAllWhitespace,
} from "@/server/requests/request-params";

/** Runs `fn` and returns the ApiException it throws. */
function apiError(fn: () => unknown): ApiException {
  try {
    fn();
  } catch (e) {
    if (e instanceof ApiException) return e;
    throw e;
  }
  throw new Error("expected an ApiException");
}

const validJob = {
  title: "Senior Java Engineer",
  companyName: "Acme",
  applyUrl: "https://example.com/jobs/1",
  source: "LINKEDIN",
  workMode: "HYBRID",
  experienceMinYears: 5,
};

describe("ConstraintViolations", () => {
  it("keeps only the first message per field", () => {
    const v = new ConstraintViolations();
    v.add("title", "first");
    v.add("title", "second");
    expect(apiError(() => v.throwIfAny()).fieldErrors).toEqual({ title: "first" });
  });

  it("require records a message only for failed rules", () => {
    const v = new ConstraintViolations();
    v.require(true, "a", "never");
    expect(v.isEmpty()).toBe(true);
    v.require(false, "b", "broken");
    expect(v.isEmpty()).toBe(false);
  });

  it("throwIfAny does nothing when valid and throws VALIDATION_FAILED otherwise", () => {
    const v = new ConstraintViolations();
    expect(() => v.throwIfAny()).not.toThrow();
    v.add("x", "bad");
    const e = apiError(() => v.throwIfAny());
    expect([e.status, e.code, e.message]).toEqual([400, "VALIDATION_FAILED", "Please fix the highlighted fields"]);
  });
});

describe("constraint predicates", () => {
  it("isNotBlank uses Java trim (a non-breaking space is not blank)", () => {
    expect(isNotBlank("x")).toBe(true);
    expect(isNotBlank(" \t")).toBe(false);
    expect(isNotBlank(null)).toBe(false);
    expect(isNotBlank(" ")).toBe(true);
  });

  it("fitsMaxLength, isAtLeast, isAtMost and matchesFully let null pass", () => {
    expect([fitsMaxLength(null, 1), isAtLeast(null, 1), isAtMost(null, 1), matchesFully(null, /^a$/)]).toEqual([true, true, true, true]);
    expect([fitsMaxLength("ab", 1), isAtLeast(0, 1), isAtMost(2, 1), matchesFully("ab", /^a$/)]).toEqual([false, false, false, false]);
  });

  it("defaultSizeMessage matches Hibernate Validator's default", () => {
    expect(defaultSizeMessage(100)).toBe("size must be between 0 and 100");
  });
});

describe("parseJobRequest", () => {
  it("binds a valid payload with defaults for optional fields", () => {
    expect(parseJobRequest(validJob)).toEqual({
      ...validJob,
      companyLogoUrl: null, description: null, locationCity: null, locationState: null, locationCountry: null,
      experienceMaxYears: null, salaryMin: null, salaryMax: null, salaryCurrency: null, salaryPeriod: null,
      status: null, postedAt: null, expiresAt: null, tags: null,
    });
  });

  it("applies Jackson coercions before validating", () => {
    const r = parseJobRequest({ ...validJob, experienceMinYears: "7", workMode: 2, postedAt: "2026-11-03T14:30:00+05:30" });
    expect([r.experienceMinYears, r.workMode, r.postedAt?.toISOString()]).toEqual([7, "REMOTE", "2026-11-03T09:00:00.000Z"]);
  });

  it("reports every missing required field with the Java messages", () => {
    expect(apiError(() => parseJobRequest({})).fieldErrors).toEqual({
      title: "Title is required",
      companyName: "Company is required",
      applyUrl: "Apply URL is required",
      source: "Source is required",
      workMode: "Work mode is required",
      experienceMinYears: "Minimum experience is required",
    });
  });

  it("reports size, minimum and pattern violations with the Java messages", () => {
    const e = apiError(() => parseJobRequest({
      ...validJob, title: "t".repeat(201), locationCity: "x".repeat(101), experienceMaxYears: -1,
      salaryMin: -1, salaryCurrency: "",
    }));
    expect(e.fieldErrors).toEqual({
      title: "Title must be at most 200 characters",
      locationCity: "size must be between 0 and 100",
      experienceMaxYears: "Maximum experience must be 0 or more",
      salaryMin: "Minimum salary must be 0 or more",
      salaryCurrency: "Currency must be a 3 letter code",
    });
  });

  it("gives a malformed body error before any validation", () => {
    const e = apiError(() => parseJobRequest({ title: "", workMode: "remote" }));
    expect([e.code, e.message]).toEqual(["BAD_REQUEST", "Malformed request body"]);
  });
});

describe("admin request parsers", () => {
  it("parseStatusRequest requires a valid status", () => {
    expect(parseStatusRequest({ status: "CLOSED" })).toBe("CLOSED");
    expect(apiError(() => parseStatusRequest({})).fieldErrors).toEqual({ status: "Status is required" });
    expect(apiError(() => parseStatusRequest({ status: "nope" })).code).toBe("BAD_REQUEST");
  });

  it("parseExtendRequest accepts no body and validates 1..365", () => {
    expect(parseExtendRequest(null)).toBeNull();
    expect(parseExtendRequest({})).toBeNull();
    expect(parseExtendRequest({ days: "7" })).toBe(7);
    expect(apiError(() => parseExtendRequest({ days: 0 })).fieldErrors).toEqual({ days: "Days must be at least 1" });
    expect(apiError(() => parseExtendRequest({ days: 400 })).fieldErrors).toEqual({ days: "Days must be at most 365" });
    expect(apiError(() => parseExtendRequest([])).code).toBe("BAD_REQUEST");
  });

  it("parseDetectRequest stringifies scalars and allows missing fields", () => {
    expect(parseDetectRequest({ title: 5 })).toEqual({ title: "5", description: null });
  });

  it("parseApiKeyRequest requires a name of at most 100 characters", () => {
    expect(parseApiKeyRequest({ name: " zapier " })).toBe(" zapier ");
    expect(apiError(() => parseApiKeyRequest({ name: "  " })).fieldErrors).toEqual({ name: "Name is required" });
    expect(apiError(() => parseApiKeyRequest({ name: "n".repeat(101) })).fieldErrors).toEqual({
      name: "Name must be at most 100 characters",
    });
  });
});

describe("request parameters", () => {
  const q = (s: string) => new URLSearchParams(s);

  it("invalidParameter builds Spring's 400 message", () => {
    expect(invalidParameter("page").message).toBe("Invalid value for 'page'");
  });

  it("trimAllWhitespace removes white space everywhere", () => {
    expect(trimAllWhitespace(" 1 2\t")).toBe("12");
  });

  it("parseSpringInteger accepts decimal, signed and hex numbers within range", () => {
    const int32 = [BigInt(-2147483648), BigInt(2147483647)] as const;
    expect(parseSpringInteger("+5", int32)).toBe(BigInt(5));
    expect(parseSpringInteger("0x10", int32)).toBe(BigInt(16));
    expect(parseSpringInteger("-#10", int32)).toBe(BigInt(-16));
    expect(parseSpringInteger("99999999999", int32)).toBeNull();
    expect(parseSpringInteger("1.5", int32)).toBeNull();
    expect(parseSpringInteger("", int32)).toBeNull();
  });

  it("intParam treats empty as absent and rejects invalid numbers", () => {
    expect(intParam(q("page="), "page")).toBeNull();
    expect(intParam(q("x=1"), "page")).toBeNull();
    expect(intParam(q("page=%202"), "page")).toBe(2);
    expect(intParam(q("page=0x2"), "page")).toBe(2);
    expect(apiError(() => intParam(q("page=abc"), "page")).message).toBe("Invalid value for 'page'");
    expect(() => intParam(q("page=%20"), "page")).toThrow(ApiException);
  });

  it("enumParam trims, is case sensitive and treats empty as absent", () => {
    const modes = ["ONSITE", "HYBRID", "REMOTE"] as const;
    expect(enumParam(q("workMode=%20REMOTE%20"), "workMode", modes)).toBe("REMOTE");
    expect(enumParam(q("workMode="), "workMode", modes)).toBeNull();
    expect(apiError(() => enumParam(q("workMode=remote"), "workMode", modes)).message).toBe("Invalid value for 'workMode'");
  });

  it("stringParam joins repeated values with commas", () => {
    expect(stringParam(q("q=a&q=b"), "q")).toBe("a,b");
    expect(stringParam(q(""), "q")).toBeNull();
  });

  it("listParam splits one value on commas and keeps repeated values as they are", () => {
    expect(listParam(q("tags=java,%20kafka"), "tags")).toEqual(["java", "kafka"]);
    expect(listParam(q("tags=java&tags=kafka"), "tags")).toEqual(["java", "kafka"]);
    expect(listParam(q("tags="), "tags")).toEqual([]);
    expect(listParam(q(""), "tags")).toBeNull();
  });

  it("pathId parses longs, rejects garbage and treats unrepresentable ids as not found", () => {
    expect(pathId("+1", "Job not found")).toBe(1);
    expect(pathId("0x10", "Job not found")).toBe(16);
    expect(apiError(() => pathId("abc", "Job not found")).message).toBe("Invalid value for 'id'");
    expect(apiError(() => pathId("99999999999999999999", "Job not found")).status).toBe(400);
    const e = apiError(() => pathId("9007199254740993", "Job not found"));
    expect([e.status, e.message]).toEqual([404, "Job not found"]);
  });
});
