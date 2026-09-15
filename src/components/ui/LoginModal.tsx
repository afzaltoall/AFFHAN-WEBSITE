"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import Image from "next/image";
import Link from "next/link";
import { AnimatePresence, motion } from "framer-motion";
import { X } from "lucide-react";
import { PasswordAuthForm } from "@/components/ui/PasswordAuthForm";
import { SignupForm } from "@/components/ui/SignupForm";
import { GoogleButton } from "@/components/ui/GoogleButton";
import { lockBodyScroll } from "@/lib/scrollLock";

/**
 * Sign in without leaving the page.
 *
 * This is what stands in front of "Request a Quote" — see QuoteGateContext.
 * Sending someone to /login mid-inquiry loses the product they were looking
 * at, so sign-in happens here instead and the caller resumes straight into the
 * quote form.
 *
 * It used to render PhoneAuthForm, and would have been broken the day it was
 * wired up: /login stopped using the SMS path while Twilio production access
 * is pending. It now renders the same two forms /login does, so the two
 * screens cannot drift apart, and all three ways in complete without
 * navigating: the forms are fetches and Google runs in a popup.
 *
 * On the header: this had a tall teal gradient block with the brand name, a
 * 2xl heading and a subheading — three stacked lines of white-on-colour before
 * a single field. It is a white header with the logo now, for two reasons.
 * The modal that opens IMMEDIATELY after this one is the quote form, whose
 * header is white with the same logo, and going teal-then-white read as two
 * unrelated dialogs. And on the create-account screen the coloured block was
 * pure height in a dialog that was already close to the bottom of a laptop
 * viewport. The brand still opens the card, as a 3px rule.
 */
export function LoginModal({
  open,
  onClose,
  onSuccess,
  reason,
}: {
  open: boolean;
  onClose: () => void;
  /**
   * Fires after the session exists — used to resume whatever prompted the
   * login. The parent closes the dialog; this does not, so the resume and the
   * close cannot race.
   */
  onSuccess?: () => void;
  /** Why the visitor is seeing this, e.g. "Sign in to request a quote". */
  reason?: string;
}) {
  // Two screens, matching /login: signing in, and creating an account.
  const [method, setMethod] = useState<"password" | "signup">("password");
  // Portalled, so this cannot be trapped inside whatever stacking context its
  // caller happens to sit in. It opens ON TOP of the quote form — which is
  // z-300 and rendered inline by seven different components — and a z-index
  // only wins against a sibling.
  const [mounted, setMounted] = useState(false);
  // Remounts the forms on each open, so a reopened dialog never resumes a
  // stranger's half-finished attempt on a shared machine.
  const [instance, setInstance] = useState(0);

  useEffect(() => setMounted(true), []);

  useEffect(() => {
    if (open) {
      setInstance((n) => n + 1);
      setMethod("password");
    }
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  // Depth-counted, so this nests safely under a modal that already locked.
  useEffect(() => {
    if (!open) return;
    return lockBodyScroll();
  }, [open]);

  const { heading, subheading } =
    method === "password"
      ? { heading: "Sign in", subheading: "Use the email and password on your account." }
      : { heading: "Create your account", subheading: "One screen, and you are in — no code to wait for." };

  if (!mounted) return null;

  return createPortal(
    <AnimatePresence>
      {open && (
        <motion.div
          className="fixed inset-0 z-[400] flex items-center justify-center p-3 sm:p-4"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
        >
          <div className="absolute inset-0 bg-slate-900/50 backdrop-blur-[2px]" onClick={onClose} />

          {/* Scrollable, because the create-account screen is taller than a
              short laptop viewport once the Google button and the terms line
              are under it — and a dialog whose submit button cannot be reached
              is worse than one that scrolls. */}
          <motion.div
            role="dialog"
            aria-modal="true"
            aria-labelledby="login-modal-title"
            className="relative max-h-[92vh] w-full max-w-[28rem] overflow-y-auto rounded-2xl bg-white shadow-2xl ring-1 ring-slate-900/5"
            initial={{ opacity: 0, y: 24, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 16, scale: 0.98 }}
            transition={{ type: "tween", duration: 0.26, ease: [0.22, 1, 0.36, 1] }}
          >
            {/* The brand, spent in one place. */}
            <div aria-hidden="true" className="h-[3px] w-full bg-gradient-to-r from-brand to-brand-dark" />

            <div className="border-b border-slate-100 px-5 pb-3.5 pt-4 sm:px-6">
              <div className="flex items-start justify-between gap-4">
                <div className="relative h-9 w-28 shrink-0">
                  <Image src="/logo.png" alt="Affhan" fill className="object-contain object-left" priority />
                </div>
                <button
                  onClick={onClose}
                  aria-label="Close"
                  className="-mr-1.5 -mt-1 flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-600 cursor-pointer"
                >
                  <X size={17} />
                </button>
              </div>

              {/* Why this is on screen, before anything else. Someone who
                  clicked "Request a Quote" and got a sign-in box is owed an
                  explanation above the fold of the dialog. */}
              {reason && (
                <p className="mt-3.5 text-[10.5px] font-bold uppercase tracking-[0.16em] text-brand-dark">
                  {reason}
                </p>
              )}
              <h2
                id="login-modal-title"
                className={`${reason ? "mt-1" : "mt-4"} text-[21px] font-bold leading-tight tracking-tight text-slate-900`}
              >
                {heading}
              </h2>
              <p className="mt-1 text-[13px] leading-relaxed text-slate-500">{subheading}</p>
            </div>

            <div className="px-5 py-4 sm:px-6">
              {method === "password" ? (
                <PasswordAuthForm
                  key={`password-${instance}`}
                  onSuccess={() => onSuccess?.()}
                  onCreateAccount={() => setMethod("signup")}
                />
              ) : (
                <SignupForm
                  key={`signup-${instance}`}
                  onSuccess={() => onSuccess?.()}
                  onHaveAccount={() => setMethod("password")}
                />
              )}

              <div className="my-3.5 flex items-center gap-3">
                <span className="h-px flex-1 bg-slate-200" />
                <span className="text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-400">
                  or
                </span>
                <span className="h-px flex-1 bg-slate-200" />
              </div>

              <GoogleButton onSuccess={() => onSuccess?.()} />
              {method === "signup" && (
                <p className="mt-2 text-center text-[11.5px] text-slate-400">
                  Signing up with Google fills this in for you.
                </p>
              )}

              <p className="mt-3.5 text-center text-[11.5px] leading-relaxed text-slate-400">
                By continuing you agree to our{" "}
                <Link href="/terms-conditions/" className="text-slate-500 underline underline-offset-2 hover:text-slate-700">
                  Terms
                </Link>{" "}
                and{" "}
                <Link href="/privacy-policy/" className="text-slate-500 underline underline-offset-2 hover:text-slate-700">
                  Privacy Policy
                </Link>
                .
              </p>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body
  );
}
