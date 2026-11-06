import { describe, expect, it, vi } from "vitest";
import { API_KEY_PREFIX, ApiKeyService, hashApiKey, toApiKeyDto } from "@/server/api-keys/api-key-service";
import { apiKeyFrom, constantTimeEquals, RequestAuthenticator, type ApiKeyVerifier } from "@/server/auth/request-authenticator";
import { ApiException } from "@/server/shared/api-exception";
import { fakeUnitOfWork, InMemoryApiKeyRepository, MutableClock } from "@/server/testing/fakes.testkit";

function service() {
  const repo = new InMemoryApiKeyRepository();
  const clock = new MutableClock();
  const keys = new ApiKeyService(fakeUnitOfWork({ apiKeys: repo }), clock, (n) => new Uint8Array(n).fill(0xab));
  return { repo, clock, keys };
}

describe("hashApiKey", () => {
  it("is the SHA-256 hex digest of the plaintext", () => {
    expect(hashApiKey("abc")).toBe("ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
  });
});

describe("toApiKeyDto", () => {
  it("includes the plaintext only when given and formats dates", () => {
    const record = { id: 1, name: "n", keyPrefix: "fjk_abcdef", keyHash: "h", createdAt: new Date(0), lastUsedAt: null, revokedAt: null };
    expect(toApiKeyDto(record)).toEqual({
      id: 1, name: "n", keyPrefix: "fjk_abcdef", createdAt: "1970-01-01T00:00:00.000Z", lastUsedAt: null, revokedAt: null, key: null,
    });
    expect(toApiKeyDto(record, "fjk_secret").key).toBe("fjk_secret");
  });
});

describe("ApiKeyService", () => {
  it("create returns a fjk_ key once and stores only its hash and prefix", async () => {
    const { repo, keys } = service();
    const created = await keys.create("  zapier  ");
    expect(created.key).toBe(API_KEY_PREFIX + "ab".repeat(32));
    expect([created.name, created.keyPrefix]).toEqual(["zapier", "fjk_ababab"]);
    expect(repo.keys[0].keyHash).toBe(hashApiKey(created.key!));
    expect(JSON.stringify(repo.keys)).not.toContain(created.key!);
  });

  it("list returns keys newest first without plaintext", async () => {
    const { clock, keys } = service();
    await keys.create("old");
    clock.advanceMs(1000);
    await keys.create("new");
    expect((await keys.list()).map((k) => [k.name, k.key])).toEqual([["new", null], ["old", null]]);
  });

  it("authenticate accepts an active key, records its use, and rejects others", async () => {
    const { clock, keys } = service();
    const { key } = await keys.create("k");
    clock.advanceMs(5000);
    expect(await keys.authenticate(key)).toBe(true);
    expect((await keys.list())[0].lastUsedAt).toBe("2026-11-04T06:00:05.000Z");
    expect(await keys.authenticate("fjk_nope")).toBe(false);
    expect(await keys.authenticate("nope")).toBe(false);
    expect(await keys.authenticate(null)).toBe(false);
  });

  it("revoke disables a key, is idempotent, and 404s for unknown ids", async () => {
    const { clock, keys } = service();
    const { key, id } = await keys.create("k");
    await keys.revoke(id);
    const firstRevocation = (await keys.list())[0].revokedAt;
    clock.advanceMs(1000);
    await keys.revoke(id);
    expect((await keys.list())[0].revokedAt).toBe(firstRevocation);
    expect(await keys.authenticate(key)).toBe(false);
    await expect(keys.revoke(99)).rejects.toThrow(ApiException);
  });
});

describe("constantTimeEquals", () => {
  it("compares strings, including ones of different length", () => {
    expect(constantTimeEquals("secret", "secret")).toBe(true);
    expect(constantTimeEquals("secret", "secreT")).toBe(false);
    expect(constantTimeEquals("secret", "secret!")).toBe(false);
  });
});

describe("RequestAuthenticator.isAuthorized", () => {
  const verifier = (valid: string): ApiKeyVerifier & { authenticate: ReturnType<typeof vi.fn> } => ({
    authenticate: vi.fn(async (k: string | null) => k === valid),
  });
  const headers = (h: Record<string, string>) => new Headers(h);

  it("accepts the admin token for admin and job endpoints, but not for internal ones", async () => {
    const auth = new RequestAuthenticator({ adminToken: "a", internalSecret: "i" }, verifier("k"));
    const h = headers({ "X-Admin-Token": "a" });
    expect(await auth.isAuthorized(h, "admin")).toBe(true);
    expect(await auth.isAuthorized(h, "adminOrApiKey")).toBe(true);
    expect(await auth.isAuthorized(h, "internal")).toBe(false);
  });

  it("accepts an API key only where the policy allows it", async () => {
    const auth = new RequestAuthenticator({ adminToken: "a", internalSecret: "i" }, verifier("k"));
    const h = headers({ "X-API-Key": "k" });
    expect(await auth.isAuthorized(h, "adminOrApiKey")).toBe(true);
    expect(await auth.isAuthorized(h, "admin")).toBe(false);
    expect(await auth.isAuthorized(h, "internal")).toBe(false);
  });

  it("accepts an API key sent as a Bearer token, but never the admin token that way", async () => {
    const auth = new RequestAuthenticator({ adminToken: "a", internalSecret: "i" }, verifier("k"));
    expect(await auth.isAuthorized(headers({ Authorization: "Bearer k" }), "adminOrApiKey")).toBe(true);
    expect(await auth.isAuthorized(headers({ Authorization: "bearer k" }), "adminOrApiKey")).toBe(true);
    expect(await auth.isAuthorized(headers({ Authorization: "Bearer k" }), "admin")).toBe(false);
    expect(await auth.isAuthorized(headers({ Authorization: "Bearer a" }), "admin")).toBe(false);
  });

  it("does not consult API keys when the admin token matches", async () => {
    const keys = verifier("k");
    const auth = new RequestAuthenticator({ adminToken: "a", internalSecret: "i" }, keys);
    await auth.isAuthorized(headers({ "X-Admin-Token": "a", "X-API-Key": "k" }), "adminOrApiKey");
    expect(keys.authenticate).not.toHaveBeenCalled();
  });

  it("accepts the internal secret only on internal endpoints", async () => {
    const auth = new RequestAuthenticator({ adminToken: "a", internalSecret: "i" }, verifier("k"));
    const h = headers({ "X-Internal-Secret": "i" });
    expect(await auth.isAuthorized(h, "internal")).toBe(true);
    expect(await auth.isAuthorized(h, "admin")).toBe(false);
  });

  it("rejects everything when the secrets are not configured", async () => {
    const auth = new RequestAuthenticator({ adminToken: "", internalSecret: "" }, verifier("k"));
    expect(await auth.isAuthorized(headers({ "X-Admin-Token": "" }), "admin")).toBe(false);
    expect(await auth.isAuthorized(headers({ "X-Internal-Secret": "" }), "internal")).toBe(false);
    expect(await auth.isAuthorized(headers({}), "admin")).toBe(false);
  });
});

describe("apiKeyFrom", () => {
  it("prefers X-API-Key, falls back to a Bearer token, and is null otherwise", () => {
    expect(apiKeyFrom(new Headers({ "X-API-Key": "x", Authorization: "Bearer y" }))).toBe("x");
    expect(apiKeyFrom(new Headers({ Authorization: "Bearer y" }))).toBe("y");
    expect(apiKeyFrom(new Headers({ Authorization: "Basic y" }))).toBeNull();
    expect(apiKeyFrom(new Headers({ Authorization: "Bearer" }))).toBeNull();
    expect(apiKeyFrom(new Headers())).toBeNull();
  });
});
