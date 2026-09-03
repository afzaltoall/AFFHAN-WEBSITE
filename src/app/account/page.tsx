"use client";

import { useEffect, useState } from "react";
import { BadgeCheck, Check, Loader2, Mail, Phone, Plus, ShieldCheck } from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { GoogleG } from "@/components/ui/GoogleG";
import { avatarUrl } from "@/lib/avatar";
import { Card, Fade, SectionHeader } from "@/components/account/AccountShell";
import { AddPhoneDialog } from "@/components/account/AddPhoneDialog";
import { PasswordSection } from "@/components/account/PasswordSection";

/**
 * The customer's own profile: see it, correct it.
 *
 * Signing out lives in the sidebar now, beside every other section, rather
 * than at the bottom of this one form where it was only reachable from a page
 * about editing your name.
 *
 * The phone number is not a field on this form. Adding or changing one means
 * proving it with a fresh code — letting a plain save move an account onto an
 * unverified number would be a way to take someone else's — so it goes through
 * AddPhoneDialog and /api/web/auth/add-phone instead.
 */
export default function AccountPage() {
  const { user, refreshSession } = useAuth();

  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [addPhoneOpen, setAddPhoneOpen] = useState(false);

  // Seed the form once the session is known. The context is the source of
  // truth; this page only holds what is being typed.
  useEffect(() => {
    if (!user) return;
    // Use the stored halves. Only accounts that predate those columns — and
    // Google sign-ups, which arrive as one display name — fall back to a split,
    // which is exactly the guess this avoids everywhere else.
    const parts = (user.name ?? "").trim().split(/\s+/);
    setFirstName(user.firstName ?? parts[0] ?? "");
    setLastName(user.lastName ?? parts.slice(1).join(" "));
    setEmail(user.email ?? "");
  }, [user]);

  const save = async () => {
    setBusy(true);
    setError(null);
    setSaved(false);
    try {
      const res = await fetch("/api/web/auth/update-profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ firstName, lastName, email }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(json?.error ?? "Could not save your details.");
        return;
      }
      // Re-read rather than trusting the local copy, so the navbar and this
      // page can never disagree about the name.
      await refreshSession();
      setSaved(true);
      setTimeout(() => setSaved(false), 2600);
    } catch {
      setError("Could not reach the server. Please try again.");
    } finally {
      setBusy(false);
    }
  };

  // The layout holds the redirect and the spinner; by here there is a session.
  if (!user) return null;

  const initial = (user.name || user.phone || "?").charAt(0).toUpperCase();
  const linkedWithGoogle = user.authProvider.includes("GOOGLE");
  const memberSince = user.createdAt
    ? new Date(user.createdAt).toLocaleDateString(undefined, { month: "long", year: "numeric" })
    : null;

  return (
    <Fade>
      <SectionHeader title="Account" subtitle="Your details, and how you sign in." />

      <Card>
        {/* Identity */}
        <div className="flex items-center gap-4 bg-gradient-to-br from-brand to-brand-dark px-6 py-6 text-white">
          {user.profileImage ? (
            // Plain <img>, as in the navbar: a Google avatar is already sized
            // and cached by their CDN, and routing it through the optimizer
            // means a host allowlist and a server restart before it loads.
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={avatarUrl(user.profileImage, 64) ?? user.profileImage}
              alt=""
              width={64}
              height={64}
              referrerPolicy="no-referrer"
              className="h-16 w-16 shrink-0 rounded-full object-cover ring-2 ring-white/40"
            />
          ) : (
            <span className="flex h-16 w-16 shrink-0 items-center justify-center rounded-full bg-white/15 text-2xl font-bold ring-2 ring-white/30">
              {initial}
            </span>
          )}

          <div className="min-w-0">
            <p className="truncate text-lg font-bold tracking-tight">{user.name}</p>
            {user.phone && (
              <p className="mt-1 flex items-center gap-1.5 text-[13px] text-white/80">
                <Phone size={12} className="shrink-0" />
                {user.phone}
              </p>
            )}
            {user.email && (
              <p className="mt-0.5 flex items-center gap-1.5 truncate text-[13px] text-white/80">
                <Mail size={12} className="shrink-0" />
                {user.email}
              </p>
            )}
            {linkedWithGoogle && (
              <span className="mt-2 inline-flex items-center gap-1.5 rounded-full bg-white/15 px-2.5 py-1 text-[11px] font-semibold">
                <span className="flex h-3.5 w-3.5 items-center justify-center rounded-full bg-white">
                  <GoogleG size={9} />
                </span>
                Linked with Google
              </span>
            )}
          </div>
        </div>

        {/* Standing facts about the account, as opposed to the editable ones
            below. Deliberately not an "Account status: Active" row — a session
            is refused outright unless the account is active, so that line could
            never say anything else, and a field with one possible value is
            furniture. These four do vary. */}
        <dl className="grid grid-cols-2 gap-px border-b border-slate-100 bg-slate-100 sm:grid-cols-4">
          <Fact label="Member since" value={memberSince ?? "—"} />
          <Fact
            label="Mobile"
            value={user.phoneVerified ? "Verified" : user.phone ? "Unverified" : "Not added"}
            good={user.phoneVerified}
          />
          <Fact
            label="Email"
            value={user.emailVerified ? "Verified" : user.email ? "Unverified" : "Not added"}
            good={user.emailVerified}
          />
          <Fact label="Sign in with" value={signInMethod(user.authProvider)} />
        </dl>

        {/* Editable */}
        <div className="space-y-4 p-6">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Field label="First name">
              <input
                type="text"
                autoComplete="given-name"
                value={firstName}
                onChange={(e) => setFirstName(e.target.value)}
                className={inputClass}
              />
            </Field>
            <Field label="Last name">
              <input
                type="text"
                autoComplete="family-name"
                value={lastName}
                onChange={(e) => setLastName(e.target.value)}
                className={inputClass}
              />
            </Field>
          </div>

          <Field label="Email">
            <input
              type="email"
              autoComplete="email"
              placeholder="you@company.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className={inputClass}
            />
            <p className="mt-1.5 text-[12px] text-slate-400">
              Where your quotes and replies are sent.
            </p>
          </Field>

          {/* Shown, not typed. The number is proved with a code rather than
              saved with the rest of the form — letting a plain save move an
              account onto an unverified number would be a way to take someone
              else's. Adding one opens that proof; changing one is the same
              flow, which is why both use the one dialog. */}
          <Field label="Mobile number">
            <div className="flex items-center justify-between gap-3 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
              <span className="text-sm font-medium text-slate-700">
                {user.phone ?? "No number yet"}
              </span>
              <span className="flex shrink-0 items-center gap-3">
                {user.phone && user.phoneVerified && (
                  <span className="inline-flex items-center gap-1 text-[12px] font-medium text-emerald-600">
                    <BadgeCheck size={13} />
                    Verified
                  </span>
                )}
                <button
                  type="button"
                  onClick={() => setAddPhoneOpen(true)}
                  className="inline-flex items-center gap-1 rounded-lg bg-white px-2.5 py-1.5 text-[12px] font-semibold text-brand ring-1 ring-brand/20 transition-colors hover:bg-brand/5 cursor-pointer"
                >
                  {user.phone ? "Change" : <><Plus size={12} /> Add number</>}
                </button>
              </span>
            </div>
            <p className="mt-1.5 text-[12px] text-slate-400">
              {user.phone
                ? "Changing it means verifying the new number with a code."
                : "Add one and you'll be able to sign in with an OTP as well as with Google."}
            </p>
          </Field>

          {error && (
            <p role="alert" className="rounded-xl bg-red-50 px-4 py-2.5 text-[13px] text-red-700">
              {error}
            </p>
          )}

          <div className="flex justify-end pt-1">
            <button
              onClick={() => void save()}
              disabled={busy || !firstName.trim()}
              className="flex items-center justify-center gap-2 rounded-xl bg-brand px-6 py-2.5 text-sm font-semibold text-white transition-all hover:bg-brand-dark disabled:cursor-not-allowed disabled:opacity-50 cursor-pointer"
            >
              {busy && <Loader2 size={15} className="animate-spin" />}
              {saved && !busy && <Check size={15} />}
              {saved && !busy ? "Saved" : "Save changes"}
            </button>
          </div>
        </div>
      </Card>

      {/* Below the profile card rather than inside it: saving a name and
          setting a password are different acts, and one Save button for both
          would make the second one look optional. */}
      <PasswordSection hasPassword={user.hasPassword} onChanged={() => void refreshSession()} />

      <AddPhoneDialog
        open={addPhoneOpen}
        onClose={() => setAddPhoneOpen(false)}
        // Re-read rather than patching the local copy, so the navbar and this
        // page cannot disagree about what is on the account.
        onAdded={() => void refreshSession()}
      />

      <p className="mt-4 flex items-start gap-2 px-1 text-[12px] leading-relaxed text-slate-400">
        <ShieldCheck size={14} className="mt-px shrink-0" />
        Your details are used to answer your inquiries. Affhan does not sell or share them.
      </p>
    </Fade>
  );
}

/**
 * "PHONE_AND_EMAIL" is storage; this is what a person reads.
 *
 * All three parts, joined. The earlier version stopped at the first match it
 * found, so an account that could sign in with a code OR a password was told
 * it could only use the code — which is exactly the thing this page exists to
 * tell someone accurately.
 */
function signInMethod(provider: string) {
  const parts = [
    provider.includes("GOOGLE") && "Google",
    provider.includes("PHONE") && "OTP",
    provider.includes("EMAIL") && "password",
  ].filter(Boolean) as string[];
  return parts.length ? parts.join(" or ") : provider;
}

function Fact({ label, value, good }: { label: string; value: string; good?: boolean }) {
  return (
    <div className="bg-white px-5 py-3.5">
      <dt className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">{label}</dt>
      <dd
        className={`mt-1 text-[13px] font-semibold ${good ? "text-emerald-600" : "text-slate-700"}`}
      >
        {value}
      </dd>
    </div>
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
