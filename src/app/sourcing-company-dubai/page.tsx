import { Metadata } from "next";
import Link from "next/link";
import Image from "next/image";
import { CheckCircle2 } from "lucide-react";
import { FooterSection } from "@/components/sections/FooterSection";
import dynamic from "next/dynamic";
import { CountUpStat } from "@/components/ui/CountUpStat";
import { prisma } from "@/lib/prisma";
import { buildCategoryTree, getCategoryIcon } from "@/lib/categoryTree";
import { PinnedScrollPanel } from "@/components/ui/pinned-scroll-panel";

const SourcingProcessSection = dynamic(() => import("@/components/sections/SourcingProcessSection").then(mod => mod.SourcingProcessSection), { ssr: true });
const FaqAccordion = dynamic(() => import("@/components/sections/FaqAccordion").then(mod => mod.FaqAccordion), { ssr: true });

// Hourly ISR rather than a dynamic render. The catalog counts move slowly, and
// this is a search landing page — it should stay statically served and fast,
// with the figures refreshed in the background instead of a DB round trip on
// every request.
export const revalidate = 3600;

// 64 chars, fits well under Google's 65-70 char truncation limit. Covers primary
// and secondary keywords perfectly.
const PAGE_TITLE = "Sourcing Company in Dubai | China Sourcing Agent | AFFHAN Group";

// 156 chars, perfectly fits in the ~155-160 char limit for Google meta descriptions.
const PAGE_DESCRIPTION =
  "Top-rated China sourcing agent and import export company in Dubai, UAE. We handle product sourcing, factory audits, and freight forwarding to Jebel Ali.";

export const metadata: Metadata = {
  title: PAGE_TITLE,
  description: PAGE_DESCRIPTION,
  alternates: {
    canonical: "https://affhan.com/sourcing-company-dubai/",
  },
  openGraph: {
    title: PAGE_TITLE,
    description: PAGE_DESCRIPTION,
    url: "https://affhan.com/sourcing-company-dubai/",
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

const FOUNDED_YEAR = 2000;
const yearsTrading = new Date().getFullYear() - FOUNDED_YEAR;

const faqs = [
  {
    question: "How does AFFHAN help Dubai importers source from China?",
    answer:
      `With over ${yearsTrading} years of global trade experience, our on-the-ground team in China connects Dubai businesses directly to verified manufacturers, eliminating middlemen and streamlining the entire procurement process.`,
  },
  {
    question: "What are shipping times from China to Dubai?",
    answer:
      "Shipping times depend on the freight method. Air freight from China to Dubai typically takes 3-7 days, while Sea Freight (LCL/FCL) to Jebel Ali Port usually takes 15-25 days depending on the origin port and shipping line.",
  },
  {
    question: "Do you handle customs clearance in Dubai and the UAE?",
    answer:
      "Yes! As a comprehensive import export company in Dubai, we manage end-to-end logistics including customs clearance in the UAE, ensuring your goods arrive safely at your warehouse or free zone.",
  },
  {
    question: "Why use a China sourcing agent in Dubai instead of Alibaba?",
    answer:
      "Using AFFHAN gives you local accountability in Dubai combined with physical factory audits in China. We negotiate better prices, inspect goods before they ship, and consolidate freight, protecting you from scams and quality defects.",
  },
  {
    question: "Can you help businesses in DMCC or other UAE Free Zones?",
    answer:
      "Absolutely. We frequently work with companies located in DMCC, JAFZA, and other UAE free zones, providing seamless logistics and re-export solutions for the broader GCC market.",
  },
  {
    question: "What product categories can you source?",
    answer:
      "We source from a vast catalog of over 10 Lakhs+ products across 500+ categories, ranging from industrial machinery and electronics to building materials and consumer goods.",
  },
  {
    question: "Should my goods land in a UAE free zone or on the mainland?",
    answer:
      "It depends on where they go next. Goods held in a free zone such as JAFZA or DMCC stay under customs suspension, with duty payable only if they enter the mainland, which suits stock intended for re-export. Cargo being sold inside the UAE is usually cleared to the mainland directly. Decide before booking, because moving goods between the two afterwards adds cost.",
  },
  {
    question: "Can you consolidate orders from several Chinese suppliers into one shipment?",
    answer:
      "Yes. Cargo from different factories is brought together at our Guangzhou warehouse, checked, and shipped as a single consignment to Jebel Ali. For distributors this is usually a larger saving than negotiating unit prices, because it removes duplicate freight and handling charges on part-container loads.",
  },
];

const schema = {
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "LocalBusiness",
      "@id": "https://affhan.com/#localbusiness-dubai",
      name: "AFFHAN International - Dubai Office",
      url: "https://affhan.com",
      logo: "https://affhan.com/images/logo.png",
      image: "https://affhan.com/images/logo.png",
      description:
        "AFFHAN is a premier sourcing company in Dubai for China imports, product sourcing & freight forwarding to the UAE and GCC.",
      telephone: "+971544065867",
      email: "info@affhan.com",
      address: {
        "@type": "PostalAddress",
        streetAddress: "Office No: 203, White Crown Building, Plot No. 335 - 335, Sheikh Zayed Road",
        addressLocality: "Dubai",
        addressRegion: "Dubai",
        postalCode: "7184",
        addressCountry: "AE",
      },
    },
    {
      "@type": "Service",
      serviceType: "Product Sourcing and Freight Forwarding",
      provider: {
        "@id": "https://affhan.com/#localbusiness-dubai",
      },
      areaServed: {
        "@type": "City",
        name: "Dubai",
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

// Blocks for the "Inside Our Dubai Operation" sticky-scroll section. Held as
// data so the markup below stays one mapped row instead of three near-identical
// copies, and so adding a fourth block is a single entry.
//
// The aspect ratios differ per block on purpose. No single ratio suits both a
// portrait office photograph and the landscape group shot: cropping the group
// to portrait pushes the two people on the ends out of frame, and cropping the
// office shots to landscape loses the desk. Both values are fixed, so a
// per-block ratio costs nothing in layout shift.
//
// Per-block ratios are only workable because the panel cross-fades between
// blocks rather than stacking one over another. A stack needs every frame the
// same shape to hide the one underneath, and there is no shape that suits both
// a portrait office shot and a landscape group photo.
//
// The class strings have to appear here verbatim — Tailwind scans source text,
// so `aspect-[4/5]` and `aspect-[3/2]` are only generated because they are
// written out literally. Both are checked in the built CSS.
const dubaiTeamBlocks = [
  {
    id: "office",
    heading: "The office on Sheikh Zayed Road",
    src: "/dubai-team/dubai-office-reception.webp",
    alt: "Reception desk carrying the AFFHAN logo at the company's Dubai sourcing office",
    aspect: "aspect-[4/5]",
    body: [
      "The UAE side of the business runs from an office on Sheikh Zayed Road, and it is a working office rather than a mailing address. Visitors are welcome, and a good deal of what we do still gets settled across a desk rather than over email.",
      "Buyers arrive with a sample in a carrier bag more often than you would expect. Being able to hand a physical part to someone who will photograph it, write the specification and put it in front of our buyers the same afternoon takes a week out of a conversation that email alone never quite finishes.",
    ],
  },
  {
    id: "desk",
    heading: "The desk that owns your order",
    src: "/dubai-team/dubai-team-desks.webp",
    alt: "AFFHAN Dubai coordinators at their desks managing China to UAE sourcing orders",
    aspect: "aspect-[4/5]",
    body: [
      "Every order is assigned to one coordinator here, and that person stays with it from the first quotation through to the day it is delivered. Nobody is handed between a sales contact, an operations contact and an accounts contact, and you never have to explain the order twice.",
      "China runs four hours ahead of the UAE, which turns out to be an advantage rather than a nuisance. A question raised in Dubai first thing reaches our buyers in Guangzhou while the factory day is still running, and the answer is usually back before this office closes.",
    ],
  },
  {
    id: "corridor",
    heading: "One team at both ends of the corridor",
    src: "/dubai-team/dubai-team-group.webp",
    alt: "The six-person AFFHAN Dubai team in branded uniform at the company's UAE office",
    aspect: "aspect-[3/2]",
    body: [
      "The people in this photograph and the buyers walking factory floors in Guangzhou work for the same company. That sounds like a small distinction and it is not — most sourcing offers in the region are a local desk that forwards your enquiry to an unrelated agent in China and adds a margin to whatever comes back.",
      "It matters most when something is wrong. If an inspection finds a batch short or a finish off-specification, we are arguing with the factory on your behalf rather than relaying messages between two parties who have never met. A problem caught at the factory also tends to get fixed at the factory, which is the only place it is cheap to fix.",
    ],
  },
  // Fourth slot, intentionally empty. Drop in a photograph taken by the team —
  // the building entrance or the office door — fill in the copy, and it renders
  // with no other change.
  //
  // Not filled from public/employees-dubai: image-3 there is a Google Street
  // View capture watermarked "© 2016 Google", which is Google's imagery rather
  // than ours, and image-5 is the nameplate photograph, which would put two
  // L.L.C names on the page that have not been confirmed as current.
  // {
  //   id: "exterior",
  //   heading: "",
  //   src: "/dubai-team/____.webp",
  //   alt: "",
  //   aspect: "aspect-[4/5]",
  //   body: ["", ""],
  // },
];

export default async function SourcingCompanyDubaiPage() {
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

  return (
    <main className="w-full bg-slate-50 min-h-screen pb-0">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(schema) }}
      />

      <section className="relative isolate overflow-hidden">
        <div className="hero-aurora z-0" aria-hidden="true">
          <span className="hero-blob hero-blob-1" />
          <span className="hero-blob hero-blob-2" />
        </div>
        
        <div className="relative z-10 flex min-h-svh items-center pt-24 pb-12 lg:pb-20">
          <div className="w-full max-w-[1200px] mx-auto px-4 sm:px-6 lg:px-8">
        
        <div className="text-center max-w-4xl mx-auto">
          
          <h1 className="hero-rise hero-rise-1 text-3xl sm:text-4xl lg:text-5xl font-bold tracking-[-0.022em] leading-[1.1] text-balance text-slate-900 mb-5 sm:mb-6">
            Leading Sourcing Company in Dubai — <span className="text-[#1d7e93]">AFFHAN Group</span>
          </h1>
          
          <p className="hero-rise hero-rise-2 max-w-2xl mx-auto text-base sm:text-[17px] text-slate-600 mb-9 sm:mb-10 leading-[1.65] tracking-[-0.004em] text-pretty">
            Most cargo moving from China into the Gulf comes through Jebel Ali, and the buyers who do well there are the ones who fixed quality before the container sailed. That is the work of a <strong className="text-slate-800">China sourcing agent in Dubai</strong>: factory checks in Guangzhou first, then an <strong className="text-slate-800">import export company in the UAE</strong> to book, consolidate and clear the shipment. AFFHAN has run this corridor since {FOUNDED_YEAR} as a <strong className="text-slate-800">product sourcing agent</strong> for traders supplying the UAE and the wider GCC.
          </p>
          
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

      <section className="bg-gradient-to-b from-[#f2fafc] via-[#f7fcfd] to-white py-10 lg:py-8 border-y border-slate-200 min-h-[calc(100svh-4rem)] flex flex-col justify-center">
        <div className="max-w-[1200px] mx-auto px-4 sm:px-6 lg:px-8 w-full">
          <div className="text-center mb-8">
            <h2 className="text-[1.75rem] sm:text-3xl lg:text-4xl font-semibold tracking-[-0.018em] leading-[1.12] text-balance text-slate-900 mb-3">
              Our Sourcing Services in Dubai
            </h2>
            <p className="text-slate-600 max-w-2xl mx-auto text-sm sm:text-base leading-[1.6] tracking-[-0.003em] text-pretty">
              Sourcing, verification and freight, run by one team at both ends of the corridor. For a trading company here the risk is rarely the shipping line — it is what went into the container. Product sourcing in Dubai works when somebody has looked at the goods in China before they move.
            </p>
          </div>

          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6 lg:gap-8">
            <div className="liquid-glass-card overflow-hidden">
              <div className="relative aspect-[3/2] w-full bg-slate-100">
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
                <h3 className="text-lg sm:text-xl font-semibold tracking-[-0.016em] leading-snug text-balance text-slate-900 mb-2">Factory-Direct Sourcing</h3>
                <p className="text-slate-600 text-sm sm:text-base leading-[1.5] tracking-[-0.003em] text-pretty">
                  Send a sample, a drawing or a photograph. We identify the manufacturers already producing it, negotiate in Mandarin at the factory gate, and price the order landed into the UAE — across 500+ categories.
                </p>
              </div>
            </div>

            <div className="liquid-glass-card overflow-hidden">
              <div className="relative aspect-[3/2] w-full bg-slate-100">
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
                <h3 className="text-lg sm:text-xl font-semibold tracking-[-0.016em] leading-snug text-balance text-slate-900 mb-2">Supplier Vetting &amp; Factory Audits</h3>
                <p className="text-slate-600 text-sm sm:text-base leading-[1.5] tracking-[-0.003em] text-pretty">
                  A verified listing is not a verified factory. We confirm the company is licensed to export, then visit and photograph the premises, so you know what you are paying for well before the balance falls due.
                </p>
              </div>
            </div>

            <div className="liquid-glass-card overflow-hidden">
              <div className="relative aspect-[3/2] w-full bg-slate-100">
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
                <h3 className="text-lg sm:text-xl font-semibold tracking-[-0.016em] leading-snug text-balance text-slate-900 mb-2">Freight to Jebel Ali</h3>
                <p className="text-slate-600 text-sm sm:text-base leading-[1.5] tracking-[-0.003em] text-pretty">
                  Consolidation at our Guangzhou hub, a booking on the right service, and documentation prepared for Dubai Customs. Cargo can be released to a mainland warehouse or held in a free zone, depending on where it is going next.
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Corridor detail for the UAE end. The nine-stage workflow below is
          deliberately shared with the Chennai page — the order runs the same
          way wherever it lands — so everything specific to Dubai lives here.
          Transit figures match the FAQ further down this page so the two
          cannot contradict each other. */}
      <section className="py-16 lg:py-24 bg-gradient-to-b from-white to-[#f5fbfd] border-t border-slate-200">
        <div className="max-w-[1200px] mx-auto px-4 sm:px-6 lg:px-8 w-full">
          <div className="text-center mb-10 lg:mb-12">
            <h2 className="text-[1.75rem] sm:text-4xl font-semibold tracking-[-0.018em] leading-[1.12] text-balance text-slate-900 mb-4">
              What it takes to land a China shipment in the UAE
            </h2>
            <p className="text-slate-600 max-w-2xl mx-auto text-sm sm:text-base leading-[1.65] tracking-[-0.003em] text-pretty">
              The China&ndash;UAE corridor is one of the busiest in the world and it is well served, so the variable is rarely the shipping. It is whether the right goods were loaded, and whether the declaration matches them.
            </p>
          </div>
          <div className="max-w-6xl mx-auto bg-white/40 backdrop-blur-md p-6 sm:p-8 lg:p-10 rounded-3xl border border-white/60 shadow-[0_8px_30px_rgb(0,0,0,0.04)]">
            <div className="grid gap-8 lg:gap-10 lg:grid-cols-3">
              <div>
                <h3 className="text-lg sm:text-xl font-semibold tracking-[-0.016em] leading-snug text-slate-900 mb-3">
                  Ports, airports and transit times
                </h3>
                <p className="text-slate-600 text-sm sm:text-[15px] leading-[1.7] tracking-[-0.003em] text-pretty">
                  Jebel Ali takes most of the container volume arriving from China, with Port Rashid handling smaller and specialised cargo and Khalifa Port serving buyers closer to Abu Dhabi. Air freight moves through Dubai International and Al Maktoum. As planning ranges rather than promises, sea freight from China to Jebel Ali runs roughly 15 to 25 days depending on the origin port and the service, and air freight 3 to 7 days. Consolidating at our Guangzhou hub lets a buyer combine several factories&apos; output into one booking instead of paying part-container rates three times over.
                </p>
              </div>
              <div>
                <h3 className="text-lg sm:text-xl font-semibold tracking-[-0.016em] leading-snug text-slate-900 mb-3">
                  Declarations, duty and VAT
                </h3>
                <p className="text-slate-600 text-sm sm:text-[15px] leading-[1.7] tracking-[-0.003em] text-pretty">
                  Import declarations are filed with Dubai Customs, and goods are assessed against the GCC common external tariff that applies across the customs union. VAT is charged at import and, for a VAT-registered business, accounted for through the return rather than absorbed as a cost — a timing question more than an added expense, as in most VAT systems. The practical requirement is a valid trade licence with a customs importer code registered against it: the declaration has to be made by an entity entitled to import.
                </p>
              </div>
              <div>
                <h3 className="text-lg sm:text-xl font-semibold tracking-[-0.016em] leading-snug text-slate-900 mb-3">
                  Free zones and why Dubai re-exports
                </h3>
                <p className="text-slate-600 text-sm sm:text-[15px] leading-[1.7] tracking-[-0.003em] text-pretty">
                  This is what makes Dubai a hub rather than a destination. Goods landed into a free zone such as JAFZA or DMCC sit under customs suspension: no import duty is due while they remain inside, and it becomes payable only if they cross into the mainland. Cargo that leaves again for another market can do so without ever having attracted UAE import duty. That mechanism is why one container from China can be broken down here and moved on to several GCC markets — and why it is worth deciding where a shipment will land before it is booked rather than after it arrives.
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Inside Our Dubai Operation.

          The panel holds still for three viewports of scroll while the block
          inside it cross-fades, one at a time — screen fixed, content changing,
          rather than the earlier version where each image pinned inside its own
          row.

          That earlier version could not do this, and the reason is worth
          recording. A sticky image stays pinned for (row height - image height)
          pixels, so equal rows gave a 230px pin on the 4:5 blocks and 543px on
          the 3:2 one at a 900px viewport, widening to 7x at 720px — the images
          and their copy visibly drifting apart. Worse, rows sat flush against
          each other, so the outgoing image ended exactly where the incoming one
          began and both were on screen while the boundary crossed. No amount of
          tuning removes that: the gap between them would have to exceed a whole
          viewport, which means a screen of dead space between every block.
          Restructuring into one shared grid does not help either, because a
          grid item's containing block is its grid area, so each image stays
          confined to its own row regardless.

          A held panel needs to know which block is current, which needs
          measurement, so this carries a small client component — one
          IntersectionObserver over three empty markers, no scroll library and
          no motion library. The cross-fade itself is a CSS opacity transition.

          Every block stays mounted throughout. Swapping content through
          AnimatePresence would unmount the inactive ones and take roughly 250
          words of indexable copy out of the HTML with them. Under mobile-first
          indexing the `lg:` variants never apply at all, so a crawler renders
          all three stacked, in flow, fully visible. */}
      <section className="py-16 lg:py-0 bg-white border-t border-slate-200">
        {/* The header is passed into the panel rather than sitting above it, so
            the two pin together. Outside the panel it was separated from the
            first block by half a viewport of dead space — the panel was a full
            screen tall with its contents centred — and the block then jumped
            upward the moment the panel stuck. */}
        <PinnedScrollPanel blocks={dubaiTeamBlocks}>
          <div className="text-center max-w-2xl mx-auto">
            <h2 className="text-[1.75rem] sm:text-4xl font-semibold tracking-[-0.018em] leading-[1.12] text-balance text-slate-900 mb-4">
              Inside Our Dubai Operation
            </h2>
            <p className="text-slate-600 text-sm sm:text-base leading-[1.65] tracking-[-0.003em] text-pretty">
              Sourcing is a trust business, and most of it happens somewhere the buyer cannot see. This is the part that sits in the UAE — the office, the people, and how the work is actually split between here and China.
            </p>
          </div>
        </PinnedScrollPanel>
      </section>

      <SourcingProcessSection />

      {/* The UAE-side counterpart to the shared workflow. Same narrow measure
          and CheckCircle2 list the Chennai page uses for its equivalent
          section, so no new pattern is introduced on either. */}
      <section className="py-16 lg:py-24 bg-white border-t border-slate-200">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8">
          <h2 className="text-[1.75rem] sm:text-4xl font-semibold tracking-[-0.018em] leading-[1.12] text-balance text-slate-900 mb-6">
            What a UAE importer needs in place
          </h2>
          <p className="text-slate-600 text-[15px] sm:text-base leading-[1.75] tracking-[-0.003em] text-pretty mb-5">
            Everything above is the order itself. Around it sits a handful of decisions particular to this market, and getting those wrong costs money in a way the order rarely does.
          </p>
          <p className="text-slate-600 text-[15px] sm:text-base leading-[1.75] tracking-[-0.003em] text-pretty mb-6">
            The first question is usually where your company sits. A mainland licence and a free zone licence both permit import, but they change where the goods should land and when duty falls due. A trader supplying UAE retailers and a distributor consolidating for onward shipment to Saudi Arabia or East Africa will not reach the same answer, and it is cheaper to settle before a booking than to move cargo between the two afterwards. What we ask for at the start:
          </p>
          <ul className="space-y-3.5 mb-6">
            <li className="flex items-start gap-3 text-slate-700 text-[15px] sm:text-base leading-[1.6]">
              <CheckCircle2 className="w-5 h-5 shrink-0 text-[#1d7e93] mt-0.5" />
              A valid trade licence, with a customs importer code registered against it
            </li>
            <li className="flex items-start gap-3 text-slate-700 text-[15px] sm:text-base leading-[1.6]">
              <CheckCircle2 className="w-5 h-5 shrink-0 text-[#1d7e93] mt-0.5" />
              A decision on whether the cargo lands in a free zone or clears to the mainland
            </li>
            <li className="flex items-start gap-3 text-slate-700 text-[15px] sm:text-base leading-[1.6]">
              <CheckCircle2 className="w-5 h-5 shrink-0 text-[#1d7e93] mt-0.5" />
              Agreed Incoterms — FOB China and CIF Jebel Ali stop at very different points, and the gap is yours to cover
            </li>
            <li className="flex items-start gap-3 text-slate-700 text-[15px] sm:text-base leading-[1.6]">
              <CheckCircle2 className="w-5 h-5 shrink-0 text-[#1d7e93] mt-0.5" />
              For onward GCC movement, documentation prepared at import rather than retrofitted later
            </li>
          </ul>
          <p className="text-slate-600 text-[15px] sm:text-base leading-[1.75] tracking-[-0.003em] text-pretty mb-5">
            A factory&apos;s FOB quotation and a delivered price into your warehouse are not comparable numbers, and the distance between them is where most margin surprises live. We quote the whole movement so there is one figure to work from.
          </p>
          <p className="text-slate-600 text-[15px] sm:text-base leading-[1.75] tracking-[-0.003em] text-pretty">
            For distributors serving more than one market, the saving usually comes from consolidation rather than negotiation — several suppliers&apos; cargo brought together in Guangzhou, shipped once, and split here.
          </p>
        </div>
      </section>

      <section className="py-16 lg:py-24 bg-slate-50 border-t border-slate-200 min-h-[calc(100svh-4rem)] flex flex-col justify-center">
        <div className="max-w-[1200px] mx-auto px-4 sm:px-6 lg:px-8 w-full">
          <div className="text-center mb-12">
            <h2 className="text-[1.75rem] sm:text-4xl font-semibold tracking-[-0.018em] leading-[1.12] text-balance text-slate-900 mb-5">
              Sectors We Source For in Dubai and the GCC
            </h2>
            <p className="text-slate-600 max-w-2xl mx-auto text-sm sm:text-base leading-[1.65] tracking-[-0.003em] text-pretty mt-4">
              Demand in the UAE tends to be either project-led or resale-led, and the two buy very differently. These are the sectors that reach us most often.
            </p>
          </div>
          {/* liquid-glass-card used text-only here — it is a surface class, so
              it needs no image child and adds no new visual pattern. */}
          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-5 lg:gap-6 mb-10 lg:mb-12">
            <div className="liquid-glass-card p-5 sm:p-6">
              <h3 className="text-base sm:text-lg font-semibold tracking-[-0.016em] leading-snug text-slate-900 mb-2">Building materials and MEP</h3>
              <p className="text-slate-600 text-sm leading-[1.6] tracking-[-0.003em] text-pretty">
                Contractors and fit-out firms order sanitaryware, tiles, cable, lighting, ducting and HVAC components against a programme date, where a slipped delivery costs more than the goods themselves. Production and shipping get scheduled to the site programme, not the other way round.
              </p>
            </div>
            <div className="liquid-glass-card p-5 sm:p-6">
              <h3 className="text-base sm:text-lg font-semibold tracking-[-0.016em] leading-snug text-slate-900 mb-2">Retail, wholesale and trading</h3>
              <p className="text-slate-600 text-sm leading-[1.6] tracking-[-0.003em] text-pretty">
                The Deira and Naif trading houses and Dragon Mart resellers buy consumer goods, houseware and seasonal ranges on short cycles, where landing a container before the season is worth considerably more than shaving the unit price.
              </p>
            </div>
            <div className="liquid-glass-card p-5 sm:p-6">
              <h3 className="text-base sm:text-lg font-semibold tracking-[-0.016em] leading-snug text-slate-900 mb-2">Hospitality and F&amp;B</h3>
              <p className="text-slate-600 text-sm leading-[1.6] tracking-[-0.003em] text-pretty">
                Hotel and restaurant projects source kitchen equipment, furniture, uniforms and disposables against a specification that has to be matched exactly rather than approximated, usually with a sample signed off before production starts.
              </p>
            </div>
            <div className="liquid-glass-card p-5 sm:p-6">
              <h3 className="text-base sm:text-lg font-semibold tracking-[-0.016em] leading-snug text-slate-900 mb-2">Industrial and oil-field supply</h3>
              <p className="text-slate-600 text-sm leading-[1.6] tracking-[-0.003em] text-pretty">
                Suppliers into the energy sector order safety equipment, valves, fittings and workshop consumables where certification is the binding constraint and has to be verified at the factory, not accepted on a datasheet.
              </p>
            </div>
          </div>
          <p className="text-center text-slate-500 text-sm sm:text-[15px] leading-[1.6] mb-6 max-w-2xl mx-auto">
            Most enquiries reach us as a photograph rather than a category. Browse the listing if it helps, or simply send the product across and let us go and find who makes it.
          </p>
          <div className="max-w-6xl mx-auto bg-white/40 backdrop-blur-md p-6 sm:p-8 rounded-3xl border border-white/60 shadow-[0_8px_30px_rgb(0,0,0,0.04)]">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-x-6 gap-y-2">
              {tree.slice(0, 16).map((cat) => {
                const Icon = getCategoryIcon(cat.name);
                return (
                  <Link
                    key={cat.id}
                    href={`/products?categoryId=${cat.id}`}
                    className="group flex items-start gap-3.5 px-4 py-3.5 text-left transition-all border-l-4 border-transparent hover:bg-white/60 hover:shadow-sm hover:border-[#27a8c4] rounded-r-xl"
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
        </div>
      </section>

      <section className="py-16 lg:py-24 bg-slate-900 text-white min-h-[calc(100svh-4rem)] flex flex-col justify-center overflow-hidden relative">
        <div className="absolute top-0 right-0 -mr-48 -mt-48 w-96 h-96 bg-[#27a8c4]/10 rounded-full blur-3xl pointer-events-none" />

        <div className="max-w-[1200px] mx-auto px-4 sm:px-6 lg:px-8 relative z-10 w-full">
          <div className="grid lg:grid-cols-2 gap-12 items-center">
            <div>
              <h2 className="text-[1.75rem] sm:text-4xl font-semibold tracking-[-0.018em] leading-[1.12] text-balance mb-6">
                What a Dubai sourcing partner should actually do
              </h2>
              <p className="text-slate-300 mb-8 leading-[1.6] tracking-[-0.003em] text-pretty">
                Anyone can forward a quotation and add a margin. The value sits in the part that happens in China — the factory visit, the sample approval, the inspection before release — and in a Dubai office that answers when a shipment needs a decision that day.
              </p>
              <ul className="space-y-4 mb-8">
                <li className="flex items-center gap-3 text-slate-200">
                  <CheckCircle2 className="w-5 h-5 shrink-0 text-brand" /> A permanent team in China, so an audit never waits on a third party
                </li>
                <li className="flex items-center gap-3 text-slate-200">
                  <CheckCircle2 className="w-5 h-5 shrink-0 text-brand" /> Pre-shipment inspection reported with photographs and video before release
                </li>
                <li className="flex items-center gap-3 text-slate-200">
                  <CheckCircle2 className="w-5 h-5 shrink-0 text-brand" /> Consolidated sea and air freight into Jebel Ali, cleared and delivered
                </li>
                <li className="flex items-center gap-3 text-slate-200">
                  <CheckCircle2 className="w-5 h-5 shrink-0 text-brand" /> In the trade since {FOUNDED_YEAR}, and {yearsTrading} years on this corridor
                </li>
              </ul>
              <div className="flex flex-col sm:flex-row gap-4 sm:gap-6 mt-6">
                <Link
                  href="/about"
                  className="inline-flex items-center justify-center gap-2 text-brand font-semibold hover:text-brand-dark transition-colors"
                >
                  Learn more about our company →
                </Link>
                <Link
                  href="/sourcing-company-chennai"
                  className="inline-flex items-center justify-center gap-2 text-slate-400 font-medium hover:text-slate-200 transition-colors"
                >
                  Looking for our India office? See Chennai →
                </Link>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="bg-slate-800 p-6 rounded-2xl text-center">
                <div className="text-[1.75rem] sm:text-4xl font-bold tracking-[-0.032em] leading-none text-brand mb-2 tabular-nums whitespace-nowrap">
                  <CountUpStat value={Math.floor(productCount / 100000)} suffix=" Lakhs+" />
                </div>
                <div className="text-sm text-slate-400 font-medium uppercase tracking-wider">Products</div>
              </div>
              <div className="bg-slate-800 p-6 rounded-2xl text-center">
                <div className="text-[1.75rem] sm:text-4xl font-bold tracking-[-0.032em] leading-none text-brand mb-2 tabular-nums whitespace-nowrap">
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

      <section className="py-16 lg:py-24 bg-white">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-12">
            <h2 className="text-[1.75rem] sm:text-4xl font-semibold tracking-[-0.018em] leading-[1.12] text-balance text-slate-900 mb-5">
              Frequently Asked Questions
            </h2>
          </div>
          <FaqAccordion faqs={faqs} />
        </div>
      </section>

      <FooterSection />
    </main>
  );
}
