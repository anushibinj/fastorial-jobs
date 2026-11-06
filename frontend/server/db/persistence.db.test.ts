import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { PgApiKeyRepository } from "@/server/api-keys/api-key-service";
import type { Services } from "@/server/container";
import { loadConfig } from "@/server/config/app-config";
import { createDatabase } from "@/server/db/database";
import { migrateOnStartup } from "@/server/db/migrate-on-startup";
import { MIGRATIONS } from "@/server/db/migrations";
import { Migrator } from "@/server/db/migrator";
import { PgJobFacetRepository } from "@/server/jobs/filter-service";
import type { JobRecord } from "@/server/jobs/job-record";
import { DuplicateApplyUrlError, PgJobRepository } from "@/server/jobs/job-repository";
import { DEFAULT_SETTINGS, PgPostintimeSettingsRepository } from "@/server/postintime/settings";
import { PgQueueStore } from "@/server/queue/queue-store";
import { PgTagRepository } from "@/server/tags/tag-repository";
import { createDbTestContext, describeWithDatabase, TEST_DB_URL, type DbTestContext } from "@/server/testing/db.testkit";
import { jobRecord, MemoryLogger } from "@/server/testing/fakes.testkit";

describeWithDatabase("persistence against PostgreSQL", () => {
  let ctx: DbTestContext;

  beforeAll(async () => {
    ctx = await createDbTestContext();
  });
  afterAll(async () => {
    await ctx?.close();
  });
  beforeEach(async () => {
    await ctx.reset();
  });

  describe("PgQueueStore", () => {
    it("stores in order, claims one at a time, and deletes or fails items", async () => {
      const store = new PgQueueStore(ctx.db);
      await store.insert("q", [{ n: 1 }, { n: 2 }]);
      await store.insert("other", [{ n: 9 }]);
      const first = await store.claim("q", 60_000);
      expect(first?.payload).toEqual({ n: 1 });
      expect(await store.claim("q", 60_000)).toBeNull();
      await store.complete(first!.id);
      const second = await store.claim("q", 60_000);
      expect(second?.payload).toEqual({ n: 2 });
      await store.fail(second!.id, "boom");
      expect(await store.claim("q", 60_000)).toBeNull();
      expect((await store.claim("other", 60_000))?.payload).toEqual({ n: 9 });
    });

    it("lets another worker take over an item whose lease ran out", async () => {
      const store = new PgQueueStore(ctx.db);
      await store.insert("q", ["a"]);
      const claimed = await store.claim("q", 60_000);
      expect((await store.claim("q", 0))?.id).toBe(claimed!.id);
    });
  });

  describe("PgDatabase", () => {
    it("query returns rows with bigint values as numbers, and the affected row count", async () => {
      const r = await ctx.db.query<{ n: number }>("SELECT 9007199254740991::bigint AS n");
      expect(r.rows[0].n).toBe(Number.MAX_SAFE_INTEGER);
      expect((await ctx.db.query("UPDATE jobs SET title = title")).rowCount).toBe(0);
    });

    it("refuses bigint values that would lose precision", async () => {
      await expect(ctx.db.query("SELECT 9007199254740993::bigint AS n")).rejects.toThrow(/MAX_SAFE_INTEGER/);
    });

    it("survives an idle pooled connection being terminated by the server (logs it, keeps working)", async () => {
      // Without the pool's error listener this kills the process (and with it this test worker).
      const logger = new MemoryLogger();
      const db = createDatabase(
        loadConfig({ DB_URL: TEST_DB_URL, DB_USER: process.env.TEST_DB_USER ?? "fastorial", DB_PASSWORD: process.env.TEST_DB_PASSWORD ?? "fastorial" }).database,
        logger,
      );
      try {
        const { rows } = await db.query<{ pid: number }>("SELECT pg_backend_pid() AS pid"); // now idle in the pool
        await ctx.db.query("SELECT pg_terminate_backend($1)", [rows[0].pid]);
        await new Promise((resolve) => setTimeout(resolve, 200));
        expect(logger.errors.map((e) => e.message)).toEqual(["An idle database connection failed and was discarded"]);
        expect((await db.query<{ ok: number }>("SELECT 1 AS ok")).rows[0].ok).toBe(1); // a fresh connection
      } finally {
        await db.close();
      }
    });

    it("transaction commits on success and rolls back on error", async () => {
      await ctx.db.transaction((tx) => tx.query("INSERT INTO api_keys (name, key_prefix, key_hash) VALUES ('a', 'p', 'h1')"));
      await expect(
        ctx.db.transaction(async (tx) => {
          await tx.query("INSERT INTO api_keys (name, key_prefix, key_hash) VALUES ('b', 'p', 'h2')");
          throw new Error("boom");
        }),
      ).rejects.toThrow("boom");
      const { rows } = await ctx.db.query<{ name: string }>("SELECT name FROM api_keys ORDER BY id");
      expect(rows.map((r) => r.name)).toEqual(["a"]);
    });
  });

  describe("Migrator", () => {
    it("does nothing on an up to date schema and says so", async () => {
      const logger = new MemoryLogger();
      expect(await new Migrator(ctx.db, MIGRATIONS, logger).migrate()).toEqual([]);
      expect(logger.infos).toEqual(["Database schema is up to date"]);
    });

    it("refuses to start when an applied migration's checksum differs (like Flyway's validate)", async () => {
      const edited = MIGRATIONS.map((m) => (m.version === "2" ? { ...m, sql: `${m.sql}\n-- edited` } : m));
      await expect(new Migrator(ctx.db, edited, new MemoryLogger()).migrate()).rejects.toThrow(/changed after it was applied/);
    });

    it("lets concurrent startups wait for each other: the schema is migrated exactly once", async () => {
      const scratch = `${ctx.schema}_race`;
      await ctx.db.query(`CREATE SCHEMA ${scratch}`);
      try {
        // Two "instances" migrate the same empty schema at once, each on its own connection.
        const migrateScratch = () =>
          ctx.db.transaction(async (tx) => {
            await tx.query(`SET LOCAL search_path TO ${scratch}`);
            const single = { query: tx.query.bind(tx), transaction: <T>(w: (t: typeof tx) => Promise<T>) => w(tx), close: async () => {} };
            return new Migrator(single, MIGRATIONS, new MemoryLogger()).migrate();
          });
        const results = await Promise.all([migrateScratch(), migrateScratch()]);
        expect(results.map((r) => r.length).sort()).toEqual([0, MIGRATIONS.length]); // the second waited for the lock
        const { rows } = await ctx.db.query<{ n: number }>(`SELECT count(*) AS n FROM ${scratch}.flyway_schema_history`);
        expect(rows[0].n).toBe(MIGRATIONS.length);
      } finally {
        await ctx.db.query(`DROP SCHEMA ${scratch} CASCADE`);
      }
    });
  });

  describe("migrateOnStartup", () => {
    it("migrates through the application services and logs the outcome", async () => {
      const holder = globalThis as typeof globalThis & { __fastorialServices?: Services };
      const previous = holder.__fastorialServices;
      holder.__fastorialServices = ctx.services;
      try {
        await migrateOnStartup();
        expect(ctx.logger.infos.at(-1)).toBe("Database schema is up to date");
      } finally {
        holder.__fastorialServices = previous;
      }
    });
  });

  describe("PgTagRepository", () => {
    const repo = () => new PgTagRepository(ctx.db);

    it("lists the 58 seeded tags in id order and by name", async () => {
      const all = await repo().findAll();
      expect(all).toHaveLength(58);
      expect(all[0]).toEqual({ id: 1, name: "Java", slug: "java", category: "LANGUAGE" });
      // The order depends on the database collation, so compare with PostgreSQL's own ORDER BY name.
      const byName = await repo().findAllOrderedByName();
      const expected = await ctx.db.query<{ name: string }>("SELECT name FROM tags ORDER BY name");
      expect(byName.map((t) => t.name)).toEqual(expected.rows.map((r) => r.name));
      expect(new Set(byName.map((t) => t.id))).toEqual(new Set(all.map((t) => t.id)));
    });

    it("finds tags by slug and returns nothing for no slugs", async () => {
      expect((await repo().findBySlugs(["kafka", "java", "nope"])).map((t) => t.slug).sort()).toEqual(["java", "kafka"]);
      expect(await repo().findBySlugs([])).toEqual([]);
    });

    it("loads the 125 seeded aliases with their tags", async () => {
      const aliases = await repo().findAllAliases();
      expect(aliases).toHaveLength(125);
      expect(aliases[0]).toEqual({ tag: { id: 1, name: "Java", slug: "java", category: "LANGUAGE" }, alias: "jdk", caseSensitive: false });
      expect(aliases.find((a) => a.alias === "Go")?.caseSensitive).toBe(true);
    });
  });

  describe("PgJobRepository", () => {
    const repo = () => new PgJobRepository(ctx.db);
    const tags = () => new PgTagRepository(ctx.db).findBySlugs(["java", "kafka"]);

    async function insert(extra: Partial<JobRecord> = {}): Promise<JobRecord> {
      const id = await repo().nextId();
      const job = jobRecord({ id, slug: `job-${id}`, applyUrlHash: `hash-${id}`, ...extra });
      await repo().insert(job);
      return job;
    }

    it("inserts with tags and reads back by id, slug and hash", async () => {
      const job = await insert({ tags: await tags() });
      for (const found of [await repo().findById(job.id), await repo().findBySlug(job.slug), await repo().findByApplyUrlHash(job.applyUrlHash)]) {
        expect(found?.id).toBe(job.id);
        expect(found?.tags.map((t) => t.slug).sort()).toEqual(["java", "kafka"]);
        expect(found?.postedAt?.toISOString()).toBe(job.postedAt?.toISOString());
      }
      expect(await repo().findById(999)).toBeNull();
    });

    it("raises DuplicateApplyUrlError for a taken hash on insert and update", async () => {
      const a = await insert();
      const b = await insert();
      await expect(insert({ applyUrlHash: a.applyUrlHash })).rejects.toSatisfy(DuplicateApplyUrlError.is);
      await expect(repo().update({ ...b, applyUrlHash: a.applyUrlHash })).rejects.toSatisfy(DuplicateApplyUrlError.is);
    });

    it("update replaces fields and tags; saveSchedule changes only the schedule", async () => {
      const job = await insert({ tags: await tags() });
      await repo().update({ ...job, title: "Changed", tags: [] });
      expect(await repo().findById(job.id)).toMatchObject({ title: "Changed", tags: [] });
      const later = new Date("2030-01-01T00:00:00Z");
      await repo().saveSchedule({ ...job, title: "Ignored", status: "CLOSED", expiresAt: later, updatedAt: later });
      expect(await repo().findById(job.id)).toMatchObject({ title: "Changed", status: "CLOSED", expiresAt: later, updatedAt: later });
    });

    it("search pages, counts beyond the first page and applies criteria in SQL", async () => {
      for (let i = 0; i < 5; i++) await insert({ postedAt: new Date(Date.UTC(2026, 0, i + 1)) });
      const page = await repo().search({ status: "PUBLISHED" }, "postedDesc", { page: 1, size: 2 });
      expect(page.total).toBe(5);
      expect(page.items.map((j) => j.postedAt?.getUTCDate())).toEqual([3, 2]);
      expect((await repo().search({ status: "DRAFT" }, "postedDesc", { page: 0, size: 2 })).total).toBe(0);
    });

    it("closeExpired closes expired published jobs only; sitemap lists live ones", async () => {
      const now = new Date("2026-11-04T06:00:00Z");
      const expired = await insert({ expiresAt: new Date("2026-11-01T00:00:00Z") });
      await insert({ status: "DRAFT", expiresAt: new Date("2026-11-01T00:00:00Z") });
      const live = await insert({ expiresAt: new Date("2026-12-01T00:00:00Z") });
      expect((await repo().findSitemapRows(now)).map((r) => r.slug)).toEqual([live.slug]);
      expect(await repo().closeExpired(now)).toBe(1);
      expect((await repo().findById(expired.id))?.status).toBe("CLOSED");
      expect(await repo().closeExpired(now)).toBe(0);
    });
  });

  describe("PgJobFacetRepository", () => {
    it("counts published jobs by city, work mode, tag and lists experience ranges", async () => {
      const jobs = new PgJobRepository(ctx.db);
      const java = await new PgTagRepository(ctx.db).findBySlugs(["java"]);
      for (const [i, extra] of ([[1, { tags: java }], [2, { locationCity: "Pune", workMode: "REMOTE", experienceMaxYears: 5 }], [3, { status: "DRAFT" }]] as const).entries()) {
        const id = await jobs.nextId();
        await jobs.insert(jobRecord({ id, slug: `f-${id}`, applyUrlHash: `f-${i}`, ...extra[1] }));
      }
      const facets = new PgJobFacetRepository(ctx.db);
      expect(await facets.countByCity("PUBLISHED")).toEqual([{ city: "Hyderabad", count: 1 }, { city: "Pune", count: 1 }]);
      expect((await facets.countByWorkMode("PUBLISHED")).sort((a, b) => a.workMode.localeCompare(b.workMode))).toEqual([
        { workMode: "HYBRID", count: 1 }, { workMode: "REMOTE", count: 1 },
      ]);
      expect(await facets.countByTag("PUBLISHED")).toEqual([{ name: "Java", slug: "java", category: "LANGUAGE", count: 1 }]);
      expect((await facets.experienceRanges("PUBLISHED")).sort((a, b) => (a.max ?? 99) - (b.max ?? 99))).toEqual([{ min: 3, max: 5 }, { min: 3, max: null }]);
    });
  });

  describe("PgApiKeyRepository", () => {
    const repo = () => new PgApiKeyRepository(ctx.db);
    const key = (name: string, at: string) => ({
      name, keyPrefix: "fjk_000000", keyHash: `hash-${name}`, createdAt: new Date(at), lastUsedAt: null, revokedAt: null,
    });

    it("inserts, lists newest first and finds by id", async () => {
      const old = await repo().insert(key("old", "2026-01-01T00:00:00Z"));
      await repo().insert(key("new", "2026-02-01T00:00:00Z"));
      expect((await repo().findAllNewestFirst()).map((k) => k.name)).toEqual(["new", "old"]);
      expect(await repo().findById(old.id)).toEqual({ ...key("old", "2026-01-01T00:00:00Z"), id: old.id });
      expect(await repo().findById(999)).toBeNull();
    });

    it("touchActive records use of active keys only; markRevoked keeps the first time", async () => {
      const k = await repo().insert(key("k", "2026-01-01T00:00:00Z"));
      const used = new Date("2026-03-01T00:00:00Z");
      expect(await repo().touchActive("hash-k", used)).toBe(true);
      expect((await repo().findById(k.id))?.lastUsedAt).toEqual(used);
      const first = new Date("2026-04-01T00:00:00Z");
      await repo().markRevoked(k.id, first);
      await repo().markRevoked(k.id, new Date("2026-05-01T00:00:00Z"));
      expect((await repo().findById(k.id))?.revokedAt).toEqual(first);
      expect(await repo().touchActive("hash-k", used)).toBe(false);
      expect(await repo().touchActive("missing", used)).toBe(false);
    });
  });
  describe("PgPostintimeSettingsRepository", () => {
    const repo = () => new PgPostintimeSettingsRepository(ctx.db);
    const connection = { enabled: true, baseUrl: "https://pit.example.com", apiToken: "pit_x", channelId: "c1", postStatus: "ready" as const, postSuffix: "#jobs\n#hiring" };

    it("returns the defaults before anything was saved", async () => {
      expect(await repo().get()).toEqual(DEFAULT_SETTINGS);
    });

    it("saves over the same row and keeps the last result", async () => {
      const at = new Date("2026-03-01T00:00:00Z");
      await repo().save({ ...connection, enabled: false }, at);
      await repo().recordResult("Posted job 7", at);
      await repo().save(connection, new Date("2026-03-02T00:00:00Z"));
      expect(await repo().get()).toEqual({ ...connection, lastResult: "Posted job 7", lastAttemptAt: at });
      expect((await ctx.db.query("SELECT 1 FROM postintime_settings")).rowCount).toBe(1);
    });

    it("records a result before any settings exist", async () => {
      const at = new Date("2026-03-01T00:00:00Z");
      await repo().recordResult("Failed", at);
      expect(await repo().get()).toEqual({ ...DEFAULT_SETTINGS, lastResult: "Failed", lastAttemptAt: at });
    });
  });
});
