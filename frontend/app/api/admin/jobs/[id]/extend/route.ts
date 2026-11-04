import { api } from "@/server/http/api";

/** Extend or reopen a job (admin token or API key). Logic lives in `server/http/api-endpoints.ts`. */
export const dynamic = "force-dynamic";

export const POST = (request: Request, context: RouteContext<"/api/admin/jobs/[id]/extend">) => api().extendJob(request, context);
