"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Check, Eye, EyeOff, Loader2 } from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { FlagSelect } from "@/components/ui/FlagSelect";
import { COUNTRIES, type Country } from "@/lib/countries";
import { checkPasswordStrength } from "@/lib/password-rules";

export type PhoneAuthStep = "phone" | "otp" | "profile";
/** Which door someone came through. See `authCopy` for what it changes. */
export type PhoneAuthIntent = "signin" | "signup";

const OTP_LENGTH = 6;

/**
 * The heading and the line under it, for whichever surface is drawing the form.
 *
 * Lives here rather than in the page and the modal because both were spelling
 * out the same three-way conditional, and a fourth state would have had to be
 * remembered in two files.
 *
 * Worth being clear about what `intent` is: it changes the wording, not the
 * request. The number decides what happens — an existing one signs in, a new
 * one is asked to introduce itself — so someone who picks the wrong door still
 * lands in the right place. The choice exists because a card that only says
 * "Sign in" reads as a locked door to a first-time visitor, not because there
 * are two different flows behind it.
 */
export function authCopy(step: PhoneAuthStep, intent: PhoneAuthIntent, phone?: string) {
  if (step === "otp") {
    return { heading: "Enter the code", subheading: `Sent to ${phone || "your number"}` };
  }
  if (step === "profile") {
    return {
      heading: "Almost done",
      subheading: "Your name, email and a password. The number is already verified.",
    };
  }
  return intent === "signup"
    ? {
        heading: "Create your account",
        subheading: "Confirm your number, then choose a password.",
      }
    : { heading: "Sign in with your phone", subheading: "We'll text you a code to confirm it's you." };
}

/**
 * The sign-in / sign-up flow, without any shell around it.
 *
 * Extracted so the /login page and LoginModal render the same fields, the same
 * validation and the same requests. Two copies of a sign-in form is exactly the
 * kind of duplication that ends with one of them quietly falling behind.
 *
 * Three steps, but only two for most people. The first screen asks for nothing
 * but the number: whether someone needs to introduce themselves depends on
 * whether the number already has an account, and only the server knows that.
 * A returning customer verifies and is in. A number we have never seen comes
 * back as a 409 carrying a signupToken, and only then does the profile step
 * appear to collect a name and email — once, for genuinely new numbers.
 *
 * The caller owns the surroundings: the page draws a card, the modal draws a
 * dialog, and both are told which step is showing so their heading can follow.
 */
export function PhoneAuthForm({
  onSuccess,
  onStepChange,
  onIntentChange,
  onPhoneChange,
  onUsePassword,
  initialIntent = "signin",
  autoFocus = true,
}: {
  onSuccess?: () => void;
  /**
   * Which door this was opened through. The caller knows — it has a "Create
   * an account" link and a "sign in with a code instead" link, and they mean
   * different things — and the form cannot work it out for itself.
   */
  initialIntent?: PhoneAuthIntent;
  /** Back to email + password. Absent when there is nowhere to go back to. */
  onUsePassword?: () => void;
  onStepChange?: (step: PhoneAuthStep) => void;
  onIntentChange?: (intent: PhoneAuthIntent) => void;
  onPhoneChange?: (phone: string) => void;
  autoFocus?: boolean;
}) {
  const { refreshSession } = useAuth();

  const [step, setStepState] = useState<PhoneAuthStep>("phone");
  const [intent, setIntentState] = useState<PhoneAuthIntent>(initialIntent);
  const [phone, setPhone] = useState("");
  // India first because most customers are here, but every country is
  // selectable — a fixed "+91" made everyone else read the small print and
  // type their own code.
  const [country, setCountry] = useState<Country>(
    () => COUNTRIES.find((c) => c.iso === "in") ?? COUNTRIES[0]
  );

  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [signupToken, setSignupToken] = useState<string | null>(null);

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [cooldown, setCooldown] = useState(0);

  const firstFieldRef = useRef<HTMLInputElement | null>(null);

  // What actually goes to the server. The field holds the local number; the
  // dial code is the dropdown's business.
  const fullPhone = useMemo(
    () => `${country.dial}${phone.replace(/\D/g, "")}`,
    [country, phone]
  );

  const setStep = useCallback(
    (next: PhoneAuthStep) => {
      setStepState(next);
      onStepChange?.(next);
    },
    [onStepChange]
  );

  const setIntent = useCallback(
    (next: PhoneAuthIntent) => {
      setIntentState(next);
      onIntentChange?.(next);
    },
    [onIntentChange]
  );

  // Announce the opening intent once, so the caller's heading is right on the
  // first render rather than only after something is clicked.
  useEffect(() => {
    onIntentChange?.(initialIntent);
    // Deliberately once, on mount: after this the form owns the intent.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    onPhoneChange?.(fullPhone);
  }, [fullPhone, onPhoneChange]);

  useEffect(() => {
    if (autoFocus) firstFieldRef.current?.focus();
  }, [step, autoFocus]);

  useEffect(() => {
    if (cooldown <= 0) return;
    const t = setTimeout(() => setCooldown((c) => c - 1), 1000);
    return () => clearTimeout(t);
  }, [cooldown]);

  const post = useCallback(async (path: string, body: unknown) => {
    const res = await fetch(`/api/web/auth/${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      // The session comes back as a cookie, so the request has to be allowed
      // to carry and receive one.
      credentials: "include",
      body: JSON.stringify(body),
    });
    const json = await res.json().catch(() => ({}));
    return { res, json };
  }, []);

  const sendOtp = async () => {
    setBusy(true);
    setError(null);
    const { res, json } = await post("send-otp", { phone: fullPhone });
    setBusy(false);
    if (!res.ok) {
      setError(json?.error ?? "Could not send the code.");
      if (json?.cooldownSeconds) setCooldown(json.cooldownSeconds);
      return;
    }
    setCooldown(json?.cooldownSeconds ?? 30);
    setStep("otp");
  };

  const verifyOtp = async () => {
    setBusy(true);
    setError(null);
    const { res, json } = await post("verify-otp", { phone: fullPhone, code });
    setBusy(false);

    if (res.status === 409 && json?.needsProfile) {
      // The number has no account. Whichever door they picked, they are
      // signing up — correct the intent so the heading above stops promising
      // a sign-in that is not what is about to happen.
      setSignupToken(json.signupToken);
      setIntent("signup");
      setStep("profile");
      return;
    }
    if (!res.ok) {
      setError(json?.error ?? "That code did not work.");
      return;
    }
    await refreshSession();
    onSuccess?.();
  };

  const completeProfile = async () => {
    setBusy(true);
    setError(null);
    const { res, json } = await post("complete-profile", {
      signupToken,
      firstName: firstName.trim(),
      lastName: lastName.trim(),
      email: email.trim(),
      password,
    });
    setBusy(false);
    if (!res.ok) {
      setError(json?.error ?? "Could not finish signing you up.");
      return;
    }
    await refreshSession();
    onSuccess?.();
  };

  const emailLooksValid = /^[^s@]+@[^s@]+.[^s@]+$/.test(email.trim());
  // The same function the server calls, so the button and the API cannot
  // disagree about what an acceptable password is.
  const passwordCheck = checkPasswordStrength(password);
  const passwordsMatch = password !== "" && password === confirm;
  const profileReady = firstName.trim() !== "" && emailLooksValid && passwordCheck.ok && passwordsMatch;

  const goBack = () => {
    setError(null);
    setStep(step === "profile" ? "otp" : "phone");
  };

  return (
    <div className="space-y-4">
      {step === "phone" && (
        <>
          {/* The number and nothing else. Who someone is only matters once the
              code proves the number is theirs, and only if it turns out to be a
              number we have never seen — which is the server's answer to give,
              not a form's question to ask up front. A returning customer would
              otherwise be introducing themselves on every sign-in. */}
          <Field label="Mobile number">
            <div className="flex items-stretch gap-2">
              {/* The same searchable dial picker the quote modal uses, rather
                  than a second one built here — one list of countries, one set
                  of flags, one place to fix a wrong code. */}
              <div className="w-[6.25rem] shrink-0">
                <FlagSelect
                  mode="dial"
                  align="left"
                  selected={country}
                  onSelect={setCountry}
                  buttonClassName="!h-[46px] !rounded-xl !bg-white !border-slate-200"
                  // Tighter than the default 18rem: inside a login card that
                  // panel is wider than the card's own content column.
                  menuClassName="!w-[15.5rem] [&_ul]:!max-h-56"
                />
              </div>
              <input
                ref={firstFieldRef}
                type="tel"
                inputMode="numeric"
                autoComplete="tel-national"
                placeholder="98765 43210"
                value={phone}
                onChange={(e) => setPhone(e.target.value.replace(/[^\d ]/g, ""))}
                onKeyDown={(e) => e.key === "Enter" && phone.trim() && !busy && void sendOtp()}
                className={inputClass}
              />
            </div>
          </Field>

          {/* Only the number is required. Saying so stops a returning customer
              wondering why they are being asked to introduce themselves again,
              and tells a new one there is no password to think up. */}
          <p className="text-[12px] text-slate-400">
            {intent === "signup"
              ? "We'll text a code to confirm the number, then you choose a password."
              : "We'll text you a code — no password needed for this way in."}
          </p>

          <Primary onClick={sendOtp} busy={busy} disabled={!phone.trim()}>
            Send OTP
          </Primary>

          {/* Where each screen sends someone who is on the wrong one.
              These are not symmetrical, because the two screens are not:

              Signing up is the ONLY way to make an account, and it has to
              start with a code — a number nobody has proved is not an
              identity. So this screen offers no way to create an account
              with an email and a password; "Sign in" here means "I already
              have one", and that belongs on the password screen.

              Signing in with a code is a fallback, for the accounts that
              existed before passwords. So that screen keeps both doors: back
              to email and password, or on to creating an account. */}
          {intent === "signup" ? (
            <p className="pt-1 text-center text-[13px] text-slate-500">
              Already have an account?{" "}
              <button
                type="button"
                onClick={() => {
                  setError(null);
                  // Back to email and password, which is where a returning
                  // customer belongs. Only if there is one to go back to —
                  // a caller without a password screen falls back to the
                  // code sign-in rather than to nowhere.
                  if (onUsePassword) onUsePassword();
                  else setIntent("signin");
                }}
                className="font-semibold text-brand underline-offset-2 transition-colors hover:text-brand-dark hover:underline cursor-pointer"
              >
                Sign in
              </button>
            </p>
          ) : (
            <>
              <p className="pt-1 text-center text-[13px] text-slate-500">
                New to Affhan?{" "}
                <button
                  type="button"
                  onClick={() => {
                    setError(null);
                    setIntent("signup");
                  }}
                  className="font-semibold text-brand underline-offset-2 transition-colors hover:text-brand-dark hover:underline cursor-pointer"
                >
                  Create an account
                </button>
              </p>

              {onUsePassword && (
                <p className="text-center text-[13px] text-slate-500">
                  <button
                    type="button"
                    onClick={onUsePassword}
                    className="font-medium underline-offset-2 transition-colors hover:text-slate-700 hover:underline cursor-pointer"
                  >
                    Use email and password
                  </button>
                </p>
              )}
            </>
          )}
        </>
      )}

      {step === "otp" && (
        <>
          <Field label={`${OTP_LENGTH}-digit code`}>
            <input
              ref={firstFieldRef}
              type="text"
              inputMode="numeric"
              autoComplete="one-time-code"
              maxLength={OTP_LENGTH}
              placeholder="••••••"
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
              onKeyDown={(e) =>
                e.key === "Enter" && code.length === OTP_LENGTH && !busy && void verifyOtp()
              }
              className={`${inputClass} text-center text-lg font-semibold tracking-[0.5em]`}
            />
          </Field>

          <Primary onClick={verifyOtp} busy={busy} disabled={code.length !== OTP_LENGTH}>
            Verify
          </Primary>

          <div className="flex items-center justify-between text-[13px]">
            <button
              onClick={goBack}
              className="font-medium text-slate-500 transition-colors hover:text-slate-700 cursor-pointer"
            >
              Change number
            </button>
            <button
              onClick={() => void sendOtp()}
              disabled={cooldown > 0 || busy}
              className="font-medium text-slate-500 transition-colors enabled:hover:text-brand-dark disabled:cursor-not-allowed disabled:opacity-60 cursor-pointer"
            >
              {cooldown > 0 ? `Resend in ${cooldown}s` : "Resend code"}
            </button>
          </div>
        </>
      )}

      {step === "profile" && (
        <>
          <div className="grid grid-cols-2 gap-3">
            <Field label="First name">
              <input
                ref={firstFieldRef}
                type="text"
                autoComplete="given-name"
                placeholder="Afzal"
                value={firstName}
                onChange={(e) => setFirstName(e.target.value)}
                className={inputClass}
              />
            </Field>
            <Field label="Last name">
              <input
                type="text"
                autoComplete="family-name"
                placeholder="Khan"
                value={lastName}
                onChange={(e) => setLastName(e.target.value)}
                className={inputClass}
              />
            </Field>
          </div>
          <Field label="Email">
            <input
              type="email"
              autoComplete="email"
              placeholder="you@company.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && profileReady && !busy && void completeProfile()}
              className={inputClass}
            />
            <p className="mt-1.5 text-[12px] text-slate-400">
              Where your quotes go — and how you&apos;ll sign in next time.
            </p>
          </Field>

          <Field label="Password">
            <span className="relative block">
              <input
                type={showPassword ? "text" : "password"}
                autoComplete="new-password"
                placeholder="At least 8 characters"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className={`${inputClass} pr-11`}
              />
              <button
                type="button"
                onClick={() => setShowPassword((v) => !v)}
                aria-label={showPassword ? "Hide password" : "Show password"}
                className="absolute right-1 top-1/2 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-lg text-slate-400 transition-colors hover:text-slate-600 cursor-pointer"
              >
                {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </span>
            {/* Only once they have typed something. Telling someone their
                empty password is too short is noise. */}
            {password !== "" && !passwordCheck.ok && (
              <p className="mt-1.5 text-[12px] text-amber-700">{passwordCheck.error}</p>
            )}
          </Field>

          <Field label="Confirm password">
            <input
              type={showPassword ? "text" : "password"}
              autoComplete="new-password"
              placeholder="Type it again"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && profileReady && !busy && void completeProfile()}
              className={inputClass}
            />
            {confirm !== "" && !passwordsMatch && (
              <p className="mt-1.5 text-[12px] text-amber-700">Those don&apos;t match.</p>
            )}
          </Field>

          {/* The number is the third part of the account, so it belongs on the
              screen that creates one — shown rather than asked, because the
              code just proved it. Editing it here would mean proving a
              different number, which is what going back is for. */}
          <Field label="Mobile number">
            <div className="flex items-center justify-between rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
              <span className="text-sm font-medium text-slate-700">{fullPhone}</span>
              <span className="inline-flex items-center gap-1 text-[12px] font-medium text-emerald-600">
                <Check size={13} />
                Verified
              </span>
            </div>
          </Field>

          <Primary onClick={completeProfile} busy={busy} disabled={!profileReady}>
            Create account
          </Primary>

          <button
            type="button"
            onClick={goBack}
            className="w-full text-center text-[13px] font-medium text-slate-500 transition-colors hover:text-slate-700 cursor-pointer"
          >
            Use a different number
          </button>
        </>
      )}

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

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-[13px] font-semibold text-slate-700">{label}</span>
      {children}
    </label>
  );
}

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
