import { describe, expect, it } from "vitest";
import golden from "@/server/__fixtures__/legacy-java/slugs.golden.json";
import { generateSlug, slugify } from "@/server/jobs/slug-generator";

describe("generateSlug", () => {
  it.each(golden.map((g) => [JSON.stringify([g.title, g.company, g.city, g.id]), g] as const))(
    "matches the legacy Java SlugGenerator for %s",
    (_name, g) => {
      expect(generateSlug(g.title as string, g.company as string, g.city, g.id)).toBe(g.slug);
    },
  );

  it("joins title, company, city and id (ported Java unit test)", () => {
    expect(generateSlug("Senior Java Engineer", "Acme", "Hyderabad", 1042)).toBe("senior-java-engineer-acme-hyderabad-1042");
  });

  it("skips a missing city and strips accents and symbols (ported Java unit test)", () => {
    expect(generateSlug("C++ Développeur (Remote)!", "Zoë & Co.", null, 7)).toBe("cpp-developpeur-remote-zoe-co-7");
  });

  it("truncates long bases at a word boundary (ported Java unit test)", () => {
    const slug = generateSlug("word ".repeat(60), "Acme", "X", 9);
    expect(slug.length).toBeLessThanOrEqual(130);
    expect(slug.endsWith("-9")).toBe(true);
    expect(slug).not.toContain("--");
  });

  it("keeps .NET readable (ported Java unit test)", () => {
    expect(generateSlug(".NET Developer", "Wayne", null, 3)).toBe("dotnet-developer-wayne-3");
  });

  it("falls back to 'job' when every part slugifies to nothing", () => {
    expect(generateSlug("软件", "!!!", "  ", 5)).toBe("job-5");
  });
});

describe("slugify", () => {
  it("removes accents, lower-cases and dashes non alphanumerics", () => {
    expect(slugify("  Ingeniero Señor / São Paulo ")).toBe("ingeniero-senor-sao-paulo");
  });

  it("spells out C++, C# and .NET", () => {
    expect(slugify("C++, C# & .NET")).toBe("cpp-csharp-dotnet");
  });

  it("returns an empty string for text without latin letters or digits", () => {
    expect(slugify("🚀 软件")).toBe("");
  });
});
