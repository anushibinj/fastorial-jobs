import { JOB_STATUSES, WORK_MODES, type JobStatus } from "@/lib/api/contract";
import type { PublicJobFilter } from "@/server/jobs/job-query-service";
import { enumParam, intParam, listParam, stringParam } from "@/server/requests/request-params";

/** Paging as requested; the service applies defaults and limits. */
export interface RequestedPage {
  page: number | null;
  size: number | null;
}

/**
 * Query of `GET /api/jobs` (also used by the home page, so both paths parse identically).
 * Parameters are converted in the order the Java controller declared them, so with several invalid
 * parameters the same one is reported.
 */
export function parsePublicJobQuery(params: URLSearchParams): RequestedPage & { filter: PublicJobFilter } {
  const filter: PublicJobFilter = {
    q: stringParam(params, "q"),
    location: stringParam(params, "location"),
    workMode: enumParam(params, "workMode", WORK_MODES),
    expMin: intParam(params, "expMin"),
    expMax: intParam(params, "expMax"),
    tags: listParam(params, "tags"),
  };
  return { filter, page: intParam(params, "page"), size: intParam(params, "size") };
}

/** Query of `GET /api/admin/jobs`: optional text, status and paging. */
export function parseAdminJobQuery(params: URLSearchParams): RequestedPage & { q: string | null; status: JobStatus | null } {
  return {
    q: stringParam(params, "q"),
    status: enumParam(params, "status", JOB_STATUSES),
    page: intParam(params, "page"),
    size: intParam(params, "size"),
  };
}
