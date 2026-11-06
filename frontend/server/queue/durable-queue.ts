import { fireAndForget, type RunInBackground } from "@/server/events/event-bus";
import type { QueueStore } from "@/server/queue/queue-store";
import type { Logger } from "@/server/shared/logger";

/** How long a claimed item may run before another worker may take it over (a crashed worker). */
const LEASE_MS = 10 * 60_000;
/** Pause before the inbox is flushed again after the database refused it. */
const FLUSH_RETRY_MS = 2_000;

/**
 * A work queue in three stages, so that accepting an item never waits for the database:
 *
 * 1. **Inbox** (memory): `enqueue` pushes the item on an array and returns. Nothing else happens in the
 *    caller's time.
 * 2. **Store** (database): a background flusher writes the whole inbox to the `QueueStore` in one batch.
 * 3. **Worker**: a background worker claims items from the store one at a time, in order, and runs the
 *    handler. Done items are deleted; items whose handler threw are kept as FAILED with the error.
 *
 * Items still in the inbox are lost if the process dies before the flush; flushed items survive and are
 * picked up again by `resume()`. A failed flush keeps the items in the inbox and retries.
 */
export class DurableQueue<T> {
  private inbox: T[] = [];
  private flushing = false;
  private processing = false;
  private retryTimer: ReturnType<typeof setTimeout> | undefined;
  private idleWaiters: Array<() => void> = [];

  constructor(
    private readonly name: string,
    private readonly store: QueueStore,
    private readonly handler: (item: T) => Promise<void>,
    private readonly logger: Logger,
    private readonly runInBackground: RunInBackground = fireAndForget,
    /** Rebuilds an item from its stored JSON (for example to turn date strings back into `Date`s). */
    private readonly decode: (payload: unknown) => T = (payload) => payload as T,
  ) {}

  /** Items in the inbox that are not in the database yet. */
  get inboxSize(): number {
    return this.inbox.length;
  }

  /** Puts the items in the inbox and returns at once. */
  enqueue(...items: T[]): void {
    if (items.length === 0) return;
    this.inbox.push(...items);
    this.startFlusher();
  }

  /** Starts the worker, to handle items left in the database by an earlier run. */
  resume(): void {
    this.startWorker();
  }

  /** Resolves once the inbox is flushed and the worker has nothing left to claim. For tests and shutdown. */
  idle(): Promise<void> {
    if (this.isIdle()) return Promise.resolve();
    return new Promise((resolve) => this.idleWaiters.push(resolve));
  }

  private isIdle(): boolean {
    return !this.flushing && !this.processing && this.inbox.length === 0 && this.retryTimer === undefined;
  }

  private settle(): void {
    if (!this.isIdle()) return;
    const waiters = this.idleWaiters;
    this.idleWaiters = [];
    waiters.forEach((resolve) => resolve());
  }

  private startFlusher(): void {
    if (this.flushing || this.retryTimer !== undefined) return;
    this.flushing = true;
    this.runInBackground(() => this.flush());
  }

  private async flush(): Promise<void> {
    try {
      while (this.inbox.length > 0) {
        const batch = this.inbox;
        this.inbox = [];
        try {
          await this.store.insert(this.name, batch);
        } catch (error) {
          this.inbox = [...batch, ...this.inbox];
          this.logger.error(`Queue ${this.name}: could not store ${batch.length} item(s), will retry`, error);
          this.retryTimer = setTimeout(() => {
            this.retryTimer = undefined;
            this.startFlusher();
            this.settle();
          }, FLUSH_RETRY_MS);
          this.retryTimer.unref?.();
          return;
        }
        this.startWorker();
      }
    } finally {
      this.flushing = false;
      this.settle();
    }
  }

  private startWorker(): void {
    if (this.processing) return;
    this.processing = true;
    this.runInBackground(() => this.work());
  }

  private async work(): Promise<void> {
    try {
      for (;;) {
        const claimed = await this.store.claim(this.name, LEASE_MS);
        if (!claimed) break;
        try {
          await this.handler(this.decode(claimed.payload));
          await this.store.complete(claimed.id);
        } catch (error) {
          this.logger.error(`Queue ${this.name}: item ${claimed.id} failed`, error);
          const message = error instanceof Error ? error.message : String(error);
          await this.store.fail(claimed.id, message);
        }
      }
    } catch (error) {
      // The store itself failed (database down). Items stay stored; the next flush or resume() retries.
      this.logger.error(`Queue ${this.name}: worker stopped`, error);
    } finally {
      this.processing = false;
      this.settle();
    }
  }
}
