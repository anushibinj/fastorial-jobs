import { api } from "@/server/http/api";

/** Revoke an API key (admin token only). Logic lives in `server/http/api-endpoints.ts`. */
export const dynamic = "force-dynamic";

export const DELETE = (request: Request, context: RouteContext<"/api/admin/api-keys/[id]">) => api().revokeApiKey(request, context);
