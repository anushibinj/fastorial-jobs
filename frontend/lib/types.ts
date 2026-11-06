import type {
  ApiErrorBody,
  ApiKeyDto,
  DetectedTagDto,
  JobRequestBody,
  JobSummary,
  PageResponse,
} from "@/lib/api/contract";

/** UI facing names for the API contract types (see `lib/api/contract.ts`). */
export type {
  AdminJobSummary,
  FiltersResponse,
  JobDetail,
  JobSource,
  JobStatus,
  JobSummary,
  PostintimeSettingsDto,
  PostStatus,
  TagDto,
  WorkMode,
} from "@/lib/api/contract";

export type JobRequest = JobRequestBody;
export type DetectedTag = DetectedTagDto;
export type ApiError = ApiErrorBody;
export type ApiKey = ApiKeyDto;
export type PageOf<T> = PageResponse<T>;

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
