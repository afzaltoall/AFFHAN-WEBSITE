"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Maximize2, Minimize2 } from "lucide-react";
import {
  DRAW_SEATS,
  compareTripIds,
  placeOf,
  type DrawBoard,
  type DrawCardPublic,
  type DrawMode,
  type DrawPool,
  type DrawPoolEntry,
} from "@/lib/lucky-draw-shared";
import { endOf, halt, mod, plan, reelAt, type Run } from "./reel";
import "./draw-screen.css";

/**
 * The Free China Trip's lucky draw, for the television (the owner, 2026-11-10: "we will put the page on the TV ... it
 * must not get stuck"; "make it transparent, genuine: everyone who applied, their names in a line, a list; it scrolls,
 * an arrow at the side, wherever it stops, that one we take"; "like a Ballon d'Or event, perfect").
 *
 * Everyone in the draw is on the screen as a list in Trip ID order (Trip ID, name, city), under a gold arrow. One press
 * of Draw (the button, or Space, Enter, Page Down or → from a presenter's clicker) and the list runs: it gathers pace,
 * sweeps past the names, and slows until the last few pass slowly enough for the room to read, stopping with the person
 * drawn under the arrow. Their row lights, and a moment later their name comes forward, large, with where they are
 * from and their Trip ID; then their seat at the foot fills. Then nothing moves until the next press. A draw made from
 * the console shows here the same way, within two seconds.
 *
 * The server chooses (lib/server/lucky-draw.ts: crypto.randomInt over everyone in the draw, recorded with a fingerprint
 * of who they were); the list only shows the choice, landing on it (./reel.ts). Built not to stick: each press carries
 * its own id, so one whose answer is lost is asked again and answered with the same person, never a second; the list
 * runs on its own clock, so a slow frame never slows the result, and a watchdog finishes a run the browser stopped
 * drawing (a hidden tab); every row is drawn straight onto the page, never through React, at most nine of them; the
 * seats fill only once the name is shown; the screen stays awake, the pointer hides when still, and the pass it runs on
 * is its own (lib/draw-screen-token.ts), so the console's thirty-minute session never interrupts it. No mobile number
 * ever reaches this page (the board's screen view and the list carry none).
 */

type Board = DrawBoard<DrawCardPublic>;

const API = "/api/admin/lucky-draw";
/** How often the screen asks for the board (draws and releases made from the console). */
const POLL_MS = 2000;
/** How long the server has to answer a press, each time it is asked. */
const ANSWER_MS = 15_000;
/** After a name is shown, how long before Draw answers again (a clicker pressed twice draws once). */
const SETTLE_MS = 900;
/** On the row drawn, lit, before the name comes forward. */
const HOLD_MS = 1600;
/** The list read again at most this often when the count says it has changed (new applications). */
const POOL_EVERY_MS = 20_000;
/** The screen's pass renewed this often while the admin's own session lasts, so it runs 12 hours past the last one. */
const PASS_EVERY_MS = 30 * 60_000;
/** Rows in view, and the slots that carry them: one more each side, half in view while the list moves. */
const ROWS = 7;
const SLOTS = ROWS + 2;
const MID = (SLOTS - 1) / 2;
const SLOT_KEYS = Array.from({ length: SLOTS }, (_, k) => k);
/** The keys that draw: a presenter's clicker sends Page Down or →; a keyboard, Space or Enter. */
const DRAW_KEYS = new Set([" ", "Enter", "PageDown", "ArrowRight"]);

const sleep = (ms: number) => new Promise<void>((resolve) => window.setTimeout(resolve, ms));
const count = new Intl.NumberFormat("en-IN");
const TODAY = new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Kolkata", day: "numeric", month: "long", year: "numeric" });
const AT = new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Kolkata", hour: "2-digit", minute: "2-digit", hourCycle: "h23" });
const fromOf = (city: string, country: string) => [city, country].filter(Boolean).join(", ");

/** An id for one press of Draw (the server draws once per id). */
function pressId(): string {
  if (typeof crypto.randomUUID === "function") return crypto.randomUUID();
  const b = crypto.getRandomValues(new Uint8Array(16));
  b[6] = (b[6] & 0x0f) | 0x40;
  b[8] = (b[8] & 0x3f) | 0x80;
  const h = Array.from(b, (x) => x.toString(16).padStart(2, "0")).join("");
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

/** "Seat 3 of 5", "Reserve 1", or "" when it holds neither any more. */
function placeWords(board: Board, id: string): string {
  const p = placeOf(board, id);
  if (!p) return "";
  return p.kind === "seat" ? `Seat ${p.n} of ${DRAW_SEATS}` : `Reserve ${p.n}`;
}

/** What the next press draws: the first open seat, or the next reserve. */
function nextWords(board: Board): string {
  const open = board.seats.indexOf(null);
  return open >= 0 ? `Drawing seat ${open + 1}` : `Drawing reserve ${board.reserves.length + 1}`;
}

/** The name's size when it comes forward, by its length, so every name fits (draw-screen.css). */
function nameSize(name: string): "l" | "m" | "s" | "xs" {
  const n = name.length;
  return n <= 22 ? "l" : n <= 32 ? "m" : n <= 44 ? "s" : "xs";
}

/**
 * The list on the screen: nine rows drawn straight onto the page, at the position ./reel.ts gives for each moment of a
 * run, by requestAnimationFrame, on the run's own clock. React lays the rows out once and never touches what is in them.
 */
class Reel {
  private rows: DrawPoolEntry[] = [];
  /** A list read while one was running, put in when it stops. */
  private waiting: DrawPoolEntry[] | null = null;
  private readonly slots: (HTMLDivElement | null)[] = new Array(SLOTS).fill(null);
  /** The row each slot shows (-2: none yet), so a slot's words change only when its row does. */
  private readonly shows: number[] = new Array(SLOTS).fill(-2);
  private box: HTMLDivElement | null = null;
  /** Where the list rests: the row under the arrow. */
  private at = 0;
  private run: (Run & { start: number; done: (landed: boolean) => void }) | null = null;
  private raf = 0;
  private dog = 0;

  get size(): number {
    return this.rows.length;
  }

  readonly attach = (k: number, el: HTMLDivElement | null) => {
    this.slots[k] = el;
    this.shows[k] = -2;
    if (el && !this.run) this.paint(this.at);
  };

  readonly attachBox = (el: HTMLDivElement | null) => {
    this.box = el;
  };

  /** Where a Trip ID is, or would be, in the list: the first row at or after it. */
  private place(tripId: string): number {
    let lo = 0;
    let hi = this.rows.length;
    while (lo < hi) {
      const m = (lo + hi) >> 1;
      if (compareTripIds(this.rows[m][0], tripId) < 0) lo = m + 1;
      else hi = m;
    }
    return lo;
  }

  /** A new list: the row under the arrow stays there, or the one after it if it has gone (someone drawn). */
  setRows(rows: DrawPoolEntry[]) {
    if (this.run) {
      this.waiting = rows;
      return;
    }
    const here = this.rows.length ? this.rows[mod(Math.round(this.at), this.rows.length)][0] : null;
    this.rows = rows;
    this.shows.fill(-2);
    this.at = here && rows.length ? mod(this.place(here), rows.length) : 0;
    this.paint(this.at);
  }

  /** The list at rest on a Trip ID (its row, or where it would be). */
  restOn(tripId: string) {
    if (this.run || !this.rows.length) return;
    this.at = mod(this.place(tripId), this.rows.length);
    this.paint(this.at);
  }

  /**
   * Someone drawn, in the list: their row, or, if they joined after the list was read, a row put in for them in its
   * place, while the list sweeps too fast for a row more to be seen.
   */
  ensure(entry: DrawPoolEntry): number {
    const i = this.place(entry[0]);
    if (this.rows[i]?.[0] === entry[0]) return i;
    this.rows = [...this.rows.slice(0, i), entry, ...this.rows.slice(i)];
    this.shows.fill(-2);
    return i;
  }

  /** The list starts to run. Settles true when it stops on someone (land), false when on nobody (halt). */
  spin(): Promise<boolean> {
    this.finish();
    return new Promise((done) => {
      this.run = { p0: this.at, plan: null, halt: null, start: performance.now(), done };
      this.raf = requestAnimationFrame(this.frame);
    });
  }

  /** The person drawn is known: the rest of the run, to their row. */
  land(target: number) {
    const r = this.run;
    if (!r || r.plan || r.halt || !this.rows.length) return;
    r.plan = plan(r.p0, this.elapsed(r), target, this.rows.length);
    this.watch(r);
  }

  /** Nobody drawn (the draw failed): the list slows to a stop. */
  halt() {
    const r = this.run;
    if (!r || r.plan || r.halt) return;
    r.halt = halt(r, this.elapsed(r));
    this.watch(r);
  }

  /** Stops whatever is running at once, where it would have ended. */
  finish = () => {
    const r = this.run;
    if (!r) return;
    this.run = null;
    cancelAnimationFrame(this.raf);
    window.clearTimeout(this.dog);
    const n = this.rows.length;
    const end = r.plan ? r.plan.target : r.halt ? r.halt.to : reelAt(r, this.elapsed(r)).p;
    this.at = n ? mod(Math.round(end), n) : 0;
    if (this.waiting) {
      const rows = this.waiting;
      this.waiting = null;
      if (!r.plan) this.setRows(rows);
      else {
        // Kept for after the person drawn has been shown: the list rests on them until then.
        this.waiting = rows;
      }
    }
    this.paint(this.at);
    r.done(!!r.plan);
  };

  /** A list read during a run, put in now (the person drawn has been shown and has left the list). */
  settle() {
    if (this.run || !this.waiting) return;
    const rows = this.waiting;
    this.waiting = null;
    this.setRows(rows);
  }

  dispose() {
    cancelAnimationFrame(this.raf);
    window.clearTimeout(this.dog);
    this.run = null;
  }

  private elapsed(r: { start: number }) {
    return (performance.now() - r.start) / 1000;
  }

  /** Finishes the run even if the browser stops drawing frames (a tab out of sight): the result never waits on it. */
  private watch(r: Run & { start: number }) {
    window.clearTimeout(this.dog);
    const left = (endOf(r) - this.elapsed(r)) * 1000;
    this.dog = window.setTimeout(this.finish, Math.max(0, left) + 400);
  }

  private frame = () => {
    const r = this.run;
    if (!r) return;
    const t = this.elapsed(r);
    if (t >= endOf(r)) {
      this.finish();
      return;
    }
    const { p, v } = reelAt(r, t);
    this.paint(p, v);
    this.raf = requestAnimationFrame(this.frame);
  };

  /** Each slot to its place, its words to its row's, and the list a little quieter the faster it runs. */
  private paint(p: number, v = 0) {
    const n = this.rows.length;
    const base = Math.floor(p);
    const frac = p - base;
    for (let k = 0; k < SLOTS; k++) {
      const el = this.slots[k];
      if (!el) continue;
      const off = k - MID;
      el.style.transform = `translate3d(0, ${((off - frac) * 100).toFixed(3)}%, 0)`;
      const row = n ? mod(base + off, n) : -1;
      if (this.shows[k] === row) continue;
      this.shows[k] = row;
      const e = row >= 0 ? this.rows[row] : null;
      const [id, name, from] = Array.from(el.children) as HTMLElement[];
      id.textContent = e ? e[0] : "";
      name.textContent = e ? e[1] : "";
      from.textContent = e ? fromOf(e[2], e[3]) : "";
    }
    // Too fast to read, the names soften to a shimmer, and come back as the list slows (the arrow's rules stay).
    if (this.box) this.box.style.opacity = v > 40 ? String(Math.max(0.2, 1 - (v - 40) / 300)) : "";
  }
}

type Fetched = Board | "no_pass" | null;
type Scene = "list" | "card";

export function DrawScreen({ mode, closes }: { mode: DrawMode | null; closes: string }) {
  const [reel] = useState(() => new Reel());
  const [access, setAccess] = useState<"checking" | "ok" | "none">("checking");
  /** The board as the screen shows it: changed only between reveals, so the seats never give a name away early. */
  const [shown, setShown] = useState<Board | null>(null);
  /** The list, or the person drawn come forward. */
  const [scene, setScene] = useState<Scene>("list");
  /** The person drawn: shown under the arrow, then come forward. */
  const [card, setCard] = useState<DrawCardPublic | null>(null);
  const [label, setLabel] = useState("");
  /** The row under the arrow lit: it is the one drawn. */
  const [chosen, setChosen] = useState(false);
  /** How many are in the list on the screen (null until it is read). */
  const [listed, setListed] = useState<number | null>(null);
  const [say, setSay] = useState<{ text: string; trouble: boolean } | null>(null);
  const [offline, setOffline] = useState(false);
  const [passEnded, setPassEnded] = useState(false);
  const [full, setFull] = useState(false);
  const [quietPointer, setQuietPointer] = useState(false);
  const [drawing, setDrawing] = useState(false);
  const [heard, setHeard] = useState("");
  /** Today in India, set in the browser (the page is drawn on the server first). */
  const [today, setToday] = useState("");
  const latest = useRef<Board | null>(null);
  const busy = useRef(false);
  /** The press whose answer has not come yet: asked again with the same id, so it is drawn once. */
  const pending = useRef<string | null>(null);
  /** The highest draw number this screen has shown. */
  const seen = useRef(0);
  const live = useRef(true);
  const still = useRef(false);
  const poolBusy = useRef(false);
  const poolAt = useRef(0);
  /** When this screen last got its pass. */
  const passAt = useRef(0);
  /** What is on the screen, for a press and a poll to read without being made again at every change. */
  const shownNow = useRef<Board | null>(null);
  const showing = useRef<{ scene: Scene; card: DrawCardPublic | null; label: string }>({ scene: "list", card: null, label: "" });
  useEffect(() => {
    shownNow.current = shown;
  }, [shown]);
  useEffect(() => {
    showing.current = { scene, card, label };
  }, [scene, card, label]);
  /** One stable ref a row: React never calls them again on a render, so a running list is never repainted at rest. */
  const slotRefs = useMemo(() => SLOT_KEYS.map((k) => (el: HTMLDivElement | null) => reel.attach(k, el)), [reel]);
  const boxRef = useCallback((el: HTMLDivElement | null) => reel.attachBox(el), [reel]);

  useEffect(() => {
    live.current = true;
    still.current = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    setToday(TODAY.format(new Date()));
    return () => {
      live.current = false;
      reel.dispose();
    };
  }, [reel]);

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

  /** Everyone in the draw, for the list (read again after each draw, the person drawn having left it). */
  const fetchPool = useCallback(async (): Promise<boolean> => {
    if (!mode || poolBusy.current) return false;
    poolBusy.current = true;
    const stop = new AbortController();
    const timer = window.setTimeout(() => stop.abort(), 30_000);
    try {
      const res = await fetch(`${API}/pool/?mode=${mode}`, { cache: "no-store", signal: stop.signal });
      if (!res.ok) return false;
      const pool = (await res.json()) as DrawPool;
      if (!Array.isArray(pool.entries)) return false;
      reel.setRows(pool.entries);
      poolAt.current = Date.now();
      setListed(pool.entries.length);
      return true;
    } catch {
      return false;
    } finally {
      window.clearTimeout(timer);
      poolBusy.current = false;
    }
  }, [mode, reel]);

  /**
   * The screen's pass, from the admin's own session in this browser (lib/server/draw-screen.ts). Taken as the screen
   * opens and renewed while that session lasts: once it has ended (thirty minutes without a click in the console), no
   * new pass can be had, so the screen must already hold one.
   */
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

  /** The screen at rest: the last person drawn, come forward, while they hold a place; otherwise the list. */
  const rest = useCallback(
    (board: Board) => {
      const c = board.latest ? board.cards.find((x) => x.id === board.latest) ?? null : null;
      setChosen(false);
      setCard(c);
      setLabel(c ? placeWords(board, c.id) : "");
      setScene(c ? "card" : "list");
      if (c) reel.restOn(c.tripId);
    },
    [reel],
  );

  /**
   * The person drawn shown: the running list (`running`) lands on their row, which lights; then their name comes
   * forward, and their seat fills. Without a running list (none read, or reduced motion), the list rests on them.
   */
  const reveal = useCallback(
    async (c: DrawCardPublic, board: Board, running: Promise<boolean> | null) => {
      const words = placeWords(board, c.id);
      if (running) {
        reel.land(reel.ensure([c.tripId, c.name, c.city, c.country]));
        await running;
      } else reel.restOn(c.tripId);
      if (!live.current) return;
      setCard(c);
      setChosen(true);
      setLabel(words);
      await sleep(still.current ? 300 : HOLD_MS);
      if (!live.current) return;
      setScene("card");
      // The seats fill once the name is up, never before.
      await sleep(still.current ? 0 : 650);
      setShown(board);
      setHeard(`${words}: ${c.name}, ${fromOf(c.city, c.country)}. Trip ID ${c.tripId}.`);
      reel.settle();
      // They have left the list: read it again, while their name holds the screen.
      void fetchPool();
    },
    [fetchPool, reel],
  );

  /** The list starts to run, under the words for what is being drawn (not when it can't: none read, reduced motion). */
  const startRunning = useCallback(
    (words: string): Promise<boolean> | null => {
      setSay(null);
      setChosen(false);
      setLabel(words);
      setScene("list");
      return !still.current && reel.size > 1 ? reel.spin() : null;
    },
    [reel],
  );

  /** A board read from the server, while no draw is being shown: a draw made elsewhere is shown as if made here. */
  const absorb = useCallback(
    async (next: Board) => {
      latest.current = next;
      const newest = next.cards.at(-1);
      if (newest && newest.number > seen.current && !newest.out && next.latest === newest.id) {
        seen.current = newest.number;
        busy.current = true;
        setDrawing(true);
        const running = startRunning(shownNow.current ? nextWords(shownNow.current) : "Drawing");
        await reveal(newest, next, running);
        busy.current = false;
        setDrawing(false);
        return;
      }
      seen.current = Math.max(seen.current, newest?.number ?? 0);
      setShown(next);
      // A release or a restore changes who holds the screen.
      const now = showing.current;
      if (now.card && now.card.id === next.latest) setLabel(placeWords(next, now.card.id));
      else if (now.card || next.latest) rest(next);
      // New applications, or people taken out: the list read again (not too often).
      if (next.poolSize !== reel.size && Date.now() - poolAt.current > POOL_EVERY_MS) void fetchPool();
    },
    [fetchPool, reel, rest, reveal, startRunning],
  );

  // In: the pass, then the board (asked again until it answers), then the list.
  useEffect(() => {
    if (!mode) {
      setAccess("none");
      return;
    }
    let stopped = false;
    void (async () => {
      for (let attempt = 0; !stopped; attempt++) {
        // The pass first, while the admin's session is surely there; without one, a pass this browser already holds.
        await openPass();
        const board = await fetchBoard();
        if (stopped) return;
        if (board === "no_pass") {
          setAccess("none");
          return;
        }
        if (board) {
          latest.current = board;
          seen.current = board.cards.at(-1)?.number ?? 0;
          setShown(board);
          rest(board);
          setAccess("ok");
          // The list, asked for until it comes.
          for (let tries = 0; !stopped && !(await fetchPool()); tries++) await sleep(Math.min(10_000, 2000 * (tries + 1)));
          if (!stopped && board.latest) {
            const c = board.cards.find((x) => x.id === board.latest);
            if (c) reel.restOn(c.tripId);
          }
          return;
        }
        await sleep(Math.min(10_000, 2000 * (attempt + 1)));
      }
    })();
    return () => {
      stopped = true;
    };
  }, [mode, fetchBoard, fetchPool, openPass, reel, rest]);

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
          // Tried once a half hour, taken or not (without the admin's session it can't be, and isn't asked again soon).
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

  /** One press, sent until it is answered (up to three times, the same id each time). */
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

  const press = useCallback(async () => {
    const board = latest.current ?? shownNow.current;
    if (busy.current || access !== "ok" || !board || !board.ready || (mode === "live" && board.applicationsOpen)) return;
    if (board.poolSize === 0) {
      setSay({ text: "Everyone in the draw has been drawn.", trouble: false });
      return;
    }
    busy.current = true;
    setDrawing(true);
    const before = showing.current;
    const running = startRunning(nextWords(board));
    const id = pending.current ?? pressId();
    pending.current = id;
    const answer = await sendDraw(id);
    if (!live.current) return;
    if (!answer.ok) {
      if (!answer.keep) pending.current = null;
      if (running) {
        reel.halt();
        await running;
      }
      setCard(before.card);
      setLabel(before.label);
      setScene(before.scene);
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
        reel.halt();
        await running;
      }
      setShown(answer.board);
      rest(answer.board);
    }
    await sleep(SETTLE_MS);
    busy.current = false;
    setDrawing(false);
  }, [access, mode, reel, rest, reveal, sendDraw, startRunning]);

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

  // Full screen, as the browser has it (F11 too).
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
  const seats = board?.seats ?? Array.from({ length: DRAW_SEATS }, () => null);
  const byId = new Map((board?.cards ?? []).map((c) => [c.id, c]));
  const reserves = (board?.reserves ?? []).map((id) => byId.get(id)).filter((c): c is DrawCardPublic => !!c);
  const notReady = !!board && !board.ready;
  const empty = !!board && board.ready && board.poolSize === 0;
  /** The live draw waits for applications to close (the server refuses it until then). */
  const early = mode === "live" && !!board?.applicationsOpen;
  const quiet =
    say?.text ??
    (notReady
      ? "The draw isn't set up on this database yet."
      : early
        ? `The live draw opens when applications close on ${closes}. Rehearse until then.`
        : empty
          ? "Everyone in the draw has been drawn."
          : passEnded
            ? "This screen's pass has ended. Open it again from the console."
            : "");
  const inList = listed ?? board?.poolSize ?? null;
  const note =
    card && (scene === "card" || chosen)
      ? `Drawn at random from ${count.format(card.poolSize)} applicants · ${AT.format(new Date(card.drawnAt))}`
      : inList !== null
        ? `${count.format(inList)} applicants in the draw, listed by Trip ID`
        : "";

  if (access === "none") {
    return (
      <div className="ld">
        <div className="ld-door">
          <div>
            <h1>The draw&rsquo;s screen opens from the console</h1>
            <p>Free China Trip → Lucky draw → Open the TV screen</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={`ld${quietPointer ? " ld-hide-cursor" : ""}`}>
      <div className="ld-frame">
        <header className="ld-band">
          <div className="ld-band-mark">
            <b>AFFHAN</b>
            <span>Free China Business Trip</span>
          </div>
          <div className="ld-band-right">
            {mode === "rehearsal" && <span className="ld-rehearsal">Rehearsal: these draws don&rsquo;t count</span>}
            <span>Lucky draw{today ? ` · ${today}` : ""}</span>
            <button type="button" tabIndex={-1} className="ld-full" onClick={() => void toggleFull()} aria-label={full ? "Leave full screen" : "Full screen"}>
              {full ? <Minimize2 aria-hidden /> : <Maximize2 aria-hidden />}
            </button>
          </div>
        </header>

        <main className="ld-stage">
          <p className="ld-eyebrow">{label}</p>
          <div className="ld-theatre" data-scene={scene}>
            <div className="ld-list" aria-hidden>
              <div className="ld-reel" ref={boxRef}>
                {SLOT_KEYS.map((k) => (
                  <div key={k} ref={slotRefs[k]} className="ld-row" data-chosen={chosen && k === MID ? "" : undefined}>
                    <span className="ld-row-id" />
                    <span className="ld-row-name" />
                    <span className="ld-row-from" />
                  </div>
                ))}
              </div>
              <div className="ld-lens" data-chosen={chosen || undefined} />
              <span className="ld-arrow" />
            </div>
            <div className="ld-card">
              {card && (
                <>
                  <h1 className="ld-name" data-size={nameSize(card.name)}>
                    {card.name}
                  </h1>
                  <span className="ld-rule" aria-hidden />
                  <p className="ld-from">{fromOf(card.city, card.country)}</p>
                  <p className="ld-card-id">{card.tripId}</p>
                </>
              )}
            </div>
          </div>
          <p className="ld-note">{note}</p>
        </main>

        <div className="ld-act">
          <button type="button" className="ld-draw" onClick={() => void press()} disabled={drawing || access !== "ok" || notReady || empty || early}>
            {drawing ? "Drawing…" : "Draw"}
          </button>
          <p className="ld-say" data-trouble={say?.trouble || undefined} role="status">
            {quiet}
          </p>
        </div>

        <footer>
          <ol className="ld-seats" aria-label="The five seats">
            {seats.map((id, i) => {
              const c = id ? byId.get(id) : null;
              return (
                <li key={i} className="ld-seat" data-filled={c ? "" : undefined}>
                  <p className="ld-seat-n">Seat {i + 1}</p>
                  {c ? (
                    <>
                      <p className="ld-seat-name">{c.name}</p>
                      <p className="ld-seat-meta">{fromOf(c.city, c.country)}</p>
                      <p className="ld-seat-id">{c.tripId}</p>
                    </>
                  ) : (
                    <>
                      <p className="ld-seat-name" data-open>
                        To be drawn
                      </p>
                      <p className="ld-seat-meta">&nbsp;</p>
                      <p className="ld-seat-id" />
                    </>
                  )}
                </li>
              );
            })}
          </ol>
          <p className="ld-reserves" aria-label="Reserves">
            {reserves.length > 0 ? (
              <>
                <b>Reserves</b>
                {reserves.map((r, i) => (
                  <span key={r.id}>
                    <em>{i + 1}</em>
                    <i>{r.name}</i>
                    {r.city ? ` · ${r.city}` : ""}
                  </span>
                ))}
              </>
            ) : (
              " "
            )}
          </p>
        </footer>
      </div>
      {offline && <p className="ld-line">Reconnecting…</p>}
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
