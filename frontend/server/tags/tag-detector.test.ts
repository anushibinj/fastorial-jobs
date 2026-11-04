import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import golden from "@/server/__fixtures__/legacy-java/texts.golden.json";
import type { TagCategory } from "@/lib/api/contract";
import {
  compileAlias,
  isPlausibleCaseSensitiveMatch,
  normalizeText,
  TagDetector,
  toDetectedTagDto,
  type AliasEntry,
  type Detection,
} from "@/server/tags/tag-detector";
import { buildAliasEntries } from "@/server/tags/tag-services";
import { seedAliases, seedTags } from "@/server/tags/seed-tags.testkit";

// ---- the hand written vocabulary of the former Java TagDetectorTest ----

const ENTRIES: AliasEntry[] = [];
let nextId = 1;

function tag(name: string, slug: string, category: TagCategory, ...aliases: string[]) {
  const id = nextId++;
  // like the service: the tag name is an implicit case insensitive alias
  ENTRIES.push({ tagId: id, tagName: name, tagSlug: slug, category, alias: name, caseSensitive: false });
  for (const a of aliases) ENTRIES.push({ tagId: id, tagName: name, tagSlug: slug, category, alias: a, caseSensitive: false });
}

/** Replaces the case insensitive name alias of an ambiguous tag with a case sensitive one. */
function caseSensitive(slug: string, alias: string) {
  const base = ENTRIES.find((e) => e.tagSlug === slug)!;
  for (let i = ENTRIES.length - 1; i >= 0; i--) {
    if (ENTRIES[i].tagSlug === slug && ENTRIES[i].alias.toLowerCase() === alias.toLowerCase()) ENTRIES.splice(i, 1);
  }
  ENTRIES.push({ ...base, alias, caseSensitive: true });
}

tag("Java", "java", "LANGUAGE", "jvm");
tag("JavaScript", "javascript", "LANGUAGE", "js");
tag("TypeScript", "typescript", "LANGUAGE");
tag("Python", "python", "LANGUAGE");
tag("C++", "cpp", "LANGUAGE");
tag("C#", "csharp", "LANGUAGE");
tag("Go", "go", "LANGUAGE", "golang");
caseSensitive("go", "Go");
tag("R", "r", "LANGUAGE");
caseSensitive("r", "R");
tag("Spring Boot", "spring-boot", "FRAMEWORK", "springboot");
tag("Spring", "spring", "FRAMEWORK");
tag("Hibernate", "hibernate", "FRAMEWORK", "jpa");
tag("React", "react", "FRAMEWORK", "reactjs", "react.js");
tag("Angular", "angular", "FRAMEWORK");
tag("Vue.js", "vue-js", "FRAMEWORK", "vue");
tag("Next.js", "next-js", "FRAMEWORK", "nextjs");
tag("Node.js", "node-js", "FRAMEWORK", "nodejs", "node");
tag(".NET", "dotnet", "FRAMEWORK", "asp.net core", "asp.net");
tag("PostgreSQL", "postgresql", "DATABASE", "postgres");
tag("MongoDB", "mongodb", "DATABASE");
tag("Redis", "redis", "DATABASE");
tag("Cassandra", "cassandra", "DATABASE");
tag("SQL Server", "sql-server", "DATABASE", "t-sql");
tag("AWS", "aws", "CLOUD");
tag("Azure", "azure", "CLOUD");
tag("GCP", "gcp", "CLOUD", "google cloud platform");
tag("Kafka", "kafka", "TOOL");
tag("Docker", "docker", "TOOL");
tag("Kubernetes", "kubernetes", "TOOL", "k8s");
tag("Terraform", "terraform", "TOOL");
tag("Jenkins", "jenkins", "TOOL");
tag("GraphQL", "graphql", "TOOL");

const detector = new TagDetector(ENTRIES);

function fixture(name: string): [string, string] {
  const all = readFileSync(path.join(import.meta.dirname, "../__fixtures__/tag-detector", name), "utf8");
  const sep = all.indexOf("\n---\n");
  return [all.slice(0, sep).trim(), all.slice(sep + 5).trim()];
}

function bySlug(title: string, description: string): Map<string, Detection> {
  return new Map(detector.detect(title, description).map((d) => [d.slug, d]));
}

const total = (d: Detection | undefined) => (d ? d.titleCount + d.descriptionCount : 0);

describe("TagDetector (ported Java unit tests)", () => {
  it.each([
    ["java-backend.txt", ["java", "spring-boot", "kafka", "postgresql", "redis", "aws", "docker", "kubernetes", "jenkins", "javascript", "terraform", "hibernate"], ["go", "r"]],
    ["frontend-react.txt", ["react", "typescript", "next-js", "graphql", "node-js", "mongodb", "vue-js", "angular"], ["r", "java", "javascript"]],
    ["dotnet-cpp.txt", ["dotnet", "csharp", "cpp", "sql-server", "azure", "docker"], ["java", "r"]],
    ["golang-data.txt", ["go", "cassandra", "kafka", "r", "python", "gcp", "terraform"], ["java"]],
  ])("%s: detects the expected tags and nothing else", (file, expected, forbidden) => {
    const [title, description] = fixture(file);
    const slugs = new Set(detector.detect(title, description).map((d) => d.slug));
    for (const s of expected) expect(slugs).toContain(s);
    for (const s of forbidden) expect(slugs).not.toContain(s);
    for (const s of slugs) expect([...expected, "javascript"]).toContain(s);
  });

  it("does not match Java inside JavaScript", () => {
    const d = bySlug("", "We use JavaScript and Java.");
    expect(total(d.get("java"))).toBe(1);
    expect(total(d.get("javascript"))).toBe(1);
  });

  it("matches names with symbols", () => {
    const d = bySlug("C++ and C# engineer", "Also .NET, and Node.js.");
    for (const s of ["cpp", "csharp", "dotnet", "node-js"]) expect(d.has(s)).toBe(true);
    expect(total(d.get("node-js"))).toBe(1); // "Node.js" is not counted again as "Node"
  });

  it("lets the longest match win, so Spring Boot is not also Spring", () => {
    const d = bySlug("", "Spring Boot and Spring Cloud. springboot too.");
    expect(total(d.get("spring-boot"))).toBe(2);
    expect(total(d.get("spring"))).toBe(1);
  });

  it("does not count ASP.NET as .NET twice", () => {
    expect(total(bySlug("", "We build on ASP.NET Core.").get("dotnet"))).toBe(1);
  });

  it("matches ambiguous short names case sensitively", () => {
    const lower = bySlug("", "We say go for it and r is fine");
    expect(lower.has("go") || lower.has("r")).toBe(false);
    const upper = bySlug("", "Built with Go and R.");
    expect(upper.has("go") && upper.has("r")).toBe(true);
  });

  it("ignores an ambiguous name at the start of a sentence", () => {
    expect(bySlug("", "Go ahead and apply. Go to market. Golang is used.").has("go")).toBe(true);
    expect(bySlug("", "Go ahead and apply. Go to market.").has("go")).toBe(false);
  });

  it("does not read R&D as R", () => {
    expect(bySlug("", "Join our R&D team").has("r")).toBe(false);
  });

  it("ranks title matches above description matches", () => {
    const list = detector.detect("Docker engineer", "Kafka Kafka Kafka Kafka. Docker.");
    expect([list[0].slug, list[0].titleCount, list[0].descriptionCount]).toEqual(["docker", 1, 1]);
  });

  it("merges aliases of the same tag and keeps the matched texts", () => {
    const d = bySlug("", "Kubernetes, k8s and K8S");
    expect(d.size).toBe(1);
    expect(total(d.get("kubernetes"))).toBe(3);
    expect(d.get("kubernetes")!.matches.map((m) => m.text)).toEqual(expect.arrayContaining(["Kubernetes", "k8s"]));
  });

  it("treats spaces and hyphens as interchangeable in multi word names", () => {
    expect(total(bySlug("", "spring-boot and Spring   Boot").get("spring-boot"))).toBe(2);
  });

  it("accepts null and blank input", () => {
    expect(detector.detect(null, null)).toEqual([]);
    expect(detector.detect("", "  ")).toEqual([]);
  });
});

describe("TagDetector with the seeded vocabulary, against the legacy Java output", () => {
  const seeded = new TagDetector(buildAliasEntries(seedTags(), seedAliases()));
  it.each(golden.map((g, i) => [i, `${g.title ?? "null"} | ${(g.description ?? "null").slice(0, 50)}`, g] as const))(
    "case %i: %s",
    (_i, _label, g) => {
      expect(seeded.detect(g.title, g.description).map(toDetectedTagDto)).toEqual(g.detected);
    },
  );
});

describe("normalizeText", () => {
  it("maps typographic dashes, quotes and the non-breaking space to ASCII", () => {
    expect(normalizeText("Spring‑Boot – ‘x’ y")).toBe("Spring-Boot - 'x' y");
  });

  it("maps null and undefined to an empty string", () => {
    expect(normalizeText(null)).toBe("");
    expect(normalizeText(undefined)).toBe("");
  });
});

describe("compileAlias", () => {
  const entry = (alias: string, caseSensitive = false): AliasEntry => ({
    tagId: 1, tagName: "x", tagSlug: "x", category: "TOOL", alias, caseSensitive,
  });

  it("allows spaces or hyphens between words and respects letter boundaries", () => {
    const re = compileAlias(entry("Spring Boot"));
    expect("use spring-boot".match(re)?.[0]).toBe("spring-boot");
    expect("xspring boot".match(re)).toBeNull();
  });

  it("escapes regex syntax in aliases such as C++ and .NET", () => {
    expect("C++ dev".match(compileAlias(entry("C++")))?.[0]).toBe("C++");
    expect("aXNET".match(compileAlias(entry(".NET")))).toBeNull();
  });

  it("is case sensitive only when asked", () => {
    expect("go".match(compileAlias(entry("Go", true)))).toBeNull();
    expect("GO".match(compileAlias(entry("Go")))?.[0]).toBe("GO");
  });
});

describe("isPlausibleCaseSensitiveMatch", () => {
  it("rejects a match followed by & and one at a sentence start", () => {
    expect(isPlausibleCaseSensitiveMatch("R&D", 0, 1)).toBe(false);
    expect(isPlausibleCaseSensitiveMatch("Done. Go home", 6, 8)).toBe(false);
    expect(isPlausibleCaseSensitiveMatch("Go home", 0, 2)).toBe(false);
  });

  it("accepts a match inside a sentence", () => {
    expect(isPlausibleCaseSensitiveMatch("We use Go daily", 7, 9)).toBe(true);
  });
});

describe("toDetectedTagDto", () => {
  it("adds the total count", () => {
    const d: Detection = { tagId: 1, name: "Java", slug: "java", category: "LANGUAGE", titleCount: 1, descriptionCount: 2, matches: [] };
    expect(toDetectedTagDto(d)).toEqual({ name: "Java", slug: "java", category: "LANGUAGE", titleCount: 1, descriptionCount: 2, count: 3, matches: [] });
  });
});
