"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  AlarmClock, ArrowLeft, Clock3, Hand, Inbox, Loader2, Undo2, UserCheck, Users, XCircle,
} from "lucide-react";
import { formatDateTime, formatSince } from "@/lib/datetime";
import { isOfficeOpen, nextOfficeOpening } from "@/lib/office-hours";
import { leadStatusLabel } from "@/lib/leadStatus";
import { poolKindLabel } from "@/lib/lead-pool-rules";
import type { PoolEventRow } from "@/lib/lead-pool";
import { Avatar } from "@/components/admin/AssigneePicker";
import type { EmployeeOption } from "@/components/admin/console-theme";
import { LiveRefresh } from "@/components/ui/LiveRefresh";

const sfFont = {
  fontFamily:
    '-apple-system, BlinkMacSystemFont, "SF Pro Display", "SF Pro Text", "Segoe UI", system-ui, sans-serif',
};

export interface QueueRow {
  id: string;
  customerName: string;
  code: string | null;
  /** OPEN (in the pool), HELD, INVALID. */
  state: string;
  holder: { id: string; name: string; image: string | null } | null;
  /** How many times the customer has been taken. */
  takes: number;
  enteredAt: string;
  expiresAt: string;
  /** Held and nothing recorded since taking: when they go back to the pool. */
  releaseAt: string | null;
  /** Held and In progress: when they go back if nothing newer is recorded. */
  staleAt: string | null;
  lastUpdate: { status: string; at: string } | null;
  closedAt: string | null;
  /** When the row last changed: taken, released, given up on. */
  since: string;
  inquiries: number;
  contacts: number;
  shipments: number;
  trail: { id: string; kind: string; from: string | null; to: string | null; note: string | null; at: string }[];
}

type Person = EmployeeOption & { held: number };

/**
 * The open pool, and the two piles in it that need a person.
 *
 *   Held, on the clock    taken, nothing recorded yet: back to the pool when the two office hours run out.
 *   Held, being worked    something recorded; In progress goes back after two quiet office days.
 *   In the pool           waiting for somebody to take them, newest first; a week unhandled and they are
 *                         given up on.
 *   Given up on           a week in the pool with nobody taking them on.
 *
 * Administrators no longer hand customers to anybody (the owner, 2026-10-22): staff take them. A held row has the
 * one control left, Release to pool, for when the person holding a customer is away; the trail says who did it, and
 * it costs the holder no cooldown.
 */
export function QueueBoard({
  rows, history, employees, cap, setAside, renderedAt,
}: {
  rows: QueueRow[];
  history: PoolEventRow[];
  employees: Person[];
  cap: number;
  /** Customers kept out of the pool because every request of theirs is marked Handled, Spam or deleted. */
  setAside: number;
  /** When the server drew the page: the clock's first reading, so the browser's first draw matches the server's. */
  renderedAt: number;
}) {
  const router = useRouter();
  const [tab, setTab] = useState<"pool" | "history">("pool");
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  // A countdown that does not move is a screenshot. Half a minute is as often as these windows need redrawing.
  const [now, setNow] = useState(renderedAt);
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(id);
  }, []);

  const held = rows.filter((r) => r.state === "HELD");
  const onClock = held.filter((r) => r.releaseAt).sort((a, b) => a.releaseAt!.localeCompare(b.releaseAt!));
  const working = held.filter((r) => !r.releaseAt).sort((a, b) => (a.staleAt ?? "~").localeCompare(b.staleAt ?? "~"));
  const open = rows.filter((r) => r.state === "OPEN").sort((a, b) => b.enteredAt.localeCompare(a.enteredAt));
  const invalid = rows.filter((r) => r.state === "INVALID").sort((a, b) => (b.closedAt ?? "").localeCompare(a.closedAt ?? ""));
  const holders = employees.filter((p) => p.held > 0).sort((a, b) => b.held - a.held);

  const release = async (row: QueueRow) => {
    const who = row.holder?.name ?? "the person holding them";
    if (!window.confirm(`Put ${row.customerName} back in the open pool?\n\n${who} stops holding them, and anybody on the team can take them.`)) return;
    setBusy(row.id);
    setError(null);
    try {
      const res = await fetch("/api/admin/queue/", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ entryId: row.id, action: "release" }),
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
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-white shadow-sm ring-1 ring-black/[0.06] transition-colors hover:bg-black/[0.02] rail:hidden"
          >
            <ArrowLeft size={16} />
          </Link>
          <div className="min-w-0 flex-1">
            <h1 className="text-2xl font-semibold tracking-tight">Queue</h1>
            <p className="text-[13px] text-[#86868b]">
              {open.length} in the open pool · {held.length} held · {invalid.length} given up on · {setAside} already handled, kept
              out of the pool
              {!isOfficeOpen(new Date(now)) && (
                <> · the office is shut, so no clock runs out until {formatSince(nextOfficeOpening(new Date(now)), new Date(now))}</>
              )}
            </p>
          </div>
          <LiveRefresh intervalMs={30_000} />
        </div>

        {error && <p className="mb-4 rounded-xl bg-red-500/10 px-4 py-2.5 text-[13px] font-medium text-red-700">{error}</p>}

        <div className="mb-4 flex flex-wrap items-center gap-2">
          {([
            ["pool", "Pool and holders", rows.length],
            ["history", "History", history.length],
          ] as const).map(([key, label, n]) => (
            <button
              key={key}
              type="button"
              onClick={() => setTab(key)}
              aria-pressed={tab === key}
              className={`inline-flex items-center gap-1.5 rounded-full px-3.5 py-2 text-[13px] font-semibold transition-colors ${
                tab === key ? "bg-[#1d1d1f] text-white" : "bg-white text-[#1d1d1f] ring-1 ring-black/[0.06] hover:bg-black/[0.02]"
              }`}
            >
              {label}
              <span className={`text-[11px] font-bold ${tab === key ? "text-white/70" : "text-[#86868b]"}`}>{n}</span>
            </button>
          ))}
        </div>

        {tab === "history" ? (
          <HistoryList rows={history} now={now} />
        ) : (
          <>
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
              <Tile icon={Inbox} label="In the pool" value={open.length} hint="waiting for somebody to take them" tint="text-sky-500" bg="bg-sky-50" />
              <Tile icon={AlarmClock} label="On the clock" value={onClock.length} hint="taken, nothing recorded yet" tint="text-amber-500" bg="bg-amber-50" />
              <Tile icon={UserCheck} label="Being worked" value={working.length} hint="held, something recorded" tint="text-emerald-600" bg="bg-emerald-50" />
              <Tile icon={XCircle} label="Given up on" value={invalid.length} hint="a week in the pool, unhandled" tint="text-slate-600" bg="bg-slate-100" />
            </div>

            {/* Who holds what, against the cap: the question an administrator asks first. */}
            <div className="mt-4 rounded-2xl bg-white px-4 py-3 shadow-sm ring-1 ring-black/[0.04]">
              <p className="text-[11px] font-bold uppercase tracking-wider text-[#86868b]">Who holds what · up to {cap} open customers each</p>
              {holders.length === 0 ? (
                <p className="mt-1.5 text-[13px] text-[#86868b]">Nobody holds anybody at the moment.</p>
              ) : (
                <ul className="mt-2 flex flex-wrap gap-2">
                  {holders.map((p) => (
                    <li
                      key={p.id}
                      className={`inline-flex items-center gap-2 rounded-full py-1 pl-1 pr-3 text-xs font-semibold ${p.held >= cap ? "bg-amber-500/10 text-amber-800" : "bg-black/[0.04]"}`}
                    >
                      <Avatar name={p.name} image={p.image} size={20} />
                      {p.name}
                      <span className="tabular-nums text-[#86868b]">
                        {p.held}/{cap}
                        {p.held >= cap ? " · at the cap" : ""}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <Section title="Held, on the clock" caption="taken with nothing recorded yet: back to the pool when the time runs out" rows={onClock} empty="Nobody is on the clock." {...{ now, busy, release }} />
            <Section title="Held, being worked" caption="In progress goes back after two quiet office days with nothing newer" rows={working} empty="Nothing held is being worked." {...{ now, busy, release }} />
            <Section title="In the pool" caption="newest first; a week unhandled and they are given up on" rows={open} empty="The pool is empty: every customer is somebody's." {...{ now, busy, release }} />
            <Section title="Given up on" caption="a week in the pool with nobody taking them on; a new request from them starts a new week" rows={invalid} empty="Nobody has been given up on." {...{ now, busy, release }} />
          </>
        )}
      </div>
    </div>
  );
}

function Tile({
  icon: Icon, label, value, hint, tint, bg,
}: {
  icon: typeof Inbox; label: string; value: number; hint: string; tint: string; bg: string;
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

const SHOWN = 100;

function Section({
  title, caption, rows, empty, now, busy, release,
}: {
  title: string;
  caption: string;
  rows: QueueRow[];
  empty: string;
  now: number;
  busy: string | null;
  release: (row: QueueRow) => void;
}) {
  const [all, setAll] = useState(false);
  const shown = all ? rows : rows.slice(0, SHOWN);
  return (
    <section className="mt-6">
      <div className="mb-2 flex flex-wrap items-baseline gap-x-3">
        <h2 className="text-[15px] font-semibold">
          {title} <span className="text-[12px] font-semibold text-[#86868b]">{rows.length}</span>
        </h2>
        <span className="text-[12px] text-[#86868b]">{rows.length > 0 ? caption : empty}</span>
      </div>
      {rows.length > 0 && (
        <ul className="divide-y divide-black/[0.06] overflow-hidden rounded-2xl bg-white shadow-sm ring-1 ring-black/[0.04]">
          {shown.map((row) => (
            <QueueEntry key={row.id} row={row} now={now} busy={busy === row.id} release={release} />
          ))}
        </ul>
      )}
      {rows.length > shown.length && (
        <button
          type="button"
          onClick={() => setAll(true)}
          className="mt-2 rounded-full bg-white px-3.5 py-2 text-[12.5px] font-semibold shadow-sm ring-1 ring-black/[0.06] hover:bg-black/[0.02]"
        >
          Show all {rows.length}
        </button>
      )}
    </section>
  );
}

/** How long, in words: "1h 20m", "3d 4h". */
function span(ms: number): string {
  const minutes = Math.max(0, Math.round(ms / 60_000));
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  if (hours < 48) return `${hours}h ${minutes % 60}m`;
  return `${Math.floor(hours / 24)}d ${hours % 24}h`;
}

/**
 * What a customer's wait actually says. The clocks run in office hours only, so a release due at eight in the
 * evening happens at half past nine the next working morning; saying "in 2 hours" there would be a promise the pool
 * does not keep.
 */
function clockLabel(row: QueueRow, now: number): { text: string; exact: string; tone: "sky" | "amber" | "muted" } {
  const at = new Date(now);
  if (row.state === "INVALID") {
    return { text: `given up on ${row.closedAt ? formatSince(row.closedAt, at) : ""}`.trim(), exact: row.closedAt ? formatDateTime(row.closedAt) : "", tone: "muted" };
  }
  if (row.state === "OPEN") {
    const left = new Date(row.expiresAt).getTime() - now;
    return {
      text: left > 0 ? `waiting · given up on in ${span(left)}` : "waiting · given up on at the next sweep",
      exact: `In the pool since ${formatDateTime(row.enteredAt)}; given up on ${formatDateTime(row.expiresAt)}`,
      tone: "sky",
    };
  }
  if (row.releaseAt) {
    const left = new Date(row.releaseAt).getTime() - now;
    const exact = formatDateTime(row.releaseAt);
    if (left > 0) return { text: `back to the pool in ${span(left)}`, exact, tone: "amber" };
    return isOfficeOpen(at)
      ? { text: "due: back to the pool at the next sweep", exact, tone: "amber" }
      : { text: `due: back when the office opens, ${formatSince(nextOfficeOpening(at), at)}`, exact, tone: "amber" };
  }
  if (row.staleAt) {
    return { text: `In progress · back to the pool ${formatSince(row.staleAt, at)} if nothing newer`, exact: formatDateTime(row.staleAt), tone: "muted" };
  }
  return {
    text: row.lastUpdate ? `${leadStatusLabel(row.lastUpdate.status)} · no clock` : "held · no clock",
    exact: row.lastUpdate ? `Last update ${formatDateTime(row.lastUpdate.at)}` : "",
    tone: "muted",
  };
}

function QueueEntry({
  row, now, busy, release,
}: {
  row: QueueRow;
  now: number;
  busy: boolean;
  release: (row: QueueRow) => void;
}) {
  const [open, setOpen] = useState(false);
  const clock = clockLabel(row, now);
  const items = [
    row.inquiries > 0 ? `${row.inquiries} ${row.inquiries === 1 ? "product" : "products"}` : "",
    row.contacts > 0 ? `${row.contacts} ${row.contacts === 1 ? "message" : "messages"}` : "",
    row.shipments > 0 ? `${row.shipments} freight ${row.shipments === 1 ? "request" : "requests"}` : "",
  ].filter(Boolean).join(" · ");
  const tone =
    clock.tone === "amber" ? "bg-amber-500/10 text-amber-800" : clock.tone === "sky" ? "bg-sky-500/10 text-sky-700" : "bg-black/[0.04] text-[#86868b]";

  return (
    <li className="p-4 transition-colors hover:bg-black/[0.015]">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <button onClick={() => setOpen((v) => !v)} aria-expanded={open} className="flex min-w-0 flex-1 items-center gap-3 text-left">
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-[#f5f5f7] text-[#86868b]">
            <Users className="h-[18px] w-[18px]" />
          </span>
          <span className="min-w-0 flex-1">
            <span className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
              <span className="truncate text-[14px] font-semibold leading-snug">{row.customerName}</span>
              {row.code && <span className="rounded-md bg-black/[0.05] px-1.5 py-0.5 text-[11px] font-bold tabular-nums text-[#48484a]">{row.code}</span>}
            </span>
            <span className="mt-1 block text-[12px] text-[#48484a]">
              {items || "no leads left"} · {row.state === "HELD" ? `held since ${formatSince(row.since, new Date(now))}` : `in the pool since ${formatSince(row.enteredAt, new Date(now))}`} · taken{" "}
              {row.takes} {row.takes === 1 ? "time" : "times"}
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
            <span className="rounded-full bg-sky-500/10 px-2.5 py-1 text-xs font-semibold text-sky-700">Nobody</span>
          )}

          <span title={clock.exact} className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11.5px] font-semibold tabular-nums ${tone}`}>
            <Clock3 className="h-3.5 w-3.5" />
            {clock.text}
          </span>

          {/* The administrator's one control over who holds whom: back to the pool, for when the holder is away. */}
          {row.state === "HELD" && (
            <button
              type="button"
              onClick={() => release(row)}
              disabled={busy}
              title={`${row.holder?.name ?? "The holder"} stops holding ${row.customerName}, and anybody can take them`}
              className="inline-flex items-center gap-1.5 rounded-full bg-white px-3 py-1.5 text-xs font-semibold text-[#1d1d1f] ring-1 ring-black/[0.1] transition-colors hover:bg-black/[0.03] disabled:opacity-60"
            >
              {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Undo2 className="h-3.5 w-3.5" />}
              Release to pool
            </button>
          )}
        </div>
      </div>

      {open && (
        <div className="mt-3 border-t border-black/[0.06] pt-3">
          <dl className="grid gap-x-8 gap-y-1.5 text-[12.5px] text-[#48484a] sm:grid-cols-3">
            <Fact label="In the pool since" value={formatDateTime(row.enteredAt)} />
            <Fact label="Given up on" value={formatDateTime(row.expiresAt)} />
            {row.lastUpdate && <Fact label="Last update" value={`${leadStatusLabel(row.lastUpdate.status)}, ${formatDateTime(row.lastUpdate.at)}`} />}
          </dl>
          <p className="mb-1.5 mt-3 text-[11px] font-bold uppercase tracking-wider text-[#86868b]">What has happened</p>
          {row.trail.length === 0 ? (
            <p className="text-[12.5px] text-[#86868b]">Nothing recorded yet.</p>
          ) : (
            <ol className="space-y-1.5 border-l-2 border-black/[0.06] pl-3">
              {row.trail.map((e) => (
                <li key={e.id} className="text-[12.5px]">
                  <span className="font-semibold">{poolKindLabel(e.kind)}</span>
                  {e.from && e.to ? ` · ${e.from} → ${e.to}` : e.to ? ` · ${e.to}` : e.from ? ` · ${e.from}` : ""}
                  <span className="text-[#86868b]" title={formatDateTime(e.at)}> · {formatSince(e.at, new Date(now))}</span>
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

/** The pool's moves, newest first: who took, let go or lost whom. */
function HistoryList({ rows, now }: { rows: PoolEventRow[]; now: number }) {
  if (rows.length === 0) {
    return (
      <p className="rounded-2xl bg-white px-5 py-12 text-center text-[13px] text-[#86868b] shadow-sm ring-1 ring-black/[0.04]">
        Nothing has moved yet. Takes and releases appear here as they happen.
      </p>
    );
  }
  return (
    <ul className="divide-y divide-black/[0.06] overflow-hidden rounded-2xl bg-white shadow-sm ring-1 ring-black/[0.04]">
      {rows.map((e) => (
        <li key={e.id} className="flex flex-col gap-1 p-4 sm:flex-row sm:items-center sm:gap-3">
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[#f5f5f7] text-[#86868b]">
            <Hand className="h-4 w-4" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-[13.5px]">
              <span className="font-semibold">{poolKindLabel(e.kind)}</span>
              {e.to.name && e.kind !== "AUTO_RELEASED" ? ` · ${e.from.name ? `${e.from.name} → ` : ""}${e.to.name}` : e.from.name ? ` · ${e.from.name}` : ""}
              <span className="text-[#48484a]"> · {e.customerName}</span>
              {e.code && <span className="ml-1.5 rounded-md bg-black/[0.05] px-1.5 py-0.5 text-[11px] font-bold tabular-nums text-[#48484a]">{e.code}</span>}
            </p>
            {e.note && <p className="mt-0.5 text-[12px] text-[#86868b]">{e.note}</p>}
          </div>
          <span className="shrink-0 text-[12px] text-[#86868b]" title={formatDateTime(e.at)}>
            {formatSince(e.at, new Date(now))}
          </span>
        </li>
      ))}
    </ul>
  );
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
