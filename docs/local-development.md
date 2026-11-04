# Local development

```bash
docker compose up -d                        # Postgres 16 on :5432
cd frontend
cp .env.example .env.local                  # DB_URL, ADMIN_TOKEN, CLEANUP_SECRET, ...
pnpm install
pnpm dev                                    # http://localhost:3000, migrates the database on start
python3 ../docs/seed-dev.py                 # optional: 12 sample jobs (ADMIN_TOKEN=dev-admin, default http://localhost:3000)
```

The app serves the pages and the API (`/api/**`) from the same origin, so there is no backend to start and no CORS to
configure. Admin is at `http://localhost:3000/admin` (sign in with the `ADMIN_TOKEN` from `.env.local`).
Close expired jobs by hand with `curl -X POST -H "X-Internal-Secret: <CLEANUP_SECRET>" localhost:3000/api/internal/jobs/cleanup`.

## Code layout

| Path | What |
|---|---|
| `app/api/**/route.ts` | One line per endpoint, binding it to `server/http/api-endpoints.ts` |
| `server/http/` | Endpoint handlers, error mapping, authentication policy per route |
| `server/requests/` | Request parsing and validation with the former Spring/Jackson rules |
| `server/jobs/`, `server/tags/`, `server/api-keys/` | Services (business rules) and PostgreSQL repositories |
| `server/db/` | Connection pool, unit of work, migrations and the Flyway compatible migrator |
| `server/container.ts` | Composition root: wires the concrete classes together |
| `lib/data/jobs.ts`, `lib/admin/api.ts` | What pages and server actions call (services in process, no HTTP) |
| `lib/api/contract.ts` | The JSON contract of the API, shared by server and UI |

## Tests

```bash
cd frontend && pnpm lint && pnpm typecheck && pnpm test && pnpm build
```

`pnpm test` runs the unit tests. The database tests (`*.db.test.ts`, including the ported integration tests of the
former Java backend) are skipped unless `TEST_DB_URL` points at a PostgreSQL database:

```bash
TEST_DB_URL=jdbc:postgresql://localhost:5432/fastorial_jobs pnpm test   # TEST_DB_USER / TEST_DB_PASSWORD default to fastorial
```

Each test file creates, migrates and drops its own schema (`test_<random>`), so the local development database is safe to
use and test files run in parallel.

`server/__fixtures__/legacy-java/` holds outputs captured from the former Java code (URL hashing, slugs, tag detection).
The tests compare against them so behaviour stays identical; see the README in that folder.

## API contract

`lib/api/contract.ts` defines the request and response shapes; `docs/openapi.json` is the OpenAPI description of the same
API, exported from the former backend. The API did not change in the move to Next.js, so it is still accurate; update it
by hand if an endpoint changes.

## Icons

`pnpm gen:icons` re-exports the PNG icons and favicon from `frontend/assets/logo.svg`.

## Service worker

`pnpm build` runs `next build` and then `pnpm build:sw`, which bundles `sw/sw.ts` into `public/sw.js`
with the precache list. It only registers in production builds. It never caches `/admin/**`,
`/api/**` or non GET requests.

## Lighthouse

```bash
cd frontend && pnpm build && pnpm start &           # production build on :3000
pnpm dlx lighthouse http://localhost:3000/ --view   # mobile profile by default
```

Last local run (production build, mobile profile): home 95 performance, job page 99, and 100 for accessibility,
best practices and SEO on both.
