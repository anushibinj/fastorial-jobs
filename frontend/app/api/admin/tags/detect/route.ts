import { api } from "@/server/http/api";

/** Tag suggestions for a title and description (admin token or API key). Logic lives in `server/http/api-endpoints.ts`. */
export const dynamic = "force-dynamic";

export const POST = (request: Request, context: RouteContext<"/api/admin/tags/detect">) => api().detectTags(request, context);
