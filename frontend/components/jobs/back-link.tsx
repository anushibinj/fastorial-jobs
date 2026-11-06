"use client";

import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";

/** Goes back to the filtered list when the user came from it, otherwise to the home page. */
export function BackLink() {
  const router = useRouter();
  return (
    <Link
      href="/"
      className="text-muted-foreground hover:text-foreground -ml-2 inline-flex min-h-11 items-center gap-1 rounded-md px-2 text-sm"
      onClick={(e) => {
        const sameSite = document.referrer && new URL(document.referrer).origin === window.location.origin;
        if (sameSite && window.history.length > 1) {
          e.preventDefault();
          router.back();
        }
      }}
    >
      <ArrowLeft className="size-4" /> Back to all jobs
    </Link>
  );
}
