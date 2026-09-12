import type { NextConfig } from "next";

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
