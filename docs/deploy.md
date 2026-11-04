# Deploying

One service: the Next.js app in `frontend/` serves the pages, the admin UI and the JSON API, and talks to
PostgreSQL directly.

```
browser, automations (X-API-Key) ──> Firebase App Hosting: Next.js (frontend/)  https://jobs.fastorial.dev
                                        ├─ pages, admin UI, /api/**
                                        └─ PostgreSQL (DB_URL)
Cloud Scheduler --daily--> POST https://jobs.fastorial.dev/api/internal/jobs/cleanup
```

| | |
|---|---|
| Runs on | Firebase App Hosting (backend id `fastorial-jobs`) |
| Config | `frontend/apphosting.yaml`, `firebase.json` |
| Deploys | automatically on push to the live branch |
| Database schema | migrated automatically when a server instance starts (`frontend/instrumentation.ts`) |

Firebase and GCP project: `fastorial` (`.firebaserc`). Run everything locally with `docker compose --profile full up --build`.

Until November 2026 the API was a separate Spring Boot service on Cloud Run. If that service still exists,
follow [section 3](#3-one-time-cutover-from-the-spring-boot-backend) once.

## Caching

Public pages (`/`, `/jobs/:slug`, the OG images) are rendered on demand and send
`Cache-Control: public, s-maxage=60, stale-while-revalidate=300`; `sitemap.xml` uses a 60 second cache.
App Hosting's CDN should honour that. Nothing relies on Next.js ISR or `revalidateTag`, because their cache lives on each
container's disk. Admin pages send `private, no-store`, every response of `/api/admin/**` and `/api/internal/**`
sends `no-store` (errors included), and the public `/api/**` responses send no `Cache-Control`, as before.
`next.config.ts` also sets `sw.js` to `no-cache`.

The admin session cookie is named `__session`, the one cookie Firebase's CDN forwards to the server. Keep that name.

## 1. Configuration (one time)

All runtime settings are in `frontend/apphosting.yaml`. They use the same names as the former backend:

| Variable | Source | Meaning |
|---|---|---|
| `DB_URL` | secret `fastorial-db-url` | JDBC (`jdbc:postgresql://host:5432/db?sslmode=require`) or `postgres://` URL |
| `DB_USER` | secret `fastorial-db-user` | database user |
| `DB_PASSWORD` | secret `fastorial-db-password` | database password |
| `DB_POOL_SIZE` | value `5` | connections per instance (`maxInstances: 2`, so at most 10) |
| `ADMIN_TOKEN` | secret `fastorial-admin-token` | admin UI login and `X-Admin-Token` |
| `CLEANUP_SECRET` | secret `fastorial-cleanup-secret` | `X-Internal-Secret` of the daily cleanup |
| `NEXT_PUBLIC_SITE_URL` | value, build time | public origin (canonical URLs, sitemap, share links) |

Create the secrets from the repo root (each command prompts for the value and offers to grant this App Hosting backend
access):

```bash
firebase apphosting:secrets:set fastorial-db-url        # e.g. jdbc:postgresql://<host>:5432/fastorial_jobs?sslmode=require
firebase apphosting:secrets:set fastorial-db-user
firebase apphosting:secrets:set fastorial-db-password
firebase apphosting:secrets:set fastorial-admin-token   # openssl rand -hex 24
firebase apphosting:secrets:set fastorial-cleanup-secret
```

A secret that already exists in Secret Manager (created with `gcloud` for the old backend) only needs access granted
(the command takes a comma separated list):

```bash
firebase apphosting:secrets:grantaccess fastorial-db-password,fastorial-cleanup-secret,fastorial-admin-token --backend fastorial-jobs
```

A rollout fails when a secret in `apphosting.yaml` is missing or not accessible, so do this before pushing.

### Production Postgres

| Option | Notes |
|---|---|
| Cloud SQL (Postgres 16, same region) | With a private IP, App Hosting must reach the VPC: uncomment `runConfig.vpcAccess` in `apphosting.yaml` and set the network. `DB_URL=jdbc:postgresql://<private-ip>:5432/fastorial_jobs` |
| Neon or Supabase | Use the TLS URL with `?sslmode=require`. The pooled (transaction mode) URL works too: migrations take a transaction scoped lock |

`sslmode` follows the JDBC driver: `require` encrypts without verifying the certificate, `verify-full` also verifies it.
Without `sslmode` the connection is not encrypted (the JDBC driver would have tried TLS first; node-postgres cannot), so
always set it for a database reached over the internet.

Enable automated backups (Cloud SQL: point-in-time recovery on; Neon and Supabase: their built-in backups), then
**test a restore** into a scratch database once before launch and note the steps here.

### Migrations

`frontend/server/db/migrations/` holds the schema migrations (the former Flyway scripts, byte for byte). A starting
server instance applies any that are missing, using Flyway's own `flyway_schema_history` table, so a database that
Flyway already migrated is recognized as up to date. Like Flyway it refuses to run if an applied script was edited.
To change the schema, add a new `V5__*.ts` module and list it in `migrations/index.ts`; never edit an applied one.

Unlike Spring, a failed migration does not stop the instance (Next.js would keep a half started server answering 500
to everything). Instead every database access waits for the schema: while the database is unreachable or a migration
fails, routes that need the database answer 500, the logs show `Database migration failed; retrying ...`, and the next
request after 5 seconds tries again. Pages that do not need the database keep working, and the instance recovers by
itself once the database is back. A migration that fails for good (a bug in a new script) therefore shows up as those
log lines after a rollout: roll back in App Hosting and fix the script.

### Min instances

`minInstances` defaults to 0 (cheapest). Measured on one development machine, from process start to the first successful
API response (database connection and migration check included): about 0.6 s for this app, against 8.2 to 9 s for the
former Spring Boot backend. Cloud Run's single vCPU will be slower in absolute terms, but cold starts should be mild;
raise `minInstances` to 1 if first visitors still notice.

## 2. Deploy

1. Confirm `NEXT_PUBLIC_SITE_URL` in `frontend/apphosting.yaml` (inlined into the build, so **a change needs a new
   rollout**).
2. Push to the live branch. App Hosting builds with pnpm (from `pnpm-lock.yaml`) and rolls out. The build does not need
   the database. Watch the rollout in the Firebase console, App Hosting. To roll out by hand:
   `firebase apphosting:rollouts:create fastorial-jobs`.
3. Check it on the `*.hosted.app` URL: `/` lists jobs and "Load more" works; the logs show
   `[jobs] Database schema is up to date` (or the migrations that ran); the API answers:

   ```bash
   curl -s https://<site>/api/filters
   curl -s -o /dev/null -w "%{http_code}\n" https://<site>/api/admin/jobs                         # 401
   curl -s -o /dev/null -w "%{http_code}\n" -H "X-Admin-Token: $TOKEN" https://<site>/api/admin/jobs  # 200
   ```

Do not run `firebase deploy --only hosting`. There is no Hosting site in this setup.

## 3. One-time cutover from the Spring Boot backend

The API keeps its paths, headers, payloads and database, so the cutover only moves where it runs.

1. Create or grant the secrets of section 1. Use the values the Cloud Run service `fastorial-jobs-backend` had: its
   `DB_URL` and `DB_USER` (from the old GitHub repository variables or
   `gcloud run services describe fastorial-jobs-backend --region $REGION`) go into `fastorial-db-url` and
   `fastorial-db-user`; the existing `fastorial-db-password`, `fastorial-admin-token` and `fastorial-cleanup-secret`
   only need access granted.
2. If the database is on a private IP, configure `vpcAccess` (section 1).
3. Push to the live branch and check the rollout (section 2). The schema is already at V4, so nothing is migrated.
4. Point Cloud Scheduler at the site:

   ```bash
   gcloud scheduler jobs update http close-expired-jobs --location $REGION \
     --uri "https://jobs.fastorial.dev/api/internal/jobs/cleanup"
   ```

5. Tell every automation that uses an API key to replace the old backend URL with `https://jobs.fastorial.dev`.
   Keys stay valid; they live in the same database.
6. When nothing calls the old service any more (its request logs are empty), delete it and its images:
   `gcloud run services delete fastorial-jobs-backend --region $REGION`, then the `backend` images in Artifact
   Registry. `CORS_ALLOWED_ORIGINS` is no longer needed: the browser calls the API on the site's own origin.

## 4. Custom domain

Firebase console, App Hosting, the backend, Settings, Domains, add `jobs.fastorial.dev` and the DNS records it shows.
Managed HTTPS can take a few hours. Keep `NEXT_PUBLIC_SITE_URL=https://jobs.fastorial.dev`.

## 5. Stale job cleanup

Cloud Run (which App Hosting uses) may scale to zero and throttles CPU outside requests, so an in-process cron is
unreliable. Cloud Scheduler calls the app once a day, early morning Asia/Kolkata:

```bash
gcloud scheduler jobs create http close-expired-jobs \
  --location $REGION --schedule "30 3 * * *" --time-zone "Asia/Kolkata" \
  --uri "https://jobs.fastorial.dev/api/internal/jobs/cleanup" \
  --http-method POST \
  --headers "X-Internal-Secret=$(gcloud secrets versions access latest --secret fastorial-cleanup-secret)"
```

The endpoint is idempotent and returns `{"closed": N}`. Expired jobs also disappear from the public list and the sitemap
immediately, and their pages show the closed banner, before the sweep runs. Locally, call it by hand:
`curl -X POST -H "X-Internal-Secret: dev-secret" localhost:3000/api/internal/jobs/cleanup`.

## 6. After launch

- **Search Console:** add the `https://jobs.fastorial.dev` property, verify via DNS, submit `https://jobs.fastorial.dev/sitemap.xml`.
- **Analytics:** add `NEXT_PUBLIC_UMAMI_SRC` and `NEXT_PUBLIC_UMAMI_WEBSITE_ID` (or `NEXT_PUBLIC_PLAUSIBLE_DOMAIN`) to the
  `env` list in `frontend/apphosting.yaml` with `availability: [BUILD]`. Nothing loads when they are empty.
- **Soft launch:** post 30 to 50 real jobs from `/admin/jobs/new`, then share a few links on the Fastorial channel.

## 7. Link preview and device checks

These need the public URL, so they are done by hand after the first deploy. Use a real job URL each time.

- LinkedIn Post Inspector, X card validator, Facebook Sharing Debugger (re-scrape to refresh a cached preview).
- WhatsApp, Slack and Telegram: paste the link into a chat and check title, years of experience, age, tags and the image.
- Chrome DevTools, Application tab: manifest, installability, service worker. Then install on a real Android phone.
- iOS Safari: Share, Add to Home Screen, then open a shared `/jobs/<slug>` link in standalone mode.
- Lighthouse on `/` and a job page (see `docs/local-development.md` for the command).
