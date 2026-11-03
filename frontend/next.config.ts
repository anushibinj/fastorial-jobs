import type { NextConfig } from "next";

/** Public pages are rendered dynamically and cached at the App Hosting CDN. */
const CDN_CACHE = "public, s-maxage=60, stale-while-revalidate=300";

const nextConfig: NextConfig = {
  output: "standalone",
  poweredByHeader: false,
  // the OG image reads its fonts from disk at request time, so make sure the standalone build ships them
  outputFileTracingIncludes: {
    "/jobs/[slug]/opengraph-image": ["./assets/fonts/**"],
    "/opengraph-image": ["./assets/fonts/**"],
  },
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
  async headers() {
    return [
      { source: "/", headers: [{ key: "Cache-Control", value: CDN_CACHE }] },
      { source: "/jobs/:slug", headers: [{ key: "Cache-Control", value: CDN_CACHE }] },
      { source: "/opengraph-image", headers: [{ key: "Cache-Control", value: CDN_CACHE }] },
      { source: "/sitemap.xml", headers: [{ key: "Cache-Control", value: "public, s-maxage=60, stale-while-revalidate=60" }] },
      {
        source: "/jobs/:slug/opengraph-image",
        headers: [{ key: "Cache-Control", value: CDN_CACHE }],
      },
      {
        source: "/admin/:path*",
        headers: [
          { key: "Cache-Control", value: "private, no-store" },
          { key: "X-Robots-Tag", value: "noindex, nofollow" },
        ],
      },
      {
        source: "/sw.js",
        headers: [
          { key: "Cache-Control", value: "no-cache, no-store, must-revalidate" },
          { key: "Service-Worker-Allowed", value: "/" },
        ],
      },
    ];
  },
};

export default nextConfig;
