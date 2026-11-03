package dev.fastorial.jobs.web;

import dev.fastorial.jobs.domain.WorkMode;
import dev.fastorial.jobs.service.FilterService;
import dev.fastorial.jobs.service.JobService;
import dev.fastorial.jobs.service.JobSpecs;
import dev.fastorial.jobs.web.dto.*;
import java.util.List;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api")
public class JobController {

    private final JobService jobs;
    private final FilterService filters;

    public JobController(JobService jobs, FilterService filters) {
        this.jobs = jobs;
        this.filters = filters;
    }

    /** Pages are zero based. Default size 20, max 50. */
    @GetMapping("/jobs")
    public PageResponse<JobSummary> list(
            @RequestParam(required = false) String q,
            @RequestParam(required = false) String location,
            @RequestParam(required = false) WorkMode workMode,
            @RequestParam(required = false) Integer expMin,
            @RequestParam(required = false) Integer expMax,
            @RequestParam(required = false) List<String> tags,
            @RequestParam(required = false) Integer page,
            @RequestParam(required = false) Integer size) {
        var criteria = new JobSpecs.Criteria(q, location, workMode, expMin, expMax, tags, null, null);
        return jobs.searchPublic(criteria, page, size);
    }

    @GetMapping("/jobs/{slug}")
    public JobDetail get(@PathVariable String slug) {
        return jobs.getPublic(slug);
    }

    @GetMapping("/filters")
    public FiltersResponse filters() {
        return filters.filters();
    }

    @GetMapping("/sitemap/jobs")
    public List<SitemapEntry> sitemap() {
        return jobs.sitemap();
    }
}
