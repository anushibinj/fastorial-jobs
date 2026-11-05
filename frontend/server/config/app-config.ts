import { parseDatabaseUrl, type SslSetting } from "@/server/config/database-url";

/**
 * Runtime configuration, read from the same environment variables (names and defaults) as the former
 * Spring Boot backend's `application.properties`, so an existing deployment needs no renames:
 *
 * | Variable         | Default                                            | Meaning                                  |
 * |------------------|----------------------------------------------------|------------------------------------------|
 * | `DB_URL`         | `jdbc:postgresql://localhost:5432/fastorial_jobs` | JDBC or postgres:// URL                  |
 * | `DB_USER`        | `fastorial`                                        | database user                            |
 * | `DB_PASSWORD`    | `fastorial`                                        | database password                        |
 * | `DB_POOL_SIZE`   | `5`                                                | connections per server instance          |
 * | `ADMIN_TOKEN`    | empty (admin API rejects every call)               | `X-Admin-Token` and admin UI login       |
 * | `CLEANUP_SECRET` | empty (internal API rejects every call)            | `X-Internal-Secret` for the daily sweep  |
 *
 * `PORT` is read by the Next.js server itself, and `CORS_ALLOWED_ORIGINS` is no longer needed because
 * the browser now calls the API on its own origin.
 */
export interface AppConfig {
  database: DatabaseConfig;
  /** Empty means every admin API call is rejected, so a missing secret can never leave the API open. */
  adminToken: string;
  /** Empty means every internal API call is rejected. */
  internalSecret: string;
  jobs: JobSettings;
}

export interface DatabaseConfig {
  host: string;
  port: number;
  database: string;
  user: string;
  password: string;
  ssl: SslSetting;
  searchPath?: string;
  /** Maximum connections per instance. Kept small: Cloud Run runs several instances against one database. */
  poolSize: number;
}

/** The `jobs.*` properties of the former backend (they were never overridden by the environment). */
export interface JobSettings {
  defaultExpiryDays: number;
  defaultPageSize: number;
  maxPageSize: number;
}

export const JOB_SETTINGS: JobSettings = { defaultExpiryDays: 30, defaultPageSize: 20, maxPageSize: 50 };

/**
 * Reads `DB_POOL_SIZE`. Spring would fail to start on a non-numeric value; failing loudly here too is
 * better than silently running with an unexpected pool size.
 */
export function parsePoolSize(value: string | undefined): number {
  if (value === undefined) return 5;
  const n = value.trim() === "" ? Number.NaN : Number(value.trim());
  if (!Number.isInteger(n) || n < 1) throw new Error(`DB_POOL_SIZE must be a positive integer, got '${value}'`);
  return n;
}

/**
 * Builds the configuration from environment variables.
 *
 * Like Spring's `${NAME:default}` placeholders, a default applies only when a variable is not set at
 * all; a variable set to an empty string is used as it is.
 *
 * @param env usually `process.env`; a plain object in tests.
 * @throws Error when `DB_URL` or `DB_POOL_SIZE` is invalid.
 */
export function loadConfig(env: Readonly<Record<string, string | undefined>>): AppConfig {
  const url = parseDatabaseUrl(env.DB_URL ?? "jdbc:postgresql://localhost:5432/fastorial_jobs");
  return {
    database: {
      host: url.host,
      port: url.port,
      database: url.database,
      // Parameters inside the URL win over DB_USER / DB_PASSWORD, like the JDBC driver.
      user: url.user ?? env.DB_USER ?? "fastorial",
      password: url.password ?? env.DB_PASSWORD ?? "fastorial",
      ssl: url.ssl,
      searchPath: url.searchPath,
      poolSize: parsePoolSize(env.DB_POOL_SIZE),
    },
    adminToken: env.ADMIN_TOKEN ?? "",
    internalSecret: env.CLEANUP_SECRET ?? "",
    jobs: JOB_SETTINGS,
  };
}
