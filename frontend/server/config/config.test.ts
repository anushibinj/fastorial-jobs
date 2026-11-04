import { describe, expect, it } from "vitest";
import { JOB_SETTINGS, loadConfig, parsePoolSize } from "@/server/config/app-config";
import { parseDatabaseUrl, parseHostPort, sslFromParams } from "@/server/config/database-url";

describe("parseDatabaseUrl", () => {
  it("parses the JDBC URL format production already uses", () => {
    expect(parseDatabaseUrl("jdbc:postgresql://10.0.0.5:6543/fastorial_jobs")).toEqual({
      host: "10.0.0.5", port: 6543, database: "fastorial_jobs", ssl: false,
    });
  });

  it("defaults the port to 5432 and supports sslmode", () => {
    expect(parseDatabaseUrl("jdbc:postgresql://ep-x.neon.tech/neondb?sslmode=require")).toEqual({
      host: "ep-x.neon.tech", port: 5432, database: "neondb", ssl: { rejectUnauthorized: false },
    });
  });

  it("parses postgres:// URLs with credentials", () => {
    expect(parseDatabaseUrl("postgres://u%40x:p%3Aw@db.example.com:5433/app")).toMatchObject({
      host: "db.example.com", port: 5433, database: "app", user: "u@x", password: "p:w",
    });
  });

  it("lets user and password URL parameters win over the authority", () => {
    expect(parseDatabaseUrl("jdbc:postgresql://h/d?user=a&password=b%26c")).toMatchObject({ user: "a", password: "b&c" });
  });

  it("supports the short JDBC forms and IPv6 hosts", () => {
    expect(parseDatabaseUrl("jdbc:postgresql:mydb")).toMatchObject({ host: "localhost", port: 5432, database: "mydb" });
    expect(parseDatabaseUrl("jdbc:postgresql:///mydb")).toMatchObject({ host: "localhost", database: "mydb" });
    expect(parseDatabaseUrl("jdbc:postgresql://[::1]:5432/mydb")).toMatchObject({ host: "::1", port: 5432 });
  });

  it("maps currentSchema to a search path and rejects unsafe values", () => {
    expect(parseDatabaseUrl("jdbc:postgresql://h/d?currentSchema=test_1").searchPath).toBe("test_1");
    expect(() => parseDatabaseUrl("jdbc:postgresql://h/d?currentSchema=a;drop")).toThrow(/currentSchema/);
  });

  it("rejects other URL schemes and a missing database", () => {
    expect(() => parseDatabaseUrl("mysql://h/d")).toThrow(/must start with/);
    expect(() => parseDatabaseUrl("jdbc:postgresql://h/")).toThrow(/database name/);
  });
});

describe("sslFromParams", () => {
  const p = (s: string) => new URLSearchParams(s);

  it("maps every sslmode", () => {
    expect(sslFromParams(p(""))).toBe(false);
    expect(sslFromParams(p("sslmode=disable"))).toBe(false);
    expect(sslFromParams(p("sslmode=prefer"))).toBe(false);
    expect(sslFromParams(p("sslmode=allow"))).toBe(false);
    expect(sslFromParams(p("sslmode=require"))).toEqual({ rejectUnauthorized: false });
    expect(sslFromParams(p("sslmode=verify-full"))).toEqual({ rejectUnauthorized: true });
    const verifyCa = sslFromParams(p("sslmode=verify-ca"));
    expect(verifyCa).toMatchObject({ rejectUnauthorized: true });
    expect(verifyCa && verifyCa.checkServerIdentity?.()).toBeUndefined();
  });

  it("treats ssl=true without sslmode as verify-full, like the JDBC driver", () => {
    expect(sslFromParams(p("ssl=true"))).toEqual({ rejectUnauthorized: true });
    expect(sslFromParams(p("ssl=false"))).toBe(false);
  });

  it("rejects unknown modes instead of silently disabling TLS", () => {
    expect(() => sslFromParams(p("sslmode=requir"))).toThrow(/sslmode/);
  });
});

describe("parseHostPort", () => {
  it("parses host, port and bracketed IPv6", () => {
    expect(parseHostPort("db:6000")).toEqual({ host: "db", port: 6000 });
    expect(parseHostPort("db")).toEqual({ host: "db", port: 5432 });
    expect(parseHostPort("[::1]")).toEqual({ host: "::1", port: 5432 });
    expect(parseHostPort("")).toEqual({ host: "localhost", port: 5432 });
  });

  it("rejects multiple hosts and invalid ports", () => {
    expect(() => parseHostPort("a:1,b:2")).toThrow(/multiple hosts/);
    expect(() => parseHostPort("a:70000")).toThrow(/port/);
  });
});

describe("parsePoolSize", () => {
  it("defaults to 5 when unset and parses positive integers", () => {
    expect(parsePoolSize(undefined)).toBe(5);
    expect(parsePoolSize(" 8 ")).toBe(8);
  });

  it("rejects empty, zero, negative and non numeric values", () => {
    for (const v of ["", "0", "-1", "two", "1.5"]) expect(() => parsePoolSize(v), v).toThrow(/DB_POOL_SIZE/);
  });
});

describe("loadConfig", () => {
  it("uses the same defaults as application.properties", () => {
    expect(loadConfig({})).toEqual({
      database: {
        host: "localhost", port: 5432, database: "fastorial_jobs", user: "fastorial", password: "fastorial",
        ssl: false, searchPath: undefined, poolSize: 5,
      },
      adminToken: "",
      internalSecret: "",
      jobs: JOB_SETTINGS,
    });
  });

  it("reads every variable", () => {
    const c = loadConfig({
      DB_URL: "jdbc:postgresql://db:5432/prod?sslmode=require", DB_USER: "app", DB_PASSWORD: "secret",
      DB_POOL_SIZE: "3", ADMIN_TOKEN: "admin", CLEANUP_SECRET: "cleanup",
    });
    expect(c.database).toMatchObject({ host: "db", database: "prod", user: "app", password: "secret", poolSize: 3 });
    expect([c.adminToken, c.internalSecret]).toEqual(["admin", "cleanup"]);
  });

  it("uses an empty variable as is, like Spring placeholders", () => {
    expect(loadConfig({ DB_PASSWORD: "" }).database.password).toBe("");
    expect(() => loadConfig({ DB_URL: "" })).toThrow(/DB_URL/);
  });
});
