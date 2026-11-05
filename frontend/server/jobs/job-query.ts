import type { JobStatus, WorkMode } from "@/lib/api/contract";
import { isJavaBlank, javaTrim } from "@/server/shared/java-text";

/**
 * Search criteria for jobs. Every field is optional. Port of the former `JobSpecs.Criteria`.
 * `expMin`/`expMax` describe the candidate's experience; `liveAt` hides jobs whose expiry is not after
 * that instant (expired jobs disappear from the public list before the daily sweep closes them).
 */
export interface JobCriteria {
  q?: string | null;
  location?: string | null;
  workMode?: WorkMode | null;
  expMin?: number | null;
  expMax?: number | null;
  tags?: readonly string[] | null;
  status?: JobStatus | null;
  liveAt?: Date | null;
}

/** Public lists show the newest post first; the admin list shows the most recently edited first. */
export type JobSort = "postedDesc" | "updatedDesc";

/** ORDER BY clauses for each sort. The id breaks ties, so paging is stable. */
export const ORDER_BY: Readonly<Record<JobSort, string>> = {
  postedDesc: "j.posted_at DESC, j.id DESC",
  updatedDesc: "j.updated_at DESC, j.id DESC",
};

/** A SQL boolean expression over the alias `j` (table `jobs`) with its positional parameters. */
export interface SqlFilter {
  where: string;
  params: unknown[];
}

/**
 * Escapes `%`, `_` and the escape character itself so user input is matched literally by
 * `LIKE ... ESCAPE '\'`. Without this, searching for `100%` would match everything.
 */
export function escapeLike(s: string): string {
  return s.replaceAll("\\", "\\\\").replaceAll("%", "\\%").replaceAll("_", "\\_");
}

/** Trimmed, de-duplicated, non empty tag slugs, in first seen order. */
export function normalizeTagSlugs(tags: readonly string[]): string[] {
  return [...new Set(tags.map(javaTrim).filter((s) => s !== ""))];
}

/**
 * Builds the WHERE clause for `criteria`. Port of `JobSpecs.of`; each rule below matches one Java
 * predicate. Values are always bound as parameters, never concatenated into the SQL.
 */
export function buildJobFilter(criteria: JobCriteria): SqlFilter {
  const clauses: string[] = [];
  const params: unknown[] = [];
  /** Adds a parameter and returns its placeholder (`$1`, `$2`, ...). */
  const bind = (value: unknown) => {
    params.push(value);
    return `$${params.length}`;
  };

  if (criteria.status) clauses.push(`j.status = ${bind(criteria.status)}`);
  if (criteria.liveAt) clauses.push(`(j.expires_at IS NULL OR j.expires_at > ${bind(criteria.liveAt)})`);
  if (criteria.workMode) clauses.push(`j.work_mode = ${bind(criteria.workMode)}`);
  if (criteria.location != null && !isJavaBlank(criteria.location)) {
    // Uses the lower(location_city) index.
    clauses.push(`lower(j.location_city) = ${bind(javaTrim(criteria.location).toLowerCase())}`);
  }

  // Experience overlap between the job's range [min, max] and the candidate's [expMin, expMax]:
  //   job.min <= expMax  AND  (job.max IS NULL OR job.max >= expMin)
  // A null job maximum is open ended, so a "7+ years" job matches any search reaching 7 years or more.
  if (criteria.expMax != null) clauses.push(`j.experience_min_years <= ${bind(criteria.expMax)}`);
  if (criteria.expMin != null) {
    clauses.push(`(j.experience_max_years IS NULL OR j.experience_max_years >= ${bind(criteria.expMin)})`);
  }

  // Tags: the job must have every requested tag (AND semantics). The subquery counts how many of the
  // requested slugs the job has; HAVING without GROUP BY aggregates over all of the job's matching
  // rows, so EXISTS is true only when that count equals the number of requested slugs.
  if (criteria.tags) {
    const slugs = normalizeTagSlugs(criteria.tags);
    if (slugs.length > 0) {
      clauses.push(
        `EXISTS (SELECT 1 FROM job_tags jt JOIN tags t ON t.id = jt.tag_id
                 WHERE jt.job_id = j.id AND t.slug = ANY(${bind(slugs)}::text[])
                 HAVING count(DISTINCT t.id) = ${bind(slugs.length)})`,
      );
    }
  }

  // Text: full text search over title, company and description (the GIN indexed job_matches function
  // from migration V1), OR a substring match on title or company so that partial words such as "Glob"
  // for "Globex" are found too.
  if (criteria.q != null && !isJavaBlank(criteria.q)) {
    const q = javaTrim(criteria.q);
    const fts = bind(q);
    const like = bind(`%${escapeLike(q.toLowerCase())}%`);
    clauses.push(
      `(job_matches(j.title, j.company_name, j.description, ${fts}) ` +
        `OR lower(j.title) LIKE ${like} ESCAPE '\\' OR lower(j.company_name) LIKE ${like} ESCAPE '\\')`,
    );
  }

  return { where: clauses.length > 0 ? clauses.join(" AND ") : "TRUE", params };
}
