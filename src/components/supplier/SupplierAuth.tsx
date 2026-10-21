"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { CheckCircle2, Eye, EyeOff, Loader2 } from "lucide-react";
import { Turnstile, type TurnstileInstance } from "@marsidev/react-turnstile";
import {
  authFieldError,
  authFormError,
  authInput,
  authLabel,
  authPrimaryButton,
  authResetButton,
  authStack,
  authSwitchLink,
  authSwitchRow,
} from "@/components/ui/authFieldStyles";
import type { MascotFocus } from "@/components/ui/SignupMascot";
import { SupplierAuthLayout, SupplierCardHead } from "@/components/supplier/SupplierAuthLayout";
import { MobileNumberField } from "@/components/supplier/MobileNumberField";
import { checkPasswordStrength } from "@/lib/password-rules";
import { isValidMobileE164 } from "@/lib/phone";
import { TURNSTILE_SITE_KEY } from "@/lib/turnstile-site-key";

type Mode = "signin" | "signup";

const HEAD: Record<Mode, { title: string; sub: string; path: string; doc: string }> = {
  signin: {
    title: "Supplier sign in",
    sub: "For factories and traders who supply AFFHAN.",
    path: "/supplier/login/",
    doc: "Supplier sign in | AFFHAN Supplier Centre",
  },
  signup: {
    title: "Create your supplier account",
    sub: "Your company details are asked when you apply for a product.",
    path: "/supplier/register/",
    doc: "Create a supplier account | AFFHAN Supplier Centre",
  },
};

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const EASE = [0.22, 1, 0.36, 1] as const;

/**
 * The supplier door: sign in, or create an account, on one card (the owner, 2026-10-21: "same as user login
 * style ... supplier separate phase, users separate phase"). The customer sign-in's two screens, against the
 * supplier's own routes and table, so the two kinds of account never meet.
 *
 * /supplier/login/ opens on signing in and /supplier/register/ on creating an account; switching between the
 * two happens in place, the card easing to its new height while one form gives way to the other, and the
 * address follows, so a reload stays where the supplier is.
 *
 * Creating an account asks what a customer's sign-up asks, name, email, mobile and password. The company, the
 * WeChat ID and the address come with the first application, once the supplier has seen what there is to
 * apply for.
 */
export function SupplierAuth({ initialMode, catalogueCount }: { initialMode: Mode; catalogueCount: number | null }) {
  const [mode, setMode] = useState<Mode>(initialMode);
  const [focus, setFocus] = useState<MascotFocus>(null);
  const [shake, setShake] = useState(0);

  const switchTo = useCallback((next: Mode) => {
    setMode(next);
    setFocus(null);
    window.history.replaceState(null, "", HEAD[next].path);
    document.title = HEAD[next].doc;
  }, []);

  // The first field takes the cursor where there is a mouse, on arrival and on each switch (as on /login/): a
  // phone's keyboard would otherwise open over the card before the supplier has read it.
  useEffect(() => {
    if (!window.matchMedia("(pointer: fine)").matches) return;
    const t = window.setTimeout(() => document.querySelector<HTMLInputElement>("[data-login-card] form input")?.focus(), 340);
    return () => window.clearTimeout(t);
  }, [mode]);

  const refused = useCallback(() => setShake((n) => n + 1), []);

  return (
    <SupplierAuthLayout catalogueCount={catalogueCount} focus={focus} shake={shake}>
      <SupplierCardHead title={HEAD[mode].title} sub={HEAD[mode].sub} />
      <AutoHeight>
        <AnimatePresence mode="wait" initial={false}>
          <motion.div
            key={mode}
            initial={{ opacity: 0, x: mode === "signup" ? 24 : -24 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: mode === "signup" ? -24 : 24 }}
            transition={{ duration: 0.26, ease: EASE }}
            className="pt-4"
          >
            {mode === "signin" ? (
              <SignInForm onCreateAccount={() => switchTo("signup")} onFieldFocus={setFocus} onRefused={refused} />
            ) : (
              <SignUpForm onHaveAccount={() => switchTo("signin")} onFieldFocus={setFocus} onRefused={refused} />
            )}
          </motion.div>
        </AnimatePresence>
      </AutoHeight>
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
    </SupplierAuthLayout>
  );
}

/**
 * Eases the card to its content's height when the form inside changes. Clipped only while it moves: at rest
 * the dial-code menu has to be free to open out of the card.
 */
function AutoHeight({ children }: { children: React.ReactNode }) {
  const inner = useRef<HTMLDivElement>(null);
  const last = useRef<number | null>(null);
  const settle = useRef<number | undefined>(undefined);
  const [height, setHeight] = useState<number | null>(null);
  const [moving, setMoving] = useState(false);
  const still = useReducedMotion();

  useLayoutEffect(() => {
    const el = inner.current;
    if (!el) return;
    const measure = () => {
      const h = el.offsetHeight;
      if (last.current !== null && last.current !== h) {
        // Clipped while it eases; let go a moment after, whether or not transitionend arrives.
        setMoving(true);
        window.clearTimeout(settle.current);
        settle.current = window.setTimeout(() => setMoving(false), 420);
      }
      last.current = h;
      setHeight(h);
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => {
      ro.disconnect();
      window.clearTimeout(settle.current);
    };
  }, []);

  return (
    <div
      onTransitionEnd={(e) => {
        if (e.target === e.currentTarget) setMoving(false);
      }}
      style={{
        height: height ?? "auto",
        transition: still ? undefined : "height 380ms cubic-bezier(0.22, 1, 0.36, 1)",
        overflow: moving ? "hidden" : "visible",
      }}
    >
      <div ref={inner}>{children}</div>
    </div>
  );
}

/** A Turnstile check that can be asked for again: a token works once. */
function useHumanCheck() {
  const [token, setToken] = useState<string | null>(null);
  const ref = useRef<TurnstileInstance>(null);
  const reset = useCallback(() => {
    ref.current?.reset();
    setToken(null);
  }, []);
  const widget = (action: string) =>
    TURNSTILE_SITE_KEY ? (
      <div className="[&_iframe]:!w-full">
        <Turnstile
          ref={ref}
          siteKey={TURNSTILE_SITE_KEY}
          onSuccess={setToken}
          onExpire={() => setToken(null)}
          onError={() => setToken(null)}
          options={{ theme: "light", size: "flexible", action }}
        />
      </div>
    ) : null;
  return { token, reset, widget, needed: Boolean(TURNSTILE_SITE_KEY) };
}

/** The primary button, which turns into a green "done" for the moment before the portal opens. */
function SubmitButton({ busy, done, disabled, label, busyLabel, doneLabel }: {
  busy: boolean;
  done: boolean;
  disabled: boolean;
  label: string;
  busyLabel: string;
  doneLabel: string;
}) {
  return (
    <button
      type="submit"
      disabled={disabled || busy || done}
      className={`${authPrimaryButton} relative overflow-hidden ${done ? "!bg-emerald-600 !opacity-100" : ""}`}
    >
      <AnimatePresence mode="wait" initial={false}>
        <motion.span
          key={done ? "done" : busy ? "busy" : "idle"}
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -8 }}
          transition={{ duration: 0.18 }}
          className="flex items-center gap-2"
        >
          {done ? <CheckCircle2 size={16} /> : busy ? <Loader2 size={15} className="animate-spin" /> : null}
          {done ? doneLabel : busy ? busyLabel : label}
        </motion.span>
      </AnimatePresence>
    </button>
  );
}

function PasswordInput({ id, value, onChange, autoComplete, placeholder, onFocus, onBlur }: {
  id: string;
  value: string;
  onChange: (v: string) => void;
  autoComplete: string;
  placeholder: string;
  onFocus: () => void;
  onBlur: () => void;
}) {
  const [show, setShow] = useState(false);
  return (
    <span className="relative block">
      <input
        id={id}
        type={show ? "text" : "password"}
        autoComplete={autoComplete}
        placeholder={placeholder}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onFocus={onFocus}
        onBlur={onBlur}
        className={`${authInput} pr-11`}
      />
      <button
        type="button"
        onClick={() => setShow((s) => !s)}
        aria-label={show ? "Hide password" : "Show password"}
        className="absolute right-1 top-1/2 flex h-9 w-9 -translate-y-1/2 cursor-pointer items-center justify-center rounded-lg text-slate-400 transition-colors hover:text-slate-600"
      >
        {show ? <EyeOff size={16} /> : <Eye size={16} />}
      </button>
    </span>
  );
}

const reveal = {
  initial: { opacity: 0, height: 0 },
  animate: { opacity: 1, height: "auto" },
  exit: { opacity: 0, height: 0 },
  transition: { duration: 0.22, ease: EASE },
} as const;

function SignInForm({ onCreateAccount, onFieldFocus, onRefused }: {
  onCreateAccount: () => void;
  onFieldFocus: (f: MascotFocus) => void;
  onRefused: () => void;
}) {
  const router = useRouter();
  const human = useHumanCheck();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [locked, setLocked] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (human.needed && !human.token) {
      setError("Please complete the security check.");
      return onRefused();
    }
    setBusy(true);
    setError(null);
    setLocked(false);
    try {
      const res = await fetch("/api/supplier/auth/login/", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password, turnstileToken: human.token }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data?.error ?? "Incorrect email or password.");
        setLocked(res.status === 429 && data?.reason === "locked");
        human.reset();
        onRefused();
        return;
      }
      setDone(true);
      window.setTimeout(() => {
        router.replace("/supplier/");
        router.refresh();
      }, 420);
    } catch {
      setError("Could not reach the server. Please try again.");
      human.reset();
      onRefused();
    } finally {
      setBusy(false);
    }
  };

  const ready = email.trim() !== "" && password !== "";

  return (
    <form onSubmit={submit} noValidate className={authStack}>
      <label className="block">
        <span className={authLabel}>Email</span>
        <input
          type="email"
          autoComplete="email"
          placeholder="you@company.com"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          onFocus={() => onFieldFocus("email")}
          onBlur={() => onFieldFocus(null)}
          className={authInput}
        />
      </label>

      <label className="block" htmlFor="supplier-password">
        <span className={authLabel}>Password</span>
        <PasswordInput
          id="supplier-password"
          value={password}
          onChange={setPassword}
          autoComplete="current-password"
          placeholder="••••••••"
          onFocus={() => onFieldFocus("secret")}
          onBlur={() => onFieldFocus(null)}
        />
      </label>

      <div className="flex justify-end">
        <Link href="/supplier/forgot-password/" className="text-[13px] font-medium text-slate-500 transition-colors hover:text-brand-dark">
          Forgot password?
        </Link>
      </div>

      {human.widget("supplier_login")}

      <SubmitButton busy={busy} done={done} disabled={!ready} label="Sign in" busyLabel="Signing in…" doneLabel="Signed in" />

      <p className={authSwitchRow}>
        New supplier?{" "}
        <button type="button" onClick={onCreateAccount} className={authSwitchLink}>
          Create a supplier account
        </button>
      </p>

      <AnimatePresence initial={false}>
        {error && (
          <motion.div key="error" {...reveal} className="overflow-hidden">
            <div role="alert" className={authFormError}>
              <p>{error}</p>
              {locked && (
                <Link href="/supplier/forgot-password/" className={authResetButton}>
                  Reset password
                </Link>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </form>
  );
}

function SignUpForm({ onHaveAccount, onFieldFocus, onRefused }: {
  onHaveAccount: () => void;
  onFieldFocus: (f: MascotFocus) => void;
  onRefused: () => void;
}) {
  const router = useRouter();
  const human = useHumanCheck();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [mobile, setMobile] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const strength = checkPasswordStrength(password);
  const emailTrimmed = email.trim();
  const emailBad = emailTrimmed !== "" && !EMAIL_RE.test(emailTrimmed);
  const ready = name.trim() !== "" && EMAIL_RE.test(emailTrimmed) && mobile !== "" && password !== "";

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const problem = !strength.ok
      ? strength.error
      : !isValidMobileE164(mobile)
        ? "Enter a valid mobile number for the country you picked."
        : human.needed && !human.token
          ? "Please complete the security check."
          : null;
    if (problem) {
      setError(problem);
      onRefused();
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/supplier/auth/register/", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: name.trim(), email: emailTrimmed, mobile, password, turnstileToken: human.token }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data?.error ?? "Could not create your account. Try again.");
        human.reset();
        onRefused();
        return;
      }
      setDone(true);
      window.setTimeout(() => {
        router.replace("/supplier/?welcome=1");
        router.refresh();
      }, 420);
    } catch {
      setError("Could not reach the server. Please try again.");
      human.reset();
      onRefused();
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={submit} noValidate className={authStack}>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block">
          <span className={authLabel}>Full name</span>
          <input
            type="text"
            autoComplete="name"
            placeholder="Your name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            onFocus={() => onFieldFocus("name")}
            onBlur={() => onFieldFocus(null)}
            className={authInput}
          />
        </label>
        <label className="block">
          <span className={authLabel}>Email</span>
          <input
            type="email"
            autoComplete="email"
            placeholder="you@company.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            onFocus={() => onFieldFocus("email")}
            onBlur={() => onFieldFocus(null)}
            className={authInput}
          />
          {emailBad && <span className={authFieldError}>Enter a valid email address.</span>}
        </label>
      </div>

      <MobileNumberField id="supplier-mobile" onChange={setMobile} onFocus={() => onFieldFocus("phone")} onBlur={() => onFieldFocus(null)} />

      <label className="block" htmlFor="supplier-new-password">
        <span className={authLabel}>Password</span>
        <PasswordInput
          id="supplier-new-password"
          value={password}
          onChange={setPassword}
          autoComplete="new-password"
          placeholder="At least 8 characters"
          onFocus={() => onFieldFocus("secret")}
          onBlur={() => onFieldFocus(null)}
        />
        {password !== "" && !strength.ok && <span className="mt-1.5 block text-[12px] font-medium text-amber-600">{strength.error}</span>}
      </label>

      {human.widget("supplier_register")}

      <SubmitButton
        busy={busy}
        done={done}
        disabled={!ready || !strength.ok}
        label="Create supplier account"
        busyLabel="Creating your account…"
        doneLabel="Account created"
      />

      <p className={authSwitchRow}>
        Already a supplier?{" "}
        <button type="button" onClick={onHaveAccount} className={authSwitchLink}>
          Sign in
        </button>
      </p>

      <AnimatePresence initial={false}>
        {error && (
          <motion.div key="error" {...reveal} className="overflow-hidden">
            <p role="alert" className={authFormError}>
              {error}
            </p>
          </motion.div>
        )}
      </AnimatePresence>
    </form>
  );
}
