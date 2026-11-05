import "server-only";
import { getServices } from "@/server/container";
import { createApiEndpoints, type ApiEndpoints } from "@/server/http/api-endpoints";

let endpoints: ApiEndpoints | undefined;

/**
 * The API endpoints bound to the application's services, created on the first request. Route files
 * call this inside their handlers (not at import time), so building the app never needs a database.
 */
export function api(): ApiEndpoints {
  endpoints ??= createApiEndpoints(getServices());
  return endpoints;
}
