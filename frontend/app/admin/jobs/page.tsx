import type { Metadata } from "next";
import Link from "next/link";
import { JobTable } from "@/components/admin/job-table";
import { Button } from "@/components/ui/button";
import { adminListJobs } from "@/lib/admin/api";
import { requireAdmin } from "@/lib/admin/session";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Admin" };

const STATUSES = [
  { value: "", label: "All" },
  { value: "PUBLISHED", label: "Published" },
  { value: "DRAFT", label: "Draft" },
  { value: "CLOSED", label: "Closed" },
];

const POSTINTIME = [
  { value: "posted", label: "Posted to PostInTime" },
  { value: "not-posted", label: "Not posted to PostInTime" },
];

function one(v: string | string[] | undefined): string {
  return (Array.isArray(v) ? v[0] : v) ?? "";
}

export default async function AdminPage({ searchParams }: PageProps<"/admin/jobs">) {
  await requireAdmin();
  const sp = await searchParams;
  const status = one(sp.status);
  const pit = POSTINTIME.some((f) => f.value === one(sp.postintime)) ? one(sp.postintime) : "";
  const page = Math.max(0, Number(one(sp.page)) || 0);
  const data = await adminListJobs({ status: status || undefined, postintime: pit || undefined, page }).catch(() => null);

  const href = (s: string, p = 0, f = pit) => {
    const q = new URLSearchParams();
    if (s) q.set("status", s);
    if (f) q.set("postintime", f);
    if (p) q.set("page", String(p));
    const qs = q.toString();
    return qs ? `/admin/jobs?${qs}` : "/admin/jobs";
  };

  return (
    <main className="mx-auto flex w-full max-w-6xl flex-col gap-4 px-4 py-4">
      <div className="flex items-center justify-between gap-2">
        <ul className="flex gap-1 overflow-x-auto" aria-label="Status">
          {STATUSES.map((s) => (
            <li key={s.value}>
              <Link
                href={href(s.value, 0)}
                data-track="admin_jobs_status_filter_link"
                data-track-label={s.value}
                aria-current={status === s.value ? "page" : undefined}
                className={cn(
                  "inline-flex min-h-11 items-center rounded-lg px-3 text-sm",
                  status === s.value ? "bg-secondary font-medium" : "text-muted-foreground hover:bg-muted",
                )}
              >
                {s.label}
              </Link>
            </li>
          ))}
          <li aria-hidden className="bg-border mx-1 my-2 w-px" />
          {POSTINTIME.map((f) => (
            <li key={f.value}>
              <Link
                href={href(status, 0, pit === f.value ? "" : f.value)}
                data-track="admin_jobs_postintime_filter_link"
                data-track-label={f.value}
                aria-current={pit === f.value ? "page" : undefined}
                className={cn(
                  "inline-flex min-h-11 items-center whitespace-nowrap rounded-lg px-3 text-sm",
                  pit === f.value ? "bg-secondary font-medium" : "text-muted-foreground hover:bg-muted",
                )}
              >
                {f.label}
              </Link>
            </li>
          ))}
        </ul>
        <Button asChild size="lg" className="min-h-11">
          <Link data-track="admin_jobs_new_job_button" href="/admin/jobs/new">New job</Link>
        </Button>
      </div>

      {data === null ? (
        <p className="text-muted-foreground py-10 text-center">Could not load jobs.</p>
      ) : data.items.length === 0 ? (
        <p className="text-muted-foreground py-10 text-center">No jobs.</p>
      ) : (
        <JobTable key={`${status}-${pit}-${page}`} items={data.items} />
      )}

      {data && data.totalPages > 1 ? (
        <div className="flex items-center justify-between text-sm">
          {page > 0 ? (
            <Link data-track="admin_jobs_prev_page_link" href={href(status, page - 1)} className="min-h-11 content-center underline underline-offset-4">
              Previous
            </Link>
          ) : (
            <span />
          )}
          <span className="text-muted-foreground">
            {page + 1} / {data.totalPages}
          </span>
          {data.hasNext ? (
            <Link data-track="admin_jobs_next_page_link" href={href(status, page + 1)} className="min-h-11 content-center underline underline-offset-4">
              Next
            </Link>
          ) : (
            <span />
          )}
        </div>
      ) : null}
    </main>
  );
}
