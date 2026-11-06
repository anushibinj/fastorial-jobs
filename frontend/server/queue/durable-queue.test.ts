import { describe, expect, it } from "vitest";
import { DurableQueue } from "@/server/queue/durable-queue";
import { InMemoryQueueStore } from "@/server/queue/memory-queue-store";
import type { QueueStore } from "@/server/queue/queue-store";
import { MemoryLogger } from "@/server/testing/fakes.testkit";

/** Tasks run only when the test says so, to look at the stages in between. */
function manual() {
  const tasks: Array<() => Promise<void>> = [];
  return { run: (t: () => Promise<void>) => void tasks.push(t), tasks };
}

describe("DurableQueue", () => {
  it("only fills the inbox on enqueue: nothing reaches the store or the handler yet", async () => {
    const store = new InMemoryQueueStore();
    const seen: number[] = [];
    const bg = manual();
    const q = new DurableQueue<number>("t", store, async (n) => void seen.push(n), new MemoryLogger(), bg.run);
    q.enqueue(1, 2);
    expect(q.inboxSize).toBe(2);
    expect(store.rows).toEqual([]);
    expect(seen).toEqual([]);
  });

  it("flushes the inbox to the store, then processes from the store, in order", async () => {
    const store = new InMemoryQueueStore();
    const seen: number[] = [];
    const bg = manual();
    const q = new DurableQueue<number>("t", store, async (n) => void seen.push(n), new MemoryLogger(), bg.run);
    q.enqueue(1, 2, 3);
    await bg.tasks.shift()!(); // the flusher
    expect(q.inboxSize).toBe(0);
    expect(store.rows.map((r) => r.payload)).toEqual([1, 2, 3]);
    expect(seen).toEqual([]);
    await bg.tasks.shift()!(); // the worker
    expect(seen).toEqual([1, 2, 3]);
    expect(store.rows).toEqual([]);
  });

  it("handles one item at a time", async () => {
    let running = 0;
    let peak = 0;
    const q = new DurableQueue<number>("t", new InMemoryQueueStore(), async () => {
      peak = Math.max(peak, ++running);
      await new Promise((r) => setTimeout(r, 2));
      running--;
    }, new MemoryLogger());
    q.enqueue(1, 2, 3);
    q.enqueue(4);
    await q.idle();
    expect(peak).toBe(1);
  });

  it("keeps a failing item as FAILED with its error and carries on", async () => {
    const store = new InMemoryQueueStore();
    const logger = new MemoryLogger();
    const seen: number[] = [];
    const q = new DurableQueue<number>("t", store, async (n) => {
      if (n === 2) throw new Error("boom");
      seen.push(n);
    }, logger);
    q.enqueue(1, 2, 3);
    await q.idle();
    expect(seen).toEqual([1, 3]);
    expect(store.rows).toMatchObject([{ payload: 2, status: "FAILED", error: "boom" }]);
    expect(logger.errors).toHaveLength(1);
  });

  it("keeps items in the inbox when the store refuses them, and stores them on retry", async () => {
    const real = new InMemoryQueueStore();
    let failures = 1;
    const store: QueueStore = {
      insert: (queue, payloads) => (failures-- > 0 ? Promise.reject(new Error("db down")) : real.insert(queue, payloads)),
      claim: (q, l) => real.claim(q, l),
      complete: (id) => real.complete(id),
      fail: (id, e) => real.fail(id, e),
    };
    const seen: number[] = [];
    const q = new DurableQueue<number>("t", store, async (n) => void seen.push(n), new MemoryLogger());
    q.enqueue(1, 2);
    await q.idle();
    expect(seen).toEqual([1, 2]);
  });

  it("resume() processes items an earlier run left in the store", async () => {
    const store = new InMemoryQueueStore();
    await store.insert("t", [7, 8]);
    const seen: number[] = [];
    const q = new DurableQueue<number>("t", store, async (n) => void seen.push(n), new MemoryLogger());
    q.resume();
    await q.idle();
    expect(seen).toEqual([7, 8]);
  });

  it("does not claim the next item while another is still being processed", async () => {
    const store = new InMemoryQueueStore();
    await store.insert("t", [1, 2]);
    const first = await store.claim("t", 60_000);
    expect(first?.payload).toBe(1);
    expect(await store.claim("t", 60_000)).toBeNull();
  });
});
