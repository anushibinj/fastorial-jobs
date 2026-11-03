package dev.fastorial.jobs;

import static org.hamcrest.Matchers.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

import java.util.Map;
import org.junit.jupiter.api.Test;
import org.springframework.http.MediaType;

class ApiKeyIntegrationTest extends IntegrationTestBase {

    @SuppressWarnings("unchecked")
    private Map<String, Object> createKey(String name) throws Exception {
        String body = postJson("/api/admin/api-keys", Map.of("name", name))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.key", startsWith("fjk_")))
                .andReturn().getResponse().getContentAsString();
        return json.readValue(body, Map.class);
    }

    @Test
    void keyCreatesJobsButIsStoredHashed() throws Exception {
        String key = (String) createKey("zapier").get("key");
        Integer plain = jdbc.queryForObject("SELECT count(*) FROM api_keys WHERE key_hash = ?", Integer.class, key);
        org.assertj.core.api.Assertions.assertThat(plain).isZero();

        mvc.perform(post("/api/admin/jobs").header("X-API-Key", key).contentType(MediaType.APPLICATION_JSON)
                        .content(json.writeValueAsString(job("Via key"))))
                .andExpect(status().isCreated());
        mvc.perform(get("/api/admin/api-keys").header(ADMIN, "test-admin"))
                .andExpect(jsonPath("$[0].key").doesNotExist())
                .andExpect(jsonPath("$[0].lastUsedAt").exists());
    }

    @Test
    void keyCannotManageKeysAndBadKeyIsRejected() throws Exception {
        String key = (String) createKey("k").get("key");
        mvc.perform(get("/api/admin/api-keys").header("X-API-Key", key)).andExpect(status().isUnauthorized());
        mvc.perform(get("/api/admin/jobs/../api-keys").header("X-API-Key", key)).andExpect(status().isUnauthorized());
        mvc.perform(get("/api/admin/jobs").header("X-API-Key", "fjk_nope")).andExpect(status().isUnauthorized());
    }

    @Test
    void revokedKeyStopsWorking() throws Exception {
        Map<String, Object> k = createKey("temp");
        mvc.perform(delete("/api/admin/api-keys/" + k.get("id")).header(ADMIN, "test-admin"))
                .andExpect(status().isNoContent());
        mvc.perform(get("/api/admin/jobs").header("X-API-Key", (String) k.get("key")))
                .andExpect(status().isUnauthorized());
    }
}
