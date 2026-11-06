import type { Metadata } from "next";
import Link from "next/link";
import { Filters } from "@/components/jobs/filters";
import { JobFeed } from "@/components/jobs/job-feed";
import { fetchFilters, fetchJobs } from "@/lib/data/jobs";
import { hasFilters, parseFilters, toSearchParams } from "@/lib/filters";

export const metadata: Metadata = { alternates: { canonical: "/" } };

export default async function HomePage({ searchParams }: PageProps<"/">) {
  const filters = parseFilters(await searchParams);
  const [facets, result] = await Promise.all([fetchFilters(), fetchJobs(filters).catch(() => null)]);

  return (
    <main className="mx-auto flex w-full max-w-6xl flex-col gap-3 px-4 py-4 lg:grid lg:grid-cols-[17.5rem_minmax(0,1fr)] lg:items-start lg:gap-x-8">
      <Filters value={filters} facets={facets} />
      <section className="flex min-w-0 flex-col gap-3 lg:col-start-2" aria-label="Jobs">
        {result === null ? (
          <p className="text-muted-foreground py-10 text-center">Could not load jobs. Try again.</p>
        ) : result.items.length === 0 ? (
          <div className="text-muted-foreground flex flex-col items-center gap-2 py-10 text-center">
            <p>No jobs found.</p>
            {hasFilters(filters) ? (
              <Link href="/" data-track="home_empty_clear_filters_link" className="text-foreground min-h-11 content-center underline underline-offset-4">
                Clear filters
              </Link>
            ) : null}
          </div>
        ) : (
          <>
            <p className="text-muted-foreground text-sm">
              {result.total} {result.total === 1 ? "job" : "jobs"}
            </p>
            <JobFeed key={toSearchParams(filters).toString()} initial={result} filters={filters} />
          </>
        )}
      </section>
    </main>
  );
}
