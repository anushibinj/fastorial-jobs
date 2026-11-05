import { beforeEach, describe, expect, it } from "vitest";
import {
  normalizeBaseUrl,
  parseSettingsRequest,
  PostintimeSettingsService,
  type PostintimeSettingsInput,
} from "@/server/postintime/settings";
import { ApiException } from "@/server/shared/api-exception";
import { fakeUnitOfWork, InMemoryPostintimeSettingsRepository, MutableClock } from "@/server/testing/fakes.testkit";

const CHANNEL = "3f2b8a52-6c1e-4f7e-9a53-0b6f7c1d2e44";
const valid: PostintimeSettingsInput = {
  enabled: true, baseUrl: "https://pit.example.com/", apiToken: "pit_secret", channelId: CHANNEL, postStatus: "ready",
};

let repo: InMemoryPostintimeSettingsRepository;
let service: PostintimeSettingsService;
let clock: MutableClock;

beforeEach(() => {
  repo = new InMemoryPostintimeSettingsRepository();
  clock = new MutableClock();
  service = new PostintimeSettingsService(fakeUnitOfWork({ settings: repo }), clock);
});

async function fieldErrors(promise: Promise<unknown>): Promise<Record<string, string>> {
  try {
    await promise;
  } catch (e) {
    if (ApiException.is(e)) return e.fieldErrors;
    throw e;
  }
  throw new Error("expected an ApiException");
}

describe("normalizeBaseUrl", () => {
  it.each([
    ["https://pit.example.com", "https://pit.example.com"],
    [" https://pit.example.com/// ", "https://pit.example.com"],
    ["http://localhost:8080", "http://localhost:8080"],
    ["https://example.com/pit/", "https://example.com/pit"],
  ])("accepts %j", (input, expected) => expect(normalizeBaseUrl(input)).toBe(expected));

  it.each(["pit.example.com", "ftp://pit.example.com", "https://a.com?x=1", "https://a.com#top", "https://user:pw@a.com", "javascript:alert(1)", ""])(
    "rejects %j",
    (input) => expect(normalizeBaseUrl(input)).toBeNull(),
  );
});

describe("parseSettingsRequest", () => {
  it("reads the form and defaults what is missing", () => {
    expect(parseSettingsRequest({ enabled: true, baseUrl: "u", apiToken: "t", channelId: "c", postStatus: "ready" })).toEqual({
      enabled: true, baseUrl: "u", apiToken: "t", channelId: "c", postStatus: "ready",
    });
    expect(parseSettingsRequest({ enabled: "yes" })).toEqual({
      enabled: false, baseUrl: "", apiToken: "", channelId: "", postStatus: "draft",
    });
  });

  it("rejects an unknown post status", () => {
    expect(() => parseSettingsRequest({ postStatus: "published" })).toThrow(ApiException);
  });
});

describe("PostintimeSettingsService.update", () => {
  it("saves a normalized connection and never returns the token", async () => {
    const dto = await service.update(valid);
    expect(dto).toEqual({
      enabled: true, baseUrl: "https://pit.example.com", channelId: CHANNEL, postStatus: "ready",
      hasToken: true, lastResult: null, lastAttemptAt: null,
    });
    expect(JSON.stringify(dto)).not.toContain("pit_secret");
    expect(repo.settings.apiToken).toBe("pit_secret");
    expect(repo.settings.baseUrl).toBe("https://pit.example.com");
  });

  it("keeps the stored token when the form leaves it blank, and replaces it otherwise", async () => {
    await service.update(valid);
    await service.update({ ...valid, apiToken: "  ", postStatus: "draft" });
    expect(repo.settings.apiToken).toBe("pit_secret");
    await service.update({ ...valid, apiToken: " pit_new " });
    expect(repo.settings.apiToken).toBe("pit_new");
  });

  it("keeps the last result when the connection is saved", async () => {
    await service.update(valid);
    await service.recordResult("Posted");
    const dto = await service.update({ ...valid, postStatus: "draft" });
    expect(dto.lastResult).toBe("Posted");
  });

  it("lets an incomplete connection be saved while it is off", async () => {
    const dto = await service.update({ ...valid, enabled: false, apiToken: "", channelId: "", baseUrl: "" });
    expect([dto.enabled, dto.baseUrl, dto.hasToken]).toEqual([false, "", false]);
  });

  it("requires URL, token and channel to turn it on", async () => {
    expect(await fieldErrors(service.update({ ...valid, baseUrl: "", apiToken: "", channelId: "" }))).toEqual({
      baseUrl: "Server URL is required to turn this on",
      apiToken: "API token is required to turn this on",
      channelId: "Channel ID is required to turn this on",
    });
    expect(repo.settings.enabled).toBe(false);
  });

  it("rejects a bad URL, a channel that is not a UUID and an over long token", async () => {
    const errors = await fieldErrors(service.update({ ...valid, baseUrl: "pit.example.com", channelId: "general", apiToken: "x".repeat(201) }));
    expect(Object.keys(errors).sort()).toEqual(["apiToken", "baseUrl", "channelId"]);
  });
});

describe("PostintimeSettingsService.recordResult", () => {
  it("stores the result with the time and cuts it to 500 characters", async () => {
    await service.recordResult("x".repeat(600));
    expect(repo.settings.lastResult).toHaveLength(500);
    expect(repo.settings.lastAttemptAt).toEqual(clock.now());
  });
});
