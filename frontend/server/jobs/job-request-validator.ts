import { ConstraintViolations } from "@/server/requests/constraints";
import type { JobRequest } from "@/server/requests/job-request";
import { isJavaBlank } from "@/server/shared/java-text";
import { isHttpUrl } from "@/server/url/url-hasher";

/**
 * Cross field rules that single field annotations cannot express. Port of the former `JobValidator`,
 * with the same messages; the services call it before touching the database.
 *
 * (The Java class also required a minimum experience when a maximum was set. Here the type of
 * `JobRequest` already guarantees the minimum, because the required check runs first, so that branch
 * could never be reached and is left out.)
 *
 * @throws ApiException `400 VALIDATION_FAILED` listing every broken rule.
 */
export function validateJobRequest(r: JobRequest): void {
  const v = new ConstraintViolations();

  // Experience: the maximum, when given, must be at least the minimum.
  if (r.experienceMaxYears !== null && r.experienceMaxYears < r.experienceMinYears) {
    v.add("experienceMaxYears", "Maximum experience must be at least the minimum");
  }

  // Salary: a maximum needs a minimum and must not be below it, and any amount needs currency and period.
  const anySalary = r.salaryMin !== null || r.salaryMax !== null;
  if (r.salaryMax !== null && r.salaryMin === null) {
    v.add("salaryMin", "Minimum salary is required when maximum is set");
  } else if (r.salaryMax !== null && r.salaryMin !== null && r.salaryMax < r.salaryMin) {
    v.add("salaryMax", "Maximum salary must be at least the minimum");
  }
  if (anySalary) {
    if (r.salaryCurrency === null || isJavaBlank(r.salaryCurrency)) {
      v.add("salaryCurrency", "Currency is required when a salary is set");
    }
    if (r.salaryPeriod === null) v.add("salaryPeriod", "Period is required when a salary is set");
  }

  // URLs: absolute http(s) with a host, by Java's URI rules (see url-hasher.ts).
  if (!isHttpUrl(r.applyUrl)) v.add("applyUrl", "Apply URL must start with http:// or https://");
  if (r.companyLogoUrl !== null && !isJavaBlank(r.companyLogoUrl) && !isHttpUrl(r.companyLogoUrl)) {
    v.add("companyLogoUrl", "Logo URL must start with http:// or https://");
  }

  // Dates: when both are given, the expiry must be strictly after the posted date.
  if (r.postedAt !== null && r.expiresAt !== null && r.expiresAt.getTime() <= r.postedAt.getTime()) {
    v.add("expiresAt", "Expiry must be after the posted date");
  }

  v.throwIfAny();
}
