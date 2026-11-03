import { z } from "zod";
import { fromLocalInput, toLocalInput } from "@/lib/admin/dates";
import type { JobDetail, JobRequest } from "@/lib/types";

function isHttpUrl(s: string): boolean {
  try {
    const u = new URL(s);
    return u.protocol === "http:" || u.protocol === "https:";
  } catch {
    return false;
  }
}

const num = (s: string): number | undefined => {
  const v = s.replace(/,/g, "").trim();
  if (v === "") return undefined;
  const n = Number(v);
  return Number.isFinite(n) ? Math.trunc(n) : undefined;
};

/** Every field is a string because that is what inputs hold. Mirrors the backend rules for fast feedback. */
export const jobFormSchema = z
  .object({
    title: z.string().trim().min(1, "Title is required").max(200, "Title must be at most 200 characters"),
    companyName: z.string().trim().min(1, "Company is required").max(150, "Company must be at most 150 characters"),
    companyLogoUrl: z.string().trim().max(500).refine((v) => v === "" || isHttpUrl(v), "Logo URL must start with http:// or https://"),
    applyUrl: z.string().trim().min(1, "Apply URL is required").max(1000).refine(isHttpUrl, "Apply URL must start with http:// or https://"),
    source: z.enum(["LINKEDIN", "NAUKRI", "COMPANY_SITE", "OTHER"]),
    locationCity: z.string().trim().max(100),
    locationState: z.string().trim().max(100),
    locationCountry: z.string().trim().max(100),
    workMode: z.enum(["ONSITE", "HYBRID", "REMOTE"]),
    experienceMinYears: z.string().trim().regex(/^\d{1,2}$/, "Enter whole years, 0 or more"),
    experienceMaxYears: z.string().trim().regex(/^(\d{1,2})?$/, "Enter whole years, 0 or more"),
    salaryMin: z.string().trim().regex(/^[\d,]*$/, "Numbers only"),
    salaryMax: z.string().trim().regex(/^[\d,]*$/, "Numbers only"),
    salaryCurrency: z.string().trim(),
    salaryPeriod: z.enum(["YEARLY", "MONTHLY"]),
    status: z.enum(["DRAFT", "PUBLISHED", "CLOSED"]),
    postedAt: z.string(),
    expiresAt: z.string(),
    description: z.string(),
    tags: z.array(z.string()),
  })
  .superRefine((v, ctx) => {
    const min = num(v.experienceMinYears);
    const max = num(v.experienceMaxYears);
    if (min !== undefined && max !== undefined && max < min) {
      ctx.addIssue({ code: "custom", path: ["experienceMaxYears"], message: "Maximum experience must be at least the minimum" });
    }
    const smin = num(v.salaryMin);
    const smax = num(v.salaryMax);
    if (smax !== undefined && smin === undefined) {
      ctx.addIssue({ code: "custom", path: ["salaryMin"], message: "Minimum salary is required when maximum is set" });
    } else if (smin !== undefined && smax !== undefined && smax < smin) {
      ctx.addIssue({ code: "custom", path: ["salaryMax"], message: "Maximum salary must be at least the minimum" });
    }
    if ((smin !== undefined || smax !== undefined) && !/^[A-Za-z]{3}$/.test(v.salaryCurrency)) {
      ctx.addIssue({ code: "custom", path: ["salaryCurrency"], message: "Currency is required when a salary is set (3 letters)" });
    }
    const posted = fromLocalInput(v.postedAt);
    const expires = fromLocalInput(v.expiresAt);
    if (posted && expires && expires <= posted) {
      ctx.addIssue({ code: "custom", path: ["expiresAt"], message: "Expiry must be after the posted date" });
    }
  });

export type JobFormValues = z.infer<typeof jobFormSchema>;

export function emptyFormValues(): JobFormValues {
  return {
    title: "", companyName: "", companyLogoUrl: "", applyUrl: "", source: "LINKEDIN",
    locationCity: "", locationState: "", locationCountry: "India", workMode: "HYBRID",
    experienceMinYears: "0", experienceMaxYears: "", salaryMin: "", salaryMax: "", salaryCurrency: "INR",
    salaryPeriod: "YEARLY", status: "PUBLISHED", postedAt: "", expiresAt: "", description: "", tags: [],
  };
}

export function jobToFormValues(job: JobDetail): JobFormValues {
  const s = (v: string | number | null | undefined) => (v == null ? "" : String(v));
  return {
    title: job.title ?? "", companyName: job.companyName ?? "", companyLogoUrl: s(job.companyLogoUrl),
    applyUrl: job.applyUrl ?? "", source: job.source ?? "OTHER",
    locationCity: s(job.locationCity), locationState: s(job.locationState), locationCountry: s(job.locationCountry),
    workMode: job.workMode ?? "HYBRID",
    experienceMinYears: s(job.experienceMinYears ?? 0), experienceMaxYears: s(job.experienceMaxYears),
    salaryMin: s(job.salaryMin), salaryMax: s(job.salaryMax), salaryCurrency: s(job.salaryCurrency) || "INR",
    salaryPeriod: job.salaryPeriod ?? "YEARLY", status: job.status ?? "PUBLISHED",
    postedAt: toLocalInput(job.postedAt), expiresAt: toLocalInput(job.expiresAt),
    description: job.description ?? "", tags: (job.tags ?? []).map((t) => t.slug ?? ""),
  };
}

/** Builds the API payload. Empty optional fields are left out, salary currency and period only travel with an amount. */
export function formValuesToRequest(v: JobFormValues): JobRequest {
  const salaryMin = num(v.salaryMin);
  const salaryMax = num(v.salaryMax);
  const hasSalary = salaryMin !== undefined || salaryMax !== undefined;
  const opt = (s: string) => s.trim() || undefined;
  return {
    title: v.title.trim(),
    companyName: v.companyName.trim(),
    companyLogoUrl: opt(v.companyLogoUrl),
    description: v.description,
    applyUrl: v.applyUrl.trim(),
    source: v.source,
    locationCity: opt(v.locationCity),
    locationState: opt(v.locationState),
    locationCountry: opt(v.locationCountry),
    workMode: v.workMode,
    experienceMinYears: num(v.experienceMinYears) ?? 0,
    experienceMaxYears: num(v.experienceMaxYears),
    salaryMin,
    salaryMax,
    salaryCurrency: hasSalary ? v.salaryCurrency.trim().toUpperCase() : undefined,
    salaryPeriod: hasSalary ? v.salaryPeriod : undefined,
    status: v.status,
    postedAt: fromLocalInput(v.postedAt),
    expiresAt: fromLocalInput(v.expiresAt),
    tags: v.tags,
  };
}
