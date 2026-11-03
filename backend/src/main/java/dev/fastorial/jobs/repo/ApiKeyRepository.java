package dev.fastorial.jobs.repo;

import dev.fastorial.jobs.domain.ApiKey;
import java.util.List;
import java.util.Optional;
import org.springframework.data.jpa.repository.JpaRepository;

public interface ApiKeyRepository extends JpaRepository<ApiKey, Long> {
    Optional<ApiKey> findByKeyHashAndRevokedAtIsNull(String keyHash);

    List<ApiKey> findAllByOrderByCreatedAtDesc();
}
