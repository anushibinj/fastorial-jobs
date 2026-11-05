/**
 * Flyway style migration `V5__create_postintime_settings.sql`. Never edit it once it has been applied:
 * the migrator refuses to start when the checksum of an applied script changes.
 *
 * One row (id = 1) holds the connection to the PostInTime server that new jobs are pushed to.
 * The API token has to be sent to PostInTime, so unlike the API keys it is stored as it is.
 */
export const v5CreatePostintimeSettings = String.raw`CREATE TABLE postintime_settings (
    id              SMALLINT     PRIMARY KEY CHECK (id = 1),
    enabled         BOOLEAN      NOT NULL DEFAULT FALSE,
    base_url        VARCHAR(500) NOT NULL DEFAULT '',
    api_token       VARCHAR(200) NOT NULL DEFAULT '',
    channel_id      VARCHAR(64)  NOT NULL DEFAULT '',
    post_status     VARCHAR(10)  NOT NULL DEFAULT 'draft',
    last_result     VARCHAR(500),
    last_attempt_at TIMESTAMPTZ,
    updated_at      TIMESTAMPTZ  NOT NULL DEFAULT now()
);
`;
