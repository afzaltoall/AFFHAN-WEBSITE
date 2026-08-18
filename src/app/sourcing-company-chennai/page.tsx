import { Metadata } from "next";
import Link from "next/link";
import { CheckCircle2, ShieldCheck, Ship, Search } from "lucide-react";
import { FooterSection } from "@/components/sections/FooterSection";

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
      "With over 3+ years of proven expertise, a 4.8 rating, and direct presence in China and Chennai, AFFHAN eliminates the middleman. We provide seamless B2B sourcing from a catalog of over 10 Lakhs+ products across 50,000+ categories.",
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

export default function SourcingCompanyChennaiPage() {
  return (
    <main className="w-full bg-slate-50 min-h-screen pt-24 pb-0">
      {/* JSON-LD Schemas */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(schema) }}
      />

      {/* Hero Section */}
      <section className="max-w-[1200px] mx-auto px-4 sm:px-6 lg:px-8 py-12 lg:py-20">
        <div className="text-center max-w-4xl mx-auto">
          <h1 className="text-3xl sm:text-4xl lg:text-5xl font-black tracking-tight text-slate-900 mb-6">
            Sourcing Agent & Sourcing Company in Chennai — <span className="text-brand">AFFHAN Group</span>
          </h1>
          <p className="text-lg text-slate-600 mb-8 leading-relaxed">
            Looking for a reliable <strong className="text-slate-800">China sourcing agent in Chennai</strong> or a trusted <strong className="text-slate-800">import export company in Chennai</strong>? 
            AFFHAN Group connects Indian businesses to a global supply chain. As your dedicated <strong className="text-slate-800">product sourcing agent</strong>, we help you source from over 10 Lakhs+ products and 100+ countries with our end-to-end procurement, supplier verification, and freight forwarding solutions.
          </p>
          <div className="flex flex-col sm:flex-row justify-center gap-4">
            <Link
              href="/contact"
              className="bg-brand hover:bg-brand-dark text-white px-8 py-4 rounded-full font-bold text-lg transition-colors shadow-lg hover:shadow-xl"
            >
              Request a Quote
            </Link>
            <Link
              href="/products"
              className="bg-white hover:bg-slate-50 text-slate-800 border-2 border-slate-200 hover:border-slate-300 px-8 py-4 rounded-full font-bold text-lg transition-colors"
            >
              Browse Catalog
            </Link>
          </div>
        </div>
      </section>

      {/* Services Section */}
      <section className="bg-white py-16 lg:py-24 border-y border-slate-200">
        <div className="max-w-[1200px] mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-16">
            <h2 className="text-2xl sm:text-3xl font-bold text-slate-900 mb-4">
              Our Sourcing Services in Chennai
            </h2>
            <p className="text-slate-600 max-w-2xl mx-auto">
              We provide comprehensive product sourcing in Chennai to streamline your import operations. Whether you need a full-service import company or a specialized sourcing agent in Chennai, we have you covered.
            </p>
          </div>

          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-8">
            <div className="bg-slate-50 p-8 rounded-2xl border border-slate-100 hover:shadow-lg transition-shadow">
              <div className="w-12 h-12 bg-brand/10 rounded-xl flex items-center justify-center mb-6">
                <Search className="w-6 h-6 text-brand" />
              </div>
              <h3 className="text-xl font-bold text-slate-900 mb-3">China Product Sourcing</h3>
              <p className="text-slate-600 leading-relaxed">
                We act as your dedicated China sourcing agent in Chennai. Find any product from our 50,000+ categories with competitive factory-direct pricing.
              </p>
            </div>

            <div className="bg-slate-50 p-8 rounded-2xl border border-slate-100 hover:shadow-lg transition-shadow">
              <div className="w-12 h-12 bg-brand/10 rounded-xl flex items-center justify-center mb-6">
                <ShieldCheck className="w-6 h-6 text-brand" />
              </div>
              <h3 className="text-xl font-bold text-slate-900 mb-3">Supplier Verification</h3>
              <p className="text-slate-600 leading-relaxed">
                Risk-free importing. Our local team conducts background checks and physical audits to ensure you work with verified manufacturers.
              </p>
            </div>

            <div className="bg-slate-50 p-8 rounded-2xl border border-slate-100 hover:shadow-lg transition-shadow">
              <div className="w-12 h-12 bg-brand/10 rounded-xl flex items-center justify-center mb-6">
                <Ship className="w-6 h-6 text-brand" />
              </div>
              <h3 className="text-xl font-bold text-slate-900 mb-3">Freight Forwarding</h3>
              <p className="text-slate-600 leading-relaxed">
                Sea and air freight logistics managed seamlessly. We handle customs clearance, NVOCC, and port handling directly to Chennai.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Why Choose Us */}
      <section className="py-16 lg:py-24 bg-slate-900 text-white">
        <div className="max-w-[1200px] mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid lg:grid-cols-2 gap-12 items-center">
            <div>
              <h2 className="text-2xl sm:text-3xl font-bold mb-6">
                Why Choose AFFHAN as Your Chennai Sourcing Partner?
              </h2>
              <p className="text-slate-300 mb-8 leading-relaxed">
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
            <div className="grid grid-cols-2 gap-4">
              <div className="bg-slate-800 p-6 rounded-2xl text-center">
                <div className="text-4xl font-black text-brand mb-2">10L+</div>
                <div className="text-sm text-slate-400 font-medium uppercase tracking-wider">Products</div>
              </div>
              <div className="bg-slate-800 p-6 rounded-2xl text-center">
                <div className="text-4xl font-black text-brand mb-2">50K+</div>
                <div className="text-sm text-slate-400 font-medium uppercase tracking-wider">Categories</div>
              </div>
              <div className="bg-slate-800 p-6 rounded-2xl text-center">
                <div className="text-4xl font-black text-brand mb-2">100+</div>
                <div className="text-sm text-slate-400 font-medium uppercase tracking-wider">Countries</div>
              </div>
              <div className="bg-slate-800 p-6 rounded-2xl text-center">
                <div className="text-4xl font-black text-brand mb-2">4.8</div>
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
            <h2 className="text-2xl sm:text-3xl font-bold text-slate-900 mb-4">
              How Our Sourcing Process Works
            </h2>
            <p className="text-slate-600">A transparent, step-by-step approach to global trade.</p>
          </div>
          
          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-8">
            <div className="relative text-center">
              <div className="w-16 h-16 bg-slate-100 rounded-full flex items-center justify-center mx-auto mb-6 border-4 border-white shadow-sm z-10 relative text-xl font-black text-slate-800">
                1
              </div>
              <h3 className="font-bold text-slate-900 mb-2">Requirement Analysis</h3>
              <p className="text-sm text-slate-600">Share your product specifications and target pricing.</p>
            </div>
            <div className="relative text-center">
              <div className="w-16 h-16 bg-slate-100 rounded-full flex items-center justify-center mx-auto mb-6 border-4 border-white shadow-sm z-10 relative text-xl font-black text-slate-800">
                2
              </div>
              <h3 className="font-bold text-slate-900 mb-2">Supplier Sourcing</h3>
              <p className="text-sm text-slate-600">We find and verify the best manufacturers in China.</p>
            </div>
            <div className="relative text-center">
              <div className="w-16 h-16 bg-slate-100 rounded-full flex items-center justify-center mx-auto mb-6 border-4 border-white shadow-sm z-10 relative text-xl font-black text-slate-800">
                3
              </div>
              <h3 className="font-bold text-slate-900 mb-2">Quality Inspection</h3>
              <p className="text-sm text-slate-600">Pre-shipment checks to ensure top quality.</p>
            </div>
            <div className="relative text-center">
              <div className="w-16 h-16 bg-brand rounded-full flex items-center justify-center mx-auto mb-6 border-4 border-white shadow-sm z-10 relative text-xl font-black text-white">
                4
              </div>
              <h3 className="font-bold text-slate-900 mb-2">Shipping & Delivery</h3>
              <p className="text-sm text-slate-600">Logistics and customs clearance handled up to Chennai.</p>
            </div>
          </div>
        </div>
      </section>

      {/* Industries */}
      <section className="py-16 lg:py-24 bg-slate-50 border-t border-slate-200">
        <div className="max-w-[1200px] mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-12">
            <h2 className="text-2xl sm:text-3xl font-bold text-slate-900 mb-4">
              Industries We Serve
            </h2>
          </div>
          <div className="flex flex-wrap justify-center gap-4">
            {["Electronics", "Automotive Parts", "Apparel & Textiles", "Machinery", "Beauty & Personal Care", "Home & Garden", "Medical Supplies", "Construction Materials"].map((ind) => (
              <Link
                key={ind}
                href="/categories"
                className="bg-white border border-slate-200 hover:border-brand px-6 py-3 rounded-full text-sm font-semibold text-slate-700 hover:text-brand transition-colors"
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
            <h2 className="text-2xl sm:text-3xl font-bold text-slate-900 mb-4">
              Frequently Asked Questions
            </h2>
          </div>
          <div className="space-y-6">
            {faqs.map((faq, i) => (
              <div key={i} className="border-b border-slate-100 pb-6">
                <h3 className="text-lg font-bold text-slate-900 mb-2">{faq.question}</h3>
                <p className="text-slate-600 leading-relaxed">{faq.answer}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Final CTA */}
      <section className="py-16 bg-brand text-white text-center">
        <div className="max-w-[1200px] mx-auto px-4 sm:px-6 lg:px-8">
          <h2 className="text-3xl font-bold mb-6">Ready to Import from China to Chennai?</h2>
          <p className="text-brand-50 mb-8 max-w-2xl mx-auto">
            Contact AFFHAN Group today to discuss your product sourcing needs. We offer free consultation and competitive quotes for all businesses in Chennai.
          </p>
          <Link
            href="/contact"
            className="inline-block bg-white text-brand px-10 py-4 rounded-full font-bold text-lg hover:bg-slate-50 transition-colors shadow-lg"
          >
            Contact Us Now
          </Link>
        </div>
      </section>
      
      <FooterSection />
    </main>
  );
}
