/**
 * Flyway style migration `V8__add_postintime_post_suffix.sql`. Never edit it once it has been applied:
 * the migrator refuses to start when the checksum of an applied script changes.
 *
 * Free text (hashtags, footers) that is appended to the caption of every post pushed to PostInTime.
 */
export const v8AddPostintimePostSuffix = String.raw`ALTER TABLE postintime_settings ADD COLUMN post_suffix VARCHAR(2000) NOT NULL DEFAULT '';
`;
