import { Badge } from "@/components/ui/badge";
import type { TagDto } from "@/lib/types";

export function TagChips({ tags, max }: { tags?: TagDto[] | null; max?: number }) {
  const all = tags ?? [];
  const shown = max ? all.slice(0, max) : all;
  const more = all.length - shown.length;
  if (all.length === 0) return null;
  return (
    <ul className="flex flex-wrap gap-1.5" aria-label="Tech stack">
      {shown.map((t) => (
        <li key={t.slug}>
          <Badge variant="secondary">{t.name}</Badge>
        </li>
      ))}
      {more > 0 ? (
        <li>
          <Badge variant="outline">+{more}</Badge>
        </li>
      ) : null}
    </ul>
  );
}
