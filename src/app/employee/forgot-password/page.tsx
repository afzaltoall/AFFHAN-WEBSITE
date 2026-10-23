"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { CheckCircle2, Loader2, MessageCircle, Phone } from "lucide-react";
import { Turnstile, type TurnstileInstance } from "@marsidev/react-turnstile";
import { EmployeeAuthShell } from "@/components/ui/EmployeeAuthShell";
import { checkPasswordStrength } from "@/lib/password-rules";
import { TURNSTILE_SITE_KEY } from "@/lib/turnstile-site-key";

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
  // Set when no code can be sent at all: the API's WhatsApp and phone, shown under its message.
  const [contact, setContact] = useState<Contact | null>(null);

  const post = async (path: string, body: Record<string, unknown>) => {
    const res = await fetch(`/api/employee/auth/${path}/`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = await res.json().catch(() => ({}));
    return { ok: res.ok, data } as const;
  };

  // Cloudflare Turnstile on "Send code", checked by the server before anything
  // else (2026-10-09). A token works once, so each send asks for a fresh one.
  const [turnstileToken, setTurnstileToken] = useState<string | null>(null);
  const turnstileRef = useRef<TurnstileInstance>(null);

  const requestCode = async (e: React.FormEvent) => {
    e.preventDefault();
    if (TURNSTILE_SITE_KEY && !turnstileToken) {
      setError("Please complete the security check.");
      return;
    }
    setBusy(true);
    setError(null);
    setContact(null);
    const { ok, data } = await post("forgot-password", { email, turnstileToken });
    setBusy(false);
    turnstileRef.current?.reset();
    setTurnstileToken(null);
    // A refusal (the security check, too many requests) stays on this step and
    // says why; it used to move on to "Enter your code" regardless. When no
    // code can leave at all (lib/cannot-send.ts), the same for every address so
    // it says nothing about this one, WhatsApp and a call button come with it.
    if (!ok) {
      setError(data?.error ?? "Something went wrong. Try again.");
      if (data?.reason === "cannot_send" && data?.contact?.whatsapp && data?.contact?.tel) setContact(data.contact);
      return;
    }
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
    <EmployeeAuthShell
      title="The sales desk."
      blurb="The customers you take from the open pool, and the record of what happened to each one. Reset the password for the address your administrator registered."
    >
      <div>
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
                {TURNSTILE_SITE_KEY && (
                  <div className="[&_iframe]:!w-full">
                    <Turnstile
                      ref={turnstileRef}
                      siteKey={TURNSTILE_SITE_KEY}
                      onSuccess={setTurnstileToken}
                      onExpire={() => setTurnstileToken(null)}
                      onError={() => setTurnstileToken(null)}
                      options={{ theme: "light", size: "flexible", action: "staff_password_reset" }}
                    />
                  </div>
                )}
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
    </EmployeeAuthShell>
  );
}

const contactClass =
  "flex w-full items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-[13px] font-semibold text-slate-700 transition-colors hover:border-slate-300 hover:bg-slate-50";

/** What /api/employee/auth/forgot-password sends when no code can go out (lib/cannot-send.ts). */
interface Contact {
  phone: string;
  tel: string;
  whatsappNumber: string;
  whatsapp: string;
}
