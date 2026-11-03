"use client";

import { Sparkles } from "lucide-react";
import Link from "next/link";
import { startTransition, useActionState, useRef, useState, useTransition } from "react";
import { detectTagsAction, saveJobAction, type FormState } from "@/app/admin/actions";
import { TagPicker, type TagOption } from "@/components/jobs/tag-picker";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { toLocalInput } from "@/lib/admin/dates";
import type { DetectedTag, JobDetail } from "@/lib/types";

function Field({ label, name, error, children, className }: { label: string; name: string; error?: string; children: React.ReactNode; className?: string }) {
  return (
    <div className={`flex flex-col gap-1.5 ${className ?? ""}`}>
      <Label htmlFor={name}>{label}</Label>
      {children}
      {error ? <p className="text-destructive text-sm">{error}</p> : null}
    </div>
  );
}

function Pick({ name, label, value, options, error }: { name: string; label: string; value: string; options: { value: string; label: string }[]; error?: string }) {
  return (
    <Field label={label} name={name} error={error}>
      <Select name={name} defaultValue={value}>
        <SelectTrigger id={name} className="min-h-11 w-full" aria-invalid={!!error}>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {options.map((o) => (
            <SelectItem key={o.value} value={o.value}>
              {o.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </Field>
  );
}

export function JobForm({ job, tags }: { job?: JobDetail; tags: TagOption[] }) {
  const [state, action, pending] = useActionState<FormState, FormData>(saveJobAction, {});
  const fe = state.fieldErrors ?? {};
  const [selected, setSelected] = useState<string[]>(job?.tags?.map((t) => t.slug as string) ?? []);
  const [detected, setDetected] = useState<DetectedTag[] | null>(null);
  const [detecting, startDetect] = useTransition();
  const titleRef = useRef<HTMLInputElement>(null);
  const descRef = useRef<HTMLTextAreaElement>(null);

  function detect() {
    startDetect(async () => {
      setDetected(await detectTagsAction(titleRef.current?.value ?? "", descRef.current?.value ?? ""));
    });
  }

  const add = (slug: string) => setSelected((s) => (s.includes(slug) ? s : [...s, slug]));
  const addAll = () => detected?.forEach((d) => add(d.slug as string));

  // onSubmit instead of action={...}: React resets an action form after it runs,
  // which would wipe the fields on a validation error.
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        const data = new FormData(e.currentTarget);
        startTransition(() => action(data));
      }}
      className="mx-auto flex w-full max-w-3xl flex-col gap-5 px-4 py-4"
    >
      {job ? <input type="hidden" name="id" value={job.id} /> : null}
      {state.error ? (
        <p role="alert" className="border-destructive/40 bg-destructive/10 text-destructive rounded-lg border px-4 py-3 text-sm">
          {state.error}
        </p>
      ) : null}

      <Field label="Title" name="title" error={fe.title}>
        <Input id="title" name="title" ref={titleRef} defaultValue={job?.title} required maxLength={200} className="h-11" aria-invalid={!!fe.title} />
      </Field>
      <div className="grid gap-5 sm:grid-cols-2">
        <Field label="Company" name="companyName" error={fe.companyName}>
          <Input id="companyName" name="companyName" defaultValue={job?.companyName} required maxLength={150} className="h-11" aria-invalid={!!fe.companyName} />
        </Field>
        <Field label="Logo URL" name="companyLogoUrl" error={fe.companyLogoUrl}>
          <Input id="companyLogoUrl" name="companyLogoUrl" type="url" defaultValue={job?.companyLogoUrl} className="h-11" />
        </Field>
      </div>
      <div className="grid gap-5 sm:grid-cols-[1fr_12rem]">
        <Field label="Apply URL" name="applyUrl" error={fe.applyUrl}>
          <Input id="applyUrl" name="applyUrl" type="url" defaultValue={job?.applyUrl} required className="h-11" aria-invalid={!!fe.applyUrl} />
        </Field>
        <Pick
          name="source"
          label="Source"
          value={job?.source ?? "LINKEDIN"}
          options={[
            { value: "LINKEDIN", label: "LinkedIn" },
            { value: "NAUKRI", label: "Naukri" },
            { value: "COMPANY_SITE", label: "Company site" },
            { value: "OTHER", label: "Other" },
          ]}
        />
      </div>

      <div className="grid gap-5 sm:grid-cols-3">
        <Field label="City" name="locationCity" error={fe.locationCity}>
          <Input id="locationCity" name="locationCity" defaultValue={job?.locationCity} className="h-11" />
        </Field>
        <Field label="State" name="locationState" error={fe.locationState}>
          <Input id="locationState" name="locationState" defaultValue={job?.locationState} className="h-11" />
        </Field>
        <Field label="Country" name="locationCountry" error={fe.locationCountry}>
          <Input id="locationCountry" name="locationCountry" defaultValue={job?.locationCountry ?? "India"} className="h-11" />
        </Field>
      </div>
      <div className="grid gap-5 sm:grid-cols-3">
        <Pick
          name="workMode"
          label="Work mode"
          value={job?.workMode ?? "HYBRID"}
          options={[
            { value: "ONSITE", label: "Onsite" },
            { value: "HYBRID", label: "Hybrid" },
            { value: "REMOTE", label: "Remote" },
          ]}
        />
        <Field label="Min experience (years)" name="experienceMinYears" error={fe.experienceMinYears}>
          <Input id="experienceMinYears" name="experienceMinYears" type="number" min={0} max={60} defaultValue={job?.experienceMinYears ?? 0} required className="h-11" aria-invalid={!!fe.experienceMinYears} />
        </Field>
        <Field label="Max experience (years)" name="experienceMaxYears" error={fe.experienceMaxYears}>
          <Input id="experienceMaxYears" name="experienceMaxYears" type="number" min={0} max={60} defaultValue={job?.experienceMaxYears ?? ""} placeholder="Open ended" className="h-11" aria-invalid={!!fe.experienceMaxYears} />
        </Field>
      </div>

      <div className="grid gap-5 sm:grid-cols-4">
        <Field label="Salary min" name="salaryMin" error={fe.salaryMin}>
          <Input id="salaryMin" name="salaryMin" type="number" min={0} defaultValue={job?.salaryMin ?? ""} className="h-11" aria-invalid={!!fe.salaryMin} />
        </Field>
        <Field label="Salary max" name="salaryMax" error={fe.salaryMax}>
          <Input id="salaryMax" name="salaryMax" type="number" min={0} defaultValue={job?.salaryMax ?? ""} className="h-11" aria-invalid={!!fe.salaryMax} />
        </Field>
        <Field label="Currency" name="salaryCurrency" error={fe.salaryCurrency}>
          <Input id="salaryCurrency" name="salaryCurrency" maxLength={3} defaultValue={job?.salaryCurrency ?? "INR"} className="h-11 uppercase" aria-invalid={!!fe.salaryCurrency} />
        </Field>
        <Pick
          name="salaryPeriod"
          label="Period"
          value={job?.salaryPeriod ?? "YEARLY"}
          error={fe.salaryPeriod}
          options={[
            { value: "YEARLY", label: "Yearly" },
            { value: "MONTHLY", label: "Monthly" },
          ]}
        />
      </div>

      <Field label="Description (markdown)" name="description" error={fe.description}>
        <Textarea id="description" name="description" ref={descRef} defaultValue={job?.description} rows={10} />
      </Field>

      <div className="flex flex-col gap-2">
        <div className="flex items-end justify-between gap-2">
          <Field label="Tech stack" name="tags-picker" error={fe.tags} className="flex-1">
            <TagPicker id="tags-picker" options={tags} value={selected} onChange={setSelected} placeholder="Select tags" />
          </Field>
          <Button type="button" variant="outline" size="lg" className="min-h-11" onClick={detect} disabled={detecting}>
            <Sparkles /> {detecting ? "Detecting…" : "Detect"}
          </Button>
        </div>
        {selected.map((slug) => (
          <input key={slug} type="hidden" name="tags" value={slug} />
        ))}
        {selected.length > 0 ? (
          <ul className="flex flex-wrap gap-1.5">
            {selected.map((slug) => (
              <li key={slug}>
                <Badge variant="secondary" className="h-7 gap-1 pr-1">
                  {tags.find((t) => t.slug === slug)?.name ?? slug}
                  <button type="button" aria-label={`Remove ${slug}`} className="grid size-5 place-items-center rounded-full" onClick={() => setSelected((s) => s.filter((x) => x !== slug))}>
                    ×
                  </button>
                </Badge>
              </li>
            ))}
          </ul>
        ) : null}
        {detected ? (
          detected.length === 0 ? (
            <p className="text-muted-foreground text-sm">No tags found.</p>
          ) : (
            <div className="flex flex-col gap-2 rounded-lg border p-3">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium">Suggested</span>
                <Button type="button" variant="ghost" size="sm" onClick={addAll}>
                  Add all
                </Button>
              </div>
              <ul className="flex flex-col gap-1">
                {detected.map((d) => (
                  <li key={d.slug} className="flex items-center justify-between gap-2 text-sm">
                    <span>
                      <span className="font-medium">{d.name}</span>{" "}
                      <span className="text-muted-foreground">
                        {d.count}× · {d.matches?.map((m) => m.text).join(", ")}
                        {d.titleCount ? " · in title" : ""}
                      </span>
                    </span>
                    <Button type="button" variant="outline" size="sm" className="min-h-9" disabled={selected.includes(d.slug as string)} onClick={() => add(d.slug as string)}>
                      {selected.includes(d.slug as string) ? "Added" : "Add"}
                    </Button>
                  </li>
                ))}
              </ul>
            </div>
          )
        ) : null}
      </div>

      <div className="grid gap-5 sm:grid-cols-3">
        <Pick
          name="status"
          label="Status"
          value={job?.status ?? "PUBLISHED"}
          options={[
            { value: "PUBLISHED", label: "Published" },
            { value: "DRAFT", label: "Draft" },
            { value: "CLOSED", label: "Closed" },
          ]}
        />
        <Field label="Posted (IST)" name="postedAt" error={fe.postedAt}>
          <Input id="postedAt" name="postedAt" type="datetime-local" defaultValue={toLocalInput(job?.postedAt)} className="h-11" />
        </Field>
        <Field label="Expires (IST)" name="expiresAt" error={fe.expiresAt}>
          <Input id="expiresAt" name="expiresAt" type="datetime-local" defaultValue={toLocalInput(job?.expiresAt)} className="h-11" aria-invalid={!!fe.expiresAt} />
        </Field>
      </div>

      <div className="flex gap-2">
        <Button type="submit" size="lg" className="min-h-11 flex-1 sm:flex-none sm:px-8" disabled={pending}>
          {pending ? "Saving…" : job ? "Save" : "Create"}
        </Button>
        <Button asChild variant="outline" size="lg" className="min-h-11">
          <Link href="/admin">Cancel</Link>
        </Button>
      </div>
    </form>
  );
}
