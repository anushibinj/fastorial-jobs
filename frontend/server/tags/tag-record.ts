import type { TagCategory } from "@/lib/api/contract";

/** A row of the `tags` table. */
export interface TagRecord {
  id: number;
  name: string;
  slug: string;
  category: TagCategory;
}

/** A row of `tag_aliases`, joined with its tag. Used to build the tag detector. */
export interface TagAliasRecord {
  tag: TagRecord;
  alias: string;
  caseSensitive: boolean;
}
