import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { JobForm } from "@/components/admin/job-form";
import { adminGetJob, adminTags } from "@/lib/admin/api";
import { requireAdmin } from "@/lib/admin/session";
import { ApiRequestError } from "@/lib/api/client";

export const metadata: Metadata = { title: "Edit job" };

export default async function EditJobPage({ params }: PageProps<"/admin/jobs/[id]/edit">) {
  await requireAdmin();
  const { id } = await params;
  const [job, tags] = await Promise.all([
    adminGetJob(id).catch((e) => {
      if (e instanceof ApiRequestError && e.status === 404) return null;
      throw e;
    }),
    adminTags(),
  ]);
  if (!job) notFound();
  return <JobForm key={job.id} job={job} tags={tags.map((t) => ({ slug: t.slug ?? "", name: t.name ?? "" }))} />;
}
