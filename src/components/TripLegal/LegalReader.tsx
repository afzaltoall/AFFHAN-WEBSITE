"use client";

import { useEffect, useRef, useState, type MouseEvent } from "react";

/**
 * What a legal page adds once its script runs, and nothing it needs to be
 * read: the document is whole and readable without it.
 *
 *  - A thin gold bar under the navbar, as far along as the reader is.
 *  - The contents (desktop: beside the text, as tall as the screen) are a
 *    route, a stop for each section. The stop being read glows, the stops
 *    read before it are gold, and the gold line runs from stop to stop as the
 *    reader goes: halfway through a section, it is halfway to the next stop.
 *  - Each section's number lights as the section reaches the reading line,
 *    and stays lit: a record of what has been read. Under reduced motion it
 *    simply lights, with no transition.
 *  - Contents links glide to their section, the navbar allowed for (CSS
 *    scroll-margin), and update the address so a clause can be shared.
 *  - The pass beside the text (LegalPage, the widest screens) shows the
 *    section being read, its number rolling on to the next, and its bar
 *    fills with the reading.
 */
/** One entry of the contents: its number, title and anchor. */
export interface ReaderItem {
  n: number;
  title: string;
  id: string;
}

/** A stop's centre, from the top of its entry: the entry's padding and half its first line. */
const DOT = 15;

export function LegalReader({ items, label, count, total }: { items: ReaderItem[]; label: string; count: string; total: number }) {
  const [active, setActive] = useState(items[0]?.n ?? 1);
  const [read, setRead] = useState(0);
  const routeRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLOListElement>(null);
  // The bars and the route's gold are set directly, not through state: they move every frame.
  const barRef = useRef<HTMLSpanElement>(null);
  const fillRef = useRef<HTMLSpanElement>(null);

  // The reading line: a section counts as being read once its top passes 35%
  // of the screen, and stays lit after.
  useEffect(() => {
    const root = document.documentElement;
    root.setAttribute("data-tl-js", "");
    const sections = items.map((it) => document.getElementById(it.id)).filter((el): el is HTMLElement => !!el);
    const passBar = document.querySelector<HTMLElement>("[data-tl-passbar]");
    let raf = 0;
    let furthest = 0;
    const update = () => {
      raf = 0;
      const line = window.innerHeight * 0.35;
      let at = 0;
      sections.forEach((el, i) => {
        if (el.getBoundingClientRect().top <= line) {
          at = i;
          el.setAttribute("data-tl-seen", "");
        }
      });
      // The last section may never reach the line on a tall screen: at the
      // foot of the page, it is the one being read.
      const atEnd = window.innerHeight + window.scrollY >= root.scrollHeight - 4;
      if (atEnd && sections.length) {
        at = sections.length - 1;
        sections[at].setAttribute("data-tl-seen", "");
      }
      furthest = Math.max(furthest, at);
      setActive(Number(sections[at]?.dataset.tlSection ?? items[0]?.n ?? 1));
      setRead(furthest);

      const first = sections[0];
      const end = sections[sections.length - 1];
      if (first && end) {
        const start = first.getBoundingClientRect().top + window.scrollY - line;
        const stop = end.getBoundingClientRect().bottom + window.scrollY - window.innerHeight;
        const p = Math.max(0, Math.min(1, (window.scrollY - start) / Math.max(1, stop - start)));
        if (barRef.current) barRef.current.style.transform = `scaleX(${p.toFixed(4)})`;
        if (passBar) passBar.style.transform = `scaleX(${p.toFixed(4)})`;
      }

      // The route's gold: to the stop being read, and on towards the next as
      // far as the reader is through that section.
      const stops = listRef.current?.children;
      const fill = fillRef.current;
      if (stops && stops.length && fill) {
        const y = (i: number) => (stops[i] as HTMLElement).offsetTop + DOT;
        let to = y(at);
        if (atEnd) to = y(stops.length - 1);
        else if (at < stops.length - 1 && sections[at]) {
          const r = sections[at].getBoundingClientRect();
          const f = Math.max(0, Math.min(1, (line - r.top) / Math.max(1, r.height)));
          to += f * (y(at + 1) - y(at));
        }
        fill.style.top = `${y(0)}px`;
        fill.style.height = `${Math.max(0, to - y(0)).toFixed(1)}px`;
      }
      const route = routeRef.current;
      if (route) route.toggleAttribute("data-overflow", route.scrollHeight > route.clientHeight + 1);
    };
    const onScroll = () => {
      if (!raf) raf = requestAnimationFrame(update);
    };
    update();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
      if (raf) cancelAnimationFrame(raf);
      root.removeAttribute("data-tl-js");
    };
  }, [items, total]);

  // The pass's stub: the section being read, its number rolling on.
  const shown = useRef(active);
  useEffect(() => {
    if (shown.current === active) return;
    const forward = active > shown.current;
    shown.current = active;
    const n = document.querySelector<HTMLElement>("[data-tl-now]");
    const title = document.querySelector<HTMLElement>("[data-tl-now-title]");
    const item = items.find((it) => it.n === active);
    if (!n || !title || !item) return;
    n.textContent = String(Math.min(active, total)).padStart(2, "0");
    title.textContent = item.title;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches || typeof n.animate !== "function") return;
    const from = forward ? "0.5em" : "-0.5em";
    const ease = "cubic-bezier(0.22, 1, 0.36, 1)";
    n.animate([{ transform: `translateY(${from})`, opacity: 0, filter: "blur(6px)" }, { transform: "none", opacity: 1, filter: "blur(0)" }], { duration: 520, easing: ease });
    title.animate([{ transform: "translateY(6px)", opacity: 0 }, { transform: "none", opacity: 1 }], { duration: 480, delay: 90, easing: ease, fill: "backwards" });
  }, [active, items, total]);

  // Keep the stop being read in view inside a long contents list.
  useEffect(() => {
    const route = routeRef.current;
    const el = listRef.current?.querySelector<HTMLElement>(`[data-n="${active}"]`);
    if (!route || !el || route.scrollHeight <= route.clientHeight + 1) return;
    const top = el.offsetTop - route.clientHeight / 2;
    route.scrollTo({ top, behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" });
  }, [active]);

  const go = (e: MouseEvent<HTMLAnchorElement>, id: string) => {
    const el = document.getElementById(id);
    if (!el) return;
    e.preventDefault();
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    el.scrollIntoView({ behavior: reduce ? "auto" : "smooth", block: "start" });
    history.replaceState(null, "", `#${id}`);
    // Keyboard and screen-reader users land in the section too.
    el.setAttribute("tabindex", "-1");
    el.focus({ preventScroll: true });
  };

  return (
    <>
      <div aria-hidden className="tl-progress">
        <span ref={barRef} />
      </div>
      <nav aria-label={label} className="tl-toc">
        <p className="tl-toc-label">
          <span>{label}</span>
          <span className="tl-toc-count">{count}</span>
        </p>
        <div ref={routeRef} className="tl-toc-route">
          <span ref={fillRef} aria-hidden className="tl-toc-fill" />
          <ol ref={listRef} className="tl-toc-list">
            {items.map((it, i) => (
              <li key={it.n}>
                <a
                  href={`#${it.id}`}
                  data-n={it.n}
                  data-read={i <= read || undefined}
                  aria-current={active === it.n ? "location" : undefined}
                  onClick={(e) => go(e, it.id)}
                  className="tl-toc-link"
                >
                  <span className="tl-toc-num">{String(it.n).padStart(2, "0")}</span>
                  <span>{it.title}</span>
                </a>
              </li>
            ))}
          </ol>
        </div>
      </nav>
    </>
  );
}
