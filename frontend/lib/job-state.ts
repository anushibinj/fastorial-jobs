import type { JobLike } from "@/lib/types";

/**
 * A job is closed when an admin closed it, or when its expiry has passed but the daily cleanup
 * has not run yet. Both cases get the same treatment: banner, no apply or share, noindex, no JSON-LD.
 */
export function isClosed(job: Pick<JobLike, "status" | "expiresAt">, now: Date = new Date()): boolean {
  if (job.status === "CLOSED") return true;
  return job.status === "PUBLISHED" && !!job.expiresAt && new Date(job.expiresAt).getTime() <= now.getTime();
}
