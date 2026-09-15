"use client";

import { useEffect, useState } from "react";
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
 * is pending, so the modal would have shown a code screen nobody could get a
 * code for. It now renders the same two forms /login does — PasswordAuthForm
 * and SignupForm — which means the two screens cannot drift apart, and all
 * three ways in complete without navigating: the forms are fetches and Google
 * runs in a popup.
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
  // Remounts the forms on each open, so a reopened dialog never resumes a
  // stranger's half-finished attempt on a shared machine.
  const [instance, setInstance] = useState(0);

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

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="fixed inset-0 z-[130] flex items-center justify-center p-4"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
        >
          <div className="absolute inset-0 bg-slate-900/50 backdrop-blur-[2px]" onClick={onClose} />

          {/* Scrollable, because the signup screen is taller than a short
              laptop viewport once the Google button and the terms line are
              under it — and a dialog whose submit button is unreachable is
              worse than one that scrolls. */}
          <motion.div
            role="dialog"
            aria-modal="true"
            aria-labelledby="login-modal-title"
            className="relative max-h-[92vh] w-full max-w-md overflow-y-auto rounded-2xl bg-white shadow-2xl"
            initial={{ opacity: 0, y: 24, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 16, scale: 0.98 }}
            transition={{ type: "tween", duration: 0.26, ease: [0.22, 1, 0.36, 1] }}
          >
            <div className="relative bg-gradient-to-br from-brand to-brand-dark px-7 pb-7 pt-8 text-white">
              <button
                onClick={onClose}
                aria-label="Close"
                className="absolute right-4 top-4 flex h-9 w-9 items-center justify-center rounded-full text-white/80 transition-colors hover:bg-white/15 hover:text-white cursor-pointer"
              >
                <X size={17} />
              </button>

              {/* The reason, where the brand name used to sit. Someone who
                  clicked "Request a Quote" and got a sign-in box needs to be
                  told why before anything else. */}
              <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-white/70">
                {reason ?? "AFFHAN"}
              </p>
              <h2 id="login-modal-title" className="mt-1.5 text-2xl font-bold tracking-tight">
                {heading}
              </h2>
              <p className="mt-1.5 text-sm text-white/80">{subheading}</p>
            </div>

            <div className="p-6">
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

              <div className="my-5 flex items-center gap-3">
                <span className="h-px flex-1 bg-slate-200" />
                <span className="text-[12px] font-medium uppercase tracking-wider text-slate-400">
                  or
                </span>
                <span className="h-px flex-1 bg-slate-200" />
              </div>

              <GoogleButton onSuccess={() => onSuccess?.()} />
              {method === "signup" && (
                <p className="mt-2 text-center text-[12px] text-slate-400">
                  Signing up with Google fills this in for you.
                </p>
              )}

              <p className="mt-4 text-[12px] leading-relaxed text-slate-400">
                By continuing you agree to our{" "}
                <Link href="/terms-conditions/" className="text-slate-500 underline hover:text-slate-700">
                  Terms
                </Link>{" "}
                and{" "}
                <Link href="/privacy-policy/" className="text-slate-500 underline hover:text-slate-700">
                  Privacy Policy
                </Link>
                .
              </p>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
