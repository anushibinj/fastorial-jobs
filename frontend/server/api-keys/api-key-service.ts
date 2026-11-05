import { createHash, randomBytes } from "node:crypto";
import type { ApiKeyDto } from "@/lib/api/contract";
import type { ApiKeyRecord } from "@/server/api-keys/api-key-record";
import type { SqlExecutor } from "@/server/db/database";
import type { UnitOfWork } from "@/server/db/unit-of-work";
import { toIso } from "@/server/shared/iso";
import { ApiException } from "@/server/shared/api-exception";
import type { Clock } from "@/server/shared/clock";
import { javaTrim } from "@/server/shared/java-text";

/** Every key starts with this, so leaked keys are easy to recognize (and to scan for). */
export const API_KEY_PREFIX = "fjk_";

/** Storage of API keys. */
export interface ApiKeyRepository {
  insert(key: Omit<ApiKeyRecord, "id">): Promise<ApiKeyRecord>;
  findAllNewestFirst(): Promise<ApiKeyRecord[]>;
  findById(id: number): Promise<ApiKeyRecord | null>;
  markRevoked(id: number, at: Date): Promise<void>;
  /** Records a use of the active (not revoked) key with this hash. Returns false when there is none. */
  touchActive(keyHash: string, at: Date): Promise<boolean>;
}

interface ApiKeyRow {
  id: number;
  name: string;
  key_prefix: string;
  key_hash: string;
  created_at: Date;
  last_used_at: Date | null;
  revoked_at: Date | null;
}

const API_KEY_COLUMNS = "id, name, key_prefix, key_hash, created_at, last_used_at, revoked_at";

function toApiKeyRecord(r: ApiKeyRow): ApiKeyRecord {
  return {
    id: r.id, name: r.name, keyPrefix: r.key_prefix, keyHash: r.key_hash,
    createdAt: r.created_at, lastUsedAt: r.last_used_at, revokedAt: r.revoked_at,
  };
}

/** `ApiKeyRepository` over PostgreSQL. */
export class PgApiKeyRepository implements ApiKeyRepository {
  constructor(private readonly db: SqlExecutor) {}

  async insert(key: Omit<ApiKeyRecord, "id">): Promise<ApiKeyRecord> {
    const { rows } = await this.db.query<ApiKeyRow>(
      `INSERT INTO api_keys (name, key_prefix, key_hash, created_at, last_used_at, revoked_at)
       VALUES ($1, $2, $3, $4, $5, $6) RETURNING ${API_KEY_COLUMNS}`,
      [key.name, key.keyPrefix, key.keyHash, key.createdAt, key.lastUsedAt, key.revokedAt],
    );
    return toApiKeyRecord(rows[0]);
  }

  async findAllNewestFirst(): Promise<ApiKeyRecord[]> {
    const { rows } = await this.db.query<ApiKeyRow>(`SELECT ${API_KEY_COLUMNS} FROM api_keys ORDER BY created_at DESC`);
    return rows.map(toApiKeyRecord);
  }

  async findById(id: number): Promise<ApiKeyRecord | null> {
    const { rows } = await this.db.query<ApiKeyRow>(`SELECT ${API_KEY_COLUMNS} FROM api_keys WHERE id = $1`, [id]);
    return rows[0] ? toApiKeyRecord(rows[0]) : null;
  }

  async markRevoked(id: number, at: Date): Promise<void> {
    await this.db.query("UPDATE api_keys SET revoked_at = $2 WHERE id = $1 AND revoked_at IS NULL", [id, at]);
  }

  async touchActive(keyHash: string, at: Date): Promise<boolean> {
    // One statement finds and updates, so there is no window between the check and the update.
    const { rowCount } = await this.db.query(
      "UPDATE api_keys SET last_used_at = $2 WHERE key_hash = $1 AND revoked_at IS NULL",
      [keyHash, at],
    );
    return rowCount > 0;
  }
}

/** SHA-256 (lower-case hex) of a key's plaintext; the only form that is stored. */
export function hashApiKey(plaintext: string): string {
  return createHash("sha256").update(plaintext, "utf8").digest("hex");
}

/** The API shape of a key. `plaintext` is only passed in the response to creation. */
export function toApiKeyDto(key: ApiKeyRecord, plaintext: string | null = null): ApiKeyDto {
  return {
    id: key.id,
    name: key.name,
    keyPrefix: key.keyPrefix,
    createdAt: toIso(key.createdAt) as string,
    lastUsedAt: toIso(key.lastUsedAt),
    revokedAt: toIso(key.revokedAt),
    key: plaintext,
  };
}

/**
 * API keys let automations (Zapier, scripts) create and manage jobs without the admin token.
 * Port of the former `ApiKeyService`.
 */
export class ApiKeyService {
  /**
   * @param randomSource secure random bytes; replaceable in tests.
   */
  constructor(
    private readonly uow: UnitOfWork<{ apiKeys: ApiKeyRepository }>,
    private readonly clock: Clock,
    private readonly randomSource: (size: number) => Uint8Array = randomBytes,
  ) {}

  /**
   * Creates a key: `fjk_` followed by 64 hex digits (32 random bytes). Only its hash is stored, so the
   * returned plaintext can never be shown again.
   */
  async create(name: string): Promise<ApiKeyDto> {
    const plaintext = API_KEY_PREFIX + Buffer.from(this.randomSource(32)).toString("hex");
    const saved = await this.uow.write(({ apiKeys }) =>
      apiKeys.insert({
        name: javaTrim(name),
        keyPrefix: plaintext.slice(0, API_KEY_PREFIX.length + 6),
        keyHash: hashApiKey(plaintext),
        createdAt: this.clock.now(),
        lastUsedAt: null,
        revokedAt: null,
      }),
    );
    return toApiKeyDto(saved, plaintext);
  }

  /** Every key, newest first, without plaintexts. */
  async list(): Promise<ApiKeyDto[]> {
    return (await this.uow.read(({ apiKeys }) => apiKeys.findAllNewestFirst())).map((k) => toApiKeyDto(k));
  }

  /**
   * Revokes a key. Revoking twice is fine and keeps the first revocation time.
   *
   * @throws ApiException 404 for an unknown id.
   */
  revoke(id: number): Promise<void> {
    return this.uow.write(async ({ apiKeys }) => {
      const key = await apiKeys.findById(id);
      if (!key) throw ApiException.notFound("API key not found");
      if (key.revokedAt === null) await apiKeys.markRevoked(id, this.clock.now());
    });
  }

  /** True when `plaintext` is an active key; records the time of use. Values without the prefix are rejected early. */
  async authenticate(plaintext: string | null): Promise<boolean> {
    if (plaintext === null || !plaintext.startsWith(API_KEY_PREFIX)) return false;
    return this.uow.write(({ apiKeys }) => apiKeys.touchActive(hashApiKey(plaintext), this.clock.now()));
  }
}
