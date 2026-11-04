/**
 * Next.js calls `register` once when a server instance starts and waits for it before serving requests.
 * It runs the database migrations here, which is what Flyway did when the separate Spring Boot backend
 * started. A database that is unreachable at that moment does not break the instance: the attempt is
 * logged and retried on the next request (see `server/db/schema-gate.ts`).
 *
 * The migration code is imported dynamically and only in the Node.js runtime, because it uses the `pg`
 * driver, which cannot run on the Edge runtime. It is also skipped while `next build` collects page data,
 * so building never needs a database.
 */
export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  if (process.env.NEXT_PHASE === "phase-production-build") return;
  const { migrateOnStartup } = await import("@/server/db/migrate-on-startup");
  await migrateOnStartup();
}
