"use client";

import { FooterSection } from "@/components/sections/FooterSection";
import { CareersVideoHero } from "@/components/ui/careers-video-hero";
import { PrismaHero } from "../../components/ui/prisma-hero";
import { PrismaRoles } from "../../components/ui/prisma-roles";
import { AsmeSections } from "../../components/ui/asme-sections";
import { GrowthFlow } from "@/components/ui/growth-flow";
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

export default function CareersPage() {
  // (careers page: horizon hero → why → teams wall → roles → parallax → footer)

  return (
    <div className="bg-white text-slate-900">
      <CareersVideoHero />

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

        {/* NEW Prisma Cinematic Roles Showcase */}
        <div id="open-roles-grid" className="w-full">
          <PrismaHero />
          <PrismaRoles />
        </div>

        {/* Cinematic 4-part Asme Sections */}
        <AsmeSections />
      </div>

      {/* Scroll-scrubbed growth flow chart ("Global Reach" → Affhan's
          expansion story). Owns the page's Lenis smooth-scroll and flows
          straight into the dark footer for a seamless finish. */}
      <div className="relative z-10">
        <GrowthFlow />
      </div>

      <div className="relative z-10">
        <FooterSection />
      </div>
    </div>
  );
}
