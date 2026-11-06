import { api } from "@/server/http/api";

/** Bulk job creation (admin token or API key): answers 202 once the jobs are queued. */
export const dynamic = "force-dynamic";

export const POST = (request: Request, context: RouteContext<"/api/admin/jobs/bulk">) => api().createJobsBulk(request, context);
