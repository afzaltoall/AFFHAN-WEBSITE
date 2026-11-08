"use client";

import { Fragment, useState } from "react";
import { ChevronDown } from "lucide-react";
import { wt } from "@/components/employee/workspace-ui";

/**
 * One person who applied through the employee's link, as the server has made it ready to show: the mobile already
 * masked, so the whole number never reaches this browser, and never their ID proof.
 */
export interface ReferralPerson {
  tripId: string;
  name: string;
  /** Masked (maskPhone). */
  mobile: string;
  city: string;
  country: string;
  /** "6 Nov 2026". */
  day: string;
  /** "6 Nov 2026, 2:15 pm". */
  at: string;
  state: "Paid" | "Counted" | "Waiting" | "Not counted";
  /** What this one earns them in points; 0 unless it counts. */
  points: number;
}

const toneOf = (state: ReferralPerson["state"]) => (state === "Paid" || state === "Counted" ? "text-emerald-700" : state === "Waiting" ? "text-amber-700" : wt.mid);

/** A person's details, opened from their row. */
function Details({ person, wide }: { person: ReferralPerson; wide?: boolean }) {
  const rows: [string, string][] = [
    ["Trip ID", person.tripId],
    ["Mobile", person.mobile],
    ["City", person.city || "Not given"],
    ["Country", person.country || "Not given"],
    ["Applied", person.at],
    ["Points", person.points > 0 ? person.points.toLocaleString("en-IN") : "None"],
  ];
  return (
    <dl className={wide ? "flex flex-wrap gap-x-10 gap-y-2.5" : `divide-y ${wt.divide}`}>
      {rows.map(([label, value]) => (
        <div key={label} className={wide ? "" : "flex items-baseline justify-between gap-4 py-2"}>
          <dt className={`text-[12.5px] ${wt.mid}`}>{label}</dt>
          <dd className={`min-w-0 text-right text-[13.5px] font-medium tabular-nums [overflow-wrap:anywhere] ${wide ? "text-left" : ""}`}>{value}</dd>
        </div>
      ))}
    </dl>
  );
}

/**
 * Everyone who applied through the employee's link (My referrals). A press on someone opens their details under them,
 * and a press on another closes the first (2026-11-08, the owner: "click pana yaru pana details pakava katanum"). A
 * phone reads people, not columns: the table scrolled sideways there, hiding each person's Status behind a scrollbar,
 * so below sm it is a list with the name and the status first. From sm up, the table as before. Staying mounted, an open
 * row stays open through a Refresh.
 */
export function ReferralApplicants({ people }: { people: ReferralPerson[] }) {
  const [openId, setOpenId] = useState<string | null>(null);
  const toggle = (id: string) => setOpenId((now) => (now === id ? null : id));

  return (
    <>
      <ul className={`divide-y sm:hidden ${wt.divide}`}>
        {people.map((p) => {
          const open = openId === p.tripId;
          return (
            <li key={p.tripId}>
              <button type="button" onClick={() => toggle(p.tripId)} aria-expanded={open} className="flex w-full items-center gap-3 px-5 py-3.5 text-left active:bg-black/[0.03]">
                <span className="min-w-0 flex-1">
                  <span className="flex items-baseline justify-between gap-3">
                    <span className="min-w-0 truncate text-[15px] font-semibold">{p.name}</span>
                    <span className={`shrink-0 text-[13px] font-semibold ${toneOf(p.state)}`}>{p.state}</span>
                  </span>
                  <span className={`mt-1 flex flex-wrap items-baseline justify-between gap-x-3 text-[13px] ${wt.mid}`}>
                    <span className="tabular-nums">{p.mobile}</span>
                    <span>{p.day}</span>
                  </span>
                </span>
                <ChevronDown aria-hidden className={`size-[18px] shrink-0 transition-transform duration-200 motion-reduce:transition-none ${wt.mid} ${open ? "rotate-180" : ""}`} />
              </button>
              {open && (
                <div className="mx-5 mb-3.5 rounded-xl bg-[#f5f5f7] px-4 py-1.5">
                  <p className="pt-1.5 text-[14px] font-semibold [overflow-wrap:anywhere]">{p.name}</p>
                  <Details person={p} />
                </div>
              )}
            </li>
          );
        })}
      </ul>

      <div className="hidden overflow-x-auto sm:block">
        <table className="w-full text-left text-[13px]">
          <thead>
            <tr className={`border-b text-[12px] ${wt.soft} ${wt.border}`}>
              <th className="px-5 py-2.5 font-medium">Trip ID</th>
              <th className="px-3 py-2.5 font-medium">Name</th>
              <th className="px-3 py-2.5 font-medium">Mobile</th>
              <th className="px-3 py-2.5 font-medium">Applied</th>
              <th className="px-3 py-2.5 font-medium">Status</th>
              <th className="w-12 px-3 py-2.5">
                <span className="sr-only">Details</span>
              </th>
            </tr>
          </thead>
          <tbody className={`divide-y ${wt.divide}`}>
            {people.map((p) => {
              const open = openId === p.tripId;
              return (
                <Fragment key={p.tripId}>
                  <tr onClick={() => toggle(p.tripId)} className={`cursor-pointer ${wt.hover}`}>
                    <td className="whitespace-nowrap px-5 py-2.5 font-mono text-[12.5px]">{p.tripId}</td>
                    <td className="px-3 py-2.5">{p.name}</td>
                    <td className="whitespace-nowrap px-3 py-2.5 tabular-nums">{p.mobile}</td>
                    <td className="whitespace-nowrap px-3 py-2.5">{p.day}</td>
                    <td className={`whitespace-nowrap px-3 py-2.5 font-medium ${toneOf(p.state)}`}>{p.state}</td>
                    <td className="px-3 py-1.5 text-right">
                      {/* The row answers a press; this is the way in for a keyboard and a reader. Its press is the row's. */}
                      <button type="button" aria-expanded={open} aria-label={`${open ? "Hide" : "Show"} details of ${p.name}`} className="inline-grid size-8 place-items-center rounded-full hover:bg-black/[0.05]">
                        <ChevronDown aria-hidden className={`size-4 transition-transform duration-200 motion-reduce:transition-none ${wt.mid} ${open ? "rotate-180" : ""}`} />
                      </button>
                    </td>
                  </tr>
                  {open && (
                    <tr>
                      <td colSpan={6} className="bg-[#f5f5f7] px-5 py-3.5">
                        <Details person={p} wide />
                      </td>
                    </tr>
                  )}
                </Fragment>
              );
            })}
          </tbody>
        </table>
      </div>
    </>
  );
}

export default ReferralApplicants;
