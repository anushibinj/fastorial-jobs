import { POST_STATUSES, type PostintimeSettingsDto, type PostStatus } from "@/lib/api/contract";
import type { SqlExecutor } from "@/server/db/database";
import type { UnitOfWork } from "@/server/db/unit-of-work";
import { ConstraintViolations, fitsMaxLength, isNotBlank, matchesFully } from "@/server/requests/constraints";
import { coerceEnum, coerceString, expectObject } from "@/server/requests/json-coercion";
import type { Clock } from "@/server/shared/clock";
import { toIso } from "@/server/shared/iso";
import { javaTrim } from "@/server/shared/java-text";

export { POST_STATUSES };
export type { PostStatus, PostintimeSettingsDto };

/** The one row of `postintime_settings`: how and where new jobs are pushed to PostInTime. */
export interface PostintimeSettings {
  enabled: boolean;
  /** Origin of the PostInTime API, without a trailing slash, e.g. `https://api.postintime.example`. */
  baseUrl: string;
  /** A PostInTime personal API token (`pit_…`). Never leaves the server. */
  apiToken: string;
  /** Id of the PostInTime channel that receives the posts. */
  channelId: string;
  postStatus: PostStatus;
  /** One line about the latest push, shown in the admin UI. */
  lastResult: string | null;
  lastAttemptAt: Date | null;
}

/** What the admin form submits. A blank `apiToken` keeps the stored one. */
export interface PostintimeSettingsInput {
  enabled: boolean;
  baseUrl: string;
  apiToken: string;
  channelId: string;
  postStatus: PostStatus;
}

export const DEFAULT_SETTINGS: PostintimeSettings = {
  enabled: false, baseUrl: "", apiToken: "", channelId: "", postStatus: "draft", lastResult: null, lastAttemptAt: null,
};

export interface PostintimeSettingsRepository {
  /** The settings, or the defaults when nothing was saved yet. */
  get(): Promise<PostintimeSettings>;
  /** Saves the connection fields and keeps the last result. */
  save(settings: Pick<PostintimeSettings, "enabled" | "baseUrl" | "apiToken" | "channelId" | "postStatus">, at: Date): Promise<void>;
  recordResult(result: string, at: Date): Promise<void>;
}

interface SettingsRow {
  enabled: boolean;
  base_url: string;
  api_token: string;
  channel_id: string;
  post_status: string;
  last_result: string | null;
  last_attempt_at: Date | null;
}

const COLUMNS = "enabled, base_url, api_token, channel_id, post_status, last_result, last_attempt_at";

/** `PostintimeSettingsRepository` over PostgreSQL. */
export class PgPostintimeSettingsRepository implements PostintimeSettingsRepository {
  constructor(private readonly db: SqlExecutor) {}

  async get(): Promise<PostintimeSettings> {
    const { rows } = await this.db.query<SettingsRow>(`SELECT ${COLUMNS} FROM postintime_settings WHERE id = 1`);
    const r = rows[0];
    if (!r) return { ...DEFAULT_SETTINGS };
    return {
      enabled: r.enabled,
      baseUrl: r.base_url,
      apiToken: r.api_token,
      channelId: r.channel_id,
      postStatus: POST_STATUSES.find((p) => p === r.post_status) ?? "draft",
      lastResult: r.last_result,
      lastAttemptAt: r.last_attempt_at,
    };
  }

  async save(s: Parameters<PostintimeSettingsRepository["save"]>[0], at: Date): Promise<void> {
    await this.db.query(
      `INSERT INTO postintime_settings (id, enabled, base_url, api_token, channel_id, post_status, updated_at)
       VALUES (1, $1, $2, $3, $4, $5, $6)
       ON CONFLICT (id) DO UPDATE SET enabled = $1, base_url = $2, api_token = $3, channel_id = $4,
         post_status = $5, updated_at = $6`,
      [s.enabled, s.baseUrl, s.apiToken, s.channelId, s.postStatus, at],
    );
  }

  async recordResult(result: string, at: Date): Promise<void> {
    await this.db.query(
      `INSERT INTO postintime_settings (id, last_result, last_attempt_at) VALUES (1, $1, $2)
       ON CONFLICT (id) DO UPDATE SET last_result = $1, last_attempt_at = $2`,
      [result, at],
    );
  }
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** `http(s)://host[:port][/path]` without trailing slashes, or null when `text` is not such a URL. */
export function normalizeBaseUrl(text: string): string | null {
  try {
    const url = new URL(javaTrim(text));
    if (url.protocol !== "http:" && url.protocol !== "https:") return null;
    if (url.search || url.hash || url.username || url.password) return null;
    return `${url.origin}${url.pathname}`.replace(/\/+$/, "");
  } catch {
    return null;
  }
}

/**
 * Reads the admin form body. Only the shape is checked here; the rules that depend on stored data
 * (for example that an enabled connection needs a token) are in `PostintimeSettingsService.update`.
 */
export function parseSettingsRequest(body: unknown): PostintimeSettingsInput {
  const o = expectObject(body);
  return {
    enabled: o.enabled === true,
    baseUrl: coerceString(o.baseUrl) ?? "",
    apiToken: coerceString(o.apiToken) ?? "",
    channelId: coerceString(o.channelId) ?? "",
    postStatus: coerceEnum(o.postStatus, POST_STATUSES) ?? "draft",
  };
}

export function toSettingsDto(s: PostintimeSettings): PostintimeSettingsDto {
  return {
    enabled: s.enabled,
    baseUrl: s.baseUrl,
    channelId: s.channelId,
    postStatus: s.postStatus,
    hasToken: s.apiToken !== "",
    lastResult: s.lastResult,
    lastAttemptAt: toIso(s.lastAttemptAt),
  };
}

/** Reads and changes the PostInTime connection that the admin UI edits and the publisher uses. */
export class PostintimeSettingsService {
  constructor(
    private readonly uow: UnitOfWork<{ settings: PostintimeSettingsRepository }>,
    private readonly clock: Clock,
  ) {}

  /** For the admin UI: no token. */
  async get(): Promise<PostintimeSettingsDto> {
    return toSettingsDto(await this.load());
  }

  /** For the publisher: the complete settings, token included. */
  load(): Promise<PostintimeSettings> {
    return this.uow.read(({ settings }) => settings.get());
  }

  /**
   * Validates and saves the form. A blank token keeps the stored one, so the form never has to know it.
   * A connection may be saved incomplete while it is disabled; enabling it needs URL, token and channel.
   *
   * @throws ApiException 400 `VALIDATION_FAILED` with per-field messages.
   */
  async update(input: PostintimeSettingsInput): Promise<PostintimeSettingsDto> {
    const v = new ConstraintViolations();
    const rawUrl = javaTrim(input.baseUrl);
    const baseUrl = rawUrl === "" ? "" : normalizeBaseUrl(rawUrl);
    const token = javaTrim(input.apiToken);
    const channelId = javaTrim(input.channelId);
    v.require(baseUrl !== null, "baseUrl", "Enter a full URL such as https://postintime.example (http or https, no query)");
    v.require(fitsMaxLength(rawUrl, 500), "baseUrl", "URL must be at most 500 characters");
    v.require(fitsMaxLength(token, 200), "apiToken", "Token must be at most 200 characters");
    v.require(channelId === "" || matchesFully(channelId, UUID), "channelId", "Channel ID must be a UUID, copy it from GET /api/v1/public/channels");
    v.throwIfAny();

    return this.uow.write(async ({ settings }) => {
      const current = await settings.get();
      const apiToken = token === "" ? current.apiToken : token;
      if (input.enabled) {
        const missing = new ConstraintViolations();
        missing.require(isNotBlank(baseUrl), "baseUrl", "Server URL is required to turn this on");
        missing.require(apiToken !== "", "apiToken", "API token is required to turn this on");
        missing.require(channelId !== "", "channelId", "Channel ID is required to turn this on");
        missing.throwIfAny();
      }
      await settings.save({ enabled: input.enabled, baseUrl: baseUrl as string, apiToken, channelId, postStatus: input.postStatus }, this.clock.now());
      return toSettingsDto({ ...current, enabled: input.enabled, baseUrl: baseUrl as string, apiToken, channelId, postStatus: input.postStatus });
    });
  }

  /** Remembers the outcome of the latest push so the admin can see failures that happen in the background. */
  async recordResult(result: string): Promise<void> {
    await this.uow.write(({ settings }) => settings.recordResult(result.slice(0, 500), this.clock.now()));
  }
}
