"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, Loader2 } from "lucide-react";
import { authFieldError, authFormError, authInput, authLabel } from "@/components/ui/authFieldStyles";
import { MobileNumberField } from "@/components/supplier/MobileNumberField";
import { checkPasswordStrength } from "@/lib/password-rules";
import { readProfile } from "@/lib/supplier-offer";

interface Account {
  email: string;
  name: string;
  mobile: string;
  companyName: string;
  wechatId: string;
  companyAddress: string;
  since: string;
}

const button =
  "inline-flex items-center justify-center gap-2 rounded-xl bg-brand-dark px-5 py-2.5 text-[13.5px] font-bold text-white transition-colors hover:bg-brand-deep disabled:opacity-60";

/**
 * The supplier's profile: the details every application starts from, and the password. The company, the WeChat
 * ID and the address are optional here, since the first application asks for them; once given they can be
 * changed here, and the next application opens with the change.
 */
export function SupplierProfile({ account }: { account: Account }) {
  const router = useRouter();
  const [form, setForm] = useState({
    name: account.name,
    mobile: account.mobile,
    companyName: account.companyName,
    wechatId: account.wechatId,
    companyAddress: account.companyAddress,
  });
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<{ text: string; field?: string } | null>(null);

  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [pwBusy, setPwBusy] = useState(false);
  const [pwDone, setPwDone] = useState(false);
  const [pwError, setPwError] = useState<string | null>(null);

  const set = (k: keyof typeof form) => (v: string) => {
    setSaved(false);
    setForm((f) => ({ ...f, [k]: v }));
  };

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    const check = readProfile(form);
    if (!check.ok) return setError({ text: check.error, field: check.field });
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/supplier/me/", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) return setError({ text: data?.error ?? "Your changes did not save. Try again.", field: data?.field });
      setSaved(true);
      router.refresh();
    } catch {
      setError({ text: "Network error. Your changes did not save." });
    } finally {
      setSaving(false);
    }
  };

  const changePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    const strength = checkPasswordStrength(next);
    if (!current) return setPwError("Enter your current password.");
    if (!strength.ok) return setPwError(strength.error);
    setPwBusy(true);
    setPwError(null);
    try {
      const res = await fetch("/api/supplier/me/password/", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ currentPassword: current, newPassword: next }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) return setPwError(data?.error ?? "The password did not change. Try again.");
      setPwDone(true);
      setCurrent("");
      setNext("");
    } catch {
      setPwError("Network error. The password did not change.");
    } finally {
      setPwBusy(false);
    }
  };

  const fieldError = (f: string) => (error?.field === f ? <span className={authFieldError}>{error.text}</span> : null);
  const since = new Date(account.since).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" });

  return (
    <main className="px-4 pb-16 pt-6 sm:px-6 sm:pt-8 lg:px-8">
      <h1 className="text-[24px] font-extrabold tracking-tight text-[#0b2230]">Profile</h1>
      <p className="mt-0.5 text-[13.5px] text-[#5b6f76]">
        Signed in as <span className="font-semibold text-[#10262e]">{account.email}</span> · Supplier since {since}
      </p>

      <div className="mt-6 grid items-start gap-5 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
      <form onSubmit={save} noValidate className="space-y-4 rounded-[22px] bg-white p-5 ring-1 ring-[#e1e8ea] sm:p-7">
        <div>
          <h2 className="text-[16px] font-bold text-[#0b2230]">Your details</h2>
          <p className="text-[12.5px] text-[#5b6f76]">Every application starts from these. The team uses them to reach you.</p>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label htmlFor="p-name" className={authLabel}>
              Your name
            </label>
            <input id="p-name" value={form.name} onChange={(e) => set("name")(e.target.value)} className={authInput} />
            {fieldError("name")}
          </div>
          <div>
            <MobileNumberField id="p-mobile" initial={account.mobile} onChange={set("mobile")} />
            {fieldError("mobile")}
          </div>
          <div>
            <label htmlFor="p-company" className={authLabel}>
              Company name
            </label>
            <input id="p-company" value={form.companyName} onChange={(e) => set("companyName")(e.target.value)} className={authInput} />
            {fieldError("companyName")}
          </div>
          <div>
            <label htmlFor="p-wechat" className={authLabel}>
              WeChat ID
            </label>
            <input
              id="p-wechat"
              autoCapitalize="none"
              spellCheck={false}
              value={form.wechatId}
              onChange={(e) => set("wechatId")(e.target.value)}
              className={authInput}
            />
            {fieldError("wechatId")}
          </div>
        </div>
        <div>
          <label htmlFor="p-address" className={authLabel}>
            Company address
          </label>
          <textarea
            id="p-address"
            rows={2}
            value={form.companyAddress}
            onChange={(e) => set("companyAddress")(e.target.value)}
            className={`${authInput} resize-none`}
          />
          {fieldError("companyAddress")}
        </div>
        {error && !error.field && <p role="alert" className={authFormError}>{error.text}</p>}
        <div className="flex items-center gap-3">
          <button type="submit" disabled={saving} className={button}>
            {saving && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
            Save details
          </button>
          {saved && (
            <span className="inline-flex items-center gap-1.5 text-[13px] font-semibold text-emerald-700" role="status">
              <CheckCircle2 className="h-4 w-4" aria-hidden="true" /> Saved
            </span>
          )}
        </div>
      </form>

      <form onSubmit={changePassword} noValidate className="space-y-4 rounded-[22px] bg-white p-5 ring-1 ring-[#e1e8ea] sm:p-7">
        <div>
          <h2 className="text-[16px] font-bold text-[#0b2230]">Password</h2>
          <p className="text-[12.5px] text-[#5b6f76]">Changing it signs you out on every other device.</p>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label htmlFor="p-current" className={authLabel}>
              Current password
            </label>
            <input
              id="p-current"
              type="password"
              autoComplete="current-password"
              value={current}
              onChange={(e) => {
                setPwDone(false);
                setCurrent(e.target.value);
              }}
              className={authInput}
            />
          </div>
          <div>
            <label htmlFor="p-next" className={authLabel}>
              New password
            </label>
            <input
              id="p-next"
              type="password"
              autoComplete="new-password"
              placeholder="At least 8 characters"
              value={next}
              onChange={(e) => {
                setPwDone(false);
                setNext(e.target.value);
              }}
              className={authInput}
            />
          </div>
        </div>
        {pwError && <p role="alert" className={authFormError}>{pwError}</p>}
        <div className="flex items-center gap-3">
          <button type="submit" disabled={pwBusy} className={button}>
            {pwBusy && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
            Change password
          </button>
          {pwDone && (
            <span className="inline-flex items-center gap-1.5 text-[13px] font-semibold text-emerald-700" role="status">
              <CheckCircle2 className="h-4 w-4" aria-hidden="true" /> Password changed
            </span>
          )}
        </div>
      </form>
      </div>
    </main>
  );
}
