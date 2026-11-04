import type { IsoInstant, JobDetail, JobSummary } from "@/lib/api/contract";
import type { JobRecord } from "@/server/jobs/job-record";
import { toIso } from "@/server/shared/iso";
import { toSortedTagDtos } from "@/server/tags/tag-mapper";

/** A job as shown in lists (the former `JobSummary.from`). Property order matches the Java record. */
export function toJobSummary(job: JobRecord): JobSummary {
  return {
    id: job.id,
    slug: job.slug,
    title: job.title,
    companyName: job.companyName,
    companyLogoUrl: job.companyLogoUrl,
    locationCity: job.locationCity,
    locationState: job.locationState,
    locationCountry: job.locationCountry,
    workMode: job.workMode,
    experienceMinYears: job.experienceMinYears,
    experienceMaxYears: job.experienceMaxYears,
    salaryMin: job.salaryMin,
    salaryMax: job.salaryMax,
    salaryCurrency: job.salaryCurrency,
    salaryPeriod: job.salaryPeriod,
    status: job.status,
    postedAt: toIso(job.postedAt),
    expiresAt: toIso(job.expiresAt),
    tags: toSortedTagDtos(job.tags),
  };
}

/** A job with every public field (the former `JobDetail.from`). Property order matches the Java record. */
export function toJobDetail(job: JobRecord): JobDetail {
  return {
    id: job.id,
    slug: job.slug,
    title: job.title,
    companyName: job.companyName,
    companyLogoUrl: job.companyLogoUrl,
    description: job.description,
    applyUrl: job.applyUrl,
    source: job.source,
    locationCity: job.locationCity,
    locationState: job.locationState,
    locationCountry: job.locationCountry,
    workMode: job.workMode,
    experienceMinYears: job.experienceMinYears,
    experienceMaxYears: job.experienceMaxYears,
    salaryMin: job.salaryMin,
    salaryMax: job.salaryMax,
    salaryCurrency: job.salaryCurrency,
    salaryPeriod: job.salaryPeriod,
    status: job.status,
    postedAt: toIso(job.postedAt),
    expiresAt: toIso(job.expiresAt),
    updatedAt: toIso(job.updatedAt) as IsoInstant,
    tags: toSortedTagDtos(job.tags),
  };
}
