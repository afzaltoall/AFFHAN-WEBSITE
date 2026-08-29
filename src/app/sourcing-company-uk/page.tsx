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

const PAGE_TITLE = "China Sourcing Agent London | UK Import Company | AFFHAN";

const PAGE_DESCRIPTION =
  "China sourcing agent in London for UK importers. Factory sourcing, inspection and freight into Felixstowe and Southampton, with CDS customs clearance.";

export const metadata: Metadata = {
  title: PAGE_TITLE,
  description: PAGE_DESCRIPTION,
  alternates: {
    canonical: "https://affhan.com/sourcing-company-uk/",
  },
  openGraph: {
    title: PAGE_TITLE,
    description: PAGE_DESCRIPTION,
    url: "https://affhan.com/sourcing-company-uk/",
    type: "website",
    siteName: "AFFHAN Group",
    images: [{ url: "/images/logo.png", width: 800, height: 600 }],
  },
  twitter: {
    card: "summary_large_image",
    title: PAGE_TITLE,
    description: PAGE_DESCRIPTION,
  },
};

const FOUNDED_YEAR = 2000;
const yearsTrading = new Date().getFullYear() - FOUNDED_YEAR;

// UK-specific throughout. Nothing here is a reworded version of a Chennai or
// Dubai answer — the corridor, the paperwork and the buyers are all different,
// which is the point: five location pages saying the same thing in different
// city names is what Google treats as doorway pages.
const faqs = [
  {
    question: "How long does shipping from China to the UK take?",
    answer:
      "Sea freight from South China to Felixstowe or Southampton usually runs 30 to 40 days port to port, longer than most buyers expect because the route goes via Suez or the Cape. Air freight is typically 5 to 8 days. Rail through Central Asia sits between the two at roughly 18 to 22 days, which is often the sensible middle option for goods that are too urgent for sea and too heavy for air.",
  },
  {
    question: "What do I need before importing from China to the UK?",
    answer:
      "A GB EORI number, which HMRC issues and which your declaration cannot be made without, and a decision on how import VAT is handled. Most VAT-registered importers use Postponed VAT Accounting, which moves import VAT onto the VAT return instead of paying it at the border. If you import regularly, a duty deferment account is worth setting up early.",
  },
  {
    question: "Do you handle UK customs clearance?",
    answer:
      "Yes. Declarations are filed through HMRC's Customs Declaration Service, and we work with your commodity codes rather than guessing at them — the code sets the duty rate and any licensing conditions, and an incorrect one means re-assessment and storage charges while it is resolved.",
  },
  {
    question: "Can you deliver directly into Amazon FBA?",
    answer:
      "Yes, and it is one of the more common things we do for UK clients. Cartons are labelled and barcoded to Amazon's requirements at the factory or at our consolidation warehouse in Guangzhou, so the shipment arrives ready to book into a fulfilment centre rather than needing a UK prep step first.",
  },
  {
    question: "What about UKCA marking and product compliance?",
    answer:
      "Compliance is settled before production, not after arrival. We identify what the product needs for the GB market, confirm the factory can supply the supporting documentation, and check the marking and labelling at inspection. Getting this wrong is expensive: goods that cannot be lawfully sold are still goods you have paid for.",
  },
  {
    question: "Why use a sourcing agent instead of buying on Alibaba?",
    answer:
      `A listing tells you what a supplier says about itself. Our buyers are in Guangzhou and visit the factory before your deposit moves, inspect the goods before they sail, and consolidate multiple suppliers into one shipment. AFFHAN has traded since ${FOUNDED_YEAR} and the UK office gives you someone in your own time zone when a shipment needs a decision.`,
  },
];

// Address and phone taken from the Google Business Profile rather than the
// older record in OfficeLocations.tsx, which lists a different street and
// number. Local ranking depends on the site and the profile agreeing, and the
// profile is the one Google has verified.
const schema = {
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "LocalBusiness",
      "@id": "https://affhan.com/#localbusiness-uk",
      parentOrganization: { "@id": ORG_ID },
      name: OFFICES.uk.legalName,
      legalName: OFFICES.uk.legalName,
      // The page this branch is described on, not the site root: two branches
      // sharing one url read as one place with two addresses.
      url: "https://affhan.com/sourcing-company-uk/",
      logo: LOGO_URL,
      image: LOGO_URL,
      description:
        "AFFHAN is a China sourcing agent and import company for UK buyers, handling factory sourcing, inspection, freight and customs clearance.",
      telephone: OFFICES.uk.telephone,
      email: "info@affhan.com",
      // 34 Monarch Parade, London Road, Mitcham CR4 3HA. The schema here
      // previously read "No.4, Laings Corner, Mitcham CR4 2JA" — a different
      // office entirely — while the office card carried the correct one.
      address: postalAddress(OFFICES.uk),
      areaServed: { "@type": "Country", name: "United Kingdom" },
      foundingDate: FOUNDING_DATE,
      sameAs: [...SOCIAL_PROFILES],
    },
    {
      "@type": "Service",
      serviceType: "Product Sourcing and Freight Forwarding",
      provider: { "@id": "https://affhan.com/#localbusiness-uk" },
      areaServed: { "@type": "Country", name: "United Kingdom" },
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

export default async function SourcingCompanyUkPage() {
  const [productCount, categoryCount, categoriesRaw] = await Promise.all([
    prisma.product.count(),
    prisma.category.count({ where: { products: { some: {} } } }),
    prisma.category.findMany({ include: { _count: { select: { products: true } } } }),
  ]);

  const allCategories = categoriesRaw.map((c) => ({ ...c, productCount: c._count.products }));
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
              {/* hero-rise-1 runs a transform-only keyframe — this is the LCP
                  element and must not fade in from opacity 0. */}
              <h1 className="hero-rise hero-rise-1 text-3xl sm:text-4xl lg:text-5xl font-bold tracking-[-0.022em] leading-[1.1] text-balance text-slate-900 mb-5 sm:mb-6">
                China Sourcing Agent in London &amp; the UK — <span className="text-[#1d7e93]">AFFHAN Group</span>
              </h1>
              <p className="hero-rise hero-rise-2 max-w-2xl mx-auto text-base sm:text-[17px] text-slate-600 mb-9 sm:mb-10 leading-[1.65] tracking-[-0.004em] text-pretty">
                Buying from China into Britain is a longer corridor than most and a stricter one since Brexit. A <strong className="text-slate-800">China sourcing agent in the UK</strong> is worth having for the part that happens before the container sails — and an <strong className="text-slate-800">import company</strong> that files the declaration, not just books the freight. Our buyers are in Guangzhou; the office is in London.
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

      {/* Service cards are text-only here rather than reusing the Chennai or
          Dubai artwork — two location pages sharing images is the fault the
          audit raised, and repeating it on a third would be worse. Drop a
          public/Landing-uk-services/ folder in and these take images in the
          same pattern as the other pages. */}
      <section className="bg-gradient-to-b from-[#f2fafc] via-[#f7fcfd] to-white py-10 lg:py-12 border-y border-slate-200 min-h-[calc(100svh-4rem)] flex flex-col justify-center">
        <div className="max-w-[1200px] mx-auto px-4 sm:px-6 lg:px-8 w-full">
          <div className="text-center mb-6">
            <h2 className="text-[1.75rem] sm:text-3xl lg:text-4xl font-semibold tracking-[-0.018em] leading-[1.12] text-balance text-slate-900 mb-2 sm:mb-3">
              Our Sourcing Services in the UK
            </h2>
            <p className="text-slate-600 max-w-2xl mx-auto text-sm sm:text-[15px] leading-[1.6] tracking-[-0.003em] text-pretty">
              Sourcing, inspection and freight, run by one team at both ends of a long corridor. On a 35-day sea leg there is no fixing a problem in transit.
            </p>
          </div>

          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4 lg:gap-5">
            <div className="liquid-glass-card p-5 flex flex-col">
              <h3 className="text-lg sm:text-xl font-semibold tracking-[-0.016em] leading-snug text-slate-900 mb-2">Factory Sourcing</h3>
              <p className="text-slate-600 text-sm leading-[1.55] tracking-[-0.003em] text-pretty">
                Send a sample, a drawing or a competitor&apos;s product. We find the manufacturers already making it and quote it landed in the UK, duty and delivery included.
              </p>
              <p className="mt-auto pt-3 text-[12.5px] leading-[1.5] text-slate-500 border-t border-white/70">
                <span className="font-semibold text-slate-600">Includes: </span>factory shortlisting, price negotiation, sample approval, tooling where needed
              </p>
            </div>

            <div className="liquid-glass-card p-5 flex flex-col">
              <h3 className="text-lg sm:text-xl font-semibold tracking-[-0.016em] leading-snug text-slate-900 mb-2">Inspection &amp; Compliance</h3>
              <p className="text-slate-600 text-sm leading-[1.55] tracking-[-0.003em] text-pretty">
                Goods are checked before they sail, and what the GB market requires is settled before production rather than discovered at the port.
              </p>
              <p className="mt-auto pt-3 text-[12.5px] leading-[1.5] text-slate-500 border-t border-white/70">
                <span className="font-semibold text-slate-600">Includes: </span>factory audit, pre-shipment inspection, marking and labelling checks, photo and video reports
              </p>
            </div>

            <div className="liquid-glass-card p-5 flex flex-col">
              <h3 className="text-lg sm:text-xl font-semibold tracking-[-0.016em] leading-snug text-slate-900 mb-2">Freight &amp; UK Clearance</h3>
              <p className="text-slate-600 text-sm leading-[1.55] tracking-[-0.003em] text-pretty">
                Sea, air or rail into the UK, consolidated at our Guangzhou warehouse, with the customs declaration filed rather than handed back to you.
              </p>
              <p className="mt-auto pt-3 text-[12.5px] leading-[1.5] text-slate-500 border-t border-white/70">
                <span className="font-semibold text-slate-600">Includes: </span>FCL and LCL booking, CDS declarations, duty and VAT handling, delivery or FBA drop
              </p>
            </div>
          </div>
        </div>
      </section>

      <section className="py-16 lg:py-24 bg-gradient-to-b from-white to-[#f5fbfd] border-t border-slate-200">
        <div className="max-w-[1200px] mx-auto px-4 sm:px-6 lg:px-8 w-full">
          <div className="text-center mb-10 lg:mb-12">
            <h2 className="text-[1.75rem] sm:text-4xl font-semibold tracking-[-0.018em] leading-[1.12] text-balance text-slate-900 mb-4">
              Getting a China shipment into Britain
            </h2>
            <p className="text-slate-600 max-w-2xl mx-auto text-sm sm:text-base leading-[1.65] tracking-[-0.003em] text-pretty">
              It is a longer route than most importers plan for, and since Brexit the paperwork decides as much as the shipping does.
            </p>
          </div>
          <div className="max-w-6xl mx-auto bg-white/40 backdrop-blur-md p-6 sm:p-8 lg:p-10 rounded-3xl border border-white/60 shadow-[0_8px_30px_rgb(0,0,0,0.04)]">
            <div className="grid gap-8 lg:gap-10 lg:grid-cols-3">
              <div>
                <h3 className="text-lg sm:text-xl font-semibold tracking-[-0.016em] leading-snug text-slate-900 mb-3">
                  Ports, and the three ways in
                </h3>
                <p className="text-slate-600 text-sm sm:text-[15px] leading-[1.7] tracking-[-0.003em] text-pretty">
                  Most of what we move discharges at Felixstowe, which handles the largest share of Britain&apos;s container traffic, with Southampton, London Gateway and Tilbury taking the rest. As planning ranges rather than promises, sea from South China runs 30 to 40 days, air 5 to 8, and rail through Central Asia roughly 18 to 22. That rail option is the one UK buyers most often forget: it costs well under air and lands a month earlier than sea, which suits a restock that has slipped.
                </p>
              </div>
              <div>
                <h3 className="text-lg sm:text-xl font-semibold tracking-[-0.016em] leading-snug text-slate-900 mb-3">
                  EORI, CDS and import VAT
                </h3>
                <p className="text-slate-600 text-sm sm:text-[15px] leading-[1.7] tracking-[-0.003em] text-pretty">
                  A GB EORI number has to exist before a declaration can be made at all, and declarations now run through HMRC&apos;s Customs Declaration Service. The part worth understanding early is import VAT: Postponed VAT Accounting lets a VAT-registered business account for it on the return instead of paying at the border, which changes the cash-flow shape of an import completely. Regular importers should also look at a duty deferment account.
                </p>
              </div>
              <div>
                <h3 className="text-lg sm:text-xl font-semibold tracking-[-0.016em] leading-snug text-slate-900 mb-3">
                  Where UK shipments actually get stuck
                </h3>
                <p className="text-slate-600 text-sm sm:text-[15px] leading-[1.7] tracking-[-0.003em] text-pretty">
                  Commodity codes and product compliance, in that order. The code decides the duty rate and any licensing attached to the goods, and a plausible-looking wrong one produces a query, a re-assessment and storage charges while it is argued. Compliance is the more expensive mistake: goods that cannot lawfully be sold on the GB market are still goods you have paid for. Both are settled at quotation stage here, not at the quayside.
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="py-10 lg:py-12 bg-slate-50 border-t border-slate-200 min-h-[calc(100svh-4rem)] flex flex-col justify-center">
        <div className="max-w-[1200px] mx-auto px-4 sm:px-6 lg:px-8 w-full">
          <div className="text-center mb-6 lg:mb-8">
            <h2 className="text-[1.75rem] sm:text-4xl font-semibold tracking-[-0.018em] leading-[1.12] text-balance text-slate-900 mb-3">
              Who We Source For in the UK
            </h2>
            <p className="text-slate-600 max-w-2xl mx-auto text-sm sm:text-base leading-[1.65] tracking-[-0.003em] text-pretty">
              British importing splits fairly cleanly between online resale and trade supply, and the two want different things from a shipment.
            </p>
          </div>

          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4 lg:gap-5 mb-6 lg:mb-8">
            <div className="liquid-glass-card p-5 flex flex-col">
              <h3 className="text-base sm:text-lg font-semibold tracking-[-0.016em] leading-snug text-slate-900 mb-2">Amazon and online sellers</h3>
              <p className="text-slate-600 text-sm leading-[1.55] tracking-[-0.003em] text-pretty">
                Private-label sellers live and die by stock timing, so cartons are prepped to fulfilment-centre spec in China rather than reworked here.
              </p>
              <p className="mt-auto pt-3 text-[12.5px] leading-[1.5] text-slate-500 border-t border-white/70">
                <span className="font-semibold text-slate-600">Typical lines: </span>houseware, pet, fitness, kitchen gadgets, packaging
              </p>
            </div>
            <div className="liquid-glass-card p-5 flex flex-col">
              <h3 className="text-base sm:text-lg font-semibold tracking-[-0.016em] leading-snug text-slate-900 mb-2">Furniture and homeware</h3>
              <p className="text-slate-600 text-sm leading-[1.55] tracking-[-0.003em] text-pretty">
                Bulky, low-density goods where the container fill rate decides the margin, so loading plans matter as much as unit price.
              </p>
              <p className="mt-auto pt-3 text-[12.5px] leading-[1.5] text-slate-500 border-t border-white/70">
                <span className="font-semibold text-slate-600">Typical lines: </span>flat-pack furniture, lighting, textiles, garden, storage
              </p>
            </div>
            <div className="liquid-glass-card p-5 flex flex-col">
              <h3 className="text-base sm:text-lg font-semibold tracking-[-0.016em] leading-snug text-slate-900 mb-2">Trade and builders&apos; supply</h3>
              <p className="text-slate-600 text-sm leading-[1.55] tracking-[-0.003em] text-pretty">
                Merchants and contractors buying to a site programme, where a late container costs more than the goods sitting in it.
              </p>
              <p className="mt-auto pt-3 text-[12.5px] leading-[1.5] text-slate-500 border-t border-white/70">
                <span className="font-semibold text-slate-600">Typical lines: </span>fixings, ironmongery, tooling, PPE, workwear
              </p>
            </div>
            <div className="liquid-glass-card p-5 flex flex-col">
              <h3 className="text-base sm:text-lg font-semibold tracking-[-0.016em] leading-snug text-slate-900 mb-2">Hospitality and catering</h3>
              <p className="text-slate-600 text-sm leading-[1.55] tracking-[-0.003em] text-pretty">
                Fit-out and refurbishment work to a specification that has to be matched exactly, usually with a sample signed off first.
              </p>
              <p className="mt-auto pt-3 text-[12.5px] leading-[1.5] text-slate-500 border-t border-white/70">
                <span className="font-semibold text-slate-600">Typical lines: </span>catering equipment, tableware, furniture, uniforms, disposables
              </p>
            </div>
          </div>
        </div>
      </section>

      <section className="py-10 lg:py-12 bg-white min-h-[calc(100svh-4rem)] flex flex-col justify-center">
        <div className="max-w-[1200px] mx-auto px-4 sm:px-6 lg:px-8 w-full">
          <div className="text-center mb-6 lg:mb-8">
            <h2 className="text-[1.75rem] sm:text-3xl lg:text-4xl font-semibold tracking-[-0.018em] leading-[1.12] text-balance text-slate-900 mb-3">
              500+ Product Categories We Source into Britain
            </h2>
            <p className="text-slate-600 max-w-2xl mx-auto text-sm sm:text-[15px] leading-[1.6] tracking-[-0.003em] text-pretty">
              None of this is stock. It is a map of what the factories we buy from can make, which is why there are no prices against it — a UK quote depends on your specification, your quantity, and whether it is going to your warehouse or straight into a fulfilment centre.
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
                    <span className="text-[14px] sm:text-[15px] font-medium text-slate-700 group-hover:text-slate-900 leading-snug">
                      {cat.name}
                    </span>
                  </Link>
                );
              })}
            </div>
          </div>
          <p className="text-center text-slate-500 text-sm sm:text-[15px] leading-[1.65] mt-6 max-w-2xl mx-auto">
            Not here? Send the product across and we will find who makes it, or{" "}
            <Link href="/products/" className="font-medium text-[#176579] hover:text-[#27a8c4] hover:underline transition-colors">
              browse the full product catalogue
            </Link>
            .
          </p>
        </div>
      </section>

      <SourcingProcessSection />

      <section className="py-16 lg:py-24 bg-white border-t border-slate-200">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8">
          <h2 className="text-[1.75rem] sm:text-4xl font-semibold tracking-[-0.018em] leading-[1.12] text-balance text-slate-900 mb-6">
            What a UK importer needs in place
          </h2>
          <p className="text-slate-600 text-[15px] sm:text-base leading-[1.75] tracking-[-0.003em] text-pretty mb-6">
            The order runs the same way wherever it lands. What is particular to Britain is the administration around it, and most of it is quick to arrange if it is done before the goods are on the water rather than after:
          </p>
          <ul className="space-y-3.5 mb-6">
            <li className="flex items-start gap-3 text-slate-700 text-[15px] sm:text-base leading-[1.6]">
              <CheckCircle2 className="w-5 h-5 shrink-0 text-[#1d7e93] mt-0.5" />
              A GB EORI number from HMRC — no declaration can be made without one
            </li>
            <li className="flex items-start gap-3 text-slate-700 text-[15px] sm:text-base leading-[1.6]">
              <CheckCircle2 className="w-5 h-5 shrink-0 text-[#1d7e93] mt-0.5" />
              A decision on Postponed VAT Accounting, which moves import VAT to your return rather than the border
            </li>
            <li className="flex items-start gap-3 text-slate-700 text-[15px] sm:text-base leading-[1.6]">
              <CheckCircle2 className="w-5 h-5 shrink-0 text-[#1d7e93] mt-0.5" />
              Commodity codes agreed before quoting, since they set the duty and the licensing conditions
            </li>
            <li className="flex items-start gap-3 text-slate-700 text-[15px] sm:text-base leading-[1.6]">
              <CheckCircle2 className="w-5 h-5 shrink-0 text-[#1d7e93] mt-0.5" />
              Product compliance for the GB market confirmed at the factory, not on arrival
            </li>
          </ul>
          <p className="text-slate-600 text-[15px] sm:text-base leading-[1.75] tracking-[-0.003em] text-pretty">
            On price, an FOB quotation from a factory and a delivered price into your warehouse are not comparable numbers, and on a UK route the gap is wider than most: the sea leg is long, and duty and VAT land on top. We price the whole movement, factory gate to your door, so there is a single number to set against a UK supplier.
          </p>
        </div>
      </section>

      <section className="py-16 lg:py-24 bg-slate-900 text-white min-h-[calc(100svh-4rem)] flex flex-col justify-center overflow-hidden relative">
        <div className="absolute top-0 right-0 -mr-48 -mt-48 w-96 h-96 bg-[#27a8c4]/10 rounded-full blur-3xl pointer-events-none" />
        <div className="max-w-[1200px] mx-auto px-4 sm:px-6 lg:px-8 relative z-10 w-full">
          <div className="grid lg:grid-cols-2 gap-12 items-center">
            <div>
              <h2 className="text-[1.75rem] sm:text-4xl font-semibold tracking-[-0.018em] leading-[1.12] text-balance mb-6">
                Why UK buyers work with us
              </h2>
              <p className="text-slate-300 mb-8 leading-[1.6] tracking-[-0.003em] text-pretty">
                A UK company on its own cannot inspect a factory in Guangdong, and a Chinese agent on its own cannot file your declaration. We are both ends of that, which is the only arrangement that holds when something goes wrong mid-shipment.
              </p>
              <ul className="space-y-4 mb-8">
                <li className="flex items-center gap-3 text-slate-200">
                  <CheckCircle2 className="w-5 h-5 shrink-0 text-brand" /> Our own buyers in Guangzhou, not a referral to a third party
                </li>
                <li className="flex items-center gap-3 text-slate-200">
                  <CheckCircle2 className="w-5 h-5 shrink-0 text-brand" /> Sea, air and rail options priced side by side, not just the cheapest
                </li>
                <li className="flex items-center gap-3 text-slate-200">
                  <CheckCircle2 className="w-5 h-5 shrink-0 text-brand" /> CDS declarations and Amazon FBA delivery handled in-house
                </li>
                <li className="flex items-center gap-3 text-slate-200">
                  <CheckCircle2 className="w-5 h-5 shrink-0 text-brand" /> Trading since {FOUNDED_YEAR} — {yearsTrading} years on the China corridor
                </li>
              </ul>
              <div className="flex flex-col sm:flex-row gap-4 sm:gap-6 mt-6">
                <Link href="/about/" className="inline-flex items-center gap-2 text-brand font-semibold hover:text-brand-dark transition-colors">
                  Learn more about our company →
                </Link>
                <Link href="/contact/" className="inline-flex items-center gap-2 text-slate-400 font-medium hover:text-slate-200 transition-colors">
                  Talk to the London office →
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

      {/* The UK profile carries no published reviews yet, so the figure quoted
          is the Chennai head-office one and the page says so. No Review or
          AggregateRating markup — see the note in the component. */}
      <GoogleRating
        heading="Our Record on Google"
        rating={4.8}
        detail="144 Google reviews of AFFHAN Group average 4.8 out of 5. Those sit on the Chennai head-office profile; the UK office is newer and has none of its own yet."
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

      <OtherLocations current="sourcing-company-uk" />

      <FooterSection />
    </main>
  );
}
