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
import { FOUNDING_DATE, LOGO_URL, MALAYSIA_HOURS, OFFICES, ORG_ID, SOCIAL_PROFILES, postalAddress } from "@/lib/brand";

const SourcingProcessSection = dynamic(() => import("@/components/sections/SourcingProcessSection").then(mod => mod.SourcingProcessSection), { ssr: true });
const FaqAccordion = dynamic(() => import("@/components/sections/FaqAccordion").then(mod => mod.FaqAccordion), { ssr: true });

export const revalidate = 3600;

const PAGE_TITLE = "China Sourcing Agent in Malaysia | Import | AFFHAN Group";

const PAGE_DESCRIPTION =
  "China sourcing agent in Malaysia. Factory sourcing, halal and SIRIM compliance, Form E preferential duty, Port Klang freight and SST-ready clearance.";

export const metadata: Metadata = {
  title: PAGE_TITLE,
  description: PAGE_DESCRIPTION,
  alternates: { canonical: "https://affhan.com/sourcing-company-malaysia/" },
  openGraph: {
    title: PAGE_TITLE,
    description: PAGE_DESCRIPTION,
    url: "https://affhan.com/sourcing-company-malaysia/",
    type: "website",
    siteName: "AFFHAN Group",
    images: [{ url: "/images/logo.png", width: 800, height: 600 }],
  },
  twitter: { card: "summary_large_image", title: PAGE_TITLE, description: PAGE_DESCRIPTION },
};

const FOUNDED_YEAR = 2000;
const yearsTrading = new Date().getFullYear() - FOUNDED_YEAR;

// Malaysia's distinguishing questions are certification and preferential duty.
// Neither is a meaningful concern on the Singapore, UK, Gulf or India pages.
const faqs = [
  {
    question: "Can you source halal-certified products from China?",
    answer:
      "Yes, and it has to be settled before production rather than after. Halal status depends on the certifying body being one Malaysia recognises, so the question is never simply whether a factory holds a certificate — it is whose certificate, whether it covers the specific production line, and whether it is current. We check that at the audit stage and keep the documentation with the shipment.",
  },
  {
    question: "What is Form E and why does it matter for Malaysian importers?",
    answer:
      "It is the certificate of origin used under the ASEAN-China free trade arrangement, and it is what allows qualifying Chinese-origin goods to enter at a preferential rate instead of the standard one. It has to be issued in China, correctly, against the same shipment described on the invoice. Retrieving one after the goods have arrived is difficult, which is why we arrange it at the point of export.",
  },
  {
    question: "Do electrical goods need SIRIM approval?",
    answer:
      "Many do. Malaysia requires certification for a broad list of electrical and electronic equipment before it can be sold, and clearing customs is not the same as being allowed to sell. We identify what applies to your product early, and confirm the factory can supply the test reports the process depends on.",
  },
  {
    question: "Which port should my goods arrive at?",
    answer:
      "Port Klang for most of the Peninsula, and it is where the majority of what we move discharges. Penang suits buyers in the north and the electronics belt, while Tanjung Pelepas works for the south and for anything moving on toward Singapore. From South China the ocean leg is short — usually around a week to ten days.",
  },
  {
    question: "How is tax handled on imports into Malaysia?",
    answer:
      "Malaysia applies Sales and Service Tax rather than a VAT-style credit system, which matters more than importers expect: sales tax on imported goods is generally a cost in the chain rather than something reclaimed on a return. That changes how a landed cost should be calculated, and it is a common reason a first quotation looks cheaper than the eventual bill.",
  },
  {
    question: "Why work with an agent rather than buying direct from a supplier?",
    answer:
      `Because certification, origin documents and inspection all happen in China, and none of them can be fixed from Melaka once the container has sailed. Our buyers are in Guangzhou and visit before your deposit moves. AFFHAN has traded since ${FOUNDED_YEAR}, and the Malaysian office handles the arrival end.`,
  },
];

const schema = {
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "LocalBusiness",
      "@id": "https://affhan.com/#localbusiness-malaysia",
      parentOrganization: { "@id": ORG_ID },
      name: OFFICES.malaysia.legalName,
      legalName: OFFICES.malaysia.legalName,
      url: "https://affhan.com/sourcing-company-malaysia/",
      logo: LOGO_URL,
      image: LOGO_URL,
      description:
        "AFFHAN is a China sourcing agent in Malaysia handling factory sourcing, halal and SIRIM compliance, inspection, freight and customs clearance.",
      telephone: OFFICES.malaysia.telephone,
      email: "info@affhan.com",
      address: postalAddress(OFFICES.malaysia),
      areaServed: { "@type": "Country", name: "Malaysia" },
      foundingDate: FOUNDING_DATE,
      // Melaka is the only profile that publishes every day of the week, so it
      // is the only page where hours can be stated without inventing them.
      openingHoursSpecification: [...MALAYSIA_HOURS],
      sameAs: [...SOCIAL_PROFILES],
    },
    {
      "@type": "Service",
      serviceType: "Product Sourcing and Freight Forwarding",
      provider: { "@id": "https://affhan.com/#localbusiness-malaysia" },
      areaServed: { "@type": "Country", name: "Malaysia" },
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

export default async function SourcingCompanyMalaysiaPage() {
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
                China Sourcing Agent in Malaysia — <span className="text-[#1d7e93]">AFFHAN Group</span>
              </h1>
              <p className="hero-rise hero-rise-2 max-w-2xl mx-auto text-base sm:text-[17px] text-slate-600 mb-9 sm:mb-10 leading-[1.65] tracking-[-0.004em] text-pretty">
                Two things decide a Malaysian import and neither is the freight: whether the goods carry the certification they need to be sold here, and whether the origin paperwork was issued correctly in China. A <strong className="text-slate-800">China sourcing agent in Malaysia</strong> is worth having for both. Our office is in Melaka; the buyers are in Guangzhou.
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

      {/* Unique to this page: certification is the leading section, not a
          footnote, because in Malaysia it is what stops goods being sellable. */}
      <section className="bg-gradient-to-b from-[#f2fafc] via-[#f7fcfd] to-white py-16 lg:py-24 border-y border-slate-200">
        <div className="max-w-[1200px] mx-auto px-4 sm:px-6 lg:px-8">
          <div className="max-w-3xl mb-10">
            <h2 className="text-[1.75rem] sm:text-4xl font-semibold tracking-[-0.018em] leading-[1.12] text-balance text-slate-900 mb-4">
              Certification is what decides a Malaysian shipment
            </h2>
            <p className="text-slate-600 text-[15px] sm:text-base leading-[1.7] tracking-[-0.003em] text-pretty">
              Clearing customs and being allowed to sell are two different tests, and importers who have only ever bought domestically are often surprised by the gap. Goods can be released at the port and still be unsellable on a shelf. Everything below is settled at the factory, before a deposit is paid.
            </p>
          </div>
          <div className="grid gap-5 md:grid-cols-3">
            <div className="rounded-3xl border border-slate-200/70 bg-white/60 p-6">
              <h3 className="text-lg font-semibold tracking-[-0.016em] leading-snug text-slate-900 mb-3">Halal certification</h3>
              <p className="text-slate-600 text-sm sm:text-[15px] leading-[1.65] tracking-[-0.003em] text-pretty">
                A certificate on its own proves very little. What matters is whether the issuing body is one Malaysia recognises, whether it covers the exact production line your goods come off, and whether it is still valid on the date of manufacture. We verify all three at audit and keep the paperwork attached to the consignment rather than filed loose.
              </p>
            </div>
            <div className="rounded-3xl border border-slate-200/70 bg-white/60 p-6">
              <h3 className="text-lg font-semibold tracking-[-0.016em] leading-snug text-slate-900 mb-3">SIRIM and electrical goods</h3>
              <p className="text-slate-600 text-sm sm:text-[15px] leading-[1.65] tracking-[-0.003em] text-pretty">
                A wide range of electrical and electronic equipment needs approval before it can lawfully be sold. The process leans on test reports the factory has to be able to produce, so the practical question at sourcing stage is not whether a supplier claims compliance but whether it can hand over the documents that prove it.
              </p>
            </div>
            <div className="rounded-3xl border border-slate-200/70 bg-white/60 p-6">
              <h3 className="text-lg font-semibold tracking-[-0.016em] leading-snug text-slate-900 mb-3">Labelling and language</h3>
              <p className="text-slate-600 text-sm sm:text-[15px] leading-[1.65] tracking-[-0.003em] text-pretty">
                Retail-ready goods need their markings right before they are packed, not after they land. Re-labelling a container in a Malaysian warehouse costs more than printing it correctly in Guangdong, and on some categories it is not permitted at all once the goods have been released.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Second unique section: preferential duty under Form E. */}
      <section className="py-16 lg:py-24 bg-white">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8">
          <h2 className="text-[1.75rem] sm:text-4xl font-semibold tracking-[-0.018em] leading-[1.12] text-balance text-slate-900 mb-6">
            Form E, and paying the lower rate
          </h2>
          <p className="text-slate-600 text-[15px] sm:text-base leading-[1.75] tracking-[-0.003em] text-pretty mb-5">
            Malaysia and China both sit inside the ASEAN-China free trade arrangement, which means qualifying goods of Chinese origin can enter at a preferential rate rather than the standard tariff. The instrument that unlocks it is a certificate of origin known as Form E, and importers leave money on the table with it more often than any other document we handle.
          </p>
          <p className="text-slate-600 text-[15px] sm:text-base leading-[1.75] tracking-[-0.003em] text-pretty mb-6">
            The reason is timing. Form E is issued in China, by the authority there, against the shipment as described on the commercial invoice. It cannot be conjured up afterwards, and if the description, quantity or consignee on it does not match the rest of the paperwork it will not be accepted. What that means in practice:
          </p>
          <ul className="space-y-3.5 mb-6">
            <li className="flex items-start gap-3 text-slate-700 text-[15px] sm:text-base leading-[1.6]">
              <CheckCircle2 className="w-5 h-5 shrink-0 text-[#1d7e93] mt-0.5" />
              The certificate is arranged at export, not requested once the vessel has sailed
            </li>
            <li className="flex items-start gap-3 text-slate-700 text-[15px] sm:text-base leading-[1.6]">
              <CheckCircle2 className="w-5 h-5 shrink-0 text-[#1d7e93] mt-0.5" />
              Invoice, packing list and certificate describe the same goods in the same words
            </li>
            <li className="flex items-start gap-3 text-slate-700 text-[15px] sm:text-base leading-[1.6]">
              <CheckCircle2 className="w-5 h-5 shrink-0 text-[#1d7e93] mt-0.5" />
              The consignee named matches the entity actually importing
            </li>
            <li className="flex items-start gap-3 text-slate-700 text-[15px] sm:text-base leading-[1.6]">
              <CheckCircle2 className="w-5 h-5 shrink-0 text-[#1d7e93] mt-0.5" />
              Goods genuinely qualify on origin — assembled in China is not automatically of Chinese origin
            </li>
          </ul>
          <p className="text-slate-600 text-[15px] sm:text-base leading-[1.75] tracking-[-0.003em] text-pretty">
            Worth pairing with a second point about tax. Malaysia runs Sales and Service Tax rather than a VAT-style credit mechanism, so tax on imported goods generally stays in the chain instead of being reclaimed on a return. Duty saved through Form E is therefore a real saving, not a timing difference.
          </p>
        </div>
      </section>

      {/* Third unique section: ports and getting inland. */}
      <section className="py-16 lg:py-24 bg-slate-50 border-t border-slate-200">
        <div className="max-w-[1200px] mx-auto px-4 sm:px-6 lg:px-8">
          <div className="max-w-3xl mb-10">
            <h2 className="text-[1.75rem] sm:text-4xl font-semibold tracking-[-0.018em] leading-[1.12] text-balance text-slate-900 mb-4">
              Arriving, and getting inland
            </h2>
            <p className="text-slate-600 text-[15px] sm:text-base leading-[1.7] tracking-[-0.003em] text-pretty">
              The ocean leg from South China is short — around a week to ten days — so the schedule is rarely the constraint. Choosing the wrong entry point, however, can add days of trucking to a shipment that arrived on time.
            </p>
          </div>
          <div className="grid gap-5 md:grid-cols-3">
            <div className="liquid-glass-card p-5 flex flex-col">
              <h3 className="text-base sm:text-lg font-semibold tracking-[-0.016em] leading-snug text-slate-900 mb-2">Port Klang</h3>
              <p className="text-slate-600 text-sm leading-[1.55] tracking-[-0.003em] text-pretty">
                Where most of what we move discharges. The densest sailing schedules and the natural choice for the Klang Valley, Selangor and anything heading toward Kuala Lumpur.
              </p>
            </div>
            <div className="liquid-glass-card p-5 flex flex-col">
              <h3 className="text-base sm:text-lg font-semibold tracking-[-0.016em] leading-snug text-slate-900 mb-2">Penang</h3>
              <p className="text-slate-600 text-sm leading-[1.55] tracking-[-0.003em] text-pretty">
                Better for the north and for the electronics belt around it. Landing here rather than further south can remove a long inland haul on goods destined for Kedah or Perak.
              </p>
            </div>
            <div className="liquid-glass-card p-5 flex flex-col">
              <h3 className="text-base sm:text-lg font-semibold tracking-[-0.016em] leading-snug text-slate-900 mb-2">Tanjung Pelepas</h3>
              <p className="text-slate-600 text-sm leading-[1.55] tracking-[-0.003em] text-pretty">
                Serves Johor and the southern corridor, and suits cargo that is continuing on toward Singapore rather than staying in Malaysia.
              </p>
            </div>
          </div>
        </div>
      </section>

      <section className="py-10 lg:py-12 bg-white min-h-[calc(100svh-4rem)] flex flex-col justify-center">
        <div className="max-w-[1200px] mx-auto px-4 sm:px-6 lg:px-8 w-full">
          <div className="text-center mb-6 lg:mb-8">
            <h2 className="text-[1.75rem] sm:text-3xl lg:text-4xl font-semibold tracking-[-0.018em] leading-[1.12] text-balance text-slate-900 mb-3">
              500+ Categories We Can Source Into Malaysia
            </h2>
            <p className="text-slate-600 max-w-2xl mx-auto text-sm sm:text-[15px] leading-[1.6] tracking-[-0.003em] text-pretty">
              None of it is stock we hold. It maps what our factory base can make, which is why no prices appear against it — a Malaysian quotation depends on quantity, on certification, and on whether the goods qualify for preferential duty.
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
            Cannot see it? Send us the product and we will identify the plant that makes it, or{" "}
            <Link href="/products/" className="font-medium text-[#176579] hover:text-[#27a8c4] hover:underline transition-colors">
              open the full catalogue
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
                What we bring to a Malaysian import
              </h2>
              <p className="text-slate-300 mb-8 leading-[1.6] tracking-[-0.003em] text-pretty">
                Certification, origin documents and inspection all happen inside China, and none of them can be repaired from Melaka once a container has sailed. Having the same company at both ends is what makes them fixable while they are still cheap to fix.
              </p>
              <ul className="space-y-4 mb-8">
                <li className="flex items-center gap-3 text-slate-200">
                  <CheckCircle2 className="w-5 h-5 shrink-0 text-brand" /> Certification checked at the factory, not assumed from a listing
                </li>
                <li className="flex items-center gap-3 text-slate-200">
                  <CheckCircle2 className="w-5 h-5 shrink-0 text-brand" /> Form E arranged at export so preferential duty is not lost
                </li>
                <li className="flex items-center gap-3 text-slate-200">
                  <CheckCircle2 className="w-5 h-5 shrink-0 text-brand" /> Entry port chosen for where the goods are actually going
                </li>
                <li className="flex items-center gap-3 text-slate-200">
                  <CheckCircle2 className="w-5 h-5 shrink-0 text-brand" /> A company that has been doing this since {FOUNDED_YEAR}, {yearsTrading} years now
                </li>
              </ul>
              <div className="flex flex-col sm:flex-row gap-4 sm:gap-6 mt-6">
                <Link href="/about/" className="inline-flex items-center gap-2 text-brand font-semibold hover:text-brand-dark transition-colors">
                  Learn more about our company →
                </Link>
                <Link href="/contact/" className="inline-flex items-center gap-2 text-slate-400 font-medium hover:text-slate-200 transition-colors">
                  Contact the Melaka office →
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
        detail="AFFHAN Group holds an average of 4.8 out of 5 from 144 Google reviews. Those reviews sit on the Chennai head-office profile, where the company has traded since 2000."
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

      <OtherLocations current="sourcing-company-malaysia" />

      <FooterSection />
    </main>
  );
}
