"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { FooterSection } from "@/components/sections/FooterSection";
import { Component as HorizonHero } from "@/components/ui/horizon-hero-section";
import { ParallaxComponent } from "@/components/ui/parallax-scrolling";
import { ScrollPortraitWall, type Speaker } from "@/components/ui/scroll-portrait-wall";

const TEAMS: Speaker[] = [
  { name: "MOHAMED YACOOB", role: "COO", hoverRole: "Chief Operation Officer", src: "/our teams/MOHAMED YACOOB.png", imageClassName: "object-[center_20%]" },
  { name: "JAMIL AHAMED", role: "CMO", hoverRole: "Chief Marketing Officer", src: "/our teams/jamil.png", imageClassName: "object-top" },
  { name: "ILLIYAZ", role: "CFO", hoverRole: "Chief Financial Officer", src: "/our teams/iliyas.png", imageClassName: "object-[center_20%]" },
  { name: "JAFEER AHAMED", role: "CTO", hoverRole: "Chief Technology Officer", src: "/our teams/Jafeer.png", imageClassName: "object-[center_20%]" },
  { name: "NANDHINEE", role: "Managing UAE OPERATION", hideHoverRole: true, src: "/our teams/nandhinee.png", imageClassName: "object-top" },
  { name: "", role: "", src: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=" },
  { name: "ANIS DAWOOD", role: "Managing UK OPERATIONS", hideHoverRole: true, src: "/our teams/anis.png", imageClassName: "object-top" },
  { name: "MUHAMMAD KASSIM", role: "MANAGING MALAYSIA OPERATIONS", hideHoverRole: true, src: "/our teams/muhammad kassim.png", imageClassName: "object-top" },
  { name: "CHEN YUCHAO", role: "CUSTOMER EXPERIENCE MANAGER", hideHoverRole: true, src: "/our teams/Chen Yuchao.png" },
];

const ROLES = [
  { title: "Sourcing Specialist", location: "Guangzhou / Chennai", type: "Full-time" },
  { title: "Quality Control Inspector", location: "Guangzhou", type: "Full-time" },
  { title: "Logistics & Freight Coordinator", location: "Chennai / Dubai", type: "Full-time" },
  { title: "B2B Account Manager", location: "London / Singapore", type: "Full-time" },
];

/** Renders the WebGL hero on desktop only; phones get a fast static hero. */
function useIsDesktop() {
  const [desktop, setDesktop] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(min-width: 768px)");
    const on = () => setDesktop(mq.matches);
    on();
    mq.addEventListener("change", on);
    return () => mq.removeEventListener("change", on);
  }, []);
  return desktop;
}

export default function CareersPage() {
  const isDesktop = useIsDesktop();
  // (careers page: horizon hero → why → teams wall → roles → parallax → footer)

  return (
    <div className="bg-white text-slate-900">
      {isDesktop ? (
        <HorizonHero />
      ) : (
        <section className="relative flex min-h-[92vh] flex-col items-center justify-center overflow-hidden px-6 text-center">
          <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_50%_35%,rgba(39,168,196,0.15),transparent_60%)]" />
          <div className="pointer-events-none absolute -top-24 left-1/2 h-72 w-72 -translate-x-1/2 rounded-full bg-brand/15 blur-[110px]" />
          <div className="relative z-10">
            <h1 className="text-4xl font-black leading-[0.95] tracking-tight">Build the future</h1>
            <p className="mt-4 text-slate-600">
              Careers at Affhan International —<br />source the world, from anywhere.
            </p>
          </div>
        </section>
      )}

      {/* Career content — one opaque layer over the fixed WebGL canvas so the
          hero scene can never bleed through behind these sections. */}
      <div className="relative z-10 bg-white">
        <section className="px-4 sm:px-6 lg:px-8 pt-20 sm:pt-28 pb-24 sm:pb-32">
          <div className="mx-auto max-w-[1200px] text-center">
            <span className="text-xs font-bold uppercase tracking-[0.25em] text-brand">Why Affhan</span>
            <h2 className="mt-3 text-3xl sm:text-4xl font-black tracking-tight">A career without borders</h2>
            <p className="mx-auto mt-3 max-w-2xl text-slate-600">
              We source anything, anywhere — and we&apos;re always looking for people who love solving global trade problems.
            </p>
          </div>
        </section>

        {/* Teams portrait wall — scroll-scrubbed grid, full width (no max-w wrapper) */}
        <ScrollPortraitWall
          title="Our Teams"
          date=""
          hint="scroll to meet the teams"
          speakers={TEAMS}
          columns={4}
        />

        <section className="px-4 sm:px-6 lg:px-8 pb-20 sm:pb-28">
          <div className="mx-auto max-w-[1200px]">
            {/* Open roles */}
            <div>
              <div className="flex items-end justify-between gap-4">
                <div>
                  <span className="text-xs font-bold uppercase tracking-[0.25em] text-brand">Open Positions</span>
                  <h2 className="mt-3 text-3xl sm:text-4xl font-black tracking-tight">Roles we&apos;re hiring for</h2>
                </div>
              </div>
              <div className="mt-8 divide-y divide-slate-200 overflow-hidden rounded-2xl border border-slate-200">
                {ROLES.map((r) => (
                  <Link
                    key={r.title}
                    href="/contact"
                    className="group flex flex-col gap-2 bg-slate-50 px-6 py-5 transition-colors hover:bg-slate-100 sm:flex-row sm:items-center sm:justify-between"
                  >
                    <div>
                      <h3 className="text-lg font-bold group-hover:text-brand transition-colors">{r.title}</h3>
                      <p className="text-sm text-slate-500">{r.location}</p>
                    </div>
                    <div className="flex items-center gap-4">
                      <span className="rounded-full border border-slate-300 px-3 py-1 text-xs font-semibold text-slate-600">{r.type}</span>
                      <ArrowRight className="h-5 w-5 text-slate-400 transition-transform group-hover:translate-x-1 group-hover:text-brand" />
                    </div>
                  </Link>
                ))}
              </div>
            </div>

            {/* CTA */}
            <div className="mt-16 rounded-3xl border border-brand/20 bg-gradient-to-br from-brand/10 to-transparent p-8 text-center sm:p-12">
              <h2 className="text-2xl sm:text-3xl font-black tracking-tight">Don&apos;t see your role?</h2>
              <p className="mx-auto mt-3 max-w-xl text-slate-600">
                We&apos;re always keen to meet talented people. Send us your resume and tell us how you&apos;d help Affhan source the world.
              </p>
              <Link
                href="/contact"
                className="mt-7 inline-flex items-center gap-2 rounded-full bg-brand px-7 py-3 font-bold text-white transition-transform hover:scale-105"
              >
                Get in touch <ArrowRight className="h-4 w-4" />
              </Link>
            </div>
          </div>
        </section>
      </div>

      {/* Layered parallax hero (Lenis smooth-scroll) flows straight into the
          footer — no gap — for a seamless dark finish. */}
      <div className="relative z-10">
        <ParallaxComponent />
      </div>

      <div className="relative z-10">
        <FooterSection />
      </div>
    </div>
  );
}
