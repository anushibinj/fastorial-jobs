import { formatExperience } from "@/lib/format";
import { jobUrl } from "@/lib/site";
import type { JobDetail } from "@/lib/types";

/** schema.org JobPosting for Google for Jobs. Only used for live (published) jobs. */
export function buildJobPostingJsonLd(job: JobDetail): Record<string, unknown> {
  const salary =
    job.salaryMin != null && job.salaryCurrency && job.salaryPeriod
      ? {
          "@type": "MonetaryAmount",
          currency: job.salaryCurrency,
          value: {
            "@type": "QuantitativeValue",
            minValue: job.salaryMin,
            ...(job.salaryMax != null ? { maxValue: job.salaryMax } : {}),
            unitText: job.salaryPeriod === "MONTHLY" ? "MONTH" : "YEAR",
          },
        }
      : undefined;

  return {
    "@context": "https://schema.org",
    "@type": "JobPosting",
    title: job.title,
    description: job.description || job.title,
    datePosted: job.postedAt,
    validThrough: job.expiresAt,
    employmentType: "FULL_TIME",
    url: jobUrl(job.slug ?? ""),
    hiringOrganization: {
      "@type": "Organization",
      name: job.companyName,
      ...(job.companyLogoUrl ? { logo: job.companyLogoUrl } : {}),
    },
    jobLocation: {
      "@type": "Place",
      address: {
        "@type": "PostalAddress",
        ...(job.locationCity ? { addressLocality: job.locationCity } : {}),
        ...(job.locationState ? { addressRegion: job.locationState } : {}),
        ...(job.locationCountry ? { addressCountry: job.locationCountry } : {}),
      },
    },
    ...(job.workMode === "REMOTE" ? { jobLocationType: "TELECOMMUTE" } : {}),
    experienceRequirements: {
      "@type": "OccupationalExperienceRequirements",
      monthsOfExperience: (job.experienceMinYears ?? 0) * 12,
    },
    qualifications: `${formatExperience(job.experienceMinYears ?? 0, job.experienceMaxYears)} of experience`,
    ...(job.tags?.length ? { skills: job.tags.map((t) => t.name).join(", ") } : {}),
    ...(salary ? { baseSalary: salary } : {}),
  };
}

/** Safe to put inside a <script> tag. */
export function serializeJsonLd(data: unknown): string {
  return JSON.stringify(data).replace(/</g, "\\u003c");
}
