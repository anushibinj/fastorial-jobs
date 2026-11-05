import { api } from "@/server/http/api";

/** Admin job list and create (admin token or API key). Logic lives in `server/http/api-endpoints.ts`. */
export const dynamic = "force-dynamic";

export const GET = (request: Request, context: RouteContext<"/api/admin/jobs">) => api().listAdminJobs(request, context);
export const POST = (request: Request, context: RouteContext<"/api/admin/jobs">) => api().createJob(request, context);
