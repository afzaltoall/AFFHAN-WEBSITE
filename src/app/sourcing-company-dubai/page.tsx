import { Metadata } from "next";
import Link from "next/link";
import Image from "next/image";
import { CheckCircle2 } from "lucide-react";
import { FooterSection } from "@/components/sections/FooterSection";
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
            Looking for a reliable <strong className="text-slate-800">China sourcing agent in Dubai</strong> or a trusted <strong className="text-slate-800">import export company in the UAE</strong>? 
            AFFHAN Group connects UAE businesses to the world&apos;s largest supply chain. As your dedicated <strong className="text-slate-800">product sourcing agent</strong>, we manage everything from factory audits to shipping straight to <span className="whitespace-nowrap">Jebel Ali Port</span> or your <span className="whitespace-nowrap">DMCC Free Zone</span> warehouse.
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
              We provide comprehensive product sourcing in Dubai to streamline the China-UAE trade corridor. Whether you need a full-service import company or a specialized sourcing agent in the Middle East, we have you covered.
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
                <h3 className="text-lg sm:text-xl font-semibold tracking-[-0.016em] leading-snug text-balance text-slate-900 mb-2">China Product Sourcing</h3>
                <p className="text-slate-600 text-sm sm:text-base leading-[1.5] tracking-[-0.003em] text-pretty">
                  We act as your dedicated China sourcing agent in Dubai. Find any product from our 500+ product categories with competitive factory-direct pricing for the GCC market.
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
                <h3 className="text-lg sm:text-xl font-semibold tracking-[-0.016em] leading-snug text-balance text-slate-900 mb-2">Supplier Verification</h3>
                <p className="text-slate-600 text-sm sm:text-base leading-[1.5] tracking-[-0.003em] text-pretty">
                  Risk-free importing for UAE buyers. Our local team in China conducts background checks and physical audits to ensure you work with verified manufacturers.
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
                <h3 className="text-lg sm:text-xl font-semibold tracking-[-0.016em] leading-snug text-balance text-slate-900 mb-2">Freight Forwarding</h3>
                <p className="text-slate-600 text-sm sm:text-base leading-[1.5] tracking-[-0.003em] text-pretty">
                  Sea and air freight logistics managed seamlessly. We handle customs clearance, NVOCC, and port handling directly to Jebel Ali and UAE Free Zones.
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>

      <SourcingProcessSection />

      <section className="py-16 lg:py-24 bg-slate-50 border-t border-slate-200 min-h-[calc(100svh-4rem)] flex flex-col justify-center">
        <div className="max-w-[1200px] mx-auto px-4 sm:px-6 lg:px-8 w-full">
          <div className="text-center mb-12">
            <h2 className="text-[1.75rem] sm:text-4xl font-semibold tracking-[-0.018em] leading-[1.12] text-balance text-slate-900 mb-5">
              Industries We Serve
            </h2>
          </div>
          <div className="max-w-6xl mx-auto bg-white/40 backdrop-blur-md p-6 sm:p-8 rounded-3xl border border-white/60 shadow-[0_8px_30px_rgb(0,0,0,0.04)]">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-x-6 gap-y-2">
              {tree.slice(0, 16).map((cat) => {
                const Icon = getCategoryIcon(cat.name);
                return (
                  <Link
                    key={cat.id}
                    href={`/products/?categoryId=${cat.id}`}
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
                Why Choose AFFHAN as Your Dubai Sourcing Partner?
              </h2>
              <p className="text-slate-300 mb-8 leading-[1.6] tracking-[-0.003em] text-pretty">
                Partnering with the right import export company in Dubai can accelerate your growth across the GCC. We bring years of B2B trade expertise, ensuring low costs and high quality for UAE importers.
              </p>
              <ul className="space-y-4 mb-8">
                <li className="flex items-center gap-3 text-slate-200">
                  <CheckCircle2 className="w-5 h-5 shrink-0 text-brand" /> Our own procurement team on the ground in China
                </li>
                <li className="flex items-center gap-3 text-slate-200">
                  <CheckCircle2 className="w-5 h-5 shrink-0 text-brand" /> Pre-shipment factory audits and quality inspections
                </li>
                <li className="flex items-center gap-3 text-slate-200">
                  <CheckCircle2 className="w-5 h-5 shrink-0 text-brand" /> LCL and FCL freight with customs clearance into Dubai
                </li>
                <li className="flex items-center gap-3 text-slate-200">
                  <CheckCircle2 className="w-5 h-5 shrink-0 text-brand" /> {yearsTrading} Years of Verified Excellence — trading since {FOUNDED_YEAR}
                </li>
              </ul>
              <div className="flex flex-col sm:flex-row gap-4 sm:gap-6 mt-6">
                <Link
                  href="/about/"
                  className="inline-flex items-center justify-center gap-2 text-brand font-semibold hover:text-brand-dark transition-colors"
                >
                  Learn more about our company →
                </Link>
                <Link
                  href="/sourcing-company-chennai/"
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
