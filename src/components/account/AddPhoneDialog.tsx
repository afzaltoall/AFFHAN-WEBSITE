"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion } from "framer-motion";
import { Loader2, X } from "lucide-react";
import { FlagSelect } from "@/components/ui/FlagSelect";
import { COUNTRIES, type Country } from "@/lib/countries";
import { contactE164, readContactPhone, splitE164 } from "@/lib/phone";
import { lockBodyScroll } from "@/lib/scrollLock";

const INDIA = COUNTRIES.find((c) => c.iso === "in") ?? COUNTRIES[0];

/**
 * Add or change the mobile number on an account: typed and saved, no code
 * (the owner, 2026-10-15; /api/web/account/phone, lib/contact-phone.ts).
 *
 * The number is for our team to call or WhatsApp about quotes, not a way to
 * sign in, so there is nothing to prove and nothing to wait for. Opens from
 * Account (Add number, Change) and after a Google sign-in on an account with
 * no number (PhonePromptContext). Closing it, by the cross, Escape or a click
 * outside, saves nothing.
 *
 * Uses the same dial picker as sign-up and the quote form: one list of
 * countries, one place to fix a wrong code. Portalled above everything,
 * including the sign-in dialog it can open over.
 */
export function AddPhoneDialog({
  open,
  current = null,
  onClose,
  onSaved,
}: {
  open: boolean;
  /** The number on the account now, to start from when changing it. */
  current?: string | null;
  onClose: () => void;
  /** Fires once the number is on the account, so the caller can re-read /me. */
  onSaved: () => void;
}) {
  const [mounted, setMounted] = useState(false);
  const [country, setCountry] = useState<Country>(INDIA);
  const [phone, setPhone] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => setMounted(true), []);

  // Each opening starts from the account as it is: its number when changing
  // one, an empty field otherwise. A half-typed number left in state would be
  // the previous person's on a shared machine.
  useEffect(() => {
    if (!open) return;
    const split = current ? splitE164(current) : null;
    const known = split ? COUNTRIES.find((c) => c.iso === split.iso) : undefined;
    setCountry(known ?? INDIA);
    setPhone(known && split ? split.national : "");
    setError(null);
    setBusy(false);
  }, [open, current]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  // Depth-counted, so this nests under the sign-in dialog's own lock.
  useEffect(() => {
    if (!open) return;
    return lockBodyScroll();
  }, [open]);

  // The field takes the cursor only where there is a mouse: on a phone, focus
  // opens the keyboard over the dialog before it has been read (as LoginModal).
  useEffect(() => {
    if (!open || !window.matchMedia("(pointer: fine)").matches) return;
    const t = setTimeout(() => inputRef.current?.focus(), 60);
    return () => clearTimeout(t);
  }, [open]);

  const save = async () => {
    if (busy) return;
    // The server's own check, run here first, so a mistyped number is answered
    // at once and in the same words. Too few digits for libphonenumber to read
    // still reach it, as dial code and digits, to be called too short.
    const digits = phone.replace(/\D/g, "");
    const read = readContactPhone(contactE164(phone, country.iso) ?? (digits ? `${country.dial}${digits}` : ""));
    if (!read.ok) {
      setError(read.error);
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/web/account/phone/", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ phone: read.e164 }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(typeof json?.error === "string" ? json.error : "Could not save the number. Please try again.");
        return;
      }
      onSaved();
      onClose();
    } catch {
      setError("Could not reach the server. Please try again.");
    } finally {
      setBusy(false);
    }
  };

  if (!mounted) return null;

  return createPortal(
    <AnimatePresence>
      {open && (
        <motion.div
          className="fixed inset-0 z-[410] flex items-center justify-center p-4"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
        >
          <div className="absolute inset-0 bg-slate-900/50 backdrop-blur-[2px]" onClick={onClose} />

          <motion.div
            role="dialog"
            aria-modal="true"
            aria-labelledby="phone-dialog-title"
            aria-describedby="phone-dialog-text"
            className="relative w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl"
            initial={{ opacity: 0, y: 20, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 12, scale: 0.98 }}
            transition={{ type: "tween", duration: 0.24, ease: [0.22, 1, 0.36, 1] }}
          >
            <button
              onClick={onClose}
              aria-label="Close"
              className="absolute right-3.5 top-3.5 flex h-8 w-8 items-center justify-center rounded-full text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-600 cursor-pointer"
            >
              <X size={16} />
            </button>

            <h2 id="phone-dialog-title" className="pr-8 text-lg font-bold tracking-tight text-slate-900">
              Your mobile number
            </h2>
            <p id="phone-dialog-text" className="mt-1 text-[13px] leading-relaxed text-slate-500">
              {current
                ? "Our team uses this number to call or WhatsApp you about your quotes."
                : "Add your mobile number so our team can call or WhatsApp you about your quotes."}
            </p>

            <div className="mt-5 space-y-4">
              <div className="flex items-stretch gap-2">
                <div className="w-[6.25rem] shrink-0">
                  <FlagSelect
                    mode="dial"
                    align="left"
                    selected={country}
                    onSelect={(c) => {
                      setCountry(c);
                      setError(null);
                    }}
                    buttonClassName="!h-[46px] !rounded-xl !bg-white !border-slate-200"
                    menuClassName="!w-[15.5rem] [&_ul]:!max-h-56"
                  />
                </div>
                <input
                  ref={inputRef}
                  type="tel"
                  inputMode="numeric"
                  autoComplete="tel-national"
                  aria-label="Mobile number"
                  placeholder="98765 43210"
                  value={phone}
                  onChange={(e) => {
                    setPhone(e.target.value.replace(/[^\d ]/g, ""));
                    setError(null);
                  }}
                  onKeyDown={(e) => e.key === "Enter" && phone.trim() && void save()}
                  className={inputClass}
                />
              </div>

              <button
                onClick={() => void save()}
                disabled={busy || !phone.trim()}
                className="flex w-full items-center justify-center gap-2 rounded-xl bg-brand-dark px-6 py-3 text-sm font-semibold text-white transition-all hover:bg-brand-deep disabled:cursor-not-allowed disabled:opacity-50 cursor-pointer"
              >
                {busy && <Loader2 size={15} className="animate-spin" />}
                Save number
              </button>

              {error && (
                <p role="alert" className="rounded-xl bg-red-50 px-4 py-2.5 text-[13px] text-red-700">
                  {error}
                </p>
              )}
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body
  );
}

const inputClass =
  "w-full rounded-xl border border-slate-200 px-4 py-3 text-sm outline-none transition-colors focus:border-brand focus:ring-2 focus:ring-brand/20";
