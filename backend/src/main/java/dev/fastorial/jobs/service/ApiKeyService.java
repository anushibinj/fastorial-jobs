package dev.fastorial.jobs.service;

import dev.fastorial.jobs.domain.ApiKey;
import dev.fastorial.jobs.repo.ApiKeyRepository;
import dev.fastorial.jobs.web.ApiException;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.security.SecureRandom;
import java.time.Clock;
import java.time.Instant;
import java.util.HexFormat;
import java.util.List;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class ApiKeyService {

    public static final String PREFIX = "fjk_";
    private static final SecureRandom RANDOM = new SecureRandom();

    private final ApiKeyRepository repo;
    private final Clock clock;

    public ApiKeyService(ApiKeyRepository repo, Clock clock) {
        this.repo = repo;
        this.clock = clock;
    }

    /** A freshly created key together with its one-time plaintext. */
    public record Created(ApiKey key, String plaintext) {}

    @Transactional
    public Created create(String name) {
        byte[] bytes = new byte[32];
        RANDOM.nextBytes(bytes);
        String plaintext = PREFIX + HexFormat.of().formatHex(bytes);
        ApiKey k = new ApiKey();
        k.setName(name.trim());
        k.setKeyPrefix(plaintext.substring(0, PREFIX.length() + 6));
        k.setKeyHash(hash(plaintext));
        k.setCreatedAt(Instant.now(clock));
        return new Created(repo.save(k), plaintext);
    }

    @Transactional(readOnly = true)
    public List<ApiKey> list() {
        return repo.findAllByOrderByCreatedAtDesc();
    }

    @Transactional
    public void revoke(long id) {
        ApiKey k = repo.findById(id).orElseThrow(() -> ApiException.notFound("API key not found"));
        if (k.getRevokedAt() == null) k.setRevokedAt(Instant.now(clock));
    }

    /** True when the plaintext matches an active key. Records the use time. */
    @Transactional
    public boolean authenticate(String plaintext) {
        if (plaintext == null || !plaintext.startsWith(PREFIX)) return false;
        return repo.findByKeyHashAndRevokedAtIsNull(hash(plaintext)).map(k -> {
            k.setLastUsedAt(Instant.now(clock));
            return true;
        }).orElse(false);
    }

    static String hash(String plaintext) {
        try {
            return HexFormat.of().formatHex(
                    MessageDigest.getInstance("SHA-256").digest(plaintext.getBytes(StandardCharsets.UTF_8)));
        } catch (NoSuchAlgorithmException e) {
            throw new IllegalStateException(e);
        }
    }
}
