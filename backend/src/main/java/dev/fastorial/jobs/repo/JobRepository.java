package dev.fastorial.jobs.repo;

import dev.fastorial.jobs.domain.Job;
import dev.fastorial.jobs.domain.JobStatus;
import java.time.Instant;
import java.util.List;
import java.util.Optional;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.JpaSpecificationExecutor;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface JobRepository extends JpaRepository<Job, Long>, JpaSpecificationExecutor<Job> {

    Optional<Job> findBySlug(String slug);

    boolean existsByApplyUrlHash(String hash);

    Optional<Job> findByApplyUrlHash(String hash);

    /** Idempotent bulk close of expired published jobs. Returns the number of rows changed. */
    @Modifying
    @Query("""
            update Job j set j.status = dev.fastorial.jobs.domain.JobStatus.CLOSED, j.updatedAt = :now
            where j.status = dev.fastorial.jobs.domain.JobStatus.PUBLISHED
              and j.expiresAt is not null and j.expiresAt < :now
            """)
    int closeExpired(@Param("now") Instant now);

    @Query("""
            select j from Job j
            where j.status = dev.fastorial.jobs.domain.JobStatus.PUBLISHED
              and j.expiresAt > :now
            order by j.updatedAt desc
            """)
    List<Job> findSitemapJobs(@Param("now") Instant now);

    // ---- filter facets (published jobs only) ----

    @Query("""
            select j.locationCity, count(j) from Job j
            where j.status = :status and j.locationCity is not null
            group by j.locationCity order by count(j) desc, j.locationCity asc
            """)
    List<Object[]> countByCity(@Param("status") JobStatus status);

    @Query("""
            select j.workMode, count(j) from Job j
            where j.status = :status group by j.workMode
            """)
    List<Object[]> countByWorkMode(@Param("status") JobStatus status);

    @Query("""
            select t.slug, t.name, t.category, count(j) from Job j join j.tags t
            where j.status = :status
            group by t.slug, t.name, t.category order by count(j) desc, t.name asc
            """)
    List<Object[]> countByTag(@Param("status") JobStatus status);

    @Query("select j.experienceMinYears, j.experienceMaxYears from Job j where j.status = :status")
    List<Object[]> experienceRanges(@Param("status") JobStatus status);
}
