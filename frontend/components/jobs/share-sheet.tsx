"use client";

import { Link2, ListChecks, Share2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle } from "@/components/ui/drawer";
import { useCanNativeShare, useMediaQuery } from "@/hooks/use-media-query";
import { copyToClipboard, buildShareText } from "@/lib/share";
import { jobUrl } from "@/lib/site";
import type { JobLike } from "@/lib/types";

/** The share Drawer (phones) or Dialog (md and up). Loaded on demand, see share-dialog.tsx. */
export default function ShareSheet({ job, open, onOpenChange }: { job: JobLike; open: boolean; onOpenChange: (open: boolean) => void }) {
  const desktop = useMediaQuery("(min-width: 768px)");
  const done = () => onOpenChange(false);
  return desktop ? (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-sm" aria-describedby={undefined}>
        <DialogHeader>
          <DialogTitle>Share</DialogTitle>
        </DialogHeader>
        <ShareActions job={job} onDone={done} />
      </DialogContent>
    </Dialog>
  ) : (
    <Drawer open={open} onOpenChange={onOpenChange}>
      <DrawerContent aria-describedby={undefined}>
        <DrawerHeader>
          <DrawerTitle>Share</DrawerTitle>
        </DrawerHeader>
        <div className="pb-safe px-4 pb-4">
          <ShareActions job={job} onDone={done} />
        </div>
      </DrawerContent>
    </Drawer>
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
      <Button type="button" variant="outline" size="lg" className="min-h-11 justify-start" data-track="job_share_copy_link_button" onClick={() => copy(jobUrl(job.slug ?? ""))}>
        <Link2 /> Copy link
      </Button>
      <Button type="button" variant="outline" size="lg" className="min-h-11 justify-start" data-track="job_share_copy_text_button" onClick={() => copy(buildShareText(job))}>
        <ListChecks /> Copy text
      </Button>
      {canNativeShare ? (
        <Button type="button" variant="outline" size="lg" className="min-h-11 justify-start" data-track="job_share_native_button" onClick={nativeShare}>
          <Share2 /> Share…
        </Button>
      ) : null}
    </div>
  );
}
