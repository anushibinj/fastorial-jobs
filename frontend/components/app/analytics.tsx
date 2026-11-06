import Script from "next/script";
import { ClickTracker } from "@/components/app/click-tracker";

/**
 * Analytics, off unless configured.
 *  - Google Analytics: set G_ANALYTICS_TAG (e.g. G-XXXXXXXXXX), see apphosting.yaml. gtag.js loads
 *    with strategy "afterInteractive" + async, so it never blocks rendering or hydration. Page views
 *    for client side navigation are sent automatically by GA4 (history change detection).
 *  - Umami: NEXT_PUBLIC_UMAMI_SRC and NEXT_PUBLIC_UMAMI_WEBSITE_ID.
 *  - Plausible: NEXT_PUBLIC_PLAUSIBLE_DOMAIN (and optionally NEXT_PUBLIC_PLAUSIBLE_SRC).
 *
 * Every element with a `data-track="<unique_id>"` attribute is tracked on click by <ClickTracker/>.
 */
export function Analytics() {
  const gaId = process.env.G_ANALYTICS_TAG?.trim();
  const umamiSrc = process.env.NEXT_PUBLIC_UMAMI_SRC;
  const umamiId = process.env.NEXT_PUBLIC_UMAMI_WEBSITE_ID;
  const plausibleDomain = process.env.NEXT_PUBLIC_PLAUSIBLE_DOMAIN;

  return (
    <>
      <ClickTracker />
      {gaId && /^[A-Za-z0-9-]+$/.test(gaId) ? (
        <>
          <Script src={`https://www.googletagmanager.com/gtag/js?id=${gaId}`} strategy="afterInteractive" async />
          <Script id="ga-init" strategy="afterInteractive">
            {`window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments);}window.gtag=gtag;gtag('js',new Date());gtag('config','${gaId}');`}
          </Script>
        </>
      ) : null}
      {umamiSrc && umamiId ? (
        <Script src={umamiSrc} data-website-id={umamiId} strategy="afterInteractive" defer />
      ) : null}
      {plausibleDomain ? (
        <Script
          src={process.env.NEXT_PUBLIC_PLAUSIBLE_SRC ?? "https://plausible.io/js/script.js"}
          data-domain={plausibleDomain}
          strategy="afterInteractive"
          defer
        />
      ) : null}
    </>
  );
}
