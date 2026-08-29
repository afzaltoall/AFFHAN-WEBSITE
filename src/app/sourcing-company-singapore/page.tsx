import { Metadata } from "next";
import Link from "next/link";
import { CheckCircle2 } from "lucide-react";
import { FooterSection } from "@/components/sections/FooterSection";
import { OtherLocations } from "@/components/sections/OtherLocations";
import dynamic from "next/dynamic";
import { CountUpStat } from "@/components/ui/CountUpStat";
import { prisma } from "@/lib/prisma";
import { buildCategoryTree, getCategoryIcon } from "@/lib/categoryTree";
import { GoogleRating } from "@/components/ui/google-rating";
import { FOUNDING_DATE, LOGO_URL, OFFICES, ORG_ID, SOCIAL_PROFILES, postalAddress } from "@/lib/brand";

const SourcingProcessSection = dynamic(() => import("@/components/sections/SourcingProcessSection").then(mod => mod.SourcingProcessSection), { ssr: true });
const FaqAccordion = dynamic(() => import("@/components/sections/FaqAccordion").then(mod => mod.FaqAccordion), { ssr: true });

export const revalidate = 3600;

const PAGE_TITLE = "China Sourcing Agent in Singapore | AFFHAN Group";

const PAGE_DESCRIPTION =
  "China sourcing agent in Singapore for import and re-export. Factory sourcing, inspection, PSA freight, GST and TradeNet permits, ASEAN distribution.";

export const metadata: Metadata = {
  title: PAGE_TITLE,
  description: PAGE_DESCRIPTION,
  alternates: { canonical: "https://affhan.com/sourcing-company-singapore/" },
  openGraph: {
    title: PAGE_TITLE,
    description: PAGE_DESCRIPTION,
    url: "https://affhan.com/sourcing-company-singapore/",
    type: "website",
    siteName: "AFFHAN Group",
    images: [{ url: "/images/logo.png", width: 800, height: 600 }],
  },
  twitter: { card: "summary_large_image", title: PAGE_TITLE, description: PAGE_DESCRIPTION },
};

const FOUNDED_YEAR = 2000;
const yearsTrading = new Date().getFullYear() - FOUNDED_YEAR;

// Singapore's questions are not the UK's or the Gulf's. Almost nothing here
// carries duty, the port is a transshipment hub before it is a destination,
// and a large share of what lands is on its way somewhere else.
const faqs = [
  {
    question: "Do I pay import duty bringing goods from China into Singapore?",
    answer:
      "For most goods, no. Singapore is close to a free port: duty applies only to a short excise list covering liquor, tobacco, motor vehicles and petroleum products. What almost every shipment does attract is GST on the value of the goods plus freight and insurance, so the number worth planning around is the tax, not the tariff.",
  },
  {
    question: "How quickly can goods move from China to Singapore?",
    answer:
      "It is one of the shortest ocean legs we run. Sea freight from South China ports is typically 5 to 10 days, against 30 to 40 for a European route. Air is usually 2 to 4 days door to door. Short transit changes how you should buy: reorder cycles can be tighter and you need to hold less stock against the water.",
  },
  {
    question: "Can goods pass through Singapore without being imported?",
    answer:
      "Yes, and for a lot of our clients that is the point. Goods held inside a Free Trade Zone have not entered Singapore for tax purposes, so GST is not triggered while they sit there or if they leave again for another market. Whether cargo should clear inwards or stay in the zone is a decision to make before booking, not after arrival.",
  },
  {
    question: "How are customs permits filed in Singapore?",
    answer:
      "Through TradeNet, the national single window that Singapore Customs runs. Declarations are electronic and clearance is normally quick, which means the delays we see are almost never at the border — they are missing product documentation, or a description on the permit that does not match what is in the carton.",
  },
  {
    question: "Can you supply distributors selling into Malaysia, Indonesia and Vietnam?",
    answer:
      "Regularly. Singapore works well as a break-bulk point: one container arrives from China, is split here, and moves on to several ASEAN markets. Doing that cleanly depends on the paperwork being prepared at import for onward movement rather than reconstructed later.",
  },
  {
    question: "Why use a sourcing agent rather than buying direct?",
    answer:
      `Because the risk sits in China, not in the shipping. Our buyers are in Guangzhou and see the factory before your deposit moves; the Singapore office at Sim Lim Tower handles the permit, the freight and the questions in your own working hours. AFFHAN has been trading on this corridor since ${FOUNDED_YEAR}.`,
  },
];

const schema = {
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "LocalBusiness",
      "@id": "https://affhan.com/#localbusiness-singapore",
      parentOrganization: { "@id": ORG_ID },
      name: OFFICES.singapore.legalName,
      legalName: OFFICES.singapore.legalName,
      url: "https://affhan.com/sourcing-company-singapore/",
      logo: LOGO_URL,
      image: LOGO_URL,
      foundingDate: FOUNDING_DATE,
      sameAs: [...SOCIAL_PROFILES],
      description:
        "AFFHAN is a China sourcing agent in Singapore handling factory sourcing, inspection, freight, customs permits and ASEAN re-export.",
      // This node previously carried no telephone at all — one of the three
      // fields Google matches a listing on, simply missing.
      telephone: OFFICES.singapore.telephone,
      email: "info@affhan.com",
      // Company records rather than the Google profile: the Singapore listing
      // exists but its contact tab has not been read off yet. See the
      // profileConfirmed flag in src/lib/brand.ts.
      address: postalAddress(OFFICES.singapore),
      areaServed: { "@type": "Country", name: "Singapore" },
    },
    {
      "@type": "Service",
      serviceType: "Product Sourcing and Freight Forwarding",
      provider: { "@id": "https://affhan.com/#localbusiness-singapore" },
      areaServed: { "@type": "Country", name: "Singapore" },
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

export default async function SourcingCompanySingaporePage() {
  const [productCount, categoryCount, categoriesRaw] = await Promise.all([
    prisma.product.count(),
    prisma.category.count({ where: { products: { some: {} } } }),
    prisma.category.findMany({ include: { _count: { select: { products: true } } } }),
  ]);
  const tree = buildCategoryTree(categoriesRaw.map((c) => ({ ...c, productCount: c._count.products })));

  return (
    <main className="w-full bg-slate-50 min-h-screen pb-0">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(schema) }} />

      <section className="relative isolate overflow-hidden">
        <div className="hero-aurora z-0" aria-hidden="true">
          <span className="hero-blob hero-blob-1" />
          <span className="hero-blob hero-blob-2" />
        </div>
        <div className="relative z-10 flex min-h-svh items-center pt-24 pb-12 lg:pb-20">
          <div className="w-full max-w-[1200px] mx-auto px-4 sm:px-6 lg:px-8">
            <div className="text-center max-w-4xl mx-auto">
              <h1 className="hero-rise hero-rise-1 text-3xl sm:text-4xl lg:text-5xl font-bold tracking-[-0.022em] leading-[1.1] text-balance text-slate-900 mb-5 sm:mb-6">
                China Sourcing Agent in Singapore — <span className="text-[#1d7e93]">AFFHAN Group</span>
              </h1>
              <p className="hero-rise hero-rise-2 max-w-2xl mx-auto text-base sm:text-[17px] text-slate-600 mb-9 sm:mb-10 leading-[1.65] tracking-[-0.004em] text-pretty">
                Five to ten days from a South China port, almost nothing dutiable, and a Free Trade Zone at the quayside. A <strong className="text-slate-800">China sourcing agent in Singapore</strong> earns its place upstream of all that — at the factory, before the container is sealed. Our buyers work out of Guangzhou; the office is at Sim Lim Tower.
              </p>
              <div className="hero-rise hero-rise-3 flex justify-center">
                <Link
                  href="/"
                  className="cta-sheen group inline-flex items-center justify-center gap-2 rounded-xl border border-slate-300/80 bg-white/70 px-8 py-3.5 text-[15px] font-medium tracking-[-0.01em] text-slate-800 shadow-[0_1px_2px_rgba(15,23,42,0.05)] backdrop-blur-sm transition-all duration-300 ease-out hover:border-brand/45 hover:bg-white hover:text-[#176579] hover:shadow-[0_2px_10px_rgba(15,23,42,0.07),0_10px_30px_-10px_rgba(39,168,196,0.5)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/40 focus-visible:ring-offset-2 motion-safe:hover:scale-[1.02] motion-safe:active:scale-[0.98]"
                >
                  Visit AFFHAN Website
                  <span aria-hidden="true" className="transition-transform duration-300 ease-out motion-safe:group-hover:translate-x-1">→</span>
                </Link>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="bg-gradient-to-b from-[#f2fafc] via-[#f7fcfd] to-white py-10 lg:py-12 border-y border-slate-200 min-h-[calc(100svh-4rem)] flex flex-col justify-center">
        <div className="max-w-[1200px] mx-auto px-4 sm:px-6 lg:px-8 w-full">
          <div className="text-center mb-6">
            <h2 className="text-[1.75rem] sm:text-3xl lg:text-4xl font-semibold tracking-[-0.018em] leading-[1.12] text-balance text-slate-900 mb-2 sm:mb-3">
              What We Do For Singapore Buyers
            </h2>
            <p className="text-slate-600 max-w-2xl mx-auto text-sm sm:text-[15px] leading-[1.6] tracking-[-0.003em] text-pretty">
              On a week-long ocean leg, the shipping is the easy part. Everything that decides the outcome happens before it.
            </p>
          </div>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4 lg:gap-5">
            <div className="liquid-glass-card p-5 flex flex-col">
              <h3 className="text-lg sm:text-xl font-semibold tracking-[-0.016em] leading-snug text-slate-900 mb-2">Finding the maker</h3>
              <p className="text-slate-600 text-sm leading-[1.55] tracking-[-0.003em] text-pretty">
                A photograph or a sample is enough to start. We trace it back to the plants that actually produce it and quote against your volume, not a catalogue price.
              </p>
              <p className="mt-auto pt-3 text-[12.5px] leading-[1.5] text-slate-500 border-t border-white/70">
                <span className="font-semibold text-slate-600">Covers: </span>supplier shortlisting, price negotiation, samples, tooling
              </p>
            </div>
            <div className="liquid-glass-card p-5 flex flex-col">
              <h3 className="text-lg sm:text-xl font-semibold tracking-[-0.016em] leading-snug text-slate-900 mb-2">Checking it before it sails</h3>
              <p className="text-slate-600 text-sm leading-[1.55] tracking-[-0.003em] text-pretty">
                Short transit is only an advantage if the goods are right. A rejected batch that took eight days to arrive still takes eight days to replace.
              </p>
              <p className="mt-auto pt-3 text-[12.5px] leading-[1.5] text-slate-500 border-t border-white/70">
                <span className="font-semibold text-slate-600">Covers: </span>factory audit, in-line checks, pre-shipment inspection, photo and video reports
              </p>
            </div>
            <div className="liquid-glass-card p-5 flex flex-col">
              <h3 className="text-lg sm:text-xl font-semibold tracking-[-0.016em] leading-snug text-slate-900 mb-2">Permits and delivery</h3>
              <p className="text-slate-600 text-sm leading-[1.55] tracking-[-0.003em] text-pretty">
                Freight booked into PSA, the TradeNet permit filed against a description that matches the carton, and the pallets where you need them.
              </p>
              <p className="mt-auto pt-3 text-[12.5px] leading-[1.5] text-slate-500 border-t border-white/70">
                <span className="font-semibold text-slate-600">Covers: </span>FCL and LCL booking, TradeNet declarations, GST handling, local delivery
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Section unique to this page: the import-or-transship decision does not
          arise in the UK, India or Gulf pages at all. */}
      <section className="py-16 lg:py-24 bg-white border-t border-slate-200">
        <div className="max-w-[1200px] mx-auto px-4 sm:px-6 lg:px-8">
          <div className="max-w-3xl mb-10">
            <h2 className="text-[1.75rem] sm:text-4xl font-semibold tracking-[-0.018em] leading-[1.12] text-balance text-slate-900 mb-4">
              Landing here, or only passing through?
            </h2>
            <p className="text-slate-600 text-[15px] sm:text-base leading-[1.7] tracking-[-0.003em] text-pretty">
              This is the first question we ask a Singapore client, and it is the one that most changes what a shipment costs. A container that clears inwards and a container that sits in a Free Trade Zone are treated completely differently, and the choice has to be made before the booking rather than at the terminal.
            </p>
          </div>
          <div className="grid gap-5 lg:grid-cols-2">
            <div className="rounded-3xl border border-slate-200/70 bg-slate-50 p-6 sm:p-8">
              <h3 className="text-lg sm:text-xl font-semibold tracking-[-0.016em] leading-snug text-slate-900 mb-3">Cleared into Singapore</h3>
              <p className="text-slate-600 text-sm sm:text-[15px] leading-[1.7] tracking-[-0.003em] text-pretty">
                For stock that will be sold here. GST becomes payable on the value of the goods together with freight and insurance, and a GST-registered business claims it back through its return, so it is a cash-flow item rather than a cost. Duty is rarely part of the picture — Singapore keeps a very short excise list and most manufactured goods fall outside it entirely.
              </p>
            </div>
            <div className="rounded-3xl border border-slate-200/70 bg-slate-50 p-6 sm:p-8">
              <h3 className="text-lg sm:text-xl font-semibold tracking-[-0.016em] leading-snug text-slate-900 mb-3">Held in a Free Trade Zone</h3>
              <p className="text-slate-600 text-sm sm:text-[15px] leading-[1.7] tracking-[-0.003em] text-pretty">
                For stock heading somewhere else. Goods inside a zone have not entered Singapore for tax purposes, so nothing is triggered while they sit there or when they leave again. Traders who split a container across several markets use this constantly, and it is why the port handles far more cargo than the country consumes.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Second unique section: the regional distribution role. */}
      <section className="py-16 lg:py-24 bg-slate-50 border-t border-slate-200">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8">
          <h2 className="text-[1.75rem] sm:text-4xl font-semibold tracking-[-0.018em] leading-[1.12] text-balance text-slate-900 mb-6">
            Using Singapore as a base for the region
          </h2>
          <p className="text-slate-600 text-[15px] sm:text-base leading-[1.75] tracking-[-0.003em] text-pretty mb-5">
            A great many of the orders we handle here are not really Singapore orders. They are regional orders that use Singapore because the shipping schedules are dense, the paperwork is predictable and the banks are where the trade finance sits.
          </p>
          <p className="text-slate-600 text-[15px] sm:text-base leading-[1.75] tracking-[-0.003em] text-pretty mb-6">
            The pattern is usually the same: consolidate several Chinese suppliers into one container, bring it in once, break it down here, then move parcels of it to Kuala Lumpur, Jakarta, Ho Chi Minh City or Manila. Done well it removes duplicate freight and handling on four small shipments. Done badly it means re-doing documentation at every leg. What makes the difference:
          </p>
          <ul className="space-y-3.5 mb-6">
            <li className="flex items-start gap-3 text-slate-700 text-[15px] sm:text-base leading-[1.6]">
              <CheckCircle2 className="w-5 h-5 shrink-0 text-[#1d7e93] mt-0.5" />
              Deciding at booking whether cargo clears inwards or stays in the zone
            </li>
            <li className="flex items-start gap-3 text-slate-700 text-[15px] sm:text-base leading-[1.6]">
              <CheckCircle2 className="w-5 h-5 shrink-0 text-[#1d7e93] mt-0.5" />
              Certificates of origin issued in China, since some onward markets give preferential rates on Chinese-origin goods
            </li>
            <li className="flex items-start gap-3 text-slate-700 text-[15px] sm:text-base leading-[1.6]">
              <CheckCircle2 className="w-5 h-5 shrink-0 text-[#1d7e93] mt-0.5" />
              Cartons marked at the factory for their final destination, not re-labelled at the warehouse
            </li>
            <li className="flex items-start gap-3 text-slate-700 text-[15px] sm:text-base leading-[1.6]">
              <CheckCircle2 className="w-5 h-5 shrink-0 text-[#1d7e93] mt-0.5" />
              Packing lists split by consignee before the container is loaded
            </li>
          </ul>
          <p className="text-slate-600 text-[15px] sm:text-base leading-[1.75] tracking-[-0.003em] text-pretty">
            All four are decided in Guangzhou, weeks before anything reaches the water. That is the argument for having the sourcing team and the freight team inside one company.
          </p>
        </div>
      </section>

      <section className="py-10 lg:py-12 bg-white min-h-[calc(100svh-4rem)] flex flex-col justify-center">
        <div className="max-w-[1200px] mx-auto px-4 sm:px-6 lg:px-8 w-full">
          <div className="text-center mb-6 lg:mb-8">
            <h2 className="text-[1.75rem] sm:text-3xl lg:text-4xl font-semibold tracking-[-0.018em] leading-[1.12] text-balance text-slate-900 mb-3">
              500+ Categories Our Singapore Desk Can Quote
            </h2>
            <p className="text-slate-600 max-w-2xl mx-auto text-sm sm:text-[15px] leading-[1.6] tracking-[-0.003em] text-pretty">
              Not a warehouse listing. It is the range our factory base covers, which is why nothing carries a price — costing depends on quantity, specification, and whether the goods stay here or move on.
            </p>
          </div>
          <div className="max-w-6xl mx-auto bg-slate-50 p-5 sm:p-6 rounded-3xl border border-slate-200/60 shadow-sm">
            <div className="columns-1 sm:columns-2 lg:columns-4 gap-x-5">
              {tree.slice(0, 16).map((cat) => {
                const Icon = getCategoryIcon(cat.name);
                return (
                  <Link
                    key={cat.id}
                    href={`/products/?categoryId=${cat.id}`}
                    className="group flex items-start gap-2.5 px-3 py-2 mb-0.5 break-inside-avoid text-left transition-all border-l-4 border-transparent hover:bg-white/70 hover:shadow-sm hover:border-[#27a8c4] rounded-r-xl"
                  >
                    <Icon size={20} className="shrink-0 stroke-[1.5] text-slate-500 group-hover:text-[#1d7e93] mt-0.5" />
                    <span className="text-[14px] sm:text-[15px] font-medium text-slate-700 group-hover:text-slate-900 leading-snug">{cat.name}</span>
                  </Link>
                );
              })}
            </div>
          </div>
          <p className="text-center text-slate-500 text-sm sm:text-[15px] leading-[1.65] mt-6 max-w-2xl mx-auto">
            Something else in mind? Send the item over and we will trace who builds it, or{" "}
            <Link href="/products/" className="font-medium text-[#176579] hover:text-[#27a8c4] hover:underline transition-colors">
              look through the whole catalogue
            </Link>
            .
          </p>
        </div>
      </section>

      <SourcingProcessSection />

      <section className="py-16 lg:py-24 bg-slate-900 text-white min-h-[calc(100svh-4rem)] flex flex-col justify-center overflow-hidden relative">
        <div className="absolute top-0 right-0 -mr-48 -mt-48 w-96 h-96 bg-[#27a8c4]/10 rounded-full blur-3xl pointer-events-none" />
        <div className="max-w-[1200px] mx-auto px-4 sm:px-6 lg:px-8 relative z-10 w-full">
          <div className="grid lg:grid-cols-2 gap-12 items-center">
            <div>
              <h2 className="text-[1.75rem] sm:text-4xl font-semibold tracking-[-0.018em] leading-[1.12] text-balance mb-6">
                Why traders here keep us on
              </h2>
              <p className="text-slate-300 mb-8 leading-[1.6] tracking-[-0.003em] text-pretty">
                Singapore has no shortage of freight forwarders and no shortage of agents in China. What is harder to find is one company answering for both, so that a problem discovered on a production line is not something you have to relay between two suppliers who have never spoken.
              </p>
              <ul className="space-y-4 mb-8">
                <li className="flex items-center gap-3 text-slate-200">
                  <CheckCircle2 className="w-5 h-5 shrink-0 text-brand" /> Buyers of ours inside China, not an introduction to somebody else&apos;s
                </li>
                <li className="flex items-center gap-3 text-slate-200">
                  <CheckCircle2 className="w-5 h-5 shrink-0 text-brand" /> Zone or inward clearance advised before the booking is made
                </li>
                <li className="flex items-center gap-3 text-slate-200">
                  <CheckCircle2 className="w-5 h-5 shrink-0 text-brand" /> Consolidation in Guangzhou, split here for onward ASEAN legs
                </li>
                <li className="flex items-center gap-3 text-slate-200">
                  <CheckCircle2 className="w-5 h-5 shrink-0 text-brand" /> {yearsTrading} years on this route — the company has traded since {FOUNDED_YEAR}
                </li>
              </ul>
              <div className="flex flex-col sm:flex-row gap-4 sm:gap-6 mt-6">
                <Link href="/about/" className="inline-flex items-center gap-2 text-brand font-semibold hover:text-brand-dark transition-colors">
                  Learn more about our company →
                </Link>
                <Link href="/contact/" className="inline-flex items-center gap-2 text-slate-400 font-medium hover:text-slate-200 transition-colors">
                  Reach the Singapore desk →
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
                <div className="text-[1.75rem] sm:text-4xl font-bold tracking-[-0.032em] leading-none text-brand mb-2 tabular-nums whitespace-nowrap">4.8</div>
                <div className="text-xs sm:text-sm text-slate-400 font-medium uppercase tracking-wider leading-tight">Google · Chennai HQ</div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* The Singapore profile carries 3.7 from three reviews. Three is too
          small a sample to present as a result either way, so the figure quoted
          is the Chennai one and the page says whose it is. No review markup. */}
      <GoogleRating
        heading="Our Record on Google"
        rating={4.8}
        detail="Across 144 Google reviews, AFFHAN Group averages 4.8 out of 5. That profile belongs to the Chennai head office, which has been trading since 2000."
      />

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

      <OtherLocations current="sourcing-company-singapore" />

      <FooterSection />
    </main>
  );
}
