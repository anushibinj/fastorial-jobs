package dev.fastorial.jobs.service;

import dev.fastorial.jobs.domain.Tag;
import dev.fastorial.jobs.domain.TagAlias;
import dev.fastorial.jobs.repo.TagAliasRepository;
import dev.fastorial.jobs.repo.TagRepository;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/** Loads tags and aliases from the database and runs {@link TagDetector}. */
@Service
public class TagDetectionService {

    private static final Duration TTL = Duration.ofMinutes(5);

    private final TagRepository tags;
    private final TagAliasRepository aliases;
    private final Clock clock;
    private volatile TagDetector detector;
    private volatile Instant builtAt = Instant.MIN;

    public TagDetectionService(TagRepository tags, TagAliasRepository aliases, Clock clock) {
        this.tags = tags;
        this.aliases = aliases;
        this.clock = clock;
    }

    @Transactional(readOnly = true)
    public List<TagDetector.Detection> detect(String title, String description) {
        return detector().detect(title, description);
    }

    private TagDetector detector() {
        Instant now = clock.instant();
        if (detector == null || Duration.between(builtAt, now).compareTo(TTL) > 0) {
            List<TagDetector.AliasEntry> entries = new ArrayList<>();
            for (Tag t : tags.findAll()) {
                // The tag name is an implicit alias, except very short names (Go, R) which need
                // an explicit case sensitive alias row to avoid matching ordinary words.
                if (t.getName().length() > 2) {
                    entries.add(new TagDetector.AliasEntry(t.getId(), t.getName(), t.getSlug(),
                            t.getCategory(), t.getName(), false));
                }
            }
            for (TagAlias a : aliases.findAll()) {
                Tag t = a.getTag();
                entries.add(new TagDetector.AliasEntry(t.getId(), t.getName(), t.getSlug(), t.getCategory(),
                        a.getAlias(), a.isCaseSensitive()));
            }
            detector = new TagDetector(entries);
            builtAt = now;
        }
        return detector;
    }
}
