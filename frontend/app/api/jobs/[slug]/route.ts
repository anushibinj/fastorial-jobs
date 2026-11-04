import { api } from "@/server/http/api";

/** Public job detail: GET /api/jobs/{slug}. Logic lives in `server/http/api-endpoints.ts`. */
export const dynamic = "force-dynamic";

export const GET = (request: Request, context: RouteContext<"/api/jobs/[slug]">) => api().getPublicJob(request, context);
