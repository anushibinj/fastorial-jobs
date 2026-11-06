/**
 * Flyway style migration `V9__add_job_pending_tags.sql`. Never edit it once it has been applied:
 * the migrator refuses to start when the checksum of an applied script changes.
 *
 * Tag slugs that a new job post named but that are not in the tag vocabulary. The job is stored as a
 * draft; an admin approves (creates) or skips each slug before publishing. Empty means nothing to review.
 */
export const v9AddJobPendingTags = String.raw`ALTER TABLE jobs ADD COLUMN pending_tags TEXT[] NOT NULL DEFAULT '{}';
`;
