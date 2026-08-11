"use client";

import React, { forwardRef, useRef, useState } from "react";
import Image from "next/image";
import * as HoverCardPrimitive from "@radix-ui/react-hover-card";
import {
  AnimatePresence,
  motion,
  useMotionValue,
  useSpring,
} from "framer-motion";
import { cn } from "@/lib/utils";
import { AnimatedBeam } from "@/components/ui/animated-beam";

/* Monochrome brand glyphs that paint with `currentColor` — so every icon
 * takes the same brand-teal tint and the whole constellation reads as one
 * designed system, rather than a scatter of realistic multi-colour logos. */
function Glyph({ d, className }: { d: string; className?: string }) {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" fill="currentColor" className={className}>
      <path d={d} />
    </svg>
  );
}

const PATHS = {
  facebook:
    "M9.101 23.691v-7.98H6.627v-3.667h2.474v-1.58c0-4.085 1.848-5.978 5.858-5.978.401 0 .955.042 1.468.103a8.68 8.68 0 0 1 1.141.195v3.325a8.623 8.623 0 0 0-.653-.036 26.805 26.805 0 0 0-.733-.009c-.707 0-1.259.096-1.675.309a1.686 1.686 0 0 0-.679.622c-.256.44-.359 1.088-.359 1.977v.831h3.325l-.256 2.032-.199 1.635h-2.87v7.98H9.101z",
  instagram:
    "M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zm0-2.163C8.741 0 8.333.014 7.053.072 2.695.272.273 2.69.073 7.052.014 8.333 0 8.741 0 12c0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98C8.333 23.986 8.741 24 12 24c3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98C15.668.014 15.259 0 12 0zm0 5.838a6.162 6.162 0 1 0 0 12.324 6.162 6.162 0 0 0 0-12.324zM12 16a4 4 0 1 1 0-8 4 4 0 0 1 0 8zm6.406-11.845a1.44 1.44 0 1 0 0 2.881 1.44 1.44 0 0 0 0-2.881z",
  tiktok:
    "M12.525.02c1.31-.02 2.61-.01 3.91-.02.08 1.53.63 3.09 1.75 4.17 1.12 1.11 2.7 1.62 4.24 1.79v4.03c-1.44-.05-2.89-.35-4.2-.97-.57-.26-1.1-.59-1.62-.93-.01 2.92.01 5.84-.02 8.75-.08 2.23-1.15 4.19-2.77 5.48-1.5 1.19-3.4 1.6-5.3 1.25-1.92-.35-3.5-1.58-4.47-3.19-1.04-1.74-1.15-3.88-.41-5.74.69-1.73 2.1-3.1 3.84-3.66 1.1-.35 2.27-.42 3.4-.23v4.13c-.94-.13-1.94.13-2.65.75-.76.66-1.11 1.7-1 2.68.12.98.81 1.83 1.7 2.15 1.05.38 2.29.23 3.12-.52.79-.7 1.19-1.77 1.19-2.85V.02z",
  youtube:
    "M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .5 6.186C0 8.07 0 12 0 12s0 3.93.5 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z",
  linkedin:
    "M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433a2.062 2.062 0 0 1-2.063-2.065 2.064 2.064 0 1 1 2.063 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z",
  x: "M18.901 1.153h3.68l-8.04 9.19L24 22.846h-7.406l-5.8-7.584-6.638 7.584H.474l8.6-9.83L0 1.154h7.594l5.243 6.932ZM17.61 20.644h2.039L6.486 3.24H4.298Z",
};

/* Hover-preview images live in /public/Social media (note the space, encoded
 * here as %20). Each social node reveals its brand image on hover. The X node
 * maps to twitter.png, and tiktok.png is expected to be dropped in later. */
const PREVIEWS = {
  facebook: "/Social%20media/facebook.png",
  instagram: "/Social%20media/instagram.png",
  tiktok: "/Social%20media/TikTok.png",
  youtube: "/Social%20media/youtube.png",
  linkedin: "/Social%20media/linkedin.png",
  x: "/Social%20media/twitter.png",
};

/**
 * A circular node that is also the social link, measurable by AnimatedBeam.
 * Styled as a unified "innovation" glass node — a brand-teal monochrome glyph
 * inside a frosted disc with a soft teal ring, rather than the realistic
 * brand-colour logos, so the whole constellation reads as one designed system.
 */
const Node = forwardRef<
  HTMLAnchorElement,
  React.ComponentPropsWithoutRef<"a"> & { label?: string }
>(({ className, children, href, label, ...props }, ref) => {
  return (
    <a
      ref={ref}
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      aria-label={label}
      className={cn(
        "group z-10 flex size-14 sm:size-16 items-center justify-center rounded-2xl",
        "border border-brand/30 bg-white/70 backdrop-blur-sm text-brand-dark",
        "shadow-[0_8px_30px_-10px_rgba(23,101,121,0.35)] ring-1 ring-inset ring-white/60",
        "transition-all duration-300 hover:-translate-y-1 hover:border-brand hover:text-brand hover:shadow-[0_12px_36px_-8px_rgba(39,168,196,0.55)]",
        className,
      )}
      {...props}
    >
      {children}
    </a>
  );
});
Node.displayName = "Node";

/**
 * A social Node wrapped in a Radix HoverCard that, on hover, floats the
 * matching brand image above the icon with a subtle spring/parallax motion.
 * The Node is the HoverCard trigger via `asChild`, so Radix composes its ref
 * onto the anchor and AnimatedBeam can still measure the node's position.
 */
const SocialNode = forwardRef<
  HTMLAnchorElement,
  {
    href?: string;
    label: string;
    previewSrc: string;
    children: React.ReactNode;
    className?: string;
  }
>(({ href, label, previewSrc, children, className }, ref) => {
  const [isOpen, setOpen] = useState(false);

  const springConfig = { stiffness: 100, damping: 15 };
  const x = useMotionValue(0);
  const translateX = useSpring(x, springConfig);

  const handleMouseMove = (event: React.MouseEvent<HTMLAnchorElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    // Subtle parallax: how far the cursor sits from the icon's centre.
    const offsetFromCenter = (event.clientX - rect.left - rect.width / 2) / 2;
    x.set(offsetFromCenter);
  };

  return (
    <HoverCardPrimitive.Root openDelay={50} closeDelay={100} onOpenChange={setOpen}>
      <HoverCardPrimitive.Trigger asChild onMouseMove={handleMouseMove}>
        <Node ref={ref} href={href} label={label} className={className}>
          {children}
        </Node>
      </HoverCardPrimitive.Trigger>

      <HoverCardPrimitive.Portal>
        <HoverCardPrimitive.Content
          side="top"
          align="center"
          sideOffset={12}
          className="z-50 [transform-origin:var(--radix-hover-card-content-transform-origin)]"
        >
          <AnimatePresence>
            {isOpen && (
              <motion.div
                initial={{ opacity: 0, y: 20, scale: 0.6 }}
                animate={{
                  opacity: 1,
                  y: 0,
                  scale: 1,
                  transition: { type: "spring", stiffness: 260, damping: 20 },
                }}
                exit={{ opacity: 0, y: 20, scale: 0.6 }}
                style={{ x: translateX }}
                className="rounded-2xl bg-white p-2 shadow-xl ring-1 ring-brand/20"
              >
                <Image
                  src={previewSrc}
                  width={220}
                  height={150}
                  unoptimized
                  priority
                  alt={`${label} preview`}
                  className="h-[150px] w-[220px] rounded-xl object-contain"
                />
              </motion.div>
            )}
          </AnimatePresence>
        </HoverCardPrimitive.Content>
      </HoverCardPrimitive.Portal>
    </HoverCardPrimitive.Root>
  );
});
SocialNode.displayName = "SocialNode";

export function SocialBeams() {
  const containerRef = useRef<HTMLDivElement>(null);
  const centerRef = useRef<HTMLDivElement>(null);
  const l1 = useRef<HTMLAnchorElement>(null);
  const l2 = useRef<HTMLAnchorElement>(null);
  const l3 = useRef<HTMLAnchorElement>(null);
  const r1 = useRef<HTMLAnchorElement>(null);
  const r2 = useRef<HTMLAnchorElement>(null);
  const r3 = useRef<HTMLAnchorElement>(null);

  const iconClass = "size-6 sm:size-7 transition-transform duration-300 group-hover:scale-110";

  return (
    <div
      ref={containerRef}
      className="relative flex h-[360px] sm:h-[400px] w-full max-w-3xl mx-auto items-center justify-between px-2 sm:px-10"
    >
      {/* Left social column */}
      <div className="flex flex-col justify-between h-full py-4">
        <SocialNode ref={l1} href="https://www.facebook.com/affhaninternational/reels/" label="Facebook" previewSrc={PREVIEWS.facebook}>
          <Glyph d={PATHS.facebook} className={iconClass} />
        </SocialNode>
        <SocialNode ref={l2} href="https://www.instagram.com/affhanglobal?utm_source=ig_web_button_share_sheet&igsh=ZDNlZDc0MzIxNw==" label="Instagram" previewSrc={PREVIEWS.instagram}>
          <Glyph d={PATHS.instagram} className={iconClass} />
        </SocialNode>
        <SocialNode ref={l3} href="https://www.tiktok.com/@affhan_global" label="TikTok" previewSrc={PREVIEWS.tiktok}>
          <Glyph d={PATHS.tiktok} className={iconClass} />
        </SocialNode>
      </div>

      {/* Center logo */}
      <div
        ref={centerRef}
        className="z-10 flex size-28 sm:size-36 items-center justify-center rounded-full border border-brand/30 bg-white p-4 shadow-[0_10px_50px_-12px_rgba(23,101,121,0.6)] ring-4 ring-brand/10"
      >
        <Image src="/logo.png" alt="Affhan" width={140} height={140} className="object-contain" />
      </div>

      {/* Right social column */}
      <div className="flex flex-col justify-between h-full py-4">
        <SocialNode ref={r1} href="https://www.youtube.com/@affhan_global/shorts" label="YouTube" previewSrc={PREVIEWS.youtube}>
          <Glyph d={PATHS.youtube} className={iconClass} />
        </SocialNode>
        <SocialNode ref={r2} href="https://www.linkedin.com/company/affhanglobal/posts/" label="LinkedIn" previewSrc={PREVIEWS.linkedin}>
          <Glyph d={PATHS.linkedin} className={iconClass} />
        </SocialNode>
        <SocialNode ref={r3} href="https://x.com/affhan_shipping" label="X" previewSrc={PREVIEWS.x}>
          <Glyph d={PATHS.x} className={iconClass} />
        </SocialNode>
      </div>

      {/* Beams: each social wire flows into the central Affhan logo */}
      <AnimatedBeam containerRef={containerRef} fromRef={l1} toRef={centerRef} curvature={-80} endYOffset={-10} gradientStartColor="#27a8c4" gradientStopColor="#176579" />
      <AnimatedBeam containerRef={containerRef} fromRef={l2} toRef={centerRef} gradientStartColor="#27a8c4" gradientStopColor="#176579" />
      <AnimatedBeam containerRef={containerRef} fromRef={l3} toRef={centerRef} curvature={80} endYOffset={10} gradientStartColor="#27a8c4" gradientStopColor="#176579" />
      <AnimatedBeam containerRef={containerRef} fromRef={r1} toRef={centerRef} curvature={-80} endYOffset={-10} reverse gradientStartColor="#27a8c4" gradientStopColor="#176579" />
      <AnimatedBeam containerRef={containerRef} fromRef={r2} toRef={centerRef} reverse gradientStartColor="#27a8c4" gradientStopColor="#176579" />
      <AnimatedBeam containerRef={containerRef} fromRef={r3} toRef={centerRef} curvature={80} endYOffset={10} reverse gradientStartColor="#27a8c4" gradientStopColor="#176579" />
    </div>
  );
}

export default SocialBeams;
