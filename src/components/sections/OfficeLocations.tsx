"use client";

import React from "react";
import Link from "next/link";
import { ArrowRight, Phone } from "lucide-react";

const CountryFlag = ({ country }: { country: string }) => {
  switch (country.toLowerCase()) {
    case "china":
      return (
        <svg className="w-5 h-3.5 rounded-sm object-cover shrink-0 border border-slate-200" viewBox="0 0 30 20" fill="none">
          <rect width="30" height="20" fill="#DE2910" />
          <path d="M5 6L6.5 10.5L2.5 7.5H7.5L3.5 10.5L5 6Z" fill="#FFDE00" />
          <path d="M10 3L10.5 4.5L9.5 3.5H10.5L9.5 4.5L10 3Z" fill="#FFDE00" />
          <path d="M12 5L12.5 6.5L11.5 5.5H12.5L11.5 6.5L12 5Z" fill="#FFDE00" />
          <path d="M12 8L12.5 9.5L11.5 8.5H12.5L11.5 9.5L12 8Z" fill="#FFDE00" />
          <path d="M10 10L10.5 11.5L9.5 10.5H10.5L9.5 11.5L10 10Z" fill="#FFDE00" />
        </svg>
      );
    case "india":
      return (
        <svg className="w-5 h-3.5 rounded-sm object-cover shrink-0 border border-slate-200" viewBox="0 0 3 2">
          <rect width="3" height="2" fill="#FFFFFF" />
          <rect width="3" height="0.667" fill="#FF9933" />
          <rect y="1.333" width="3" height="0.667" fill="#138808" />
          <circle cx="1.5" cy="1" r="0.18" fill="#000080" />
          <circle cx="1.5" cy="1" r="0.12" fill="none" stroke="#FFFFFF" strokeWidth="0.02" />
        </svg>
      );
    case "singapore":
      return (
        <svg className="w-5 h-3.5 rounded-sm object-cover shrink-0 border border-slate-200" viewBox="0 0 36 24">
          <rect width="36" height="24" fill="#FFFFFF" />
          <rect width="36" height="12" fill="#DF0000" />
          <path d="M8 4.5 C10 4.5 11.5 6 11.5 8 C11.5 10 10 11.5 8 11.5 C7 11.5 6 11 5.5 10 C6.5 10.5 8 10 8.5 9 C9 8 8.5 6.5 7.5 6 C7.7 5 7.9 4.5 8 4.5" fill="#FFFFFF" />
        </svg>
      );
    case "malaysia":
      return (
        <svg className="w-5 h-3.5 rounded-sm object-cover shrink-0 border border-slate-200" viewBox="0 0 28 14">
          <rect width="28" height="14" fill="#FFFFFF" />
          <rect width="28" height="1" fill="#CC0000" />
          <rect y="2" width="28" height="1" fill="#CC0000" />
          <rect y="4" width="28" height="1" fill="#CC0000" />
          <rect y="6" width="28" height="1" fill="#CC0000" />
          <rect y="8" width="28" height="1" fill="#CC0000" />
          <rect y="10" width="28" height="1" fill="#CC0000" />
          <rect y="12" width="28" height="1" fill="#CC0000" />
          <rect width="14" height="8" fill="#000066" />
          <circle cx="6" cy="4" r="2.2" fill="#FFFF00" />
          <circle cx="7.2" cy="4" r="2.2" fill="#000066" />
          <polygon points="9,4 8,4.5 8.5,3.5 7.5,3.8 8.2,3 7.5,2.2 8.5,2.5 8,1.5 9,2 10,1.5 9.5,2.5 10.5,2.2 9.8,3 10.5,3.8 9.5,3.5" fill="#FFFF00" />
        </svg>
      );
    case "uae":
      return (
        <svg className="w-5 h-3.5 rounded-sm object-cover shrink-0 border border-slate-200" viewBox="0 0 4 2">
          <rect width="4" height="2" fill="#FFFFFF" />
          <rect y="0" width="4" height="0.667" fill="#00732F" />
          <rect y="1.333" width="4" height="0.667" fill="#000000" />
          <rect x="0" y="0" width="1" height="2" fill="#FF0000" />
        </svg>
      );
    case "united kingdom":
      return (
        <svg className="w-5 h-3.5 rounded-sm object-cover shrink-0 border border-slate-200" viewBox="0 0 50 30">
          <rect width="50" height="30" fill="#012169" />
          <path d="M0 0 L50 30 M0 30 L50 0" stroke="#FFFFFF" strokeWidth="6" />
          <path d="M0 0 L50 30 M0 30 L50 0" stroke="#C8102E" strokeWidth="2" />
          <path d="M25 0 V30 M0 15 H50" stroke="#FFFFFF" strokeWidth="10" />
          <path d="M25 0 V30 M0 15 H50" stroke="#C8102E" strokeWidth="6" />
        </svg>
      );
    case "france":
      return (
        <svg className="w-5 h-3.5 rounded-sm object-cover shrink-0 border border-slate-200" viewBox="0 0 3 2">
          <rect x="0" width="1" height="2" fill="#00209F" />
          <rect x="1" width="1" height="2" fill="#FFFFFF" />
          <rect x="2" width="1" height="2" fill="#F42E38" />
        </svg>
      );
    default:
      return null;
  }
};

const offices = [
  {
    country: "China",
    badge: "Head Office China",
    name: "GUANGZHOU AFFHAN INTERNATIONAL CO., LTD",
    address:
      "Room 2325, Canton Domestic Finance Centre, No.316 Chang Di Da Ma Lu, Guangzhou, GUANGDONG PROVINCE, China",
    phone: "",
  },
  {
    country: "India",
    badge: "India",
    name: "AFFHAN INTERNATIONAL PVT LTD",
    address:
      "No.69/46, Appavoo Tower, West Madha Church Road, Near by Harbour Gate No: 3, Royapuram, Chennai - 600 013. TAMIL NADU, INDIA",
    phone: "+91 90920 09044 / +91 44 4743 2777",
    // Links the office card through to the location landing page for the city
    // it sits in. Contextual body link, not footer boilerplate.
    localPage: { href: "/sourcing-company-chennai/", label: "Our sourcing company in Chennai" },
  },
  {
    country: "Singapore",
    badge: "Singapore",
    name: "AFFHAN INTERNATIONAL PTE. LTD.",
    address: "10 Jalan Besar Sim Lim Tower #08-11, Singapore 208787",
    phone: "+65 6296 0279",
  },
  {
    country: "Malaysia",
    badge: "Malaysia",
    name: "AFFHAN INTERNATIONAL SDN. BHD.",
    address: "NO 18, JALAN TEMENGGONG, 75000 MELAKA, MALAYSIA",
    phone: "+60 11-5672 6242",
  },
  {
    country: "UAE",
    badge: "UAE",
    name: "AFFHAN INTERNATIONAL TRADING LLC",
    address:
      "P.O.Box No. 7184, Office No: 203, White Crown Building, Plot No. 335 - 335, Sheikh Zayed Road, Dubai, UAE",
    phone: "+971 54 406 5867",
    localPage: { href: "/sourcing-company-dubai/", label: "Our sourcing company in Dubai" },
  },
  {
    country: "United Kingdom",
    badge: "United Kingdom",
    name: "AFFHAN INTERNATIONAL LTD",
    address: "34, Monarch parade London Road Mitcham CR4 3HA",
    phone: "+44 7438 911975",
  },
  {
    country: "France",
    badge: "France",
    name: "AFFHAN INTERNATIONAL LTD",
    address: "14 Rue de dunkerque 75010 PARIS",
    phone: "",
  },
];

export const OfficeLocations = () => {


  return (
    <section id="locations" className="relative bg-gradient-to-b from-[#f8fafc] via-[#f1f5f9] to-[#e2e8f0] text-slate-900 pb-8 pt-2 scroll-mt-24 overflow-hidden">
      <style dangerouslySetInnerHTML={{
        __html: `
        @keyframes waterFlow {
          0% { background-position: 0% 50%; }
          50% { background-position: 100% 50%; }
          100% { background-position: 0% 50%; }
        }
        @keyframes waveMove1 {
          0% { transform: translate3d(0, 0, 0); }
          50% { transform: translate3d(-25%, 8px, 0); }
          100% { transform: translate3d(0, 0, 0); }
        }
        @keyframes waveMove2 {
          0% { transform: translate3d(-25%, 0, 0); }
          50% { transform: translate3d(0, -6px, 0); }
          100% { transform: translate3d(-25%, 0, 0); }
        }

        .liquid-glass-card {
          background: linear-gradient(-45deg, rgba(255, 255, 255, 0.65) 0%, rgba(224, 242, 254, 0.45) 35%, rgba(204, 251, 241, 0.4) 70%, rgba(255, 255, 255, 0.7) 100%) !important;
          background-size: 240% 240% !important;
          animation: waterFlow 12s ease infinite !important;
          backdrop-filter: blur(20px) !important;
          -webkit-backdrop-filter: blur(20px) !important;
          border-top: 2px solid rgba(255, 255, 255, 0.95) !important;
          border-left: 2px solid rgba(255, 255, 255, 0.95) !important;
          border-bottom: 2px solid rgba(148, 163, 184, 0.3) !important;
          border-right: 2px solid rgba(148, 163, 184, 0.3) !important;
          border-radius: 28px !important;
          box-shadow: 
            inset 0 3px 10px rgba(255, 255, 255, 0.95), 
            inset 0 -3px 10px rgba(0, 0, 0, 0.03),
            0 12px 32px rgba(15, 23, 42, 0.05) !important;
          transition: all 0.5s cubic-bezier(0.16, 1, 0.3, 1) !important;
          will-change: transform, box-shadow, background-position;
        }
        @media (max-width: 1023px) {
          .liquid-glass-card {
            backdrop-filter: none !important;
            -webkit-backdrop-filter: none !important;
            background: linear-gradient(-45deg, rgba(255, 255, 255, 0.95) 0%, rgba(240, 249, 255, 0.95) 100%) !important;
          }
        }

        /* Gated to real hover-capable pointers — plain :hover sticks on
           touch devices and forces a double-tap to actually click through. */
        @media (hover: hover) and (pointer: fine) {
          .liquid-glass-card:hover {
            background: linear-gradient(-45deg, rgba(255, 255, 255, 0.8) 0%, rgba(224, 242, 254, 0.55) 35%, rgba(204, 251, 241, 0.5) 70%, rgba(255, 255, 255, 0.85) 100%) !important;
            border-top-color: rgba(255, 255, 255, 0.99) !important;
            border-left-color: rgba(255, 255, 255, 0.99) !important;
            border-bottom-color: rgba(148, 163, 184, 0.45) !important;
            border-right-color: rgba(148, 163, 184, 0.45) !important;
            box-shadow:
              inset 0 5px 15px rgba(255, 255, 255, 0.98),
              inset 0 -5px 15px rgba(0, 0, 0, 0.04),
              0 24px 50px rgba(39, 168, 196, 0.18),
              0 4px 12px rgba(0, 0, 0, 0.02) !important;
            transform: translateY(-8px) scale(1.015) !important;
          }
        }

        .liquid-glass-card:active {
          transform: translateY(-3px) scale(0.99) !important;
          box-shadow:
            inset 0 2px 6px rgba(255, 255, 255, 0.95),
            inset 0 -2px 6px rgba(0, 0, 0, 0.04),
            0 12px 25px rgba(39, 168, 196, 0.08) !important;
        }

        /* Touch devices: no lift on tap — it reads as a stuck hover. */
        @media (hover: none), (pointer: coarse) {
          .liquid-glass-card:active {
            transform: none !important;
          }
        }

        .wave-container {
          height: 40px;
          transition: height 0.65s cubic-bezier(0.16, 1, 0.3, 1), opacity 0.4s ease;
          opacity: 0.35;
        }
        @media (hover: hover) and (pointer: fine) {
          .liquid-glass-card:hover .wave-container {
            height: 110px;
            opacity: 0.65;
          }
        }

        .animate-wave1 {
          animation: waveMove1 14s ease-in-out infinite;
        }
        .animate-wave2 {
          animation: waveMove2 10s ease-in-out infinite;
        }
      `}} />
      {/* Background Dot Grid Matrix & Radial Glows */}
      <div className="absolute inset-0 bg-[radial-gradient(#e2e8f0_1px,transparent_1px)] bg-[size:24px_24px] [mask-image:radial-gradient(ellipse_60%_50%_at_50%_0%,#000_70%,transparent_100%)] opacity-[0.35] pointer-events-none" />
      <div className="absolute top-0 left-1/4 w-[500px] h-[500px] bg-[#27a8c4]/5 rounded-full blur-[120px] pointer-events-none" />
      <div className="absolute bottom-0 right-1/4 w-[400px] h-[400px] bg-[#176579]/5 rounded-full blur-[100px] pointer-events-none" />

      <div className="container relative z-10 mx-auto px-5 sm:px-8 lg:px-14">

        <div className="text-center mb-4 relative">
          <span className="text-[11px] font-semibold uppercase tracking-[0.26em] text-[#176579]">
            OUR LOCATIONS
          </span>
          <h2 className="mt-1 text-2xl font-extrabold tracking-tight sm:text-3xl text-slate-900">
            Global Network of Offices
          </h2>
          <div className="h-[3px] w-14 bg-[#27a8c4] rounded-full mx-auto mt-2 mb-2" />
          <p className="text-slate-600 text-[13px] max-w-xl mx-auto leading-snug">
            Operating across 7 key international manufacturing and trading hubs to coordinate your logistics and sourcing operations seamlessly.
          </p>


        </div>

        {/* Grid Container */}
        <div className="relative max-w-7xl mx-auto">
          <div className="flex flex-wrap justify-center gap-x-6 gap-y-4 px-4 py-2">
            {offices.map((office, idx) => (
              <div
                key={idx}
                className="group relative flex flex-col justify-between p-5 w-full md:w-[calc(50%-12px)] lg:w-[calc(33.333%-16px)] xl:w-[calc(25%-18px)] overflow-hidden min-h-[205px] liquid-glass-card"
              >
                {/* Decorative Liquid Water Glow Blobs */}
                <div className="absolute -right-6 -bottom-6 w-24 h-24 rounded-full bg-cyan-300/10 blur-xl pointer-events-none group-hover:bg-cyan-400/20 group-hover:scale-125 transition-all duration-700 z-0" />
                <div className="absolute -left-6 -top-6 w-24 h-24 rounded-full bg-teal-300/10 blur-xl pointer-events-none group-hover:bg-teal-400/20 group-hover:scale-125 transition-all duration-700 z-0" />

                {/* SVG Animated Waves (Water Splash effect) */}
                <div className="absolute bottom-0 left-0 right-0 w-full pointer-events-none overflow-hidden z-0 wave-container">
                  <svg className="absolute w-[200%] h-full bottom-0 left-0 animate-wave1" viewBox="0 0 1200 120" preserveAspectRatio="none">
                    <path d="M0,60 Q150,85 300,60 T600,60 T900,60 T1200,60 L1200,120 L0,120 Z" fill="url(#wave-grad-1)" />
                  </svg>
                  <svg className="absolute w-[200%] h-full bottom-0 left-0 animate-wave2" viewBox="0 0 1200 120" preserveAspectRatio="none">
                    <path d="M0,50 Q150,25 300,50 T600,50 T900,50 T1200,50 L1200,120 L0,120 Z" fill="url(#wave-grad-2)" />
                  </svg>
                </div>

                <div className="relative z-10 flex flex-col justify-between h-full w-full">
                  <div>
                    {/* Badge with inline SVG flag */}
                    <span className="inline-flex items-center gap-2 rounded-full bg-[#27a8c4]/10 px-3 py-1 text-xs font-bold uppercase tracking-wider text-[#176579] border border-[#27a8c4]/15">
                      <CountryFlag country={office.country} />
                      {office.badge}
                    </span>

                    {/* Name */}
                    <h3 className="mt-2 text-[13.5px] sm:text-[14.5px] font-bold text-slate-900 tracking-tight leading-snug">
                      {office.name}
                    </h3>

                    {/* Address */}
                    <p className="mt-1 text-[11.5px] sm:text-[12px] text-slate-600 leading-snug font-normal">
                      {office.address}
                    </p>

                    {/* Cities with a dedicated sourcing page link through to it.
                        A real in-content link, not footer boilerplate — and the
                        anchor names the service and the city rather than saying
                        "learn more". */}
                    {office.localPage && (
                      <Link
                        href={office.localPage.href}
                        className="mt-2 inline-flex items-center gap-1 text-[11.5px] sm:text-[12px] font-semibold text-[#176579] hover:text-[#27a8c4] hover:underline transition-colors"
                      >
                        {office.localPage.label}
                        <ArrowRight className="h-3 w-3" aria-hidden="true" />
                      </Link>
                    )}
                  </div>

                  {/* Phone */}
                  {office.phone && (
                    <div className="mt-2 pt-2 border-t border-slate-100 flex items-start gap-2 text-[11.5px] sm:text-[12.5px] text-[#176579] font-semibold">
                      <span className="flex h-5 w-5 items-center justify-center rounded-full bg-[#27a8c4]/15 text-[#176579] group-hover:scale-110 group-hover:rotate-12 transition-all duration-300 shrink-0 mt-0.5">
                        <Phone className="h-[11px] w-[11px] text-[#27a8c4]" />
                      </span>
                      <div className="flex flex-col gap-0.5 min-w-0">
                        {office.phone.split(" / ").map((num, i) => {
                          const cleanNum = num.replace(/\s+/g, "");
                          return (
                            <a
                              key={i}
                              href={`tel:${cleanNum}`}
                              className="hover:underline hover:text-[#27a8c4] transition duration-300 truncate"
                              title={num}
                            >
                              {num}
                            </a>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </div>

                {/* Bottom growing glowing accent line */}
                <div className="absolute bottom-0 left-0 h-[3px] bg-gradient-to-r from-[#27a8c4] to-[#176579] w-0 group-hover:w-full transition-all duration-500 ease-out shadow-[0_0_8px_rgba(39,168,196,0.4)]" />
              </div>
            ))}
          </div>
        </div>

      </div>

      {/* Wave SVG gradients definition */}
      <svg style={{ position: "absolute", width: 0, height: 0, overflow: "hidden" }} aria-hidden="true">
        <defs>
          <linearGradient id="wave-grad-1" x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" stopColor="#27a8c4" stopOpacity="0.45" />
            <stop offset="100%" stopColor="#176579" stopOpacity="0.85" />
          </linearGradient>
          <linearGradient id="wave-grad-2" x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" stopColor="#3cd5f7" stopOpacity="0.35" />
            <stop offset="100%" stopColor="#27a8c4" stopOpacity="0.75" />
          </linearGradient>
        </defs>
      </svg>
    </section>
  );
};
