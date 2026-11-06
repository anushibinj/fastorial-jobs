import { describe, expect, it, vi } from "vitest";
import type { Clock } from "@/server/shared/clock";
import { toSortedTagDtos, toTagDto } from "@/server/tags/tag-mapper";
import type { TagAliasRecord, TagRecord } from "@/server/tags/tag-record";
import type { TagRepository } from "@/server/tags/tag-repository";
import { buildAliasEntries, DETECTOR_TTL_MS, TagCatalogService, TagDetectionService } from "@/server/tags/tag-services";

const java: TagRecord = { id: 1, name: "Java", slug: "java", category: "LANGUAGE" };
const go: TagRecord = { id: 2, name: "Go", slug: "go", category: "LANGUAGE" };
const kafka: TagRecord = { id: 3, name: "Kafka", slug: "kafka", category: "TOOL" };
const goAlias: TagAliasRecord = { tag: go, alias: "Go", caseSensitive: true };

/** In memory repository whose data and call counts tests can inspect. */
function fakeRepo(tags: TagRecord[], aliases: TagAliasRecord[]) {
  const repo = {
    findAllCalls: 0,
    findAllOrderedByName: async () => [...tags].sort((a, b) => a.name.localeCompare(b.name)),
    findAll: vi.fn(async () => {
      repo.findAllCalls++;
      return tags;
    }),
    insert: async () => null,
    findBySlugs: async (slugs: readonly string[]) => tags.filter((t) => slugs.includes(t.slug)),
    findAllAliases: async () => aliases,
  };
  return repo satisfies TagRepository;
}

/** A clock tests can move. */
function mutableClock(start = Date.UTC(2026, 10, 4)) {
  let now = start;
  return { now: () => new Date(now), advance: (ms: number) => (now += ms) } satisfies Clock & { advance(ms: number): number };
}

describe("buildAliasEntries", () => {
  it("adds tag names longer than two characters as implicit aliases, then the alias rows", () => {
    expect(buildAliasEntries([java, go], [goAlias])).toEqual([
      { tagId: 1, tagName: "Java", tagSlug: "java", category: "LANGUAGE", alias: "Java", caseSensitive: false },
      { tagId: 2, tagName: "Go", tagSlug: "go", category: "LANGUAGE", alias: "Go", caseSensitive: true },
    ]);
  });
});

describe("TagDetectionService.detect", () => {
  it("detects tags with the repository vocabulary", async () => {
    const service = new TagDetectionService(fakeRepo([java, go, kafka], [goAlias]), mutableClock());
    const result = await service.detect("Java engineer", "We use Go and Kafka.");
    expect(result.map((d) => d.slug)).toEqual(["java", "go", "kafka"]);
  });

  it("reuses the detector within the TTL and rebuilds it afterwards", async () => {
    const repo = fakeRepo([java], []);
    const clock = mutableClock();
    const service = new TagDetectionService(repo, clock);
    await service.detect("Java", null);
    clock.advance(DETECTOR_TTL_MS);
    await service.detect("Java", null);
    expect(repo.findAllCalls).toBe(1);
    clock.advance(1);
    await service.detect("Java", null);
    expect(repo.findAllCalls).toBe(2);
  });

  it("shares one database read between concurrent calls", async () => {
    const repo = fakeRepo([java], []);
    const service = new TagDetectionService(repo, mutableClock());
    await Promise.all([service.detect("Java", null), service.detect("Java", null)]);
    expect(repo.findAllCalls).toBe(1);
  });

  it("retries after a failed build instead of caching the failure", async () => {
    const repo = fakeRepo([java], []);
    repo.findAll.mockRejectedValueOnce(new Error("db down"));
    const service = new TagDetectionService(repo, mutableClock());
    await expect(service.detect("Java", null)).rejects.toThrow("db down");
    await expect(service.detect("Java", null)).resolves.toHaveLength(1);
  });
});

describe("TagCatalogService.listTags", () => {
  it("lists every tag ordered by name in the API shape", async () => {
    const service = new TagCatalogService(fakeRepo([kafka, java, go], []));
    expect(await service.listTags()).toEqual([
      { name: "Go", slug: "go", category: "LANGUAGE" },
      { name: "Java", slug: "java", category: "LANGUAGE" },
      { name: "Kafka", slug: "kafka", category: "TOOL" },
    ]);
  });
});

describe("tag mapper", () => {
  it("toTagDto drops the id", () => {
    expect(toTagDto(java)).toEqual({ name: "Java", slug: "java", category: "LANGUAGE" });
  });

  it("toSortedTagDtos sorts case insensitively like Java", () => {
    const lower: TagRecord = { id: 9, name: "aws", slug: "aws", category: "CLOUD" };
    expect(toSortedTagDtos([kafka, lower, java]).map((t) => t.name)).toEqual(["aws", "Java", "Kafka"]);
  });
});
