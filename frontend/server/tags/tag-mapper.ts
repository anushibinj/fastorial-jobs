import type { TagDto } from "@/lib/api/contract";
import type { TagRecord } from "@/server/tags/tag-record";
import { compareIgnoreCase } from "@/server/shared/java-text";

/** The API shape of a tag: name, slug and category (the id stays internal). */
export function toTagDto(tag: TagRecord): TagDto {
  return { name: tag.name, slug: tag.slug, category: tag.category };
}

/**
 * Tags of a job as the API returns them: sorted by name case insensitively, with Java's
 * `String.CASE_INSENSITIVE_ORDER` (the former `JobSummary.tags`), then mapped to `TagDto`.
 */
export function toSortedTagDtos(tags: readonly TagRecord[]): TagDto[] {
  return [...tags].sort((a, b) => compareIgnoreCase(a.name, b.name)).map(toTagDto);
}
