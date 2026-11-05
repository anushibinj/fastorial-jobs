import type { ApiErrorBody } from "@/lib/api/contract";
import type { AccessPolicy, RequestAuthenticator } from "@/server/auth/request-authenticator";
import { parseJsonBody } from "@/server/requests/json-coercion";
import { ApiException } from "@/server/shared/api-exception";
import type { Logger } from "@/server/shared/logger";

/**
 * Building blocks for the `app/api/**` route handlers: JSON responses, error mapping, authentication
 * and the `Cache-Control: no-store` rule. Together they replace the former backend's
 * `GlobalExceptionHandler` and `TokenAuthFilter`.
 */

/** A handler for one route: the request and the resolved dynamic route segments. */
export type ApiHandler<P> = (request: Request, params: P) => Promise<Response>;

/** What Next.js passes to an exported route function: the request and a promise of the segments. */
export type NextRouteFunction<P> = (request: Request, context: { params: Promise<P> }) => Promise<Response>;

/** A JSON response. */
export function jsonResponse(body: unknown, status = 200): Response {
  return Response.json(body, { status });
}

/** `204 No Content`. */
export function noContentResponse(): Response {
  return new Response(null, { status: 204 });
}

/** The JSON error body every failure uses: `{ code, message, fieldErrors }`. */
export function errorBody(code: string, message: string, fieldErrors: Record<string, string> = {}): ApiErrorBody {
  return { code, message, fieldErrors };
}

/** The 401 the former filter returned for a missing or wrong credential. */
export function unauthorizedResponse(): Response {
  return jsonResponse(errorBody("UNAUTHORIZED", "Missing or invalid token"), 401);
}

/** The JSON 404 for an unknown `/api` path (Spring's `NoResourceFoundException` handler). */
export function notFoundResponse(): Response {
  return jsonResponse(errorBody("NOT_FOUND", "Not found"), 404);
}

/** Marks a response as never cacheable. Admin and internal responses must not be stored by any cache or CDN. */
export function withNoStore(response: Response): Response {
  response.headers.set("Cache-Control", "no-store");
  return response;
}

/**
 * Reads the request body as JSON with Spring's `@RequestBody` rules (see `parseJsonBody`). The content
 * type is not checked: the Java backend answered 500 for `text/plain` bodies, accepting them is kinder.
 */
export async function readJsonBody(request: Request, required: boolean): Promise<unknown> {
  return parseJsonBody(await request.text(), required);
}

/**
 * Creates route functions with consistent error handling and authentication.
 */
export class RouteFactory {
  constructor(
    private readonly authenticator: RequestAuthenticator,
    private readonly logger: Logger,
  ) {}

  /**
   * Maps any error to a response: an `ApiException` to its status and body, anything else to a logged
   * `500 INTERNAL_ERROR` that does not reveal internals to the caller.
   */
  toErrorResponse(error: unknown): Response {
    if (ApiException.is(error)) {
      return jsonResponse(errorBody(error.code, error.message, error.fieldErrors), error.status);
    }
    this.logger.error("Unhandled error", error);
    return jsonResponse(errorBody("INTERNAL_ERROR", "Something went wrong"), 500);
  }

  /** A route anyone may call. */
  publicRoute<P = Record<string, never>>(handler: ApiHandler<P>): NextRouteFunction<P> {
    return async (request, context) => {
      try {
        return await handler(request, await context.params);
      } catch (error) {
        return this.toErrorResponse(error);
      }
    };
  }

  /**
   * A route that requires a credential for `policy`. Authentication happens before the body is read,
   * so an unauthenticated caller learns nothing about validation. Every response, errors included,
   * gets `Cache-Control: no-store`, as the former filter set it before the request went on.
   */
  protectedRoute<P = Record<string, never>>(policy: AccessPolicy, handler: ApiHandler<P>): NextRouteFunction<P> {
    return async (request, context) => {
      try {
        if (!(await this.authenticator.isAuthorized(request.headers, policy))) return withNoStore(unauthorizedResponse());
        return withNoStore(await handler(request, await context.params));
      } catch (error) {
        return withNoStore(this.toErrorResponse(error));
      }
    };
  }
}
