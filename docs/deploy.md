# Deploying

```
browser -> Firebase Hosting (CDN, jobs.fastorial.dev)
             |-- /api/**  -> Cloud Run: fastorial-jobs-backend  (Spring Boot)  -> Postgres
             |-- /**      -> Cloud Run: fastorial-jobs-frontend (Next.js)       -> backend (API_BASE_URL)
Cloud Scheduler --daily--> POST /api/internal/jobs/cleanup (backend)
```

The browser only ever sees one origin, so there is no CORS in production.
Run the full stack locally with `docker compose --profile full up --build`.

## Caching

Public pages (`/`, `/jobs/:slug`, the OG images) are rendered on demand and send
`Cache-Control: public, s-maxage=60, stale-while-revalidate=300`; `sitemap.xml` uses a 60 second cache.
Firebase Hosting's CDN keeps them for 60 seconds and may serve a stale copy for up to 5 more minutes.
Nothing relies on Next.js ISR or `revalidateTag`, because their cache lives on each container's disk.
Admin pages send `private, no-store`, and the backend sends `no-store` on `/api/admin/**` and `/api/internal/**`.
`firebase.json` also sets `sw.js` to `no-cache`, a short cache for the manifest and immutable caching for `/_next/static/**`.

Firebase Hosting forwards only a cookie named `__session` to Cloud Run. The admin session cookie is named accordingly.

## 1. Google Cloud setup (one time)

```bash
PROJECT=fastorial-jobs
REGION=asia-south1
gcloud projects create $PROJECT            # or use an existing project, and link billing
gcloud config set project $PROJECT
gcloud services enable run.googleapis.com artifactregistry.googleapis.com secretmanager.googleapis.com \
  cloudscheduler.googleapis.com cloudbuild.googleapis.com firebasehosting.googleapis.com

gcloud artifacts repositories create fastorial-jobs --repository-format=docker --location=$REGION

# secrets (names match deploy/backend.service.yaml)
printf '%s' '<db password>'       | gcloud secrets create fastorial-db-password --data-file=-
printf '%s' "$(openssl rand -hex 24)" | gcloud secrets create fastorial-admin-token --data-file=-
printf '%s' "$(openssl rand -hex 24)" | gcloud secrets create fastorial-cleanup-secret --data-file=-
# let the Cloud Run runtime service account read them
SA=$(gcloud projects describe $PROJECT --format='value(projectNumber)')-compute@developer.gserviceaccount.com
for s in fastorial-db-password fastorial-admin-token fastorial-cleanup-secret; do
  gcloud secrets add-iam-policy-binding $s --member=serviceAccount:$SA --role=roles/secretmanager.secretAccessor
done
```

### Region

`asia-south1` (Mumbai) is the closest region for Indian visitors. Firebase's
[full config reference](https://firebase.google.com/docs/hosting/full-config) lists `asia-south1` among the
regions that Hosting can rewrite to, but not among the ones recommended for best performance, and the older
[Cloud Run guide](https://firebase.google.com/docs/hosting/cloud-run) omits it. Confirm with a test rewrite in
your project before relying on it. If it is rejected, deploy to `asia-east1` and change `region` in `firebase.json`.

### Production Postgres (open question)

The backend only needs a JDBC URL, so either works:

| Option | Notes |
|---|---|
| Cloud SQL (Postgres 16, same region) | Simplest and closest, paid from day one. Use private IP with Direct VPC egress on the Cloud Run services, `DB_URL=jdbc:postgresql://<private-ip>:5432/fastorial_jobs` |
| Neon or Supabase free tier | Cheaper, one network hop, possible cold starts. Use the pooled TLS URL, `DB_URL=jdbc:postgresql://<host>/<db>?sslmode=require` |

The pool is small on purpose (`DB_POOL_SIZE`, default 5, 5 instances at most). Flyway runs the migrations on startup.
Enable automated backups (Cloud SQL: point-in-time recovery on; Neon and Supabase: their built-in backups), then
**test a restore** into a scratch database once before launch and note the steps here.

### Min instances (open question)

`BACKEND_MIN_INSTANCES` and `FRONTEND_MIN_INSTANCES` default to 0 (cheapest). The JVM cold start takes a few seconds even with
startup CPU boost, which crawlers and first visitors would feel. Set `BACKEND_MIN_INSTANCES=1` once traffic justifies it.
Pages are served from the CDN for 60 seconds anyway, so cold starts mostly hit the first request after a quiet period.

## 2. Deploy

Manually:

```bash
REG=$REGION-docker.pkg.dev/$PROJECT/fastorial-jobs
gcloud auth configure-docker $REGION-docker.pkg.dev
docker build -t $REG/backend:v1 backend && docker push $REG/backend:v1
docker build -t $REG/frontend:v1 --build-arg NEXT_PUBLIC_SITE_URL=https://jobs.fastorial.dev frontend && docker push $REG/frontend:v1

export PROJECT REGION BACKEND_IMAGE=$REG/backend:v1 FRONTEND_IMAGE=$REG/frontend:v1
export DB_URL='jdbc:postgresql://...' DB_USER=... BACKEND_MIN_INSTANCES=0 FRONTEND_MIN_INSTANCES=0
envsubst < deploy/backend.service.yaml  > /tmp/backend.yaml  && gcloud run services replace /tmp/backend.yaml  --region $REGION
export API_BASE_URL=$(gcloud run services describe fastorial-jobs-backend --region $REGION --format='value(status.url)')
envsubst < deploy/frontend.service.yaml > /tmp/frontend.yaml && gcloud run services replace /tmp/frontend.yaml --region $REGION
for s in backend frontend; do gcloud run services add-iam-policy-binding fastorial-jobs-$s --region $REGION --member=allUsers --role=roles/run.invoker; done

firebase deploy --only hosting
```

The service specs set concurrency 80, memory (768 Mi backend, 512 Mi frontend), startup CPU boost, a startup probe and a
liveness probe (`/actuator/health/readiness` and `/liveness` on the backend, `/offline` on the frontend).

Automatically: `.github/workflows/deploy.yml` builds both images, pushes them to Artifact Registry, deploys both services and
Firebase Hosting. It authenticates with Workload Identity Federation. Set these repository variables:
`GCP_PROJECT`, `GCP_REGION`, `GCP_WORKLOAD_IDENTITY_PROVIDER`, `GCP_DEPLOY_SERVICE_ACCOUNT`, `DB_URL`, `DB_USER`,
and optionally `BACKEND_MIN_INSTANCES` and `FRONTEND_MIN_INSTANCES`. The service account needs Cloud Run Admin,
Artifact Registry Writer, Service Account User and Firebase Hosting Admin.

## 3. Custom domain

Firebase console, Hosting, Add custom domain, `jobs.fastorial.dev`. Add the DNS records it shows (TXT to verify, then A or CNAME).
Managed HTTPS is issued automatically, which can take up to a few hours. Build the frontend with
`NEXT_PUBLIC_SITE_URL=https://jobs.fastorial.dev` (the default) so canonical URLs, share links and the sitemap use it.

## 4. Stale job cleanup

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

## 5. After launch

- **Search Console:** add the `https://jobs.fastorial.dev` property, verify via DNS, submit `https://jobs.fastorial.dev/sitemap.xml`.
- **Analytics:** set `NEXT_PUBLIC_UMAMI_SRC` and `NEXT_PUBLIC_UMAMI_WEBSITE_ID` (or `NEXT_PUBLIC_PLAUSIBLE_DOMAIN`) as build
  arguments for the frontend image. Nothing loads when they are empty.
- **Soft launch:** post 30 to 50 real jobs from `/admin/jobs/new`, then share a few links on the Fastorial channel.

## 6. Link preview and device checks

These need the public URL, so they are done by hand after the first deploy. Use a real job URL each time.

- LinkedIn Post Inspector, X card validator, Facebook Sharing Debugger (re-scrape to refresh a cached preview).
- WhatsApp, Slack and Telegram: paste the link into a chat and check title, years of experience, age, tags and the image.
- Chrome DevTools, Application tab: manifest, installability, service worker. Then install on a real Android phone.
- iOS Safari: Share, Add to Home Screen, then open a shared `/jobs/<slug>` link in standalone mode.
- Lighthouse on `/` and a job page (see `docs/local-development.md` for the command).
