import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { fetchFilters, fetchJob, fetchJobs, fetchSitemapEntries } from "@/lib/data/jobs";
import { EMPTY_FILTERS } from "@/lib/filters";
import { fakeServices, installServices, jobRecord, type FakeStores } from "@/server/testing/fakes.testkit";

let stores: FakeStores;
let restore: () => void;

beforeEach(() => {
  const fake = fakeServices();
  stores = fake.stores;
  restore = installServices(fake.services);
});
afterEach(() => restore());

describe("fetchJobs", () => {
  it("returns the first page of published jobs with the public page size", async () => {
    stores.jobs.jobs.push(jobRecord());
    const page = await fetchJobs(EMPTY_FILTERS);
    expect([page.page, page.size, page.total]).toEqual([0, 20, 1]);
  });

  it("translates the URL filters exactly like GET /api/jobs (exp becomes expMin = expMax)", async () => {
    await fetchJobs({ q: "java", location: "Pune", mode: "REMOTE", exp: "7", tags: ["java"] }, 2);
    expect(stores.jobs.searches[0].criteria).toMatchObject({ q: "java", location: "Pune", workMode: "REMOTE", expMin: 7, expMax: 7, tags: ["java"] });
    expect(stores.jobs.searches[0].page).toEqual({ page: 2, size: 20 });
  });
});

describe("fetchJob", () => {
  it("returns the job, or null for an unknown slug or a draft", async () => {
    stores.jobs.jobs.push(jobRecord({ id: 1, slug: "live-1" }), jobRecord({ id: 2, slug: "draft-2", status: "DRAFT", applyUrlHash: "h2" }));
    expect((await fetchJob("live-1"))?.id).toBe(1);
    expect(await fetchJob("draft-2")).toBeNull();
    expect(await fetchJob("nope")).toBeNull();
  });

  it("propagates errors other than 404", async () => {
    stores.jobs.findBySlug = () => Promise.reject(new Error("db down"));
    await expect(fetchJob("x")).rejects.toThrow("db down");
  });
});

describe("fetchFilters", () => {
  it("returns the facets, or null when they cannot be loaded", async () => {
    expect((await fetchFilters())?.experience).toHaveLength(4);
    stores.facets.countByCity = () => Promise.reject(new Error("db down"));
    expect(await fetchFilters()).toBeNull();
  });
});

describe("fetchSitemapEntries", () => {
  it("lists live published jobs", async () => {
    stores.jobs.jobs.push(jobRecord());
    expect(await fetchSitemapEntries()).toEqual([{ slug: "senior-java-engineer-acme-hyderabad-1", updatedAt: "2026-11-04T06:00:00.000Z" }]);
  });
});
