import { Metadata } from "next";
import Link from "next/link";
import Image from "next/image";
import { CheckCircle2 } from "lucide-react";
import { FooterSection } from "@/components/sections/FooterSection";
import { getCdnUrl } from "@/lib/cdn";
import dynamic from "next/dynamic";
import { CountUpStat } from "@/components/ui/CountUpStat";
import { prisma } from "@/lib/prisma";
import { buildCategoryTree, getCategoryIcon } from "@/lib/categoryTree";

const SourcingProcessSection = dynamic(() => import("@/components/sections/SourcingProcessSection").then(mod => mod.SourcingProcessSection), { ssr: true });
const FaqAccordion = dynamic(() => import("@/components/sections/FaqAccordion").then(mod => mod.FaqAccordion), { ssr: true });

// Hourly ISR rather than a dynamic render. The catalog counts move slowly, and
// this is a search landing page — it should stay statically served and fast,
// with the figures refreshed in the background instead of a DB round trip on
// every request.
export const revalidate = 3600;

// 53 chars, down from 70. Google truncates a title around 60 and the old one
// lost its tail — "— China Import" was being cut anyway, and it was the least
// valuable part. Both phrases this page targets, "sourcing agent in Chennai"
// and "sourcing company in Chennai", now survive the truncation intact.
const PAGE_TITLE = "Sourcing Agent & Sourcing Company in Chennai | AFFHAN";

// 149 chars, down from 182. Google shows roughly 155, so the old "Get a quote
// today" call to action was being clipped off the end where it did no work.
const PAGE_DESCRIPTION =
  "Trusted sourcing agent and sourcing company in Chennai for China imports, product sourcing and freight forwarding. 10 lakh+ products, 100+ countries.";

export const metadata: Metadata = {
  title: PAGE_TITLE,
  description: PAGE_DESCRIPTION,
  alternates: {
    canonical: "https://affhan.com/sourcing-company-chennai/",
  },
  openGraph: {
    title: PAGE_TITLE,
    description: PAGE_DESCRIPTION,
    // Trailing slash to match the canonical. Without it og:url named a URL that
    // 308s, so a share pointed one hop away from the page's own canonical.
    url: "https://affhan.com/sourcing-company-chennai/",
    type: "website",
    siteName: "AFFHAN Group",
    images: [
      {
        url: "/images/logo.png",
        width: 800,
        height: 600,
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: PAGE_TITLE,
    description: PAGE_DESCRIPTION,
  },
};

// AFFHAN has traded since 2000. Derived rather than written down so the figure
// cannot go stale — the page revalidates hourly, so it rolls over on its own
// each new year. It previously read "3+ years", understating the company by
// more than two decades, in both the bullet list and this FAQ answer (which is
// serialised into the FAQPage schema, so the understatement was going out as
// structured data too).
const FOUNDED_YEAR = 2000;
const yearsTrading = new Date().getFullYear() - FOUNDED_YEAR;

const faqs = [
  {
    question: "What makes AFFHAN the best sourcing company in Chennai?",
    answer:
      `With over ${yearsTrading} years of proven expertise, a 4.8 rating, and direct presence in China and Chennai, AFFHAN eliminates the middleman. We provide seamless B2B sourcing from a catalog of over 10 Lakhs+ products across 500+ product categories.`,
  },
  {
    question: "How to source products from China to Chennai safely?",
    answer:
      "The safest way to source products from China is to use a reliable sourcing agent in Chennai like AFFHAN. We handle supplier verification, physical factory audits, quality control, and secure shipping directly to your warehouse.",
  },
  {
    question: "What does a sourcing agent cost in Chennai?",
    answer:
      "Sourcing agent costs vary depending on the complexity of the order, product type, and logistics requirements. At AFFHAN, we offer highly competitive and transparent pricing for procurement, quality inspection, and freight forwarding.",
  },
  {
    question: "Does AFFHAN provide door-to-door shipping from China to Chennai?",
    answer:
      "Yes! We are a full-service import export company in Chennai offering door-to-door shipping. Whether it's LCL, FCL, Air Freight, or Sea Freight, we manage everything including customs clearance in India.",
  },
  {
    question: "How do you ensure the quality of imported products?",
    answer:
      "Our ground team in China conducts strict pre-shipment quality inspections and factory audits, ensuring you only receive goods that meet your exact specifications.",
  },
  {
    question: "Are you a sourcing agent in Chennai?",
    answer:
      "Yes, AFFHAN acts as your dedicated product sourcing agent in Chennai with our own procurement team on the ground in China. We bridge the gap between Indian buyers and Chinese factories.",
  },
  {
    question: "What documents does a Chennai business need before its first import?",
    answer:
      "You need an Importer Exporter Code from the DGFT, GST registration on the importing entity, and an AD Code from your bank registered at Chennai Port. The AD Code registration is the one first-time importers usually discover too late — without it the consignment cannot be cleared in your name.",
  },
  {
    question: "Why does HS code classification matter for import duty in India?",
    answer:
      "The HS code sets the Basic Customs Duty rate and any licensing or BIS conditions attached to the goods. An incorrect code triggers re-assessment at the port, and demurrage accrues while it is resolved. We classify products at the quotation stage so the landed cost you approve is the landed cost you pay.",
  },
];

const schema = {
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "LocalBusiness",
      "@id": "https://affhan.com/#localbusiness",
      name: "AFFHAN International Pvt Ltd",
      url: "https://affhan.com",
      logo: "https://affhan.com/images/logo.png",
      image: "https://affhan.com/images/logo.png",
      description:
        "AFFHAN is a trusted sourcing company in Chennai for China imports, product sourcing & freight forwarding.",
      telephone: "+91-44-4743-2777",
      email: "info@affhan.com",
      address: {
        "@type": "PostalAddress",
        streetAddress: "No.69/46, Appavoo Tower, West Madha Church Road, Royapuram",
        addressLocality: "Chennai",
        addressRegion: "Tamil Nadu",
        postalCode: "600013",
        addressCountry: "IN",
      },
      // No aggregateRating. The 4.8/144 figures are the company's Google
      // Business Profile rating — a third party's review data, which Google's
      // review-snippet guidance does not allow a site to republish as its own
      // structured data. The same block was removed from the root layout for
      // this reason; this page carried its own copy. The visible "4.8" on the
      // page stays: stating the rating as a fact is fine, asserting it as
      // first-party structured data is not.
    },
    {
      "@type": "Service",
      serviceType: "Product Sourcing and Freight Forwarding",
      provider: {
        "@id": "https://affhan.com/#localbusiness",
      },
      areaServed: {
        "@type": "City",
        name: "Chennai",
      },
    },
    {
      "@type": "FAQPage",
      mainEntity: faqs.map((faq) => ({
        "@type": "Question",
        name: faq.question,
        acceptedAnswer: {
          "@type": "Answer",
          text: faq.answer,
        },
      })),
    },
  ],
};

export default async function SourcingCompanyChennaiPage() {
  // Only categories that actually hold products are counted — the tree carries
  // some empty CJ nodes, and advertising those would overstate what a visitor
  // can genuinely browse.
  const [productCount, categoryCount, categoriesRaw] = await Promise.all([
    prisma.product.count(),
    prisma.category.count({ where: { products: { some: {} } } }),
    prisma.category.findMany({
      include: {
        _count: {
          select: { products: true }
        }
      }
    }),
  ]);

  const allCategories = categoriesRaw.map(c => ({
    ...c,
    productCount: c._count.products
  }));

  const tree = buildCategoryTree(allCategories);

  // No pt-24 on <main>. The navbar is `fixed`, so top padding here pushed the
  // hero down and left a bare slate-50 strip between the navbar and the
  // gradient. That clearance lives inside the hero instead, so the gradient
  // runs all the way up under the (opaque) navbar with no seam.
  return (
    <main className="w-full bg-slate-50 min-h-screen pb-0">
      {/* JSON-LD Schemas */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(schema) }}
      />

      {/* Hero Section.
          `isolate` scopes the z-index stack to this section, so the backdrop's
          z-0 and the copy's z-10 can't interact with anything else on the page.
          The section is now full-bleed so the gradient reaches the viewport
          edges; the original max-w-[1200px] + padding moved inward onto the
          content wrapper, unchanged. */}
      <section className="relative isolate overflow-hidden">
        {/* Decorative only — aria-hidden so it is never announced, and
            pointer-events:none (in CSS) so it cannot sit in front of the CTAs.
            Absolutely positioned, so it contributes no height and no CLS. */}
        <div className="hero-aurora z-0" aria-hidden="true">
          <span className="hero-blob hero-blob-1" />
          <span className="hero-blob hero-blob-2" />
        </div>
        {/* Fills the viewport and centres the copy in it. min-h-svh (small
            viewport height) rather than 100vh: on mobile 100vh is the height
            with browser chrome hidden, so it overflows by the toolbar height
            until you scroll. pt-24 is the fixed navbar's clearance, now carried
            here instead of on <main>. */}
        <div className="relative z-10 flex min-h-svh items-center pt-24 pb-12 lg:pb-20">
          <div className="w-full max-w-[1200px] mx-auto px-4 sm:px-6 lg:px-8">
        {/* Two measures, not one. The heading gets the full 56rem so it breaks
            across few lines, while the body is pulled in to ~42rem — around
            65-70 characters, the range that actually reads comfortably. Both
            sharing max-w-4xl gave the paragraph ~95-character lines, which is
            what made the block feel like an undifferentiated slab. */}
        <div className="text-center max-w-4xl mx-auto">
          {/* -0.022em, not -0.032em: at 48px the tighter value closed the
              letters up enough to read as cramped rather than premium. */}
          <h1 className="hero-rise hero-rise-1 text-3xl sm:text-4xl lg:text-5xl font-bold tracking-[-0.022em] leading-[1.1] text-balance text-slate-900 mb-5 sm:mb-6">
            Sourcing Agent & Sourcing Company in Chennai — <span className="text-[#1d7e93]">AFFHAN Group</span>
          </h1>
          {/* whitespace-nowrap spans keep number+unit pairs and the hyphenated
              compound from splitting across lines ("...over 10" / "Lakhs+
              products..." was the visible break). Done with markup rather than
              &nbsp; so the text characters are byte-identical — nothing for a
              crawler to see differently. */}
          <p className="hero-rise hero-rise-2 max-w-2xl mx-auto text-base sm:text-[17px] text-slate-600 mb-9 sm:mb-10 leading-[1.65] tracking-[-0.004em] text-pretty">
            AFFHAN Group has sourced out of Royapuram since {FOUNDED_YEAR}, minutes from Harbour Gate No.&nbsp;3 and the yards our clients&apos; cargo clears through. Work with a <strong className="text-slate-800">China sourcing agent in Chennai</strong> whose buyers have already stood in the factory — and an <strong className="text-slate-800">import export company in Chennai</strong> that treats vetting, inspection, freight and clearance as one job rather than four vendors. As your <strong className="text-slate-800">product sourcing agent</strong> we quote a landed cost into Tamil Nadu, drawn from <span className="whitespace-nowrap">10 Lakhs+</span> products moving to <span className="whitespace-nowrap">100+ countries</span>.
          </p>
          {/* Single CTA, centred. The scale/lift sits behind `motion-safe:`, so
              a reduced-motion visitor never receives those utilities at all —
              no override rule needed. Colour and shadow transitions stay, since
              they involve no movement, and transform+shadow never reflow. */}
          <div className="hero-rise hero-rise-3 flex justify-center">
            <Link
              href="/"
              className="cta-sheen group inline-flex items-center justify-center gap-2 rounded-xl border border-slate-300/80 bg-white/70 px-8 py-3.5 text-[15px] font-medium tracking-[-0.01em] text-slate-800 shadow-[0_1px_2px_rgba(15,23,42,0.05)] backdrop-blur-sm transition-all duration-300 ease-out hover:border-brand/45 hover:bg-white hover:text-[#176579] hover:shadow-[0_2px_10px_rgba(15,23,42,0.07),0_10px_30px_-10px_rgba(39,168,196,0.5)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/40 focus-visible:ring-offset-2 motion-safe:hover:scale-[1.02] motion-safe:active:scale-[0.98]"
            >
              Visit AFFHAN Website
              <span aria-hidden="true" className="transition-transform duration-300 ease-out motion-safe:group-hover:translate-x-1">
                →
              </span>
            </Link>
          </div>
        </div>
          </div>
        </div>
      </section>

      {/* Services Section.
          A faint teal wash instead of flat white: the glass cards below tint
          and blur what sits behind them, and over pure white there is nothing
          for them to act on — they would read as plain panels. This also
          carries the hero's colour down into the section. */}
      <section className="bg-gradient-to-b from-[#f2fafc] via-[#f7fcfd] to-white py-10 lg:py-8 border-y border-slate-200 min-h-[calc(100svh-4rem)] flex flex-col justify-center">
        <div className="max-w-[1200px] mx-auto px-4 sm:px-6 lg:px-8 w-full">
          <div className="text-center mb-5 lg:mb-6">
            <h2 className="text-[1.75rem] sm:text-3xl lg:text-4xl font-semibold tracking-[-0.018em] leading-[1.12] text-balance text-slate-900 mb-2 sm:mb-3">
              Our Sourcing Services in Chennai
            </h2>
            <p className="text-slate-600 max-w-2xl mx-auto text-sm sm:text-[15px] leading-[1.6] tracking-[-0.003em] text-pretty">
              Three services, almost always bought together. Most Chennai importers reach us after a shipment went wrong somewhere in the gap between the factory floor and the Bill of Entry, so we run product sourcing in Chennai end to end instead of handing you between a buying agent, an inspector and a forwarder.
            </p>
          </div>

          {/* The artwork carries its own baked-in wordmarks, so the lucide icon
              that used to head each card was a third competing visual and has
              gone. Every word that matters still lives in the h3 and the
              paragraph as real text — nothing readable was moved into a bitmap,
              which is what would have made it invisible to a crawler.

              alt describes the picture instead of repeating the h3 sitting
              right beneath it; duplicating it would have a screen reader
              announce each service name twice.

              Fixed aspect-[3/2] box with `fill` reserves the space before the
              file arrives, so no CLS, and they sit below the fold and stay
              lazy — no LCP cost. */}
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6 lg:gap-8">
            <div className="liquid-glass-card overflow-hidden">
              <div className="relative aspect-video w-full bg-slate-100">
                <Image
                  src="/Landing-chennai-services/china-product-sourcing.webp"
                  unoptimized={false}
                  alt="Shipping container marked with the Chinese flag being craned onto a dock beside stacked cartons"
                  fill
                  sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
                  className="object-cover"
                />
              </div>
              <div className="p-5 sm:p-6">
                <h3 className="text-lg sm:text-xl font-semibold tracking-[-0.016em] leading-snug text-balance text-slate-900 mb-2">China Product Sourcing</h3>
                <p className="text-slate-600 text-sm sm:text-base leading-[1.5] tracking-[-0.003em] text-pretty">
                  Tell us the specification, the quantity and the price you need to hit. Our Guangzhou team shortlists factories already making the part and returns quotes you can read side by side, across 500+ categories.
                </p>
              </div>
            </div>

            <div className="liquid-glass-card overflow-hidden">
              <div className="relative aspect-video w-full bg-slate-100">
                <Image
                  src="/Landing-chennai-services/supplier-verification.webp"
                  unoptimized={false}
                  alt="Inspector in a hi-vis vest checking a clipboard against palletised cartons at a loading bay"
                  fill
                  sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
                  className="object-cover"
                />
              </div>
              <div className="p-5 sm:p-6">
                <h3 className="text-lg sm:text-xl font-semibold tracking-[-0.016em] leading-snug text-balance text-slate-900 mb-2">Supplier Verification</h3>
                <p className="text-slate-600 text-sm sm:text-base leading-[1.5] tracking-[-0.003em] text-pretty">
                  Before a deposit moves, we check the business licence, the export history and the plant itself. Our people walk the line in person — the one step that separates a real manufacturer from a trading desk with a convincing website.
                </p>
              </div>
            </div>

            <div className="liquid-glass-card overflow-hidden">
              <div className="relative aspect-video w-full bg-slate-100">
                <Image
                  src="/Landing-chennai-services/freight-forwarding.webp"
                  unoptimized={false}
                  alt="Container ship at berth with a cargo aircraft overhead and a haulage truck on the quay"
                  fill
                  sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
                  className="object-cover"
                />
              </div>
              <div className="p-5 sm:p-6">
                <h3 className="text-lg sm:text-xl font-semibold tracking-[-0.016em] leading-snug text-balance text-slate-900 mb-2">Freight Forwarding</h3>
                <p className="text-slate-600 text-sm sm:text-base leading-[1.5] tracking-[-0.003em] text-pretty">
                  Sea or air, LCL or full container, booked and tracked into Chennai Port. We coordinate the Bill of Entry, the duty payment and the final run to your godown, so one team owns the consignment from the factory gate to yours.
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Process Section — nine-stage orbital walkthrough, replacing a row of
          four one-line steps. Each stage now carries a description and four
          deliverables, and all of it is real text in the DOM: the mobile
          stepper renders every stage unconditionally, which is the rendering
          mobile-first crawling actually indexes. */}
      {/* Route, paperwork and timeline for the Chennai end specifically. The
          nine-stage workflow below is shared with the Dubai page by design —
          the order runs the same way wherever it lands — so the localised
          detail that makes this page worth indexing lives here instead.
          Reuses the frosted panel from the Industries section rather than
          introducing another card treatment. */}
      <section className="py-16 lg:py-24 bg-gradient-to-b from-white to-[#f5fbfd] border-t border-slate-200">
        <div className="max-w-[1200px] mx-auto px-4 sm:px-6 lg:px-8 w-full">
          <div className="text-center mb-10 lg:mb-12">
            <h2 className="text-[1.75rem] sm:text-4xl font-semibold tracking-[-0.018em] leading-[1.12] text-balance text-slate-900 mb-4">
              Importing from China into Chennai
            </h2>
            <p className="text-slate-600 max-w-2xl mx-auto text-sm sm:text-base leading-[1.65] tracking-[-0.003em] text-pretty">
              Chennai is the natural entry point for importers across South India, and most of what goes wrong on a first shipment goes wrong on paper rather than at sea. This is what the route actually looks like.
            </p>
          </div>
          <div className="max-w-6xl mx-auto bg-white/40 backdrop-blur-md p-6 sm:p-8 lg:p-10 rounded-3xl border border-white/60 shadow-[0_8px_30px_rgb(0,0,0,0.04)]">
            <div className="grid gap-8 lg:gap-10 lg:grid-cols-3">
              <div>
                <h3 className="text-lg sm:text-xl font-semibold tracking-[-0.016em] leading-snug text-slate-900 mb-3">
                  Ports, routes and transit times
                </h3>
                <p className="text-slate-600 text-sm sm:text-[15px] leading-[1.7] tracking-[-0.003em] text-pretty">
                  Most of what we move for Chennai buyers loads at Yantian, Ningbo, Shanghai or Nansha and discharges at Chennai Port, with Kattupalli and Ennore absorbing the overflow when berths are tight. Port to port, a sea shipment typically runs 14 to 21 days depending on the service and whether it transships; air freight into Chennai International usually lands in 3 to 6 days. Those are planning ranges rather than guarantees — a blank sailing or a congested transshipment hub moves them. Buyers who cannot fill a container ship LCL, consolidated at our Guangzhou hub alongside other orders heading the same way.
                </p>
              </div>
              <div>
                <h3 className="text-lg sm:text-xl font-semibold tracking-[-0.016em] leading-snug text-slate-900 mb-3">
                  Customs, duty and the paperwork
                </h3>
                <p className="text-slate-600 text-sm sm:text-[15px] leading-[1.7] tracking-[-0.003em] text-pretty">
                  An Importer Exporter Code from the DGFT has to exist before the first consignment arrives, or the goods simply sit. Clearance runs on a Bill of Entry filed through ICEGATE, against which Basic Customs Duty, the Social Welfare Surcharge and IGST fall due. IGST is the part first-time importers misread: it is recoverable as input credit through your GST return, so it shapes cash flow rather than final cost. Several categories — electronics, toys and medical devices among them — need BIS or CDSCO registration before they can clear at all, which is a question to settle while quoting, not at the port.
                </p>
              </div>
              <div>
                <h3 className="text-lg sm:text-xl font-semibold tracking-[-0.016em] leading-snug text-slate-900 mb-3">
                  Where consignments actually get held
                </h3>
                <p className="text-slate-600 text-sm sm:text-[15px] leading-[1.7] tracking-[-0.003em] text-pretty">
                  In our experience the commonest cause of a delayed clearance is HS classification. The code sets the duty rate and any licensing conditions attached to the goods, and a plausible-looking wrong code produces a query, a re-assessment, and demurrage accruing while it is argued. We classify at the quoting stage so the landed cost you approve is the one you pay, then work with your CHA through assessment, duty payment and delivery to your godown anywhere in Tamil Nadu.
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>

      <SourcingProcessSection />

      {/* The local counterpart to the shared workflow: what a Chennai importer
          has to have ready at this end. Reuses the narrow max-w-3xl measure and
          the CheckCircle2 list already used elsewhere on the page. */}
      <section className="py-10 lg:py-12 bg-white border-t border-slate-200 min-h-[calc(100svh-4rem)] flex flex-col justify-center">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 w-full">
          <h2 className="text-[1.75rem] sm:text-4xl font-semibold tracking-[-0.018em] leading-[1.12] text-balance text-slate-900 mb-5">
            How sourcing works for a Chennai business
          </h2>
          <p className="text-slate-600 text-[15px] sm:text-base leading-[1.75] tracking-[-0.003em] text-pretty mb-5">
            The nine stages above run the same way wherever the goods are going. What changes for a Chennai importer is the preparation at this end.
          </p>
          <p className="text-slate-600 text-[15px] sm:text-base leading-[1.75] tracking-[-0.003em] text-pretty mb-6">
            Most enquiries start with very little — a photograph, a competitor&apos;s sample, or a part that has quietly become hard to buy locally. That is enough for us to begin. What genuinely delays a first order is the registration and banking side, so it is worth having in place:
          </p>
          <ul className="space-y-3.5 mb-6">
            <li className="flex items-start gap-3 text-slate-700 text-[15px] sm:text-base leading-[1.6]">
              <CheckCircle2 className="w-5 h-5 shrink-0 text-[#1d7e93] mt-0.5" />
              An Importer Exporter Code from the DGFT, and GST registration on the importing entity
            </li>
            <li className="flex items-start gap-3 text-slate-700 text-[15px] sm:text-base leading-[1.6]">
              <CheckCircle2 className="w-5 h-5 shrink-0 text-[#1d7e93] mt-0.5" />
              An AD Code from your bank, registered at Chennai Port — without it the consignment cannot be cleared in your name
            </li>
            <li className="flex items-start gap-3 text-slate-700 text-[15px] sm:text-base leading-[1.6]">
              <CheckCircle2 className="w-5 h-5 shrink-0 text-[#1d7e93] mt-0.5" />
              A realistic first quantity — factories hold minimum order quantities, and pushing far under one moves the unit price more than negotiation ever will
            </li>
          </ul>
          <p className="text-slate-600 text-[15px] sm:text-base leading-[1.75] tracking-[-0.003em] text-pretty mb-5">
            On price, compare landed cost rather than the figure on the factory&apos;s quotation. An FOB price excludes freight, insurance, duty and delivery; a CIF price covers the sea leg but stops at the port, with clearance and haulage still ahead of you. We quote door-delivered into Tamil Nadu so there is a single number to weigh against your local supplier — which is usually the comparison a business is actually trying to make.
          </p>
          <p className="text-slate-600 text-[15px] sm:text-base leading-[1.75] tracking-[-0.003em] text-pretty">
            For a repeat line the second order is materially cheaper than the first. The factory is known, the specification is fixed, the classification is settled, and the inspection checklist already exists.
          </p>
        </div>
      </section>

      {/* Industries */}
      <section className="py-10 lg:py-12 bg-slate-50 border-t border-slate-200 min-h-[calc(100svh-4rem)] flex flex-col justify-center">
        <div className="max-w-[1200px] mx-auto px-4 sm:px-6 lg:px-8 w-full">
          <div className="text-center mb-6 lg:mb-8">
            <h2 className="text-[1.75rem] sm:text-4xl font-semibold tracking-[-0.018em] leading-[1.12] text-balance text-slate-900 mb-5">
              Industries We Source For in Chennai and Tamil Nadu
            </h2>
            <p className="text-slate-600 max-w-2xl mx-auto text-sm sm:text-base leading-[1.65] tracking-[-0.003em] text-pretty mt-4">
              Tamil Nadu&apos;s manufacturing belts import in recognisable patterns, and after {yearsTrading} years we know most of them. These are the sectors the Royapuram office handles most often.
            </p>
          </div>
          {/* Same liquid-glass-card treatment as the services grid, minus the
              image block — the class is purely a surface, so it works text-only
              and introduces no new visual pattern. */}
          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4 lg:gap-5 mb-6 lg:mb-8">
            <div className="liquid-glass-card p-5 flex flex-col">
              <h3 className="text-base sm:text-lg font-semibold tracking-[-0.016em] leading-snug text-slate-900 mb-2">Auto components</h3>
              <p className="text-slate-600 text-sm leading-[1.55] tracking-[-0.003em] text-pretty">
                The Ambattur, Oragadam and Sriperumbudur belt works to drawings, so first articles are inspected against them before a run is released.
              </p>
              <p className="mt-auto pt-3 text-[12.5px] leading-[1.5] text-slate-500 border-t border-white/70">
                <span className="font-semibold text-slate-600">Typical lines: </span>fasteners, castings and forgings, rubber and plastic mouldings, jigs and press tooling
              </p>
            </div>
            <div className="liquid-glass-card p-5 flex flex-col">
              <h3 className="text-base sm:text-lg font-semibold tracking-[-0.016em] leading-snug text-slate-900 mb-2">Leather and footwear</h3>
              <p className="text-slate-600 text-sm leading-[1.55] tracking-[-0.003em] text-pretty">
                Ambur, Ranipet and Vaniyambadi buy components and machinery spares that are no longer stocked anywhere in India.
              </p>
              <p className="mt-auto pt-3 text-[12.5px] leading-[1.5] text-slate-500 border-t border-white/70">
                <span className="font-semibold text-slate-600">Typical lines: </span>buckles and hardware, linings, soles, finishing chemicals, cutting and stitching spares
              </p>
            </div>
            <div className="liquid-glass-card p-5 flex flex-col">
              <h3 className="text-base sm:text-lg font-semibold tracking-[-0.016em] leading-snug text-slate-900 mb-2">Textiles and garments</h3>
              <p className="text-slate-600 text-sm leading-[1.55] tracking-[-0.003em] text-pretty">
                Tiruppur, Erode and Karur order parts where the OEM lead time runs to months, so the question is availability rather than price.
              </p>
              <p className="mt-auto pt-3 text-[12.5px] leading-[1.5] text-slate-500 border-t border-white/70">
                <span className="font-semibold text-slate-600">Typical lines: </span>labels and tags, elastics, zips, retail packaging, knitting and dyeing spares
              </p>
            </div>
            <div className="liquid-glass-card p-5 flex flex-col">
              <h3 className="text-base sm:text-lg font-semibold tracking-[-0.016em] leading-snug text-slate-900 mb-2">Engineering and electricals</h3>
              <p className="text-slate-600 text-sm leading-[1.55] tracking-[-0.003em] text-pretty">
                Coimbatore and Hosur buy against a certification requirement, which has to be verified at the factory rather than promised by email.
              </p>
              <p className="mt-auto pt-3 text-[12.5px] leading-[1.5] text-slate-500 border-t border-white/70">
                <span className="font-semibold text-slate-600">Typical lines: </span>motors, pump components, switchgear, LED assemblies, control-panel parts
              </p>
            </div>
          </div>
          <p className="text-center text-slate-500 text-sm sm:text-[15px] leading-[1.65] mt-6 max-w-2xl mx-auto">
            This is where most Tamil Nadu enquiries start rather than the full extent of it. <Link href="/contact/" className="font-medium text-[#176579] hover:text-[#27a8c4] hover:underline transition-colors">Send us your requirement</Link> and we will quote against it.
          </p>
        </div>
      </section>

      <section className="py-10 lg:py-12 bg-white min-h-[calc(100svh-4rem)] flex flex-col justify-center">
        <div className="max-w-[1200px] mx-auto px-4 sm:px-6 lg:px-8 w-full">
          <div className="text-center mb-6 lg:mb-8">
            <h2 className="text-[1.75rem] sm:text-3xl lg:text-4xl font-semibold tracking-[-0.018em] leading-[1.12] text-balance text-slate-900 mb-3">
              500+ Product Categories We Source into Chennai
            </h2>
            <p className="text-slate-600 max-w-2xl mx-auto text-sm sm:text-[15px] leading-[1.6] tracking-[-0.003em] text-pretty">
              None of this is inventory. It is a map of what the factories we buy from actually make, which is why you will not find prices against it — costing depends on your drawing, your quantity and where in Tamil Nadu the consignment has to be delivered. Find something close to what you need and we will source to your specification from there.
            </p>
          </div>
          <div className="max-w-6xl mx-auto bg-slate-50 p-5 sm:p-6 rounded-3xl border border-slate-200/60 shadow-sm">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-x-6 gap-y-0.5">
              {tree.slice(0, 16).map((cat) => {
                const Icon = getCategoryIcon(cat.name);
                return (
                  <Link
                    key={cat.id}
                    href={`/products/?categoryId=${cat.id}`}
                    className="group flex items-start gap-3 px-3.5 py-2.5 text-left transition-all border-l-4 border-transparent hover:bg-white/60 hover:shadow-sm hover:border-[#27a8c4] rounded-r-xl"
                  >
                    <Icon size={20} className="shrink-0 stroke-[1.5] text-slate-500 group-hover:text-[#1d7e93] mt-0.5" />
                    <span className="text-[14px] sm:text-[15px] font-medium text-slate-700 group-hover:text-slate-900 leading-snug">
                      {cat.name}
                    </span>
                  </Link>
                );
              })}
            </div>
          </div>
          <p className="text-center text-slate-500 text-sm sm:text-[15px] leading-[1.65] mt-6 max-w-2xl mx-auto">
            Cannot see it? Send a sample or a photograph and we will identify the plant that makes it, or <Link href="/products/" className="font-medium text-[#176579] hover:text-[#27a8c4] hover:underline transition-colors">browse the full product catalogue</Link>.
          </p>
        </div>
      </section>

      {/* Why Choose Us */}
      <section className="py-16 lg:py-24 bg-slate-900 text-white min-h-[calc(100svh-4rem)] flex flex-col justify-center overflow-hidden relative">
        {/* Abstract background element */}
        <div className="absolute top-0 right-0 -mr-48 -mt-48 w-96 h-96 bg-[#27a8c4]/10 rounded-full blur-3xl pointer-events-none" />

        <div className="max-w-[1200px] mx-auto px-4 sm:px-6 lg:px-8 relative z-10 w-full">
          <div className="grid lg:grid-cols-2 gap-12 items-center">
            <div>
              <h2 className="text-[1.75rem] sm:text-4xl font-semibold tracking-[-0.018em] leading-[1.12] text-balance mb-6">
                Why Choose AFFHAN as Your Chennai Sourcing Partner?
              </h2>
              <p className="text-slate-300 mb-8 leading-[1.6] tracking-[-0.003em] text-pretty">
                We are not a broker forwarding your enquiry to a Chinese trading company and adding a margin. AFFHAN buys, inspects and ships on its own account, with staff in Guangzhou and an office at Royapuram you can walk into.
              </p>
              {/* These used to restate the stat tiles sitting beside them —
                  products, countries and rating were each printed twice in one
                  section, and the "10 Lakhs+" line was vaguer than the exact
                  figure in the tile next to it. They now carry capabilities the
                  tiles cannot show, which is both more useful and more unique
                  text for the page to rank on. Every claim here already appears
                  in the FAQ or the service cards below — nothing new asserted. */}
              <ul className="space-y-4 mb-8">
                <li className="flex items-center gap-3 text-slate-200">
                  <CheckCircle2 className="w-5 h-5 shrink-0 text-brand" /> Buyers of our own in Guangzhou — no agency chain between you and the plant
                </li>
                <li className="flex items-center gap-3 text-slate-200">
                  <CheckCircle2 className="w-5 h-5 shrink-0 text-brand" /> Factories checked before the deposit, goods checked before they sail
                </li>
                <li className="flex items-center gap-3 text-slate-200">
                  <CheckCircle2 className="w-5 h-5 shrink-0 text-brand" /> LCL and FCL into Chennai Port, with the Bill of Entry handled alongside
                </li>
                <li className="flex items-center gap-3 text-slate-200">
                  <CheckCircle2 className="w-5 h-5 shrink-0 text-brand" /> {yearsTrading} years on the same corridor — trading since {FOUNDED_YEAR}
                </li>
              </ul>
              <div className="flex flex-col sm:flex-row gap-4 sm:gap-6 mt-6">
                <Link
                  href="/about/"
                  className="inline-flex items-center gap-2 text-brand font-semibold hover:text-brand-dark transition-colors"
                >
                  Learn more about our company →
                </Link>
                <Link
                  href="/sourcing-company-dubai/"
                  className="inline-flex items-center gap-2 text-slate-400 font-medium hover:text-slate-200 transition-colors"
                >
                  Looking for our UAE office? See Dubai →
                </Link>
              </div>
            </div>
            {/* Products and Categories come from the live catalog counts, so
                these can never drift from what /products actually shows.
                Countries and Rating stay literals — neither lives in the DB. */}
            <div className="grid grid-cols-2 gap-4">
              <div className="bg-slate-800 p-6 rounded-2xl text-center">
                <div className="text-[1.75rem] sm:text-4xl font-bold tracking-[-0.032em] leading-none text-brand mb-2 tabular-nums whitespace-nowrap">
                  {/* Shown in lakhs rather than the exact figure, but still
                      derived from the live count — floor(count / 100000), so it
                      rises on its own as the catalog grows and can never claim
                      more than is actually there. */}
                  <CountUpStat value={Math.floor(productCount / 100000)} suffix=" Lakhs+" />
                </div>
                <div className="text-sm text-slate-400 font-medium uppercase tracking-wider">Products</div>
              </div>
              <div className="bg-slate-800 p-6 rounded-2xl text-center">
                <div className="text-[1.75rem] sm:text-4xl font-bold tracking-[-0.032em] leading-none text-brand mb-2 tabular-nums whitespace-nowrap">
                  {/* No "+" here: this is the exact live count, and a plus
                      would claim there are more than the number shown. */}
                  <CountUpStat value={categoryCount} />
                </div>
                <div className="text-sm text-slate-400 font-medium uppercase tracking-wider">Categories</div>
              </div>
              <div className="bg-slate-800 p-6 rounded-2xl text-center">
                <div className="text-[1.75rem] sm:text-4xl font-bold tracking-[-0.032em] leading-none text-brand mb-2 tabular-nums whitespace-nowrap">
                  <CountUpStat value={100} suffix="+" />
                </div>
                <div className="text-sm text-slate-400 font-medium uppercase tracking-wider">Countries</div>
              </div>
              <div className="bg-slate-800 p-6 rounded-2xl text-center">
                <div className="text-[1.75rem] sm:text-4xl font-bold tracking-[-0.032em] leading-none text-brand mb-2 tabular-nums whitespace-nowrap">4.8</div>
                <div className="text-sm text-slate-400 font-medium uppercase tracking-wider">Rating</div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* FAQs */}
      <section className="py-16 lg:py-24 bg-white">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-12">
            <h2 className="text-[1.75rem] sm:text-4xl font-semibold tracking-[-0.018em] leading-[1.12] text-balance text-slate-900 mb-5">
              Frequently Asked Questions
            </h2>
          </div>
          {/* Answers stay in the HTML whether a panel is open or not — the
              accordion force-mounts them and collapses with CSS. Radix's
              AccordionHeader renders an h3, so each question keeps its place in
              the heading outline exactly as the plain markup had it. */}
          <FaqAccordion faqs={faqs} />
        </div>
      </section>


      <FooterSection />
    </main>
  );
}
