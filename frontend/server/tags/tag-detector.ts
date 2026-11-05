import type { DetectedTagDto, MatchedText, TagCategory } from "@/lib/api/contract";
import { compareIgnoreCase, isJavaBlank, javaTrim } from "@/server/shared/java-text";

/** One searchable alias. The tag name itself is passed in as an alias too (see `TagDetectionService`). */
export interface AliasEntry {
  tagId: number;
  tagName: string;
  tagSlug: string;
  category: TagCategory;
  alias: string;
  caseSensitive: boolean;
}

/** Tags found in a title and description, before mapping to the API shape. */
export interface Detection {
  tagId: number;
  name: string;
  slug: string;
  category: TagCategory;
  titleCount: number;
  descriptionCount: number;
  /** The texts that matched, most frequent first. */
  matches: MatchedText[];
}

/**
 * A match must not touch a letter or digit on either side. This is a custom word boundary rather than
 * `\b`, because `\b` does not work around symbols: it would not find `C++` or `.NET`. With these
 * lookarounds `Node.js` matches, `Javascript` does not match `Java`, and in `asp.net` the `.net`
 * alias cannot match on its own because it is preceded by the letter `p`.
 */
const EDGE_BEFORE = "(?<![\\p{L}\\p{N}])";
const EDGE_AFTER = "(?![\\p{L}\\p{N}])";

/**
 * Java's `\s` without `UNICODE_CHARACTER_CLASS` is ASCII only. JavaScript's `\s` also matches Unicode
 * spaces, so the class is spelled out to keep matching identical to the former backend.
 */
const JAVA_SPACE_OR_DASH = "[ \\t\\n\\u000B\\f\\r\\-]+";
const JAVA_SPACES = /[ \t\n\u000B\f\r]+/;

/** Typographic dashes, quotes and the non-breaking space mapped to plain ASCII before matching. */
const TYPOGRAPHIC: Readonly<Record<string, string>> = {
  "‐": "-", // hyphen
  "‑": "-", // non-breaking hyphen
  "–": "-", // en dash
  "—": "-", // em dash
  "‘": "'", // left single quote
  "’": "'", // right single quote
  " ": " ", // non-breaking space
};

/** An alias compiled to its regular expression. */
interface Compiled {
  entry: AliasEntry;
  pattern: RegExp;
}

/** One match in the text: [start, end) in UTF-16 indexes, the alias that produced it and the matched text. */
interface Span {
  start: number;
  end: number;
  compiled: Compiled;
  text: string;
}

/**
 * Escapes a literal for use inside a regular expression (Java's `Pattern.quote`). Only the syntax
 * characters are escaped: with the `u` flag JavaScript rejects needless escapes such as `\-` outside a
 * character class, so escaping more would make the pattern itself invalid.
 */
function quote(literal: string): string {
  return literal.replace(/[\\^$.*+?()[\]{}|/]/g, "\\$&");
}

/**
 * Replaces typographic punctuation and the non-breaking space with ASCII, so that pasted text from
 * Word or LinkedIn (`Spring‑Boot`, `Postgres SQL`) matches like plain text. Null becomes "".
 */
export function normalizeText(text: string | null | undefined): string {
  if (text == null) return "";
  return text.replace(/[‐‑–—‘’ ]/g, (ch) => TYPOGRAPHIC[ch]);
}

/**
 * Builds the regular expression for one alias. Words of a multi word alias may be separated by any run
 * of spaces or hyphens, so `Spring Boot` also matches `spring-boot` and `Spring   Boot`.
 * Case insensitive aliases use the `i` flag; the `u` flag enables `\p{L}` and Unicode case folding,
 * the equivalent of Java's `CASE_INSENSITIVE | UNICODE_CASE`. One known difference: Java also treats
 * the Turkish dotless `ı` and dotted `İ` as case variants of `i`, Unicode simple case folding does not.
 */
export function compileAlias(entry: AliasEntry): RegExp {
  const words = javaTrim(normalizeText(entry.alias)).split(JAVA_SPACES);
  const body = words.map(quote).join(JAVA_SPACE_OR_DASH);
  return new RegExp(EDGE_BEFORE + body + EDGE_AFTER, entry.caseSensitive ? "gu" : "giu");
}

/**
 * Heuristics for ambiguous short names such as `Go` and `R`, which only have case sensitive aliases:
 * a match directly followed by `&` (as in `R&D`) does not count, and neither does one at the start of a
 * sentence (`Go ahead and apply.`), where capitalization says nothing.
 */
export function isPlausibleCaseSensitiveMatch(text: string, start: number, end: number): boolean {
  if (end < text.length && text[end] === "&") return false;
  let i = start - 1;
  while (i >= 0 && (text[i] === " " || text[i] === "\t")) i--;
  const sentenceStart = i < 0 || ".!?:\n\r".includes(text[i]);
  return !sentenceStart;
}

/**
 * Detects tech stack tags in a job title and description. Port of the former backend's `TagDetector`.
 *
 * It is pure and stateless after construction, which makes it easy to test with table driven fixtures.
 * Matching rules:
 * - Custom word boundaries (see `EDGE_BEFORE`), so symbols in names such as `C++` and `C#` work.
 * - Overlapping matches are resolved by keeping the longest, so `Spring Boot` does not also count as
 *   `Spring`, and `Node.js` does not also count as `Node`.
 * - Case sensitive aliases (`Go`, `R`) must match exactly and pass `isPlausibleCaseSensitiveMatch`.
 * - All aliases of a tag are merged into one detection. Title matches weigh five times as much as
 *   description matches when ranking.
 */
export class TagDetector {
  private readonly compiled: Compiled[];

  /**
   * @param entries every alias of every tag, including the tag names themselves.
   */
  constructor(entries: readonly AliasEntry[]) {
    // 1. Drop duplicate aliases of the same tag (same text after normalization, same case rule).
    //    The first one wins, like LinkedHashMap.putIfAbsent.
    const unique = new Map<string, AliasEntry>();
    for (const e of entries) {
      const key = `${e.tagId}|${e.caseSensitive}|${normalizeText(e.alias).toLowerCase()}`;
      if (!unique.has(key)) unique.set(key, e);
    }
    // 2. Longest alias first. Array.prototype.sort is stable, so equal lengths keep their input order,
    //    exactly like Java's stable stream sort. This order decides ties between equally long matches.
    this.compiled = [...unique.values()]
      .sort((a, b) => b.alias.length - a.alias.length)
      .map((entry) => ({ entry, pattern: compileAlias(entry) }));
  }

  /**
   * Returns the detected tags, best first: by score (5 per title match plus 1 per description match)
   * descending, then by name case insensitively. Null or blank inputs are allowed.
   */
  detect(title: string | null | undefined, description: string | null | undefined): Detection[] {
    const byTag = new Map<number, Accumulator>();
    this.collect(normalizeText(title), true, byTag);
    this.collect(normalizeText(description), false, byTag);
    return [...byTag.values()]
      .map((acc) => acc.toDetection())
      .sort((a, b) => score(b) - score(a) || compareIgnoreCase(a.name, b.name));
  }

  /** Finds every alias match in `text`, resolves overlaps, and adds the survivors to `byTag`. */
  private collect(text: string, inTitle: boolean, byTag: Map<number, Accumulator>): void {
    if (isJavaBlank(text)) return;

    // Every match of every alias, in alias order then position order.
    const spans: Span[] = [];
    for (const compiled of this.compiled) {
      compiled.pattern.lastIndex = 0;
      for (const m of text.matchAll(compiled.pattern)) {
        const start = m.index;
        const end = start + m[0].length;
        if (compiled.entry.caseSensitive && !isPlausibleCaseSensitiveMatch(text, start, end)) continue;
        spans.push({ start, end, compiled, text: m[0] });
      }
    }

    // Longest match wins; between equally long matches the earlier one wins. The sort is stable, so
    // identical spans keep the alias order established in the constructor.
    spans.sort((a, b) => b.end - b.start - (a.end - a.start) || a.start - b.start);

    // Greedily accept spans that do not overlap anything already accepted. [s, e) and [as, ae) overlap
    // when each starts before the other ends.
    const accepted: Span[] = [];
    for (const s of spans) {
      if (!accepted.some((a) => s.start < a.end && a.start < s.end)) accepted.push(s);
    }

    for (const s of accepted) {
      const e = s.compiled.entry;
      let acc = byTag.get(e.tagId);
      if (!acc) {
        acc = new Accumulator(e);
        byTag.set(e.tagId, acc);
      }
      acc.add(s.text, inTitle);
    }
  }
}

/** Ranking weight: a title match counts five times as much as a description match. */
function score(d: Detection): number {
  return d.titleCount * 5 + d.descriptionCount;
}

/** Collects the matches of one tag across title and description. */
class Accumulator {
  private titleCount = 0;
  private descriptionCount = 0;
  /** Matched text to count, in first seen order (Java used a LinkedHashMap). */
  private readonly texts = new Map<string, number>();

  constructor(private readonly entry: AliasEntry) {}

  /** Counts one match of `text`, found in the title or in the description. */
  add(text: string, inTitle: boolean): void {
    if (inTitle) this.titleCount++;
    else this.descriptionCount++;
    this.texts.set(text, (this.texts.get(text) ?? 0) + 1);
  }

  /** The detection for this tag, with matched texts sorted by count (stable for equal counts). */
  toDetection(): Detection {
    const matches = [...this.texts.entries()]
      .map(([text, count]) => ({ text, count }))
      .sort((a, b) => b.count - a.count);
    return {
      tagId: this.entry.tagId,
      name: this.entry.tagName,
      slug: this.entry.tagSlug,
      category: this.entry.category,
      titleCount: this.titleCount,
      descriptionCount: this.descriptionCount,
      matches,
    };
  }
}

/** Maps a detection to the API shape of `POST /api/admin/tags/detect` (the former `DetectedTagDto`). */
export function toDetectedTagDto(d: Detection): DetectedTagDto {
  return {
    name: d.name,
    slug: d.slug,
    category: d.category,
    titleCount: d.titleCount,
    descriptionCount: d.descriptionCount,
    count: d.titleCount + d.descriptionCount,
    matches: d.matches,
  };
}
