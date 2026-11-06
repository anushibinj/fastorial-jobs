import type { JobCommandService } from "@/server/jobs/job-command-service";
import { SerialQueue } from "@/server/queue/serial-queue";
import type { JobRequest } from "@/server/requests/job-request";
import type { RunInBackground } from "@/server/events/event-bus";
import type { Logger } from "@/server/shared/logger";

/**
 * Accepts job creation requests in bulk and answers at once. A worker creates the jobs one after
 * another in the background through `JobCommandService.create`, so each one gets the usual validation,
 * duplicate check and `JobPostCreated` event. A job that fails (duplicate apply URL, unknown tag) is
 * logged and does not stop the rest.
 */
export class JobCreationQueue {
  private readonly queue: SerialQueue<JobRequest>;

  constructor(commands: JobCommandService, logger: Logger, runInBackground?: RunInBackground) {
    this.queue = new SerialQueue<JobRequest>(
      "job-creation",
      async (request) => {
        const job = await commands.create(request);
        logger.info(`Bulk create: job ${job.id} (${job.slug}) created`);
      },
      logger,
      runInBackground,
    );
  }

  /** Stores the requests and returns how many were queued, without waiting for any to be created. */
  submit(requests: readonly JobRequest[]): number {
    this.queue.enqueue(...requests);
    return requests.length;
  }

  /** Jobs still waiting to be created. */
  get pending(): number {
    return this.queue.size;
  }

  idle(): Promise<void> {
    return this.queue.idle();
  }
}
