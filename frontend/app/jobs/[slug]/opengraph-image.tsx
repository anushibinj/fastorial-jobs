import { fetchJob } from "@/lib/api/client";
import { defaultOgImage, jobOgImage, OG_SIZE } from "@/lib/og";
import { buildPreviewMeta } from "@/lib/preview";
import { SITE_NAME } from "@/lib/site";

export const dynamic = "force-dynamic";
export const size = OG_SIZE;
export const contentType = "image/png";
export const alt = SITE_NAME;

export default async function Image({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const job = await fetchJob(slug).catch(() => null);
  if (!job) return defaultOgImage(404);
  return jobOgImage(buildPreviewMeta(job));
}
