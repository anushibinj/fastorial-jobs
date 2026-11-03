# Jobs by Fastorial

A curated aggregator for software engineering jobs, filterable by location, experience and tech stack.

## Layout

- `backend/`: Spring Boot 3, Java 21, Gradle
- `frontend/`: Next.js, TypeScript, Tailwind, shadcn/ui (pnpm only)
- `docker-compose.yml`: local Postgres 16

## Run locally

```bash
docker compose up -d                 # Postgres on :5432
cd backend && ./gradlew bootRun      # API on :8080
cd frontend && pnpm install && pnpm dev   # UI on :3000
```

Copy `backend/.env.example` and `frontend/.env.example` first.
