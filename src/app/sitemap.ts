import { MetadataRoute } from 'next';

export default function sitemap(): MetadataRoute.Sitemap {
  // Base URL for the site
  const baseUrl = 'https://affhan.com';

  return [
    {
      url: `${baseUrl}/`,
      lastModified: new Date(),
      changeFrequency: 'daily',
      priority: 1.0,
    },
    {
      url: `${baseUrl}/about`,
      lastModified: new Date(),
      changeFrequency: 'monthly',
      priority: 0.8,
    },
    {
      url: `${baseUrl}/contact`,
      lastModified: new Date(),
      changeFrequency: 'monthly',
      priority: 0.8,
    },
    {
      url: `${baseUrl}/products`,
      lastModified: new Date(),
      changeFrequency: 'daily',
      priority: 0.9,
    },
    {
      url: `${baseUrl}/categories`,
      lastModified: new Date(),
      changeFrequency: 'weekly',
      priority: 0.9,
    },
    // NOTE: Individual product pages (10 lakh+ products) are intentionally omitted here.
    // A single sitemap file is limited to 50,000 URLs by Google and other search engines.
    // Product URLs should be handled through a dynamic paginated sitemap strategy 
    // or index sitemaps (e.g., sitemap-1.xml, sitemap-2.xml) fetching directly from the database.
  ];
}
