import type { JobLike, WorkMode } from "@/lib/types";

/** Cut with an ellipsis so the result is at most `max` characters. */
export function truncate(text: string, max: number): string {
  const t = text.trim();
  if (t.length <= max) return t;
  return t.slice(0, Math.max(0, max - 1)).trimEnd() + "…";
}

/** Like truncate, but backs up to a word boundary when one is close enough. */
export function truncateAtWord(text: string, max: number): string {
  const t = text.trim();
  if (t.length <= max) return t;
  const cut = t.slice(0, max - 1);
  const lastSpace = cut.lastIndexOf(" ");
  const base = lastSpace > max * 0.5 ? cut.slice(0, lastSpace) : cut;
  return base.replace(/[\s,.;:·-]+$/, "") + "…";
}

/** "7+ years", "7-10 years", "7 years", "1 year". */
export function formatExperience(min: number, max?: number | null): string {
  if (max == null) return `${min}+ ${min === 1 ? "year" : "years"}`;
  if (max === min) return `${min} ${min === 1 ? "year" : "years"}`;
  return `${min}-${max} years`;
}

const SYMBOLS: Record<string, string> = { INR: "₹", USD: "$", EUR: "€", GBP: "£" };

function trimNumber(n: number): string {
  return Number.isInteger(n) ? String(n) : String(Math.round(n * 100) / 100);
}

/**
 * "₹18-25 LPA" (INR yearly), "AED 15,000-20,000 / month", "$120,000-150,000 / year".
 * Only a minimum shows "30+". Returns null when there is no salary data.
 */
export function formatSalary(
  min?: number | null,
  max?: number | null,
  currency?: string | null,
  period?: "YEARLY" | "MONTHLY" | null,
): string | null {
  if (min == null || !currency || !period) return null;
  const code = currency.toUpperCase();
  const open = max == null || max === min;

  if (code === "INR" && period === "YEARLY") {
    const lo = trimNumber(min / 100000);
    if (max == null) return `₹${lo}+ LPA`;
    if (max === min) return `₹${lo} LPA`;
    return `₹${lo}-${trimNumber(max / 100000)} LPA`;
  }

  const symbol = SYMBOLS[code];
  const locale = code === "INR" ? "en-IN" : "en-US";
  const fmt = (n: number) => n.toLocaleString(locale);
  const prefix = symbol ?? `${code} `;
  const suffix = period === "MONTHLY" ? " / month" : " / year";
  const amount = max == null ? `${fmt(min)}+` : open ? fmt(min) : `${fmt(min)}-${fmt(max)}`;
  return `${prefix}${amount}${suffix}`;
}

const IST_DAY = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Asia/Kolkata",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

function istDayNumber(d: Date): number {
  const [y, m, day] = IST_DAY.format(d).split("-").map(Number);
  return Date.UTC(y, m - 1, day) / 86_400_000;
}

/**
 * Age in calendar days in Asia/Kolkata: "today", "1 day ago", "2 to 13 days ago",
 * "N weeks ago" (14 to 59 days), "N months ago" (60 days and up).
 */
export function formatPostedAgo(postedAt?: string | Date | null, now: Date = new Date()): string {
  if (!postedAt) return "";
  const days = Math.max(0, istDayNumber(now) - istDayNumber(new Date(postedAt)));
  if (days === 0) return "today";
  if (days === 1) return "1 day ago";
  if (days < 14) return `${days} days ago`;
  if (days < 60) return `${Math.floor(days / 7)} weeks ago`;
  return `${Math.floor(days / 30)} months ago`;
}

export const WORK_MODE_LABEL: Record<WorkMode, string> = {
  ONSITE: "Onsite",
  HYBRID: "Hybrid",
  REMOTE: "Remote",
};

/** "Hyderabad, Hybrid", or just "Remote" when the city says the same thing as the mode. */
export function formatLocation(
  job: Pick<JobLike, "locationCity" | "workMode">,
): string {
  const mode = job.workMode ? WORK_MODE_LABEL[job.workMode] : "";
  const city = job.locationCity?.trim() ?? "";
  if (!city) return mode;
  if (!mode || city.toLowerCase() === mode.toLowerCase()) return city;
  return `${city}, ${mode}`;
}
