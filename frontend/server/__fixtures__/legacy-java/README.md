# Golden outputs of the former Spring Boot backend

These files were produced by running the real Java classes of the removed `backend/` module
(Spring Boot 3.5, Java 21) against a Flyway migrated PostgreSQL 16 database, just before the
backend was replaced by the Next.js server code in `server/`.

| File | Java code that produced it |
|---|---|
| `urls.golden.json` | `UrlHasher.normalize`, `UrlHasher.hash`, `JobValidator.isHttpUrl` |
| `slugs.golden.json` | `SlugGenerator.generate` |
| `texts.golden.json` | `TagDetectionService.detect` with the seeded tags and aliases (V2, V3), mapped by `DetectedTagDto.from` |
| `names.golden.json` | `List.sort(String.CASE_INSENSITIVE_ORDER)` |

The TypeScript tests assert that the port returns exactly these values. They matter most for
`UrlHasher`: `jobs.apply_url_hash` values already stored in production were computed by Java, so
a different hash for the same URL would silently stop duplicate detection for existing jobs.

Do not regenerate or edit these files by hand. If a behaviour change is intended, change the test
expectation explicitly so the change is visible in review.
