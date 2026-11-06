"use client";

import { useState } from "react";
import { JobCard } from "@/components/jobs/job-card";
import { Button } from "@/components/ui/button";
import { jobsApiPath } from "@/lib/api/client";
import type { FilterState } from "@/lib/filters";
import type { JobSummary, PageOf } from "@/lib/types";

/**
 * Renders the server fetched first page, then appends more from `GET /api/jobs` on this same origin.
 * The parent gives this a `key` built from the filters, so changing a filter resets it.
 */
export function JobFeed({ initial, filters }: { initial: PageOf<JobSummary>; filters: FilterState }) {
  const [items, setItems] = useState(initial.items);
  const [page, setPage] = useState(initial.page);
  const [hasNext, setHasNext] = useState(initial.hasNext);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);

  async function loadMore() {
    setLoading(true);
    setError(false);
    try {
      const res = await fetch(jobsApiPath(filters, page + 1));
      if (!res.ok) throw new Error(String(res.status));
      const next = (await res.json()) as PageOf<JobSummary>;
      setItems((prev) => [...prev, ...next.items.filter((j) => !prev.some((p) => p.id === j.id))]);
      setPage(next.page);
      setHasNext(next.hasNext);
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <ul className="flex flex-col gap-3">
        {items.map((job) => (
          <li key={job.id}>
            <JobCard job={job} />
          </li>
        ))}
      </ul>
      {error ? <p className="text-destructive text-center text-sm">Could not load more.</p> : null}
      {hasNext ? (
        <Button variant="outline" size="lg" className="min-h-11 self-center px-6" onClick={loadMore} data-track="home_load_more_button" disabled={loading}>
          {loading ? "Loading…" : "Load more"}
        </Button>
      ) : null}
    </div>
  );
}
