import { getServices } from "@/server/container";
import { MIGRATIONS } from "@/server/db/migrations";
import { Migrator } from "@/server/db/migrator";

/**
 * Brings the database schema up to date when a server instance starts, like Flyway did on every Spring
 * Boot start. Called from `instrumentation.ts`, which Next.js runs once per server instance and waits for
 * before serving requests. If it fails (database unreachable, a changed migration), the error propagates
 * and the instance does not start serving, so a broken schema is never used.
 */
export async function migrateOnStartup(): Promise<void> {
  const { db, logger } = getServices();
  const applied = await new Migrator(db, MIGRATIONS, logger).migrate();
  logger.info(applied.length === 0 ? "Database schema is up to date" : `Database migrated to version ${applied.at(-1)}`);
}
