import type { Metadata } from "next";

export const metadata: Metadata = { title: "Offline", robots: { index: false } };

export default function OfflinePage() {
  return (
    <main className="mx-auto flex w-full max-w-6xl flex-col items-center gap-2 px-4 py-16 text-center">
      <p className="text-lg font-medium">You are offline</p>
      <p className="text-muted-foreground">Check your connection and try again.</p>
    </main>
  );
}
