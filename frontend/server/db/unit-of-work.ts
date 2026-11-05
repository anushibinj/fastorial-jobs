import type { Database, SqlExecutor } from "@/server/db/database";

/**
 * Gives a service its repositories, bound either to the pool (reads) or to one transaction (writes).
 *
 * Services depend on this interface and on repository interfaces only, never on the SQL driver
 * (Dependency Inversion). In tests a fake unit of work hands out in memory repositories.
 *
 * @typeParam R the set of repositories the service needs, e.g. `{ jobs: JobRepository }`.
 */
export interface UnitOfWork<R> {
  /** Runs `work` with repositories whose statements run on any pooled connection, without a transaction. */
  read<T>(work: (repos: R) => Promise<T>): Promise<T>;
  /** Runs `work` with repositories bound to a single transaction, committed when `work` resolves. */
  write<T>(work: (repos: R) => Promise<T>): Promise<T>;
}

/**
 * A `UnitOfWork` over PostgreSQL.
 *
 * @param db the database.
 * @param createRepos builds the repositories on top of an executor (the pool, or a transaction).
 */
export function pgUnitOfWork<R>(db: Database, createRepos: (executor: SqlExecutor) => R): UnitOfWork<R> {
  const pooled = createRepos(db);
  return {
    read: (work) => work(pooled),
    write: (work) => db.transaction((tx) => work(createRepos(tx))),
  };
}
