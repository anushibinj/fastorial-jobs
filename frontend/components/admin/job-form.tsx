"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { RefreshCw, X } from "lucide-react";
import Link from "next/link";
import { useRef, useState, useTransition } from "react";
import { useForm, useFormContext, useWatch, type FieldPath } from "react-hook-form";
import { detectTagsAction, saveJobAction } from "@/app/admin/actions";
import { TagPicker, type TagOption } from "@/components/jobs/tag-picker";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import {
  emptyFormValues,
  formValuesToRequest,
  jobFormSchema,
  jobToFormValues,
  type JobFormValues,
} from "@/lib/admin/schema";
import type { JobDetail } from "@/lib/types";

type Name = FieldPath<JobFormValues>;

function TextField({ name, label, hint, className, ...input }: { name: Name; label: string; hint?: string; className?: string } & Omit<React.ComponentProps<typeof Input>, "name">) {
  const { control } = useFormContext<JobFormValues>();
  return (
    <FormField
      control={control}
      name={name}
      render={({ field }) => (
        <FormItem className={className}>
          <FormLabel>{label}</FormLabel>
          <FormControl>
            <Input className="h-11" {...input} {...field} value={String(field.value ?? "")} />
          </FormControl>
          {hint ? <FormDescription>{hint}</FormDescription> : null}
          <FormMessage />
        </FormItem>
      )}
    />
  );
}

function SelectField({ name, label, options, className }: { name: Name; label: string; options: { value: string; label: string }[]; className?: string }) {
  const { control } = useFormContext<JobFormValues>();
  return (
    <FormField
      control={control}
      name={name}
      render={({ field }) => (
        <FormItem className={className}>
          <FormLabel>{label}</FormLabel>
          <Select value={String(field.value)} onValueChange={field.onChange}>
            <FormControl>
              <SelectTrigger className="min-h-11 w-full">
                <SelectValue />
              </SelectTrigger>
            </FormControl>
            <SelectContent>
              {options.map((o) => (
                <SelectItem key={o.value} value={o.value}>
                  {o.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <FormMessage />
        </FormItem>
      )}
    />
  );
}

export function JobForm({ job, tags }: { job?: JobDetail; tags: TagOption[] }) {
  const form = useForm<JobFormValues>({
    resolver: zodResolver(jobFormSchema),
    defaultValues: job ? jobToFormValues(job) : emptyFormValues(),
  });
  const [serverError, setServerError] = useState<string | null>(null);
  const [saving, startSave] = useTransition();
  const [detecting, setDetecting] = useState(false);
  // tags that were added by detection (and not edited by hand since)
  const [detected, setDetected] = useState<Set<string>>(new Set());
  const dismissed = useRef<Set<string>>(new Set());
  const selected = useWatch({ control: form.control, name: "tags" });
  const nameOf = (slug: string) => tags.find((t) => t.slug === slug)?.name ?? slug;

  /** "auto" (paste, blur) only adds what is new. "redetect" rebuilds the detected set and keeps manual picks. */
  async function runDetect(mode: "auto" | "redetect") {
    const { title, description } = form.getValues();
    if (!title.trim() && !description.trim()) return;
    setDetecting(true);
    try {
      const found = (await detectTagsAction(title, description)).map((d) => d.slug as string);
      const current = form.getValues("tags");
      if (mode === "redetect") {
        dismissed.current.clear();
        const manual = current.filter((s) => !detected.has(s));
        const fresh = found.filter((s) => !manual.includes(s));
        form.setValue("tags", [...manual, ...fresh], { shouldDirty: true });
        setDetected(new Set(fresh));
      } else {
        const add = found.filter((s) => !current.includes(s) && !dismissed.current.has(s));
        if (add.length > 0) {
          form.setValue("tags", [...current, ...add], { shouldDirty: true });
          setDetected((prev) => new Set([...prev, ...add]));
        }
      }
    } catch {
      setServerError("Could not detect tags");
    } finally {
      setDetecting(false);
    }
  }

  function removeTag(slug: string) {
    if (detected.has(slug)) dismissed.current.add(slug);
    setDetected((prev) => {
      const next = new Set(prev);
      next.delete(slug);
      return next;
    });
    form.setValue("tags", form.getValues("tags").filter((s) => s !== slug), { shouldDirty: true });
  }

  function onPick(next: string[]) {
    const current = form.getValues("tags");
    current.filter((s) => !next.includes(s)).forEach(removeTag);
    const added = next.filter((s) => !current.includes(s));
    if (added.length) form.setValue("tags", [...form.getValues("tags"), ...added], { shouldDirty: true });
  }

  const onSubmit = form.handleSubmit((values) => {
    setServerError(null);
    startSave(async () => {
      const res = await saveJobAction(job?.id ? String(job.id) : null, formValuesToRequest(values));
      // on success the action redirects, so only errors get here
      if (res?.error) setServerError(res.error);
      for (const [field, message] of Object.entries(res?.fieldErrors ?? {})) {
        form.setError(field as Name, { message });
      }
    });
  });

  return (
    <Form {...form}>
      <form onSubmit={onSubmit} className="mx-auto flex w-full max-w-3xl flex-col gap-5 px-4 py-4" noValidate>
        {serverError ? (
          <p role="alert" className="border-destructive/40 bg-destructive/10 text-destructive rounded-lg border px-4 py-3 text-sm">
            {serverError}
          </p>
        ) : null}

        <TextField name="title" label="Title" maxLength={200} />
        <div className="grid gap-5 sm:grid-cols-2">
          <TextField name="companyName" label="Company" maxLength={150} />
          <TextField name="companyLogoUrl" label="Logo URL" type="url" />
        </div>
        <div className="grid gap-5 sm:grid-cols-[1fr_12rem]">
          <TextField name="applyUrl" label="Apply URL" type="url" />
          <SelectField
            name="source"
            label="Source"
            options={[
              { value: "LINKEDIN", label: "LinkedIn" },
              { value: "NAUKRI", label: "Naukri" },
              { value: "COMPANY_SITE", label: "Company site" },
              { value: "OTHER", label: "Other" },
            ]}
          />
        </div>

        <div className="grid gap-5 sm:grid-cols-3">
          <TextField name="locationCity" label="City" />
          <TextField name="locationState" label="State" />
          <TextField name="locationCountry" label="Country" />
        </div>
        <div className="grid gap-5 sm:grid-cols-3">
          <SelectField
            name="workMode"
            label="Work mode"
            options={[
              { value: "ONSITE", label: "Onsite" },
              { value: "HYBRID", label: "Hybrid" },
              { value: "REMOTE", label: "Remote" },
            ]}
          />
          <TextField name="experienceMinYears" label="Min experience (years)" inputMode="numeric" />
          <TextField name="experienceMaxYears" label="Max experience (years)" inputMode="numeric" placeholder="Open ended" />
        </div>

        <fieldset className="flex flex-col gap-3 rounded-lg border p-4">
          <legend className="px-1 text-sm font-medium">Salary (optional, shown publicly)</legend>
          <div className="grid gap-5 sm:grid-cols-4">
            <TextField name="salaryMin" label="Min" inputMode="numeric" />
            <TextField name="salaryMax" label="Max" inputMode="numeric" />
            <TextField name="salaryCurrency" label="Currency" maxLength={3} className="[&_input]:uppercase" />
            <SelectField
              name="salaryPeriod"
              label="Period"
              options={[
                { value: "YEARLY", label: "Yearly" },
                { value: "MONTHLY", label: "Monthly" },
              ]}
            />
          </div>
          <p className="text-muted-foreground text-xs">Full amounts, for example 2500000 for 25 LPA. Leave empty to hide.</p>
        </fieldset>

        <FormField
          control={form.control}
          name="description"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Description (markdown)</FormLabel>
              <FormControl>
                <Textarea
                  rows={10}
                  {...field}
                  onBlur={() => {
                    field.onBlur();
                    void runDetect("auto");
                  }}
                  onPaste={() => setTimeout(() => void runDetect("auto"), 0)}
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <div className="flex flex-col gap-2">
          <div className="flex items-end gap-2">
            <FormItem className="flex-1">
              <FormLabel htmlFor="tag-picker">Tech stack</FormLabel>
              <TagPicker id="tag-picker" options={tags} value={selected} onChange={onPick} placeholder="Add tag" />
            </FormItem>
            <Button type="button" variant="outline" size="lg" className="min-h-11" onClick={() => runDetect("redetect")} disabled={detecting}>
              <RefreshCw className={detecting ? "animate-spin" : ""} /> Re-detect
            </Button>
          </div>
          {selected.length > 0 ? (
            <ul className="flex flex-wrap gap-2" aria-label="Selected tags">
              {selected.map((slug) => (
                <li key={slug}>
                  <Badge variant={detected.has(slug) ? "default" : "secondary"} className="h-8 gap-1.5 pr-1 pl-3 text-sm">
                    {nameOf(slug)}
                    {detected.has(slug) ? <span className="text-[11px] font-normal opacity-80">detected</span> : null}
                    <button
                      type="button"
                      aria-label={`Remove ${nameOf(slug)}`}
                      className="relative grid size-6 place-items-center rounded-full after:absolute after:-inset-2.5 after:content-['']"
                      onClick={() => removeTag(slug)}
                    >
                      <X className="size-3.5" />
                    </button>
                  </Badge>
                </li>
              ))}
            </ul>
          ) : null}
          {form.formState.errors.tags?.message ? <p className="text-destructive text-sm">{form.formState.errors.tags.message}</p> : null}
        </div>

        <div className="grid gap-5 sm:grid-cols-3">
          <SelectField
            name="status"
            label="Status"
            options={[
              { value: "PUBLISHED", label: "Published" },
              { value: "DRAFT", label: "Draft" },
              { value: "CLOSED", label: "Closed" },
            ]}
          />
          <TextField name="postedAt" label="Posted (IST)" type="datetime-local" />
          <TextField name="expiresAt" label="Expires (IST)" type="datetime-local" hint="Empty: 30 days after posting" />
        </div>

        <div className="flex gap-2">
          <Button type="submit" size="lg" className="min-h-11 flex-1 sm:flex-none sm:px-8" disabled={saving}>
            {saving ? "Saving…" : job ? "Save" : "Create"}
          </Button>
          <Button asChild variant="outline" size="lg" className="min-h-11">
            <Link href="/admin/jobs">Cancel</Link>
          </Button>
        </div>
      </form>
    </Form>
  );
}
