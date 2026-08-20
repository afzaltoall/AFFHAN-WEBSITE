"use client";

import { FooterSection } from "@/components/sections/FooterSection";
import { motion } from "framer-motion";
import { FileText, ClipboardList, ShieldCheck, Scale, AlertOctagon, Shield, HelpCircle, ArrowUpRight } from "lucide-react";
import { useState, useEffect } from "react";

const sections = [
  {
    id: "acceptance",
    title: "Acceptance of Terms",
    icon: ClipboardList,
    description: "The legal binding agreement you enter into by accessing or using our services.",
    content: "By accessing and using this website, you accept and agree to be bound by the terms and provision of this agreement. If you do not agree to abide by the above, please do not use this service.",
  },
  {
    id: "license",
    title: "Use License",
    icon: ShieldCheck,
    description: "Scope and limitations of the permitted usage of our website materials.",
    content: "Permission is granted to temporarily download one copy of the materials on our website for personal, non-commercial transitory viewing only. This is the grant of a license, not a transfer of title.",
  },
  {
    id: "disclaimer",
    title: "Disclaimer",
    icon: Scale,
    description: "Exclusions and limitations of warranties regarding website materials.",
    content: "The materials on our website are provided on an 'as is' basis. We make no warranties, expressed or implied, and hereby disclaim and negate all other warranties including, without limitation, implied warranties or conditions of merchantability.",
  },
  {
    id: "limitations",
    title: "Limitations",
    icon: AlertOctagon,
    description: "Our liability restrictions regarding potential damages or loss of data.",
    content: "In no event shall our company or its suppliers be liable for any damages arising out of the use or inability to use the materials on our website, even if we or our authorized representative has been notified orally or in writing of the possibility of such damage.",
  },
  {
    id: "privacy",
    title: "Privacy Policy",
    icon: Shield,
    description: "Links to how we collect, store, and process your data.",
    content: "Your privacy is important to us. Please review our Privacy Policy, which also governs your use of the website, to understand our practices.",
  },
  {
    id: "contact-info",
    title: "Contact Information",
    icon: HelpCircle,
    description: "How to reach out to us regarding issues, feedback, or legal inquiries.",
    content: "If you have any questions about these Terms and Conditions, please contact us through our website or the contact information provided in our store.",
  },
];

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

                    <p className="text-slate-600 leading-relaxed text-sm md:text-base whitespace-pre-line">
                      {sect.content}
                    </p>

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
