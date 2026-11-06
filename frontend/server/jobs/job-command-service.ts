import { TAG_CATEGORIES, type JobDetail, type JobStatus, type TagCategory } from "@/lib/api/contract";
import type { JobSettings } from "@/server/config/app-config";
import type { UnitOfWork } from "@/server/db/unit-of-work";
import type { EventPublisher } from "@/server/events/event-bus";
import { changeStatus, extendedExpiry, initialSchedule } from "@/server/jobs/job-lifecycle";
import { toJobDetail } from "@/server/jobs/job-mapper";
import type { JobRecord } from "@/server/jobs/job-record";
import { DuplicateApplyUrlError, type JobRepository } from "@/server/jobs/job-repository";
import { validateJobRequest } from "@/server/jobs/job-request-validator";
import { generateSlug } from "@/server/jobs/slug-generator";
import type { JobRequest } from "@/server/requests/job-request";
import { ApiException } from "@/server/shared/api-exception";
import type { Clock } from "@/server/shared/clock";
import { isJavaBlank, javaTrim } from "@/server/shared/java-text";
import type { TagRecord } from "@/server/tags/tag-record";
import type { TagRepository } from "@/server/tags/tag-repository";
import { hashApplyUrl } from "@/server/url/url-hasher";

/** Repositories the write side needs inside one transaction. */
export interface JobStores {
  jobs: JobRepository;
  tags: TagRepository;
}

/** The job fields that come straight from a request (everything except id, slug, hash and lifecycle). */
export type RequestFields = Pick<
  JobRecord,
  | "title" | "companyName" | "companyLogoUrl" | "description" | "applyUrl" | "source" | "locationCity"
  | "locationState" | "locationCountry" | "workMode" | "experienceMinYears" | "experienceMaxYears"
  | "salaryMin" | "salaryMax" | "salaryCurrency" | "salaryPeriod" | "tags"
>;

/** Java's `blankToNull`: null for null or blank text, the Java-trimmed text otherwise. */
export function blankToNull(s: string | null): string | null {
  return s === null || isJavaBlank(s) ? null : javaTrim(s);
}

/**
 * Normalizes request values into stored fields (the former `copyFields`): trims names and URLs, turns
 * blank optional text into null, stores an empty description as "", and keeps currency and period
 * only when there is a salary, upper-casing the currency.
 */
export function requestFields(r: JobRequest, tags: TagRecord[]): RequestFields {
  const anySalary = r.salaryMin !== null;
  return {
    title: javaTrim(r.title),
    companyName: javaTrim(r.companyName),
    companyLogoUrl: blankToNull(r.companyLogoUrl),
    description: r.description ?? "",
    applyUrl: javaTrim(r.applyUrl),
    source: r.source,
    locationCity: blankToNull(r.locationCity),
    locationState: blankToNull(r.locationState),
    locationCountry: blankToNull(r.locationCountry),
    workMode: r.workMode,
    experienceMinYears: r.experienceMinYears,
    experienceMaxYears: r.experienceMaxYears,
    salaryMin: r.salaryMin,
    salaryMax: r.salaryMax,
    salaryCurrency: anySalary && r.salaryCurrency !== null ? r.salaryCurrency.toUpperCase() : null,
    salaryPeriod: anySalary ? r.salaryPeriod : null,
    tags,
  };
}

/** The 409 for an apply URL that is already used by another job. */
function duplicateApplyUrl(existing?: JobRecord): ApiException {
  if (!existing) return new ApiException(409, "DUPLICATE_APPLY_URL", "A job with this apply URL already exists");
  return new ApiException(
    409,
    "DUPLICATE_APPLY_URL",
    `A job with this apply URL already exists: ${existing.title} at ${existing.companyName} (id ${existing.id})`,
    { applyUrl: `Already posted as job ${existing.id}` },
  );
}

/**
 * Resolves tag slugs to tags (the former `resolveTags`). Slugs are trimmed and de-duplicated; empty ones
 * are ignored.
 *
 * @throws ApiException `400 VALIDATION_FAILED` naming every unknown slug.
 */
export async function resolveTags(tags: TagRepository, slugs: readonly string[] | null): Promise<TagRecord[]> {
  const { found, unknown } = await partitionTags(tags, slugs);
  if (unknown.length > 0) {
    const missing = unknown;
    // The message mirrors Java's Set.toString(), the field error a plain list.
    throw new ApiException(400, "VALIDATION_FAILED", `Unknown tag(s): [${missing.join(", ")}]`, {
      tags: `Unknown tag(s): ${missing.join(", ")}`,
    });
  }
  return found;
}

/**
 * Splits tag slugs into the tags that exist and the slugs that do not. Slugs are trimmed and
 * de-duplicated; empty ones are ignored.
 */
export async function partitionTags(
  tags: TagRepository,
  slugs: readonly string[] | null,
): Promise<{ found: TagRecord[]; unknown: string[] }> {
  if (slugs === null || slugs.length === 0) return { found: [], unknown: [] };
  const wanted = [...new Set(slugs.map(javaTrim).filter((s) => s !== ""))];
  const found = await tags.findBySlugs(wanted);
  const have = new Set(found.map((t) => t.slug));
  return { found, unknown: wanted.filter((s) => !have.has(s)) };
}

/** The 409 for publishing a job that still has tags waiting for approval. */
function pendingTagsBlockPublishing(job: Pick<JobRecord, "pendingTags">): ApiException {
  return new ApiException(
    409,
    "TAG_APPROVAL_NEEDED",
    `Approve or skip these tags before publishing: ${job.pendingTags.join(", ")}`,
    { tags: `Tag approval needed: ${job.pendingTags.join(", ")}` },
  );
}

/**
 * Write side of jobs for the admin UI and automations: create, replace, change status, extend.
 * Every operation runs in one transaction.
 */
export class JobCommandService {
  constructor(
    private readonly uow: UnitOfWork<JobStores>,
    private readonly clock: Clock,
    private readonly settings: JobSettings,
    private readonly events?: EventPublisher,
  ) {}

  /**
   * Creates a job. The status defaults to PUBLISHED; a published job is posted now and expires after
   * the default period unless the request says otherwise. The slug is built from title, company, city
   * and the new id.
   *
   * Tag slugs that are not in the vocabulary do not fail the request: the job is accepted but stored
   * as a DRAFT with those slugs in `pendingTags` ("Tag approval needed"), whatever status was asked.
   *
   * @throws ApiException 400 for invalid input, 409 for a duplicate apply URL.
   */
  async create(request: JobRequest): Promise<JobDetail> {
    // async, so a validation error becomes a rejected promise rather than a synchronous throw.
    validateJobRequest(request);
    const hash = hashApplyUrl(request.applyUrl);
    const created = await this.uow.write(async ({ jobs, tags }) => {
      await this.assertNotDuplicate(jobs, hash, null);
      const now = this.clock.now();
      const { found, unknown } = await partitionTags(tags, request.tags);
      const fields = requestFields(request, found);
      const schedule = initialSchedule(
        unknown.length > 0 ? "DRAFT" : (request.status ?? "PUBLISHED"), request.postedAt, request.expiresAt, now, this.settings.defaultExpiryDays,
      );
      const id = await jobs.nextId();
      const job: JobRecord = {
        id,
        slug: generateSlug(fields.title, fields.companyName, fields.locationCity, id),
        applyUrlHash: hash,
        ...fields,
        ...schedule,
        postintimePostedAt: null,
        postintimePostId: null,
        createdAt: now,
        updatedAt: now,
        pendingTags: unknown,
      };
      await this.save(() => jobs.insert(job));
      return toJobDetail(job);
    });
    // Only after the commit, so a listener never sees a job that was rolled back.
    this.events?.publish({ type: "JobPostCreated", job: created, occurredAt: this.clock.now() });
    return created;
  }

  /**
   * Replaces a job's fields. The slug never changes, so shared links keep working. A status in the
   * request is applied with the same rules as `setStatus`; posted and expiry dates in the request win.
   *
   * @throws ApiException 400 for invalid input, 404 for an unknown id, 409 for a duplicate apply URL.
   */
  async update(id: number, request: JobRequest): Promise<JobDetail> {
    validateJobRequest(request);
    return this.uow.write(async ({ jobs, tags }) => {
      const job = await this.find(jobs, id);
      const hash = hashApplyUrl(request.applyUrl);
      await this.assertNotDuplicate(jobs, hash, job.id);
      const now = this.clock.now();
      const fields = requestFields(request, await resolveTags(tags, request.tags));
      let schedule = { status: job.status, postedAt: job.postedAt, expiresAt: job.expiresAt };
      if (request.status !== null) schedule = changeStatus(schedule, request.status, now, this.settings.defaultExpiryDays);
      if (schedule.status === "PUBLISHED" && job.status !== "PUBLISHED" && job.pendingTags.length > 0) {
        throw pendingTagsBlockPublishing(job);
      }
      if (request.postedAt !== null) schedule.postedAt = request.postedAt;
      if (request.expiresAt !== null) schedule.expiresAt = request.expiresAt;
      const updated: JobRecord = { ...job, ...fields, applyUrlHash: hash, ...schedule, updatedAt: now };
      await this.save(() => jobs.update(updated));
      return toJobDetail(updated);
    });
  }

  /**
   * Changes the status (publish, close, back to draft). See `changeStatus` for the date rules.
   *
   * @throws ApiException 404 for an unknown id, 409 TAG_APPROVAL_NEEDED when publishing a job whose
   *   pending tags were not approved or skipped yet.
   */
  setStatus(id: number, status: JobStatus): Promise<JobDetail> {
    return this.uow.write(async ({ jobs }) => {
      const job = await this.find(jobs, id);
      if (status === "PUBLISHED" && job.pendingTags.length > 0) throw pendingTagsBlockPublishing(job);
      const now = this.clock.now();
      const updated: JobRecord = { ...job, ...changeStatus(job, status, now, this.settings.defaultExpiryDays), updatedAt: now };
      await jobs.saveSchedule(updated);
      return toJobDetail(updated);
    });
  }

  /**
   * Pushes the expiry forward by `days` (default 30) and publishes the job, so it also reopens a
   * closed job. See `extendedExpiry` for how the new expiry is computed.
   *
   * @throws ApiException 404 for an unknown id, 409 INVALID_STATE for a draft.
   */
  extend(id: number, days: number | null): Promise<JobDetail> {
    return this.uow.write(async ({ jobs }) => {
      const job = await this.find(jobs, id);
      if (job.status === "DRAFT") {
        throw new ApiException(409, "INVALID_STATE", "Publish the draft instead of extending it");
      }
      const now = this.clock.now();
      const updated: JobRecord = {
        ...job,
        expiresAt: extendedExpiry(job.expiresAt, now, days ?? this.settings.defaultExpiryDays),
        status: "PUBLISHED",
        updatedAt: now,
      };
      await jobs.saveSchedule(updated);
      return toJobDetail(updated);
    });
  }

  /**
   * Approves one pending tag: adds it to the tag vocabulary (unless a tag with that slug already
   * exists), attaches it to the job and removes it from the pending list. The job stays a draft; the
   * admin publishes it once every pending tag is approved or skipped.
   *
   * @throws ApiException 400 for an invalid name or category, 404 for an unknown job, 409 when the slug
   *   is not pending for this job or another tag already has that name.
   */
  async approvePendingTag(id: number, slug: string, name: string, category: string): Promise<JobDetail> {
    const cleanName = javaTrim(name);
    if (cleanName === "" || cleanName.length > 60) {
      throw new ApiException(400, "VALIDATION_FAILED", "Tag name must be 1 to 60 characters", { name: "Tag name must be 1 to 60 characters" });
    }
    if (!(TAG_CATEGORIES as readonly string[]).includes(category)) {
      throw new ApiException(400, "VALIDATION_FAILED", "Unknown tag category", { category: "Unknown tag category" });
    }
    return this.uow.write(async ({ jobs, tags }) => {
      const job = await this.findWithPending(jobs, id, slug);
      const tag = (await tags.findBySlugs([slug]))[0] ?? (await tags.insert(cleanName, slug, category as TagCategory));
      if (tag === null) {
        throw new ApiException(409, "CONFLICT", `A tag named ${cleanName} already exists`, { name: "Tag name already in use" });
      }
      const updated: JobRecord = {
        ...job,
        tags: job.tags.some((t) => t.id === tag.id) ? job.tags : [...job.tags, tag],
        pendingTags: job.pendingTags.filter((s) => s !== slug),
        updatedAt: this.clock.now(),
      };
      await jobs.update(updated);
      return toJobDetail(updated);
    });
  }

  /**
   * Skips one pending tag: drops it from the pending list without creating it. The job keeps its other tags.
   *
   * @throws ApiException 404 for an unknown job, 409 when the slug is not pending for this job.
   */
  skipPendingTag(id: number, slug: string): Promise<JobDetail> {
    return this.uow.write(async ({ jobs }) => {
      const job = await this.findWithPending(jobs, id, slug);
      const updated: JobRecord = { ...job, pendingTags: job.pendingTags.filter((s) => s !== slug), updatedAt: this.clock.now() };
      await jobs.update(updated);
      return toJobDetail(updated);
    });
  }

  private async findWithPending(jobs: JobRepository, id: number, slug: string): Promise<JobRecord> {
    const job = await this.find(jobs, id);
    if (!job.pendingTags.includes(slug)) {
      throw new ApiException(409, "INVALID_STATE", `Tag ${slug} is not waiting for approval on this job`);
    }
    return job;
  }

  private async find(jobs: JobRepository, id: number): Promise<JobRecord> {
    const job = await jobs.findById(id);
    if (!job) throw ApiException.notFound("Job not found");
    return job;
  }

  /** Rejects an apply URL already used by another job, naming that job so the admin can find it. */
  private async assertNotDuplicate(jobs: JobRepository, hash: string, selfId: number | null): Promise<void> {
    const existing = await jobs.findByApplyUrlHash(hash);
    if (existing && existing.id !== selfId) throw duplicateApplyUrl(existing);
  }

  /**
   * Runs a write, turning the unique index violation into a 409. The check in `assertNotDuplicate`
   * covers the normal case; this covers two requests racing with the same URL.
   */
  private async save(write: () => Promise<void>): Promise<void> {
    try {
      await write();
    } catch (error) {
      if (DuplicateApplyUrlError.is(error)) throw duplicateApplyUrl();
      throw error;
    }
  }
}
