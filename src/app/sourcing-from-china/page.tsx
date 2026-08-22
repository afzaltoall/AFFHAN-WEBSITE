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

const SourcingProcessSection = dynamic(() => import("@/components/sections/SourcingProcessSection").then(mod => mod.SourcingProcessSection), { ssr: true });
const FaqAccordion = dynamic(() => import("@/components/sections/FaqAccordion").then(mod => mod.FaqAccordion), { ssr: true });

export const revalidate = 3600;

const PAGE_TITLE = "China Sourcing Agent | Costs, Lead Times & Risks | AFFHAN";

const PAGE_DESCRIPTION =
  "What sourcing from China actually involves: Chinese New Year timing, minimum order quantities, tooling ownership and when China is the wrong answer.";

export const metadata: Metadata = {
  title: PAGE_TITLE,
  description: PAGE_DESCRIPTION,
  alternates: { canonical: "https://affhan.com/sourcing-from-china/" },
  openGraph: {
    title: PAGE_TITLE,
    description: PAGE_DESCRIPTION,
    url: "https://affhan.com/sourcing-from-china/",
    type: "website",
    siteName: "AFFHAN Group",
    images: [{ url: "/images/logo.png", width: 800, height: 600 }],
  },
  twitter: { card: "summary_large_image", title: PAGE_TITLE, description: PAGE_DESCRIPTION },
};

const FOUNDED_YEAR = 2000;
const yearsTrading = new Date().getFullYear() - FOUNDED_YEAR;

// A buyer's-guide hub, not an office page. The Guangzhou page covers what our
// team physically does; this covers what a buyer needs to understand before
// placing an order at all. No question below appears on any other page.
const faqs = [
  {
    question: "How far ahead should I order around Chinese New Year?",
    answer:
      "Further than most buyers expect. Factories typically close for two to four weeks, and the restart is gradual because a share of the workforce does not return. Plan for orders to be finished and loaded well before the holiday rather than started near it, which in practice means placing them a couple of months earlier than a normal cycle. The weeks immediately before the break are also when we inspect most carefully, because that is when corners get cut to clear the floor.",
  },
  {
    question: "What is a minimum order quantity and can it be negotiated?",
    answer:
      "It is the smallest run a factory will produce, and it exists because setup, material purchase and machine time cost the same whether you order a hundred units or ten thousand. It can often be moved, but not by asking twice: the realistic levers are accepting a stock colour or material, combining several variants into one production run, or paying a higher unit price to cover the setup. Pushing far below a genuine minimum usually gets you a trading company rather than a factory.",
  },
  {
    question: "Who owns the mould or tooling I paid for?",
    answer:
      "Whoever the contract says, and if nothing says, expect an argument. Tooling is one of the few things in a China order that outlives the order, and a buyer who has paid for a mould but never documented ownership can find it difficult to move production elsewhere. Agree it in writing before the tooling is cut, along with where it is stored and what happens if you stop buying.",
  },
  {
    question: "How do I compare a Chinese quotation with a local supplier?",
    answer:
      "Not on unit price, which is the number that misleads. A factory quotation is typically ex-works or FOB, so it excludes freight, insurance, duty, tax and delivery, and on long routes those can be a substantial share of the final figure. Compare landed cost against your local price, and include the money tied up in stock while it is on the water.",
  },
  {
    question: "When is China not the right place to source?",
    answer:
      "When volumes are too small to reach a sensible minimum, when the product changes faster than a shipment can arrive, or when the goods face tariffs that erase the price advantage in your market. We would rather say so early than take an order that will not work. There are categories where a regional supplier or a domestic one is genuinely the better answer.",
  },
  {
    question: "What does a sourcing agent add that a factory contact does not?",
    answer:
      `A factory sells you what it makes. An agent works out what should be made, by whom, and checks it. Our buyers are in Guangzhou and visit before deposits move; the offices in Chennai, Dubai, London, Singapore and Melaka handle arrival. AFFHAN has worked this corridor since ${FOUNDED_YEAR}, ${yearsTrading} years now.`,
  },
];

const schema = {
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "Organization",
      "@id": "https://affhan.com/#organization",
      name: "AFFHAN International Pvt Ltd",
      url: "https://affhan.com",
      logo: "https://affhan.com/images/logo.png",
      foundingDate: String(FOUNDED_YEAR),
    },
    {
      "@type": "Service",
      serviceType: "China Product Sourcing and Supply Chain Management",
      provider: { "@id": "https://affhan.com/#organization" },
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

export default async function SourcingFromChinaPage() {
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
                Sourcing From China — <span className="text-[#1d7e93]">What Buyers Should Know First</span>
              </h1>
              <p className="hero-rise hero-rise-2 max-w-2xl mx-auto text-base sm:text-[17px] text-slate-600 mb-9 sm:mb-10 leading-[1.65] tracking-[-0.004em] text-pretty">
                Most first orders go wrong for reasons that have nothing to do with the supplier being dishonest. A holiday nobody planned around, a minimum nobody checked, a mould nobody wrote down who owned. This page is the short version of what {yearsTrading} years on this corridor has taught us, before you place anything.
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

      <section className="bg-gradient-to-b from-[#f2fafc] via-[#f7fcfd] to-white py-16 lg:py-24 border-y border-slate-200">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8">
          <h2 className="text-[1.75rem] sm:text-4xl font-semibold tracking-[-0.018em] leading-[1.12] text-balance text-slate-900 mb-6">
            The holiday that decides your year
          </h2>
          <p className="text-slate-600 text-[15px] sm:text-base leading-[1.75] tracking-[-0.003em] text-pretty mb-5">
            Chinese New Year is the single largest planning factor in this trade and the one overseas buyers underestimate most reliably. Factories do not simply pause for a public holiday: a large part of the workforce travels home across the country, plants close for weeks, and the restart afterwards is gradual because not everybody comes back to the same job.
          </p>
          <p className="text-slate-600 text-[15px] sm:text-base leading-[1.75] tracking-[-0.003em] text-pretty mb-6">
            Three separate problems come out of it, and they arrive in sequence:
          </p>
          <ul className="space-y-3.5 mb-6">
            <li className="flex items-start gap-3 text-slate-700 text-[15px] sm:text-base leading-[1.6]">
              <CheckCircle2 className="w-5 h-5 shrink-0 text-[#1d7e93] mt-0.5" />
              Before it, every factory is clearing its floor at once, which is when quality slips and when we inspect hardest
            </li>
            <li className="flex items-start gap-3 text-slate-700 text-[15px] sm:text-base leading-[1.6]">
              <CheckCircle2 className="w-5 h-5 shrink-0 text-[#1d7e93] mt-0.5" />
              During it, nothing is produced, nothing is loaded, and nobody answers
            </li>
            <li className="flex items-start gap-3 text-slate-700 text-[15px] sm:text-base leading-[1.6]">
              <CheckCircle2 className="w-5 h-5 shrink-0 text-[#1d7e93] mt-0.5" />
              After it, lines run below capacity for weeks while staffing recovers, so quoted lead times stretch
            </li>
          </ul>
          <p className="text-slate-600 text-[15px] sm:text-base leading-[1.75] tracking-[-0.003em] text-pretty">
            The practical answer is to place orders considerably earlier than a normal cycle so they are finished and loaded well ahead of the break, rather than started near it. Buyers who treat it as a fixed feature of the calendar rather than a surprise each year do noticeably better.
          </p>
        </div>
      </section>

      <section className="py-16 lg:py-24 bg-white">
        <div className="max-w-[1200px] mx-auto px-4 sm:px-6 lg:px-8">
          <div className="max-w-3xl mb-10">
            <h2 className="text-[1.75rem] sm:text-4xl font-semibold tracking-[-0.018em] leading-[1.12] text-balance text-slate-900 mb-4">
              Minimums, and how to work with them
            </h2>
            <p className="text-slate-600 text-[15px] sm:text-base leading-[1.7] tracking-[-0.003em] text-pretty">
              A minimum order quantity is not a negotiating posture. Setting up a line, buying raw material in trade quantities and booking machine time cost roughly the same whether the run is a hundred units or ten thousand, so below a certain point the factory genuinely loses money. Knowing which levers actually move is worth more than haggling.
            </p>
          </div>
          <div className="grid gap-5 md:grid-cols-3">
            <div className="rounded-3xl border border-slate-200/70 bg-slate-50 p-6">
              <h3 className="text-lg font-semibold tracking-[-0.016em] leading-snug text-slate-900 mb-3">Take what is already running</h3>
              <p className="text-slate-600 text-sm sm:text-[15px] leading-[1.65] tracking-[-0.003em] text-pretty">
                Accepting a stock colour, a standard material or existing packaging removes the setup that the minimum exists to cover. It is usually the largest single reduction available and costs nothing but a small compromise on specification.
              </p>
            </div>
            <div className="rounded-3xl border border-slate-200/70 bg-slate-50 p-6">
              <h3 className="text-lg font-semibold tracking-[-0.016em] leading-snug text-slate-900 mb-3">Combine your variants</h3>
              <p className="text-slate-600 text-sm sm:text-[15px] leading-[1.65] tracking-[-0.003em] text-pretty">
                Four sizes ordered separately are four runs. Ordered as one production batch and split afterwards, they reach the minimum together. This is the fix that buyers overlook most often, and it needs nothing from the factory at all.
              </p>
            </div>
            <div className="rounded-3xl border border-slate-200/70 bg-slate-50 p-6">
              <h3 className="text-lg font-semibold tracking-[-0.016em] leading-snug text-slate-900 mb-3">Pay for the setup honestly</h3>
              <p className="text-slate-600 text-sm sm:text-[15px] leading-[1.65] tracking-[-0.003em] text-pretty">
                A higher unit price on a short run is often better business than forcing a number down. Push far below a real minimum and what usually answers is a trading company reselling somebody else&apos;s production, with a margin and no control.
              </p>
            </div>
          </div>
        </div>
      </section>

      <section className="py-16 lg:py-24 bg-slate-50 border-t border-slate-200">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8">
          <h2 className="text-[1.75rem] sm:text-4xl font-semibold tracking-[-0.018em] leading-[1.12] text-balance text-slate-900 mb-6">
            Tooling, moulds, and who owns what you paid for
          </h2>
          <p className="text-slate-600 text-[15px] sm:text-base leading-[1.75] tracking-[-0.003em] text-pretty mb-5">
            Anything custom-moulded, die-cut or pressed needs tooling, and the buyer normally pays for it. It is one of the few things in a China order that outlives the order itself, which makes it the thing most worth writing down and the thing most often left vague.
          </p>
          <p className="text-slate-600 text-[15px] sm:text-base leading-[1.75] tracking-[-0.003em] text-pretty mb-6">
            The difficulty appears later, when you want to move production. A buyer who paid for a mould but never documented ownership, storage or transfer can find that leverage has quietly moved to the factory. Settle four things before the tooling is cut:
          </p>
          <ul className="space-y-3.5 mb-6">
            <li className="flex items-start gap-3 text-slate-700 text-[15px] sm:text-base leading-[1.6]">
              <CheckCircle2 className="w-5 h-5 shrink-0 text-[#1d7e93] mt-0.5" />
              Who owns the tooling once it is paid for, in writing, not by implication
            </li>
            <li className="flex items-start gap-3 text-slate-700 text-[15px] sm:text-base leading-[1.6]">
              <CheckCircle2 className="w-5 h-5 shrink-0 text-[#1d7e93] mt-0.5" />
              Where it is stored, and who maintains it between runs
            </li>
            <li className="flex items-start gap-3 text-slate-700 text-[15px] sm:text-base leading-[1.6]">
              <CheckCircle2 className="w-5 h-5 shrink-0 text-[#1d7e93] mt-0.5" />
              What happens to it if you stop ordering, and on what notice
            </li>
            <li className="flex items-start gap-3 text-slate-700 text-[15px] sm:text-base leading-[1.6]">
              <CheckCircle2 className="w-5 h-5 shrink-0 text-[#1d7e93] mt-0.5" />
              Whether the design itself is yours to take elsewhere
            </li>
          </ul>
          <p className="text-slate-600 text-[15px] sm:text-base leading-[1.75] tracking-[-0.003em] text-pretty">
            None of this is unusual or difficult to agree. It is simply much easier to agree before the money is spent than after.
          </p>
        </div>
      </section>

      <section className="py-16 lg:py-24 bg-white border-t border-slate-200">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8">
          <h2 className="text-[1.75rem] sm:text-4xl font-semibold tracking-[-0.018em] leading-[1.12] text-balance text-slate-900 mb-6">
            When China is not the answer
          </h2>
          <p className="text-slate-600 text-[15px] sm:text-base leading-[1.75] tracking-[-0.003em] text-pretty mb-5">
            We would rather lose an enquiry than take one that was never going to work, so it is worth being direct about where this trade stops making sense.
          </p>
          <p className="text-slate-600 text-[15px] sm:text-base leading-[1.75] tracking-[-0.003em] text-pretty mb-6">
            If the quantity is genuinely small, the arithmetic rarely survives freight and minimums — a local wholesaler will beat a landed cost from Guangdong. If the product changes faster than a shipment takes to arrive, the stock lands already out of date. And if the goods attract tariffs in your market that cancel the price gap, the saving was never real to begin with.
          </p>
          <p className="text-slate-600 text-[15px] sm:text-base leading-[1.75] tracking-[-0.003em] text-pretty">
            Where it does work is the middle: volumes large enough to clear a minimum comfortably, specifications stable enough to be worth tooling for, and a landed cost that still beats the alternative after everything is counted. That describes a great many products, which is why the trade exists — but not all of them, and telling the difference early is part of the job.
          </p>
        </div>
      </section>

      <section className="py-10 lg:py-12 bg-slate-50 border-t border-slate-200 min-h-[calc(100svh-4rem)] flex flex-col justify-center">
        <div className="max-w-[1200px] mx-auto px-4 sm:px-6 lg:px-8 w-full">
          <div className="text-center mb-6 lg:mb-8">
            <h2 className="text-[1.75rem] sm:text-3xl lg:text-4xl font-semibold tracking-[-0.018em] leading-[1.12] text-balance text-slate-900 mb-3">
              500+ Categories We Buy Across in China
            </h2>
            <p className="text-slate-600 max-w-2xl mx-auto text-sm sm:text-[15px] leading-[1.6] tracking-[-0.003em] text-pretty">
              A map of the factory base, not a shop window — nothing here is held stock, which is why nothing carries a price. For how the buying actually runs on the ground, see our{" "}
              <Link href="/china-sourcing-office-guangzhou/" className="font-medium text-[#176579] hover:text-[#27a8c4] hover:underline transition-colors">
                Guangzhou sourcing office
              </Link>
              .
            </p>
          </div>
          <div className="max-w-6xl mx-auto bg-white/60 p-5 sm:p-6 rounded-3xl border border-slate-200/60 shadow-sm">
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
            Have a product in mind already? Send it across and we will identify who makes it, or{" "}
            <Link href="/products/" className="font-medium text-[#176579] hover:text-[#27a8c4] hover:underline transition-colors">
              go through the catalogue
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
                Where we fit into all this
              </h2>
              <p className="text-slate-300 mb-8 leading-[1.6] tracking-[-0.003em] text-pretty">
                Everything on this page is knowable in advance, and almost all of it is only actionable by somebody standing in China. That is the reason the buying team sits in Guangzhou rather than answering emails from a destination market.
              </p>
              <ul className="space-y-4 mb-8">
                <li className="flex items-center gap-3 text-slate-200">
                  <CheckCircle2 className="w-5 h-5 shrink-0 text-brand" /> Order timing planned around the factory calendar, not against it
                </li>
                <li className="flex items-center gap-3 text-slate-200">
                  <CheckCircle2 className="w-5 h-5 shrink-0 text-brand" /> Minimums tested at the plant, where they are actually set
                </li>
                <li className="flex items-center gap-3 text-slate-200">
                  <CheckCircle2 className="w-5 h-5 shrink-0 text-brand" /> Tooling terms agreed before the money is committed
                </li>
                <li className="flex items-center gap-3 text-slate-200">
                  <CheckCircle2 className="w-5 h-5 shrink-0 text-brand" /> An honest answer when the product does not suit this route
                </li>
              </ul>
              <div className="flex flex-col sm:flex-row gap-4 sm:gap-6 mt-6">
                <Link href="/china-sourcing-office-guangzhou/" className="inline-flex items-center gap-2 text-brand font-semibold hover:text-brand-dark transition-colors">
                  Inside our Guangzhou office →
                </Link>
                <Link href="/contact/" className="inline-flex items-center gap-2 text-slate-400 font-medium hover:text-slate-200 transition-colors">
                  Ask about a product →
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
        detail="Google reviewers rate AFFHAN Group 4.8 out of 5 across 144 reviews. The profile belongs to the Chennai head office, trading since 2000."
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

      <OtherLocations current="sourcing-from-china" />

      <FooterSection />
    </main>
  );
}
