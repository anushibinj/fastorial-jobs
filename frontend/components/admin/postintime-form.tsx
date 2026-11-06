"use client";

import { useState, useTransition } from "react";
import { savePostintimeSettingsAction, type PostintimeFormState } from "@/app/admin/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { PostintimeSettingsDto, PostStatus } from "@/lib/types";

const STATUS_OPTIONS: { value: PostStatus; label: string; hint: string }[] = [
  { value: "draft", label: "Draft", hint: "Waits in PostInTime until you review it" },
  { value: "ready", label: "Ready", hint: "Can be published right away" },
];

function Field({ id, label, hint, error, children }: { id: string; label: string; hint?: string; error?: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor={id}>{label}</Label>
      {children}
      {error ? (
        <p id={`${id}-error`} className="text-destructive text-sm">
          {error}
        </p>
      ) : hint ? (
        <p className="text-muted-foreground text-sm">{hint}</p>
      ) : null}
    </div>
  );
}

/**
 * The PostInTime connection: server URL, API token, channel and the status new posts get.
 * The stored token is never sent to the browser, so the field starts empty and a blank value keeps it.
 */
export function PostintimeForm({ settings }: { settings: PostintimeSettingsDto }) {
  const [enabled, setEnabled] = useState(settings.enabled);
  const [baseUrl, setBaseUrl] = useState(settings.baseUrl);
  const [apiToken, setApiToken] = useState("");
  const [channelId, setChannelId] = useState(settings.channelId);
  const [postStatus, setPostStatus] = useState<PostStatus>(settings.postStatus);
  const [postSuffix, setPostSuffix] = useState(settings.postSuffix);
  const [state, setState] = useState<PostintimeFormState>({});
  const [pending, startTransition] = useTransition();
  const fe = state.fieldErrors ?? {};
  const endpoint = baseUrl.trim() ? `${baseUrl.trim().replace(/\/+$/, "")}/api/v1/public/channels/${channelId.trim() || "{channelId}"}/posts` : "";

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        startTransition(async () => {
          const result = await savePostintimeSettingsAction({ enabled, baseUrl, apiToken, channelId, postStatus, postSuffix });
          setState(result);
          if (result.saved) setApiToken("");
        });
      }}
      className="flex flex-col gap-4"
    >
      <label className="flex min-h-11 items-center gap-3 text-sm font-medium">
        <input type="checkbox" checked={enabled} onChange={(e) => setEnabled(e.target.checked)} className="size-5 accent-current" />
        Push new jobs to PostInTime
      </label>

      <Field id="baseUrl" label="Server URL" error={fe.baseUrl} hint="Where the PostInTime API runs, e.g. https://api.postintime.example">
        <Input
          id="baseUrl" name="baseUrl" type="url" inputMode="url" autoComplete="off" placeholder="https://api.postintime.example"
          value={baseUrl} onChange={(e) => setBaseUrl(e.target.value)} maxLength={500} className="h-11" aria-invalid={!!fe.baseUrl}
        />
      </Field>

      <Field
        id="apiToken" label="API token" error={fe.apiToken}
        hint={settings.hasToken ? "A token is saved. Leave this empty to keep it, or paste a new one to replace it." : "A personal token (pit_…) from PostInTime, under Settings."}
      >
        <Input
          id="apiToken" name="apiToken" type="password" autoComplete="new-password" placeholder={settings.hasToken ? "••••••••  (saved)" : "pit_…"}
          value={apiToken} onChange={(e) => setApiToken(e.target.value)} maxLength={200} className="h-11" aria-invalid={!!fe.apiToken}
        />
      </Field>

      <Field id="channelId" label="Channel ID" error={fe.channelId} hint="The channel that receives the posts. List yours with GET /api/v1/public/channels.">
        <Input
          id="channelId" name="channelId" autoComplete="off" spellCheck={false} placeholder="3f2b8a52-6c1e-4f7e-9a53-0b6f7c1d2e44"
          value={channelId} onChange={(e) => setChannelId(e.target.value)} maxLength={64} className="h-11 font-mono" aria-invalid={!!fe.channelId}
        />
      </Field>

      <Field id="postStatus" label="Post status" hint={STATUS_OPTIONS.find((o) => o.value === postStatus)?.hint}>
        <Select value={postStatus} onValueChange={(v) => setPostStatus(v as PostStatus)}>
          <SelectTrigger id="postStatus" className="min-h-11 w-full sm:w-64">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {STATUS_OPTIONS.map((o) => (
              <SelectItem key={o.value} value={o.value}>
                {o.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </Field>

      <Field id="postSuffix" label="Post suffix" error={fe.postSuffix} hint="Added at the end of every post caption, e.g. hashtags or a footer. Line breaks are kept.">
        <Textarea
          id="postSuffix" name="postSuffix" rows={4} placeholder={"#jobs #hiring\nFollow us for more openings"}
          value={postSuffix} onChange={(e) => setPostSuffix(e.target.value)} maxLength={2000} aria-invalid={!!fe.postSuffix}
        />
      </Field>

      {endpoint ? (
        <p className="text-muted-foreground text-sm">
          Posts are sent to <code className="break-all">{endpoint}</code>
        </p>
      ) : null}

      <div className="flex flex-wrap items-center gap-3">
        <Button data-track="admin_postintime_settings_save_button" type="submit" size="lg" className="min-h-11" disabled={pending}>
          {pending ? "Saving…" : "Save"}
        </Button>
        {state.saved ? (
          <p role="status" className="text-sm">
            Saved.
          </p>
        ) : null}
        {state.error ? (
          <p role="alert" className="text-destructive text-sm">
            {state.error}
          </p>
        ) : null}
      </div>
    </form>
  );
}
