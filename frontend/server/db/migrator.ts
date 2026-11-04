import type { Database, SqlExecutor } from "@/server/db/database";
import { flywayChecksum } from "@/server/db/flyway-checksum";
import type { Migration } from "@/server/db/migrations";
import type { Logger } from "@/server/shared/logger";

/**
 * Applies schema migrations on startup, replacing Flyway (which ran on every Spring Boot start).
 *
 * It reads and writes Flyway's own `flyway_schema_history` table, so a database that Flyway already
 * migrated (production is at V4) is recognized as up to date and nothing is re-run. The rules follow
 * Flyway's defaults:
 * - an applied migration whose script changed (checksum differs) stops startup ("validate on migrate");
 * - a failed migration recorded in the history stops startup until someone repairs it;
 * - a migration older than the newest applied one but never applied stops startup (no out of order);
 * - versions in the history that this code does not know (from a newer release) are ignored.
 */

/** Arbitrary constant identifying this app's migration lock among PostgreSQL advisory locks. */
export const MIGRATION_LOCK_KEY = 4_221_802_731;

/** The columns of `flyway_schema_history` the migrator needs. */
export interface AppliedMigration {
  version: string;
  checksum: number | null;
  success: boolean;
}

/**
 * Compares Flyway versions numerically part by part, so "10" sorts after "9" and "1.1" after "1".
 *
 * @returns negative, zero or positive, like any sort comparator.
 */
export function compareVersions(a: string, b: string): number {
  const pa = a.split(".").map(Number);
  const pb = b.split(".").map(Number);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const d = (pa[i] ?? 0) - (pb[i] ?? 0);
    if (d !== 0) return d;
  }
  return 0;
}

/**
 * Decides which migrations to run, after validating the history against the local migrations.
 * Pure, so the rules can be tested without a database.
 *
 * @returns the pending migrations in version order.
 * @throws Error when the history and the local migrations disagree (see the rules above).
 */
export function planMigrations(local: readonly Migration[], applied: readonly AppliedMigration[]): Migration[] {
  const failed = applied.find((a) => !a.success);
  if (failed) {
    throw new Error(`Migration ${failed.version} failed earlier. Repair the database and its flyway_schema_history row first.`);
  }
  const byVersion = new Map(applied.map((a) => [a.version, a]));
  const newestApplied = applied.reduce<string | null>(
    (max, a) => (max === null || compareVersions(a.version, max) > 0 ? a.version : max),
    null,
  );

  const pending: Migration[] = [];
  for (const m of [...local].sort((x, y) => compareVersions(x.version, y.version))) {
    const row = byVersion.get(m.version);
    if (row) {
      const expected = flywayChecksum(m.sql);
      if (row.checksum !== expected) {
        throw new Error(
          `Migration ${m.version} (${m.script}) was changed after it was applied: ` +
            `database checksum ${row.checksum}, local checksum ${expected}. Never edit an applied migration.`,
        );
      }
    } else if (newestApplied !== null && compareVersions(m.version, newestApplied) < 0) {
      throw new Error(`Migration ${m.version} (${m.script}) is older than the applied version ${newestApplied} but was never applied.`);
    } else {
      pending.push(m);
    }
  }
  return pending;
}

/** Creates Flyway's history table, with Flyway's exact definition, when it does not exist yet. */
async function ensureHistoryTable(tx: SqlExecutor): Promise<void> {
  const { rows } = await tx.query<{ exists: boolean }>("SELECT to_regclass('flyway_schema_history') IS NOT NULL AS exists");
  if (rows[0].exists) return;
  await tx.query(`
    CREATE TABLE flyway_schema_history (
        installed_rank INTEGER       NOT NULL,
        version        VARCHAR(50),
        description    VARCHAR(200)  NOT NULL,
        type           VARCHAR(20)   NOT NULL,
        script         VARCHAR(1000) NOT NULL,
        checksum       INTEGER,
        installed_by   VARCHAR(100)  NOT NULL,
        installed_on   TIMESTAMP     NOT NULL DEFAULT now(),
        execution_time INTEGER       NOT NULL,
        success        BOOLEAN       NOT NULL,
        CONSTRAINT flyway_schema_history_pk PRIMARY KEY (installed_rank)
    )`);
  await tx.query("CREATE INDEX flyway_schema_history_s_idx ON flyway_schema_history (success)");
}

/**
 * Applies pending migrations against a database.
 */
export class Migrator {
  /**
   * @param db the database to migrate.
   * @param migrations the known migrations (usually `MIGRATIONS`).
   * @param logger receives one line per applied migration.
   */
  constructor(
    private readonly db: Database,
    private readonly migrations: readonly Migration[],
    private readonly logger: Logger,
  ) {}

  /**
   * Validates the history and applies every pending migration.
   *
   * Everything runs in a single transaction that first takes a transaction scoped advisory lock:
   * - several instances starting at once (Cloud Run scaling out) wait for each other instead of racing;
   * - unlike a session lock, a transaction lock also works through a transaction pooler such as the
   *   pooled connection strings of Neon or Supabase;
   * - PostgreSQL DDL is transactional, so a failing migration rolls back completely and leaves no
   *   half applied schema and no history row behind.
   *
   * @returns the versions that were applied, empty when the schema was already up to date.
   */
  async migrate(): Promise<string[]> {
    const applied = await this.db.transaction(async (tx) => {
      await tx.query("SELECT pg_advisory_xact_lock($1)", [MIGRATION_LOCK_KEY]);
      await ensureHistoryTable(tx);
      const { rows } = await tx.query<AppliedMigration>(
        "SELECT version, checksum, success FROM flyway_schema_history WHERE version IS NOT NULL ORDER BY installed_rank",
      );
      const pending = planMigrations(this.migrations, rows);
      for (const m of pending) {
        const started = performance.now();
        await tx.query(m.sql);
        const executionTime = Math.round(performance.now() - started);
        await tx.query(
          `INSERT INTO flyway_schema_history
             (installed_rank, version, description, type, script, checksum, installed_by, execution_time, success)
           SELECT coalesce(max(installed_rank), 0) + 1, $1, $2, 'SQL', $3, $4, current_user, $5, TRUE
           FROM flyway_schema_history`,
          [m.version, m.description, m.script, flywayChecksum(m.sql), executionTime],
        );
        this.logger.info(`Applied migration ${m.script} in ${executionTime} ms`);
      }
      return pending.map((m) => m.version);
    });
    this.logger.info(applied.length === 0 ? "Database schema is up to date" : `Database migrated to version ${applied.at(-1)}`);
    return applied;
  }
}
