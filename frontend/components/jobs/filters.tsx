"use client";

import { Search, SlidersHorizontal, X } from "lucide-react";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";
import { TagPicker } from "@/components/jobs/tag-picker";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Sheet, SheetContent, SheetFooter, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { track } from "@/lib/analytics";
import { EMPTY_FILTERS, toSearchParams, type FilterState } from "@/lib/filters";
import { WorkModeLabel } from "@/components/jobs/work-mode";
import type { FiltersResponse, WorkMode } from "@/lib/types";

const ANY = "__any__";

type Facets = FiltersResponse | null;

function useNavigate() {
  const router = useRouter();
  const pathname = usePathname();
  const [pending, start] = useTransition();
  const go = (next: FilterState) => {
    const qs = toSearchParams(next).toString();
    start(() => router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false }));
  };
  return { go, pending };
}

/** The whole filter UI. Phone: search + Filters sheet. md: inline row. lg: left sidebar. */
export function Filters({ value, facets }: { value: FilterState; facets: Facets }) {
  const { go, pending } = useNavigate();
  const [sheetOpen, setSheetOpen] = useState(false);
  const [draft, setDraft] = useState(value);
  const activeCount = [value.location, value.mode, value.exp, value.tags.length ? "t" : ""].filter((v) => v !== "").length;

  return (
    <div className="contents" aria-busy={pending}>
      {/* pinned under the header (h-14) on every breakpoint; wrapper is display:contents so it sticks across the whole page */}
      <div className="bg-background sticky top-14 z-30 -mx-4 flex gap-2 px-4 py-2 lg:col-start-2 lg:mx-0 lg:px-0">
        <SearchBox value={value.q} onCommit={(q) => go({ ...value, q })} />
        {/* phone only */}
        <Sheet
          open={sheetOpen}
          onOpenChange={(o) => {
            if (o) setDraft(value);
            track(o ? "filters_sheet_open" : "filters_sheet_dismiss");
            setSheetOpen(o);
          }}
        >
          <SheetTrigger asChild>
            <Button variant="outline" className="relative min-h-11 min-w-11 px-3 md:hidden" aria-label="Filters" data-track="home_filters_open_button">
              <SlidersHorizontal />
              {activeCount > 0 ? (
                <span className="bg-primary text-primary-foreground absolute -top-1.5 -right-1.5 grid size-5 place-items-center rounded-full text-[11px]">
                  {activeCount}
                </span>
              ) : null}
            </Button>
          </SheetTrigger>
          <SheetContent side="bottom" className="pb-safe max-h-[90dvh] overflow-y-auto rounded-t-xl" aria-describedby={undefined}>
            <SheetHeader>
              <SheetTitle>Filters</SheetTitle>
            </SheetHeader>
            <div className="px-4">
              <FilterFields value={draft} facets={facets} onChange={(patch) => setDraft((d) => ({ ...d, ...patch }))} idPrefix="sheet" />
            </div>
            <SheetFooter className="flex-row gap-2">
              <Button
                variant="outline"
                size="lg"
                className="min-h-11 flex-1"
                data-track="home_filters_clear_button"
                onClick={() => {
                  go({ ...EMPTY_FILTERS, q: value.q });
                  setSheetOpen(false);
                }}
              >
                Clear
              </Button>
              <Button
                size="lg"
                className="min-h-11 flex-1"
                data-track="home_filters_apply_button"
                onClick={() => {
                  go({ ...value, ...draft, q: value.q });
                  setSheetOpen(false);
                }}
              >
                Apply
              </Button>
            </SheetFooter>
          </SheetContent>
        </Sheet>
      </div>

      {/* md: inline row above the list. lg: sidebar (lg:contents on the wrapper lets the grid place this) */}
      <div className="hidden md:block lg:sticky lg:top-[4.5rem] lg:col-start-1 lg:row-span-3 lg:row-start-1 lg:max-h-[calc(100dvh-5.5rem)] lg:overflow-y-auto lg:pr-1">
        <FilterFields value={value} facets={facets} onChange={(patch) => go({ ...value, ...patch })} idPrefix="inline" inline />
      </div>

      <ActiveFilters value={value} facets={facets} onChange={go} />
    </div>
  );
}

function SearchBox({ value, onCommit }: { value: string; onCommit: (q: string) => void }) {
  const [text, setText] = useState(value);
  const [prev, setPrev] = useState(value);
  const last = useRef(value);

  // follow the URL when it changes elsewhere (chip removed, cleared)
  if (value !== prev) {
    setPrev(value);
    setText(value);
  }
  useEffect(() => {
    last.current = value;
  }, [value]);

  useEffect(() => {
    if (text.trim() === last.current) return;
    const t = setTimeout(() => {
      last.current = text.trim();
      track("home_search_typed", { query_length: text.trim().length });
      onCommit(text.trim());
    }, 450);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [text]);

  return (
    <form
      role="search"
      className="relative flex-1"
      onSubmit={(e) => {
        e.preventDefault();
        last.current = text.trim();
        track("home_search_submit", { query_length: text.trim().length });
        onCommit(text.trim());
      }}
    >
      <Search className="text-muted-foreground pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2" />
      <Input
        type="search"
        name="q"
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder="Search jobs"
        aria-label="Search jobs"
        enterKeyHint="search"
        className="h-11 pl-9"
      />
    </form>
  );
}

type Patch = Partial<Pick<FilterState, "location" | "mode" | "exp" | "tags">>;

function FilterFields({
  value,
  facets,
  onChange,
  idPrefix,
  inline = false,
}: {
  value: FilterState;
  facets: Facets;
  onChange: (patch: Patch) => void;
  idPrefix: string;
  inline?: boolean;
}) {
  const locations = facets?.locations ?? [];
  const modes = facets?.workModes ?? [];
  const tags = (facets?.tags ?? []).map((t) => ({ slug: t.slug ?? "", name: t.name ?? "", count: t.count }));
  // keep a selected location in the list even if it has no jobs now
  const locationNames = locations.map((l) => l.city ?? "");
  if (value.location && !locationNames.includes(value.location)) locationNames.unshift(value.location);

  return (
    <div className={inline ? "flex flex-col gap-4 md:flex-row md:flex-wrap md:items-end lg:flex-col lg:items-stretch" : "flex flex-col gap-4"}>
      <Field label="Location" id={`${idPrefix}-location`} inline={inline}>
        <Select value={value.location || ANY} onValueChange={(v) => {
          track("home_filter_location_select", { value: v === ANY ? "any" : v });
          onChange({ location: v === ANY ? "" : v });
        }}>
          <SelectTrigger id={`${idPrefix}-location`} className="min-h-11 w-full">
            <SelectValue placeholder="Any" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ANY}>Any</SelectItem>
            {locationNames.map((c) => (
              <SelectItem key={c} value={c}>
                {c}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </Field>

      <Field label="Work mode" id={`${idPrefix}-mode`} inline={inline}>
        <Select value={value.mode || ANY} onValueChange={(v) => {
          track("home_filter_work_mode_select", { value: v === ANY ? "any" : v });
          onChange({ mode: v === ANY ? "" : v });
        }}>
          <SelectTrigger id={`${idPrefix}-mode`} className="min-h-11 w-full">
            <SelectValue placeholder="Any" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ANY}>Any</SelectItem>
            {(["ONSITE", "HYBRID", "REMOTE"] as WorkMode[])
              .filter((m) => modes.length === 0 || modes.some((x) => x.workMode === m) || value.mode === m)
              .map((m) => (
                <SelectItem key={m} value={m}>
                  <WorkModeLabel mode={m} />
                </SelectItem>
              ))}
          </SelectContent>
        </Select>
      </Field>

      <Field label="My experience (years)" id={`${idPrefix}-exp`} inline={inline}>
        <ExperienceInput id={`${idPrefix}-exp`} value={value.exp} onCommit={(exp) => {
          track("home_filter_experience_set", { value: exp === "" ? "any" : exp });
          onChange({ exp });
        }} />
      </Field>

      <Field label="Tech stack" id={`${idPrefix}-tags`} inline={inline}>
        <TagPicker id={`${idPrefix}-tags`} options={tags} value={value.tags} onChange={(t) => {
          track("home_filter_tags_change", { count: t.length });
          onChange({ tags: t });
        }} />
      </Field>
    </div>
  );
}

function Field({ label, id, inline, children }: { label: string; id: string; inline: boolean; children: React.ReactNode }) {
  return (
    <div className={inline ? "flex flex-col gap-1.5 md:w-44 lg:w-full" : "flex flex-col gap-1.5"}>
      <Label htmlFor={id}>{label}</Label>
      {children}
    </div>
  );
}

function ExperienceInput({ id, value, onCommit }: { id: string; value: string; onCommit: (v: string) => void }) {
  const [text, setText] = useState(value);
  const [prev, setPrev] = useState(value);
  if (value !== prev) {
    setPrev(value);
    setText(value);
  }

  const commit = (v: string) => {
    const cleaned = v.trim();
    if (cleaned === value) return;
    onCommit(cleaned === "" ? "" : String(Math.min(30, Math.max(0, Math.trunc(Number(cleaned))))));
  };

  useEffect(() => {
    if (text === value) return;
    const t = setTimeout(() => commit(text), 600);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [text]);

  return (
    <div className="relative">
      <Input
        id={id}
        type="number"
        inputMode="numeric"
        min={0}
        max={30}
        step={1}
        value={text}
        placeholder="e.g. 7"
        className="h-11 pr-10 [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
        onChange={(e) => setText(e.target.value)}
        onBlur={() => commit(text)}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            commit(text);
          }
        }}
      />
      {text !== "" ? (
        <button
          type="button"
          aria-label="Clear experience"
          data-track="home_filter_experience_clear_button"
          className="text-muted-foreground absolute top-1/2 right-0 grid size-11 -translate-y-1/2 place-items-center"
          onClick={() => {
            setText("");
            onCommit("");
          }}
        >
          <X className="size-4" />
        </button>
      ) : null}
    </div>
  );
}

function ActiveFilters({ value, facets, onChange }: { value: FilterState; facets: Facets; onChange: (f: FilterState) => void }) {
  const chips: { key: string; label: React.ReactNode; remove: () => void }[] = [];
  if (value.q) chips.push({ key: "q", label: `“${value.q}”`, remove: () => onChange({ ...value, q: "" }) });
  if (value.location) chips.push({ key: "location", label: value.location, remove: () => onChange({ ...value, location: "" }) });
  if (value.mode) chips.push({ key: "mode", label: <WorkModeLabel mode={value.mode as WorkMode} />, remove: () => onChange({ ...value, mode: "" }) });
  if (value.exp !== "") chips.push({ key: "exp", label: `${value.exp} yrs`, remove: () => onChange({ ...value, exp: "" }) });
  const names = new Map((facets?.tags ?? []).map((t) => [t.slug, t.name]));
  for (const slug of value.tags) {
    chips.push({
      key: `tag-${slug}`,
      label: names.get(slug) ?? slug,
      remove: () => onChange({ ...value, tags: value.tags.filter((s) => s !== slug) }),
    });
  }
  if (chips.length === 0) return null;
  return (
    <ul className="scrollbar-none -mx-4 flex gap-2 overflow-x-auto px-4 lg:col-start-2 lg:mx-0 lg:px-0" aria-label="Active filters">
      {chips.map((c) => (
        <li key={c.key} className="shrink-0">
          <Badge variant="secondary" className="h-8 gap-1 pr-1 pl-3 text-sm">
            {c.label}
            <button
              type="button"
              onClick={c.remove}
              data-track="home_active_filter_remove_chip"
              data-track-label={c.key.startsWith("tag-") ? "tag" : c.key}
              aria-label={`Remove ${c.label}`}
              className="relative grid size-6 place-items-center rounded-full after:absolute after:-inset-2.5 after:content-['']"
            >
              <X className="size-3.5" />
            </button>
          </Badge>
        </li>
      ))}
    </ul>
  );
}
