package dev.fastorial.jobs.service;

import static org.assertj.core.api.Assertions.assertThat;

import org.junit.jupiter.api.Test;

class SlugGeneratorTest {

    private final SlugGenerator gen = new SlugGenerator();

    @Test
    void joinsTitleCompanyCityAndId() {
        assertThat(gen.generate("Senior Java Engineer", "Acme", "Hyderabad", 1042))
                .isEqualTo("senior-java-engineer-acme-hyderabad-1042");
    }

    @Test
    void skipsMissingCityAndStripsAccentsAndSymbols() {
        assertThat(gen.generate("C++ Développeur (Remote)!", "Zoë & Co.", null, 7))
                .isEqualTo("cpp-developpeur-remote-zoe-co-7");
    }

    @Test
    void truncatesLongBasesAtWordBoundary() {
        String slug = gen.generate("word ".repeat(60), "Acme", "X", 9);
        assertThat(slug).hasSizeLessThanOrEqualTo(130).endsWith("-9").doesNotContain("--");
    }

    @Test
    void keepsDotNetReadable() {
        assertThat(gen.generate(".NET Developer", "Wayne", null, 3)).isEqualTo("dotnet-developer-wayne-3");
    }
}
