import type { PageResponse } from "@/lib/api/contract";
import type { JobSettings } from "@/server/config/app-config";

/** A zero based page of a given size. */
export interface PageRequest {
  page: number;
  size: number;
}

/**
 * Clamps the requested paging like the former `JobService.pageable`: a missing or non-positive size
 * gives the default (20), a larger one is capped at the maximum (50), and a missing or negative page
 * gives the first page.
 */
export function toPageRequest(page: number | null, size: number | null, settings: JobSettings): PageRequest {
  const s = size === null || size < 1 ? settings.defaultPageSize : Math.min(size, settings.maxPageSize);
  const p = page === null || page < 0 ? 0 : page;
  return { page: p, size: s };
}

/** Row offset of a page. */
export function offsetOf(request: PageRequest): number {
  return request.page * request.size;
}

/**
 * The total number of results, counting only when the page itself cannot tell. Port of Spring Data's
 * `PageableExecutionUtils.getPage`: on the first page, a short page *is* the whole result; on a later
 * page, a short non empty page means the total is the offset plus its length. Saves a `count(*)` query
 * on most public list requests.
 */
export async function resolveTotal(request: PageRequest, pageLength: number, count: () => Promise<number>): Promise<number> {
  const offset = offsetOf(request);
  if (offset === 0) return request.size > pageLength ? pageLength : count();
  if (pageLength !== 0 && request.size > pageLength) return offset + pageLength;
  return count();
}

/** Builds the page response exactly like Spring's `PageImpl` (`totalPages`, `hasNext`). */
export function toPageResponse<T>(items: T[], request: PageRequest, total: number): PageResponse<T> {
  const totalPages = request.size === 0 ? 1 : Math.ceil(total / request.size);
  return { items, page: request.page, size: request.size, total, totalPages, hasNext: request.page + 1 < totalPages };
}
