package dev.fastorial.jobs.web.dto;

import dev.fastorial.jobs.domain.TagCategory;
import dev.fastorial.jobs.domain.WorkMode;
import java.util.List;

public record FiltersResponse(List<LocationCount> locations, List<WorkModeCount> workModes,
                              List<TagCount> tags, List<ExperienceBucket> experience) {
    public record LocationCount(String city, long count) {}
    public record WorkModeCount(WorkMode workMode, long count) {}
    public record TagCount(String name, String slug, TagCategory category, long count) {}
    /** Jobs whose range overlaps [min, max]; max is null for the open ended bucket. */
    public record ExperienceBucket(String label, int min, Integer max, long count) {}
}
