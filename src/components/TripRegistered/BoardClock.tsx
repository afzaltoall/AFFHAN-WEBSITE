"use client";

import { useEffect, useState } from "react";
import { REGISTERED } from "./content";

const IST = new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Kolkata", hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23" });

/**
 * The board's own clock, in place of a "Live" badge (the owner, 2026-10-07):
 * India time, ticking, in the departure board's split-flap tiles, as an
 * airport's board shows the time; each figure that changes turns over
 * (registered.css). Under it, how long ago the list was last read (`readAt`,
 * the page's clock), so it is plain that the board keeps itself up to date.
 * Blank until the page is running in the browser, so the server and the
 * first render agree. Its title says what it is; the tiles are hidden from
 * a screen reader.
 */
export function BoardClock({ readAt }: { readAt: number | null }) {
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => {
    let t = 0;
    const tick = () => {
      setNow(Date.now());
      t = window.setTimeout(tick, 1000 - (Date.now() % 1000) + 5);
    };
    tick();
    return () => window.clearTimeout(t);
  }, []);
  const C = REGISTERED.live.clock;
  const text = now ? IST.format(now) : "--:--:--";
  const since = now !== null && readAt !== null ? Math.max(0, Math.round((now - readAt) / 1000)) : null;
  return (
    <div className="tr-clock" title={C.title}>
      <span className="tr-clock-time" aria-hidden>
        {[...text].map((ch, i) =>
          ch === ":" ? (
            <span key={i} className="tr-clock-sep">
              :
            </span>
          ) : (
            // Keyed by the figure, so a figure that changes is a new tile, and turns over as it comes.
            <span key={`${i}-${ch}`} className="tr-clock-tile">
              {ch}
            </span>
          ),
        )}
        <span className="tr-clock-zone">{C.zone}</span>
      </span>
      <span className="tr-clock-note">{since === null ? " " : since < 3 ? C.updated : C.ago(since)}</span>
    </div>
  );
}
