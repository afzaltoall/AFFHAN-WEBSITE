"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { CheckCircle2, Loader2 } from "lucide-react";
import { checkPasswordStrength } from "@/lib/password-rules";

/**
 * Staff password reset, in the three steps the customer flow uses.
 *
 * One page rather than three routes, because the middle two steps are useless
 * without the state the first one produced — a reset code typed into a fresh
 * page has nothing to be checked against.
 *
 * The first step's answer is the same whether or not the address belongs to a
 * staff account. The server decides that; this page only relays it.
 */
type Step = "email" | "code" | "password" | "done";

export default function EmployeeForgotPasswordPage() {
  const router = useRouter();
  const [step, setStep] = useState<Step>("email");
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [resetToken, setResetToken] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const post = async (path: string, body: Record<string, unknown>) => {
    const res = await fetch(`/api/employee/auth/${path}/`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = await res.json().catch(() => ({}));
    return { ok: res.ok, data } as const;
  };

  const requestCode = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const { data } = await post("forgot-password", { email });
    setBusy(false);
    setNotice(data?.message ?? "If that address belongs to a staff account, we've sent a code to it.");
    setStep("code");
  };

  const submitCode = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const { ok, data } = await post("verify-reset-otp", { email, code });
    setBusy(false);
    if (!ok) {
      setError(data?.error ?? "That code is wrong or has expired.");
      return;
    }
    setResetToken(data.resetToken);
    setNotice(null);
    setStep("password");
  };

  const submitPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    const strength = checkPasswordStrength(password);
    if (!strength.ok) {
      setError(strength.error);
      return;
    }
    if (password !== confirm) {
      setError("Those two passwords are different.");
      return;
    }
    setBusy(true);
    setError(null);
    const { ok, data } = await post("reset-password", { email, resetToken, newPassword: password });
    setBusy(false);
    if (!ok) {
      setError(data?.error ?? "Something went wrong. Try again.");
      return;
    }
    setStep("done");
    setTimeout(() => router.replace("/employee/login/"), 2500);
  };

  const field =
    "w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-slate-900 outline-none transition-all placeholder:text-slate-400 focus:border-brand focus:ring-4 focus:ring-brand/20";
  const button =
    "flex w-full items-center justify-center gap-2 rounded-xl bg-brand-dark py-3 font-bold text-white transition-colors hover:bg-brand-deep disabled:cursor-not-allowed disabled:opacity-70";

  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-50 px-5 py-12">
      <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-6 shadow-xl sm:p-7">
        {step === "done" ? (
          <div className="py-6 text-center">
            <CheckCircle2 size={40} className="mx-auto text-emerald-500" />
            <h1 className="mt-4 text-xl font-bold tracking-tight">Password changed</h1>
            <p className="mt-1.5 text-sm text-slate-500">
              Taking you to the sign-in page. Any other devices signed into this account have been
              signed out.
            </p>
          </div>
        ) : (
          <>
            <h1 className="text-2xl font-bold tracking-tight">
              {step === "email" ? "Reset your password" : step === "code" ? "Enter your code" : "Choose a new password"}
            </h1>
            <p className="mt-1.5 text-sm text-slate-500">
              {step === "email"
                ? "We'll email a six-digit code to your staff address."
                : step === "code"
                  ? `Sent to ${email}. It expires in a few minutes.`
                  : "At least 8 characters, mixing letters with numbers or symbols."}
            </p>

            {notice && (
              <div className="mt-5 rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm text-slate-600">
                {notice}
              </div>
            )}
            {error && (
              <div className="mt-5 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">
                {error}
              </div>
            )}

            {step === "email" && (
              <form onSubmit={requestCode} className="mt-5 space-y-4">
                <input
                  type="email"
                  required
                  autoComplete="username"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@affhan.com"
                  className={field}
                />
                <button type="submit" disabled={busy} className={button}>
                  {busy && <Loader2 className="h-5 w-5 animate-spin" />}
                  {busy ? "Sending…" : "Send code"}
                </button>
              </form>
            )}

            {step === "code" && (
              <form onSubmit={submitCode} className="mt-5 space-y-4">
                <input
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  required
                  value={code}
                  onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
                  placeholder="123456"
                  className={`${field} text-center text-2xl font-bold tracking-[0.4em]`}
                />
                <button type="submit" disabled={busy} className={button}>
                  {busy && <Loader2 className="h-5 w-5 animate-spin" />}
                  {busy ? "Checking…" : "Continue"}
                </button>
              </form>
            )}

            {step === "password" && (
              <form onSubmit={submitPassword} className="mt-5 space-y-4">
                <input
                  type="password"
                  required
                  autoComplete="new-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="New password"
                  className={field}
                />
                <input
                  type="password"
                  required
                  autoComplete="new-password"
                  value={confirm}
                  onChange={(e) => setConfirm(e.target.value)}
                  placeholder="Repeat it"
                  className={field}
                />
                <button type="submit" disabled={busy} className={button}>
                  {busy && <Loader2 className="h-5 w-5 animate-spin" />}
                  {busy ? "Saving…" : "Change password"}
                </button>
              </form>
            )}

            <p className="mt-5 text-sm text-slate-500">
              <Link href="/employee/login/" className="font-semibold text-brand-dark underline underline-offset-4">
                Back to sign in
              </Link>
            </p>
          </>
        )}
      </div>
    </main>
  );
}
