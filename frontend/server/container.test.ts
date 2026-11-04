import { afterEach, describe, expect, it } from "vitest";
import { loadConfig } from "@/server/config/app-config";
import { createServices, getServices } from "@/server/container";
import type { Database } from "@/server/db/database";
import { MemoryLogger, MutableClock } from "@/server/testing/fakes.testkit";

const db: Database = { query: async () => ({ rows: [], rowCount: 0 }), transaction: async (w) => w(db), close: async () => undefined };

describe("createServices", () => {
  it("wires every service with the given configuration, clock and logger", () => {
    const config = loadConfig({ ADMIN_TOKEN: "a" });
    const clock = new MutableClock();
    const logger = new MemoryLogger();
    const s = createServices({ config, db, clock, logger });
    expect([s.config, s.db, s.clock, s.logger]).toEqual([config, db, clock, logger]);
    for (const key of ["jobQueries", "jobCommands", "jobCleanup", "filters", "tagCatalog", "tagDetection", "apiKeys", "authenticator", "routes"] as const) {
      expect(s[key], key).toBeTruthy();
    }
  });

  it("uses the system clock and console logger by default", () => {
    const s = createServices({ config: loadConfig({}), db });
    expect(Math.abs(s.clock.now().getTime() - Date.now())).toBeLessThan(1000);
    expect(typeof s.logger.info).toBe("function");
  });
});

describe("getServices", () => {
  const holder = globalThis as typeof globalThis & { __fastorialServices?: unknown };
  afterEach(async () => {
    const s = holder.__fastorialServices as { db?: Database } | undefined;
    await s?.db?.close();
    delete holder.__fastorialServices;
  });

  it("creates the services once from the environment and reuses them", () => {
    delete holder.__fastorialServices;
    const first = getServices();
    expect(getServices()).toBe(first);
    expect(first.config.database.database).toBe(loadConfig(process.env).database.database);
  });
});
