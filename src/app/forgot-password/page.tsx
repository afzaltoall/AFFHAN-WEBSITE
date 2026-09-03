"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { CheckCircle2, Eye, EyeOff, Loader2 } from "lucide-react";
import { LoginBackground } from "@/components/ui/LoginBackground";
import { checkPasswordStrength } from "@/lib/password-rules";

/**
 * Reset a forgotten password: ask for a code, type it, choose a new one.
 *
 * Three steps in one page rather than three routes, because the middle two are
 * useless on their own — a reset token is minted here and spent here, and a
 * page you can land on holding neither has nothing to show.
 *
 * The first step's answer is deliberately the same whether or not the address
 * has an account. That is the API's doing, not this page's; all this does is
 * repeat it honestly instead of pretending to know more.
 */
export default function ForgotPasswordPage() {
  const router = useRouter();
  const [step, setStep] = useState<"email" | "code" | "password" | "done">("email");

  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [resetToken, setResetToken] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [show, setShow] = useState(false);

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // A moment to read "your password has been changed" before the sign-in page
  // takes over.
  useEffect(() => {
    if (step !== "done") return;
    const t = setTimeout(() => router.replace("/login/"), 2600);
    return () => clearTimeout(t);
  }, [step, router]);

  const post = async (path: string, body: unknown) => {
    const res = await fetch(`/api/web/auth/${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    return { res, json: await res.json().catch(() => ({})) };
  };

  const sendCode = async () => {
    setBusy(true);
    setError(null);
    const { res, json } = await post("forgot-password", { email });
    setBusy(false);
    if (!res.ok) {
      setError(json?.error ?? "Something went wrong. Try again.");
      return;
    }
    setStep("code");
  };

  const verify = async () => {
    setBusy(true);
    setError(null);
    const { res, json } = await post("verify-reset-otp", { email, code });
    setBusy(false);
    if (!res.ok) {
      setError(json?.error ?? "That code did not work.");
      return;
    }
    setResetToken(json.resetToken);
    setStep("password");
  };

  const save = async () => {
    setBusy(true);
    setError(null);
    const { res, json } = await post("reset-password", { email, resetToken, newPassword: password });
    setBusy(false);
    if (!res.ok) {
      setError(json?.error ?? "Could not set your password.");
      return;
    }
    setStep("done");
  };

  const strength = checkPasswordStrength(password);
  const matches = password !== "" && password === confirm;

  return (
    <main className="relative flex min-h-screen items-center justify-center px-5 py-12">
      <LoginBackground />

      <motion.div
        initial={{ opacity: 0, y: 22 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
        className="relative w-full max-w-md rounded-2xl border border-white/60 bg-white/95 p-6 shadow-2xl backdrop-blur-xl sm:p-7"
      >
        {step === "done" ? (
          <div className="py-6 text-center">
            <CheckCircle2 size={40} className="mx-auto text-emerald-500" />
            <h1 className="mt-4 text-xl font-bold tracking-tight text-slate-900">
              Password changed
            </h1>
            <p className="mt-1.5 text-sm text-slate-500">
              Taking you to the sign-in page…
            </p>
          </div>
        ) : (
          <>
            <h1 className="text-2xl font-bold tracking-tight text-slate-900">
              {step === "email"
                ? "Forgot your password?"
                : step === "code"
                  ? "Enter the code"
                  : "Choose a new password"}
            </h1>
            <p className="mt-1.5 text-sm text-slate-500">
              {step === "email"
                ? "We'll email you a code to confirm it's you."
                : step === "code"
                  ? `If ${email} is registered, a code is on its way.`
                  : "Eight characters or more, mixing letters with numbers or symbols."}
            </p>

            <div className="mt-6 space-y-4">
              {step === "email" && (
                <>
                  <Field label="Email">
                    <input
                      autoFocus
                      type="email"
                      autoComplete="email"
                      placeholder="you@company.com"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      onKeyDown={(e) => e.key === "Enter" && email.trim() && !busy && void sendCode()}
                      className={inputClass}
                    />
                  </Field>
                  <Primary onClick={sendCode} busy={busy} disabled={!email.trim()}>
                    Send code
                  </Primary>
                </>
              )}

              {step === "code" && (
                <>
                  <Field label="6-digit code">
                    <input
                      autoFocus
                      type="text"
                      inputMode="numeric"
                      autoComplete="one-time-code"
                      maxLength={6}
                      placeholder="••••••"
                      value={code}
                      onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
                      onKeyDown={(e) => e.key === "Enter" && code.length === 6 && !busy && void verify()}
                      className={`${inputClass} text-center text-lg font-semibold tracking-[0.5em]`}
                    />
                  </Field>
                  <Primary onClick={verify} busy={busy} disabled={code.length !== 6}>
                    Continue
                  </Primary>
                  <button
                    onClick={() => {
                      setError(null);
                      setCode("");
                      setStep("email");
                    }}
                    className="w-full text-center text-[13px] font-medium text-slate-500 transition-colors hover:text-slate-700 cursor-pointer"
                  >
                    Use a different email
                  </button>
                </>
              )}

              {step === "password" && (
                <>
                  <Field label="New password">
                    <span className="relative block">
                      <input
                        autoFocus
                        type={show ? "text" : "password"}
                        autoComplete="new-password"
                        placeholder="At least 8 characters"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        className={`${inputClass} pr-11`}
                      />
                      <button
                        type="button"
                        onClick={() => setShow((v) => !v)}
                        aria-label={show ? "Hide password" : "Show password"}
                        className="absolute right-1 top-1/2 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-lg text-slate-400 transition-colors hover:text-slate-600 cursor-pointer"
                      >
                        {show ? <EyeOff size={16} /> : <Eye size={16} />}
                      </button>
                    </span>
                    {password !== "" && !strength.ok && (
                      <p className="mt-1.5 text-[12px] text-amber-700">{strength.error}</p>
                    )}
                  </Field>

                  <Field label="Confirm password">
                    <input
                      type={show ? "text" : "password"}
                      autoComplete="new-password"
                      placeholder="Type it again"
                      value={confirm}
                      onChange={(e) => setConfirm(e.target.value)}
                      onKeyDown={(e) =>
                        e.key === "Enter" && strength.ok && matches && !busy && void save()
                      }
                      className={inputClass}
                    />
                    {confirm !== "" && !matches && (
                      <p className="mt-1.5 text-[12px] text-amber-700">Those don&apos;t match.</p>
                    )}
                  </Field>

                  <Primary onClick={save} busy={busy} disabled={!strength.ok || !matches}>
                    Save password
                  </Primary>
                </>
              )}

              {error && (
                <p role="alert" className="rounded-xl bg-red-50 px-4 py-2.5 text-[13px] text-red-700">
                  {error}
                </p>
              )}
            </div>

            <p className="mt-7 text-center text-[13px] text-slate-500">
              <Link href="/login/" className="font-medium hover:text-slate-700">
                Back to sign in
              </Link>
            </p>
          </>
        )}
      </motion.div>
    </main>
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
