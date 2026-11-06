import type { JobDetail } from "@/lib/api/contract";
import type { RunInBackground } from "@/server/events/event-bus";
import type { PostintimePublisher, PushOutcome } from "@/server/postintime/postintime-publisher";
import { DurableQueue } from "@/server/queue/durable-queue";
import type { QueueStore } from "@/server/queue/queue-store";
import type { Logger } from "@/server/shared/logger";

/** What is stored: which job, and whether it was created just now (automatic) or pushed by hand. */
interface Entry {
  kind: "auto" | "manual";
  jobId: number;
}

/**
 * Every push to PostInTime, automatic or from an admin button, waits here and is sent one at a time.
 * Adding returns at once (memory inbox only); the entry is flushed to the database and picked from
 * there. The job is loaded again when its turn comes, so the post shows its current data. The outcome
 * of each push is saved as the PostInTime "last result".
 */
export class PostintimeQueue {
  private readonly queue: DurableQueue<Entry>;

  constructor(
    publisher: PostintimePublisher,
    loadJob: (id: number) => Promise<JobDetail>,
    store: QueueStore,
    logger: Logger,
    runInBackground?: RunInBackground,
  ) {
    this.queue = new DurableQueue<Entry>(
      "postintime",
      store,
      async ({ kind, jobId }) => {
        const job = await loadJob(jobId);
        if (kind === "auto") await publisher.onJobPostCreated({ type: "JobPostCreated", job, occurredAt: new Date() });
        else await publisher.publishJob(job);
      },
      logger,
      runInBackground,
    );
  }

  /** Queues the push of a freshly created job (skipped later if the connection is off or the job is a draft). */
  enqueueCreated(job: JobDetail): void {
    this.queue.enqueue({ kind: "auto", jobId: job.id });
  }

  /** Queues a push started by hand. Drafts are refused up front; other problems show up as the last result. */
  enqueueManual(job: JobDetail): PushOutcome {
    if (job.status === "DRAFT") return { ok: false, message: `Job ${job.id} is a draft; publish it first` };
    this.queue.enqueue({ kind: "manual", jobId: job.id });
    return { ok: true, message: `Job ${job.id} queued for PostInTime` };
  }

  /** Continues pushes left in the database by an earlier run. */
  resume(): void {
    this.queue.resume();
  }

  idle(): Promise<void> {
    return this.queue.idle();
  }
}
