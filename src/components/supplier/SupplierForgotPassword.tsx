"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { CheckCircle2, Loader2, MessageCircle, Phone } from "lucide-react";
import { Turnstile, type TurnstileInstance } from "@marsidev/react-turnstile";
import { SupplierAuthLayout, SupplierCardHead } from "@/components/supplier/SupplierAuthLayout";
import { authInput, authPrimaryButton } from "@/components/ui/authFieldStyles";
import { checkPasswordStrength } from "@/lib/password-rules";
import { TURNSTILE_SITE_KEY } from "@/lib/turnstile-site-key";

type Step = "email" | "code" | "password" | "done";
type Contact = { phone: string; tel: string; whatsappNumber: string; whatsapp: string };

const contactClass =
  "inline-flex items-center justify-center gap-2 rounded-xl bg-white px-4 py-2.5 text-[13px] font-semibold text-slate-800 ring-1 ring-slate-200 hover:bg-slate-50";

/**
 * A supplier's password reset: the staff page's three steps (send a code, check it, choose a password) against
 * /api/supplier/auth/. One page, because the later steps mean nothing without the first one's state. The first
 * answer is the same whether or not the address has a supplier account; the server decides, this relays it.
 */
export function SupplierForgotPassword({ catalogueCount }: { catalogueCount: number | null }) {
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
  const [contact, setContact] = useState<Contact | null>(null);
  const [turnstileToken, setTurnstileToken] = useState<string | null>(null);
  const turnstileRef = useRef<TurnstileInstance>(null);

  const post = async (path: string, body: Record<string, unknown>) => {
    try {
      const res = await fetch(`/api/supplier/auth/${path}/`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      return { ok: res.ok, data: await res.json().catch(() => ({})) } as const;
    } catch {
      return { ok: false, data: { error: "Network error. Please try again." } } as const;
    }
  };

  const requestCode = async (e: React.FormEvent) => {
    e.preventDefault();
    if (TURNSTILE_SITE_KEY && !turnstileToken) return setError("Please complete the security check.");
    setBusy(true);
    setError(null);
    setContact(null);
    const { ok, data } = await post("forgot-password", { email, turnstileToken });
    setBusy(false);
    turnstileRef.current?.reset();
    setTurnstileToken(null);
    if (!ok) {
      setError(data?.error ?? "Something went wrong. Try again.");
      if (data?.reason === "cannot_send" && data?.contact?.whatsapp && data?.contact?.tel) setContact(data.contact);
      return;
    }
    setNotice(data?.message ?? "If that email belongs to a supplier account, we've sent a code to it.");
    setStep("code");
  };

  const submitCode = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const { ok, data } = await post("verify-reset-otp", { email, code });
    setBusy(false);
    if (!ok) return setError(data?.error ?? "That code is wrong or has expired.");
    setResetToken(data.resetToken);
    setNotice(null);
    setStep("password");
  };

  const submitPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    const strength = checkPasswordStrength(password);
    if (!strength.ok) return setError(strength.error);
    if (password !== confirm) return setError("Those two passwords are different.");
    setBusy(true);
    setError(null);
    const { ok, data } = await post("reset-password", { email, resetToken, newPassword: password });
    setBusy(false);
    if (!ok) return setError(data?.error ?? "Something went wrong. Try again.");
    setStep("done");
    setTimeout(() => router.replace("/supplier/login/"), 2500);
  };

  return (
    <SupplierAuthLayout catalogueCount={catalogueCount} focus={null}>
      {step === "done" ? (
        <div className="py-6 text-center">
          <CheckCircle2 size={40} className="mx-auto text-emerald-500" />
          <h2 className="mt-4 text-xl font-bold tracking-tight text-slate-900">Password changed</h2>
          <p className="mt-1.5 text-sm text-slate-500">
            Taking you to the sign-in page. Any other devices signed in to this account have been signed out.
          </p>
        </div>
      ) : (
        <>
          <SupplierCardHead
            title={step === "email" ? "Reset your password" : step === "code" ? "Enter your code" : "Choose a new password"}
            sub={
              step === "email"
                ? "We'll email a six-digit code to the address you registered with."
                : step === "code"
                  ? `Sent to ${email}. It expires in a few minutes.`
                  : "At least 8 characters, mixing letters with numbers or symbols."
            }
          />

          {notice && <div className="mt-4 rounded-xl border border-slate-200 bg-slate-50 p-3 text-[13px] text-slate-600">{notice}</div>}
          {error && (
            <div role="alert" className="mt-4 rounded-xl border border-red-200 bg-red-50 p-3 text-[13px] font-medium text-red-700">
              {error}
            </div>
          )}
          {contact && (
            <div className="mt-3 flex flex-col gap-2">
              <a href={contact.whatsapp} target="_blank" rel="noopener noreferrer" className={contactClass}>
                <MessageCircle size={15} aria-hidden="true" />
                WhatsApp {contact.whatsappNumber}
              </a>
              <a href={contact.tel} className={contactClass}>
                <Phone size={15} aria-hidden="true" />
                Call {contact.phone}
              </a>
            </div>
          )}

          {step === "email" && (
            <form onSubmit={requestCode} className="mt-5 space-y-3">
              <input
                type="email"
                required
                autoComplete="username"
                aria-label="Email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@company.com"
                className={authInput}
              />
              {TURNSTILE_SITE_KEY && (
                <div className="[&_iframe]:!w-full">
                  <Turnstile
                    ref={turnstileRef}
                    siteKey={TURNSTILE_SITE_KEY}
                    onSuccess={setTurnstileToken}
                    onExpire={() => setTurnstileToken(null)}
                    onError={() => setTurnstileToken(null)}
                    options={{ theme: "light", size: "flexible", action: "supplier_password_reset" }}
                  />
                </div>
              )}
              <button type="submit" disabled={busy} className={authPrimaryButton}>
                {busy && <Loader2 className="h-4 w-4 animate-spin" />}
                {busy ? "Sending…" : "Send code"}
              </button>
            </form>
          )}

          {step === "code" && (
            <form onSubmit={submitCode} className="mt-5 space-y-3">
              <input
                inputMode="numeric"
                autoComplete="one-time-code"
                aria-label="Six-digit code"
                required
                value={code}
                onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
                placeholder="123456"
                className={`${authInput} text-center !text-2xl font-bold tracking-[0.4em]`}
              />
              <button type="submit" disabled={busy} className={authPrimaryButton}>
                {busy && <Loader2 className="h-4 w-4 animate-spin" />}
                {busy ? "Checking…" : "Continue"}
              </button>
            </form>
          )}

          {step === "password" && (
            <form onSubmit={submitPassword} className="mt-5 space-y-3">
              <input
                type="password"
                required
                autoComplete="new-password"
                aria-label="New password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="New password"
                className={authInput}
              />
              <input
                type="password"
                required
                autoComplete="new-password"
                aria-label="Repeat the new password"
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                placeholder="Repeat it"
                className={authInput}
              />
              <button type="submit" disabled={busy} className={authPrimaryButton}>
                {busy && <Loader2 className="h-4 w-4 animate-spin" />}
                {busy ? "Saving…" : "Change password"}
              </button>
            </form>
          )}

          <p className="mt-5 text-[13px] text-slate-600">
            <Link href="/supplier/login/" className="font-semibold text-brand-dark underline-offset-2 hover:underline">
              Back to sign in
            </Link>
          </p>
        </>
      )}
    </SupplierAuthLayout>
  );
}
