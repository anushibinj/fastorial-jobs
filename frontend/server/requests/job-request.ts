import {
  JOB_SOURCES,
  JOB_STATUSES,
  SALARY_PERIODS,
  WORK_MODES,
  type JobSource,
  type JobStatus,
  type SalaryPeriod,
  type WorkMode,
} from "@/lib/api/contract";
import {
  ConstraintViolations,
  defaultSizeMessage,
  fitsMaxLength,
  isAtLeast,
  isNotBlank,
  matchesFully,
} from "@/server/requests/constraints";
import {
  coerceEnum,
  coerceInstant,
  coerceInt32,
  coerceInt64,
  coerceString,
  coerceStringList,
  expectObject,
} from "@/server/requests/json-coercion";

/**
 * A create or replace request for a job after binding and annotation validation, the TypeScript
 * equivalent of the former `JobRequest` record once `@Valid` had passed. Required fields are therefore
 * non-null here. Cross field rules (salary currency, experience range, URL format) are checked later by
 * `JobRequestValidator`, exactly as the Java service did.
 */
export interface JobRequest {
  title: string;
  companyName: string;
  companyLogoUrl: string | null;
  description: string | null;
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
  /** Defaults to PUBLISHED on create; on update, null keeps the current status. */
  status: JobStatus | null;
  postedAt: Date | null;
  expiresAt: Date | null;
  /** Tag slugs. */
  tags: string[] | null;
}

/** Three ASCII letters, e.g. `INR`. Case is normalized later (the service upper-cases it). */
const CURRENCY_PATTERN = /^[A-Za-z]{3}$/;

/**
 * Turns a parsed JSON body into a `JobRequest`, or throws the same 400 the former backend returned.
 *
 * Stage 1 binds every known property with Jackson's coercion rules (see `json-coercion.ts`); a value
 * that cannot be bound at all gives `400 BAD_REQUEST "Malformed request body"`.
 *
 * Stage 2 applies the bean validation annotations of the Java `JobRequest` record, with their exact
 * messages, and gives `400 VALIDATION_FAILED` with one message per invalid field. Stage 2 only runs when
 * stage 1 succeeded, because Spring validates only a successfully bound object.
 */
export function parseJobRequest(body: unknown): JobRequest {
  const o = expectObject(body);
  const r = {
    title: coerceString(o.title),
    companyName: coerceString(o.companyName),
    companyLogoUrl: coerceString(o.companyLogoUrl),
    description: coerceString(o.description),
    applyUrl: coerceString(o.applyUrl),
    source: coerceEnum(o.source, JOB_SOURCES),
    locationCity: coerceString(o.locationCity),
    locationState: coerceString(o.locationState),
    locationCountry: coerceString(o.locationCountry),
    workMode: coerceEnum(o.workMode, WORK_MODES),
    experienceMinYears: coerceInt32(o.experienceMinYears),
    experienceMaxYears: coerceInt32(o.experienceMaxYears),
    salaryMin: coerceInt64(o.salaryMin),
    salaryMax: coerceInt64(o.salaryMax),
    salaryCurrency: coerceString(o.salaryCurrency),
    salaryPeriod: coerceEnum(o.salaryPeriod, SALARY_PERIODS),
    status: coerceEnum(o.status, JOB_STATUSES),
    postedAt: coerceInstant(o.postedAt),
    expiresAt: coerceInstant(o.expiresAt),
    tags: coerceStringList(o.tags),
  };

  const v = new ConstraintViolations();
  v.require(isNotBlank(r.title), "title", "Title is required");
  v.require(fitsMaxLength(r.title, 200), "title", "Title must be at most 200 characters");
  v.require(isNotBlank(r.companyName), "companyName", "Company is required");
  v.require(fitsMaxLength(r.companyName, 150), "companyName", "Company must be at most 150 characters");
  v.require(fitsMaxLength(r.companyLogoUrl, 500), "companyLogoUrl", "Logo URL must be at most 500 characters");
  v.require(isNotBlank(r.applyUrl), "applyUrl", "Apply URL is required");
  v.require(fitsMaxLength(r.applyUrl, 1000), "applyUrl", "Apply URL must be at most 1000 characters");
  v.require(r.source !== null, "source", "Source is required");
  v.require(fitsMaxLength(r.locationCity, 100), "locationCity", defaultSizeMessage(100));
  v.require(fitsMaxLength(r.locationState, 100), "locationState", defaultSizeMessage(100));
  v.require(fitsMaxLength(r.locationCountry, 100), "locationCountry", defaultSizeMessage(100));
  v.require(r.workMode !== null, "workMode", "Work mode is required");
  v.require(r.experienceMinYears !== null, "experienceMinYears", "Minimum experience is required");
  v.require(isAtLeast(r.experienceMinYears, 0), "experienceMinYears", "Minimum experience must be 0 or more");
  v.require(isAtLeast(r.experienceMaxYears, 0), "experienceMaxYears", "Maximum experience must be 0 or more");
  v.require(isAtLeast(r.salaryMin, 0), "salaryMin", "Minimum salary must be 0 or more");
  v.require(isAtLeast(r.salaryMax, 0), "salaryMax", "Maximum salary must be 0 or more");
  v.require(matchesFully(r.salaryCurrency, CURRENCY_PATTERN), "salaryCurrency", "Currency must be a 3 letter code");
  v.throwIfAny();

  // The checks above guarantee the required fields; the casts only tell the compiler so.
  return {
    ...r,
    title: r.title as string,
    companyName: r.companyName as string,
    applyUrl: r.applyUrl as string,
    source: r.source as JobSource,
    workMode: r.workMode as WorkMode,
    experienceMinYears: r.experienceMinYears as number,
  };
}
