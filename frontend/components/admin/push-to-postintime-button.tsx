"use client";

import { useActionState } from "react";
import { bulkJobsAction, type BulkState } from "@/app/admin/actions";
import { Button } from "@/components/ui/button";

/** Pushes one job to PostInTime by hand, and says how it went. Reuses the bulk action with a single id. */
export function PushToPostintimeButton({ id, posted }: { id: number; posted: boolean }) {
  const [state, formAction, pending] = useActionState<BulkState, FormData>(bulkJobsAction, {});
  return (
    <form action={formAction} className="flex flex-col items-start gap-1">
      <input type="hidden" name="ids" value={id} />
      <input type="hidden" name="op" value="postintime" />
      <Button type="submit" variant="outline" size="sm" className="min-h-9" disabled={pending}>
        {pending ? "Pushing…" : posted ? "Push again" : "Push to PostInTime"}
      </Button>
      {state.message && !pending ? (
        <span role="status" className={state.failed ? "text-destructive max-w-56 text-xs whitespace-normal" : "text-xs"}>
          {state.message}
        </span>
      ) : null}
    </form>
  );
}
