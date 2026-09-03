"use client";

import { useState } from "react";
import { Check, Eye, EyeOff, KeyRound, Loader2 } from "lucide-react";
import { Card } from "@/components/account/AccountShell";
import { checkPasswordStrength } from "@/lib/password-rules";

/**
 * Set a password, or change the one already there.
 *
 * Which of the two it is comes from the account, not from a choice: an account
 * that has a password has to prove the old one, and an account that has none
 * cannot be asked to.
 *
 * The second case is why this exists. Every customer on the site today signed
 * in with Google or a phone code and has no password at all — without this the
 * new email sign-in would only ever work for people who join after today.
 */
export function PasswordSection({
  hasPassword,
  onChanged,
}: {
  hasPassword: boolean;
  /** Re-read the session, so the page stops offering "Set" once one exists. */
  onChanged: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const strength = checkPasswordStrength(next);
  const matches = next !== "" && next === confirm;
  const ready = strength.ok && matches && (!hasPassword || current !== "");

  const save = async () => {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/web/auth/set-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          newPassword: next,
          ...(hasPassword ? { currentPassword: current } : {}),
        }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(json?.error ?? "Could not save your password.");
        return;
      }
      // Nothing typed is kept around after it has been used.
      setCurrent("");
      setNext("");
      setConfirm("");
      setSaved(true);
      setOpen(false);
      onChanged();
      setTimeout(() => setSaved(false), 3000);
    } catch {
      setError("Could not reach the server. Please try again.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card className="mt-4">
      <div className="flex flex-wrap items-center justify-between gap-3 p-5">
        <div className="flex items-start gap-3">
          <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-slate-100">
            <KeyRound size={16} className="text-slate-500" />
          </span>
          <div>
            <p className="text-sm font-semibold text-slate-800">
              {hasPassword ? "Password" : "Set a password"}
            </p>
            <p className="mt-0.5 text-[13px] leading-relaxed text-slate-500">
              {hasPassword
                ? "Used with your email to sign in."
                : "Add one and you can sign in with your email instead of waiting for a code."}
            </p>
          </div>
        </div>

        <button
          onClick={() => {
            setError(null);
            setOpen((o) => !o);
          }}
          className="shrink-0 rounded-xl bg-white px-4 py-2 text-[13px] font-semibold text-brand ring-1 ring-brand/20 transition-colors hover:bg-brand/5 cursor-pointer"
        >
          {open ? "Cancel" : hasPassword ? "Change" : "Set password"}
        </button>
      </div>

      {saved && (
        <p className="flex items-center gap-2 border-t border-slate-100 bg-emerald-50 px-5 py-3 text-[13px] font-medium text-emerald-700">
          <Check size={15} />
          Password saved.
        </p>
      )}

      {open && (
        <div className="space-y-4 border-t border-slate-100 p-5">
          {hasPassword && (
            <Field label="Current password">
              <input
                type="password"
                autoComplete="current-password"
                value={current}
                onChange={(e) => setCurrent(e.target.value)}
                className={inputClass}
              />
            </Field>
          )}

          <Field label={hasPassword ? "New password" : "Password"}>
            <span className="relative block">
              <input
                type={show ? "text" : "password"}
                autoComplete="new-password"
                placeholder="At least 8 characters"
                value={next}
                onChange={(e) => setNext(e.target.value)}
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
            {next !== "" && !strength.ok && (
              <p className="mt-1.5 text-[12px] text-amber-700">{strength.error}</p>
            )}
          </Field>

          <Field label="Confirm">
            <input
              type={show ? "text" : "password"}
              autoComplete="new-password"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && ready && !busy && void save()}
              className={inputClass}
            />
            {confirm !== "" && !matches && (
              <p className="mt-1.5 text-[12px] text-amber-700">Those don&apos;t match.</p>
            )}
          </Field>

          {error && (
            <p role="alert" className="rounded-xl bg-red-50 px-4 py-2.5 text-[13px] text-red-700">
              {error}
            </p>
          )}

          <div className="flex justify-end">
            <button
              onClick={() => void save()}
              disabled={busy || !ready}
              className="flex items-center gap-2 rounded-xl bg-brand px-6 py-2.5 text-sm font-semibold text-white transition-all hover:bg-brand-dark disabled:cursor-not-allowed disabled:opacity-50 cursor-pointer"
            >
              {busy && <Loader2 size={15} className="animate-spin" />}
              {hasPassword ? "Change password" : "Save password"}
            </button>
          </div>
        </div>
      )}
    </Card>
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
