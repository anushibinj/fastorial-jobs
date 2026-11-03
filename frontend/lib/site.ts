export const SITE_NAME = "Jobs by Fastorial";
export const SITE_URL = (process.env.NEXT_PUBLIC_SITE_URL ?? "https://jobs.fastorial.dev").replace(/\/+$/, "");

export function jobUrl(slug: string): string {
  return `${SITE_URL}/jobs/${slug}`;
}
