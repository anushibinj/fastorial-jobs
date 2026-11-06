import type { Metadata } from "next";
import { notFound } from "next/navigation";
import ReactMarkdown from "react-markdown";
import { ApplyActions } from "@/components/jobs/apply-actions";
import { BackLink } from "@/components/jobs/back-link";
import { TagChips } from "@/components/jobs/tag-chips";
import { fetchJob } from "@/lib/data/jobs";
import { formatExperience, formatLocation, formatPostedAgo, formatSalary } from "@/lib/format";
import { isClosed } from "@/lib/job-state";
import { buildJobPostingJsonLd, serializeJsonLd } from "@/lib/jsonld";
import { buildPreviewMeta } from "@/lib/preview";
import { jobUrl, SITE_NAME } from "@/lib/site";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: PageProps<"/jobs/[slug]">): Promise<Metadata> {
  const { slug } = await params;
  const job = await fetchJob(slug).catch(() => null);
  if (!job) return { title: "Job not found", robots: { index: false } };

  const m = buildPreviewMeta(job);
  const image = { url: `/jobs/${slug}/opengraph-image`, width: 1200, height: 630, alt: m.imageAlt };
  return {
    title: `${job.title} at ${job.companyName}`,
    description: m.description,
    alternates: { canonical: `/jobs/${slug}` },
    robots: m.closed ? { index: false, follow: true } : undefined,
    openGraph: {
      type: "website",
      siteName: SITE_NAME,
      url: jobUrl(slug),
      title: m.ogTitle,
      description: m.description,
      images: [image],
    },
    twitter: { card: "summary_large_image", title: m.ogTitle, description: m.description, images: [image] },
  };
}

export default async function JobPage({ params }: PageProps<"/jobs/[slug]">) {
  const { slug } = await params;
  const job = await fetchJob(slug);
  if (!job) notFound();

  const closed = isClosed(job);
  const salary = formatSalary(job.salaryMin, job.salaryMax, job.salaryCurrency, job.salaryPeriod);
  const age = formatPostedAgo(job.postedAt);

  return (
    <main className="mx-auto w-full max-w-6xl px-4 pt-2 pb-10">
      {!closed ? (
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: serializeJsonLd(buildJobPostingJsonLd(job)) }} />
      ) : null}
      <BackLink />
      <div className="mt-2 lg:grid lg:grid-cols-[minmax(0,1fr)_20rem] lg:gap-10">
        <article className="flex min-w-0 flex-col gap-3">
          {closed ? (
            <p role="status" className="bg-muted rounded-lg border px-4 py-3 text-sm font-medium">
              This job is closed
            </p>
          ) : null}
          <h1 className="text-2xl leading-tight font-bold tracking-tight">{job.title}</h1>
          <div className="flex flex-col gap-1">
            <p className="text-lg">{job.companyName}</p>
            <p className="text-muted-foreground">{formatLocation(job)}</p>
            <p className="text-muted-foreground">
              {formatExperience(job.experienceMinYears ?? 0, job.experienceMaxYears)}
              {salary ? <span className="text-foreground font-medium">{`  ·  ${salary}`}</span> : null}
            </p>
            {!closed && age ? <p className="text-muted-foreground text-sm">Posted {age}</p> : null}
          </div>
          {/* phones and tablets: actions inline right below the title block */}
          <div className="mt-1 lg:hidden">
            <ApplyActions job={job} />
          </div>
          <TagChips tags={job.tags} />
          {job.description ? (
            <div className="prose prose-neutral dark:prose-invert prose-headings:font-semibold mt-3 max-w-none break-words">
              <ReactMarkdown
                components={{
                  a: (props) => <a data-track="job_detail_description_link" href={props.href} target="_blank" rel="noopener noreferrer nofollow">{props.children}</a>,
                }}
              >
                {job.description}
              </ReactMarkdown>
            </div>
          ) : null}
        </article>

        {/* lg: side panel */}
        <aside className="hidden lg:block">
          <div className="sticky top-20 rounded-xl border p-4">
            <ApplyActions job={job} stacked />
          </div>
        </aside>
      </div>
    </main>
  );
}
