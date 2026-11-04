import type { MetadataRoute } from "next";
import { fetchSitemapEntries } from "@/lib/data/jobs";
import { jobUrl, SITE_URL } from "@/lib/site";

export const dynamic = "force-dynamic";

/** Home plus every PUBLISHED job whose expiry is still in the future (the service filters). */
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const jobs = await fetchSitemapEntries().catch(() => []);
  return [
    { url: SITE_URL, changeFrequency: "hourly", priority: 1 },
    ...jobs.map((j) => ({
      url: jobUrl(j.slug),
      lastModified: j.updatedAt ? new Date(j.updatedAt) : undefined,
      changeFrequency: "daily" as const,
    })),
  ];
}
