# Jobs by Fastorial

A curated aggregator for software engineering jobs, filterable by location, experience and tech stack.
Jobs are found by hand on LinkedIn, Naukri and other boards, then posted by the admin.

## Layout

One Next.js app serves the site, the admin UI and the JSON API, and talks to PostgreSQL directly.
(Until November 2026 the API was a separate Spring Boot service; its logic now lives in `frontend/server/`
with the same endpoints, payloads and environment variables.)

| Path | What |
|---|---|
| `frontend/` | Next.js (App Router), TypeScript, Tailwind, shadcn/ui, PWA. pnpm only |
| `frontend/server/` | The jobs API: services, PostgreSQL repositories, migrations (Flyway compatible) |
| `frontend/server/mcp/` | The MCP server: the admin job and tag operations as tools, served at `/api/mcp` |
| `frontend/app/api/` | Route handlers that expose the API under `/api/**` |
| `docs/` | Local development, deployment, OpenAPI spec, seed script |
| `firebase.json` | Firebase App Hosting backend for `frontend/` (see `frontend/apphosting.yaml`) |
| `docker-compose.yml` | Local Postgres 16 (and the whole app with `--profile full`) |

## Quick start

```bash
docker compose up -d                                                   # Postgres on :5432
cd frontend && cp .env.example .env.local && pnpm install && pnpm dev  # :3000, migrates the database on start
```

## Creating jobs from automations (API keys)

Create a key in the admin UI under **Admin → API keys**. The key is shown once, so copy it
straight away; only a SHA-256 hash of it is stored. Revoke it from the same page.
Send it in the `X-API-Key` header. Keys can call the job and tag endpoints under
`/api/admin/jobs` and `/api/admin/tags`; they cannot manage API keys.

Replace `$API` with the site URL (`https://jobs.fastorial.dev`, or `http://localhost:3000` locally) and `$KEY`
with your key. Automations that still point at the old Cloud Run backend URL must switch to the site URL;
the paths, headers and payloads are unchanged.

```bash
curl -X POST "$API/api/admin/jobs" \
  -H "X-API-Key: $KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "title": "Senior Java Engineer",
    "companyName": "Acme",
    "companyLogoUrl": "https://example.com/logo.png",
    "description": "Markdown description of the role.",
    "applyUrl": "https://www.linkedin.com/jobs/view/1234567890",
    "source": "LINKEDIN",
    "locationCity": "Hyderabad",
    "locationState": "Telangana",
    "locationCountry": "India",
    "workMode": "HYBRID",
    "experienceMinYears": 5,
    "experienceMaxYears": 8,
    "salaryMin": 3000000,
    "salaryMax": 4500000,
    "salaryCurrency": "INR",
    "salaryPeriod": "YEARLY",
    "status": "PUBLISHED",
    "tags": ["java", "spring-boot", "postgresql"]
  }'
```

| Field | Required | Notes |
|---|---|---|
| `title`, `companyName`, `applyUrl` | yes | `applyUrl` must be `http(s)://` and unique; a duplicate returns `409 DUPLICATE_APPLY_URL` |
| `source` | yes | `LINKEDIN`, `NAUKRI`, `COMPANY_SITE`, `OTHER` |
| `workMode` | yes | `ONSITE`, `HYBRID`, `REMOTE` |
| `experienceMinYears` | yes | `experienceMaxYears` is optional (open ended) and must be >= min |
| `salaryMin`, `salaryMax`, `salaryCurrency`, `salaryPeriod` | no | If any amount is set, currency (3 letters) and period (`YEARLY`, `MONTHLY`) are required |
| `status` | no | `DRAFT`, `PUBLISHED` (default), `CLOSED` |
| `postedAt`, `expiresAt` | no | ISO-8601 instants, e.g. `2026-11-03T09:00:00Z`. Expiry defaults to 30 days after posting |
| `tags` | no | Tag slugs; list them with `GET /api/admin/tags` |
| `description`, `companyLogoUrl`, `locationCity`, `locationState`, `locationCountry` | no | |

Success is `201 Created` with the job, including its `id` and `slug`. A bad or revoked key
returns `401`, and validation problems return `400` with per-field `fieldErrors`.
Other useful calls with the same header: `GET /api/admin/jobs`, `PUT /api/admin/jobs/{id}`,
`PATCH /api/admin/jobs/{id}/status` (`{"status":"CLOSED"}`) and `POST /api/admin/jobs/{id}/extend`.

## Using the API from an AI assistant (MCP)

The same job and tag operations are available as [Model Context Protocol](https://modelcontextprotocol.io) tools
at `POST /api/mcp` (Streamable HTTP, stateless, JSON responses). It uses the same API keys as the REST API:
send the key as `X-API-Key`, or as `Authorization: Bearer <key>` for clients that only support that. The admin
token also works. A bad or missing key returns `401`.

Tools: `list_jobs`, `get_job`, `create_job`, `update_job`, `set_job_status`, `extend_job`, `list_tags` and
`detect_tags`. They validate exactly like the REST endpoints; a failure comes back as a tool error whose text is
the usual `{ code, message, fieldErrors }` body. API key management and the cleanup job are not exposed.

```bash
claude mcp add --transport http fastorial-jobs "$API/api/mcp" --header "X-API-Key: $KEY"
```

## Pushing new jobs to PostInTime

Every job that is created as `PUBLISHED` (from the admin form or the API) raises a `JobPostCreated` event.
When the connection is switched on, a listener turns it into a post on your [PostInTime](https://github.com/anushibinj/postintime)
server:

- **title**: `{title} at {company}`
- **caption**: the same text as the site's "Copy text" button, ending with the link to the job
- **media**: the job's link preview picture redrawn at 1080 x 1080 (1:1)
- **status**: `draft` (waits for you in PostInTime) or `ready`, your choice

Set it up under **Admin → PostInTime**: server URL, a PostInTime personal API token (`pit_…`, created in PostInTime under
Settings), the channel id (`GET /api/v1/public/channels`) and the status. The form shows the exact endpoint it will call,
`{server}/api/v1/public/channels/{channelId}/posts`. The token is stored in the `postintime_settings` table and never sent back
to the browser; leave the field empty to keep the saved one.

Good to know:

- The push runs after the response (Next.js `after()`), so a slow or broken PostInTime never delays or fails job creation.
  The page shows the outcome under **Last push**, including the HTTP status when PostInTime refuses.
- Drafts and closed jobs are not pushed, and neither are edits: only the creation event counts. There is no retry; post a
  missed job by hand in PostInTime.
- If the image cannot be drawn, the post is still sent, without media, and the result says so.
- The 1:1 image is `jobSquareImage` in `frontend/lib/og.tsx`, built from the same `buildPreviewMeta` as the 1200 x 630 preview.

See [docs/local-development.md](docs/local-development.md) and [docs/deploy.md](docs/deploy.md).
Status and decisions are in [TODO.md](TODO.md).
