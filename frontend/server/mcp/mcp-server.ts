import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";
import { JOB_SOURCES, JOB_STATUSES, SALARY_PERIODS, WORK_MODES } from "@/lib/api/contract";
import type { Services } from "@/server/container";
import { errorBody } from "@/server/http/routes";
import { parseDetectRequest, parseExtendRequest, parseStatusRequest } from "@/server/requests/admin-requests";
import { parseJobRequest } from "@/server/requests/job-request";
import { parseAdminJobQuery } from "@/server/requests/list-queries";
import { pathId } from "@/server/requests/request-params";
import { ApiException } from "@/server/shared/api-exception";

/**
 * The MCP face of the jobs API: the admin job and tag endpoints as tools, for an AI assistant.
 *
 * Each tool takes structured arguments, runs them through the same request parsers as the REST
 * endpoints (so validation and its messages are identical), calls the same service method, and returns
 * the JSON the REST endpoint would. API keys and the internal cleanup are deliberately not exposed.
 * Authentication happens before this server is reached (see `mcp-endpoint`).
 */

const jobFields = {
  title: z.string().describe("Job title, at most 200 characters."),
  companyName: z.string().describe("Company name, at most 150 characters."),
  companyLogoUrl: z.string().nullish().describe("Logo image URL, at most 500 characters."),
  description: z.string().nullish().describe("Markdown description of the role."),
  applyUrl: z.string().describe("Where to apply (a http(s) URL, at most 1000 characters). Must be unique across jobs."),
  source: z.enum(JOB_SOURCES).describe("The board the job was found on."),
  locationCity: z.string().nullish(),
  locationState: z.string().nullish(),
  locationCountry: z.string().nullish(),
  workMode: z.enum(WORK_MODES),
  experienceMinYears: z.number().int().describe("Minimum years of experience, 0 or more."),
  experienceMaxYears: z.number().int().nullish().describe("Maximum years of experience; not below the minimum."),
  salaryMin: z.number().int().nullish(),
  salaryMax: z.number().int().nullish(),
  salaryCurrency: z.string().nullish().describe("3 letter code such as INR or USD; required when a salary is given."),
  salaryPeriod: z.enum(SALARY_PERIODS).nullish(),
  status: z.enum(JOB_STATUSES).nullish().describe("Defaults to PUBLISHED on create; on update, omitted keeps the current status."),
  postedAt: z.iso.datetime({ offset: true }).nullish().describe("ISO-8601 instant. Defaults to now."),
  expiresAt: z.iso.datetime({ offset: true }).nullish().describe("ISO-8601 instant. Defaults to the standard expiry period."),
  tags: z.array(z.string()).nullish().describe("Tag slugs; see list_tags for the vocabulary."),
};

const jobId = z.string().regex(/^\d+$/, "Digits only").describe("The job id, as returned by list_jobs or create_job.");

/** A successful tool result carrying `value` as JSON text. */
function ok(value: unknown): CallToolResult {
  return { content: [{ type: "text", text: JSON.stringify(value, null, 2) }] };
}

/** A failed tool result in the same `{ code, message, fieldErrors }` shape the REST API uses. */
function failure(services: Services, error: unknown): CallToolResult {
  let body;
  if (ApiException.is(error)) {
    body = errorBody(error.code, error.message, error.fieldErrors);
  } else {
    services.logger.error("Unhandled MCP tool error", error);
    body = errorBody("INTERNAL_ERROR", "Something went wrong");
  }
  return { isError: true, content: [{ type: "text", text: JSON.stringify(body, null, 2) }] };
}

/** Creates an MCP server whose tools call `services`. One per request (the endpoint is stateless). */
export function createMcpServer(s: Services): McpServer {
  const server = new McpServer({ name: "fastorial-jobs", version: "1.0.0" });

  /** Registers a tool whose handler's result is returned as JSON and whose errors become tool errors. */
  function tool<S extends z.ZodRawShape>(
    name: string,
    description: string,
    inputSchema: S,
    handler: (args: z.infer<z.ZodObject<S>>) => Promise<unknown>,
    readOnly = false,
  ) {
    server.registerTool(
      name,
      { description, inputSchema, annotations: { readOnlyHint: readOnly, openWorldHint: false } },
      // The SDK cannot infer the argument type from a generic shape, so the callback is typed loosely.
      (async (args: z.infer<z.ZodObject<S>>) => {
        try {
          return ok(await handler(args));
        } catch (error) {
          return failure(s, error);
        }
      }) as never,
    );
  }

  tool(
    "list_jobs",
    "List jobs of every status, most recently edited first. Filter by free text and/or status; paged.",
    {
      q: z.string().optional().describe("Free text matched against title, company and so on."),
      status: z.enum(JOB_STATUSES).optional(),
      page: z.number().int().optional().describe("Zero based page number."),
      size: z.number().int().optional().describe("Page size; the server applies a default and a maximum."),
    },
    async (a) => {
      const params = new URLSearchParams();
      for (const [k, v] of Object.entries(a)) if (v !== undefined) params.set(k, String(v));
      const q = parseAdminJobQuery(params);
      return s.jobQueries.searchAdmin(q.q, q.status, q.page, q.size);
    },
    true,
  );

  tool("get_job", "Get one job by id, whatever its status.", { id: jobId }, async ({ id }) =>
    s.jobQueries.getAdmin(pathId(id, "Job not found")), true);

  tool(
    "create_job",
    "Create a job post. Fails with DUPLICATE_APPLY_URL when the apply URL is already used. A published job is pushed to PostInTime when that is configured.",
    jobFields,
    async (a) => s.jobCommands.create(parseJobRequest(a)),
  );

  tool(
    "update_job",
    "Replace all fields of an existing job (send the full job, not a patch). Use set_job_status or extend_job for those changes alone.",
    { id: jobId, ...jobFields },
    async ({ id, ...fields }) => s.jobCommands.update(pathId(id, "Job not found"), parseJobRequest(fields)),
  );

  tool(
    "set_job_status",
    "Set a job's status: DRAFT (hidden), PUBLISHED (visible) or CLOSED.",
    { id: jobId, status: z.enum(JOB_STATUSES) },
    async ({ id, status }) => s.jobCommands.setStatus(pathId(id, "Job not found"), parseStatusRequest({ status })),
  );

  tool(
    "extend_job",
    "Push a job's expiry out by a number of days from now, reopening it if it was closed.",
    { id: jobId, days: z.number().int().optional().describe("1 to 365; defaults to the standard expiry period.") },
    async ({ id, days }) => s.jobCommands.extend(pathId(id, "Job not found"), parseExtendRequest(days === undefined ? null : { days })),
  );

  tool("list_tags", "List the tag vocabulary (slugs usable in a job's `tags`).", {}, async () => s.tagCatalog.listTags(), true);

  tool(
    "detect_tags",
    "Suggest tags for a job from its title and description, best match first.",
    { title: z.string().optional(), description: z.string().optional() },
    async (a) => {
      const { title, description } = parseDetectRequest(a);
      return s.tagDetection.detect(title, description);
    },
    true,
  );

  return server;
}
