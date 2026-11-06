"use client";

import { startTransition, useActionState } from "react";
import { createApiKeyAction, type ApiKeyState } from "@/app/admin/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

/** Creates a key and shows the plaintext exactly once. */
export function ApiKeyForm() {
  const [state, action, pending] = useActionState<ApiKeyState, FormData>(createApiKeyAction, {});
  return (
    <div className="flex flex-col gap-4">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          const form = e.currentTarget;
          const data = new FormData(form);
          startTransition(() => action(data));
          form.reset();
        }}
        className="flex flex-wrap items-end gap-2"
      >
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="name">Key name</Label>
          <Input id="name" name="name" placeholder="e.g. Zapier" maxLength={100} required className="h-11 w-64" aria-invalid={!!state.error} />
        </div>
        <Button data-track="admin_api_key_create_button" type="submit" size="lg" className="min-h-11" disabled={pending}>
          {pending ? "Creating…" : "Create API key"}
        </Button>
      </form>
      {state.error ? <p className="text-destructive text-sm">{state.error}</p> : null}
      {state.key ? (
        <div role="status" className="flex flex-col gap-2 rounded-lg border p-3">
          <p className="text-sm font-medium">Key “{state.name}” created. Copy it now: it will not be shown again.</p>
          <code className="bg-muted break-all rounded px-2 py-1.5 text-sm select-all">{state.key}</code>
        </div>
      ) : null}
    </div>
  );
}
