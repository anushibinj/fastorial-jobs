# Status

## V1: public job listing (done)

**Backend**
- [x] Flyway schema, tag seed, tag aliases seed
- [x] `TagDetector` (custom word boundaries, longest match wins, case sensitive `Go` and `R`) with table driven tests, `POST /api/admin/tags/detect`
- [x] Jobs API: filters (location, work mode, experience overlap, all-of tags, text), paging (default 20, max 50), detail, filters with counts, sitemap
- [x] Admin API behind `X-Admin-Token`: create, update, status, extend or reopen, list by status, tags
- [x] Duplicate detection on a normalized apply URL hash, experience and salary validation, global error handler
- [x] `expires_at` defaults to posted + 30 days, daily cleanup endpoint for Cloud Scheduler, optional local `@Scheduled`
- [x] Integration tests (Testcontainers or `TEST_DB_URL`), cleanup tests with an injected clock
- [x] OpenAPI spec exported to `docs/openapi.json`, `pnpm gen:api` generates the TypeScript types

**Frontend**
- [x] Mobile first shell, system light and dark, safe areas, 44 px targets, `100dvh`
- [x] List with URL driven filters: sheet on phones, inline row on `md`, sidebar on `lg`, removable chips
- [x] Experience filter (`?exp=7`), `formatExperience`, `formatSalary`, `formatPostedAgo` with tests
- [x] Job detail with sticky bottom bar (phones) and side panel (`lg`), closed banner, JSON-LD
- [x] Share (drawer on phones, dialog on desktop): copy link, copy text, native share, clipboard fallback
- [x] `buildPreviewMeta` shared by page metadata and the 1200 x 630 OG image
- [x] Admin: login, list by status with expiry, create and edit, tag detection, extend, reopen, publish, close
- [x] PWA: manifest, icons, Serwist service worker, offline page
- [x] `sitemap.xml`, `robots.txt`
- [x] Dockerfiles, Firebase Hosting config, CI

## Where v1 differs from the plan
- Spring Initializr only generates Spring Boot 4, so the skeleton was generated and then pinned to Boot 3.5.
- shadcn's `form` component is not available in the current registry style. Admin forms use plain controls with server actions.
- Server fetches are not tagged for revalidation: caching is the CDN `Cache-Control` header, as in the decisions table.
- The service worker is bundled with `esbuild` plus the core `serwist` package, because `@serwist/next` needs webpack and Next 16 builds with Turbopack.
- The admin session cookie is called `__session`, the only cookie Firebase Hosting forwards.

## Not verified here
- Docker images and `firebase deploy` (no Docker daemon in the dev container).
- Real Android and iPhone checks, and link previews on WhatsApp, LinkedIn and Facebook (need a public URL).

## Later
- v2: Google OAuth, `ADMIN` role replacing the token, saved jobs.
- Toggle to include jobs slightly below the user's experience level.
