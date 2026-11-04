import { api } from "@/server/http/api";

/** Tag vocabulary (admin token or API key). Logic lives in `server/http/api-endpoints.ts`. */
export const dynamic = "force-dynamic";

export const GET = (request: Request, context: RouteContext<"/api/admin/tags">) => api().listTags(request, context);
