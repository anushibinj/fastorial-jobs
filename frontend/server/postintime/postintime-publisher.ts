import type { JobDetail } from "@/lib/api/contract";
import { truncate } from "@/lib/format";
import { buildShareText } from "@/lib/share";
import type { JobPostCreated } from "@/server/events/event-bus";
import type { PostintimeSettings, PostintimeSettingsService } from "@/server/postintime/settings";
import type { Logger } from "@/server/shared/logger";

/** A rendered picture, ready to upload. */
export interface RenderedImage {
  bytes: Uint8Array;
  contentType: string;
}

/** Draws the 1:1 version of a job's link preview image. */
export type JobImageRenderer = (job: JobDetail) => Promise<RenderedImage>;

/** PostInTime limits the title to 300 characters. */
const MAX_TITLE = 300;
const DEFAULT_TIMEOUT_MS = 20_000;

/** The create post endpoint of the PostInTime public API. */
export function postsUrl(settings: Pick<PostintimeSettings, "baseUrl" | "channelId">): string {
  return `${settings.baseUrl}/api/v1/public/channels/${encodeURIComponent(settings.channelId)}/posts`;
}

/** First characters of a response body, on one line, for the result shown in the admin UI. */
function snippet(text: string): string {
  const oneLine = text.replace(/\s+/g, " ").trim();
  return oneLine.length > 160 ? `${oneLine.slice(0, 159)}…` : oneLine;
}

function describeError(error: unknown): string {
  if (error instanceof Error && error.name === "TimeoutError") return "timed out";
  return error instanceof Error ? error.message : String(error);
}

/**
 * Reacts to `JobPostCreated` by creating a post in PostInTime: the job title and share text as the
 * post, and the 1:1 link preview image as its media. Uses `POST /api/v1/public/channels/{id}/posts`
 * (multipart, field `media`) with the personal API token from the admin settings.
 *
 * It never throws: the job already exists, so a failure here is logged and remembered as the "last
 * result" the admin can read, nothing more. There is no retry; the admin can post the job by hand.
 */
export class PostintimePublisher {
  constructor(
    private readonly settings: PostintimeSettingsService,
    private readonly renderImage: JobImageRenderer,
    private readonly logger: Logger,
    private readonly http: typeof fetch = fetch,
    private readonly timeoutMs: number = DEFAULT_TIMEOUT_MS,
  ) {}

  async onJobPostCreated({ job }: JobPostCreated): Promise<void> {
    let result: string;
    try {
      const settings = await this.settings.load();
      // A draft is not on the site yet, so there is nothing to link to. Publishing one later is not "created".
      if (!settings.enabled || job.status !== "PUBLISHED") return;
      result = await this.push(job, settings);
      this.logger.info(`PostInTime: ${result}`);
    } catch (error) {
      result = `Failed to post job ${job.id}: ${describeError(error)}`;
      this.logger.error(`PostInTime: ${result}`, error);
    }
    await this.settings.recordResult(result).catch((e) => this.logger.error("PostInTime: could not save the result", e));
  }

  private async push(job: JobDetail, settings: PostintimeSettings): Promise<string> {
    const form = new FormData();
    form.set("title", truncate(job.companyName ? `${job.title} at ${job.companyName}` : job.title, MAX_TITLE));
    form.set("caption", buildShareText(job));
    form.set("status", settings.postStatus);
    let imageNote = "";
    try {
      const image = await this.renderImage(job);
      // Copy into a fresh ArrayBuffer so the Blob never aliases a pooled Buffer.
      form.set("media", new Blob([new Uint8Array(image.bytes)], { type: image.contentType }), `${job.slug}-square.png`);
    } catch (error) {
      // A post without a picture is better than no post: it starts as a draft by default, so it gets noticed.
      this.logger.error(`PostInTime: could not render the image for job ${job.id}`, error);
      imageNote = ` (without image: ${describeError(error)})`;
    }

    const response = await this.http(postsUrl(settings), {
      method: "POST",
      headers: { "X-Api-Key": settings.apiToken },
      body: form,
      signal: AbortSignal.timeout(this.timeoutMs),
    });
    if (!response.ok) {
      const body = await response.text().catch(() => "");
      throw new Error(`PostInTime answered HTTP ${response.status}${body ? `: ${snippet(body)}` : ""}`);
    }
    const created = (await response.json().catch(() => null)) as { id?: unknown } | null;
    const postId = typeof created?.id === "string" ? ` as post ${created.id}` : "";
    return `Posted job ${job.id} (${job.slug})${postId}${imageNote}`;
  }
}
