/**
 * The JSON contract of the jobs API (`/api/**`), shared by the server code in `server/` and the UI.
 *
 * These shapes are exactly what the former Spring Boot backend returned (its Java records serialized by
 * Jackson): every property is always present and nullable values are sent as `null`, never omitted.
 * Timestamps are ISO-8601 instants in UTC. Keeping the contract unchanged means existing automations
 * that call the API with an `X-API-Key` keep working after the backend moved into Next.js.
 *
 * This module holds types and constant lists only, so it is safe to import from client components.
 */

export const WORK_MODES = ["ONSITE", "HYBRID", "REMOTE"] as const;
export const JOB_SOURCES = ["LINKEDIN", "NAUKRI", "COMPANY_SITE", "OTHER"] as const;
export const JOB_STATUSES = ["DRAFT", "PUBLISHED", "CLOSED"] as const;
export const SALARY_PERIODS = ["YEARLY", "MONTHLY"] as const;
export const TAG_CATEGORIES = ["LANGUAGE", "FRAMEWORK", "DATABASE", "CLOUD", "TOOL"] as const;

export type WorkMode = (typeof WORK_MODES)[number];
export type JobSource = (typeof JOB_SOURCES)[number];
export type JobStatus = (typeof JOB_STATUSES)[number];
export type SalaryPeriod = (typeof SALARY_PERIODS)[number];
export type TagCategory = (typeof TAG_CATEGORIES)[number];

/** An ISO-8601 instant such as `2026-11-03T09:00:00.000Z`. */
export type IsoInstant = string;

export interface TagDto {
  name: string;
  slug: string;
  category: TagCategory;
}

/** A job in lists: everything except the description, apply URL, source and update time. */
export interface JobSummary {
  id: number;
  slug: string;
  title: string;
  companyName: string;
  companyLogoUrl: string | null;
  locationCity: string | null;
  locationState: string | null;
  locationCountry: string | null;
  workMode: WorkMode;
  experienceMinYears: number;
  /** Null means open ended ("7+ years"). */
  experienceMaxYears: number | null;
  salaryMin: number | null;
  salaryMax: number | null;
  salaryCurrency: string | null;
  salaryPeriod: SalaryPeriod | null;
  status: JobStatus;
  postedAt: IsoInstant | null;
  expiresAt: IsoInstant | null;
  /** Sorted by name, case insensitively. */
  tags: TagDto[];
}

/** A single job with every field. */
export interface JobDetail {
  id: number;
  slug: string;
  title: string;
  companyName: string;
  companyLogoUrl: string | null;
  /** Markdown. Empty string when there is none. */
  description: string;
  applyUrl: string;
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
  postedAt: IsoInstant | null;
  expiresAt: IsoInstant | null;
  updatedAt: IsoInstant;
  tags: TagDto[];
}

/** One page of results. Pages are zero based. */
export interface PageResponse<T> {
  items: T[];
  page: number;
  size: number;
  total: number;
  totalPages: number;
  hasNext: boolean;
}

export interface SitemapEntry {
  slug: string;
  updatedAt: IsoInstant;
}

export interface LocationCount {
  city: string;
  count: number;
}

export interface WorkModeCount {
  workMode: WorkMode;
  count: number;
}

export interface TagCount {
  name: string;
  slug: string;
  category: TagCategory;
  count: number;
}

/** Jobs whose experience range overlaps [min, max]; `max` is null for the open ended bucket. */
export interface ExperienceBucket {
  label: string;
  min: number;
  max: number | null;
  count: number;
}

/** Facets for the filter UI, counted over published jobs. */
export interface FiltersResponse {
  locations: LocationCount[];
  workModes: WorkModeCount[];
  tags: TagCount[];
  experience: ExperienceBucket[];
}

export interface MatchedText {
  text: string;
  count: number;
}

/** A tag suggested by `POST /api/admin/tags/detect`, most relevant first. */
export interface DetectedTagDto {
  name: string;
  slug: string;
  category: TagCategory;
  titleCount: number;
  descriptionCount: number;
  count: number;
  matches: MatchedText[];
}

export interface ApiKeyDto {
  id: number;
  name: string;
  /** The first 10 characters of the key, safe to display. */
  keyPrefix: string;
  createdAt: IsoInstant;
  lastUsedAt: IsoInstant | null;
  revokedAt: IsoInstant | null;
  /** The plaintext key. Only set in the response to creation, null everywhere else. */
  key: string | null;
}

/** Status a pushed post gets in PostInTime: `draft` waits for a person, `ready` can be published right away. */
export const POST_STATUSES = ["draft", "ready"] as const;
export type PostStatus = (typeof POST_STATUSES)[number];

/** The PostInTime connection as the admin UI sees it: everything except the API token. */
export interface PostintimeSettingsDto {
  enabled: boolean;
  /** Origin of the PostInTime API, without a trailing slash. Empty until configured. */
  baseUrl: string;
  channelId: string;
  postStatus: PostStatus;
  /** Whether an API token is stored. The token itself never leaves the server. */
  hasToken: boolean;
  /** One line about the latest push to PostInTime, or null before the first one. */
  lastResult: string | null;
  lastAttemptAt: IsoInstant | null;
}

/** Body of every error response. */
export interface ApiErrorBody {
  code: string;
  message: string;
  fieldErrors: Record<string, string>;
}

export interface CleanupResult {
  closed: number;
}

/**
 * Body of `POST /api/admin/jobs` and `PUT /api/admin/jobs/{id}`, as sent by the admin form and by
 * automations. Optional fields may be omitted or null. See the README for the rules.
 */
export interface JobRequestBody {
  title: string;
  companyName: string;
  companyLogoUrl?: string | null;
  description?: string | null;
  applyUrl: string;
  source: JobSource;
  locationCity?: string | null;
  locationState?: string | null;
  locationCountry?: string | null;
  workMode: WorkMode;
  experienceMinYears: number;
  experienceMaxYears?: number | null;
  salaryMin?: number | null;
  salaryMax?: number | null;
  salaryCurrency?: string | null;
  salaryPeriod?: SalaryPeriod | null;
  /** Defaults to PUBLISHED on create. */
  status?: JobStatus | null;
  postedAt?: IsoInstant | null;
  expiresAt?: IsoInstant | null;
  /** Tag slugs. */
  tags?: string[] | null;
}
