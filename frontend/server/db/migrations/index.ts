import { v1CreateJobsAndTags } from "@/server/db/migrations/V1__create_jobs_and_tags";
import { v2SeedTags } from "@/server/db/migrations/V2__seed_tags";
import { v3CreateTagAliases } from "@/server/db/migrations/V3__create_tag_aliases";
import { v4CreateApiKeys } from "@/server/db/migrations/V4__create_api_keys";
import { v5CreatePostintimeSettings } from "@/server/db/migrations/V5__create_postintime_settings";
import { v6AddJobPostintimePostedAt } from "@/server/db/migrations/V6__add_job_postintime_posted_at";

/**
 * One versioned schema migration, described the way Flyway records it in `flyway_schema_history`.
 *
 * Why TypeScript modules instead of `.sql` files read from disk? The Next.js standalone build only
 * ships files that its tracer can find, and a directory read at runtime is easy to miss. Imported
 * strings are always bundled, on any host.
 */
export interface Migration {
  /** Flyway version, e.g. "4". Compared numerically. */
  version: string;
  /** Flyway description: the file name part after `__`, with underscores as spaces. */
  description: string;
  /** The original Flyway file name, stored in the `script` column. */
  script: string;
  sql: string;
}

/**
 * All migrations in version order. To change the schema, add a new `V5__something.ts` module next to
 * these (never edit an applied one) and append it here. It runs automatically when a server starts.
 */
export const MIGRATIONS: readonly Migration[] = [
  { version: "1", description: "create jobs and tags", script: "V1__create_jobs_and_tags.sql", sql: v1CreateJobsAndTags },
  { version: "2", description: "seed tags", script: "V2__seed_tags.sql", sql: v2SeedTags },
  { version: "3", description: "create tag aliases", script: "V3__create_tag_aliases.sql", sql: v3CreateTagAliases },
  { version: "4", description: "create api keys", script: "V4__create_api_keys.sql", sql: v4CreateApiKeys },
  { version: "5", description: "create postintime settings", script: "V5__create_postintime_settings.sql", sql: v5CreatePostintimeSettings },
  { version: "6", description: "add job postintime posted at", script: "V6__add_job_postintime_posted_at.sql", sql: v6AddJobPostintimePostedAt },
];
