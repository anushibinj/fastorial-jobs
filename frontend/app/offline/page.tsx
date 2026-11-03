import type { Metadata } from "next";
import { RetryButton } from "@/components/app/retry-button";

export const metadata: Metadata = { title: "Offline", robots: { index: false } };

export default function OfflinePage() {
  return (
    <main className="mx-auto flex w-full max-w-6xl flex-col items-center gap-3 px-4 py-16 text-center">
      <p className="text-muted-foreground">You are offline.</p>
      <RetryButton />
    </main>
  );
}
