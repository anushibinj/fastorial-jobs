# Status

Legend: [x] done and verified here, [~] done in code but needs a real environment to verify, [ ] needs you (account, domain, devices).

## Phase 0: repo setup
- [x] Everything (git, .gitignore, compose, Spring Boot 3.5 skeleton, `PORT` and graceful shutdown, Next.js, shadcn components including `form`, env templates, CI)

## Phase 1: backend (Spring Boot, replaced in Phase 5)
- [x] All items: schema and seeds, `TagDetector` with fixtures, detect endpoint, entities, slugs, filters with the overlap rule, paging (20/50), detail, filters with counts, admin token filter and endpoints, duplicate detection, validation, 30 day default expiry, cleanup endpoint and `Clock`, extend or reopen, tests, error handler, CORS, Testcontainers tests, OpenAPI export and TypeScript types
- [x] Expired but not yet swept jobs already leave the public list and the sitemap

## Phase 2: frontend
- [x] All items: shell, API client, list with URL filters (sheet, inline row, sidebar, chips), `?exp=` filter, formatters with tests, `buildPreviewMeta`, cards, load more, detail page, share (copy link, copy text, native share, fallback), closed jobs, empty, loading and error states, mobile first, safe areas, 44 px targets
- [x] Widths 320, 360, 390, 768, 1024 and 1440 checked in Chromium with no horizontal scroll (1024 and 1440 only on the home page)
- [ ] Real Android phone and iPhone check

## Phase 2b: PWA and admin
- [x] Manifest, icons, favicon, viewport theme colors, `appleWebApp`, service worker (NetworkFirst 3 s, offline page with Retry, never caches admin, API or non GET, old caches cleaned), registered in production only
- [x] Admin at `/admin/jobs`, `/admin/jobs/new`, `/admin/jobs/[id]/edit`: server actions (token never reaches the browser), shadcn `Table` and `Form` with react-hook-form and zod, status filter, expiry, extend, reopen
- [x] Tag detection on paste or blur, "detected" chips, one click removal, searchable picker, Re-detect, salary marked as public
- [x] Cache headers, `output: 'standalone'`, Dockerfile copies `public/`
- [ ] Installability on a real Android phone, iOS Add to Home Screen, launch from a shared link in standalone mode

## Phase 3: SEO and link previews
- [x] Metadata, Open Graph and Twitter tags from `buildPreviewMeta`, per job OG image, default OG image, `truncate`, bundled Inter in the standalone trace, closed pill
- [x] Worst case visual check (long title, long company, 12 tags, no max experience, closed)
- [x] `sitemap.xml` (60 s cache) and `robots.txt`, JSON-LD for open jobs only, closed or expired jobs are `noindex, follow`, without JSON-LD
- [x] Lighthouse: home 95 performance, job page 99, 100 elsewhere
- [ ] Preview checks on LinkedIn, WhatsApp, Slack, X and Telegram (needs the public URL, steps in `docs/deploy.md`)

## Phase 4: ship
- [x] Dockerfile, `docker compose --profile full up --build`, small DB pool (the backend Dockerfile, probes and Cloud Run spec went away in Phase 5)
- [x] App Hosting config (`frontend/apphosting.yaml`), step by step guide in `docs/deploy.md`
- [~] Docker images, `gcloud` and `firebase` commands were written but not run (no Docker daemon and no GCP access in the dev container)
- [ ] Create the GCP project and resources, secrets, production Postgres, custom domain, Cloud Scheduler job
- [ ] Automated backups and a tested restore, Search Console, analytics ids, soft launch

## Phase 5: one service (issue #1)
- [x] Spring Boot backend replaced by Next.js route handlers and services in `frontend/server/` (same endpoints, payloads, error codes, headers and env variable names)
- [x] Flyway replaced by a startup migrator that reads and writes `flyway_schema_history` (same checksums, so production at V4 is recognized as up to date)
- [x] Parity checked against the running Java backend: 171 request probe (167 identical, 4 former Java 500s now proper 4xx/2xx), 10,669 fuzzed URLs for duplicate detection hashes, golden slugs and tag detections, identical `pg_dump` schema
- [x] Java integration tests ported (`*.db.test.ts`, run with `TEST_DB_URL`); browser walkthrough of home, load more, job page, OG image, sitemap and every admin flow on a production build
- [ ] Cutover in production (`docs/deploy.md` section 3): create `fastorial-db-url` and `fastorial-db-user`, grant access to the existing secrets, roll out, move Cloud Scheduler and automations to the site URL, delete the Cloud Run backend
- [ ] After the first rollout, confirm through the CDN that `X-API-Key` and `X-Internal-Secret` reach the app (curl in `docs/deploy.md` section 2)

## Where v1 differs from the plan
- Spring Initializr only generates Spring Boot 4, so the skeleton was generated and then pinned to Boot 3.5.
- The "revalidation tags" in the API client are not used: the decisions table chose CDN caching instead, because Next.js cache tags live on each container's disk.
- The service worker is bundled with `esbuild` plus the core `serwist` package, because `@serwist/next` needs webpack and Next 16 builds with Turbopack.
- The admin session cookie is called `__session`, the only cookie Firebase's CDN forwards.
- shadcn's registry does not ship `form` for the current style, so `components/ui/form.tsx` is the standard shadcn wrapper added by hand.

## Open questions from the plan
- Production Postgres, min instances: options and defaults are in `docs/deploy.md` (min instances default to 0).
- Salary line in the share text: not added, the template stays exactly as specified.
- Logo: a simple text mark (`frontend/assets/logo.svg`). Replace the SVG and run `pnpm gen:icons` if you have a real one.

## Later (V1.5, V2, V3)
See the plan: RSS, tag and city landing pages, accounts and wishlist, mobile app.
