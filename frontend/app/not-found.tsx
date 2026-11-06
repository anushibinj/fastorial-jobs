import Link from "next/link";

export default function NotFound() {
  return (
    <main className="mx-auto flex w-full max-w-6xl flex-col items-center gap-3 px-4 py-16 text-center">
      <p className="text-muted-foreground">Page not found.</p>
      <Link href="/" data-track="not_found_all_jobs_link" className="min-h-11 content-center underline underline-offset-4">
        All jobs
      </Link>
    </main>
  );
}
