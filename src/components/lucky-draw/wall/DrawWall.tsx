"use client";

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { Maximize2, Minimize2 } from "lucide-react";
import {
  DRAW_SEATS,
  nextPlace,
  roundFull,
  seatWords,
  type DrawBoard,
  type DrawCardPublic,
  type DrawMode,
  type DrawPool,
  type DrawPoolEntry,
} from "@/lib/lucky-draw-shared";
import { wallOf } from "./drum";
import { fromOf, type Fonts } from "./faces";
import { WallStage } from "./stage";
import "./wall.css";

/**
 * The Free China Trip's lucky draw on the television, as a wall (the owner, 2026-11-11: "look at these images, how
 * they do the lucky draw ... animated, innovative ... like opening a gift box"; the first screen, the list, is kept as
 * tag backup/lucky-draw-v1 and stays as this page's fallback, ../DrawScreen.tsx).
 *
 * The screen is a wall of names, every row in Trip ID order and rolling slowly, the first clear row opening with
 * TRIP-26-00001 (./stage.ts, ./grid.ts; the owner, 2026-11-11: "filled completely ... one box of light, moving
 * everywhere, for real, not like magic ... a genuine random draw"). One press of Draw (the button, or Space, Enter,
 * Page Down or → from a presenter's clicker): one box of light runs over the names, a box at a time in every
 * direction, quick and then ever slower, while the rows roll on by a screen; its last step lands on the person the
 * server drew. Their box becomes a gift, the gift opens, and their boarding pass rises out of it and holds the screen
 * for three seconds before going down into their seat. A draw made from the console shows here the same way.
 *
 * Everything else is the list screen's, unchanged: the server chooses (lib/server/lucky-draw.ts), the screen only shows
 * the choice; each press carries its own id, so one whose answer is lost is asked again and answered with the same
 * person; the screen runs on its own pass (lib/draw-screen-token.ts); the seats fill only as the pass reaches them; the
 * screen stays awake and the pointer hides. If this browser can't draw the wall (no WebGL, or too slowly), or loses it,
 * `onFail` and the page shows the list instead. No mobile number ever reaches this page.
 */

type Board = DrawBoard<DrawCardPublic>;

const API = "/api/admin/lucky-draw";
const POLL_MS = 2000;
const ANSWER_MS = 15_000;
/** The pass in front of the room before the screen moves on, when the wall can't show it (no stage). */
const CARD_MS = 3000;
const POOL_EVERY_MS = 20_000;
const PASS_EVERY_MS = 30 * 60_000;
/** The keys that draw: a presenter's clicker sends Page Down or →; a keyboard, Space or Enter. */
const DRAW_KEYS = new Set([" ", "Enter", "PageDown", "ArrowRight"]);
const SEAT_KEYS = Array.from({ length: DRAW_SEATS }, (_, k) => k);

const sleep = (ms: number) => new Promise<void>((resolve) => window.setTimeout(resolve, ms));
const count = new Intl.NumberFormat("en-IN");
const TODAY = new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Kolkata", day: "numeric", month: "long", year: "numeric" });
const AT = new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Kolkata", hour: "2-digit", minute: "2-digit", hourCycle: "h23" });

function pressId(): string {
  if (typeof crypto.randomUUID === "function") return crypto.randomUUID();
  const b = crypto.getRandomValues(new Uint8Array(16));
  b[6] = (b[6] & 0x0f) | 0x40;
  b[8] = (b[8] & 0x3f) | 0x80;
  const h = Array.from(b, (x) => x.toString(16).padStart(2, "0")).join("");
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

function placeWords(c: DrawCardPublic): string {
  return c.seat ? seatWords({ n: c.seat, round: c.round }) : "";
}

function nextWords(board: Board, started: boolean): string {
  const p = started ? { n: 1, round: board.round + 1 } : nextPlace(board);
  return `Round ${p.round} · Drawing seat ${p.n}`;
}

function restWords(board: Board, started: boolean): string {
  if (started) return `Round ${board.round + 1} · Seat 1 next`;
  if (roundFull(board)) return `Round ${board.round} complete`;
  return `Round ${board.round} · Seat ${nextPlace(board).n} next`;
}

/** A seat's name sizes, in hundredths of the screen's width: the largest that fits is used (fitName). */
const NAME_SIZES = [1.7, 1.45, 1.22, 1.05];

/**
 * A seat's name set at the largest of NAME_SIZES at which it fits in two lines at most without breaking a word,
 * measured in the page itself (a guess from its letters clipped "Mohomed Hakeem", 2026-11-11). Most names fit at the
 * largest, so the seats read alike; the size is in the screen's own units, so it holds on any screen.
 */
function fitName(el: HTMLElement) {
  el.style.setProperty("--name-clamp", "none");
  let chosen = NAME_SIZES[NAME_SIZES.length - 1];
  for (const size of NAME_SIZES) {
    el.style.setProperty("--name-size", String(size));
    const line = parseFloat(getComputedStyle(el).lineHeight) || 1;
    if (Math.round(el.scrollHeight / line) <= 2 && el.scrollWidth <= el.clientWidth + 1) {
      chosen = size;
      break;
    }
  }
  el.style.setProperty("--name-size", String(chosen));
  el.style.removeProperty("--name-clamp");
}

/** A winner's name in their seat, fitted (fitName) as it appears and again once the trip's Bodoni has loaded. */
function SeatName({ name }: { name: string }) {
  const ref = useRef<HTMLParagraphElement>(null);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    fitName(el);
    let live = true;
    void document.fonts.ready.then(() => {
      if (live) fitName(el);
    });
    return () => {
      live = false;
    };
  }, [name]);
  return (
    <p ref={ref} className="lw-seat-name">
      {name}
    </p>
  );
}

type Fetched = Board | "no_pass" | null;
type Phase = "rest" | "drawing" | "drawn";

export function DrawWall({ mode, closes, onFail, keep = false }: { mode: DrawMode | null; closes: string; onFail?: (why: string) => void; keep?: boolean }) {
  const [access, setAccess] = useState<"checking" | "ok" | "none">("checking");
  const [shown, setShown] = useState<Board | null>(null);
  const [phase, setPhase] = useState<Phase>("rest");
  const [card, setCard] = useState<DrawCardPublic | null>(null);
  const [label, setLabel] = useState("");
  const [listed, setListed] = useState<number | null>(null);
  const [started, setStarted] = useState<number | null>(null);
  const startedNow = useRef<number | null>(null);
  useEffect(() => {
    startedNow.current = started;
  }, [started]);
  const [say, setSay] = useState<{ text: string; trouble: boolean } | null>(null);
  const [offline, setOffline] = useState(false);
  const [passEnded, setPassEnded] = useState(false);
  const [full, setFull] = useState(false);
  const [quietPointer, setQuietPointer] = useState(false);
  const [drawing, setDrawing] = useState(false);
  const [heard, setHeard] = useState("");
  const [today, setToday] = useState("");
  /** The wall has opened: its names in and face up. Draw waits for it (it shows its gold backs until then). */
  const [ready, setReady] = useState(false);
  const wallUp = useRef(false);
  const [frameId, setFrameId] = useState<string | null>(null);
  /** The seat a pass has just come down into: it lights as it fills. */
  const [landed, setLanded] = useState<string | null>(null);

  const rootRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const liftRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<HTMLDivElement>(null);
  const stageRef = useRef<WallStage | null>(null);
  const seatEls = useRef<(HTMLLIElement | null)[]>([]);
  const seatRefs = useMemo(
    () =>
      SEAT_KEYS.map((k) => (el: HTMLLIElement | null) => {
        seatEls.current[k] = el;
      }),
    [],
  );
  /** Everyone who can be drawn, as last read. */
  const poolRef = useRef<DrawPoolEntry[] | null>(null);
  const placedRef = useRef(false);
  const latest = useRef<Board | null>(null);
  const busy = useRef(false);
  const pending = useRef<string | null>(null);
  const seen = useRef(0);
  const live = useRef(true);
  const poolBusy = useRef(false);
  const poolAt = useRef(0);
  const passAt = useRef(0);
  const shownNow = useRef<Board | null>(null);
  const showing = useRef<{ label: string; phase: Phase; card: DrawCardPublic | null }>({ label: "", phase: "rest", card: null });
  const failRef = useRef(onFail);
  useEffect(() => {
    failRef.current = onFail;
  }, [onFail]);
  useEffect(() => {
    shownNow.current = shown;
  }, [shown]);
  useEffect(() => {
    showing.current = { label, phase, card };
  }, [label, phase, card]);

  useEffect(() => {
    live.current = true;
    setToday(TODAY.format(new Date()));
    return () => {
      live.current = false;
    };
  }, []);

  /** The wall's people from the pool and the board's winners (gold); put in between draws. */
  const syncWall = useCallback((board: Board | null) => {
    const stage = stageRef.current;
    const pool = poolRef.current;
    if (!stage || !pool || !board) return;
    const w = wallOf(pool, board.cards);
    stage.setRows(w.entries, w.gold);
  }, []);

  /** Once the stage, the pool and the board are all here: the wall's people put in, behind its gold backs. */
  const placeFirst = useCallback(() => {
    const stage = stageRef.current;
    const board = shownNow.current ?? latest.current;
    if (placedRef.current || !stage || !poolRef.current || !board) return;
    placedRef.current = true;
    syncWall(board);
  }, [syncWall]);

  const fetchBoard = useCallback(async (): Promise<Fetched> => {
    if (!mode) return "no_pass";
    const stop = new AbortController();
    const timer = window.setTimeout(() => stop.abort(), 10_000);
    try {
      const res = await fetch(`${API}/board/?mode=${mode}&view=screen`, { cache: "no-store", signal: stop.signal });
      if (res.status === 401) return "no_pass";
      if (!res.ok) return null;
      return (await res.json()) as Board;
    } catch {
      return null;
    } finally {
      window.clearTimeout(timer);
    }
  }, [mode]);

  const fetchPool = useCallback(async (): Promise<boolean> => {
    if (!mode || poolBusy.current) return false;
    poolBusy.current = true;
    const stop = new AbortController();
    // Long enough for a slow link to finish (a localhost reads the database across the world): a read given up on
    // only starts another beside the one still coming, and both come slower.
    const timer = window.setTimeout(() => stop.abort(), 60_000);
    try {
      const res = await fetch(`${API}/pool/?mode=${mode}`, { cache: "no-store", signal: stop.signal });
      if (!res.ok) return false;
      const pool = (await res.json()) as DrawPool;
      if (!Array.isArray(pool.entries)) return false;
      poolRef.current = pool.entries;
      poolAt.current = Date.now();
      setListed(pool.entries.length);
      if (placedRef.current) syncWall(shownNow.current ?? latest.current);
      else placeFirst();
      return true;
    } catch {
      return false;
    } finally {
      window.clearTimeout(timer);
      poolBusy.current = false;
    }
  }, [mode, placeFirst, syncWall]);

  /**
   * Someone drawn leaves the list here, as they leave it on the server (the wall keeps them, gold, from the board),
   * rather than the whole list being read again after every draw: about half a megabyte, seconds on a slow link, and
   * a localhost's every read crosses the world. A list that changed otherwise (an application marked spam) no longer
   * matches the board's count, and is read again then (absorb).
   */
  const dropFromPool = useCallback((tripId: string) => {
    const pool = poolRef.current;
    if (!pool) return;
    const next = pool.filter((e) => e[0] !== tripId);
    if (next.length === pool.length) return;
    poolRef.current = next;
    setListed(next.length);
  }, []);

  const openPass = useCallback(async (): Promise<boolean> => {
    if (!mode) return false;
    try {
      const res = await fetch(`${API}/screen/`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ mode }), cache: "no-store" });
      if (res.ok) passAt.current = Date.now();
      return res.ok;
    } catch {
      return false;
    }
  }, [mode]);

  const isStarted = useCallback((board: Board | null) => !!board && startedNow.current === board.round + 1 && roundFull(board), []);

  /** Between draws: the words for the next press, the light out, and the wall back on its gold backs. */
  const rest = useCallback(
    (board: Board) => {
      setCard(null);
      setPhase("rest");
      setLabel(restWords(board, isStarted(board)));
      syncWall(board);
      if (placedRef.current) stageRef.current?.restAfter();
    },
    [isStarted, syncWall],
  );

  /** The person drawn shown: the light lands on them, their gift opens, their pass goes down into their seat. */
  const reveal = useCallback(
    async (c: DrawCardPublic, board: Board, running: Promise<boolean> | null) => {
      const words = placeWords(c);
      const stage = stageRef.current;
      if (running && stage) {
        stage.land(stage.ensure([c.tripId, c.name, c.city, c.country]));
        // Their gift and pass made while the names slow, so the stop itself is never held up.
        stage.prepare(c);
        await running;
      } else stage?.restOn(c.tripId);
      if (!live.current) return;
      setCard(c);
      setLabel(words);
      setPhase("drawn");
      const filled = () => {
        setShown(board);
        setLanded(c.id);
        setHeard(`${words}: ${c.name}, ${fromOf(c.city, c.country)}. Trip ID ${c.tripId}.`);
      };
      if (stage) {
        await stage.present(c, { seat: () => (c.seat ? seatEls.current[c.seat - 1]?.getBoundingClientRect() ?? null : null), onSeat: filled });
      } else {
        filled();
        await sleep(CARD_MS);
      }
      if (!live.current) return;
      dropFromPool(c.tripId);
      setStarted(null);
      startedNow.current = null;
      rest(board);
    },
    [dropFromPool, rest],
  );

  const startRunning = useCallback((words: string): Promise<boolean> | null => {
    setSay(null);
    setLabel(words);
    setPhase("drawing");
    const stage = stageRef.current;
    return stage && stage.size > 1 ? stage.spin() : null;
  }, []);

  /** A board read from the server, while no draw is being shown: a draw made elsewhere is shown as if made here. */
  const absorb = useCallback(
    async (next: Board) => {
      latest.current = next;
      const newest = next.cards.at(-1);
      if (newest && newest.number > seen.current && !newest.out && next.latest === newest.id) {
        seen.current = newest.number;
        busy.current = true;
        setDrawing(true);
        const before = shownNow.current;
        const running = startRunning(before ? nextWords(before, isStarted(before)) : "Drawing");
        await reveal(newest, next, running);
        busy.current = false;
        setDrawing(false);
        return;
      }
      seen.current = Math.max(seen.current, newest?.number ?? 0);
      setShown(next);
      if (showing.current.phase === "rest") {
        setLabel(restWords(next, isStarted(next)));
        // A release or a restore: the wall's winners change.
        syncWall(next);
      }
      if (next.poolSize !== (poolRef.current?.length ?? -1) && Date.now() - poolAt.current > POOL_EVERY_MS) void fetchPool();
    },
    [fetchPool, isStarted, reveal, startRunning, syncWall],
  );

  // In: the pass, then the board (asked again until it answers) and everyone in the draw, asked for together.
  useEffect(() => {
    if (!mode) {
      setAccess("none");
      return;
    }
    let stopped = false;
    void (async () => {
      for (let attempt = 0; !stopped; attempt++) {
        await openPass();
        // The names asked for beside the board, never after it: the wall shows its gold backs until they are in.
        const names = fetchPool();
        const board = await fetchBoard();
        if (stopped) return;
        if (board === "no_pass") {
          setAccess("none");
          return;
        }
        if (board) {
          latest.current = board;
          shownNow.current = board;
          seen.current = board.cards.at(-1)?.number ?? 0;
          setShown(board);
          rest(board);
          setAccess("ok");
          if (await names) return;
          // Asked again until it comes, unless a read already in flight brings it (React runs this twice in
          // development: the second run's read was refused while the first's was still coming).
          for (let tries = 0; !stopped && !poolRef.current && !(await fetchPool()); tries++) await sleep(Math.min(10_000, 2000 * (tries + 1)));
          return;
        }
        await names;
        await sleep(Math.min(10_000, 2000 * (attempt + 1)));
      }
    })();
    return () => {
      stopped = true;
    };
  }, [mode, fetchBoard, fetchPool, openPass, rest]);

  // The wall itself, once the page is in and its fonts are loaded (the faces are drawn in them).
  useEffect(() => {
    if (access !== "ok") return;
    const root = rootRef.current;
    const canvas = canvasRef.current;
    const lift = liftRef.current;
    const view = viewRef.current;
    if (!root || !canvas || !lift || !view) return;
    let stopped = false;
    let stage: WallStage | null = null;
    const lost = (e: Event) => {
      e.preventDefault();
      failRef.current?.("lost");
    };
    canvas.addEventListener("webglcontextlost", lost);
    void (async () => {
      const css = getComputedStyle(root);
      const fonts: Fonts = {
        sans: css.getPropertyValue("--font-ld-sans").trim() || "system-ui, sans-serif",
        display: css.getPropertyValue("--font-cx-display").trim() || "Georgia, serif",
      };
      const faces = [400, 500, 600, 700, 800].map((w) => `${w} 24px ${fonts.sans}`).concat(`600 48px ${fonts.display}`);
      await Promise.race([Promise.all(faces.map((f) => document.fonts.load(f).catch(() => []))), sleep(4000)]);
      if (stopped) return;
      try {
        stage = new WallStage(canvas, {
          fonts,
          lift,
          view,
          // The golden envelope; ?reveal=board and ?reveal=gift show the departures board and the gift box, to compare.
          reveal: ((v) => (v === "board" || v === "gift" ? v : "envelope"))(new URLSearchParams(window.location.search).get("reveal")),
          seats: DRAW_SEATS,
          onRest: (id) => {
            if (live.current) setFrameId(id);
          },
          onSlow: keep ? undefined : () => failRef.current?.("slow"),
          onOpen: () => {
            if (stopped || !live.current) return;
            wallUp.current = true;
            setReady(true);
          },
        });
      } catch {
        failRef.current?.("webgl");
        return;
      }
      if (stopped) {
        stage.dispose();
        return;
      }
      stageRef.current = stage;
      placeFirst();
    })();
    return () => {
      stopped = true;
      canvas.removeEventListener("webglcontextlost", lost);
      stage?.dispose();
      stageRef.current = null;
      placedRef.current = false;
      wallUp.current = false;
      setReady(false);
    };
  }, [access, keep, placeFirst]);

  // Then every two seconds while the tab is in front: draws and releases made from the console.
  useEffect(() => {
    if (access !== "ok") return;
    let stopped = false;
    let running = false;
    let timer = 0;
    let misses = 0;
    const tick = async () => {
      if (running || stopped) return;
      running = true;
      try {
        if (document.visibilityState === "visible") {
          if (Date.now() - passAt.current > PASS_EVERY_MS) {
            passAt.current = Date.now();
            await openPass();
          }
          let next = await fetchBoard();
          if (next === "no_pass") next = (await openPass()) ? await fetchBoard() : "no_pass";
          if (stopped) return;
          if (next === "no_pass") setPassEnded(true);
          else if (next) {
            misses = 0;
            setOffline(false);
            setPassEnded(false);
            if (!busy.current) await absorb(next);
            else latest.current = next;
          } else if (++misses * POLL_MS >= 10_000) setOffline(true);
        }
      } finally {
        running = false;
        if (!stopped) {
          window.clearTimeout(timer);
          timer = window.setTimeout(tick, POLL_MS);
        }
      }
    };
    timer = window.setTimeout(tick, POLL_MS);
    const onVisible = () => {
      if (document.visibilityState === "visible") void tick();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      stopped = true;
      window.clearTimeout(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [access, fetchBoard, openPass, absorb]);

  const sendDraw = useCallback(
    async (id: string): Promise<{ ok: true; drawId: string; board: Board } | { ok: false; text: string; keep: boolean }> => {
      let passTried = false;
      for (let attempt = 0; attempt < 3; attempt++) {
        const stop = new AbortController();
        const timer = window.setTimeout(() => stop.abort(), ANSWER_MS);
        try {
          const res = await fetch(`${API}/draw/`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ mode, requestId: id, view: "screen" }),
            cache: "no-store",
            signal: stop.signal,
          });
          const j = (await res.json().catch(() => ({}))) as { drawId?: string; board?: Board; error?: string };
          if (res.ok && j.drawId && j.board) return { ok: true, drawId: j.drawId, board: j.board };
          if (res.status === 409) return { ok: false, text: j.error || "Everyone in the draw has been drawn.", keep: false };
          if (res.status === 401 && !passTried) {
            passTried = true;
            if (await openPass()) {
              attempt--;
              continue;
            }
          }
          if (res.status === 401) return { ok: false, text: "This screen's pass has ended. Open it again from the console.", keep: false };
          if (res.status < 500) return { ok: false, text: j.error || "The draw could not be made.", keep: false };
        } catch {
          /* lost, or no answer in time: asked again with the same press */
        } finally {
          window.clearTimeout(timer);
        }
        await sleep(900 * (attempt + 1));
      }
      return { ok: false, text: "The draw didn't reach the server. Press Draw again.", keep: true };
    },
    [mode, openPass],
  );

  const startRound = useCallback((board: Board) => {
    setStarted(board.round + 1);
    startedNow.current = board.round + 1;
    setSay(null);
    setCard(null);
    setPhase("rest");
    setLabel(restWords(board, true));
  }, []);

  const press = useCallback(async () => {
    const board = latest.current ?? shownNow.current;
    if (busy.current || access !== "ok" || !wallUp.current || !board || !board.ready || (mode === "live" && board.applicationsOpen)) return;
    if (board.poolSize === 0) {
      setSay({ text: "Everyone in the draw has been drawn.", trouble: false });
      return;
    }
    if (roundFull(board) && !isStarted(board)) {
      startRound(board);
      return;
    }
    busy.current = true;
    setDrawing(true);
    const before = showing.current;
    const running = startRunning(nextWords(board, isStarted(board)));
    const id = pending.current ?? pressId();
    pending.current = id;
    const answer = await sendDraw(id);
    if (!live.current) return;
    if (!answer.ok) {
      if (!answer.keep) pending.current = null;
      if (running) {
        stageRef.current?.halt();
        await running;
      }
      setCard(before.card);
      setLabel(before.label);
      setPhase(before.phase === "drawing" ? "rest" : before.phase);
      setSay({ text: answer.text, trouble: true });
      busy.current = false;
      setDrawing(false);
      return;
    }
    pending.current = null;
    latest.current = answer.board;
    const c = answer.board.cards.find((x) => x.id === answer.drawId);
    if (c) {
      seen.current = Math.max(seen.current, c.number);
      await reveal(c, answer.board, running);
    } else {
      if (running) {
        stageRef.current?.halt();
        await running;
      }
      setShown(answer.board);
      rest(answer.board);
    }
    busy.current = false;
    setDrawing(false);
  }, [access, isStarted, mode, rest, reveal, sendDraw, startRound, startRunning]);

  // The keys that draw; F for full screen.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.repeat || e.altKey || e.ctrlKey || e.metaKey) return;
      if (DRAW_KEYS.has(e.key)) {
        e.preventDefault();
        void press();
      } else if (e.key === "f" || e.key === "F") {
        e.preventDefault();
        void toggleFull();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [press]);

  useEffect(() => {
    const onChange = () => setFull(!!document.fullscreenElement);
    document.addEventListener("fullscreenchange", onChange);
    return () => document.removeEventListener("fullscreenchange", onChange);
  }, []);

  // The screen kept awake while this page is in front (taken again when it comes back).
  useEffect(() => {
    let lock: WakeLockSentinel | null = null;
    const take = async () => {
      try {
        if (document.visibilityState === "visible" && "wakeLock" in navigator) lock = await navigator.wakeLock.request("screen");
      } catch {
        /* not allowed here: the screen's own settings decide */
      }
    };
    void take();
    const onVisible = () => {
      if (document.visibilityState === "visible") void take();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      document.removeEventListener("visibilitychange", onVisible);
      void lock?.release().catch(() => {});
    };
  }, []);

  // The pointer hides when it has not moved for a moment, and comes back when it does.
  useEffect(() => {
    let t = 0;
    const moved = () => {
      setQuietPointer(false);
      window.clearTimeout(t);
      t = window.setTimeout(() => setQuietPointer(true), 2500);
    };
    moved();
    window.addEventListener("pointermove", moved);
    return () => {
      window.clearTimeout(t);
      window.removeEventListener("pointermove", moved);
    };
  }, []);

  const board = shown;
  const startedHere = !!board && started === board.round + 1 && roundFull(board);
  const openSeats = Array.from({ length: DRAW_SEATS }, (): string | null => null);
  const seats = startedHere ? openSeats : board?.seats ?? openSeats;
  const round = (board?.round ?? 1) + (startedHere ? 1 : 0);
  const nextRound = !!board && roundFull(board) && !startedHere;
  const byId = new Map((board?.cards ?? []).map((c) => [c.id, c]));
  const notReady = !!board && !board.ready;
  const empty = !!board && board.ready && board.poolSize === 0;
  const early = mode === "live" && !!board?.applicationsOpen;
  const inDraw = listed ?? board?.poolSize ?? null;
  const note: { text: string; trouble?: boolean } =
    say ??
    (notReady
      ? { text: "The draw isn't set up on this database yet." }
      : early
        ? { text: `The live draw opens when applications close on ${closes}. Rehearse until then.` }
        : passEnded
          ? { text: "This screen's pass has ended. Open it again from the console.", trouble: true }
          : empty
            ? { text: "Everyone in the draw has been drawn." }
            : card && phase === "drawn"
              ? { text: `Drawn at random from ${count.format(card.poolSize)} applicants · ${AT.format(new Date(card.drawnAt))}` }
              : { text: inDraw !== null ? `${count.format(inDraw)} applicants in the draw` : "" });

  if (access === "none") {
    return (
      <div className="lw">
        <div className="lw-door">
          <div>
            <h1>The draw&rsquo;s screen opens from the console</h1>
            <p>Free China Trip → Lucky draw → Open the TV screen</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div
      ref={rootRef}
      className={`lw${quietPointer ? " lw-hide-cursor" : ""}`}
      data-engine="wall"
      data-phase={phase}
      data-frame={frameId ?? undefined}
      data-ready={ready || undefined}
    >
      <canvas ref={canvasRef} className="lw-canvas" aria-hidden />
      <div className="lw-frame">
        <div ref={viewRef} className="lw-view" aria-hidden />
        <header className="lw-band">
          <div className="lw-band-mark">
            <b>AFFHAN</b>
            <span>Free China Business Trip</span>
          </div>
          <div className="lw-band-right">
            {mode === "rehearsal" && <span className="lw-rehearsal">Rehearsal: these draws don&rsquo;t count</span>}
            <span>Lucky draw{today ? ` · ${today}` : ""}</span>
            <button type="button" tabIndex={-1} className="lw-full" onClick={() => void toggleFull()} aria-label={full ? "Leave full screen" : "Full screen"}>
              {full ? <Minimize2 aria-hidden /> : <Maximize2 aria-hidden />}
            </button>
          </div>
        </header>

        <p className="lw-eyebrow">{label}</p>

        <p className="lw-note" data-trouble={note.trouble || undefined} role="status">
          {note.text}
        </p>

        <footer className="lw-foot">
          <div className="lw-act">
            <button
              type="button"
              className="lw-draw"
              data-next={(nextRound && !drawing) || undefined}
              onClick={() => void press()}
              disabled={drawing || access !== "ok" || !ready || notReady || empty || early}
            >
              {drawing ? "Drawing…" : nextRound ? `Start round ${round + 1}` : "Draw"}
            </button>
          </div>
          <p className="lw-round">Round {round}</p>
          <ol className="lw-seats" aria-label={`Round ${round}: the five seats`}>
            {seats.map((id, i) => {
              const c = id ? byId.get(id) : null;
              return (
                <li key={i} ref={seatRefs[i]} className="lw-seat" data-filled={c ? "" : undefined} data-landed={c && c.id === landed ? "" : undefined}>
                  <p className="lw-seat-n">Seat {i + 1}</p>
                  {c ? (
                    <>
                      <SeatName name={c.name} />
                      <p className="lw-seat-meta">{fromOf(c.city, c.country)}</p>
                      <p className="lw-seat-id">{c.tripId}</p>
                    </>
                  ) : (
                    <>
                      <p className="lw-seat-name" data-open>
                        To be drawn
                      </p>
                      <p className="lw-seat-meta">&nbsp;</p>
                      <p className="lw-seat-id" />
                    </>
                  )}
                </li>
              );
            })}
          </ol>
        </footer>
      </div>
      <div ref={liftRef} className="lw-lifts" aria-hidden />
      {offline && <p className="lw-line">Reconnecting…</p>}
      <p className="sr-only" aria-live="assertive">
        {heard}
      </p>
    </div>
  );
}

/** Full screen on and off: the whole page, the browser's own way out (Escape) included. */
async function toggleFull() {
  try {
    if (document.fullscreenElement) await document.exitFullscreen();
    else await document.documentElement.requestFullscreen();
  } catch {
    /* refused (an embedded frame, or a browser without it): F11 still works */
  }
}
