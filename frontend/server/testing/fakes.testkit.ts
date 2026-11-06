import type { ApiKeyRecord } from "@/server/api-keys/api-key-record";
import { ApiKeyService, type ApiKeyRepository } from "@/server/api-keys/api-key-service";
import { RequestAuthenticator } from "@/server/auth/request-authenticator";
import { loadConfig } from "@/server/config/app-config";
import type { Services } from "@/server/container";
import type { Database } from "@/server/db/database";
import type { UnitOfWork } from "@/server/db/unit-of-work";
import { RouteFactory } from "@/server/http/routes";
import { FilterService, type JobFacetRepository } from "@/server/jobs/filter-service";
import { JobCleanupService } from "@/server/jobs/job-cleanup-service";
import { JobCreationQueue } from "@/server/jobs/job-creation-queue";
import { JobCommandService } from "@/server/jobs/job-command-service";
import { JobQueryService } from "@/server/jobs/job-query-service";
import { TagCatalogService, TagDetectionService } from "@/server/tags/tag-services";
import type { JobCriteria, JobSort } from "@/server/jobs/job-query";
import type { JobRecord } from "@/server/jobs/job-record";
import { DuplicateApplyUrlError, type JobRepository, type SitemapRow } from "@/server/jobs/job-repository";
import { offsetOf, type PageRequest } from "@/server/jobs/paging";
import type { JobRequest } from "@/server/requests/job-request";
import type { Clock } from "@/server/shared/clock";
import type { Logger } from "@/server/shared/logger";
import { InMemoryQueueStore } from "@/server/queue/memory-queue-store";
import { PostintimeQueue } from "@/server/postintime/postintime-queue";
import { PostintimePublisher } from "@/server/postintime/postintime-publisher";
import { DEFAULT_SETTINGS, PostintimeSettingsService, type PostintimeSettings, type PostintimeSettingsRepository } from "@/server/postintime/settings";
import type { TagRecord } from "@/server/tags/tag-record";
import type { TagRepository } from "@/server/tags/tag-repository";

/**
 * Test doubles shared by the service unit tests. They keep data in memory and record calls, so the
 * services' rules can be tested without PostgreSQL. The real SQL is covered by the database tests.
 */

/** A clock that tests can move forward. */
export class MutableClock implements Clock {
  constructor(private current = new Date("2026-11-04T06:00:00.000Z")) {}
  now(): Date {
    return new Date(this.current.getTime());
  }
  advanceMs(ms: number): void {
    this.current = new Date(this.current.getTime() + ms);
  }
  advanceDays(days: number): void {
    this.advanceMs(days * 24 * 60 * 60 * 1000);
  }
  set(date: Date): void {
    this.current = new Date(date.getTime());
  }
}

/** A logger that keeps messages for assertions. */
export class MemoryLogger implements Logger {
  readonly infos: string[] = [];
  readonly errors: Array<{ message: string; error: unknown }> = [];
  info(message: string): void {
    this.infos.push(message);
  }
  error(message: string, error?: unknown): void {
    this.errors.push({ message, error });
  }
}

/** A unit of work that hands out the same repositories for reads and writes and counts the calls. */
export function fakeUnitOfWork<R>(repos: R): UnitOfWork<R> & { reads: number; writes: number } {
  const uow = {
    reads: 0,
    writes: 0,
    read<T>(work: (r: R) => Promise<T>) {
      uow.reads++;
      return work(repos);
    },
    write<T>(work: (r: R) => Promise<T>) {
      uow.writes++;
      return work(repos);
    },
  };
  return uow;
}

export const JAVA: TagRecord = { id: 1, name: "Java", slug: "java", category: "LANGUAGE" };
export const KAFKA: TagRecord = { id: 2, name: "Kafka", slug: "kafka", category: "TOOL" };
export const AWS: TagRecord = { id: 3, name: "AWS", slug: "aws", category: "CLOUD" };

/** Tag repository over a fixed list. */
export class InMemoryTagRepository implements TagRepository {
  constructor(private readonly tags: TagRecord[] = [JAVA, KAFKA, AWS]) {}
  async findAllOrderedByName() {
    return [...this.tags].sort((a, b) => a.name.localeCompare(b.name));
  }
  async findAll() {
    return this.tags;
  }
  async findBySlugs(slugs: readonly string[]) {
    return this.tags.filter((t) => slugs.includes(t.slug));
  }
  async findAllAliases() {
    return [];
  }
}

/**
 * Job repository over an array. `search` does not evaluate criteria (that is SQL's job and is tested
 * against PostgreSQL); it records them and pages through every stored job.
 */
export class InMemoryJobRepository implements JobRepository {
  readonly jobs: JobRecord[] = [];
  readonly searches: Array<{ criteria: JobCriteria; sort: JobSort; page: PageRequest }> = [];
  private sequence = 0;

  async search(criteria: JobCriteria, sort: JobSort, page: PageRequest) {
    this.searches.push({ criteria, sort, page });
    const start = offsetOf(page);
    return { items: this.jobs.slice(start, start + page.size), total: this.jobs.length };
  }
  async findById(id: number) {
    return this.jobs.find((j) => j.id === id) ?? null;
  }
  async findBySlug(slug: string) {
    return this.jobs.find((j) => j.slug === slug) ?? null;
  }
  async findByApplyUrlHash(hash: string) {
    return this.jobs.find((j) => j.applyUrlHash === hash) ?? null;
  }
  async nextId() {
    return ++this.sequence;
  }
  async insert(job: JobRecord) {
    if (this.jobs.some((j) => j.applyUrlHash === job.applyUrlHash)) throw new DuplicateApplyUrlError();
    this.jobs.push(job);
  }
  async update(job: JobRecord) {
    if (this.jobs.some((j) => j.id !== job.id && j.applyUrlHash === job.applyUrlHash)) throw new DuplicateApplyUrlError();
    this.jobs[this.jobs.findIndex((j) => j.id === job.id)] = job;
  }
  async saveSchedule(job: JobRecord) {
    const i = this.jobs.findIndex((j) => j.id === job.id);
    this.jobs[i] = { ...this.jobs[i], status: job.status, postedAt: job.postedAt, expiresAt: job.expiresAt, updatedAt: job.updatedAt };
  }
  async markPostintimePosted(id: number, at: Date, postId: string | null) {
    const i = this.jobs.findIndex((j) => j.id === id);
    if (i >= 0) this.jobs[i] = { ...this.jobs[i], postintimePostedAt: at, postintimePostId: postId };
  }
  async closeExpired(now: Date) {
    let n = 0;
    for (const j of this.jobs) {
      if (j.status === "PUBLISHED" && j.expiresAt && j.expiresAt < now) {
        j.status = "CLOSED";
        j.updatedAt = now;
        n++;
      }
    }
    return n;
  }
  async findSitemapRows(now: Date): Promise<SitemapRow[]> {
    return this.jobs
      .filter((j) => j.status === "PUBLISHED" && j.expiresAt && j.expiresAt > now)
      .map((j) => ({ slug: j.slug, updatedAt: j.updatedAt }));
  }
}

/** API key repository over an array. */
export class InMemoryApiKeyRepository implements ApiKeyRepository {
  readonly keys: ApiKeyRecord[] = [];
  async insert(key: Omit<ApiKeyRecord, "id">) {
    const saved = { ...key, id: this.keys.length + 1 };
    this.keys.push(saved);
    return saved;
  }
  async findAllNewestFirst() {
    return [...this.keys].sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  }
  async findById(id: number) {
    return this.keys.find((k) => k.id === id) ?? null;
  }
  async markRevoked(id: number, at: Date) {
    const k = this.keys.find((x) => x.id === id);
    if (k && k.revokedAt === null) k.revokedAt = at;
  }
  async touchActive(hash: string, at: Date) {
    const k = this.keys.find((x) => x.keyHash === hash && x.revokedAt === null);
    if (k) k.lastUsedAt = at;
    return k !== undefined;
  }
}

/** PostInTime settings in memory. */
export class InMemoryPostintimeSettingsRepository implements PostintimeSettingsRepository {
  settings: PostintimeSettings = { ...DEFAULT_SETTINGS };
  async get() {
    return { ...this.settings };
  }
  async save(s: Parameters<PostintimeSettingsRepository["save"]>[0]) {
    this.settings = { ...this.settings, ...s };
  }
  async recordResult(result: string, at: Date) {
    this.settings = { ...this.settings, lastResult: result, lastAttemptAt: at };
  }
}

/** Every repository behind `fakeServices`, so tests can seed data and inspect writes. */
export interface FakeStores {
  jobs: InMemoryJobRepository;
  tags: InMemoryTagRepository;
  apiKeys: InMemoryApiKeyRepository;
  postintime: InMemoryPostintimeSettingsRepository;
  facets: JobFacetRepository;
}

/**
 * The application's services wired to in-memory repositories: the same wiring as `createServices`,
 * minus PostgreSQL. Used to unit test endpoints and the page data functions without a database.
 */
export function fakeServices(): { services: Services; stores: FakeStores } {
  const config = loadConfig({ ADMIN_TOKEN: "test-admin", CLEANUP_SECRET: "test-secret" });
  const clock = new MutableClock();
  const logger = new MemoryLogger();
  const stores: FakeStores = {
    jobs: new InMemoryJobRepository(),
    tags: new InMemoryTagRepository(),
    apiKeys: new InMemoryApiKeyRepository(),
    postintime: new InMemoryPostintimeSettingsRepository(),
    facets: {
      countByCity: async () => [],
      countByWorkMode: async () => [],
      countByTag: async () => [],
      experienceRanges: async () => [],
    },
  };
  const db: Database = {
    query: () => Promise.reject(new Error("no database in unit tests")),
    transaction: () => Promise.reject(new Error("no database in unit tests")),
    close: async () => undefined,
  };
  const apiKeys = new ApiKeyService(fakeUnitOfWork({ apiKeys: stores.apiKeys }), clock);
  const authenticator = new RequestAuthenticator({ adminToken: config.adminToken, internalSecret: config.internalSecret }, apiKeys);
  const jobsUow = fakeUnitOfWork({ jobs: stores.jobs, tags: stores.tags });
  const postintimeSettings = new PostintimeSettingsService(fakeUnitOfWork({ settings: stores.postintime }), clock);
  const jobCommands = new JobCommandService(jobsUow, clock, config.jobs);
  const postintime = new PostintimePublisher(
    postintimeSettings, async () => ({ bytes: new Uint8Array(), contentType: "image/png" }), logger, undefined, undefined,
    { recordPosted: (jobId, postId, at) => stores.jobs.markPostintimePosted(jobId, at, postId) },
  );
  const queueStore = new InMemoryQueueStore();
  const jobQueries = new JobQueryService(jobsUow, clock, config.jobs);
  const services: Services = {
    config, db, clock, logger,
    schema: { ready: async () => undefined },
    jobQueries,
    jobCommands,
    jobCreationQueue: new JobCreationQueue(jobCommands, queueStore, logger),
    jobCleanup: new JobCleanupService(jobsUow, clock, logger),
    filters: new FilterService(fakeUnitOfWork({ facets: stores.facets })),
    tagCatalog: new TagCatalogService(stores.tags),
    tagDetection: new TagDetectionService(stores.tags, clock),
    apiKeys,
    postintimeSettings,
    postintime,
    postintimeQueue: new PostintimeQueue(postintime, (id) => jobQueries.getAdmin(id), queueStore, logger),
    authenticator,
    routes: new RouteFactory(authenticator, logger),
  };
  return { services, stores };
}

/** Installs `services` as the process wide services that `getServices()` returns. Returns an undo function. */
export function installServices(services: Services): () => void {
  const holder = globalThis as typeof globalThis & { __fastorialServices?: Services };
  const previous = holder.__fastorialServices;
  holder.__fastorialServices = services;
  return () => {
    holder.__fastorialServices = previous;
  };
}

/** A valid job request; override fields with `extra`. */
export function jobRequest(extra: Partial<JobRequest> = {}): JobRequest {
  return {
    title: "Senior Java Engineer",
    companyName: "Acme",
    companyLogoUrl: null,
    description: "A role.",
    applyUrl: "https://example.com/jobs/1",
    source: "OTHER",
    locationCity: "Hyderabad",
    locationState: null,
    locationCountry: null,
    workMode: "HYBRID",
    experienceMinYears: 3,
    experienceMaxYears: null,
    salaryMin: null,
    salaryMax: null,
    salaryCurrency: null,
    salaryPeriod: null,
    status: null,
    postedAt: null,
    expiresAt: null,
    tags: [],
    ...extra,
  };
}

/** A stored job; override fields with `extra`. */
export function jobRecord(extra: Partial<JobRecord> = {}): JobRecord {
  const now = new Date("2026-11-04T06:00:00.000Z");
  return {
    id: 1,
    slug: "senior-java-engineer-acme-hyderabad-1",
    title: "Senior Java Engineer",
    companyName: "Acme",
    companyLogoUrl: null,
    description: "A role.",
    applyUrl: "https://example.com/jobs/1",
    applyUrlHash: "hash-1",
    source: "OTHER",
    locationCity: "Hyderabad",
    locationState: null,
    locationCountry: null,
    workMode: "HYBRID",
    experienceMinYears: 3,
    experienceMaxYears: null,
    salaryMin: null,
    salaryMax: null,
    salaryCurrency: null,
    salaryPeriod: null,
    status: "PUBLISHED",
    postedAt: now,
    expiresAt: new Date(now.getTime() + 30 * 86_400_000),
    postintimePostedAt: null,
    postintimePostId: null,
    createdAt: now,
    updatedAt: now,
    tags: [],
    ...extra,
  };
}
