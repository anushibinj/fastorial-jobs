import { api } from "@/server/http/api";

/** Admin job read and replace (admin token or API key). Logic lives in `server/http/api-endpoints.ts`. */
export const dynamic = "force-dynamic";

export const GET = (request: Request, context: RouteContext<"/api/admin/jobs/[id]">) => api().getAdminJob(request, context);
export const PUT = (request: Request, context: RouteContext<"/api/admin/jobs/[id]">) => api().updateJob(request, context);
