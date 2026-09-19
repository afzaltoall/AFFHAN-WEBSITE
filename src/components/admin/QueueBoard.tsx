"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  AlarmClock, ArrowLeft, Loader2, PauseCircle, RotateCw, Timer, Users, XCircle,
} from "lucide-react";
import { formatDateTime, formatSince } from "@/lib/datetime";
import { timeAgo } from "@/lib/relative-time";
import { isOfficeOpen, nextOfficeOpening } from "@/lib/office-hours";
import { AssigneePicker, Avatar } from "@/components/admin/AssigneePicker";
import { LIGHT_THEME, type EmployeeOption } from "@/components/admin/console-theme";
import { LiveRefresh } from "@/components/ui/LiveRefresh";

const sfFont = {
  fontFamily:
    '-apple-system, BlinkMacSystemFont, "SF Pro Display", "SF Pro Text", "Segoe UI", system-ui, sans-serif',
};

export interface QueueRow {
  id: string;
  customerKey: string;
  customerName: string;
  state: string;
  holder: { id: string; name: string; image: string | null } | null;
  handoffs: number;
  passes: number;
  enteredAt: string;
  nextRotationAt: string | null;
  expiresAt: string;
  closedAt: string | null;
  inquiries: number;
  contacts: number;
  trail: { id: string; kind: string; from: string | null; to: string | null; note: string | null; at: string }[];
}

/**
 * The rotation queue, and the two piles inside it that need a person.
 *
 *   Going round      somebody has it and their two working hours are running.
 *   Needs you        parked, because there was nobody to hand it to; or being
 *                    worked, where the clock has deliberately stopped.
 *   Given up on      offered to the whole team twice with nothing decided.
 *
 * Every row can be handed to somebody by name, with the console's own picker,
 * and doing so takes the customer out of the rotation — which is the point of
 * the button: it says "this is now somebody's job", and the sweep must not
 * undo that two hours later.
 */
export function QueueBoard({ rows, employees }: { rows: QueueRow[]; employees: EmployeeOption[] }) {
  const router = useRouter();
  const t = LIGHT_THEME;
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  // A countdown that does not move is a screenshot. Half a minute is as often
  // as a two-hour window needs redrawing.
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(id);
  }, []);

  const rotating = rows.filter((r) => r.state === "ROTATING" && r.holder && r.nextRotationAt);
  const attention = rows.filter((r) => r.state === "ROTATING" && (!r.holder || !r.nextRotationAt));
  const invalid = rows.filter((r) => r.state === "INVALID");

  const act = async (row: QueueRow, body: Record<string, unknown>) => {
    setBusy(row.id);
    setError(null);
    try {
      const res = await fetch("/api/admin/queue/", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ entryId: row.id, ...body }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error || "Could not do that.");
        return;
      }
      router.refresh();
    } catch {
      setError("Network error. Try again.");
    } finally {
      setBusy(null);
    }
  };

  return (
    <div style={sfFont} className="min-h-screen bg-[#f5f5f7] text-[#1d1d1f] antialiased">
      <div className="px-5 py-8 sm:px-8 lg:px-10">
        <div className="mb-6 flex items-center gap-4">
          <Link
            href="/admin/"
            aria-label="Back to the dashboard"
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-white shadow-sm ring-1 ring-black/[0.06] transition-colors hover:bg-black/[0.02] lg:hidden"
          >
            <ArrowLeft size={16} />
          </Link>
          <div className="min-w-0 flex-1">
            <h1 className="text-2xl font-semibold tracking-tight">Queue</h1>
            <p className="text-[13px] text-[#86868b]">
              {rows.length === 0
                ? "Nothing in the queue. A customer arrives here when somebody records “Not attended”."
                : `${rotating.length} going round · ${attention.length} ${attention.length === 1 ? "needs" : "need"} you · ${invalid.length} given up on`}
              {!isOfficeOpen(new Date(now)) && (
                <> · the office is shut, so nothing moves until {formatSince(nextOfficeOpening(new Date(now)), new Date(now))}</>
              )}
            </p>
          </div>
          <LiveRefresh intervalMs={30_000} />
        </div>

        {error && (
          <p className="mb-4 rounded-xl bg-red-500/10 px-4 py-2.5 text-[13px] font-medium text-red-700">{error}</p>
        )}

        <div className="grid gap-3 sm:grid-cols-3">
          <Tile icon={Timer} label="Going round" value={rotating.length} hint="somebody has them, and the clock is running" tint="text-sky-500" bg="bg-sky-50" />
          <Tile icon={PauseCircle} label="Need you" value={attention.length} hint="parked, or being worked with the clock stopped" tint="text-amber-500" bg="bg-amber-50" />
          <Tile icon={XCircle} label="Given up on" value={invalid.length} hint="offered to the whole team twice" tint="text-slate-600" bg="bg-slate-100" />
        </div>

        {rows.length === 0 ? (
          <p className="mt-4 rounded-2xl bg-white px-5 py-12 text-center text-[13px] text-[#86868b] shadow-sm ring-1 ring-black/[0.04]">
            When a salesperson cannot take a customer on, the customer appears here and is offered to the next
            person straight away. Nothing is waiting at the moment.
          </p>
        ) : (
          <>
            <Section
              title="Going round"
              caption="each holder has two working hours before the customer moves on"
              rows={rotating}
              empty="Nobody is on the clock."
              {...{ t, now, employees, busy, act }}
            />
            <Section
              title="Need you"
              caption="the rotation has stopped for these, and will not start again on its own"
              rows={attention}
              empty="Nothing is stuck."
              {...{ t, now, employees, busy, act }}
            />
            <Section
              title="Given up on"
              caption="offered to the whole team twice with nothing decided — reassign, or put back into the rotation"
              rows={invalid}
              empty="Nothing has been given up on."
              {...{ t, now, employees, busy, act }}
            />
          </>
        )}
      </div>
    </div>
  );
}

function Tile({
  icon: Icon, label, value, hint, tint, bg,
}: {
  icon: typeof Timer; label: string; value: number; hint: string; tint: string; bg: string;
}) {
  return (
    <div className="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-black/[0.04]">
      <div className="flex items-center gap-3">
        <span className={`flex h-9 w-9 items-center justify-center rounded-xl ${bg}`}>
          <Icon size={17} className={tint} />
        </span>
        <div className="min-w-0">
          <p className="text-2xl font-semibold tabular-nums leading-none">{value}</p>
          <p className="mt-1 text-[12.5px] font-medium text-[#48484a]">{label}</p>
        </div>
      </div>
      <p className="mt-2 text-[11.5px] text-[#86868b]">{hint}</p>
    </div>
  );
}

function Section({
  title, caption, rows, empty, t, now, employees, busy, act,
}: {
  title: string;
  caption: string;
  rows: QueueRow[];
  empty: string;
  t: typeof LIGHT_THEME;
  now: number;
  employees: EmployeeOption[];
  busy: string | null;
  act: (row: QueueRow, body: Record<string, unknown>) => void;
}) {
  return (
    <section className="mt-6">
      <div className="mb-2 flex flex-wrap items-baseline gap-x-3">
        <h2 className="text-[15px] font-semibold">{title}</h2>
        <span className="text-[12px] text-[#86868b]">{rows.length > 0 ? caption : empty}</span>
      </div>
      {rows.length > 0 && (
        <ul className="divide-y divide-black/[0.06] overflow-hidden rounded-2xl bg-white shadow-sm ring-1 ring-black/[0.04]">
          {rows.map((row) => (
            <QueueEntry key={row.id} row={row} t={t} now={now} employees={employees} busy={busy === row.id} act={act} />
          ))}
        </ul>
      )}
    </section>
  );
}

/**
 * What a customer's wait actually says.
 *
 * The countdown is only half the truth: the sweep runs in office hours, so a
 * customer due at eight in the evening does not move until half past nine the
 * next working morning. Saying "in 2 hours" there would be a promise the queue
 * does not keep.
 */
function waitLabel(row: QueueRow, now: number): { text: string; exact: string; muted: boolean } {
  if (row.state === "INVALID") {
    // Not parked: parked customers are waiting for somebody, and this one has
    // been given up on. The two look identical in the columns — no holder, no
    // timer — so the words have to separate them.
    return {
      text: `given up on ${row.closedAt ? timeAgo(row.closedAt) : ""}`.trim(),
      exact: row.closedAt ? formatDateTime(row.closedAt) : "Offered to the whole team twice with nothing decided",
      muted: true,
    };
  }
  if (!row.nextRotationAt) {
    return row.holder
      ? { text: "being worked — timer stopped", exact: "The holder recorded something, so the customer stays with them", muted: true }
      : { text: "parked — nobody to hand it to", exact: "No other active employee to rotate to", muted: true };
  }
  const due = new Date(row.nextRotationAt);
  const at = new Date(now);
  const left = due.getTime() - now;
  const exact = formatDateTime(due);
  if (left <= 0) {
    return isOfficeOpen(at)
      ? { text: "due now — moves on the next sweep", exact, muted: false }
      : { text: `due — moves when the office opens, ${formatSince(nextOfficeOpening(at), at)}`, exact, muted: false };
  }
  const minutes = Math.round(left / 60_000);
  const text = minutes < 60 ? `moves in ${minutes} min` : `moves in ${Math.floor(minutes / 60)}h ${minutes % 60}m`;
  return { text, exact, muted: false };
}

function QueueEntry({
  row, t, now, employees, busy, act,
}: {
  row: QueueRow;
  t: typeof LIGHT_THEME;
  now: number;
  employees: EmployeeOption[];
  busy: boolean;
  act: (row: QueueRow, body: Record<string, unknown>) => void;
}) {
  const [open, setOpen] = useState(false);
  const wait = waitLabel(row, now);
  const items = [
    row.inquiries > 0 ? `${row.inquiries} ${row.inquiries === 1 ? "product" : "products"}` : "",
    row.contacts > 0 ? `${row.contacts} ${row.contacts === 1 ? "message" : "messages"}` : "",
  ].filter(Boolean).join(" · ");

  return (
    <li className="p-4 transition-colors hover:bg-black/[0.015]">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <button onClick={() => setOpen((v) => !v)} aria-expanded={open} className="flex min-w-0 flex-1 items-center gap-3 text-left">
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-[#f5f5f7] text-[#86868b]">
            <Users className="h-[18px] w-[18px]" />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block truncate text-[14px] font-semibold leading-snug">{row.customerName}</span>
            <span className="mt-1 block text-[12px] text-[#48484a]">
              {items || "no leads left"} · in the queue {timeAgo(row.enteredAt)} · {row.handoffs}{" "}
              {row.handoffs === 1 ? "handover" : "handovers"}
              {row.passes > 0 && `, ${row.passes} ${row.passes === 1 ? "pass" : "passes"}`}
            </span>
          </span>
        </button>

        <div className="flex shrink-0 flex-wrap items-center gap-2.5 pl-[56px] sm:pl-0">
          {row.holder ? (
            <span className="inline-flex items-center gap-2 rounded-full bg-black/[0.04] py-1 pl-1 pr-3 text-xs font-semibold">
              <Avatar name={row.holder.name} image={row.holder.image} size={20} />
              {row.holder.name}
            </span>
          ) : (
            <span className="rounded-full bg-amber-500/10 px-2.5 py-1 text-xs font-semibold text-amber-700">Nobody</span>
          )}

          <span
            title={wait.exact}
            className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11.5px] font-semibold tabular-nums ${
              wait.muted ? "bg-black/[0.04] text-[#86868b]" : "bg-sky-500/10 text-sky-700"
            }`}
          >
            <AlarmClock className="h-3.5 w-3.5" />
            {wait.text}
          </span>

          {row.state === "INVALID" && (
            <button
              onClick={() => act(row, { action: "requeue" })}
              disabled={busy}
              title="Start the rotation again: the counters go back to zero and the team is offered this customer afresh"
              className="inline-flex items-center gap-1.5 rounded-full bg-[#1d1d1f] px-3 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-black disabled:opacity-60"
            >
              {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RotateCw className="h-3.5 w-3.5" />}
              Back into rotation
            </button>
          )}

          {/* The console's own picker. Choosing somebody here ends the
              rotation for this customer — it is now their job. */}
          <AssigneePicker
            t={t}
            employees={employees}
            value={row.holder?.id ?? null}
            busy={busy}
            label={row.holder ? `Reassign` : "Assign"}
            title={
              row.holder
                ? `Hand ${row.customerName} to somebody else. This ends the rotation.`
                : `Hand ${row.customerName} to somebody. This ends the rotation.`
            }
            onChange={(employeeId) => act(row, { action: "assign", employeeId })}
          />
        </div>
      </div>

      {open && (
        <div className="mt-3 border-t border-black/[0.06] pt-3">
          <dl className="grid gap-x-8 gap-y-1.5 text-[12.5px] text-[#48484a] sm:grid-cols-3">
            <Fact label="In the queue since" value={formatDateTime(row.enteredAt)} />
            <Fact label="Gives up on" value={formatDateTime(row.expiresAt)} />
            <Fact label="Customer key" value={row.customerKey} />
          </dl>
          <p className="mb-1.5 mt-3 text-[11px] font-bold uppercase tracking-wider text-[#86868b]">What has happened</p>
          {row.trail.length === 0 ? (
            <p className="text-[12.5px] text-[#86868b]">Nothing recorded yet.</p>
          ) : (
            <ol className="space-y-1.5 border-l-2 border-black/[0.06] pl-3">
              {row.trail.map((e) => (
                <li key={e.id} className="text-[12.5px]">
                  <span className="font-semibold">{kindLabel(e.kind)}</span>
                  {e.from && e.to ? ` · ${e.from} → ${e.to}` : e.to ? ` · to ${e.to}` : e.from ? ` · from ${e.from}` : ""}
                  <span className="text-[#86868b]" title={formatDateTime(e.at)}> · {timeAgo(e.at)}</span>
                  {e.note && <span className="block text-[#86868b]">{e.note}</span>}
                </li>
              ))}
            </ol>
          )}
        </div>
      )}
    </li>
  );
}

/** The trail's own words, said the way the office would say them. */
function kindLabel(kind: string): string {
  switch (kind) {
    case "ENTERED": return "Entered the queue";
    case "ROTATED": return "Handed on";
    case "PARKED": return "Parked";
    case "RESUMED": return "Back into the rotation";
    case "HELD": return "Picked up";
    case "PASS_COMPLETE": return "The whole team had been asked";
    case "MANUAL_ASSIGN": return "Assigned by an administrator";
    case "RESOLVED": return "Decided";
    case "INVALIDATED": return "Given up on";
    case "CLOSED": return "Closed";
    default: return kind.replace(/_/g, " ").toLowerCase();
  }
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex min-w-0 items-start gap-2">
      <dt className="w-[8.5rem] shrink-0 text-[11px] uppercase tracking-wide text-[#86868b]">{label}</dt>
      <dd className="min-w-0 break-words font-medium tabular-nums">{value}</dd>
    </div>
  );
}

export default QueueBoard;
