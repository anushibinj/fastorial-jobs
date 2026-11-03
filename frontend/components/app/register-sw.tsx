"use client";

import { useEffect } from "react";

/** Registers the service worker in production builds only. */
export function RegisterServiceWorker() {
  useEffect(() => {
    if (process.env.NODE_ENV !== "production" || !("serviceWorker" in navigator)) return;
    navigator.serviceWorker.register("/sw.js", { scope: "/" }).catch(() => {
      // offline support is a nicety, never break the page for it
    });
  }, []);
  return null;
}
