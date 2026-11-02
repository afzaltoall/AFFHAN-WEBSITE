import type { Metadata } from "next";
import Link from "next/link";
import { readWorkspaceAuth } from "@/lib/employee-session";
import { employeeReferrals, taskRunning } from "@/lib/server/trip-referrals";
import { istDate, istLastDay, maskPhone, referralCounts, referralLink, referralWaiting, rupees } from "@/lib/trip-referral-shared";
import { ReferralShare } from "@/components/employee/ReferralShare";
import { wt } from "@/components/employee/workspace-ui";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "My referrals — Affhan staff",
  robots: { index: false, follow: false },
};

const fmtDay = (iso: string) => new Date(iso).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric", timeZone: "Asia/Kolkata" });
const fmtDayOf = (day: string) => fmtDay(`${day}T12:00:00+05:30`);

/**
 * The employee's Free China Trip referral task (the owner, 2026-11-02): their link to hand out, how far they are
 * towards the target, what they have earned and been paid, and everyone who applied after coming through their link.
 * Customers are never asked for a code: the link carries it, and an application through it counts at once (the team
 * can take one out). Every employee has one, sales and assigners alike, made the first time they open this page. An
 * administrator has none: the console's Employee tasks holds everyone's. Applicants' ID proof is never shown here.
 */
export default async function MyReferralsPage() {
  const auth = await readWorkspaceAuth();
  if (!auth.ok) return null;

  if (auth.kind !== "employee") {
    return (
      <div className="max-w-xl">
        <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">My referrals</h1>
        <p className={`mt-1 text-[13px] ${wt.soft}`}>Administrators have no referral code. Every employee&apos;s is in the console.</p>
        <Link href="/admin/trip-referrals/" className="mt-4 inline-flex items-center rounded-full bg-[#1d1d1f] px-4 py-2 text-[13px] font-semibold text-white">
          Open Employee tasks
        </Link>
      </div>
    );
  }

  const r = await employeeReferrals({ id: auth.employee.id, name: auth.employee.name });
  const { settings, totals } = r;
  const link = referralLink(r.code);
  const perReferral = settings.pointsPerReferral * settings.rupeesPerPoint;
  const done = Math.min(totals.counted, settings.target);
  const running = taskRunning(settings);
  const dates =
    settings.startsAt && settings.endsAt
      ? `${fmtDayOf(istDate(settings.startsAt))} to ${fmtDayOf(istLastDay(settings.endsAt))}`
      : settings.endsAt
        ? `until ${fmtDayOf(istLastDay(settings.endsAt))}`
        : settings.startsAt
          ? `from ${fmtDayOf(istDate(settings.startsAt))}`
          : null;

  return (
    <div className="max-w-5xl space-y-5">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">My referrals</h1>
        <p className={`mt-1 text-[13px] ${wt.mid}`}>
          Free China Trip · {rupees(perReferral)} for every applicant through your link{dates ? ` · ${dates}` : ""}
          {!running && <span className="font-semibold text-red-600"> · Closed: new applications through your link are not counted</span>}
        </p>
      </div>

      <section className={`rounded-2xl p-5 ${wt.card}`}>
        <p className={`text-[12px] font-medium ${wt.soft}`}>Your link</p>
        <p className="mt-1.5 break-all rounded-xl bg-[#f5f5f7] px-4 py-3 font-mono text-[15px] font-semibold">{link}</p>
        <div className="mt-4">
          <ReferralShare link={link} />
        </div>
      </section>

      <section className={`rounded-2xl p-5 ${wt.card}`}>
        <div className="flex flex-wrap items-end justify-between gap-3">
          <p className="text-[15px] font-semibold">
            <span className="text-[28px] font-bold tabular-nums">{totals.counted}</span>
            <span className={wt.soft}> / {settings.target} counted</span>
          </p>
          {totals.counted >= settings.target && <span className="rounded-full bg-emerald-500/10 px-3 py-1 text-[12.5px] font-semibold text-emerald-700">Target reached</span>}
        </div>
        <div className="mt-3 h-2.5 overflow-hidden rounded-full bg-black/[0.06]" role="progressbar" aria-valuemin={0} aria-valuemax={settings.target} aria-valuenow={done} aria-label="Counted towards the target">
          <div className="h-full rounded-full bg-[#176579]" style={{ width: `${(done / settings.target) * 100}%` }} />
        </div>
        <dl className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
          {[
            ["Applied through your link", String(totals.referred)],
            ["Points", totals.points.toLocaleString("en-IN")],
            ["Earned", rupees(totals.paidRupees + totals.unpaidRupees)],
            ["Paid", rupees(totals.paidRupees)],
          ].map(([label, value]) => (
            <div key={label} className="rounded-xl bg-[#f5f5f7] px-3.5 py-2.5">
              <dt className={`text-[12px] ${wt.soft}`}>{label}</dt>
              <dd className="mt-0.5 text-[19px] font-semibold tabular-nums">{value}</dd>
            </div>
          ))}
        </dl>
      </section>

      <section className={`overflow-hidden rounded-2xl ${wt.card}`}>
        <h2 className={`border-b px-5 py-3 text-[15px] font-semibold ${wt.border}`}>Applied through your link</h2>
        {r.applications.length === 0 ? (
          <p className={`px-5 py-10 text-center text-[13px] ${wt.soft}`}>Nobody yet. Everyone who applies after opening your link shows here.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-[13px]">
              <thead>
                <tr className={`border-b text-[12px] ${wt.soft} ${wt.border}`}>
                  <th className="px-5 py-2.5 font-medium">Trip ID</th>
                  <th className="px-3 py-2.5 font-medium">Name</th>
                  <th className="px-3 py-2.5 font-medium">Mobile</th>
                  <th className="px-3 py-2.5 font-medium">Applied</th>
                  <th className="px-5 py-2.5 font-medium">Status</th>
                </tr>
              </thead>
              <tbody className={`divide-y ${wt.divide}`}>
                {r.applications.map((a) => {
                  const state = a.paid && referralCounts(a) ? "Paid" : referralCounts(a) ? "Counted" : referralWaiting(a) ? "Waiting" : "Not counted";
                  const tone = state === "Paid" || state === "Counted" ? "text-emerald-700" : state === "Waiting" ? "text-amber-700" : wt.soft;
                  return (
                    <tr key={a.id}>
                      <td className="whitespace-nowrap px-5 py-2.5 font-mono text-[12.5px]">{a.referenceNo}</td>
                      <td className="px-3 py-2.5">{a.fullName}</td>
                      <td className="whitespace-nowrap px-3 py-2.5 tabular-nums">{maskPhone(a.phone)}</td>
                      <td className="whitespace-nowrap px-3 py-2.5">{fmtDay(a.createdAt)}</td>
                      <td className={`whitespace-nowrap px-5 py-2.5 font-medium ${tone}`}>{state}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {r.payouts.length > 0 && (
        <section className={`overflow-hidden rounded-2xl ${wt.card}`}>
          <h2 className={`border-b px-5 py-3 text-[15px] font-semibold ${wt.border}`}>Payments</h2>
          <ul className={`divide-y ${wt.divide}`}>
            {r.payouts.map((p) => (
              <li key={p.id} className="flex flex-wrap items-baseline justify-between gap-2 px-5 py-3 text-[13px]">
                <span>
                  <span className="font-semibold">{rupees(p.amount)}</span> for {p.referrals} {p.referrals === 1 ? "referral" : "referrals"}
                  {p.note ? <span className={wt.soft}> · {p.note}</span> : null}
                </span>
                <span className={wt.soft}>{fmtDay(p.paidAt)}</span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
