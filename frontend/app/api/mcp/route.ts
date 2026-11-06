import { api } from "@/server/http/api";

/** MCP endpoint (admin token or API key). Logic lives in `server/mcp`. */
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export const GET = (request: Request, context: RouteContext<"/api/mcp">) => api().mcp(request, context);
export const POST = (request: Request, context: RouteContext<"/api/mcp">) => api().mcp(request, context);
export const DELETE = (request: Request, context: RouteContext<"/api/mcp">) => api().mcp(request, context);
