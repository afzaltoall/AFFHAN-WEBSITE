"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Check, ClipboardCopy, ExternalLink, History, Loader2, Pencil, Plus, RefreshCw, Search, Trash2, X,
} from "lucide-react";
import { roboto } from "@/components/mobile/roboto";
import { CargoDatePicker } from "@/components/cargo/CargoDatePicker";
import { CargoDropdown } from "@/components/cargo/CargoDropdown";
import { cargoField, cargoLabel } from "@/components/cargo/cargo-fields";
import { ConfirmDelete } from "@/components/admin/ConfirmDelete";
import { newSupplierTheme } from "@/components/admin/new-suppliers-shared";
import type { Theme } from "@/components/admin/console-theme";
import type { CargoChangeRow, CargoDetail, CargoRow } from "@/lib/cargo";
import { CARGO_STATUSES, CARGO_STATUS_META, CARGO_TYPES, fmtDay, officeToday, type CargoStatus } from "@/lib/cargo-shared";
import { formatDateTime } from "@/lib/datetime";

/**
 * The cargo-tracking sheet (the owner, 2026-10-24): what assigners keep in the staff workspace (/employee/cargo/) and
 * admins read under Shipping › Cargo tracking. The office's spreadsheet, as a page: one row a consignment, its number,
 * customer, type, ports, the newest update, ETD, ETA and its stage.
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

/** The stages as a dropdown lists them: in their order, by name. */
const STATUS_OPTIONS = CARGO_STATUSES.map((st) => ({ value: st, label: CARGO_STATUS_META[st].label }));
const TYPE_OPTIONS = CARGO_TYPES.map((ty) => ({ value: ty, label: ty }));
/** The type list, and a type written before it (2026-10-26), which stays until it is changed. */
const typeOptions = (current: string | null | undefined) =>
  current && !(CARGO_TYPES as readonly string[]).includes(current) ? [...TYPE_OPTIONS, { value: current, label: current }] : TYPE_OPTIONS;

/** What a consignment's delete says, from its row or its panel. */
const deleteLines = ["The consignment and its timeline are deleted for good, and its tracking link will say it was not found.", "The change log keeps who deleted it."];

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
  /** The consignment whose delete is being asked, from its row. */
  const [removing, setRemoving] = useState<CargoRow | null>(null);
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

  const today = officeToday();

  return (
    // Set like an office's own sheet, in the Centre's Roboto, not a dashboard (the owner, 2026-10-26: "fonts and ui
    // ... feels like ai"): no icon or explanation by the title, no row of coloured pills, no headings in capitals.
    <div className={`${roboto.className} space-y-4`}>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className={`text-[22px] font-bold ${t.strong}`}>Cargo tracking</h2>
          <p className={`mt-0.5 text-[13px] tabular-nums ${t.soft}`}>
            {rows.length} {rows.length === 1 ? "consignment" : "consignments"}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => void load()}
            className={`inline-flex items-center gap-2 rounded-lg px-3.5 py-2 text-[14px] font-medium ring-1 transition-colors ${t.pill}`}
          >
            <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} /> Refresh
          </button>
          <button
            type="button"
            onClick={() => setCreating(true)}
            className="inline-flex items-center gap-2 rounded-lg bg-brand-dark px-4 py-2 text-[14px] font-medium text-white transition-colors hover:bg-brand-deep"
          >
            <Plus className="h-4 w-4" /> New consignment
          </button>
        </div>
      </div>

      <div className={`overflow-hidden rounded-xl ring-1 ${t.card}`}>
        <div className={`flex flex-col gap-3 border-b p-4 sm:flex-row sm:items-center ${t.border}`}>
          <div className="relative flex-1 sm:max-w-sm">
            <Search className={`pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 ${t.soft}`} />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search number, customer, port…"
              aria-label="Search the sheet"
              className={`pl-9 pr-3 ${cargoField(dark)}`}
            />
          </div>
          <div className="flex items-center gap-2 text-[14px]">
            <span className={t.soft}>Status</span>
            <div className="w-60">
              <CargoDropdown
                t={t}
                dark={dark}
                ariaLabel="Filter by status"
                value={filter}
                onChange={(v) => setFilter(v as Filter)}
                options={[{ value: "all", label: `All (${counts.all})` }, ...STATUS_OPTIONS.map((o) => ({ ...o, label: `${o.label} (${counts[o.value]})` }))]}
              />
            </div>
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
              {rows.length === 0 ? "Add the first one with New consignment." : "Try another search or status."}
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[1120px] text-left text-[14px]">
              <thead className={`text-[13px] font-medium ${t.soft}`}>
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
                  <th className="w-12 px-2 py-3">
                    <span className="sr-only">Delete</span>
                  </th>
                </tr>
              </thead>
              <tbody className={`divide-y ${t.divide}`}>
                {shown.map((r) => (
                  <tr key={r.id} className={`cursor-pointer transition-colors ${t.hover}`} onClick={() => setOpenId(r.id)}>
                    <td className="px-4 py-3">
                      <button type="button" onClick={() => setOpenId(r.id)} className={`font-semibold hover:underline ${t.strong}`}>
                        {r.reference}
                      </button>
                    </td>
                    <td className={`max-w-[14rem] px-4 py-3 ${t.mid}`}>
                      <span className="line-clamp-2">{r.customer}</span>
                    </td>
                    <td className={`whitespace-nowrap px-4 py-3 ${t.mid}`}>{r.type ?? "—"}</td>
                    <td className={`whitespace-nowrap px-4 py-3 ${t.mid}`}>{r.pol ?? "—"}</td>
                    <td className={`whitespace-nowrap px-4 py-3 ${t.mid}`}>{r.pod ?? "—"}</td>
                    <td className="max-w-[18rem] px-4 py-3">
                      {r.latest ? (
                        <>
                          <span className={`line-clamp-2 font-medium ${t.strong}`}>{r.latest.name}</span>
                          <span className={`flex flex-wrap items-center gap-1.5 text-[12.5px] ${t.soft}`}>
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
                      <CargoDropdown
                        t={t}
                        dark={dark}
                        variant="row"
                        ariaLabel={`Status of ${r.reference}`}
                        value={r.status}
                        busy={busyRow === r.id}
                        onChange={(v) => void restage(r, v as CargoStatus)}
                        options={STATUS_OPTIONS}
                      />
                    </td>
                    <td className="px-2 py-3 text-right" onClick={(e) => e.stopPropagation()}>
                      <button
                        type="button"
                        onClick={() => setRemoving(r)}
                        aria-label={`Delete ${r.reference}`}
                        title="Delete"
                        className={`rounded-lg p-2 transition-colors hover:bg-red-500/10 hover:text-red-600 ${t.soft}`}
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {admin && <CargoChanges t={t} dark={dark} reloadKey={changed} />}

      {notice && (
        <p
          role={notice.error ? "alert" : "status"}
          className={`fixed bottom-6 left-1/2 z-[130] w-max max-w-[calc(100vw-2rem)] -translate-x-1/2 rounded-2xl px-5 py-2.5 text-center text-[13px] font-medium text-white shadow-xl ${notice.error ? "bg-red-600" : "bg-[#1d1d1f]"}`}
        >
          {notice.text}
        </p>
      )}

      {removing && (
        <ConfirmDelete
          t={newSupplierTheme(dark)}
          title={`Delete ${removing.reference}?`}
          lines={deleteLines}
          names={[`${removing.reference} · ${removing.customer}`]}
          onCancel={() => setRemoving(null)}
          onConfirm={async () => {
            const gone = removing;
            const r = await send(`/api/cargo/${gone.id}/`, "DELETE").catch(() => null);
            if (!r?.ok) return r ? errorOf(r) : "Could not reach the server.";
            setRows((p) => p.filter((x) => x.id !== gone.id));
            if (openId === gone.id) setOpenId(null);
            setChanged((n) => n + 1);
            setRemoving(null);
            setNotice({ text: `${gone.reference} deleted.` });
            return null;
          }}
        />
      )}
      {openId && (
        <CargoPanel
          id={openId}
          t={t}
          dark={dark}
          onClose={() => setOpenId(null)}
          onChanged={put}
          onDeleted={(id) => {
            const gone = rows.find((r) => r.id === id);
            setRows((p) => p.filter((r) => r.id !== id));
            setOpenId(null);
            setChanged((n) => n + 1);
            if (gone) setNotice({ text: `${gone.reference} deleted.` });
          }}
        />
      )}
      {creating && <NewConsignment t={t} dark={dark} onClose={() => setCreating(false)} onCreated={(s) => { put(s); setCreating(false); setOpenId(s.id); }} />}
    </div>
  );
}

// ---- a consignment ------------------------------------------------------------------------------------------------

/** A form's sections: Customer timeline, Details, First update. */
const heading = (t: Theme) => `text-[15px] font-bold ${t.strong}`;

/** The ground under an update's three fields, so the white boxes stand on it. */
const band = (dark: boolean) => (dark ? "bg-white/[0.03] ring-white/[0.08]" : "bg-[#f7f7f8] ring-black/[0.05]");

/**
 * A field, named above it in near-black, not the console's grey (the owner, 2026-10-26: "make the font perfect, feels
 * weak"); one that must be filled is starred in red, and the customer's name is said to be private.
 */
function Field({
  t, dark, name, note, required = false, children,
}: {
  t: Theme;
  dark: boolean;
  name: string;
  note?: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className={cargoLabel(dark)}>
        {name}
        {note && <span className={`font-normal ${t.soft}`}> ({note})</span>}
        {required && <span className="text-red-500"> *</span>}
      </span>
      {children}
    </label>
  );
}

/**
 * An update's name, as the customer's tracker lists it under Event Name (the owner, 2026-10-26, of an unnamed box whose
 * grey hint repeated the status beside it: "event name mention panu"). Until someone types, it holds the stage's own
 * words, which is what the customer will read, and follows the status as it changes; once typed, it stays. Entering
 * it selects those words, so typing replaces them.
 */
function EventName({
  dark, status, value, typed, onType,
}: {
  dark: boolean;
  status: CargoStatus;
  value: string;
  typed: boolean;
  onType: (value: string) => void;
}) {
  return (
    <input
      aria-label="Event name"
      value={typed ? value : CARGO_STATUS_META[status].event}
      onChange={(e) => onType(e.target.value)}
      onFocus={(e) => {
        const box = e.currentTarget;
        if (!typed) window.setTimeout(() => box.select(), 0);
      }}
      placeholder={CARGO_STATUS_META[status].event}
      maxLength={160}
      className={`px-3 ${cargoField(dark)}`}
    />
  );
}

/** An update's name as it is sent: the words typed, or the stage's own. */
const eventName = (status: CargoStatus, value: string, typed: boolean) => (typed ? value : CARGO_STATUS_META[status].event);

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
  const [update, setUpdate] = useState({ date: officeToday(), name: "", status: "" as CargoStatus | "", typed: false });
  const [editing, setEditing] = useState<string | null>(null);
  /** An update being taken off the timeline, and the consignment's own delete, each asked first. */
  const [askRemove, setAskRemove] = useState<{ id: string; name: string; date: string } | null>(null);
  const [askDelete, setAskDelete] = useState(false);
  const [edit, setEdit] = useState({ date: "", name: "", status: CARGO_STATUSES[0] as CargoStatus });
  const [copied, setCopied] = useState(false);
  /** Why an update just posted left the status where it was: a later update is still the newest. */
  const [note, setNote] = useState<string | null>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const input = `px-3 ${cargoField(dark)}`;
  const today = officeToday();
  /** The stage a new update is posted in: the one chosen, or where the consignment stands. */
  const updateStatus = (update.status || s?.status || CARGO_STATUSES[0]) as CargoStatus;

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
            <h3 className={`truncate text-xl font-bold tracking-tight ${t.strong}`}>{s?.reference ?? "…"}</h3>
            {s && (
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <span className={`mr-1 text-[14px] font-semibold ${t.strong}`}>{CARGO_STATUS_META[s.status].label}</span>
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
              <h4 id="cargo-timeline" className={`mb-2.5 ${heading(t)}`}>Customer timeline</h4>
              <form
                aria-label="New update"
                onSubmit={(e) => {
                  e.preventDefault();
                  const status = updateStatus;
                  void run("add", `/api/cargo/${s.id}/events/`, "POST", { date: update.date, name: eventName(status, update.name, update.typed), status }).then((d) => {
                    if (!d) return;
                    setUpdate({ date: officeToday(), name: "", status: "", typed: false });
                    // Dated before the newest update, it fills in the past: the status stays with the newest, and says so.
                    const newest = d.events[d.events.length - 1];
                    if (d.status !== status && newest) {
                      setNote(`Added to the timeline. The status stays ${CARGO_STATUS_META[d.status].label}: the update of ${fmtDay(newest.date)} is later.`);
                    }
                  });
                }}
                className={`grid gap-3 rounded-xl p-4 ring-1 sm:grid-cols-[9.5rem_1fr_13rem] ${band(dark)}`}
              >
                <Field t={t} dark={dark} name="Event date">
                  <CargoDatePicker dark={dark} ariaLabel="Event date" value={update.date} max={today} required onChange={(v) => setUpdate((u) => ({ ...u, date: v }))} />
                </Field>
                <Field t={t} dark={dark} name="Event name">
                  <EventName dark={dark} status={updateStatus} value={update.name} typed={update.typed} onType={(v) => setUpdate((u) => ({ ...u, name: v, typed: true }))} />
                </Field>
                <Field t={t} dark={dark} name="Status">
                  <CargoDropdown
                    t={t}
                    dark={dark}
                    ariaLabel="Status"
                    value={updateStatus}
                    onChange={(v) => setUpdate((u) => ({ ...u, status: v as CargoStatus }))}
                    options={STATUS_OPTIONS}
                  />
                </Field>
                <button
                  type="submit"
                  disabled={busy !== null}
                  className="inline-flex items-center justify-center gap-2 rounded-lg bg-brand-dark px-4 py-2.5 text-[14px] font-semibold text-white transition-colors hover:bg-brand-deep disabled:opacity-60 sm:col-span-3"
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
                  <li key={ev.id} className={`rounded-xl ring-1 ${editing === ev.id ? "p-4" : "p-3"} ${t.card}`}>
                    {editing === ev.id ? (
                      <form
                        aria-label="Correct update"
                        onSubmit={(e) => {
                          e.preventDefault();
                          void run(`edit-${ev.id}`, `/api/cargo/${s.id}/events/${ev.id}/`, "PATCH", edit).then((ok) => ok && setEditing(null));
                        }}
                        className="grid gap-3 sm:grid-cols-[9.5rem_1fr_13rem]"
                      >
                        <Field t={t} dark={dark} name="Event date">
                          <CargoDatePicker dark={dark} ariaLabel="Event date" value={edit.date} max={today} required onChange={(v) => setEdit((x) => ({ ...x, date: v }))} />
                        </Field>
                        <Field t={t} dark={dark} name="Event name">
                          <input aria-label="Event name" value={edit.name} onChange={(e) => setEdit((x) => ({ ...x, name: e.target.value }))} maxLength={160} className={input} required />
                        </Field>
                        <Field t={t} dark={dark} name="Status">
                          <CargoDropdown t={t} dark={dark} ariaLabel="Status" value={edit.status} onChange={(v) => setEdit((x) => ({ ...x, status: v as CargoStatus }))} options={STATUS_OPTIONS} />
                        </Field>
                        <div className="flex gap-2 sm:col-span-3">
                          <button type="submit" disabled={busy !== null} className="inline-flex flex-1 items-center justify-center gap-2 rounded-lg bg-brand-dark px-4 py-2.5 text-[14px] font-semibold text-white hover:bg-brand-deep disabled:opacity-60">
                            {busy === `edit-${ev.id}` ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />} Save correction
                          </button>
                          <button type="button" onClick={() => setEditing(null)} className={`rounded-lg px-4 py-2.5 text-[14px] font-semibold ring-1 ${t.pill}`}>
                            Cancel
                          </button>
                        </div>
                      </form>
                    ) : (
                      <div className="flex items-start gap-3">
                        <div className="min-w-0 flex-1">
                          <p className={`text-[14px] font-semibold leading-snug ${t.strong}`}>{ev.name}</p>
                          <p className={`mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-[13px] ${t.mid}`}>
                            <span className="tabular-nums">{fmtDay(ev.date)}</span>
                            <span aria-hidden="true" className={t.soft}>
                              ·
                            </span>
                            <span>{CARGO_STATUS_META[ev.status].label}</span>
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
                          onClick={() => setAskRemove({ id: ev.id, name: ev.name, date: ev.date })}
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
              <h4 id="cargo-details" className={`mb-3 ${heading(t)}`}>Details</h4>
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  void run("save", `/api/cargo/${s.id}/`, "PATCH", form);
                }}
                className="grid gap-4 sm:grid-cols-2"
              >
                <Field t={t} dark={dark} name="Console / FCL / LCL number" required>
                  <input value={form.reference ?? ""} onChange={(e) => setForm((f) => ({ ...f, reference: e.target.value }))} className={input} required maxLength={40} />
                </Field>
                <Field t={t} dark={dark} name="Customer" note="private" required>
                  <input value={form.customer ?? ""} onChange={(e) => setForm((f) => ({ ...f, customer: e.target.value }))} className={input} required maxLength={120} />
                </Field>
                <Field t={t} dark={dark} name="Type">
                  <CargoDropdown
                    t={t}
                    dark={dark}
                    ariaLabel="Type"
                    placeholder="Choose the type"
                    value={form.type ?? ""}
                    onChange={(v) => setForm((f) => ({ ...f, type: v }))}
                    options={typeOptions(form.type)}
                  />
                </Field>
                <div className="grid grid-cols-2 gap-3">
                  <Field t={t} dark={dark} name="POL">
                    <input value={form.pol ?? ""} onChange={(e) => setForm((f) => ({ ...f, pol: e.target.value }))} placeholder="Nansha" className={input} maxLength={60} />
                  </Field>
                  <Field t={t} dark={dark} name="POD">
                    <input value={form.pod ?? ""} onChange={(e) => setForm((f) => ({ ...f, pod: e.target.value }))} placeholder="Chennai" className={input} maxLength={60} />
                  </Field>
                </div>
                <Field t={t} dark={dark} name="ETD">
                  <CargoDatePicker dark={dark} ariaLabel="ETD" value={form.etd ?? ""} onChange={(v) => setForm((f) => ({ ...f, etd: v }))} />
                </Field>
                <Field t={t} dark={dark} name="ETA">
                  <CargoDatePicker dark={dark} ariaLabel="ETA" value={form.eta ?? ""} onChange={(v) => setForm((f) => ({ ...f, eta: v }))} />
                </Field>
                <button
                  type="submit"
                  disabled={!dirty || busy !== null}
                  className="inline-flex items-center justify-center gap-2 rounded-lg bg-[#1d1d1f] px-4 py-2.5 text-[14px] font-semibold text-white transition-colors hover:bg-black disabled:opacity-40 sm:col-span-2"
                >
                  {busy === "save" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />} Save details
                </button>
              </form>
            </section>

            <section aria-labelledby="cargo-history">
              <h4 id="cargo-history" className={`mb-2 flex items-center gap-1.5 ${heading(t)}`}>
                <History className="h-4 w-4" /> History
              </h4>
              <ChangeList t={t} changes={s.changes} showNumber={false} />
            </section>

            <div className={`border-t pt-4 ${t.border}`}>
              <button
                type="button"
                disabled={busy !== null}
                onClick={() => setAskDelete(true)}
                className="inline-flex items-center gap-2 rounded-lg px-3 py-2 text-[14px] font-semibold text-red-600 transition-colors hover:bg-red-500/10 disabled:opacity-50"
              >
                <Trash2 className="h-4 w-4" /> Delete consignment
              </button>
            </div>
          </div>
        )}
        {s && askRemove && (
          <ConfirmDelete
            t={newSupplierTheme(dark)}
            title="Remove this update?"
            lines={["It comes off the customer's timeline."]}
            names={[`${fmtDay(askRemove.date)} · ${askRemove.name}`]}
            confirmLabel="Remove"
            busyLabel="Removing…"
            onCancel={() => setAskRemove(null)}
            onConfirm={async () => {
              const r = await send(`/api/cargo/${s.id}/events/${askRemove.id}/`, "DELETE").catch(() => null);
              if (!r?.ok) return r ? errorOf(r) : "Could not reach the server.";
              const d = r.json.shipment as CargoDetail;
              adopt(d);
              onChanged(d);
              setAskRemove(null);
              return null;
            }}
          />
        )}
        {s && askDelete && (
          <ConfirmDelete
            t={newSupplierTheme(dark)}
            title={`Delete ${s.reference}?`}
            lines={deleteLines}
            names={[`${s.reference} · ${s.customer}`]}
            onCancel={() => setAskDelete(false)}
            onConfirm={async () => {
              const r = await send(`/api/cargo/${s.id}/`, "DELETE").catch(() => null);
              if (!r?.ok) return r ? errorOf(r) : "Could not reach the server.";
              setAskDelete(false);
              onDeleted(s.id);
              return null;
            }}
          />
        )}
      </div>
    </div>
  );
}

// ---- a new consignment ------------------------------------------------------------------------------------------------

function NewConsignment({ t, dark, onClose, onCreated }: { t: Theme; dark: boolean; onClose: () => void; onCreated: (s: CargoDetail) => void }) {
  const [form, setForm] = useState({ reference: "", customer: "", type: "", pol: "", pod: "", etd: "", eta: "", status: CARGO_STATUSES[0] as CargoStatus, event: "", date: officeToday() });
  /** Whether the first update's name was typed, or is still the stage's own words. */
  const [typed, setTyped] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const input = `px-3 ${cargoField(dark)}`;
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
          void send("/api/cargo/", "POST", { ...form, event: eventName(form.status, form.event, typed) })
            .then((r) => {
              if (r.ok) onCreated(r.json.shipment as CargoDetail);
              else setError(errorOf(r));
            })
            .catch(() => setError("Could not reach the server."))
            .finally(() => setBusy(false));
        }}
        className={`max-h-[92vh] w-full max-w-2xl overflow-y-auto rounded-2xl p-6 shadow-2xl ring-1 ${t.modal}`}
      >
        <div className="mb-5 flex items-center justify-between gap-3">
          <h3 className={`text-[20px] font-bold tracking-tight ${t.strong}`}>New consignment</h3>
          <button type="button" onClick={onClose} aria-label="Close" className={`rounded-full p-2 transition-colors ${t.hover} ${t.soft}`}>
            <X className="h-5 w-5" />
          </button>
        </div>
        {error && <p role="alert" className="mb-4 rounded-lg bg-red-500/10 px-3.5 py-2.5 text-[13.5px] font-medium text-red-600">{error}</p>}
        <div className="grid gap-4 sm:grid-cols-2">
          <Field t={t} dark={dark} name="Console / FCL / LCL number" required>
            <input value={form.reference} onChange={set("reference")} placeholder="CO-26-000004" className={input} required maxLength={40} autoFocus />
          </Field>
          <Field t={t} dark={dark} name="Customer" note="private" required>
            <input value={form.customer} onChange={set("customer")} placeholder="AM HYDRAULICS" className={input} required maxLength={120} />
          </Field>
          <Field t={t} dark={dark} name="Type">
            <CargoDropdown t={t} dark={dark} ariaLabel="Type" placeholder="Choose the type" value={form.type} onChange={(v) => setForm((f) => ({ ...f, type: v }))} options={TYPE_OPTIONS} />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field t={t} dark={dark} name="POL">
              <input value={form.pol} onChange={set("pol")} placeholder="Nansha" className={input} maxLength={60} />
            </Field>
            <Field t={t} dark={dark} name="POD">
              <input value={form.pod} onChange={set("pod")} placeholder="Chennai" className={input} maxLength={60} />
            </Field>
          </div>
          <Field t={t} dark={dark} name="ETD">
            <CargoDatePicker dark={dark} ariaLabel="ETD" value={form.etd} onChange={(v) => setForm((f) => ({ ...f, etd: v }))} />
          </Field>
          <Field t={t} dark={dark} name="ETA">
            <CargoDatePicker dark={dark} ariaLabel="ETA" value={form.eta} onChange={(v) => setForm((f) => ({ ...f, eta: v }))} />
          </Field>
        </div>
        {/* Named as the customer's tracker names its columns: Event Date, Event Name, Status. */}
        <section aria-labelledby="first-update" className={`mt-6 rounded-xl p-4 ring-1 ${band(dark)}`}>
          <h4 id="first-update" className={`mb-3 ${heading(t)}`}>
            First update
          </h4>
          <div className="grid gap-3 sm:grid-cols-[9.5rem_1fr_13rem]">
            <Field t={t} dark={dark} name="Event date">
              <CargoDatePicker dark={dark} ariaLabel="Event date" value={form.date} max={officeToday()} required onChange={(v) => setForm((f) => ({ ...f, date: v }))} />
            </Field>
            <Field t={t} dark={dark} name="Event name">
              <EventName
                dark={dark}
                status={form.status}
                value={form.event}
                typed={typed}
                onType={(v) => {
                  setTyped(true);
                  setForm((f) => ({ ...f, event: v }));
                }}
              />
            </Field>
            <Field t={t} dark={dark} name="Status">
              <CargoDropdown t={t} dark={dark} ariaLabel="Status" value={form.status} onChange={(v) => setForm((f) => ({ ...f, status: v as CargoStatus }))} options={STATUS_OPTIONS} />
            </Field>
          </div>
        </section>
        <div className="mt-6 flex justify-end gap-2">
          <button type="button" onClick={onClose} className={`rounded-lg px-5 py-2.5 text-[14px] font-semibold ring-1 ${t.pill}`}>
            Cancel
          </button>
          <button type="submit" disabled={busy} className="inline-flex items-center gap-2 rounded-lg bg-brand-dark px-5 py-2.5 text-[14px] font-semibold text-white transition-colors hover:bg-brand-deep disabled:opacity-60">
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
function CargoChanges({ t, dark, reloadKey }: { t: Theme; dark: boolean; reloadKey: number }) {
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
          <History className="h-4 w-4" /> Change log
        </h3>
        <div className="w-52">
          <CargoDropdown
            t={t}
            dark={dark}
            ariaLabel="Whose changes"
            value={by}
            onChange={setBy}
            options={[{ value: "", label: "Everyone" }, ...(data?.people ?? []).map((p) => ({ value: p, label: p }))]}
          />
        </div>
      </div>
      {error ? <p className="text-[13px] text-red-600">{error}</p> : data ? <ChangeList t={t} changes={data.changes} showNumber /> : <Loader2 className={`h-5 w-5 animate-spin ${t.soft}`} />}
    </section>
  );
}

export default CargoBoard;
