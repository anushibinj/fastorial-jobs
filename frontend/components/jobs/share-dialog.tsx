"use client";

import { Share2 } from "lucide-react";
import dynamic from "next/dynamic";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { isClosed } from "@/lib/job-state";
import type { JobLike } from "@/lib/types";

// Drawer and Dialog code is only fetched when someone taps Share, which keeps the list page light.
const ShareSheet = dynamic(() => import("@/components/jobs/share-sheet"), { ssr: false });

type Props = {
  job: JobLike;
  /** Icon only (cards) or icon with label (detail page). */
  label?: boolean;
  className?: string;
};

/** One responsive share component: a bottom Drawer on phones, a Dialog from md. */
export function ShareDialog({ job, label = false, className }: Props) {
  const [open, setOpen] = useState(false);
  const [wanted, setWanted] = useState(false);
  const closed = isClosed(job);

  return (
    <>
      <Button
        type="button"
        variant="ghost"
        size={label ? "lg" : "icon-lg"}
        className={`relative z-10 min-h-11 ${label ? "px-4" : "min-w-11"} ${className ?? ""}`}
        aria-label="Share"
        disabled={closed}
        onClick={() => {
          setWanted(true);
          setOpen(true);
        }}
      >
        <Share2 />
        {label ? <span>Share</span> : null}
      </Button>
      {wanted ? <ShareSheet job={job} open={open} onOpenChange={setOpen} /> : null}
    </>
  );
}
