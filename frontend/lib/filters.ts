/** Filters live in the URL so every view is shareable. */
export type FilterState = {
  q: string;
  location: string;
  mode: string;
  exp: string; // years, as typed
  tags: string[];
};

export const EMPTY_FILTERS: FilterState = { q: "", location: "", mode: "", exp: "", tags: [] };

type Raw = Record<string, string | string[] | undefined> | URLSearchParams;

function get(raw: Raw, key: string): string {
  const v = raw instanceof URLSearchParams ? raw.get(key) : raw[key];
  const s = Array.isArray(v) ? v[0] : v;
  return (s ?? "").trim();
}

export function parseExp(value: string): number | null {
  if (!/^\d{1,2}$/.test(value)) return null;
  const n = Number(value);
  return n >= 0 && n <= 30 ? n : null;
}

export function parseFilters(raw: Raw): FilterState {
  const exp = get(raw, "exp");
  const mode = get(raw, "mode").toUpperCase();
  return {
    q: get(raw, "q"),
    location: get(raw, "location"),
    mode: ["ONSITE", "HYBRID", "REMOTE"].includes(mode) ? mode : "",
    exp: parseExp(exp) === null ? "" : String(parseExp(exp)),
    tags: get(raw, "tags").split(",").map((t) => t.trim()).filter(Boolean),
  };
}

/** Query string for the page URL (omits empty values). */
export function toSearchParams(f: FilterState): URLSearchParams {
  const p = new URLSearchParams();
  if (f.q) p.set("q", f.q);
  if (f.location) p.set("location", f.location);
  if (f.mode) p.set("mode", f.mode);
  if (f.exp !== "") p.set("exp", f.exp);
  if (f.tags.length) p.set("tags", f.tags.join(","));
  return p;
}

/** Query string for `GET /api/jobs`: exp becomes expMin=expMax so the backend applies the overlap rule. */
export function toApiParams(f: FilterState, page = 0, size = 20): URLSearchParams {
  const p = new URLSearchParams();
  if (f.q) p.set("q", f.q);
  if (f.location) p.set("location", f.location);
  if (f.mode) p.set("workMode", f.mode);
  const exp = parseExp(f.exp);
  if (exp !== null) {
    p.set("expMin", String(exp));
    p.set("expMax", String(exp));
  }
  if (f.tags.length) p.set("tags", f.tags.join(","));
  p.set("page", String(page));
  p.set("size", String(size));
  return p;
}

export function hasFilters(f: FilterState): boolean {
  return !!(f.q || f.location || f.mode || f.exp !== "" || f.tags.length);
}
