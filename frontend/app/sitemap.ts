import type { MetadataRoute } from "next";
import { apiFetch } from "@/lib/api/client";
import { jobUrl, SITE_URL } from "@/lib/site";

export const dynamic = "force-dynamic";

type Entry = { slug: string; updatedAt?: string };

/** Home plus every PUBLISHED job whose expiry is still in the future (the backend filters). */
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const jobs = await apiFetch<Entry[]>("/api/sitemap/jobs").catch(() => [] as Entry[]);
  return [
    { url: SITE_URL, changeFrequency: "hourly", priority: 1 },
    ...jobs.map((j) => ({
      url: jobUrl(j.slug),
      lastModified: j.updatedAt ? new Date(j.updatedAt) : undefined,
      changeFrequency: "daily" as const,
    })),
  ];
}
