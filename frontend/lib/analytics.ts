/**
 * Fire-and-forget analytics. Never throws, never awaits, never blocks rendering: events go into the
 * gtag dataLayer queue (a plain array push) and are processed later by the async gtag.js script.
 * If analytics is not configured (no G_ANALYTICS_TAG) the calls are cheap no-ops.
 */
type GtagParams = Record<string, string | number | boolean | undefined>;

declare global {
  interface Window {
    dataLayer?: unknown[];
    gtag?: (...args: unknown[]) => void;
  }
}

/** Sends a named event. Names are snake_case ids such as `home_filters_apply`. */
export function track(eventName: string, params: GtagParams = {}): void {
  try {
    if (typeof window === "undefined") return;
    // The inline bootstrap defines window.gtag; before it exists, queue in the dataLayer directly.
    if (typeof window.gtag === "function") {
      window.gtag("event", eventName, params);
    } else {
      (window.dataLayer ??= []).push(["event", eventName, params]);
    }
  } catch {
    // analytics must never break the app
  }
}
