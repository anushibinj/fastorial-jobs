package dev.fastorial.jobs.service;

import static org.assertj.core.api.Assertions.assertThat;

import dev.fastorial.jobs.domain.TagCategory;
import dev.fastorial.jobs.service.TagDetector.AliasEntry;
import dev.fastorial.jobs.service.TagDetector.Detection;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.stream.Collectors;
import java.util.stream.Stream;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.Arguments;
import org.junit.jupiter.params.provider.MethodSource;

class TagDetectorTest {

    private static final List<AliasEntry> ENTRIES = new ArrayList<>();
    private static long nextId = 1;

    static {
        tag("Java", "java", TagCategory.LANGUAGE, "jvm");
        tag("JavaScript", "javascript", TagCategory.LANGUAGE, "js");
        tag("TypeScript", "typescript", TagCategory.LANGUAGE);
        tag("Python", "python", TagCategory.LANGUAGE);
        tag("C++", "cpp", TagCategory.LANGUAGE);
        tag("C#", "csharp", TagCategory.LANGUAGE);
        tag("Go", "go", TagCategory.LANGUAGE, "golang");
        caseSensitive("go", "Go");
        tag("R", "r", TagCategory.LANGUAGE);
        caseSensitive("r", "R");
        tag("Spring Boot", "spring-boot", TagCategory.FRAMEWORK, "springboot");
        tag("Spring", "spring", TagCategory.FRAMEWORK);
        tag("Hibernate", "hibernate", TagCategory.FRAMEWORK, "jpa");
        tag("React", "react", TagCategory.FRAMEWORK, "reactjs", "react.js");
        tag("Angular", "angular", TagCategory.FRAMEWORK);
        tag("Vue.js", "vue-js", TagCategory.FRAMEWORK, "vue");
        tag("Next.js", "next-js", TagCategory.FRAMEWORK, "nextjs");
        tag("Node.js", "node-js", TagCategory.FRAMEWORK, "nodejs", "node");
        tag(".NET", "dotnet", TagCategory.FRAMEWORK, "asp.net core", "asp.net");
        tag("PostgreSQL", "postgresql", TagCategory.DATABASE, "postgres");
        tag("MongoDB", "mongodb", TagCategory.DATABASE);
        tag("Redis", "redis", TagCategory.DATABASE);
        tag("Cassandra", "cassandra", TagCategory.DATABASE);
        tag("SQL Server", "sql-server", TagCategory.DATABASE, "t-sql");
        tag("AWS", "aws", TagCategory.CLOUD);
        tag("Azure", "azure", TagCategory.CLOUD);
        tag("GCP", "gcp", TagCategory.CLOUD, "google cloud platform");
        tag("Kafka", "kafka", TagCategory.TOOL);
        tag("Docker", "docker", TagCategory.TOOL);
        tag("Kubernetes", "kubernetes", TagCategory.TOOL, "k8s");
        tag("Terraform", "terraform", TagCategory.TOOL);
        tag("Jenkins", "jenkins", TagCategory.TOOL);
        tag("GraphQL", "graphql", TagCategory.TOOL);
    }

    private static void tag(String name, String slug, TagCategory cat, String... aliases) {
        long id = nextId++;
        // like the service: the tag name is an implicit case insensitive alias
        ENTRIES.add(new AliasEntry(id, name, slug, cat, name, false));
        for (String a : aliases) ENTRIES.add(new AliasEntry(id, name, slug, cat, a, false));
    }

    /** Replaces the case insensitive name alias of an ambiguous tag with a case sensitive one. */
    private static void caseSensitive(String slug, String alias) {
        AliasEntry base = ENTRIES.stream().filter(e -> e.tagSlug().equals(slug)).findFirst().orElseThrow();
        ENTRIES.removeIf(e -> e.tagSlug().equals(slug) && e.alias().equalsIgnoreCase(alias));
        ENTRIES.add(new AliasEntry(base.tagId(), base.tagName(), slug, base.category(), alias, true));
    }

    private final TagDetector detector = new TagDetector(ENTRIES);

    static String[] fixture(String name) throws IOException {
        try (var in = TagDetectorTest.class.getResourceAsStream("/fixtures/" + name)) {
            String all = new String(in.readAllBytes(), StandardCharsets.UTF_8);
            String[] parts = all.split("\n---\n", 2);
            return new String[] {parts[0].trim(), parts[1].trim()};
        }
    }

    static Stream<Arguments> fixtures() {
        return Stream.of(
                Arguments.of("java-backend.txt",
                        Set.of("java", "spring-boot", "kafka", "postgresql", "redis", "aws", "docker",
                                "kubernetes", "jenkins", "javascript", "terraform", "hibernate"),
                        Set.of("go", "r")),
                Arguments.of("frontend-react.txt",
                        Set.of("react", "typescript", "next-js", "graphql", "node-js", "mongodb", "vue-js", "angular"),
                        Set.of("r", "java", "javascript")),
                Arguments.of("dotnet-cpp.txt",
                        Set.of("dotnet", "csharp", "cpp", "sql-server", "azure", "docker"),
                        Set.of("java", "r")),
                Arguments.of("golang-data.txt",
                        Set.of("go", "cassandra", "kafka", "r", "python", "gcp", "terraform"),
                        Set.of("java")));
    }

    @ParameterizedTest(name = "{0}")
    @MethodSource("fixtures")
    void detectsExpectedTagsAndNothingElse(String file, Set<String> expected, Set<String> forbidden) throws IOException {
        String[] f = fixture(file);
        Set<String> slugs = detector.detect(f[0], f[1]).stream().map(Detection::slug).collect(Collectors.toSet());
        assertThat(slugs).containsAll(expected).doesNotContainAnyElementsOf(forbidden);
        assertThat(slugs).isSubsetOf(Stream.concat(expected.stream(), Set.of("javascript").stream()).toList());
    }

    private Map<String, Detection> bySlug(String title, String description) {
        return detector.detect(title, description).stream().collect(Collectors.toMap(Detection::slug, d -> d));
    }

    @Test
    void javaDoesNotMatchInsideJavaScript() {
        var d = bySlug("", "We use JavaScript and Java.");
        assertThat(d.get("java").totalCount()).isEqualTo(1);
        assertThat(d.get("javascript").totalCount()).isEqualTo(1);
    }

    @Test
    void symbolsInNamesMatch() {
        var d = bySlug("C++ and C# engineer", "Also .NET, and Node.js.");
        assertThat(d).containsKeys("cpp", "csharp", "dotnet", "node-js");
        assertThat(d.get("node-js").totalCount()).isEqualTo(1); // "Node.js" is not counted again as "Node"
    }

    @Test
    void longestMatchWinsSoSpringBootIsNotAlsoSpring() {
        var d = bySlug("", "Spring Boot and Spring Cloud. springboot too.");
        assertThat(d.get("spring-boot").totalCount()).isEqualTo(2);
        assertThat(d.get("spring").totalCount()).isEqualTo(1);
    }

    @Test
    void aspNetDoesNotLeakAsDotNetTwice() {
        var d = bySlug("", "We build on ASP.NET Core.");
        assertThat(d.get("dotnet").totalCount()).isEqualTo(1);
    }

    @Test
    void ambiguousShortNamesAreCaseSensitive() {
        assertThat(bySlug("", "We say go for it and r is fine")).doesNotContainKeys("go", "r");
        assertThat(bySlug("", "Built with Go and R.")).containsKeys("go", "r");
    }

    @Test
    void ambiguousNameAtSentenceStartIsIgnored() {
        assertThat(bySlug("", "Go ahead and apply. Go to market. Golang is used.")).containsKey("go");
        assertThat(bySlug("", "Go ahead and apply. Go to market.")).doesNotContainKey("go");
    }

    @Test
    void rAndDIsNotR() {
        assertThat(bySlug("", "Join our R&D team")).doesNotContainKey("r");
    }

    @Test
    void titleMatchesRankAboveDescriptionMatches() {
        var list = detector.detect("Docker engineer", "Kafka Kafka Kafka Kafka. Docker.");
        assertThat(list.get(0).slug()).isEqualTo("docker");
        assertThat(list.get(0).titleCount()).isEqualTo(1);
        assertThat(list.get(0).descriptionCount()).isEqualTo(1);
    }

    @Test
    void aliasesOfTheSameTagAreMergedWithMatchedText() {
        var d = bySlug("", "Kubernetes, k8s and K8S");
        assertThat(d).hasSize(1);
        assertThat(d.get("kubernetes").totalCount()).isEqualTo(3);
        assertThat(d.get("kubernetes").matches()).extracting("text").contains("Kubernetes", "k8s");
    }

    @Test
    void spacesAndHyphensAreInterchangeableInMultiWordNames() {
        assertThat(bySlug("", "spring-boot and Spring   Boot")).containsKey("spring-boot");
        assertThat(bySlug("", "spring-boot and Spring   Boot").get("spring-boot").totalCount()).isEqualTo(2);
    }

    @Test
    void nullAndBlankInputAreSafe() {
        assertThat(detector.detect(null, null)).isEmpty();
        assertThat(detector.detect("", "  ")).isEmpty();
    }
}
