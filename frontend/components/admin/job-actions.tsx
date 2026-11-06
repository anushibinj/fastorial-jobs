import { extendAction, setStatusAction } from "@/app/admin/actions";
import { PushToPostintimeButton } from "@/components/admin/push-to-postintime-button";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { AdminJobSummary } from "@/lib/types";

function StatusButton({ id, status, label }: { id: number; status: string; label: string }) {
  return (
    <form action={setStatusAction}>
      <input type="hidden" name="id" value={id} />
      <input type="hidden" name="status" value={status} />
      <Button type="submit" variant="outline" size="sm" className="min-h-9">
        {label}
      </Button>
    </form>
  );
}

/** Row actions: publish / close, extend (published) or reopen (closed), and push to PostInTime. */
export function JobActions({ job }: { job: AdminJobSummary }) {
  const id = job.id as number;
  return (
    <div className="flex flex-wrap items-center gap-2">
      {job.status === "DRAFT" ? <StatusButton id={id} status="PUBLISHED" label="Publish" /> : null}
      {job.status === "PUBLISHED" ? <StatusButton id={id} status="CLOSED" label="Close" /> : null}
      {job.status !== "DRAFT" ? (
        <form action={extendAction} className="flex items-center gap-1">
          <input type="hidden" name="id" value={id} />
          <Input name="days" type="number" min={1} max={365} defaultValue={30} aria-label="Days" className="h-9 w-16 px-2" />
          <Button type="submit" variant="outline" size="sm" className="min-h-9">
            {job.status === "CLOSED" ? "Reopen" : "Extend"}
          </Button>
        </form>
      ) : null}
      {job.status !== "DRAFT" ? <PushToPostintimeButton id={id} posted={job.postintimePostedAt !== null} /> : null}
    </div>
  );
}
