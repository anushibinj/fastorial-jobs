package dev.fastorial.jobs.web.dto;

import java.time.Instant;

public record SitemapEntry(String slug, Instant updatedAt) {}
