import { afterEach, describe, expect, it, vi } from "vitest";
import { migrateOnStartup } from "@/server/db/migrate-on-startup";
import { fakeServices, installServices } from "@/server/testing/fakes.testkit";

describe("migrateOnStartup", () => {
  let restore: (() => void) | undefined;
  const holder = globalThis as typeof globalThis & { __fastorialServices?: unknown };
  afterEach(() => {
    restore?.();
    restore = undefined;
    vi.unstubAllEnvs();
  });

  it("waits for the schema to be ready", async () => {
    const { services } = fakeServices();
    const ready = vi.fn(async () => undefined);
    restore = installServices({ ...services, schema: { ready } });
    await migrateOnStartup();
    expect(ready).toHaveBeenCalledOnce();
  });

  it("swallows a migration failure, so the instance keeps serving and retries later", async () => {
    const { services } = fakeServices();
    restore = installServices({ ...services, schema: { ready: () => Promise.reject(new Error("db down")) } });
    await expect(migrateOnStartup()).resolves.toBeUndefined();
  });

  it("does not swallow an invalid configuration", async () => {
    const previous = holder.__fastorialServices;
    delete holder.__fastorialServices;
    restore = () => void (holder.__fastorialServices = previous);
    vi.stubEnv("DB_URL", "mysql://nope/db");
    await expect(migrateOnStartup()).rejects.toThrow("DB_URL must start with");
  });
});
