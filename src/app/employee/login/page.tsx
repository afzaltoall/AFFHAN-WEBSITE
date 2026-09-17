"use client";

import { Suspense, useRef, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Eye, EyeOff, Loader2, Lock, Mail } from "lucide-react";
import { Turnstile, type TurnstileInstance } from "@marsidev/react-turnstile";

const TURNSTILE_SITE_KEY = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY;

/**
 * Why a session ended, in the words of the person it happened to.
 *
 * The guard in the workspace layout puts one of these on the URL when it sends
 * somebody here, because a login form that appears with no explanation reads as
 * a bug — and "you were signed out" and "your account was switched off" want
 * different responses from the reader.
 */
const REASONS: Record<string, string> = {
  expired: "Your session timed out after 30 minutes of inactivity. Please sign in again.",
  disabled: "That account is no longer active. Ask an administrator to re-enable it.",
  signedout: "You were signed out. Please sign in again.",
};

function EmployeeLoginForm() {
  const router = useRouter();
  const params = useSearchParams();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [notice] = useState<string | null>(() => {
    for (const key of Object.keys(REASONS)) if (params.get(key)) return REASONS[key];
    return null;
  });
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
    <main className="flex min-h-screen flex-col lg:flex-row">
      {/* Left: who this door is for. */}
      <div className="relative hidden w-1/2 flex-col justify-between bg-slate-900 p-12 lg:flex">
        <Link href="/" className="relative z-10 inline-block">
          <div className="relative h-10 w-32 rounded-xl bg-white p-2 shadow-sm">
            <Image src="/logo.png" alt="Affhan" fill className="object-contain" />
          </div>
        </Link>
        <div className="relative z-10">
          <h1 className="text-4xl font-black leading-tight text-white">
            The sales desk.
          </h1>
          <p className="mt-4 max-w-md text-slate-300">
            Your assigned inquiries and contact requests, and the record of what happened to each
            one. Sign in with the address your administrator registered.
          </p>
        </div>
        <p className="relative z-10 text-sm text-slate-400">
          © {new Date().getFullYear()} AFFHAN International Pvt Ltd
        </p>
      </div>

      {/* Right: the form. */}
      <div className="relative flex w-full items-center justify-center overflow-hidden bg-gradient-to-br from-brand to-brand-dark p-6 sm:p-12 lg:w-1/2">
        <div className="pointer-events-none absolute -left-24 -top-24 h-96 w-96 rounded-full bg-white/10 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-32 -right-16 h-96 w-96 rounded-full bg-white/10 blur-3xl" />

        <div className="relative z-10 w-full max-w-md">
          <Link href="/" className="mb-8 inline-block transition-opacity hover:opacity-80 lg:hidden">
            <div className="relative h-10 w-32 rounded-xl bg-white p-2 shadow-sm">
              <Image src="/logo.png" alt="Affhan" fill className="object-contain" />
            </div>
          </Link>

          <h2 className="text-3xl font-black text-white">Staff sign in</h2>
          <p className="mt-2 text-white/80">For the Affhan sales team.</p>

          {notice && (
            <div className="mt-6 rounded-xl border border-white/30 bg-white/15 p-3 text-sm text-white">
              {notice}
            </div>
          )}
          {error && (
            <div className="mt-6 rounded-xl border border-red-500/30 bg-red-500/20 p-3 text-sm text-red-100">
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="mt-6 space-y-4">
            <div>
              <label htmlFor="employee-email" className="mb-1.5 block text-sm font-bold text-white drop-shadow-sm">
                Email
              </label>
              <div className="relative">
                <Mail className="absolute left-3 top-3.5 h-5 w-5 text-slate-400" />
                <input
                  id="employee-email"
                  type="email"
                  required
                  autoComplete="username"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@affhan.com"
                  className="w-full rounded-xl border-none bg-white py-3 pl-11 pr-4 text-slate-900 shadow-md outline-none transition-all placeholder:text-slate-400 focus:ring-4 focus:ring-brand/30"
                />
              </div>
            </div>

            <div>
              <label htmlFor="employee-password" className="mb-1.5 block text-sm font-bold text-white drop-shadow-sm">
                Password
              </label>
              <div className="relative">
                <Lock className="absolute left-3 top-3.5 h-5 w-5 text-slate-400" />
                <input
                  id="employee-password"
                  type={showPassword ? "text" : "password"}
                  required
                  autoComplete="current-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  className="w-full rounded-xl border-none bg-white py-3 pl-11 pr-12 text-slate-900 shadow-md outline-none transition-all placeholder:text-slate-400 focus:ring-4 focus:ring-brand/30"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  aria-label={showPassword ? "Hide password" : "Show password"}
                  className="absolute right-3 top-3.5 text-slate-400 transition-colors hover:text-slate-600"
                >
                  {showPassword ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
                </button>
              </div>
            </div>

            {TURNSTILE_SITE_KEY && (
              <Turnstile
                ref={turnstileRef}
                siteKey={TURNSTILE_SITE_KEY}
                onSuccess={setTurnstileToken}
                onExpire={() => setTurnstileToken(null)}
                options={{ theme: "light" }}
              />
            )}

            <button
              type="submit"
              disabled={loading}
              className="flex w-full items-center justify-center gap-2 rounded-xl bg-white py-3 font-bold text-brand-dark shadow-md transition-all hover:bg-white/90 disabled:cursor-not-allowed disabled:opacity-70"
            >
              {loading ? <Loader2 className="h-5 w-5 animate-spin" /> : null}
              {loading ? "Signing in…" : "Sign in"}
            </button>
          </form>

          <p className="mt-5 text-sm text-white/80">
            <Link href="/employee/forgot-password/" className="font-semibold text-white underline underline-offset-4">
              Forgot your password?
            </Link>
          </p>
          <p className="mt-2 text-xs text-white/60">
            Sessions end after 30 minutes without activity.
          </p>
        </div>
      </div>
    </main>
  );
}

export default function EmployeeLoginPage() {
  // useSearchParams needs a Suspense boundary to keep the route static-friendly.
  return (
    <Suspense fallback={null}>
      <EmployeeLoginForm />
    </Suspense>
  );
}
