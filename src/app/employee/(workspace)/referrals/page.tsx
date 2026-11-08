import type { Metadata } from "next";
import Link from "next/link";
import { readWorkspaceAuth } from "@/lib/employee-session";
import { employeeReferrals, taskRunning } from "@/lib/server/trip-referrals";
import { istDate, istLastDay, maskPhone, referralCounts, referralLink, referralWaiting, rupees } from "@/lib/trip-referral-shared";
import { ReferralApplicants, type ReferralPerson } from "@/components/employee/ReferralApplicants";
import { ReferralRefresh } from "@/components/employee/ReferralRefresh";
import { ReferralShare } from "@/components/employee/ReferralShare";
import { wt } from "@/components/employee/workspace-ui";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "My referrals — Affhan staff",
  robots: { index: false, follow: false },
};

const fmtDay = (iso: string) => new Date(iso).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric", timeZone: "Asia/Kolkata" });
const fmtDayOf = (day: string) => fmtDay(`${day}T12:00:00+05:30`);
const fmtDayTime = (iso: string) =>
  new Date(iso).toLocaleString("en-IN", { day: "numeric", month: "short", year: "numeric", hour: "numeric", minute: "2-digit", hour12: true, timeZone: "Asia/Kolkata" });
const fmtTime = (at: Date) => at.toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit", hour12: true, timeZone: "Asia/Kolkata" });

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
  // Their own target where the console gave them one, the task's otherwise (2026-11-04).
  const target = r.target;
  const link = referralLink(r.code);
  // Drawn in two parts, so a phone breaks it before its code and never inside a word ("appl / y/?ref=", 2026-11-08).
  const [linkPage, linkCode] = link.split("?");
  const perReferral = settings.pointsPerReferral * settings.rupeesPerPoint;
  const done = Math.min(totals.counted, target);
  const running = taskRunning(settings);
  const dates =
    settings.startsAt && settings.endsAt
      ? `${fmtDayOf(istDate(settings.startsAt))} to ${fmtDayOf(istLastDay(settings.endsAt))}`
      : settings.endsAt
        ? `until ${fmtDayOf(istLastDay(settings.endsAt))}`
        : settings.startsAt
          ? `from ${fmtDayOf(istDate(settings.startsAt))}`
          : null;
  // What the list and its details may show, made ready here: this goes to the browser, so the mobile is masked before
  // it leaves the server, and nothing else of the application goes with it.
  const people: ReferralPerson[] = r.applications.map((a) => {
    const counts = referralCounts(a);
    return {
      tripId: a.referenceNo,
      name: a.fullName,
      mobile: maskPhone(a.phone),
      city: a.city,
      country: a.country,
      day: fmtDay(a.createdAt),
      at: fmtDayTime(a.createdAt),
      state: a.paid && counts ? "Paid" : counts ? "Counted" : referralWaiting(a) ? "Waiting" : "Not counted",
      points: counts ? (a.referralPoints ?? 0) : 0,
    };
  });

  return (
    // The workspace's full width, as its other pages (the rail decides it; 2026-11-03: a 5xl column "feels lefted"):
    // the link and the progress side by side on a wide screen, the applicants under them.
    <div className="space-y-5">
      <div>
        <div className="flex items-center justify-between gap-3">
          <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">My referrals</h1>
          <ReferralRefresh />
        </div>
        <p className={`mt-1 text-[14px] leading-snug sm:text-[13px] ${wt.mid}`}>
          Free China Trip · {rupees(perReferral)} for every applicant through your link{dates ? ` · ${dates}` : ""}
          {!running && <span className="font-semibold text-red-600"> · Closed: new applications through your link are not counted</span>}
        </p>
        <p className={`mt-0.5 text-[12.5px] ${wt.mid}`}>Updated {fmtTime(new Date())}</p>
      </div>

      <div className="grid gap-5 xl:grid-cols-2">
        <section className={`flex flex-col rounded-2xl p-5 ${wt.card}`}>
          <p className={`text-[13px] font-semibold sm:text-[12px] sm:font-medium ${wt.mid}`}>Your link</p>
          <p className="mt-1.5 break-words rounded-xl bg-[#f5f5f7] px-4 py-3 text-[14px] font-medium leading-relaxed sm:font-mono sm:text-[15px] sm:font-semibold">
            <span className="hidden sm:inline">https://</span>
            {linkPage.replace("https://", "")}
            <wbr />
            {/* One piece: a browser would otherwise break after the question mark. */}
            <span className="inline-block font-semibold text-brand-dark [overflow-wrap:anywhere] sm:inline sm:text-inherit">?{linkCode}</span>
          </p>
          <p className={`mt-3 text-[14px] leading-relaxed sm:text-[13px] ${wt.mid}`}>
            Whoever opens it agrees to the trip&apos;s Terms, applies with a photo of their ID, and counts for you at once.
          </p>
          <div className="mt-auto pt-4">
            <ReferralShare link={link} />
          </div>
        </section>

        <section className={`rounded-2xl p-5 ${wt.card}`}>
          <div className="flex flex-wrap items-end justify-between gap-3">
            <p className="text-[15px] font-semibold">
              <span className="text-[28px] font-bold tabular-nums">{totals.counted}</span>
              <span className={wt.soft}> / {target} counted</span>
            </p>
            {totals.counted >= target && <span className="rounded-full bg-emerald-500/10 px-3 py-1 text-[12.5px] font-semibold text-emerald-700">Target reached</span>}
          </div>
          <div className="mt-3 h-2.5 overflow-hidden rounded-full bg-black/[0.06]" role="progressbar" aria-valuemin={0} aria-valuemax={target} aria-valuenow={done} aria-label="Counted towards the target">
            <div className="h-full rounded-full bg-[#176579]" style={{ width: `${(done / target) * 100}%` }} />
          </div>
          <dl className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
            {[
              ["Applied", String(totals.referred)],
              ["Points", totals.points.toLocaleString("en-IN")],
              ["Earned", rupees(totals.paidRupees + totals.unpaidRupees)],
              ["Paid", rupees(totals.paidRupees)],
            ].map(([label, value]) => (
              <div key={label} className="relative rounded-xl bg-[#f5f5f7] px-3.5 py-2.5">
                <dt className={`text-[12.5px] ${wt.mid}`}>{label}</dt>
                <dd className="mt-0.5 flex items-baseline justify-between gap-2 text-[19px] font-semibold tabular-nums">
                  {value}
                  {/* The whole tile is the link: who they are, in the list below. */}
                  {label === "Applied" && people.length > 0 && (
                    <a href="#applied" className="text-[13px] font-semibold text-brand-dark after:absolute after:inset-0 after:rounded-xl">
                      See who
                    </a>
                  )}
                </dd>
              </div>
            ))}
          </dl>
        </section>
      </div>

      <section id="applied" className={`scroll-mt-4 overflow-hidden rounded-2xl ${wt.card}`}>
        <h2 className={`border-b px-5 py-3 text-[15px] font-semibold ${wt.border}`}>Applied through your link</h2>
        {people.length === 0 ? (
          <p className={`px-5 py-10 text-center text-[13px] ${wt.soft}`}>Nobody yet. Everyone who applies after opening your link shows here.</p>
        ) : (
          <ReferralApplicants people={people} />
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
