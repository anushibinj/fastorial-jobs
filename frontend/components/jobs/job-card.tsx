import Link from "next/link";
import { ShareDialog } from "@/components/jobs/share-dialog";
import { TagChips } from "@/components/jobs/tag-chips";
import { isClosed } from "@/lib/job-state";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { formatExperience, formatLocation, formatPostedAgo, formatSalary } from "@/lib/format";
import type { JobSummary } from "@/lib/types";

export function JobCard({ job }: { job: JobSummary }) {
  const salary = formatSalary(job.salaryMin, job.salaryMax, job.salaryCurrency, job.salaryPeriod);
  const age = formatPostedAgo(job.postedAt);
  const closed = isClosed(job);
  return (
    <Card className="hover:bg-accent/40 relative transition-colors">
      <CardContent className="flex flex-col gap-2">
        <div className="flex items-start justify-between gap-2">
          <h2 className="text-base leading-snug font-semibold">
            {/* stretched link: the whole card is tappable, the share button sits above it */}
            <Link href={`/jobs/${job.slug}`} data-track="home_job_card_link" className="after:absolute after:inset-0 after:content-[''] focus-visible:outline-none focus-visible:after:ring-3 focus-visible:after:ring-ring/50 after:rounded-xl">
              {job.title}
            </Link>
          </h2>
          <ShareDialog job={job} className="-mt-2 -mr-2 shrink-0" />
        </div>
        <p className="text-sm">{job.companyName}</p>
        <p className="text-muted-foreground text-sm">{formatLocation(job)}</p>
        <p className="text-muted-foreground flex flex-wrap items-center gap-x-2 text-sm">
          <span>{formatExperience(job.experienceMinYears ?? 0, job.experienceMaxYears)}</span>
          {age ? <span aria-hidden>·</span> : null}
          {age ? <span>{age}</span> : null}
          {salary ? <span aria-hidden>·</span> : null}
          {salary ? <span className="text-foreground font-medium">{salary}</span> : null}
          {closed ? <Badge variant="outline">Closed</Badge> : null}
        </p>
        <TagChips tags={job.tags} max={6} />
      </CardContent>
    </Card>
  );
}
