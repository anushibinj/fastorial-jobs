import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { PendingTags } from "@/components/admin/pending-tags";
import { JobForm } from "@/components/admin/job-form";
import { adminGetJob, adminTags } from "@/lib/admin/api";
import { requireAdmin } from "@/lib/admin/session";
import { ApiException } from "@/server/shared/api-exception";

export const metadata: Metadata = { title: "Edit job" };

export default async function EditJobPage({ params }: PageProps<"/admin/jobs/[id]/edit">) {
  await requireAdmin();
  const { id } = await params;
  const [job, tags] = await Promise.all([
    adminGetJob(id).catch((e) => {
      if (ApiException.is(e) && e.status === 404) return null;
      throw e;
    }),
    adminTags(),
  ]);
  if (!job) notFound();
  return (
    <>
      <PendingTags jobId={job.id} slugs={job.pendingTags} />
      <JobForm key={`${job.id}-${job.tags.length}`} job={job} tags={tags.map((t) => ({ slug: t.slug ?? "", name: t.name ?? "" }))} />
    </>
  );
}
