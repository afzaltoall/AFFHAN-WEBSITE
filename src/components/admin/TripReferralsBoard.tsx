"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, Download, X } from "lucide-react";
import { CargoDatePicker } from "@/components/cargo/CargoDatePicker";
import type { ReferralBoardRow, ReferralPayoutView, ReferralSettings, ReferralTotals, ReferredApplication } from "@/lib/server/trip-referrals";
import { istDate, istLastDay, referralLink, referralWaiting, rupees } from "@/lib/trip-referral-shared";

/**
 * Free China Trip → Employee tasks (the owner, 2026-11-02: "how will admin see the employee's referrals, how many they
 * did, how it is going"): the task's settings, everyone's progress best first, and one employee's applications to count
 * or decline, with Mark paid. In the Free China Trip page's own look. Every press writes through
 * /api/admin/trip-referrals/ and reads the page again (router.refresh), so what shows is always what is stored.
 */

const sfFont = {
  fontFamily: '-apple-system, BlinkMacSystemFont, "SF Pro Display", "SF Pro Text", "Segoe UI", system-ui, sans-serif',
};

const fmtDate = (iso: string) =>
  new Date(iso).toLocaleString("en-IN", { day: "numeric", month: "short", year: "numeric", hour: "numeric", minute: "2-digit", timeZone: "Asia/Kolkata" });
const fmtDay = (iso: string) => new Date(iso).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric", timeZone: "Asia/Kolkata" });

export interface ReferralDetail {
  employeeId: string;
  name: string;
  isActive: boolean;
  code: string;
  settings: ReferralSettings;
  totals: ReferralTotals;
  applications: ReferredApplication[];
  payouts: ReferralPayoutView[];
}

const card = "rounded-2xl bg-white shadow-sm ring-1 ring-black/[0.06]";
const pillButton = "inline-flex h-8 items-center justify-center gap-1.5 rounded-full px-3.5 text-[12.5px] font-medium ring-1 ring-black/[0.08] transition-colors disabled:opacity-50";

export function TripReferralsBoard({ settings, rows, detail }: { settings: ReferralSettings; rows: ReferralBoardRow[]; detail: ReferralDetail | null }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [paying, setPaying] = useState<ReferralBoardRow | null>(null);
  const [exporting, setExporting] = useState(false);

  const send = async (url: string, body: unknown) => {
    const res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body), cache: "no-store" });
    const json = (await res.json().catch(() => ({}))) as { error?: string };
    if (!res.ok) throw new Error(res.status === 401 ? "Your admin session has ended. Sign in again." : json.error || "That did not save. Try again.");
    return json;
  };
  /** One write, then the page read again; the reason shown when it fails. Resolves true when it saved. */
  const run = async (work: () => Promise<unknown>) => {
    setBusy(true);
    setError(null);
    try {
      await work();
      router.refresh();
      return true;
    } catch (e) {
      setError(e instanceof Error ? e.message : "That did not save. Try again.");
      return false;
    } finally {
      setBusy(false);
    }
  };

  const all = useMemo(
    () =>
      rows.reduce(
        (t, r) => ({ referred: t.referred + r.referred, waiting: t.waiting + r.waiting, counted: t.counted + r.counted, paid: t.paid + r.paidRupees, toPay: t.toPay + r.unpaidRupees }),
        { referred: 0, waiting: 0, counted: 0, paid: 0, toPay: 0 },
      ),
    [rows],
  );
  const perReferral = settings.pointsPerReferral * settings.rupeesPerPoint;

  const exportExcel = async () => {
    if (exporting) return;
    setExporting(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/trip-referrals/export/", { cache: "no-store" });
      if (!res.ok) throw new Error();
      const { referrals } = (await res.json()) as {
        referrals: Array<{
          referenceNo: string; createdAt: string; fullName: string; phone: string; country: string; city: string; code: string | null; employee: string;
          status: string; notVerified: boolean; referralState: string | null; points: number | null; paid: boolean; decidedBy: string | null;
        }>;
      };
      const XLSX = await import("xlsx");
      const wb = XLSX.utils.book_new();
      const people = [
        ["Employee", "Email", "Code", "Applied through the link", "Waiting", "Counted", "Not counted", "Target", "Points", "Earned (₹)", "Paid (₹)", "To pay (₹)", "Still with AFFHAN"],
        ...rows.map((r) => [r.name, r.email, r.code ?? "", r.referred, r.waiting, r.counted, r.notCounted, settings.target, r.points, r.paidRupees + r.unpaidRupees, r.paidRupees, r.unpaidRupees, r.isActive ? "Yes" : "No"]),
      ];
      XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(people), "Employees");
      const head = ["Trip ID", "Applied", "Name", "Mobile", "Country", "City", "Code", "Employee", "Office status", "Not verified", "Referral", "Points", "Paid", "Decided by"];
      const lines = referrals.map((a) => [
        a.referenceNo, fmtDate(a.createdAt), a.fullName, a.phone, a.country, a.city, a.code ?? "", a.employee, a.status, a.notVerified ? "Yes" : "",
        a.paid ? "Paid" : a.status === "spam" ? "Spam" : a.referralState === "counted" ? "Counted" : a.referralState === "waiting" ? "Waiting" : "Not counted",
        a.points ?? 0, a.paid ? "Yes" : "", a.decidedBy ?? "",
      ]);
      const ws = XLSX.utils.aoa_to_sheet([head, ...lines]);
      // Mobile numbers as text, or Excel shows 919876543210 as 9.19E+11.
      for (let row = 1; row <= lines.length; row++) {
        const cell = ws[XLSX.utils.encode_cell({ r: row, c: head.indexOf("Mobile") })];
        if (cell) {
          cell.t = "s";
          cell.z = "@";
          cell.v = String(cell.v ?? "");
        }
      }
      XLSX.utils.book_append_sheet(wb, ws, "Referrals");
      XLSX.writeFile(wb, `employee-tasks-${new Date().toISOString().slice(0, 10)}.xlsx`);
    } catch {
      setError("The export could not be made. Try again.");
    } finally {
      setExporting(false);
    }
  };

  return (
    <div style={sfFont} className="min-h-screen bg-[#f5f5f7] text-[#1d1d1f] antialiased">
      <div className="px-5 py-8 sm:px-8 lg:px-10">
        <div className="mb-6 flex flex-wrap items-center gap-x-4 gap-y-3">
          <Link
            href="/admin/trip-applications/"
            aria-label="Back to the Free China Trip"
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-white shadow-sm ring-1 ring-black/[0.06] transition-colors hover:bg-black/[0.02] rail:hidden"
          >
            <ArrowLeft size={16} />
          </Link>
          <div className="min-w-[min(100%,15rem)] flex-1">
            <h1 className="text-2xl font-semibold tracking-tight">Employee tasks</h1>
            <p className="text-[13px] text-[#86868b]">
              Free China Trip referrals · {rupees(perReferral)} for every applicant counted · target {settings.target} each
            </p>
          </div>
          <button
            type="button"
            onClick={() => void exportExcel()}
            disabled={exporting}
            className="ml-auto inline-flex h-9 items-center gap-2 rounded-full bg-white px-4 text-[13px] font-medium shadow-sm ring-1 ring-black/[0.06] hover:bg-black/[0.02] disabled:opacity-50"
          >
            <Download size={14} /> {exporting ? "Exporting…" : "Export"}
          </button>
        </div>

        {error && (
          <p role="alert" className="mb-4 rounded-xl bg-red-500/10 px-4 py-2.5 text-[13px] font-medium text-red-700">
            {error}
          </p>
        )}

        <SettingsCard settings={settings} busy={busy} onSave={(s) => run(() => send("/api/admin/trip-referrals/settings/", s))} />

        <dl className="mb-5 grid grid-cols-2 gap-2 sm:grid-cols-5 sm:gap-3">
          {[
            ["Applied through a link", String(all.referred)],
            ["Waiting for you", String(all.waiting)],
            ["Counted", String(all.counted)],
            ["Paid", rupees(all.paid)],
            ["To pay", rupees(all.toPay)],
          ].map(([label, n]) => (
            <div key={label} className={`min-w-0 px-4 py-3 ${card}`}>
              <dt className="truncate text-[12px] text-[#86868b]">{label}</dt>
              <dd className="mt-0.5 text-[22px] font-semibold tabular-nums tracking-tight">{n}</dd>
            </div>
          ))}
        </dl>

        <section className={`overflow-hidden ${card}`}>
          <h2 className="border-b border-black/[0.06] px-5 py-3 text-[15px] font-semibold">Employees</h2>
          {rows.length === 0 ? (
            <p className="px-5 py-10 text-center text-[13px] text-[#86868b]">No employees yet. Add them under Staff, and each gets a code here.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[980px] text-left text-[13px]">
                <thead>
                  <tr className="border-b border-black/[0.06] text-[12px] text-[#86868b]">
                    <th className="px-5 py-2.5 font-medium">Employee</th>
                    <th className="px-3 py-2.5 font-medium">Code</th>
                    <th className="px-3 py-2.5 text-right font-medium">Applied</th>
                    <th className="px-3 py-2.5 text-right font-medium">Waiting</th>
                    <th className="px-3 py-2.5 text-right font-medium">Counted</th>
                    <th className="px-3 py-2.5 font-medium">Towards {settings.target}</th>
                    <th className="px-3 py-2.5 text-right font-medium">Points</th>
                    <th className="px-3 py-2.5 text-right font-medium">Earned</th>
                    <th className="px-3 py-2.5 text-right font-medium">Paid</th>
                    <th className="px-3 py-2.5 text-right font-medium">To pay</th>
                    <th className="px-5 py-2.5" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-black/[0.06]">
                  {rows.map((r) => {
                    const share = Math.min(1, r.counted / settings.target);
                    return (
                      <tr key={r.employeeId} className={detail?.employeeId === r.employeeId ? "bg-[#0071e3]/[0.05]" : ""}>
                        <td className="px-5 py-3">
                          <Link href={`/admin/trip-referrals/?employee=${r.employeeId}#employee`} className="font-semibold text-[#0058b0] hover:underline">
                            {r.name}
                          </Link>
                          {!r.isActive && <span className="ml-1.5 rounded-full bg-black/[0.06] px-2 py-0.5 text-[11px] text-[#6e6e73]">Left</span>}
                          <div className="text-[12px] text-[#86868b]">{r.email}</div>
                        </td>
                        <td className="px-3 py-3 font-mono text-[12.5px]">{r.code ?? ""}</td>
                        <td className="px-3 py-3 text-right tabular-nums">{r.referred}</td>
                        <td className={`px-3 py-3 text-right tabular-nums ${r.waiting ? "font-semibold text-amber-700" : ""}`}>{r.waiting}</td>
                        <td className="px-3 py-3 text-right font-semibold tabular-nums">{r.counted}</td>
                        <td className="px-3 py-3">
                          <div className="flex items-center gap-2">
                            <div className="h-2 w-28 overflow-hidden rounded-full bg-black/[0.07]" role="progressbar" aria-valuemin={0} aria-valuemax={settings.target} aria-valuenow={Math.min(r.counted, settings.target)} aria-label={`${r.name}: counted towards the target`}>
                              <div className="h-full rounded-full bg-[#176579]" style={{ width: `${share * 100}%` }} />
                            </div>
                            <span className="text-[12px] tabular-nums text-[#6e6e73]">{Math.round(share * 100)}%</span>
                          </div>
                        </td>
                        <td className="px-3 py-3 text-right tabular-nums">{r.points.toLocaleString("en-IN")}</td>
                        <td className="px-3 py-3 text-right tabular-nums">{rupees(r.paidRupees + r.unpaidRupees)}</td>
                        <td className="px-3 py-3 text-right tabular-nums">{rupees(r.paidRupees)}</td>
                        <td className={`px-3 py-3 text-right tabular-nums ${r.unpaidRupees ? "font-semibold" : "text-[#86868b]"}`}>{rupees(r.unpaidRupees)}</td>
                        <td className="px-5 py-3 text-right">
                          {r.unpaid > 0 && (
                            <button type="button" disabled={busy} onClick={() => setPaying(r)} className={`${pillButton} bg-[#1d1d1f] text-white hover:bg-black`}>
                              Mark paid
                            </button>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </section>

        {detail && (
          <EmployeeDetail
            detail={detail}
            busy={busy}
            onDecide={(ids, state) => run(() => send("/api/admin/trip-referrals/decide/", { ids, state }))}
            onPay={() => setPaying(rows.find((r) => r.employeeId === detail.employeeId) ?? null)}
          />
        )}
      </div>

      {paying && (
        <PayWindow
          row={paying}
          busy={busy}
          onCancel={() => setPaying(null)}
          onConfirm={async (note) => {
            if (await run(() => send("/api/admin/trip-referrals/pay/", { employeeId: paying.employeeId, note }))) setPaying(null);
          }}
        />
      )}
    </div>
  );
}

/** The task's settings: on or off, the numbers, the dates. Saved together. */
function SettingsCard({ settings, busy, onSave }: { settings: ReferralSettings; busy: boolean; onSave: (s: unknown) => Promise<boolean> }) {
  const initial = useMemo(
    () => ({
      enabled: settings.enabled,
      points: String(settings.pointsPerReferral),
      rate: String(settings.rupeesPerPoint),
      target: String(settings.target),
      startDay: settings.startsAt ? istDate(settings.startsAt) : "",
      endDay: settings.endsAt ? istLastDay(settings.endsAt) : "",
    }),
    [settings],
  );
  const [form, setForm] = useState(initial);
  useEffect(() => setForm(initial), [initial]);
  const dirty = JSON.stringify(form) !== JSON.stringify(initial);
  const num = (v: string) => (/^\d+$/.test(v) ? Number(v) : NaN);
  const field = "mt-1 h-10 w-full rounded-lg border border-black/15 bg-white px-3 text-[14px] text-[#1d1d1f] outline-none focus:border-[#0071e3] focus:ring-2 focus:ring-[#0071e3]/20";

  return (
    <section className={`mb-5 p-5 ${card}`}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-[15px] font-semibold">The task</h2>
        <button
          type="button"
          role="switch"
          aria-checked={form.enabled}
          onClick={() => setForm((f) => ({ ...f, enabled: !f.enabled }))}
          className="inline-flex items-center gap-2 text-[13px] font-medium"
        >
          <span className={`relative h-6 w-11 rounded-full transition-colors ${form.enabled ? "bg-emerald-500" : "bg-black/20"}`}>
            <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-[left] ${form.enabled ? "left-[22px]" : "left-0.5"}`} />
          </span>
          {form.enabled ? "On: codes earn points" : "Off: codes are kept, not counted"}
        </button>
      </div>
      <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
        {(
          [
            ["points", "Points per referral"],
            ["rate", "Rupees per point"],
            ["target", "Target per employee"],
          ] as const
        ).map(([key, label]) => (
          <label key={key} className="text-[13px] font-medium">
            {label}
            <input inputMode="numeric" value={form[key]} onChange={(e) => setForm((f) => ({ ...f, [key]: e.target.value.replace(/\D/g, "").slice(0, 6) }))} className={field} />
          </label>
        ))}
        <div className="text-[13px] font-medium">
          Starts
          <div className="mt-1">
            <CargoDatePicker value={form.startDay} onChange={(d) => setForm((f) => ({ ...f, startDay: d }))} ariaLabel="The task starts" placeholder="Any day" />
          </div>
        </div>
        <div className="text-[13px] font-medium">
          Ends
          <div className="mt-1">
            <CargoDatePicker value={form.endDay} onChange={(d) => setForm((f) => ({ ...f, endDay: d }))} ariaLabel="The task ends" placeholder="No end" />
          </div>
        </div>
      </div>
      <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
        <p className="text-[12px] text-[#86868b]">
          {settings.changedBy && settings.updatedAt ? `Saved by ${settings.changedBy}, ${fmtDate(settings.updatedAt)}` : "Not saved yet: 100 points a referral, ₹1 a point, 100 each"}
          {" · "}
          {rupees((num(form.points) || 0) * (num(form.rate) || 0))} a referral, {rupees((num(form.points) || 0) * (num(form.rate) || 0) * (num(form.target) || 0))} for the whole target
        </p>
        <button
          type="button"
          disabled={!dirty || busy}
          onClick={() =>
            void onSave({
              enabled: form.enabled,
              pointsPerReferral: num(form.points),
              rupeesPerPoint: num(form.rate),
              target: num(form.target),
              startDay: form.startDay,
              endDay: form.endDay,
            })
          }
          className={`${pillButton} bg-[#1d1d1f] px-5 text-white hover:bg-black`}
        >
          {busy && dirty ? "Saving…" : "Save"}
        </button>
      </div>
    </section>
  );
}

/** One employee: their figures, their applications to count or decline, and their payments. */
function EmployeeDetail({
  detail,
  busy,
  onDecide,
  onPay,
}: {
  detail: ReferralDetail;
  busy: boolean;
  onDecide: (ids: string[], state: "waiting" | "counted" | "not_counted") => Promise<boolean>;
  onPay: () => void;
}) {
  const waitingIds = detail.applications.filter(referralWaiting).map((a) => a.id);
  const t = detail.totals;
  return (
    <section id="employee" className={`mt-5 scroll-mt-6 overflow-hidden ${card}`}>
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-black/[0.06] px-5 py-4">
        <div className="min-w-0">
          <h2 className="text-[17px] font-semibold">
            {detail.name} <span className="ml-1 font-mono text-[15px] text-[#0058b0]">{detail.code}</span>
            {!detail.isActive && <span className="ml-2 rounded-full bg-black/[0.06] px-2 py-0.5 text-[11px] font-normal text-[#6e6e73]">Left: their code no longer works</span>}
          </h2>
          <p className="break-all text-[12.5px] text-[#86868b]">{referralLink(detail.code)}</p>
          <p className="mt-1.5 text-[13px] text-[#48484a]">
            <b className="text-[#1d1d1f]">{t.counted}</b> counted of {detail.settings.target} · {t.waiting} waiting · {t.points.toLocaleString("en-IN")} points · {rupees(t.paidRupees)} paid ·{" "}
            {rupees(t.unpaidRupees)} to pay
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {waitingIds.length > 0 && (
            <button type="button" disabled={busy} onClick={() => void onDecide(waitingIds, "counted")} className={`${pillButton} bg-emerald-600 text-white hover:bg-emerald-700`}>
              Count all waiting ({waitingIds.length})
            </button>
          )}
          {t.unpaid > 0 && (
            <button type="button" disabled={busy} onClick={onPay} className={`${pillButton} bg-[#1d1d1f] text-white hover:bg-black`}>
              Mark paid
            </button>
          )}
          <Link href="/admin/trip-referrals/" scroll={false} aria-label="Close this employee" className="flex h-8 w-8 items-center justify-center rounded-full hover:bg-black/[0.05]">
            <X size={16} />
          </Link>
        </div>
      </div>

      {detail.applications.length === 0 ? (
        <p className="px-5 py-10 text-center text-[13px] text-[#86868b]">Nobody has applied through this link yet.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[900px] text-left text-[13px]">
            <thead>
              <tr className="border-b border-black/[0.06] text-[12px] text-[#86868b]">
                <th className="px-5 py-2.5 font-medium">Trip ID</th>
                <th className="px-3 py-2.5 font-medium">Name</th>
                <th className="px-3 py-2.5 font-medium">Mobile</th>
                <th className="px-3 py-2.5 font-medium">From</th>
                <th className="px-3 py-2.5 font-medium">Applied</th>
                <th className="px-3 py-2.5 font-medium">Application</th>
                <th className="px-5 py-2.5 font-medium">Referral</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-black/[0.06]">
              {detail.applications.map((a) => (
                <tr key={a.id}>
                  <td className="whitespace-nowrap px-5 py-2.5 font-mono text-[12.5px] text-[#0058b0]">{a.referenceNo}</td>
                  <td className="px-3 py-2.5 font-medium">{a.fullName}</td>
                  <td className="whitespace-nowrap px-3 py-2.5 tabular-nums">{a.phone}</td>
                  <td className="px-3 py-2.5">{[a.city, a.country].filter(Boolean).join(", ")}</td>
                  <td className="whitespace-nowrap px-3 py-2.5">{fmtDay(a.createdAt)}</td>
                  <td className="whitespace-nowrap px-3 py-2.5">
                    {a.status === "spam" ? "Spam" : a.status === "handled" ? "Handled" : "New"}
                    {a.notVerified && <span className="ml-1.5 rounded-full px-2 py-0.5 text-[11px] text-[#6e6e73] ring-1 ring-black/10">Not verified</span>}
                  </td>
                  <td className="px-5 py-2.5">
                    <ReferralActions a={a} busy={busy} onDecide={onDecide} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {detail.payouts.length > 0 && (
        <div className="border-t border-black/[0.06] px-5 py-4">
          <h3 className="text-[13px] font-semibold">Payments</h3>
          <ul className="mt-2 grid gap-1.5 text-[13px]">
            {detail.payouts.map((p) => (
              <li key={p.id} className="flex flex-wrap justify-between gap-2">
                <span>
                  <b>{rupees(p.amount)}</b> for {p.referrals} {p.referrals === 1 ? "referral" : "referrals"} ({p.points.toLocaleString("en-IN")} points)
                  {p.note ? <span className="text-[#6e6e73]"> · {p.note}</span> : null}
                </span>
                <span className="text-[#86868b]">
                  {fmtDate(p.paidAt)} · {p.paidBy}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}

/** A referred application's decision: Count or Not counted while waiting; what was decided, and Undo, after; Paid stays. */
function ReferralActions({ a, busy, onDecide }: { a: ReferredApplication; busy: boolean; onDecide: (ids: string[], state: "waiting" | "counted" | "not_counted") => Promise<boolean> }) {
  if (a.paid) return <span className="font-medium text-emerald-700">Paid</span>;
  if (a.status === "spam") return <span className="text-[#86868b]">Not counted (spam)</span>;
  const who = a.decidedBy ? `${a.decidedBy}${a.decidedAt ? `, ${fmtDate(a.decidedAt)}` : ""}` : undefined;
  if (a.referralState === "waiting") {
    return (
      <div className="flex gap-1.5">
        <button type="button" disabled={busy} onClick={() => void onDecide([a.id], "counted")} className={`${pillButton} bg-emerald-600 text-white hover:bg-emerald-700`}>
          Count
        </button>
        <button type="button" disabled={busy} onClick={() => void onDecide([a.id], "not_counted")} className={`${pillButton} bg-white hover:bg-black/[0.03]`}>
          Not counted
        </button>
      </div>
    );
  }
  return (
    <div className="flex items-center gap-2" title={who}>
      <span className={a.referralState === "counted" ? "font-medium text-emerald-700" : "text-[#6e6e73]"}>{a.referralState === "counted" ? `Counted · ${a.referralPoints ?? 0} points` : "Not counted"}</span>
      <button type="button" disabled={busy} onClick={() => void onDecide([a.id], "waiting")} className="text-[12px] font-medium text-[#0058b0] hover:underline disabled:opacity-50">
        Undo
      </button>
    </div>
  );
}

/** Mark paid, asked in the console's own window: what it pays, for how many, and an optional note. */
function PayWindow({ row, busy, onCancel, onConfirm }: { row: ReferralBoardRow; busy: boolean; onCancel: () => void; onConfirm: (note: string) => Promise<void> }) {
  const [note, setNote] = useState("");
  const cancel = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    cancel.current?.focus();
  }, []);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      e.stopPropagation();
      if (!busy) onCancel();
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [onCancel, busy]);
  return (
    <div className="fixed inset-0 z-[140] flex items-center justify-center bg-black/45 px-4" onClick={() => !busy && onCancel()}>
      <div role="alertdialog" aria-modal="true" aria-labelledby="pay-title" onClick={(e) => e.stopPropagation()} className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl ring-1 ring-black/[0.06]">
        <h2 id="pay-title" className="text-[17px] font-semibold">
          Pay {row.name} {rupees(row.unpaidRupees)}?
        </h2>
        <p className="mt-1 text-[13px] text-[#48484a]">
          For {row.unpaid} counted {row.unpaid === 1 ? "referral" : "referrals"} not yet paid. It is recorded with your name and today&apos;s date.
        </p>
        <label className="mt-4 block text-[13px] font-medium">
          Note <span className="font-normal text-[#86868b]">(optional)</span>
          <input
            value={note}
            onChange={(e) => setNote(e.target.value)}
            maxLength={200}
            className="mt-1 h-10 w-full rounded-lg border border-black/15 px-3 text-[14px] outline-none focus:border-[#0071e3] focus:ring-2 focus:ring-[#0071e3]/20"
          />
        </label>
        <div className="mt-5 flex justify-end gap-2">
          <button ref={cancel} type="button" disabled={busy} onClick={onCancel} className={`${pillButton} h-9 bg-white px-4 hover:bg-black/[0.03]`}>
            Cancel
          </button>
          <button type="button" disabled={busy} onClick={() => void onConfirm(note)} className={`${pillButton} h-9 bg-[#1d1d1f] px-4 text-white hover:bg-black`}>
            {busy ? "Recording…" : "Mark paid"}
          </button>
        </div>
      </div>
    </div>
  );
}
