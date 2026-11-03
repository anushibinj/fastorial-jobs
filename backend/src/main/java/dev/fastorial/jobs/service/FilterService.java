package dev.fastorial.jobs.service;

import dev.fastorial.jobs.domain.*;
import dev.fastorial.jobs.repo.JobRepository;
import dev.fastorial.jobs.web.dto.FiltersResponse;
import dev.fastorial.jobs.web.dto.FiltersResponse.*;
import java.util.List;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/** Facets for the filter UI, counted over PUBLISHED jobs. */
@Service
public class FilterService {

    private record Bucket(String label, int min, Integer max) {}

    private static final List<Bucket> BUCKETS = List.of(
            new Bucket("0-2 years", 0, 2),
            new Bucket("3-5 years", 3, 5),
            new Bucket("6-9 years", 6, 9),
            new Bucket("10+ years", 10, null));

    private final JobRepository jobs;

    public FilterService(JobRepository jobs) {
        this.jobs = jobs;
    }

    @Transactional(readOnly = true)
    public FiltersResponse filters() {
        JobStatus s = JobStatus.PUBLISHED;
        List<LocationCount> locations = jobs.countByCity(s).stream()
                .map(r -> new LocationCount((String) r[0], (Long) r[1])).toList();
        List<WorkModeCount> modes = jobs.countByWorkMode(s).stream()
                .map(r -> new WorkModeCount((WorkMode) r[0], (Long) r[1])).toList();
        List<TagCount> tags = jobs.countByTag(s).stream()
                .map(r -> new TagCount((String) r[1], (String) r[0], (TagCategory) r[2], (Long) r[3])).toList();

        List<Object[]> ranges = jobs.experienceRanges(s);
        List<ExperienceBucket> buckets = BUCKETS.stream().map(b -> {
            long count = ranges.stream().filter(r -> {
                int jobMin = (Integer) r[0];
                Integer jobMax = (Integer) r[1];
                boolean minOk = b.max() == null || jobMin <= b.max();
                boolean maxOk = jobMax == null || jobMax >= b.min();
                return minOk && maxOk;
            }).count();
            return new ExperienceBucket(b.label(), b.min(), b.max(), count);
        }).toList();
        return new FiltersResponse(locations, modes, tags, buckets);
    }
}
