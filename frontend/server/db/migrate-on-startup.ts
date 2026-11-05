import { getServices } from "@/server/container";

/**
 * Brings the database schema up to date when a server instance starts, like Flyway did on every Spring
 * Boot start. Called from `instrumentation.ts`, which Next.js waits for before serving requests, so on a
 * healthy start every query runs against the migrated schema.
 *
 * A database failure here is logged (by the `SchemaGate`) and swallowed on purpose: Next.js would
 * otherwise keep the process running but answer every request with a 500 forever. The gate retries on
 * the next request that needs the database, so the instance heals once the database is reachable.
 * Configuration errors (an invalid `DB_URL`) cannot heal and are not swallowed.
 */
export async function migrateOnStartup(): Promise<void> {
  const { schema } = getServices();
  await schema.ready().catch(() => undefined);
}
