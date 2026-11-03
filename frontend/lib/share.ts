import { formatExperience, formatLocation } from "@/lib/format";
import { jobUrl } from "@/lib/site";
import type { JobLike } from "@/lib/types";

/**
 * The text copied by "Copy text". One blank line between fields, tags comma separated without
 * spaces. Fields with nothing to show are left out.
 */
export function buildShareText(job: JobLike, siteUrl?: string): string {
  const link = siteUrl ? `${siteUrl.replace(/\/+$/, "")}/jobs/${job.slug}` : jobUrl(job.slug ?? "");
  const location = formatLocation(job);
  const tags = (job.tags ?? []).map((t) => t.slug).filter(Boolean).join(",");
  const fields = [
    job.title ?? "",
    `Company: ${job.companyName ?? ""}`,
    location ? `Location: ${location}` : null,
    `Experience: ${formatExperience(job.experienceMinYears ?? 0, job.experienceMaxYears)}`,
    tags ? `Tags: ${tags}` : null,
    `Link: ${link}`,
  ].filter((f): f is string => f !== null);
  return fields.join("\n\n");
}

/** Clipboard API first, then the legacy execCommand route for non HTTPS pages and old browsers. */
export async function copyToClipboard(text: string): Promise<boolean> {
  try {
    if (typeof navigator !== "undefined" && navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    // fall through to the legacy path
  }
  try {
    const el = document.createElement("textarea");
    el.value = text;
    el.setAttribute("readonly", "");
    el.style.position = "fixed";
    el.style.top = "0";
    el.style.left = "-9999px";
    el.style.fontSize = "16px"; // avoids iOS zoom
    document.body.appendChild(el);
    el.select();
    el.setSelectionRange(0, text.length);
    const ok = document.execCommand("copy");
    document.body.removeChild(el);
    return ok;
  } catch {
    return false;
  }
}
