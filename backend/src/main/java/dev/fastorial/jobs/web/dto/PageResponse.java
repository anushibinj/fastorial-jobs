package dev.fastorial.jobs.web.dto;

import java.util.List;
import org.springframework.data.domain.Page;

/** Zero based paging. */
public record PageResponse<T>(List<T> items, int page, int size, long total, int totalPages, boolean hasNext) {
    public static <T> PageResponse<T> from(Page<T> p) {
        return new PageResponse<>(p.getContent(), p.getNumber(), p.getSize(), p.getTotalElements(),
                p.getTotalPages(), p.hasNext());
    }
}
