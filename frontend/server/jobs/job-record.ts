import type { JobSource, JobStatus, SalaryPeriod, WorkMode } from "@/lib/api/contract";
import type { TagRecord } from "@/server/tags/tag-record";

/**
 * A row of the `jobs` table together with its tags (from `job_tags`).
 * This is the persistence model, the equivalent of the former JPA `Job` entity. API responses are
 * built from it by `job-mapper.ts`, so storage details such as `applyUrlHash` never leak out.
 */
export interface JobRecord {
  id: number;
  slug: string;
  title: string;
  companyName: string;
  companyLogoUrl: string | null;
  description: string;
  applyUrl: string;
  /** SHA-256 of the normalized apply URL, unique per job (see `url-hasher.ts`). */
  applyUrlHash: string;
  source: JobSource;
  locationCity: string | null;
  locationState: string | null;
  locationCountry: string | null;
  workMode: WorkMode;
  experienceMinYears: number;
  experienceMaxYears: number | null;
  salaryMin: number | null;
  salaryMax: number | null;
  salaryCurrency: string | null;
  salaryPeriod: SalaryPeriod | null;
  status: JobStatus;
  postedAt: Date | null;
  expiresAt: Date | null;
  /** When the job was last pushed to PostInTime, or null when it never was. */
  postintimePostedAt: Date | null;
  /** The post id PostInTime returned for that push, when it returned one. */
  postintimePostId: string | null;
  createdAt: Date;
  updatedAt: Date;
  tags: TagRecord[];
}
