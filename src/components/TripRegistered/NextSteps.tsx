"use client";

import { useEffect, useRef } from "react";
import { Check, Plane } from "lucide-react";
import { REGISTERED } from "./content";

/**
 * What happens after applying, as a route of stops, the Terms' own steps
 * (sections 1, 3 and 4): first "You applied", done and dated, for someone
 * registered ("Apply" for someone who is not); then the eligibility check,
 * the random draw, the winners announced, the trip date shared. The next
 * stop is lit. When the route comes into view, the leg from the first stop
 * to the next draws itself in gold and a small plane flies it, then waits
 * there. All of it in place under reduced motion (registered.css).
 */
export function NextSteps({ appliedOn }: { appliedOn: string | null }) {
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
  const first = appliedOn ? { title: N.applied.title, line: N.applied.line(appliedOn), done: true } : { title: N.apply.title, line: N.apply.line, done: false };
  const steps = [first, ...N.steps.map((s) => ({ ...s, done: false }))];
  // The next stop: the one after "You applied", or "Apply" itself.
  const next = appliedOn ? 1 : 0;
  return (
    <section className="tr-next" aria-labelledby="tr-next-title">
      <h3 id="tr-next-title" className="tr-panel-title">
        {N.title}
      </h3>
      <ol ref={ref} className="tr-next-steps">
        {steps.map((s, i) => (
          <li key={s.title} className={`tr-next-step ${s.done ? "is-done" : ""} ${i === next ? "is-next" : ""}`} style={{ ["--i" as string]: i }}>
            <span aria-hidden className="tr-next-dot">
              {s.done ? <Check size={12} strokeWidth={3} /> : i + 1}
            </span>
            {s.done && (
              <span aria-hidden className="tr-next-plane">
                <Plane size={16} strokeWidth={1.9} />
              </span>
            )}
            <span className="tr-next-text">
              <span className="tr-next-name">
                {s.title}
                {s.done && <span className="sr-only"> (done)</span>}
                {i === next && <span className="sr-only"> (next)</span>}
              </span>
              <span className="tr-next-line">{s.line}</span>
            </span>
          </li>
        ))}
      </ol>
    </section>
  );
}
