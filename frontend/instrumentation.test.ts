import { afterEach, describe, expect, it, vi } from "vitest";

const migrateOnStartup = vi.fn(async () => undefined);
vi.mock("@/server/db/migrate-on-startup", () => ({ migrateOnStartup }));

const { register } = await import("@/instrumentation");

describe("register", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    migrateOnStartup.mockClear();
  });

  it("runs the migrations when a Node.js server starts", async () => {
    vi.stubEnv("NEXT_RUNTIME", "nodejs");
    vi.stubEnv("NEXT_PHASE", "phase-production-server");
    await register();
    expect(migrateOnStartup).toHaveBeenCalledOnce();
  });

  it("does nothing on the Edge runtime", async () => {
    vi.stubEnv("NEXT_RUNTIME", "edge");
    await register();
    expect(migrateOnStartup).not.toHaveBeenCalled();
  });

  it("does nothing during next build", async () => {
    vi.stubEnv("NEXT_RUNTIME", "nodejs");
    vi.stubEnv("NEXT_PHASE", "phase-production-build");
    await register();
    expect(migrateOnStartup).not.toHaveBeenCalled();
  });

  it("propagates errors migrateOnStartup does not handle (an invalid configuration)", async () => {
    vi.stubEnv("NEXT_RUNTIME", "nodejs");
    migrateOnStartup.mockRejectedValueOnce(new Error("DB_URL must start with jdbc:postgresql:"));
    await expect(register()).rejects.toThrow("DB_URL must start with");
  });
});
