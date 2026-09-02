"use client";

import { useEffect, useRef, useState } from "react";
import { motion, useMotionValue, useSpring, useTransform } from "framer-motion";

// Deliberately shallow. Past roughly 10deg the near edge of a form starts to
// foreshorten and the far edge softens, which costs legibility for an effect
// nobody came here for. Six is felt without being read.
const MAX_TILT_DEG = 6;

/**
 * A card that leans very slightly toward the pointer.
 *
 * Pointer only. On a touch screen the same gesture that would drive the tilt is
 * the one scrolling the page, so the card twitches under the finger and reads
 * as broken rather than premium — matchMedia('(pointer: coarse)') opts those
 * devices out entirely, as does a reduced-motion preference.
 *
 * The tilt is spring-damped rather than bound straight to the cursor: raw
 * pointer values snap, and a form that snaps while you are typing into it is
 * distracting.
 */
export function TiltCard({
  children,
  className = "",
}: {
  children: React.ReactNode;
  className?: string;
}) {
  const ref = useRef<HTMLDivElement | null>(null);
  const [enabled, setEnabled] = useState(false);

  const mouseX = useMotionValue(0);
  const mouseY = useMotionValue(0);

  const springs = { stiffness: 150, damping: 20, mass: 0.6 };
  const rotateX = useSpring(
    useTransform(mouseY, [-0.5, 0.5], [MAX_TILT_DEG, -MAX_TILT_DEG]),
    springs
  );
  const rotateY = useSpring(
    useTransform(mouseX, [-0.5, 0.5], [-MAX_TILT_DEG, MAX_TILT_DEG]),
    springs
  );

  useEffect(() => {
    if (typeof window.matchMedia !== "function") return;

    const coarse = window.matchMedia("(pointer: coarse)");
    const still = window.matchMedia("(prefers-reduced-motion: reduce)");

    const decide = () => setEnabled(!coarse.matches && !still.matches);
    decide();

    // A convertible laptop can switch between a trackpad and a touchscreen
    // mid-session, so this is watched rather than read once.
    coarse.addEventListener("change", decide);
    still.addEventListener("change", decide);
    return () => {
      coarse.removeEventListener("change", decide);
      still.removeEventListener("change", decide);
    };
  }, []);

  const onMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!enabled || !ref.current) return;
    const rect = ref.current.getBoundingClientRect();
    // Normalised to -0.5..0.5 so the range is independent of card size.
    mouseX.set((e.clientX - rect.left) / rect.width - 0.5);
    mouseY.set((e.clientY - rect.top) / rect.height - 0.5);
  };

  const onLeave = () => {
    mouseX.set(0);
    mouseY.set(0);
  };

  return (
    <div style={{ perspective: 1400 }} className={className}>
      <motion.div
        ref={ref}
        onMouseMove={onMove}
        onMouseLeave={onLeave}
        style={
          enabled
            ? { rotateX, rotateY, transformStyle: "preserve-3d" }
            : undefined
        }
        className="relative"
      >
        {children}
      </motion.div>
    </div>
  );
}

/**
 * The light that travels the card's edge.
 *
 * Teal rather than the reference's white: this card is light-surfaced, and a
 * white beam on a white card is invisible. Rendered as siblings of the card
 * content and pointer-events-none, so nothing here can intercept a click meant
 * for the form.
 */
export function TravellingEdgeLight() {
  const beam =
    "absolute bg-gradient-to-r from-transparent via-brand to-transparent opacity-70";
  const beamV =
    "absolute bg-gradient-to-b from-transparent via-brand to-transparent opacity-70";

  return (
    <div aria-hidden="true" className="pointer-events-none absolute -inset-px overflow-hidden rounded-2xl">
      <motion.div
        className={`${beam} top-0 h-[2px] w-1/2`}
        initial={{ left: "-50%" }}
        animate={{ left: ["-50%", "100%"] }}
        transition={{ duration: 2.6, ease: "easeInOut", repeat: Infinity, repeatDelay: 1.2 }}
      />
      <motion.div
        className={`${beamV} right-0 w-[2px] h-1/2`}
        initial={{ top: "-50%" }}
        animate={{ top: ["-50%", "100%"] }}
        transition={{
          duration: 2.6,
          ease: "easeInOut",
          repeat: Infinity,
          repeatDelay: 1.2,
          delay: 0.65,
        }}
      />
      <motion.div
        className={`${beam} bottom-0 h-[2px] w-1/2`}
        initial={{ right: "-50%" }}
        animate={{ right: ["-50%", "100%"] }}
        transition={{
          duration: 2.6,
          ease: "easeInOut",
          repeat: Infinity,
          repeatDelay: 1.2,
          delay: 1.3,
        }}
      />
      <motion.div
        className={`${beamV} left-0 w-[2px] h-1/2`}
        initial={{ bottom: "-50%" }}
        animate={{ bottom: ["-50%", "100%"] }}
        transition={{
          duration: 2.6,
          ease: "easeInOut",
          repeat: Infinity,
          repeatDelay: 1.2,
          delay: 1.95,
        }}
      />
    </div>
  );
}
