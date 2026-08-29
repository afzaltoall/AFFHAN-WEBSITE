import { Metadata } from "next";
import Link from "next/link";
import { CheckCircle2 } from "lucide-react";
import { FooterSection } from "@/components/sections/FooterSection";
import { OtherLocations } from "@/components/sections/OtherLocations";
import dynamic from "next/dynamic";
import { CountUpStat } from "@/components/ui/CountUpStat";
import { prisma } from "@/lib/prisma";
import { GoogleRating } from "@/components/ui/google-rating";
import { ORG_ID } from "@/lib/brand";

const FaqAccordion = dynamic(() => import("@/components/sections/FaqAccordion").then(mod => mod.FaqAccordion), { ssr: true });

// Hourly ISR, matching the other landing pages: the catalogue figures move
// slowly and this page should stay statically served.
export const revalidate = 3600;

// 62 chars — inside Google's ~65 char truncation point.
const PAGE_TITLE = "China Sourcing Company | Import Export Partner in China – AFFHAN";

// 154 chars. Carries both target phrases without reading like a keyword list.
const PAGE_DESCRIPTION =
  "AFFHAN is a China sourcing company and import export company with its own buying office in Guangzhou. Factory sourcing, inspection and freight since 2000.";

export const metadata: Metadata = {
  title: PAGE_TITLE,
  description: PAGE_DESCRIPTION,
  alternates: {
    canonical: "https://affhan.com/china-sourcing-company/",
  },
  openGraph: {
    title: PAGE_TITLE,
    description: PAGE_DESCRIPTION,
    url: "https://affhan.com/china-sourcing-company/",
    type: "website",
    siteName: "AFFHAN Group",
    images: [{ url: "/images/logo.png", width: 800, height: 600 }],
  },
  twitter: { card: "summary_large_image", title: PAGE_TITLE, description: PAGE_DESCRIPTION },
};

const FOUNDED_YEAR = 2000;
const yearsTrading = new Date().getFullYear() - FOUNDED_YEAR;

/**
 * Written for a buyer deciding whether to hire anyone at all, which is what
 * separates this page from /china-sourcing-office-guangzhou/.
 *
 * That page answers "what happens inside your Chinese office" — factory
 * clusters, the Canton Fair, consolidation, how a failed inspection is
 * handled. This one answers "what is a China sourcing company, and how do I
 * pick one". No question, answer or example is shared between the two; the
 * overlap risk was the whole reason to check before writing.
 */
const faqs = [
  {
    question: "What does a China sourcing company do?",
    answer:
      "It stands between you and the factory and takes on the parts of an import you cannot do from another country. In practice that means identifying manufacturers that genuinely make the product rather than trading offices that resell it, negotiating in Mandarin against local price expectations, approving samples, inspecting the goods before they are paid for in full, and moving the shipment through export and import customs. The test of one is not whether it can find a supplier — anyone can send an enquiry through a B2B directory — but whether it is standing in the factory when the goods are packed.",
  },
  {
    question: "How do I find a reliable sourcing agent in China?",
    answer:
      "Ask three questions and the field narrows quickly. First, do they have their own staff in China, or do they forward your enquiry to someone else and add a margin? Second, who employs the inspector — an agent paid by the factory has no reason to fail a batch. Third, will they show you the manufacturer's name, or does the relationship depend on you never learning it? An agent that cannot answer those plainly is a broker, and a broker's interests are not yours when something goes wrong.",
  },
  {
    question: "What are the benefits of using an import export company in China?",
    answer:
      "Price is the one people expect and the smallest in practice. The real gains are that the specification is agreed before production instead of argued after arrival, that a defective batch is found while it is still the supplier's property and still their cost to rework, and that one shipment can be consolidated from several factories instead of paying freight and handling four times. Add the paperwork: an export declaration filed wrongly in China delays the vessel, and an import declaration filed wrongly at your end accrues storage while it is corrected.",
  },
  {
    // Targets "best china sourcing company" the way the search is actually
    // meant: someone typing it wants criteria to judge by, not a company
    // asserting it is the best. Answering the question honestly ranks better
    // than the claim would, and the claim is not one we can substantiate.
    question: "What makes the best China sourcing company for a first-time importer?",
    answer:
      "For a first order, the right partner is the one that reduces the number of ways it can go wrong, not the one quoting lowest. Look for staff employed in China rather than a referral chain, an inspection you pay for rather than one the factory arranges, a landed quotation instead of a factory price you then have to freight yourself, and someone who will handle the customs entry at your end. Cheapest and safest are rarely the same offer on a first shipment, and the gap between them is usually smaller than one rejected batch.",
  },
  {
    question: "How is a sourcing company different from a freight forwarder?",
    answer:
      "A freight forwarder moves goods you have already bought. A sourcing company decides what you buy and from whom, then moves it. Using two separate firms is workable but leaves a seam: when an inspection fails, the forwarder is not involved, and when a shipment is delayed, the sourcing agent has no leverage over the carrier. We do both, which mostly matters on the day something has gone wrong.",
  },
  {
    question: "Do you charge a commission or a margin on the factory price?",
    answer:
      "We quote landed, so the number you see is the number you pay. What we will not do is refuse to say who made the goods. A sourcing arrangement that depends on the buyer never meeting the manufacturer is a fragile one, and it tends to end badly for the buyer rather than the agent.",
  },
  {
    question: "What is the minimum order you will work with?",
    answer:
      "The factory sets its minimum, not us, and it varies enormously — a stock item may ship in dozens while anything needing a mould or a custom colour will not. Tell us the quantity you actually want and we will come back with what is achievable at it, including whether a similar existing product avoids a tooling charge that a first order rarely justifies.",
  },
  {
    question: "Which products can you source from China?",
    // "Over a million products across more than 500 categories" is what the
    // catalogue actually holds (1,068,225 across 509 product-bearing
    // categories). Deliberately not the "hundreds of millions of products"
    // figure that appears in some of the Google Business Profile copy — that
    // is two orders of magnitude above our own database, and a number a buyer
    // could check is a number worth getting right.
    answer:
      "Our catalogue runs to over a million listed products across more than 500 categories, and it is a demonstration of range rather than stock we hold — we source to your specification. The strongest areas are consumer electronics and accessories, hardware and tools, lighting, houseware and kitchen, furniture, textiles and apparel, packaging, and machinery parts. If a product exists in volume in China, the constraint is usually your quantity rather than our access to it.",
  },
];

/**
 * Schema for a service page, not a second branch.
 *
 * Deliberately no LocalBusiness node. The physical business behind this page
 * is the Guangzhou office, which is already described in full on
 * /china-sourcing-office-guangzhou/ under #localbusiness-guangzhou. Declaring
 * it a second time here would either duplicate an entity across two URLs or —
 * worse, with a new @id — invent a second Chinese office that does not exist.
 * That is exactly the fault the recent NAP pass removed from these pages.
 *
 * Instead the Service points at the existing branch by @id, and the
 * site-wide Organization from layout.tsx (foundingDate, sameAs, the address
 * every other page's parentOrganization resolves to) supplies the identity.
 * Google resolves both references across the graph.
 */
const schema = {
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "Service",
      "@id": "https://affhan.com/china-sourcing-company/#service",
      name: "China Sourcing and Import Export Services",
      serviceType: "Product Sourcing, Quality Inspection and Freight Forwarding",
      // The office that actually performs the work, referenced rather than
      // redefined.
      provider: { "@id": "https://affhan.com/#localbusiness-guangzhou" },
      // Buyers are worldwide; the sourcing happens in China.
      areaServed: { "@type": "Country", name: "China" },
      audience: { "@type": "BusinessAudience", name: "Importers, wholesalers and retailers worldwide" },
      hasOfferCatalog: {
        "@type": "OfferCatalog",
        name: "China Sourcing Services",
        itemListElement: [
          "Product Sourcing",
          "Quality Inspection",
          "Customs Clearance",
          "Freight Forwarding",
          "NVOCC Logistics",
          "Door-to-Door Shipping",
        ].map((name) => ({ "@type": "Offer", itemOffered: { "@type": "Service", name } })),
      },
    },
    {
      "@type": "WebPage",
      "@id": "https://affhan.com/china-sourcing-company/#webpage",
      url: "https://affhan.com/china-sourcing-company/",
      name: PAGE_TITLE,
      description: PAGE_DESCRIPTION,
      isPartOf: { "@id": ORG_ID },
      about: { "@id": "https://affhan.com/china-sourcing-company/#service" },
    },
    {
      "@type": "BreadcrumbList",
      itemListElement: [
        { "@type": "ListItem", position: 1, name: "Home", item: "https://affhan.com/" },
        {
          "@type": "ListItem",
          position: 2,
          name: "China Sourcing Company",
          item: "https://affhan.com/china-sourcing-company/",
        },
      ],
    },
    {
      "@type": "FAQPage",
      mainEntity: faqs.map((faq) => ({
        "@type": "Question",
        name: faq.question,
        acceptedAnswer: { "@type": "Answer", text: faq.answer },
      })),
    },
  ],
};

const services = [
  {
    title: "Product Sourcing",
    body: "Send a sample, a drawing or a link. We identify the factories genuinely producing it, price it against two or three of them, and put a costed option in front of you rather than a list of contacts.",
    includes: "factory shortlisting, price negotiation, sample approval, tooling where a product needs it",
  },
  {
    title: "Quality Inspection",
    body: "Goods are checked before they leave the supplier's building, because that is the only point at which a fault is still the supplier's cost rather than yours.",
    includes: "factory audit, in-line checks, pre-shipment inspection, photo and video reports",
  },
  {
    title: "Customs Clearance",
    body: "Export clearance in China and import clearance at the destination, with the commodity code settled at quotation rather than discovered at the port.",
    includes: "export declarations, HS classification, duty assessment, destination clearance",
  },
  {
    title: "Freight Forwarding",
    body: "Sea, air and rail quoted side by side so the choice is yours on cost against speed, not presented as one option because it suits the forwarder.",
    includes: "FCL and LCL booking, air freight, China–Europe rail, insurance",
  },
  {
    title: "NVOCC Logistics",
    body: "We issue our own bills of lading and hold carrier space rather than reselling someone else's allocation, which is what keeps rates steady when the market tightens.",
    includes: "own house bills of lading, carrier contracts, container allocation, tracking",
  },
  {
    title: "Door-to-Door Shipping",
    body: "One party accountable from the factory gate to your warehouse door, so a delay has one owner instead of three companies pointing at each other.",
    includes: "pickup, consolidation, main leg, clearance, final-mile delivery",
  },
];

const steps = [
  {
    n: "01",
    title: "You send the enquiry",
    body: "A sample, a photograph, a specification or a competitor's product, plus the quantity you want and where it ships to. That is enough to start; the detail gets filled in as we go.",
  },
  {
    n: "02",
    title: "We source and quote",
    body: "Our Guangzhou buyers approach manufacturers directly, negotiate, and come back with a landed price. Where it helps, more than one factory is quoted so you can see the spread.",
  },
  {
    n: "03",
    title: "Samples and inspection",
    body: "A sample is approved before production, and the finished goods are inspected in the factory before the balance is paid — the point where a problem is still cheap to fix.",
  },
  {
    n: "04",
    title: "Consolidation and shipping",
    body: "Goods from several suppliers are received, checked and loaded as one shipment. Sea, air or rail, with export clearance filed in China.",
  },
  {
    n: "05",
    title: "Clearance and delivery",
    body: "Import clearance at the destination and delivery to your door, warehouse or fulfilment centre, handled by our own office at the arrival end.",
  },
];

export default async function ChinaSourcingCompanyPage() {
  const [productCount, categoryCount] = await Promise.all([
    prisma.product.count(),
    prisma.category.count({ where: { products: { some: {} } } }),
  ]);

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
              {/* hero-rise-1 is transform-only — this is the LCP element and
                  must not fade in from opacity 0. */}
              <h1 className="hero-rise hero-rise-1 text-3xl sm:text-4xl lg:text-5xl font-bold tracking-[-0.022em] leading-[1.1] text-balance text-slate-900 mb-5 sm:mb-6">
                China Sourcing Company — Your Import Export Partner in{" "}
                <span className="text-[#1d7e93]">China</span>
              </h1>
              <p className="hero-rise hero-rise-2 max-w-2xl mx-auto text-base sm:text-[17px] text-slate-600 mb-9 sm:mb-10 leading-[1.65] tracking-[-0.004em] text-pretty">
                We buy from Chinese factories on behalf of importers in more than a hundred countries. Our buyers work out of{" "}
                <strong className="text-slate-800">Guangzhou</strong> — they are our staff, not an agency we forward your
                enquiry to — and our offices at the arrival end clear and deliver the shipment. Trading since {FOUNDED_YEAR}.
              </p>
              <div className="hero-rise hero-rise-3 flex flex-col sm:flex-row justify-center gap-3 sm:gap-4">
                <Link
                  href="/contact/"
                  className="cta-sheen group inline-flex items-center justify-center gap-2 rounded-xl bg-[#176579] px-8 py-3.5 text-[15px] font-medium tracking-[-0.01em] text-white shadow-[0_1px_2px_rgba(15,23,42,0.05)] transition-all duration-300 ease-out hover:bg-[#0f4d5c] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/40 focus-visible:ring-offset-2 motion-safe:hover:scale-[1.02] motion-safe:active:scale-[0.98]"
                >
                  Request a sourcing quote
                  <span aria-hidden="true" className="transition-transform duration-300 ease-out motion-safe:group-hover:translate-x-1">
                    →
                  </span>
                </Link>
                <Link
                  href="/china-sourcing-office-guangzhou/"
                  className="inline-flex items-center justify-center gap-2 rounded-xl border border-slate-300/80 bg-white/70 px-8 py-3.5 text-[15px] font-medium tracking-[-0.01em] text-slate-800 backdrop-blur-sm transition-all duration-300 ease-out hover:border-brand/45 hover:bg-white hover:text-[#176579] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/40 focus-visible:ring-offset-2"
                >
                  Inside our Guangzhou office
                </Link>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Intro — what the company actually is */}
      <section className="bg-white py-16 lg:py-24 border-y border-slate-200">
        <div className="max-w-[1200px] mx-auto px-4 sm:px-6 lg:px-8">
          <div className="max-w-3xl mx-auto text-center mb-10 lg:mb-12">
            <h2 className="text-[1.75rem] sm:text-4xl font-semibold tracking-[-0.018em] leading-[1.12] text-balance text-slate-900 mb-4">
              An import export company with its own people in China
            </h2>
            <p className="text-slate-600 text-sm sm:text-base leading-[1.65] tracking-[-0.003em] text-pretty">
              Most sourcing offers are a desk in the buyer&apos;s own country that forwards the enquiry to an unrelated agent
              in China and adds a margin to whatever comes back. Ours is one company at both ends of the trade: buyers and
              inspectors in Guangzhou, and offices in Chennai, Dubai, London, Singapore and Melaka that handle arrival.
            </p>
          </div>
          <div className="grid gap-6 lg:gap-8 md:grid-cols-3 max-w-5xl mx-auto">
            <div>
              <h3 className="text-lg font-semibold tracking-[-0.016em] text-slate-900 mb-2">Where we buy</h3>
              <p className="text-slate-600 text-sm sm:text-[15px] leading-[1.7] text-pretty">
                Guangdong for electronics, hardware and lighting; Zhejiang for small commodities; Jiangsu and Shandong for
                textiles and machinery. The office sits in Guangzhou because it reaches all of them.
              </p>
            </div>
            <div>
              <h3 className="text-lg font-semibold tracking-[-0.016em] text-slate-900 mb-2">Who we buy for</h3>
              <p className="text-slate-600 text-sm sm:text-[15px] leading-[1.7] text-pretty">
                Importers, wholesalers, retailers and online sellers — from a first container to a standing programme.
                Buyers in over a hundred countries, with the largest flows into India, the Gulf, the UK and Southeast Asia.
              </p>
            </div>
            <div>
              <h3 className="text-lg font-semibold tracking-[-0.016em] text-slate-900 mb-2">How we are paid</h3>
              <p className="text-slate-600 text-sm sm:text-[15px] leading-[1.7] text-pretty">
                A landed quotation, so the figure you approve is the figure you pay. We will always tell you which factory
                made the goods; an arrangement that depends on you not knowing is not one worth having.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Trust signals */}
      <section className="py-16 lg:py-24 bg-gradient-to-b from-[#f2fafc] via-[#f7fcfd] to-white border-b border-slate-200">
        <div className="max-w-[1200px] mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-10 lg:mb-12">
            <h2 className="text-[1.75rem] sm:text-4xl font-semibold tracking-[-0.018em] leading-[1.12] text-balance text-slate-900 mb-3">
              Why choose AFFHAN as your China sourcing company
            </h2>
            <p className="text-slate-600 max-w-2xl mx-auto text-sm sm:text-base leading-[1.65] text-pretty">
              Four things separate a sourcing partner from a broker, and all four only show up on the day something goes wrong.
            </p>
          </div>
          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4 lg:gap-5">
            {[
              {
                h: "Our own team, not outsourced",
                p: "The buyers negotiating your price and the inspectors walking the factory floor are AFFHAN staff. Nothing is handed to a third-party agent whose interests you cannot see.",
              },
              {
                h: "Inspection before payment",
                p: "Goods are checked in the supplier's building before the balance is released. A short or off-specification batch found there is reworked there.",
              },
              {
                h: `${yearsTrading} years on the corridor`,
                p: `Trading since ${FOUNDED_YEAR}, through seven offices across China, India, the UAE, the UK, France, Singapore and Malaysia — the same company at both ends.`,
              },
              {
                h: "Range without the guesswork",
                p: "Over a million products already catalogued across hundreds of categories, so a request rarely starts from nothing.",
              },
            ].map((c) => (
              <div key={c.h} className="liquid-glass-card p-5 flex flex-col">
                <h3 className="text-base sm:text-lg font-semibold tracking-[-0.016em] leading-snug text-slate-900 mb-2">{c.h}</h3>
                <p className="text-slate-600 text-sm leading-[1.55] text-pretty">{c.p}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Services */}
      <section className="py-16 lg:py-24 bg-slate-50 border-b border-slate-200">
        <div className="max-w-[1200px] mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-10 lg:mb-12">
            <h2 className="text-[1.75rem] sm:text-4xl font-semibold tracking-[-0.018em] leading-[1.12] text-balance text-slate-900 mb-3">
              What we handle in China
            </h2>
            <p className="text-slate-600 max-w-2xl mx-auto text-sm sm:text-base leading-[1.65] text-pretty">
              Six services, run by one company. Taken separately they are ordinary; the value is that no seam runs between them.
            </p>
          </div>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4 lg:gap-5">
            {services.map((s) => (
              <div key={s.title} className="liquid-glass-card p-5 flex flex-col">
                <h3 className="text-lg sm:text-xl font-semibold tracking-[-0.016em] leading-snug text-slate-900 mb-2">{s.title}</h3>
                <p className="text-slate-600 text-sm leading-[1.55] text-pretty">{s.body}</p>
                <p className="mt-auto pt-3 text-[12.5px] leading-[1.5] text-slate-500 border-t border-white/70">
                  <span className="font-semibold text-slate-600">Includes: </span>
                  {s.includes}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Process */}
      <section className="py-16 lg:py-24 bg-white border-b border-slate-200">
        <div className="max-w-[1200px] mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-10 lg:mb-12">
            <h2 className="text-[1.75rem] sm:text-4xl font-semibold tracking-[-0.018em] leading-[1.12] text-balance text-slate-900 mb-3">
              How it works, start to finish
            </h2>
            <p className="text-slate-600 max-w-2xl mx-auto text-sm sm:text-base leading-[1.65] text-pretty">
              Five stages. One coordinator stays with your order through all of them, so you never explain it twice.
            </p>
          </div>
          <ol className="grid gap-4 lg:gap-5 sm:grid-cols-2 lg:grid-cols-5 max-w-6xl mx-auto">
            {steps.map((s) => (
              <li key={s.n} className="liquid-glass-card p-5 flex flex-col">
                <span className="text-[13px] font-bold tracking-[0.18em] text-[#1d7e93] mb-2">{s.n}</span>
                <h3 className="text-base sm:text-lg font-semibold tracking-[-0.016em] leading-snug text-slate-900 mb-2">{s.title}</h3>
                <p className="text-slate-600 text-sm leading-[1.55] text-pretty">{s.body}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      {/* Stats band */}
      <section className="py-16 lg:py-24 bg-slate-900">
        <div className="max-w-[1200px] mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid lg:grid-cols-2 gap-10 lg:gap-16 items-center">
            <div>
              <h2 className="text-[1.75rem] sm:text-4xl font-semibold tracking-[-0.018em] leading-[1.12] text-balance text-white mb-6">
                Sourcing from China without a middleman in between
              </h2>
              <p className="text-slate-300 mb-8 leading-[1.6] text-pretty">
                A company in your country cannot inspect a factory in Guangdong, and an agent in China cannot clear your
                goods at the other end. Being both is the only arrangement that still works when a shipment goes wrong.
              </p>
              <ul className="space-y-4 mb-8">
                <li className="flex items-center gap-3 text-slate-200">
                  <CheckCircle2 className="w-5 h-5 shrink-0 text-brand" /> Our own buyers and inspectors in Guangzhou
                </li>
                <li className="flex items-center gap-3 text-slate-200">
                  <CheckCircle2 className="w-5 h-5 shrink-0 text-brand" /> Sea, air and rail priced side by side
                </li>
                <li className="flex items-center gap-3 text-slate-200">
                  <CheckCircle2 className="w-5 h-5 shrink-0 text-brand" /> Export and import clearance handled in-house
                </li>
                <li className="flex items-center gap-3 text-slate-200">
                  <CheckCircle2 className="w-5 h-5 shrink-0 text-brand" /> Trading since {FOUNDED_YEAR} — {yearsTrading} years
                </li>
              </ul>
              <div className="flex flex-col sm:flex-row gap-4 sm:gap-6 mt-6">
                <Link href="/contact/" className="inline-flex items-center gap-2 text-brand font-semibold hover:text-brand-dark transition-colors">
                  Talk to our sourcing team →
                </Link>
                <Link href="/sourcing-from-china/" className="inline-flex items-center gap-2 text-slate-400 font-medium hover:text-slate-200 transition-colors">
                  Read the buyer&apos;s guide →
                </Link>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="bg-slate-800 p-6 rounded-2xl text-center">
                <div className="text-[1.75rem] sm:text-4xl font-bold tracking-[-0.032em] leading-none text-brand mb-2 tabular-nums whitespace-nowrap">
                  <CountUpStat value={Math.floor(productCount / 100000)} suffix=" Lakhs+" />
                </div>
                <div className="text-xs sm:text-sm text-slate-400 font-medium uppercase tracking-wider leading-tight">Products</div>
              </div>
              <div className="bg-slate-800 p-6 rounded-2xl text-center">
                <div className="text-[1.75rem] sm:text-4xl font-bold tracking-[-0.032em] leading-none text-brand mb-2 tabular-nums whitespace-nowrap">
                  <CountUpStat value={categoryCount} />
                </div>
                <div className="text-xs sm:text-sm text-slate-400 font-medium uppercase tracking-wider leading-tight">Categories</div>
              </div>
              <div className="bg-slate-800 p-6 rounded-2xl text-center">
                <div className="text-[1.75rem] sm:text-4xl font-bold tracking-[-0.032em] leading-none text-brand mb-2 tabular-nums whitespace-nowrap">
                  <CountUpStat value={100} suffix="+" />
                </div>
                <div className="text-xs sm:text-sm text-slate-400 font-medium uppercase tracking-wider leading-tight">Countries</div>
              </div>
              <div className="bg-slate-800 p-6 rounded-2xl text-center">
                <div className="text-[1.75rem] sm:text-4xl font-bold tracking-[-0.032em] leading-none text-brand mb-2 tabular-nums whitespace-nowrap">
                  <CountUpStat value={7} />
                </div>
                <div className="text-xs sm:text-sm text-slate-400 font-medium uppercase tracking-wider leading-tight">Global Offices</div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Where our buyers deliver to — the contextual internal links the brief
          asked for, as body content rather than another boilerplate row. */}
      <section className="py-16 lg:py-24 bg-white border-b border-slate-200">
        <div className="max-w-[1200px] mx-auto px-4 sm:px-6 lg:px-8">
          <div className="max-w-3xl mx-auto text-center">
            <h2 className="text-[1.75rem] sm:text-4xl font-semibold tracking-[-0.018em] leading-[1.12] text-balance text-slate-900 mb-4">
              The same order, at both ends
            </h2>
            <p className="text-slate-600 text-sm sm:text-base leading-[1.7] text-pretty mb-4">
              What is bought in China has to land somewhere. Our{" "}
              <Link href="/china-sourcing-office-guangzhou/" className="text-[#176579] font-medium underline underline-offset-2 hover:text-brand-dark">
                Guangzhou sourcing office
              </Link>{" "}
              does the buying, auditing and consolidating; the arrival end is handled by our own people rather than a local
              partner. Indian importers clear through our{" "}
              <Link href="/sourcing-company-chennai/" className="text-[#176579] font-medium underline underline-offset-2 hover:text-brand-dark">
                Chennai sourcing office
              </Link>
              , and Gulf buyers through our{" "}
              <Link href="/sourcing-company-dubai/" className="text-[#176579] font-medium underline underline-offset-2 hover:text-brand-dark">
                sourcing company in Dubai
              </Link>
              .
            </p>
            <p className="text-slate-600 text-sm sm:text-base leading-[1.7] text-pretty">
              If you already know what you need,{" "}
              <Link href="/contact/" className="text-[#176579] font-medium underline underline-offset-2 hover:text-brand-dark">
                send us the specification
              </Link>{" "}
              and we will come back with factories and a landed price.
            </p>
          </div>
        </div>
      </section>

      <GoogleRating
        heading="Our Record on Google"
        rating={4.8}
        detail="144 Google reviews of AFFHAN Group average 4.8 out of 5. Those sit on the Chennai head-office profile, which is where the group is registered."
      />

      <section className="py-16 lg:py-24 bg-slate-50 border-t border-slate-200">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-12">
            <h2 className="text-[1.75rem] sm:text-4xl font-semibold tracking-[-0.018em] leading-[1.12] text-balance text-slate-900 mb-5">
              Frequently Asked Questions
            </h2>
          </div>
          <FaqAccordion faqs={faqs} />
        </div>
      </section>

      {/* Final CTA */}
      <section className="py-16 lg:py-20 bg-gradient-to-br from-[#1b4452] via-[#245b6d] to-[#123642]">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <h2 className="text-[1.75rem] sm:text-4xl font-semibold tracking-[-0.018em] leading-[1.12] text-balance text-white mb-4">
            Tell us what you need made
          </h2>
          <p className="text-slate-200 text-sm sm:text-base leading-[1.65] text-pretty mb-8">
            A sample, a drawing or a link is enough to start. We will come back with the factories that make it and a price
            landed at your door.
          </p>
          <Link
            href="/contact/"
            className="cta-sheen group inline-flex items-center justify-center gap-2 rounded-xl bg-white px-8 py-3.5 text-[15px] font-semibold tracking-[-0.01em] text-[#123642] transition-all duration-300 ease-out hover:bg-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/60 focus-visible:ring-offset-2 focus-visible:ring-offset-[#123642] motion-safe:hover:scale-[1.02] motion-safe:active:scale-[0.98]"
          >
            Request a quote
            <span aria-hidden="true" className="transition-transform duration-300 ease-out motion-safe:group-hover:translate-x-1">
              →
            </span>
          </Link>
        </div>
      </section>

      <OtherLocations current="china-sourcing-company" />

      <FooterSection />
    </main>
  );
}
