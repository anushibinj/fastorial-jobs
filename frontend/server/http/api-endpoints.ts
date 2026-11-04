import type { CleanupResult } from "@/lib/api/contract";
import type { AccessPolicy } from "@/server/auth/request-authenticator";
import type { Services } from "@/server/container";
import { jsonResponse, noContentResponse, notFoundResponse, readJsonBody } from "@/server/http/routes";
import {
  parseApiKeyRequest,
  parseDetectRequest,
  parseExtendRequest,
  parseStatusRequest,
} from "@/server/requests/admin-requests";
import { parseJobRequest } from "@/server/requests/job-request";
import { parseAdminJobQuery, parsePublicJobQuery } from "@/server/requests/list-queries";
import { pathId } from "@/server/requests/request-params";

/**
 * Every endpoint of the jobs API, with the same paths, methods, credentials, status codes and JSON
 * bodies as the former Spring Boot controllers (`JobController`, `AdminController`, `ApiKeyController`,
 * `InternalController`). The files under `app/api/**` only bind these to Next.js routes.
 *
 * Each handler does three things: parse the request (`server/requests`), call one service method,
 * and turn the result into a response. Errors are mapped centrally by the `RouteFactory`.
 */
export function createApiEndpoints(s: Services) {
  const { routes } = s;
  const searchParams = (request: Request) => new URL(request.url).searchParams;

  return {
    // ---- public (former JobController) ----

    /** `GET /api/jobs`: published, unexpired jobs, filtered and paged. */
    listPublicJobs: routes.publicRoute(async (request) => {
      const q = parsePublicJobQuery(searchParams(request));
      return jsonResponse(await s.jobQueries.searchPublic(q.filter, q.page, q.size));
    }),

    /** `GET /api/jobs/{slug}`: one job; drafts are 404. */
    getPublicJob: routes.publicRoute<{ slug: string }>(async (_request, { slug }) =>
      jsonResponse(await s.jobQueries.getPublic(slug)),
    ),

    /** `GET /api/filters`: facet counts for the filter UI. */
    getFilters: routes.publicRoute(async () => jsonResponse(await s.filters.filters())),

    /** `GET /api/sitemap/jobs`: slugs for sitemap.xml. */
    getSitemapJobs: routes.publicRoute(async () => jsonResponse(await s.jobQueries.sitemap())),

    // ---- admin jobs and tags: admin token or API key (former AdminController) ----

    /** `GET /api/admin/jobs`: every job, most recently edited first. */
    listAdminJobs: routes.protectedRoute("adminOrApiKey", async (request) => {
      const q = parseAdminJobQuery(searchParams(request));
      return jsonResponse(await s.jobQueries.searchAdmin(q.q, q.status, q.page, q.size));
    }),

    /** `GET /api/admin/jobs/{id}`. */
    getAdminJob: routes.protectedRoute<{ id: string }>("adminOrApiKey", async (_request, { id }) =>
      jsonResponse(await s.jobQueries.getAdmin(pathId(id, "Job not found"))),
    ),

    /** `POST /api/admin/jobs`: 201 with the created job. */
    createJob: routes.protectedRoute("adminOrApiKey", async (request) => {
      const body = parseJobRequest(await readJsonBody(request, true));
      return jsonResponse(await s.jobCommands.create(body), 201);
    }),

    /** `PUT /api/admin/jobs/{id}`: replaces the job's fields. */
    updateJob: routes.protectedRoute<{ id: string }>("adminOrApiKey", async (request, { id }) => {
      const jobId = pathId(id, "Job not found");
      const body = parseJobRequest(await readJsonBody(request, true));
      return jsonResponse(await s.jobCommands.update(jobId, body));
    }),

    /** `PATCH /api/admin/jobs/{id}/status` with `{"status": "CLOSED"}`. */
    setJobStatus: routes.protectedRoute<{ id: string }>("adminOrApiKey", async (request, { id }) => {
      const jobId = pathId(id, "Job not found");
      const status = parseStatusRequest(await readJsonBody(request, true));
      return jsonResponse(await s.jobCommands.setStatus(jobId, status));
    }),

    /** `POST /api/admin/jobs/{id}/extend` with an optional `{"days": 14}`; also reopens a closed job. */
    extendJob: routes.protectedRoute<{ id: string }>("adminOrApiKey", async (request, { id }) => {
      const jobId = pathId(id, "Job not found");
      const days = parseExtendRequest(await readJsonBody(request, false));
      return jsonResponse(await s.jobCommands.extend(jobId, days));
    }),

    /** `GET /api/admin/tags`: the tag vocabulary, by name. */
    listTags: routes.protectedRoute("adminOrApiKey", async () => jsonResponse(await s.tagCatalog.listTags())),

    /** `POST /api/admin/tags/detect` with `{"title", "description"}`: suggested tags, best first. */
    detectTags: routes.protectedRoute("adminOrApiKey", async (request) => {
      const { title, description } = parseDetectRequest(await readJsonBody(request, true));
      return jsonResponse(await s.tagDetection.detect(title, description));
    }),

    // ---- API keys: admin token only (former ApiKeyController) ----

    /** `GET /api/admin/api-keys`: every key, newest first, without plaintext. */
    listApiKeys: routes.protectedRoute("admin", async () => jsonResponse(await s.apiKeys.list())),

    /** `POST /api/admin/api-keys` with `{"name"}`: 201 with the plaintext key, shown only this once. */
    createApiKey: routes.protectedRoute("admin", async (request) => {
      const name = parseApiKeyRequest(await readJsonBody(request, true));
      return jsonResponse(await s.apiKeys.create(name), 201);
    }),

    /** `DELETE /api/admin/api-keys/{id}`: 204, also when already revoked. */
    revokeApiKey: routes.protectedRoute<{ id: string }>("admin", async (_request, { id }) => {
      await s.apiKeys.revoke(pathId(id, "API key not found"));
      return noContentResponse();
    }),

    // ---- internal (former InternalController) ----

    /** `POST /api/internal/jobs/cleanup`: closes expired jobs, called daily by Cloud Scheduler. */
    cleanupJobs: routes.protectedRoute("internal", async () => {
      const result: CleanupResult = { closed: await s.jobCleanup.closeExpiredJobs() };
      return jsonResponse(result);
    }),

    /**
     * Any other `/api/**` path: a JSON 404. Paths under the protected prefixes ask for the same
     * credential the former filter required there first, so an unauthenticated caller gets a 401 and
     * cannot probe which admin paths exist.
     */
    unknownRoute: routes.publicRoute<{ path: string[] }>(async (request, { path }) => {
      const policy = policyForUnknownPath(path);
      if (policy === null) return notFoundResponse();
      return routes.protectedRoute(policy, async () => notFoundResponse())(request, { params: Promise.resolve({}) });
    }),
  };
}

/** The type of the endpoint table, for the route files. */
export type ApiEndpoints = ReturnType<typeof createApiEndpoints>;

/**
 * Which credential the former filter required for an unknown path below `/api`: the internal secret
 * under `/api/internal/`, the admin token or an API key under the job and tag prefixes, the admin
 * token elsewhere under `/api/admin/`, and none otherwise.
 *
 * @param path the segments after `/api/`, e.g. `["admin", "jobs", "1", "nope"]`.
 */
export function policyForUnknownPath(path: readonly string[]): AccessPolicy | null {
  if (path[0] === "internal") return "internal";
  if (path[0] !== "admin") return null;
  return path[1] === "jobs" || path[1] === "tags" ? "adminOrApiKey" : "admin";
}
