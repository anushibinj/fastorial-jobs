"use client";

import Link from "next/link";
import { useActionState, useState } from "react";
import { bulkJobsAction, type BulkState } from "@/app/admin/actions";
import { JobActions } from "@/components/admin/job-actions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PENDING_TAGS_NOTE } from "@/components/admin/pending-tags";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatDate } from "@/lib/admin/dates";
import type { AdminJobSummary } from "@/lib/types";

const BULK_FORM = "bulk-jobs-form";
const CHECKBOX = "size-5 cursor-pointer accent-current";

/** Whether (and when) a job was pushed to PostInTime. */
export function PostintimeBadge({ postedAt }: { postedAt: string | null }) {
  return postedAt ? (
    <Badge variant="default" title={`Posted ${formatDate(postedAt)}`}>
      Posted
    </Badge>
  ) : (
    <Badge variant="outline">Not posted</Badge>
  );
}

/**
 * The admin job list with a checkbox per row and a toolbar that applies one action to the selection:
 * publish, close, extend, or push to PostInTime. The checkboxes belong to the toolbar's form through
 * the `form` attribute, so the per-row action forms are not nested inside it.
 */
export function JobTable({ items }: { items: AdminJobSummary[] }) {
  const [selected, setSelected] = useState<ReadonlySet<number>>(new Set());
  const [state, formAction, pending] = useActionState<BulkState, FormData>(bulkJobsAction, {});
  const allSelected = items.length > 0 && items.every((j) => selected.has(j.id));
  const toggle = (id: number, on: boolean) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (on) next.add(id);
      else next.delete(id);
      return next;
    });
  const none = selected.size === 0;

  return (
    <div className="flex flex-col gap-3">
      <form id={BULK_FORM} action={formAction} className="bg-muted/50 flex flex-wrap items-center gap-2 rounded-lg border p-2">
        <span className="px-1 text-sm" aria-live="polite">
          {none ? "Select jobs to change them together" : `${selected.size} selected`}
        </span>
        <Button type="submit" name="op" value="PUBLISHED" data-track="admin_bulk_publish_button" variant="outline" size="sm" className="min-h-9" disabled={none || pending}>
          Publish
        </Button>
        <Button type="submit" name="op" value="CLOSED" data-track="admin_bulk_close_button" variant="outline" size="sm" className="min-h-9" disabled={none || pending}>
          Close
        </Button>
        <span className="flex items-center gap-1">
          <Input name="days" type="number" min={1} max={365} defaultValue={30} aria-label="Days to extend by" className="h-9 w-16 px-2" />
          <Button type="submit" name="op" value="extend" data-track="admin_bulk_extend_button" variant="outline" size="sm" className="min-h-9" disabled={none || pending}>
            Extend
          </Button>
        </span>
        <Button type="submit" name="op" value="postintime" data-track="admin_bulk_push_postintime_button" variant="outline" size="sm" className="min-h-9" disabled={none || pending}>
          Push to PostInTime
        </Button>
        {pending ? <span className="text-muted-foreground text-sm">Working…</span> : null}
        {state.message && !pending ? (
          <span role="status" className={state.failed ? "text-destructive text-sm" : "text-sm"}>
            {state.message}
          </span>
        ) : null}
      </form>

      <div className="overflow-x-auto rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-10">
                <input
                  type="checkbox"
                  className={CHECKBOX}
                  aria-label="Select all jobs on this page"
                  checked={allSelected}
                  onChange={(e) => setSelected(e.target.checked ? new Set(items.map((j) => j.id)) : new Set())}
                />
              </TableHead>
              <TableHead>Job</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>PostInTime</TableHead>
              <TableHead>Posted</TableHead>
              <TableHead>Expires</TableHead>
              <TableHead>Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {items.map((j) => (
              <TableRow key={j.id} data-state={selected.has(j.id) ? "selected" : undefined}>
                <TableCell>
                  <input
                    type="checkbox"
                    form={BULK_FORM}
                    name="ids"
                    value={j.id}
                    className={CHECKBOX}
                    aria-label={`Select ${j.title}`}
                    checked={selected.has(j.id)}
                    data-track="admin_job_select_checkbox"
                    onChange={(e) => toggle(j.id, e.target.checked)}
                  />
                </TableCell>
                <TableCell className="max-w-xs whitespace-normal">
                  <Link data-track="admin_job_edit_link" href={`/admin/jobs/${j.id}/edit`} className="font-medium underline-offset-4 hover:underline">
                    {j.title}
                  </Link>
                  <div className="text-muted-foreground text-xs">{j.companyName}</div>
                  {j.status === "DRAFT" && j.pendingTags.length > 0 ? (
                    <p className="mt-1 text-xs text-amber-700 dark:text-amber-400" data-testid="pending-tags-note">
                      {PENDING_TAGS_NOTE}{" "}
                      <Link data-track="admin_job_review_tags_link" href={`/admin/jobs/${j.id}/edit`} className="font-medium underline underline-offset-4">
                        Review {j.pendingTags.length} {j.pendingTags.length === 1 ? "tag" : "tags"}
                      </Link>
                    </p>
                  ) : null}
                </TableCell>
                <TableCell>
                  <Badge variant={j.status === "PUBLISHED" ? "default" : j.status === "CLOSED" ? "outline" : "secondary"}>{j.status}</Badge>
                  {j.pendingTags.length > 0 ? <Badge variant="outline" className="mt-1">Tag approval needed</Badge> : null}
                </TableCell>
                <TableCell>
                  <PostintimeBadge postedAt={j.postintimePostedAt} />
                </TableCell>
                <TableCell>{formatDate(j.postedAt)}</TableCell>
                <TableCell>{formatDate(j.expiresAt)}</TableCell>
                <TableCell>
                  <JobActions job={j} />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
