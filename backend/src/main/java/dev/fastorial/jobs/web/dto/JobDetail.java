package dev.fastorial.jobs.web.dto;

import dev.fastorial.jobs.domain.*;
import java.time.Instant;
import java.util.List;

public record JobDetail(
        Long id, String slug, String title, String companyName, String companyLogoUrl,
        String description, String applyUrl, JobSource source,
        String locationCity, String locationState, String locationCountry, WorkMode workMode,
        int experienceMinYears, Integer experienceMaxYears,
        Long salaryMin, Long salaryMax, String salaryCurrency, SalaryPeriod salaryPeriod,
        JobStatus status, Instant postedAt, Instant expiresAt, Instant updatedAt, List<TagDto> tags) {

    public static JobDetail from(Job j) {
        return new JobDetail(j.getId(), j.getSlug(), j.getTitle(), j.getCompanyName(), j.getCompanyLogoUrl(),
                j.getDescription(), j.getApplyUrl(), j.getSource(),
                j.getLocationCity(), j.getLocationState(), j.getLocationCountry(), j.getWorkMode(),
                j.getExperienceMinYears(), j.getExperienceMaxYears(),
                j.getSalaryMin(), j.getSalaryMax(), j.getSalaryCurrency(), j.getSalaryPeriod(),
                j.getStatus(), j.getPostedAt(), j.getExpiresAt(), j.getUpdatedAt(), JobSummary.tags(j));
    }
}
