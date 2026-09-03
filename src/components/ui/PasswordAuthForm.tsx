"use client";

import { useState } from "react";
import Link from "next/link";
import { Eye, EyeOff, Loader2 } from "lucide-react";
import { useAuth } from "@/context/AuthContext";

/**
 * Email and password — the way most returning customers now sign in.
 *
 * It is the default screen because every phone sign-in costs an SMS, and a
 * customer who comes back weekly costs one every time. A password costs
 * nothing to check.
 *
 * Phone codes have not gone anywhere: they are how an account is created, how
 * someone without a password gets in, and the way back when a password is
 * forgotten. This screen offers both, with the cheap one first.
 */
export function PasswordAuthForm({
  onSuccess,
  onUsePhone,
  onCreateAccount,
  autoFocus = true,
}: {
  onSuccess?: () => void;
  /** The fallback: sign in with a code, for accounts that have no password. */
  onUsePhone: () => void;
  /** Making a new account, which always starts with a code. */
  onCreateAccount: () => void;
  autoFocus?: boolean;
}) {
  const { refreshSession } = useAuth();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/web/auth/login-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        // The session comes back as a cookie, so the request has to be allowed
        // to receive one.
        credentials: "include",
        body: JSON.stringify({ email, password }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(json?.error ?? "Incorrect email or password.");
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

  const ready = email.trim() !== "" && password !== "";

  return (
    <div className="space-y-4">
      <label className="block">
        <span className="mb-1.5 block text-[13px] font-semibold text-slate-700">Email</span>
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
        <span className="mb-1.5 block text-[13px] font-semibold text-slate-700">Password</span>
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
          className="text-[13px] font-medium text-slate-500 transition-colors hover:text-brand-dark"
        >
          Forgot password?
        </Link>
      </div>

      <button
        onClick={() => void submit()}
        disabled={busy || !ready}
        className="flex w-full items-center justify-center gap-2 rounded-xl bg-brand px-6 py-3 text-sm font-semibold text-white transition-all hover:bg-brand-dark disabled:cursor-not-allowed disabled:opacity-50 cursor-pointer"
      >
        {busy && <Loader2 size={15} className="animate-spin" />}
        Sign in
      </button>

      {/* Two different destinations, kept apart on purpose.

          Creating an account is a first-class action and gets the prominent
          link — without it, the only route to signing up would be through a
          fallback meant for something else, which is how account creation
          ends up invisible.

          The code fallback is smaller because it is for a shrinking set of
          people: the accounts that existed before passwords. It is still the
          only door that works for every customer on the site today, so it is
          secondary, not hidden. */}
      <p className="pt-1 text-center text-[13px] text-slate-500">
        New to Affhan?{" "}
        <button
          type="button"
          onClick={onCreateAccount}
          className="font-semibold text-brand underline-offset-2 transition-colors hover:text-brand-dark hover:underline cursor-pointer"
        >
          Create an account
        </button>
      </p>

      <p className="text-center text-[12px] text-slate-400">
        <button
          type="button"
          onClick={onUsePhone}
          className="font-medium underline-offset-2 transition-colors hover:text-slate-600 hover:underline cursor-pointer"
        >
          Sign in with phone instead
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
