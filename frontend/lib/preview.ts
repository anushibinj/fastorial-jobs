import { formatExperience, formatPostedAgo, truncate, truncateAtWord } from "@/lib/format";
import type { JobLike } from "@/lib/types";

const MAX_TAGS = 5;
const MAX_OG_TITLE = 70;
const MAX_OG_DESCRIPTION = 160;

export type PreviewMeta = {
  /** `{title} at {company}`, cut after about 70 characters (og:title, twitter:title). */
  ogTitle: string;
  /** `{experience} · Posted {age} · {tags}`, most important first, capped near 160 characters. */
  description: string;
  /** Repeats title, experience and age. */
  imageAlt: string;
  closed: boolean;
  experience: string;
  /** "Posted 3 days ago", or "Closed" for a closed job. */
  agePill: string;
  /** Up to 5 tag names. */
  tags: string[];
  /** How many tags did not fit. */
  moreTags: number;
  // pieces for the image, already truncated
  imageTitle: string;
  imageCompany: string;
  imageLocation: string;
  imageTags: string[];
};

/**
 * One pure function feeds both the page metadata and the generated image, so the two can
 * never disagree about the title, years of experience, age or tags.
 */
export function buildPreviewMeta(job: JobLike, now: Date = new Date()): PreviewMeta {
  const closed = job.status === "CLOSED";
  const experience = formatExperience(job.experienceMinYears ?? 0, job.experienceMaxYears);
  const age = formatPostedAgo(job.postedAt, now);
  const names = (job.tags ?? []).map((t) => t.name ?? "").filter(Boolean);
  const shown = names.slice(0, MAX_TAGS);
  const moreTags = Math.max(0, names.length - shown.length);

  const tagText = shown.length ? shown.join(", ") + (moreTags ? ` +${moreTags} more` : "") : "";
  const agePart = closed ? "" : age ? `Posted ${age}` : "";
  const parts = [closed ? "Closed" : null, experience, agePart || null, tagText || null].filter(
    (p): p is string => !!p,
  );

  const title = job.title ?? "";
  const company = job.companyName ?? "";
  const agePill = closed ? "Closed" : age ? `Posted ${age}` : "";

  return {
    ogTitle: truncate(company ? `${title} at ${company}` : title, MAX_OG_TITLE),
    description: truncateAtWord(parts.join(" · "), MAX_OG_DESCRIPTION),
    imageAlt: [title, experience, closed ? "Closed" : agePill].filter(Boolean).join(", "),
    closed,
    experience,
    agePill,
    tags: shown,
    moreTags,
    imageTitle: truncate(title, 60),
    imageCompany: truncate(company, 30),
    imageLocation: truncate(job.locationCity ?? "", 24),
    imageTags: shown.map((t) => truncate(t, 14)),
  };
}
