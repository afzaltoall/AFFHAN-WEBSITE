"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { ElementType, MouseEvent } from "react";
import Image from "next/image";
import { X, Check } from "lucide-react";
import { motion } from "framer-motion";

export interface TimelineItem {
  id: number;
  title: string;
  date: string;
  content: string;
  category: string;
  icon: ElementType;
  relatedIds: number[];
  status: "completed" | "in-progress" | "pending";
}

interface RadialOrbitalTimelineProps {
  timelineData: TimelineItem[];
  /** Per-step deliverables shown in the right-hand guide panel. */
  checklists: Record<number, { title: string; items: string[] }>;
}

const ORBIT_RADIUS = 210;
const DEGREES_PER_SECOND = 6;
const SHUFFLE_MS = 620;
const STAGGER_MS = 45;

export default function RadialOrbitalTimeline({
  timelineData,
  checklists,
}: RadialOrbitalTimelineProps) {
  const [rotationAngle, setRotationAngle] = useState(0);
  const [isHovered, setIsHovered] = useState(false);
  const [pulseEffect, setPulseEffect] = useState<Record<number, boolean>>({});
  const [activeNodeId, setActiveNodeId] = useState<number | null>(null);
  const [windowWidth, setWindowWidth] = useState(1024);
  const [mounted, setMounted] = useState(false);
  const [animatedPercent, setAnimatedPercent] = useState(0);
  // Rotation only runs while the section is actually on screen. Without this
  // the orbit keeps spinning — and re-rendering — for the whole life of the
  // page, including while the visitor is metres further down reading the FAQ.
  const [inView, setInView] = useState(false);
  const [reducedMotion, setReducedMotion] = useState(false);
  // True only for the length of a click-driven reshuffle — see spinTo.
  const [shuffling, setShuffling] = useState(false);

  const containerRef = useRef<HTMLDivElement>(null);
  const orbitRef = useRef<HTMLDivElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  // Height actually available to the wheel, measured rather than assumed.
  const [stageHeight, setStageHeight] = useState(0);
  // Mirrors rotationAngle so a click can read the live value without capturing
  // a stale one from its closure.
  const angleRef = useRef(0);
  const shuffleTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    setMounted(true);
    setWindowWidth(window.innerWidth);
    const onResize = () => setWindowWidth(window.innerWidth);
    window.addEventListener("resize", onResize);

    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    setReducedMotion(mq.matches);
    const onMq = (e: MediaQueryListEvent) => setReducedMotion(e.matches);
    mq.addEventListener("change", onMq);

    return () => {
      window.removeEventListener("resize", onResize);
      mq.removeEventListener("change", onMq);
    };
  }, []);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      (entries) => setInView(entries[0].isIntersecting),
      { threshold: 0.1 }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const el = stageRef.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => setStageHeight(entry.contentRect.height));
    ro.observe(el);
    setStageHeight(el.getBoundingClientRect().height);
    return () => ro.disconnect();
  }, []);

  // requestAnimationFrame rather than setInterval: the browser pauses rAF on a
  // hidden tab for free, and driving the angle from elapsed time keeps the
  // speed identical regardless of frame rate.
  //
  // State is committed at ~20fps, not every frame. Each update re-renders nine
  // nodes, and at 6°/sec the motion is slow enough that 60fps would triple the
  // React work for no visible gain. Combined with the in-view gate this is the
  // real fix: the original spun a 50ms interval for the entire life of the
  // page, including while the visitor was far below reading the FAQ.
  const autoRotate = !activeNodeId && !isHovered && inView && !reducedMotion;
  useEffect(() => {
    if (!autoRotate) return;
    let raf = 0;
    let last = performance.now();
    let sinceCommit = 0;
    const frame = (now: number) => {
      const dt = (now - last) / 1000;
      last = now;
      sinceCommit += dt;
      if (sinceCommit >= 0.05) {
        const advance = DEGREES_PER_SECOND * sinceCommit;
        sinceCommit = 0;
        // Through angleRef so a later click tween starts from where the wheel
        // actually is, not from a stale angle.
        angleRef.current = (angleRef.current + advance) % 360;
        setRotationAngle(angleRef.current);
      }
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, [autoRotate]);

  const handleContainerClick = (event: MouseEvent<HTMLDivElement>) => {
    if (event.target === containerRef.current || event.target === orbitRef.current) {
      setActiveNodeId(null);
      setPulseEffect({});
    }
  };

  const getRelatedItems = useCallback(
    (itemId: number) => timelineData.find((i) => i.id === itemId)?.relatedIds ?? [],
    [timelineData]
  );

  const setAngle = useCallback((deg: number) => {
    angleRef.current = deg;
    setRotationAngle(deg);
  }, []);

  // Moves the nodes to their new places WITHOUT rolling the wheel round.
  //
  // Tweening the shared angle would carry every node along the same arc — the
  // whole ring visibly turning. Instead the angle is set in one go and the
  // nodes are given a CSS transition on `transform`, which interpolates the
  // translate linearly: each node cuts straight across to its new seat rather
  // than orbiting to it. A per-node delay staggers the arrivals so it reads as
  // a reshuffle rather than nine things moving in lockstep.
  //
  // The transition is only live while `shuffling` is set. Left on permanently
  // it would also apply to every auto-rotation tick, leaving the nodes
  // perpetually chasing an angle that keeps moving.
  const spinTo = useCallback((target: number) => {
    if (shuffleTimer.current) clearTimeout(shuffleTimer.current);
    if (reducedMotion) { setAngle(target); return; }
    setShuffling(true);
    setAngle(target);
    shuffleTimer.current = setTimeout(() => setShuffling(false), SHUFFLE_MS + timelineData.length * STAGGER_MS);
  }, [reducedMotion, setAngle, timelineData.length]);

  useEffect(() => () => { if (shuffleTimer.current) clearTimeout(shuffleTimer.current); }, []);

  const toggleItem = (id: number) => {
    if (activeNodeId === id) {
      setActiveNodeId(null);
      setPulseEffect({});
      return;
    }
    setActiveNodeId(id);

    const next: Record<number, boolean> = {};
    getRelatedItems(id).forEach((relId) => { next[relId] = true; });
    setPulseEffect(next);

    // Bring the clicked node to the top of the circle.
    const index = timelineData.findIndex((i) => i.id === id);
    if (index !== -1) spinTo((270 - (index / timelineData.length) * 360 + 360) % 360);
  };

  const calculateNodePosition = (index: number, total: number) => {
    const angle = ((index / total) * 360 + rotationAngle) % 360;
    const radian = (angle * Math.PI) / 180;
    return {
      x: Number((ORBIT_RADIUS * Math.cos(radian)).toFixed(3)),
      y: Number((ORBIT_RADIUS * Math.sin(radian)).toFixed(3)),
      zIndex: Math.round(100 + 50 * Math.cos(radian)),
    };
  };

  const isRelatedToActive = (itemId: number) =>
    activeNodeId ? getRelatedItems(activeNodeId).includes(itemId) : false;

  const getStatusStyles = (status: TimelineItem["status"]) => {
    switch (status) {
      case "completed":
        return "border-[#1f5369] bg-[#1f5369] text-white";
      case "in-progress":
        return "border-[#27a8c4] bg-[#e9f8fb] text-[#176579]";
      default:
        return "border-slate-300 bg-slate-100 text-slate-600";
    }
  };

  const getNodeStyles = (item: TimelineItem, isExpanded: boolean, isRelated: boolean) => {
    if (isExpanded) {
      return "bg-[#1f5369] border-[#1f5369] text-white shadow-lg shadow-[#1f5369]/25 scale-125 ring-4 ring-[#27a8c4]/45";
    }
    const base = "bg-white text-[#16475c] transition-all duration-300";
    switch (item.status) {
      case "completed":
        return `${base} border-[#27a8c4] shadow-[0_0_15px_rgba(39,168,196,0.3)] hover:scale-110 ${isRelated ? "ring-4 ring-white/50" : ""}`;
      case "in-progress":
        return `${base} border-[#27a8c4] shadow-[0_0_20px_rgba(39,168,196,0.5)] hover:scale-110 ${isRelated ? "ring-4 ring-[#27a8c4]/30" : ""}`;
      default:
        return `${base} border-slate-300 shadow-[0_0_12px_rgba(255,255,255,0.15)] hover:scale-105 ${isRelated ? "ring-4 ring-white/20" : ""}`;
    }
  };

  const totalSteps = timelineData.length;
  const activeItem = activeNodeId !== null ? timelineData.find((i) => i.id === activeNodeId) ?? null : null;

  // Only ever a "where am I in the walkthrough" readout. It deliberately does
  // NOT show a completed-steps figure when nothing is selected: a visitor has
  // not ordered anything, so "3 of 9 Steps Done / 33%" read as a progress
  // tracker for an order they do not have.
  const displayPercentage = activeItem ? Math.round((activeItem.id / totalSteps) * 100) : 0;

  const getPhase = (id: number): 1 | 2 | 3 => (id <= 2 ? 1 : id <= 6 ? 2 : 3);
  const activePhase = activeItem ? getPhase(activeItem.id) : null;

  useEffect(() => {
    if (!mounted) return;
    if (reducedMotion) { setAnimatedPercent(displayPercentage); return; }
    let start: number | null = null;
    const from = animatedPercent;
    const to = displayPercentage;
    let raf = 0;
    const step = (ts: number) => {
      if (start === null) start = ts;
      const t = Math.min((ts - start) / 800, 1);
      const eased = t * (2 - t);
      setAnimatedPercent(Math.round(from + eased * (to - from)));
      if (t < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [displayPercentage, mounted, reducedMotion]);

  // The wheel's natural footprint: the orbit diameter plus a node radius and
  // the step label that hangs below each one.
  const NATURAL_SIZE = (ORBIT_RADIUS + 20 + 52) * 2;
  const widthScale = windowWidth < 400 ? 0.58 : windowWidth < 640 ? 0.68 : windowWidth < 1024 ? 0.88 : 1;
  // Scaled to whichever axis is tighter. Width alone was not enough — on a
  // laptop the section is short rather than narrow, and the bottom nodes were
  // being cut off below the fold.
  const heightScale = stageHeight > 0 ? stageHeight / NATURAL_SIZE : 1;
  const scale = Math.min(widthScale, heightScale, 1);
  const shownPercent = mounted ? animatedPercent : displayPercentage;

  return (
    <div
      // Definite height on the desktop orbit rather than h-full. The orbit is
      // absolutely positioned inside it, so it contributes no height of its
      // own; h-full only worked while an ancestor had a fixed height (the
      // original pinned the section to h-screen). Under a min-height parent it
      // resolves to zero and the whole wheel disappears.
      className="flex h-auto w-full flex-col items-center justify-center lg:h-full lg:overflow-hidden bg-transparent"
      ref={containerRef}
      onClick={handleContainerClick}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      <style>{`
        @keyframes orbitFlow { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
        @keyframes timelineFadeIn {
          from { opacity: 0; transform: scale(0.96) translate3d(0, 4px, 0); }
          to { opacity: 1; transform: scale(1) translate3d(0, 0, 0); }
        }
        @media (prefers-reduced-motion: reduce) {
          .orbit-flow-path { animation: none !important; }
        }
      `}</style>

      {/* Desktop circular orbit */}
      <div ref={stageRef} className="relative hidden lg:flex h-full w-full max-w-[1440px] px-8 items-center justify-center">
        {/* Left panel — stage readout */}
        <div className="hidden xl:flex absolute left-8 top-1/2 -translate-y-1/2 w-[285px] flex-col gap-5 rounded-2xl border border-white/15 bg-white/5 p-6 backdrop-blur-md text-white select-none shadow-[0_8px_32px_rgba(0,0,0,0.12)]">
          <div className="flex flex-col gap-1">
            <span className="text-[10px] font-bold uppercase tracking-[0.2em] text-[#3cd5f7]">Affhan Sourcing</span>
            <h3 className="text-base font-extrabold tracking-tight text-white">Workflow Summary</h3>
          </div>

          <div className="h-px bg-white/10 w-full" />

          <div className="flex items-center gap-4">
            <div className="relative flex h-14 w-14 items-center justify-center rounded-full bg-white/5 ring-1 ring-white/10">
              <svg className="absolute inset-0 h-full w-full -rotate-90" viewBox="0 0 56 56" aria-hidden="true">
                <circle cx="28" cy="28" r="24" fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth="3.5" />
                <circle
                  cx="28" cy="28" r="24" fill="none" stroke="#27a8c4" strokeWidth="3.5"
                  strokeDasharray="150.8"
                  strokeDashoffset={150.8 - (150.8 * shownPercent) / 100}
                  strokeLinecap="round"
                  className="transition-all duration-700 ease-out"
                  style={{ filter: "drop-shadow(0 0 4px rgba(39,168,196,0.6))" }}
                />
              </svg>
              <span className="relative z-10 text-[11px] font-bold font-mono text-[#e9f8fb]">{shownPercent}%</span>
            </div>
            <div className="flex flex-col min-w-0">
              <span className={`text-[10px] uppercase tracking-wider font-extrabold ${activeItem ? "text-[#3cd5f7]" : "text-white/75"}`}>
                {activeItem ? "Selected Stage" : "Nine Stages"}
              </span>
              <span className="text-xs font-bold text-white truncate max-w-[170px]">
                {activeItem
                  ? `Step 0${activeItem.id} of 0${totalSteps} (${activeItem.title})`
                  : "Enquiry to doorstep delivery"}
              </span>
            </div>
          </div>

          <div className="h-px bg-white/10 w-full" />

          <div className="flex flex-col gap-2 pt-1">
            <span className="text-[10px] text-white/75 uppercase tracking-wider font-extrabold">Sourcing Stage Tracks</span>
            <div className="flex flex-col gap-2">
              {([
                [1, "1. Discovery & Pricing", "Steps 01 - 02 (Enquiry & Quotation)"],
                [2, "2. Design & Production", "Steps 03 - 06 (Design, QC, Production)"],
                [3, "3. Logistics & Handover", "Steps 07 - 09 (Balance, Booking, Delivery)"],
              ] as const).map(([phase, title, sub]) => (
                <div
                  key={phase}
                  className={`flex items-center gap-2.5 rounded-lg p-2.5 border transition-all duration-300 ${
                    activePhase === phase
                      ? "bg-[#27a8c4]/20 border-[#27a8c4]/50 shadow-[0_0_12px_rgba(39,168,196,0.2)]"
                      : "bg-white/[0.03] border-white/5"
                  }`}
                >
                  <span className={`h-2 w-2 rounded-full ${activePhase === phase ? "bg-[#3cd5f7]" : "bg-white/40"}`} />
                  <div className="flex flex-col">
                    <span className={`text-[11px] font-bold leading-none ${activePhase === phase ? "text-white" : "text-slate-100"}`}>{title}</span>
                    <span className={`text-[10px] mt-1 font-medium ${activePhase === phase ? "text-[#3cd5f7]" : "text-slate-300"}`}>{sub}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Orbit */}
        <div
          // inset-0 rather than bare `absolute`. With auto insets the box falls
          // back to its static position, which inside a flex parent depends on
          // the align/justify resolution — fragile, and it collapsed here.
          // Pinning to the containing block makes the geometry explicit.
          className="absolute inset-0 flex items-center justify-center pointer-events-none"
          ref={orbitRef}
          style={{ perspective: "1000px", transform: `scale(${scale})` }}
        >
          <div className="relative flex h-full w-full items-center justify-center pointer-events-auto">
            <div
              onClick={(e) => e.stopPropagation()}
              className={`absolute z-10 flex flex-col items-center justify-center rounded-full bg-white shadow-[0_22px_80px_rgba(8,47,73,0.34)] transition-all duration-500 ease-[cubic-bezier(0.22,1,0.36,1)] ${
                activeItem ? "h-60 w-60 sm:h-68 sm:w-68 p-6 border-2 border-[#27a8c4]/45" : "h-36 w-36 border border-white/70"
              }`}
            >
              <div className={`absolute rounded-full border border-white/35 transition-all duration-500 ${activeItem ? "h-[290px] w-[290px] opacity-40" : "h-48 w-48 affhan-logo-orbit"}`} />
              <div className={`absolute rounded-full border border-[#27a8c4]/55 transition-all duration-500 ${activeItem ? "h-[280px] w-[280px] opacity-20" : "h-44 w-44 affhan-logo-pulse"}`} />
              <div className="absolute inset-0 rounded-full bg-[radial-gradient(circle,rgba(39,168,196,0.2)_0%,rgba(39,168,196,0)_68%)] pointer-events-none" />

              <div className={`relative flex items-center justify-center transition-all duration-500 ${activeItem ? "opacity-0 scale-75 pointer-events-none h-0 w-0 overflow-hidden" : "opacity-100 scale-100 h-full w-full"}`}>
                <Image alt="AFFHAN" className="relative z-10 h-28 w-28 object-contain" height={112} width={112} src="/images/logo.png" />
              </div>

              {activeItem && (
                <div
                  className="relative z-20 flex h-full w-full flex-col items-center justify-center text-center"
                  style={{ animation: "timelineFadeIn 0.45s cubic-bezier(0.16,1,0.3,1) both", animationDelay: "140ms" }}
                >
                  <button
                    onClick={(e) => { e.stopPropagation(); setActiveNodeId(null); setPulseEffect({}); }}
                    className="absolute top-0 right-0 flex h-6 w-6 items-center justify-center rounded-full bg-slate-100 text-slate-500 transition-colors hover:bg-slate-200 hover:text-slate-700"
                    aria-label="Close stage details"
                  >
                    <X size={14} />
                  </button>
                  <span className="text-[10px] sm:text-xs font-mono font-bold uppercase tracking-[0.2em] text-[#176579]">{activeItem.date}</span>
                  <p className="mt-1.5 px-2 text-sm sm:text-base font-extrabold leading-tight text-slate-900 line-clamp-2">{activeItem.title}</p>
                  <div className={`mt-2 px-2 py-0.5 rounded-full text-[9px] font-bold tracking-wider border inline-block ${getStatusStyles(activeItem.status)}`}>
                    {activeItem.status === "completed" ? "COMPLETE" : activeItem.status === "in-progress" ? "IN PROGRESS" : "PENDING"}
                  </div>
                  <p className="mt-3 px-3 text-[11px] sm:text-xs leading-relaxed text-slate-600 line-clamp-4 overflow-y-auto max-h-[88px]">{activeItem.content}</p>
                </div>
              )}
            </div>

            <svg className="absolute h-[470px] w-[470px] pointer-events-none" viewBox="0 0 470 470" aria-hidden="true">
              <defs>
                <linearGradient id="orbit-glow" x1="0%" y1="0%" x2="100%" y2="100%">
                  <stop offset="0%" stopColor="#27a8c4" stopOpacity="0.8" />
                  <stop offset="50%" stopColor="#ffffff" stopOpacity="0.25" />
                  <stop offset="100%" stopColor="#27a8c4" stopOpacity="0.8" />
                </linearGradient>
              </defs>
              <g
                style={{
                  transformOrigin: "235px 235px",
                  transform: `rotate(${rotationAngle}deg)`,
                  transition: shuffling ? `transform ${SHUFFLE_MS}ms cubic-bezier(0.22, 1, 0.36, 1)` : undefined,
                }}
              >
                <circle cx="235" cy="235" r="210" fill="none" stroke="rgba(255,255,255,0.18)" strokeWidth="1.5" />
                <circle
                  cx="235" cy="235" r="210" fill="none" stroke="url(#orbit-glow)" strokeWidth="2.5" strokeDasharray="24 160"
                  className="orbit-flow-path"
                  style={{ transformOrigin: "center", animation: "orbitFlow 24s linear infinite" }}
                />
              </g>
            </svg>

            {timelineData.map((item, index) => {
              const position = calculateNodePosition(index, timelineData.length);
              const isExpanded = activeNodeId === item.id;
              const Icon = item.icon;
              return (
                <div
                  key={item.id}
                  className="group absolute cursor-pointer"
                  style={{
                    transform: `translate(${position.x}px, ${position.y}px)`,
                    zIndex: isExpanded ? 200 : position.zIndex,
                    // Only during a click reshuffle. A linear interpolation of
                    // translate takes each node straight across to its new
                    // seat; the delay fans the arrivals out so it reads as a
                    // reshuffle rather than the ring turning as one piece.
                    transition: shuffling
                      ? `transform ${SHUFFLE_MS}ms cubic-bezier(0.22, 1, 0.36, 1) ${index * STAGGER_MS}ms`
                      : undefined,
                  }}
                  onClick={(e) => { e.stopPropagation(); toggleItem(item.id); }}
                >
                  <div
                    className={`absolute rounded-full pointer-events-none transition-all duration-300 ${isExpanded ? "scale-110" : ""} ${pulseEffect[item.id] ? "animate-pulse" : ""}`}
                    style={{
                      background: "radial-gradient(circle, rgba(255,255,255,0.35) 0%, rgba(39,168,196,0.2) 40%, rgba(39,168,196,0) 70%)",
                      width: 72, height: 72, left: -16, top: -16,
                    }}
                  />
                  <div className={`flex h-10 w-10 items-center justify-center rounded-full border-2 transition-all duration-300 ${getNodeStyles(item, isExpanded, isRelatedToActive(item.id))}`}>
                    <Icon size={16} />
                  </div>
                  <div
                    className={`absolute bottom-12 left-1/2 -translate-x-1/2 w-max max-w-[160px] bg-slate-900/95 text-[#e9f8fb] text-[10px] font-bold px-2.5 py-1 rounded-md shadow-lg backdrop-blur-md pointer-events-none transition-all duration-300 border border-white/10 text-center ${
                      isExpanded ? "scale-100 opacity-100 translate-y-0" : "scale-75 opacity-0 translate-y-1 group-hover:scale-100 group-hover:opacity-100 group-hover:translate-y-0"
                    }`}
                  >
                    {item.title}
                    <div className="absolute -bottom-1 left-1/2 -translate-x-1/2 w-2 h-2 bg-slate-900/95 rotate-45 border-r border-b border-white/10" />
                  </div>
                  <div className={`absolute left-1/2 -translate-x-1/2 top-12 w-24 text-center transition-all duration-300 ${isExpanded ? "scale-110" : ""}`}>
                    <span
                      className={`block text-[10px] font-mono tracking-wider font-bold uppercase rounded-full px-2.5 py-0.5 border transition-all duration-300 ${
                        isExpanded
                          ? "bg-[#27a8c4] text-[#0a2732] border-[#27a8c4] shadow-md shadow-[#27a8c4]/30"
                          : "bg-[#133744] text-[#e9f8fb] border-[#27a8c4]/35 group-hover:bg-[#184454] group-hover:text-white group-hover:border-[#27a8c4]/60"
                      }`}
                    >
                      {item.date}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Right panel — stage guide */}
        <div className="hidden xl:flex absolute right-8 top-1/2 -translate-y-1/2 w-[285px] flex-col gap-5 rounded-2xl border border-white/15 bg-white/5 p-6 backdrop-blur-md text-white select-none shadow-[0_8px_32px_rgba(0,0,0,0.12)]">
          {activeItem ? (
            <div className="flex flex-col gap-5" style={{ animation: "timelineFadeIn 0.45s ease-out both" }}>
              <div className="flex flex-col gap-1">
                <span className="text-[10px] font-mono font-bold uppercase tracking-[0.2em] text-[#3cd5f7]">{activeItem.date}</span>
                <h3 className="text-base font-extrabold tracking-tight truncate text-white">{activeItem.title}</h3>
              </div>
              <div className="h-px bg-white/10 w-full" />
              <div className="flex flex-col gap-3">
                <span className="text-[10px] text-[#3cd5f7] uppercase tracking-wider font-extrabold">
                  {checklists[activeItem.id]?.title ?? "Key Deliverables"}
                </span>
                <ul className="space-y-3.5">
                  {(checklists[activeItem.id]?.items ?? []).map((bullet) => (
                    <li key={bullet} className="flex items-start gap-2.5 text-xs text-white leading-normal">
                      <span className="mt-1 flex h-1.5 w-1.5 shrink-0 rounded-full bg-[#3cd5f7]" />
                      <span>{bullet}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          ) : (
            <div className="flex flex-col gap-5 text-center items-center py-6">
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-white/10 text-[#3cd5f7]">
                <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M15 15l-2 5L9 9l11 4-5 2zm0 0l5 5M7.188 2.239l.777 2.897M5.136 7.965l-2.898-.777M13.95 4.05l-2.122 2.122m-5.657 5.656l-2.12 2.122" />
                </svg>
              </div>
              <div className="flex flex-col gap-1.5">
                <h3 className="text-sm font-extrabold uppercase tracking-[0.12em] text-white">Stage Guide</h3>
                <p className="text-[11px] leading-relaxed text-slate-200">
                  Click any stage node on the circular workflow to view the corresponding milestones and checklists in this guide.
                </p>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Mobile / tablet stepper.
          This is the copy Google actually indexes — mobile-first crawling means
          the phone rendering is the one that counts, and here every stage title,
          description and checklist is in the DOM unconditionally. On desktop the
          orbit reveals the same text on click; nothing is search-visible only. */}
      <div className="lg:hidden flex w-full flex-col gap-6 px-4 py-8">
        <motion.div
          variants={{ hidden: { opacity: 0 }, show: { opacity: 1, transition: { staggerChildren: 0.1 } } }}
          initial="hidden"
          whileInView="show"
          viewport={{ once: true, margin: "-100px" }}
          className="relative w-full max-w-xl mx-auto flex flex-col gap-8 py-6"
        >
          {timelineData.map((item, index) => {
            const Icon = item.icon;
            const checklist = checklists[item.id];
            const isCompleted = item.status === "completed";
            const isInProgress = item.status === "in-progress";

            return (
              <motion.div
                key={item.id}
                variants={{
                  hidden: { opacity: 0, y: 20, scale: 0.95 },
                  show: { opacity: 1, y: 0, scale: 1, transition: { type: "spring", stiffness: 100, damping: 15 } },
                }}
                className="relative flex flex-col items-center w-full"
              >
                <div
                  className={`absolute left-1/2 -translate-x-1/2 top-[20px] w-[2px] bg-gradient-to-b from-[#27a8c4] via-[#3cd5f7] to-[#27a8c4] opacity-50 z-0 ${
                    index < timelineData.length - 1 ? "bottom-[-56px]" : "bottom-[40px]"
                  }`}
                />
                <div
                  className={`relative z-20 mx-auto flex h-10 w-10 items-center justify-center rounded-full border-2 bg-white ${
                    isCompleted
                      ? "border-[#27a8c4] text-[#176579]"
                      : isInProgress
                        ? "border-[#27a8c4] text-[#27a8c4] ring-4 ring-[#27a8c4]/20"
                        : "border-[#27a8c4]/40 text-[#176579]/65"
                  }`}
                >
                  <Icon size={16} />
                </div>

                <div className={`w-full relative z-10 mt-4 rounded-3xl border bg-white p-6 sm:p-7 ${
                  isInProgress ? "border-[#27a8c4]/80 shadow-[0_20px_50px_rgba(39,168,196,0.18)]" : "border-slate-100 shadow-md"
                }`}>
                  <div className="flex items-center justify-center gap-3">
                    <span className="text-[9px] font-mono font-black uppercase tracking-wider rounded-full px-2.5 py-0.5 border whitespace-nowrap bg-[#27a8c4]/10 border-[#27a8c4]/30 text-[#176579]">
                      {item.date}
                    </span>
                    <span className="text-[10px] font-black uppercase tracking-[0.12em] truncate text-slate-500">{item.category}</span>
                  </div>
                  <h3 className="mt-3.5 text-xl font-extrabold tracking-tight leading-tight text-center text-slate-900">{item.title}</h3>
                  <p className="mt-2 text-xs sm:text-sm font-semibold leading-relaxed text-center text-slate-700">{item.content}</p>

                  {checklist && (
                    <div className="mt-4 border-t border-slate-100 pt-3.5 flex flex-col items-center">
                      <span className="text-[10px] font-black uppercase tracking-[0.12em] block mb-3 text-center text-[#176579]">
                        {checklist.title}
                      </span>
                      <ul className="space-y-3 w-fit mx-auto">
                        {checklist.items.map((bullet) => (
                          <li key={bullet} className="flex items-start gap-3 text-xs sm:text-sm font-bold leading-relaxed text-slate-700">
                            <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-[#27a8c4] text-white mt-0.5">
                              <Check size={11} strokeWidth={4} />
                            </span>
                            <span>{bullet}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              </motion.div>
            );
          })}
        </motion.div>
      </div>
    </div>
  );
}
