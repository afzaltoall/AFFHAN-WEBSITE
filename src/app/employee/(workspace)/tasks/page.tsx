import type { Metadata } from "next";
import { readWorkspaceAuth } from "@/lib/employee-session";
import { employeePoints, taskRunning, teamBoard } from "@/lib/server/trip-referrals";
import { ordinal, referralTaskDates, targetShare, teamPlaces, teamTotals } from "@/lib/trip-referral-shared";
import { ReferralRefresh } from "@/components/employee/ReferralRefresh";
import { wt } from "@/components/employee/workspace-ui";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Team tasks — Affhan staff",
  robots: { index: false, follow: false },
};

const fmtTime = (at: Date) => at.toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit", hour12: true, timeZone: "Asia/Kolkata" });
const num = (n: number) => n.toLocaleString("en-IN");

/** A count against its target, as My referrals draws it. */
function Bar({ counted, target, label, thin = false }: { counted: number; target: number; label: string; thin?: boolean }) {
  return (
    <div
      className={`${thin ? "h-1.5" : "h-2.5"} min-w-0 flex-1 overflow-hidden rounded-full bg-black/[0.06]`}
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={target}
      aria-valuenow={Math.min(counted, target)}
      aria-label={label}
    >
      <div className="h-full rounded-full bg-brand-dark" style={{ width: `${targetShare(counted, target) * 100}%` }} />
    </div>
  );
}

/** The figures under a card's bar, in My referrals' tiles. */
function Figures({ items }: { items: [string, React.ReactNode][] }) {
  return (
    <dl className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
      {items.map(([label, value]) => (
        <div key={label} className="rounded-xl bg-[#f5f5f7] px-3.5 py-2.5">
          <dt className={`text-[12.5px] ${wt.mid}`}>{label}</dt>
          <dd className="mt-0.5 text-[19px] font-semibold tabular-nums">{value}</dd>
        </div>
      ))}
    </dl>
  );
}

const youChip = "shrink-0 rounded-full bg-brand-dark/10 px-2 py-0.5 text-[11.5px] font-semibold text-brand-dark";

/**
 * Team tasks (the owner, 2026-11-18: "in admin i see the employee tasks now show the all tasks of works to employees
 * everyone in there employee page overall tasks status so they can see everyone status and theres too"): the referral
 * task as the whole team stands, then where you stand, then everyone best first, you marked. Every account has it, as
 * every account has a link. Names and counts only (teamBoard): what anyone earns, their code and who applied through
 * their link stay on their own My referrals and in the console. An administrator looking in sees the team, and no You.
 */
export default async function TeamTasksPage() {
  const auth = await readWorkspaceAuth();
  if (!auth.ok) return null;
  const myId = auth.kind === "employee" ? auth.employee.id : null;

  // Their own points beside the board, never in it: the board has nobody's (2026-11-18).
  const [{ settings, rows }, myPoints] = await Promise.all([teamBoard(), myId ? employeePoints(myId) : Promise.resolve(0)]);
  const places = teamPlaces(rows);
  const team = teamTotals(rows);
  const mine = myId ? rows.findIndex((r) => r.employeeId === myId) : -1;
  const me = mine >= 0 ? rows[mine] : null;
  const myPlace = mine >= 0 ? places[mine] : null;
  const running = taskRunning(settings);
  const dates = referralTaskDates(settings);

  return (
    <div className="space-y-5">
      <div>
        <div className="flex items-center justify-between gap-3">
          <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">Team tasks</h1>
          <ReferralRefresh />
        </div>
        <p className={`mt-1 text-[14px] leading-snug sm:text-[13px] ${wt.mid}`}>
          Free China Trip referrals{dates ? ` · ${dates}` : ""}
          {!running && <span className="font-semibold text-red-600"> · Closed: new applications are not counted</span>}
        </p>
        <p className={`mt-0.5 text-[12.5px] ${wt.mid}`}>Updated {fmtTime(new Date())}</p>
      </div>

      <div className={`grid gap-5 ${me ? "xl:grid-cols-2" : ""}`}>
        <section className={`rounded-2xl p-5 ${wt.card}`}>
          <p className={`text-[13px] font-semibold sm:text-[12px] sm:font-medium ${wt.mid}`}>The team</p>
          <p className="mt-1 text-[15px] font-semibold">
            <span className="text-[28px] font-bold tabular-nums">{num(team.counted)}</span>
            <span className={wt.soft}> / {num(team.target)} counted</span>
          </p>
          <div className="mt-3 flex">
            <Bar counted={team.counted} target={team.target} label="The team: counted towards everyone's targets" />
          </div>
          <Figures
            items={[
              ["Employees", num(team.employees)],
              ["Applied", num(team.referred)],
              ["Reached target", num(team.reached)],
              ["To go", num(team.toGo)],
            ]}
          />
        </section>

        {me && (
          <section className={`rounded-2xl p-5 ${wt.card}`}>
            <div className="flex items-center justify-between gap-3">
              <p className={`text-[13px] font-semibold sm:text-[12px] sm:font-medium ${wt.mid}`}>You</p>
              {me.counted >= me.target && <span className="rounded-full bg-emerald-500/10 px-3 py-1 text-[12.5px] font-semibold text-emerald-700">Target reached</span>}
            </div>
            <p className="mt-1 text-[15px] font-semibold">
              <span className="text-[28px] font-bold tabular-nums">{num(me.counted)}</span>
              <span className={wt.soft}> / {num(me.target)} counted</span>
            </p>
            <div className="mt-3 flex">
              <Bar counted={me.counted} target={me.target} label="You: counted towards your target" />
            </div>
            <Figures
              items={[
                [
                  "Place",
                  myPlace ? (
                    <>
                      {ordinal(myPlace)}
                      <span className={`text-[13px] font-medium ${wt.mid}`}> of {num(team.employees)}</span>
                    </>
                  ) : (
                    "Not yet"
                  ),
                ],
                ["Applied", num(me.referred)],
                ["Points", num(myPoints)],
                ["To go", num(Math.max(0, me.target - me.counted))],
              ]}
            />
          </section>
        )}
      </div>

      <section className={`overflow-hidden rounded-2xl ${wt.card}`}>
        <h2 className={`border-b px-5 py-3 text-[15px] font-semibold ${wt.border}`}>
          Everyone<span className={`ml-1.5 font-normal tabular-nums ${wt.soft}`}>{rows.length}</span>
        </h2>
        {rows.length === 0 ? (
          <p className={`px-5 py-10 text-center text-[13px] ${wt.soft}`}>No employees yet.</p>
        ) : (
          <>
            {/* A phone reads people, not columns (as My referrals' list): the place, the name, the count, its bar. */}
            <ol className={`divide-y sm:hidden ${wt.divide}`}>
              {rows.map((r, i) => {
                const you = r.employeeId === myId;
                return (
                  <li key={r.employeeId} aria-current={you ? "true" : undefined} className={`flex items-center gap-3 px-5 py-3 ${you ? "bg-brand-dark/[0.05]" : ""}`}>
                    <span className={`w-7 shrink-0 text-[14px] font-semibold tabular-nums ${places[i] ? "" : wt.soft}`}>{places[i] ?? "–"}</span>
                    <span className="min-w-0 flex-1">
                      <span className="flex items-baseline justify-between gap-3">
                        <span className="flex min-w-0 items-baseline gap-2">
                          <span className="truncate text-[15px] font-semibold">{r.name}</span>
                          {you && <span className={youChip}>You</span>}
                        </span>
                        <span className="shrink-0 text-[13px] tabular-nums">
                          <span className="font-semibold">{num(r.counted)}</span>
                          <span className={wt.soft}> / {num(r.target)}</span>
                        </span>
                      </span>
                      <span className="mt-2 flex items-center gap-3">
                        <Bar counted={r.counted} target={r.target} label={`${r.name}: counted towards their target`} thin />
                        <span className={`w-9 shrink-0 text-right text-[12.5px] tabular-nums ${wt.mid}`}>{Math.round(targetShare(r.counted, r.target) * 100)}%</span>
                      </span>
                    </span>
                  </li>
                );
              })}
            </ol>

            <div className="hidden overflow-x-auto sm:block">
              <table className="w-full text-left text-[13px]">
                <thead>
                  <tr className={`border-b text-[12px] ${wt.soft} ${wt.border}`}>
                    <th className="w-16 py-2.5 pl-5 pr-3 font-medium">Place</th>
                    <th className="px-3 py-2.5 font-medium">Employee</th>
                    <th className="px-3 py-2.5 text-right font-medium">Applied</th>
                    <th className="px-3 py-2.5 text-right font-medium">Counted</th>
                    <th className="px-3 py-2.5 text-right font-medium">Target</th>
                    <th className="py-2.5 pl-6 pr-5 font-medium">Progress</th>
                  </tr>
                </thead>
                <tbody className={`divide-y ${wt.divide}`}>
                  {rows.map((r, i) => {
                    const you = r.employeeId === myId;
                    return (
                      <tr key={r.employeeId} aria-current={you ? "true" : undefined} className={you ? "bg-brand-dark/[0.05]" : ""}>
                        <td className={`py-2.5 pl-5 pr-3 font-semibold tabular-nums ${places[i] ? "" : wt.soft}`}>{places[i] ?? "–"}</td>
                        <td className="px-3 py-2.5">
                          <span className="flex items-baseline gap-2">
                            <span className="font-medium">{r.name}</span>
                            {you && <span className={youChip}>You</span>}
                          </span>
                        </td>
                        <td className="px-3 py-2.5 text-right tabular-nums">{num(r.referred)}</td>
                        <td className="px-3 py-2.5 text-right font-semibold tabular-nums">{num(r.counted)}</td>
                        <td className="px-3 py-2.5 text-right tabular-nums">{num(r.target)}</td>
                        <td className="py-2.5 pl-6 pr-5">
                          <span className="flex items-center gap-2.5">
                            <span className="flex w-32 lg:w-48">
                              <Bar counted={r.counted} target={r.target} label={`${r.name}: counted towards their target`} thin />
                            </span>
                            <span className={`w-10 text-[12px] tabular-nums ${wt.mid}`}>{Math.round(targetShare(r.counted, r.target) * 100)}%</span>
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </>
        )}
      </section>
    </div>
  );
}
