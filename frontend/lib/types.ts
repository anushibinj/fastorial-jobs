import type { components } from "@/lib/api/schema";

type S = components["schemas"];

export type JobSummary = S["JobSummary"];
export type JobDetail = S["JobDetail"];
export type JobRequest = S["JobRequest"];
export type TagDto = S["TagDto"];
export type FiltersResponse = S["FiltersResponse"];
export type DetectedTag = S["DetectedTagDto"];
export type ApiError = { code: string; message: string; fieldErrors?: Record<string, string> };
export type ApiKey = {
  id: number;
  name: string;
  keyPrefix: string;
  createdAt: string;
  lastUsedAt?: string | null;
  revokedAt?: string | null;
  /** Plaintext, present only in the response to creation. */
  key?: string | null;
};
export type JobStatus = NonNullable<JobSummary["status"]>;
export type WorkMode = NonNullable<JobSummary["workMode"]>;
export type JobSource = NonNullable<JobDetail["source"]>;

export type PageOf<T> = { items: T[]; page: number; size: number; total: number; totalPages: number; hasNext: boolean };

/** Fields shared by list and detail that the helpers need. */
type Loose<T> = { [K in keyof T]?: T[K] | null };

export type JobLike = Loose<
  Pick<
  JobSummary,
  | "slug"
  | "title"
  | "companyName"
  | "locationCity"
  | "locationState"
  | "workMode"
  | "experienceMinYears"
  | "experienceMaxYears"
  | "salaryMin"
  | "salaryMax"
  | "salaryCurrency"
  | "salaryPeriod"
  | "status"
  | "postedAt"
  | "expiresAt"
  | "tags"
  >
>;
