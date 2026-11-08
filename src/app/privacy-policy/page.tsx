"use client";

import { FooterSection } from "@/components/sections/FooterSection";
import { motion } from "framer-motion";
import { Shield, Building2, Database, Activity, Users, MailCheck, Cookie, Lock, Clock, UserCheck, ShieldCheck, RefreshCw, Mail, ArrowUpRight } from "lucide-react";
import { useState, useEffect } from "react";
import type { LucideIcon } from "lucide-react";

/**
 * The website's own Privacy Policy (the Free China Business Trip has its own, lib/trip-legal.ts). Rewritten
 * 2026-11-08 to what the site and the app really collect and do (the owner: "update the terms and conditions and
 * privacy policy perfectly what we do what we done"; "nama ena vanguroma adha matu dhan podurom", only what we take):
 * each form's own fields, the cookies and browser storage it uses (no analytics or advertising), who sees what, where it
 * is kept, the emails sent. Change a form, a cookie, a provider or an email, and change this with it.
 */
const UPDATED = "8 November 2026";

/** One piece of a section: a paragraph (optionally ending in a link), a list, or a small heading. */
type Block = { p: string; link?: { text: string; href: string }; after?: string } | { list: string[] } | { h: string };

const CONTACT_LINE =
  "email info@affhan.com, call +91 90920 09044, or write to AFFHAN INTERNATIONAL PVT LTD, Appavoo Tower West, 69/46, 3, S Madha Church Street, near Harbour Gate, Royapuram, Chennai, Tamil Nadu 600013, India.";

const sections: { id: string; title: string; icon: LucideIcon; description: string; content: Block[] }[] = [
  {
    id: "who-we-are",
    title: "Who We Are",
    icon: Building2,
    description: "The company behind affhan.com and the AFFHAN app.",
    content: [
      { p: "AFFHAN INTERNATIONAL PVT LTD (\"AFFHAN\", \"we\") runs affhan.com and the AFFHAN app. We source products from China for businesses and arrange their shipping and customs clearance." },
      { p: "This policy explains what we collect when you use the website or the app, why, who sees it and how long we keep it." },
      { p: "The Free China Business Trip has its own ", link: { text: "Privacy Policy", href: "/free-china-trip/privacy/" }, after: "." },
    ],
  },
  {
    id: "info-collect",
    title: "Information We Collect",
    icon: Database,
    description: "Only what each form or feature asks you for.",
    content: [
      { p: "We collect only what you give us through these forms and features:" },
      { h: "Your account" },
      {
        list: [
          "Your name, email address, mobile number and a password. We keep only a scrambled (hashed) form of the password, never the password itself.",
          "If you sign in with Google: your name, email address, profile picture and Google account ID, as Google shares them with us, and then your mobile number.",
          "Your mobile number is used only to contact you, and a number can belong to only one account.",
          "In the app, if you add them: your company name and address.",
        ],
      },
      { h: "Quote requests" },
      { list: ["The product and quantity you ask about, your name, email address, phone number and country, and, if you add them, your company name and your message."] },
      { h: "Shipping quote requests" },
      { list: ["Your name, phone number, email address and country, and the shipment's details: what you are shipping, the shipping mode and terms, the ports, the volume, the number of cartons, the weight and any notes."] },
      { h: "Contact form" },
      { list: ["Your name, email address, phone number and country, your company name if you add it, and your message."] },
      { h: "Saved and recently viewed products" },
      { list: ["If you are signed in, the products you save and the products you open, so that you can find them again in your account."] },
      { h: "Photo search" },
      { list: ["The photo you search with. It is sent to Google's Gemini service to name the product in it, and then used to search our catalogue. We do not keep the photo."] },
      { h: "Supplier Centre" },
      {
        list: [
          "When you register: your name, email address, mobile number and a password (kept only in hashed form). With your first application: your company name, WeChat ID and address.",
          "Each application: the product, the minimum order quantity, the details you write and up to five photos.",
        ],
      },
    ],
  },
  {
    id: "info-use",
    title: "How We Use Your Information",
    icon: Activity,
    description: "To answer you, and to run the services you use.",
    content: [
      {
        list: [
          "To reply to your requests by phone, WhatsApp or email, find suppliers, prepare quotations and arrange shipping.",
          "To run your account: signing you in, and showing your requests, their status and your saved products.",
          "To review supplier applications and to find suppliers for our customers' requests.",
          "To send the emails described below.",
          "To keep the website and the app secure and to stop misuse.",
          "To meet our legal and accounting obligations.",
        ],
      },
      { p: "We do not use your information for advertising, and we do not sell it." },
    ],
  },
  {
    id: "who-sees",
    title: "Who Sees Your Information",
    icon: Users,
    description: "Our team, the partners who complete your order, and the services that run the website.",
    content: [
      { h: "Our team" },
      { p: "Your requests are read by our office team. Our sales team sees what you asked for, and sees your contact details once a salesperson takes your request to reply to you. Supplier applications are seen by our office team." },
      { h: "Suppliers and shipping partners" },
      { p: "To source and ship your order, we share what you need (the product, quantity and specifications) with suppliers, and the shipment's details with freight and customs partners. We share your name or contact details with them only when it is needed to complete your order or shipment." },
      { h: "Cargo tracking" },
      { p: "Anyone who has a consignment number can see its progress on our tracking page: its stage, its expected departure and arrival dates and its updates. They never see the customer's name or other details." },
      { h: "Services that run the website and the app" },
      {
        list: [
          "Vercel hosts the website (United States).",
          "Neon runs our database (United States).",
          "Amazon Web Services stores our files and product images (Mumbai, India).",
          "Brevo sends our emails.",
          "Cloudflare checks that our sign-in and contact forms are used by people, not automated programs.",
          "Upstash counts requests from each connection, to stop misuse.",
          "Google provides Google sign-in, and reads the photos used in photo search.",
        ],
      },
      { p: "We do not sell or rent your information. We share it with authorities only when the law requires us to." },
    ],
  },
  {
    id: "emails",
    title: "Emails We Send",
    icon: MailCheck,
    description: "The only emails we send, and what happens when one can't be delivered.",
    content: [
      { p: "We do not send newsletters or promotional email. affhan.com sends only these emails:" },
      {
        list: [
          "Password reset: a six-digit code to the email address on your account. It expires after 5 minutes and works once. If your account signs in with Google and has no password, we send a short note saying so instead. If you didn't ask for a reset, you can ignore either email.",
          "Supplier Centre: a six-digit code to confirm your email address when you register, password reset codes, and an email when we change the status of your application or reply to it.",
        ],
      },
      { p: "These emails come from noreply@mail.affhan.com and are sent through Brevo. Brevo may record anonymously whether an email was opened or a link was clicked. This is not linked to you or your account. If an email to your address bounces permanently, or you mark one of ours as spam, we stop emailing that address. You can reply to any of our emails; replies go to info@affhan.com." },
    ],
  },
  {
    id: "cookies",
    title: "Cookies and Browser Storage",
    icon: Cookie,
    description: "Only what the website needs to work. No advertising or analytics.",
    content: [
      { p: "We do not use advertising or analytics cookies, and we do not track you on other websites." },
      { h: "Cookies" },
      {
        list: [
          "If you sign in, a cookie keeps you signed in for up to 30 days. The Supplier Centre has its own sign-in cookie, which also lasts up to 30 days.",
          "If you apply for the Free China Business Trip, a cookie remembers, for up to one year, which application this browser sent.",
        ],
      },
      { h: "Stored in your browser" },
      {
        list: [
          "Your account's name, email address, phone number and picture, so that pages show you are signed in straight away. They are cleared when you sign out.",
          "Your recent searches, so that the search box can suggest them again. They stay on your device.",
          "Small settings, such as whether the Free China Business Trip film plays sound.",
        ],
      },
    ],
  },
  {
    id: "data-security",
    title: "Data Security",
    icon: Lock,
    description: "How we protect your information.",
    content: [
      { p: "The website and the app use encrypted (HTTPS) connections. Passwords are kept only in hashed form. Repeated wrong passwords lock sign-in for a while, and Cloudflare's security check protects our sign-in and contact forms. Only our team can see your requests, and each member signs in with their own account." },
      { p: "No system is completely secure, but we take reasonable steps to protect your information." },
    ],
  },
  {
    id: "retention",
    title: "How Long We Keep Information",
    icon: Clock,
    description: "As long as we need it, and no longer.",
    content: [
      {
        list: [
          "Your account: until you ask us to delete it.",
          "Quote requests, shipping requests, messages and supplier applications: as long as we need them for our business, accounting and legal records.",
          "Sign-in sessions end after 30 days; password reset codes expire after 5 minutes.",
          "An address that bounced or marked our email as spam is kept, so that we do not email it again.",
          "Photos used in photo search are not kept.",
        ],
      },
    ],
  },
  {
    id: "rights",
    title: "Your Choices and Rights",
    icon: UserCheck,
    description: "Seeing, correcting and deleting your information.",
    content: [
      { p: "You can change your mobile number in your account at any time." },
      { p: "To see, correct or delete the information we hold about you, or to delete your account, email info@affhan.com from the address on your account. We may ask you to confirm who you are, and we will reply within 30 days." },
      { p: "When an account is deleted, its saved and recently viewed products are deleted with it. We may keep requests we have already answered as business records." },
      { p: "Suppliers can withdraw an open application at any time in the Supplier Centre." },
    ],
  },
  {
    id: "children",
    title: "Children",
    icon: ShieldCheck,
    description: "The website is for businesses.",
    content: [{ p: "affhan.com and the AFFHAN app are meant for businesses, not for anyone under 18. We do not knowingly collect information from children." }],
  },
  {
    id: "changes",
    title: "Changes to This Policy",
    icon: RefreshCw,
    description: "How you will know when this policy changes.",
    content: [{ p: "When we change this policy, we update the date at the top of this page. If a change affects how we use your information, we will say so on the website." }],
  },
  {
    id: "contact-us",
    title: "Contact Us",
    icon: Mail,
    description: "Questions, requests and complaints about your information.",
    content: [{ p: `For any question, request or complaint about this Privacy Policy or your information, ${CONTACT_LINE}` }],
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

export default function PrivacyPolicyPage() {
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
            <Shield className="w-4.5 h-4.5" /> Trust & Compliance
          </motion.div>

          <motion.h1
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.1 }}
            className="text-4xl md:text-5xl lg:text-6xl font-extrabold text-white tracking-tight"
          >
            Privacy Policy
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
            Learn about how we collect, use, and protect your personal information
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
              <nav className="space-y-1" aria-label="Privacy policy quick navigation">
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

                    {sect.id === "contact-us" && (
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
