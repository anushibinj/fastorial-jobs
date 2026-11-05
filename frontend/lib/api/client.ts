import { toApiParams, type FilterState } from "@/lib/filters";

/**
 * Browser side access to the jobs API. The API is served by this same Next.js app under `/api`, so the
 * browser calls it on its own origin: no separate backend URL and no CORS. Server code does not use HTTP
 * at all; it calls the services directly (see `lib/data/jobs.ts`).
 */

export const PAGE_SIZE = 20;

/** Same-origin URL of one page of `GET /api/jobs` for the given filters. */
export function jobsApiPath(filters: FilterState, page: number, size = PAGE_SIZE): string {
  return `/api/jobs?${toApiParams(filters, page, size)}`;
}
