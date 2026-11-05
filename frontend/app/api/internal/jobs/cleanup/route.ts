import { api } from "@/server/http/api";

/** Daily cleanup called by Cloud Scheduler (X-Internal-Secret). Logic lives in `server/http/api-endpoints.ts`. */
export const dynamic = "force-dynamic";

export const POST = (request: Request, context: RouteContext<"/api/internal/jobs/cleanup">) => api().cleanupJobs(request, context);
