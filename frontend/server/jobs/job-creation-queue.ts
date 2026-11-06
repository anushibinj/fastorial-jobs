import type { RunInBackground } from "@/server/events/event-bus";
import type { JobCommandService } from "@/server/jobs/job-command-service";
import { DurableQueue } from "@/server/queue/durable-queue";
import type { QueueStore } from "@/server/queue/queue-store";
import type { JobRequest } from "@/server/requests/job-request";
import type { Logger } from "@/server/shared/logger";

/** A stored request has its dates as text; turns them back into `Date`s. */
function decodeRequest(payload: unknown): JobRequest {
  const r = payload as JobRequest & { postedAt: string | null; expiresAt: string | null };
  return { ...r, postedAt: r.postedAt ? new Date(r.postedAt) : null, expiresAt: r.expiresAt ? new Date(r.expiresAt) : null };
}

/**
 * Accepts job creation requests in bulk and answers at once: they only go into the in-memory inbox. In
 * the background they are flushed to the database queue and then created one after another through
 * `JobCommandService.create`, so each job gets the usual validation, duplicate check and
 * `JobPostCreated` event. A job that fails (duplicate apply URL, unknown tag) is kept as FAILED with
 * its error and does not stop the rest.
 */
export class JobCreationQueue {
  private readonly queue: DurableQueue<JobRequest>;

  constructor(commands: JobCommandService, store: QueueStore, logger: Logger, runInBackground?: RunInBackground) {
    this.queue = new DurableQueue<JobRequest>(
      "job-creation",
      store,
      async (request) => {
        const job = await commands.create(request);
        logger.info(`Bulk create: job ${job.id} (${job.slug}) created`);
      },
      logger,
      runInBackground,
      decodeRequest,
    );
  }

  /** Puts the requests in the inbox and returns how many, without waiting for the database. */
  submit(requests: readonly JobRequest[]): number {
    this.queue.enqueue(...requests);
    return requests.length;
  }

  /** Continues requests left in the database by an earlier run. */
  resume(): void {
    this.queue.resume();
  }

  idle(): Promise<void> {
    return this.queue.idle();
  }
}
