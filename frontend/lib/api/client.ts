import { toApiParams, type FilterState } from "@/lib/filters";
import type { ApiError, FiltersResponse, JobDetail, JobSummary, PageOf } from "@/lib/types";

/** Server side only. In production this is the backend Cloud Run URL. */
export const API_BASE_URL = (process.env.API_BASE_URL ?? "http://localhost:8080").replace(/\/+$/, "");

export const PAGE_SIZE = 20;

export class ApiRequestError extends Error {
  constructor(
    public status: number,
    public body: ApiError | null,
    message?: string,
  ) {
    super(message ?? body?.message ?? `Request failed (${status})`);
  }
}

export async function apiFetch<T>(path: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(`${API_BASE_URL}${path}`, { cache: "no-store", ...init });
  if (!res.ok) {
    let body: ApiError | null = null;
    try {
      body = (await res.json()) as ApiError;
    } catch {
      // not JSON
    }
    throw new ApiRequestError(res.status, body);
  }
  return (await res.json()) as T;
}

export function fetchJobs(filters: FilterState, page = 0): Promise<PageOf<JobSummary>> {
  return apiFetch(`/api/jobs?${toApiParams(filters, page, PAGE_SIZE)}`);
}

/** Returns null for an unknown slug. */
export async function fetchJob(slug: string): Promise<JobDetail | null> {
  try {
    return await apiFetch<JobDetail>(`/api/jobs/${encodeURIComponent(slug)}`);
  } catch (e) {
    if (e instanceof ApiRequestError && e.status === 404) return null;
    throw e;
  }
}

/** Filters are a nicety, so a failure here must not break the page. */
export async function fetchFilters(): Promise<FiltersResponse | null> {
  try {
    return await apiFetch<FiltersResponse>("/api/filters");
  } catch {
    return null;
  }
}
