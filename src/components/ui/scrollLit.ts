"use client";

import { useRef, useState, type RefObject } from "react";
import { useScroll, useMotionValueEvent, useReducedMotion } from "framer-motion";

/**
 * The careers page's reveal, as one mechanism instead of four.
 *
 * PrismaHero built this and it is the one that reads correctly: a word or a row
 * darkens as a function of SCROLL POSITION, so stopping mid-section leaves it
 * half-revealed and scrolling back up un-reveals it. The other sections on the
 * page each invented their own — useInView with fixed delays, whileInView, two
 * separate GSAP ScrollTriggers — and those are time-based: once tripped they
 * run on a clock and ignore the scroll entirely. Put next to a scroll-linked
 * section the difference is obvious, because one tracks the hand on the wheel
 * and the other does not.
 *
 * This module is that mechanism, extracted verbatim so sections can share it
 * rather than approximate it.
 */

export const clamp01 = (n: number) => Math.min(1, Math.max(0, n));

/**
 * Lit and unlit ink, measured against #FAFAF7 rather than picked: the lit navy
 * is 15.7:1 and the unlit grey 4.59:1. That matters — a word that has not been
 * reached yet is still comfortably readable, so a reader who stops mid-section
 * is never looking at text below the accessible threshold. The reveal is a
 * darkening from one legible tone to another, never a fade from nothing.
 */
export const INK_LIT = "#08222e";
export const INK_UNLIT = "#63757d";

/**
 * `lit` runs 0 to 1. The 5px lift is small on purpose: enough that several
 * words are visibly in motion at once and the line reads as a wave, not
 * enough to move the layout.
 *
 * No CSS transition, deliberately. There was one, and it was actively harmful:
 * the value behind it is replaced on every scroll frame, so the browser ran
 * colour interpolations that never reached their target before the next one
 * arrived. Scroll position already supplies the smoothness.
 */
export function ink(lit: number, litColor = INK_LIT, unlitColor = INK_UNLIT) {
  return {
    color: `color-mix(in srgb, ${litColor} ${Math.round(lit * 100)}%, ${unlitColor})`,
    transform: `translateY(${(1 - lit) * 5}px)`,
  };
}

/**
 * Scroll progress through a section, quantised.
 *
 * Fiftieths, not thousandths. Rounding finer meant a re-render on very nearly
 * every frame; fifty steps is finer than the eye resolves across a reveal and
 * collapses the work to fifty re-renders for the whole section.
 *
 * Returns 1 immediately under `prefers-reduced-motion`, so the section is
 * simply fully revealed rather than animated.
 */
export function useScrollLit(
  target: RefObject<HTMLElement | null>,
  offset: [string, string] = ["start start", "end end"],
) {
  const reduced = useReducedMotion();
  const { scrollYProgress } = useScroll({
    target,
    // framer-motion's offset type is looser than its published union.
    offset: offset as never,
  });

  const [raw, setRaw] = useState(0);
  useMotionValueEvent(scrollYProgress, "change", (v) => {
    const next = Math.round(v * 50) / 50;
    setRaw((prev) => (prev === next ? prev : next));
  });

  return { p: reduced ? 1 : raw, reduced: Boolean(reduced), scrollYProgress };
}

/**
 * One item's progress inside a staggered group.
 *
 * The 1.6 overlap is what stops the group reading as a row of switches: each
 * item takes longer than its own slot, so two or three are always mid-reveal.
 */
export function staggerLit(
  p: number,
  index: number,
  count: number,
  from: number,
  to: number,
  overlap = 1.6,
) {
  const each = (to - from) / count;
  return clamp01((p - (from + index * each)) / (each * overlap));
}

/** Kept for the single-element case, where a stagger would be overkill. */
export function rangeLit(p: number, from: number, over: number) {
  return clamp01((p - from) / over);
}

/** Track this ref to drive a section. */
export function useLitRef<T extends HTMLElement>() {
  return useRef<T>(null);
}
