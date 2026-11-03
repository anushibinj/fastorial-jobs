# Local development

```bash
docker compose up -d                        # Postgres 16 on :5432
cp backend/.env.example backend/.env        # backend reads real env vars, export them or use your IDE
cd backend
ADMIN_TOKEN=dev-admin CLEANUP_SECRET=dev-secret ./gradlew bootRun

cd frontend
cp .env.example .env.local
pnpm install
pnpm dev                                    # http://localhost:3000
python3 ../docs/seed-dev.py                 # optional: 12 sample jobs (ADMIN_TOKEN=dev-admin)
```

The frontend proxies `/api/**` to `API_BASE_URL`, mirroring the Firebase Hosting rewrite.
Admin is at `http://localhost:3000/admin` (sign in with the `ADMIN_TOKEN` the frontend was started with).

## Tests

```bash
cd backend && ./gradlew test                # integration tests use Testcontainers (needs Docker)
# without Docker, point them at any empty Postgres database:
TEST_DB_URL=jdbc:postgresql://localhost:5432/fastorial_test ./gradlew test

cd frontend && pnpm lint && pnpm typecheck && pnpm test && pnpm build
```

## API types

`docs/openapi.json` is exported from the running backend (`/v3/api-docs`). After changing the API:

```bash
curl -s localhost:8080/v3/api-docs | python3 -m json.tool > docs/openapi.json
cd frontend && pnpm gen:api
```

## Icons

`pnpm gen:icons` re-exports the PNG icons and favicon from `frontend/assets/logo.svg`.

## Service worker

`pnpm build` runs `next build` and then `pnpm build:sw`, which bundles `sw/sw.ts` into `public/sw.js`
with the precache list. It only registers in production builds. It never caches `/admin/**`,
`/api/**` or non GET requests.
