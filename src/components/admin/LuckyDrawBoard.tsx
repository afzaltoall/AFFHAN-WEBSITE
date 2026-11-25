"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { ArrowLeft, Download, Loader2, MonitorPlay, RefreshCw, RotateCcw, Search, Ticket, Trash2, UserX, X } from "lucide-react";
import { timeAgo } from "@/lib/relative-time";
import {
  DRAW_POOL_RULE,
  DRAW_SEATS,
  inWaitingList,
  nextPlace,
  nextRoundWords,
  placeWords,
  roundFull,
  roundName,
  seatName,
  waitingNo,
  type DrawBoard,
  type DrawCardFull,
  type DrawMode,
  type DrawPerson,
} from "@/lib/lucky-draw-shared";
import { Detail as ApplicationPanel, DetailWaiting as ApplicationWaiting, type Application } from "@/components/admin/TripApplicationsBoard";

/**
 * Free China Trip → Lucky draw (the owner, 2026-11-10: "a lucky draw page ... our CEO will click draw the lucky person
 * ... 5 winners ... make it infinity"). The console's side of it; the television's is components/lucky-draw/DrawShow (the wall).
 *
 * Live and Rehearsal, each its own board: the five seats and who holds them (a mobile number to call, where they are
 * from, when they were drawn and by whom, from how many), round by round: when all five are taken, the next round's
 * five open (the owner, 2026-11-10: "once five seats complete, give a next option; click it and draw 2 opens"), the
 * rounds before listed under it. Round 1 is the draw, the five winners; every round after it the waiting list, numbered
 * on (the owner, 2026-11-25: "first panrom la adhu draw va erukatum ... remaining la next set waiting list"), opened by
 * "Start waiting list", then "Continue waiting list", as on the TV. Draw here as on the TV (a live draw asks first);
 * "Can't take part" releases someone and their seat opens, the next draw filling it first while it is in the current
 * round; a seat in the draw left open once the waiting list has begun names the next on the waiting list, whom the
 * Terms offer it to (clause 4). Restore undoes a release made by mistake. The console keeps Trip IDs; the TV never
 * shows one.
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
const fmtDay = (iso: string) =>
  iso ? new Date(iso).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric", timeZone: "Asia/Kolkata" }) : "";
/** Everyone in the draw is listed this many at a time. */
const PEOPLE_PAGE = 100;
/** A panel's opening lines: the draw's own, or where someone stands in it. */
type Lead = Array<[string, React.ReactNode]>;

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
  /** The next round opened here ("Start waiting list"), before its first draw: its five seats shown open. */
  const [started, setStarted] = useState<Record<DrawMode, number | null>>({ live: null, rehearsal: null });
  const full = roundFull(board);
  const startedHere = full && started[mode] === board.round + 1;
  const round = board.round + (startedHere ? 1 : 0);
  const seatIds = startedHere ? Array.from({ length: DRAW_SEATS }, (): string | null => null) : board.seats;
  const seats = seatIds.map((id) => (id ? byId.get(id) ?? null : null));
  /** The rounds before the one shown, the latest first. */
  const past = board.rounds.slice(0, startedHere ? board.rounds.length : board.rounds.length - 1).map((ids, i) => ({ n: i + 1, ids })).reverse();
  const released = board.cards.filter((c) => c.out).reverse();
  const upNext = startedHere ? { n: 1, round } : nextPlace(board);
  const nextWords = inWaitingList(upNext.round) ? `waiting list No. ${waitingNo(upNext.round, upNext.n)}` : `seat ${upNext.n}`;
  /** The draw's five held now, and the waiting list's places held. */
  const winners = (board.rounds[0] ?? []).filter(Boolean).length;
  const waitingHeld = board.rounds.slice(1).reduce((n, r) => n + r.filter(Boolean).length, 0);
  /** The first on the waiting list still holding their place: whom a seat in the draw left open is offered to (Terms clause 4). */
  const nextOnList = firstOnList(board, byId);

  /**
   * Someone drawn, opened on the right (2026-11-22, the owner: "click the selected candidate ... explore ... a right-side
   * tab with their full details ... documents if they have them"): Participants' own panel, their whole application read
   * again as it opens, its ID proof behind the admin's password as everywhere.
   */
  const [opened, setOpened] = useState<{ id: string; name: string; tripId: string; lead: Lead; n: number } | null>(null);
  const [application, setApplication] = useState<Application | null>(null);
  const [applicationFailed, setApplicationFailed] = useState(false);
  // Every open reads it again, the same person's too (its status or ID proof may have changed since).
  const openApplication = (id: string, name: string, tripId: string, lead: Lead) => {
    setApplication(null);
    setApplicationFailed(false);
    setOpened((o) => ({ id, name, tripId, lead, n: (o?.n ?? 0) + 1 }));
  };
  const openPerson = (c: DrawCardFull) => openApplication(c.applicationId, c.name, c.tripId, drawRows(c, mode));
  const openedId = opened?.id ?? null;

  /**
   * Everyone in the draw, listed (the owner, 2026-11-25: "show the overall run a business users in the lucky draw ...
   * show the overall the list of lucky draw set persons to see"): read when asked for, and again on every open, a change
   * of mode and Refresh, never with the board's few-second reads (thousands of people). A name opens their application.
   */
  const [peopleOpen, setPeopleOpen] = useState(false);
  const [people, setPeople] = useState<{ mode: DrawMode; list: DrawPerson[] } | null>(null);
  const [peopleLoading, setPeopleLoading] = useState(false);
  const [peopleError, setPeopleError] = useState<string | null>(null);
  const [find, setFind] = useState("");
  const [shown, setShown] = useState(PEOPLE_PAGE);
  const [exportingPeople, setExportingPeople] = useState(false);
  const peopleRef = useRef<HTMLElement | null>(null);
  const readPeople = useCallback(async (which: DrawMode) => {
    setPeopleLoading(true);
    setPeopleError(null);
    try {
      const res = await fetch(`/api/admin/lucky-draw/people/?mode=${which}`, { cache: "no-store" });
      if (!res.ok) throw new Error(res.status === 401 ? "Your session has ended. Sign in again." : "Who is in the draw could not be read.");
      const j = (await res.json()) as { people: DrawPerson[] };
      setPeople({ mode: which, list: j.people });
    } catch (e) {
      setPeopleError(e instanceof Error ? e.message : "Who is in the draw could not be read.");
    } finally {
      setPeopleLoading(false);
    }
  }, []);
  useEffect(() => {
    if (peopleOpen) void readPeople(mode);
  }, [peopleOpen, mode, readPeople]);
  const showPeople = () => {
    setShown(PEOPLE_PAGE);
    if (peopleOpen) void readPeople(mode);
    setPeopleOpen(true);
    requestAnimationFrame(() => peopleRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }));
  };
  const everyone = people && people.mode === mode ? people.list : [];
  const needle = find.trim().toLowerCase();
  const digits = needle.replace(/\D/g, "");
  const matches = needle
    ? everyone.filter(
        (p) =>
          p.name.toLowerCase().includes(needle) ||
          p.tripId.toLowerCase().includes(needle) ||
          p.city.toLowerCase().includes(needle) ||
          p.country.toLowerCase().includes(needle) ||
          (digits.length >= 3 && p.phone.replace(/\D/g, "").includes(digits)),
      )
    : everyone;
  const exportPeople = async () => {
    setExportingPeople(true);
    try {
      const XLSX = await import("xlsx");
      const head = ["Trip ID", "Name", "City", "Country", "Mobile", "Applied"];
      const lines = matches.map((p) => [p.tripId, p.name, p.city, p.country, p.phone, fmtDay(p.appliedAt)]);
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
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, "In the draw");
      XLSX.writeFile(wb, `lucky-draw-${mode === "live" ? "in-the-draw" : "rehearsal"}-${new Date().toISOString().slice(0, 10)}.xlsx`);
    } catch {
      setPeopleError("The export could not be made. Try again.");
    } finally {
      setExportingPeople(false);
    }
  };
  const openedN = opened?.n ?? 0;
  useEffect(() => {
    if (!openedId) return;
    let gone = false;
    fetch(`/api/admin/trip-applications/${openedId}/`, { cache: "no-store" })
      .then(async (res) => {
        if (!res.ok) throw new Error(String(res.status));
        const a = (await res.json()) as Application;
        if (!gone) setApplication(a);
      })
      .catch(() => {
        if (!gone) setApplicationFailed(true);
      });
    return () => {
      gone = true;
    };
  }, [openedId, openedN]);

  const read = useCallback(async (which: DrawMode) => {
    const res = await fetch(`/api/admin/lucky-draw/board/?mode=${which}`, { cache: "no-store" });
    if (!res.ok) throw new Error(res.status === 401 ? "Your session has ended. Sign in again." : "The draw could not be read.");
    const next = (await res.json()) as Board;
    setBoards((b) => ({ ...b, [which]: next }));
    setReadAt(Date.now());
  }, []);

  const refresh = useCallback(async () => {
    setRefreshing(true);
    if (peopleOpen) void readPeople(mode);
    try {
      await read(mode);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "The draw could not be read.");
    } finally {
      setRefreshing(false);
    }
  }, [mode, read, peopleOpen, readPeople]);

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
      if (got) setNotice(`${got.seat ? placeWords({ n: got.seat, round: got.round }) : "Drawn"}: ${got.name}, ${got.tripId}.`);
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
            <p className="text-[13px] text-[#86868b]">
              Free China Trip · the draw&rsquo;s {DRAW_SEATS} seats, then a waiting list, drawn at random · {DRAW_POOL_RULE.toLowerCase()}
            </p>
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
            ["The draw", `${winners} of ${DRAW_SEATS}`],
            ["Waiting list", String(waitingHeld)],
            ["Can't take part", String(released.length)],
          ].map(([label, n]) => (
            <div key={label} className="min-w-0 bg-white px-4 py-3">
              <dt className="truncate text-[12px] text-[#6e6e73]">{label}</dt>
              <dd className="mt-0.5 flex flex-wrap items-baseline gap-x-3 text-[22px] font-semibold tabular-nums tracking-tight">
                {n}
                {label === "In the draw" && board.poolSize > 0 && (
                  <button type="button" onClick={showPeople} className="cursor-pointer text-[12.5px] font-medium tracking-normal text-[#0058b0] hover:underline">
                    See everyone
                  </button>
                )}
              </dd>
            </div>
          ))}
        </dl>

        <section className={`mb-5 overflow-hidden ${card}`}>
          <div className="flex flex-wrap items-center gap-3 border-b border-black/[0.06] px-5 py-2.5">
            <h2 className="text-[15px] font-semibold">{roundTitle(round)}</h2>
            {full && !startedHere ? (
              <button type="button" onClick={() => setStarted((st) => ({ ...st, [mode]: board.round + 1 }))} className={`${darkButton} ml-auto h-8 text-[12.5px]`}>
                <Ticket size={14} /> {nextRoundWords(board.round)}
              </button>
            ) : (
              <button
                type="button"
                onClick={() => (mode === "live" ? setAsk({ kind: "draw" }) : void draw())}
                disabled={busy || !board.ready || board.poolSize === 0 || (mode === "live" && board.applicationsOpen)}
                className={`${darkButton} ml-auto h-8 text-[12.5px]`}
              >
                {busy ? <Loader2 size={14} className="animate-spin" /> : <Ticket size={14} />} Draw {nextWords}
              </button>
            )}
          </div>
          <ol className="divide-y divide-black/[0.06]">
            {seats.map((c, i) => (
              <li key={i} className="flex flex-wrap items-start gap-x-4 gap-y-2 px-5 py-3.5">
                <span className="w-16 shrink-0 pt-0.5 text-[12px] font-semibold uppercase tracking-[0.12em] text-[#86868b]">{seatName(round, i + 1)}</span>
                {c ? <Person c={c} onOpen={openPerson} /> : <p className="flex-1 pt-0.5 text-[13.5px] text-[#86868b]">Open: the next draw takes it.</p>}
                {c && (
                  <button type="button" onClick={() => setAsk({ kind: "release", card: c })} disabled={busy} className={`${pillButton} bg-white hover:bg-black/[0.02]`}>
                    <UserX size={14} /> Can&rsquo;t take part
                  </button>
                )}
              </li>
            ))}
          </ol>
        </section>

        {past.map((r) => (
          <section key={r.n} className={`mb-5 overflow-hidden ${card}`}>
            <h2 className="border-b border-black/[0.06] px-5 py-2.5 text-[15px] font-semibold">{roundTitle(r.n)}</h2>
            <ol className="divide-y divide-black/[0.06]">
              {r.ids.map((id, i) => {
                const c = id ? byId.get(id) ?? null : null;
                return (
                  <li key={i} className="flex flex-wrap items-start gap-x-4 gap-y-2 px-5 py-3">
                    <span className="w-16 shrink-0 pt-0.5 text-[12px] font-semibold uppercase tracking-[0.12em] text-[#86868b]">{seatName(r.n, i + 1)}</span>
                    {c ? (
                      <Person c={c} onOpen={openPerson} />
                    ) : (
                      <p className="flex-1 pt-0.5 text-[13.5px] text-[#86868b]">
                        Open: its holder can&rsquo;t take part.
                        {!inWaitingList(r.n) && nextOnList && (
                          <>
                            {" "}
                            Next on the waiting list: No. {nextOnList.no},{" "}
                            <button type="button" onClick={() => openPerson(nextOnList.c)} className="cursor-pointer font-medium text-[#0058b0] hover:underline">
                              {nextOnList.c.name}
                            </button>
                            .
                          </>
                        )}
                      </p>
                    )}
                    {c && (
                      <button type="button" onClick={() => setAsk({ kind: "release", card: c })} disabled={busy} className={`${pillButton} bg-white hover:bg-black/[0.02]`}>
                        <UserX size={14} /> Can&rsquo;t take part
                      </button>
                    )}
                  </li>
                );
              })}
            </ol>
          </section>
        ))}

        {released.length > 0 && (
          <section className={`mb-5 overflow-hidden ${card}`}>
            <h2 className="border-b border-black/[0.06] px-5 py-2.5 text-[15px] font-semibold">Can&rsquo;t take part</h2>
            <ul className="divide-y divide-black/[0.06]">
              {released.map((c) => (
                <li key={c.id} className="flex flex-wrap items-start gap-x-4 gap-y-2 px-5 py-3.5">
                  <span className="w-16 shrink-0 pt-0.5 text-[12px] font-semibold uppercase tracking-[0.12em] text-[#86868b]">
                    Draw {c.number}
                    <span className="mt-0.5 block text-[11px] font-medium normal-case tracking-normal">{roundName(c.round)}</span>
                  </span>
                  <div className="min-w-0 flex-1">
                    <Person c={c} onOpen={openPerson} />
                    <p className="mt-1 text-[12.5px] text-[#86868b]">
                      {c.releasedAt
                        ? `Released ${fmtWhen(c.releasedAt)} by ${c.releasedBy ?? "the team"}${c.releaseNote ? ` · “${c.releaseNote}”` : ""}`
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

        {peopleOpen && (
          <section ref={peopleRef} aria-label="Everyone in the draw" className={`mb-5 scroll-mt-6 overflow-hidden ${card}`}>
            <div className="flex flex-wrap items-center gap-x-3 gap-y-2 border-b border-black/[0.06] px-5 py-2.5">
              <h2 className="text-[15px] font-semibold">
                {mode === "live" ? "Everyone in the draw" : "Everyone in the rehearsal draw"}{" "}
                <span className="font-normal tabular-nums text-[#86868b]">{people && people.mode === mode ? count.format(everyone.length) : ""}</span>
                {peopleLoading && people && <Loader2 size={13} aria-label="Reading it again" className="ml-1.5 inline animate-spin align-[-1px] text-[#86868b]" />}
              </h2>
              <label className="relative ml-auto w-full sm:w-72">
                <span className="sr-only">Find someone in the draw</span>
                <Search size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[#86868b]" />
                <input
                  type="search"
                  value={find}
                  onChange={(e) => {
                    setFind(e.target.value);
                    setShown(PEOPLE_PAGE);
                  }}
                  placeholder="Name, Trip ID, city or mobile"
                  className="h-8 w-full rounded-full bg-black/[0.03] pl-8 pr-3 text-[13px] outline-none ring-1 ring-black/[0.06] focus:bg-white focus:ring-2 focus:ring-[#0071e3]/40"
                />
              </label>
              <button type="button" onClick={() => void exportPeople()} disabled={exportingPeople || matches.length === 0} className={`${pillButton} bg-white hover:bg-black/[0.02]`}>
                {exportingPeople ? <Loader2 size={14} className="animate-spin" /> : <Download size={14} />} Export {count.format(matches.length)}
              </button>
              <button type="button" onClick={() => setPeopleOpen(false)} aria-label="Close the list" className="flex h-8 w-8 items-center justify-center rounded-full text-[#6e6e73] hover:bg-black/[0.04]">
                <X size={15} />
              </button>
            </div>
            {peopleError ? (
              <p role="alert" className="px-5 py-4 text-[13px] font-medium text-red-700">
                {peopleError}
              </p>
            ) : !people || people.mode !== mode ? (
              <p className="flex items-center gap-2 px-5 py-4 text-[13px] text-[#86868b]">
                <Loader2 size={14} className="animate-spin" /> Reading who is in the draw…
              </p>
            ) : matches.length === 0 ? (
              <p className="px-5 py-4 text-[13px] text-[#86868b]">{needle ? `Nobody in the draw matches “${find.trim()}”.` : "Nobody is in the draw."}</p>
            ) : (
              <>
                {/* A list of people on a phone; from sm, the same rows in columns. */}
                <div className="hidden grid-cols-[7.5rem_minmax(0,1.3fr)_minmax(0,1fr)_10rem_7rem] gap-x-4 border-b border-black/[0.06] px-5 py-2 text-[11.5px] font-medium text-[#86868b] sm:grid" aria-hidden>
                  <span>Trip ID</span>
                  <span>Name</span>
                  <span>From</span>
                  <span>Mobile</span>
                  <span>Applied</span>
                </div>
                <ol className="divide-y divide-black/[0.06]">
                  {matches.slice(0, shown).map((p) => (
                    <li key={p.id} className="grid grid-cols-1 gap-x-4 gap-y-0.5 px-5 py-2.5 text-[13.5px] sm:grid-cols-[7.5rem_minmax(0,1.3fr)_minmax(0,1fr)_10rem_7rem] sm:items-baseline">
                      <span className="order-2 text-[12px] tabular-nums text-[#86868b] sm:order-none sm:text-[13px]">{p.tripId}</span>
                      <span className="order-1 min-w-0 sm:order-none">
                        <button
                          type="button"
                          onClick={() => openApplication(p.id, p.name, p.tripId, [["Lucky draw", mode === "live" ? "In the draw, not drawn yet" : "In the rehearsal draw, not drawn yet"]])}
                          className="cursor-pointer truncate text-left font-medium text-[#0058b0] hover:underline"
                        >
                          {p.name}
                        </button>
                      </span>
                      <span className="order-3 min-w-0 truncate text-[#6e6e73] sm:order-none">
                        {p.city}
                        {p.city && p.country ? ", " : ""}
                        {p.country}
                      </span>
                      <a href={telOf(p.phone)} className="order-4 tabular-nums text-[#1d1d1f] hover:underline sm:order-none">
                        {p.phone}
                      </a>
                      <span className="order-5 text-[12px] text-[#86868b] sm:order-none sm:text-[13px]">{fmtDay(p.appliedAt)}</span>
                    </li>
                  ))}
                </ol>
                {matches.length > shown && (
                  <div className="border-t border-black/[0.06] px-5 py-3">
                    <button type="button" onClick={() => setShown((s) => s + PEOPLE_PAGE)} className={`${pillButton} bg-white hover:bg-black/[0.02]`}>
                      Show {count.format(Math.min(PEOPLE_PAGE, matches.length - shown))} more
                    </button>
                    <span className="ml-3 text-[12.5px] text-[#86868b]">
                      {count.format(shown)} of {count.format(matches.length)} shown
                    </span>
                  </div>
                )}
              </>
            )}
          </section>
        )}
      </div>

      {ask?.kind === "draw" && (
        <Window
          title={`Draw ${nextWords} now?`}
          lines={["This is the live draw: whoever is drawn is recorded as a result."]}
          busy={busy}
          confirm="Draw"
          onCancel={() => setAsk(null)}
          onConfirm={() => void draw()}
        />
      )}
      {ask?.kind === "release" && (
        <ReleaseWindow c={ask.card} board={board} nextOnList={nextOnList} busy={busy} onCancel={() => setAsk(null)} onConfirm={(note) => void change(ask.card, "release", note)} />
      )}
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

      {opened &&
        (application && application.id === opened.id ? (
          <ApplicationPanel a={application} lead={opened.lead} onClose={() => setOpened(null)} />
        ) : (
          <ApplicationWaiting name={opened.name} tripId={opened.tripId} failed={applicationFailed} onClose={() => setOpened(null)} />
        ))}
    </div>
  );
}

/** A round's heading: "The draw", or "Waiting list · No. 6 to 10". */
function roundTitle(round: number): string {
  return inWaitingList(round) ? `Waiting list · No. ${waitingNo(round, 1)} to ${waitingNo(round, DRAW_SEATS)}` : "The draw";
}

/** The first on the waiting list still holding their place, in number order, or null when there is none yet. */
function firstOnList(board: Board, byId: Map<string, DrawCardFull>): { no: number; c: DrawCardFull } | null {
  for (let r = 1; r < board.rounds.length; r++)
    for (let i = 0; i < board.rounds[r].length; i++) {
      const id = board.rounds[r][i];
      const c = id ? byId.get(id) : undefined;
      if (c) return { no: waitingNo(r + 1, i + 1), c };
    }
  return null;
}

/** The draw's own lines at the top of their panel: where they sit, when and by whom they were drawn, any release. */
function drawRows(c: DrawCardFull, mode: DrawMode): Array<[string, React.ReactNode]> {
  const rows: Array<[string, React.ReactNode]> = [
    ["Lucky draw", `${c.seat ? (inWaitingList(c.round) ? placeWords({ n: c.seat, round: c.round }) : `The draw · Seat ${c.seat}`) : roundName(c.round)}${mode === "rehearsal" ? " · rehearsal, doesn't count" : ""}`],
    ["Drawn", `${fmtWhen(c.drawnAt)} by ${c.drawnBy} · draw ${c.number}`],
  ];
  if (c.out) {
    rows.push([
      "Can't take part",
      c.releasedAt ? `Released ${fmtWhen(c.releasedAt)} by ${c.releasedBy ?? "the team"}${c.releaseNote ? ` · “${c.releaseNote}”` : ""}` : `Taken out: marked ${c.status} in Participants`,
    ]);
  }
  return rows;
}

/**
 * Who was drawn: their name and Trip ID, how to call them, where from, and how they were drawn. The name opens their
 * whole application on the right, as a name does in Employee tasks.
 */
function Person({ c, onOpen }: { c: DrawCardFull; onOpen: (c: DrawCardFull) => void }) {
  return (
    <div className="min-w-0 flex-1">
      <p className="flex flex-wrap items-baseline gap-x-2.5 gap-y-0.5">
        <button
          type="button"
          onClick={() => onOpen(c)}
          aria-label={`Open ${c.name}'s application`}
          className="cursor-pointer rounded text-left text-[15px] font-semibold text-[#0058b0] hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0071e3]/40"
        >
          {c.name}
        </button>
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

/**
 * Before someone is released: who, where their seat goes, and why (optional, kept with the release). A seat in the
 * current round is drawn again first; one in the draw, once the waiting list has begun, is left open for the next on
 * the waiting list (Terms clause 4), named here.
 */
function ReleaseWindow({
  c,
  board,
  nextOnList,
  busy,
  onCancel,
  onConfirm,
}: {
  c: DrawCardFull;
  board: Board;
  nextOnList: { no: number; c: DrawCardFull } | null;
  busy: boolean;
  onCancel: () => void;
  onConfirm: (note: string) => void;
}) {
  const [note, setNote] = useState("");
  const seat = board.seats.indexOf(c.id);
  const next = nextOnList && nextOnList.c.id !== c.id ? nextOnList : null;
  const np = nextPlace(board);
  const then = inWaitingList(np.round) ? ` The next draw is waiting list No. ${waitingNo(np.round, np.n)}.` : "";
  const where =
    seat >= 0
      ? `${seatName(board.round, seat + 1)} opens: the next draw takes it, before any other.`
      : c.seat
        ? inWaitingList(c.round)
          ? `Their place, waiting list No. ${waitingNo(c.round, c.seat)}, is left open.${then}`
          : `Their seat ${c.seat} in the draw is left open${next ? `: offer it to the next on the waiting list, No. ${next.no}, ${next.c.name}` : ""}.${then}`
        : "This marks that they can't take part.";
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
