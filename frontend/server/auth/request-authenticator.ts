import { timingSafeEqual } from "node:crypto";

export const ADMIN_HEADER = "X-Admin-Token";
export const API_KEY_HEADER = "X-API-Key";
export const INTERNAL_HEADER = "X-Internal-Secret";

/**
 * Who may call an endpoint.
 * - `admin`: the admin token only (API key management).
 * - `adminOrApiKey`: the admin token or an active API key (job and tag endpoints, for automations).
 * - `internal`: the internal secret only (the Cloud Scheduler cleanup).
 */
export type AccessPolicy = "admin" | "adminOrApiKey" | "internal";

/** The part of the API key service the authenticator needs (Interface Segregation). */
export interface ApiKeyVerifier {
  authenticate(plaintext: string | null): Promise<boolean>;
}

/** The shared secrets from the configuration. Empty strings disable the corresponding access. */
export interface Secrets {
  adminToken: string;
  internalSecret: string;
}

/**
 * Compares two secrets in time that does not depend on where they differ, so the response time does
 * not reveal how much of a guess was right (like Java's `MessageDigest.isEqual`).
 */
export function constantTimeEquals(a: string, b: string): boolean {
  const x = Buffer.from(a, "utf8");
  const y = Buffer.from(b, "utf8");
  return x.length === y.length && timingSafeEqual(x, y);
}

/**
 * Decides whether a request may call a protected endpoint. Port of the former `TokenAuthFilter`.
 *
 * Each route declares its own policy, instead of the old filter deciding by URL prefix. That removes
 * the need for the filter's path allowlist (which had to refuse `..`, `//`, `%` and `;` so a key could
 * not reach `/api/admin/api-keys` through a crafted path): the decision is made by the handler that
 * actually runs.
 */
export class RequestAuthenticator {
  constructor(
    private readonly secrets: Secrets,
    private readonly apiKeys: ApiKeyVerifier,
  ) {}

  /**
   * True when the request carries a valid credential for `policy`. An unset (empty) secret matches
   * nothing, so a missing environment variable can never leave an endpoint open. An API key is only
   * checked when the admin token did not match, and a successful check records the key's use.
   */
  async isAuthorized(headers: Headers, policy: AccessPolicy): Promise<boolean> {
    if (policy === "internal") return this.matches(this.secrets.internalSecret, headers.get(INTERNAL_HEADER));
    if (this.matches(this.secrets.adminToken, headers.get(ADMIN_HEADER))) return true;
    return policy === "adminOrApiKey" && this.apiKeys.authenticate(headers.get(API_KEY_HEADER));
  }

  private matches(expected: string, given: string | null): boolean {
    return expected !== "" && given !== null && constantTimeEquals(expected, given);
  }
}
