import type { AdminJobSummary, JobDetail, JobStatus, JobSummary, PageResponse, SitemapEntry, WorkMode } from "@/lib/api/contract";
import type { JobSettings } from "@/server/config/app-config";
import type { UnitOfWork } from "@/server/db/unit-of-work";
import { toAdminJobSummary, toJobDetail, toJobSummary } from "@/server/jobs/job-mapper";
import { toIso } from "@/server/shared/iso";
import type { JobRepository } from "@/server/jobs/job-repository";
import { toPageRequest, toPageResponse } from "@/server/jobs/paging";
import { ApiException } from "@/server/shared/api-exception";
import type { Clock } from "@/server/shared/clock";

/** The filters a visitor can set on the public job list (see `lib/filters.ts` for the URL form). */
export interface PublicJobFilter {
  q: string | null;
  location: string | null;
  workMode: WorkMode | null;
  expMin: number | null;
  expMax: number | null;
  tags: string[] | null;
}

/** Read side of jobs: public list, detail and sitemap, and the admin list and detail. */
export class JobQueryService {
  constructor(
    private readonly uow: UnitOfWork<{ jobs: JobRepository }>,
    private readonly clock: Clock,
    private readonly settings: JobSettings,
  ) {}

  /**
   * Published jobs that have not expired, newest post first. Pages are zero based; the size defaults
   * to 20 and is capped at 50.
   */
  searchPublic(filter: PublicJobFilter, page: number | null, size: number | null): Promise<PageResponse<JobSummary>> {
    const request = toPageRequest(page, size, this.settings);
    const criteria = { ...filter, status: "PUBLISHED" as const, liveAt: this.clock.now() };
    return this.uow.read(async ({ jobs }) => {
      const { items, total } = await jobs.search(criteria, "postedDesc", request);
      return toPageResponse(items.map(toJobSummary), request, total);
    });
  }

  /**
   * One job by slug. Closed jobs stay viewable (the page shows a banner); drafts are hidden.
   *
   * @throws ApiException 404 when there is no such job or it is a draft.
   */
  getPublic(slug: string): Promise<JobDetail> {
    return this.uow.read(async ({ jobs }) => {
      const job = await jobs.findBySlug(slug);
      if (!job || job.status === "DRAFT") throw ApiException.notFound("Job not found");
      return toJobDetail(job);
    });
  }

  /** Slugs of published, unexpired jobs, most recently updated first. */
  sitemap(): Promise<SitemapEntry[]> {
    return this.uow.read(async ({ jobs }) => {
      const rows = await jobs.findSitemapRows(this.clock.now());
      return rows.map((r) => ({ slug: r.slug, updatedAt: toIso(r.updatedAt) as string }));
    });
  }

  /** Every job (any status unless filtered, expired included), most recently edited first. */
  searchAdmin(q: string | null, status: JobStatus | null, page: number | null, size: number | null, postedToPostintime: boolean | null = null): Promise<PageResponse<AdminJobSummary>> {
    const request = toPageRequest(page, size, this.settings);
    return this.uow.read(async ({ jobs }) => {
      const { items, total } = await jobs.search(postedToPostintime === null ? { q, status } : { q, status, postedToPostintime }, "updatedDesc", request);
      return toPageResponse(items.map(toAdminJobSummary), request, total);
    });
  }

  /**
   * One job by id, whatever its status.
   *
   * @throws ApiException 404 when there is no such job.
   */
  getAdmin(id: number): Promise<JobDetail> {
    return this.uow.read(async ({ jobs }) => {
      const job = await jobs.findById(id);
      if (!job) throw ApiException.notFound("Job not found");
      return toJobDetail(job);
    });
  }
}
