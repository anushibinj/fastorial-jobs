import { isJavaBlank } from "@/server/shared/java-text";

/** Longest slug base kept before the `-<id>` suffix is appended. */
const MAX_BASE_LENGTH = 120;

/**
 * Turns free text into a URL segment: `"C++ Développeur (Remote)!"` becomes `"cpp-developpeur-remote"`.
 * Port of the former backend's `SlugGenerator.slugify`:
 *
 * 1. Decompose accented letters (NFD) and drop the combining marks, so `é` becomes `e`.
 * 2. Lower-case, then spell out the tech names whose symbols would otherwise vanish:
 *    `c++` to `cpp`, `c#` to `csharp`, `.net` to `dotnet`.
 * 3. Collapse every run of characters other than `a-z` and `0-9` into one `-`, and trim leading
 *    and trailing dashes. Letters outside `a-z` after step 1 (such as `ß`, `ø` or CJK) are dropped.
 */
export function slugify(input: string): string {
  let s = input.normalize("NFD").replace(/\p{M}+/gu, "");
  s = s.toLowerCase().replaceAll("c++", "cpp").replaceAll("c#", "csharp").replaceAll(".net", "dotnet");
  s = s.replace(/[^a-z0-9]+/g, "-");
  return s.replace(/^-+|-+$/g, "");
}

/**
 * Builds the public slug of a job, such as `senior-java-engineer-acme-hyderabad-1042`.
 * Port of the former backend's `SlugGenerator.generate`.
 *
 * Title, company and city are slugified and joined with `-`; blank or empty parts are skipped and
 * `job` is used when nothing is left. A base longer than 120 characters is cut at 120 and then backed
 * up to the last `-`, but only if that dash is past position 20, so a very long single word is still
 * cut rather than reduced to almost nothing. The numeric id is always appended, which keeps slugs
 * unique even for identical titles.
 */
export function generateSlug(title: string, company: string, city: string | null, id: number): string {
  const parts = [title, company, city]
    .filter((s): s is string => s != null && !isJavaBlank(s))
    .map(slugify)
    .filter((s) => s !== "");
  let base = parts.length > 0 ? parts.join("-") : "job";
  if (base.length > MAX_BASE_LENGTH) {
    base = base.slice(0, MAX_BASE_LENGTH);
    const cut = base.lastIndexOf("-");
    if (cut > 20) base = base.slice(0, cut);
  }
  return `${base}-${id}`;
}
