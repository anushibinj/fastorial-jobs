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

See [docs/local-development.md](docs/local-development.md) and [docs/deploy.md](docs/deploy.md).
Status and decisions are in [TODO.md](TODO.md).
