package dev.fastorial.jobs.web;

import dev.fastorial.jobs.service.JobService;
import dev.fastorial.jobs.web.dto.CleanupResult;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/** Called by Cloud Scheduler once a day. Protected by the X-Internal-Secret header. Safe to repeat. */
@RestController
@RequestMapping("/api/internal")
public class InternalController {

    private final JobService jobs;

    public InternalController(JobService jobs) {
        this.jobs = jobs;
    }

    @PostMapping("/jobs/cleanup")
    public CleanupResult cleanup() {
        return new CleanupResult(jobs.closeExpiredJobs());
    }
}
