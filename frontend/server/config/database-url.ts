/**
 * Parsing of `DB_URL`, which production already sets for the former Spring Boot backend in JDBC form,
 * e.g. `jdbc:postgresql://10.0.0.5:5432/fastorial_jobs` or
 * `jdbc:postgresql://ep-x.neon.tech/neondb?sslmode=require`. The same value must keep working, so this
 * module translates the PostgreSQL JDBC driver's URL format into connection settings for node-postgres.
 * Plain `postgres://` and `postgresql://` URLs are accepted as well.
 */

/** How to secure the connection, the subset of node-postgres' `ssl` option this app uses. */
export type SslSetting = false | { rejectUnauthorized: boolean; checkServerIdentity?: () => undefined };

/** Connection settings extracted from a database URL. User and password are only set when the URL has them. */
export interface DatabaseUrlParts {
  host: string;
  port: number;
  database: string;
  user?: string;
  password?: string;
  ssl: SslSetting;
  /** Value for PostgreSQL's `search_path`, from the JDBC `currentSchema` parameter. */
  searchPath?: string;
}

const DEFAULT_PORT = 5432;

/**
 * Maps a JDBC `sslmode` (and the older `ssl=true` flag) to node-postgres settings.
 *
 * - `disable`, `allow` and `prefer` give no TLS. node-postgres cannot try TLS and fall back to plain
 *   text the way the JDBC driver does for `allow`/`prefer`, so a server that requires TLS must be given
 *   `sslmode=require` (or stricter) explicitly.
 * - `require` encrypts without verifying the certificate, like libpq.
 * - `verify-ca` verifies the certificate chain but not the host name.
 * - `verify-full`, and `ssl=true` without an `sslmode` (the JDBC driver's rule), verify both.
 *
 * @throws Error for an unknown mode, so a typo cannot silently disable encryption.
 */
export function sslFromParams(params: URLSearchParams): SslSetting {
  const mode = params.get("sslmode");
  if (mode === null) {
    const ssl = params.get("ssl");
    return ssl === "true" || ssl === "" ? { rejectUnauthorized: true } : false;
  }
  switch (mode) {
    case "disable":
    case "allow":
    case "prefer":
      return false;
    case "require":
      return { rejectUnauthorized: false };
    case "verify-ca":
      return { rejectUnauthorized: true, checkServerIdentity: () => undefined };
    case "verify-full":
      return { rejectUnauthorized: true };
    default:
      throw new Error(`DB_URL: unsupported sslmode '${mode}'`);
  }
}

/**
 * Splits `host[:port]` (with `[v6]:port` for IPv6 literals) and rejects the JDBC multi host syntax,
 * which node-postgres does not support.
 */
export function parseHostPort(hostPort: string): { host: string; port: number } {
  if (hostPort.includes(",")) throw new Error("DB_URL: multiple hosts are not supported");
  if (hostPort === "") return { host: "localhost", port: DEFAULT_PORT };
  const m = /^(\[[^\]]+\]|[^:]+)(?::(\d*))?$/.exec(hostPort);
  if (!m) throw new Error(`DB_URL: invalid host '${hostPort}'`);
  const host = m[1].startsWith("[") ? m[1].slice(1, -1) : m[1];
  const port = m[2] ? Number(m[2]) : DEFAULT_PORT;
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error(`DB_URL: invalid port '${m[2]}'`);
  return { host, port };
}

/**
 * Parses a JDBC (`jdbc:postgresql://host:port/db?params`, also `jdbc:postgresql:db`) or libpq style
 * (`postgres://user:pass@host:port/db?params`) URL.
 *
 * JDBC URL parameters `user` and `password` override the separate `DB_USER` / `DB_PASSWORD` settings,
 * because the JDBC driver gives URL parameters precedence over connection properties. Parameter values
 * and the database name are percent-decoded, as the JDBC driver does.
 *
 * @throws Error when the URL is not a PostgreSQL URL.
 */
export function parseDatabaseUrl(url: string): DatabaseUrlParts {
  const trimmed = url.trim();
  let rest: string;
  if (trimmed.startsWith("jdbc:postgresql:")) rest = trimmed.slice("jdbc:postgresql:".length);
  else if (trimmed.startsWith("postgresql:")) rest = trimmed.slice("postgresql:".length);
  else if (trimmed.startsWith("postgres:")) rest = trimmed.slice("postgres:".length);
  else throw new Error("DB_URL must start with jdbc:postgresql:, postgresql: or postgres:");

  const q = rest.indexOf("?");
  const params = new URLSearchParams(q >= 0 ? rest.slice(q + 1) : "");
  const location = q >= 0 ? rest.slice(0, q) : rest;

  let userInfo = "";
  let hostPort = "";
  let database: string;
  if (location.startsWith("//")) {
    // //[user[:password]@]host[:port]/database
    const afterSlashes = location.slice(2);
    const slash = afterSlashes.indexOf("/");
    const authority = slash >= 0 ? afterSlashes.slice(0, slash) : afterSlashes;
    database = slash >= 0 ? afterSlashes.slice(slash + 1) : "";
    const at = authority.lastIndexOf("@");
    userInfo = at >= 0 ? authority.slice(0, at) : "";
    hostPort = at >= 0 ? authority.slice(at + 1) : authority;
  } else {
    // jdbc:postgresql:database means localhost:5432
    database = location;
  }
  if (database === "") throw new Error("DB_URL: database name is missing");

  const { host, port } = parseHostPort(hostPort);
  const parts: DatabaseUrlParts = { host, port, database: decodeURIComponent(database), ssl: sslFromParams(params) };

  if (userInfo !== "") {
    const colon = userInfo.indexOf(":");
    parts.user = decodeURIComponent(colon >= 0 ? userInfo.slice(0, colon) : userInfo);
    if (colon >= 0) parts.password = decodeURIComponent(userInfo.slice(colon + 1));
  }
  // URLSearchParams.get already percent-decodes.
  const user = params.get("user");
  const password = params.get("password");
  if (user !== null) parts.user = user;
  if (password !== null) parts.password = password;

  const schema = params.get("currentSchema");
  if (schema !== null) {
    // Passed to the server as a startup option, so only plain identifiers are allowed.
    if (!/^[A-Za-z_][A-Za-z0-9_]*(,[A-Za-z_][A-Za-z0-9_]*)*$/.test(schema)) {
      throw new Error(`DB_URL: unsupported currentSchema '${schema}'`);
    }
    parts.searchPath = schema;
  }
  return parts;
}
