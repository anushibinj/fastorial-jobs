import { describe, expect, it } from "vitest";
import { crc32Update, flywayChecksum, readLines } from "@/server/db/flyway-checksum";
import { MIGRATIONS, type Migration } from "@/server/db/migrations";
import { compareVersions, planMigrations } from "@/server/db/migrator";

/**
 * Checksums that Flyway itself recorded in flyway_schema_history when the former Spring Boot backend
 * migrated a fresh PostgreSQL 16 database. Production holds the same values, so the migrator would
 * refuse to start if the embedded scripts drifted from the originals.
 */
const FLYWAY_RECORDED_CHECKSUMS: Record<string, number> = {
  "1": -1072403220,
  "2": -198300706,
  "3": -1799799101,
  "4": 2105820723,
};

describe("MIGRATIONS", () => {
  it("are the four Flyway scripts in order, with Flyway's names and descriptions", () => {
    expect(MIGRATIONS.map((m) => [m.version, m.script, m.description])).toEqual([
      ["1", "V1__create_jobs_and_tags.sql", "create jobs and tags"],
      ["2", "V2__seed_tags.sql", "seed tags"],
      ["3", "V3__create_tag_aliases.sql", "create tag aliases"],
      ["4", "V4__create_api_keys.sql", "create api keys"],
    ]);
  });

  it.each(MIGRATIONS.map((m) => [m.script, m] as const))("%s still has the checksum Flyway recorded", (_s, m) => {
    expect(flywayChecksum(m.sql)).toBe(FLYWAY_RECORDED_CHECKSUMS[m.version]);
  });
});

describe("crc32Update", () => {
  it("computes the standard CRC32 check value", () => {
    expect(crc32Update(0, new TextEncoder().encode("123456789"))).toBe(0xcbf43926);
  });

  it("can be continued across chunks", () => {
    const enc = new TextEncoder();
    expect(crc32Update(crc32Update(0, enc.encode("1234")), enc.encode("56789"))).toBe(0xcbf43926);
  });
});

describe("readLines", () => {
  it("splits on LF, CRLF and CR without a trailing empty line", () => {
    expect(readLines("a\nb\r\nc\rd\n")).toEqual(["a", "b", "c", "d"]);
    expect(readLines("a\n\nb")).toEqual(["a", "", "b"]);
    expect(readLines("")).toEqual([]);
  });
});

describe("flywayChecksum", () => {
  it("ignores line endings and a byte order mark, like Flyway", () => {
    const lf = flywayChecksum("SELECT 1;\nSELECT 2;\n");
    expect(flywayChecksum("SELECT 1;\r\nSELECT 2;\r\n")).toBe(lf);
    expect(flywayChecksum("﻿SELECT 1;\nSELECT 2;")).toBe(lf);
  });

  it("changes when the text changes", () => {
    expect(flywayChecksum("SELECT 1;")).not.toBe(flywayChecksum("SELECT 2;"));
  });
});

describe("compareVersions", () => {
  it("compares numerically part by part", () => {
    expect(compareVersions("10", "9")).toBeGreaterThan(0);
    expect(compareVersions("1.1", "1")).toBeGreaterThan(0);
    expect(compareVersions("2", "2.0")).toBe(0);
  });
});

describe("planMigrations", () => {
  const m = (version: string, sql = `-- v${version}`): Migration => ({
    version, sql, description: `d${version}`, script: `V${version}__d.sql`,
  });
  const applied = (version: string, sql = `-- v${version}`, success = true) => ({
    version, checksum: flywayChecksum(sql), success,
  });

  it("returns everything on an empty database, in version order", () => {
    expect(planMigrations([m("2"), m("1"), m("10")], []).map((x) => x.version)).toEqual(["1", "2", "10"]);
  });

  it("returns only newer migrations when some are applied", () => {
    expect(planMigrations([m("1"), m("2"), m("3")], [applied("1"), applied("2")]).map((x) => x.version)).toEqual(["3"]);
  });

  it("recognizes a database migrated by Flyway as up to date", () => {
    const flywayRows = MIGRATIONS.map((x) => ({ version: x.version, checksum: FLYWAY_RECORDED_CHECKSUMS[x.version], success: true }));
    expect(planMigrations(MIGRATIONS, flywayRows)).toEqual([]);
  });

  it("refuses an applied migration whose script changed", () => {
    expect(() => planMigrations([m("1", "-- edited")], [applied("1")])).toThrow(/changed after it was applied/);
  });

  it("refuses to continue after a failed migration", () => {
    expect(() => planMigrations([m("1")], [applied("1", "-- v1", false)])).toThrow(/failed earlier/);
  });

  it("refuses a missing migration older than the newest applied one", () => {
    expect(() => planMigrations([m("1"), m("2")], [applied("2")])).toThrow(/never applied/);
  });

  it("ignores applied versions this code does not know", () => {
    expect(planMigrations([m("1")], [applied("1"), applied("5")])).toEqual([]);
  });
});
