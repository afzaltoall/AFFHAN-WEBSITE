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

/** How many lines the board shows before "Show all". */
const SHOWN = 6;
const FLAP = "ABCDEFGHJKLMNPQRSTUVWXYZ0123456789";

/**
 * A Trip ID on the board's split-flap tiles, one character to a tile, as an
 * airport departures board sets it. A line that has just arrived flaps
 * through the board's alphabet and settles, left to right; the text is the
 * real ID throughout for screen readers.
 */
function FlapId({ text, play }: { text: string; play: boolean }) {
  const [shown, setShown] = useState(text);
  useEffect(() => {
    if (!play || window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setShown(text);
      return;
    }
    let frame = 0;
    const id = window.setInterval(() => {
      frame++;
      setShown(
        text
          .split("")
          .map((c, i) => (c === "-" || frame > 4 + i * 1.4 ? c : FLAP[(frame * 7 + i * 13) % FLAP.length]))
          .join(""),
      );
      if (frame > 4 + text.length * 1.4) window.clearInterval(id);
    }, 42);
    return () => window.clearInterval(id);
  }, [text, play]);
  return (
    <span className="tr-flap" aria-label={text} role="img">
      {shown.split("").map((c, i) =>
        c === "-" ? (
          <span key={i} aria-hidden className="tr-flap-dash" />
        ) : (
          <span key={i} aria-hidden className="tr-flap-tile">
            {c}
          </span>
        ),
      )}
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
 * Anonymous by design (lib/trip-participants.ts).
 */
export function DepartureBoard({ rows, total, loaded, failed }: { rows: ParticipantRow[]; total: number; loaded: boolean; failed: boolean }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 30_000);
    return () => window.clearInterval(id);
  }, []);
  const [all, setAll] = useState(false);

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
  const shown = all ? rows : rows.slice(0, SHOWN);
  const mineAt = rows.findIndex((r) => r.you);
  const mine = !all && mineAt >= SHOWN ? rows[mineAt] : null;

  const line = (r: ParticipantRow, i: number) => {
    const isNew = fresh.has(r.ref);
    return (
      <li key={r.ref} className={`tr-row ${r.you ? "tr-row-you" : ""} ${isNew ? "tr-row-new" : ""}`} style={{ ["--i" as string]: Math.min(i, 12) }}>
        <span className="tr-row-id">
          <FlapId text={r.ref} play={isNew} />
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
    <section className="tr-board" aria-labelledby="tr-board-title">
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
          Array.from({ length: SHOWN }, (_, i) => (
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
      {loaded && rows.length > SHOWN && (
        <button type="button" className="tr-board-more" aria-expanded={all} onClick={() => setAll((v) => !v)}>
          {all ? B.fewer : B.more(rows.length, total)}
        </button>
      )}
      {failed && <p className="tr-board-error">{B.error}</p>}
    </section>
  );
}
