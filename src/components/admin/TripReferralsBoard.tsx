"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, Check, Copy, Download, UserPlus, X } from "lucide-react";
import { CargoDatePicker } from "@/components/cargo/CargoDatePicker";
import { TripDocuments } from "@/components/admin/TripApplicationsBoard";
import type { ReferralBoardRow, ReferralPayoutView, ReferralSettings, ReferralTotals, ReferredApplication } from "@/lib/server/trip-referrals";
import { REFERRAL_CODE_MAX, REFERRAL_CODE_MIN, istDate, istLastDay, normalizeReferralCode, referralLink, referralWaiting, rupees } from "@/lib/trip-referral-shared";

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
  const [editingCode, setEditingCode] = useState<CodeTarget | null>(null);
  const [adding, setAdding] = useState(false);

  const send = async <T extends object = { error?: string }>(url: string, body: unknown): Promise<T> => {
    const res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body), cache: "no-store" });
    const json = (await res.json().catch(() => ({}))) as T & { error?: string };
    if (!res.ok) throw new Error(res.status === 401 ? "Your admin session has ended. Sign in again." : json.error || "That did not save. Try again.");
    return json;
  };

  /** An employee's code made or changed (2026-11-03); the reason it was not, said in the window. */
  const saveCode = async (employeeId: string, code: string): Promise<string | null> => {
    setBusy(true);
    try {
      await send("/api/admin/trip-referrals/code/", { employeeId, code });
      setEditingCode(null);
      router.refresh();
      return null;
    } catch (e) {
      return e instanceof Error ? e.message : "The code was not saved. Try again.";
    } finally {
      setBusy(false);
    }
  };

  /**
   * A staff account added from here (2026-11-03: "give a option to add the employee"), through the Staff section's own
   * route, then their code: the one typed, or one made from their name. The password comes back once, to hand over.
   */
  const addEmployee = async (v: NewEmployee): Promise<AddResult> => {
    setBusy(true);
    try {
      let made: { employee: { id: string; name: string; email: string }; password: string; generated: boolean };
      try {
        made = await send("/api/admin/employees/", { name: v.name, email: v.email, job: v.job, password: v.password || undefined });
      } catch (e) {
        return { ok: false, error: e instanceof Error ? e.message : "The employee was not added." };
      }
      let code: string | null = null;
      let codeError: string | null = null;
      try {
        code = (await send<{ code: string }>("/api/admin/trip-referrals/code/", { employeeId: made.employee.id, code: v.code })).code;
      } catch (e) {
        codeError = e instanceof Error ? e.message : "The code was not set.";
      }
      router.refresh();
      return { ok: true, name: made.employee.name, email: made.employee.email, password: made.password, generated: made.generated, code, codeError };
    } finally {
      setBusy(false);
    }
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
        (t, r) => ({ referred: t.referred + r.referred, counted: t.counted + r.counted, paid: t.paid + r.paidRupees, toPay: t.toPay + r.unpaidRupees }),
        { referred: 0, counted: 0, paid: 0, toPay: 0 },
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
        ["Employee", "Email", "Code", "Applied through the link", "Counted", "Not counted", "Target", "Points", "Earned (₹)", "Paid (₹)", "To pay (₹)", "Still with AFFHAN"],
        ...rows.map((r) => [r.name, r.email, r.code ?? "", r.referred, r.counted, r.notCounted, settings.target, r.points, r.paidRupees + r.unpaidRupees, r.paidRupees, r.unpaidRupees, r.isActive ? "Yes" : "No"]),
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

        <dl className="mb-5 grid grid-cols-2 gap-2 sm:grid-cols-4 sm:gap-3">
          {[
            ["Applied through a link", String(all.referred)],
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
          <div className="flex items-center justify-between gap-3 border-b border-black/[0.06] px-5 py-2.5">
            <h2 className="text-[15px] font-semibold">Employees</h2>
            <button type="button" onClick={() => setAdding(true)} className={`${pillButton} bg-[#1d1d1f] text-white hover:bg-black`}>
              <UserPlus size={14} /> Add employee
            </button>
          </div>
          {rows.length === 0 ? (
            <p className="px-5 py-10 text-center text-[13px] text-[#86868b]">No employees yet. Add one, and they get a code here.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[980px] text-left text-[13px]">
                <thead>
                  <tr className="border-b border-black/[0.06] text-[12px] text-[#86868b]">
                    <th className="px-5 py-2.5 font-medium">Employee</th>
                    <th className="px-3 py-2.5 font-medium">Code</th>
                    <th className="px-3 py-2.5 text-right font-medium">Applied</th>
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
                        <td className="px-3 py-3">
                          <span className="font-mono text-[12.5px]">{r.code ?? ""}</span>
                          <button
                            type="button"
                            onClick={() => setEditingCode({ employeeId: r.employeeId, name: r.name, code: r.code })}
                            aria-label={`Change ${r.name}'s code`}
                            className="ml-2 text-[12px] font-medium text-[#0058b0] hover:underline"
                          >
                            {r.code ? "Change" : "Make"}
                          </button>
                        </td>
                        <td className="px-3 py-3 text-right tabular-nums">{r.referred}</td>
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
            onChangeCode={() => setEditingCode({ employeeId: detail.employeeId, name: detail.name, code: detail.code })}
          />
        )}
      </div>

      {editingCode && <CodeWindow who={editingCode} busy={busy} onCancel={() => setEditingCode(null)} onSave={saveCode} />}
      {adding && <AddEmployeeWindow busy={busy} onClose={() => setAdding(false)} onAdd={addEmployee} />}

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
  onChangeCode,
}: {
  detail: ReferralDetail;
  busy: boolean;
  onDecide: (ids: string[], state: "waiting" | "counted" | "not_counted") => Promise<boolean>;
  onPay: () => void;
  onChangeCode: () => void;
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
            <b className="text-[#1d1d1f]">{t.counted}</b> counted of {detail.settings.target} · {t.points.toLocaleString("en-IN")} points · {rupees(t.paidRupees)} paid ·{" "}
            {rupees(t.unpaidRupees)} to pay
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button type="button" disabled={busy} onClick={onChangeCode} className={`${pillButton} bg-white hover:bg-black/[0.03]`}>
            Change code
          </button>
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
          <table className="w-full min-w-[980px] text-left text-[13px]">
            <thead>
              <tr className="border-b border-black/[0.06] text-[12px] text-[#86868b]">
                <th className="px-5 py-2.5 font-medium">Trip ID</th>
                <th className="px-3 py-2.5 font-medium">Name</th>
                <th className="px-3 py-2.5 font-medium">Mobile</th>
                <th className="px-3 py-2.5 font-medium">From</th>
                <th className="px-3 py-2.5 font-medium">Applied</th>
                <th className="px-3 py-2.5 font-medium">ID proof</th>
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
                  <td className="px-3 py-2">{a.documents?.length ? <TripDocuments documents={a.documents} compact /> : <span className="text-[#86868b]">None</span>}</td>
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

/**
 * A referred application's standing. It counts the moment it arrives (the owner, 2026-11-02: an application through
 * the link counts for the employee as it counts for the trip), so the team's one action is to take it out, Not
 * counted, and Count puts it back. Paid stays. Waiting is only an older application's, decided here.
 */
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
  const counted = a.referralState === "counted";
  return (
    <div className="flex items-center gap-2" title={who}>
      <span className={counted ? "font-medium text-emerald-700" : "text-[#6e6e73]"}>{counted ? `Counted · ${a.referralPoints ?? 0} points` : "Not counted"}</span>
      <button
        type="button"
        disabled={busy}
        onClick={() => void onDecide([a.id], counted ? "not_counted" : "counted")}
        className="text-[12px] font-medium text-[#0058b0] hover:underline disabled:opacity-50"
      >
        {counted ? "Not counted" : "Count"}
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

// ---- making a code, adding an employee (2026-11-03) ------------------------------------------------------------------

type CodeTarget = { employeeId: string; name: string; code: string | null };
type NewEmployee = { name: string; email: string; job: "SALES" | "ASSIGNER"; password: string; code: string };
type AddResult =
  | { ok: false; error: string }
  | { ok: true; name: string; email: string; password: string; generated: boolean; code: string | null; codeError: string | null };

const field = "mt-1 h-10 w-full rounded-lg border border-black/15 px-3 text-[14px] outline-none focus:border-[#0071e3] focus:ring-2 focus:ring-[#0071e3]/20";

/** Escape closes a window, unless it is saving. */
function useEscape(onClose: () => void, busy: boolean) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      e.stopPropagation();
      if (!busy) onClose();
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [onClose, busy]);
}

/** Copy a line, and say so for a moment. */
function CopyText({ text, label }: { text: string; label: string }) {
  const [done, setDone] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setDone(true);
      window.setTimeout(() => setDone(false), 1600);
    } catch {
      window.prompt("Copy this:", text);
    }
  };
  return (
    <button type="button" onClick={() => void copy()} className={`${pillButton} shrink-0 bg-white hover:bg-black/[0.03]`}>
      {done ? <Check size={13} className="text-emerald-600" /> : <Copy size={13} />} {done ? "Copied" : label}
    </button>
  );
}

/**
 * Make or change an employee's code, in the console's own window: the code as it will be written (capitals, letters
 * and digits) and the link it makes, as it is typed. Changing one says what happens to links already shared.
 */
function CodeWindow({ who, busy, onCancel, onSave }: { who: CodeTarget; busy: boolean; onCancel: () => void; onSave: (employeeId: string, code: string) => Promise<string | null> }) {
  const [value, setValue] = useState(who.code ?? "");
  const [error, setError] = useState<string | null>(null);
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => {
    input.current?.select();
  }, []);
  useEscape(onCancel, busy);
  const code = normalizeReferralCode(value);
  const valid = code.length >= REFERRAL_CODE_MIN;
  const changed = code !== (who.code ?? "");
  const save = async () => {
    if (!valid || !changed || busy) return;
    setError(await onSave(who.employeeId, code));
  };
  return (
    <div className="fixed inset-0 z-[140] flex items-center justify-center bg-black/45 px-4" onClick={() => !busy && onCancel()}>
      <form
        role="dialog"
        aria-modal="true"
        aria-labelledby="code-title"
        onClick={(e) => e.stopPropagation()}
        onSubmit={(e) => {
          e.preventDefault();
          void save();
        }}
        className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl ring-1 ring-black/[0.06]"
      >
        <h2 id="code-title" className="text-[17px] font-semibold">
          {who.code ? "Change" : "Make"} {who.name}&apos;s code
        </h2>
        <label className="mt-4 block text-[13px] font-medium">
          Referral code
          <input
            ref={input}
            name="code"
            value={value}
            onChange={(e) => {
              setValue(e.target.value);
              setError(null);
            }}
            maxLength={40}
            autoComplete="off"
            spellCheck={false}
            className={`${field} font-mono uppercase`}
          />
        </label>
        <p className="mt-2 text-[12.5px] text-[#6e6e73]">
          {REFERRAL_CODE_MIN} to {REFERRAL_CODE_MAX} letters and numbers. Their link:{" "}
          <span className="break-all font-mono text-[#1d1d1f]">{referralLink(code || "…")}</span>
        </p>
        {who.code && changed && valid && (
          <p className="mt-3 rounded-lg bg-amber-500/10 px-3 py-2 text-[12.5px] text-amber-900">
            Links already shared with {who.code} stop counting for {who.name}. Everyone who applied through them stays theirs.
          </p>
        )}
        {error && (
          <p role="alert" className="mt-3 rounded-lg bg-red-500/10 px-3 py-2 text-[12.5px] font-medium text-red-700">
            {error}
          </p>
        )}
        <div className="mt-5 flex justify-end gap-2">
          <button type="button" disabled={busy} onClick={onCancel} className={`${pillButton} h-9 bg-white px-4 hover:bg-black/[0.03]`}>
            Cancel
          </button>
          <button type="submit" disabled={busy || !valid || !changed} className={`${pillButton} h-9 bg-[#1d1d1f] px-4 text-white hover:bg-black`}>
            {busy ? "Saving…" : "Save code"}
          </button>
        </div>
      </form>
    </div>
  );
}

/**
 * Add an employee without leaving Employee tasks: a staff account (name, email, Sales or Assigner, a password typed or
 * made), with its referral code at once, typed or made from the name. Then what to hand over: where they sign in, the
 * password (shown only now) and their link.
 */
function AddEmployeeWindow({ busy, onClose, onAdd }: { busy: boolean; onClose: () => void; onAdd: (v: NewEmployee) => Promise<AddResult> }) {
  const [v, setV] = useState<NewEmployee>({ name: "", email: "", job: "SALES", password: "", code: "" });
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<Extract<AddResult, { ok: true }> | null>(null);
  const first = useRef<HTMLInputElement>(null);
  useEffect(() => {
    first.current?.focus();
  }, []);
  useEscape(onClose, busy);
  const set = (patch: Partial<NewEmployee>) => {
    setV((s) => ({ ...s, ...patch }));
    setError(null);
  };
  const code = normalizeReferralCode(v.code);
  const submit = async () => {
    if (busy) return;
    if (!v.name.trim()) return setError("Enter their name.");
    if (!/^\S+@\S+\.\S+$/.test(v.email.trim())) return setError("Enter their email address: they sign in with it.");
    if (v.code.trim() && code.length < REFERRAL_CODE_MIN) return setError(`A code is ${REFERRAL_CODE_MIN} to ${REFERRAL_CODE_MAX} letters and numbers, or leave it empty.`);
    const r = await onAdd({ ...v, name: v.name.trim(), email: v.email.trim(), code });
    if (r.ok) setDone(r);
    else setError(r.error);
  };
  return (
    <div className="fixed inset-0 z-[140] flex items-center justify-center bg-black/45 px-4" onClick={() => !busy && onClose()}>
      <div role="dialog" aria-modal="true" aria-labelledby="add-title" onClick={(e) => e.stopPropagation()} className="max-h-[92vh] w-full max-w-md overflow-y-auto rounded-2xl bg-white p-6 shadow-2xl ring-1 ring-black/[0.06]">
        {done ? (
          <div data-added>
            <h2 id="add-title" className="text-[17px] font-semibold">
              {done.name} is added
            </h2>
            <p className="mt-1 text-[13px] text-[#48484a]">
              They sign in at <b>affhan.com/employee/login</b> with {done.email}.
            </p>
            <div className="mt-4 rounded-xl bg-[#f5f5f7] p-3.5">
              <p className="text-[12px] text-[#86868b]">Password{done.generated ? " (made for them)" : ""}: shown only now</p>
              <div className="mt-1 flex items-center justify-between gap-2">
                <span data-password className="break-all font-mono text-[15px] font-semibold">
                  {done.password}
                </span>
                <CopyText text={done.password} label="Copy" />
              </div>
            </div>
            <div className="mt-3 rounded-xl bg-[#f5f5f7] p-3.5">
              <p className="text-[12px] text-[#86868b]">Their referral link</p>
              {done.code ? (
                <div className="mt-1 flex items-center justify-between gap-2">
                  <span data-link className="break-all font-mono text-[13px] font-semibold">
                    {referralLink(done.code)}
                  </span>
                  <CopyText text={referralLink(done.code)} label="Copy" />
                </div>
              ) : (
                <p role="alert" className="mt-1 text-[12.5px] font-medium text-red-700">
                  {done.codeError} Their code is made from their name when the list shows them; change it there.
                </p>
              )}
            </div>
            <div className="mt-5 flex justify-end">
              <button type="button" onClick={onClose} className={`${pillButton} h-9 bg-[#1d1d1f] px-5 text-white hover:bg-black`}>
                Done
              </button>
            </div>
          </div>
        ) : (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void submit();
            }}
          >
            <h2 id="add-title" className="text-[17px] font-semibold">
              Add an employee
            </h2>
            <p className="mt-1 text-[13px] text-[#48484a]">A staff account, with their referral link from the start.</p>
            <label className="mt-4 block text-[13px] font-medium">
              Name
              <input ref={first} name="name" value={v.name} onChange={(e) => set({ name: e.target.value })} maxLength={100} autoComplete="off" className={field} />
            </label>
            <label className="mt-3 block text-[13px] font-medium">
              Email <span className="font-normal text-[#86868b]">(they sign in with it)</span>
              <input name="email" type="email" value={v.email} onChange={(e) => set({ email: e.target.value })} maxLength={200} autoComplete="off" className={field} />
            </label>
            <fieldset className="mt-3">
              <legend className="text-[13px] font-medium">Account</legend>
              <div className="mt-1 grid grid-cols-2 gap-2">
                {(
                  [
                    ["SALES", "Sales", "Takes customers from the open pool"],
                    ["ASSIGNER", "Assigner", "Keeps the cargo sheet"],
                  ] as const
                ).map(([job, label, hint]) => (
                  <label
                    key={job}
                    className={`cursor-pointer rounded-xl px-3 py-2.5 ring-1 transition-colors ${v.job === job ? "bg-[#1d1d1f] text-white ring-[#1d1d1f]" : "bg-white ring-black/15 hover:bg-black/[0.02]"}`}
                  >
                    <input type="radio" name="job" value={job} checked={v.job === job} onChange={() => set({ job })} className="sr-only" />
                    <span className="block text-[13.5px] font-semibold">{label}</span>
                    <span className={`block text-[11.5px] ${v.job === job ? "text-white/70" : "text-[#86868b]"}`}>{hint}</span>
                  </label>
                ))}
              </div>
            </fieldset>
            <label className="mt-3 block text-[13px] font-medium">
              Referral code <span className="font-normal text-[#86868b]">(optional: made from the name)</span>
              <input name="code" value={v.code} onChange={(e) => set({ code: e.target.value })} maxLength={40} autoComplete="off" spellCheck={false} className={`${field} font-mono uppercase`} />
            </label>
            {code && <p className="mt-1.5 break-all text-[12px] text-[#6e6e73]">Their link: {referralLink(code)}</p>}
            <label className="mt-3 block text-[13px] font-medium">
              Password <span className="font-normal text-[#86868b]">(optional: one is made)</span>
              <input name="password" value={v.password} onChange={(e) => set({ password: e.target.value })} maxLength={128} autoComplete="new-password" className={field} />
            </label>
            {error && (
              <p role="alert" className="mt-3 rounded-lg bg-red-500/10 px-3 py-2 text-[12.5px] font-medium text-red-700">
                {error}
              </p>
            )}
            <div className="mt-5 flex justify-end gap-2">
              <button type="button" disabled={busy} onClick={onClose} className={`${pillButton} h-9 bg-white px-4 hover:bg-black/[0.03]`}>
                Cancel
              </button>
              <button type="submit" disabled={busy} className={`${pillButton} h-9 bg-[#1d1d1f] px-4 text-white hover:bg-black`}>
                {busy ? "Adding…" : "Add employee"}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
