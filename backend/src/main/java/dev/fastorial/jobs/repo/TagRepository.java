package dev.fastorial.jobs.repo;

import dev.fastorial.jobs.domain.Tag;
import java.util.Collection;
import java.util.List;
import org.springframework.data.jpa.repository.JpaRepository;

public interface TagRepository extends JpaRepository<Tag, Long> {

    List<Tag> findBySlugIn(Collection<String> slugs);

    List<Tag> findAllByOrderByNameAsc();
}
