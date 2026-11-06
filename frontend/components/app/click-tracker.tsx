"use client";

import { useEffect } from "react";
import { track } from "@/lib/analytics";

/**
 * One passive, delegated click listener for the whole app. Any element (or ancestor of the clicked
 * element) carrying `data-track="<id>"` is reported as a `ui_click` event with `track_id` set to that
 * id, plus the page path. Extra context can be given via `data-track-label`. Costs nothing per element.
 */
export function ClickTracker() {
  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      const el = (e.target as Element | null)?.closest?.("[data-track]");
      const id = el?.getAttribute("data-track");
      if (!el || !id) return;
      track("ui_click", {
        track_id: id,
        track_label: el.getAttribute("data-track-label") ?? undefined,
        page_path: window.location.pathname,
      });
    };
    document.addEventListener("click", onClick, { passive: true, capture: true });
    return () => document.removeEventListener("click", onClick, { capture: true });
  }, []);
  return null;
}
