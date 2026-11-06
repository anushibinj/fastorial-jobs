/**
 * Flyway style migration `V7__create_queue_items.sql`. Never edit it once it has been applied.
 *
 * Durable side of the work queues (bulk job creation, PostInTime pushes). Items arrive in memory, are
 * flushed here, and a worker claims them one by one: PENDING -> PROCESSING -> deleted when done, or
 * FAILED (kept, with the error) when the handler threw.
 */
export const v7CreateQueueItems = String.raw`CREATE TABLE queue_items (
    id         BIGSERIAL    PRIMARY KEY,
    queue      VARCHAR(40)  NOT NULL,
    payload    JSONB        NOT NULL,
    status     VARCHAR(12)  NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'PROCESSING', 'FAILED')),
    attempts   INT          NOT NULL DEFAULT 0,
    last_error VARCHAR(500),
    locked_at  TIMESTAMPTZ,
    created_at TIMESTAMPTZ  NOT NULL DEFAULT now()
);
CREATE INDEX idx_queue_items_queue_status_id ON queue_items (queue, status, id);
`;
