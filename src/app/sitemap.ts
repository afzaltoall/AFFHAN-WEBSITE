import { MetadataRoute } from 'next';

// Static route sitemap only. next.config.ts has trailingSlash: true, so every
// URL here must end in a slash — otherwise Google fetches a URL that 308s to
// the trailing-slash version, which is a wasted crawl + a weaker signal than
// listing the final URL directly.
//
// Individual product pages (/products/[id]/, ~200k+ rows) are deliberately
// NOT enumerated here: dumping every product id into one sitemap would (a)
// blow past the 50,000-URL-per-sitemap limit many times over, and (b) risks
// a thin-content signal given these are catalog/demonstrator listings, not
// unique inventory (see CLAUDE.md — "the listed products are not our
// inventory"). If we later decide individual product pages should be
// indexed, build a dynamic, paginated sitemap instead: a sitemap index
// (src/app/sitemap-index.xml or Next's multi-sitemap support via
// generateSitemaps()) pointing to multiple chunked sitemaps, each capped at
// 50,000 URLs, generated from the DB rather than hardcoded here.
export default function sitemap(): MetadataRoute.Sitemap {
  const baseUrl = 'https://affhan.com';

  return [
    {
      url: `${baseUrl}/`,
      lastModified: new Date(),
      changeFrequency: 'weekly',
      priority: 1.0,
    },
    {
      url: `${baseUrl}/sourcing-company-chennai/`,
      lastModified: new Date(),
      changeFrequency: 'weekly',
      priority: 0.9,
    },
    {
      url: `${baseUrl}/sourcing-company-dubai/`,
      lastModified: new Date(),
      changeFrequency: 'weekly',
      priority: 0.9,
    },
    {
      url: `${baseUrl}/sourcing-company-uk/`,
      lastModified: new Date(),
      changeFrequency: 'weekly',
      priority: 0.9,
    },
    {
      url: `${baseUrl}/sourcing-company-singapore/`,
      lastModified: new Date(),
      changeFrequency: 'weekly',
      priority: 0.9,
    },
    {
      url: `${baseUrl}/sourcing-company-malaysia/`,
      lastModified: new Date(),
      changeFrequency: 'weekly',
      priority: 0.9,
    },
    {
      url: `${baseUrl}/china-sourcing-office-guangzhou/`,
      lastModified: new Date(),
      changeFrequency: 'weekly',
      priority: 0.9,
    },
    {
      url: `${baseUrl}/about/`,
      lastModified: new Date(),
      changeFrequency: 'monthly',
      priority: 0.7,
    },
    {
      url: `${baseUrl}/contact/`,
      lastModified: new Date(),
      changeFrequency: 'monthly',
      priority: 0.7,
    },
    {
      url: `${baseUrl}/careers/`,
      lastModified: new Date(),
      changeFrequency: 'monthly',
      priority: 0.7,
    },
    {
      url: `${baseUrl}/products/`,
      lastModified: new Date(),
      changeFrequency: 'monthly',
      priority: 0.7,
    },
    // No /categories/ entry: it 308s to /products/, and a sitemap should list
    // only final, indexable URLs. Advertising a redirect asks Google to spend
    // crawl budget rediscovering a page already listed above.
    {
      url: `${baseUrl}/rankings/`,
      lastModified: new Date(),
      changeFrequency: 'weekly',
      priority: 0.6,
    },
  ];
}
