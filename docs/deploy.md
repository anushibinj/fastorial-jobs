# Deploying

```
browser -> Firebase Hosting (CDN, jobs.fastorial.dev)
             |-- /api/**  -> Cloud Run: fastorial-jobs-backend  (Spring Boot)  -> Postgres
             |-- /**      -> Cloud Run: fastorial-jobs-frontend (Next.js)       -> backend (API_BASE_URL)
Cloud Scheduler --daily--> POST /api/internal/jobs/cleanup (backend)
```

The browser only ever sees one origin, so there is no CORS in production.

## Caching

Public pages (`/`, `/jobs/:slug`, the OG image) are rendered on demand and send
`Cache-Control: public, s-maxage=60, stale-while-revalidate=300`. Firebase Hosting's CDN keeps them for
60 seconds and may serve a stale copy for up to 5 more minutes while it refreshes. Nothing relies on
Next.js ISR or `revalidateTag`, because their cache lives on each container's disk.
Admin pages send `private, no-store`.

Firebase Hosting forwards only a cookie named `__session` to Cloud Run. The admin session cookie is
named accordingly.

## Environment variables

Backend (`backend/.env.example`):

| Variable | Purpose |
|---|---|
| `PORT` | Injected by Cloud Run |
| `DB_URL`, `DB_USER`, `DB_PASSWORD` | PostgreSQL connection |
| `ADMIN_TOKEN` | Required header `X-Admin-Token` for `/api/admin/**`. Empty rejects every call |
| `CLEANUP_SECRET` | Required header `X-Internal-Secret` for `/api/internal/**`. Empty rejects every call |
| `CORS_ALLOWED_ORIGINS` | Local development only |

Frontend (`frontend/.env.example`):

| Variable | Purpose |
|---|---|
| `NEXT_PUBLIC_SITE_URL` | Build time. Used for `metadataBase`, share links, sitemap |
| `API_BASE_URL` | Backend Cloud Run URL (server side only) |
| `ADMIN_TOKEN` | The token you type on `/admin/login`. Must equal the backend `ADMIN_TOKEN` |

Keep secrets in Secret Manager and mount them as env vars on the services.

## Deploy

```bash
PROJECT=fastorial-jobs
REGION=asia-south1

# backend
gcloud run deploy fastorial-jobs-backend --project $PROJECT --region $REGION \
  --source backend --allow-unauthenticated \
  --set-env-vars DB_URL=jdbc:postgresql://...,DB_USER=...,CORS_ALLOWED_ORIGINS=https://jobs.fastorial.dev \
  --set-secrets DB_PASSWORD=db-password:latest,ADMIN_TOKEN=admin-token:latest,CLEANUP_SECRET=cleanup-secret:latest

# frontend (NEXT_PUBLIC_SITE_URL is inlined at build time)
gcloud run deploy fastorial-jobs-frontend --project $PROJECT --region $REGION \
  --source frontend --allow-unauthenticated \
  --set-build-env-vars NEXT_PUBLIC_SITE_URL=https://jobs.fastorial.dev \
  --set-env-vars API_BASE_URL=https://<backend-url> \
  --set-secrets ADMIN_TOKEN=admin-token:latest

# Firebase Hosting (rewrites are in firebase.json)
firebase deploy --only hosting
```

If `--source` does not pick up the Dockerfile build arg, build with Cloud Build or pass
`--build-arg NEXT_PUBLIC_SITE_URL=...` to `docker build`.

## Stale job cleanup

Cloud Run may scale to zero and throttles CPU outside requests, so an in-process `@Scheduled`
cron is unreliable. Cloud Scheduler calls the backend once a day instead:

```bash
gcloud scheduler jobs create http close-expired-jobs \
  --project $PROJECT --location $REGION \
  --schedule "30 3 * * *" --time-zone "Asia/Kolkata" \
  --uri https://<backend-url>/api/internal/jobs/cleanup --http-method POST \
  --headers "X-Internal-Secret=<CLEANUP_SECRET>"
```

The endpoint is idempotent and returns `{"closed": N}`. Closed job pages refresh within the CDN window
(60 to 300 seconds), so no cache purge is needed. For local development, run the backend with
`SPRING_PROFILES_ACTIVE=local` to enable an in-process daily cron.

## Link previews

Check a job URL with the Facebook Sharing Debugger, the LinkedIn Post Inspector and the WhatsApp
preview. The image is `/jobs/:slug/opengraph-image` (1200 x 630). If a platform shows an old preview,
it cached it: wait out its cache or re-scrape.
