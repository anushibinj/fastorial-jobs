import { apiFetch } from "@/lib/api/client";
import type { DetectedTag, JobDetail, JobRequest, JobStatus, JobSummary, PageOf, TagDto } from "@/lib/types";

/** Calls the token protected admin endpoints. Only import from server code. */
function adminInit(init: RequestInit = {}): RequestInit {
  return {
    ...init,
    headers: {
      "Content-Type": "application/json",
      "X-Admin-Token": process.env.ADMIN_TOKEN ?? "",
      ...(init.headers ?? {}),
    },
  };
}

export function adminListJobs(params: { q?: string; status?: string; page?: number }): Promise<PageOf<JobSummary>> {
  const p = new URLSearchParams();
  if (params.q) p.set("q", params.q);
  if (params.status) p.set("status", params.status);
  p.set("page", String(params.page ?? 0));
  p.set("size", "30");
  return apiFetch(`/api/admin/jobs?${p}`, adminInit());
}

export const adminGetJob = (id: number | string): Promise<JobDetail> =>
  apiFetch(`/api/admin/jobs/${id}`, adminInit());

export const adminCreateJob = (body: JobRequest): Promise<JobDetail> =>
  apiFetch(`/api/admin/jobs`, adminInit({ method: "POST", body: JSON.stringify(body) }));

export const adminUpdateJob = (id: number | string, body: JobRequest): Promise<JobDetail> =>
  apiFetch(`/api/admin/jobs/${id}`, adminInit({ method: "PUT", body: JSON.stringify(body) }));

export const adminSetStatus = (id: number | string, status: JobStatus): Promise<JobDetail> =>
  apiFetch(`/api/admin/jobs/${id}/status`, adminInit({ method: "PATCH", body: JSON.stringify({ status }) }));

export const adminExtend = (id: number | string, days?: number): Promise<JobDetail> =>
  apiFetch(`/api/admin/jobs/${id}/extend`, adminInit({ method: "POST", body: JSON.stringify(days ? { days } : {}) }));

export const adminTags = (): Promise<TagDto[]> => apiFetch(`/api/admin/tags`, adminInit());

export const adminDetectTags = (title: string, description: string): Promise<DetectedTag[]> =>
  apiFetch(`/api/admin/tags/detect`, adminInit({ method: "POST", body: JSON.stringify({ title, description }) }));
