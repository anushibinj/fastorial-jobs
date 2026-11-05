import { describe, expect, it } from "vitest";
import { InProcessEventBus, type JobPostCreated, type RunInBackground } from "@/server/events/event-bus";
import { MemoryLogger } from "@/server/testing/fakes.testkit";

const event = { type: "JobPostCreated", job: { id: 1 }, occurredAt: new Date(0) } as unknown as JobPostCreated;

/** Collects background tasks so a test decides when they run. */
function queue() {
  const tasks: Array<() => Promise<void>> = [];
  const run: RunInBackground = (t) => void tasks.push(t);
  return { tasks, run, flush: () => Promise.all(tasks.splice(0).map((t) => t())) };
}

describe("InProcessEventBus", () => {
  it("returns from publish before any listener runs", async () => {
    const q = queue();
    const seen: string[] = [];
    const bus = new InProcessEventBus(new MemoryLogger(), q.run);
    bus.subscribe("JobPostCreated", () => void seen.push("handled"));
    bus.publish(event);
    expect(seen).toEqual([]);
    await q.flush();
    expect(seen).toEqual(["handled"]);
  });

  it("gives every listener the event", async () => {
    const q = queue();
    const got: unknown[] = [];
    const bus = new InProcessEventBus(new MemoryLogger(), q.run);
    bus.subscribe("JobPostCreated", (e) => void got.push(e));
    bus.subscribe("JobPostCreated", async (e) => void got.push(e));
    bus.publish(event);
    await q.flush();
    expect(got).toEqual([event, event]);
  });

  it("logs a failing listener and still runs the others", async () => {
    const q = queue();
    const logger = new MemoryLogger();
    const seen: string[] = [];
    const bus = new InProcessEventBus(logger, q.run);
    bus.subscribe("JobPostCreated", () => {
      throw new Error("boom");
    });
    bus.subscribe("JobPostCreated", async () => {
      throw new Error("async boom");
    });
    bus.subscribe("JobPostCreated", () => void seen.push("ok"));
    bus.publish(event);
    await q.flush();
    expect(seen).toEqual(["ok"]);
    expect(logger.errors.map((e) => e.message)).toEqual(["Listener for JobPostCreated failed", "Listener for JobPostCreated failed"]);
  });

  it("schedules nothing when nobody listens", () => {
    const q = queue();
    new InProcessEventBus(new MemoryLogger(), q.run).publish(event);
    expect(q.tasks).toEqual([]);
  });

  it("runs listeners immediately by default", async () => {
    const seen: string[] = [];
    const bus = new InProcessEventBus(new MemoryLogger());
    bus.subscribe("JobPostCreated", () => void seen.push("x"));
    bus.publish(event);
    await Promise.resolve();
    expect(seen).toEqual(["x"]);
  });
});
