import type {
  ExperienceBucket,
  FiltersResponse,
  JobStatus,
  LocationCount,
  TagCount,
  TagCategory,
  WorkMode,
  WorkModeCount,
} from "@/lib/api/contract";
import type { SqlExecutor } from "@/server/db/database";
import type { UnitOfWork } from "@/server/db/unit-of-work";

/** A job's experience range; a null maximum is open ended. */
export interface ExperienceRange {
  min: number;
  max: number | null;
}

/** Aggregations over jobs of one status, for the filter UI. */
export interface JobFacetRepository {
  countByCity(status: JobStatus): Promise<LocationCount[]>;
  countByWorkMode(status: JobStatus): Promise<WorkModeCount[]>;
  countByTag(status: JobStatus): Promise<TagCount[]>;
  experienceRanges(status: JobStatus): Promise<ExperienceRange[]>;
}

/** `JobFacetRepository` over PostgreSQL. The queries are the former JPQL queries in SQL form. */
export class PgJobFacetRepository implements JobFacetRepository {
  constructor(private readonly db: SqlExecutor) {}

  async countByCity(status: JobStatus): Promise<LocationCount[]> {
    const { rows } = await this.db.query<LocationCount>(
      `SELECT location_city AS city, count(id) AS count FROM jobs
       WHERE status = $1 AND location_city IS NOT NULL
       GROUP BY location_city ORDER BY count(id) DESC, location_city ASC`,
      [status],
    );
    return rows;
  }

  async countByWorkMode(status: JobStatus): Promise<WorkModeCount[]> {
    // The Java query had no ORDER BY either; the UI does not depend on this order.
    const { rows } = await this.db.query<{ work_mode: WorkMode; count: number }>(
      "SELECT work_mode, count(id) AS count FROM jobs WHERE status = $1 GROUP BY work_mode",
      [status],
    );
    return rows.map((r) => ({ workMode: r.work_mode, count: r.count }));
  }

  async countByTag(status: JobStatus): Promise<TagCount[]> {
    const { rows } = await this.db.query<TagCount>(
      `SELECT t.name, t.slug, t.category, count(j.id) AS count
       FROM jobs j JOIN job_tags jt ON jt.job_id = j.id JOIN tags t ON t.id = jt.tag_id
       WHERE j.status = $1
       GROUP BY t.slug, t.name, t.category ORDER BY count(j.id) DESC, t.name ASC`,
      [status],
    );
    return rows.map((r) => ({ name: r.name, slug: r.slug, category: r.category as TagCategory, count: r.count }));
  }

  async experienceRanges(status: JobStatus): Promise<ExperienceRange[]> {
    const { rows } = await this.db.query<{ min: number; max: number | null }>(
      "SELECT experience_min_years AS min, experience_max_years AS max FROM jobs WHERE status = $1",
      [status],
    );
    return rows;
  }
}

/** The fixed experience buckets of the filter UI; `max` null is open ended. */
export const EXPERIENCE_BUCKETS: readonly Omit<ExperienceBucket, "count">[] = [
  { label: "0-2 years", min: 0, max: 2 },
  { label: "3-5 years", min: 3, max: 5 },
  { label: "6-9 years", min: 6, max: 9 },
  { label: "10+ years", min: 10, max: null },
];

/**
 * Counts, for each bucket, the jobs whose experience range overlaps it, using the same overlap rule as
 * the search (`job.min <= bucket.max AND (job.max IS NULL OR job.max >= bucket.min)`). A job can count in
 * several buckets: a "5-8 years" job is in both "3-5" and "6-9".
 */
export function countExperienceBuckets(ranges: readonly ExperienceRange[]): ExperienceBucket[] {
  return EXPERIENCE_BUCKETS.map((b) => {
    const count = ranges.filter((r) => {
      const minOk = b.max === null || r.min <= b.max;
      const maxOk = r.max === null || r.max >= b.min;
      return minOk && maxOk;
    }).length;
    return { ...b, count };
  });
}

/**
 * Facets for the filter UI (`GET /api/filters`), counted over PUBLISHED jobs. Port of the former
 * `FilterService`. Like the Java version, it does not hide expired jobs that the daily sweep has not
 * closed yet; the counts may be off by those for up to a day.
 */
export class FilterService {
  constructor(private readonly uow: UnitOfWork<{ facets: JobFacetRepository }>) {}

  /** The four facet lists. */
  filters(): Promise<FiltersResponse> {
    return this.uow.read(async ({ facets }) => {
      const status: JobStatus = "PUBLISHED";
      const [locations, workModes, tags, ranges] = await Promise.all([
        facets.countByCity(status),
        facets.countByWorkMode(status),
        facets.countByTag(status),
        facets.experienceRanges(status),
      ]);
      return { locations, workModes, tags, experience: countExperienceBuckets(ranges) };
    });
  }
}
