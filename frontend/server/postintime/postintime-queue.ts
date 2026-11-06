import type { JobDetail } from "@/lib/api/contract";
import type { JobPostCreated, RunInBackground } from "@/server/events/event-bus";
import type { PostintimePublisher, PushOutcome } from "@/server/postintime/postintime-publisher";
import { SerialQueue } from "@/server/queue/serial-queue";
import type { Logger } from "@/server/shared/logger";

type Entry = { kind: "auto"; event: JobPostCreated } | { kind: "manual"; job: JobDetail };

/**
 * Every push to PostInTime, automatic or from an admin button, waits here and is sent one at a time.
 * Adding returns at once; the outcome of each push is saved as the PostInTime "last result".
 */
export class PostintimeQueue {
  private readonly queue: SerialQueue<Entry>;

  constructor(publisher: PostintimePublisher, logger: Logger, runInBackground?: RunInBackground) {
    this.queue = new SerialQueue<Entry>(
      "postintime",
      async (entry) => {
        if (entry.kind === "auto") await publisher.onJobPostCreated(entry.event);
        else await publisher.publishJob(entry.job);
      },
      logger,
      runInBackground,
    );
  }

  /** Queues the push of a freshly created job (skipped later if the connection is off or the job is a draft). */
  enqueueCreated(event: JobPostCreated): void {
    this.queue.enqueue({ kind: "auto", event });
  }

  /** Queues a push started by hand. Drafts are refused up front; other problems show up as the last result. */
  enqueueManual(job: JobDetail): PushOutcome {
    if (job.status === "DRAFT") return { ok: false, message: `Job ${job.id} is a draft; publish it first` };
    this.queue.enqueue({ kind: "manual", job });
    return { ok: true, message: `Job ${job.id} queued for PostInTime` };
  }

  idle(): Promise<void> {
    return this.queue.idle();
  }
}
