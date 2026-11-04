import { api } from "@/server/http/api";

/** Public job list: GET /api/jobs?q=&location=&workMode=&expMin=&expMax=&tags=&page=&size=. Logic lives in `server/http/api-endpoints.ts`. */
export const dynamic = "force-dynamic";

export const GET = (request: Request, context: RouteContext<"/api/jobs">) => api().listPublicJobs(request, context);
