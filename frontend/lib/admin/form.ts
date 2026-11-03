import { fromLocalInput } from "@/lib/admin/dates";
import type { JobRequest } from "@/lib/types";

const str = (f: FormData, k: string): string => String(f.get(k) ?? "").trim();
const optStr = (f: FormData, k: string): string | undefined => str(f, k) || undefined;
const optInt = (f: FormData, k: string): number | undefined => {
  const v = str(f, k).replace(/,/g, "");
  if (v === "") return undefined;
  const n = Number(v);
  return Number.isFinite(n) ? Math.trunc(n) : undefined;
};

/** Builds the API payload from the admin form. Empty optional fields are left out. */
export function jobRequestFromForm(f: FormData): JobRequest {
  const salaryMin = optInt(f, "salaryMin");
  const salaryMax = optInt(f, "salaryMax");
  const hasSalary = salaryMin !== undefined || salaryMax !== undefined;
  return {
    title: str(f, "title"),
    companyName: str(f, "companyName"),
    companyLogoUrl: optStr(f, "companyLogoUrl"),
    description: String(f.get("description") ?? ""),
    applyUrl: str(f, "applyUrl"),
    source: (str(f, "source") || "OTHER") as JobRequest["source"],
    locationCity: optStr(f, "locationCity"),
    locationState: optStr(f, "locationState"),
    locationCountry: optStr(f, "locationCountry"),
    workMode: (str(f, "workMode") || "ONSITE") as JobRequest["workMode"],
    experienceMinYears: optInt(f, "experienceMinYears") as number,
    experienceMaxYears: optInt(f, "experienceMaxYears"),
    salaryMin,
    salaryMax,
    salaryCurrency: hasSalary ? optStr(f, "salaryCurrency")?.toUpperCase() : undefined,
    salaryPeriod: hasSalary ? ((optStr(f, "salaryPeriod") ?? undefined) as JobRequest["salaryPeriod"]) : undefined,
    status: (optStr(f, "status") ?? undefined) as JobRequest["status"],
    postedAt: fromLocalInput(str(f, "postedAt")),
    expiresAt: fromLocalInput(str(f, "expiresAt")),
    tags: f.getAll("tags").map(String).filter(Boolean),
  };
}
