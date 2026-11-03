package dev.fastorial.jobs.web.dto;

import dev.fastorial.jobs.domain.ApiKey;
import java.time.Instant;

/** {@code key} is the plaintext and is only set in the response to creation. */
public record ApiKeyDto(long id, String name, String keyPrefix, Instant createdAt, Instant lastUsedAt,
                        Instant revokedAt, String key) {
    public static ApiKeyDto from(ApiKey k) {
        return new ApiKeyDto(k.getId(), k.getName(), k.getKeyPrefix(), k.getCreatedAt(), k.getLastUsedAt(),
                k.getRevokedAt(), null);
    }

    public static ApiKeyDto from(ApiKey k, String plaintext) {
        return new ApiKeyDto(k.getId(), k.getName(), k.getKeyPrefix(), k.getCreatedAt(), k.getLastUsedAt(),
                k.getRevokedAt(), plaintext);
    }
}
