import "server-only";
import type { AdminJobDetail, AdminJobSummary, ApiKey, DetectedTag, JobDetail, PageOf, PostintimeSettingsDto, TagDto } from "@/lib/types";
import { getServices } from "@/server/container";
import {
  parseApiKeyRequest,
  parseDetectRequest,
  parseExtendRequest,
  parseStatusRequest,
} from "@/server/requests/admin-requests";
import type { PushOutcome } from "@/server/postintime/postintime-publisher";
import { parseSettingsRequest } from "@/server/postintime/settings";
import { parseJobRequest } from "@/server/requests/job-request";
import { parseAdminJobQuery } from "@/server/requests/list-queries";
import { pathId } from "@/server/requests/request-params";

/**
 * Admin operations for the admin pages and server actions. Only import from server code; callers must
 * check the admin session first (`requireAdmin`).
 *
 * These used to be HTTP calls to the backend with the admin token; they now call the services directly.
 * Inputs from the browser (form payloads, ids, statuses) still pass through the same parsers as the REST
 * API, because a server action is a public endpoint and its arguments cannot be trusted. Failures are
 * thrown as `ApiException` with the same codes and messages the API returns. Every function is `async`,
 * so invalid input always arrives as a rejected promise (callers use `.catch`), never as a synchronous throw.
 */

const ADMIN_PAGE_SIZE = 30;

/** One page of every job, most recently edited first, optionally filtered by text and status. */
export async function adminListJobs(params: { q?: string; status?: string; postintime?: string; page?: number }): Promise<PageOf<AdminJobSummary>> {
  const query = new URLSearchParams();
  if (params.q) query.set("q", params.q);
  if (params.status) query.set("status", params.status);
  query.set("page", String(params.page ?? 0));
  const { q, status, page } = parseAdminJobQuery(query);
  const posted = params.postintime === "posted" ? true : params.postintime === "not-posted" ? false : null;
  return getServices().jobQueries.searchAdmin(q, status, page, ADMIN_PAGE_SIZE, posted);
}

export const adminGetJob = async (id: number | string): Promise<AdminJobDetail> =>
  getServices().jobQueries.getAdmin(pathId(String(id), "Job not found"));

export const adminCreateJob = async (body: unknown): Promise<JobDetail> =>
  getServices().jobCommands.create(parseJobRequest(body));

export const adminUpdateJob = async (id: number | string, body: unknown): Promise<JobDetail> =>
  getServices().jobCommands.update(pathId(String(id), "Job not found"), parseJobRequest(body));

export const adminSetStatus = async (id: number | string, status: string): Promise<JobDetail> =>
  getServices().jobCommands.setStatus(pathId(String(id), "Job not found"), parseStatusRequest({ status }));

export const adminExtend = async (id: number | string, days?: number): Promise<JobDetail> =>
  getServices().jobCommands.extend(pathId(String(id), "Job not found"), parseExtendRequest(days ? { days } : {}));

/** Adds a pending tag of a draft to the tag vocabulary and to the job. */
export const adminApprovePendingTag = async (id: number | string, slug: string, name: string, category: string): Promise<JobDetail> =>
  getServices().jobCommands.approvePendingTag(pathId(String(id), "Job not found"), slug, name, category);

/** Drops a pending tag of a draft without creating it. */
export const adminSkipPendingTag = async (id: number | string, slug: string): Promise<JobDetail> =>
  getServices().jobCommands.skipPendingTag(pathId(String(id), "Job not found"), slug);

/** Queues one job for PostInTime and returns at once. Pushes are sent one at a time; the result lands in the PostInTime tab. */
export const adminPushToPostintime = async (id: number | string): Promise<PushOutcome> => {
  const services = getServices();
  const job = await services.jobQueries.getAdmin(pathId(String(id), "Job not found"));
  return services.postintimeQueue.enqueueManual(job);
};

export const adminTags = async (): Promise<TagDto[]> => getServices().tagCatalog.listTags();

export const adminDetectTags = async (title: unknown, description: unknown): Promise<DetectedTag[]> => {
  const request = parseDetectRequest({ title, description });
  return getServices().tagDetection.detect(request.title, request.description);
};

export const adminListApiKeys = async (): Promise<ApiKey[]> => getServices().apiKeys.list();

/** The returned `key` is the plaintext and is only available from this call. */
export const adminCreateApiKey = async (name: unknown): Promise<ApiKey> =>
  getServices().apiKeys.create(parseApiKeyRequest({ name }));

export const adminRevokeApiKey = async (id: number | string): Promise<void> =>
  getServices().apiKeys.revoke(pathId(String(id), "API key not found"));

/** The PostInTime connection without its token. */
export const adminGetPostintimeSettings = async (): Promise<PostintimeSettingsDto> => getServices().postintimeSettings.get();

/** A blank `apiToken` in the body keeps the stored token. */
export const adminSavePostintimeSettings = async (body: unknown): Promise<PostintimeSettingsDto> =>
  getServices().postintimeSettings.update(parseSettingsRequest(body));
