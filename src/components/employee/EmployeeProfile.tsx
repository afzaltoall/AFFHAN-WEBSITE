"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  BadgeCheck, Camera, Eye, EyeOff, KeyRound, Loader2, MapPin, ShieldCheck, Trash2,
} from "lucide-react";
import { timeAgo } from "@/lib/relative-time";
import { checkPasswordStrength } from "@/lib/password-rules";
import { useLiveRefresh } from "@/lib/useLiveRefresh";
import {
  OUTCOME_ORDER, leadStatusChip, leadStatusLabel, outcomeMeta, type LeadOutcomeKey,
} from "@/lib/leadStatus";
import { LiveRefreshButton } from "@/components/ui/LiveRefreshButton";
import { EmployeeSignOut } from "@/components/employee/EmployeeSignOut";
import { wt } from "@/components/employee/workspace-ui";

export interface ProfileActivity {
  id: string;
  status: string;
  note: string | null;
  createdAt: string;
  who: string;
  what: string;
}

interface ProfileData {
  name: string;
  email: string;
  region: string | null;
  rank: string;
  image: string | null;
  createdAt: string;
  lastLoginAt: string | null;
}

interface ProfileStats {
  assigned: number;
  inquiries: number;
  contacts: number;
  recorded: number;
  breakdown: Record<LeadOutcomeKey, number>;
}

const card = "rounded-2xl bg-white p-5 shadow-sm ring-1 ring-black/[0.04]";
const eyebrow = `text-[11px] font-bold uppercase tracking-wider ${wt.soft}`;

/**
 * A member of staff's own page: their account, their numbers, their recent
 * work, and the two things they manage themselves.
 */
export function EmployeeProfile({
  profile,
  stats,
  activity,
  idleMinutes,
}: {
  profile: ProfileData;
  stats: ProfileStats;
  activity: ProfileActivity[];
  idleMinutes: number;
}) {
  const { refresh, refreshing, updatedAt } = useLiveRefresh(60_000);
  const converted = stats.breakdown.CONVERTED;
  const decided = converted + stats.breakdown.NOT_CONVERTED;
  const rate = decided > 0 ? Math.round((converted / decided) * 100) : null;

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">Profile</h1>
          <p className={`mt-0.5 text-[13px] ${wt.soft}`}>Your account, how your leads are going, and your password.</p>
        </div>
        <LiveRefreshButton onRefresh={refresh} refreshing={refreshing} updatedAt={updatedAt} />
      </div>

      <Identity profile={profile} onChanged={refresh} />

      {/* KPI row. Stat tiles: one number each, a label, and — where a number
          needs its denominator to mean anything — the denominator under it. */}
      <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        <Stat label="Assigned to you" value={stats.assigned.toLocaleString("en-GB")}
          sub={`${stats.inquiries} quote ${stats.inquiries === 1 ? "request" : "requests"} · ${stats.contacts} ${stats.contacts === 1 ? "message" : "messages"}`} />
        <Stat label="Converted" value={converted.toLocaleString("en-GB")} sub="by their newest outcome" />
        <Stat label="Conversion rate" value={rate === null ? "—" : `${rate}%`}
          sub={decided > 0 ? `${converted} of ${decided} decided ${decided === 1 ? "lead" : "leads"}` : "nothing decided yet"} />
        <Stat label="Updates recorded" value={stats.recorded.toLocaleString("en-GB")} sub="all time" />
      </div>

      <div className="grid gap-6 xl:grid-cols-3">
        <div className="space-y-6 xl:col-span-2">
          <div className={card}>
            <div className="flex items-baseline justify-between gap-3">
              <h2 className="text-[15px] font-semibold">Where your leads stand</h2>
              <span className={`text-[12px] ${wt.soft}`}>each lead once, by its newest outcome</span>
            </div>
            <Breakdown breakdown={stats.breakdown} total={stats.assigned} />
          </div>

          <div className={`${card} p-0`}>
            <div className="flex items-baseline justify-between px-5 pb-3 pt-5">
              <h2 className="text-[15px] font-semibold">Your recent updates</h2>
              <span className={`text-[12px] ${wt.soft}`}>newest first</span>
            </div>
            {activity.length === 0 ? (
              <p className={`border-t px-5 py-8 text-center text-[13px] ${wt.border} ${wt.soft}`}>
                Nothing recorded yet. Open a lead from My leads and record what happened.
              </p>
            ) : (
              <ul className={`divide-y border-t ${wt.divide} ${wt.border}`}>
                {activity.map((a) => (
                  <li key={a.id} className="flex items-start gap-3 px-5 py-3">
                    <span className={`mt-0.5 shrink-0 rounded-md px-1.5 py-0.5 text-[11px] font-bold ${leadStatusChip(a.status)}`}>
                      {leadStatusLabel(a.status)}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[13px] font-semibold">{a.who}</p>
                      <p className={`truncate text-[12px] ${wt.soft}`}>{a.what}</p>
                      {a.note && <p className="mt-0.5 line-clamp-2 text-[12.5px] text-[#48484a]">{a.note}</p>}
                    </div>
                    <span className={`shrink-0 text-[12px] ${wt.soft}`} title={new Date(a.createdAt).toLocaleString("en-GB")}>
                      {timeAgo(a.createdAt)}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>

        <div className="space-y-6">
          <PasswordCard />
          <div className={card}>
            <h2 className="flex items-center gap-2 text-[15px] font-semibold">
              <ShieldCheck className="h-4 w-4 text-emerald-600" /> This session
            </h2>
            <p className={`mt-1.5 text-[13px] leading-relaxed ${wt.mid}`}>
              You are signed in on this device. The session ends after {idleMinutes} minutes without activity, and
              you are asked whether you are still there two minutes before it does. Other tabs of the workspace
              stay in step with this one.
            </p>
            <div className="mt-4">
              <EmployeeSignOut />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function Stat({ label, value, sub }: { label: string; value: string; sub: string }) {
  return (
    <div className={card}>
      <p className="text-2xl font-semibold tracking-tight sm:text-[28px]">{value}</p>
      <p className={`mt-1 text-[12.5px] font-medium ${wt.mid}`}>{label}</p>
      <p className={`mt-0.5 text-[11.5px] ${wt.soft}`}>{sub}</p>
    </div>
  );
}

function Identity({ profile, onChanged }: { profile: ProfileData; onChanged: () => void }) {
  const router = useRouter();
  const [image, setImage] = useState(profile.image);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement | null>(null);

  const save = async (next: string | null) => {
    const res = await fetch("/api/employee/profile/", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ image: next }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || "Could not save the photo.");
    setImage(data.image ?? null);
    // The rail shows it too, and that comes from the server.
    onChanged();
    router.refresh();
  };

  const upload = async (file: File) => {
    setBusy(true);
    setError(null);
    try {
      if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) {
        throw new Error("Use a JPEG, PNG or WebP image.");
      }
      const res = await fetch("/api/employee/profile/photo-url/", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ contentType: file.type }),
      });
      const target = await res.json().catch(() => ({}));
      if (!res.ok || !target.success) throw new Error(target.error || "Could not start the upload.");
      const form = new FormData();
      Object.entries(target.uploadFields as Record<string, string>).forEach(([k, v]) => form.append(k, v));
      // Last, after the policy fields: S3 ignores anything that follows it.
      form.append("file", file);
      const put = await fetch(target.uploadUrl, { method: "POST", body: form });
      if (!put.ok) throw new Error("The upload was refused. Try a smaller image.");
      await save(target.publicUrl as string);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed.");
    } finally {
      setBusy(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  const remove = async () => {
    setBusy(true);
    setError(null);
    try {
      await save(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not remove the photo.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className={card}>
      <div className="flex flex-col gap-5 sm:flex-row sm:items-center">
        <div className="relative shrink-0 self-start">
          {image ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={image} alt="" className="h-24 w-24 rounded-full bg-[#f5f5f7] object-cover ring-1 ring-black/10" />
          ) : (
            <span className={`flex h-24 w-24 items-center justify-center rounded-full text-3xl font-semibold ring-1 ring-black/10 ${wt.thumb} ${wt.soft}`}>
              {profile.name.charAt(0).toUpperCase()}
            </span>
          )}
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            disabled={busy}
            aria-label="Change photo"
            title="Change photo"
            className="absolute -bottom-1 -right-1 flex h-9 w-9 items-center justify-center rounded-full bg-[#1d1d1f] text-white shadow-md ring-2 ring-white transition-colors hover:bg-black disabled:opacity-60"
          >
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Camera className="h-4 w-4" />}
          </button>
          <input
            ref={fileRef}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            className="hidden"
            onChange={(e) => { const f = e.target.files?.[0]; if (f) void upload(f); }}
          />
        </div>

        <div className="min-w-0 flex-1">
          <h2 className="truncate text-xl font-semibold tracking-tight">{profile.name}</h2>
          <p className={`truncate text-[13px] ${wt.soft}`}>{profile.email}</p>
          <div className="mt-2.5 flex flex-wrap items-center gap-2">
            {profile.region && (
              <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[12px] font-semibold ${wt.chip}`}>
                <MapPin className="h-3 w-3" /> {profile.region}
              </span>
            )}
            <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[12px] font-semibold ${wt.chip}`}>
              <BadgeCheck className="h-3 w-3" /> {profile.rank}
            </span>
            <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-500/10 px-2.5 py-1 text-[12px] font-semibold text-emerald-700">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" /> Active
            </span>
          </div>
        </div>

        <dl className="grid shrink-0 grid-cols-2 gap-x-8 gap-y-2 text-[13px] sm:text-right">
          <div>
            <dt className={eyebrow}>Member since</dt>
            <dd className="mt-0.5 font-semibold">
              {new Date(profile.createdAt).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}
            </dd>
          </div>
          <div>
            <dt className={eyebrow}>Last sign-in</dt>
            <dd className="mt-0.5 font-semibold">{profile.lastLoginAt ? timeAgo(profile.lastLoginAt) : "—"}</dd>
          </div>
        </dl>
      </div>

      <div className={`mt-4 flex flex-wrap items-center gap-x-4 gap-y-2 border-t pt-3.5 text-[12.5px] ${wt.border}`}>
        <button type="button" onClick={() => fileRef.current?.click()} disabled={busy} className="font-semibold text-brand-dark hover:underline disabled:opacity-60">
          {image ? "Change photo" : "Add a photo"}
        </button>
        {image && (
          <button type="button" onClick={() => void remove()} disabled={busy} className={`inline-flex items-center gap-1 font-semibold ${wt.soft} hover:text-red-600 disabled:opacity-60`}>
            <Trash2 className="h-3.5 w-3.5" /> Remove photo
          </button>
        )}
        <span className={wt.soft}>Your name, email and region are set by an administrator.</span>
      </div>
      {error && <p className="mt-2 rounded-xl bg-red-500/10 px-3 py-2 text-[12.5px] font-medium text-red-700">{error}</p>}
    </div>
  );
}

/**
 * Where the leads stand, as one part-to-whole bar.
 *
 * A stacked bar because the question is share of a whole; kept thin (12px) and
 * split by 2px of surface rather than outlined. Order and colours are
 * OUTCOME_ORDER's, which were checked with the palette validator as adjacent
 * segments. The list beneath is the legend and the table at once: every
 * segment is named there with its count and share, so nothing depends on
 * telling colours apart, and the values the bar only implies are written out.
 */
function Breakdown({ breakdown, total }: { breakdown: Record<LeadOutcomeKey, number>; total: number }) {
  if (total === 0) {
    return (
      <p className={`mt-4 text-[13px] ${wt.soft}`}>
        Nothing is assigned to you yet. This fills in as leads are handed over and you record what happens.
      </p>
    );
  }
  const parts = OUTCOME_ORDER.map((key) => ({ key, n: breakdown[key] ?? 0 })).filter((p) => p.n > 0);
  const pct = (n: number) => `${Math.round((n / total) * 100)}%`;

  return (
    <div className="mt-4">
      <div className="flex h-3 w-full gap-[2px]" role="img" aria-label={parts.map((p) => `${outcomeMeta(p.key).label} ${p.n}`).join(", ")}>
        {parts.map((p, i) => (
          <div
            key={p.key}
            className={`group relative min-w-[6px] ${outcomeMeta(p.key).dot} ${i === 0 ? "rounded-l-[4px]" : ""} ${i === parts.length - 1 ? "rounded-r-[4px]" : ""}`}
            style={{ flexGrow: p.n, flexBasis: 0 }}
          >
            <span className="pointer-events-none absolute bottom-full left-1/2 z-10 mb-2 -translate-x-1/2 whitespace-nowrap rounded-md bg-[#1d1d1f] px-2 py-1 text-[11px] font-semibold text-white opacity-0 shadow transition-opacity group-hover:opacity-100">
              {outcomeMeta(p.key).label} · {p.n} ({pct(p.n)})
            </span>
          </div>
        ))}
      </div>
      <ul className="mt-4 grid gap-x-8 gap-y-2 sm:grid-cols-2">
        {OUTCOME_ORDER.map((key) => {
          const n = breakdown[key] ?? 0;
          return (
            <li key={key} className="flex items-center gap-2.5 text-[13px]">
              <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${outcomeMeta(key).dot}`} />
              <span className="flex-1 font-medium">{outcomeMeta(key).label}</span>
              <span className="font-semibold tabular-nums">{n}</span>
              <span className={`w-10 text-right tabular-nums ${wt.soft}`}>{pct(n)}</span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function PasswordCard() {
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  const strength = next ? checkPasswordStrength(next) : null;
  const mismatch = confirm.length > 0 && confirm !== next;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setDone(false);
    if (strength && !strength.ok) return setError(strength.error);
    if (next !== confirm) return setError("The two new passwords do not match.");
    setBusy(true);
    try {
      const res = await fetch("/api/employee/profile/password/", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ current, next }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(res.status === 401 ? "Your session has ended. Sign in again to change your password." : data.error || "Could not change it.");
        return;
      }
      setCurrent(""); setNext(""); setConfirm("");
      setDone(true);
    } catch {
      setError("Network error. Try again.");
    } finally {
      setBusy(false);
    }
  };

  const field = `h-10 w-full rounded-xl px-3 text-[13px] outline-none ring-1 ring-transparent transition-shadow focus:bg-white focus:ring-2 focus:ring-brand/30 ${wt.input}`;

  return (
    <form onSubmit={submit} className={card}>
      <h2 className="flex items-center gap-2 text-[15px] font-semibold">
        <KeyRound className="h-4 w-4" /> Change password
      </h2>
      <p className={`mt-1 text-[12.5px] ${wt.soft}`}>Changing it signs you out everywhere else.</p>

      <div className="mt-4 space-y-3">
        <label className="block">
          <span className={eyebrow}>Current password</span>
          <input type={show ? "text" : "password"} autoComplete="current-password" value={current} onChange={(e) => setCurrent(e.target.value)} className={`mt-1 ${field}`} required />
        </label>
        <label className="block">
          <span className={eyebrow}>New password</span>
          <input type={show ? "text" : "password"} autoComplete="new-password" value={next} onChange={(e) => setNext(e.target.value)} className={`mt-1 ${field}`} required />
          <span className={`mt-1 block text-[11.5px] ${strength && !strength.ok ? "text-amber-700" : wt.soft}`}>
            {strength ? (strength.ok ? "Strong enough." : strength.error) : "At least 8 characters, mixing letters with numbers or symbols."}
          </span>
        </label>
        <label className="block">
          <span className={eyebrow}>Confirm new password</span>
          <input type={show ? "text" : "password"} autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} className={`mt-1 ${field}`} required />
          {mismatch && <span className="mt-1 block text-[11.5px] text-amber-700">Does not match yet.</span>}
        </label>
      </div>

      <div className="mt-4 flex items-center justify-between gap-3">
        <button type="button" onClick={() => setShow((s) => !s)} className={`inline-flex items-center gap-1.5 text-[12.5px] font-semibold ${wt.soft} hover:text-[#1d1d1f]`}>
          {show ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />} {show ? "Hide" : "Show"}
        </button>
        <button type="submit" disabled={busy || !current || !next || !confirm} className="inline-flex items-center gap-2 rounded-xl bg-[#1d1d1f] px-4 py-2 text-[13px] font-semibold text-white transition-colors hover:bg-black disabled:opacity-50">
          {busy && <Loader2 className="h-4 w-4 animate-spin" />} Change password
        </button>
      </div>
      {done && <p className="mt-3 rounded-xl bg-emerald-500/10 px-3 py-2 text-[12.5px] font-medium text-emerald-700">Password changed. Any other device signed in as you has been signed out.</p>}
      {error && <p className="mt-3 rounded-xl bg-red-500/10 px-3 py-2 text-[12.5px] font-medium text-red-700">{error}</p>}
    </form>
  );
}

export default EmployeeProfile;
