import { Metadata } from "next";
import Link from "next/link";
import { CheckCircle2 } from "lucide-react";
import { FooterSection } from "@/components/sections/FooterSection";
import dynamic from "next/dynamic";
import { CountUpStat } from "@/components/ui/CountUpStat";
import { prisma } from "@/lib/prisma";
import { buildCategoryTree, getCategoryIcon } from "@/lib/categoryTree";
import { GoogleRating } from "@/components/ui/google-rating";

const SourcingProcessSection = dynamic(() => import("@/components/sections/SourcingProcessSection").then(mod => mod.SourcingProcessSection), { ssr: true });
const FaqAccordion = dynamic(() => import("@/components/sections/FaqAccordion").then(mod => mod.FaqAccordion), { ssr: true });

export const revalidate = 3600;

const PAGE_TITLE = "Our China Sourcing Office in Guangzhou | AFFHAN Group";

const PAGE_DESCRIPTION =
  "Inside AFFHAN's Guangzhou sourcing office: the factory clusters we buy from, how inspection works, Canton Fair sourcing and container consolidation.";

export const metadata: Metadata = {
  title: PAGE_TITLE,
  description: PAGE_DESCRIPTION,
  alternates: { canonical: "https://affhan.com/china-sourcing-office-guangzhou/" },
  openGraph: {
    title: PAGE_TITLE,
    description: PAGE_DESCRIPTION,
    url: "https://affhan.com/china-sourcing-office-guangzhou/",
    type: "website",
    siteName: "AFFHAN Group",
    images: [{ url: "/images/logo.png", width: 800, height: 600 }],
  },
  twitter: { card: "summary_large_image", title: PAGE_TITLE, description: PAGE_DESCRIPTION },
};

const FOUNDED_YEAR = 2000;
const yearsTrading = new Date().getFullYear() - FOUNDED_YEAR;

// This page sits on the other side of the trade from the destination pages.
// The reader is not a Guangzhou buyer — they are an overseas buyer wanting to
// know what happens at the Chinese end, so every question is about supply.
const faqs = [
  {
    question: "Where in China do you actually buy from?",
    answer:
      "Wherever the product is genuinely made, which is rarely one place. Guangdong covers electronics, hardware, lighting and plastics. Zhejiang, and Yiwu in particular, is where small commodities and household goods concentrate. Jiangsu and Shandong handle a great deal of textiles and machinery, and Fujian is strong in footwear, ceramics and stone. Our office is in Guangzhou because it is the best-connected base for reaching all of them.",
  },
  {
    question: "Do you visit factories in person?",
    answer:
      "Yes, and it is the part of the job that cannot be delegated to a phone call. A supplier that photographs well can be a trading office with no production of its own. Walking the floor tells you whether the machinery matches the claimed capacity, whether the line is running, and whether the quality systems described in an email exist anywhere outside it.",
  },
  {
    question: "Can you source from the Canton Fair?",
    answer:
      "We work it every session. It is useful for seeing a broad category quickly and for meeting manufacturers who do not market themselves online, but a stand is a showroom rather than a factory. Anything that interests a client is followed up with a visit to the plant before it turns into an order.",
  },
  {
    question: "What does consolidation in Guangzhou involve?",
    answer:
      "Goods from several suppliers are received at our warehouse, checked against the order, repacked or relabelled if the destination market needs it, and loaded as one shipment. For a buyer taking small quantities from four factories, that is the difference between one sensible container and four part-loads each carrying its own freight and handling charges.",
  },
  {
    question: "How do you handle quality problems found at the factory?",
    answer:
      "By finding them there, which is the whole point of inspecting before shipment. A batch that is short, mismarked or off-specification can be reworked while it is still in the supplier's building and still the supplier's problem. The same fault discovered after arrival is your problem, and the freight has already been paid twice over.",
  },
  {
    question: "Who is this office for?",
    answer:
      `Every AFFHAN client, wherever they are. The buying, auditing, inspecting and consolidating happen here; the offices in Chennai, Dubai, London, Singapore and Melaka handle the arrival end. The company has worked this way since ${FOUNDED_YEAR}.`,
  },
];

const schema = {
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "LocalBusiness",
      "@id": "https://affhan.com/#localbusiness-guangzhou",
      name: "GUANGZHOU AFFHAN INTERNATIONAL CO., LTD",
      url: "https://affhan.com",
      logo: "https://affhan.com/images/logo.png",
      image: "https://affhan.com/images/logo.png",
      description:
        "AFFHAN's Guangzhou office handles factory sourcing, supplier audits, quality inspection and container consolidation for buyers worldwide.",
      email: "info@affhan.com",
      address: {
        "@type": "PostalAddress",
        streetAddress: "Room 2325, Canton Domestic Finance Centre, No.316 Chang Di Da Ma Lu",
        addressLocality: "Guangzhou",
        addressRegion: "Guangdong",
        addressCountry: "CN",
      },
    },
    {
      "@type": "Service",
      serviceType: "Product Sourcing, Factory Audit and Quality Inspection",
      provider: { "@id": "https://affhan.com/#localbusiness-guangzhou" },
      areaServed: { "@type": "Country", name: "China" },
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

const clusters = [
  {
    region: "Guangdong",
    hub: "Guangzhou, Shenzhen, Foshan, Dongguan",
    makes: "Electronics, hardware, lighting, plastics, furniture",
    note: "The densest manufacturing region in the country and the reason the office sits here. Most of what we buy is within a few hours' drive.",
  },
  {
    region: "Zhejiang",
    hub: "Yiwu, Ningbo, Wenzhou",
    makes: "Small commodities, houseware, stationery, packaging, toys",
    note: "Yiwu is a market rather than a factory town, which makes it fast for low-value high-variety buying and slow for anything needing real customisation.",
  },
  {
    region: "Jiangsu &amp; Shandong",
    hub: "Suzhou, Nantong, Qingdao",
    makes: "Textiles, home furnishing, machinery, industrial parts",
    note: "Where fabric-heavy and engineering orders tend to land. Lead times run longer and minimums higher than the south.",
  },
  {
    region: "Fujian",
    hub: "Quanzhou, Xiamen, Jinjiang",
    makes: "Footwear, ceramics, stone, sports goods, paper",
    note: "Specialised rather than general. Worth going to directly for these categories and rarely worth it for anything else.",
  },
];

export default async function ChinaSourcingOfficeGuangzhouPage() {
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
                Our China Sourcing Office in Guangzhou — <span className="text-[#1d7e93]">AFFHAN Group</span>
              </h1>
              <p className="hero-rise hero-rise-2 max-w-2xl mx-auto text-base sm:text-[17px] text-slate-600 mb-9 sm:mb-10 leading-[1.65] tracking-[-0.004em] text-pretty">
                Every other AFFHAN office deals with goods arriving. This one deals with them being made. The buying, the factory visits, the inspections and the loading all happen here, in Guangdong, weeks before a container reaches anybody&apos;s port. This page is what that actually looks like.
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

      {/* Signature section for this page — a supply-side map that appears on
          none of the destination pages. */}
      <section className="bg-gradient-to-b from-[#f2fafc] via-[#f7fcfd] to-white py-16 lg:py-24 border-y border-slate-200">
        <div className="max-w-[1200px] mx-auto px-4 sm:px-6 lg:px-8">
          <div className="max-w-3xl mb-10">
            <h2 className="text-[1.75rem] sm:text-4xl font-semibold tracking-[-0.018em] leading-[1.12] text-balance text-slate-900 mb-4">
              The factory map
            </h2>
            <p className="text-slate-600 text-[15px] sm:text-base leading-[1.7] tracking-[-0.003em] text-pretty">
              &ldquo;Made in China&rdquo; describes a country the size of a continent, and buying as though it were one market is the commonest and most expensive mistake. Categories cluster tightly by region, and going to the wrong one means paying a trading margin to somebody who is buying it from the right one on your behalf.
            </p>
          </div>
          <div className="grid gap-5 sm:grid-cols-2">
            {clusters.map((c) => (
              <div key={c.region} className="rounded-3xl border border-slate-200/70 bg-white/60 p-6">
                <h3
                  className="text-lg font-semibold tracking-[-0.016em] leading-snug text-slate-900 mb-1"
                  dangerouslySetInnerHTML={{ __html: c.region }}
                />
                <p className="text-[13px] uppercase tracking-wider font-semibold text-[#1d7e93] mb-3">{c.hub}</p>
                <p className="text-slate-700 text-sm sm:text-[15px] leading-[1.6] mb-2">{c.makes}</p>
                <p className="text-slate-500 text-sm leading-[1.6] tracking-[-0.003em] text-pretty">{c.note}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Second signature section: what the team physically does. */}
      <section className="py-16 lg:py-24 bg-white">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8">
          <h2 className="text-[1.75rem] sm:text-4xl font-semibold tracking-[-0.018em] leading-[1.12] text-balance text-slate-900 mb-6">
            What the Guangzhou team does on your behalf
          </h2>
          <p className="text-slate-600 text-[15px] sm:text-base leading-[1.75] tracking-[-0.003em] text-pretty mb-6">
            An overseas buyer can read a listing, exchange messages and pay a deposit without anybody ever standing in the building where the goods will be made. Everything below exists to close that gap:
          </p>
          <ul className="space-y-3.5 mb-6">
            <li className="flex items-start gap-3 text-slate-700 text-[15px] sm:text-base leading-[1.6]">
              <CheckCircle2 className="w-5 h-5 shrink-0 text-[#1d7e93] mt-0.5" />
              Establishing whether a supplier manufactures at all, or resells what somebody else made
            </li>
            <li className="flex items-start gap-3 text-slate-700 text-[15px] sm:text-base leading-[1.6]">
              <CheckCircle2 className="w-5 h-5 shrink-0 text-[#1d7e93] mt-0.5" />
              Negotiating in Mandarin, at the plant, where the price is set rather than quoted
            </li>
            <li className="flex items-start gap-3 text-slate-700 text-[15px] sm:text-base leading-[1.6]">
              <CheckCircle2 className="w-5 h-5 shrink-0 text-[#1d7e93] mt-0.5" />
              Approving samples and holding a sealed reference to inspect the production run against
            </li>
            <li className="flex items-start gap-3 text-slate-700 text-[15px] sm:text-base leading-[1.6]">
              <CheckCircle2 className="w-5 h-5 shrink-0 text-[#1d7e93] mt-0.5" />
              Checking certification and labelling for the destination market before anything is printed
            </li>
            <li className="flex items-start gap-3 text-slate-700 text-[15px] sm:text-base leading-[1.6]">
              <CheckCircle2 className="w-5 h-5 shrink-0 text-[#1d7e93] mt-0.5" />
              Inspecting mid-production and again before release, with photographs and video
            </li>
          </ul>
          <p className="text-slate-600 text-[15px] sm:text-base leading-[1.75] tracking-[-0.003em] text-pretty">
            The economics are simple enough. A fault caught on the line is corrected by the supplier at the supplier&apos;s cost. The identical fault caught in a warehouse overseas has already been paid for twice — once to make and once to ship — and returning it is almost never worth doing.
          </p>
        </div>
      </section>

      {/* Third signature section: Canton Fair and the warehouse. */}
      <section className="py-16 lg:py-24 bg-slate-50 border-t border-slate-200">
        <div className="max-w-[1200px] mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid gap-5 lg:grid-cols-2">
            <div className="rounded-3xl border border-slate-200/70 bg-white/60 p-6 sm:p-8">
              <h2 className="text-[1.5rem] sm:text-2xl lg:text-3xl font-semibold tracking-[-0.018em] leading-[1.15] text-balance text-slate-900 mb-4">
                The Canton Fair, used properly
              </h2>
              <p className="text-slate-600 text-sm sm:text-[15px] leading-[1.7] tracking-[-0.003em] text-pretty mb-3">
                Being based in Guangzhou means the largest trade fair in China happens on our doorstep, twice a year, and we work every session. It is genuinely useful for two things: covering a category quickly, and meeting manufacturers who never appear on the platforms overseas buyers search.
              </p>
              <p className="text-slate-600 text-sm sm:text-[15px] leading-[1.7] tracking-[-0.003em] text-pretty">
                It is not useful for deciding. A stand is a showroom, staffed by people whose job is the fair rather than the factory. Anything a client is interested in gets followed up at the plant afterwards, which is a short trip from here and a long one from anywhere else.
              </p>
            </div>
            <div className="rounded-3xl border border-slate-200/70 bg-white/60 p-6 sm:p-8">
              <h2 className="text-[1.5rem] sm:text-2xl lg:text-3xl font-semibold tracking-[-0.018em] leading-[1.15] text-balance text-slate-900 mb-4">
                The consolidation warehouse
              </h2>
              <p className="text-slate-600 text-sm sm:text-[15px] leading-[1.7] tracking-[-0.003em] text-pretty mb-3">
                Buyers rarely want a full container from a single supplier. They want a few pallets from four, which as separate shipments means paying freight, handling and documentation four times over.
              </p>
              <p className="text-slate-600 text-sm sm:text-[15px] leading-[1.7] tracking-[-0.003em] text-pretty">
                Goods come into our warehouse instead, are checked against the order, repacked or relabelled where the destination requires it, and loaded as one consignment. For distributors serving several markets this is usually a larger saving than anything negotiation achieves on unit price.
              </p>
            </div>
          </div>
        </div>
      </section>

      <section className="py-10 lg:py-12 bg-white min-h-[calc(100svh-4rem)] flex flex-col justify-center">
        <div className="max-w-[1200px] mx-auto px-4 sm:px-6 lg:px-8 w-full">
          <div className="text-center mb-6 lg:mb-8">
            <h2 className="text-[1.75rem] sm:text-3xl lg:text-4xl font-semibold tracking-[-0.018em] leading-[1.12] text-balance text-slate-900 mb-3">
              500+ Categories This Office Buys Across
            </h2>
            <p className="text-slate-600 max-w-2xl mx-auto text-sm sm:text-[15px] leading-[1.6] tracking-[-0.003em] text-pretty">
              A picture of the factory base rather than a shop. Nothing carries a price because nothing here is stock — what a thing costs depends on the specification, the quantity and where in the world it is going.
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
            Looking for something outside this list? Send it to us and the team here will go and find who builds it, or{" "}
            <Link href="/products/" className="font-medium text-[#176579] hover:text-[#27a8c4] hover:underline transition-colors">
              search the catalogue yourself
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
                Why the China end is the end that matters
              </h2>
              <p className="text-slate-300 mb-8 leading-[1.6] tracking-[-0.003em] text-pretty">
                Most sourcing arrangements put a company in the buyer&apos;s country and an unrelated agent in China, with a margin in between and nobody accountable for the join. Ours is one company on both sides, which is only obvious as an advantage on the day something goes wrong.
              </p>
              <ul className="space-y-4 mb-8">
                <li className="flex items-center gap-3 text-slate-200">
                  <CheckCircle2 className="w-5 h-5 shrink-0 text-brand" /> Staff employed here, in Guangdong, not a subcontracted inspector
                </li>
                <li className="flex items-center gap-3 text-slate-200">
                  <CheckCircle2 className="w-5 h-5 shrink-0 text-brand" /> Factory visits across four manufacturing regions, not one
                </li>
                <li className="flex items-center gap-3 text-slate-200">
                  <CheckCircle2 className="w-5 h-5 shrink-0 text-brand" /> A warehouse for consolidating and relabelling before loading
                </li>
                <li className="flex items-center gap-3 text-slate-200">
                  <CheckCircle2 className="w-5 h-5 shrink-0 text-brand" /> Working this corridor for {yearsTrading} years, since {FOUNDED_YEAR}
                </li>
              </ul>
              <div className="flex flex-col sm:flex-row gap-4 sm:gap-6 mt-6">
                <Link href="/about/" className="inline-flex items-center gap-2 text-brand font-semibold hover:text-brand-dark transition-colors">
                  Learn more about our company →
                </Link>
                <Link href="/contact/" className="inline-flex items-center gap-2 text-slate-400 font-medium hover:text-slate-200 transition-colors">
                  Start a sourcing enquiry →
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

      <GoogleRating
        heading="Our Record on Google"
        rating={4.8}
        detail="144 reviewers give AFFHAN Group an average of 4.8 out of 5 on Google. The profile is the Chennai head office one, and the company has been trading since 2000."
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

      <FooterSection />
    </main>
  );
}
