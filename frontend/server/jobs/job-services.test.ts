import { beforeEach, describe, expect, it } from "vitest";
import { JOB_SETTINGS } from "@/server/config/app-config";
import { JobCleanupService } from "@/server/jobs/job-cleanup-service";
import { blankToNull, JobCommandService, requestFields, resolveTags } from "@/server/jobs/job-command-service";
import { JobQueryService } from "@/server/jobs/job-query-service";
import { countExperienceBuckets, FilterService, type JobFacetRepository } from "@/server/jobs/filter-service";
import { ApiException } from "@/server/shared/api-exception";
import { hashApplyUrl } from "@/server/url/url-hasher";
import {
  fakeUnitOfWork,
  InMemoryJobRepository,
  InMemoryTagRepository,
  JAVA,
  jobRecord,
  jobRequest,
  KAFKA,
  MemoryLogger,
  MutableClock,
} from "@/server/testing/fakes.testkit";

async function apiError(promise: Promise<unknown>): Promise<ApiException> {
  try {
    await promise;
  } catch (e) {
    if (e instanceof ApiException) return e;
    throw e;
  }
  throw new Error("expected an ApiException");
}

let clock: MutableClock;
let jobs: InMemoryJobRepository;
let tags: InMemoryTagRepository;
let commands: JobCommandService;
let queries: JobQueryService;

beforeEach(() => {
  clock = new MutableClock();
  jobs = new InMemoryJobRepository();
  tags = new InMemoryTagRepository();
  commands = new JobCommandService(fakeUnitOfWork({ jobs, tags }), clock, JOB_SETTINGS);
  queries = new JobQueryService(fakeUnitOfWork({ jobs }), clock, JOB_SETTINGS);
});

describe("blankToNull and requestFields", () => {
  it("blankToNull returns null for blank text and Java-trims the rest", () => {
    expect([blankToNull(null), blankToNull(" \t"), blankToNull(" Pune ")]).toEqual([null, null, "Pune"]);
  });

  it("requestFields trims, nulls blanks, defaults the description and upper-cases the currency", () => {
    const f = requestFields(
      jobRequest({ title: " T ", locationState: " ", description: null, salaryMin: 1, salaryCurrency: "inr", salaryPeriod: "YEARLY" }),
      [JAVA],
    );
    expect([f.title, f.locationState, f.description, f.salaryCurrency, f.salaryPeriod, f.tags]).toEqual(["T", null, "", "INR", "YEARLY", [JAVA]]);
  });

  it("requestFields drops currency and period without a minimum salary", () => {
    const f = requestFields(jobRequest({ salaryCurrency: "INR", salaryPeriod: "MONTHLY" }), []);
    expect([f.salaryCurrency, f.salaryPeriod]).toEqual([null, null]);
  });
});

describe("resolveTags", () => {
  it("returns no tags for null or empty input", async () => {
    expect(await resolveTags(tags, null)).toEqual([]);
    expect(await resolveTags(tags, ["", " "])).toEqual([]);
  });

  it("resolves trimmed, de-duplicated slugs", async () => {
    expect(await resolveTags(tags, [" java ", "java", "kafka"])).toEqual([JAVA, KAFKA]);
  });

  it("names every unknown slug like the Java service", async () => {
    const e = await apiError(resolveTags(tags, ["cobol-9000", "java", "zzz"]));
    expect([e.code, e.message, e.fieldErrors]).toEqual([
      "VALIDATION_FAILED", "Unknown tag(s): [cobol-9000, zzz]", { tags: "Unknown tag(s): cobol-9000, zzz" },
    ]);
  });
});

describe("JobCommandService.create", () => {
  it("creates a published job with slug, tags and the default 30 day expiry", async () => {
    const d = await commands.create(jobRequest({ tags: ["java", "kafka"] }));
    expect(d.slug).toBe("senior-java-engineer-acme-hyderabad-1");
    expect([d.status, d.postedAt, d.expiresAt]).toEqual(["PUBLISHED", "2026-11-04T06:00:00.000Z", "2026-12-04T06:00:00.000Z"]);
    expect(d.tags.map((t) => t.slug)).toEqual(["java", "kafka"]);
    expect(jobs.jobs[0].applyUrlHash).toBe(hashApplyUrl("https://example.com/jobs/1"));
  });

  it("rejects a duplicate apply URL even with tracking parameters, naming the existing job", async () => {
    await commands.create(jobRequest({ title: "First", applyUrl: "https://www.linkedin.com/jobs/view/42/" }));
    const e = await apiError(commands.create(jobRequest({ applyUrl: "https://linkedin.com/jobs/view/42?trackingId=abc" })));
    expect([e.status, e.code, e.message, e.fieldErrors]).toEqual([
      409, "DUPLICATE_APPLY_URL", "A job with this apply URL already exists: First at Acme (id 1)", { applyUrl: "Already posted as job 1" },
    ]);
  });

  it("turns a unique index race into the same 409", async () => {
    jobs.findByApplyUrlHash = async () => null; // simulate a concurrent insert that the pre-check missed
    await commands.create(jobRequest());
    const e = await apiError(commands.create(jobRequest()));
    expect([e.status, e.message]).toEqual([409, "A job with this apply URL already exists"]);
  });

  it("validates before touching the repository", async () => {
    const e = await apiError(commands.create(jobRequest({ experienceMinYears: 5, experienceMaxYears: 1 })));
    expect(e.code).toBe("VALIDATION_FAILED");
    expect(jobs.jobs).toHaveLength(0);
  });
});

describe("JobCommandService.update", () => {
  it("replaces fields, keeps the slug and applies a status change", async () => {
    const created = await commands.create(jobRequest({ tags: ["java"] }));
    clock.advanceMs(1000);
    const d = await commands.update(created.id, jobRequest({ title: "New title", tags: ["kafka"], status: "CLOSED" }));
    expect([d.title, d.slug, d.status, d.tags.map((t) => t.slug)]).toEqual(["New title", created.slug, "CLOSED", ["kafka"]]);
    expect(d.updatedAt).toBe("2026-11-04T06:00:01.000Z");
  });

  it("lets explicit dates win over the status rules", async () => {
    const created = await commands.create(jobRequest({ status: "DRAFT" }));
    const expires = new Date("2027-01-01T00:00:00Z");
    const d = await commands.update(created.id, jobRequest({ status: "PUBLISHED", expiresAt: expires }));
    expect([d.postedAt, d.expiresAt]).toEqual(["2026-11-04T06:00:00.000Z", "2027-01-01T00:00:00.000Z"]);
  });

  it("returns 404 for an unknown id and 409 when the URL belongs to another job", async () => {
    expect((await apiError(commands.update(99, jobRequest()))).status).toBe(404);
    await commands.create(jobRequest({ applyUrl: "https://example.com/a" }));
    const b = await commands.create(jobRequest({ applyUrl: "https://example.com/b" }));
    expect((await apiError(commands.update(b.id, jobRequest({ applyUrl: "https://example.com/a" })))).status).toBe(409);
  });
});

describe("JobCommandService.setStatus and extend", () => {
  it("publishing a draft sets the posted date and expiry", async () => {
    const draft = await commands.create(jobRequest({ status: "DRAFT" }));
    expect(draft.postedAt).toBeNull();
    const d = await commands.setStatus(draft.id, "PUBLISHED");
    expect([d.postedAt, d.expiresAt]).toEqual(["2026-11-04T06:00:00.000Z", "2026-12-04T06:00:00.000Z"]);
  });

  it("extend adds days to a live job and reopens a closed one from now", async () => {
    const live = await commands.create(jobRequest());
    expect((await commands.extend(live.id, 7)).expiresAt).toBe("2026-12-11T06:00:00.000Z");
    clock.advanceDays(60);
    await commands.setStatus(live.id, "CLOSED");
    const reopened = await commands.extend(live.id, null);
    expect([reopened.status, reopened.expiresAt]).toEqual(["PUBLISHED", "2027-02-02T06:00:00.000Z"]); // now (2027-01-03) + 30 days
  });

  it("refuses to extend a draft and 404s for an unknown id", async () => {
    const draft = await commands.create(jobRequest({ status: "DRAFT" }));
    const e = await apiError(commands.extend(draft.id, 5));
    expect([e.status, e.code, e.message]).toEqual([409, "INVALID_STATE", "Publish the draft instead of extending it"]);
    expect((await apiError(commands.extend(42, 5))).status).toBe(404);
    expect((await apiError(commands.setStatus(42, "CLOSED"))).status).toBe(404);
  });
});

describe("JobQueryService", () => {
  it("searchPublic asks for published, live jobs newest first with clamped paging", async () => {
    jobs.jobs.push(jobRecord());
    const page = await queries.searchPublic({ q: "java", location: null, workMode: null, expMin: null, expMax: null, tags: null }, -3, 1000);
    expect(jobs.searches[0]).toEqual({
      criteria: { q: "java", location: null, workMode: null, expMin: null, expMax: null, tags: null, status: "PUBLISHED", liveAt: clock.now() },
      sort: "postedDesc",
      page: { page: 0, size: 50 },
    });
    expect([page.total, page.items[0].slug]).toEqual([1, "senior-java-engineer-acme-hyderabad-1"]);
  });

  it("getPublic hides drafts and shows closed jobs", async () => {
    jobs.jobs.push(jobRecord({ id: 1, slug: "draft-1", status: "DRAFT" }), jobRecord({ id: 2, slug: "closed-2", status: "CLOSED" }));
    expect((await apiError(queries.getPublic("draft-1"))).message).toBe("Job not found");
    expect((await apiError(queries.getPublic("nope"))).status).toBe(404);
    expect((await queries.getPublic("closed-2")).status).toBe("CLOSED");
  });

  it("sitemap lists live published jobs with ISO update times", async () => {
    jobs.jobs.push(jobRecord());
    expect(await queries.sitemap()).toEqual([{ slug: "senior-java-engineer-acme-hyderabad-1", updatedAt: "2026-11-04T06:00:00.000Z" }]);
  });

  it("searchAdmin filters by text and status only, most recently edited first", async () => {
    await queries.searchAdmin("acme", "DRAFT", 1, 30);
    expect(jobs.searches[0]).toEqual({ criteria: { q: "acme", status: "DRAFT" }, sort: "updatedDesc", page: { page: 1, size: 30 } });
  });

  it("getAdmin returns any status and 404s for unknown ids", async () => {
    jobs.jobs.push(jobRecord({ status: "DRAFT" }));
    expect((await queries.getAdmin(1)).status).toBe("DRAFT");
    expect((await apiError(queries.getAdmin(2))).status).toBe(404);
  });
});

describe("JobCleanupService.closeExpiredJobs", () => {
  it("closes only expired published jobs, logs the count and is idempotent", async () => {
    const logger = new MemoryLogger();
    const cleanup = new JobCleanupService(fakeUnitOfWork({ jobs }), clock, logger);
    jobs.jobs.push(
      jobRecord({ id: 1, expiresAt: new Date("2026-11-01T00:00:00Z") }),
      jobRecord({ id: 2, status: "DRAFT", expiresAt: new Date("2026-11-01T00:00:00Z") }),
      jobRecord({ id: 3 }),
    );
    expect(await cleanup.closeExpiredJobs()).toBe(1);
    expect(jobs.jobs.map((j) => j.status)).toEqual(["CLOSED", "DRAFT", "PUBLISHED"]);
    expect(await cleanup.closeExpiredJobs()).toBe(0);
    expect(logger.infos).toEqual(["Closed 1 expired job(s)", "Closed 0 expired job(s)"]);
  });
});

describe("filters", () => {
  it("countExperienceBuckets counts overlapping ranges, with open ended maxima", () => {
    const buckets = countExperienceBuckets([{ min: 7, max: null }, { min: 1, max: 2 }, { min: 5, max: 8 }]);
    expect(buckets.map((b) => [b.label, b.count])).toEqual([["0-2 years", 1], ["3-5 years", 1], ["6-9 years", 2], ["10+ years", 1]]);
    expect(buckets[3]).toEqual({ label: "10+ years", min: 10, max: null, count: 1 });
  });

  it("FilterService.filters runs its queries one at a time (one pooled connection)", async () => {
    let active = 0;
    let maxActive = 0;
    const track = async <T>(value: T): Promise<T> => {
      active++;
      maxActive = Math.max(maxActive, active);
      await new Promise((r) => setTimeout(r, 1));
      active--;
      return value;
    };
    const facets: JobFacetRepository = {
      countByCity: () => track([]),
      countByWorkMode: () => track([]),
      countByTag: () => track([]),
      experienceRanges: () => track([]),
    };
    await new FilterService(fakeUnitOfWork({ facets })).filters();
    expect(maxActive).toBe(1);
  });

  it("FilterService.filters counts published jobs only", async () => {
    const statuses: string[] = [];
    const facets: JobFacetRepository = {
      countByCity: async (s) => (statuses.push(s), [{ city: "Pune", count: 1 }]),
      countByWorkMode: async () => [{ workMode: "REMOTE", count: 1 }],
      countByTag: async () => [{ name: "Java", slug: "java", category: "LANGUAGE", count: 1 }],
      experienceRanges: async () => [{ min: 1, max: 2 }],
    };
    const result = await new FilterService(fakeUnitOfWork({ facets })).filters();
    expect(statuses).toEqual(["PUBLISHED"]);
    expect(result.locations).toEqual([{ city: "Pune", count: 1 }]);
    expect(result.experience[0].count).toBe(1);
  });
});
