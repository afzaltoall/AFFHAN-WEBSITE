import { Metadata } from "next";
import Link from "next/link";
import Image from "next/image";
import { CheckCircle2 } from "lucide-react";
import { FooterSection } from "@/components/sections/FooterSection";
import { CountUpStat } from "@/components/ui/CountUpStat";
import { prisma } from "@/lib/prisma";

// Hourly ISR rather than a dynamic render. The catalog counts move slowly, and
// this is a search landing page — it should stay statically served and fast,
// with the figures refreshed in the background instead of a DB round trip on
// every request.
export const revalidate = 3600;

export const metadata: Metadata = {
  title: "Sourcing Agent & Sourcing Company in Chennai | AFFHAN — China Import",
  description:
    "AFFHAN is a trusted sourcing company and sourcing agent in Chennai for China imports, product sourcing & freight forwarding. 10 lakh+ products, 100+ countries. Get a quote today.",
  alternates: {
    canonical: "https://affhan.com/sourcing-company-chennai/",
  },
  openGraph: {
    title: "Sourcing Agent & Sourcing Company in Chennai | AFFHAN — China Import",
    description:
      "AFFHAN is a trusted sourcing company and sourcing agent in Chennai for China imports, product sourcing & freight forwarding. 10 lakh+ products, 100+ countries. Get a quote today.",
    url: "https://affhan.com/sourcing-company-chennai",
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
    title: "Sourcing Agent & Sourcing Company in Chennai | AFFHAN — China Import",
    description:
      "AFFHAN is a trusted sourcing company and sourcing agent in Chennai for China imports, product sourcing & freight forwarding. 10 lakh+ products, 100+ countries. Get a quote today.",
  },
};

const faqs = [
  {
    question: "What makes AFFHAN the best sourcing company in Chennai?",
    answer:
      "With over 3+ years of proven expertise, a 4.8 rating, and direct presence in China and Chennai, AFFHAN eliminates the middleman. We provide seamless B2B sourcing from a catalog of over 10 Lakhs+ products across 500+ product categories.",
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
      aggregateRating: {
        "@type": "AggregateRating",
        ratingValue: "4.8",
        reviewCount: "144"
      },
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
  const [productCount, categoryCount] = await Promise.all([
    prisma.product.count(),
    prisma.category.count({ where: { products: { some: {} } } }),
  ]);

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
            Sourcing Agent & Sourcing Company in Chennai — <span className="text-brand">AFFHAN Group</span>
          </h1>
          {/* whitespace-nowrap spans keep number+unit pairs and the hyphenated
              compound from splitting across lines ("...over 10" / "Lakhs+
              products..." was the visible break). Done with markup rather than
              &nbsp; so the text characters are byte-identical — nothing for a
              crawler to see differently. */}
          <p className="hero-rise hero-rise-2 max-w-2xl mx-auto text-base sm:text-[17px] text-slate-600 mb-9 sm:mb-10 leading-[1.65] tracking-[-0.004em] text-pretty">
            Looking for a reliable <strong className="text-slate-800">China sourcing agent in Chennai</strong> or a trusted <strong className="text-slate-800">import export company in Chennai</strong>? 
            AFFHAN Group connects Indian businesses to a global supply chain. As your dedicated <strong className="text-slate-800">product sourcing agent</strong>, we help you source from over <span className="whitespace-nowrap">10 Lakhs+</span> products and <span className="whitespace-nowrap">100+ countries</span> with our <span className="whitespace-nowrap">end-to-end</span> procurement, supplier verification, and freight forwarding solutions.
          </p>
          {/* Single CTA, centred. The scale/lift sits behind `motion-safe:`, so
              a reduced-motion visitor never receives those utilities at all —
              no override rule needed. Colour and shadow transitions stay, since
              they involve no movement, and transform+shadow never reflow. */}
          <div className="hero-rise hero-rise-3 flex justify-center">
            <Link
              href="/"
              className="cta-sheen group inline-flex items-center justify-center gap-2 rounded-xl border border-slate-300/80 bg-white/70 px-8 py-3.5 text-[15px] font-medium tracking-[-0.01em] text-slate-800 shadow-[0_1px_2px_rgba(15,23,42,0.05)] backdrop-blur-sm transition-all duration-300 ease-out hover:border-brand/45 hover:bg-white hover:text-brand-dark hover:shadow-[0_2px_10px_rgba(15,23,42,0.07),0_10px_30px_-10px_rgba(39,168,196,0.5)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/40 focus-visible:ring-offset-2 motion-safe:hover:scale-[1.02] motion-safe:active:scale-[0.98]"
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

      {/* Services Section */}
      <section className="bg-white py-16 lg:py-24 border-y border-slate-200">
        <div className="max-w-[1200px] mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-16">
            <h2 className="text-[1.75rem] sm:text-4xl font-semibold tracking-[-0.018em] leading-[1.12] text-balance text-slate-900 mb-5">
              Our Sourcing Services in Chennai
            </h2>
            <p className="text-slate-600 max-w-2xl mx-auto leading-[1.6] tracking-[-0.003em] text-pretty">
              We provide comprehensive product sourcing in Chennai to streamline your import operations. Whether you need a full-service import company or a specialized sourcing agent in Chennai, we have you covered.
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
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-8">
            <div className="bg-slate-50 rounded-2xl border border-slate-100 overflow-hidden hover:shadow-lg transition-shadow">
              <div className="relative aspect-[3/2] w-full bg-slate-100">
                <Image
                  src="/Landing-chennai-services/china-product-sourcing.webp"
                  alt="Shipping container marked with the Chinese flag being craned onto a dock beside stacked cartons"
                  fill
                  sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
                  className="object-cover"
                />
              </div>
              <div className="p-7 sm:p-8">
                <h3 className="text-lg sm:text-xl font-semibold tracking-[-0.016em] leading-snug text-balance text-slate-900 mb-3">China Product Sourcing</h3>
                <p className="text-slate-600 leading-[1.6] tracking-[-0.003em] text-pretty">
                  We act as your dedicated China sourcing agent in Chennai. Find any product from our 500+ product categories with competitive factory-direct pricing.
                </p>
              </div>
            </div>

            <div className="bg-slate-50 rounded-2xl border border-slate-100 overflow-hidden hover:shadow-lg transition-shadow">
              <div className="relative aspect-[3/2] w-full bg-slate-100">
                <Image
                  src="/Landing-chennai-services/supplier-verification.webp"
                  alt="Inspector in a hi-vis vest checking a clipboard against palletised cartons at a loading bay"
                  fill
                  sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
                  className="object-cover"
                />
              </div>
              <div className="p-7 sm:p-8">
                <h3 className="text-lg sm:text-xl font-semibold tracking-[-0.016em] leading-snug text-balance text-slate-900 mb-3">Supplier Verification</h3>
                <p className="text-slate-600 leading-[1.6] tracking-[-0.003em] text-pretty">
                  Risk-free importing. Our local team conducts background checks and physical audits to ensure you work with verified manufacturers.
                </p>
              </div>
            </div>

            <div className="bg-slate-50 rounded-2xl border border-slate-100 overflow-hidden hover:shadow-lg transition-shadow">
              <div className="relative aspect-[3/2] w-full bg-slate-100">
                <Image
                  src="/Landing-chennai-services/freight-forwarding.webp"
                  alt="Container ship at berth with a cargo aircraft overhead and a haulage truck on the quay"
                  fill
                  sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
                  className="object-cover"
                />
              </div>
              <div className="p-7 sm:p-8">
                <h3 className="text-lg sm:text-xl font-semibold tracking-[-0.016em] leading-snug text-balance text-slate-900 mb-3">Freight Forwarding</h3>
                <p className="text-slate-600 leading-[1.6] tracking-[-0.003em] text-pretty">
                  Sea and air freight logistics managed seamlessly. We handle customs clearance, NVOCC, and port handling directly to Chennai.
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Why Choose Us */}
      <section className="py-16 lg:py-24 bg-slate-900 text-white">
        <div className="max-w-[1200px] mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid lg:grid-cols-2 gap-12 items-center">
            <div>
              <h2 className="text-[1.75rem] sm:text-4xl font-semibold tracking-[-0.018em] leading-[1.12] text-balance mb-6">
                Why Choose AFFHAN as Your Chennai Sourcing Partner?
              </h2>
              <p className="text-slate-300 mb-8 leading-[1.6] tracking-[-0.003em] text-pretty">
                Partnering with the right import export company in Chennai can make or break your supply chain. We bring years of B2B trade expertise, ensuring low costs and high quality.
              </p>
              <ul className="space-y-4 mb-8">
                <li className="flex items-center gap-3 text-slate-200">
                  <CheckCircle2 className="w-5 h-5 text-brand" /> 10 Lakhs+ Products
                </li>
                <li className="flex items-center gap-3 text-slate-200">
                  <CheckCircle2 className="w-5 h-5 text-brand" /> Exporting to 100+ Countries
                </li>
                <li className="flex items-center gap-3 text-slate-200">
                  <CheckCircle2 className="w-5 h-5 text-brand" /> 4.8 / 5 Average Client Rating
                </li>
                <li className="flex items-center gap-3 text-slate-200">
                  <CheckCircle2 className="w-5 h-5 text-brand" /> 3+ Years of Verified Excellence
                </li>
              </ul>
              <Link
                href="/about"
                className="inline-flex items-center gap-2 text-brand font-semibold hover:text-brand-dark transition-colors"
              >
                Learn more about our company →
              </Link>
            </div>
            {/* Products and Categories come from the live catalog counts, so
                these can never drift from what /products actually shows.
                Countries and Rating stay literals — neither lives in the DB. */}
            <div className="grid grid-cols-2 gap-4">
              <div className="bg-slate-800 p-6 rounded-2xl text-center">
                <div className="text-[1.75rem] sm:text-4xl font-bold tracking-[-0.032em] leading-none text-brand mb-2 tabular-nums">
                  <CountUpStat value={productCount} />
                </div>
                <div className="text-sm text-slate-400 font-medium uppercase tracking-wider">Products</div>
              </div>
              <div className="bg-slate-800 p-6 rounded-2xl text-center">
                <div className="text-[1.75rem] sm:text-4xl font-bold tracking-[-0.032em] leading-none text-brand mb-2 tabular-nums">
                  {/* No "+" here: this is the exact live count, and a plus
                      would claim there are more than the number shown. */}
                  <CountUpStat value={categoryCount} />
                </div>
                <div className="text-sm text-slate-400 font-medium uppercase tracking-wider">Categories</div>
              </div>
              <div className="bg-slate-800 p-6 rounded-2xl text-center">
                <div className="text-[1.75rem] sm:text-4xl font-bold tracking-[-0.032em] leading-none text-brand mb-2 tabular-nums">
                  <CountUpStat value={100} suffix="+" />
                </div>
                <div className="text-sm text-slate-400 font-medium uppercase tracking-wider">Countries</div>
              </div>
              <div className="bg-slate-800 p-6 rounded-2xl text-center">
                <div className="text-[1.75rem] sm:text-4xl font-bold tracking-[-0.032em] leading-none text-brand mb-2 tabular-nums">4.8</div>
                <div className="text-sm text-slate-400 font-medium uppercase tracking-wider">Rating</div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Process Section */}
      <section className="py-16 lg:py-24 bg-white">
        <div className="max-w-[1200px] mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-16">
            <h2 className="text-[1.75rem] sm:text-4xl font-semibold tracking-[-0.018em] leading-[1.12] text-balance text-slate-900 mb-5">
              How Our Sourcing Process Works
            </h2>
            <p className="text-slate-600 leading-[1.6] tracking-[-0.003em] text-pretty">A transparent, step-by-step approach to global trade.</p>
          </div>
          
          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-8">
            <div className="relative text-center">
              <div className="w-16 h-16 bg-slate-100 rounded-full flex items-center justify-center mx-auto mb-6 border-4 border-white shadow-sm z-10 relative text-xl font-bold tracking-[-0.02em] text-slate-800">
                1
              </div>
              <h3 className="text-base font-semibold tracking-[-0.012em] leading-snug text-balance text-slate-900 mb-2">Requirement Analysis</h3>
              <p className="text-sm text-slate-600 leading-[1.6] tracking-[-0.003em] text-pretty">Share your product specifications and target pricing.</p>
            </div>
            <div className="relative text-center">
              <div className="w-16 h-16 bg-slate-100 rounded-full flex items-center justify-center mx-auto mb-6 border-4 border-white shadow-sm z-10 relative text-xl font-bold tracking-[-0.02em] text-slate-800">
                2
              </div>
              <h3 className="text-base font-semibold tracking-[-0.012em] leading-snug text-balance text-slate-900 mb-2">Supplier Sourcing</h3>
              <p className="text-sm text-slate-600 leading-[1.6] tracking-[-0.003em] text-pretty">We find and verify the best manufacturers in China.</p>
            </div>
            <div className="relative text-center">
              <div className="w-16 h-16 bg-slate-100 rounded-full flex items-center justify-center mx-auto mb-6 border-4 border-white shadow-sm z-10 relative text-xl font-bold tracking-[-0.02em] text-slate-800">
                3
              </div>
              <h3 className="text-base font-semibold tracking-[-0.012em] leading-snug text-balance text-slate-900 mb-2">Quality Inspection</h3>
              <p className="text-sm text-slate-600 leading-[1.6] tracking-[-0.003em] text-pretty">Pre-shipment checks to ensure top quality.</p>
            </div>
            <div className="relative text-center">
              <div className="w-16 h-16 bg-brand rounded-full flex items-center justify-center mx-auto mb-6 border-4 border-white shadow-sm z-10 relative text-xl font-bold tracking-[-0.02em] text-white">
                4
              </div>
              <h3 className="text-base font-semibold tracking-[-0.012em] leading-snug text-balance text-slate-900 mb-2">Shipping & Delivery</h3>
              <p className="text-sm text-slate-600 leading-[1.6] tracking-[-0.003em] text-pretty">Logistics and customs clearance handled up to Chennai.</p>
            </div>
          </div>
        </div>
      </section>

      {/* Industries */}
      <section className="py-16 lg:py-24 bg-slate-50 border-t border-slate-200">
        <div className="max-w-[1200px] mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-12">
            <h2 className="text-[1.75rem] sm:text-4xl font-semibold tracking-[-0.018em] leading-[1.12] text-balance text-slate-900 mb-5">
              Industries We Serve
            </h2>
          </div>
          <div className="flex flex-wrap justify-center gap-4">
            {["Electronics", "Automotive Parts", "Apparel & Textiles", "Machinery", "Beauty & Personal Care", "Home & Garden", "Medical Supplies", "Construction Materials"].map((ind) => (
              <Link
                key={ind}
                // Straight to /products/ — /categories only 308s here anyway,
                // so linking to it made every one of these pills a wasted hop.
                href="/products/"
                className="bg-white border border-slate-200 hover:border-brand px-6 py-3 rounded-full text-sm font-medium tracking-[-0.008em] text-slate-700 hover:text-brand transition-colors"
              >
                {ind}
              </Link>
            ))}
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
          <div className="space-y-6">
            {faqs.map((faq, i) => (
              <div key={i} className="border-b border-slate-100 pb-6">
                <h3 className="text-lg font-semibold tracking-[-0.016em] leading-snug text-balance text-slate-900 mb-2.5">{faq.question}</h3>
                <p className="text-slate-600 leading-[1.6] tracking-[-0.003em] text-pretty">{faq.answer}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Final CTA */}
      <section className="py-16 bg-brand text-white text-center">
        <div className="max-w-[1200px] mx-auto px-4 sm:px-6 lg:px-8">
          <h2 className="text-[1.75rem] sm:text-4xl font-semibold tracking-[-0.018em] leading-[1.12] text-balance mb-6">Ready to Import from China to Chennai?</h2>
          <p className="text-brand-50 mb-8 max-w-2xl mx-auto leading-[1.6] tracking-[-0.003em] text-pretty">
            Contact AFFHAN Group today to discuss your product sourcing needs. We offer free consultation and competitive quotes for all businesses in Chennai.
          </p>
          <Link
            href="/contact"
            className="inline-block bg-white text-brand px-10 py-4 rounded-full font-semibold tracking-[-0.01em] text-[17px] hover:bg-slate-50 transition-colors shadow-lg"
          >
            Contact Us Now
          </Link>
        </div>
      </section>
      
      <FooterSection />
    </main>
  );
}
