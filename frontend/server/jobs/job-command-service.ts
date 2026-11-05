import type { JobDetail, JobStatus } from "@/lib/api/contract";
import type { JobSettings } from "@/server/config/app-config";
import type { UnitOfWork } from "@/server/db/unit-of-work";
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
  if (slugs === null || slugs.length === 0) return [];
  const wanted = [...new Set(slugs.map(javaTrim).filter((s) => s !== ""))];
  const found = await tags.findBySlugs(wanted);
  if (found.length !== wanted.length) {
    const have = new Set(found.map((t) => t.slug));
    const missing = wanted.filter((s) => !have.has(s));
    // The message mirrors Java's Set.toString(), the field error a plain list.
    throw new ApiException(400, "VALIDATION_FAILED", `Unknown tag(s): [${missing.join(", ")}]`, {
      tags: `Unknown tag(s): ${missing.join(", ")}`,
    });
  }
  return found;
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
  ) {}

  /**
   * Creates a job. The status defaults to PUBLISHED; a published job is posted now and expires after
   * the default period unless the request says otherwise. The slug is built from title, company, city
   * and the new id.
   *
   * @throws ApiException 400 for invalid input or unknown tags, 409 for a duplicate apply URL.
   */
  async create(request: JobRequest): Promise<JobDetail> {
    // async, so a validation error becomes a rejected promise rather than a synchronous throw.
    validateJobRequest(request);
    const hash = hashApplyUrl(request.applyUrl);
    return this.uow.write(async ({ jobs, tags }) => {
      await this.assertNotDuplicate(jobs, hash, null);
      const now = this.clock.now();
      const fields = requestFields(request, await resolveTags(tags, request.tags));
      const schedule = initialSchedule(
        request.status ?? "PUBLISHED", request.postedAt, request.expiresAt, now, this.settings.defaultExpiryDays,
      );
      const id = await jobs.nextId();
      const job: JobRecord = {
        id,
        slug: generateSlug(fields.title, fields.companyName, fields.locationCity, id),
        applyUrlHash: hash,
        ...fields,
        ...schedule,
        createdAt: now,
        updatedAt: now,
      };
      await this.save(() => jobs.insert(job));
      return toJobDetail(job);
    });
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
   * @throws ApiException 404 for an unknown id.
   */
  setStatus(id: number, status: JobStatus): Promise<JobDetail> {
    return this.uow.write(async ({ jobs }) => {
      const job = await this.find(jobs, id);
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
