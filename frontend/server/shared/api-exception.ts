import { errorBrand } from "@/server/shared/error-brand";

/** Field name to a human readable message, as returned in `ApiError.fieldErrors`. */
export type FieldErrors = Record<string, string>;

const BRAND = errorBrand("ApiException");

/**
 * A business or request error that maps straight to an HTTP status and an `ApiError` JSON body
 * (`{ code, message, fieldErrors }`).
 *
 * Port of the former backend's `ApiException`. Services throw it; the HTTP layer and the admin server
 * actions translate it. Keeping the error vocabulary in one class means every entry point (REST route,
 * server action, server component) reports the same codes.
 */
export class ApiException extends Error {
  /**
   * @param status HTTP status code to answer with (400, 401, 404, 409, ...).
   * @param code Stable machine readable code, e.g. `VALIDATION_FAILED` or `DUPLICATE_APPLY_URL`.
   * @param message Human readable summary.
   * @param fieldErrors Per field messages, empty when the error is not about specific fields.
   */
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly fieldErrors: FieldErrors = {},
  ) {
    super(message);
    this.name = "ApiException";
    BRAND.mark(this);
  }

  /**
   * True for an `ApiException` created by any copy of this module. Always use this instead of
   * `instanceof ApiException`, which can be false in the bundled server (see `error-brand.ts`).
   */
  static is(value: unknown): value is ApiException {
    return BRAND.has(value);
  }

  /** A `404 NOT_FOUND` error with the given message. */
  static notFound(message: string): ApiException {
    return new ApiException(404, "NOT_FOUND", message);
  }

  /** A `400 BAD_REQUEST` error, used when the request cannot be read at all (bad JSON, wrong types). */
  static badRequest(message: string): ApiException {
    return new ApiException(400, "BAD_REQUEST", message);
  }

  /** A `400 VALIDATION_FAILED` error carrying per field messages. */
  static validationFailed(message: string, fieldErrors: FieldErrors): ApiException {
    return new ApiException(400, "VALIDATION_FAILED", message, fieldErrors);
  }
}
