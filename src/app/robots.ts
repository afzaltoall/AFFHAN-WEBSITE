import { MetadataRoute } from 'next';

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: '*',
      allow: '/',
      disallow: ['/admin', '/admin/login', '/api/'],
    },
    // Two sitemaps, both listed. robots.txt allows any number of Sitemap
    // lines and Google reads them all, which is simpler than maintaining a
    // sitemap index by hand: /sitemap.xml stays the static-page map, and the
    // product map is generated and sharded by generateSitemaps in
    // src/app/products/sitemap.ts.
    sitemap: [
      'https://affhan.com/sitemap.xml',
      'https://affhan.com/products/sitemap.xml',
    ],
  };
}
