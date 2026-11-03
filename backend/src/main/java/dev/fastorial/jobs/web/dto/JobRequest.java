package dev.fastorial.jobs.web.dto;

import dev.fastorial.jobs.domain.*;
import jakarta.validation.constraints.*;
import java.time.Instant;
import java.util.List;

/** Create/replace payload for admin. Cross field rules live in {@code JobValidator}. */
public record JobRequest(
        @NotBlank(message = "Title is required") @Size(max = 200, message = "Title must be at most 200 characters") String title,
        @NotBlank(message = "Company is required") @Size(max = 150, message = "Company must be at most 150 characters") String companyName,
        @Size(max = 500, message = "Logo URL must be at most 500 characters") String companyLogoUrl,
        String description,
        @NotBlank(message = "Apply URL is required") @Size(max = 1000, message = "Apply URL must be at most 1000 characters") String applyUrl,
        @NotNull(message = "Source is required") JobSource source,
        @Size(max = 100) String locationCity,
        @Size(max = 100) String locationState,
        @Size(max = 100) String locationCountry,
        @NotNull(message = "Work mode is required") WorkMode workMode,
        @NotNull(message = "Minimum experience is required") @Min(value = 0, message = "Minimum experience must be 0 or more") Integer experienceMinYears,
        @Min(value = 0, message = "Maximum experience must be 0 or more") Integer experienceMaxYears,
        @Min(value = 0, message = "Minimum salary must be 0 or more") Long salaryMin,
        @Min(value = 0, message = "Maximum salary must be 0 or more") Long salaryMax,
        @Pattern(regexp = "^[A-Za-z]{3}$", message = "Currency must be a 3 letter code") String salaryCurrency,
        SalaryPeriod salaryPeriod,
        /** Defaults to PUBLISHED on create. */
        JobStatus status,
        Instant postedAt,
        Instant expiresAt,
        /** Tag slugs. */
        List<String> tags) {}
