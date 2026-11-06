import { randomBytes } from "node:crypto";
import { describe } from "vitest";
import { loadConfig } from "@/server/config/app-config";
import { createServices, type Services } from "@/server/container";
import { createDatabase, type Database } from "@/server/db/database";
import { MIGRATIONS } from "@/server/db/migrations";
import { Migrator } from "@/server/db/migrator";
import { createApiEndpoints, type ApiEndpoints } from "@/server/http/api-endpoints";
import type { NextRouteFunction } from "@/server/http/routes";
import { MemoryLogger, MutableClock } from "@/server/testing/fakes.testkit";

/**
 * Support for tests against a real PostgreSQL database, the successor of the Java `IntegrationTestBase`.
 *
 * Set `TEST_DB_URL` (JDBC or postgres:// form, like the old Java tests) and optionally `TEST_DB_USER` /
 * `TEST_DB_PASSWORD` (default `fastorial`) to run them; without it they are skipped. Each test file gets
 * its own schema, created and migrated in `beforeAll` and dropped in `afterAll`, so files can run in
 * parallel against one database without seeing each other's rows.
 */

export const TEST_DB_URL = process.env.TEST_DB_URL;

/** `describe` when a test database is configured, `describe.skip` otherwise. */
export const describeWithDatabase = TEST_DB_URL ? describe : describe.skip;

export const ADMIN_TOKEN = "test-admin";
export const INTERNAL_SECRET = "test-secret";

/** Everything a database test needs, wired like production but with a movable clock. */
export interface DbTestContext {
  db: Database;
  clock: MutableClock;
  logger: MemoryLogger;
  services: Services;
  endpoints: ApiEndpoints;
  schema: string;
  /** Empties jobs and API keys (tags stay, they come from migrations) and resets the clock. */
  reset(): Promise<void>;
  /** Closes the pool and drops the schema. */
  close(): Promise<void>;
}

function urlWithSchema(url: string, schema: string): string {
  return `${url}${url.includes("?") ? "&" : "?"}currentSchema=${schema}`;
}

/** Creates a fresh schema, migrates it with the real migrator and wires the services against it. */
export async function createDbTestContext(): Promise<DbTestContext> {
  if (!TEST_DB_URL) throw new Error("TEST_DB_URL is not set");
  const credentials = { DB_USER: process.env.TEST_DB_USER ?? "fastorial", DB_PASSWORD: process.env.TEST_DB_PASSWORD ?? "fastorial" };
  const schema = `test_${randomBytes(6).toString("hex")}`;

  const admin = createDatabase(loadConfig({ DB_URL: TEST_DB_URL, ...credentials }).database);
  await admin.query(`CREATE SCHEMA ${schema}`);
  await admin.close();

  const config = loadConfig({
    DB_URL: urlWithSchema(TEST_DB_URL, schema), ...credentials,
    ADMIN_TOKEN: ADMIN_TOKEN, CLEANUP_SECRET: INTERNAL_SECRET,
  });
  const db = createDatabase(config.database);
  const logger = new MemoryLogger();
  await new Migrator(db, MIGRATIONS, logger).migrate();
  const clock = new MutableClock(new Date());
  const services = createServices({ config, db, clock, logger });

  return {
    db, clock, logger, services, schema,
    endpoints: createApiEndpoints(services),
    async reset() {
      await db.query("TRUNCATE jobs, api_keys, postintime_settings, queue_items RESTART IDENTITY CASCADE");
      clock.set(new Date());
    },
    async close() {
      await db.query(`DROP SCHEMA ${schema} CASCADE`);
      await db.close();
    },
  };
}

/** A response with its parsed JSON body (null for an empty body). */
export interface CallResult {
  status: number;
  body: any; // eslint-disable-line @typescript-eslint/no-explicit-any -- assertions navigate arbitrary JSON
  headers: Headers;
}

/**
 * Calls an endpoint the way Next.js would: with a `Request` and the dynamic route segments.
 *
 * @param route the endpoint function, e.g. `ctx.endpoints.createJob`.
 * @param options method, URL path with query string, headers, JSON body and route params.
 */
export async function call<P>(
  route: NextRouteFunction<P>,
  options: { method?: string; path?: string; headers?: Record<string, string>; json?: unknown; rawBody?: string; params?: P } = {},
): Promise<CallResult> {
  const body = options.rawBody ?? (options.json === undefined ? undefined : JSON.stringify(options.json));
  const request = new Request(`http://test${options.path ?? "/"}`, {
    method: options.method ?? "GET",
    headers: { ...(body !== undefined ? { "Content-Type": "application/json" } : {}), ...options.headers },
    body,
  });
  const response = await route(request, { params: Promise.resolve((options.params ?? {}) as P) });
  const text = await response.text();
  return { status: response.status, body: text ? JSON.parse(text) : null, headers: response.headers };
}

/** The admin credential header. */
export const asAdmin = { "X-Admin-Token": ADMIN_TOKEN };

let sequence = 0;

/** A valid job payload with a unique apply URL; override fields with `extra` (port of the Java helper). */
export function jobPayload(title: string, extra: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    title,
    companyName: "Acme",
    description: "A role.",
    applyUrl: `https://example.com/jobs/${++sequence}`,
    source: "OTHER",
    locationCity: "Hyderabad",
    workMode: "HYBRID",
    experienceMinYears: 3,
    tags: [],
    ...extra,
  };
}

/** Creates a job through the admin endpoint, failing the test unless it returns 201. */
export async function createJob(ctx: DbTestContext, payload: Record<string, unknown>) {
  const r = await call(ctx.endpoints.createJob, { method: "POST", path: "/api/admin/jobs", headers: asAdmin, json: payload });
  if (r.status !== 201) throw new Error(`create failed: ${r.status} ${JSON.stringify(r.body)}`);
  return r.body;
}
