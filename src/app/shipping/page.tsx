import type { Metadata } from "next";
import { ShippingContent } from "@/components/ui/ShippingContent";
import { FooterSection } from "@/components/sections/FooterSection";
import { LOGO_URL, ORG_ID, SITE_URL } from "@/lib/brand";
import { SHIPPING_FAQS } from "@/lib/shippingFaqs";

export const metadata: Metadata = {
  title: "Shipping & Freight Forwarding | Affhan",
  description:
    "Sea and air freight, NVOCC, customs clearance and door-to-door delivery from Affhan. Offices in Chennai, Guangzhou, Dubai, Singapore, Malaysia and the UK.",
  alternates: { canonical: "https://affhan.com/shipping/" },
};

/**
 * Service and FAQPage, in one graph.
 *
 * This page carried nothing but the site-wide Organization node while the
 * sourcing pages next to it each declare a Service and a FAQPage — which is
 * part of why it ranked like a brochure. The FAQ entries come from the same
 * array the accordion renders, so the structured data and the visible text
 * cannot drift apart.
 *
 * No aggregateRating. The 4.8/144 figure appears in prose on the page and
 * deliberately NOT here — that is a site-wide decision under Google's
 * review-snippet policy and must not be reintroduced.
 */
const schema = {
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "Service",
      "@id": `${SITE_URL}/shipping/#service`,
      name: "Freight forwarding and international shipping",
      serviceType: "Freight forwarding",
      provider: { "@id": ORG_ID },
      url: `${SITE_URL}/shipping/`,
      image: LOGO_URL,
      description:
        "Sea and air freight, LCL and FCL, NVOCC bills of lading, customs clearance at both ends, warehousing, consolidation and door-to-door delivery.",
      areaServed: [
        { "@type": "Country", name: "India" },
        { "@type": "Country", name: "United Arab Emirates" },
        { "@type": "Country", name: "United Kingdom" },
        { "@type": "Country", name: "Singapore" },
        { "@type": "Country", name: "Malaysia" },
        { "@type": "Country", name: "China" },
        { "@type": "Country", name: "France" },
      ],
      hasOfferCatalog: {
        "@type": "OfferCatalog",
        name: "Freight services",
        itemListElement: [
          "Sea freight (FCL and LCL)",
          "Air freight",
          "NVOCC",
          "Customs clearance",
          "Door-to-door delivery",
          "Warehousing and consolidation",
        ].map((name) => ({
          "@type": "Offer",
          itemOffered: { "@type": "Service", name },
        })),
      },
    },
    {
      "@type": "FAQPage",
      "@id": `${SITE_URL}/shipping/#faq`,
      mainEntity: SHIPPING_FAQS.map((faq) => ({
        "@type": "Question",
        name: faq.question,
        acceptedAnswer: { "@type": "Answer", text: faq.answer },
      })),
    },
  ],
};

export default function ShippingPage() {
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(schema) }}
      />
      <ShippingContent />
      <FooterSection />
    </>
  );
}
