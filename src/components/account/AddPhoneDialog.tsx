"use client";

import { useEffect, useMemo, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Loader2, X } from "lucide-react";
import { FlagSelect } from "@/components/ui/FlagSelect";
import { COUNTRIES, type Country } from "@/lib/countries";

const OTP_LENGTH = 6;

/**
 * Add a mobile number to an account that has none.
 *
 * A dialog rather than an inline field, because adding a number is not editing
 * a field — it is proving one, and the two steps need somewhere of their own
 * to happen. Reusing the account form's input would have made "Save changes"
 * mean two different things depending on which row you touched.
 *
 * Uses the same dial picker as sign-in and the quote modal: one list of
 * countries, one place to fix a wrong code.
 */
export function AddPhoneDialog({
  open,
  onClose,
  onAdded,
}: {
  open: boolean;
  onClose: () => void;
  /** Fires once the number is on the account, so the page can re-read /me. */
  onAdded: () => void;
}) {
  const [step, setStep] = useState<"phone" | "otp">("phone");
  const [country, setCountry] = useState<Country>(
    () => COUNTRIES.find((c) => c.iso === "in") ?? COUNTRIES[0]
  );
  const [phone, setPhone] = useState("");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [cooldown, setCooldown] = useState(0);

  const fullPhone = useMemo(
    () => `${country.dial}${phone.replace(/\D/g, "")}`,
    [country, phone]
  );

  // Reopening starts clean: a half-finished attempt left in state would be the
  // previous person's on a shared machine.
  useEffect(() => {
    if (!open) return;
    setStep("phone");
    setPhone("");
    setCode("");
    setError(null);
    setBusy(false);
  }, [open]);

  useEffect(() => {
    if (cooldown <= 0) return;
    const t = setTimeout(() => setCooldown((c) => c - 1), 1000);
    return () => clearTimeout(t);
  }, [cooldown]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  const post = async (payload: Record<string, unknown>) => {
    const res = await fetch("/api/web/auth/add-phone", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify(payload),
    });
    return { res, json: await res.json().catch(() => ({})) };
  };

  const send = async () => {
    setBusy(true);
    setError(null);
    const { res, json } = await post({ step: "send", phone: fullPhone });
    setBusy(false);
    if (!res.ok) {
      setError(json?.error ?? "Could not send the code.");
      if (json?.cooldownSeconds) setCooldown(json.cooldownSeconds);
      return;
    }
    setCooldown(json?.cooldownSeconds ?? 30);
    setStep("otp");
  };

  const verify = async () => {
    setBusy(true);
    setError(null);
    const { res, json } = await post({ step: "verify", phone: fullPhone, code });
    setBusy(false);
    if (!res.ok) {
      setError(json?.error ?? "That code did not work.");
      return;
    }
    onAdded();
    onClose();
  };

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
            aria-labelledby="add-phone-title"
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

            <h2 id="add-phone-title" className="text-lg font-bold tracking-tight text-slate-900">
              {step === "phone" ? "Add your mobile number" : "Enter the code"}
            </h2>
            <p className="mt-1 text-[13px] text-slate-500">
              {step === "phone"
                ? "We'll text you a code to confirm it's yours. After this you can sign in with the number too."
                : `Sent to ${fullPhone}`}
            </p>

            <div className="mt-5 space-y-4">
              {step === "phone" ? (
                <>
                  <div className="flex items-stretch gap-2">
                    <div className="w-[6.25rem] shrink-0">
                      <FlagSelect
                        mode="dial"
                        align="left"
                        selected={country}
                        onSelect={setCountry}
                        buttonClassName="!h-[46px] !rounded-xl !bg-white !border-slate-200"
                        menuClassName="!w-[15.5rem] [&_ul]:!max-h-56"
                      />
                    </div>
                    <input
                      autoFocus
                      type="tel"
                      inputMode="numeric"
                      autoComplete="tel-national"
                      placeholder="98765 43210"
                      value={phone}
                      onChange={(e) => setPhone(e.target.value.replace(/[^\d ]/g, ""))}
                      onKeyDown={(e) =>
                        e.key === "Enter" && phone.trim() && !busy && void send()
                      }
                      className={inputClass}
                    />
                  </div>

                  <Primary onClick={send} busy={busy} disabled={!phone.trim()}>
                    Send OTP
                  </Primary>
                </>
              ) : (
                <>
                  <input
                    autoFocus
                    type="text"
                    inputMode="numeric"
                    autoComplete="one-time-code"
                    maxLength={OTP_LENGTH}
                    placeholder="••••••"
                    value={code}
                    onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
                    onKeyDown={(e) =>
                      e.key === "Enter" && code.length === OTP_LENGTH && !busy && void verify()
                    }
                    className={`${inputClass} text-center text-lg font-semibold tracking-[0.5em]`}
                  />

                  <Primary onClick={verify} busy={busy} disabled={code.length !== OTP_LENGTH}>
                    Add number
                  </Primary>

                  <div className="flex items-center justify-between text-[13px]">
                    <button
                      onClick={() => {
                        setError(null);
                        setStep("phone");
                      }}
                      className="font-medium text-slate-500 transition-colors hover:text-slate-700 cursor-pointer"
                    >
                      Change number
                    </button>
                    <button
                      onClick={() => void send()}
                      disabled={cooldown > 0 || busy}
                      className="font-medium text-slate-500 transition-colors enabled:hover:text-brand-dark disabled:cursor-not-allowed disabled:opacity-60 cursor-pointer"
                    >
                      {cooldown > 0 ? `Resend in ${cooldown}s` : "Resend code"}
                    </button>
                  </div>
                </>
              )}

              {error && (
                <p
                  role="alert"
                  className="rounded-xl bg-red-50 px-4 py-2.5 text-[13px] text-red-700"
                >
                  {error}
                </p>
              )}
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

const inputClass =
  "w-full rounded-xl border border-slate-200 px-4 py-3 text-sm outline-none transition-colors focus:border-brand focus:ring-2 focus:ring-brand/20";

function Primary({
  onClick,
  busy,
  disabled,
  children,
}: {
  onClick: () => void | Promise<void>;
  busy: boolean;
  disabled?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={() => void onClick()}
      disabled={busy || disabled}
      className="flex w-full items-center justify-center gap-2 rounded-xl bg-brand px-6 py-3 text-sm font-semibold text-white transition-all hover:bg-brand-dark disabled:cursor-not-allowed disabled:opacity-50 cursor-pointer"
    >
      {busy && <Loader2 size={15} className="animate-spin" />}
      {children}
    </button>
  );
}
