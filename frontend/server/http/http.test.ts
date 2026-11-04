import { afterEach, describe, expect, it } from "vitest";
import { createApiEndpoints, policyForUnknownPath } from "@/server/http/api-endpoints";
import {
  errorBody,
  jsonResponse,
  noContentResponse,
  notFoundResponse,
  readJsonBody,
  RouteFactory,
  unauthorizedResponse,
  withNoStore,
} from "@/server/http/routes";
import { parseAdminJobQuery, parsePublicJobQuery } from "@/server/requests/list-queries";
import { ApiException } from "@/server/shared/api-exception";
import { fakeServices, installServices, jobRecord, MemoryLogger } from "@/server/testing/fakes.testkit";
import { RequestAuthenticator } from "@/server/auth/request-authenticator";

const params = <P>(p: P) => ({ params: Promise.resolve(p) });
const noParams = params({});
const req = (path: string, init: RequestInit = {}) => new Request(`http://test${path}`, init);
const json = async (r: Response) => JSON.parse(await r.text());

describe("response helpers", () => {
  it("jsonResponse sends JSON with a status", async () => {
    const r = jsonResponse({ a: 1 }, 201);
    expect([r.status, r.headers.get("Content-Type"), await json(r)]).toEqual([201, "application/json", { a: 1 }]);
  });

  it("noContentResponse is an empty 204", async () => {
    const r = noContentResponse();
    expect([r.status, await r.text()]).toEqual([204, ""]);
  });

  it("errorBody always includes fieldErrors", () => {
    expect(errorBody("X", "y")).toEqual({ code: "X", message: "y", fieldErrors: {} });
  });

  it("unauthorizedResponse and notFoundResponse match the former backend", async () => {
    expect(await json(unauthorizedResponse())).toEqual({ code: "UNAUTHORIZED", message: "Missing or invalid token", fieldErrors: {} });
    expect(await json(notFoundResponse())).toEqual({ code: "NOT_FOUND", message: "Not found", fieldErrors: {} });
  });

  it("withNoStore sets Cache-Control", () => {
    expect(withNoStore(jsonResponse({})).headers.get("Cache-Control")).toBe("no-store");
  });

  it("readJsonBody parses the body and applies the required rule", async () => {
    expect(await readJsonBody(req("/", { method: "POST", body: '{"a":1}' }), true)).toEqual({ a: 1 });
    expect(await readJsonBody(req("/", { method: "POST" }), false)).toBeNull();
    await expect(readJsonBody(req("/", { method: "POST" }), true)).rejects.toThrow("Malformed request body");
  });
});

describe("RouteFactory", () => {
  const logger = new MemoryLogger();
  const auth = new RequestAuthenticator({ adminToken: "a", internalSecret: "i" }, { authenticate: async () => false });
  const routes = new RouteFactory(auth, logger);

  it("toErrorResponse maps ApiException and hides unexpected errors behind a logged 500", async () => {
    expect(await json(routes.toErrorResponse(ApiException.notFound("Job not found")))).toEqual({
      code: "NOT_FOUND", message: "Job not found", fieldErrors: {},
    });
    const r = routes.toErrorResponse(new Error("secret detail"));
    expect([r.status, await json(r)]).toEqual([500, { code: "INTERNAL_ERROR", message: "Something went wrong", fieldErrors: {} }]);
    expect(logger.errors.at(-1)?.message).toBe("Unhandled error");
  });

  it("publicRoute passes the resolved params and maps thrown errors", async () => {
    const ok = routes.publicRoute<{ slug: string }>(async (_r, p) => jsonResponse(p));
    expect(await json(await ok(req("/"), params({ slug: "x" })))).toEqual({ slug: "x" });
    const failing = routes.publicRoute(async () => {
      throw ApiException.badRequest("Malformed request body");
    });
    expect((await failing(req("/"), noParams)).status).toBe(400);
  });

  it("protectedRoute rejects without the credential and adds no-store to every response", async () => {
    let called = false;
    const route = routes.protectedRoute("admin", async () => {
      called = true;
      throw ApiException.notFound("x");
    });
    const denied = await route(req("/"), noParams);
    expect([denied.status, denied.headers.get("Cache-Control"), called]).toEqual([401, "no-store", false]);
    const failed = await route(req("/", { headers: { "X-Admin-Token": "a" } }), noParams);
    expect([failed.status, failed.headers.get("Cache-Control"), called]).toEqual([404, "no-store", true]);
  });
});

describe("policyForUnknownPath", () => {
  it("mirrors the former filter's prefixes", () => {
    expect(policyForUnknownPath(["internal", "x"])).toBe("internal");
    expect(policyForUnknownPath(["admin", "jobs", "1", "x"])).toBe("adminOrApiKey");
    expect(policyForUnknownPath(["admin", "tags", "x"])).toBe("adminOrApiKey");
    expect(policyForUnknownPath(["admin", "api-keys", "x"])).toBe("admin");
    expect(policyForUnknownPath(["nope"])).toBeNull();
  });
});

describe("list query parsers", () => {
  it("parsePublicJobQuery reads every filter in the controller's order", () => {
    expect(parsePublicJobQuery(new URLSearchParams("q=java&location=Pune&workMode=REMOTE&expMin=3&expMax=5&tags=java,aws&page=1&size=10"))).toEqual({
      filter: { q: "java", location: "Pune", workMode: "REMOTE", expMin: 3, expMax: 5, tags: ["java", "aws"] },
      page: 1,
      size: 10,
    });
    expect(() => parsePublicJobQuery(new URLSearchParams("workMode=x&page=y"))).toThrow("Invalid value for 'workMode'");
  });

  it("parseAdminJobQuery reads text, status and paging", () => {
    expect(parseAdminJobQuery(new URLSearchParams("q=a&status=DRAFT&page=2"))).toEqual({ q: "a", status: "DRAFT", page: 2, size: null });
  });
});

describe("API endpoints with in-memory services", () => {
  const admin = { "X-Admin-Token": "test-admin" };
  let restore: (() => void) | undefined;
  afterEach(() => restore?.());

  function setup() {
    const { services, stores } = fakeServices();
    return { endpoints: createApiEndpoints(services), stores, services };
  }

  it("serve the public list, detail, filters and sitemap", async () => {
    const { endpoints, stores } = setup();
    stores.jobs.jobs.push(jobRecord());
    expect((await json(await endpoints.listPublicJobs(req("/api/jobs?size=5"), noParams))).size).toBe(5);
    expect((await endpoints.getPublicJob(req("/"), params({ slug: "senior-java-engineer-acme-hyderabad-1" }))).status).toBe(200);
    expect((await json(await endpoints.getFilters(req("/"), noParams))).experience).toHaveLength(4);
    expect(await json(await endpoints.getSitemapJobs(req("/"), noParams))).toHaveLength(1);
  });

  it("create, read, update, change status and extend jobs", async () => {
    const { endpoints } = setup();
    const body = JSON.stringify({ title: "T", companyName: "C", applyUrl: "https://x.com/1", source: "OTHER", workMode: "REMOTE", experienceMinYears: 1 });
    const created = await endpoints.createJob(req("/", { method: "POST", headers: admin, body }), noParams);
    expect(created.status).toBe(201);
    const id = String((await json(created)).id);
    expect((await endpoints.getAdminJob(req("/", { headers: admin }), params({ id }))).status).toBe(200);
    expect((await endpoints.updateJob(req("/", { method: "PUT", headers: admin, body }), params({ id }))).status).toBe(200);
    const closed = await endpoints.setJobStatus(req("/", { method: "PATCH", headers: admin, body: '{"status":"CLOSED"}' }), params({ id }));
    expect((await json(closed)).status).toBe("CLOSED");
    const extended = await endpoints.extendJob(req("/", { method: "POST", headers: admin }), params({ id }));
    expect((await json(extended)).status).toBe("PUBLISHED");
    expect((await json(await endpoints.listAdminJobs(req("/api/admin/jobs", { headers: admin }), noParams))).total).toBe(1);
  });

  it("list and detect tags", async () => {
    const { endpoints } = setup();
    expect(await json(await endpoints.listTags(req("/", { headers: admin }), noParams))).toHaveLength(3);
    const detected = await endpoints.detectTags(req("/", { method: "POST", headers: admin, body: '{"title":"Java and Kafka"}' }), noParams);
    expect((await json(detected)).map((d: { slug: string }) => d.slug)).toEqual(["java", "kafka"]);
  });

  it("manage API keys with the admin token only", async () => {
    const { endpoints } = setup();
    const created = await endpoints.createApiKey(req("/", { method: "POST", headers: admin, body: '{"name":"z"}' }), noParams);
    expect(created.status).toBe(201);
    const { id, key } = await json(created);
    expect((await endpoints.listApiKeys(req("/", { headers: { "X-API-Key": key } }), noParams)).status).toBe(401);
    expect((await endpoints.listAdminJobs(req("/api/admin/jobs", { headers: { "X-API-Key": key } }), noParams)).status).toBe(200);
    expect((await endpoints.revokeApiKey(req("/", { method: "DELETE", headers: admin }), params({ id: String(id) }))).status).toBe(204);
    expect(await json(await endpoints.listApiKeys(req("/", { headers: admin }), noParams))).toHaveLength(1);
  });

  it("run the cleanup with the internal secret", async () => {
    const { endpoints } = setup();
    const r = await endpoints.cleanupJobs(req("/", { method: "POST", headers: { "X-Internal-Secret": "test-secret" } }), noParams);
    expect(await json(r)).toEqual({ closed: 0 });
  });

  it("answer unknown paths with 404, or 401 first on protected prefixes", async () => {
    const { endpoints } = setup();
    expect((await endpoints.unknownRoute(req("/"), params({ path: ["x"] }))).status).toBe(404);
    expect((await endpoints.unknownRoute(req("/"), params({ path: ["admin", "x"] }))).status).toBe(401);
  });

  it("api() binds the endpoints to the installed services once", async () => {
    const { services } = setup();
    restore = installServices(services);
    const { api } = await import("@/server/http/api");
    expect(api()).toBe(api());
    expect((await api().getFilters(req("/"), noParams)).status).toBe(200);
  });
});
