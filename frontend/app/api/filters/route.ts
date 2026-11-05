import { api } from "@/server/http/api";

/** Filter facets: GET /api/filters. Logic lives in `server/http/api-endpoints.ts`. */
export const dynamic = "force-dynamic";

export const GET = (request: Request, context: RouteContext<"/api/filters">) => api().getFilters(request, context);
