"use client";

import { useEffect, useId, useLayoutEffect, useRef } from "react";
import "./trip-lock-overlay.css";

/** What the lock is doing: at rest, opening, or (the console's preview) locking again. */
export type LockOverlayState = "locked" | "breaking" | "locking";

/**
 * The opening's two beats, in seconds from its start: when the banner is open
 * (its button and its fireworks), and when the last of the lock has gone. The
 * caller keeps this time (useTripBannerLock), not the drawing.
 */
export const BREAK = { release: 0.9, done: 1.4 } as const;
/** The same for reduced motion, where the lock simply fades away. */
export const BREAK_REDUCED = { release: 0.35, done: 0.4 } as const;
/** How long locking again takes, in the console's preview. */
export const LOCKING_S = 1.2;

const reducedMotion = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches;

/**
 * The lock on the homepage's Free China Business Trip banner
 * (lib/trip-lock.ts, the owner's request of 2026-10-05; the chain it first
 * wore was taken off the same day, on the owner's word that it looked cheap).
 *
 * The banner sits behind frosted glass: blurred enough that nothing on it can
 * be read, not so much that it stops being the trip (its red, its sky, its
 * plane still show through), with a fine light edge like a pane's. One lock
 * badge sits in the middle of it: a dark glass disc with a hairline gold ring
 * and a padlock drawn to the pixel. Every few seconds a halo breathes out of
 * the disc and a light passes across the glass (none of it for reduced
 * motion). A press anywhere on it shakes the padlock: `rattle` counts presses,
 * and each new count is one.
 *
 * "breaking", the moment an admin unlocks it: the shackle springs up and
 * swings open, a ring of light bursts from the disc as it lifts away, and the
 * frost dissolves with a last sweep of light, leaving the picture sharp
 * (BREAK). For reduced motion it fades.
 *
 * "locking", the console's preview of locking it again: the frost comes back,
 * the disc settles onto it open, and the shackle clicks shut (LOCKING_S).
 *
 * Every move is the Web Animations API on transform and opacity, so the
 * compositor does it alone. It covers the card it is put in (absolute, over
 * the picture, inside the card's rounded clip) and sizes itself to it
 * (container units), from the 200px corner to a phone's full width. Hidden
 * from a screen reader: the call under the banner (TripCall) says it is
 * locked, and is the one thing to press.
 */
export function TripLockOverlay({
  state,
  rattle = 0,
  onPress,
  className = "",
}: {
  state: LockOverlayState;
  /** Presses so far; each new value shakes it once. */
  rattle?: number;
  onPress?: () => void;
  className?: string;
}) {
  const root = useRef<HTMLDivElement>(null);
  // Two copies of the banner share a page, one always display:none, and the
  // console has a third: an id shared between them would resolve to the
  // hidden copy's gradient, and paint the padlock blank.
  const metal = `tlo-metal-${useId().replace(/[^\w-]/g, "")}`;

  // A press: the padlock shakes on its shackle, the disc with it, a little.
  useEffect(() => {
    const el = root.current;
    if (!rattle || !el || state !== "locked" || reducedMotion()) return;
    const anims = [
      el.querySelector(".tlo-padlock")?.animate(
        [0, -14, 11, -7, 4, 0].map((r) => ({ transform: `rotate(${r}deg)` })),
        { duration: 520, easing: "ease-out" },
      ),
      el.querySelector(".tlo-disc")?.animate(
        [0, -3, 3, -2, 1, 0].map((x) => ({ transform: `translateX(${x}px)` })),
        { duration: 420, easing: "ease-out" },
      ),
    ];
    return () => anims.forEach((a) => a?.cancel());
  }, [rattle, state]);

  // Unlocked: it opens.
  useEffect(() => {
    const el = root.current;
    if (state !== "breaking" || !el) return;
    const anims: (Animation | undefined)[] = [];
    const play = (sel: string, frames: Keyframe[], opts: KeyframeAnimationOptions) =>
      anims.push(el.querySelector(sel)?.animate(frames, { fill: "both", ...opts }));
    if (reducedMotion()) {
      anims.push(el.animate([{ opacity: 1 }, { opacity: 0 }], { duration: BREAK_REDUCED.release * 1000, fill: "forwards" }));
    } else {
      // The shackle springs up and swings open on its right leg.
      play(".tlo-shackle", [
        { transform: "none" },
        { transform: "translateY(-2.4px)", offset: 0.35 },
        { transform: "translateY(-2.4px) rotate(-32deg)" },
      ], { duration: 360, easing: "cubic-bezier(0.3, 1.4, 0.5, 1)" });
      // A ring of light bursts out of the disc...
      play(".tlo-burst", [
        { opacity: 0.95, transform: "scale(0.9)" },
        { opacity: 0, transform: "scale(2.6)" },
      ], { duration: 620, delay: 180, easing: "cubic-bezier(0.2, 0.7, 0.3, 1)" });
      // ...as the disc lifts away.
      play(".tlo-disc", [
        { opacity: 1, transform: "none" },
        { opacity: 1, transform: "scale(1.12)", offset: 0.3 },
        { opacity: 0, transform: "scale(0.7)" },
      ], { duration: 520, delay: 260, easing: "cubic-bezier(0.4, 0, 0.6, 1)" });
      // The frost dissolves, and a last light sweeps the picture clear.
      play(".tlo-glass", [{ opacity: 1 }, { opacity: 0 }], { duration: 800, delay: 340, easing: "cubic-bezier(0.4, 0, 0.2, 1)" });
      play(".tlo-reveal", [
        { opacity: 0, transform: "translateX(-110%)" },
        { opacity: 1, transform: "translateX(-40%)", offset: 0.3 },
        { opacity: 0, transform: "translateX(110%)" },
      ], { duration: 900, delay: 380, easing: "ease-in-out" });
    }
    return () => anims.forEach((a) => a?.cancel());
  }, [state]);

  // Locked again (the console's preview). Before paint, so the lock never
  // shows whole for a frame before it comes on.
  useLayoutEffect(() => {
    const el = root.current;
    if (state !== "locking" || !el) return;
    const anims: (Animation | undefined)[] = [];
    const play = (sel: string, frames: Keyframe[], opts: KeyframeAnimationOptions) =>
      anims.push(el.querySelector(sel)?.animate(frames, { fill: "backwards", ...opts }));
    if (reducedMotion()) {
      anims.push(el.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 350, fill: "backwards" }));
    } else {
      play(".tlo-glass", [{ opacity: 0 }, { opacity: 1 }], { duration: 520, easing: "ease-out" });
      play(".tlo-disc", [
        { opacity: 0, transform: "scale(0.6)" },
        { opacity: 1, transform: "scale(1.06)", offset: 0.7 },
        { opacity: 1, transform: "none" },
      ], { duration: 460, delay: 240, easing: "cubic-bezier(0.2, 0.9, 0.3, 1)" });
      // It arrives open, and clicks shut.
      play(".tlo-shackle", [
        { transform: "translateY(-2.4px) rotate(-32deg)" },
        { transform: "translateY(-2.4px) rotate(-32deg)", offset: 0.55 },
        { transform: "translateY(-2.4px)", offset: 0.8 },
        { transform: "none" },
      ], { duration: 640, delay: 300, easing: "ease-in" });
      play(".tlo-padlock", [
        { transform: "none" },
        { transform: "scale(0.9)", offset: 0.4 },
        { transform: "none" },
      ], { duration: 220, delay: 940, easing: "ease-out" });
    }
    return () => anims.forEach((a) => a?.cancel());
  }, [state]);

  return (
    <div
      ref={root}
      aria-hidden
      data-state={state}
      data-press={onPress ? "" : undefined}
      onClick={state === "locked" ? onPress : undefined}
      className={`tlo ${className}`}
    >
      <span className="tlo-glass">
        <span className="tlo-frost" />
        <span className="tlo-sheen" />
      </span>
      <span className="tlo-reveal" />
      <span className="tlo-center">
        <span className="tlo-halo" />
        <span className="tlo-burst" />
        <span className="tlo-disc">
          <svg viewBox="0 0 24 24" className="tlo-padlock">
            <defs>
              <linearGradient id={metal} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0" stopColor="#fffaf0" />
                <stop offset="0.55" stopColor="#f6dfa6" />
                <stop offset="1" stopColor="#d9a845" />
              </linearGradient>
            </defs>
            <path className="tlo-shackle" d="M7.6 10.6V7.9a4.4 4.4 0 0 1 8.8 0v2.7" fill="none" stroke={`url(#${metal})`} strokeWidth="2.1" strokeLinecap="round" />
            <rect x="4.6" y="10.1" width="14.8" height="10.6" rx="2.9" fill={`url(#${metal})`} />
            <circle cx="12" cy="14.6" r="1.55" fill="#2a1d0a" />
            <rect x="11.3" y="15.3" width="1.4" height="2.9" rx="0.7" fill="#2a1d0a" />
          </svg>
        </span>
      </span>
    </div>
  );
}
