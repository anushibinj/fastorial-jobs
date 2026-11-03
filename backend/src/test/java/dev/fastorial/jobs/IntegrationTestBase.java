package dev.fastorial.jobs;

import com.fasterxml.jackson.databind.ObjectMapper;
import java.time.Clock;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.BeforeEach;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Import;
import org.springframework.context.annotation.Primary;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.springframework.test.context.TestPropertySource;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.ResultActions;
import org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder;
import org.testcontainers.containers.PostgreSQLContainer;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;

/**
 * Uses Testcontainers Postgres by default. Set TEST_DB_URL (and optionally TEST_DB_USER /
 * TEST_DB_PASSWORD) to run against an existing database instead, for machines without Docker.
 */
@SpringBootTest
@AutoConfigureMockMvc
@Import(IntegrationTestBase.TestClock.class)
@TestPropertySource(properties = {"app.admin.token=test-admin", "app.internal.secret=test-secret"})
public abstract class IntegrationTestBase {

    public static final String ADMIN = "X-Admin-Token";
    public static final String INTERNAL = "X-Internal-Secret";

    private static PostgreSQLContainer<?> container;

    @TestConfiguration
    static class TestClock {
        @Bean
        @Primary
        MutableClock testClock() {
            return new MutableClock();
        }
    }

    @DynamicPropertySource
    static void database(DynamicPropertyRegistry registry) {
        String url = System.getenv("TEST_DB_URL");
        if (url != null && !url.isBlank()) {
            registry.add("spring.datasource.url", () -> url);
            registry.add("spring.datasource.username", () -> System.getenv().getOrDefault("TEST_DB_USER", "fastorial"));
            registry.add("spring.datasource.password", () -> System.getenv().getOrDefault("TEST_DB_PASSWORD", "fastorial"));
            return;
        }
        synchronized (IntegrationTestBase.class) {
            if (container == null) {
                container = new PostgreSQLContainer<>("postgres:16");
                container.start();
            }
        }
        registry.add("spring.datasource.url", container::getJdbcUrl);
        registry.add("spring.datasource.username", container::getUsername);
        registry.add("spring.datasource.password", container::getPassword);
    }

    @Autowired protected MockMvc mvc;
    @Autowired protected ObjectMapper json;
    @Autowired protected JdbcTemplate jdbc;
    @Autowired protected Clock clock;

    protected MutableClock testClock() {
        return (MutableClock) clock;
    }

    @BeforeEach
    void cleanDatabase() {
        jdbc.execute("TRUNCATE jobs RESTART IDENTITY CASCADE");
        testClock().reset();
    }

    // ---- helpers ----

    protected static int seq = 0;

    /** A valid job payload; override fields with the extra map. */
    protected Map<String, Object> job(String title, Map<String, Object> extra) {
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("title", title);
        m.put("companyName", "Acme");
        m.put("description", "A role.");
        m.put("applyUrl", "https://example.com/jobs/" + (++seq));
        m.put("source", "OTHER");
        m.put("locationCity", "Hyderabad");
        m.put("workMode", "HYBRID");
        m.put("experienceMinYears", 3);
        m.put("tags", List.of());
        m.putAll(extra);
        return m;
    }

    protected Map<String, Object> job(String title) {
        return job(title, Map.of());
    }

    protected ResultActions postJson(String path, Object body) throws Exception {
        return send(post(path), body);
    }

    protected ResultActions send(MockHttpServletRequestBuilder b, Object body) throws Exception {
        return mvc.perform(b.header(ADMIN, "test-admin").contentType(MediaType.APPLICATION_JSON)
                .content(json.writeValueAsString(body)));
    }

    protected ResultActions admin(MockHttpServletRequestBuilder b) throws Exception {
        return mvc.perform(b.header(ADMIN, "test-admin"));
    }

    /** Creates a job through the admin API and returns the response JSON as a map. */
    @SuppressWarnings("unchecked")
    protected Map<String, Object> create(Map<String, Object> payload) throws Exception {
        String body = postJson("/api/admin/jobs", payload).andExpect(
                org.springframework.test.web.servlet.result.MockMvcResultMatchers.status().isCreated())
                .andReturn().getResponse().getContentAsString();
        return json.readValue(body, Map.class);
    }
}
