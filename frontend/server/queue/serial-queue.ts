import { fireAndForget, type RunInBackground } from "@/server/events/event-bus";
import type { Logger } from "@/server/shared/logger";

/**
 * In-memory FIFO queue with one worker. `enqueue` stores the item and returns at once; the worker
 * (started in the background when the queue goes from empty to busy) handles items strictly one at a
 * time, in arrival order. A handler that throws is logged and the worker moves on to the next item.
 *
 * Items live in this process only: they are lost on restart, and each server instance has its own queue.
 */
export class SerialQueue<T> {
  private readonly items: T[] = [];
  private draining = false;
  private idleWaiters: Array<() => void> = [];

  constructor(
    private readonly name: string,
    private readonly handler: (item: T) => Promise<void>,
    private readonly logger: Logger,
    private readonly runInBackground: RunInBackground = fireAndForget,
  ) {}

  /** Items waiting, not counting the one being handled. */
  get size(): number {
    return this.items.length;
  }

  /** Stores the items and returns right away. */
  enqueue(...items: T[]): void {
    if (items.length === 0) return;
    this.items.push(...items);
    this.start();
  }

  /** Resolves once nothing is waiting or running. For tests and graceful shutdown. */
  idle(): Promise<void> {
    if (!this.draining && this.items.length === 0) return Promise.resolve();
    return new Promise((resolve) => this.idleWaiters.push(resolve));
  }

  private start(): void {
    if (this.draining) return;
    this.draining = true;
    this.runInBackground(() => this.drain());
  }

  private async drain(): Promise<void> {
    try {
      for (let item = this.items.shift(); item !== undefined; item = this.items.shift()) {
        try {
          await this.handler(item);
        } catch (error) {
          this.logger.error(`Queue ${this.name}: item failed`, error);
        }
      }
    } finally {
      this.draining = false;
      const waiters = this.idleWaiters;
      this.idleWaiters = [];
      waiters.forEach((resolve) => resolve());
    }
  }
}
