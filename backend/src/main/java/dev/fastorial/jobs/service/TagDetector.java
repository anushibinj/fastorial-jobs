package dev.fastorial.jobs.service;

import dev.fastorial.jobs.domain.TagCategory;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * Detects tech stack tags in a job title and description.
 *
 * <p>Pure and stateless after construction, so it is easy to unit test with table driven fixtures.
 * Matching rules:
 * <ul>
 *   <li>Custom word boundaries (not {@code \b}): a match must not touch a letter or digit, so
 *       {@code C++}, {@code C#}, {@code .NET} and {@code Node.js} match, while {@code asp.net}
 *       does not match the {@code .net} alias on its own and {@code Javascript} does not match
 *       {@code Java}.</li>
 *   <li>Overlaps are resolved by preferring the longest match, so {@code Spring Boot} does not
 *       also count as {@code Spring} and {@code Node.js} does not also count {@code Node} twice.</li>
 *   <li>Case sensitive aliases (such as {@code Go} and {@code R}) must match exactly, are ignored at
 *       the start of a sentence, and are ignored when followed by {@code &} (as in R&amp;D).</li>
 *   <li>Aliases of the same tag are de-duplicated; matches in the title rank above the description.</li>
 * </ul>
 */
public class TagDetector {

    /** One searchable alias. The tag name itself is passed in as an alias too. */
    public record AliasEntry(long tagId, String tagName, String tagSlug, TagCategory category,
                             String alias, boolean caseSensitive) {}

    public record MatchedText(String text, int count) {}

    public record Detection(long tagId, String name, String slug, TagCategory category,
                            int titleCount, int descriptionCount, List<MatchedText> matches) {
        public int totalCount() {
            return titleCount + descriptionCount;
        }
        int score() {
            return titleCount * 5 + descriptionCount;
        }
    }

    private static final String EDGE_BEFORE = "(?<![\\p{L}\\p{N}])";
    private static final String EDGE_AFTER = "(?![\\p{L}\\p{N}])";

    private record Compiled(AliasEntry entry, Pattern pattern) {}

    private record Span(int start, int end, Compiled compiled, String text) {}

    private final List<Compiled> compiled;

    public TagDetector(List<AliasEntry> entries) {
        // De-duplicate identical (tag, alias, case) rows, and sort longest alias first.
        Map<String, AliasEntry> unique = new LinkedHashMap<>();
        for (AliasEntry e : entries) {
            String key = e.tagId() + "|" + e.caseSensitive() + "|" + normalize(e.alias()).toLowerCase();
            unique.putIfAbsent(key, e);
        }
        this.compiled = unique.values().stream()
                .sorted(Comparator.comparingInt((AliasEntry e) -> e.alias().length()).reversed())
                .map(e -> new Compiled(e, compile(e)))
                .toList();
    }

    private static Pattern compile(AliasEntry e) {
        // Allow any run of spaces/hyphens/dots-with-spaces between words inside multi word aliases
        String[] words = normalize(e.alias()).trim().split("\\s+");
        StringBuilder sb = new StringBuilder();
        for (int i = 0; i < words.length; i++) {
            if (i > 0) sb.append("[\\s\\-]+");
            sb.append(Pattern.quote(words[i]));
        }
        int flags = e.caseSensitive() ? 0 : Pattern.CASE_INSENSITIVE | Pattern.UNICODE_CASE;
        return Pattern.compile(EDGE_BEFORE + sb + EDGE_AFTER, flags);
    }

    /** Normalizes typographic punctuation and whitespace so matching sees plain text. */
    static String normalize(String text) {
        if (text == null) return "";
        return text.replace('‐', '-').replace('‑', '-').replace('–', '-')
                .replace('—', '-').replace('‘', '\'').replace('’', '\'')
                .replace(' ', ' ');
    }

    public List<Detection> detect(String title, String description) {
        Map<Long, Acc> byTag = new LinkedHashMap<>();
        collect(normalize(title), true, byTag);
        collect(normalize(description), false, byTag);
        return byTag.values().stream()
                .map(Acc::toDetection)
                .sorted(Comparator.comparingInt(Detection::score).reversed()
                        .thenComparing(Detection::name, String.CASE_INSENSITIVE_ORDER))
                .toList();
    }

    private void collect(String text, boolean inTitle, Map<Long, Acc> byTag) {
        if (text.isBlank()) return;
        List<Span> spans = new ArrayList<>();
        for (Compiled c : compiled) {
            Matcher m = c.pattern().matcher(text);
            while (m.find()) {
                if (c.entry().caseSensitive() && !plausibleCaseSensitiveMatch(text, m.start(), m.end())) {
                    continue;
                }
                spans.add(new Span(m.start(), m.end(), c, m.group()));
            }
        }
        // Longest match wins; ties are broken by position.
        spans.sort(Comparator.comparingInt((Span s) -> s.end() - s.start()).reversed()
                .thenComparingInt(Span::start));
        List<Span> accepted = new ArrayList<>();
        for (Span s : spans) {
            boolean overlaps = accepted.stream().anyMatch(a -> s.start() < a.end() && a.start() < s.end());
            if (!overlaps) accepted.add(s);
        }
        for (Span s : accepted) {
            AliasEntry e = s.compiled().entry();
            byTag.computeIfAbsent(e.tagId(), id -> new Acc(e)).add(s.text(), inTitle);
        }
    }

    /** Heuristics for ambiguous short names like "Go" and "R". */
    private static boolean plausibleCaseSensitiveMatch(String text, int start, int end) {
        if (end < text.length() && text.charAt(end) == '&') return false;
        int i = start - 1;
        while (i >= 0 && (text.charAt(i) == ' ' || text.charAt(i) == '\t')) i--;
        boolean sentenceStart = i < 0 || ".!?:\n\r".indexOf(text.charAt(i)) >= 0;
        return !sentenceStart;
    }

    private static final class Acc {
        private final AliasEntry entry;
        private int title;
        private int description;
        private final Map<String, Integer> texts = new LinkedHashMap<>();

        Acc(AliasEntry entry) {
            this.entry = entry;
        }

        void add(String text, boolean inTitle) {
            if (inTitle) title++; else description++;
            texts.merge(text, 1, Integer::sum);
        }

        Detection toDetection() {
            List<MatchedText> matches = texts.entrySet().stream()
                    .map(e -> new MatchedText(e.getKey(), e.getValue()))
                    .sorted(Comparator.comparingInt(MatchedText::count).reversed())
                    .toList();
            return new Detection(entry.tagId(), entry.tagName(), entry.tagSlug(), entry.category(),
                    title, description, matches);
        }
    }
}
