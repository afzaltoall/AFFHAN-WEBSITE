"use client";

import { useState } from "react";
import { Eye, EyeOff, Loader2 } from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { FlagSelect } from "@/components/ui/FlagSelect";
import { COUNTRIES, type Country } from "@/lib/countries";
import { checkPasswordStrength } from "@/lib/password-rules";

/**
 * Creating an account, on one screen.
 *
 * There is no OTP step here and this component calls no OTP route: not
 * send-otp, not verify-otp, not complete-profile. Twilio production access is
 * pending, and an account nobody can create is worse than a number nobody has
 * verified. The Twilio integration itself — PhoneAuthForm, send-otp,
 * verify-otp, phone-auth.ts — is left in the codebase untouched for the phase
 * that turns it back on; it is simply no longer wired to this path.
 *
 * The number is collected and stored unverified (phoneVerified stays false),
 * so whatever verification arrives later has something to verify. It is still
 * unique across accounts — the server answers a collision with a plain error
 * rather than letting two accounts share a number.
 */
export function SignupForm({
  onSuccess,
  onHaveAccount,
  autoFocus = true,
}: {
  onSuccess?: () => void;
  /** Back to the sign-in screen. */
  onHaveAccount: () => void;
  autoFocus?: boolean;
}) {
  const { refreshSession } = useAuth();

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [country, setCountry] = useState<Country>(
    COUNTRIES.find((c) => c.iso === "in") ?? COUNTRIES[0]
  );
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Checked here as well as on the server. The server is what decides; this is
  // so the answer arrives before a round trip rather than after one.
  const strength = checkPasswordStrength(password);
  const mismatch = confirm !== "" && password !== confirm;

  const ready =
    name.trim() !== "" &&
    email.trim() !== "" &&
    phone.trim() !== "" &&
    password !== "" &&
    confirm !== "";

  const submit = async () => {
    if (mismatch) {
      setError("Both passwords must match.");
      return;
    }
    if (!strength.ok) {
      setError(strength.error);
      return;
    }

    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/web/auth/signup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        // The session comes back as a cookie, so the request has to be
        // allowed to receive one.
        credentials: "include",
        body: JSON.stringify({
          name: name.trim(),
          email: email.trim(),
          // Joined here so the server sees one E.164 number rather than a
          // dial code and a local part it has to reassemble.
          phone: `${country.dial}${phone.replace(/\D/g, "")}`,
          password,
        }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(json?.error ?? "Could not create your account. Try again.");
        return;
      }
      await refreshSession();
      onSuccess?.();
    } catch {
      setError("Could not reach the server. Please try again.");
    } finally {
      setBusy(false);
    }
  };

  const onEnter = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && ready && !busy) void submit();
  };

  return (
    <div className="space-y-4">
      <label className="block">
        <span className="mb-1.5 block text-[13px] font-semibold text-slate-700">Full name</span>
        <input
          autoFocus={autoFocus}
          type="text"
          autoComplete="name"
          placeholder="Your name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={onEnter}
          className={inputClass}
        />
      </label>

      <label className="block">
        <span className="mb-1.5 block text-[13px] font-semibold text-slate-700">Email</span>
        <input
          type="email"
          autoComplete="email"
          placeholder="you@company.com"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          onKeyDown={onEnter}
          className={inputClass}
        />
      </label>

      <div className="block">
        <span className="mb-1.5 block text-[13px] font-semibold text-slate-700">Mobile number</span>
        <div className="flex items-stretch gap-2">
          {/* The same searchable dial picker the quote modal and the old phone
              form use — one list of countries, one set of flags. */}
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
            type="tel"
            inputMode="numeric"
            autoComplete="tel-national"
            placeholder="98765 43210"
            value={phone}
            onChange={(e) => setPhone(e.target.value.replace(/[^\d ]/g, ""))}
            onKeyDown={onEnter}
            className={inputClass}
          />
        </div>
      </div>

      <label className="block">
        <span className="mb-1.5 block text-[13px] font-semibold text-slate-700">Password</span>
        <span className="relative block">
          <input
            type={show ? "text" : "password"}
            autoComplete="new-password"
            placeholder="At least 8 characters"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            onKeyDown={onEnter}
            className={`${inputClass} pr-11`}
          />
          <button
            type="button"
            onClick={() => setShow((s) => !s)}
            aria-label={show ? "Hide password" : "Show password"}
            className="absolute right-1 top-1/2 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-lg text-slate-400 transition-colors hover:text-slate-600 cursor-pointer"
          >
            {show ? <EyeOff size={16} /> : <Eye size={16} />}
          </button>
        </span>
        {/* Only once they have started typing: a rule stated under an empty
            box reads as an error before anything is wrong. */}
        {password !== "" && !strength.ok && (
          <span className="mt-1.5 block text-[12px] text-amber-600">{strength.error}</span>
        )}
      </label>

      <label className="block">
        <span className="mb-1.5 block text-[13px] font-semibold text-slate-700">
          Confirm password
        </span>
        <input
          type={show ? "text" : "password"}
          autoComplete="new-password"
          placeholder="Type it again"
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
          onKeyDown={onEnter}
          className={inputClass}
        />
        {mismatch && (
          <span className="mt-1.5 block text-[12px] text-red-600">
            Both passwords must match.
          </span>
        )}
      </label>

      <button
        onClick={() => void submit()}
        disabled={busy || !ready || mismatch || !strength.ok}
        className="flex w-full items-center justify-center gap-2 rounded-xl bg-brand px-6 py-3 text-sm font-semibold text-white transition-all hover:bg-brand-dark disabled:cursor-not-allowed disabled:opacity-50 cursor-pointer"
      >
        {busy && <Loader2 size={15} className="animate-spin" />}
        Create account
      </button>

      <p className="pt-1 text-center text-[13px] text-slate-500">
        Already have an account?{" "}
        <button
          type="button"
          onClick={onHaveAccount}
          className="font-semibold text-brand underline-offset-2 transition-colors hover:text-brand-dark hover:underline cursor-pointer"
        >
          Sign in
        </button>
      </p>

      {error && (
        <p role="alert" className="rounded-xl bg-red-50 px-4 py-2.5 text-[13px] text-red-700">
          {error}
        </p>
      )}
    </div>
  );
}

const inputClass =
  "w-full rounded-xl border border-slate-200 px-4 py-3 text-sm outline-none transition-colors focus:border-brand focus:ring-2 focus:ring-brand/20";
