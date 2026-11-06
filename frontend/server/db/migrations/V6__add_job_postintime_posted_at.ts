/**
 * Flyway style migration `V6__add_job_postintime_posted_at.sql`. Never edit it once it has been applied:
 * the migrator refuses to start when the checksum of an applied script changes.
 *
 * Remembers when a job was pushed to PostInTime (and the post id PostInTime gave back), so the admin
 * list can show which jobs are posted and which are not.
 */
export const v6AddJobPostintimePostedAt = String.raw`ALTER TABLE jobs ADD COLUMN postintime_posted_at TIMESTAMPTZ;
ALTER TABLE jobs ADD COLUMN postintime_post_id VARCHAR(100);
`;
