"use client";

import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { X } from "lucide-react";
import {
  PhoneAuthForm,
  authCopy,
  type PhoneAuthIntent,
  type PhoneAuthStep,
} from "@/components/ui/PhoneAuthForm";
import { GoogleButton } from "@/components/ui/GoogleButton";

/**
 * Sign in without leaving the page.
 *
 * Currently unwired — the navbar sends people to /login instead. It is kept
 * because the "Inquire Now" flow needs sign-in to happen in place: sending
 * someone to a page mid-inquiry loses the product they were looking at.
 *
 * The fields, validation and requests come from PhoneAuthForm, the same
 * component the /login page uses, so the two can never drift apart.
 */
export function LoginModal({
  open,
  onClose,
  onSuccess,
}: {
  open: boolean;
  onClose: () => void;
  /** Fires after the session exists — used to resume whatever prompted the login. */
  onSuccess?: () => void;
}) {
  const [step, setStep] = useState<PhoneAuthStep>("phone");
  const [intent, setIntent] = useState<PhoneAuthIntent>("signin");
  const [phone, setPhone] = useState("");
  // Remounts the form on each open, so a reopened dialog never resumes a
  // stranger's half-finished attempt on a shared machine.
  const [instance, setInstance] = useState(0);

  useEffect(() => {
    if (open) {
      setInstance((n) => n + 1);
      setStep("phone");
      setIntent("signin");
    }
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  const { heading, subheading } = authCopy(step, intent, phone);

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

          <motion.div
            role="dialog"
            aria-modal="true"
            aria-labelledby="login-modal-title"
            className="relative w-full max-w-md overflow-hidden rounded-2xl bg-white shadow-2xl"
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

              <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-white/70">
                Affhan Group
              </p>
              <h2 id="login-modal-title" className="mt-1.5 text-2xl font-bold tracking-tight">
                {heading}
              </h2>
              <p className="mt-1.5 text-sm text-white/80">{subheading}</p>
            </div>

            <div className="p-6">
              <PhoneAuthForm
                key={instance}
                onSuccess={() => {
                  onSuccess?.();
                  onClose();
                }}
                onStepChange={setStep}
                onIntentChange={setIntent}
                onPhoneChange={setPhone}
              />

              {step === "phone" && (
                <>
                  <div className="my-5 flex items-center gap-3">
                    <span className="h-px flex-1 bg-slate-200" />
                    <span className="text-[12px] font-medium uppercase tracking-wider text-slate-400">
                      or
                    </span>
                    <span className="h-px flex-1 bg-slate-200" />
                  </div>
                  <GoogleButton onSuccess={() => { onSuccess?.(); onClose(); }} />
                </>
              )}
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
