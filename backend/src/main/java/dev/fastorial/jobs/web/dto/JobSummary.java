package dev.fastorial.jobs.web.dto;

import dev.fastorial.jobs.domain.*;
import java.time.Instant;
import java.util.Comparator;
import java.util.List;

public record JobSummary(
        Long id, String slug, String title, String companyName, String companyLogoUrl,
        String locationCity, String locationState, String locationCountry, WorkMode workMode,
        int experienceMinYears, Integer experienceMaxYears,
        Long salaryMin, Long salaryMax, String salaryCurrency, SalaryPeriod salaryPeriod,
        JobStatus status, Instant postedAt, Instant expiresAt, List<TagDto> tags) {

    public static JobSummary from(Job j) {
        return new JobSummary(j.getId(), j.getSlug(), j.getTitle(), j.getCompanyName(), j.getCompanyLogoUrl(),
                j.getLocationCity(), j.getLocationState(), j.getLocationCountry(), j.getWorkMode(),
                j.getExperienceMinYears(), j.getExperienceMaxYears(),
                j.getSalaryMin(), j.getSalaryMax(), j.getSalaryCurrency(), j.getSalaryPeriod(),
                j.getStatus(), j.getPostedAt(), j.getExpiresAt(), tags(j));
    }

    static List<TagDto> tags(Job j) {
        return j.getTags().stream()
                .sorted(Comparator.comparing(Tag::getName, String.CASE_INSENSITIVE_ORDER))
                .map(TagDto::from).toList();
    }
}
