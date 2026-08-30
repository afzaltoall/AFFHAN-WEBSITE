"use client";

import { useRef, useState } from "react";
import { motion, useInView, useScroll, useMotionValueEvent, useReducedMotion } from "framer-motion";
import { Check, Loader2 } from "lucide-react";
import { Instrument_Serif } from "next/font/google";
import { cn } from "@/lib/utils";

const instrument = Instrument_Serif({ weight: "400", style: ["normal", "italic"], subsets: ["latin"] });

export function AsmeSections() {
  return (
    <div className="bg-white text-slate-900 selection:bg-slate-200 w-full overflow-hidden">
      <Section1Hero />
      <Section4Philosophy />
    </div>
  );
}

// ==========================================
// SECTION 1: HERO
// ==========================================
/**
 * "Never miss a role" — the job-alerts sign-up.
 *
 * The autoplaying loop of career-3.mp4 and the dark gradient laid over it are
 * gone; the gradient only ever existed to hold white text on moving footage.
 * The section keeps its dark ground because the glass pill, the white type and
 * the social row are all built for white-on-dark, and because it sits between
 * two light sections and gives the page somewhere to breathe.
 *
 * The reveal is tied to scroll position rather than to a one-shot on-enter
 * animation, so it arrives with you as you come down the page.
 *
 * It is NOT a tall sticky track like the two sections above it. There is a
 * form here, and burying a text field three screens deep so it can be animated
 * on the way past would be an animation charged to the person trying to use
 * it. The section stays one screen tall and the reveal plays as it enters.
 */
const HEADLINE = ["Never", "miss", "a", "role."];

function Section1Hero() {
  const sectionRef = useRef<HTMLElement>(null);
  const reduced = useReducedMotion();
  const { scrollYProgress } = useScroll({
    target: sectionRef,
    offset: ["start end", "center center"],
  });
  const [raw, setRaw] = useState(0);
  useMotionValueEvent(scrollYProgress, "change", (v) => {
    // Fiftieths, not hundredths: half the re-renders for a step finer
      // than the eye resolves. Only a handful of elements depend on this, so
      // it is not worth the hand-written DOM writes prisma-hero needed.
      const next = Math.round(v * 50) / 50;
    setRaw((prev) => (prev === next ? prev : next));
  });
  const p = reduced ? 1 : raw;

  // Everything lands by 0.9 so the form is fully usable well before the
  // section settles in the middle of the screen.
  const at = (start: number, over = 0.16) => Math.min(1, Math.max(0, (p - start) / over));
  const reveal = (lit: number, shift = 18) => ({
    opacity: lit,
    transform: `translateY(${(1 - lit) * shift}px)`,
    transition: "opacity 0.4s ease-out, transform 0.7s cubic-bezier(0.16,1,0.3,1)",
  });

  const [email, setEmail] = useState("");
  const [state, setState] = useState<"idle" | "loading" | "done" | "error">("idle");
  const [msg, setMsg] = useState("");

  const subscribe = async (e: React.FormEvent) => {
    e.preventDefault();
    if (state === "loading" || state === "done") return;
    const value = email.trim();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) {
      setState("error");
      setMsg("Please enter a valid email address.");
      return;
    }
    setState("loading");
    setMsg("");
    try {
      const res = await fetch("/api/careers/subscribe/", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: value }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Something went wrong.");
      setState("done");
      setMsg(data.message || "You're on the list — we'll be in touch.");
      setEmail("");
    } catch (err) {
      setState("error");
      setMsg(err instanceof Error ? err.message : "Something went wrong. Please try again.");
    }
  };

  return (
    <section ref={sectionRef} className="relative flex h-screen min-h-[640px] flex-col overflow-hidden bg-[#FAFAF7]">
      {/* The starfield that replaced the video only worked on a dark ground.
          On white it would be invisible, so the atmosphere here is a single
          cool wash off the brand teal — enough to stop the panel reading as a
          blank rectangle, faint enough to leave the type at full contrast. */}
      <div
        aria-hidden="true"
        className="absolute inset-0 z-0"
        style={{
          background:
            "radial-gradient(ellipse 70% 50% at 50% 44%, rgba(23,101,121,0.07) 0%, rgba(23,101,121,0.025) 45%, rgba(250,250,247,0) 75%)",
        }}
      />

      {/* Hero Content */}
      <div className="relative z-10 flex-1 flex flex-col items-center justify-center px-6 py-6 text-center">
        {/* h2, not h1. The page already has one — "Grow without limits, with
            Affhan." in the hero — and this section had a second, which leaves
            a document with two competing titles for search engines and no
            single landmark for anyone navigating by heading. */}
        <h2 className={cn("mb-4 whitespace-nowrap text-5xl tracking-tight text-[#08222e] sm:mb-6 sm:text-6xl md:text-7xl lg:text-8xl", instrument.className)}>
          {HEADLINE.map((word, i) => {
            const lit = at(0.06 + i * 0.07, 0.2);
            const last = i === HEADLINE.length - 1;
            return (
              <span
                key={word}
                className="inline-block whitespace-pre"
                style={reveal(lit, 26)}
              >
                {last ? <em className="font-light italic">role</em> : word}
                {last ? "." : " "}
              </span>
            );
          })}
        </h2>

        <p
          className="mb-6 max-w-lg px-4 text-sm leading-relaxed text-[#5a6e77] sm:mb-8 sm:text-base"
          style={reveal(at(0.34))}
        >
          Get Affhan&apos;s newest openings and team stories delivered to your inbox. No spam &mdash; just opportunities to build a career without borders.
        </p>

        <div className="mx-auto w-full max-w-xl" style={reveal(at(0.46))}>
          {state === "done" ? (
            // Confirmation replaces the input entirely — a calm glass pill with a
            // check badge, so subscribing feels finished rather than "just a green line".
            <div className="animate-in fade-in mx-auto flex w-full items-center gap-3 rounded-full border border-emerald-700/25 bg-white py-3 pl-3 pr-6 shadow-[0_1px_2px_rgba(8,34,46,0.05)]">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-emerald-700 text-white">
                <Check className="w-5 h-5" strokeWidth={3} />
              </span>
              <div className="text-left min-w-0">
                <p className="text-sm font-medium leading-tight text-[#08222e] sm:text-base">You&apos;re on the list.</p>
                <p className="text-xs leading-tight text-[#5a6e77] sm:text-sm">We&apos;ll email you the moment a role opens up.</p>
              </div>
              <button
                type="button"
                onClick={() => { setState("idle"); setMsg(""); }}
                className="ml-auto shrink-0 text-xs font-medium text-[#5a6e77] underline underline-offset-4 transition-colors hover:text-[#08222e]"
              >
                Add another
              </button>
            </div>
          ) : (
            // Submit is driven by the "Life at Affhan" button below — the pill
            // is input-only (Enter still submits via the form's onSubmit).
            <form
              onSubmit={subscribe}
              className="flex w-full items-center rounded-full border border-[#08222e]/15 bg-white px-6 py-3.5 shadow-[0_1px_2px_rgba(8,34,46,0.05)] transition-colors focus-within:border-[#176579]/45"
            >
              <input
                type="email"
                value={email}
                onChange={(e) => { setEmail(e.target.value); if (state === "error") setState("idle"); }}
                placeholder="Enter your email for job alerts"
                disabled={state === "loading"}
                className="min-w-0 flex-1 bg-transparent text-sm text-[#08222e] placeholder:text-[#63757d] focus:outline-none disabled:opacity-60 sm:text-base"
                required
              />
            </form>
          )}
          {state === "error" && msg && (
            <p className="mt-3 text-sm font-medium text-red-700">{msg}</p>
          )}
        </div>

        {/* "Life at Affhan" is the send action for the job-alerts form: clicking
            it subscribes the email typed above (no separate arrow button). */}
        {state !== "done" && (
          <button
            type="button"
            onClick={subscribe}
            disabled={state === "loading"}
            style={reveal(at(0.56))}
            className="mt-6 flex items-center gap-2 rounded-full bg-[#08222e] px-8 py-3 text-sm font-medium text-[#FAFAF7] transition-colors hover:bg-[#0d3243] disabled:opacity-70 sm:mt-8"
          >
            {state === "loading" ? <><Loader2 className="w-4 h-4 animate-spin" /> Sending…</> : "Life at Affhan"}
          </button>
        )}
      </div>

      {/* Social Icons Footer — Affhan's official channels */}
      <div className="relative z-10 mt-auto flex shrink-0 flex-wrap justify-center gap-3 pb-6 sm:gap-4 sm:pb-8">
        {SOCIALS.map(({ label, href, Icon }, i) => (
          <a
            style={reveal(at(0.62 + i * 0.03, 0.14), 12)}
            key={label}
            href={href}
            target="_blank"
            rel="noopener noreferrer"
            aria-label={label}
            className="rounded-full border border-[#08222e]/12 bg-white p-3.5 text-[#5a6e77] shadow-[0_1px_2px_rgba(8,34,46,0.04)] transition-all hover:border-[#176579]/40 hover:text-[#08222e]"
          >
            <Icon className="w-5 h-5" />
          </a>
        ))}
      </div>
    </section>
  );
}

// Custom Icons to prevent lucide-react version issues
function InstagramIcon({ className }: { className?: string }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <rect width="20" height="20" x="2" y="2" rx="5" ry="5"/>
      <path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z"/>
      <line x1="17.5" x2="17.51" y1="6.5" y2="6.5"/>
    </svg>
  );
}

function TwitterIcon({ className }: { className?: string }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <path d="M22 4s-.7 2.1-2 3.4c1.6 10-9.4 17.3-18 11.6 2.2.1 4.4-.6 6-2C3 15.5.5 9.6 3 5c2.2 2.6 5.6 4.1 9 4-.9-4.2 4-6.6 7-3.8 1.1 0 3-1.2 3-1.2z"/>
    </svg>
  );
}

function FacebookIcon({ className }: { className?: string }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className={className}>
      <path d="M22 12a10 10 0 1 0-11.56 9.88v-6.99H7.9V12h2.54V9.8c0-2.5 1.49-3.89 3.77-3.89 1.09 0 2.24.2 2.24.2v2.46h-1.26c-1.24 0-1.63.77-1.63 1.56V12h2.78l-.44 2.89h-2.34v6.99A10 10 0 0 0 22 12z"/>
    </svg>
  );
}

function TikTokIcon({ className }: { className?: string }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className={className}>
      <path d="M16.5 3c.3 2.1 1.6 3.6 3.5 3.9v2.5c-1.3.1-2.5-.3-3.6-1v5.9c0 3.4-2.6 5.7-5.7 5.7A5.6 5.6 0 0 1 5 14.4c0-3.3 3-5.9 6.4-5.3v2.7c-.4-.1-.8-.2-1.2-.2-1.5 0-2.7 1.2-2.7 2.7s1.2 2.7 2.7 2.7c1.6 0 2.8-1.2 2.8-2.9V3h2.5z"/>
    </svg>
  );
}

function LinkedInIcon({ className }: { className?: string }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className={className}>
      <path d="M4.98 3.5A2.5 2.5 0 1 0 5 8.5a2.5 2.5 0 0 0 0-5zM3 9h4v12H3zM9 9h3.8v1.7h.05c.53-.95 1.83-1.95 3.77-1.95C20.4 8.75 21 11 21 14.1V21h-4v-6.1c0-1.45-.03-3.3-2-3.3s-2.32 1.57-2.32 3.2V21H9z"/>
    </svg>
  );
}

function YouTubeIcon({ className }: { className?: string }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className={className}>
      <path d="M23 12s0-3.3-.42-4.88a2.52 2.52 0 0 0-1.77-1.78C19.24 5 12 5 12 5s-7.24 0-8.81.34a2.52 2.52 0 0 0-1.77 1.78C1 8.7 1 12 1 12s0 3.3.42 4.88c.23.87.9 1.55 1.77 1.78C4.76 19 12 19 12 19s7.24 0 8.81-.34a2.52 2.52 0 0 0 1.77-1.78C23 15.3 23 12 23 12zM9.75 15.02V8.98L15.5 12l-5.75 3.02z"/>
    </svg>
  );
}

// Affhan's official social channels (order: IG, FB, X, TikTok, LinkedIn, YouTube)
const SOCIALS: { label: string; href: string; Icon: (p: { className?: string }) => React.ReactElement }[] = [
  { label: "Instagram", href: "https://www.instagram.com/affhanglobal", Icon: InstagramIcon },
  { label: "Facebook", href: "https://www.facebook.com/affhaninternational", Icon: FacebookIcon },
  { label: "Twitter", href: "https://x.com/affhan_shipping", Icon: TwitterIcon },
  { label: "TikTok", href: "https://www.tiktok.com/@affhan_global", Icon: TikTokIcon },
  { label: "LinkedIn", href: "https://www.linkedin.com/company/affhanglobal/", Icon: LinkedInIcon },
  { label: "YouTube", href: "https://www.youtube.com/@affhan_global", Icon: YouTubeIcon },
];

// ==========================================
// SECTION 4: PHILOSOPHY
// ==========================================

/**
 * The working day the paragraph beside this already describes.
 *
 * Nothing here is a new claim. The copy says "a morning call with a Guangzhou
 * factory, an afternoon untangling a customs hold for a London client"; these
 * are those same two moments plus the outcome, drawn instead of stated. The
 * offices and the time-zone gap between them are the company's own.
 */
const DAY = [
  {
    when: "Morning",
    where: "Guangzhou",
    what: "A call with the factory floor. The sample is either right or it is not, and today is when that gets said.",
  },
  {
    when: "Afternoon",
    where: "London",
    what: "A customs hold, untangled. The commodity code was arguable; somebody has to go and argue it.",
  },
  {
    when: "By close",
    where: "On the water",
    what: "The container sails. What you decided this morning is on it.",
  },
];

function Section4Philosophy() {
  const ref = useRef<HTMLElement>(null);
  const isInView = useInView(ref, { once: true, margin: "-100px" });

  // The day advances with the scroll rather than on a timer, so the reader
  // moves through it at their own pace.
  const { scrollYProgress } = useScroll({ target: ref, offset: ["start end", "end start"] });
  const [dayP, setDayP] = useState(0);
  useMotionValueEvent(scrollYProgress, "change", (v) => {
    // Fiftieths, not hundredths: half the re-renders for a step finer
      // than the eye resolves. Only a handful of elements depend on this, so
      // it is not worth the hand-written DOM writes prisma-hero needed.
      const next = Math.round(v * 50) / 50;
    setDayP((prev) => (prev === next ? prev : next));
  });
  const reducedDay = useReducedMotion();
  const stepLit = (i: number) => {
    if (reducedDay) return 1;
    // The panel is read between roughly a third and two thirds of the way
    // through the section, which is when it is actually on screen.
    const from = 0.3 + i * 0.11;
    return Math.min(1, Math.max(0, (dayP - from) / 0.1));
  };

  return (
    <section 
      ref={ref}
      className="relative bg-white py-28 md:py-40 px-6 overflow-hidden"
    >
      <div className="max-w-6xl mx-auto">
        <motion.h2 
          initial={{ opacity: 0, y: 40 }}
          animate={isInView ? { opacity: 1, y: 0 } : { opacity: 0, y: 40 }}
          transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1] }}
          className="text-4xl sm:text-5xl md:text-7xl lg:text-8xl text-slate-900 tracking-tight mb-16 md:mb-24 text-center sm:text-left"
        >
          <span className={cn("italic font-light text-slate-400", instrument.className)}>Careers</span> x Affhan
        </motion.h2>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-8 md:gap-12 items-center">
          {/* Left: the day, advancing as you scroll.
              Was an autoplaying loop of career-4.mp4 — stock footage that said
              nothing the paragraph beside it did not already say better. */}
          <motion.ol
            initial={{ opacity: 0, x: -40 }}
            animate={isInView ? { opacity: 1, x: 0 } : { opacity: 0, x: -40 }}
            transition={{ duration: 1, ease: [0.16, 1, 0.3, 1], delay: 0.2 }}
            className="relative rounded-3xl border border-slate-200 bg-slate-50/70 p-7 sm:p-9"
          >
            {/* The rail the day runs down. */}
            <span
              aria-hidden="true"
              className="absolute left-[42px] top-10 bottom-10 w-px bg-slate-200 sm:left-[54px]"
            />
            {DAY.map((d, i) => {
              const lit = stepLit(i);
              return (
                <li key={d.when} className="relative flex gap-5 pb-9 last:pb-0">
                  <span className="relative z-10 mt-1 flex h-4 w-4 shrink-0 items-center justify-center">
                    <span
                      className="h-4 w-4 rounded-full border-2 bg-white transition-colors duration-500"
                      style={{ borderColor: lit > 0.5 ? "#176579" : "#cbd5e1" }}
                    />
                  </span>
                  <div
                    style={{
                      opacity: 0.3 + lit * 0.7,
                      transform: `translateY(${(1 - lit) * 10}px)`,
                      transition: "opacity 0.4s ease-out, transform 0.6s cubic-bezier(0.16,1,0.3,1)",
                    }}
                  >
                    <p className="text-[11.5px] font-bold uppercase tracking-[0.2em] text-[#176579]">
                      {d.when} · {d.where}
                    </p>
                    <p className="mt-2 text-[15px] leading-relaxed text-slate-700 sm:text-base">{d.what}</p>
                  </div>
                </li>
              );
            })}
          </motion.ol>
          
          {/* Right: Text Content */}
          <motion.div 
            initial={{ opacity: 0, x: 40 }}
            animate={isInView ? { opacity: 1, x: 0 } : { opacity: 0, x: 40 }}
            transition={{ duration: 1, ease: [0.16, 1, 0.3, 1], delay: 0.3 }}
            className="flex flex-col gap-6 sm:gap-8 px-4 sm:px-0"
          >
            <p className="text-slate-700 text-lg sm:text-xl md:text-2xl leading-relaxed font-light">
              No two days are the same. A morning call with a Guangzhou factory, an afternoon untangling a customs hold for a London client &mdash; hands-on, high-trust work where your decisions actually ship.
            </p>
            <p className="text-slate-500 text-sm sm:text-base leading-relaxed">
              {/* Seven, not six. This listed Chennai, Guangzhou, London,
                  Singapore, Malaysia and Dubai while the office records, the
                  About page and the hero beside it all say seven — Paris was
                  the one being dropped. */}
              Our offices span Chennai, Guangzhou, London, Singapore, Malaysia, Dubai and Paris &mdash; a close-knit crew where your work is seen and your ideas travel fast. Curious, driven and dependable? You&apos;ll fit right in.
            </p>
            <div className="mt-4">
              <a href="/contact/" className="inline-block text-slate-900 text-sm font-medium uppercase tracking-widest border-b border-slate-300 pb-1 hover:border-slate-900 transition-colors">
                Join Our Team
              </a>
            </div>
          </motion.div>
        </div>
      </div>
    </section>
  );
}
