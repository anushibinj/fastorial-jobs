import { describe, expect, it } from "vitest";
import { SerialQueue } from "@/server/queue/serial-queue";
import { MemoryLogger } from "@/server/testing/fakes.testkit";

describe("SerialQueue", () => {
  it("returns from enqueue before any item is handled", async () => {
    const seen: number[] = [];
    const q = new SerialQueue<number>("t", async (n) => void seen.push(n), new MemoryLogger(), (task) => void Promise.resolve().then(task));
    q.enqueue(1, 2);
    expect(seen).toEqual([]);
    expect(q.size).toBe(2);
    await q.idle();
    expect(seen).toEqual([1, 2]);
  });

  it("handles one item at a time, in order", async () => {
    let running = 0;
    let peak = 0;
    const seen: number[] = [];
    const q = new SerialQueue<number>("t", async (n) => {
      peak = Math.max(peak, ++running);
      await new Promise((r) => setTimeout(r, 2));
      seen.push(n);
      running--;
    }, new MemoryLogger());
    q.enqueue(1, 2, 3);
    q.enqueue(4);
    await q.idle();
    expect(peak).toBe(1);
    expect(seen).toEqual([1, 2, 3, 4]);
  });

  it("logs a failing item and carries on", async () => {
    const logger = new MemoryLogger();
    const seen: number[] = [];
    const q = new SerialQueue<number>("t", async (n) => {
      if (n === 2) throw new Error("boom");
      seen.push(n);
    }, logger);
    q.enqueue(1, 2, 3);
    await q.idle();
    expect(seen).toEqual([1, 3]);
  });

  it("restarts the worker for items queued after it went idle", async () => {
    const seen: number[] = [];
    const q = new SerialQueue<number>("t", async (n) => void seen.push(n), new MemoryLogger());
    q.enqueue(1);
    await q.idle();
    q.enqueue(2);
    await q.idle();
    expect(seen).toEqual([1, 2]);
  });
});
