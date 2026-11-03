package dev.fastorial.jobs.service;

import dev.fastorial.jobs.domain.*;
import dev.fastorial.jobs.repo.JobRepository;
import dev.fastorial.jobs.repo.TagRepository;
import dev.fastorial.jobs.web.ApiException;
import dev.fastorial.jobs.web.dto.*;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.util.*;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Pageable;
import org.springframework.data.domain.Sort;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
@Slf4j
public class JobService {

    private final JobRepository jobs;
    private final TagRepository tags;
    private final JobValidator validator;
    private final SlugGenerator slugs;
    private final Clock clock;
    private final int defaultExpiryDays;
    private final int defaultPageSize;
    private final int maxPageSize;

    public JobService(JobRepository jobs, TagRepository tags, JobValidator validator, SlugGenerator slugs,
                      Clock clock,
                      @Value("${jobs.default-expiry-days:30}") int defaultExpiryDays,
                      @Value("${jobs.default-page-size:20}") int defaultPageSize,
                      @Value("${jobs.max-page-size:50}") int maxPageSize) {
        this.jobs = jobs;
        this.tags = tags;
        this.validator = validator;
        this.slugs = slugs;
        this.clock = clock;
        this.defaultExpiryDays = defaultExpiryDays;
        this.defaultPageSize = defaultPageSize;
        this.maxPageSize = maxPageSize;
    }

    // ---------- public reads ----------

    @Transactional(readOnly = true)
    public PageResponse<JobSummary> searchPublic(JobSpecs.Criteria c, Integer page, Integer size) {
        var criteria = new JobSpecs.Criteria(c.q(), c.location(), c.workMode(), c.expMin(), c.expMax(),
                c.tags(), JobStatus.PUBLISHED);
        var sort = Sort.by(Sort.Order.desc("postedAt"), Sort.Order.desc("id"));
        return PageResponse.from(jobs.findAll(JobSpecs.of(criteria), pageable(page, size, sort)).map(JobSummary::from));
    }

    /** Closed jobs stay viewable (with a banner); drafts are hidden. */
    @Transactional(readOnly = true)
    public JobDetail getPublic(String slug) {
        return jobs.findBySlug(slug)
                .filter(j -> j.getStatus() != JobStatus.DRAFT)
                .map(JobDetail::from)
                .orElseThrow(() -> ApiException.notFound("Job not found"));
    }

    @Transactional(readOnly = true)
    public List<SitemapEntry> sitemap() {
        return jobs.findSitemapJobs(clock.instant()).stream()
                .map(j -> new SitemapEntry(j.getSlug(), j.getUpdatedAt())).toList();
    }

    // ---------- admin reads ----------

    @Transactional(readOnly = true)
    public PageResponse<JobSummary> searchAdmin(String q, JobStatus status, Integer page, Integer size) {
        var criteria = new JobSpecs.Criteria(q, null, null, null, null, null, status);
        var sort = Sort.by(Sort.Order.desc("updatedAt"), Sort.Order.desc("id"));
        return PageResponse.from(jobs.findAll(JobSpecs.of(criteria), pageable(page, size, sort)).map(JobSummary::from));
    }

    @Transactional(readOnly = true)
    public JobDetail getAdmin(long id) {
        return JobDetail.from(find(id));
    }

    // ---------- admin writes ----------

    @Transactional
    public JobDetail create(JobRequest r) {
        validator.validate(r);
        String hash = UrlHasher.hash(r.applyUrl());
        assertNotDuplicate(hash, null);

        Instant now = clock.instant();
        Job job = new Job();
        job.setCreatedAt(now);
        job.setSlug("pending-" + UUID.randomUUID());
        job.setApplyUrlHash(hash);
        JobStatus status = r.status() != null ? r.status() : JobStatus.PUBLISHED;
        job.setStatus(status);
        copyFields(job, r);
        applyLifecycleDefaults(job, r, now);
        job.setUpdatedAt(now);

        jobs.saveAndFlush(job);
        job.setSlug(slugs.generate(job.getTitle(), job.getCompanyName(), job.getLocationCity(), job.getId()));
        return JobDetail.from(jobs.save(job));
    }

    @Transactional
    public JobDetail update(long id, JobRequest r) {
        validator.validate(r);
        Job job = find(id);
        String hash = UrlHasher.hash(r.applyUrl());
        assertNotDuplicate(hash, job.getId());

        Instant now = clock.instant();
        job.setApplyUrlHash(hash);
        copyFields(job, r);
        if (r.status() != null) {
            changeStatus(job, r.status(), now);
        }
        if (r.postedAt() != null) job.setPostedAt(r.postedAt());
        if (r.expiresAt() != null) job.setExpiresAt(r.expiresAt());
        job.setUpdatedAt(now);
        return saveAndFlushDetail(job);
    }

    @Transactional
    public JobDetail setStatus(long id, JobStatus status) {
        Job job = find(id);
        Instant now = clock.instant();
        changeStatus(job, status, now);
        job.setUpdatedAt(now);
        return saveAndFlushDetail(job);
    }

    /**
     * Pushes {@code expires_at} forward. The base is the later of the current expiry and now, so
     * extending a closed (already expired) job resets the expiry to now + days, and the job is
     * published again.
     */
    @Transactional
    public JobDetail extend(long id, Integer days) {
        Job job = find(id);
        if (job.getStatus() == JobStatus.DRAFT) {
            throw new ApiException(HttpStatus.CONFLICT, "INVALID_STATE", "Publish the draft instead of extending it");
        }
        Instant now = clock.instant();
        Instant base = job.getExpiresAt() != null && job.getExpiresAt().isAfter(now) ? job.getExpiresAt() : now;
        job.setExpiresAt(base.plus(Duration.ofDays(days != null ? days : defaultExpiryDays)));
        job.setStatus(JobStatus.PUBLISHED);
        job.setUpdatedAt(now);
        return saveAndFlushDetail(job);
    }

    /** Closes every PUBLISHED job whose expiry has passed. Idempotent. */
    @Transactional
    public int closeExpiredJobs() {
        int closed = jobs.closeExpired(clock.instant());
        log.info("Closed {} expired job(s)", closed);
        return closed;
    }

    // ---------- helpers ----------

    private JobDetail saveAndFlushDetail(Job job) {
        try {
            return JobDetail.from(jobs.saveAndFlush(job));
        } catch (org.springframework.dao.DataIntegrityViolationException e) {
            throw new ApiException(HttpStatus.CONFLICT, "DUPLICATE_APPLY_URL",
                    "A job with this apply URL already exists");
        }
    }

    private Job find(long id) {
        return jobs.findById(id).orElseThrow(() -> ApiException.notFound("Job not found"));
    }

    private void assertNotDuplicate(String hash, Long selfId) {
        jobs.findByApplyUrlHash(hash).filter(j -> !j.getId().equals(selfId)).ifPresent(j -> {
            throw new ApiException(HttpStatus.CONFLICT, "DUPLICATE_APPLY_URL",
                    "A job with this apply URL already exists: " + j.getTitle() + " at " + j.getCompanyName()
                            + " (id " + j.getId() + ")",
                    Map.of("applyUrl", "Already posted as job " + j.getId()));
        });
    }

    private void copyFields(Job job, JobRequest r) {
        job.setTitle(r.title().trim());
        job.setCompanyName(r.companyName().trim());
        job.setCompanyLogoUrl(blankToNull(r.companyLogoUrl()));
        job.setDescription(r.description() == null ? "" : r.description());
        job.setApplyUrl(r.applyUrl().trim());
        job.setSource(r.source());
        job.setLocationCity(blankToNull(r.locationCity()));
        job.setLocationState(blankToNull(r.locationState()));
        job.setLocationCountry(blankToNull(r.locationCountry()));
        job.setWorkMode(r.workMode());
        job.setExperienceMinYears(r.experienceMinYears());
        job.setExperienceMaxYears(r.experienceMaxYears());
        boolean anySalary = r.salaryMin() != null;
        job.setSalaryMin(r.salaryMin());
        job.setSalaryMax(r.salaryMax());
        job.setSalaryCurrency(anySalary ? r.salaryCurrency().toUpperCase(Locale.ROOT) : null);
        job.setSalaryPeriod(anySalary ? r.salaryPeriod() : null);
        job.setTags(resolveTags(r.tags()));
    }

    private Set<Tag> resolveTags(List<String> slugList) {
        if (slugList == null || slugList.isEmpty()) return new LinkedHashSet<>();
        Set<String> wanted = new LinkedHashSet<>(slugList.stream().map(String::trim).filter(s -> !s.isEmpty()).toList());
        List<Tag> found = tags.findBySlugIn(wanted);
        if (found.size() != wanted.size()) {
            Set<String> have = new HashSet<>();
            found.forEach(t -> have.add(t.getSlug()));
            wanted.removeAll(have);
            throw new ApiException(HttpStatus.BAD_REQUEST, "VALIDATION_FAILED", "Unknown tag(s): " + wanted,
                    Map.of("tags", "Unknown tag(s): " + String.join(", ", wanted)));
        }
        return new LinkedHashSet<>(found);
    }

    private void applyLifecycleDefaults(Job job, JobRequest r, Instant now) {
        Instant postedAt = r.postedAt() != null ? r.postedAt()
                : job.getStatus() == JobStatus.DRAFT ? null : now;
        job.setPostedAt(postedAt);
        Instant expires = r.expiresAt() != null ? r.expiresAt()
                : postedAt != null ? postedAt.plus(Duration.ofDays(defaultExpiryDays)) : null;
        job.setExpiresAt(expires);
    }

    private void changeStatus(Job job, JobStatus next, Instant now) {
        if (next == JobStatus.PUBLISHED) {
            if (job.getPostedAt() == null) job.setPostedAt(now);
            if (job.getExpiresAt() == null || !job.getExpiresAt().isAfter(now)) {
                // publishing a draft or reopening a closed job: reset the expiry window
                job.setExpiresAt(now.plus(Duration.ofDays(defaultExpiryDays)));
            }
        }
        job.setStatus(next);
    }

    private Pageable pageable(Integer page, Integer size, Sort sort) {
        int s = size == null || size < 1 ? defaultPageSize : Math.min(size, maxPageSize);
        int p = page == null || page < 0 ? 0 : page;
        return PageRequest.of(p, s, sort);
    }

    private static String blankToNull(String s) {
        return s == null || s.isBlank() ? null : s.trim();
    }
}
