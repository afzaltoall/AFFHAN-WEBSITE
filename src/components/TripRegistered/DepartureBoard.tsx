"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { flagUrl } from "@/lib/countries";
import type { ParticipantRow } from "@/lib/trip-participants";
import { REGISTERED } from "./content";

/** "Just now", "4 min ago", "3 h ago", "Yesterday", "6 days ago". */
export function ago(iso: string, now: number) {
  const s = Math.max(0, Math.round((now - Date.parse(iso)) / 1000));
  if (s < 45) return "Just now";
  const m = Math.round(s / 60);
  if (m < 60) return `${m} min ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h} h ago`;
  const d = Math.round(h / 24);
  return d === 1 ? "Yesterday" : `${d} days ago`;
}

const AT = new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Kolkata", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", hourCycle: "h23" });

/**
 * How many lines the board shows before "Show all": six on a phone; ten on a wide screen, where the
 * count and what happens next stand beside it about as tall (six left the board half empty there).
 */
const SHOWN = { narrow: 6, wide: 10 } as const;
const FLAP = "ABCDEFGHJKLMNPQRSTUVWXYZ0123456789";

/** A tile's turns before it settles: the first after 4 frames, each next one 1.4 later, left to right. */
const settlesAt = (i: number) => 4 + i * 1.4;

/**
 * A Trip ID on the board's split-flap tiles, one character to a tile, as an
 * airport departures board sets it. When it plays (a line just arrived, or
 * the board seen for the first time), each tile flutters through the board's
 * alphabet and settles, left to right, after `delay`, so lines settle one
 * after another down the board. At rest it is the ID itself, and the text is
 * the real ID throughout for screen readers.
 */
function FlapId({ text, play, delay = 0 }: { text: string; play: boolean; delay?: number }) {
  /** The frame of the turn, or null at rest. */
  const [frame, setFrame] = useState<number | null>(null);
  useEffect(() => {
    if (!play || window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setFrame(null);
      return;
    }
    let f = 0;
    let tick = 0;
    const begin = window.setTimeout(() => {
      tick = window.setInterval(() => {
        f++;
        if (f > settlesAt(text.length)) {
          window.clearInterval(tick);
          setFrame(null);
        } else setFrame(f);
      }, 42);
    }, delay);
    return () => {
      window.clearTimeout(begin);
      window.clearInterval(tick);
    };
  }, [text, play, delay]);
  return (
    <span className="tr-flap" aria-label={text} role="img">
      {text.split("").map((c, i) => {
        if (c === "-") return <span key={i} aria-hidden className="tr-flap-dash" />;
        const turning = frame !== null && frame <= settlesAt(i);
        return (
          <span key={i} aria-hidden className={`tr-flap-tile${turning ? " is-turning" : ""}`}>
            {turning ? FLAP[(frame * 7 + i * 13) % FLAP.length] : c}
          </span>
        );
      })}
    </span>
  );
}

/**
 * The newest registrations, as an airport departures board: each line its
 * Trip ID on split-flap tiles, where from, and when. Every line on it is a
 * registration, so it says so once, in its title, not on every line. The
 * visitor's own line is gold and says "You"; when it is further down than
 * the board shows, it is kept under the others, after a gap. Lines that
 * arrive while the page is open flip in at the top. "Show all" opens the
 * rest in place: the page grows, nothing scrolls inside it.
 *
 * The first time the board comes into view it updates as a departures board
 * does: line after line, every Trip ID flutters and settles, top to bottom;
 * so do the lines "Show all" opens. It reads at rest before and after.
 *
 * Anonymous by design (lib/trip-participants.ts).
 */
export function DepartureBoard({ rows, total, loaded, failed }: { rows: ParticipantRow[]; total: number; loaded: boolean; failed: boolean }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 30_000);
    return () => window.clearInterval(id);
  }, []);
  const [all, setAll] = useState(false);
  // Six until the page is running in the browser and knows how wide the screen is.
  const [few, setFew] = useState<number>(SHOWN.narrow);
  useEffect(() => {
    const wide = window.matchMedia("(min-width: 1024px)");
    const set = () => setFew(wide.matches ? SHOWN.wide : SHOWN.narrow);
    set();
    wide.addEventListener("change", set);
    return () => wide.removeEventListener("change", set);
  }, []);

  // The board seen for the first time: its lines well inside the window, not just peeking in at
  // the foot of it as the page opens (a wide screen shows its first line there): it updates.
  const boardRef = useRef<HTMLElement>(null);
  const [seenOnce, setSeenOnce] = useState(false);
  useEffect(() => {
    const el = boardRef.current;
    if (!loaded || seenOnce || !el || typeof IntersectionObserver === "undefined") return;
    const watch = new IntersectionObserver(
      (entries) => {
        if (!entries.some((e) => e.isIntersecting)) return;
        setSeenOnce(true);
        watch.disconnect();
      },
      { threshold: 0.2, rootMargin: "0px 0px -30% 0px" },
    );
    watch.observe(el);
    return () => watch.disconnect();
  }, [loaded, seenOnce]);

  // Which lines are new since the page opened (the first load is not "new").
  // Before the browser paints them, so a new line never shows unflipped first.
  const seen = useRef<Set<string> | null>(null);
  const [fresh, setFresh] = useState<Set<string>>(() => new Set());
  useLayoutEffect(() => {
    if (!loaded) return;
    const before = seen.current;
    if (before) setFresh(new Set(rows.filter((r) => !before.has(r.ref)).map((r) => r.ref)));
    seen.current = new Set([...(before ?? []), ...rows.map((r) => r.ref)]);
  }, [rows, loaded]);

  const B = REGISTERED.board;
  const shown = all ? rows : rows.slice(0, few);
  const mineAt = rows.findIndex((r) => r.you);
  const mine = !all && mineAt >= few ? rows[mineAt] : null;

  const line = (r: ParticipantRow, i: number) => {
    const isNew = fresh.has(r.ref);
    // The lines "Show all" opens: in at once, one after another (registered.css, .tr-row-more), so
    // the board never opens onto an empty panel while they wait their turn.
    const more = all && i >= few && !isNew;
    // Down the board in turn: the visitor's own, kept under the newest few, right after them; the lines
    // "Show all" opens, in turn from the first of them, quicker.
    const delay = isNew ? 0 : more ? (i - few) * 45 : Math.min(i, few) * 85;
    return (
      <li
        key={r.ref}
        className={`tr-row ${r.you ? "tr-row-you" : ""} ${isNew ? "tr-row-new" : ""} ${more ? "tr-row-more" : ""}`}
        style={{ ["--i" as string]: Math.min(i, 12), ["--k" as string]: more ? i - few : 0 }}
      >
        <span className="tr-row-id">
          <FlapId text={r.ref} play={isNew || seenOnce} delay={delay} />
          {r.you && <span className="tr-row-you-tag">{B.you}</span>}
        </span>
        <span className="tr-row-from">
          {r.iso && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={flagUrl(r.iso)} alt="" width={20} height={14} loading="lazy" className="tr-flag" />
          )}
          <span className="truncate">{r.country}</span>
        </span>
        <span className="tr-row-when">
          <time dateTime={r.at} title={`${AT.format(new Date(r.at))} IST`}>
            {ago(r.at, now)}
          </time>
        </span>
      </li>
    );
  };

  return (
    <section ref={boardRef} className="tr-board" aria-labelledby="tr-board-title">
      <h2 id="tr-board-title" className="tr-panel-title">
        {B.title}
      </h2>
      <div className="tr-board-cols" aria-hidden>
        {B.cols.map((c) => (
          <span key={c}>{c}</span>
        ))}
      </div>
      <ol className="tr-board-rows" aria-live="polite" aria-relevant="additions">
        {!loaded &&
          Array.from({ length: few }, (_, i) => (
            <li key={i} className="tr-row tr-row-skeleton" aria-hidden>
              <span />
              <span />
              <span />
            </li>
          ))}
        {loaded && rows.length === 0 && <li className="tr-board-empty">{B.empty}</li>}
        {loaded && shown.map(line)}
        {loaded && mine && (
          <>
            <li aria-hidden className="tr-row-gap">
              <span />
              <span />
              <span />
            </li>
            {line(mine, mineAt)}
          </>
        )}
      </ol>
      {loaded && rows.length > few && (
        <button type="button" className="tr-board-more" aria-expanded={all} onClick={() => setAll((v) => !v)}>
          {all ? B.fewer : B.more(rows.length, total)}
        </button>
      )}
      {failed && <p className="tr-board-error">{B.error}</p>}
    </section>
  );
}
