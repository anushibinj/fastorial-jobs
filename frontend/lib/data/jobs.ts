import "server-only";
import { PAGE_SIZE } from "@/lib/api/client";
import type { FiltersResponse, JobDetail, JobSummary, PageResponse, SitemapEntry } from "@/lib/api/contract";
import { toApiParams, type FilterState } from "@/lib/filters";
import { getServices } from "@/server/container";
import { parsePublicJobQuery } from "@/server/requests/list-queries";
import { ApiException } from "@/server/shared/api-exception";

/**
 * Public job data for server components. These used to be HTTP calls to the Spring Boot backend; they
 * now call the services in the same process. The filters still go through `toApiParams` and the API's
 * own query parser, so the home page and `GET /api/jobs` cannot drift apart.
 */

/** One page of published jobs for the given filters. Async, so bad input rejects instead of throwing. */
export async function fetchJobs(filters: FilterState, page = 0): Promise<PageResponse<JobSummary>> {
  const q = parsePublicJobQuery(toApiParams(filters, page, PAGE_SIZE));
  return getServices().jobQueries.searchPublic(q.filter, q.page, q.size);
}

/** One job by slug, or null when it does not exist or is a draft. Other errors propagate. */
export async function fetchJob(slug: string): Promise<JobDetail | null> {
  try {
    return await getServices().jobQueries.getPublic(slug);
  } catch (e) {
    if (ApiException.is(e) && e.status === 404) return null;
    throw e;
  }
}

/** Filter facets, or null on any failure: filters are a nicety and must not break the page. */
export async function fetchFilters(): Promise<FiltersResponse | null> {
  try {
    return await getServices().filters.filters();
  } catch {
    return null;
  }
}

/** Sitemap entries of published, unexpired jobs. */
export async function fetchSitemapEntries(): Promise<SitemapEntry[]> {
  return getServices().jobQueries.sitemap();
}
