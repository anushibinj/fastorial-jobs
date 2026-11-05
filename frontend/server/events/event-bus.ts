import type { JobDetail } from "@/lib/api/contract";
import type { Logger } from "@/server/shared/logger";

/** A job was created through the admin UI or the API. Published once the transaction has committed. */
export interface JobPostCreated {
  readonly type: "JobPostCreated";
  readonly job: JobDetail;
  readonly occurredAt: Date;
}

/** Every event the application publishes. Add a member here to add an event. */
export type AppEvent = JobPostCreated;

type EventOf<T extends AppEvent["type"]> = Extract<AppEvent, { type: T }>;
export type EventHandler<T extends AppEvent["type"]> = (event: EventOf<T>) => Promise<void> | void;

/** What services need to announce that something happened. They never know who listens. */
export interface EventPublisher {
  publish(event: AppEvent): void;
}

/** What the composition root needs to attach listeners. */
export interface EventSubscriber {
  subscribe<T extends AppEvent["type"]>(type: T, handler: EventHandler<T>): void;
}

/**
 * Runs `task` after the current request has been answered, and keeps the server instance alive until
 * it finishes where the host supports that (Next.js `after()` on Cloud Run / App Hosting).
 */
export type RunInBackground = (task: () => Promise<void>) => void;

/** Runs `task` right away without waiting for it. Used when no request scope exists (scripts, tests). */
export const fireAndForget: RunInBackground = (task) => void task();

/**
 * In process event bus. `publish` returns at once; the listeners run in the background, so a slow or
 * failing listener can never delay or fail the request that produced the event. A listener that
 * throws is logged and does not stop the other listeners.
 */
export class InProcessEventBus implements EventPublisher, EventSubscriber {
  private readonly handlers = new Map<AppEvent["type"], Array<(event: AppEvent) => Promise<void> | void>>();

  constructor(
    private readonly logger: Logger,
    private readonly runInBackground: RunInBackground = fireAndForget,
  ) {}

  subscribe<T extends AppEvent["type"]>(type: T, handler: EventHandler<T>): void {
    // The map is keyed by type, so a handler only ever receives events of the type it subscribed to.
    const typed = (event: AppEvent) => handler(event as EventOf<T>);
    this.handlers.set(type, [...(this.handlers.get(type) ?? []), typed]);
  }

  publish(event: AppEvent): void {
    const handlers = this.handlers.get(event.type) ?? [];
    if (handlers.length === 0) return;
    this.runInBackground(async () => {
      await Promise.all(
        handlers.map(async (handler) => {
          try {
            await handler(event);
          } catch (error) {
            this.logger.error(`Listener for ${event.type} failed`, error);
          }
        }),
      );
    });
  }
}
