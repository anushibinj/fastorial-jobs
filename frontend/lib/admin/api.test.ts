import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  adminCreateApiKey,
  adminCreateJob,
  adminDetectTags,
  adminExtend,
  adminGetJob,
  adminListApiKeys,
  adminListJobs,
  adminRevokeApiKey,
  adminSetStatus,
  adminTags,
  adminUpdateJob,
} from "@/lib/admin/api";
import { ApiException } from "@/server/shared/api-exception";
import { fakeServices, installServices, type FakeStores } from "@/server/testing/fakes.testkit";

let stores: FakeStores;
let restore: () => void;

beforeEach(() => {
  const fake = fakeServices();
  stores = fake.stores;
  restore = installServices(fake.services);
});
afterEach(() => restore());

const payload = {
  title: "Senior Java Engineer", companyName: "Acme", applyUrl: "https://example.com/jobs/1",
  source: "LINKEDIN", workMode: "HYBRID", experienceMinYears: 5, tags: ["java"],
};

/** Awaits a promise expected to reject with an ApiException and returns it. */
async function rejection(p: Promise<unknown>): Promise<ApiException> {
  const e = await p.then(() => null, (err: unknown) => err);
  if (!ApiException.is(e)) throw new Error("expected an ApiException rejection");
  return e;
}

describe("admin jobs", () => {
  it("adminCreateJob validates the untrusted payload and creates the job", async () => {
    const job = await adminCreateJob(payload);
    expect([job.id, job.tags.map((t) => t.slug)]).toEqual([1, ["java"]]);
    expect((await rejection(adminCreateJob({ ...payload, title: "" }))).fieldErrors).toEqual({ title: "Title is required" });
  });

  it("adminGetJob and adminUpdateJob parse the id like the REST API", async () => {
    await adminCreateJob(payload);
    expect((await adminGetJob("1")).title).toBe("Senior Java Engineer");
    expect((await adminUpdateJob(1, { ...payload, title: "New" })).title).toBe("New");
    expect((await rejection(adminGetJob("abc"))).message).toBe("Invalid value for 'id'");
    expect((await rejection(adminGetJob(99))).status).toBe(404);
  });

  it("adminListJobs pages 30 at a time and rejects (not throws) an invalid status", async () => {
    await adminCreateJob(payload);
    const page = await adminListJobs({ status: "PUBLISHED", page: 0 });
    expect([page.size, page.total]).toEqual([30, 1]);
    expect(stores.jobs.searches.at(-1)?.criteria).toEqual({ q: null, status: "PUBLISHED" });
    await expect(adminListJobs({ status: "nope" })).rejects.toThrow("Invalid value for 'status'");
  });

  it("adminSetStatus and adminExtend validate their inputs", async () => {
    await adminCreateJob(payload);
    expect((await adminSetStatus("1", "CLOSED")).status).toBe("CLOSED");
    expect((await rejection(adminSetStatus("1", "closed"))).code).toBe("BAD_REQUEST");
    expect((await adminExtend("1", 7)).status).toBe("PUBLISHED");
    expect((await adminExtend("1")).status).toBe("PUBLISHED");
    expect((await rejection(adminExtend("1", 400))).fieldErrors).toEqual({ days: "Days must be at most 365" });
  });
});

describe("admin tags", () => {
  it("adminTags lists the vocabulary and adminDetectTags suggests tags", async () => {
    expect((await adminTags()).map((t) => t.slug)).toEqual(["aws", "java", "kafka"]);
    expect((await adminDetectTags("Java engineer", "Kafka and AWS")).map((d) => d.slug)).toEqual(["java", "aws", "kafka"]);
    expect((await rejection(adminDetectTags(["x"], null))).code).toBe("BAD_REQUEST");
  });
});

describe("admin API keys", () => {
  it("creates, lists and revokes keys, validating the name and id", async () => {
    const created = await adminCreateApiKey("Zapier");
    expect(created.key).toMatch(/^fjk_[0-9a-f]{64}$/);
    expect((await adminListApiKeys()).map((k) => [k.name, k.key])).toEqual([["Zapier", null]]);
    await adminRevokeApiKey(String(created.id));
    expect((await adminListApiKeys())[0].revokedAt).not.toBeNull();
    expect((await rejection(adminCreateApiKey(" "))).fieldErrors).toEqual({ name: "Name is required" });
    expect((await rejection(adminRevokeApiKey("99"))).message).toBe("API key not found");
  });
});
