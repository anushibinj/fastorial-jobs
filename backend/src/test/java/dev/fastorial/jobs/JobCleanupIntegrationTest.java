package dev.fastorial.jobs;

import static org.assertj.core.api.Assertions.assertThat;
import static org.hamcrest.Matchers.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

import dev.fastorial.jobs.service.JobService;
import java.time.Duration;
import java.util.Map;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;

class JobCleanupIntegrationTest extends IntegrationTestBase {

    @Autowired JobService service;

    private String statusOf(Object id) {
        return jdbc.queryForObject("select status from jobs where id = ?", String.class, ((Number) id).longValue());
    }

    @Test
    void closesOnlyExpiredPublishedJobsAndRespectsCustomExpiry() throws Exception {
        var expired = create(job("Default expiry"));                       // expires in 30 days
        var custom = create(job("Custom 90 days", Map.of(
                "expiresAt", clock.instant().plus(Duration.ofDays(90)).toString())));
        var draft = create(job("Draft", Map.of("status", "DRAFT")));
        var shortLived = create(job("Short", Map.of(
                "expiresAt", clock.instant().plus(Duration.ofDays(5)).toString())));

        testClock().advance(Duration.ofDays(10));
        assertThat(service.closeExpiredJobs()).isEqualTo(1);          // only "Short"
        assertThat(statusOf(shortLived.get("id"))).isEqualTo("CLOSED");
        assertThat(statusOf(expired.get("id"))).isEqualTo("PUBLISHED");

        testClock().advance(Duration.ofDays(25));                      // day 35
        assertThat(service.closeExpiredJobs()).isEqualTo(1);          // default 30 day job
        assertThat(statusOf(expired.get("id"))).isEqualTo("CLOSED");
        assertThat(statusOf(custom.get("id"))).isEqualTo("PUBLISHED"); // custom 90 days respected
        assertThat(statusOf(draft.get("id"))).isEqualTo("DRAFT");      // drafts left alone

        assertThat(service.closeExpiredJobs()).isZero();               // idempotent
    }

    @Test
    void cleanupEndpointIsProtectedAndSafeToCallRepeatedly() throws Exception {
        create(job("Soon gone"));
        testClock().advance(Duration.ofDays(31));
        mvc.perform(post("/api/internal/jobs/cleanup")).andExpect(status().isUnauthorized());
        mvc.perform(post("/api/internal/jobs/cleanup").header(INTERNAL, "test-secret"))
                .andExpect(status().isOk()).andExpect(jsonPath("$.closed").value(1));
        mvc.perform(post("/api/internal/jobs/cleanup").header(INTERNAL, "test-secret"))
                .andExpect(jsonPath("$.closed").value(0));
        mvc.perform(get("/api/jobs")).andExpect(jsonPath("$.total").value(0));
    }

    @Test
    void extendReopensAClosedJobAndResetsExpiry() throws Exception {
        var created = create(job("Comeback"));
        testClock().advance(Duration.ofDays(31));
        service.closeExpiredJobs();
        assertThat(statusOf(created.get("id"))).isEqualTo("CLOSED");

        var before = clock.instant();
        send(post("/api/admin/jobs/" + created.get("id") + "/extend"), Map.of("days", 14))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.status").value("PUBLISHED"))
                .andExpect(jsonPath("$.expiresAt", startsWith(before.plus(Duration.ofDays(14)).toString().substring(0, 16))));
        mvc.perform(get("/api/jobs")).andExpect(jsonPath("$.total").value(1));
    }

    @Test
    void extendAddsToTheFutureExpiryOfALiveJob() throws Exception {
        var created = create(job("Live"));
        var original = java.time.Instant.parse((String) created.get("expiresAt"));
        send(post("/api/admin/jobs/" + created.get("id") + "/extend"), Map.of("days", 7))
                .andExpect(jsonPath("$.expiresAt", startsWith(original.plus(Duration.ofDays(7)).toString().substring(0, 16))));
    }

    @Test
    void extendingADraftIsRejected() throws Exception {
        var draft = create(job("Draft", Map.of("status", "DRAFT")));
        send(post("/api/admin/jobs/" + draft.get("id") + "/extend"), Map.of())
                .andExpect(status().isConflict()).andExpect(jsonPath("$.code").value("INVALID_STATE"));
    }

    @Test
    void reopenViaStatusPatchResetsAnExpiredWindow() throws Exception {
        var created = create(job("Reopen me"));
        testClock().advance(Duration.ofDays(31));
        service.closeExpiredJobs();
        send(patch("/api/admin/jobs/" + created.get("id") + "/status"), Map.of("status", "PUBLISHED"))
                .andExpect(jsonPath("$.status").value("PUBLISHED"));
        assertThat(service.closeExpiredJobs()).isZero();
    }

    @Test
    void expiredJobsLeaveThePublicListBeforeTheDailySweepRuns() throws Exception {
        var soon = create(job("Expires soon", Map.of("expiresAt", clock.instant().plus(Duration.ofHours(1)).toString())));
        create(job("Long lived"));
        mvc.perform(get("/api/jobs")).andExpect(jsonPath("$.total").value(2));

        testClock().advance(Duration.ofHours(2)); // expired, but cleanup has not run
        assertThat(statusOf(soon.get("id"))).isEqualTo("PUBLISHED");
        mvc.perform(get("/api/jobs")).andExpect(jsonPath("$.items[*].title", contains("Long lived")));
        // the page itself stays reachable
        mvc.perform(get("/api/jobs/" + soon.get("slug"))).andExpect(status().isOk());
    }
}
