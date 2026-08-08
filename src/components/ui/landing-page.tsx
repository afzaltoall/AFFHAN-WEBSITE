"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import Globe from "@/components/ui/globe";
import { cn } from "@/lib/utils";
import { LinkPreview } from "@/components/ui/link-preview";
import {
  Eye,
  Target,
  Truck,
  Globe2,
  Users,
  Warehouse,
  FileCheck,
  Check,
  type LucideIcon,
} from "lucide-react";

type AboutSection = {
  id: string;
  badge: string;
  title: string;
  subtitle?: string;
  description: React.ReactNode | React.ReactNode[];
  align?: "left" | "center" | "right";
  stats?: { value: string; label: string }[];
  highlights?: { title: string; description: string; icon: LucideIcon }[];
  features?: { title: string; description: string; icon?: LucideIcon }[];
  actions?: { label: string; href: string; variant: "primary" | "secondary" }[];
};

const globePositions = [
  { top: 48, left: 74, scale: 1.38 },
  { top: 26, left: 50, scale: 0.92 },
  { top: 58, left: 82, scale: 1.12 },
  { top: 48, left: 50, scale: 1.75 },
];

const aboutSections: AboutSection[] = [
  {
    id: "about-affhan",
    badge: "KNOW ABOUT",
    title: "Affhan Groups",
    description: [
      <span key="p1">
        <LinkPreview
          url="/about"
          isStatic
          imageSrc="/images/affhan-team.jpg"
          className="font-bold text-[#3cd5f7] hover:underline"
        >
          Affhan group
        </LinkPreview>{" "}
        is an import and export sourcing company valued by its clients and partners in the industry for its high end professional expertise and services. It is headquartered in Guangzhou with offices in China, London, India, Singapore, Malaysia and Dubai.
      </span>,
      <span key="p2">
        As a trusted and dependable sourcing agent, we offer a holistic package of{" "}
        <LinkPreview
          url="/#sourcing-process"
          isStatic
          imageSrc="/images/affhan-services.png"
          className="font-bold text-[#3cd5f7] hover:underline"
        >
          services
        </LinkPreview>{" "}
        that includes a keen eye on the budget and cost optimization through intervention of technology for our customers and satisfaction of customer.
      </span>,
      <span key="p3">
        Affhan group commits that each crew handling the service is recruited and appropriately trained in-house. Affhan group brings you hundreds of millions of products in over 40 different categories, including consumer electronics, machinery and apparel.{" "}
        <LinkPreview
          url="/categories"
          isStatic
          imageSrc="/images/affhan-buyers.png"
          className="font-bold text-[#3cd5f7] hover:underline"
        >
          Buyers
        </LinkPreview>{" "}
        for these products are located in 190+ countries and exchange their thoughts with the suppliers on this platform each day.
      </span>
    ],
    align: "left",
    actions: [
      { label: "Explore Services", href: "/#sourcing-process", variant: "primary" },
      { label: "Contact Team", href: "/contact", variant: "secondary" },
    ],
  },
  {
    id: "footprint",
    badge: "Global Footprint",
    title: "Connected across manufacturing markets.",
    description: (
      <span>
        Affhan Group helps clients source, inspect, consolidate, ship and receive goods seamlessly.
      </span>
    ),
    align: "center",
    features: [
      {
        title: "China-based sourcing strength",
        description:
          "Factory coordination, product sampling, production follow-up and shipment preparation close to the manufacturing base.",
        icon: Globe2,
      },
      {
        title: "International client support",
        description:
          "A practical operating model for clients across India, London, Singapore, Malaysia, France, Dubai and beyond.",
        icon: Users,
      },
      {
        title: "Warehouse & storage",
        description:
          "Consolidation warehouse in Guangzhou for combining multiple orders, storage management and shipment preparation before dispatch.",
        icon: Warehouse,
      },
      {
        title: "Customs & compliance",
        description:
          "End-to-end customs documentation, regulatory compliance support and clearance coordination across import-export channels.",
        icon: FileCheck,
      },
    ],
  },
  {
    id: "expertise",
    badge: "What We Do",
    title: "From enquiry",
    subtitle: "to doorstep delivery.",
    description:
      "Our work covers the full sourcing lifecycle: product discovery, quotation, order confirmation, payment milestones, production, quality control, freight, customs coordination and final dispatch.",
    align: "left",
    highlights: [
      {
        title: "Our Company Vision",
        description:
          "To be a principal role-player in all sectors of supply chain management worldwide, to compete in the global market and emerge as the best sourcing company.",
        icon: Eye,
      },
      {
        title: "Our Company Mission",
        description:
          "Our mission is to make it easy to do business anywhere. We do this by giving suppliers the tools necessary to reach a global audience for their products, and by helping buyers find products and suppliers quickly and efficiently.",
        icon: Target,
      },
      {
        title: "Our Sourcing Services",
        description:
          "We are committed to providing complete logistic solution under one roof to our customers, through reaching-out to customers actively, and responsive approach to customer needs, competitive pricing and ultimate quality services. The company is also committed to continually provide training and growth opportunities to its employees, to make it a preferred carrier in the identified trade lanes.",
        icon: Truck,
      },
    ],
  },
  {
    id: "promise",
    badge: "Our Promise",
    title: "Professional sourcing",
    subtitle: "with visible accountability.",
    description:
      "Affhan is valued for practical expertise, transparent communication and the discipline to keep complex import-export work moving through each stage with fewer surprises.",
    align: "center",
    actions: [
      { label: "Start an Enquiry", href: "/contact", variant: "primary" },
      { label: "Explore Products", href: "/categories", variant: "secondary" },
    ],
  },
];

export default function AboutGlobePage() {
  const [activeSection, setActiveSection] = useState(0);
  const [scrollProgress, setScrollProgress] = useState(0);
  const [globeTransform, setGlobeTransform] = useState("");
  const sectionRefs = useRef<Array<HTMLElement | null>>([]);
  const animationFrameId = useRef<number | null>(null);

  const calculatedPositions = useMemo(() => globePositions, []);

  const updateScrollPosition = useCallback(() => {
    const scrollTop = window.scrollY;
    const docHeight = document.documentElement.scrollHeight - window.innerHeight;
    const progress = docHeight > 0 ? Math.min(Math.max(scrollTop / docHeight, 0), 1) : 0;
    const viewportCenter = window.innerHeight / 2;
    let nextActiveSection = 0;
    let minDistance = Infinity;

    sectionRefs.current.forEach((section, index) => {
      if (!section) return;

      const rect = section.getBoundingClientRect();
      const distance = Math.abs(rect.top + rect.height / 2 - viewportCenter);

      if (distance < minDistance) {
        minDistance = distance;
        nextActiveSection = index;
      }
    });

    const position = calculatedPositions[nextActiveSection];

    setScrollProgress(progress);
    setActiveSection(nextActiveSection);
    setGlobeTransform(
      `translate3d(${position.left}vw, ${position.top}vh, 0) translate3d(-50%, -50%, 0) scale3d(${position.scale}, ${position.scale}, 1)`,
    );
  }, [calculatedPositions]);

  useEffect(() => {
    animationFrameId.current = window.requestAnimationFrame(() => {
      updateScrollPosition();
      animationFrameId.current = null;
    });

    const handleScroll = () => {
      if (animationFrameId.current !== null) return;

      animationFrameId.current = window.requestAnimationFrame(() => {
        updateScrollPosition();
        animationFrameId.current = null;
      });
    };

    window.addEventListener("scroll", handleScroll, { passive: true });

    return () => {
      window.removeEventListener("scroll", handleScroll);
      if (animationFrameId.current !== null) {
        window.cancelAnimationFrame(animationFrameId.current);
      }
    };
  }, [updateScrollPosition]);

  return (
    <main className="relative min-h-screen overflow-x-hidden bg-[#081f2a] text-white">
      <style dangerouslySetInnerHTML={{ __html: `
        .about-glass-card {
          background: linear-gradient(135deg, rgba(255, 255, 255, 0.07) 0%, rgba(39, 168, 196, 0.06) 100%) !important;
          backdrop-filter: blur(20px) !important;
          border-top: 1.5px solid rgba(255, 255, 255, 0.15) !important;
          border-left: 1.5px solid rgba(255, 255, 255, 0.15) !important;
          border-bottom: 1.5px solid rgba(255, 255, 255, 0.05) !important;
          border-right: 1.5px solid rgba(255, 255, 255, 0.05) !important;
          box-shadow:
            inset 0 2px 6px rgba(255, 255, 255, 0.06),
            inset 0 -2px 6px rgba(0, 0, 0, 0.08),
            0 8px 24px rgba(0, 0, 0, 0.15) !important;
          transition: all 0.4s cubic-bezier(0.16, 1, 0.3, 1) !important;
          will-change: transform, box-shadow;
        }
        @media (max-width: 1023px) {
          .about-glass-card {
            backdrop-filter: none !important;
            -webkit-backdrop-filter: none !important;
            background: linear-gradient(135deg, rgba(16, 38, 51, 0.95) 0%, rgba(8, 31, 42, 0.95) 100%) !important;
          }
        }
        .about-glass-card:hover {
          background: linear-gradient(135deg, rgba(255, 255, 255, 0.1) 0%, rgba(39, 168, 196, 0.08) 100%) !important;
          border-top-color: rgba(255, 255, 255, 0.22) !important;
          border-left-color: rgba(255, 255, 255, 0.22) !important;
          border-bottom-color: rgba(255, 255, 255, 0.08) !important;
          border-right-color: rgba(255, 255, 255, 0.08) !important;
          box-shadow:
            inset 0 4px 10px rgba(255, 255, 255, 0.08),
            inset 0 -4px 10px rgba(0, 0, 0, 0.1),
            0 16px 36px rgba(39, 168, 196, 0.12),
            0 2px 6px rgba(0, 0, 0, 0.06) !important;
          transform: translateY(-4px) !important;
        }
        .about-glass-sheen {
          position: absolute;
          inset: 0;
          pointer-events: none;
          background: linear-gradient(135deg, rgba(255,255,255,0) 0%, rgba(255,255,255,0.08) 50%, rgba(255,255,255,0) 100%);
          transform: translateX(-100%);
          transition: transform 0.6s ease;
          z-index: 20;
          border-radius: inherit;
        }
        .about-glass-card:hover .about-glass-sheen {
          transform: translateX(100%);
        }
      `}} />
      <div className="fixed left-0 top-0 z-50 h-0.5 w-full bg-white/10">
        <div
          className="h-full origin-left bg-[#27a8c4] shadow-[0_0_16px_rgba(39,168,196,0.55)]"
          style={{ transform: `scaleX(${scrollProgress})` }}
        />
      </div>

      <div className="fixed right-4 top-1/2 z-40 hidden -translate-y-1/2 sm:block lg:right-8">
        <div className="relative grid gap-5">
          <div className="absolute left-1/2 top-0 h-full w-px -translate-x-1/2 bg-gradient-to-b from-transparent via-white/25 to-transparent" />
          {aboutSections.map((section, index) => (
            <div key={section.id} className="group relative flex items-center justify-end">
              {/* Tooltip Label */}
              <span className="absolute right-6 top-1/2 -translate-y-1/2 translate-x-2 scale-90 opacity-0 group-hover:translate-x-0 group-hover:scale-100 group-hover:opacity-100 transition-all duration-300 text-[9px] font-extrabold uppercase tracking-[0.15em] text-[#8ed8e8] bg-[#05161f]/90 border border-white/10 px-2.5 py-1 rounded-md backdrop-blur-md whitespace-nowrap pointer-events-none shadow-md">
                {section.badge}
              </span>
              
              <button
                aria-label={`Go to ${section.badge}`}
                className={cn(
                  "relative h-3 w-3 rounded-full border-2 transition duration-300 hover:scale-125 cursor-pointer z-10",
                  activeSection === index
                    ? "border-[#27a8c4] bg-[#27a8c4] shadow-[0_0_20px_rgba(39,168,196,0.75)]"
                    : "border-white/45 bg-[#081f2a] hover:border-white",
                )}
                type="button"
                onClick={() =>
                  sectionRefs.current[index]?.scrollIntoView({
                    behavior: "smooth",
                    block: "center",
                  })
                }
              />
            </div>
          ))}
        </div>
      </div>

      <div
        className="pointer-events-none fixed z-10 hidden transition-all duration-[1400ms] ease-[cubic-bezier(0.23,1,0.32,1)] sm:block"
        style={{
          filter: activeSection === 3 ? "opacity(0.4)" : "opacity(0.82)",
          transform: globeTransform,
          willChange: "transform",
        }}
      >
        <div className="scale-75 lg:scale-100">
          <Globe />
        </div>
      </div>

      <div className="absolute inset-0 z-0 bg-[radial-gradient(circle_at_25%_20%,rgba(39,168,196,0.18),transparent_30%),radial-gradient(circle_at_80%_70%,rgba(255,255,255,0.08),transparent_28%)]" />

      {aboutSections.map((section, index) => (
        <section
          key={section.id}
          ref={(element) => {
            sectionRefs.current[index] = element;
          }}
          className={cn(
            "relative z-20 flex min-h-screen w-full flex-col px-5 py-24 sm:px-8 lg:px-14",
            section.align === "center" && "items-center text-center",
            section.align === "right" && "items-end text-right",
            (!section.align || section.align === "left") && "items-start text-left",
          )}
        >
          <div className="w-full max-w-5xl my-auto">
            <span className="text-xs font-semibold uppercase tracking-[0.26em] text-[#8ed8e8]">
              {section.badge}
            </span>
            <h1
              className={cn(
                "mt-5 font-bold tracking-tight leading-[1.02] text-white",
                index === 0 && "max-w-4xl text-3xl sm:text-6xl lg:text-7xl",
                index === 1 &&
                  "w-full max-w-full text-center text-3xl sm:whitespace-nowrap sm:text-[clamp(2rem,2.8vw,3.25rem)]",
                index > 1 && "max-w-4xl text-3xl sm:text-4xl lg:text-5xl",
                section.align === "center" && "mx-auto",
              )}
            >
              <span className="block">{section.title}</span>
              {section.subtitle && (
                <span className="block text-white/72">{section.subtitle}</span>
              )}
            </h1>

            {/* Short horizontal accent line below the heading */}
            <div
              className={cn(
                "mt-4 h-[3.5px] w-14 bg-[#27a8c4] rounded-full",
                section.align === "center" && "mx-auto",
                section.align === "right" && "ml-auto",
              )}
            />



            {Array.isArray(section.description) ? (
              <div className="mt-8 flex flex-col gap-6">
                {(section.description as React.ReactNode[]).map((para, pIdx) => (
                  <div
                    key={pIdx}
                    className={cn(
                      "max-w-3xl text-sm leading-[1.8] text-slate-300 sm:text-base sm:leading-[1.8]",
                      section.align === "center" && "mx-auto text-center",
                      section.align === "right" && "ml-auto text-right",
                    )}
                  >
                    {para}
                  </div>
                ))}
              </div>
            ) : (
              <div
                className={cn(
                  "mt-7 text-base leading-7 text-white/72 sm:text-lg sm:leading-8",
                  section.id === "footprint" ? "max-w-5xl" : "max-w-2xl",
                  section.align === "center" && "mx-auto text-center",
                  section.align === "right" && "ml-auto text-right",
                )}
              >
                {section.description}
              </div>
            )}

            {section.stats && (
              <div
                className={cn(
                  "mt-10 grid w-full max-w-4xl gap-3 sm:grid-cols-2 lg:grid-cols-4",
                  section.align === "center" && "mx-auto",
                )}
              >
                {section.stats.map((stat, sIdx) => (
                  <div
                    key={stat.label}
                    className="group flex flex-col items-center rounded-xl border border-white/10 bg-white/[0.05] px-4 py-5 backdrop-blur-sm transition-all duration-300 hover:-translate-y-1 hover:border-[#27a8c4]/40 hover:bg-white/[0.08] hover:shadow-[0_12px_32px_rgba(39,168,196,0.12)]"
                    style={{ animationDelay: `${sIdx * 80}ms` }}
                  >
                    <span className="text-3xl font-extrabold tracking-tight text-[#3cd5f7] sm:text-4xl">
                      {stat.value}
                    </span>
                    <span className="mt-1.5 text-[10px] font-bold uppercase tracking-[0.18em] text-white/55 group-hover:text-white/75 transition-colors duration-300">
                      {stat.label}
                    </span>
                  </div>
                ))}
              </div>
            )}

            {section.highlights && (
              <div className="mt-10 flex w-full max-w-4xl flex-col gap-4">
                {section.highlights.map((highlight, hIdx) => {
                  const IconComponent = highlight.icon;
                  return (
                    <article
                      key={highlight.title}
                      className="group relative w-full overflow-hidden rounded-xl about-glass-card"
                      style={{ animationDelay: `${hIdx * 120}ms` }}
                    >
                      <div className="about-glass-sheen" />
                      {/* Teal Header Bar */}
                      <div className="flex items-center gap-3 bg-[#1a4a5a] px-5 py-3.5 sm:px-6">
                        <span className="flex h-8 w-8 items-center justify-center rounded-full bg-white/15 text-white/80 transition-all duration-300 group-hover:bg-[#27a8c4]/25 group-hover:text-[#3cd5f7]">
                          <IconComponent className="h-4 w-4" />
                        </span>
                        <h3 className="text-sm font-bold tracking-wide text-white sm:text-base">
                          {highlight.title}
                        </h3>
                      </div>
                      {/* Body */}
                      <div className="px-5 py-4 sm:px-6 sm:py-5">
                        <p className="text-sm leading-7 text-slate-300 sm:text-[15px]">
                          {highlight.description}
                        </p>
                      </div>
                    </article>
                  );
                })}
              </div>
            )}

            {section.features && (
              <div
                className={cn(
                  "mt-8 grid max-w-4xl gap-4",
                  section.features.length === 4
                    ? "sm:grid-cols-2"
                    : "sm:grid-cols-2 lg:grid-cols-3",
                  section.align === "center" && "mx-auto",
                )}
              >
                {section.features.map((feature, fIdx) => {
                  const FeatureIcon = feature.icon;
                  return (
                    <article
                      key={feature.title}
                      className="group relative overflow-hidden rounded-xl p-5 text-left about-glass-card"
                      style={{ animationDelay: `${fIdx * 100}ms` }}
                    >
                      <div className="about-glass-sheen" />
                      {FeatureIcon ? (
                        <div className="mb-4 flex h-10 w-10 items-center justify-center rounded-full border border-[#27a8c4]/30 bg-[#27a8c4]/15 text-[#27a8c4] transition-all duration-300 group-hover:scale-110 group-hover:rotate-6">
                          <FeatureIcon className="h-5 w-5" />
                        </div>
                      ) : (
                        <div className="mb-4 h-1.5 w-8 rounded-full bg-[#27a8c4]" />
                      )}
                      <h2 className="text-base font-semibold text-white">
                        {feature.title}
                      </h2>
                      <p className="mt-3 text-sm leading-6 text-white/66">
                        {feature.description}
                      </p>
                    </article>
                  );
                })}
              </div>
            )}

            {section.id === "footprint" && (
              <div className="mx-auto mt-6 w-full max-w-4xl relative overflow-hidden rounded-xl p-6 text-left sm:p-8 about-glass-card">
                <div className="about-glass-sheen" />
                <h3 className="text-lg font-bold tracking-tight text-[#3cd5f7] sm:text-xl">
                  Why Choose Affhan Group?
                </h3>
                <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                  {[
                    "Global network across 6 countries",
                    "40+ product categories expertise",
                    "100+ countries market reach",
                    "24/7 customer support",
                    "Cost-effective solutions",
                    "Quality assurance guarantee",
                  ].map((item, idx) => (
                    <div
                      key={idx}
                      className="flex items-center gap-2.5 text-xs font-medium text-slate-300 sm:text-sm"
                    >
                      <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-emerald-500/10 text-emerald-400">
                        <Check className="h-3 w-3" />
                      </span>
                      <span>{item}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {section.actions && (
              <div
                className={cn(
                  "mt-10 flex flex-col gap-3 sm:flex-row",
                  section.align === "center" && "justify-center",
                  section.align === "right" && "justify-end",
                )}
              >
                {section.actions.map((action) => (
                  <Link
                    key={action.label}
                    className={cn(
                      "inline-flex h-12 items-center justify-center rounded-md px-6 text-sm font-semibold transition-all duration-300 hover:-translate-y-0.5",
                      action.variant === "primary"
                        ? "bg-[#27a8c4] text-[#06202b] shadow-[0_12px_36px_rgba(39,168,196,0.25)] hover:bg-white hover:shadow-[0_16px_44px_rgba(39,168,196,0.4)] hover:text-[#06202b]"
                        : "border border-white/20 bg-white/5 text-white hover:border-white/50 hover:bg-white/10",
                    )}
                    href={action.href}
                    prefetch={false}
                  >
                    {action.label}
                  </Link>
                ))}
              </div>
            )}
          </div>
        </section>
      ))}
    </main>
  );
}
