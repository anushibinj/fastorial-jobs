package dev.fastorial.jobs.web;

import dev.fastorial.jobs.domain.JobStatus;
import dev.fastorial.jobs.repo.TagRepository;
import dev.fastorial.jobs.service.JobService;
import dev.fastorial.jobs.service.TagDetectionService;
import dev.fastorial.jobs.web.dto.*;
import jakarta.validation.Valid;
import java.util.List;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.*;

/** Token protected (see TokenAuthFilter). */
@RestController
@RequestMapping("/api/admin")
public class AdminController {

    private final JobService jobs;
    private final TagRepository tags;
    private final TagDetectionService detection;

    public AdminController(JobService jobs, TagRepository tags, TagDetectionService detection) {
        this.jobs = jobs;
        this.tags = tags;
        this.detection = detection;
    }

    @GetMapping("/jobs")
    public PageResponse<JobSummary> list(@RequestParam(required = false) String q,
                                         @RequestParam(required = false) JobStatus status,
                                         @RequestParam(required = false) Integer page,
                                         @RequestParam(required = false) Integer size) {
        return jobs.searchAdmin(q, status, page, size);
    }

    @GetMapping("/jobs/{id}")
    public JobDetail get(@PathVariable long id) {
        return jobs.getAdmin(id);
    }

    @PostMapping("/jobs")
    @ResponseStatus(HttpStatus.CREATED)
    public JobDetail create(@Valid @RequestBody JobRequest request) {
        return jobs.create(request);
    }

    @PutMapping("/jobs/{id}")
    public JobDetail update(@PathVariable long id, @Valid @RequestBody JobRequest request) {
        return jobs.update(id, request);
    }

    @PatchMapping("/jobs/{id}/status")
    public JobDetail status(@PathVariable long id, @Valid @RequestBody StatusRequest request) {
        return jobs.setStatus(id, request.status());
    }

    /** Extends a published job, or reopens a closed one (resets the expiry window). */
    @PostMapping("/jobs/{id}/extend")
    public JobDetail extend(@PathVariable long id, @Valid @RequestBody(required = false) ExtendRequest request) {
        return jobs.extend(id, request == null ? null : request.days());
    }

    @GetMapping("/tags")
    public List<TagDto> tags() {
        return tags.findAllByOrderByNameAsc().stream().map(TagDto::from).toList();
    }

    @PostMapping("/tags/detect")
    public List<DetectedTagDto> detect(@RequestBody DetectRequest request) {
        return detection.detect(request.title(), request.description()).stream().map(DetectedTagDto::from).toList();
    }
}
