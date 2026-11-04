import { JOB_STATUSES, type JobStatus } from "@/lib/api/contract";
import { ConstraintViolations, fitsMaxLength, isAtLeast, isAtMost, isNotBlank } from "@/server/requests/constraints";
import { coerceEnum, coerceInt32, coerceString, expectObject } from "@/server/requests/json-coercion";

/**
 * Small request bodies of the admin API. Each parser takes the already parsed JSON value and applies
 * the same binding and validation rules as the former Java records (`StatusRequest`, `ExtendRequest`,
 * `DetectRequest`, `ApiKeyRequest`).
 */

/** Body of `PATCH /api/admin/jobs/{id}/status`: `{"status": "CLOSED"}`. The status is required. */
export function parseStatusRequest(body: unknown): JobStatus {
  const status = coerceEnum(expectObject(body).status, JOB_STATUSES);
  const v = new ConstraintViolations();
  v.require(status !== null, "status", "Status is required");
  v.throwIfAny();
  return status as JobStatus;
}

/**
 * Body of `POST /api/admin/jobs/{id}/extend`: `{"days": 14}`. The body is optional; a missing body,
 * `null`, `{}` or `{"days": null}` all mean "use the default expiry period".
 *
 * @returns the number of days (1 to 365), or null for the default.
 */
export function parseExtendRequest(body: unknown): number | null {
  if (body === null) return null;
  const days = coerceInt32(expectObject(body).days);
  const v = new ConstraintViolations();
  v.require(isAtLeast(days, 1), "days", "Days must be at least 1");
  v.require(isAtMost(days, 365), "days", "Days must be at most 365");
  v.throwIfAny();
  return days;
}

/** Body of `POST /api/admin/tags/detect`. Both fields are optional; there is no validation. */
export function parseDetectRequest(body: unknown): { title: string | null; description: string | null } {
  const o = expectObject(body);
  return { title: coerceString(o.title), description: coerceString(o.description) };
}

/** Body of `POST /api/admin/api-keys`: `{"name": "zapier"}`. The name is required, at most 100 characters. */
export function parseApiKeyRequest(body: unknown): string {
  const name = coerceString(expectObject(body).name);
  const v = new ConstraintViolations();
  v.require(isNotBlank(name), "name", "Name is required");
  v.require(fitsMaxLength(name, 100), "name", "Name must be at most 100 characters");
  v.throwIfAny();
  return name as string;
}
