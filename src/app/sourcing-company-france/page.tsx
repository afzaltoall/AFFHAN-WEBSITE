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

const PAGE_TITLE = "Sourcing Company in France | China Sourcing Agent | Affhan";

const PAGE_DESCRIPTION =
  "Affhan is a China sourcing agent in France handling factory sourcing, inspection, EU customs clearance and freight into Le Havre, Marseille and Fos.";

export const metadata: Metadata = {
  title: PAGE_TITLE,
  description: PAGE_DESCRIPTION,
  alternates: { canonical: "https://affhan.com/sourcing-company-france/" },
  openGraph: {
    title: PAGE_TITLE,
    description: PAGE_DESCRIPTION,
    url: "https://affhan.com/sourcing-company-france/",
    type: "website",
    siteName: "Affhan",
    images: [{ url: "/images/logo.png", width: 800, height: 600 }],
  },
  twitter: { card: "summary_large_image", title: PAGE_TITLE, description: PAGE_DESCRIPTION },
};

const FOUNDED_YEAR = 2000;
const yearsTrading = new Date().getFullYear() - FOUNDED_YEAR;

/**
 * The ninth location page, and the newest office by some margin.
 *
 * Two things make France a different page rather than the UK page with the
 * nouns swapped. It is inside the customs union, so clearing once at Le Havre
 * puts goods in free circulation across twenty-seven member states — which the
 * post-Brexit UK page cannot say. And France layers its own producer
 * obligations on top of the EU baseline through the AGEC law, which catches
 * categories most buyers do not expect.
 *
 * Written to say we FLAG AND PREPARE FOR those obligations, never that we
 * assume them. EPR and GPSR duties sit with whoever places the goods on the
 * market, which on FOB terms is the client and not Affhan. If this office ever
 * acts as importer of record on DDP terms, this page needs revisiting.
 *
 * The TVA autoliquidation and CBAM passages are the two time-sensitive claims
 * here; both are with the company's broker for confirmation as of 2026-09-16.
 */
const faqs = [
  {
    question: "Do I need a sourcing agent in France, or can I buy from China directly?",
    answer:
      "You can buy directly, and plenty of French importers do. What you take on is supplier verification, production oversight at eight thousand kilometres, and the conformity file that customs will ask for. An agent is worth it when the order is large enough that a bad container hurts, or technical enough that “close enough” is not.",
  },
  {
    question: "How long does shipping from China to France take?",
    answer:
      "Our China to Northern Europe lane runs about 45 days port to port into Le Havre. Marseille-Fos via Suez can be shorter for the right routing. Neither figure includes production before the sailing, or clearance and the inland leg after it. Transhipment and Red Sea routing move the range, so we quote what we have seen on the lane rather than the schedule.",
  },
  {
    question: "Which French port should I clear through?",
    answer:
      "Le Havre for most buyers — it takes mainline Asia–North Europe services and connects up the Seine to the Paris basin. Marseille-Fos if you are distributing into the south-east, Italy or Spain. Duty is identical either way, so the inland leg usually decides it, and we will price both.",
  },
  {
    question: "Do I pay import VAT at the border?",
    answer:
      "No. Since January 2022 import VAT in France is reverse-charged automatically on your CA3 return — declared and deducted in the same filing rather than paid at the frontier. For a business reclaiming in full this is a bookkeeping entry rather than a cash-flow cost. You will need a French VAT number and an EORI.",
  },
  {
    question: "If I clear goods in France, can I sell them across the EU?",
    answer:
      "Yes. Goods released into free circulation at a French port are in free circulation throughout the customs union. You pay the Common Customs Tariff once at the point of entry, and the goods then move to any of the twenty-seven member states without further customs formality.",
  },
  {
    question: "Who is responsible for CE marking — me or the factory?",
    answer:
      "You are, in most cases. The importer placing goods on the EU market carries the manufacturer’s obligations, so the CE mark must be backed by a real technical file and a Declaration of Conformity you can produce on request. Since December 2024 the GPSR also requires a named responsible person established in the EU. A CE logo emailed as an image is not compliance.",
  },
  {
    question: "What is the Triman logo and does it apply to what I import?",
    answer:
      "It is the French sorting mark required on many products and packaging sold in France under the AGEC law, alongside registration with an eco-organisme and an ADEME identifier. Scope is broader than most buyers expect — furniture, textiles, toys, DIY and sports goods among others. We raise it at quotation, because artwork is cheap to change before a print run.",
  },
  {
    question: "Does CBAM affect my imports?",
    answer:
      "Only if you import iron, steel, aluminium, cement, fertiliser or hydrogen, including many finished goods made from them. From January 2026 the definitive regime attaches a cost to embedded emissions, and the data has to come from the Chinese producer. We ask for it during supplier selection, because a factory that cannot supply it will cost you more per tonne than its quote suggests.",
  },
];

const schema = {
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "LocalBusiness",
      "@id": "https://affhan.com/#localbusiness-france",
      parentOrganization: { "@id": ORG_ID },
      name: OFFICES.france.legalName,
      legalName: OFFICES.france.legalName,
      url: "https://affhan.com/sourcing-company-france/",
      logo: LOGO_URL,
      image: LOGO_URL,
      foundingDate: FOUNDING_DATE,
      sameAs: [...SOCIAL_PROFILES],
      description:
        "Affhan is a China sourcing agent in France handling factory sourcing, inspection, EU customs clearance and freight into Le Havre, Marseille and Fos.",
      // Confirmed by the company on 2026-09-16. Before that this office had no
      // published number anywhere and brand.ts carried no telephone for it.
      telephone: OFFICES.france.telephone,
      email: "info@affhan.com",
      // profileConfirmed is false for France in src/lib/brand.ts: the address
      // is from company records and has not been reconciled against a verified
      // Google profile. No aggregateRating here — see the GoogleRating note
      // further down, and the site-wide policy on review markup.
      address: postalAddress(OFFICES.france),
      areaServed: { "@type": "Country", name: "France" },
    },
    {
      "@type": "Service",
      serviceType: "Product Sourcing and Freight Forwarding",
      provider: { "@id": "https://affhan.com/#localbusiness-france" },
      areaServed: [
        { "@type": "Country", name: "France" },
        { "@type": "Place", name: "European Union" },
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
    {
      // The sourcing-company-* family does not carry breadcrumbs; the China
      // page does. Included here because it costs nothing and gives the page a
      // named parent in results.
      "@type": "BreadcrumbList",
      itemListElement: [
        { "@type": "ListItem", position: 1, name: "Home", item: "https://affhan.com/" },
        { "@type": "ListItem", position: 2, name: "Sourcing Company in France", item: "https://affhan.com/sourcing-company-france/" },
      ],
    },
  ],
};

export default async function SourcingCompanyFrancePage() {
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
                Sourcing Company &amp; China Sourcing Agent in France — <span className="text-[#1d7e93]">AFFHAN Group</span>
              </h1>
              <p className="hero-rise hero-rise-2 max-w-2xl mx-auto text-base sm:text-[17px] text-slate-600 mb-9 sm:mb-10 leading-[1.65] tracking-[-0.004em] text-pretty">
                Affhan has been buying out of China since {FOUNDED_YEAR}, and now runs seven offices — one of them in Paris. For a French buyer that means one company standing at both ends of the shipment: our people in Guangzhou choose the factory and inspect what comes off the line, and our people in Europe handle the paperwork that gets the container off the quay at <strong className="text-slate-800">Le Havre</strong>.
              </p>
              <div className="hero-rise hero-rise-3 flex justify-center">
                <Link
                  href="/"
                  className="cta-sheen group inline-flex items-center justify-center gap-2 rounded-xl border border-slate-300/80 bg-white/70 px-8 py-3.5 text-[15px] font-medium tracking-[-0.01em] text-slate-800 shadow-[0_1px_2px_rgba(15,23,42,0.05)] backdrop-blur-sm transition-all duration-300 ease-out hover:border-brand/45 hover:bg-white hover:text-[#176579] hover:shadow-[0_2px_10px_rgba(15,23,42,0.07),0_10px_30px_-10px_rgba(39,168,196,0.5)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/40 focus-visible:ring-offset-2 motion-safe:hover:scale-[1.02] motion-safe:active:scale-[0.98]"
                >
                  Visit Affhan Website
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
              What a Sourcing Agent in France Actually Does
            </h2>
            <p className="text-slate-600 max-w-2xl mx-auto text-sm sm:text-[15px] leading-[1.6] tracking-[-0.003em] text-pretty">
              Most French importers do not have trouble finding Chinese suppliers. The trouble is knowing which of them is a factory rather than a trader, and who answers the phone when the container lands.
            </p>
          </div>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4 lg:gap-5">
            <div className="liquid-glass-card p-5 flex flex-col">
              <h3 className="text-lg sm:text-xl font-semibold tracking-[-0.016em] leading-snug text-slate-900 mb-2">Finding the maker</h3>
              <p className="text-slate-600 text-sm leading-[1.55] tracking-[-0.003em] text-pretty">
                We identify and audit the factory, negotiate in Mandarin on your behalf, and hold the pre-production sample against your specification before anything goes into production.
              </p>
              <p className="mt-auto pt-3 text-[12.5px] leading-[1.5] text-slate-500 border-t border-white/70">
                <span className="font-semibold text-slate-600">Covers: </span>supplier shortlisting, price negotiation, samples, tooling
              </p>
            </div>
            <div className="liquid-glass-card p-5 flex flex-col">
              <h3 className="text-lg sm:text-xl font-semibold tracking-[-0.016em] leading-snug text-slate-900 mb-2">Checking it before it sails</h3>
              <p className="text-slate-600 text-sm leading-[1.55] tracking-[-0.003em] text-pretty">
                Inspection during the run rather than after it. A fault found at forty per cent completion is a correction; the same fault found at packing is a reorder, and on a 45-day lane that is a lost quarter.
              </p>
              <p className="mt-auto pt-3 text-[12.5px] leading-[1.5] text-slate-500 border-t border-white/70">
                <span className="font-semibold text-slate-600">Covers: </span>factory audit, in-line checks, pre-shipment inspection, photo and video reports
              </p>
            </div>
            <div className="liquid-glass-card p-5 flex flex-col">
              <h3 className="text-lg sm:text-xl font-semibold tracking-[-0.016em] leading-snug text-slate-900 mb-2">Documents and delivery</h3>
              <p className="text-slate-600 text-sm leading-[1.55] tracking-[-0.003em] text-pretty">
                Commercial invoice, packing list, bill of lading, certificate of origin where a preference applies, and the conformity file customs and the DGCCRF can ask to see.
              </p>
              <p className="mt-auto pt-3 text-[12.5px] leading-[1.5] text-slate-500 border-t border-white/70">
                <span className="font-semibold text-slate-600">Covers: </span>FCL and LCL booking, consolidation, customs documentation, inland delivery
              </p>
            </div>
          </div>
          <p className="text-center text-slate-600 text-[15px] sm:text-base leading-[1.7] mt-7 max-w-3xl mx-auto text-pretty">
            <strong className="text-slate-800">We are a sourcing company and an NVOCC, not a broker.</strong> The freight is ours to arrange rather than something we hand to a forwarder and mark up, which is why the quote covers the goods and the movement in one number instead of two that arrive a fortnight apart.
          </p>
        </div>
      </section>

      {/* The section that does not exist on the UK page and cannot: the single
          market. This is the strongest reason a French buyer should read this
          page rather than the London one. */}
      <section className="py-16 lg:py-24 bg-white border-t border-slate-200">
        <div className="max-w-[1200px] mx-auto px-4 sm:px-6 lg:px-8">
          <div className="max-w-3xl mb-10">
            <h2 className="text-[1.75rem] sm:text-4xl font-semibold tracking-[-0.018em] leading-[1.12] text-balance text-slate-900 mb-4">
              Clear once, sell into twenty-seven
            </h2>
            <p className="text-slate-600 text-[15px] sm:text-base leading-[1.7] tracking-[-0.003em] text-pretty">
              The single most useful fact about importing into France is that you are importing into the European Union. Goods released into free circulation at Le Havre are in free circulation in Germany, Spain, Italy and the other twenty-three member states. You pay the Common Customs Tariff once, at the first point of entry, and the goods then move without further customs formality.
            </p>
          </div>
          <div className="grid gap-5 lg:grid-cols-2">
            <div className="rounded-3xl border border-slate-200/70 bg-slate-50 p-6 sm:p-8">
              <h3 className="text-lg sm:text-xl font-semibold tracking-[-0.016em] leading-snug text-slate-900 mb-3">It changes which port, not which country</h3>
              <p className="text-slate-600 text-sm sm:text-[15px] leading-[1.7] tracking-[-0.003em] text-pretty">
                If you are selling across the EU, the question is not which country to import into but which port gives you the best inland leg, because the duty is identical either way. For most French buyers that answer is Le Havre. For anyone serving southern France, Italy or Spain it is often Marseille-Fos.
              </p>
            </div>
            <div className="rounded-3xl border border-slate-200/70 bg-slate-50 p-6 sm:p-8">
              <h3 className="text-lg sm:text-xl font-semibold tracking-[-0.016em] leading-snug text-slate-900 mb-3">Two registrations make it work</h3>
              <p className="text-slate-600 text-sm sm:text-[15px] leading-[1.7] tracking-[-0.003em] text-pretty">
                An <strong className="text-slate-800">EORI number</strong> identifies you to customs across the EU — a French one is normally your SIRET prefixed with FR. And a French VAT number, because since January 2022 import VAT here is not paid at the border at all: it is reverse-charged automatically on your CA3 return, declared and deducted in the same filing. For a business reclaiming in full, that moved import VAT from a cash-flow cost to a bookkeeping entry.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Compliance, then France's own layer on top of it. Kept as two separate
          sections because the EU baseline applies to every member state and the
          AGEC material is specific to this one. */}
      <section className="py-16 lg:py-24 bg-slate-50 border-t border-slate-200">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8">
          <h2 className="text-[1.75rem] sm:text-4xl font-semibold tracking-[-0.018em] leading-[1.12] text-balance text-slate-900 mb-6">
            Compliance is what actually stops a shipment
          </h2>
          <p className="text-slate-600 text-[15px] sm:text-base leading-[1.75] tracking-[-0.003em] text-pretty mb-5">
            Duty is arithmetic. Compliance is where consignments get held, and it is where a sourcing agent earns the fee.
          </p>
          <p className="text-slate-600 text-[15px] sm:text-base leading-[1.75] tracking-[-0.003em] text-pretty mb-5">
            For most manufactured goods entering the EU, the importer — not the Chinese factory — is the economic operator responsible for conformity. If you put your name on the product, you carry the obligations of a manufacturer. That means the <strong className="text-slate-800">CE marking</strong> has to be justified by a real technical file, and the <strong className="text-slate-800">Declaration of Conformity</strong> has to exist, name the applicable directives, and be produced on request. A factory that emails you a CE logo as a JPEG has given you nothing.
          </p>
          <p className="text-slate-600 text-[15px] sm:text-base leading-[1.75] tracking-[-0.003em] text-pretty mb-6">
            Since December 2024 the <strong className="text-slate-800">General Product Safety Regulation</strong> has added a second requirement: any product sold to EU consumers needs a responsible person established in the EU, named on the product or its packaging, who can be contacted about safety. For an importer of record established in France, that is you. It is not something the factory can hold on your behalf from Guangdong.
          </p>
          <p className="text-slate-600 text-[15px] sm:text-base leading-[1.75] tracking-[-0.003em] text-pretty">
            We build the conformity file at the factory, while the goods are still on the line and a missing test report can still be obtained — rather than at the port, where it cannot.
          </p>
        </div>
      </section>

      <section className="py-16 lg:py-24 bg-white border-t border-slate-200">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8">
          <h2 className="text-[1.75rem] sm:text-4xl font-semibold tracking-[-0.018em] leading-[1.12] text-balance text-slate-900 mb-6">
            France&apos;s own layer: AGEC, EPR and Triman
          </h2>
          <p className="text-slate-600 text-[15px] sm:text-base leading-[1.75] tracking-[-0.003em] text-pretty mb-5">
            France goes further than the EU baseline, and this is the part that surprises buyers who have imported into other member states before.
          </p>
          <p className="text-slate-600 text-[15px] sm:text-base leading-[1.75] tracking-[-0.003em] text-pretty mb-5">
            Under the <em>loi AGEC</em>, extended producer responsibility covers far more categories in France than the packaging and electricals most people expect — furniture, textiles, toys, DIY and garden equipment, sports goods and more. If you are the first party placing those goods on the French market, you are the producer for EPR purposes. That means registering with the relevant eco-organisme, obtaining a <strong className="text-slate-800">numéro d&apos;identifiant unique</strong> from ADEME, declaring volumes and paying the eco-contribution.
          </p>
          <p className="text-slate-600 text-[15px] sm:text-base leading-[1.75] tracking-[-0.003em] text-pretty mb-5">
            There is also the <strong className="text-slate-800">Triman</strong> logo and its sorting instructions, which must appear on in-scope products or packaging sold in France. Getting that artwork right at the factory costs nothing; getting it wrong means relabelling a container in a French warehouse.
          </p>
          <p className="text-slate-600 text-[15px] sm:text-base leading-[1.75] tracking-[-0.003em] text-pretty">
            We raise these at the quotation stage, because they change the artwork and sometimes the packaging spec — and artwork is cheap to change before a print run and expensive afterwards.
          </p>
        </div>
      </section>

      <section className="py-16 lg:py-24 bg-slate-50 border-t border-slate-200">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8">
          <h2 className="text-[1.75rem] sm:text-4xl font-semibold tracking-[-0.018em] leading-[1.12] text-balance text-slate-900 mb-6">
            CBAM, if you import metals or cement
          </h2>
          <p className="text-slate-600 text-[15px] sm:text-base leading-[1.75] tracking-[-0.003em] text-pretty mb-5">
            If what you are buying is iron, steel, aluminium, cement, fertiliser or hydrogen — including many finished goods made from them, such as fixings, brackets, tooling and structural components — the Carbon Border Adjustment Mechanism applies to you.
          </p>
          <p className="text-slate-600 text-[15px] sm:text-base leading-[1.75] tracking-[-0.003em] text-pretty mb-5">
            The transitional phase ran on reporting alone. The definitive regime, from January 2026, attaches a cost: declarants buy CBAM certificates against the embedded emissions of what they import. The practical consequence for sourcing is that emissions data has to come from the Chinese producer, and producers vary enormously in their ability to supply it in the required form.
          </p>
          <p className="text-slate-600 text-[15px] sm:text-base leading-[1.75] tracking-[-0.003em] text-pretty">
            We ask for it during supplier selection rather than after the order is placed, because a factory that cannot produce the data is a factory that will cost you more per tonne than its quotation suggests.
          </p>
        </div>
      </section>

      <section className="py-16 lg:py-24 bg-white border-t border-slate-200">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8">
          <h2 className="text-[1.75rem] sm:text-4xl font-semibold tracking-[-0.018em] leading-[1.12] text-balance text-slate-900 mb-6">
            Ports, lanes and how long it really takes
          </h2>
          <ul className="space-y-3.5 mb-6">
            <li className="flex items-start gap-3 text-slate-700 text-[15px] sm:text-base leading-[1.6]">
              <CheckCircle2 className="w-5 h-5 shrink-0 text-[#1d7e93] mt-0.5" />
              <span><strong className="text-slate-900">Le Havre</strong> — the default. France&apos;s main deepwater container gateway on the Channel, taking mainline Asia–North Europe services directly, with rail and barge links up the Seine to the Paris basin.</span>
            </li>
            <li className="flex items-start gap-3 text-slate-700 text-[15px] sm:text-base leading-[1.6]">
              <CheckCircle2 className="w-5 h-5 shrink-0 text-[#1d7e93] mt-0.5" />
              <span><strong className="text-slate-900">Marseille-Fos</strong> — the Mediterranean alternative, genuinely faster for the right cargo. A box routed through Suez to Fos avoids the run around Iberia and up the Channel.</span>
            </li>
            <li className="flex items-start gap-3 text-slate-700 text-[15px] sm:text-base leading-[1.6]">
              <CheckCircle2 className="w-5 h-5 shrink-0 text-[#1d7e93] mt-0.5" />
              <span><strong className="text-slate-900">Dunkerque</strong> — worth knowing for bulk and project cargo, and for buyers whose onward distribution runs into Belgium or the Netherlands.</span>
            </li>
          </ul>
          <p className="text-slate-600 text-[15px] sm:text-base leading-[1.75] tracking-[-0.003em] text-pretty">
            On timing, the honest answer is a range, and anyone quoting you a single number is quoting you a best case. Our own China to Northern Europe lane runs about <strong className="text-slate-800">45 days port to port</strong>. That is the sailing; it does not include the factory&apos;s production time before it or customs clearance and the inland leg after it. Transhipment, blank sailings and Red Sea routing all move it, and they have moved it a great deal in recent years. We quote the range we have actually seen on the lane rather than the carrier&apos;s schedule.
          </p>
        </div>
      </section>

      {/* Incoterms, placed after compliance on purpose: the three letters decide
          who the importer of record is, which decides who carries everything
          described above. */}
      <section className="py-16 lg:py-24 bg-slate-50 border-t border-slate-200">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8">
          <h2 className="text-[1.75rem] sm:text-4xl font-semibold tracking-[-0.018em] leading-[1.12] text-balance text-slate-900 mb-6">
            Incoterms decide more than who pays the freight
          </h2>
          <p className="text-slate-600 text-[15px] sm:text-base leading-[1.75] tracking-[-0.003em] text-pretty mb-5">
            The three letters on your proforma invoice decide who is the importer of record, and that decides who carries the compliance obligations described above. It is worth more attention than it usually gets.
          </p>
          <div className="space-y-4 mb-6">
            <div className="rounded-2xl border border-slate-200/70 bg-white p-5 sm:p-6">
              <h3 className="text-base sm:text-lg font-semibold tracking-[-0.014em] text-slate-900 mb-2">EXW</h3>
              <p className="text-slate-600 text-sm sm:text-[15px] leading-[1.7] tracking-[-0.003em] text-pretty">
                Puts everything on you from the factory gate, including export clearance in China, which a French buyer is poorly placed to arrange. We rarely recommend it.
              </p>
            </div>
            <div className="rounded-2xl border border-slate-200/70 bg-white p-5 sm:p-6">
              <h3 className="text-base sm:text-lg font-semibold tracking-[-0.014em] text-slate-900 mb-2">FOB</h3>
              <p className="text-slate-600 text-sm sm:text-[15px] leading-[1.7] tracking-[-0.003em] text-pretty">
                The common ground, and what most of our French clients use. The supplier delivers to the Chinese port and clears for export; from the rail onwards the shipment is yours, which means we can control the freight leg and you remain the importer of record in France — so the EORI, the VAT reverse charge, the conformity file and the EPR registrations sit with you, where they belong for a business selling in its own name.
              </p>
            </div>
            <div className="rounded-2xl border border-slate-200/70 bg-white p-5 sm:p-6">
              <h3 className="text-base sm:text-lg font-semibold tracking-[-0.014em] text-slate-900 mb-2">DDP</h3>
              <p className="text-slate-600 text-sm sm:text-[15px] leading-[1.7] tracking-[-0.003em] text-pretty">
                Looks attractive because one number covers everything to your door, and it is occasionally the right answer for a first small order. Be careful with it. A DDP price quoted by a Chinese supplier often assumes an import route you would not choose if you saw it, and it does not relieve you of the producer obligations under AGEC if you are the one selling the goods in France.
              </p>
            </div>
          </div>
          <p className="text-slate-600 text-[15px] sm:text-base leading-[1.75] tracking-[-0.003em] text-pretty">
            We will tell you which of the three fits the order rather than quoting whichever is easiest to put on a page.
          </p>
        </div>
      </section>

      <section className="py-16 lg:py-24 bg-white border-t border-slate-200">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8">
          <h2 className="text-[1.75rem] sm:text-4xl font-semibold tracking-[-0.018em] leading-[1.12] text-balance text-slate-900 mb-6">
            How an order runs, start to finish
          </h2>
          <p className="text-slate-600 text-[15px] sm:text-base leading-[1.75] tracking-[-0.003em] text-pretty mb-5">
            You send a specification, a drawing, a photograph or a link to something close enough. We come back with a shortlist of factories that can actually make it, with indicative pricing at your volume and an honest note on where the price breaks — the difference between 500 and 2,000 units is often larger than buyers expect.
          </p>
          <p className="text-slate-600 text-[15px] sm:text-base leading-[1.75] tracking-[-0.003em] text-pretty mb-5">
            You pick a supplier and we take a pre-production sample. Nothing goes into production until you have held that sample. Once it does, our Guangzhou team inspects during the run rather than at the end, because a fault found at forty per cent completion is a correction and the same fault found at the packing stage is a reorder.
          </p>
          <p className="text-slate-600 text-[15px] sm:text-base leading-[1.75] tracking-[-0.003em] text-pretty mb-5">
            We consolidate, book the freight, and prepare the documents. If you are clearing in your own name we hand your broker a complete file; if you would rather we handled the European end, our Paris office does that. The goods arrive, you clear them once, and they are then free to move anywhere in the union.
          </p>
          <p className="text-slate-600 text-[15px] sm:text-base leading-[1.75] tracking-[-0.003em] text-pretty">
            Throughout, you are dealing with one company. The person who audited the factory and the person who can tell you where your container is work for the same business, which is the entire argument for using us rather than assembling a sourcing agent, an inspection firm and a forwarder yourself.
          </p>
        </div>
      </section>

      <section className="py-10 lg:py-12 bg-white min-h-[calc(100svh-4rem)] flex flex-col justify-center border-t border-slate-200">
        <div className="max-w-[1200px] mx-auto px-4 sm:px-6 lg:px-8 w-full">
          <div className="text-center mb-6 lg:mb-8">
            <h2 className="text-[1.75rem] sm:text-3xl lg:text-4xl font-semibold tracking-[-0.018em] leading-[1.12] text-balance text-slate-900 mb-3">
              What French Buyers Actually Ask Us For
            </h2>
            <p className="text-slate-600 max-w-2xl mx-auto text-sm sm:text-[15px] leading-[1.6] tracking-[-0.003em] text-pretty">
              Our catalogue runs to more than a million products across five hundred-odd categories, which is a way of saying we can source most things rather than that we stock any of them. The listings demonstrate manufacturing access; they are not an inventory, which is why nothing carries a price.
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
            What French and EU buyers come to us for most often is promotional and branded merchandise, retail packaging, homeware and kitchen goods, textiles and workwear, small electricals and accessories, store fixtures and display, and hardware and fixings. Something else in mind? Send the item over, or{" "}
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
                The Paris office
              </h2>
              <p className="text-slate-300 mb-5 leading-[1.6] tracking-[-0.003em] text-pretty">
                Our French office is at <strong className="text-white">14 Rue de Dunkerque, 75010 Paris</strong>, a few minutes from Gare du Nord, and you can reach it on{" "}
                <a href="tel:+33695144606" className="font-semibold text-brand hover:text-white transition-colors">+33 695 144 606</a>.
              </p>
              <p className="text-slate-300 mb-8 leading-[1.6] tracking-[-0.003em] text-pretty">
                It is the newest of our seven offices and we would rather say so than imply otherwise. It has no Google reviews of its own yet and no office photographs to show you. What stands behind it is the same company that has been trading since {FOUNDED_YEAR}.
              </p>
              <ul className="space-y-4 mb-8">
                <li className="flex items-center gap-3 text-slate-200">
                  <CheckCircle2 className="w-5 h-5 shrink-0 text-brand" /> Buyers of ours inside China, not an introduction to somebody else&apos;s
                </li>
                <li className="flex items-center gap-3 text-slate-200">
                  <CheckCircle2 className="w-5 h-5 shrink-0 text-brand" /> Conformity file built at the factory, not reconstructed at the port
                </li>
                <li className="flex items-center gap-3 text-slate-200">
                  <CheckCircle2 className="w-5 h-5 shrink-0 text-brand" /> Cleared once at Le Havre or Fos, then free to move across the union
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
                  Reach the Paris desk →
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
                  <CountUpStat value={45} />
                </div>
                <div className="text-xs sm:text-sm text-slate-400 font-medium uppercase tracking-wider leading-tight">Days · China to Le Havre</div>
              </div>
              <div className="bg-slate-800 p-6 rounded-2xl text-center">
                <div className="text-[1.75rem] sm:text-4xl font-bold tracking-[-0.032em] leading-none text-brand mb-2 tabular-nums whitespace-nowrap">4.8</div>
                <div className="text-xs sm:text-sm text-slate-400 font-medium uppercase tracking-wider leading-tight">Google · Chennai HQ</div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* No href: the France office has no verified Google profile, and all
          eight sibling pages omit it too. No aggregateRating anywhere — the
          4.8/144 belongs to the Chennai profile and is presented as prose that
          says so, which is the site-wide policy under Google's review-snippet
          rules. The "newly established" wording is deliberate: this office has
          no reviews of its own and the page should not imply it does. */}
      <GoogleRating
        heading="Our Record on Google"
        rating={4.8}
        detail="The Paris office is newly established and has no reviews of its own yet. Across 144 Google reviews, AFFHAN Group averages 4.8 out of 5 — that profile belongs to the Chennai head office, which has been trading since 2000."
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

      <OtherLocations current="sourcing-company-france" />

      <FooterSection />
    </main>
  );
}
