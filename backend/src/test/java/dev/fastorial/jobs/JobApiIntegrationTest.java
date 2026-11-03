package dev.fastorial.jobs;

import static org.hamcrest.Matchers.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.Test;

class JobApiIntegrationTest extends IntegrationTestBase {

    @Test
    void createsJobWithSlugTagsAndDefaultExpiry() throws Exception {
        var created = create(job("Senior Java Engineer", Map.of("tags", List.of("java", "spring-boot"))));
        String slug = (String) created.get("slug");
        org.assertj.core.api.Assertions.assertThat(slug)
                .isEqualTo("senior-java-engineer-acme-hyderabad-" + created.get("id"));

        mvc.perform(get("/api/jobs/" + slug))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.title").value("Senior Java Engineer"))
                .andExpect(jsonPath("$.tags[*].slug", containsInAnyOrder("java", "spring-boot")))
                .andExpect(jsonPath("$.applyUrl").exists())
                .andExpect(jsonPath("$.status").value("PUBLISHED"));

        var postedAt = java.time.Instant.parse((String) created.get("postedAt"));
        var expiresAt = java.time.Instant.parse((String) created.get("expiresAt"));
        org.assertj.core.api.Assertions.assertThat(java.time.Duration.between(postedAt, expiresAt).toDays())
                .isEqualTo(30);
    }

    @Test
    void unknownSlugIs404() throws Exception {
        mvc.perform(get("/api/jobs/nope")).andExpect(status().isNotFound())
                .andExpect(jsonPath("$.code").value("NOT_FOUND"));
    }

    // ---- filters ----

    @Test
    void experienceFilterUsesOverlapRuleWithOpenEndedMax() throws Exception {
        create(job("A open 7+", Map.of("experienceMinYears", 7)));
        create(job("B 5-8", Map.of("experienceMinYears", 5, "experienceMaxYears", 8)));
        create(job("C 7-10", Map.of("experienceMinYears", 7, "experienceMaxYears", 10)));
        create(job("D 2-4", Map.of("experienceMinYears", 2, "experienceMaxYears", 4)));
        create(job("E open 10+", Map.of("experienceMinYears", 10)));

        // 7 years: 7+, 5-8 and 7-10 all match
        mvc.perform(get("/api/jobs").param("expMin", "7").param("expMax", "7"))
                .andExpect(jsonPath("$.items[*].title", containsInAnyOrder("A open 7+", "B 5-8", "C 7-10")));
        // 9 years: 7+, 7-10
        mvc.perform(get("/api/jobs").param("expMin", "9").param("expMax", "9"))
                .andExpect(jsonPath("$.items[*].title", containsInAnyOrder("A open 7+", "C 7-10")));
        // 12 years: both open ended jobs only
        mvc.perform(get("/api/jobs").param("expMin", "12").param("expMax", "12"))
                .andExpect(jsonPath("$.items[*].title", containsInAnyOrder("A open 7+", "E open 10+")));
        // 0 years: nothing starts at 0
        mvc.perform(get("/api/jobs").param("expMin", "0").param("expMax", "0"))
                .andExpect(jsonPath("$.total").value(0));
        // a range 3-4 only touches the 2-4 job
        mvc.perform(get("/api/jobs").param("expMin", "3").param("expMax", "4"))
                .andExpect(jsonPath("$.items[*].title", contains("D 2-4")));
    }

    @Test
    void filtersByLocationWorkModeAndAllTags() throws Exception {
        create(job("Java BLR", Map.of("locationCity", "Bengaluru", "workMode", "REMOTE", "tags", List.of("java", "kafka"))));
        create(job("Java HYD", Map.of("tags", List.of("java"))));
        create(job("Python HYD", Map.of("tags", List.of("python"))));

        mvc.perform(get("/api/jobs").param("location", "bengaluru"))
                .andExpect(jsonPath("$.items[*].title", contains("Java BLR")));
        mvc.perform(get("/api/jobs").param("workMode", "REMOTE"))
                .andExpect(jsonPath("$.items[*].title", contains("Java BLR")));
        mvc.perform(get("/api/jobs").param("tags", "java"))
                .andExpect(jsonPath("$.total").value(2));
        // AND semantics
        mvc.perform(get("/api/jobs").param("tags", "java,kafka"))
                .andExpect(jsonPath("$.items[*].title", contains("Java BLR")));
        mvc.perform(get("/api/jobs").param("tags", "java,python"))
                .andExpect(jsonPath("$.total").value(0));
    }

    @Test
    void textSearchMatchesDescriptionAndPartialTitleOrCompany() throws Exception {
        create(job("Platform Engineer", Map.of("description", "Operate Kafka clusters at scale", "companyName", "Globex")));
        create(job("Designer", Map.of("description", "Pixels")));

        mvc.perform(get("/api/jobs").param("q", "kafka"))
                .andExpect(jsonPath("$.items[*].title", contains("Platform Engineer")));
        mvc.perform(get("/api/jobs").param("q", "Glob"))
                .andExpect(jsonPath("$.items[*].title", contains("Platform Engineer")));
        mvc.perform(get("/api/jobs").param("q", "100% _ wild"))
                .andExpect(jsonPath("$.total").value(0));
    }

    // ---- pagination ----

    @Test
    void paginatesNewestFirstAndClampsSize() throws Exception {
        for (int i = 1; i <= 25; i++) {
            create(job("Job " + i));
            testClock().advance(java.time.Duration.ofMinutes(1));
        }
        mvc.perform(get("/api/jobs").param("size", "10").param("page", "2"))
                .andExpect(jsonPath("$.items", hasSize(5)))
                .andExpect(jsonPath("$.total").value(25))
                .andExpect(jsonPath("$.totalPages").value(3))
                .andExpect(jsonPath("$.hasNext").value(false))
                .andExpect(jsonPath("$.items[0].title").value("Job 5"));
        mvc.perform(get("/api/jobs"))
                .andExpect(jsonPath("$.size").value(20))
                .andExpect(jsonPath("$.items[0].title").value("Job 25"));
        mvc.perform(get("/api/jobs").param("size", "1000"))
                .andExpect(jsonPath("$.size").value(50))
                .andExpect(jsonPath("$.items", hasSize(25)));
    }

    // ---- duplicates and validation ----

    @Test
    void rejectsDuplicateApplyUrlEvenWithTrackingParams() throws Exception {
        create(job("First", Map.of("applyUrl", "https://www.linkedin.com/jobs/view/42/")));
        postJson("/api/admin/jobs", job("Second", Map.of("applyUrl", "https://linkedin.com/jobs/view/42?trackingId=abc")))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.code").value("DUPLICATE_APPLY_URL"))
                .andExpect(jsonPath("$.message", containsString("First")));
    }

    @Test
    void validatesExperienceAndSalary() throws Exception {
        postJson("/api/admin/jobs", job("Bad exp", Map.of("experienceMinYears", 7, "experienceMaxYears", 3)))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("VALIDATION_FAILED"))
                .andExpect(jsonPath("$.fieldErrors.experienceMaxYears", containsString("at least the minimum")));
        postJson("/api/admin/jobs", job("Bad salary", Map.of("salaryMin", 100)))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.fieldErrors.salaryCurrency").exists())
                .andExpect(jsonPath("$.fieldErrors.salaryPeriod").exists());
        postJson("/api/admin/jobs", job("Max only", Map.of("salaryMax", 100, "salaryCurrency", "INR", "salaryPeriod", "YEARLY")))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.fieldErrors.salaryMin").exists());
        postJson("/api/admin/jobs", job("Bad tag", Map.of("tags", List.of("cobol-9000"))))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.fieldErrors.tags").exists());
        postJson("/api/admin/jobs", Map.of("title", ""))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.fieldErrors.title").exists());
    }

    @Test
    void storesSalaryWhenComplete() throws Exception {
        var created = create(job("Paid", Map.of("salaryMin", 1800000, "salaryMax", 2500000,
                "salaryCurrency", "inr", "salaryPeriod", "YEARLY")));
        mvc.perform(get("/api/jobs/" + created.get("slug")))
                .andExpect(jsonPath("$.salaryCurrency").value("INR"))
                .andExpect(jsonPath("$.salaryMax").value(2500000));
    }

    // ---- auth ----

    @Test
    void adminAndInternalEndpointsRequireTokens() throws Exception {
        mvc.perform(get("/api/admin/jobs")).andExpect(status().isUnauthorized());
        mvc.perform(get("/api/admin/jobs").header(ADMIN, "wrong")).andExpect(status().isUnauthorized());
        mvc.perform(post("/api/internal/jobs/cleanup")).andExpect(status().isUnauthorized());
        mvc.perform(post("/api/internal/jobs/cleanup").header(ADMIN, "test-admin")).andExpect(status().isUnauthorized());
        mvc.perform(get("/api/jobs")).andExpect(status().isOk());
    }

    // ---- visibility ----

    @Test
    void draftsAreHiddenAndClosedJobsAreOnlyViewableBySlug() throws Exception {
        var draft = create(job("Hidden draft", Map.of("status", "DRAFT")));
        var closed = create(job("Closed one"));
        send(patch("/api/admin/jobs/" + closed.get("id") + "/status"), Map.of("status", "CLOSED")).andExpect(status().isOk());
        create(job("Live"));

        mvc.perform(get("/api/jobs")).andExpect(jsonPath("$.items[*].title", contains("Live")));
        mvc.perform(get("/api/jobs/" + draft.get("slug"))).andExpect(status().isNotFound());
        mvc.perform(get("/api/jobs/" + closed.get("slug")))
                .andExpect(status().isOk()).andExpect(jsonPath("$.status").value("CLOSED"));
        admin(get("/api/admin/jobs").param("status", "DRAFT")).andExpect(jsonPath("$.items[*].title", contains("Hidden draft")));
        admin(get("/api/admin/jobs")).andExpect(jsonPath("$.total").value(3));
    }

    @Test
    void publishingADraftSetsPostedAtAndExpiry() throws Exception {
        var draft = create(job("Draft", Map.of("status", "DRAFT")));
        org.assertj.core.api.Assertions.assertThat(draft.get("postedAt")).isNull();
        send(patch("/api/admin/jobs/" + draft.get("id") + "/status"), Map.of("status", "PUBLISHED"))
                .andExpect(jsonPath("$.postedAt").exists()).andExpect(jsonPath("$.expiresAt").exists());
    }

    @Test
    void updateReplacesFieldsAndKeepsSlug() throws Exception {
        var created = create(job("Old title", Map.of("tags", List.of("java"))));
        send(put("/api/admin/jobs/" + created.get("id")),
                job("New title", Map.of("applyUrl", created.get("applyUrl"), "tags", List.of("kotlin"))))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.title").value("New title"))
                .andExpect(jsonPath("$.slug").value(created.get("slug")))
                .andExpect(jsonPath("$.tags[*].slug", contains("kotlin")));
    }

    // ---- facets, sitemap, detection ----

    @Test
    void filtersEndpointReturnsCounts() throws Exception {
        create(job("A", Map.of("tags", List.of("java", "kafka"), "experienceMinYears", 7)));
        create(job("B", Map.of("tags", List.of("java"), "locationCity", "Pune", "workMode", "REMOTE",
                "experienceMinYears", 1, "experienceMaxYears", 2)));
        create(job("Draft", Map.of("tags", List.of("java"), "status", "DRAFT")));

        mvc.perform(get("/api/filters"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.locations[?(@.city=='Hyderabad')].count", contains(1)))
                .andExpect(jsonPath("$.locations[?(@.city=='Pune')].count", contains(1)))
                .andExpect(jsonPath("$.tags[?(@.slug=='java')].count", contains(2)))
                .andExpect(jsonPath("$.tags[?(@.slug=='kafka')].count", contains(1)))
                .andExpect(jsonPath("$.workModes[?(@.workMode=='REMOTE')].count", contains(1)))
                .andExpect(jsonPath("$.experience[?(@.label=='0-2 years')].count", contains(1)))
                .andExpect(jsonPath("$.experience[?(@.label=='10+ years')].count", contains(1)));
    }

    @Test
    void sitemapListsOnlyPublishedUnexpiredJobs() throws Exception {
        var live = create(job("Live"));
        create(job("Draft", Map.of("status", "DRAFT")));
        var expiring = create(job("Soon", Map.of("expiresAt", clock.instant().plusSeconds(3600).toString())));
        mvc.perform(get("/api/sitemap/jobs"))
                .andExpect(jsonPath("$[*].slug", containsInAnyOrder(live.get("slug"), expiring.get("slug"))))
                .andExpect(jsonPath("$[0].updatedAt").exists());
        testClock().advance(java.time.Duration.ofHours(2));
        mvc.perform(get("/api/sitemap/jobs")).andExpect(jsonPath("$[*].slug", contains(live.get("slug"))));
    }

    @Test
    void tagDetectEndpointSuggestsTags() throws Exception {
        postJson("/api/admin/tags/detect", Map.of("title", "Senior Java Engineer",
                "description", "Spring Boot, Kafka, k8s and Kubernetes. Go to market."))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$[0].slug").value("java"))
                .andExpect(jsonPath("$[*].slug", hasItems("java", "spring-boot", "kafka", "kubernetes")))
                .andExpect(jsonPath("$[*].slug", not(hasItem("go"))))
                .andExpect(jsonPath("$[?(@.slug=='kubernetes')].count", contains(2)))
                .andExpect(jsonPath("$[?(@.slug=='kubernetes')].matches[*].text", hasItems("k8s", "Kubernetes")));
    }
}
