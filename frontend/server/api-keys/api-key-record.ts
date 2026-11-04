/** A row of the `api_keys` table. Only the SHA-256 hash of a key is ever stored, never the key itself. */
export interface ApiKeyRecord {
  id: number;
  name: string;
  /** The first 10 characters of the key (`fjk_` plus 6 hex digits), safe to display. */
  keyPrefix: string;
  keyHash: string;
  createdAt: Date;
  lastUsedAt: Date | null;
  revokedAt: Date | null;
}
