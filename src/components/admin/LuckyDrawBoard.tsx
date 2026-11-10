"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { ArrowLeft, Loader2, MonitorPlay, RefreshCw, RotateCcw, Ticket, Trash2, UserX, X } from "lucide-react";
import { timeAgo } from "@/lib/relative-time";
import { DRAW_POOL_RULE, DRAW_SEATS, type DrawBoard, type DrawCardFull, type DrawMode } from "@/lib/lucky-draw-shared";

/**
 * Free China Trip → Lucky draw (the owner, 2026-11-10: "a lucky draw page ... our CEO will click draw the lucky person
 * ... 5 winners ... make it infinity"). The console's side of it; the television's is components/lucky-draw/DrawScreen.
 *
 * Live and Rehearsal, each its own board: the five seats and who holds them (a mobile number to call, where they are
 * from, when they were drawn and by whom, from how many), the reserves drawn after the seats were full, and everyone
 * released, with why. Draw here as on the TV (a live draw asks first); "Can't take part" releases someone, their seat
 * going to the first reserve or opening for the next draw (Terms clause 4); Restore undoes a release made by mistake.
 * "Open the TV screen" opens the screen in a new tab, in the mode chosen. The board reads itself again every few
 * seconds, so a draw made on the TV shows here as it happens.
 */

type Board = DrawBoard<DrawCardFull>;

const sfFont = {
  fontFamily: '-apple-system, BlinkMacSystemFont, "SF Pro Display", "SF Pro Text", "Segoe UI", system-ui, sans-serif',
};
const card = "rounded-2xl bg-white shadow-sm ring-1 ring-black/[0.06]";
const pillButton = "inline-flex h-8 items-center justify-center gap-1.5 rounded-full px-3.5 text-[12.5px] font-medium ring-1 ring-black/[0.08] transition-colors disabled:opacity-50";
const darkButton = "inline-flex h-9 items-center gap-2 rounded-full bg-[#1d1d1f] px-4 text-[13px] font-medium text-white hover:bg-black disabled:opacity-50";
const plainButton = "inline-flex h-9 items-center gap-2 rounded-full bg-white px-4 text-[13px] font-medium shadow-sm ring-1 ring-black/[0.06] hover:bg-black/[0.02] disabled:opacity-50";
const POLL_MS = 4000;
const count = new Intl.NumberFormat("en-IN");
const fmtWhen = (iso: string) =>
  new Date(iso).toLocaleString("en-IN", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit", timeZone: "Asia/Kolkata" });
const telOf = (phone: string) => `tel:${phone.replace(/[^\d+]/g, "")}`;

/** A press's id: the server draws once per id, so a press whose answer is lost is asked again with the same one. */
function pressId(): string {
  if (typeof crypto.randomUUID === "function") return crypto.randomUUID();
  const b = crypto.getRandomValues(new Uint8Array(16));
  b[6] = (b[6] & 0x0f) | 0x40;
  b[8] = (b[8] & 0x3f) | 0x80;
  const h = Array.from(b, (x) => x.toString(16).padStart(2, "0")).join("");
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

type Ask =
  | { kind: "draw" }
  | { kind: "release"; card: DrawCardFull }
  | { kind: "screen" }
  | { kind: "clear" };

export function LuckyDrawBoard({ live, rehearsal, closes }: { live: Board; rehearsal: Board; closes: string }) {
  const [mode, setMode] = useState<DrawMode>("live");
  const [boards, setBoards] = useState<Record<DrawMode, Board>>({ live, rehearsal });
  const [readAt, setReadAt] = useState(() => Date.now());
  const [refreshing, setRefreshing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [ask, setAsk] = useState<Ask | null>(null);
  /** This console's press whose answer has not come yet (sent again with the same id, so drawn once). */
  const pending = useRef<{ mode: DrawMode; id: string } | null>(null);
  const board = boards[mode];
  const byId = new Map(board.cards.map((c) => [c.id, c]));
  const seats = board.seats.map((id) => (id ? byId.get(id) ?? null : null));
  const reserves = board.reserves.map((id) => byId.get(id)).filter((c): c is DrawCardFull => !!c);
  const released = board.cards.filter((c) => c.out).reverse();
  const filled = seats.filter(Boolean).length;
  const openSeat = board.seats.indexOf(null);
  const nextPlace = openSeat >= 0 ? `seat ${openSeat + 1}` : `reserve ${board.reserves.length + 1}`;

  const read = useCallback(async (which: DrawMode) => {
    const res = await fetch(`/api/admin/lucky-draw/board/?mode=${which}`, { cache: "no-store" });
    if (!res.ok) throw new Error(res.status === 401 ? "Your session has ended. Sign in again." : "The draw could not be read.");
    const next = (await res.json()) as Board;
    setBoards((b) => ({ ...b, [which]: next }));
    setReadAt(Date.now());
  }, []);

  const refresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await read(mode);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "The draw could not be read.");
    } finally {
      setRefreshing(false);
    }
  }, [mode, read]);

  // Read again every few seconds while the tab is in front: the TV's draws show here as they are made.
  useEffect(() => {
    let stopped = false;
    let timer = 0;
    const tick = async () => {
      if (!stopped && document.visibilityState === "visible") await read(mode).catch(() => {});
      if (!stopped) timer = window.setTimeout(tick, POLL_MS);
    };
    timer = window.setTimeout(tick, POLL_MS);
    return () => {
      stopped = true;
      window.clearTimeout(timer);
    };
  }, [mode, read]);

  const draw = async () => {
    setBusy(true);
    setError(null);
    setNotice(null);
    const id = pending.current?.mode === mode ? pending.current.id : pressId();
    pending.current = { mode, id };
    try {
      const res = await fetch("/api/admin/lucky-draw/draw/", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode, requestId: id }),
        cache: "no-store",
      });
      const j = (await res.json().catch(() => ({}))) as { drawId?: string; board?: Board; error?: string };
      if (!res.ok || !j.board || !j.drawId) {
        if (res.status < 500) pending.current = null;
        setError(j.error || "The draw could not be made. Try again.");
        return;
      }
      pending.current = null;
      setBoards((b) => ({ ...b, [mode]: j.board! }));
      setReadAt(Date.now());
      const got = j.board.cards.find((c) => c.id === j.drawId);
      if (got) setNotice(`${placeName(j.board, got.id)}: ${got.name}, ${got.tripId}.`);
    } catch {
      setError("The draw didn't reach the server. Press Draw again: the same press is sent, so nobody is drawn twice.");
    } finally {
      setBusy(false);
      setAsk(null);
    }
  };

  const change = async (c: DrawCardFull, action: "release" | "restore", note = "") => {
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const res = await fetch("/api/admin/lucky-draw/release/", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: c.id, action, note }),
        cache: "no-store",
      });
      const j = (await res.json().catch(() => ({}))) as { board?: Board; error?: string };
      if (!res.ok || !j.board) {
        setError(j.error || "That could not be saved. Try again.");
        return;
      }
      setBoards((b) => ({ ...b, [mode]: j.board! }));
      setReadAt(Date.now());
      setNotice(action === "release" ? `${c.name} released.` : `${c.name} restored.`);
    } catch {
      setError("That could not be saved. Try again.");
    } finally {
      setBusy(false);
      setAsk(null);
    }
  };

  const clear = async () => {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/lucky-draw/rehearsal/", { method: "DELETE", cache: "no-store" });
      const j = (await res.json().catch(() => ({}))) as { board?: Board; cleared?: number; error?: string };
      if (!res.ok || !j.board) {
        setError(j.error || "The rehearsal could not be cleared. Try again.");
        return;
      }
      setBoards((b) => ({ ...b, rehearsal: j.board! }));
      setNotice(`Rehearsal cleared (${j.cleared ?? 0} draws).`);
    } catch {
      setError("The rehearsal could not be cleared. Try again.");
    } finally {
      setBusy(false);
      setAsk(null);
    }
  };

  const openScreen = (which: DrawMode) => {
    window.open(`/admin/draw-screen/?mode=${which}`, `affhan-draw-${which}`);
    setAsk(null);
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
            <h1 className="text-2xl font-semibold tracking-tight">Lucky draw</h1>
            <p className="text-[13px] text-[#86868b]">Free China Trip · {DRAW_SEATS} seats, drawn at random · {DRAW_POOL_RULE.toLowerCase()}</p>
          </div>
          <span className="ml-auto hidden text-[12px] text-[#86868b] sm:inline" aria-live="polite">
            {refreshing ? "Updating…" : `Updated ${timeAgo(new Date(readAt))}`}
          </span>
          <button type="button" onClick={() => void refresh()} disabled={refreshing} className={`${plainButton} max-sm:ml-auto`}>
            <RefreshCw size={14} className={refreshing ? "animate-spin" : ""} /> Refresh
          </button>
          <button type="button" onClick={() => setAsk({ kind: "screen" })} className={darkButton}>
            <MonitorPlay size={15} /> Open the TV screen
          </button>
        </div>

        {error && (
          <p role="alert" className="mb-4 rounded-xl bg-red-500/10 px-4 py-2.5 text-[13px] font-medium text-red-700">
            {error}
          </p>
        )}
        {notice && (
          <div role="status" className="mb-4 flex items-start justify-between gap-3 rounded-xl bg-emerald-500/10 px-4 py-2.5 text-[13px] font-medium text-emerald-800">
            <span>{notice}</span>
            <button type="button" onClick={() => setNotice(null)} aria-label="Dismiss" className="shrink-0 text-emerald-800/70 hover:text-emerald-900">
              <X size={15} />
            </button>
          </div>
        )}

        <div className="mb-4 flex flex-wrap items-center gap-2" role="tablist" aria-label="Which draw">
          {(["live", "rehearsal"] as const).map((m) => (
            <button
              key={m}
              type="button"
              role="tab"
              aria-selected={mode === m}
              onClick={() => {
                setMode(m);
                setNotice(null);
                setError(null);
              }}
              className={`${pillButton} h-9 px-4 text-[13px] ${mode === m ? "bg-[#1d1d1f] text-white ring-transparent" : "bg-white hover:bg-black/[0.02]"}`}
            >
              {m === "live" ? "Live draw" : "Rehearsal"}
              <span className="tabular-nums opacity-70">{boards[m].cards.length}</span>
            </button>
          ))}
          {mode === "rehearsal" && (
            <button type="button" onClick={() => setAsk({ kind: "clear" })} disabled={busy || board.cards.length === 0} className={`${pillButton} ml-auto h-9 bg-white px-4 text-[13px] hover:bg-black/[0.02]`}>
              <Trash2 size={14} /> Clear rehearsal
            </button>
          )}
        </div>

        {!board.ready && (
          <p className="mb-4 rounded-xl bg-amber-500/10 px-4 py-2.5 text-[13px] font-medium text-amber-900">
            The lucky draw&rsquo;s table is not on this database yet. Nothing can be drawn until it is added.
          </p>
        )}
        {board.ready && mode === "live" && board.applicationsOpen && (
          <p className="mb-4 rounded-xl bg-amber-500/10 px-4 py-2.5 text-[13px] text-amber-900">
            <b className="font-semibold">The live draw opens when applications close on {closes}.</b> Everyone who applies until then is in it.
            Rehearse on the TV until then: rehearsal draws never count.
          </p>
        )}
        {mode === "rehearsal" && (
          <p className="mb-4 rounded-xl bg-black/[0.03] px-4 py-2.5 text-[13px] text-[#6e6e73]">
            Practice for the TV screen. Rehearsal draws never count, and never stop anyone being drawn in the live draw.
          </p>
        )}

        {/* One strip with hairlines, as the dashboard's figures (the owner, 2026-11-03), never four tiles. */}
        <dl className="mb-5 grid grid-cols-2 gap-px overflow-hidden rounded-2xl bg-black/[0.06] shadow-sm ring-1 ring-black/[0.06] sm:grid-cols-4">
          {[
            ["In the draw", count.format(board.poolSize)],
            ["Seats filled", `${filled} of ${DRAW_SEATS}`],
            ["Reserves", String(reserves.length)],
            ["Released", String(released.length)],
          ].map(([label, n]) => (
            <div key={label} className="min-w-0 bg-white px-4 py-3">
              <dt className="truncate text-[12px] text-[#6e6e73]">{label}</dt>
              <dd className="mt-0.5 text-[22px] font-semibold tabular-nums tracking-tight">{n}</dd>
            </div>
          ))}
        </dl>

        <section className={`mb-5 overflow-hidden ${card}`}>
          <div className="flex flex-wrap items-center gap-3 border-b border-black/[0.06] px-5 py-2.5">
            <h2 className="text-[15px] font-semibold">Seats</h2>
            <button
              type="button"
              onClick={() => (mode === "live" ? setAsk({ kind: "draw" }) : void draw())}
              disabled={busy || !board.ready || board.poolSize === 0 || (mode === "live" && board.applicationsOpen)}
              className={`${darkButton} ml-auto h-8 text-[12.5px]`}
            >
              {busy ? <Loader2 size={14} className="animate-spin" /> : <Ticket size={14} />} Draw {nextPlace}
            </button>
          </div>
          <ol className="divide-y divide-black/[0.06]">
            {seats.map((c, i) => (
              <li key={i} className="flex flex-wrap items-start gap-x-4 gap-y-2 px-5 py-3.5">
                <span className="w-16 shrink-0 pt-0.5 text-[12px] font-semibold uppercase tracking-[0.12em] text-[#86868b]">Seat {i + 1}</span>
                {c ? <Person c={c} /> : <p className="flex-1 pt-0.5 text-[13.5px] text-[#86868b]">Open: the next draw takes it.</p>}
                {c && (
                  <button type="button" onClick={() => setAsk({ kind: "release", card: c })} disabled={busy} className={`${pillButton} bg-white hover:bg-black/[0.02]`}>
                    <UserX size={14} /> Can&rsquo;t take part
                  </button>
                )}
              </li>
            ))}
          </ol>
        </section>

        {reserves.length > 0 && (
          <section className={`mb-5 overflow-hidden ${card}`}>
            <h2 className="border-b border-black/[0.06] px-5 py-2.5 text-[15px] font-semibold">Reserves</h2>
            <ol className="divide-y divide-black/[0.06]">
              {reserves.map((c, i) => (
                <li key={c.id} className="flex flex-wrap items-start gap-x-4 gap-y-2 px-5 py-3.5">
                  <span className="w-16 shrink-0 pt-0.5 text-[12px] font-semibold uppercase tracking-[0.12em] text-[#86868b]">Reserve {i + 1}</span>
                  <Person c={c} />
                  <button type="button" onClick={() => setAsk({ kind: "release", card: c })} disabled={busy} className={`${pillButton} bg-white hover:bg-black/[0.02]`}>
                    <UserX size={14} /> Can&rsquo;t take part
                  </button>
                </li>
              ))}
            </ol>
          </section>
        )}

        {released.length > 0 && (
          <section className={`mb-5 overflow-hidden ${card}`}>
            <h2 className="border-b border-black/[0.06] px-5 py-2.5 text-[15px] font-semibold">Released</h2>
            <ul className="divide-y divide-black/[0.06]">
              {released.map((c) => (
                <li key={c.id} className="flex flex-wrap items-start gap-x-4 gap-y-2 px-5 py-3.5">
                  <span className="w-16 shrink-0 pt-0.5 text-[12px] font-semibold uppercase tracking-[0.12em] text-[#86868b]">Draw {c.number}</span>
                  <div className="min-w-0 flex-1">
                    <Person c={c} />
                    <p className="mt-1 text-[12.5px] text-[#86868b]">
                      {c.releasedAt
                        ? `Can't take part · released ${fmtWhen(c.releasedAt)} by ${c.releasedBy ?? "the team"}${c.releaseNote ? ` · “${c.releaseNote}”` : ""}`
                        : `Taken out: marked ${c.status} in Participants`}
                    </p>
                  </div>
                  {c.releasedAt && (
                    <button type="button" onClick={() => void change(c, "restore")} disabled={busy} className={`${pillButton} bg-white hover:bg-black/[0.02]`}>
                      <RotateCcw size={14} /> Restore
                    </button>
                  )}
                </li>
              ))}
            </ul>
          </section>
        )}
      </div>

      {ask?.kind === "draw" && (
        <Window
          title={`Draw ${nextPlace} now?`}
          lines={["This is the live draw: whoever is drawn is recorded as a result."]}
          busy={busy}
          confirm="Draw"
          onCancel={() => setAsk(null)}
          onConfirm={() => void draw()}
        />
      )}
      {ask?.kind === "release" && <ReleaseWindow c={ask.card} board={board} busy={busy} onCancel={() => setAsk(null)} onConfirm={(note) => void change(ask.card, "release", note)} />}
      {ask?.kind === "clear" && (
        <Window
          title="Clear the rehearsal?"
          lines={[`${board.cards.length} rehearsal ${board.cards.length === 1 ? "draw goes" : "draws go"}, so the next rehearsal starts again from seat 1. The live draw is not touched.`]}
          busy={busy}
          confirm="Clear rehearsal"
          danger
          onCancel={() => setAsk(null)}
          onConfirm={() => void clear()}
        />
      )}
      {ask?.kind === "screen" && <ScreenWindow live={boards.live} closes={closes} onCancel={() => setAsk(null)} onOpen={openScreen} />}
    </div>
  );
}

/** "Seat 3", "Reserve 1", or "Drawn" for someone who holds neither. */
function placeName(board: Board, id: string): string {
  const seat = board.seats.indexOf(id);
  if (seat >= 0) return `Seat ${seat + 1}`;
  const reserve = board.reserves.indexOf(id);
  return reserve >= 0 ? `Reserve ${reserve + 1}` : "Drawn";
}

/** Who was drawn: their name and Trip ID, how to call them, where from, and how they were drawn. */
function Person({ c }: { c: DrawCardFull }) {
  return (
    <div className="min-w-0 flex-1">
      <p className="flex flex-wrap items-baseline gap-x-2.5 gap-y-0.5">
        <span className="text-[15px] font-semibold">{c.name}</span>
        <span className="text-[12.5px] tabular-nums text-[#86868b]">{c.tripId}</span>
      </p>
      <p className="mt-0.5 text-[13.5px]">
        <a href={telOf(c.phone)} className="tabular-nums text-brand-dark hover:underline">
          {c.phone}
        </a>
        <span className="text-[#86868b]"> · {[c.city, c.country].filter(Boolean).join(", ")}</span>
      </p>
      <p className="mt-0.5 text-[12px] text-[#86868b]" title={`Who was in the draw (sha256 of their Trip IDs in order): ${c.poolHash}`}>
        Draw {c.number} · {fmtWhen(c.drawnAt)} by {c.drawnBy} · from {count.format(c.poolSize)} in the draw
      </p>
    </div>
  );
}

/** The console's own window: what is about to happen, in words, and the one button that does it. */
function Window({
  title,
  lines,
  busy,
  confirm,
  danger = false,
  onCancel,
  onConfirm,
  children,
}: {
  title: string;
  lines: string[];
  busy: boolean;
  confirm: string;
  danger?: boolean;
  onCancel: () => void;
  onConfirm: () => void;
  children?: React.ReactNode;
}) {
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
  }, [busy, onCancel]);
  return (
    <div className="fixed inset-0 z-[120] flex items-center justify-center bg-black/40 px-4" onClick={() => !busy && onCancel()}>
      <div
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="draw-window-title"
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl ring-1 ring-black/[0.06]"
      >
        <h2 id="draw-window-title" className="text-[16px] font-semibold tracking-tight">
          {title}
        </h2>
        <div className="mt-1.5 space-y-1.5 text-[13.5px] leading-relaxed text-[#6e6e73]">
          {lines.map((line) => (
            <p key={line}>{line}</p>
          ))}
        </div>
        {children}
        <div className="mt-5 flex justify-end gap-2">
          <button ref={cancel} type="button" onClick={onCancel} disabled={busy} className={plainButton}>
            Cancel
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={busy}
            className={danger ? "inline-flex h-9 items-center gap-2 rounded-full bg-red-600 px-4 text-[13px] font-medium text-white hover:bg-red-700 disabled:opacity-50" : darkButton}
          >
            {busy && <Loader2 size={14} className="animate-spin" />} {confirm}
          </button>
        </div>
      </div>
    </div>
  );
}

/** Before someone is released: who, where their seat goes, and why (optional, kept with the release). */
function ReleaseWindow({ c, board, busy, onCancel, onConfirm }: { c: DrawCardFull; board: Board; busy: boolean; onCancel: () => void; onConfirm: (note: string) => void }) {
  const [note, setNote] = useState("");
  const seat = board.seats.indexOf(c.id);
  const firstReserve = board.reserves[0] ? board.cards.find((x) => x.id === board.reserves[0]) : null;
  const where =
    seat >= 0
      ? firstReserve
        ? `Seat ${seat + 1} goes to Reserve 1, ${firstReserve.name}.`
        : `Seat ${seat + 1} opens: the next draw takes it.`
      : "They come off the reserves.";
  return (
    <Window title={`${c.name} can't take part?`} lines={[where, "If this was a mistake, Restore puts them back."]} busy={busy} confirm="Release" onCancel={onCancel} onConfirm={() => onConfirm(note)}>
      <label className="mt-4 block">
        <span className="text-[12.5px] font-medium">Why (optional)</span>
        <input
          value={note}
          onChange={(e) => setNote(e.target.value)}
          maxLength={300}
          placeholder="No passport by the travel date"
          className="mt-1 h-9 w-full rounded-lg bg-white px-3 text-[13.5px] outline-none ring-1 ring-black/[0.08] focus:ring-2 focus:ring-[#0071e3]/40"
        />
      </label>
    </Window>
  );
}

/** Which screen to open on the TV: the live draw, or a rehearsal (first, while the live draw waits for the close). */
function ScreenWindow({ live, closes, onCancel, onOpen }: { live: Board; closes: string; onCancel: () => void; onOpen: (mode: DrawMode) => void }) {
  const early = live.applicationsOpen;
  return (
    <Window
      title="Open the TV screen"
      lines={["It opens in a new tab: move that tab to the TV and press F (or the corner button) for full screen. Space, Enter or a presenter's clicker draws."]}
      busy={false}
      confirm={early ? "Open a rehearsal" : "Open the live draw"}
      onCancel={onCancel}
      onConfirm={() => onOpen(early ? "rehearsal" : "live")}
    >
      {early && (
        <p className="mt-3 rounded-lg bg-amber-500/10 px-3 py-2 text-[12.5px] text-amber-900">
          The live draw opens when applications close on {closes}. A rehearsal draws the same way, and nothing in it counts.
        </p>
      )}
      <button type="button" onClick={() => onOpen(early ? "live" : "rehearsal")} className={`${plainButton} mt-3 w-full justify-center`}>
        {early ? "Open the live screen (drawing opens on " + closes + ")" : "Open a rehearsal instead (nothing counts)"}
      </button>
    </Window>
  );
}
