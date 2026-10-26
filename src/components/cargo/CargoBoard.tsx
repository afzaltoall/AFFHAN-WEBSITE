"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Check, ClipboardCopy, ExternalLink, History, Loader2, Pencil, Plus, RefreshCw, Search, Ship, Trash2, X,
} from "lucide-react";
import type { Theme } from "@/components/admin/console-theme";
import type { CargoChangeRow, CargoDetail, CargoRow } from "@/lib/cargo";
import { CARGO_STATUSES, CARGO_STATUS_META, CARGO_TYPES, fmtDay, officeToday, type CargoStatus } from "@/lib/cargo-shared";
import { formatDateTime } from "@/lib/datetime";

/**
 * The cargo-tracking sheet (the owner, 2026-10-24): what assigners keep in the staff workspace (/employee/cargo/) and
 * admins read under Shipping › Cargo tracking. The office's spreadsheet, as a page: one row a consignment, its number,
 * customer, type, ports, the newest update, ETD, ETA and its stage, in the sheet's own colours.
 *
 * The stage in a row is a dropdown: choosing another posts an update dated today, which the customer sees at once on
 * /shipping/ (Live track & trace). It must become the newest update: when one is dated later, nothing is posted and the
 * sheet says which (2026-10-24: an update dated 2 Nov held a consignment "In sailing" through four tries at "In customs",
 * each adding a line the customer saw). An update can't be dated after today, and one that already is shows a flag.
 * A row opens the consignment: its details, its timeline (add an update, correct one, take one off), and what has been
 * changed on it and by whom. Admins also see every change on the sheet, newest first.
 *
 * Everything is read from and written to /api/cargo (lib/cargo.ts), which records each change with its author.
 */

type Filter = "all" | CargoStatus;

const SITE = "https://affhan.com";
const trackLink = (reference: string) => `${SITE}/shipping/?track=${encodeURIComponent(reference)}#track`;

async function send(url: string, method: string, body?: unknown): Promise<{ ok: boolean; status: number; json: Record<string, unknown> }> {
  const res = await fetch(url, {
    method,
    headers: body ? { "Content-Type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
    cache: "no-store",
  });
  const json = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  return { ok: res.ok, status: res.status, json };
}

const errorOf = (r: { status: number; json: Record<string, unknown> }) =>
  r.status === 401 ? "Your session has ended. Sign in again." : typeof r.json.error === "string" ? r.json.error : "Something went wrong. Try again.";

/** The flag on an update dated after today, which no form accepts any more: it holds the stage until corrected. */
const laterFlag = (dark: boolean) =>
  `rounded-full px-2 py-0.5 text-[10.5px] font-bold ${dark ? "bg-amber-500/20 text-amber-300" : "bg-amber-500/15 text-amber-800"}`;

export function CargoBoard({ t, dark = false, admin = false }: { t: Theme; dark?: boolean; admin?: boolean }) {
  const [rows, setRows] = useState<CargoRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const [openId, setOpenId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [notice, setNotice] = useState<{ text: string; error?: boolean } | null>(null);
  const [busyRow, setBusyRow] = useState<string | null>(null);
  /** Bumped after every change, so the admin's change log reads itself again. */
  const [changed, setChanged] = useState(0);

  const load = useCallback(async () => {
    setLoading(true);
    const r = await send("/api/cargo/", "GET").catch(() => null);
    if (r?.ok) {
      setRows((r.json.shipments as CargoRow[]) ?? []);
      setError(null);
    } else setError(r ? errorOf(r) : "Could not reach the server.");
    setLoading(false);
  }, []);

  useEffect(() => {
    void load();
    // The sheet is shared: a colleague's change shows within a minute, without a reload.
    const id = window.setInterval(() => {
      if (document.visibilityState === "visible") void load();
    }, 60_000);
    return () => window.clearInterval(id);
  }, [load]);

  useEffect(() => {
    if (!notice) return;
    // A refusal says what to do next, so it stays long enough to be read.
    const id = window.setTimeout(() => setNotice(null), notice.error ? 9000 : 4000);
    return () => window.clearTimeout(id);
  }, [notice]);

  /** A consignment came back changed: its row is replaced in place. */
  const put = useCallback((s: CargoDetail | CargoRow) => {
    const row: CargoRow = {
      id: s.id, reference: s.reference, customer: s.customer, type: s.type, pol: s.pol, pod: s.pod, etd: s.etd, eta: s.eta,
      status: s.status, createdAt: s.createdAt, updatedAt: s.updatedAt, latest: s.latest, updates: s.updates,
    };
    setRows((prev) => (prev.some((r) => r.id === row.id) ? prev.map((r) => (r.id === row.id ? row : r)) : [row, ...prev]));
    setChanged((n) => n + 1);
  }, []);

  const counts = useMemo(() => {
    const c = Object.fromEntries([["all", rows.length], ...CARGO_STATUSES.map((s) => [s, 0])]) as Record<Filter, number>;
    for (const r of rows) c[r.status]++;
    return c;
  }, [rows]);

  const shown = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return rows.filter(
      (r) =>
        (filter === "all" || r.status === filter) &&
        (!needle || [r.reference, r.customer, r.type, r.pol, r.pod, r.latest?.name].some((v) => (v ?? "").toLowerCase().includes(needle))),
    );
  }, [rows, q, filter]);

  /**
   * The row's stage dropdown: a new update dated today, in the stage's own words, which the panel can correct. It is
   * sent as the current stage, so the server posts it only if it becomes the newest update; the notice reports the
   * stage the server answered with, never the one asked for.
   */
  const restage = async (row: CargoRow, status: CargoStatus) => {
    if (status === row.status) return;
    setBusyRow(row.id);
    const r = await send(`/api/cargo/${row.id}/events/`, "POST", { status, date: officeToday(), name: CARGO_STATUS_META[status].event, current: true }).catch(() => null);
    setBusyRow(null);
    if (r?.ok) {
      const d = r.json.shipment as CargoDetail;
      put(d);
      setNotice({ text: `${row.reference} is now ${CARGO_STATUS_META[d.status].label}. Open it to word the update.` });
    } else setNotice({ text: r ? errorOf(r) : "Could not reach the server.", error: true });
  };

  const chip = (s: CargoStatus) => (dark ? CARGO_STATUS_META[s].chipDark : CARGO_STATUS_META[s].chip);
  const today = officeToday();

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h2 className={`flex items-center gap-2 text-2xl font-semibold tracking-tight ${t.strong}`}>
            <Ship className="h-6 w-6 text-brand-dark" aria-hidden="true" />
            Cargo tracking
          </h2>
          <p className={`mt-0.5 text-[13px] ${t.soft}`}>
            {rows.length} {rows.length === 1 ? "consignment" : "consignments"} · customers follow each one by its number on affhan.com/shipping
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => void load()}
            className={`inline-flex items-center gap-2 rounded-xl px-3.5 py-2 text-[13px] font-semibold ring-1 transition-colors ${t.pill}`}
          >
            <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} /> Refresh
          </button>
          <button
            type="button"
            onClick={() => setCreating(true)}
            className="inline-flex items-center gap-2 rounded-xl bg-brand-dark px-4 py-2 text-[13px] font-bold text-white transition-colors hover:bg-brand-deep"
          >
            <Plus className="h-4 w-4" /> New consignment
          </button>
        </div>
      </div>

      <div className={`overflow-hidden rounded-2xl shadow-sm ring-1 ${t.card}`}>
        <div className={`flex flex-col gap-3 border-b p-4 lg:flex-row lg:items-center ${t.border}`}>
          <div className="relative flex-1 lg:max-w-sm">
            <Search className={`pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 ${t.soft}`} />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search number, customer, port…"
              aria-label="Search the sheet"
              className={`h-10 w-full rounded-xl pl-9 pr-3 text-sm outline-none transition-shadow focus:ring-2 focus:ring-brand/30 ${t.input}`}
            />
          </div>
          <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label="Status">
            {(["all", ...CARGO_STATUSES] as Filter[]).map((key) => (
              <button
                key={key}
                type="button"
                onClick={() => setFilter(key)}
                aria-pressed={filter === key}
                className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-bold ring-1 transition-colors ${
                  filter === key ? "bg-[#1d1d1f] text-white ring-transparent" : t.pill
                }`}
              >
                {key !== "all" && <span className={`h-2 w-2 rounded-full ${CARGO_STATUS_META[key].dot}`} />}
                {key === "all" ? "All" : CARGO_STATUS_META[key].label}
                <span className="tabular-nums opacity-60">{counts[key]}</span>
              </button>
            ))}
          </div>
        </div>

        {error ? (
          <p className="px-4 py-12 text-center text-[13px] text-red-600">{error}</p>
        ) : loading && rows.length === 0 ? (
          <div className="flex justify-center py-14">
            <Loader2 className={`h-6 w-6 animate-spin ${t.soft}`} />
          </div>
        ) : shown.length === 0 ? (
          <div className="px-4 py-14 text-center">
            <p className={`text-[15px] font-semibold ${t.strong}`}>{rows.length === 0 ? "No consignments yet" : "Nothing matches"}</p>
            <p className={`mt-1 text-[13px] ${t.soft}`}>
              {rows.length === 0 ? "Add the first one with New consignment: its number is what the customer types to track it." : "Try another search or status."}
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[1080px] text-left text-[13px]">
              <thead className={`text-[11px] font-semibold uppercase tracking-wider ${t.soft}`}>
                <tr className={`border-b ${t.border}`}>
                  <th className="px-4 py-3">Console / FCL / LCL</th>
                  <th className="px-4 py-3">Customer</th>
                  <th className="px-4 py-3">Type</th>
                  <th className="px-4 py-3">POL</th>
                  <th className="px-4 py-3">POD</th>
                  <th className="px-4 py-3">Latest update</th>
                  <th className="px-4 py-3">ETD</th>
                  <th className="px-4 py-3">ETA</th>
                  <th className="px-4 py-3">Status</th>
                </tr>
              </thead>
              <tbody className={`divide-y ${t.divide}`}>
                {shown.map((r) => (
                  <tr key={r.id} className={`cursor-pointer transition-colors ${t.hover}`} onClick={() => setOpenId(r.id)}>
                    <td className="px-4 py-3">
                      <button type="button" onClick={() => setOpenId(r.id)} className={`font-bold tracking-tight hover:underline ${t.strong}`}>
                        {r.reference}
                      </button>
                    </td>
                    <td className={`max-w-[14rem] px-4 py-3 font-medium ${t.mid}`}>
                      <span className="line-clamp-2">{r.customer}</span>
                    </td>
                    <td className={`whitespace-nowrap px-4 py-3 ${t.mid}`}>{r.type ?? "—"}</td>
                    <td className={`whitespace-nowrap px-4 py-3 ${t.mid}`}>{r.pol ?? "—"}</td>
                    <td className={`whitespace-nowrap px-4 py-3 ${t.mid}`}>{r.pod ?? "—"}</td>
                    <td className="max-w-[18rem] px-4 py-3">
                      {r.latest ? (
                        <>
                          <span className={`line-clamp-2 font-semibold ${t.strong}`}>{r.latest.name}</span>
                          <span className={`flex flex-wrap items-center gap-1.5 text-[11.5px] ${t.soft}`}>
                            {fmtDay(r.latest.date)}
                            {r.latest.date > today && <span className={laterFlag(dark)}>Dated after today</span>}
                          </span>
                        </>
                      ) : (
                        <span className={t.soft}>—</span>
                      )}
                    </td>
                    <td className={`whitespace-nowrap px-4 py-3 tabular-nums ${t.mid}`}>{r.etd ? fmtDay(r.etd, false) : "—"}</td>
                    <td className={`whitespace-nowrap px-4 py-3 tabular-nums ${t.mid}`}>{r.eta ? fmtDay(r.eta, false) : "—"}</td>
                    <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
                      {/* The assigner's dropdown: a new stage is a new update, dated today. */}
                      <span className="relative inline-flex items-center">
                        <select
                          aria-label={`Status of ${r.reference}`}
                          value={r.status}
                          disabled={busyRow === r.id}
                          onChange={(e) => void restage(r, e.target.value as CargoStatus)}
                          className={`cursor-pointer appearance-none rounded-full py-1 pl-3 pr-7 text-[12px] font-bold uppercase tracking-wide outline-none focus:ring-2 focus:ring-brand/40 disabled:opacity-60 ${chip(r.status)}`}
                        >
                          {CARGO_STATUSES.map((s) => (
                            <option key={s} value={s}>
                              {CARGO_STATUS_META[s].label}
                            </option>
                          ))}
                        </select>
                        {busyRow === r.id ? (
                          <Loader2 className="pointer-events-none absolute right-2 h-3 w-3 animate-spin" />
                        ) : (
                          <span aria-hidden="true" className="pointer-events-none absolute right-2.5 text-[9px]">▼</span>
                        )}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {admin && <CargoChanges t={t} reloadKey={changed} />}

      {notice && (
        <p
          role={notice.error ? "alert" : "status"}
          className={`fixed bottom-6 left-1/2 z-[130] w-max max-w-[calc(100vw-2rem)] -translate-x-1/2 rounded-2xl px-5 py-2.5 text-center text-[13px] font-medium text-white shadow-xl ${notice.error ? "bg-red-600" : "bg-[#1d1d1f]"}`}
        >
          {notice.text}
        </p>
      )}

      {openId && <CargoPanel id={openId} t={t} dark={dark} onClose={() => setOpenId(null)} onChanged={put} onDeleted={(id) => { setRows((p) => p.filter((r) => r.id !== id)); setOpenId(null); setChanged((n) => n + 1); }} />}
      {creating && <NewConsignment t={t} onClose={() => setCreating(false)} onCreated={(s) => { put(s); setCreating(false); setOpenId(s.id); }} />}
    </div>
  );
}

// ---- a consignment ------------------------------------------------------------------------------------------------

const label = "mb-1 block text-[11px] font-bold uppercase tracking-wider";

function Field({ t, name, children }: { t: Theme; name: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className={`${label} ${t.soft}`}>{name}</span>
      {children}
    </label>
  );
}

function CargoPanel({
  id, t, dark, onClose, onChanged, onDeleted,
}: {
  id: string;
  t: Theme;
  dark: boolean;
  onClose: () => void;
  onChanged: (s: CargoDetail) => void;
  onDeleted: (id: string) => void;
}) {
  const [s, setS] = useState<CargoDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [update, setUpdate] = useState({ date: officeToday(), name: "", status: "" as CargoStatus | "" });
  const [editing, setEditing] = useState<string | null>(null);
  const [edit, setEdit] = useState({ date: "", name: "", status: CARGO_STATUSES[0] as CargoStatus });
  const [copied, setCopied] = useState(false);
  /** Why an update just posted left the status where it was: a later update is still the newest. */
  const [note, setNote] = useState<string | null>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const input = `h-10 w-full rounded-xl px-3 text-[13px] outline-none transition-shadow focus:ring-2 focus:ring-brand/30 ${t.input}`;
  const today = officeToday();

  const adopt = useCallback((d: CargoDetail) => {
    setS(d);
    setForm({ reference: d.reference, customer: d.customer, type: d.type ?? "", pol: d.pol ?? "", pod: d.pod ?? "", etd: d.etd ?? "", eta: d.eta ?? "" });
  }, []);

  useEffect(() => {
    let alive = true;
    void send(`/api/cargo/${id}/`, "GET").then((r) => {
      if (!alive) return;
      if (r.ok) adopt(r.json.shipment as CargoDetail);
      else setError(errorOf(r));
    }).catch(() => alive && setError("Could not reach the server."));
    return () => {
      alive = false;
    };
  }, [id, adopt]);

  useEffect(() => {
    closeRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = previous;
    };
  }, [onClose]);

  const run = async (key: string, url: string, method: string, body?: unknown): Promise<CargoDetail | null> => {
    setBusy(key);
    setError(null);
    setNote(null);
    const r = await send(url, method, body).catch(() => null);
    setBusy(null);
    if (r?.ok) {
      const d = r.json.shipment as CargoDetail;
      adopt(d);
      onChanged(d);
      return d;
    }
    setError(r ? errorOf(r) : "Could not reach the server.");
    return null;
  };

  const dirty = s && (["reference", "customer", "type", "pol", "pod", "etd", "eta"] as const).some((k) => (form[k] ?? "") !== ((s[k] as string | null) ?? ""));
  const chip = (st: CargoStatus) => (dark ? CARGO_STATUS_META[st].chipDark : CARGO_STATUS_META[st].chip);

  return (
    <div className={`fixed inset-0 z-[120] flex justify-end ${t.overlay}`} onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label={s ? `Consignment ${s.reference}` : "Consignment"}
        onClick={(e) => e.stopPropagation()}
        className={`flex h-full w-full max-w-[40rem] flex-col shadow-2xl ring-1 ${t.modal}`}
      >
        <div className={`flex items-start gap-3 border-b px-5 py-4 ${t.border}`}>
          <div className="min-w-0 flex-1">
            <p className={`text-[11px] font-bold uppercase tracking-wider ${t.soft}`}>Consignment</p>
            <h3 className={`truncate text-xl font-bold tracking-tight ${t.strong}`}>{s?.reference ?? "…"}</h3>
            {s && (
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <span className={`rounded-full px-2.5 py-1 text-[11px] font-bold uppercase tracking-wide ${chip(s.status)}`}>{CARGO_STATUS_META[s.status].label}</span>
                <button
                  type="button"
                  onClick={() => {
                    void navigator.clipboard?.writeText(trackLink(s.reference)).then(() => {
                      setCopied(true);
                      window.setTimeout(() => setCopied(false), 1800);
                    });
                  }}
                  className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[12px] font-semibold ring-1 transition-colors ${t.pill}`}
                >
                  {copied ? <Check className="h-3.5 w-3.5" /> : <ClipboardCopy className="h-3.5 w-3.5" />}
                  {copied ? "Link copied" : "Copy tracking link"}
                </button>
                <a
                  href={`/shipping/?track=${encodeURIComponent(s.reference)}#track`}
                  target="_blank"
                  rel="noreferrer"
                  className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[12px] font-semibold ring-1 transition-colors ${t.pill}`}
                >
                  <ExternalLink className="h-3.5 w-3.5" /> See it as the customer does
                </a>
              </div>
            )}
          </div>
          <button ref={closeRef} type="button" onClick={onClose} aria-label="Close" className={`rounded-full p-2 transition-colors ${t.hover} ${t.soft}`}>
            <X className="h-5 w-5" />
          </button>
        </div>

        {!s ? (
          <div className="flex flex-1 items-center justify-center">
            {error ? <p className="px-6 text-center text-[13px] text-red-600">{error}</p> : <Loader2 className={`h-6 w-6 animate-spin ${t.soft}`} />}
          </div>
        ) : (
          <div className="flex-1 space-y-6 overflow-y-auto px-5 py-5">
            {error && <p role="alert" className="rounded-xl bg-red-500/10 px-3.5 py-2.5 text-[13px] font-medium text-red-600">{error}</p>}

            {/* The customer's timeline first: it is what changes every day. */}
            <section aria-labelledby="cargo-timeline">
              <h4 id="cargo-timeline" className={`mb-1 text-[13px] font-bold ${t.strong}`}>Customer timeline</h4>
              <p className={`mb-3 text-[12px] ${t.soft}`}>Each update is a line the customer sees: the date, what happened, and the status. No names or prices here.</p>
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  const status = (update.status || s.status) as CargoStatus;
                  void run("add", `/api/cargo/${s.id}/events/`, "POST", { ...update, status }).then((d) => {
                    if (!d) return;
                    setUpdate({ date: officeToday(), name: "", status: "" });
                    // Dated before the newest update, it fills in the past: the status stays with the newest, and says so.
                    const newest = d.events[d.events.length - 1];
                    if (d.status !== status && newest) {
                      setNote(`Added to the timeline. The status stays ${CARGO_STATUS_META[d.status].label}: the update of ${fmtDay(newest.date)} is later.`);
                    }
                  });
                }}
                className={`grid gap-2 rounded-2xl p-3 ring-1 sm:grid-cols-[9.5rem_1fr_9rem] ${t.card}`}
              >
                <input type="date" aria-label="Date" value={update.date} max={today} onChange={(e) => setUpdate((u) => ({ ...u, date: e.target.value }))} className={input} required />
                <input
                  aria-label="What happened"
                  value={update.name}
                  onChange={(e) => setUpdate((u) => ({ ...u, name: e.target.value }))}
                  placeholder="Loading on 19th Oct, Vessel departed Nansha…"
                  maxLength={160}
                  className={input}
                />
                <select
                  aria-label="Status"
                  value={update.status || s.status}
                  onChange={(e) => setUpdate((u) => ({ ...u, status: e.target.value as CargoStatus }))}
                  className={input}
                >
                  {CARGO_STATUSES.map((st) => (
                    <option key={st} value={st}>
                      {CARGO_STATUS_META[st].label}
                    </option>
                  ))}
                </select>
                <button
                  type="submit"
                  disabled={busy !== null}
                  className="inline-flex items-center justify-center gap-2 rounded-xl bg-brand-dark px-4 py-2.5 text-[13px] font-bold text-white transition-colors hover:bg-brand-deep disabled:opacity-60 sm:col-span-3"
                >
                  {busy === "add" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />} Post update
                </button>
              </form>
              {note && (
                <p role="status" className={`mt-2 rounded-xl px-3.5 py-2.5 text-[12.5px] font-medium ${dark ? "bg-amber-500/15 text-amber-200" : "bg-amber-500/10 text-amber-900"}`}>
                  {note}
                </p>
              )}

              <ol className="mt-3 space-y-2">
                {[...s.events].reverse().map((ev) => (
                  <li key={ev.id} className={`rounded-xl p-3 ring-1 ${t.card}`}>
                    {editing === ev.id ? (
                      <form
                        onSubmit={(e) => {
                          e.preventDefault();
                          void run(`edit-${ev.id}`, `/api/cargo/${s.id}/events/${ev.id}/`, "PATCH", edit).then((ok) => ok && setEditing(null));
                        }}
                        className="grid gap-2 sm:grid-cols-[9.5rem_1fr_9rem]"
                      >
                        <input type="date" aria-label="Date" value={edit.date} max={today} onChange={(e) => setEdit((x) => ({ ...x, date: e.target.value }))} className={input} required />
                        <input aria-label="What happened" value={edit.name} onChange={(e) => setEdit((x) => ({ ...x, name: e.target.value }))} maxLength={160} className={input} required />
                        <select aria-label="Status" value={edit.status} onChange={(e) => setEdit((x) => ({ ...x, status: e.target.value as CargoStatus }))} className={input}>
                          {CARGO_STATUSES.map((st) => (
                            <option key={st} value={st}>
                              {CARGO_STATUS_META[st].label}
                            </option>
                          ))}
                        </select>
                        <div className="flex gap-2 sm:col-span-3">
                          <button type="submit" disabled={busy !== null} className="inline-flex flex-1 items-center justify-center gap-2 rounded-xl bg-brand-dark px-4 py-2 text-[13px] font-bold text-white hover:bg-brand-deep disabled:opacity-60">
                            {busy === `edit-${ev.id}` ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />} Save correction
                          </button>
                          <button type="button" onClick={() => setEditing(null)} className={`rounded-xl px-4 py-2 text-[13px] font-semibold ring-1 ${t.pill}`}>
                            Cancel
                          </button>
                        </div>
                      </form>
                    ) : (
                      <div className="flex items-start gap-3">
                        <span className={`mt-1 h-2.5 w-2.5 shrink-0 rounded-full ${CARGO_STATUS_META[ev.status].dot}`} aria-hidden="true" />
                        <div className="min-w-0 flex-1">
                          <p className={`text-[13.5px] font-semibold leading-snug ${t.strong}`}>{ev.name}</p>
                          <p className={`mt-0.5 flex flex-wrap items-center gap-2 text-[12px] ${t.soft}`}>
                            <span className="tabular-nums">{fmtDay(ev.date)}</span>
                            <span className={`rounded-full px-2 py-0.5 text-[10.5px] font-bold uppercase tracking-wide ${chip(ev.status)}`}>{CARGO_STATUS_META[ev.status].label}</span>
                            {ev.date > today && <span className={laterFlag(dark)}>Dated after today: correct its date</span>}
                          </p>
                        </div>
                        <button
                          type="button"
                          onClick={() => {
                            setEditing(ev.id);
                            setEdit({ date: ev.date, name: ev.name, status: ev.status });
                          }}
                          aria-label={`Correct the update of ${fmtDay(ev.date)}`}
                          className={`rounded-full p-1.5 transition-colors ${t.hover} ${t.soft}`}
                        >
                          <Pencil className="h-4 w-4" />
                        </button>
                        <button
                          type="button"
                          disabled={s.events.length <= 1 || busy !== null}
                          title={s.events.length <= 1 ? "A consignment keeps at least one update" : "Take this update off the timeline"}
                          onClick={() => {
                            if (window.confirm(`Take “${ev.name}” (${fmtDay(ev.date)}) off the customer's timeline?`)) {
                              void run(`del-${ev.id}`, `/api/cargo/${s.id}/events/${ev.id}/`, "DELETE");
                            }
                          }}
                          aria-label={`Remove the update of ${fmtDay(ev.date)}`}
                          className={`rounded-full p-1.5 transition-colors hover:bg-red-500/10 hover:text-red-500 disabled:opacity-30 ${t.soft}`}
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    )}
                  </li>
                ))}
              </ol>
            </section>

            {/* The sheet's own fields. The status moves only with an update, above. */}
            <section aria-labelledby="cargo-details">
              <h4 id="cargo-details" className={`mb-3 text-[13px] font-bold ${t.strong}`}>Details</h4>
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  void run("save", `/api/cargo/${s.id}/`, "PATCH", form);
                }}
                className="grid gap-3 sm:grid-cols-2"
              >
                <Field t={t} name="Console / FCL / LCL number">
                  <input value={form.reference ?? ""} onChange={(e) => setForm((f) => ({ ...f, reference: e.target.value }))} className={input} required maxLength={40} />
                </Field>
                <Field t={t} name="Customer (never shown to the public)">
                  <input value={form.customer ?? ""} onChange={(e) => setForm((f) => ({ ...f, customer: e.target.value }))} className={input} required maxLength={120} />
                </Field>
                <Field t={t} name="Type">
                  <select value={form.type ?? ""} onChange={(e) => setForm((f) => ({ ...f, type: e.target.value }))} className={input}>
                    <option value="">Choose the type</option>
                    {CARGO_TYPES.map((ty) => (
                      <option key={ty} value={ty}>
                        {ty}
                      </option>
                    ))}
                    {/* A type written before the list (2026-10-26) stays as it is until changed. */}
                    {form.type && !(CARGO_TYPES as readonly string[]).includes(form.type) && <option value={form.type}>{form.type}</option>}
                  </select>
                </Field>
                <div className="grid grid-cols-2 gap-3">
                  <Field t={t} name="POL">
                    <input value={form.pol ?? ""} onChange={(e) => setForm((f) => ({ ...f, pol: e.target.value }))} placeholder="Nansha" className={input} maxLength={60} />
                  </Field>
                  <Field t={t} name="POD">
                    <input value={form.pod ?? ""} onChange={(e) => setForm((f) => ({ ...f, pod: e.target.value }))} placeholder="Chennai" className={input} maxLength={60} />
                  </Field>
                </div>
                <Field t={t} name="ETD">
                  <input type="date" value={form.etd ?? ""} onChange={(e) => setForm((f) => ({ ...f, etd: e.target.value }))} className={input} />
                </Field>
                <Field t={t} name="ETA">
                  <input type="date" value={form.eta ?? ""} onChange={(e) => setForm((f) => ({ ...f, eta: e.target.value }))} className={input} />
                </Field>
                <button
                  type="submit"
                  disabled={!dirty || busy !== null}
                  className="inline-flex items-center justify-center gap-2 rounded-xl bg-[#1d1d1f] px-4 py-2.5 text-[13px] font-bold text-white transition-colors hover:bg-black disabled:opacity-40 sm:col-span-2"
                >
                  {busy === "save" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />} Save details
                </button>
              </form>
            </section>

            <section aria-labelledby="cargo-history">
              <h4 id="cargo-history" className={`mb-2 flex items-center gap-1.5 text-[13px] font-bold ${t.strong}`}>
                <History className="h-4 w-4" /> What was changed
              </h4>
              <ChangeList t={t} changes={s.changes} showNumber={false} />
            </section>

            <div className={`border-t pt-4 ${t.border}`}>
              <button
                type="button"
                disabled={busy !== null}
                onClick={() => {
                  if (!window.confirm(`Delete ${s.reference} for good? Its timeline goes with it, and the customer's link will say it was not found.`)) return;
                  setBusy("delete");
                  void send(`/api/cargo/${s.id}/`, "DELETE").then((r) => {
                    setBusy(null);
                    if (r.ok) onDeleted(s.id);
                    else setError(errorOf(r));
                  });
                }}
                className="inline-flex items-center gap-2 rounded-xl px-3 py-2 text-[13px] font-semibold text-red-600 transition-colors hover:bg-red-500/10 disabled:opacity-50"
              >
                <Trash2 className="h-4 w-4" /> Delete consignment
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ---- a new consignment ------------------------------------------------------------------------------------------------

function NewConsignment({ t, onClose, onCreated }: { t: Theme; onClose: () => void; onCreated: (s: CargoDetail) => void }) {
  const [form, setForm] = useState({ reference: "", customer: "", type: "", pol: "", pod: "", etd: "", eta: "", status: CARGO_STATUSES[0] as CargoStatus, event: "", date: officeToday() });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const input = `h-10 w-full rounded-xl px-3 text-[13px] outline-none transition-shadow focus:ring-2 focus:ring-brand/30 ${t.input}`;
  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setForm((f) => ({ ...f, [k]: e.target.value }));

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div className={`fixed inset-0 z-[125] flex items-center justify-center p-4 ${t.overlay}`} onClick={onClose}>
      <form
        role="dialog"
        aria-modal="true"
        aria-label="New consignment"
        onClick={(e) => e.stopPropagation()}
        onSubmit={(e) => {
          e.preventDefault();
          setBusy(true);
          setError(null);
          void send("/api/cargo/", "POST", form)
            .then((r) => {
              if (r.ok) onCreated(r.json.shipment as CargoDetail);
              else setError(errorOf(r));
            })
            .catch(() => setError("Could not reach the server."))
            .finally(() => setBusy(false));
        }}
        className={`max-h-[92vh] w-full max-w-2xl overflow-y-auto rounded-3xl p-6 shadow-2xl ring-1 ${t.modal}`}
      >
        <div className="mb-5 flex items-start justify-between gap-3">
          <div>
            <h3 className={`text-lg font-bold tracking-tight ${t.strong}`}>New consignment</h3>
            <p className={`mt-0.5 text-[12.5px] ${t.soft}`}>Its number is what the customer types into Live track &amp; trace.</p>
          </div>
          <button type="button" onClick={onClose} aria-label="Close" className={`rounded-full p-2 transition-colors ${t.hover} ${t.soft}`}>
            <X className="h-5 w-5" />
          </button>
        </div>
        {error && <p role="alert" className="mb-4 rounded-xl bg-red-500/10 px-3.5 py-2.5 text-[13px] font-medium text-red-600">{error}</p>}
        <div className="grid gap-3 sm:grid-cols-2">
          <Field t={t} name="Console / FCL / LCL number *">
            <input value={form.reference} onChange={set("reference")} placeholder="CO-26-000004" className={input} required maxLength={40} autoFocus />
          </Field>
          <Field t={t} name="Customer * (never shown to the public)">
            <input value={form.customer} onChange={set("customer")} placeholder="AM HYDRAULICS" className={input} required maxLength={120} />
          </Field>
          <Field t={t} name="Type">
            <select value={form.type} onChange={set("type")} className={input}>
              <option value="">Choose the type</option>
              {CARGO_TYPES.map((ty) => (
                <option key={ty} value={ty}>
                  {ty}
                </option>
              ))}
            </select>
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field t={t} name="POL">
              <input value={form.pol} onChange={set("pol")} placeholder="Nansha" className={input} maxLength={60} />
            </Field>
            <Field t={t} name="POD">
              <input value={form.pod} onChange={set("pod")} placeholder="Chennai" className={input} maxLength={60} />
            </Field>
          </div>
          <Field t={t} name="ETD">
            <input type="date" value={form.etd} onChange={set("etd")} className={input} />
          </Field>
          <Field t={t} name="ETA">
            <input type="date" value={form.eta} onChange={set("eta")} className={input} />
          </Field>
        </div>
        <div className={`mt-5 rounded-2xl p-4 ring-1 ${t.card}`}>
          <p className={`mb-3 text-[13px] font-bold ${t.strong}`}>First update (the customer sees it)</p>
          <div className="grid gap-3 sm:grid-cols-[9.5rem_1fr_9rem]">
            <input type="date" aria-label="Date" value={form.date} max={officeToday()} onChange={set("date")} className={input} required />
            <input aria-label="What happened" value={form.event} onChange={set("event")} placeholder={CARGO_STATUS_META[form.status].event} className={input} maxLength={160} />
            <select aria-label="Status" value={form.status} onChange={set("status")} className={input}>
              {CARGO_STATUSES.map((st) => (
                <option key={st} value={st}>
                  {CARGO_STATUS_META[st].label}
                </option>
              ))}
            </select>
          </div>
        </div>
        <div className="mt-6 flex justify-end gap-2">
          <button type="button" onClick={onClose} className={`rounded-xl px-4 py-2.5 text-[13px] font-semibold ring-1 ${t.pill}`}>
            Cancel
          </button>
          <button type="submit" disabled={busy} className="inline-flex items-center gap-2 rounded-xl bg-brand-dark px-5 py-2.5 text-[13px] font-bold text-white transition-colors hover:bg-brand-deep disabled:opacity-60">
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />} Add consignment
          </button>
        </div>
      </form>
    </div>
  );
}

// ---- what was done --------------------------------------------------------------------------------------------------

function ChangeList({ t, changes, showNumber }: { t: Theme; changes: CargoChangeRow[]; showNumber: boolean }) {
  if (changes.length === 0) return <p className={`text-[12.5px] ${t.soft}`}>Nothing changed yet.</p>;
  return (
    <ol className={`divide-y ${t.divide}`}>
      {changes.map((c) => (
        <li key={c.id} className="py-2.5">
          <p className={`text-[13px] leading-snug ${t.strong}`}>
            {showNumber && <span className="mr-1.5 font-bold">{c.reference}</span>}
            {c.summary}
          </p>
          <p className={`mt-0.5 text-[11.5px] ${t.soft}`}>
            {c.byName}
            {c.byAdmin ? " (admin)" : ""} · {formatDateTime(c.createdAt)}
          </p>
        </li>
      ))}
    </ol>
  );
}

/** For admins: every change on the sheet, newest first, and whose it was. */
function CargoChanges({ t, reloadKey }: { t: Theme; reloadKey: number }) {
  const [by, setBy] = useState("");
  const [data, setData] = useState<{ changes: CargoChangeRow[]; people: string[] } | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    void send(`/api/cargo/changes/${by ? `?by=${encodeURIComponent(by)}` : ""}`, "GET").then((r) => {
      if (!alive) return;
      if (r.ok) {
        setData(r.json as unknown as { changes: CargoChangeRow[]; people: string[] });
        setError(null);
      } else setError(errorOf(r));
    }).catch(() => alive && setError("Could not reach the server."));
    return () => {
      alive = false;
    };
  }, [by, reloadKey]);

  return (
    <section aria-labelledby="cargo-changes" className={`rounded-2xl p-4 shadow-sm ring-1 ${t.card}`}>
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <h3 id="cargo-changes" className={`flex items-center gap-1.5 text-[15px] font-bold ${t.strong}`}>
          <History className="h-4 w-4" /> What the assigners have done
        </h3>
        <select aria-label="Whose changes" value={by} onChange={(e) => setBy(e.target.value)} className={`h-9 rounded-xl px-3 text-[13px] outline-none ${t.input}`}>
          <option value="">Everyone</option>
          {(data?.people ?? []).map((p) => (
            <option key={p} value={p}>
              {p}
            </option>
          ))}
        </select>
      </div>
      {error ? <p className="text-[13px] text-red-600">{error}</p> : data ? <ChangeList t={t} changes={data.changes} showNumber /> : <Loader2 className={`h-5 w-5 animate-spin ${t.soft}`} />}
    </section>
  );
}

export default CargoBoard;
