import type { SqlExecutor } from "@/server/db/database";
import type { TagAliasRecord, TagRecord } from "@/server/tags/tag-record";
import type { TagCategory } from "@/lib/api/contract";

/** Read access to the tag vocabulary (`tags` and `tag_aliases`), which only migrations change. */
export interface TagRepository {
  /** Every tag, ordered by name with the database collation (the admin tag picker order). */
  findAllOrderedByName(): Promise<TagRecord[]>;
  /** Every tag in id order, i.e. seed order. */
  findAll(): Promise<TagRecord[]>;
  /** The tags with these slugs, in no particular order. Unknown slugs are simply absent. */
  findBySlugs(slugs: readonly string[]): Promise<TagRecord[]>;
  /** Adds a tag to the vocabulary. Returns null when the slug or the name is already taken. */
  insert(name: string, slug: string, category: TagCategory): Promise<TagRecord | null>;
  /** Every alias with its tag, in id order. */
  findAllAliases(): Promise<TagAliasRecord[]>;
}

interface TagRow {
  id: number;
  name: string;
  slug: string;
  category: TagCategory;
}

/** Maps a `tags` row. Exported for the job repository, which loads tags of jobs with the same columns. */
export function toTagRecord(row: TagRow): TagRecord {
  return { id: row.id, name: row.name, slug: row.slug, category: row.category };
}

/** `TagRepository` over PostgreSQL. */
export class PgTagRepository implements TagRepository {
  constructor(private readonly db: SqlExecutor) {}

  async findAllOrderedByName(): Promise<TagRecord[]> {
    const { rows } = await this.db.query<TagRow>("SELECT id, name, slug, category FROM tags ORDER BY name ASC");
    return rows.map(toTagRecord);
  }

  async findAll(): Promise<TagRecord[]> {
    const { rows } = await this.db.query<TagRow>("SELECT id, name, slug, category FROM tags ORDER BY id");
    return rows.map(toTagRecord);
  }

  async findBySlugs(slugs: readonly string[]): Promise<TagRecord[]> {
    if (slugs.length === 0) return [];
    const { rows } = await this.db.query<TagRow>(
      "SELECT id, name, slug, category FROM tags WHERE slug = ANY($1::text[])",
      [slugs],
    );
    return rows.map(toTagRecord);
  }

  async insert(name: string, slug: string, category: TagCategory): Promise<TagRecord | null> {
    const { rows } = await this.db.query<TagRow>(
      "INSERT INTO tags (name, slug, category) VALUES ($1, $2, $3) ON CONFLICT DO NOTHING RETURNING id, name, slug, category",
      [name, slug, category],
    );
    return rows.length > 0 ? toTagRecord(rows[0]) : null;
  }

  async findAllAliases(): Promise<TagAliasRecord[]> {
    const { rows } = await this.db.query<TagRow & { alias: string; case_sensitive: boolean }>(
      `SELECT t.id, t.name, t.slug, t.category, a.alias, a.case_sensitive
       FROM tag_aliases a JOIN tags t ON t.id = a.tag_id
       ORDER BY a.id`,
    );
    return rows.map((r) => ({ tag: toTagRecord(r), alias: r.alias, caseSensitive: r.case_sensitive }));
  }
}
