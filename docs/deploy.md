# Deploying

The frontend and backend are deployed separately and know each other only by URL.

```
browser ─┬─> Firebase App Hosting (Next.js, frontend/)   https://jobs.fastorial.dev
         │        └─ server side calls ──┐
         └─ client side calls (CORS) ────┴─> Cloud Run: fastorial-jobs-backend (Spring Boot) -> Postgres
Cloud Scheduler --daily--> POST /api/internal/jobs/cleanup (backend)
```

| | Frontend | Backend |
|---|---|---|
| Runs on | Firebase App Hosting (backend id `fastorial-jobs`) | Cloud Run service `fastorial-jobs-backend` |
| Config | `frontend/apphosting.yaml`, `firebase.json` | `deploy/backend.service.yaml` |
| Deploys | automatically on push to the live branch | `.github/workflows/deploy.yml` or manually (section 2) |
| Knows the other by | `NEXT_PUBLIC_API_URL` (build time) | `CORS_ALLOWED_ORIGINS` (run time) |

Firebase and GCP project: `fastorial` (`.firebaserc`). Run everything locally with `docker compose --profile full up --build`.

## Caching

Public pages (`/`, `/jobs/:slug`, the OG images) are rendered on demand and send
`Cache-Control: public, s-maxage=60, stale-while-revalidate=300`; `sitemap.xml` uses a 60 second cache.
App Hosting's CDN should honour that. Nothing relies on Next.js ISR or `revalidateTag`, because their cache lives on each
container's disk. Admin pages send `private, no-store`, and the backend sends `no-store` on `/api/admin/**` and `/api/internal/**`.
`next.config.ts` also sets `sw.js` to `no-cache`.

The admin session cookie is named `__session`, the one cookie Firebase's CDN forwards to the server. Keep that name.

## 1. Backend: Google Cloud setup (one time)

```bash
PROJECT=fastorial
REGION=asia-south1
gcloud config set project $PROJECT           # the project must be on the Blaze plan
gcloud services enable run.googleapis.com artifactregistry.googleapis.com secretmanager.googleapis.com \
  cloudscheduler.googleapis.com cloudbuild.googleapis.com

gcloud artifacts repositories create fastorial-jobs --repository-format=docker --location=$REGION

# secrets (names match deploy/backend.service.yaml)
printf '%s' '<db password>'           | gcloud secrets create fastorial-db-password --data-file=-
printf '%s' "$(openssl rand -hex 24)" | gcloud secrets create fastorial-admin-token --data-file=-
printf '%s' "$(openssl rand -hex 24)" | gcloud secrets create fastorial-cleanup-secret --data-file=-
# let the Cloud Run runtime service account read them
SA=$(gcloud projects describe $PROJECT --format='value(projectNumber)')-compute@developer.gserviceaccount.com
for s in fastorial-db-password fastorial-admin-token fastorial-cleanup-secret; do
  gcloud secrets add-iam-policy-binding $s --member=serviceAccount:$SA --role=roles/secretmanager.secretAccessor
done
```

`fastorial-admin-token` is shared: the backend reads it as `ADMIN_TOKEN`, and so does the frontend (section 3).

### Production Postgres (open question)

The backend only needs a JDBC URL, so either works:

| Option | Notes |
|---|---|
| Cloud SQL (Postgres 16, same region) | Simplest and closest, paid from day one. Use private IP with Direct VPC egress on the Cloud Run service, `DB_URL=jdbc:postgresql://<private-ip>:5432/fastorial_jobs` |
| Neon or Supabase free tier | Cheaper, one network hop, possible cold starts. Use the pooled TLS URL, `DB_URL=jdbc:postgresql://<host>/<db>?sslmode=require` |

The pool is small on purpose (`DB_POOL_SIZE`, default 5, 5 instances at most). Flyway runs the migrations on startup.
Enable automated backups (Cloud SQL: point-in-time recovery on; Neon and Supabase: their built-in backups), then
**test a restore** into a scratch database once before launch and note the steps here.

### Min instances (open question)

`BACKEND_MIN_INSTANCES` defaults to 0 (cheapest). The JVM cold start takes a few seconds even with startup CPU boost, which
crawlers and first visitors would feel. Set it to 1 once traffic justifies it. The frontend's `minInstances` lives in
`frontend/apphosting.yaml`.

## 2. Backend: deploy

Manually:

```bash
REG=$REGION-docker.pkg.dev/$PROJECT/fastorial-jobs
gcloud auth configure-docker $REGION-docker.pkg.dev
docker build -t $REG/backend:v1 backend && docker push $REG/backend:v1

export PROJECT REGION BACKEND_IMAGE=$REG/backend:v1
export DB_URL='jdbc:postgresql://...' DB_USER=... BACKEND_MIN_INSTANCES=0
export CORS_ALLOWED_ORIGINS=https://jobs.fastorial.dev      # comma separated, every origin that serves the frontend
envsubst < deploy/backend.service.yaml > /tmp/backend.yaml
gcloud run services replace /tmp/backend.yaml --region $REGION
gcloud run services add-iam-policy-binding fastorial-jobs-backend --region $REGION --member=allUsers --role=roles/run.invoker

gcloud run services describe fastorial-jobs-backend --region $REGION --format='value(status.url)'   # needed in section 3
```

Add every frontend origin to `CORS_ALLOWED_ORIGINS`, including the default `https://<backend-id>--<project>.<region>.hosted.app`
URL if you test on it, and redeploy the backend after changing the list.

Automatically: `.github/workflows/deploy.yml` (manual trigger) builds the backend image, pushes it to Artifact Registry and
deploys it. It authenticates with Workload Identity Federation. Set these repository variables:
`GCP_PROJECT` (`fastorial`), `GCP_REGION`, `GCP_WORKLOAD_IDENTITY_PROVIDER`, `GCP_DEPLOY_SERVICE_ACCOUNT`, `DB_URL`, `DB_USER`,
`CORS_ALLOWED_ORIGINS`, and optionally `BACKEND_MIN_INSTANCES`. The service account needs Cloud Run Admin,
Artifact Registry Writer and Service Account User.

## 3. Frontend: Firebase App Hosting

One time, from the repo root (not from `frontend/`):

```bash
firebase login
firebase init apphosting       # already done: backend id fastorial-jobs, root directory /frontend, project fastorial
```

1. Set the real backend URL in `frontend/apphosting.yaml` (`NEXT_PUBLIC_API_URL`, currently a placeholder) and confirm
   `NEXT_PUBLIC_SITE_URL`. Both are inlined into the build, so **a change needs a new rollout**.
2. Create the admin token secret. Use the same value as the backend's `fastorial-admin-token`:

   ```bash
   firebase apphosting:secrets:set fastorial-admin-token
   ```

   Accept the prompt to grant the App Hosting backend access to it.
3. Push to the live branch. App Hosting builds with pnpm (from `pnpm-lock.yaml`) and rolls out. Watch the rollout in the
   Firebase console, App Hosting. To roll out by hand: `firebase apphosting:rollouts:create fastorial-jobs`.
4. Check it: open the `*.hosted.app` URL, then `/` should list jobs and "Load more" should work. If "Load more" fails, look
   for a CORS error in the browser console and fix `CORS_ALLOWED_ORIGINS` on the backend (section 2).

Do not run `firebase deploy --only hosting`. There is no Hosting site in this setup.

## 4. Custom domains

- **Frontend:** Firebase console, App Hosting, the backend, Settings, Domains, add `jobs.fastorial.dev` and the DNS records
  it shows. Managed HTTPS can take a few hours. Keep `NEXT_PUBLIC_SITE_URL=https://jobs.fastorial.dev`.
- **Backend (optional):** use the `*.run.app` URL, or map a domain such as `api.fastorial.dev` in Cloud Run, Manage custom
  domains. If the URL changes, update `NEXT_PUBLIC_API_URL` and roll out the frontend again.

## 5. Stale job cleanup

Cloud Run may scale to zero and throttles CPU outside requests, so an in-process `@Scheduled` cron is unreliable.
Cloud Scheduler calls the backend once a day, early morning Asia/Kolkata:

```bash
gcloud scheduler jobs create http close-expired-jobs \
  --location $REGION --schedule "30 3 * * *" --time-zone "Asia/Kolkata" \
  --uri "$(gcloud run services describe fastorial-jobs-backend --region $REGION --format='value(status.url)')/api/internal/jobs/cleanup" \
  --http-method POST \
  --headers "X-Internal-Secret=$(gcloud secrets versions access latest --secret fastorial-cleanup-secret)"
```

The endpoint is idempotent and returns `{"closed": N}`. Expired jobs also disappear from the public list and the sitemap
immediately, and their pages show the closed banner, before the sweep runs. For local development, run the backend with
`SPRING_PROFILES_ACTIVE=local` to enable an in-process daily cron.

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
