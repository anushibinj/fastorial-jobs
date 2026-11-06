import { describe, expect, it } from "vitest";
import { createApiEndpoints } from "@/server/http/api-endpoints";
import { fakeServices } from "@/server/testing/fakes.testkit";

const noParams = { params: Promise.resolve({}) };
const admin = { "X-Admin-Token": "test-admin" };
const validJob = { title: "T", companyName: "C", applyUrl: "https://x.com/1", source: "OTHER", workMode: "REMOTE", experienceMinYears: 1 };

function setup() {
  const { services, stores } = fakeServices();
  const endpoints = createApiEndpoints(services);
  let nextId = 1;
  /** Sends one JSON-RPC request to the MCP endpoint, the way a client does. */
  const rpc = (method: string, params: unknown, headers: Record<string, string> = admin) =>
    endpoints.mcp(
      new Request("http://test/api/mcp", {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json, text/event-stream", ...headers },
        body: JSON.stringify({ jsonrpc: "2.0", id: nextId++, method, params }),
      }),
      noParams,
    );
  /** Calls a tool and returns its parsed JSON text plus the isError flag. */
  const call = async (name: string, args: unknown = {}) => {
    const res = await rpc("tools/call", { name, arguments: args });
    expect(res.status).toBe(200);
    const { result } = await res.json();
    return { isError: Boolean(result.isError), value: JSON.parse(result.content[0].text) };
  };
  return { endpoints, stores, services, rpc, call };
}

describe("MCP endpoint", () => {
  it("rejects requests without a valid credential, with no-store", async () => {
    const { rpc } = setup();
    const res = await rpc("tools/list", {}, {});
    expect([res.status, res.headers.get("Cache-Control")]).toEqual([401, "no-store"]);
    expect((await rpc("tools/list", {}, { "X-API-Key": "nope" })).status).toBe(401);
  });

  it("accepts an API key as X-API-Key or as a Bearer token", async () => {
    const { rpc, services } = setup();
    const key = (await services.apiKeys.create("mcp client")).key as string;
    expect((await rpc("tools/list", {}, { "X-API-Key": key })).status).toBe(200);
    expect((await rpc("tools/list", {}, { Authorization: `Bearer ${key}` })).status).toBe(200);
  });

  it("does not open event streams: GET and DELETE are refused rather than left hanging", async () => {
    const { endpoints } = setup();
    for (const method of ["GET", "DELETE"]) {
      const res = await endpoints.mcp(new Request("http://test/api/mcp", { method, headers: { ...admin, Accept: "text/event-stream" } }), noParams);
      expect([res.status, res.headers.get("Allow")]).toEqual([405, "POST"]);
    }
  });

  it("lists the job and tag tools, and no key management or cleanup", async () => {
    const { rpc } = setup();
    const { result } = await (await rpc("tools/list", {})).json();
    expect(result.tools.map((t: { name: string }) => t.name).sort()).toEqual(
      ["create_job", "detect_tags", "extend_job", "get_job", "list_jobs", "list_tags", "set_job_status", "update_job"],
    );
  });

  it("creates, reads, updates, closes, extends and lists jobs", async () => {
    const { call } = setup();
    const created = await call("create_job", validJob);
    expect(created.isError).toBe(false);
    const id = String(created.value.id);
    expect((await call("get_job", { id })).value.title).toBe("T");
    expect((await call("update_job", { id, ...validJob, title: "T2" })).value.title).toBe("T2");
    expect((await call("set_job_status", { id, status: "CLOSED" })).value.status).toBe("CLOSED");
    expect((await call("extend_job", { id, days: 7 })).value.status).toBe("PUBLISHED");
    const list = await call("list_jobs", { status: "PUBLISHED", size: 5 });
    expect([list.value.total, list.value.size]).toEqual([1, 5]);
  });

  it("lists and detects tags", async () => {
    const { call } = setup();
    expect((await call("list_tags")).value).toHaveLength(3);
    expect((await call("detect_tags", { title: "Java and Kafka" })).value.map((d: { slug: string }) => d.slug)).toEqual(["java", "kafka"]);
  });

  it("reports validation and not-found errors as tool errors in the REST error shape", async () => {
    const { call } = setup();
    const invalid = await call("create_job", { ...validJob, title: "  " });
    expect(invalid.isError).toBe(true);
    expect(invalid.value).toMatchObject({ code: "VALIDATION_FAILED", fieldErrors: { title: "Title is required" } });
    const missing = await call("get_job", { id: "999" });
    expect([missing.isError, missing.value.code]).toEqual([true, "NOT_FOUND"]);
  });

  it("does not leak internals of unexpected failures", async () => {
    const { call, services } = setup();
    services.jobQueries.getAdmin = async () => {
      throw new Error("secret db detail");
    };
    const failed = await call("get_job", { id: "1" });
    expect(failed.value).toEqual({ code: "INTERNAL_ERROR", message: "Something went wrong", fieldErrors: {} });
  });
});
