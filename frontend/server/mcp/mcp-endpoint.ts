import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import type { Services } from "@/server/container";
import { createMcpServer } from "@/server/mcp/mcp-server";

/**
 * Serves one MCP request over Streamable HTTP, statelessly: a fresh server and transport per request,
 * JSON responses instead of event streams. That fits a multi instance deployment, because nothing has to
 * be remembered between requests (no session ids). The caller has already authenticated the request.
 */
export async function handleMcpRequest(s: Services, request: Request): Promise<Response> {
  // A stateless server has no stream to offer for GET and nothing to end for DELETE (MCP allows 405).
  if (request.method !== "POST") {
    return Response.json(
      { jsonrpc: "2.0", error: { code: -32000, message: "Method not allowed" }, id: null },
      { status: 405, headers: { Allow: "POST" } },
    );
  }
  const server = createMcpServer(s);
  const transport = new WebStandardStreamableHTTPServerTransport({ enableJsonResponse: true });
  await server.connect(transport);
  try {
    return await transport.handleRequest(request);
  } finally {
    // Safe to close right away: with JSON responses the body is complete once handleRequest resolves.
    await server.close();
  }
}
