package dev.fastorial.jobs.web.dto;

import dev.fastorial.jobs.domain.Tag;
import dev.fastorial.jobs.domain.TagCategory;

public record TagDto(String name, String slug, TagCategory category) {
    public static TagDto from(Tag t) {
        return new TagDto(t.getName(), t.getSlug(), t.getCategory());
    }
}
