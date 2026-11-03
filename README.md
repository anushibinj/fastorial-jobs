# Jobs by Fastorial

A curated aggregator for software engineering jobs, filterable by location, experience and tech stack.
Jobs are found by hand on LinkedIn, Naukri and other boards, then posted by the admin.

## Layout

| Path | What |
|---|---|
| `backend/` | Spring Boot 3, Java 21, Gradle (Kotlin DSL), PostgreSQL, Flyway |
| `frontend/` | Next.js (App Router), TypeScript, Tailwind, shadcn/ui, PWA. pnpm only |
| `docs/` | Local development, deployment, OpenAPI spec, seed script |
| `firebase.json` | Firebase Hosting: `/api/**` to the backend, everything else to Next.js |
| `docker-compose.yml` | Local Postgres 16 |

## Quick start

```bash
docker compose up -d
cd backend && ADMIN_TOKEN=dev-admin CLEANUP_SECRET=dev-secret ./gradlew bootRun   # :8080
cd frontend && cp .env.example .env.local && pnpm install && pnpm dev            # :3000
```

See [docs/local-development.md](docs/local-development.md) and [docs/deploy.md](docs/deploy.md).
Status and decisions are in [TODO.md](TODO.md).
