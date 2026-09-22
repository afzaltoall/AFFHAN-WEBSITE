import type { NextConfig } from "next";

/**
 * The old affhan.com, pointed at what replaced it.
 *
 * The previous site was a separate codebase that was never in this repository
 * — git has no record of any of these paths — so the list was recovered from
 * the Internet Archive's CDX index for affhan.com. Twenty-four .html pages
 * were captured as HTTP 200 (twenty-three in a 2022-05-27 crawl, plus
 * sourcing-agent.html in 2025); all twenty-four return 404 today, and nothing
 * on the current site links to any of them. So these redirects do nothing for
 * internal navigation. They exist to keep whatever external links and
 * remaining index entries those pages earned, and to clear the 404 report.
 *
 * Fourteen of them land on /shipping/. That is heavy consolidation, but it is
 * the page that actually covers the subject: sea, air, rail and road freight,
 * customs clearance, door-to-door and warehousing are all on it, so none of
 * these is a redirect to a page about something else.
 *
 * TWO ARE DELIBERATELY ABSENT. /drop-shipping.html and /financing-service.html
 * have no successor: this is an inquiry-only B2B sourcing business and neither
 * service exists any more. Redirecting them somewhere vaguely adjacent is what
 * Google treats as a soft 404, and a 404 is the honest answer for content that
 * is genuinely gone. If those services ever come back, add them here.
 *
 * Also deliberately absent: the 2013-2016 era of this domain, which the
 * archive also holds (broom-st.html, grass-broom.html, mop.html, phenoil.html,
 * broadband.html, postpaid.html and friends). That was a different business.
 * Those stay 404.
 *
 * No trailing slash on the sources, and that is correct rather than an
 * oversight: trailingSlash: true does not append one to a path with a file
 * extension, which is why these currently 404 outright instead of first
 * redirecting to "<path>.html/".
 */
const LEGACY_PAGES: Record<string, string> = {
  // Freight, logistics and customs -> the freight page.
  "/freight-forwarding.html": "/shipping/",
  "/sea-freight.html": "/shipping/",
  "/air-freight.html": "/shipping/",
  "/rail-freight.html": "/shipping/",
  "/road-transportation.html": "/shipping/",
  "/worldwide-shipping.html": "/shipping/",
  "/delivery-to-door-steps.html": "/shipping/",
  "/custom-clearance.html": "/shipping/",
  "/logistics-warehousing.html": "/shipping/",
  "/warehousing.html": "/shipping/",
  "/box-operation.html": "/shipping/",
  "/end-to-end-service.html": "/shipping/",
  "/service.html": "/shipping/",
  // AFFHAN SHIPPING LLC is the Dubai entity's registered name, so this one
  // could have argued for /sourcing-company-dubai/. Confirmed as the freight
  // page instead.
  "/affhan-shipping.html": "/shipping/",

  // Sourcing, supplier work and QC -> the China sourcing page.
  "/sourcing-agent.html": "/china-sourcing-company/",
  "/product-sourcing.html": "/china-sourcing-company/",
  // The typo is in the original URL, not here.
  "/supplier-selecion.html": "/china-sourcing-company/",
  "/quality-control.html": "/china-sourcing-company/",
  "/packaging-private-label.html": "/china-sourcing-company/",

  // Company.
  "/about-us.html": "/about/",
  "/our-clients.html": "/about/",
  "/free-consultation.html": "/contact/",
};

const nextConfig: NextConfig = {
  trailingSlash: true,
  experimental: {
    // Put the stylesheet in the document instead of behind its own request.
    //
    // Measured on production: first paint went from 3,088ms to 1,252ms on a
    // 4x-throttled phone at 1.6 Mbps. The stylesheet is only 30 kB on the
    // wire but took 2,134ms to arrive, because it is requested at the same
    // instant as 15 JS chunks and 17 images and HTTP/2 hands it a share of a
    // 200 kB/s link rather than precedence. Inlining removes the race: there
    // is nothing left to lose it.
    //
    // The cost is that the 31.7 kB (gzipped) stylesheet rides on every HTML
    // response rather than being fetched once and cached. Measured over a
    // real session before turning this on: in-site navigation fetches zero
    // documents (App Router navigates client-side), and a warm hard load
    // serves the document from cache. So this is paid on a cold first visit —
    // where it is a large win — and on hard loads where the HTML has actually
    // changed, which for an hourly-ISR page is at most once an hour.
    inlineCss: true,
  },
  async redirects() {
    // 308, not 307: these moves are permanent, and a temporary redirect tells
    // Google to keep the old URL in the index rather than consolidate its
    // signals onto the destination.
    return Object.entries(LEGACY_PAGES).map(([source, destination]) => ({
      source,
      destination,
      permanent: true,
    }));
  },
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          {
            key: "Strict-Transport-Security",
            value: "max-age=31536000; includeSubDomains; preload",
          },
          {
            key: "X-Content-Type-Options",
            value: "nosniff",
          },
          {
            key: "X-Frame-Options",
            value: "SAMEORIGIN",
          },
          {
            key: "Referrer-Policy",
            value: "strict-origin-when-cross-origin",
          },
          {
            key: "Permissions-Policy",
            value: "camera=(), microphone=(), geolocation=()",
          },
        ],
      },
    ];
  },
  images: {
    // Product/category images are HOTLINKED from CJ's CDN and we never store
    // them. Routing hundreds of thousands of them through Next's image
    // optimizer is slow (every image round-trips our server) and on Vercel
    // Hobby it would blow the monthly image-optimization quota instantly.
    // Serving them unoptimized streams them straight from CJ's fast CDN —
    // dramatically faster first paint and zero optimization cost. Lazy-loading
    // still applies, so off-screen images are deferred as before.
    unoptimized: true,
    remotePatterns: [
      {
        protocol: "https",
        hostname: "d294cbym1d7nev.cloudfront.net",
      },
      {
        protocol: "https",
        hostname: "**.cjdropshipping.com",
      },
      {
        protocol: "https",
        hostname: "flagcdn.com",
      },
      {
        // Profile pictures from Google sign-in. Served from lh3/lh4/lh5/…,
        // so the wildcard rather than one host.
        protocol: "https",
        hostname: "**.googleusercontent.com",
      },
      {
        protocol: "https",
        hostname: "**.aliyuncs.com",
      },
      {
        protocol: "http",
        hostname: "**.cjdropshipping.com",
      }
    ],
  },
  devIndicators: false,
};

export default nextConfig;
