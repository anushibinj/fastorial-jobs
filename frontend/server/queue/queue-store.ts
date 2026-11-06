import type { Database } from "@/server/db/database";

/** One stored queue item, as handed to the worker. */
export interface QueueItem {
  id: number;
  payload: unknown;
}

/** The durable side of a queue. Items are stored in order and claimed one at a time. */
export interface QueueStore {
  /** Stores the payloads, in order, in one statement. */
  insert(queue: string, payloads: readonly unknown[]): Promise<void>;
  /**
   * Claims the oldest waiting item, or null. Returns null while another item of the same queue is still
   * being processed (on any server instance), so a queue never runs two items at once. An item whose
   * claim is older than `leaseMs` (a worker that died) counts as waiting again.
   */
  claim(queue: string, leaseMs: number): Promise<QueueItem | null>;
  /** Removes a finished item. */
  complete(id: number): Promise<void>;
  /** Keeps a failed item, marked FAILED with the error, and never claims it again. */
  fail(id: number, error: string): Promise<void>;
}

interface ClaimRow {
  id: number;
  payload: unknown;
}

/** `QueueStore` over the `queue_items` table. */
export class PgQueueStore implements QueueStore {
  constructor(private readonly db: Database) {}

  async insert(queue: string, payloads: readonly unknown[]): Promise<void> {
    if (payloads.length === 0) return;
    await this.db.query(
      "INSERT INTO queue_items (queue, payload) SELECT $1, value FROM jsonb_array_elements($2::jsonb) WITH ORDINALITY AS t(value, n) ORDER BY n",
      [queue, JSON.stringify(payloads)],
    );
  }

  claim(queue: string, leaseMs: number): Promise<QueueItem | null> {
    return this.db.transaction(async (tx) => {
      // Serializes claims of one queue across instances, so the "is one running" check below cannot race.
      await tx.query("SELECT pg_advisory_xact_lock(hashtext($1))", [queue]);
      const busy = await tx.query(
        "SELECT 1 FROM queue_items WHERE queue = $1 AND status = 'PROCESSING' AND locked_at > now() - $2 * interval '1 millisecond' LIMIT 1",
        [queue, leaseMs],
      );
      if (busy.rowCount > 0) return null;
      const claimed = await tx.query<ClaimRow>(
        `UPDATE queue_items SET status = 'PROCESSING', locked_at = now(), attempts = attempts + 1
         WHERE id = (SELECT id FROM queue_items WHERE queue = $1 AND status IN ('PENDING', 'PROCESSING') ORDER BY id LIMIT 1)
         RETURNING id, payload`,
        [queue],
      );
      return claimed.rows[0] ?? null;
    });
  }

  async complete(id: number): Promise<void> {
    await this.db.query("DELETE FROM queue_items WHERE id = $1", [id]);
  }

  async fail(id: number, error: string): Promise<void> {
    await this.db.query("UPDATE queue_items SET status = 'FAILED', last_error = $2, locked_at = NULL WHERE id = $1", [id, error.slice(0, 500)]);
  }
}
