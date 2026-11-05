import { TAG_CATEGORIES, type TagCategory } from "@/lib/api/contract";
import { v2SeedTags } from "@/server/db/migrations/V2__seed_tags";
import { v3CreateTagAliases } from "@/server/db/migrations/V3__create_tag_aliases";
import type { TagAliasRecord, TagRecord } from "@/server/tags/tag-record";

/**
 * Test helper: the tags and aliases that migrations V2 and V3 insert, read from the migration text
 * itself so tests can run the tag detector on the real seed data without a database. Ids follow the
 * insertion order, as the identity column assigns them on a fresh database.
 */
export function seedTags(): TagRecord[] {
  const tags: TagRecord[] = [];
  // Rows look like: ('Spring Boot', 'spring-boot', 'FRAMEWORK'),
  for (const m of v2SeedTags.matchAll(/\('((?:[^']|'')*)', '([^']*)', '([A-Z]+)'\)/g)) {
    const category = m[3] as TagCategory;
    if (!TAG_CATEGORIES.includes(category)) throw new Error(`unknown category ${category}`);
    tags.push({ id: tags.length + 1, name: m[1].replaceAll("''", "'"), slug: m[2], category });
  }
  return tags;
}

/** The alias rows of migration V3, joined with their tags, in insertion order. */
export function seedAliases(tags: readonly TagRecord[] = seedTags()): TagAliasRecord[] {
  const bySlug = new Map(tags.map((t) => [t.slug, t]));
  const aliases: TagAliasRecord[] = [];
  // Rows look like: ('java', 'jdk', false),
  for (const m of v3CreateTagAliases.matchAll(/\('([^']*)', '((?:[^']|'')*)', (true|false)\)/g)) {
    const tag = bySlug.get(m[1]);
    if (!tag) throw new Error(`alias for unknown tag ${m[1]}`);
    aliases.push({ tag, alias: m[2].replaceAll("''", "'"), caseSensitive: m[3] === "true" });
  }
  return aliases;
}
