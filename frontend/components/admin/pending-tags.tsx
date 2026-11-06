"use client";

import { useActionState } from "react";
import { reviewPendingTagAction, type FormState } from "@/app/admin/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { TAG_CATEGORIES } from "@/lib/api/contract";

/** Why a draft is waiting; shown wherever such a draft appears. */
export const PENDING_TAGS_NOTE =
  "This post was automatically saved as a draft because it used tags that don't exist yet. Approve each tag to add it, or skip the ones you don't want, then publish.";

/** "spring-boot" -> "Spring Boot": a starting point for the name of a new tag. */
export function nameFromSlug(slug: string): string {
  return slug
    .split(/[-_\s]+/)
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

function PendingTagRow({ jobId, slug }: { jobId: number; slug: string }) {
  const [state, action, pending] = useActionState<FormState, FormData>(reviewPendingTagAction, {});
  return (
    <form action={action} className="flex flex-wrap items-center gap-2" aria-label={`Review tag ${slug}`}>
      <input type="hidden" name="id" value={jobId} />
      <input type="hidden" name="slug" value={slug} />
      <code className="bg-muted min-w-24 rounded px-2 py-1 text-sm">{slug}</code>
      <Input name="name" defaultValue={nameFromSlug(slug)} maxLength={60} aria-label={`Name for ${slug}`} className="h-9 w-44" />
      <select
        name="category"
        defaultValue="TOOL"
        aria-label={`Category for ${slug}`}
        className="border-input bg-background h-9 rounded-md border px-2 text-sm"
      >
        {TAG_CATEGORIES.map((c) => (
          <option key={c} value={c}>
            {c.charAt(0) + c.slice(1).toLowerCase()}
          </option>
        ))}
      </select>
      <Button type="submit" name="decision" value="approve" data-track="admin_pending_tag_approve_button" size="sm" className="min-h-9" disabled={pending}>
        Approve
      </Button>
      <Button type="submit" name="decision" value="skip" data-track="admin_pending_tag_skip_button" variant="outline" size="sm" className="min-h-9" disabled={pending}>
        Skip
      </Button>
      {state.error ? (
        <span role="alert" className="text-destructive text-sm">
          {state.error}
        </span>
      ) : null}
    </form>
  );
}

/** The review panel of a draft: approve (create) or skip each tag the post named that does not exist. */
export function PendingTags({ jobId, slugs }: { jobId: number; slugs: string[] }) {
  if (slugs.length === 0) return null;
  return (
    <section className="mx-auto w-full max-w-3xl px-4 pt-4" aria-labelledby="pending-tags-title">
      <div className="flex flex-col gap-3 rounded-lg border border-amber-500/50 bg-amber-500/10 p-3">
        <h2 id="pending-tags-title" className="font-medium">
          Tag approval needed
        </h2>
        <p className="text-sm">{PENDING_TAGS_NOTE}</p>
        {slugs.map((slug) => (
          <PendingTagRow key={slug} jobId={jobId} slug={slug} />
        ))}
      </div>
    </section>
  );
}
