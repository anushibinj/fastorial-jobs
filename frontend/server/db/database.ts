import { Pool, types, type PoolClient, type PoolConfig, type QueryResultRow } from "pg";
import type { DatabaseConfig } from "@/server/config/app-config";

/** The rows and affected row count of one SQL statement. */
export interface SqlResult<R> {
  rows: R[];
  rowCount: number;
}

/** Runs parameterized SQL (`$1`, `$2`, ...). Implemented by the pool and by an open transaction. */
export interface SqlExecutor {
  query<R extends QueryResultRow = QueryResultRow>(sql: string, params?: readonly unknown[]): Promise<SqlResult<R>>;
}

/**
 * The database port used by repositories and the migrator. Depending on this interface rather than on
 * `pg` keeps the rest of the code independent of the driver and lets tests substitute it.
 */
export interface Database extends SqlExecutor {
  /**
   * Runs `work` inside one transaction on one connection: commits when it resolves, rolls back when it
   * throws. Replaces Spring's `@Transactional`.
   */
  transaction<T>(work: (tx: SqlExecutor) => Promise<T>): Promise<T>;
  /** Closes every connection. Used by tests and on shutdown. */
  close(): Promise<void>;
}

/** PostgreSQL type OID of `bigint` / `int8`, returned for `BIGINT` columns and `count(*)`. */
const INT8_OID = 20;

/**
 * node-postgres returns `bigint` values as strings, because they can exceed JavaScript's exact integer
 * range. Every bigint in this schema (ids, salaries, counts) is far below 2^53, so it is parsed as a
 * number; a value that would lose precision raises an error instead of being silently rounded.
 */
export function parseInt8(value: string): number {
  const n = Number(value);
  if (!Number.isSafeInteger(n)) throw new Error(`bigint value ${value} exceeds Number.MAX_SAFE_INTEGER`);
  return n;
}

/** Type parsers for this app: int8 as number, everything else as node-postgres does by default. */
const TYPE_PARSERS = {
  getTypeParser: ((oid: number, format?: "text" | "binary") =>
    oid === INT8_OID ? parseInt8 : types.getTypeParser(oid, format as "text")) as typeof types.getTypeParser,
};

/**
 * Translates the app's database settings into a node-postgres pool configuration. The values mirror
 * the former HikariCP settings: `maximum-pool-size=DB_POOL_SIZE`, `minimum-idle=1`,
 * `connection-timeout=10s`, and Hikari's defaults of 10 minutes idle timeout and 30 minutes lifetime.
 */
export function toPoolConfig(config: DatabaseConfig): PoolConfig {
  return {
    host: config.host,
    port: config.port,
    database: config.database,
    user: config.user,
    password: config.password,
    ssl: config.ssl,
    max: config.poolSize,
    min: 1,
    connectionTimeoutMillis: 10_000,
    idleTimeoutMillis: 600_000,
    maxLifetimeSeconds: 1_800,
    application_name: "fastorial-jobs",
    options: config.searchPath ? `-c search_path=${config.searchPath}` : undefined,
    types: TYPE_PARSERS,
  };
}

/** Wraps a pool or a checked out client as an executor that returns plain `SqlResult`s. */
function executorFor(target: Pool | PoolClient): SqlExecutor {
  return {
    async query<R extends QueryResultRow>(sql: string, params: readonly unknown[] = []) {
      const result = await target.query<R>(sql, params as unknown[]);
      return { rows: result.rows, rowCount: result.rowCount ?? 0 };
    },
  };
}

/** `Database` backed by a node-postgres connection pool. */
export class PgDatabase implements Database {
  private readonly executor: SqlExecutor;

  constructor(private readonly pool: Pool) {
    this.executor = executorFor(pool);
  }

  /** Runs one statement on any pooled connection (autocommit). */
  query<R extends QueryResultRow = QueryResultRow>(sql: string, params?: readonly unknown[]): Promise<SqlResult<R>> {
    return this.executor.query<R>(sql, params);
  }

  /**
   * Checks out one connection, runs BEGIN, the work, then COMMIT, or ROLLBACK when the work throws.
   * A connection whose ROLLBACK also failed is discarded rather than returned to the pool, because its
   * state is unknown.
   */
  async transaction<T>(work: (tx: SqlExecutor) => Promise<T>): Promise<T> {
    const client = await this.pool.connect();
    let broken = false;
    try {
      await client.query("BEGIN");
      const result = await work(executorFor(client));
      await client.query("COMMIT");
      return result;
    } catch (error) {
      try {
        await client.query("ROLLBACK");
      } catch {
        broken = true;
      }
      throw error;
    } finally {
      client.release(broken);
    }
  }

  /** Ends the pool. */
  close(): Promise<void> {
    return this.pool.end();
  }
}

/** Creates a `Database` with a new pool for the given settings. Connections are opened lazily. */
export function createDatabase(config: DatabaseConfig): Database {
  return new PgDatabase(new Pool(toPoolConfig(config)));
}
