"use client";

import Link from "next/link";
import { ArrowRight, Globe2 } from "lucide-react";
import { OFFICES } from "@/lib/brand";
import { Reveal, RevealNoScriptFallback } from "@/components/ui/Reveal";
import { ShippingHero } from "@/components/ui/ShippingHero";
import { ShippingJourney } from "@/components/ui/ShippingJourney";
import { FaqAccordion } from "@/components/sections/FaqAccordion";
import { SHIPPING_FAQS } from "@/lib/shippingFaqs";
import { SpatialFreightShowcase } from "@/components/ui/spatial-freight-showcase";
const SERVICES = [
  {
    title: "Sea freight",
    body: "FCL and LCL out of Chinese and Indian ports, consolidated where a part load does not justify a container of its own.",
  },
  {
    title: "Air freight",
    body: "For cargo where the holding cost of six weeks at sea outweighs the freight bill.",
  },
  {
    title: "NVOCC",
    body: "We issue our own bills of lading and carry the contract with the line, so the booking stays ours to answer for.",
  },
  {
    title: "Customs clearance",
    body: "Documentation and clearance at both ends, handled by the same people who booked the freight.",
  },
  {
    title: "Door to door",
    body: "Factory floor to your warehouse, including the inland legs that usually get quoted separately and forgotten.",
  },
  {
    title: "Warehousing & consolidation",
    body: "Hold goods from several suppliers and ship them as one, rather than paying for each shipment on its own.",
  },
];

const OFFICE_LABELS: Record<keyof typeof OFFICES, string> = {
  chennai: "Chennai, India",
  guangzhou: "Guangzhou, China",
  dubai: "Dubai, UAE",
  singapore: "Singapore",
  malaysia: "Melaka, Malaysia",
  uk: "London, UK",
  france: "Paris, France",
};

const OFFICE_ORDER: Array<keyof typeof OFFICES> = [
  "chennai",
  "guangzhou",
  "dubai",
  "singapore",
  "malaysia",
  "uk",
  "france",
];

const FOUNDED_YEAR = 2000;
const OFFICE_COUNT = OFFICE_ORDER.length;

export function ShippingContent() {
  return (
    <div className="bg-[#FAFAF7] text-[#08222e]">
      <RevealNoScriptFallback />

      <ShippingHero officeCount={OFFICE_COUNT} />

      {/* Remove the wave divider, keep it clean */}
      <div className="h-px w-full bg-[#08222e]/10"></div>

      <ShippingJourney />

      <div className="h-px w-full bg-[#08222e]/10"></div>

      {/* Services (What we move) */}
      <section className="py-24 lg:py-32">
        <div className="mx-auto max-w-[1500px] px-6 md:px-12 lg:px-16">
          <Reveal>
            <span className="text-[11px] font-bold uppercase tracking-[0.25em] text-[#176579]">
              What we move
            </span>
            <h2 className="mt-4 text-[9vw] font-medium leading-[0.9] tracking-[-0.04em] sm:text-[7vw] lg:text-[5vw]">
              Freight services
            </h2>
          </Reveal>

          <div className="mt-16 border-t border-[#08222e]/20">
            {SERVICES.map(({ title, body }) => (
              <div
                key={title}
                className="group flex flex-col sm:flex-row sm:items-baseline justify-between gap-4 sm:gap-10 border-b border-[#08222e]/10 py-8 lg:py-12 transition-colors hover:bg-[#08222e]/[0.02]"
              >
                <h3 className="text-2xl font-bold tracking-tight sm:w-1/3 lg:text-3xl">
                  {title}
                </h3>
                <p className="text-[17px] leading-relaxed text-[#5a6e77] sm:w-2/3 max-w-3xl">
                  {body}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Why Affhan */}
      <section className="bg-white py-24 lg:py-32">
        <div className="mx-auto max-w-[1500px] px-6 md:px-12 lg:px-16">
          <div className="grid gap-16 lg:grid-cols-2 lg:gap-24">
            <div>
              <Reveal>
                <span className="text-[11px] font-bold uppercase tracking-[0.25em] text-[#176579]">
                  Why Affhan
                </span>
                <h2 className="mt-4 text-4xl font-medium tracking-tight sm:text-5xl lg:text-[4vw] leading-[1.1] tracking-[-0.02em]">
                  One company for the goods and the freight
                </h2>
                <p className="mt-8 text-[18px] leading-relaxed text-[#5a6e77]">
                  Most importers hold two relationships: a sourcing agent who stops at
                  the factory gate, and a forwarder who picks up a shipment they know
                  nothing about. When something is wrong with the cargo, neither one
                  owns it.
                </p>
                <p className="mt-4 text-[18px] leading-relaxed text-[#5a6e77]">
                  We do both. The people who inspected your goods are the people who
                  booked the container, so a query about either has one answer and one
                  place to go.
                </p>
                <Link
                  href="/contact/"
                  className="mt-8 inline-flex items-center gap-2 text-sm font-bold uppercase tracking-widest text-[#08222e] hover:text-[#176579] transition-colors"
                >
                  Talk to the shipping desk <ArrowRight size={15} />
                </Link>
              </Reveal>
            </div>

            <div className="flex flex-col justify-center">
              <div className="grid grid-cols-2 gap-x-8 gap-y-12">
                <Stat value={`${new Date().getFullYear() - FOUNDED_YEAR}`} suffix="+" label="Years in business" />
                <Stat value={String(OFFICE_COUNT)} label="Offices worldwide" />
                <Stat textValue="Sea & air" label="Freight modes" />
                <Stat textValue="NVOCC" label="Own bills of lading" />
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Costing */}
      <section className="bg-[#FAFAF7] py-24 lg:py-32">
        <div className="mx-auto max-w-[1500px] px-6 md:px-12 lg:px-16">
          <div className="grid gap-16 lg:grid-cols-2 lg:gap-24">
            <Reveal>
              <span className="text-[11px] font-bold uppercase tracking-[0.25em] text-[#176579]">
                Costing
              </span>
              <h2 className="mt-4 text-4xl font-medium tracking-tight sm:text-5xl lg:text-[3.5vw] leading-[1.1] tracking-[-0.02em]">
                What actually determines your freight bill
              </h2>
              <div className="mt-8 text-[18px] leading-relaxed text-[#5a6e77] space-y-4">
                <p>
                  Four things, in roughly this order. <strong className="font-semibold text-[#08222e]">Volume</strong>,
                  because you are charged for the space whether or not you fill it — which is why
                  carton dimensions are worth an argument before production, not after.{" "}
                  <strong className="font-semibold text-[#08222e]">Mode</strong>, because air is a
                  multiple of sea and worth it only when the stock is earning more than it costs to fly.
                </p>
                <p>
                  <strong className="font-semibold text-[#08222e]">Lane</strong>, because the same box
                  to Chennai, Jebel Ali and Felixstowe is three different prices with three different
                  customs regimes behind it. And{" "}
                  <strong className="font-semibold text-[#08222e]">how much of the job is in the quote</strong>:
                  a freight-to-port number and a door-to-door number are not comparable, and the gap
                  between them is the part that arrives as a surprise.
                </p>
              </div>
            </Reveal>

            <Reveal delay={80}>
              <span className="text-[11px] font-bold uppercase tracking-[0.25em] text-[#176579]">
                Sea or air
              </span>
              <h2 className="mt-4 text-4xl font-medium tracking-tight sm:text-5xl lg:text-[3.5vw] leading-[1.1] tracking-[-0.02em]">
                When air is the cheaper decision
              </h2>
              <div className="mt-8 text-[18px] leading-relaxed text-[#5a6e77] space-y-4">
                <p>
                  Air freight looks indefensible next to a sea quote until you price the stock. A
                  container on the water is capital you cannot sell for the length of the sailing,
                  plus whatever a stockout costs in orders you could not fill.
                </p>
                <p>
                  For high-value, low-volume goods, or a first production run you need in market
                  before committing to a full container, the freight premium is often smaller than
                  the cost of waiting. For heavy, low-margin goods it almost never is. We will tell
                  you which one you are looking at.
                </p>
              </div>
            </Reveal>
          </div>
          
          <Reveal delay={120}>
            <SpatialFreightShowcase />
          </Reveal>
        </div>
      </section>

      {/* Proof */}
      <section className="bg-white py-24 lg:py-32">
        <div className="mx-auto max-w-[1500px] px-6 text-center md:px-12 lg:px-16">
          <Reveal>
            <p className="text-[8vw] font-medium tracking-[-0.04em] sm:text-[6vw] lg:text-[4vw]">
              4.8 out of 5, across 144 Google reviews
            </p>
            <p className="mx-auto mt-6 max-w-3xl text-[18px] leading-relaxed text-[#5a6e77]">
              The profile is held at our Chennai head office, trading since {FOUNDED_YEAR}. Seven
              offices — Chennai, Guangzhou, Dubai, Singapore, Melaka, London and Paris — each a
              registered company with its own staff, not an agent on a commission.
            </p>
          </Reveal>
        </div>
      </section>

      {/* FAQ */}
      <section className="bg-[#FAFAF7] py-24 lg:py-32">
        <div className="mx-auto max-w-[1000px] px-6 md:px-12 lg:px-16">
          <Reveal>
            <span className="text-[11px] font-bold uppercase tracking-[0.25em] text-[#176579]">
              Questions
            </span>
            <h2 className="mt-4 text-4xl font-medium tracking-tight sm:text-5xl lg:text-[4vw] leading-[1.1] tracking-[-0.02em]">
              Freight, answered
            </h2>
          </Reveal>
          <div className="mt-12 border-t border-[#08222e]/20">
            {/* FaqAccordion typically expects its own container, but we pass the data to it */}
            <FaqAccordion faqs={SHIPPING_FAQS} />
          </div>
        </div>
      </section>

      {/* Offices - Scattered Typographic Wall */}
      <section className="bg-white py-24 lg:py-40">
        <div className="mx-auto max-w-[1500px] px-6 md:px-12 lg:px-16">
          <Reveal>
            <span className="text-[11px] font-bold uppercase tracking-[0.25em] text-[#176579]">
              Where we are
            </span>
            <h2 className="mt-4 text-[9vw] font-medium leading-[0.9] tracking-[-0.04em] sm:text-[7vw] lg:text-[5vw]">
              Our offices
            </h2>
            <p className="mt-6 max-w-2xl text-[18px] leading-relaxed text-[#5a6e77]">
              Own offices, not agents — which is why a problem at one end can be
              settled by someone at the other.
            </p>
          </Reveal>

          <div className="mt-20 lg:mt-32">
            <div className="grid gap-x-8 gap-y-16 sm:grid-cols-2 lg:grid-cols-3">
              {OFFICE_ORDER.map((key, index) => {
                const office = OFFICES[key];
                return (
                  <Reveal key={key} delay={(index % 3) * 100}>
                    <div className="flex flex-col border-l-2 border-[#08222e]/10 pl-6 hover:border-[#176579] transition-colors duration-500">
                      <h3 className="text-3xl font-bold tracking-tight text-[#08222e] sm:text-4xl">
                        {OFFICE_LABELS[key]}
                      </h3>
                      <p className="mt-4 text-[11px] font-bold uppercase tracking-[0.2em] text-[#176579]">
                        {office.legalName}
                      </p>
                      <p className="mt-3 text-[16px] leading-relaxed text-[#5a6e77]">
                        {office.address.streetAddress}
                        <br />
                        {office.address.addressLocality}
                        {postcodeOf(office.address) ? ` ${postcodeOf(office.address)}` : ""}
                      </p>
                      {"telephone" in office && office.telephone ? (
                        <a
                          href={`tel:${office.telephone.replace(/[^+\d]/g, "")}`}
                          className="mt-6 inline-block text-[15px] font-bold tracking-widest text-[#08222e] hover:text-[#176579] transition-colors"
                        >
                          {office.telephone}
                        </a>
                      ) : null}
                    </div>
                  </Reveal>
                );
              })}
            </div>
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="bg-[#08222e] py-32 text-[#FAFAF7]">
        <Reveal className="mx-auto flex max-w-4xl flex-col items-center px-6 text-center md:px-12 lg:px-16">
          <Globe2 size={48} className="text-[#176579]" />
          <h2 className="mt-8 text-[8vw] font-medium leading-[0.9] tracking-[-0.04em] sm:text-[6vw] lg:text-[4vw]">
            Have a shipment to move?
          </h2>
          <p className="mt-6 max-w-2xl text-[18px] leading-relaxed text-[#FAFAF7]/70">
            Tell us the ports, the cargo and the timing, and we will come back with
            a rate and a routing.
          </p>
          {/* The freight quote form follows this band directly (see page.tsx). */}
          <Link
            href="#shipping-quote"
            className="group mt-12 inline-flex items-center gap-2 rounded-full bg-[#FAFAF7] px-8 py-4 text-[15px] font-bold text-[#08222e] transition-all hover:bg-white hover:scale-105"
          >
            Request a freight quote <ArrowRight size={18} className="transition-transform group-hover:translate-x-1" />
          </Link>
        </Reveal>
      </section>
    </div>
  );
}

function postcodeOf(address: Record<string, unknown>): string | null {
  const postal = address.postalCode;
  if (typeof postal === "string" && postal) return postal;
  const box = address.postOfficeBoxNumber;
  if (typeof box === "string" && box) return `PO Box ${box}`;
  return null;
}

function Stat({ value, textValue, suffix, label }: { value?: string; textValue?: string; suffix?: string; label: string }) {
  return (
    <div className="flex flex-col border-t border-[#08222e]/10 pt-6">
      <p className="text-4xl font-medium tracking-[-0.04em] text-[#08222e] lg:text-5xl">
        {value ? (
          <span>{value}{suffix || ""}</span>
        ) : (
          <span>{textValue}</span>
        )}
      </p>
      <p className="mt-2 text-[15px] font-medium text-[#5a6e77]">{label}</p>
    </div>
  );
}
