"use client";

import { FooterSection } from "@/components/sections/FooterSection";
import { motion } from "framer-motion";
import { FileText, ClipboardList, Package, User, Camera, Ship, Factory, Ban, Copyright, ExternalLink, Scale, AlertOctagon, RefreshCw, Landmark, Shield, HelpCircle, ArrowUpRight } from "lucide-react";
import { useState, useEffect } from "react";
import type { LucideIcon } from "lucide-react";

/**
 * The website's own Terms & Conditions (the Free China Business Trip has its own, lib/trip-legal.ts). Rewritten
 * 2026-11-08 from a generic template ("the contact information provided in our store") to what affhan.com and the app
 * really are (the owner: "update the terms and conditions and privacy policy perfectly what we do what we done"): an
 * inquiry-only sourcing site with no prices, cart or payments; quote requests that are not orders; accounts; photo
 * search; cargo tracking; the Supplier Centre. Indian law and Chennai's courts, as the trip's Terms say.
 */
const UPDATED = "8 November 2026";

/** One piece of a section: a paragraph (optionally ending in a link), a list, or a small heading. */
type Block = { p: string; link?: { text: string; href: string }; after?: string } | { list: string[] } | { h: string };

const sections: { id: string; title: string; icon: LucideIcon; description: string; content: Block[] }[] = [
  {
    id: "acceptance",
    title: "About These Terms",
    icon: ClipboardList,
    description: "Who we are, and what these terms cover.",
    content: [
      { p: "These terms apply to affhan.com and the AFFHAN app, run by AFFHAN INTERNATIONAL PVT LTD of Chennai, India (\"AFFHAN\", \"we\"). By using the website or the app, you agree to these terms. If you do not agree, please do not use them." },
      { p: "The Free China Business Trip has its own ", link: { text: "Terms & Conditions", href: "/free-china-trip/terms/" }, after: "." },
    ],
  },
  {
    id: "what-we-do",
    title: "What We Do",
    icon: Package,
    description: "A sourcing service, not a shop.",
    content: [
      { p: "AFFHAN sources products from China for businesses, and arranges their quality checks, shipping and customs clearance." },
      { p: "The products on the website and in the app show what we can source. They are not our stock: their names, photos and descriptions come from suppliers and are for reference only. We do not show prices, and nothing is sold or paid for on the website or in the app." },
    ],
  },
  {
    id: "quotes",
    title: "Quote Requests",
    icon: FileText,
    description: "A request is not an order.",
    content: [
      { p: "A quote request tells us what you need. It is not an order, and it does not commit you or us to anything." },
      { p: "We reply with a quotation. An order exists only when you accept our written quotation, which sets out the product, specifications, quantity, price, delivery terms and timeline. That quotation, and any agreement made with it, governs the order." },
      { p: "Please give accurate details, so that we can answer you properly." },
    ],
  },
  {
    id: "account",
    title: "Your Account",
    icon: User,
    description: "Keeping your account accurate and secure.",
    content: [
      {
        list: [
          "Give accurate information and keep it up to date.",
          "Keep your password private. You are responsible for what is done with your account.",
          "A mobile number can belong to only one account.",
          "We may suspend or close an account that is used to misuse the website or the app.",
        ],
      },
    ],
  },
  {
    id: "photo-search",
    title: "Photo Search",
    icon: Camera,
    description: "Finding products from a photo.",
    content: [
      { p: "Photo search suggests products that look like the one in your photo. Its results are suggestions, not a guaranteed match. Upload only photos you are allowed to use, and avoid photos of people or of personal documents." },
    ],
  },
  {
    id: "cargo",
    title: "Cargo Tracking",
    icon: Ship,
    description: "What the tracking page shows, and what it doesn't promise.",
    content: [
      { p: "Our tracking page shows a consignment's progress by its number. Departure and arrival dates are estimates, and may change with carriers, ports and customs. Before relying on a date, please confirm it with our team." },
      { p: "Anyone who has a consignment number can see its progress, so please keep your number private." },
    ],
  },
  {
    id: "suppliers",
    title: "Supplier Centre",
    icon: Factory,
    description: "For suppliers who apply with their products.",
    content: [
      {
        list: [
          "Give accurate details about your company and your products.",
          "Apply only with products you can supply, and with photos you own or are allowed to use.",
          "An application does not create a contract, and does not guarantee that we will accept it or place an order. We decide on each application at our discretion.",
          "We may contact you about your applications, and use them to find suppliers for our customers' requests.",
          "You can withdraw an application while it is open.",
          "Photos you add are stored with our product images and can be opened by anyone who has their link, so please add only product photos.",
        ],
      },
    ],
  },
  {
    id: "acceptable-use",
    title: "Acceptable Use",
    icon: Ban,
    description: "What you may not do on the website or in the app.",
    content: [
      { p: "Please do not:" },
      {
        list: [
          "use the website or the app for anything unlawful;",
          "send false or misleading requests or applications;",
          "copy the catalogue, or collect information from the website with automated tools;",
          "try to get around our security, sign-in limits or checks, or interfere with how the website works; or",
          "pretend to be someone else.",
        ],
      },
      { p: "We may limit or block access that breaks these rules." },
    ],
  },
  {
    id: "content",
    title: "Content and Trademarks",
    icon: Copyright,
    description: "Who owns what you see on the website.",
    content: [
      { p: "The AFFHAN name and logo, and the website's design and text, belong to AFFHAN. Product names and images belong to their owners and are shown only to illustrate what can be sourced. Please do not copy our content for commercial use without our permission." },
    ],
  },
  {
    id: "other-services",
    title: "Other Services",
    icon: ExternalLink,
    description: "Services from other companies that the website uses.",
    content: [{ p: "Some features use other companies' services, such as Google sign-in. Their own terms apply when you use them." }],
  },
  {
    id: "disclaimer",
    title: "Disclaimer",
    icon: Scale,
    description: "The limits of what the website promises.",
    content: [
      { p: "We work to keep the website accurate, but its information is provided as it is. Product details come from suppliers and may change, and we do not guarantee that the website or the app will always be available or free of errors." },
    ],
  },
  {
    id: "limitations",
    title: "Limitation of Liability",
    icon: AlertOctagon,
    description: "Our responsibility for the use of the website.",
    content: [
      { p: "To the extent the law allows, AFFHAN is not liable for any indirect or consequential loss arising from the use of the website or the app. Our responsibility for an order is set out in the quotation or agreement for that order." },
    ],
  },
  {
    id: "changes",
    title: "Changes to These Terms",
    icon: RefreshCw,
    description: "How you will know when these terms change.",
    content: [{ p: "We may update these terms. The date at the top of this page shows when they last changed. Using the website or the app after a change means you accept the new terms." }],
  },
  {
    id: "law",
    title: "Governing Law",
    icon: Landmark,
    description: "The law and courts that apply.",
    content: [{ p: "These terms are governed by the laws of India. Disputes arising from them are subject to the jurisdiction of the courts in Chennai, Tamil Nadu." }],
  },
  {
    id: "privacy",
    title: "Privacy Policy",
    icon: Shield,
    description: "How we collect and use your information.",
    content: [{ p: "Our Privacy Policy explains what information we collect, why, who sees it and how long we keep it." }],
  },
  {
    id: "contact-info",
    title: "Contact Information",
    icon: HelpCircle,
    description: "Questions about these terms.",
    content: [
      { p: "If you have any questions about these Terms & Conditions, email info@affhan.com, call +91 90920 09044, or write to AFFHAN INTERNATIONAL PVT LTD, Appavoo Tower West, 69/46, 3, S Madha Church Street, near Harbour Gate, Royapuram, Chennai, Tamil Nadu 600013, India." },
    ],
  },
];

/** A section's paragraphs, lists and small headings, in the cards' type. */
function Blocks({ blocks }: { blocks: Block[] }) {
  return (
    <div className="space-y-4 text-slate-600 leading-relaxed text-sm md:text-base">
      {blocks.map((b, i) =>
        "h" in b ? (
          <h3 key={i} className="pt-2 text-sm md:text-base font-semibold text-slate-900">
            {b.h}
          </h3>
        ) : "list" in b ? (
          <ul key={i} className="list-disc space-y-2 pl-5 marker:text-[#245B6D]">
            {b.list.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        ) : (
          <p key={i}>
            {b.p}
            {b.link && (
              <a href={b.link.href} className="font-semibold text-[#245B6D] hover:text-[#19414e] transition-colors">
                {b.link.text}
              </a>
            )}
            {b.after}
          </p>
        ),
      )}
    </div>
  );
}

export default function TermsConditionsPage() {
  const [activeSection, setActiveSection] = useState(sections[0].id);

  useEffect(() => {
    const handleScroll = () => {
      const scrollPosition = window.scrollY + 200;
      for (const section of sections) {
        const el = document.getElementById(section.id);
        if (el) {
          const top = el.offsetTop;
          const height = el.offsetHeight;
          if (scrollPosition >= top && scrollPosition < top + height) {
            setActiveSection(section.id);
            break;
          }
        }
      }
    };

    window.addEventListener("scroll", handleScroll);
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  const scrollToSection = (id: string) => {
    const el = document.getElementById(id);
    if (el) {
      const offset = el.offsetTop - 120;
      window.scrollTo({
        top: offset,
        behavior: "smooth",
      });
      setActiveSection(id);
    }
  };

  return (
    <main className="relative min-h-screen bg-slate-50/50 text-slate-800">
      {/* Header Hero Section */}
      <section className="relative overflow-hidden bg-gradient-to-b from-[#0b161b] to-[#081115] py-20 md:py-28 text-center px-4">
        {/* Subtle grid pattern background */}
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,rgba(36,91,109,0.15),transparent_70%)] pointer-events-none" />
        
        <div className="relative z-10 max-w-4xl mx-auto mt-8">
          <motion.div
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6 }}
            className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-[#245B6D]/20 border border-[#245B6D]/30 text-[#3cd5f7] text-xs font-semibold uppercase tracking-wider mb-4"
          >
            <FileText className="w-4.5 h-4.5" /> Legal Agreement
          </motion.div>

          <motion.h1
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.1 }}
            className="text-4xl md:text-5xl lg:text-6xl font-extrabold text-white tracking-tight"
          >
            Terms & Conditions
          </motion.h1>

          <motion.div
            initial={{ scaleX: 0 }}
            animate={{ scaleX: 1 }}
            transition={{ duration: 0.8, delay: 0.2 }}
            className="w-16 h-1 bg-[#3cd5f7] rounded-full mx-auto mt-6 origin-center"
          />

          <motion.p
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.6, delay: 0.3 }}
            className="mt-6 text-slate-300 text-base md:text-lg max-w-2xl mx-auto font-light leading-relaxed"
          >
            Please read these terms and conditions carefully before using our service
          </motion.p>
          <p className="mt-3 text-sm text-slate-400">Last updated {UPDATED}</p>
        </div>
      </section>

      {/* Main Body Content with Layout */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-14 py-16 md:py-24">
        <div className="flex flex-col lg:flex-row gap-12">
          {/* Quick-navigation Sidebar - Sticky on desktop */}
          <aside className="hidden lg:block w-72 shrink-0">
            <div className="sticky top-28 liquid-glass-card p-6">
              <h3 className="text-sm font-semibold text-slate-400 uppercase tracking-wider mb-4 px-2">
                Table of Contents
              </h3>
              <nav className="space-y-1" aria-label="Terms and conditions quick navigation">
                {sections.map((sect) => {
                  const Icon = sect.icon;
                  const isActive = activeSection === sect.id;
                  return (
                    <button
                      key={sect.id}
                      onClick={() => scrollToSection(sect.id)}
                      className={`w-full flex items-center gap-3 px-3 py-3 rounded-xl text-left text-sm font-medium transition-all duration-200 cursor-pointer ${
                        isActive
                          ? "bg-[#245B6D]/5 text-[#245B6D] shadow-sm border-l-4 border-[#245B6D] pl-2"
                          : "text-slate-600 hover:bg-slate-50 hover:text-slate-900"
                      }`}
                    >
                      <Icon className={`w-4 h-4 shrink-0 ${isActive ? "text-[#245B6D]" : "text-slate-400"}`} />
                      <span className="truncate">{sect.title}</span>
                    </button>
                  );
                })}
              </nav>
            </div>
          </aside>

          {/* Policy content area */}
          <div className="flex-1 max-w-4xl">
            <div className="space-y-8 md:space-y-12">
              {sections.map((sect, index) => {
                const Icon = sect.icon;
                return (
                  <motion.section
                    id={sect.id}
                    key={sect.id}
                    initial={{ opacity: 0, y: 30 }}
                    whileInView={{ opacity: 1, y: 0 }}
                    viewport={{ once: true, margin: "-100px" }}
                    transition={{ duration: 0.5, delay: index * 0.05 }}
                    className="liquid-glass-card p-6 md:p-10 relative overflow-hidden group"
                  >
                    {/* Background accent glow */}
                    <div className="absolute top-0 right-0 w-32 h-32 bg-gradient-to-bl from-[#245B6D]/5 to-transparent rounded-bl-full pointer-events-none opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
                    
                    <div className="flex items-center gap-4 mb-6">
                      <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-[#245B6D]/10 text-[#245B6D] transition-transform duration-300 group-hover:scale-110">
                        <Icon className="w-6 h-6" />
                      </div>
                      <div>
                        <h2 className="text-xl md:text-2xl font-bold text-slate-900 tracking-tight group-hover:text-[#245B6D] transition-colors duration-200">
                          {sect.title}
                        </h2>
                        <p className="text-xs md:text-sm text-slate-400 mt-0.5">
                          {sect.description}
                        </p>
                      </div>
                    </div>

                    <Blocks blocks={sect.content} />

                    {sect.id === "privacy" && (
                      <div className="mt-8 pt-6 border-t border-slate-100 flex flex-wrap gap-4">
                        <a
                          href="/privacy-policy/"
                          className="inline-flex items-center gap-2 text-sm font-semibold text-[#245B6D] hover:text-[#19414e] transition-colors"
                        >
                          Read Privacy Policy
                          <ArrowUpRight className="w-4 h-4" />
                        </a>
                      </div>
                    )}

                    {sect.id === "contact-info" && (
                      <div className="mt-8 pt-6 border-t border-slate-100 flex flex-wrap gap-4">
                        <a
                          href="/contact/"
                          className="inline-flex items-center gap-2 text-sm font-semibold text-[#245B6D] hover:text-[#19414e] transition-colors"
                        >
                          Visit Contact Page
                          <ArrowUpRight className="w-4 h-4" />
                        </a>
                      </div>
                    )}
                  </motion.section>
                );
              })}
            </div>
          </div>
        </div>
      </div>

      <FooterSection />
    </main>
  );
}
