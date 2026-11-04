import { afterAll, beforeAll, beforeEach, expect, it } from "vitest";
import {
  asAdmin,
  call,
  createDbTestContext,
  createJob,
  describeWithDatabase,
  INTERNAL_SECRET,
  jobPayload,
  type DbTestContext,
} from "@/server/testing/db.testkit";

/**
 * Ports of the former backend's integration tests (`JobApiIntegrationTest`, `JobCleanupIntegrationTest`,
 * `ApiKeyIntegrationTest`), with the same scenarios and assertions, run against PostgreSQL through the
 * real endpoint handlers. Requires TEST_DB_URL (see db.testkit.ts).
 */
describeWithDatabase("jobs API against PostgreSQL", () => {
  let ctx: DbTestContext;
  const DAY = 24 * 60 * 60 * 1000;

  beforeAll(async () => {
    ctx = await createDbTestContext();
  });
  afterAll(async () => {
    await ctx?.close();
  });
  beforeEach(async () => {
    await ctx.reset();
  });

  const e = () => ctx.endpoints;
  const listPublic = (query = "") => call(e().listPublicJobs, { path: `/api/jobs?${query}` });
  const titles = (r: { body: { items: Array<{ title: string }> } }) => r.body.items.map((j) => j.title);
  const statusOf = async (id: number) =>
    (await ctx.db.query<{ status: string }>("SELECT status FROM jobs WHERE id = $1", [id])).rows[0].status;

  // ---- JobApiIntegrationTest ----

  it("creates a job with slug, tags and the default expiry", async () => {
    const created = await createJob(ctx, jobPayload("Senior Java Engineer", { tags: ["java", "spring-boot"] }));
    expect(created.slug).toBe(`senior-java-engineer-acme-hyderabad-${created.id}`);
    const r = await call(e().getPublicJob, { params: { slug: created.slug } });
    expect(r.status).toBe(200);
    expect(r.body.title).toBe("Senior Java Engineer");
    expect(r.body.tags.map((t: { slug: string }) => t.slug).sort()).toEqual(["java", "spring-boot"]);
    expect(r.body.applyUrl).toBeTruthy();
    expect(r.body.status).toBe("PUBLISHED");
    expect(Date.parse(created.expiresAt) - Date.parse(created.postedAt)).toBe(30 * DAY);
  });

  it("answers 404 NOT_FOUND for an unknown slug", async () => {
    const r = await call(e().getPublicJob, { params: { slug: "nope" } });
    expect([r.status, r.body.code]).toEqual([404, "NOT_FOUND"]);
  });

  it("filters experience with the overlap rule and open ended maxima", async () => {
    await createJob(ctx, jobPayload("A open 7+", { experienceMinYears: 7 }));
    await createJob(ctx, jobPayload("B 5-8", { experienceMinYears: 5, experienceMaxYears: 8 }));
    await createJob(ctx, jobPayload("C 7-10", { experienceMinYears: 7, experienceMaxYears: 10 }));
    await createJob(ctx, jobPayload("D 2-4", { experienceMinYears: 2, experienceMaxYears: 4 }));
    await createJob(ctx, jobPayload("E open 10+", { experienceMinYears: 10 }));

    expect(titles(await listPublic("expMin=7&expMax=7")).sort()).toEqual(["A open 7+", "B 5-8", "C 7-10"]);
    expect(titles(await listPublic("expMin=9&expMax=9")).sort()).toEqual(["A open 7+", "C 7-10"]);
    expect(titles(await listPublic("expMin=12&expMax=12")).sort()).toEqual(["A open 7+", "E open 10+"]);
    expect((await listPublic("expMin=0&expMax=0")).body.total).toBe(0);
    expect(titles(await listPublic("expMin=3&expMax=4"))).toEqual(["D 2-4"]);
  });

  it("filters by location, work mode and all tags", async () => {
    await createJob(ctx, jobPayload("Java BLR", { locationCity: "Bengaluru", workMode: "REMOTE", tags: ["java", "kafka"] }));
    await createJob(ctx, jobPayload("Java HYD", { tags: ["java"] }));
    await createJob(ctx, jobPayload("Python HYD", { tags: ["python"] }));

    expect(titles(await listPublic("location=bengaluru"))).toEqual(["Java BLR"]);
    expect(titles(await listPublic("workMode=REMOTE"))).toEqual(["Java BLR"]);
    expect((await listPublic("tags=java")).body.total).toBe(2);
    expect(titles(await listPublic("tags=java,kafka"))).toEqual(["Java BLR"]); // AND semantics
    expect((await listPublic("tags=java,python")).body.total).toBe(0);
  });

  it("text search matches the description and partial title or company", async () => {
    await createJob(ctx, jobPayload("Platform Engineer", { description: "Operate Kafka clusters at scale", companyName: "Globex" }));
    await createJob(ctx, jobPayload("Designer", { description: "Pixels" }));

    expect(titles(await listPublic("q=kafka"))).toEqual(["Platform Engineer"]);
    expect(titles(await listPublic("q=Glob"))).toEqual(["Platform Engineer"]);
    expect((await listPublic(`q=${encodeURIComponent("100% _ wild")}`)).body.total).toBe(0);
  });

  it("paginates newest first and clamps the size", async () => {
    for (let i = 1; i <= 25; i++) {
      await createJob(ctx, jobPayload(`Job ${i}`));
      ctx.clock.advanceMs(60_000);
    }
    const page2 = await listPublic("size=10&page=2");
    expect(page2.body.items).toHaveLength(5);
    expect([page2.body.total, page2.body.totalPages, page2.body.hasNext, page2.body.items[0].title]).toEqual([25, 3, false, "Job 5"]);
    const first = await listPublic();
    expect([first.body.size, first.body.items[0].title]).toEqual([20, "Job 25"]);
    const capped = await listPublic("size=1000");
    expect([capped.body.size, capped.body.items.length]).toEqual([50, 25]);
  });

  it("rejects a duplicate apply URL even with tracking params", async () => {
    await createJob(ctx, jobPayload("First", { applyUrl: "https://www.linkedin.com/jobs/view/42/" }));
    const r = await call(e().createJob, {
      method: "POST", headers: asAdmin,
      json: jobPayload("Second", { applyUrl: "https://linkedin.com/jobs/view/42?trackingId=abc" }),
    });
    expect([r.status, r.body.code]).toEqual([409, "DUPLICATE_APPLY_URL"]);
    expect(r.body.message).toContain("First");
  });

  it("validates experience, salary, tags and required fields", async () => {
    const post = (json: unknown) => call(e().createJob, { method: "POST", headers: asAdmin, json });
    let r = await post(jobPayload("Bad exp", { experienceMinYears: 7, experienceMaxYears: 3 }));
    expect([r.status, r.body.code]).toEqual([400, "VALIDATION_FAILED"]);
    expect(r.body.fieldErrors.experienceMaxYears).toContain("at least the minimum");
    r = await post(jobPayload("Bad salary", { salaryMin: 100 }));
    expect(Object.keys(r.body.fieldErrors).sort()).toEqual(["salaryCurrency", "salaryPeriod"]);
    r = await post(jobPayload("Max only", { salaryMax: 100, salaryCurrency: "INR", salaryPeriod: "YEARLY" }));
    expect(r.body.fieldErrors.salaryMin).toBeTruthy();
    r = await post(jobPayload("Bad tag", { tags: ["cobol-9000"] }));
    expect(r.body.fieldErrors.tags).toBeTruthy();
    r = await post({ title: "" });
    expect(r.body.fieldErrors.title).toBeTruthy();
  });

  it("stores a complete salary with an upper-cased currency", async () => {
    const created = await createJob(ctx, jobPayload("Paid", { salaryMin: 1800000, salaryMax: 2500000, salaryCurrency: "inr", salaryPeriod: "YEARLY" }));
    const r = await call(e().getPublicJob, { params: { slug: created.slug } });
    expect([r.body.salaryCurrency, r.body.salaryMax]).toEqual(["INR", 2500000]);
  });

  it("requires tokens on admin and internal endpoints", async () => {
    expect((await call(e().listAdminJobs)).status).toBe(401);
    expect((await call(e().listAdminJobs, { headers: { "X-Admin-Token": "wrong" } })).status).toBe(401);
    expect((await call(e().cleanupJobs, { method: "POST" })).status).toBe(401);
    expect((await call(e().cleanupJobs, { method: "POST", headers: asAdmin })).status).toBe(401);
    expect((await listPublic()).status).toBe(200);
  });

  it("hides drafts and keeps closed jobs viewable only by slug", async () => {
    const draft = await createJob(ctx, jobPayload("Hidden draft", { status: "DRAFT" }));
    const closed = await createJob(ctx, jobPayload("Closed one"));
    const patched = await call(e().setJobStatus, { method: "PATCH", headers: asAdmin, json: { status: "CLOSED" }, params: { id: String(closed.id) } });
    expect(patched.status).toBe(200);
    await createJob(ctx, jobPayload("Live"));

    expect(titles(await listPublic())).toEqual(["Live"]);
    expect((await call(e().getPublicJob, { params: { slug: draft.slug } })).status).toBe(404);
    const closedView = await call(e().getPublicJob, { params: { slug: closed.slug } });
    expect([closedView.status, closedView.body.status]).toEqual([200, "CLOSED"]);
    expect(titles(await call(e().listAdminJobs, { path: "/api/admin/jobs?status=DRAFT", headers: asAdmin }))).toEqual(["Hidden draft"]);
    expect((await call(e().listAdminJobs, { headers: asAdmin })).body.total).toBe(3);
  });

  it("publishing a draft sets the posted date and expiry", async () => {
    const draft = await createJob(ctx, jobPayload("Draft", { status: "DRAFT" }));
    expect(draft.postedAt).toBeNull();
    const r = await call(e().setJobStatus, { method: "PATCH", headers: asAdmin, json: { status: "PUBLISHED" }, params: { id: String(draft.id) } });
    expect(r.body.postedAt).toBeTruthy();
    expect(r.body.expiresAt).toBeTruthy();
  });

  it("update replaces fields and keeps the slug", async () => {
    const created = await createJob(ctx, jobPayload("Old title", { tags: ["java"] }));
    const r = await call(e().updateJob, {
      method: "PUT", headers: asAdmin, params: { id: String(created.id) },
      json: jobPayload("New title", { applyUrl: created.applyUrl, tags: ["kotlin"] }),
    });
    expect(r.status).toBe(200);
    expect([r.body.title, r.body.slug, r.body.tags.map((t: { slug: string }) => t.slug)]).toEqual(["New title", created.slug, ["kotlin"]]);
  });

  it("returns filter counts over published jobs", async () => {
    await createJob(ctx, jobPayload("A", { tags: ["java", "kafka"], experienceMinYears: 7 }));
    await createJob(ctx, jobPayload("B", { tags: ["java"], locationCity: "Pune", workMode: "REMOTE", experienceMinYears: 1, experienceMaxYears: 2 }));
    await createJob(ctx, jobPayload("Draft", { tags: ["java"], status: "DRAFT" }));

    const r = await call(e().getFilters);
    expect(r.status).toBe(200);
    const count = <T extends { count: number }>(list: T[], pick: (x: T) => boolean) => list.filter(pick).map((x) => x.count);
    expect(count(r.body.locations, (l: { city: string; count: number }) => l.city === "Hyderabad")).toEqual([1]);
    expect(count(r.body.locations, (l: { city: string; count: number }) => l.city === "Pune")).toEqual([1]);
    expect(count(r.body.tags, (t: { slug: string; count: number }) => t.slug === "java")).toEqual([2]);
    expect(count(r.body.tags, (t: { slug: string; count: number }) => t.slug === "kafka")).toEqual([1]);
    expect(count(r.body.workModes, (w: { workMode: string; count: number }) => w.workMode === "REMOTE")).toEqual([1]);
    expect(count(r.body.experience, (b: { label: string; count: number }) => b.label === "0-2 years")).toEqual([1]);
    expect(count(r.body.experience, (b: { label: string; count: number }) => b.label === "10+ years")).toEqual([1]);
  });

  it("lists only published, unexpired jobs in the sitemap", async () => {
    const live = await createJob(ctx, jobPayload("Live"));
    await createJob(ctx, jobPayload("Draft", { status: "DRAFT" }));
    const expiring = await createJob(ctx, jobPayload("Soon", { expiresAt: new Date(ctx.clock.now().getTime() + 3_600_000).toISOString() }));
    let r = await call(e().getSitemapJobs);
    expect(r.body.map((s: { slug: string }) => s.slug).sort()).toEqual([live.slug, expiring.slug].sort());
    expect(r.body[0].updatedAt).toBeTruthy();
    ctx.clock.advanceMs(2 * 3_600_000);
    r = await call(e().getSitemapJobs);
    expect(r.body.map((s: { slug: string }) => s.slug)).toEqual([live.slug]);
  });

  it("suggests tags from a title and description", async () => {
    const r = await call(e().detectTags, {
      method: "POST", headers: asAdmin,
      json: { title: "Senior Java Engineer", description: "Spring Boot, Kafka, k8s and Kubernetes. Go to market." },
    });
    expect(r.status).toBe(200);
    const slugs = r.body.map((d: { slug: string }) => d.slug);
    expect(slugs[0]).toBe("java");
    expect(slugs).toEqual(expect.arrayContaining(["java", "spring-boot", "kafka", "kubernetes"]));
    expect(slugs).not.toContain("go");
    const k8s = r.body.find((d: { slug: string }) => d.slug === "kubernetes");
    expect(k8s.count).toBe(2);
    expect(k8s.matches.map((m: { text: string }) => m.text)).toEqual(expect.arrayContaining(["k8s", "Kubernetes"]));
  });

  // ---- JobCleanupIntegrationTest ----

  it("closes only expired published jobs and respects a custom expiry", async () => {
    const cleanup = ctx.services.jobCleanup;
    const expired = await createJob(ctx, jobPayload("Default expiry"));
    const custom = await createJob(ctx, jobPayload("Custom 90 days", { expiresAt: new Date(ctx.clock.now().getTime() + 90 * DAY).toISOString() }));
    const draft = await createJob(ctx, jobPayload("Draft", { status: "DRAFT" }));
    const shortLived = await createJob(ctx, jobPayload("Short", { expiresAt: new Date(ctx.clock.now().getTime() + 5 * DAY).toISOString() }));

    ctx.clock.advanceDays(10);
    expect(await cleanup.closeExpiredJobs()).toBe(1); // only "Short"
    expect(await statusOf(shortLived.id)).toBe("CLOSED");
    expect(await statusOf(expired.id)).toBe("PUBLISHED");

    ctx.clock.advanceDays(25); // day 35
    expect(await cleanup.closeExpiredJobs()).toBe(1); // the default 30 day job
    expect(await statusOf(expired.id)).toBe("CLOSED");
    expect(await statusOf(custom.id)).toBe("PUBLISHED");
    expect(await statusOf(draft.id)).toBe("DRAFT");
    expect(await cleanup.closeExpiredJobs()).toBe(0); // idempotent
  });

  it("protects the cleanup endpoint and makes it safe to call repeatedly", async () => {
    await createJob(ctx, jobPayload("Soon gone"));
    ctx.clock.advanceDays(31);
    const secret = { "X-Internal-Secret": INTERNAL_SECRET };
    expect((await call(e().cleanupJobs, { method: "POST" })).status).toBe(401);
    const first = await call(e().cleanupJobs, { method: "POST", headers: secret });
    expect([first.status, first.body]).toEqual([200, { closed: 1 }]);
    expect((await call(e().cleanupJobs, { method: "POST", headers: secret })).body).toEqual({ closed: 0 });
    expect((await listPublic()).body.total).toBe(0);
  });

  it("extend reopens a closed job and resets the expiry", async () => {
    const created = await createJob(ctx, jobPayload("Comeback"));
    ctx.clock.advanceDays(31);
    await ctx.services.jobCleanup.closeExpiredJobs();
    expect(await statusOf(created.id)).toBe("CLOSED");

    const before = ctx.clock.now();
    const r = await call(e().extendJob, { method: "POST", headers: asAdmin, json: { days: 14 }, params: { id: String(created.id) } });
    expect([r.status, r.body.status]).toEqual([200, "PUBLISHED"]);
    expect(r.body.expiresAt.slice(0, 16)).toBe(new Date(before.getTime() + 14 * DAY).toISOString().slice(0, 16));
    expect((await listPublic()).body.total).toBe(1);
  });

  it("extend adds to the future expiry of a live job", async () => {
    const created = await createJob(ctx, jobPayload("Live"));
    const r = await call(e().extendJob, { method: "POST", headers: asAdmin, json: { days: 7 }, params: { id: String(created.id) } });
    expect(r.body.expiresAt.slice(0, 16)).toBe(new Date(Date.parse(created.expiresAt) + 7 * DAY).toISOString().slice(0, 16));
  });

  it("rejects extending a draft", async () => {
    const draft = await createJob(ctx, jobPayload("Draft", { status: "DRAFT" }));
    const r = await call(e().extendJob, { method: "POST", headers: asAdmin, json: {}, params: { id: String(draft.id) } });
    expect([r.status, r.body.code]).toEqual([409, "INVALID_STATE"]);
  });

  it("reopening via the status endpoint resets an expired window", async () => {
    const created = await createJob(ctx, jobPayload("Reopen me"));
    ctx.clock.advanceDays(31);
    await ctx.services.jobCleanup.closeExpiredJobs();
    const r = await call(e().setJobStatus, { method: "PATCH", headers: asAdmin, json: { status: "PUBLISHED" }, params: { id: String(created.id) } });
    expect(r.body.status).toBe("PUBLISHED");
    expect(await ctx.services.jobCleanup.closeExpiredJobs()).toBe(0);
  });

  it("drops expired jobs from the public list before the daily sweep runs", async () => {
    const soon = await createJob(ctx, jobPayload("Expires soon", { expiresAt: new Date(ctx.clock.now().getTime() + 3_600_000).toISOString() }));
    await createJob(ctx, jobPayload("Long lived"));
    expect((await listPublic()).body.total).toBe(2);
    ctx.clock.advanceMs(2 * 3_600_000); // expired, but the cleanup has not run
    expect(await statusOf(soon.id)).toBe("PUBLISHED");
    expect(titles(await listPublic())).toEqual(["Long lived"]);
    expect((await call(e().getPublicJob, { params: { slug: soon.slug } })).status).toBe(200); // the page stays reachable
  });

  // ---- ApiKeyIntegrationTest ----

  async function createKey(name: string) {
    const r = await call(e().createApiKey, { method: "POST", headers: asAdmin, json: { name } });
    expect(r.status).toBe(201);
    expect(r.body.key).toMatch(/^fjk_/);
    return r.body as { id: number; key: string };
  }

  it("lets a key create jobs while storing only its hash", async () => {
    const { key } = await createKey("zapier");
    const stored = await ctx.db.query<{ n: number }>("SELECT count(*) AS n FROM api_keys WHERE key_hash = $1", [key]);
    expect(stored.rows[0].n).toBe(0);
    const created = await call(e().createJob, { method: "POST", headers: { "X-API-Key": key }, json: jobPayload("Via key") });
    expect(created.status).toBe(201);
    const list = await call(e().listApiKeys, { headers: asAdmin });
    expect(list.body[0].key).toBeNull();
    expect(list.body[0].lastUsedAt).toBeTruthy();
  });

  it("does not let a key manage keys and rejects a bad key", async () => {
    const { key } = await createKey("k");
    expect((await call(e().listApiKeys, { headers: { "X-API-Key": key } })).status).toBe(401);
    expect((await call(e().unknownRoute, { headers: { "X-API-Key": key }, params: { path: ["admin", "api-keys-x"] } })).status).toBe(401);
    expect((await call(e().listAdminJobs, { headers: { "X-API-Key": "fjk_nope" } })).status).toBe(401);
  });

  it("stops accepting a revoked key", async () => {
    const k = await createKey("temp");
    const revoked = await call(e().revokeApiKey, { method: "DELETE", headers: asAdmin, params: { id: String(k.id) } });
    expect(revoked.status).toBe(204);
    expect((await call(e().listAdminJobs, { headers: { "X-API-Key": k.key } })).status).toBe(401);
  });

  // ---- routing and headers specific to the Next.js port ----

  it("answers unknown API paths with JSON 404s, after authentication on protected prefixes", async () => {
    const unknown = (path: string[], headers = {}) => call(e().unknownRoute, { headers, params: { path } });
    expect((await unknown(["nope"])).body).toEqual({ code: "NOT_FOUND", message: "Not found", fieldErrors: {} });
    expect((await unknown(["admin", "nope"])).status).toBe(401);
    expect((await unknown(["admin", "nope"], asAdmin)).status).toBe(404);
    expect((await unknown(["internal", "nope"], { "X-Internal-Secret": INTERNAL_SECRET })).status).toBe(404);
  });

  it("sends Cache-Control: no-store on protected responses, errors included, and not on public ones", async () => {
    expect((await call(e().listAdminJobs, { headers: asAdmin })).headers.get("Cache-Control")).toBe("no-store");
    expect((await call(e().listAdminJobs)).headers.get("Cache-Control")).toBe("no-store");
    expect((await call(e().getAdminJob, { headers: asAdmin, params: { id: "abc" } })).headers.get("Cache-Control")).toBe("no-store");
    expect((await listPublic()).headers.get("Cache-Control")).toBeNull();
  });
});
