import { describe, expect, it, vi } from "vitest";
import type { Database } from "@/server/db/database";
import { RETRY_AFTER_MS, SchemaGate, SchemaGatedDatabase } from "@/server/db/schema-gate";
import { MemoryLogger } from "@/server/testing/fakes.testkit";

/** A clock in milliseconds that tests move by hand. */
function manualClock() {
  let now = 1_000_000;
  return { now: () => now, advance: (ms: number) => (now += ms) };
}

describe("SchemaGate.ready", () => {
  it("migrates once and then resolves without migrating again", async () => {
    const migrate = vi.fn(async () => ["1"]);
    const gate = new SchemaGate(migrate, new MemoryLogger());
    await gate.ready();
    await gate.ready();
    expect(migrate).toHaveBeenCalledOnce();
  });

  it("lets concurrent callers share one migration attempt", async () => {
    let finish!: () => void;
    const migrate = vi.fn(() => new Promise<void>((resolve) => (finish = resolve)));
    const gate = new SchemaGate(migrate, new MemoryLogger());
    const both = Promise.all([gate.ready(), gate.ready()]);
    finish();
    await both;
    expect(migrate).toHaveBeenCalledOnce();
  });

  it("logs a failure, answers with it during the cooldown, then retries", async () => {
    const clock = manualClock();
    const logger = new MemoryLogger();
    const migrate = vi.fn().mockRejectedValueOnce(new Error("db down")).mockResolvedValueOnce([]);
    const gate = new SchemaGate(migrate, logger, RETRY_AFTER_MS, clock.now);

    await expect(gate.ready()).rejects.toThrow("db down");
    expect(logger.errors[0].message).toContain("Database migration failed");

    clock.advance(RETRY_AFTER_MS - 1);
    await expect(gate.ready()).rejects.toThrow("db down"); // still cooling down, no new attempt
    expect(migrate).toHaveBeenCalledTimes(1);

    clock.advance(1);
    await expect(gate.ready()).resolves.toBeUndefined(); // the database is back
    expect(migrate).toHaveBeenCalledTimes(2);
    await gate.ready();
    expect(migrate).toHaveBeenCalledTimes(2);
  });
});

describe("SchemaGatedDatabase", () => {
  function inner() {
    const calls: string[] = [];
    const db: Database = {
      query: async (sql) => (calls.push(sql), { rows: [], rowCount: 0 }),
      transaction: async (work) => (calls.push("transaction"), work(db)),
      close: async () => void calls.push("close"),
    };
    return { db, calls };
  }

  it("runs statements and transactions once the schema is ready", async () => {
    const { db, calls } = inner();
    const gated = new SchemaGatedDatabase(db, { ready: async () => undefined });
    await gated.query("SELECT 1");
    await gated.transaction(async () => "done");
    expect(calls).toEqual(["SELECT 1", "transaction"]);
  });

  it("does not touch the database while the schema is not ready", async () => {
    const { db, calls } = inner();
    const gated = new SchemaGatedDatabase(db, { ready: () => Promise.reject(new Error("migration failed")) });
    await expect(gated.query("SELECT 1")).rejects.toThrow("migration failed");
    await expect(gated.transaction(async () => 1)).rejects.toThrow("migration failed");
    expect(calls).toEqual([]);
  });

  it("close closes the inner database even when the schema is not ready", async () => {
    const { db, calls } = inner();
    await new SchemaGatedDatabase(db, { ready: () => Promise.reject(new Error("x")) }).close();
    expect(calls).toEqual(["close"]);
  });
});
