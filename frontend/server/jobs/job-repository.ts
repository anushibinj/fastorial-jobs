import type { JobSource, JobStatus, SalaryPeriod, TagCategory, WorkMode } from "@/lib/api/contract";
import type { SqlExecutor } from "@/server/db/database";
import { buildJobFilter, ORDER_BY, type JobCriteria, type JobSort } from "@/server/jobs/job-query";
import type { JobRecord } from "@/server/jobs/job-record";
import { offsetOf, resolveTotal, type PageRequest } from "@/server/jobs/paging";
import { errorBrand } from "@/server/shared/error-brand";
import { toTagRecord } from "@/server/tags/tag-repository";
import type { TagRecord } from "@/server/tags/tag-record";

const DUPLICATE_BRAND = errorBrand("DuplicateApplyUrlError");

/** Raised when an insert or update would give two jobs the same normalized apply URL. */
export class DuplicateApplyUrlError extends Error {
  constructor() {
    super("A job with this apply URL already exists");
    this.name = "DuplicateApplyUrlError";
    DUPLICATE_BRAND.mark(this);
  }

  /** Type check that works across module copies (see `error-brand.ts`); use instead of `instanceof`. */
  static is(value: unknown): value is DuplicateApplyUrlError {
    return DUPLICATE_BRAND.has(value);
  }
}

/** A slug and its last update, for `sitemap.xml`. */
export interface SitemapRow {
  slug: string;
  updatedAt: Date;
}

/** Persistence of jobs and their tags. */
export interface JobRepository {
  /** One page of jobs matching `criteria`, and the total number of matches. */
  search(criteria: JobCriteria, sort: JobSort, page: PageRequest): Promise<{ items: JobRecord[]; total: number }>;
  findById(id: number): Promise<JobRecord | null>;
  findBySlug(slug: string): Promise<JobRecord | null>;
  findByApplyUrlHash(hash: string): Promise<JobRecord | null>;
  /** Reserves the next id, so the slug (which ends with the id) can be written in the same insert. */
  nextId(): Promise<number>;
  /** @throws DuplicateApplyUrlError when the apply URL hash is taken. */
  insert(job: JobRecord): Promise<void>;
  /** Updates every mutable column (pending tags included) and replaces the tags. @throws DuplicateApplyUrlError */
  update(job: JobRecord): Promise<void>;
  /** Updates only status, posted date, expiry and update time (status changes and extensions). */
  saveSchedule(job: JobRecord): Promise<void>;
  /** Remembers that the job was pushed to PostInTime at `at`, with the post id it got (if any). */
  markPostintimePosted(id: number, at: Date, postId: string | null): Promise<void>;
  /** Closes every published job whose expiry is before `now`. Returns how many changed. */
  closeExpired(now: Date): Promise<number>;
  /** Published jobs whose expiry is after `now`, most recently updated first. */
  findSitemapRows(now: Date): Promise<SitemapRow[]>;
}

/** Columns of `jobs` selected everywhere, in snake case as stored. */
const JOB_COLUMNS = `j.id, j.slug, j.title, j.company_name, j.company_logo_url, j.description, j.apply_url,
  j.apply_url_hash, j.source, j.location_city, j.location_state, j.location_country, j.work_mode,
  j.experience_min_years, j.experience_max_years, j.salary_min, j.salary_max, j.salary_currency,
  j.salary_period, j.status, j.posted_at, j.expires_at, j.postintime_posted_at, j.postintime_post_id, j.created_at,
  j.updated_at, j.pending_tags`;

interface JobRow {
  id: number;
  slug: string;
  title: string;
  company_name: string;
  company_logo_url: string | null;
  description: string;
  apply_url: string;
  apply_url_hash: string;
  source: JobSource;
  location_city: string | null;
  location_state: string | null;
  location_country: string | null;
  work_mode: WorkMode;
  experience_min_years: number;
  experience_max_years: number | null;
  salary_min: number | null;
  salary_max: number | null;
  salary_currency: string | null;
  salary_period: SalaryPeriod | null;
  status: JobStatus;
  posted_at: Date | null;
  expires_at: Date | null;
  postintime_posted_at: Date | null;
  postintime_post_id: string | null;
  created_at: Date;
  updated_at: Date;
  pending_tags: string[];
}

/** Maps a `jobs` row plus its tags to a record. */
export function toJobRecord(row: JobRow, tags: TagRecord[]): JobRecord {
  return {
    id: row.id,
    slug: row.slug,
    title: row.title,
    companyName: row.company_name,
    companyLogoUrl: row.company_logo_url,
    description: row.description,
    applyUrl: row.apply_url,
    applyUrlHash: row.apply_url_hash,
    source: row.source,
    locationCity: row.location_city,
    locationState: row.location_state,
    locationCountry: row.location_country,
    workMode: row.work_mode,
    experienceMinYears: row.experience_min_years,
    experienceMaxYears: row.experience_max_years,
    salaryMin: row.salary_min,
    salaryMax: row.salary_max,
    salaryCurrency: row.salary_currency,
    salaryPeriod: row.salary_period,
    status: row.status,
    postedAt: row.posted_at,
    expiresAt: row.expires_at,
    postintimePostedAt: row.postintime_posted_at,
    postintimePostId: row.postintime_post_id,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    tags,
    pendingTags: row.pending_tags ?? [],
  };
}

/** True for PostgreSQL's unique violation on the apply URL hash. */
function isDuplicateApplyUrl(error: unknown): boolean {
  const e = error as { code?: string; constraint?: string };
  return e?.code === "23505" && e.constraint === "jobs_apply_url_hash_key";
}

/** `JobRepository` over PostgreSQL. */
export class PgJobRepository implements JobRepository {
  constructor(private readonly db: SqlExecutor) {}

  async search(criteria: JobCriteria, sort: JobSort, page: PageRequest): Promise<{ items: JobRecord[]; total: number }> {
    const filter = buildJobFilter(criteria);
    const n = filter.params.length;
    const { rows } = await this.db.query<JobRow>(
      `SELECT ${JOB_COLUMNS} FROM jobs j WHERE ${filter.where} ORDER BY ${ORDER_BY[sort]} LIMIT $${n + 1} OFFSET $${n + 2}`,
      [...filter.params, page.size, offsetOf(page)],
    );
    const items = await this.withTags(rows);
    const total = await resolveTotal(page, items.length, async () => {
      const count = await this.db.query<{ count: number }>(`SELECT count(*) AS count FROM jobs j WHERE ${filter.where}`, filter.params);
      return count.rows[0].count;
    });
    return { items, total };
  }

  findById(id: number): Promise<JobRecord | null> {
    return this.findOne("j.id = $1", id);
  }

  findBySlug(slug: string): Promise<JobRecord | null> {
    return this.findOne("j.slug = $1", slug);
  }

  findByApplyUrlHash(hash: string): Promise<JobRecord | null> {
    return this.findOne("j.apply_url_hash = $1", hash);
  }

  async nextId(): Promise<number> {
    // Works for identity columns too; the value is consumed even if the insert later fails, like Hibernate's.
    const { rows } = await this.db.query<{ id: number }>("SELECT nextval(pg_get_serial_sequence('jobs', 'id')) AS id");
    return rows[0].id;
  }

  async insert(job: JobRecord): Promise<void> {
    try {
      await this.db.query(
        `INSERT INTO jobs (id, slug, title, company_name, company_logo_url, description, apply_url, apply_url_hash,
           source, location_city, location_state, location_country, work_mode, experience_min_years,
           experience_max_years, salary_min, salary_max, salary_currency, salary_period, status, posted_at,
           expires_at, created_at, updated_at, pending_tags)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21,
           $22, $23, $24, $25)`,
        [job.id, job.slug, ...this.mutableValues(job), job.createdAt, job.updatedAt, job.pendingTags],
      );
    } catch (error) {
      if (isDuplicateApplyUrl(error)) throw new DuplicateApplyUrlError();
      throw error;
    }
    await this.replaceTags(job.id, job.tags);
  }

  async update(job: JobRecord): Promise<void> {
    try {
      await this.db.query(
        `UPDATE jobs SET title = $2, company_name = $3, company_logo_url = $4, description = $5, apply_url = $6,
           apply_url_hash = $7, source = $8, location_city = $9, location_state = $10, location_country = $11,
           work_mode = $12, experience_min_years = $13, experience_max_years = $14, salary_min = $15,
           salary_max = $16, salary_currency = $17, salary_period = $18, status = $19, posted_at = $20,
           expires_at = $21, updated_at = $22, pending_tags = $23
         WHERE id = $1`,
        [job.id, ...this.mutableValues(job), job.updatedAt, job.pendingTags],
      );
    } catch (error) {
      if (isDuplicateApplyUrl(error)) throw new DuplicateApplyUrlError();
      throw error;
    }
    await this.replaceTags(job.id, job.tags);
  }

  async saveSchedule(job: JobRecord): Promise<void> {
    await this.db.query(
      "UPDATE jobs SET status = $2, posted_at = $3, expires_at = $4, updated_at = $5 WHERE id = $1",
      [job.id, job.status, job.postedAt, job.expiresAt, job.updatedAt],
    );
  }

  async markPostintimePosted(id: number, at: Date, postId: string | null): Promise<void> {
    await this.db.query("UPDATE jobs SET postintime_posted_at = $2, postintime_post_id = $3 WHERE id = $1", [id, at, postId]);
  }

  async closeExpired(now: Date): Promise<number> {
    const { rowCount } = await this.db.query(
      `UPDATE jobs SET status = 'CLOSED', updated_at = $1
       WHERE status = 'PUBLISHED' AND expires_at IS NOT NULL AND expires_at < $1`,
      [now],
    );
    return rowCount;
  }

  async findSitemapRows(now: Date): Promise<SitemapRow[]> {
    // `expires_at > $1` also leaves out jobs without an expiry, exactly like the former JPQL query.
    const { rows } = await this.db.query<{ slug: string; updated_at: Date }>(
      "SELECT slug, updated_at FROM jobs WHERE status = 'PUBLISHED' AND expires_at > $1 ORDER BY updated_at DESC",
      [now],
    );
    return rows.map((r) => ({ slug: r.slug, updatedAt: r.updated_at }));
  }

  /** The columns from `title` to `expires_at`, in table order, shared by insert and update. */
  private mutableValues(job: JobRecord): unknown[] {
    return [
      job.title, job.companyName, job.companyLogoUrl, job.description, job.applyUrl, job.applyUrlHash, job.source,
      job.locationCity, job.locationState, job.locationCountry, job.workMode, job.experienceMinYears,
      job.experienceMaxYears, job.salaryMin, job.salaryMax, job.salaryCurrency, job.salaryPeriod, job.status,
      job.postedAt, job.expiresAt,
    ];
  }

  /** Replaces the `job_tags` rows of a job with the given tags. */
  private async replaceTags(jobId: number, tags: readonly TagRecord[]): Promise<void> {
    await this.db.query("DELETE FROM job_tags WHERE job_id = $1", [jobId]);
    if (tags.length > 0) {
      await this.db.query(
        "INSERT INTO job_tags (job_id, tag_id) SELECT $1, unnest($2::bigint[])",
        [jobId, tags.map((t) => t.id)],
      );
    }
  }

  private async findOne(condition: string, value: unknown): Promise<JobRecord | null> {
    const { rows } = await this.db.query<JobRow>(`SELECT ${JOB_COLUMNS} FROM jobs j WHERE ${condition}`, [value]);
    const [job] = await this.withTags(rows);
    return job ?? null;
  }

  /**
   * Loads the tags of all given jobs with one query (the former entity used `@BatchSize(50)` for the
   * same reason: avoiding one query per job).
   */
  private async withTags(rows: JobRow[]): Promise<JobRecord[]> {
    if (rows.length === 0) return [];
    const { rows: tagRows } = await this.db.query<{ job_id: number; id: number; name: string; slug: string; category: TagCategory }>(
      `SELECT jt.job_id, t.id, t.name, t.slug, t.category
       FROM job_tags jt JOIN tags t ON t.id = jt.tag_id
       WHERE jt.job_id = ANY($1::bigint[])`,
      [rows.map((r) => r.id)],
    );
    const byJob = new Map<number, TagRecord[]>();
    for (const t of tagRows) {
      const list = byJob.get(t.job_id) ?? [];
      list.push(toTagRecord(t));
      byJob.set(t.job_id, list);
    }
    return rows.map((r) => toJobRecord(r, byJob.get(r.id) ?? []));
  }
}
