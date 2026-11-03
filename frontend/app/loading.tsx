import { JobCardSkeleton } from "@/components/jobs/job-card-skeleton";
import { Skeleton } from "@/components/ui/skeleton";

export default function Loading() {
  return (
    <main className="mx-auto flex w-full max-w-6xl flex-col gap-3 px-4 py-4" aria-busy="true">
      <Skeleton className="h-11 w-full" />
      {Array.from({ length: 4 }, (_, i) => (
        <JobCardSkeleton key={i} />
      ))}
    </main>
  );
}
