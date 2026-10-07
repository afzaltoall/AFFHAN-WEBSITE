"use client";

import { useEffect, useRef } from "react";
import { Check, Plane } from "lucide-react";
import type { TripStageName } from "@/lib/trip-stage";
import { REGISTERED } from "./content";

/** Where each stage the team sets (lib/trip-stage.ts) puts the route: the step happening now, after the first. */
const AT: Record<TripStageName, number> = { open: 0, checking: 1, drawing: 2, announced: 3, dates: 4 };

/**
 * What happens after applying, as a route of stops, the Terms' own steps
 * (sections 1, 3 and 4): the first, "You applied", dated, for someone
 * registered ("Applications", open until the closing date, for someone who
 * is not); then the eligibility check, the random draw, the winners
 * announced, the trip date shared.
 *
 * It follows the stage the team sets in the console (`stage`, read with the
 * board every few seconds): the steps before it done, the one it is at
 * "Now", the rest still to come; at the last stage, all of it done. While
 * applications are open, the step after them is "Next". The legs flown are
 * drawn in gold, and a small plane waits on the last of them, by the step
 * the trip is heading to. When the route first comes into view, its legs
 * draw themselves and the plane flies them. In place under reduced motion
 * (registered.css).
 */
export function NextSteps({ appliedOn, stage }: { appliedOn: string | null; stage: TripStageName }) {
  const ref = useRef<HTMLOListElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const seen = new IntersectionObserver(
      (entries) => {
        if (!entries.some((e) => e.isIntersecting)) return;
        el.classList.add("is-shown");
        seen.disconnect();
      },
      { threshold: 0.35 },
    );
    seen.observe(el);
    return () => seen.disconnect();
  }, []);
  const N = REGISTERED.next;
  const at = AT[stage] ?? 0;
  const last = N.steps.length;
  const first = appliedOn ? { title: N.applied.title, line: N.applied.line(appliedOn) } : { title: N.apply.title, line: N.apply.line };
  const steps = [first, ...N.steps].map((s, i) => {
    // Applying is done once someone has applied, or once the trip has moved past applications.
    const done = i === 0 ? !!appliedOn || at > 0 : i < at || (i === at && at === last);
    const now = !done && i === at;
    const next = !done && !now && at === 0 && i === 1;
    return { ...s, done, now, next };
  });
  // The plane waits on the leg into the step the trip is heading to: after the last step done.
  const plane = steps.findIndex((s) => !s.done) - 1;
  return (
    <section className="tr-next" aria-labelledby="tr-next-title">
      <h3 id="tr-next-title" className="tr-panel-title">
        {N.title}
      </h3>
      <ol ref={ref} className="tr-next-steps">
        {steps.map((s, i) => (
          <li key={s.title} className={`tr-next-step ${s.done ? "is-done" : ""} ${s.now ? "is-now" : ""} ${s.next ? "is-next" : ""}`} style={{ ["--i" as string]: i }}>
            <span aria-hidden className="tr-next-dot">
              {s.done ? <Check size={12} strokeWidth={3} /> : i + 1}
            </span>
            {i === plane && (
              <span aria-hidden className="tr-next-plane">
                <Plane size={16} strokeWidth={1.9} />
              </span>
            )}
            <span className="tr-next-text">
              <span className="tr-next-name">
                {s.title}
                {/* Done shows by its tick; "Now" and "Next" are said, in small gold capitals, not a badge. */}
                {s.done && <span className="sr-only"> ({N.tags.done})</span>}
                {(s.now || s.next) && <span className={`tr-next-tag ${s.now ? "is-now" : ""}`}>{s.now ? N.tags.now : N.tags.next}</span>}
              </span>
              <span className="tr-next-line">{s.line}</span>
            </span>
          </li>
        ))}
      </ol>
    </section>
  );
}
