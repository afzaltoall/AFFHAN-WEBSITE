import { MetadataRoute } from 'next';
import { ROLES, rolePath } from '@/lib/careerRoles';

// Static route sitemap only. next.config.ts has trailingSlash: true, so every
// URL here must end in a slash — otherwise Google fetches a URL that 308s to
// the trailing-slash version, which is a wasted crawl + a weaker signal than
// listing the final URL directly.
//
// Static routes only. Product pages now have their own map — see
// src/app/products/sitemap.ts — and robots.txt lists both.
//
// That file submits roughly 12,000 of 1,079,241 products, which is the
// decision this comment used to defend in full. The short version, now that
// it has been measured: a product page is 69% boilerplate, leaving ~87 words
// that are actually about the product, and for a CJ listing those 87 are the
// name and the category path. CJ sends no descriptions at all — 1,067,069
// rows, zero. Only EPROLO's 12,172 rows carry real content. The reasoning and
// the exclusions live next to the query that applies them.
/**
 * When each page's content last actually changed.
 *
 * Every entry below used to say `new Date()`, which meant the sitemap told
 * Google that all twenty-two pages had been modified at the instant of the
 * crawl — every crawl, forever. A date that is always "now" is not a date; it
 * carries no information, and a lastmod that never disagrees with the clock is
 * one Google learns to disregard for the whole site, including on the pages
 * where it would have been telling the truth.
 *
 * So these are constants, seeded from the last commit that changed each page,
 * and they are part of editing a page: change the copy, change the date on the
 * line below. That is a small manual step, and it is the price of the field
 * meaning something. A date that is wrong by a few days is still worth far
 * more than one that is wrong by design.
 *
 * ISO dates, no time: claiming a page changed at 05:50:35.828 is a precision
 * nobody has. Date-only lastmod is valid in the protocol and honest about what
 * is known.
 */
const UPDATED = {
  home: '2026-09-15',
  chinaSourcing: '2026-09-15',
  chennai: '2026-09-15',
  dubai: '2026-09-15',
  uk: '2026-09-15',
  singapore: '2026-09-15',
  malaysia: '2026-09-15',
  france: '2026-09-16',
  guangzhou: '2026-09-15',
  fromChina: '2026-09-15',
  about: '2026-09-15',
  contact: '2026-09-15',
  shipping: '2026-09-16',
  careers: '2026-09-17',
  /** Every role page is generated from lib/careerRoles.ts, so they share its date. */
  careerRoles: '2026-09-17',
  products: '2026-09-15',
  rankings: '2026-09-15',
  legal: '2026-08-20',
} as const;

export default function sitemap(): MetadataRoute.Sitemap {
  const baseUrl = 'https://affhan.com';

  return [
    {
      url: `${baseUrl}/`,
      lastModified: UPDATED.home,
      changeFrequency: 'weekly',
      priority: 1.0,
    },
    {
      // Keyword landing page for "china sourcing company" / "import export
      // company in china". Distinct from the Guangzhou office page below it:
      // this one is the service, that one is the place.
      url: `${baseUrl}/china-sourcing-company/`,
      lastModified: UPDATED.chinaSourcing,
      changeFrequency: 'weekly',
      priority: 0.9,
    },
    {
      url: `${baseUrl}/sourcing-company-chennai/`,
      lastModified: UPDATED.chennai,
      changeFrequency: 'weekly',
      priority: 0.9,
    },
    {
      url: `${baseUrl}/sourcing-company-dubai/`,
      lastModified: UPDATED.dubai,
      changeFrequency: 'weekly',
      priority: 0.9,
    },
    {
      url: `${baseUrl}/sourcing-company-uk/`,
      lastModified: UPDATED.uk,
      changeFrequency: 'weekly',
      priority: 0.9,
    },
    {
      url: `${baseUrl}/sourcing-company-singapore/`,
      lastModified: UPDATED.singapore,
      changeFrequency: 'weekly',
      priority: 0.9,
    },
    {
      url: `${baseUrl}/sourcing-company-malaysia/`,
      lastModified: UPDATED.malaysia,
      changeFrequency: 'weekly',
      priority: 0.9,
    },
    {
      url: `${baseUrl}/sourcing-company-france/`,
      lastModified: UPDATED.france,
      changeFrequency: 'weekly',
      priority: 0.9,
    },
    {
      url: `${baseUrl}/china-sourcing-office-guangzhou/`,
      lastModified: UPDATED.guangzhou,
      changeFrequency: 'weekly',
      priority: 0.9,
    },
    {
      url: `${baseUrl}/sourcing-from-china/`,
      lastModified: UPDATED.fromChina,
      changeFrequency: 'weekly',
      priority: 0.9,
    },
    {
      url: `${baseUrl}/about/`,
      lastModified: UPDATED.about,
      changeFrequency: 'monthly',
      priority: 0.7,
    },
    {
      url: `${baseUrl}/contact/`,
      lastModified: UPDATED.contact,
      changeFrequency: 'monthly',
      priority: 0.7,
    },
    {
      // The freight side of the business has its own page and its own search
      // demand ("freight forwarding chennai", "nvocc"). It was reachable and
      // indexable, just missing from the map.
      url: `${baseUrl}/shipping/`,
      lastModified: UPDATED.shipping,
      changeFrequency: 'monthly',
      priority: 0.7,
    },
    {
      url: `${baseUrl}/careers/`,
      lastModified: UPDATED.careers,
      changeFrequency: 'monthly',
      priority: 0.7,
    },
    // One URL per open role. They carry the JobPosting markup now, so they
    // are the pages Google has to reach; /careers/ above is the overview.
    ...ROLES.map((role) => ({
      url: `${baseUrl}${rolePath(role)}`,
      lastModified: UPDATED.careerRoles,
      changeFrequency: 'monthly' as const,
      priority: 0.5,
    })),
    {
      url: `${baseUrl}/products/`,
      lastModified: UPDATED.products,
      changeFrequency: 'monthly',
      priority: 0.7,
    },
    // No /categories/ entry: it 308s to /products/, and a sitemap should list
    // only final, indexable URLs. Advertising a redirect asks Google to spend
    // crawl budget rediscovering a page already listed above.
    {
      url: `${baseUrl}/rankings/`,
      lastModified: UPDATED.rankings,
      changeFrequency: 'weekly',
      priority: 0.6,
    },
    // Linked from the footer of every page, so they are crawled regardless.
    // Listed at a low priority because a sitemap that leaves out reachable,
    // indexable pages is an incomplete map rather than a curated one.
    {
      url: `${baseUrl}/privacy-policy/`,
      lastModified: UPDATED.legal,
      changeFrequency: 'yearly',
      priority: 0.3,
    },
    {
      url: `${baseUrl}/terms-conditions/`,
      lastModified: UPDATED.legal,
      changeFrequency: 'yearly',
      priority: 0.3,
    },
  ];
}
