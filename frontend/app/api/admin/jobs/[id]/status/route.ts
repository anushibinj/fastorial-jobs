import { api } from "@/server/http/api";

/** Change a job's status (admin token or API key). Logic lives in `server/http/api-endpoints.ts`. */
export const dynamic = "force-dynamic";

export const PATCH = (request: Request, context: RouteContext<"/api/admin/jobs/[id]/status">) => api().setJobStatus(request, context);
