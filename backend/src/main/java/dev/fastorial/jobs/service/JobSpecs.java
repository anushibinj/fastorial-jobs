package dev.fastorial.jobs.service;

import dev.fastorial.jobs.domain.*;
import jakarta.persistence.criteria.*;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
import org.springframework.data.jpa.domain.Specification;

public final class JobSpecs {

    /** All fields optional. {@code expMin}/{@code expMax} describe the candidate's experience range. */
    public record Criteria(String q, String location, WorkMode workMode, Integer expMin, Integer expMax,
                           List<String> tags, JobStatus status) {}

    private JobSpecs() {}

    public static Specification<Job> of(Criteria c) {
        return (root, query, cb) -> {
            List<Predicate> ps = new ArrayList<>();

            if (c.status() != null) {
                ps.add(cb.equal(root.get("status"), c.status()));
            }
            if (c.workMode() != null) {
                ps.add(cb.equal(root.get("workMode"), c.workMode()));
            }
            if (notBlank(c.location())) {
                ps.add(cb.equal(cb.lower(root.get("locationCity")), c.location().trim().toLowerCase(Locale.ROOT)));
            }

            // Experience overlap: job_min <= filter_max AND (job_max IS NULL OR job_max >= filter_min).
            // A null job max is open ended, so a "7+" job matches any search reaching 7 years or more.
            if (c.expMax() != null) {
                ps.add(cb.lessThanOrEqualTo(root.get("experienceMinYears"), c.expMax()));
            }
            if (c.expMin() != null) {
                ps.add(cb.or(
                        cb.isNull(root.get("experienceMaxYears")),
                        cb.greaterThanOrEqualTo(root.<Integer>get("experienceMaxYears"), c.expMin())));
            }

            // Tags: the job must have every requested tag.
            if (c.tags() != null && !c.tags().isEmpty()) {
                List<String> slugs = c.tags().stream().map(String::trim).filter(s -> !s.isEmpty()).distinct().toList();
                if (!slugs.isEmpty()) {
                    Subquery<Integer> sq = query.subquery(Integer.class);
                    Root<Job> r2 = sq.from(Job.class);
                    Join<Job, Tag> t = r2.join("tags");
                    sq.select(cb.literal(1))
                            .where(cb.equal(r2.get("id"), root.get("id")), t.get("slug").in(slugs))
                            .having(cb.equal(cb.countDistinct(t.get("id")), (long) slugs.size()));
                    ps.add(cb.exists(sq));
                }
            }

            // Text: full text search (GIN indexed) OR a prefix-friendly substring match on title/company.
            if (notBlank(c.q())) {
                String q = c.q().trim();
                String like = "%" + escapeLike(q.toLowerCase(Locale.ROOT)) + "%";
                Expression<Boolean> fts = cb.function("job_matches", Boolean.class,
                        root.get("title"), root.get("companyName"), root.get("description"), cb.literal(q));
                ps.add(cb.or(
                        cb.isTrue(fts),
                        cb.like(cb.lower(root.get("title")), like, '\\'),
                        cb.like(cb.lower(root.get("companyName")), like, '\\')));
            }
            return cb.and(ps.toArray(Predicate[]::new));
        };
    }

    private static boolean notBlank(String s) {
        return s != null && !s.isBlank();
    }

    private static String escapeLike(String s) {
        return s.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_");
    }
}
