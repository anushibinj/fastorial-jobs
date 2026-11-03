import type { components } from "@/lib/api/schema";

type S = components["schemas"];

export type JobSummary = S["JobSummary"];
export type JobDetail = S["JobDetail"];
export type JobRequest = S["JobRequest"];
export type TagDto = S["TagDto"];
export type FiltersResponse = S["FiltersResponse"];
export type DetectedTag = S["DetectedTagDto"];
export type ApiError = S["ApiError"];
export type JobStatus = NonNullable<JobSummary["status"]>;
export type WorkMode = NonNullable<JobSummary["workMode"]>;
export type JobSource = NonNullable<JobDetail["source"]>;

export type PageOf<T> = { items: T[]; page: number; size: number; total: number; totalPages: number; hasNext: boolean };

/** Fields shared by list and detail that the helpers need. */
export type JobLike = Pick<
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
  | "tags"
>;
