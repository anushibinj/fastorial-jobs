import type { QueryResultRow } from "pg";
import type { Database, SqlExecutor, SqlResult } from "@/server/db/database";
import type { Logger } from "@/server/shared/logger";

/** Anything that can say when the schema is ready to use. */
export interface SchemaReadiness {
  /** Resolves once the schema is migrated; rejects while it cannot be. */
  ready(): Promise<void>;
}

/** How long a failed migration is remembered before the next request may retry it. */
export const RETRY_AFTER_MS = 5_000;

/**
 * Makes sure the database schema is migrated before the database is used, and keeps trying until it is.
 *
 * Why not simply migrate once at startup and give up on failure? Because Next.js does not stop the
 * server when the startup hook fails: the process keeps listening, answers every request with a 500,
 * and never runs the hook again. Cloud Run would keep that dead instance in rotation. Tested against
 * the production build: after a database outage during startup, the instance stayed broken even once
 * the database was back. So the migration is a gate in front of every database access instead:
 *
 * - the first caller starts the migration; callers that arrive meanwhile wait for the same attempt;
 * - after a success, `ready()` resolves immediately for the rest of the process's life;
 * - after a failure, the error is logged and callers get it for `retryAfterMs`, so a database outage
 *   does not turn every request into a migration attempt; the first call after that tries again.
 *
 * On a healthy start, `instrumentation.ts` calls `ready()` before the first request, so migrations still
 * run before any query, exactly like Flyway did.
 */
export class SchemaGate implements SchemaReadiness {
  private migrated = false;
  private inFlight: Promise<void> | null = null;
  private lastFailure: { at: number; error: unknown } | null = null;

  /**
   * @param migrate applies pending migrations (rejects when it cannot).
   * @param logger receives one line per failed attempt.
   * @param retryAfterMs how long to answer with the last failure before trying again.
   * @param now clock in milliseconds, replaceable in tests.
   */
  constructor(
    private readonly migrate: () => Promise<unknown>,
    private readonly logger: Logger,
    private readonly retryAfterMs = RETRY_AFTER_MS,
    private readonly now: () => number = Date.now,
  ) {}

  /** Resolves when the schema is migrated; see the class comment for the retry rules. */
  ready(): Promise<void> {
    if (this.migrated) return Promise.resolve();
    if (this.inFlight) return this.inFlight;
    if (this.lastFailure && this.now() - this.lastFailure.at < this.retryAfterMs) {
      return Promise.reject(this.lastFailure.error);
    }
    this.inFlight = this.migrate()
      .then(
        () => {
          this.migrated = true;
          this.lastFailure = null;
        },
        (error: unknown) => {
          this.lastFailure = { at: this.now(), error };
          this.logger.error(`Database migration failed; retrying after ${this.retryAfterMs} ms on the next request`, error);
          throw error;
        },
      )
      .finally(() => {
        this.inFlight = null;
      });
    return this.inFlight;
  }
}

/**
 * A `Database` that waits for the schema before every statement (Decorator pattern). Repositories and
 * services use it without knowing about migrations; only the migrator talks to the inner database.
 */
export class SchemaGatedDatabase implements Database {
  constructor(
    private readonly inner: Database,
    private readonly schema: SchemaReadiness,
  ) {}

  /** Runs one statement once the schema is ready. */
  async query<R extends QueryResultRow = QueryResultRow>(sql: string, params?: readonly unknown[]): Promise<SqlResult<R>> {
    await this.schema.ready();
    return this.inner.query<R>(sql, params);
  }

  /** Runs a transaction once the schema is ready. */
  async transaction<T>(work: (tx: SqlExecutor) => Promise<T>): Promise<T> {
    await this.schema.ready();
    return this.inner.transaction(work);
  }

  /** Closes the inner database. */
  close(): Promise<void> {
    return this.inner.close();
  }
}
