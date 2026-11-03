package dev.fastorial.jobs.service;

import dev.fastorial.jobs.web.ApiException;
import dev.fastorial.jobs.web.dto.JobRequest;
import java.net.URI;
import java.util.LinkedHashMap;
import java.util.Map;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Component;

/** Cross field rules that bean validation annotations cannot express. */
@Component
public class JobValidator {

    public void validate(JobRequest r) {
        Map<String, String> errors = new LinkedHashMap<>();

        // experience: max requires min (min is also required by annotation), max >= min
        if (r.experienceMaxYears() != null) {
            if (r.experienceMinYears() == null) {
                errors.put("experienceMinYears", "Minimum experience is required when maximum is set");
            } else if (r.experienceMaxYears() < r.experienceMinYears()) {
                errors.put("experienceMaxYears", "Maximum experience must be at least the minimum");
            }
        }

        // salary: max requires min, max >= min, currency and period required with any amount
        boolean anySalary = r.salaryMin() != null || r.salaryMax() != null;
        if (r.salaryMax() != null && r.salaryMin() == null) {
            errors.put("salaryMin", "Minimum salary is required when maximum is set");
        } else if (r.salaryMax() != null && r.salaryMax() < r.salaryMin()) {
            errors.put("salaryMax", "Maximum salary must be at least the minimum");
        }
        if (anySalary) {
            if (r.salaryCurrency() == null || r.salaryCurrency().isBlank()) {
                errors.put("salaryCurrency", "Currency is required when a salary is set");
            }
            if (r.salaryPeriod() == null) {
                errors.put("salaryPeriod", "Period is required when a salary is set");
            }
        }

        if (r.applyUrl() != null && !isHttpUrl(r.applyUrl())) {
            errors.put("applyUrl", "Apply URL must start with http:// or https://");
        }
        if (r.companyLogoUrl() != null && !r.companyLogoUrl().isBlank() && !isHttpUrl(r.companyLogoUrl())) {
            errors.put("companyLogoUrl", "Logo URL must start with http:// or https://");
        }
        if (r.postedAt() != null && r.expiresAt() != null && !r.expiresAt().isAfter(r.postedAt())) {
            errors.put("expiresAt", "Expiry must be after the posted date");
        }

        if (!errors.isEmpty()) {
            throw new ApiException(HttpStatus.BAD_REQUEST, "VALIDATION_FAILED",
                    "Please fix the highlighted fields", errors);
        }
    }

    static boolean isHttpUrl(String s) {
        try {
            URI u = URI.create(s.trim());
            return ("http".equalsIgnoreCase(u.getScheme()) || "https".equalsIgnoreCase(u.getScheme()))
                    && u.getHost() != null;
        } catch (IllegalArgumentException e) {
            return false;
        }
    }
}
