import { beforeEach, describe, expect, it } from "vitest";
import type { JobDetail } from "@/lib/api/contract";
import type { JobPostCreated } from "@/server/events/event-bus";
import { PostintimePublisher, postsUrl, type RenderedImage } from "@/server/postintime/postintime-publisher";
import { PostintimeSettingsService } from "@/server/postintime/settings";
import { fakeUnitOfWork, InMemoryPostintimeSettingsRepository, JAVA, MemoryLogger, MutableClock } from "@/server/testing/fakes.testkit";

const CHANNEL = "3f2b8a52-6c1e-4f7e-9a53-0b6f7c1d2e44";
const PNG: RenderedImage = { bytes: new Uint8Array([137, 80, 78, 71]), contentType: "image/png" };

function job(extra: Partial<JobDetail> = {}): JobDetail {
  return {
    id: 12, slug: "senior-java-engineer-acme-pune-12", title: "Senior Java Engineer", companyName: "Acme", companyLogoUrl: null,
    description: "", applyUrl: "https://example.com/apply", source: "LINKEDIN", locationCity: "Pune", locationState: null,
    locationCountry: null, workMode: "HYBRID", experienceMinYears: 5, experienceMaxYears: 8, salaryMin: null, salaryMax: null,
    salaryCurrency: null, salaryPeriod: null, status: "PUBLISHED", postedAt: "2026-11-04T06:00:00.000Z",
    expiresAt: null, updatedAt: "2026-11-04T06:00:00.000Z", tags: [JAVA],
    ...extra,
  };
}
const event = (j: JobDetail): JobPostCreated => ({ type: "JobPostCreated", job: j, occurredAt: new Date() });

interface Call {
  url: string;
  init: RequestInit;
  form: FormData;
}

let repo: InMemoryPostintimeSettingsRepository;
let logger: MemoryLogger;
let calls: Call[];
let respond: () => Response | Promise<Response>;
let render: () => Promise<RenderedImage>;
let publisher: PostintimePublisher;
let recorded: Array<[number, string | null]>;

beforeEach(() => {
  repo = new InMemoryPostintimeSettingsRepository();
  repo.settings = { ...repo.settings, enabled: true, baseUrl: "https://pit.example.com", apiToken: "pit_secret", channelId: CHANNEL, postStatus: "ready" };
  logger = new MemoryLogger();
  calls = [];
  recorded = [];
  respond = () => Response.json({ id: "post-1" }, { status: 201 });
  render = async () => PNG;
  const fakeFetch = (async (url: string, init: RequestInit) => {
    calls.push({ url, init, form: init.body as FormData });
    return respond();
  }) as unknown as typeof fetch;
  const settings = new PostintimeSettingsService(fakeUnitOfWork({ settings: repo }), new MutableClock());
  publisher = new PostintimePublisher(settings, () => render(), logger, fakeFetch, 50, {
    recordPosted: async (id, postId) => void recorded.push([id, postId]),
  });
});

describe("postsUrl", () => {
  it("is the public create post endpoint of the channel", () => {
    expect(postsUrl({ baseUrl: "https://pit.example.com", channelId: CHANNEL })).toBe(`https://pit.example.com/api/v1/public/channels/${CHANNEL}/posts`);
  });
});

describe("PostintimePublisher.onJobPostCreated", () => {
  it("posts the job with its square image to the configured channel", async () => {
    await publisher.onJobPostCreated(event(job()));
    expect(calls).toHaveLength(1);
    const [{ url, init, form }] = calls;
    expect(url).toBe(`https://pit.example.com/api/v1/public/channels/${CHANNEL}/posts`);
    expect(init.method).toBe("POST");
    expect(init.headers).toEqual({ "X-Api-Key": "pit_secret" });
    expect(form.get("title")).toBe("Senior Java Engineer at Acme");
    expect(form.get("status")).toBe("ready");
    const caption = String(form.get("caption"));
    expect(caption).toContain("Senior Java Engineer");
    expect(caption).toContain("Company: Acme");
    expect(caption).toContain("/jobs/senior-java-engineer-acme-pune-12");
    const media = form.get("media") as File;
    expect([media.name, media.type, media.size]).toEqual(["senior-java-engineer-acme-pune-12-square.png", "image/png", 4]);
  });

  it("appends the post suffix to the caption", async () => {
    repo.settings = { ...repo.settings, postSuffix: "#jobs\n#hiring" };
    await publisher.onJobPostCreated(event(job()));
    expect(String(calls[0].form.get("caption"))).toMatch(/\n\n#jobs\n#hiring$/);
  });

  it("remembers the outcome for the admin page", async () => {
    await publisher.onJobPostCreated(event(job()));
    expect(repo.settings.lastResult).toBe("Posted job 12 (senior-java-engineer-acme-pune-12) as post post-1");
    expect(logger.errors).toEqual([]);
  });

  it("does nothing while it is switched off", async () => {
    repo.settings.enabled = false;
    await publisher.onJobPostCreated(event(job()));
    expect(calls).toEqual([]);
    expect(repo.settings.lastResult).toBeNull();
  });

  it.each(["DRAFT", "CLOSED"] as const)("does not post a %s job", async (status) => {
    await publisher.onJobPostCreated(event(job({ status })));
    expect(calls).toEqual([]);
  });

  it("cuts a very long title to the 300 characters PostInTime accepts", async () => {
    await publisher.onJobPostCreated(event(job({ title: "T".repeat(400) })));
    expect(String(calls[0].form.get("title"))).toHaveLength(300);
  });

  it("records the status and a body snippet when PostInTime refuses, without leaking the token", async () => {
    respond = () => new Response('{"code":"UNAUTHORIZED",\n "message":"Missing or invalid token"}', { status: 401 });
    await publisher.onJobPostCreated(event(job()));
    expect(repo.settings.lastResult).toBe('Failed to post job 12: PostInTime answered HTTP 401: {"code":"UNAUTHORIZED", "message":"Missing or invalid token"}');
    expect(logger.errors).toHaveLength(1);
    expect(JSON.stringify([repo.settings.lastResult, logger.errors.map((e) => e.message)])).not.toContain("pit_secret");
  });

  it("records a network failure instead of throwing", async () => {
    respond = () => Promise.reject(new TypeError("fetch failed"));
    await expect(publisher.onJobPostCreated(event(job()))).resolves.toBeUndefined();
    expect(repo.settings.lastResult).toBe("Failed to post job 12: fetch failed");
  });

  it("gives up after the timeout", async () => {
    const hang = (async (_url: string, init: RequestInit) =>
      new Promise((_resolve, reject) => init.signal?.addEventListener("abort", () => reject(init.signal?.reason)))) as unknown as typeof fetch;
    const settings = new PostintimeSettingsService(fakeUnitOfWork({ settings: repo }), new MutableClock());
    await new PostintimePublisher(settings, async () => PNG, logger, hang, 20).onJobPostCreated(event(job()));
    expect(repo.settings.lastResult).toBe("Failed to post job 12: timed out");
  });

  it("still posts, without media, when the image cannot be drawn", async () => {
    render = () => Promise.reject(new Error("no fonts"));
    await publisher.onJobPostCreated(event(job()));
    expect(calls[0].form.get("media")).toBeNull();
    expect(repo.settings.lastResult).toBe("Posted job 12 (senior-java-engineer-acme-pune-12) as post post-1 (without image: no fonts)");
  });

  it("does not throw when the result cannot be saved", async () => {
    repo.recordResult = () => Promise.reject(new Error("db down"));
    await expect(publisher.onJobPostCreated(event(job()))).resolves.toBeUndefined();
    expect(logger.errors.map((e) => e.message)).toEqual(["PostInTime: could not save the result"]);
  });

  it("does not throw when the settings cannot be read", async () => {
    repo.get = () => Promise.reject(new Error("db down"));
    await expect(publisher.onJobPostCreated(event(job()))).resolves.toBeUndefined();
    expect(calls).toEqual([]);
  });
});

describe("marking jobs as posted", () => {
  it("records the job and the post id after an automatic push", async () => {
    await publisher.onJobPostCreated(event(job()));
    expect(recorded).toEqual([[12, "post-1"]]);
  });

  it("records nothing when the push fails", async () => {
    respond = () => new Response("nope", { status: 500 });
    await publisher.onJobPostCreated(event(job()));
    expect(recorded).toEqual([]);
  });
});

describe("PostintimePublisher.publishJob", () => {
  it("posts even while the connection is switched off, and records it", async () => {
    repo.settings = { ...repo.settings, enabled: false };
    const outcome = await publisher.publishJob(job());
    expect(outcome).toEqual({ ok: true, message: "Posted job 12 (senior-java-engineer-acme-pune-12) as post post-1" });
    expect(recorded).toEqual([[12, "post-1"]]);
    expect(repo.settings.lastResult).toBe(outcome.message);
  });

  it("posts a job again that was posted before", async () => {
    await publisher.publishJob(job());
    await publisher.publishJob(job());
    expect(calls).toHaveLength(2);
  });

  it("refuses a draft", async () => {
    const outcome = await publisher.publishJob(job({ status: "DRAFT" }));
    expect(outcome).toEqual({ ok: false, message: "Job 12 is a draft; publish it first" });
    expect(calls).toEqual([]);
  });

  it("refuses when the connection is not filled in", async () => {
    repo.settings = { ...repo.settings, apiToken: "" };
    const outcome = await publisher.publishJob(job());
    expect(outcome.ok).toBe(false);
    expect(outcome.message).toMatch(/not set up yet/);
    expect(calls).toEqual([]);
  });

  it("reports a failure instead of throwing", async () => {
    respond = () => new Response("nope", { status: 401 });
    const outcome = await publisher.publishJob(job());
    expect(outcome).toEqual({ ok: false, message: "Failed to post job 12: PostInTime answered HTTP 401: nope" });
    expect(recorded).toEqual([]);
  });

  it("hints at a wrong Server URL when the answer is the web app's HTML 405 page", async () => {
    respond = () => new Response("<html><title>405 Not Allowed</title></html>", { status: 405 });
    const outcome = await publisher.publishJob(job());
    expect(outcome.ok).toBe(false);
    expect(outcome.message).toMatch(/HTTP 405.*web app, not its API/);
  });
});
