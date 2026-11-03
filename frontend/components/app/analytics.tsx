import Script from "next/script";

/**
 * Privacy friendly analytics, off unless configured. Umami: set NEXT_PUBLIC_UMAMI_SRC and
 * NEXT_PUBLIC_UMAMI_WEBSITE_ID. Plausible: set NEXT_PUBLIC_PLAUSIBLE_DOMAIN (and optionally
 * NEXT_PUBLIC_PLAUSIBLE_SRC for self hosting).
 */
export function Analytics() {
  const umamiSrc = process.env.NEXT_PUBLIC_UMAMI_SRC;
  const umamiId = process.env.NEXT_PUBLIC_UMAMI_WEBSITE_ID;
  const plausibleDomain = process.env.NEXT_PUBLIC_PLAUSIBLE_DOMAIN;

  if (umamiSrc && umamiId) {
    return <Script src={umamiSrc} data-website-id={umamiId} strategy="afterInteractive" defer />;
  }
  if (plausibleDomain) {
    return (
      <Script
        src={process.env.NEXT_PUBLIC_PLAUSIBLE_SRC ?? "https://plausible.io/js/script.js"}
        data-domain={plausibleDomain}
        strategy="afterInteractive"
        defer
      />
    );
  }
  return null;
}
