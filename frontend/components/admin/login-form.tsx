"use client";

import { useActionState } from "react";
import { loginAction, type FormState } from "@/app/admin/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function LoginForm() {
  const [state, action, pending] = useActionState<FormState, FormData>(loginAction, {});
  return (
    <form action={action} className="flex w-full max-w-sm flex-col gap-4">
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="token">Admin token</Label>
        <Input id="token" name="token" type="password" autoComplete="current-password" required className="h-11" aria-invalid={!!state.error} />
        {state.error ? <p className="text-destructive text-sm">{state.error}</p> : null}
      </div>
      <Button type="submit" size="lg" className="min-h-11" disabled={pending}>
        {pending ? "Signing in…" : "Sign in"}
      </Button>
    </form>
  );
}
