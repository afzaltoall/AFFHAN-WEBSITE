"use client";

import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState, type KeyboardEvent as ReactKeyboardEvent, type MouseEvent, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { ArrowRight, Check, ExternalLink, X } from "lucide-react";
import { displayFont } from "@/components/CinematicExperience/fonts";
import { TRIP_CONSENTS, TRIP_FACTS, TRIP_PRIVACY, TRIP_PRIVACY_HREF, TRIP_TERMS, TRIP_TERMS_HREF } from "@/lib/trip-legal";
import { LegalSections } from "./LegalSections";
import "@/components/CinematicExperience/cinematic.css";
import "./trip-legal.css";

/**
 * The agreement in front of the application. Every "Apply for the Trip" on
 * the landing page, and "Start application" on the application itself, opens
 * this before the application starts. It is set like a boarding pass: the
 * documents are the pass, and the stub, across a perforation, holds what you
 * sign.
 *
 *  - Both documents, whole, in one reading pane, a tab each (the words are
 *    lib/trip-legal.ts, the same as the pages). A ring on each tab fills as
 *    it is read and turns to a check at its end. "Open in full" opens the
 *    page in a new tab.
 *  - At a glance: the facts an applicant most needs (the dates, the draw,
 *    the trip date, the flight, the rooms, the meals), each opening the
 *    clause that states it.
 *  - The two consents that make sense before anything has been typed, in the
 *    owner's words: the Privacy Policy, and the Terms & Conditions. The third
 *    (the information is accurate) waits for the end of the application,
 *    where it can be true. The agree button stays dim until both are ticked;
 *    pressed early, it says what is missing.
 *  - Agreed: light runs down the perforation, the pass goes, and only then
 *    does the caller's way in begin (onAgree), so the take-off or the first
 *    step plays on a clear screen.
 *
 * A real dialog: focus moves in and is held there, Escape and the backdrop
 * close it, focus returns to the button that opened it, and the page behind
 * is inert and still (the landing page's smooth scroll stops). Rendered into
 * <body>, outside the page's .cx, so it carries the theme and font itself.
 * Under reduced motion it fades, nothing more.
 */

type Tab = "terms" | "privacy";
type Phase = "enter" | "open" | "leave" | "agree";

const DISPLAY = "font-[family-name:var(--font-cx-display)]";
/** Closing without agreeing. */
const LEAVE_MS = 260;
/** Agreeing: the caller's way in starts here, as the pass finishes going… */
const AGREE_HAND_MS = 400;
/** …and the popup is gone here. */
const AGREE_MS = 540;

const DOCS = {
  terms: { doc: TRIP_TERMS, href: TRIP_TERMS_HREF, label: "Terms & Conditions" },
  privacy: { doc: TRIP_PRIVACY, href: TRIP_PRIVACY_HREF, label: "Privacy Policy" },
} as const;

/** The facts, each in the Terms' own words and pointing at the clause that states it. */
const GLANCE = [
  { label: "Applications", value: `${shortDate(TRIP_FACTS.applicationsOpen)} – ${shortDate(TRIP_FACTS.applicationsClose)} 2026`, clause: 3 },
  { label: "Selection", value: `${TRIP_FACTS.winners} winners, random draw`, clause: 4 },
  { label: "Winners announced", value: `${shortDate(TRIP_FACTS.winnersAnnounced)} 2026`, clause: 5 },
  { label: "Trip date", value: "Announced to the winners", clause: 5 },
  { label: "Flights", value: "Economy class only", clause: 10 },
  { label: "Rooms", value: "Shared, no private rooms", clause: 14 },
  { label: "Not included", value: "Food and meals", clause: 15 },
] as const;

/** "5 October 2026" → "5 Oct". */
function shortDate(d: string) {
  const [day, month] = d.split(" ");
  return `${day} ${month.slice(0, 3)}`;
}

/** A plain left click: anything else (a new tab, a new window) is left to the browser. */
const plainClick = (e: MouseEvent) => e.button === 0 && !e.metaKey && !e.ctrlKey && !e.shiftKey && !e.altKey;

const reducedMotion = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches;

export function ConsentGate({
  open,
  onClose,
  onAgree,
  returnFocus,
  agreeLabel = "Agree & start application",
}: {
  open: boolean;
  onClose: () => void;
  onAgree: () => void;
  /** Where focus goes back to when the popup closes without agreeing (read when it opens). */
  returnFocus?: HTMLElement | null;
  /** The agree button's words: what pressing it does where the popup is. */
  agreeLabel?: string;
}) {
  const [mounted, setMounted] = useState(false);
  const [phase, setPhase] = useState<Phase>("enter");
  const [tab, setTab] = useState<Tab>("terms");
  const [privacy, setPrivacy] = useState(false);
  const [terms, setTerms] = useState(false);
  const [missing, setMissing] = useState(false);
  const [read, setRead] = useState({ terms: 0, privacy: 0 });
  const panelRef = useRef<HTMLDivElement>(null);
  const paneRef = useRef<HTMLDivElement>(null);
  const tabsRef = useRef<HTMLDivElement>(null);
  const tabRefs = useRef<Record<Tab, HTMLButtonElement | null>>({ terms: null, privacy: null });
  const inkRef = useRef<HTMLSpanElement>(null);
  const glanceRef = useRef<HTMLDivElement>(null);
  const scrollOf = useRef<Record<Tab, number>>({ terms: 0, privacy: 0 });
  const pendingJump = useRef<number | null>(null);
  const uid = useId().replace(/[^a-zA-Z0-9_-]/g, "");
  const ready = privacy && terms;
  /** Set when the reader agrees: the page is then handed to the caller's way in. */
  const agreedRef = useRef(false);
  const phaseRef = useRef<Phase>("enter");
  const openerRef = useRef<HTMLElement | null>(null);
  const go = (p: Phase) => {
    phaseRef.current = p;
    setPhase(p);
  };

  // Mount on open; on close, play the leave (or let the agreeing finish) and go.
  // The ticks are kept between openings: closing is not a "no".
  useEffect(() => {
    if (open) {
      agreedRef.current = false;
      openerRef.current = returnFocus ?? (document.activeElement instanceof HTMLElement ? document.activeElement : null);
      setMounted(true);
      go("enter");
      setMissing(false);
      const id = requestAnimationFrame(() => requestAnimationFrame(() => go("open")));
      return () => cancelAnimationFrame(id);
    }
    if (!mounted) return;
    const agreeing = phaseRef.current === "agree";
    if (!agreeing) go("leave");
    const wait = agreeing ? (reducedMotion() ? 200 : AGREE_MS - AGREE_HAND_MS) : LEAVE_MS;
    const t = window.setTimeout(() => setMounted(false), wait);
    return () => window.clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // While open: the page behind is inert and still, and focus is inside.
  useEffect(() => {
    if (!mounted) return;
    const html = document.documentElement;
    const prev = { overflow: html.style.overflow, gutter: html.style.scrollbarGutter };
    // The scrollbar's room is kept, so the page behind does not shift sideways.
    html.style.scrollbarGutter = "stable";
    html.style.overflow = "hidden";
    const lenis = (window as unknown as { lenis?: { stop(): void; start(): void } }).lenis;
    lenis?.stop();
    const host = panelRef.current?.closest<HTMLElement>("[data-tg-root]");
    const others = Array.from(document.body.children).filter((el): el is HTMLElement => el instanceof HTMLElement && el !== host && !el.inert);
    others.forEach((el) => (el.inert = true));
    const opener = openerRef.current;
    panelRef.current?.focus({ preventScroll: true });
    return () => {
      others.forEach((el) => (el.inert = false));
      html.style.overflow = prev.overflow;
      html.style.scrollbarGutter = prev.gutter;
      // Agreeing hands the page to the caller's way in, which keeps the
      // scroll still itself; closing gives it back.
      if (!agreedRef.current) {
        lenis?.start();
        opener?.focus({ preventScroll: true });
      }
    };
  }, [mounted]);

  const close = useCallback(() => {
    if (phaseRef.current === "leave" || phaseRef.current === "agree") return;
    agreedRef.current = false;
    onClose();
  }, [onClose]);

  // Escape, and Tab held inside the panel.
  useEffect(() => {
    if (!mounted) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        close();
        return;
      }
      if (e.key !== "Tab" || !panelRef.current) return;
      const items = Array.from(
        panelRef.current.querySelectorAll<HTMLElement>('a[href], button:not([disabled]), input, [tabindex]:not([tabindex="-1"])'),
      ).filter((el) => el.getClientRects().length > 0);
      if (!items.length) return;
      const first = items[0];
      const last = items[items.length - 1];
      if (e.shiftKey && (document.activeElement === first || document.activeElement === panelRef.current)) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [mounted, close]);

  // The tabs' gold ink sits under the chosen tab, and follows it when the
  // tabs change size (the web font arriving, a narrower screen).
  useLayoutEffect(() => {
    const tabs = tabsRef.current;
    if (!tabs) return;
    const place = () => {
      const t = tabRefs.current[tab];
      const ink = inkRef.current;
      if (!t || !ink) return;
      ink.style.width = `${t.offsetWidth}px`;
      ink.style.transform = `translateX(${t.offsetLeft}px)`;
    };
    place();
    if (typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(place);
    ro.observe(tabs);
    return () => ro.disconnect();
  }, [tab, mounted]);

  // On a short screen the facts scroll inside the stub: their foot fades
  // while there are more below.
  useEffect(() => {
    const wrap = glanceRef.current;
    if (!mounted || !wrap) return;
    const mark = () => wrap.toggleAttribute("data-more", wrap.scrollHeight - wrap.clientHeight - wrap.scrollTop > 4);
    mark();
    wrap.addEventListener("scroll", mark, { passive: true });
    const ro = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(mark);
    ro?.observe(wrap);
    return () => {
      wrap.removeEventListener("scroll", mark);
      ro?.disconnect();
    };
  }, [mounted]);

  // A new document: back to where the reader left it, or to a jumped-to clause.
  useLayoutEffect(() => {
    const pane = paneRef.current;
    if (!pane) return;
    const n = pendingJump.current;
    pendingJump.current = null;
    if (n !== null) {
      const el = pane.querySelector<HTMLElement>(`#${uid}-${tab}-${n}`);
      if (el) {
        pane.scrollTop = el.offsetTop;
        flash(el);
      }
    } else {
      pane.scrollTop = scrollOf.current[tab];
    }
    onPaneScroll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, mounted]);

  const onPaneScroll = () => {
    const pane = paneRef.current;
    if (!pane) return;
    scrollOf.current[tab] = pane.scrollTop;
    const p = Math.min(1, pane.scrollTop / Math.max(1, pane.scrollHeight - pane.clientHeight));
    setRead((r) => (p > r[tab] + 0.01 || (p >= 0.985 && r[tab] < 1) ? { ...r, [tab]: p >= 0.985 ? 1 : p } : r));
  };

  const showTab = (next: Tab, clause?: number) => {
    if (next === tab && clause !== undefined) {
      // Same document: glide there now.
      const el = paneRef.current?.querySelector<HTMLElement>(`#${uid}-${tab}-${clause}`);
      if (el && paneRef.current) {
        paneRef.current.scrollTo({ top: el.offsetTop, behavior: reducedMotion() ? "auto" : "smooth" });
        flash(el);
      }
      return;
    }
    if (clause !== undefined) pendingJump.current = clause;
    setTab(next);
  };

  const onDocLink = (href: string) => {
    if (href === TRIP_PRIVACY_HREF) return showTab("privacy"), true;
    if (href === TRIP_TERMS_HREF) return showTab("terms"), true;
    return false;
  };

  /** A document's name in a consent: shows that document here; a new-tab click still opens the page. */
  const openDoc = (e: MouseEvent<HTMLAnchorElement>, to: Tab) => {
    if (!plainClick(e)) return;
    e.preventDefault();
    showTab(to);
    paneRef.current?.focus({ preventScroll: true });
  };

  const agree = () => {
    if (phaseRef.current !== "open") return;
    if (!ready) {
      setMissing(true);
      document.getElementById(`${uid}-${!privacy ? "privacy" : "terms"}`)?.focus();
      return;
    }
    agreedRef.current = true;
    go("agree");
    window.setTimeout(onAgree, reducedMotion() ? 0 : AGREE_HAND_MS);
  };

  const onTabKey = (e: ReactKeyboardEvent) => {
    if (e.key !== "ArrowRight" && e.key !== "ArrowLeft" && e.key !== "Home" && e.key !== "End") return;
    e.preventDefault();
    const next: Tab = e.key === "Home" ? "terms" : e.key === "End" ? "privacy" : tab === "terms" ? "privacy" : "terms";
    setTab(next);
    tabRefs.current[next]?.focus();
  };

  if (!mounted || typeof document === "undefined") return null;
  const current = DOCS[tab];

  return createPortal(
    // data-lenis-prevent: the landing page's smooth scroll leaves every wheel
    // turn in here to the browser, so the pane (and, on a short screen, the
    // pass) scrolls natively.
    <div data-tg-root data-state={phase} data-lenis-prevent className={`${displayFont.variable} cx tg-root`}>
      <div aria-hidden className="tg-backdrop" onClick={close} />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={`${uid}-title`}
        aria-describedby={`${uid}-line`}
        tabIndex={-1}
        className="tg-panel"
      >
        <button type="button" onClick={close} className="tg-close" aria-label="Close">
          <X size={20} strokeWidth={1.8} />
        </button>

        {/* The pass: the two documents. */}
        <div className="tg-main">
          <header className="tg-head">
            <p className="tg-eyebrow">Before you apply</p>
            <h2 id={`${uid}-title`} className={`${DISPLAY} tg-title`}>
              Read, then agree.
            </h2>
            <p id={`${uid}-line`} className="tg-line">
              Your application starts once you have agreed to the Free China Business Trip&rsquo;s Terms &amp; Conditions and Privacy Policy.
            </p>
          </header>

          <div className="tg-tabbar">
            <div ref={tabsRef} role="tablist" aria-label="Documents" className="tg-tabs" onKeyDown={onTabKey}>
              {(["terms", "privacy"] as const).map((t) => (
                <button
                  key={t}
                  ref={(el) => {
                    tabRefs.current[t] = el;
                  }}
                  type="button"
                  role="tab"
                  id={`${uid}-tab-${t}`}
                  aria-selected={tab === t}
                  aria-controls={`${uid}-pane`}
                  tabIndex={tab === t ? 0 : -1}
                  onClick={() => showTab(t)}
                  className="tg-tab"
                >
                  <ReadRing p={read[t]} />
                  <span>{DOCS[t].label}</span>
                  {read[t] >= 1 && <span className="sr-only"> (read to the end)</span>}
                </button>
              ))}
              <span ref={inkRef} aria-hidden className="tg-ink" />
            </div>
            <a href={current.href} target="_blank" rel="noopener" className="tg-full">
              <span className="tg-full-text">Open in full</span>
              <ExternalLink size={13} strokeWidth={2} aria-hidden />
              <span className="sr-only"> {current.label} (opens in a new tab)</span>
            </a>
          </div>

          <div className="tg-pane-wrap">
            <div
              ref={paneRef}
              id={`${uid}-pane`}
              role="tabpanel"
              aria-labelledby={`${uid}-tab-${tab}`}
              tabIndex={0}
              onScroll={onPaneScroll}
              className="tg-pane"
            >
              <div className="tg-doc" key={tab}>
                <p className="tg-doc-eyebrow">{current.doc.heading[0]}</p>
                <p className={`${DISPLAY} tg-doc-title`}>{current.doc.heading[1]}</p>
                <div className="tg-doc-intro">
                  {current.doc.intro.map((line) => (
                    <p key={line}>{line}</p>
                  ))}
                </div>
                <LegalSections doc={current.doc} prefix={`${uid}-${tab}`} level={3} onDocLink={onDocLink} />
                <p className="tg-doc-end">End of the {current.label}</p>
              </div>
            </div>
          </div>
        </div>

        {/* The stub: what you sign. */}
        <div className="tg-stub">
          <span aria-hidden className="tg-perf">
            <span className="tg-perf-light" />
          </span>

          <div className="tg-stub-body">
            <div ref={glanceRef} className="tg-glance-wrap">
              <p id={`${uid}-glance`} className="tg-glance-title">
                At a glance
              </p>
              <ul className="tg-glance" aria-labelledby={`${uid}-glance`}>
                {GLANCE.map((g, i) => (
                  <li key={g.label} style={{ ["--i" as string]: i }}>
                    <button type="button" onClick={() => showTab("terms", g.clause)}>
                      <span className="tg-glance-label">{g.label}</span>
                      <span className="tg-glance-value">{g.value}</span>
                      <span className="sr-only">: read clause {g.clause}</span>
                      <ArrowRight aria-hidden size={14} strokeWidth={2} className="tg-glance-go" />
                    </button>
                  </li>
                ))}
              </ul>
            </div>

            <div className="tg-foot">
              <div className="tg-consents">
                <Tick id={`${uid}-privacy`} checked={privacy} onChange={(v) => (setPrivacy(v), setMissing(false))} invalid={missing && !privacy}>
                  {TRIP_CONSENTS.privacy.before}
                  <a href={TRIP_PRIVACY_HREF} onClick={(e) => openDoc(e, "privacy")} className="tg-inline">
                    {TRIP_CONSENTS.privacy.link}
                  </a>
                  {TRIP_CONSENTS.privacy.after}
                </Tick>
                <Tick id={`${uid}-terms`} checked={terms} onChange={(v) => (setTerms(v), setMissing(false))} invalid={missing && !terms}>
                  {TRIP_CONSENTS.terms.before}
                  <a href={TRIP_TERMS_HREF} onClick={(e) => openDoc(e, "terms")} className="tg-inline">
                    {TRIP_CONSENTS.terms.link}
                  </a>
                  {TRIP_CONSENTS.terms.after}
                </Tick>
              </div>
              <p className="tg-missing" role="status" aria-live="polite">
                {missing && !ready ? "Tick both boxes to continue." : ""}
              </p>
              <div className="tg-actions">
                <button type="button" onClick={agree} aria-disabled={!ready} className={`tg-agree${ready ? " is-ready" : ""}`}>
                  <span aria-hidden className="tg-agree-sheen" />
                  <span className="tg-agree-label">{agreeLabel}</span>
                  <span aria-hidden className="tg-agree-port">
                    <ArrowRight size={17} strokeWidth={2.2} />
                  </span>
                </button>
                <button type="button" onClick={close} className="tg-later">
                  Not now
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}

/** A clause that was asked for: a gold breath behind it. */
function flash(el: HTMLElement) {
  el.removeAttribute("data-flash");
  void el.offsetWidth;
  el.setAttribute("data-flash", "");
  window.setTimeout(() => el.removeAttribute("data-flash"), 1600);
}

/** A tab's reading: a ring that fills as the document is read, a check at its end. */
function ReadRing({ p }: { p: number }) {
  const r = 7;
  const c = 2 * Math.PI * r;
  return (
    <span aria-hidden className={`tg-ring${p >= 1 ? " is-done" : ""}`}>
      <svg viewBox="0 0 18 18" width="18" height="18">
        <circle cx="9" cy="9" r={r} className="tg-ring-track" />
        <circle cx="9" cy="9" r={r} className="tg-ring-fill" strokeDasharray={c} strokeDashoffset={c * (1 - p)} />
      </svg>
      <Check size={10} strokeWidth={3} className="tg-ring-check" />
    </span>
  );
}

/** A consent box: a gold check that draws itself. Its label holds a document's name as a link; pressing that shows the document and does not tick the box. */
function Tick({ id, checked, onChange, invalid, children }: { id: string; checked: boolean; onChange: (v: boolean) => void; invalid: boolean; children: ReactNode }) {
  return (
    <div className={`tg-tick${invalid ? " is-invalid" : ""}`}>
      <input id={id} type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} aria-invalid={invalid || undefined} className="tg-tick-input" />
      <label htmlFor={id} className="tg-tick-label">
        <span aria-hidden className="tg-tick-box">
          <svg viewBox="0 0 20 20" width="20" height="20">
            <path d="M5 10.5l3.2 3.2L15 6.8" />
          </svg>
        </span>
        <span className="tg-tick-text">{children}</span>
      </label>
    </div>
  );
}
