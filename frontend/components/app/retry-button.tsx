"use client";

import { Button } from "@/components/ui/button";

export function RetryButton() {
  return (
    <Button size="lg" className="min-h-11" onClick={() => window.location.reload()}>
      Retry
    </Button>
  );
}
