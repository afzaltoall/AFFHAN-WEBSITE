"use client";

import { useEffect, useRef } from "react";
import Image from "next/image";
import Link from "next/link";
import { motion, useReducedMotion } from "framer-motion";
import { ArrowRight, Headset } from "lucide-react";
import { getCdnUrl } from "@/lib/cdn";

/** What was sent, as the form had it. */
export interface SentRequest {
  /** The name typed on the form, for the team's greeting. */
  name: string;
  /** The MOQ as the form showed it ("20 - 50 pcs"). */
  moq: string;
  /** What they wrote with it, if anything. */
  message: string;
}

/**
 * What a customer sees once a quote request is sent: an order confirmation
 * (the owner's words of 2026-10-07: "it was an order"). What they asked for,
 * with its picture, category, quantity and their note; then a word from the
 * sourcing team, by their first name, that the team will be in touch; and the
 * way to My Inquiries.
 *
 * Tried and turned down on the way, at the owner's word: a ticket with a tear
 * line and a RECEIVED stamp (the wrong thing for an order), a row of progress
 * steps, the time it was sent, the email and phone it went with ("just say we
 * will contact you"), and then a summary so plain it felt "very simplified".
 *
 * Everything on it is true: the reply time is the one the form already
 * promises, and there is no reference number, because nobody could look one
 * up.
 */
export function InquiryReceipt({
  product,
  image,
  sent,
  onClose,
  onTrack,
}: {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  product: any;
  image: string | null;
  sent: SentRequest | null;
  onClose: () => void;
  /** Called as the customer follows the link to My Inquiries (the overlay steps aside for the page). */
  onTrack: () => void;
}) {
  const still = !!useReducedMotion();
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    heading.current?.focus({ preventScroll: true });
  }, []);

  const firstName = (sent?.name ?? "").trim().split(/\s+/)[0] ?? "";
  const note = sent?.message.trim() ?? "";
  const category = product?.categoryRef?.name || product?.category || "";
  // Each part rises in, in order; nothing moves at all for reduced motion.
  const rise = (delay: number) =>
    still
      ? { initial: false as const, animate: { opacity: 1, y: 0 }, transition: { duration: 0 } }
      : { initial: { opacity: 0, y: 8 }, animate: { opacity: 1, y: 0 }, transition: { delay, duration: 0.38, ease: [0.2, 0.8, 0.2, 1] as const } };

  return (
    <motion.div key="success" {...rise(0)} className="flex h-full flex-col justify-center">
      <div className="flex items-center gap-4">
        <span className="relative flex h-12 w-12 shrink-0 items-center justify-center">
          {/* One soft ring as it lands, then still. */}
          {!still && (
            <motion.span
              aria-hidden="true"
              className="absolute inset-0 rounded-full bg-emerald-400/35"
              initial={{ scale: 0.8, opacity: 0.9 }}
              animate={{ scale: 1.9, opacity: 0 }}
              transition={{ delay: 0.12, duration: 0.9, ease: "easeOut" }}
            />
          )}
          <motion.span
            initial={still ? false : { scale: 0.5, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={still ? { duration: 0 } : { type: "spring", stiffness: 420, damping: 22 }}
            className="relative flex h-12 w-12 items-center justify-center rounded-full bg-gradient-to-br from-emerald-400 to-emerald-600 shadow-[0_10px_22px_-8px_rgba(5,150,105,0.65)]"
          >
            <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" aria-hidden="true">
              <motion.path
                d="M5 12.5l4.2 4.2L19 7"
                stroke="white"
                strokeWidth={3}
                strokeLinecap="round"
                strokeLinejoin="round"
                initial={still ? false : { pathLength: 0 }}
                animate={{ pathLength: 1 }}
                transition={still ? { duration: 0 } : { delay: 0.18, duration: 0.36, ease: "easeOut" }}
              />
            </svg>
          </motion.span>
        </span>
        <div className="min-w-0">
          {/* Focus moves here when the form gives way, so a screen reader says what happened. */}
          <h4 ref={heading} tabIndex={-1} className="text-[22px] font-black leading-tight tracking-tight text-slate-900 outline-none sm:text-[26px]">
            Inquiry received
          </h4>
          <p className="mt-0.5 text-[14.5px] text-slate-500">Your request is with our sourcing team.</p>
        </div>
      </div>

      {/* The order: what they asked for. */}
      <motion.section
        {...rise(0.1)}
        aria-label="Your inquiry"
        className="mt-6 rounded-2xl border border-slate-200/90 bg-white p-4 shadow-[0_1px_2px_rgba(15,23,42,0.04),0_10px_28px_-14px_rgba(15,23,42,0.18)]"
      >
        <div className="flex gap-4">
          <div className="relative h-20 w-20 shrink-0 overflow-hidden rounded-xl bg-slate-100 ring-1 ring-slate-200/70">
            {image ? <Image src={getCdnUrl(image, 200) as string} alt="" fill sizes="80px" className="object-cover" /> : null}
          </div>
          <div className="min-w-0 flex-1 self-center">
            {category ? <p className="truncate text-[10.5px] font-bold uppercase tracking-[0.14em] text-[#336888]">{category}</p> : null}
            <p className="mt-0.5 line-clamp-2 text-[15px] font-bold leading-snug text-slate-800">{product?.name}</p>
            {sent?.moq ? (
              <span className="mt-2 inline-flex items-center gap-1.5 rounded-full bg-slate-100 px-2.5 py-1 text-[12px] font-semibold text-slate-600">
                Quantity <span className="tabular-nums text-slate-800">{sent.moq}</span>
              </span>
            ) : null}
          </div>
        </div>
        {note ? (
          // The padding on a box of its own: on the clamped line itself, a third line showed through it.
          <div className="mt-3.5 rounded-xl bg-slate-50 px-3.5 py-2.5">
            <p className="line-clamp-2 text-[13px] leading-snug text-slate-600">
              <span className="font-semibold text-slate-700">Your note: </span>
              {note}
            </p>
          </div>
        ) : null}
      </motion.section>

      {/* A word from the team, the way they will be in touch. */}
      <motion.div
        initial={still ? false : { opacity: 0, y: 6, scale: 0.96 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={still ? { duration: 0 } : { delay: 0.42, type: "spring", stiffness: 380, damping: 26 }}
        style={{ transformOrigin: "top left" }}
        className="mt-5 flex items-start gap-3"
      >
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[#336888] text-white shadow-[0_6px_14px_-6px_rgba(51,104,136,0.7)]">
          <Headset size={18} aria-hidden="true" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-[12px] font-bold text-slate-700">AFFHAN Sourcing Team</p>
          <p className="mt-1 rounded-2xl rounded-tl-md bg-[#336888]/[0.07] px-4 py-3 text-[14px] leading-relaxed text-slate-700">
            {`Hi ${firstName || "there"}, thanks for your inquiry! We'll contact you with a quote, usually within 24 hours.`}
          </p>
        </div>
      </motion.div>

      <motion.div {...rise(0.55)} className="mt-6 flex flex-col gap-2.5 sm:flex-row">
        <Link
          href="/account/inquiries/"
          onClick={onTrack}
          className="inline-flex flex-1 items-center justify-center gap-2 rounded-xl bg-[#336888] px-5 py-3.5 text-[15px] font-bold text-white shadow-md transition-all hover:bg-[#27506a] hover:shadow-lg"
        >
          Track it in My Inquiries <ArrowRight size={17} aria-hidden="true" />
        </Link>
        <button
          type="button"
          onClick={onClose}
          className="inline-flex flex-1 items-center justify-center rounded-xl border border-slate-200 bg-white px-5 py-3.5 text-[15px] font-bold text-slate-700 transition-colors hover:border-slate-300 hover:bg-slate-50"
        >
          Continue browsing
        </button>
      </motion.div>
    </motion.div>
  );
}
