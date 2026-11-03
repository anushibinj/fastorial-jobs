"use client";

import { Link2, ListChecks, Share2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle } from "@/components/ui/drawer";
import { useCanNativeShare, useMediaQuery } from "@/hooks/use-media-query";
import { copyToClipboard, buildShareText } from "@/lib/share";
import { jobUrl } from "@/lib/site";
import type { JobLike } from "@/lib/types";

type Props = {
  job: JobLike;
  /** Icon only (cards) or icon with label (detail page). */
  label?: boolean;
  className?: string;
};

/** One responsive share component: a bottom Drawer on phones, a Dialog from md. */
export function ShareDialog({ job, label = false, className }: Props) {
  const [open, setOpen] = useState(false);
  const desktop = useMediaQuery("(min-width: 768px)");
  const closed = job.status === "CLOSED";

  const trigger = (
    <Button
      type="button"
      variant="ghost"
      size={label ? "lg" : "icon-lg"}
      className={`relative z-10 min-h-11 ${label ? "px-4" : "min-w-11"} ${className ?? ""}`}
      aria-label="Share"
      disabled={closed}
      onClick={() => setOpen(true)}
    >
      <Share2 />
      {label ? <span>Share</span> : null}
    </Button>
  );

  return (
    <>
      {trigger}
      {desktop ? (
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogContent className="sm:max-w-sm" aria-describedby={undefined}>
            <DialogHeader>
              <DialogTitle>Share</DialogTitle>
            </DialogHeader>
            <ShareActions job={job} onDone={() => setOpen(false)} />
          </DialogContent>
        </Dialog>
      ) : (
        <Drawer open={open} onOpenChange={setOpen}>
          <DrawerContent aria-describedby={undefined}>
            <DrawerHeader>
              <DrawerTitle>Share</DrawerTitle>
            </DrawerHeader>
            <div className="pb-safe px-4 pb-4">
              <ShareActions job={job} onDone={() => setOpen(false)} />
            </div>
          </DrawerContent>
        </Drawer>
      )}
    </>
  );
}

function ShareActions({ job, onDone }: { job: JobLike; onDone: () => void }) {
  const canNativeShare = useCanNativeShare();

  async function copy(text: string) {
    const ok = await copyToClipboard(text);
    if (ok) toast.success("Copied");
    else toast.error("Could not copy");
    onDone();
  }

  async function nativeShare() {
    try {
      await navigator.share({
        title: job.title ?? undefined,
        text: buildShareText(job),
        url: jobUrl(job.slug ?? ""),
      });
    } catch {
      // user dismissed the share sheet
    }
    onDone();
  }

  return (
    <div className="flex flex-col gap-2">
      <Button type="button" variant="outline" size="lg" className="min-h-11 justify-start" onClick={() => copy(jobUrl(job.slug ?? ""))}>
        <Link2 /> Copy link
      </Button>
      <Button type="button" variant="outline" size="lg" className="min-h-11 justify-start" onClick={() => copy(buildShareText(job))}>
        <ListChecks /> Copy text
      </Button>
      {canNativeShare ? (
        <Button type="button" variant="outline" size="lg" className="min-h-11 justify-start" onClick={nativeShare}>
          <Share2 /> Share…
        </Button>
      ) : null}
    </div>
  );
}
