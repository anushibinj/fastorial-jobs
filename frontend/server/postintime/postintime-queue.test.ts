import { describe, expect, it } from "vitest";
import type { JobDetail } from "@/lib/api/contract";
import { PostintimeQueue } from "@/server/postintime/postintime-queue";
import type { PostintimePublisher } from "@/server/postintime/postintime-publisher";
import { MemoryLogger } from "@/server/testing/fakes.testkit";

const job = (id: number, status = "PUBLISHED") => ({ id, status }) as unknown as JobDetail;

describe("PostintimeQueue", () => {
  it("sends automatic and manual pushes one at a time, in order", async () => {
    let running = 0;
    let peak = 0;
    const order: string[] = [];
    const slow = async (label: string) => {
      peak = Math.max(peak, ++running);
      await new Promise((r) => setTimeout(r, 2));
      order.push(label);
      running--;
    };
    const publisher = {
      onJobPostCreated: ({ job: j }: { job: JobDetail }) => slow(`auto${j.id}`),
      publishJob: (j: JobDetail) => slow(`manual${j.id}`).then(() => ({ ok: true, message: "" })),
    } as unknown as PostintimePublisher;
    const q = new PostintimeQueue(publisher, new MemoryLogger());
    q.enqueueCreated({ type: "JobPostCreated", job: job(1), occurredAt: new Date() });
    expect(q.enqueueManual(job(2)).ok).toBe(true);
    q.enqueueCreated({ type: "JobPostCreated", job: job(3), occurredAt: new Date() });
    await q.idle();
    expect(peak).toBe(1);
    expect(order).toEqual(["auto1", "manual2", "auto3"]);
  });

  it("refuses a draft up front without queuing it", async () => {
    const calls: number[] = [];
    const publisher = { publishJob: async (j: JobDetail) => void calls.push(j.id) } as unknown as PostintimePublisher;
    const q = new PostintimeQueue(publisher, new MemoryLogger());
    expect(q.enqueueManual(job(5, "DRAFT")).ok).toBe(false);
    await q.idle();
    expect(calls).toEqual([]);
  });
});
