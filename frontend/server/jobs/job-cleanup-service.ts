import type { UnitOfWork } from "@/server/db/unit-of-work";
import type { JobRepository } from "@/server/jobs/job-repository";
import type { Clock } from "@/server/shared/clock";
import type { Logger } from "@/server/shared/logger";

/**
 * The daily sweep that closes expired jobs, triggered by Cloud Scheduler through
 * `POST /api/internal/jobs/cleanup`. Expired jobs already disappear from the public list and the
 * sitemap without it; the sweep makes their status say CLOSED too.
 */
export class JobCleanupService {
  constructor(
    private readonly uow: UnitOfWork<{ jobs: JobRepository }>,
    private readonly clock: Clock,
    private readonly logger: Logger,
  ) {}

  /** Closes every PUBLISHED job whose expiry has passed. Idempotent: a second run closes nothing. */
  async closeExpiredJobs(): Promise<number> {
    const closed = await this.uow.write(({ jobs }) => jobs.closeExpired(this.clock.now()));
    this.logger.info(`Closed ${closed} expired job(s)`);
    return closed;
  }
}
