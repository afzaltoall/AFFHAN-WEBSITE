"use client";

import { useEffect, useRef, useState, type MouseEvent } from "react";

/**
 * What a legal page adds once its script runs, and nothing it needs to be
 * read: the document is whole and readable without it.
 *
 *  - A thin gold bar under the navbar, as far along as the reader is.
 *  - The contents list (desktop: sticky beside the text) marks the section
 *    being read, and its gold rail fills with the reading.
 *  - Each section's number lights as the section reaches the reading line,
 *    and stays lit: a record of what has been read. Under reduced motion it
 *    simply lights, with no transition.
 *  - Contents links glide to their section, the navbar allowed for (CSS
 *    scroll-margin), and update the address so a clause can be shared.
 *  - The pass beside the text (LegalPage, the widest screens) says which
 *    section is being read, and its bar fills with the reading.
 */
/** One entry of the contents: its number, title and anchor. */
export interface ReaderItem {
  n: number;
  title: string;
  id: string;
}

export function LegalReader({ items, label, total }: { items: ReaderItem[]; label: string; total: number }) {
  const [active, setActive] = useState(items[0]?.n ?? 1);
  const listRef = useRef<HTMLOListElement>(null);
  // The two bars are set directly, not through state: they move every frame.
  const barRef = useRef<HTMLSpanElement>(null);
  const railRef = useRef<HTMLSpanElement>(null);

  // The reading line: a section counts as being read once its top passes 35%
  // of the screen, and stays lit after.
  useEffect(() => {
    const root = document.documentElement;
    root.setAttribute("data-tl-js", "");
    const sections = items.map((it) => document.getElementById(it.id)).filter((el): el is HTMLElement => !!el);
    const passNow = document.querySelector<HTMLElement>("[data-tl-now]");
    const passBar = document.querySelector<HTMLElement>("[data-tl-passbar]");
    let raf = 0;
    const update = () => {
      raf = 0;
      const line = window.innerHeight * 0.35;
      let current = items[0]?.n ?? 1;
      for (const el of sections) {
        const top = el.getBoundingClientRect().top;
        if (top <= line) {
          current = Number(el.dataset.tlSection);
          el.setAttribute("data-tl-seen", "");
        }
      }
      // The last section may never reach the line on a tall screen: at the
      // foot of the page, it is the one being read.
      const atEnd = window.innerHeight + window.scrollY >= root.scrollHeight - 4;
      if (atEnd && sections.length) {
        const last = sections[sections.length - 1];
        last.setAttribute("data-tl-seen", "");
        current = Number(last.dataset.tlSection);
      }
      setActive(current);
      const now = String(Math.min(current, total)).padStart(2, "0");
      if (passNow && passNow.textContent !== now) passNow.textContent = now;
      const first = sections[0];
      const end = sections[sections.length - 1];
      if (first && end) {
        const start = first.getBoundingClientRect().top + window.scrollY - line;
        const stop = end.getBoundingClientRect().bottom + window.scrollY - window.innerHeight;
        const p = Math.max(0, Math.min(1, (window.scrollY - start) / Math.max(1, stop - start)));
        if (barRef.current) barRef.current.style.transform = `scaleX(${p.toFixed(4)})`;
        if (railRef.current) railRef.current.style.transform = `scaleY(${p.toFixed(4)})`;
        if (passBar) passBar.style.transform = `scaleX(${p.toFixed(4)})`;
      }
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

  // Keep the active entry in view inside a long contents list.
  useEffect(() => {
    const list = listRef.current;
    const el = list?.querySelector<HTMLElement>(`[data-n="${active}"]`);
    if (!list || !el) return;
    const top = el.offsetTop - list.clientHeight / 2;
    list.scrollTo({ top, behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" });
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
        <p className="tl-toc-label">{label}</p>
        <div className="tl-toc-rail" aria-hidden>
          <span ref={railRef} />
        </div>
        <ol ref={listRef} className="tl-toc-list">
          {items.map((it) => (
            <li key={it.n}>
              <a
                href={`#${it.id}`}
                data-n={it.n}
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
      </nav>
    </>
  );
}
