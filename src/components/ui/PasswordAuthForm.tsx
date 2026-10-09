"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import { Eye, EyeOff, Loader2 } from "lucide-react";
import { Turnstile, type TurnstileInstance } from "@marsidev/react-turnstile";
import { useAuth } from "@/context/AuthContext";
import { TURNSTILE_SITE_KEY } from "@/lib/turnstile-site-key";
import {
  authStack,
  authLabel,
  authInput,
  authPrimaryButton,
  authSwitchRow,
  authSwitchLink,
  authFormError,
  authResetButton,
} from "@/components/ui/authFieldStyles";

/**
 * Email and password — the way most returning customers now sign in.
 *
 * It is the default screen because every phone sign-in costs an SMS, and a
 * customer who comes back weekly costs one every time. A password costs
 * nothing to check.
 *
 * Phone codes remain how an account is CREATED — a number nobody has proved is
 * not an identity — but they are no longer offered as a way to sign in. Every
 * account that predates passwords signs in with Google, so the fallback this
 * screen used to carry had nobody left to serve, and for those six it was
 * worse than useless: none of them has a number on file, so entering one would
 * have started a second account rather than opening theirs.
 */
export function PasswordAuthForm({
  onSuccess,
  onCreateAccount,
  onLeave,
  autoFocus = true,
}: {
  onSuccess?: () => void;
  /** Making a new account, which always starts with a code. */
  onCreateAccount: () => void;
  /** Called as the person follows a link off the form to reset their password,
   *  so a dialog around it (LoginModal) can close instead of staying open over
   *  the reset page. */
  onLeave?: () => void;
  autoFocus?: boolean;
}) {
  const { refreshSession } = useAuth();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // The account is locked after too many wrong passwords: the message comes
  // with a way out, since a reset unlocks it at once.
  const [locked, setLocked] = useState(false);
  // Cloudflare Turnstile, checked by the server before anything else (2026-10-09).
  // A token works once, so every answer but success asks for a fresh one.
  const [turnstileToken, setTurnstileToken] = useState<string | null>(null);
  const turnstileRef = useRef<TurnstileInstance>(null);
  const freshCheck = () => {
    turnstileRef.current?.reset();
    setTurnstileToken(null);
  };

  const submit = async () => {
    if (TURNSTILE_SITE_KEY && !turnstileToken) {
      setError("Please complete the security check.");
      setLocked(false);
      return;
    }
    setBusy(true);
    setError(null);
    setLocked(false);
    try {
      const res = await fetch("/api/web/auth/login-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        // The session comes back as a cookie, so the request has to be allowed
        // to receive one.
        credentials: "include",
        body: JSON.stringify({ email, password, turnstileToken }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(json?.error ?? "Incorrect email or password.");
        setLocked(res.status === 429 && json?.reason === "locked");
        freshCheck();
        return;
      }
      await refreshSession();
      onSuccess?.();
    } catch {
      setError("Could not reach the server. Please try again.");
      freshCheck();
    } finally {
      setBusy(false);
    }
  };

  const ready = email.trim() !== "" && password !== "";

  return (
    <div className={authStack}>
      <label className="block">
        <span className={authLabel}>Email</span>
        <input
          autoFocus={autoFocus}
          type="email"
          autoComplete="email"
          placeholder="you@company.com"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && ready && !busy && void submit()}
          className={inputClass}
        />
      </label>

      <label className="block">
        <span className={authLabel}>Password</span>
        <span className="relative block">
          <input
            type={show ? "text" : "password"}
            autoComplete="current-password"
            placeholder="••••••••"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && ready && !busy && void submit()}
            className={`${inputClass} pr-11`}
          />
          {/* Typing a password you cannot see, on a phone keyboard, is how
              people end up locked out of their own account. */}
          <button
            type="button"
            onClick={() => setShow((s) => !s)}
            aria-label={show ? "Hide password" : "Show password"}
            className="absolute right-1 top-1/2 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-lg text-slate-400 transition-colors hover:text-slate-600 cursor-pointer"
          >
            {show ? <EyeOff size={16} /> : <Eye size={16} />}
          </button>
        </span>
      </label>

      <div className="flex justify-end">
        <Link
          href="/forgot-password/"
          onClick={onLeave}
          className="text-[13px] font-medium text-slate-500 transition-colors hover:text-brand-dark"
        >
          Forgot password?
        </Link>
      </div>

      {TURNSTILE_SITE_KEY && (
        // Full width, like the staff sign-in, so it lines up with the inputs.
        <div className="[&_iframe]:!w-full">
          <Turnstile
            ref={turnstileRef}
            siteKey={TURNSTILE_SITE_KEY}
            onSuccess={setTurnstileToken}
            onExpire={() => setTurnstileToken(null)}
            onError={() => setTurnstileToken(null)}
            options={{ theme: "light", size: "flexible", action: "customer_login" }}
          />
        </div>
      )}

      <button
        onClick={() => void submit()}
        disabled={busy || !ready}
        className={authPrimaryButton}
      >
        {busy && <Loader2 size={15} className="animate-spin" />}
        Sign in
      </button>

      {/* The one way off this screen that is not signing in: making an
          account. Without it the only route to signing up would be guesswork,
          which is how account creation ends up invisible. */}
      <p className={authSwitchRow}>
        New to AFFHAN?{" "}
        <button
          type="button"
          onClick={onCreateAccount}
          className={authSwitchLink}
        >
          Create an account
        </button>
      </p>

      {error && (
        <div role="alert" className={authFormError}>
          <p>{error}</p>
          {locked && (
            <Link href="/forgot-password/" onClick={onLeave} className={authResetButton}>
              Reset password
            </Link>
          )}
        </div>
      )}
    </div>
  );
}

const inputClass = authInput;
