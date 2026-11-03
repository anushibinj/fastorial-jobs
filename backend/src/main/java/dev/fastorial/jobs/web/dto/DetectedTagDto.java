package dev.fastorial.jobs.web.dto;

import dev.fastorial.jobs.domain.TagCategory;
import dev.fastorial.jobs.service.TagDetector;
import java.util.List;

public record DetectedTagDto(String name, String slug, TagCategory category, int titleCount,
                             int descriptionCount, int count, List<TagDetector.MatchedText> matches) {
    public static DetectedTagDto from(TagDetector.Detection d) {
        return new DetectedTagDto(d.name(), d.slug(), d.category(), d.titleCount(), d.descriptionCount(),
                d.totalCount(), d.matches());
    }
}
