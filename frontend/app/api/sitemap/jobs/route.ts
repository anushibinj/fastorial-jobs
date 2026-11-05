import { api } from "@/server/http/api";

/** Sitemap entries: GET /api/sitemap/jobs. Logic lives in `server/http/api-endpoints.ts`. */
export const dynamic = "force-dynamic";

export const GET = (request: Request, context: RouteContext<"/api/sitemap/jobs">) => api().getSitemapJobs(request, context);
