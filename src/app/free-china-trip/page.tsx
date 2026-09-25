import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { ArrowRight, BedDouble, Car, Handshake, Mail, Phone, Plane, Users } from "lucide-react";
import { FooterSection } from "@/components/sections/FooterSection";
import { ChinaTripApplyForm } from "@/components/ui/ChinaTripApplyForm";
import { Reveal, RevealNoScriptFallback } from "@/components/ui/Reveal";

/**
 * The free China business trip, which the China trip banner on the homepage
 * advertises and leads to.
 *
 * Everything the page says about the trip is what the banner says: a
 * round-trip flight, the hotel stay, local transport during the trip,
 * business visits and meetings, and guided support from the team. Nothing
 * is added to it, no dates, eligibility, limits or cities, because none has
 * been stated; the team settles those with each applicant, which is what the
 * form is for. The facts about Affhan (founded 2000, a buying office in
 * Guangzhou, seven offices) come from lib/brand.ts and the pages beside this
 * one.
 *
 * Applications go to the team through /api/contact; see ChinaTripApplyForm.
 */

const TITLE = "Free China Business Trip | Affhan";
const DESCRIPTION =
  "Visit China for business with Affhan: round-trip flight, hotel stay, local transport, business visits and meetings, and our team's guided support. Apply online.";
const PAGE_URL = "https://affhan.com/free-china-trip/";

export const metadata: Metadata = {
  title: TITLE,
  description: DESCRIPTION,
  alternates: { canonical: PAGE_URL },
  openGraph: {
    title: TITLE,
    description: DESCRIPTION,
    url: PAGE_URL,
    type: "website",
    siteName: "Affhan",
    images: [{ url: "/china-trip-og.jpg", width: 1200, height: 450, alt: "Affhan's free China business trip" }],
  },
  twitter: { card: "summary_large_image", title: TITLE, description: DESCRIPTION, images: ["/china-trip-og.jpg"] },
};

// The banner's five items, in its order and its words.
const INCLUDED = [
  { Icon: Plane, title: "Flight", detail: "Round trip, there and back." },
  { Icon: BedDouble, title: "Accommodation", detail: "Your hotel stay." },
  { Icon: Car, title: "Local transport", detail: "Getting around during the trip." },
  { Icon: Handshake, title: "Business visits & meetings", detail: "Visits and meetings for your business." },
  { Icon: Users, title: "Guided support", detail: "Our team with you." },
] as const;

// A real sequence, so it is numbered.
const STEPS = [
  { title: "Apply", body: "Tell us about your business and what you want to source." },
  { title: "We call you", body: "Our team contacts you as soon as possible to talk it through." },
  { title: "Plan and travel", body: "We plan the trip with you, and our team guides you in China." },
] as const;

// From lib/brand.ts: founded 1 July 2000; OFFICES, in the order /shipping/ lists them.
const FACTS = [
  { figure: "Since 2000", body: "Sourcing for businesses since 1 July 2000." },
  { figure: "Guangzhou", body: "Our own buying office in China." },
  { figure: "7 offices", body: "Chennai, Guangzhou, Dubai, Singapore, Malaysia, the UK and France." },
] as const;

const EYEBROW = "text-[11px] font-bold uppercase tracking-[0.25em] text-[#176579]";
const SHELL = "mx-auto max-w-[1500px] px-6 md:px-12 lg:px-16";

export default function FreeChinaTripPage() {
  return (
    <>
      <div className="bg-[#FAFAF7] text-[#08222e]">
        <RevealNoScriptFallback />

        {/* ---- The offer ---------------------------------------------- */}
        <section className="pb-16 pt-28 lg:pb-24 lg:pt-36">
          <div className={`${SHELL} grid items-center gap-12 lg:grid-cols-12 lg:gap-16`}>
            <div className="lg:col-span-5">
              <span className={EYEBROW}>Free business trip</span>
              <h1 className="mt-5 text-balance text-[13vw] font-medium leading-[0.92] tracking-[-0.04em] sm:text-[9vw] lg:text-[4.6vw]">
                Free China <span className="text-[#176579]">business trip</span>
              </h1>
              <p className="mt-8 max-w-xl text-[18px] leading-relaxed text-[#5a6e77]">
                Business visits and meetings in China, with your round-trip flight, hotel stay and local transport
                covered, and our team guiding you throughout.
              </p>
              <div className="mt-10 flex flex-wrap items-center gap-4">
                <a
                  href="#apply"
                  className="group inline-flex items-center gap-3 rounded-full bg-[#08222e] py-3 pl-7 pr-3 text-[16px] font-medium text-[#FAFAF7] transition-colors hover:bg-[#176579] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#176579]/50 focus-visible:ring-offset-2 focus-visible:ring-offset-[#FAFAF7]"
                >
                  Apply for the trip
                  <span className="flex h-9 w-9 items-center justify-center rounded-full bg-[#FAFAF7]/15">
                    <ArrowRight size={17} aria-hidden className="transition-transform group-hover:translate-x-0.5" />
                  </span>
                </a>
                <a
                  href="tel:+919092009044"
                  className="inline-flex items-center gap-2 rounded-full border border-[#08222e]/20 px-6 py-3.5 text-[15px] font-medium transition-colors hover:border-[#08222e] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#176579]/50"
                >
                  <Phone size={16} aria-hidden /> +91 90920 09044
                </a>
              </div>
            </div>
            <div className="lg:col-span-7">
              <Image
                src="/china-trip-page.webp"
                alt="China business trip: flight (round trip), accommodation (hotel stay), local transport (during trip), business visits and meetings, guided support (our team)"
                width={1440}
                height={540}
                sizes="(min-width: 1024px) 55vw, 100vw"
                priority
                className="h-auto w-full rounded-3xl shadow-xl ring-1 ring-[#08222e]/10"
              />
            </div>
          </div>
        </section>

        <div className="h-px w-full bg-[#08222e]/10" />

        {/* ---- What's included ---------------------------------------- */}
        <section className="py-24 lg:py-32">
          <div className={SHELL}>
            <Reveal>
              <span className={EYEBROW}>What&apos;s included</span>
              <h2 className="mt-4 text-balance text-[10vw] font-medium leading-[0.95] tracking-[-0.04em] sm:text-[6vw] lg:text-[3.6vw]">
                The trip, covered.
              </h2>
            </Reveal>
            <ul className="mt-14 grid gap-x-8 gap-y-12 sm:grid-cols-2 lg:mt-20 lg:grid-cols-5">
              {INCLUDED.map(({ Icon, title, detail }, i) => (
                <Reveal as="li" key={title} delay={i * 60} className="border-t border-[#08222e]/15 pt-6">
                  <span className="flex h-12 w-12 items-center justify-center rounded-full bg-[#176579]/10 text-[#176579]">
                    <Icon size={22} aria-hidden />
                  </span>
                  <h3 className="mt-6 text-[21px] font-medium leading-snug tracking-[-0.01em]">{title}</h3>
                  <p className="mt-2 text-[15px] leading-relaxed text-[#5a6e77]">{detail}</p>
                </Reveal>
              ))}
            </ul>
          </div>
        </section>

        {/* ---- Who you travel with ------------------------------------ */}
        <section className="bg-white py-24 lg:py-32">
          <div className={`${SHELL} grid gap-14 lg:grid-cols-12 lg:gap-16`}>
            <Reveal className="lg:col-span-5">
              <span className={EYEBROW}>Who you travel with</span>
              <h2 className="mt-4 text-balance text-[9vw] font-medium leading-[0.98] tracking-[-0.035em] sm:text-[5.5vw] lg:text-[3vw]">
                A sourcing company with its own office in China.
              </h2>
              <Link
                href="/china-sourcing-office-guangzhou/"
                className="mt-8 inline-flex items-center gap-2 text-[15px] font-medium text-[#176579] underline decoration-[#176579]/35 underline-offset-4 transition-colors hover:decoration-[#176579]"
              >
                About our Guangzhou office <ArrowRight size={15} aria-hidden />
              </Link>
            </Reveal>
            <dl className="grid gap-10 sm:grid-cols-3 lg:col-span-7 lg:gap-8">
              {FACTS.map(({ figure, body }, i) => (
                <Reveal key={figure} delay={i * 80} className="border-t-2 border-[#08222e] pt-6">
                  <dt className="text-[30px] font-medium leading-none tracking-[-0.03em] lg:text-[34px]">{figure}</dt>
                  <dd className="mt-4 text-[15px] leading-relaxed text-[#5a6e77]">{body}</dd>
                </Reveal>
              ))}
            </dl>
          </div>
        </section>

        {/* ---- How it works ------------------------------------------- */}
        <section className="py-24 lg:py-32">
          <div className={SHELL}>
            <Reveal>
              <span className={EYEBROW}>How it works</span>
              <h2 className="mt-4 text-balance text-[10vw] font-medium leading-[0.95] tracking-[-0.04em] sm:text-[6vw] lg:text-[3.6vw]">
                From application to China.
              </h2>
            </Reveal>
            <ol className="mt-14 grid gap-12 md:grid-cols-3 lg:mt-20 lg:gap-10">
              {STEPS.map(({ title, body }, i) => (
                <Reveal as="li" key={title} delay={i * 80} className="border-t border-[#08222e]/15 pt-6">
                  <span aria-hidden className="text-5xl font-medium leading-none tracking-tight text-[#08222e]/15 tabular-nums">
                    {String(i + 1).padStart(2, "0")}
                  </span>
                  <h3 className="mt-6 text-[22px] font-medium tracking-[-0.01em]">{title}</h3>
                  <p className="mt-2 max-w-sm text-[15px] leading-relaxed text-[#5a6e77]">{body}</p>
                </Reveal>
              ))}
            </ol>
          </div>
        </section>

        {/* ---- Apply -------------------------------------------------- */}
        <section id="apply" className="scroll-mt-20 bg-white py-24 lg:py-32">
          <div className={`${SHELL} grid gap-14 lg:grid-cols-12 lg:gap-16`}>
            <div className="lg:col-span-4">
              <span className={EYEBROW}>Apply</span>
              <h2 className="mt-4 text-balance text-[10vw] font-medium leading-[0.95] tracking-[-0.04em] sm:text-[6vw] lg:text-[3.2vw]">
                Apply for the trip
              </h2>
              <p className="mt-6 max-w-md text-[17px] leading-relaxed text-[#5a6e77]">
                Send your details and our team will contact you as soon as possible.
              </p>
              <div className="mt-10 grid gap-3 border-t border-[#08222e]/15 pt-6 text-[15px]">
                <span className="text-[#5a6e77]">Prefer to talk?</span>
                <a href="tel:+919092009044" className="inline-flex items-center gap-2 font-medium hover:text-[#176579]">
                  <Phone size={16} aria-hidden /> +91 90920 09044
                </a>
                <a href="mailto:info@affhan.com?subject=Free%20China%20business%20trip" className="inline-flex items-center gap-2 font-medium hover:text-[#176579]">
                  <Mail size={16} aria-hidden /> info@affhan.com
                </a>
              </div>
            </div>
            <div className="lg:col-span-8">
              <ChinaTripApplyForm />
            </div>
          </div>
        </section>
      </div>
      <FooterSection />
    </>
  );
}
