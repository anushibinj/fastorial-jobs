import type { Pool } from "pg";
import { describe, expect, it, vi } from "vitest";
import { createDatabase, logIdleConnectionErrors, parseInt8, PgDatabase, toPoolConfig, type Database } from "@/server/db/database";
import { MemoryLogger } from "@/server/testing/fakes.testkit";
import { pgUnitOfWork } from "@/server/db/unit-of-work";

const settings = {
  host: "db", port: 5432, database: "app", user: "u", password: "p", ssl: false as const, poolSize: 5,
};

describe("parseInt8", () => {
  it("parses safe bigints as numbers", () => {
    expect(parseInt8("42")).toBe(42);
    expect(parseInt8("-9007199254740991")).toBe(-9007199254740991);
  });

  it("refuses values that would lose precision", () => {
    expect(() => parseInt8("9007199254740993")).toThrow(/MAX_SAFE_INTEGER/);
  });
});

describe("toPoolConfig", () => {
  it("mirrors the former HikariCP settings", () => {
    const c = toPoolConfig(settings);
    expect(c).toMatchObject({
      host: "db", port: 5432, database: "app", user: "u", password: "p", ssl: false,
      max: 5, min: 1, connectionTimeoutMillis: 10_000, idleTimeoutMillis: 600_000, maxLifetimeSeconds: 1_800,
      application_name: "fastorial-jobs", options: undefined,
    });
  });

  it("sets the search path when a schema is configured", () => {
    expect(toPoolConfig({ ...settings, searchPath: "test_1" }).options).toBe("-c search_path=test_1");
  });

  it("parses int8 columns as numbers and leaves other types to node-postgres", () => {
    const parsers = toPoolConfig(settings).types!;
    expect(parsers.getTypeParser(20, "text")("7")).toBe(7);
    expect(parsers.getTypeParser(23, "text")("7")).toBe(7); // int4, node-postgres default
    expect(parsers.getTypeParser(25, "text")("x")).toBe("x"); // text
  });
});

/** A fake pg pool and client that record statements. */
function fakePool(options: { failOn?: string; rollbackFails?: boolean } = {}) {
  const statements: string[] = [];
  const release = vi.fn();
  const run = async (sql: string) => {
    statements.push(sql);
    if (sql === "ROLLBACK" && options.rollbackFails) throw new Error("connection lost");
    if (options.failOn && sql.includes(options.failOn)) throw new Error(`failed: ${sql}`);
    return { rows: [{ ok: true }], rowCount: 1 };
  };
  const pool = {
    query: run,
    connect: async () => ({ query: run, release }),
    end: vi.fn(async () => undefined),
  };
  return { pool: pool as unknown as Pool, statements, release, end: pool.end };
}

describe("PgDatabase", () => {
  it("query returns rows and the row count", async () => {
    const { pool } = fakePool();
    expect(await new PgDatabase(pool).query("SELECT 1")).toEqual({ rows: [{ ok: true }], rowCount: 1 });
  });

  it("transaction wraps the work in BEGIN and COMMIT and releases the connection", async () => {
    const { pool, statements, release } = fakePool();
    const result = await new PgDatabase(pool).transaction(async (tx) => (await tx.query("UPDATE x")).rowCount);
    expect(result).toBe(1);
    expect(statements).toEqual(["BEGIN", "UPDATE x", "COMMIT"]);
    expect(release).toHaveBeenCalledWith(false);
  });

  it("transaction rolls back when the work throws and rethrows the error", async () => {
    const { pool, statements, release } = fakePool({ failOn: "UPDATE" });
    await expect(new PgDatabase(pool).transaction((tx) => tx.query("UPDATE x"))).rejects.toThrow("failed: UPDATE x");
    expect(statements).toEqual(["BEGIN", "UPDATE x", "ROLLBACK"]);
    expect(release).toHaveBeenCalledWith(false);
  });

  it("discards a connection whose rollback also failed", async () => {
    const { pool, release } = fakePool({ failOn: "UPDATE", rollbackFails: true });
    await expect(new PgDatabase(pool).transaction((tx) => tx.query("UPDATE x"))).rejects.toThrow("failed: UPDATE x");
    expect(release).toHaveBeenCalledWith(true);
  });

  it("close ends the pool", async () => {
    const { pool, end } = fakePool();
    await new PgDatabase(pool).close();
    expect(end).toHaveBeenCalled();
  });
});

describe("logIdleConnectionErrors", () => {
  it("registers an error listener on the pool that logs instead of crashing", () => {
    const handlers: Record<string, (e: Error) => void> = {};
    const pool = { on: (event: string, handler: (e: Error) => void) => ((handlers[event] = handler), pool) };
    const logger = new MemoryLogger();
    logIdleConnectionErrors(pool as never, logger);
    const error = new Error("terminating connection due to administrator command");
    handlers.error(error);
    expect(logger.errors).toEqual([{ message: "An idle database connection failed and was discarded", error }]);
  });
});

describe("createDatabase", () => {
  it("creates a database without connecting", async () => {
    const db = createDatabase(settings);
    expect(db).toBeInstanceOf(PgDatabase);
    await db.close();
  });
});

describe("pgUnitOfWork", () => {
  it("read uses repositories over the pool, write over a transaction", async () => {
    const executors: string[] = [];
    const tx = { query: async () => ({ rows: [], rowCount: 0 }) };
    const db: Database = {
      query: async () => ({ rows: [], rowCount: 0 }),
      transaction: async (work) => {
        executors.push("transaction");
        return work(tx);
      },
      close: async () => undefined,
    };
    const uow = pgUnitOfWork(db, (executor) => ({ executor }));
    expect(await uow.read(async ({ executor }) => executor === db)).toBe(true);
    expect(await uow.write(async ({ executor }) => executor === tx)).toBe(true);
    expect(executors).toEqual(["transaction"]);
  });
});
