import type { Metadata } from "next";
import Link from "next/link";
import { JobActions } from "@/components/admin/job-actions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { adminListJobs } from "@/lib/admin/api";
import { formatDate } from "@/lib/admin/dates";
import { requireAdmin } from "@/lib/admin/session";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Admin" };

const STATUSES = [
  { value: "", label: "All" },
  { value: "PUBLISHED", label: "Published" },
  { value: "DRAFT", label: "Draft" },
  { value: "CLOSED", label: "Closed" },
];

function one(v: string | string[] | undefined): string {
  return (Array.isArray(v) ? v[0] : v) ?? "";
}

export default async function AdminPage({ searchParams }: PageProps<"/admin">) {
  await requireAdmin();
  const sp = await searchParams;
  const status = one(sp.status);
  const page = Math.max(0, Number(one(sp.page)) || 0);
  const data = await adminListJobs({ status: status || undefined, page }).catch(() => null);

  const href = (s: string, p = 0) => {
    const q = new URLSearchParams();
    if (s) q.set("status", s);
    if (p) q.set("page", String(p));
    const qs = q.toString();
    return qs ? `/admin?${qs}` : "/admin";
  };

  return (
    <main className="mx-auto flex w-full max-w-6xl flex-col gap-4 px-4 py-4">
      <div className="flex items-center justify-between gap-2">
        <ul className="flex gap-1 overflow-x-auto" aria-label="Status">
          {STATUSES.map((s) => (
            <li key={s.value}>
              <Link
                href={href(s.value)}
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
        </ul>
        <Button asChild size="lg" className="min-h-11">
          <Link href="/admin/jobs/new">New job</Link>
        </Button>
      </div>

      {data === null ? (
        <p className="text-muted-foreground py-10 text-center">Could not load jobs.</p>
      ) : data.items.length === 0 ? (
        <p className="text-muted-foreground py-10 text-center">No jobs.</p>
      ) : (
        <div className="overflow-x-auto rounded-lg border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Job</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Posted</TableHead>
                <TableHead>Expires</TableHead>
                <TableHead>Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.items.map((j) => (
                <TableRow key={j.id}>
                  <TableCell className="max-w-xs whitespace-normal">
                    <Link href={`/admin/jobs/${j.id}`} className="font-medium underline-offset-4 hover:underline">
                      {j.title}
                    </Link>
                    <div className="text-muted-foreground text-xs">{j.companyName}</div>
                  </TableCell>
                  <TableCell>
                    <Badge variant={j.status === "PUBLISHED" ? "default" : j.status === "CLOSED" ? "outline" : "secondary"}>{j.status}</Badge>
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
      )}

      {data && data.totalPages > 1 ? (
        <div className="flex items-center justify-between text-sm">
          {page > 0 ? (
            <Link href={href(status, page - 1)} className="min-h-11 content-center underline underline-offset-4">
              Previous
            </Link>
          ) : (
            <span />
          )}
          <span className="text-muted-foreground">
            {page + 1} / {data.totalPages}
          </span>
          {data.hasNext ? (
            <Link href={href(status, page + 1)} className="min-h-11 content-center underline underline-offset-4">
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
