import { api } from "@/server/http/api";

/** Any other /api path: JSON 404 (401 first under /api/admin and /api/internal). Logic lives in `server/http/api-endpoints.ts`. */
export const dynamic = "force-dynamic";

export const GET = (request: Request, context: RouteContext<"/api/[...path]">) => api().unknownRoute(request, context);
export const POST = (request: Request, context: RouteContext<"/api/[...path]">) => api().unknownRoute(request, context);
export const PUT = (request: Request, context: RouteContext<"/api/[...path]">) => api().unknownRoute(request, context);
export const PATCH = (request: Request, context: RouteContext<"/api/[...path]">) => api().unknownRoute(request, context);
export const DELETE = (request: Request, context: RouteContext<"/api/[...path]">) => api().unknownRoute(request, context);
