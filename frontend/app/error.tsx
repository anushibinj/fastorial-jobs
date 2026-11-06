"use client";

import { Button } from "@/components/ui/button";

export default function Error({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <main className="mx-auto flex w-full max-w-6xl flex-col items-center gap-3 px-4 py-16 text-center">
      <p className="text-muted-foreground">Something went wrong.</p>
      <Button data-track="error_try_again_button" size="lg" className="min-h-11" onClick={reset}>
        Try again
      </Button>
    </main>
  );
}
