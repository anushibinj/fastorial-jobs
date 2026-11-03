package dev.fastorial.jobs.service;

import java.text.Normalizer;
import java.util.Locale;
import java.util.stream.Stream;
import org.springframework.stereotype.Component;

/** Builds slugs like {@code senior-java-engineer-acme-hyderabad-1042}. */
@Component
public class SlugGenerator {

    private static final int MAX_BASE_LENGTH = 120;

    public String generate(String title, String company, String city, long id) {
        String base = Stream.of(title, company, city)
                .filter(s -> s != null && !s.isBlank())
                .map(SlugGenerator::slugify)
                .filter(s -> !s.isEmpty())
                .reduce((a, b) -> a + "-" + b)
                .orElse("job");
        if (base.length() > MAX_BASE_LENGTH) {
            base = base.substring(0, MAX_BASE_LENGTH);
            int cut = base.lastIndexOf('-');
            if (cut > 20) base = base.substring(0, cut);
        }
        return base + "-" + id;
    }

    public static String slugify(String input) {
        String s = Normalizer.normalize(input, Normalizer.Form.NFD).replaceAll("\\p{M}+", "");
        s = s.toLowerCase(Locale.ROOT).replace("c++", "cpp").replace("c#", "csharp").replace(".net", "dotnet");
        s = s.replaceAll("[^a-z0-9]+", "-");
        return s.replaceAll("^-+|-+$", "");
    }
}
