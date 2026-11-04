import type { DetectedTagDto, TagDto } from "@/lib/api/contract";
import type { Clock } from "@/server/shared/clock";
import { toTagDto } from "@/server/tags/tag-mapper";
import type { TagAliasRecord, TagRecord } from "@/server/tags/tag-record";
import type { TagRepository } from "@/server/tags/tag-repository";
import { TagDetector, toDetectedTagDto, type AliasEntry } from "@/server/tags/tag-detector";

/** How long a built detector is reused before the tags and aliases are read again (as in the Java service). */
export const DETECTOR_TTL_MS = 5 * 60 * 1000;

/**
 * Builds the detector input from the database rows.
 *
 * A tag's own name is an implicit, case insensitive alias, except for names of two characters or
 * fewer (`Go`, `R`): those are ordinary words too, so they are only matched through the explicit,
 * case sensitive alias rows of migration V3.
 */
export function buildAliasEntries(tags: readonly TagRecord[], aliases: readonly TagAliasRecord[]): AliasEntry[] {
  const entries: AliasEntry[] = [];
  for (const t of tags) {
    if (t.name.length > 2) {
      entries.push({ tagId: t.id, tagName: t.name, tagSlug: t.slug, category: t.category, alias: t.name, caseSensitive: false });
    }
  }
  for (const a of aliases) {
    entries.push({
      tagId: a.tag.id, tagName: a.tag.name, tagSlug: a.tag.slug, category: a.tag.category,
      alias: a.alias, caseSensitive: a.caseSensitive,
    });
  }
  return entries;
}

/**
 * Suggests tags for a job's title and description (`POST /api/admin/tags/detect`).
 * Port of the former `TagDetectionService`: loads tags and aliases from the database and caches the
 * compiled detector for five minutes, so a new alias added by a migration shows up without a restart.
 */
export class TagDetectionService {
  /** The detector being built or already built, and when it was built. */
  private cache: { detector: Promise<TagDetector>; builtAt: number } | null = null;

  constructor(
    private readonly tags: TagRepository,
    private readonly clock: Clock,
  ) {}

  /** Detects tags, best match first, in the API shape. */
  async detect(title: string | null, description: string | null): Promise<DetectedTagDto[]> {
    const detector = await this.detector();
    return detector.detect(title, description).map(toDetectedTagDto);
  }

  /**
   * Returns the cached detector, rebuilding it when it is missing or older than the TTL. The promise
   * itself is cached, so concurrent requests during a rebuild share one database read. A failed build
   * is forgotten, so the next call retries instead of failing forever.
   */
  private detector(): Promise<TagDetector> {
    const now = this.clock.now().getTime();
    if (this.cache === null || now - this.cache.builtAt > DETECTOR_TTL_MS) {
      const detector = Promise.all([this.tags.findAll(), this.tags.findAllAliases()]).then(
        ([tags, aliases]) => new TagDetector(buildAliasEntries(tags, aliases)),
      );
      const entry = { detector, builtAt: now };
      this.cache = entry;
      detector.catch(() => {
        if (this.cache === entry) this.cache = null;
      });
    }
    return this.cache.detector;
  }
}

/** Lists the tag vocabulary for the admin tag picker and automations (`GET /api/admin/tags`). */
export class TagCatalogService {
  constructor(private readonly tags: TagRepository) {}

  /** Every tag, ordered by name. */
  async listTags(): Promise<TagDto[]> {
    return (await this.tags.findAllOrderedByName()).map(toTagDto);
  }
}
