"use client";

import { Suspense, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AlertCircle, Eye, EyeOff, Loader2, Lock, Mail } from "lucide-react";
import { Turnstile, type TurnstileInstance } from "@marsidev/react-turnstile";
import { EmployeeAuthShell } from "@/components/ui/EmployeeAuthShell";
import { authLabel, authPrimaryButton } from "@/components/ui/authFieldStyles";
import { SessionNotice } from "./SessionNotice";

const TURNSTILE_SITE_KEY = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY;

export function EmployeeLoginForm({ stats }: { stats?: React.ReactNode }) {
  const router = useRouter();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [turnstileToken, setTurnstileToken] = useState<string | null>(null);
  const turnstileRef = useRef<TurnstileInstance>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (TURNSTILE_SITE_KEY && !turnstileToken) {
      setError("Please complete the security check.");
      return;
    }
    setError(null);
    setLoading(true);
    try {
      const res = await fetch("/api/employee/auth/login/", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password, turnstileToken }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error || "Sign in failed.");
        setLoading(false);
        turnstileRef.current?.reset();
        setTurnstileToken(null);
        return;
      }
      // replace, not push: the login page should not be one Back away from a
      // signed-in workspace.
      router.replace("/employee/dashboard/");
      router.refresh();
    } catch {
      setError("Network error. Please try again.");
      setLoading(false);
    }
  };

  return (
    <EmployeeAuthShell
      stats={stats}
      title="The sales desk."
      blurb="Your assigned inquiries and contact requests, and the record of what happened to each one. Sign in with the address your administrator registered."
    >
      <h2 className="text-xl font-bold tracking-tight text-slate-900">Staff sign in</h2>
      {/* slate-600 on white is 7.0:1. The old white/80 on the brand gradient
          was under 4.5:1, which is what item 3 was about. */}
      <p className="mt-1 text-[13px] text-slate-600">For the Affhan sales team.</p>

      {/* The ONLY thing that reads the query string, and therefore the only
          thing that has to sit behind a boundary. Everything around it —
          shell, headline, description, stats, form — is server-rendered
          again. See SessionNotice for what this cost before. */}
      <Suspense fallback={null}>
        <SessionNotice />
      </Suspense>

      {/* The failure, announced. aria-live on the wrapper rather than the
          element, so it is in the DOM before the message exists and the
          change is what gets read. */}
      <div aria-live="polite" aria-atomic="true">
        {error && (
          <div
            role="alert"
            className="mt-4 flex items-start gap-2.5 rounded-xl border border-red-200 bg-red-50 px-3.5 py-2.5 text-[12.5px] font-medium text-red-700"
          >
            <AlertCircle className="mt-px h-4 w-4 shrink-0 text-red-600" aria-hidden="true" />
            <span>{error}</span>
          </div>
        )}
      </div>

      <form onSubmit={handleSubmit} className="mt-5 space-y-3">
        <div>
          <label htmlFor="employee-email" className={authLabel}>
            Email
          </label>
          <div className="relative">
            <Mail className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" aria-hidden="true" />
            <input
              id="employee-email"
              type="email"
              required
              autoComplete="username"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@affhan.com"
              className="w-full rounded-xl border border-slate-200 bg-white py-2.5 pl-10 pr-3.5 text-base text-slate-900 outline-none transition-[border-color,box-shadow] placeholder:text-slate-400 auth-focus-ring sm:text-sm"
            />
          </div>
        </div>

        <div>
          <label htmlFor="employee-password" className={authLabel}>
            Password
          </label>
          <div className="relative">
            <Lock className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" aria-hidden="true" />
            <input
              id="employee-password"
              type={showPassword ? "text" : "password"}
              required
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              className="w-full rounded-xl border border-slate-200 bg-white py-2.5 pl-10 pr-11 text-base text-slate-900 outline-none transition-[border-color,box-shadow] placeholder:text-slate-400 auth-focus-ring sm:text-sm"
            />
            <button
              type="button"
              onClick={() => setShowPassword((v) => !v)}
              aria-label={showPassword ? "Hide password" : "Show password"}
              className="absolute right-2 top-1/2 -translate-y-1/2 rounded-lg p-1.5 text-slate-400 transition-colors hover:text-slate-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-brand"
            >
              {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          </div>
        </div>

        {TURNSTILE_SITE_KEY && (
          // size "flexible" is Cloudflare's full-width mode and is in the
          // installed @marsidev/react-turnstile 1.6.1's WidgetSize union, so
          // the widget now matches the inputs instead of sitting narrower than
          // them. Nothing about how the token is obtained or sent changed.
          <div className="[&_iframe]:!w-full">
            <Turnstile
              ref={turnstileRef}
              siteKey={TURNSTILE_SITE_KEY}
              onSuccess={setTurnstileToken}
              onExpire={() => setTurnstileToken(null)}
              options={{ theme: "light", size: "flexible" }}
            />
          </div>
        )}

        <button type="submit" disabled={loading} className={authPrimaryButton}>
          {loading ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : null}
          {loading ? "Signing in…" : "Sign in"}
        </button>
      </form>

      <p className="mt-4 text-[13px] text-slate-600">
        <Link
          href="/employee/forgot-password/"
          className="font-semibold text-brand-dark underline-offset-2 transition-colors hover:text-brand hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
        >
          Forgot your password?
        </Link>
      </p>
      <p className="mt-1.5 text-[12px] text-slate-500">
        Sessions end after 30 minutes without activity.
      </p>
    </EmployeeAuthShell>
  );
}