"use client";

import { useEffect, useMemo } from "react";
import Image from "next/image";
import Link from "next/link";
import { motion, useAnimationControls, useReducedMotion } from "framer-motion";
import { LoginBackground } from "@/components/ui/LoginBackground";
import { TiltCard, TravellingEdgeLight } from "@/components/ui/TiltCard";
import { RotatingQuote, type Quote } from "@/components/ui/RotatingQuote";
import { SignupMascot, type MascotFocus } from "@/components/ui/SignupMascot";

/**
 * The supplier door, in the customer sign-in's own style (the owner, 2026-10-21: "same as user login style"):
 * the worded half on white, with the rotating statement and the four characters that watch the cursor, and the
 * card on the moving teal ground, leaning toward the pointer with a light running its edge (app/login/page.tsx).
 *
 * What is the supplier's own: the statements, which speak to someone who makes things rather than buys them,
 * and the owner's delivery picture at the head of the card (public/images/supplier-mark.webp, a 4 KB copy of their
 * public/supplier.png at twice the size it is drawn). No shop navbar and no logo
 * over the panel: suppliers are a separate phase from customers (the owner), and the shop's bar, logo and
 * customer Login had sat over this page's corner. The way back to the shop is a line under the card.
 */

function supplierQuotes(count: number | null): Quote[] {
  const products = count ? `${count.toLocaleString("en-US")} products` : "Over a million products";
  return [
    {
      lead: "Supply the products our customers",
      accent: "ask us to source",
      sub: "Find yours in our catalogue, tell us your minimum order, and our sourcing team takes it from there.",
      facts: [products, "One short form", "Photos optional"],
    },
    {
      lead: "One account for",
      accent: "everything you make",
      sub: "Apply for as many products as you supply, including ones our catalogue doesn't list yet.",
      facts: ["Every category", "Your own products too", "Each application tracked"],
    },
    {
      lead: "Buying from factories",
      accent: "since 2000",
      sub: "Our sourcing team reviews every application and contacts you on WeChat or by phone.",
      facts: ["25 years", "Guangzhou desk", "7 offices worldwide"],
    },
  ];
}

export function SupplierAuthLayout({
  catalogueCount,
  focus,
  shake,
  children,
}: {
  catalogueCount: number | null;
  /** The field being typed into, for the characters beside the card. */
  focus: MascotFocus;
  /** Bumped on a refused attempt: the card shakes once, as a head does. */
  shake?: number;
  children: React.ReactNode;
}) {
  const quotes = useMemo(() => supplierQuotes(catalogueCount), [catalogueCount]);
  const card = useAnimationControls();
  const still = useReducedMotion();

  useEffect(() => {
    if (!shake || still) return;
    void card.start({ x: [0, -10, 9, -6, 4, 0], transition: { duration: 0.42, ease: "easeInOut" } });
  }, [shake, still, card]);

  return (
    <main className="grid min-h-dvh lg:min-h-screen lg:grid-cols-[1fr_1fr]">
      <div className="hidden flex-col justify-center bg-white lg:flex">
        <div className="w-full px-8 py-14 sm:px-12 lg:px-16 lg:py-16">
          <motion.p
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
            className="mb-6 flex items-center gap-3 text-[11px] font-bold uppercase tracking-[0.28em] text-brand-dark"
          >
            <span className="h-px w-8 bg-brand/40" />
            Supplier Centre
          </motion.p>
          <RotatingQuote quotes={quotes} />
        </div>
        <div className="px-8 pb-10 sm:px-12 lg:px-16">
          <SignupMascot focus={focus} />
        </div>
      </div>

      <div className="relative flex flex-col items-center justify-center overflow-hidden px-5 py-10 sm:px-8 lg:px-12 lg:py-8">
        <LoginBackground />

        <TiltCard className="relative w-full max-w-md">
          <motion.div
            initial={{ opacity: 0, y: 26, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1], delay: 0.15 }}
            className="relative"
          >
            <div aria-hidden="true" className="absolute -inset-3 rounded-3xl bg-white/10 blur-2xl" />
            <TravellingEdgeLight />
            {/* No overflow-hidden: the dial-code menu opens downward out of the card. */}
            <motion.div animate={card} data-login-card className="relative rounded-2xl border border-white/60 bg-white/95 px-6 py-5 shadow-2xl backdrop-blur-xl">
              {children}
            </motion.div>
          </motion.div>
        </TiltCard>

        <motion.p
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.6, delay: 0.6 }}
          className="relative mt-6 text-center text-[13px] text-white/80"
        >
          Buying from AFFHAN?{" "}
          <Link href="/login/" className="font-semibold text-white underline-offset-4 hover:underline">
            Customer sign in
          </Link>
          <span className="mx-2 text-white/40">·</span>
          <Link href="/" className="font-semibold text-white underline-offset-4 hover:underline">
            affhan.com
          </Link>
        </motion.p>
      </div>
    </main>
  );
}

/** The card's head: the owner's delivery picture, floating a little, beside the heading. */
export function SupplierCardHead({ title, sub }: { title: string; sub: string }) {
  const still = useReducedMotion();
  return (
    <div className="flex items-center gap-3.5">
      <motion.span
        aria-hidden="true"
        animate={still ? undefined : { y: [0, -4, 0] }}
        transition={{ duration: 3.4, repeat: Infinity, ease: "easeInOut" }}
        className="relative h-14 w-14 shrink-0"
      >
        <Image src="/images/supplier-mark.webp" alt="" width={56} height={56} priority className="h-14 w-14 drop-shadow-[0_8px_14px_rgba(11,34,48,0.18)]" />
      </motion.span>
      <div className="min-w-0">
        <motion.h1
          key={title}
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.32, ease: [0.22, 1, 0.36, 1] }}
          className="text-xl font-bold tracking-tight text-slate-900"
        >
          {title}
        </motion.h1>
        <motion.p
          key={sub}
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.32, ease: [0.22, 1, 0.36, 1], delay: 0.05 }}
          className="mt-0.5 text-[13px] leading-snug text-slate-500"
        >
          {sub}
        </motion.p>
      </div>
    </div>
  );
}
