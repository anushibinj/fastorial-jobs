import type { Metadata } from "next";
import { JobForm } from "@/components/admin/job-form";
import { adminTags } from "@/lib/admin/api";
import { requireAdmin } from "@/lib/admin/session";

export const metadata: Metadata = { title: "New job" };

export default async function NewJobPage() {
  await requireAdmin();
  const tags = await adminTags();
  return <JobForm tags={tags.map((t) => ({ slug: t.slug ?? "", name: t.name ?? "" }))} />;
}
