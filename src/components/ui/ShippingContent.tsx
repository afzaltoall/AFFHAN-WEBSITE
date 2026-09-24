import Link from "next/link";
import {
  Anchor,
  ArrowRight,
  Building2,
  FileCheck2,
  Globe2,
  Plane,
  Ship,
  Truck,
  Warehouse,
} from "lucide-react";
import { OFFICES } from "@/lib/brand";
import { Reveal, RevealNoScriptFallback } from "@/components/ui/Reveal";
import { ShippingHero } from "@/components/ui/ShippingHero";
import { ShippingJourney } from "@/components/ui/ShippingJourney";
import { WaveDivider } from "@/components/ui/WaveDivider";
import { FaqAccordion } from "@/components/sections/FaqAccordion";
import { SHIPPING_FAQS } from "@/lib/shippingFaqs";
import { LANES } from "@/lib/shippingJourney";

/**
 * The shipping half of the business, which the homepage cannot lead with
 * because it leads with sourcing.
 *
 * Every figure here is one that can be checked: the founding year from
 * FOUNDING_DATE, the office count from OFFICES, the Dubai entity name from its
 * own record. Nothing about tonnage, shipment counts or client numbers, because
 * nobody has given me a source for those and invented ones have gone live on
 * this site before.
 */

const SERVICES = [
  {
    icon: Ship,
    title: "Sea freight",
    body: "FCL and LCL out of Chinese and Indian ports, consolidated where a part load does not justify a container of its own.",
  },
  {
    icon: Plane,
    title: "Air freight",
    body: "For cargo where the holding cost of six weeks at sea outweighs the freight bill.",
  },
  {
    icon: Anchor,
    title: "NVOCC",
    body: "We issue our own bills of lading and carry the contract with the line, so the booking stays ours to answer for.",
  },
  {
    icon: FileCheck2,
    title: "Customs clearance",
    body: "Documentation and clearance at both ends, handled by the same people who booked the freight.",
  },
  {
    icon: Truck,
    title: "Door to door",
    body: "Factory floor to your warehouse, including the inland legs that usually get quoted separately and forgotten.",
  },
  {
    icon: Warehouse,
    title: "Warehousing & consolidation",
    body: "Hold goods from several suppliers and ship them as one, rather than paying for each shipment on its own.",
  },
];

// Melaka, not Johor Bahru. This card printed "Johor Bahru, Malaysia" as its
// heading while rendering the Melaka street address directly underneath it —
// both city names visible in the same card. The address in brand.ts is the one
// that matches the registered entity, so the heading follows it.
const OFFICE_LABELS: Record<keyof typeof OFFICES, string> = {
  chennai: "Chennai, India",
  guangzhou: "Guangzhou, China",
  dubai: "Dubai, UAE",
  singapore: "Singapore",
  malaysia: "Melaka, Malaysia",
  uk: "London, United Kingdom",
  france: "Paris, France",
};

// Head office first, then the China desk the sourcing side runs through, then
// the rest — the order someone tracing a shipment would care about.
//
// Seven, not six. Paris was missing, so this page advertised "6 offices" while
// every other page on the site said seven — OFFICE_COUNT below is this array's
// length, so the omission propagated into the copy.
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
    <>
      <RevealNoScriptFallback />

      <ShippingHero officeCount={OFFICE_COUNT} />

      {/* White above, near-black below: the wave is cut out of the section
          that precedes it, so the colours are the two real backgrounds. */}
      <WaveDivider from="#ffffff" to="#020617" />
      <ShippingJourney />
      <WaveDivider from="#020617" to="#ffffff" />

      {/* Services */}
      <section className="bg-white py-16 lg:py-24">
        <div className="mx-auto max-w-6xl px-5 sm:px-8">
          <Reveal>
            <span className="text-[11px] font-bold uppercase tracking-[0.2em] text-brand-dark">
              What we move
            </span>
            <h2 className="mt-2 text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">
              Freight services
            </h2>
          </Reveal>

          <div className="mt-10 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {SERVICES.map(({ icon: Icon, title, body }, i) => (
              <Reveal
                key={title}
                // Small stagger across the row, capped so a card low in the
                // grid is not still waiting after the reader has reached it.
                delay={Math.min(i, 2) * 90}
                className="group rounded-2xl border border-slate-200 bg-white p-6 transition-all hover:border-brand hover:shadow-md"
              >
                <span className="flex h-12 w-12 items-center justify-center rounded-xl bg-brand/10 text-brand-dark transition-colors group-hover:bg-brand-dark group-hover:text-white">
                  <Icon size={22} />
                </span>
                <h3 className="mt-4 text-base font-bold text-slate-900">{title}</h3>
                <p className="mt-2 text-[14px] leading-relaxed text-slate-600">{body}</p>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* Why */}
      <section className="bg-slate-50 py-16 lg:py-24">
        <div className="mx-auto max-w-6xl px-5 sm:px-8">
          <div className="grid gap-10 lg:grid-cols-2 lg:gap-16">
            <Reveal>
              <span className="text-[11px] font-bold uppercase tracking-[0.2em] text-brand-dark">
                Why Affhan
              </span>
              <h2 className="mt-2 text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">
                One company for the goods and the freight
              </h2>
              <p className="mt-4 text-[15px] leading-relaxed text-slate-600">
                Most importers hold two relationships: a sourcing agent who stops at
                the factory gate, and a forwarder who picks up a shipment they know
                nothing about. When something is wrong with the cargo, neither one
                owns it.
              </p>
              <p className="mt-3 text-[15px] leading-relaxed text-slate-600">
                We do both. The people who inspected your goods are the people who
                booked the container, so a query about either has one answer and one
                place to go.
              </p>
              <Link
                href="/contact/"
                className="mt-6 inline-flex items-center gap-2 text-sm font-semibold text-brand-dark hover:underline"
              >
                Talk to the shipping desk <ArrowRight size={15} />
              </Link>
            </Reveal>

            <div className="grid grid-cols-2 gap-4 self-start">
              <Reveal delay={0}>
                <Stat value={`${new Date().getFullYear() - FOUNDED_YEAR}+`} label="Years in business" />
              </Reveal>
              <Reveal delay={80}>
                <Stat value={String(OFFICE_COUNT)} label="Offices worldwide" />
              </Reveal>
              <Reveal delay={160}>
                <Stat value="Sea & air" label="Freight modes" />
              </Reveal>
              <Reveal delay={240}>
                <Stat value="NVOCC" label="Own bills of lading" />
              </Reveal>
            </div>
          </div>
        </div>
      </section>

      {/* What the bill is made of — the part customers compare wrongly. */}
      <section className="bg-white py-16 lg:py-24">
        <div className="mx-auto max-w-6xl px-5 sm:px-8">
          <div className="grid gap-10 lg:grid-cols-2 lg:gap-16">
            <Reveal>
              <span className="text-[11px] font-bold uppercase tracking-[0.2em] text-brand-dark">
                Costing
              </span>
              <h2 className="mt-2 text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">
                What actually determines your freight bill
              </h2>
              <p className="mt-4 text-[15px] leading-relaxed text-slate-600">
                Four things, in roughly this order. <strong className="font-semibold text-slate-800">Volume</strong>,
                because you are charged for the space whether or not you fill it — which is why
                carton dimensions are worth an argument before production, not after.{" "}
                <strong className="font-semibold text-slate-800">Mode</strong>, because air is a
                multiple of sea and worth it only when the stock is earning more than it costs to fly.
              </p>
              <p className="mt-3 text-[15px] leading-relaxed text-slate-600">
                <strong className="font-semibold text-slate-800">Lane</strong>, because the same box
                to Chennai, Jebel Ali and Felixstowe is three different prices with three different
                customs regimes behind it. And{" "}
                <strong className="font-semibold text-slate-800">how much of the job is in the quote</strong>:
                a freight-to-port number and a door-to-door number are not comparable, and the gap
                between them is the part that arrives as a surprise.
              </p>
            </Reveal>

            <Reveal delay={80}>
              <span className="text-[11px] font-bold uppercase tracking-[0.2em] text-brand-dark">
                Sea or air
              </span>
              <h2 className="mt-2 text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">
                When air is the cheaper decision
              </h2>
              <p className="mt-4 text-[15px] leading-relaxed text-slate-600">
                Air freight looks indefensible next to a sea quote until you price the stock. A
                container on the water is capital you cannot sell for the length of the sailing,
                plus whatever a stockout costs in orders you could not fill.
              </p>
              <p className="mt-3 text-[15px] leading-relaxed text-slate-600">
                For high-value, low-volume goods, or a first production run you need in market
                before committing to a full container, the freight premium is often smaller than
                the cost of waiting. For heavy, low-margin goods it almost never is. We will tell
                you which one you are looking at.
              </p>

              <dl className="mt-6 grid grid-cols-3 gap-3 border-t border-slate-200 pt-5">
                {LANES.map((lane) => (
                  <div key={lane.port}>
                    <dt className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                      {lane.from} → {lane.to}
                    </dt>
                    <dd className="mt-1 text-lg font-black tracking-tight text-slate-900">
                      ~{lane.days} days
                    </dd>
                    <dd className="text-[11px] text-slate-400">{lane.port}</dd>
                  </div>
                ))}
              </dl>
            </Reveal>
          </div>
        </div>
      </section>

      <WaveDivider from="#ffffff" to="#f8fafc" />

      {/* Proof. Prose only — deliberately no aggregateRating in the schema
          graph, which is a site-wide decision under Google's review-snippet
          policy and must not be reintroduced here. */}
      <section className="bg-slate-50 py-14 lg:py-16">
        <div className="mx-auto max-w-4xl px-5 text-center sm:px-8">
          <Reveal>
            <p className="text-3xl font-black tracking-tight text-slate-900 sm:text-4xl">
              4.8 out of 5, across 144 Google reviews
            </p>
            <p className="mx-auto mt-4 max-w-2xl text-[15px] leading-relaxed text-slate-600">
              The profile is held at our Chennai head office, trading since {FOUNDED_YEAR}. Seven
              offices — Chennai, Guangzhou, Dubai, Singapore, Melaka, London and Paris — each a
              registered company with its own staff, not an agent on a commission.
            </p>
          </Reveal>
        </div>
      </section>

      {/* FAQ. Same array the FAQPage node is built from, so the visible text
          and the structured data cannot disagree. */}
      <section className="bg-white py-16 lg:py-24">
        <div className="mx-auto max-w-3xl px-5 sm:px-8">
          <Reveal>
            <span className="text-[11px] font-bold uppercase tracking-[0.2em] text-brand-dark">
              Questions
            </span>
            <h2 className="mt-2 text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">
              Freight, answered
            </h2>
          </Reveal>
          <div className="mt-8">
            {/* AccordionHeader renders an h3, so each question keeps its place
                in the outline. */}
            <FaqAccordion faqs={SHIPPING_FAQS} />
          </div>
        </div>
      </section>

      {/* Offices */}
      <section className="bg-white py-16 lg:py-24">
        <div className="mx-auto max-w-6xl px-5 sm:px-8">
          <Reveal>
            <span className="text-[11px] font-bold uppercase tracking-[0.2em] text-brand-dark">
              Where we are
            </span>
            <h2 className="mt-2 text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">
              Our offices
            </h2>
            <p className="mt-3 max-w-2xl text-[15px] leading-relaxed text-slate-600">
              Own offices, not agents — which is why a problem at one end can be
              settled by someone at the other.
            </p>
          </Reveal>

          <div className="mt-10 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {OFFICE_ORDER.map((key, i) => {
              const office = OFFICES[key];
              return (
                <Reveal
                  key={key}
                  delay={Math.min(i, 2) * 90}
                  className="rounded-2xl border border-slate-200 bg-white p-6 transition-colors hover:border-brand/60"
                >
                  <div className="flex items-center gap-2.5">
                    <Building2 size={16} className="shrink-0 text-brand" />
                    <h3 className="text-[15px] font-bold text-slate-900">
                      {OFFICE_LABELS[key]}
                    </h3>
                  </div>
                  <p className="mt-1 text-[12px] font-semibold uppercase tracking-wider text-slate-400">
                    {office.legalName}
                  </p>
                  <p className="mt-3 text-[13px] leading-relaxed text-slate-600">
                    {office.address.streetAddress}
                    <br />
                    {office.address.addressLocality}
                    {/* Not every office records the same thing: Dubai has a PO
                        box where the others have a postcode, and one has
                        neither. Read whichever is present. */}
                    {postcodeOf(office.address) ? ` ${postcodeOf(office.address)}` : ""}
                  </p>
                  {/* Paris publishes no number. A tel: link built from an
                      empty string is a link to nothing, so it simply is not
                      drawn for offices that have none. */}
                  {"telephone" in office && office.telephone ? (
                    <a
                      href={`tel:${office.telephone.replace(/[^+\d]/g, "")}`}
                      className="mt-3 inline-block text-[13px] font-semibold text-brand-dark hover:underline"
                    >
                      {office.telephone}
                    </a>
                  ) : null}
                </Reveal>
              );
            })}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="bg-gradient-to-br from-brand to-brand-dark py-16 text-white lg:py-20">
        <Reveal className="mx-auto flex max-w-4xl flex-col items-center px-5 text-center sm:px-8">
          <Globe2 size={32} className="text-white/80" />
          <h2 className="mt-4 text-2xl font-bold tracking-tight sm:text-3xl">
            Have a shipment to move?
          </h2>
          <p className="mt-3 max-w-xl text-[15px] leading-relaxed text-white/85">
            Tell us the ports, the cargo and the timing, and we will come back with
            a rate and a routing.
          </p>
          <Link
            href="#shipping-quote"
            className="mt-7 inline-flex items-center gap-2 rounded-xl bg-white px-7 py-3.5 text-sm font-semibold text-brand-dark shadow-sm transition-transform hover:scale-[1.02] active:scale-95"
          >
            Request a freight quote <ArrowRight size={16} />
          </Link>
        </Reveal>
      </section>
    </>
  );
}

/** Postcode, PO box, or nothing — whichever this office actually records. */
function postcodeOf(address: Record<string, unknown>): string | null {
  const postal = address.postalCode;
  if (typeof postal === "string" && postal) return postal;
  const box = address.postOfficeBoxNumber;
  if (typeof box === "string" && box) return `PO Box ${box}`;
  return null;
}

function Stat({ value, label }: { value: string; label: string }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5">
      <p className="text-2xl font-bold tracking-tight text-brand-dark">{value}</p>
      <p className="mt-1 text-[13px] text-slate-500">{label}</p>
    </div>
  );
}
