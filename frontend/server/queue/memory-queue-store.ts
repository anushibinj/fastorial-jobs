import type { QueueItem, QueueStore } from "@/server/queue/queue-store";

interface Row {
  id: number;
  queue: string;
  payload: unknown;
  status: "PENDING" | "PROCESSING" | "FAILED";
  error?: string;
  lockedAt?: number;
}

/** `QueueStore` kept in a list, for unit tests. Payloads go through JSON like they do in the database. */
export class InMemoryQueueStore implements QueueStore {
  readonly rows: Row[] = [];
  private nextId = 1;

  async insert(queue: string, payloads: readonly unknown[]): Promise<void> {
    for (const payload of payloads) {
      this.rows.push({ id: this.nextId++, queue, payload: JSON.parse(JSON.stringify(payload)), status: "PENDING" });
    }
  }

  async claim(queue: string, leaseMs: number): Promise<QueueItem | null> {
    const mine = this.rows.filter((r) => r.queue === queue);
    if (mine.some((r) => r.status === "PROCESSING" && Date.now() - (r.lockedAt ?? 0) < leaseMs)) return null;
    const row = mine.find((r) => r.status !== "FAILED");
    if (!row) return null;
    row.status = "PROCESSING";
    row.lockedAt = Date.now();
    return { id: row.id, payload: row.payload };
  }

  async complete(id: number): Promise<void> {
    const i = this.rows.findIndex((r) => r.id === id);
    if (i >= 0) this.rows.splice(i, 1);
  }

  async fail(id: number, error: string): Promise<void> {
    const row = this.rows.find((r) => r.id === id);
    if (row) Object.assign(row, { status: "FAILED", error });
  }
}
