import { ExternalLink } from "lucide-react";
import { ShareDialog } from "@/components/jobs/share-dialog";
import { Button } from "@/components/ui/button";
import { isClosed } from "@/lib/job-state";
import type { JobDetail } from "@/lib/types";

/** Apply (primary) and Share. Both are disabled for closed jobs. */
export function ApplyActions({ job, stacked = false }: { job: JobDetail; stacked?: boolean }) {
  const closed = isClosed(job);
  return (
    <div className={stacked ? "flex flex-col gap-2" : "flex items-center gap-2"}>
      {closed ? (
        <Button size="lg" className="min-h-11 flex-1" disabled>
          Closed
        </Button>
      ) : (
        <Button size="lg" className="min-h-11 flex-1" asChild>
          <a data-track="job_detail_apply_link" href={job.applyUrl} target="_blank" rel="noopener noreferrer nofollow">
            Apply <ExternalLink />
          </a>
        </Button>
      )}
      <ShareDialog job={job} label={stacked} className={stacked ? "border" : ""} />
    </div>
  );
}
