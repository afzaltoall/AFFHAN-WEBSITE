import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  trailingSlash: true,
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
