import { api } from "@/server/http/api";

/** API key list and create (admin token only). Logic lives in `server/http/api-endpoints.ts`. */
export const dynamic = "force-dynamic";

export const GET = (request: Request, context: RouteContext<"/api/admin/api-keys">) => api().listApiKeys(request, context);
export const POST = (request: Request, context: RouteContext<"/api/admin/api-keys">) => api().createApiKey(request, context);
