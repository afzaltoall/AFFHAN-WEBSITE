"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { ArrowRight, House, Plane, ScrollText, ShieldCheck, Ticket } from "lucide-react";
import { DISPLAY, EYEBROW } from "@/components/CinematicExperience/parts";
import { GoldDust } from "@/components/CinematicExperience/GoldDust";
import { ARRIVAL_KEY } from "@/components/CinematicExperience/takeoff";
import { WELCOME_KEY, useTripStatus } from "@/components/TripAccess/useTripStatus";
import type { TripStageName } from "@/lib/trip-stage";
import "@/components/CinematicExperience/cinematic.css";
import { AddToCalendar } from "./AddToCalendar";
import { BoardingPass } from "./BoardingPass";
import { REGISTERED } from "./content";
import { DrawCountdown } from "./DrawCountdown";
import { DrawGlobe, type DrawGlobeHandle } from "./DrawGlobe";
import { NextSteps } from "./NextSteps";
import { FlightSeats } from "./FlightSeats";
import { flyTicketIn } from "./ticketFlight";
import "./registered.css";

/** How often "What happens next" asks how far the trip has got, while the tab is in front (the old board's pace). */
const STAGE_POLL_MS = 12_000;
/** How long the "You're in the draw" message stays. */
const TOAST_MS = 6500;
/** The tickets in the draw globe: a drum of them, never the number of applications (which is the console's alone). */
const GLOBE_TICKETS = 150;
/** When the visitor's ticket leaves the pass for the globe: once the seal is down (later, arriving from the application). */
const FLIGHT_AT = { opened: 3000, arrived: 3400 } as const;
/** The page's foot: each link's mark (content.ts names them). */
const CLOSE_ICONS = { plane: Plane, terms: ScrollText, privacy: ShieldCheck, home: House } as const;
const DAY = new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Kolkata", day: "numeric", month: "short", year: "numeric" });
/** The day someone applied, as the route after applying shows it: "7 Oct 2026", India time. */
const appliedOn = (iso: string) => DAY.format(new Date(iso));

/**
 * /free-china-trip/registered/: where a participant lands after applying, and where the trip opens for
 * anyone who has applied already (by their account, or on the browser they applied from). Under the
 * heading:
 *
 *  - yours, and where it goes: the participant's boarding pass (name, Trip ID, from, when; the plane
 *    flies its route and the seal comes down on its stub), and beside it the draw globe. Once the seal is
 *    down, the globe's lid opens, their ticket tears from the stub and flies in, where it glows, and the
 *    air mixes it in (the owner's idea of 2026-10-07). Someone who has not applied has the way in where
 *    the pass would be;
 *  - the draw: five places, as the five lit windows of the aircraft that will fly the winners
 *    (FlightSeats), the time left until the winners are announced, the day to add to a calendar;
 *  - what happens next, step by step (NextSteps), following the stage the team sets in the console.
 *
 * Nothing about anyone else: how many have applied, from where, and who applied last were shown here, live,
 * until the owner took them off (2026-10-28: "dont show the current trip of counts, remove this completely
 * for user view ... show [what happens next] only, which I handle from admin"). The globe is a drum of
 * tickets, not a count. Nothing here is a score, a rank or a chance of winning: the draw is random among
 * eligible applications.
 */
export function RegisteredExperience() {
  const { ready, registration } = useTripStatus();
  /** Null until the first answer: "What happens next" never shows a step the trip is not at. */
  const [stage, setStage] = useState<TripStageName | null>(null);
  const [stamp, setStamp] = useState(false);
  const [arriving, setArriving] = useState(false);
  const [toast, setToast] = useState<{ key: number; title: string; line: string } | null>(null);
  const globeRef = useRef<DrawGlobeHandle>(null);
  const flown = useRef(false);
  const flightTimer = useRef(0);
  const toastTimer = useRef(0);

  const say = useCallback((title: string, line: string) => {
    window.clearTimeout(toastTimer.current);
    setToast({ key: Date.now(), title, line });
    toastTimer.current = window.setTimeout(() => setToast(null), TOAST_MS);
  }, []);
  useEffect(() => () => window.clearTimeout(toastTimer.current), []);

  // What happens next follows the stage the team sets in the console: read on arriving, every few
  // seconds while the tab is in front, and as it comes back into view.
  useEffect(() => {
    let live = true;
    const read = async () => {
      try {
        const res = await fetch("/api/trip-applications/stage/", { cache: "no-store" });
        if (!res.ok) throw new Error(String(res.status));
        const json = (await res.json()) as { stage?: TripStageName };
        if (live && json.stage) setStage(json.stage);
      } catch {
        // Offline or refused: what is shown stays; with nothing shown yet, the first step (as the server
        // itself answers when it cannot read the stage).
        if (live) setStage((s) => s ?? "open");
      }
    };
    void read();
    const id = window.setInterval(() => {
      if (document.visibilityState === "visible") void read();
    }, STAGE_POLL_MS);
    const onShow = () => document.visibilityState === "visible" && void read();
    document.addEventListener("visibilitychange", onShow);
    return () => {
      live = false;
      window.clearInterval(id);
      document.removeEventListener("visibilitychange", onShow);
    };
  }, []);

  // Arriving: from the application (the pass prints and the seal comes
  // down), or out of the landing page's take-off (the light it ended on
  // opens out).
  useEffect(() => {
    try {
      const w = sessionStorage.getItem(WELCOME_KEY);
      sessionStorage.removeItem(WELCOME_KEY);
      if (w && Date.now() - Number(JSON.parse(w)?.at ?? 0) < 60_000) setStamp(true);
      const at = Number(sessionStorage.getItem(ARRIVAL_KEY));
      sessionStorage.removeItem(ARRIVAL_KEY);
      if (at > 0 && Date.now() - at < 8000 && !window.matchMedia("(prefers-reduced-motion: reduce)").matches) setArriving(true);
    } catch {
      /* no storage: the page simply opens */
    }
  }, []);

  const registered = !!registration;
  const still = typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  // Once the seal is down, the visitor's ticket flies from the pass into the globe. Once a visit;
  // under reduced motion it is in the globe from the start.
  useEffect(() => {
    if (!ready || !registration || flown.current || still) return;
    flown.current = true;
    const ref = registration.referenceNo;
    flightTimer.current = window.setTimeout(
      () =>
        flyTicketIn(globeRef.current, ref, () => {
          if (stamp) say(REGISTERED.toast.mineTitle, REGISTERED.toast.mine(ref));
        }),
      stamp ? FLIGHT_AT.arrived : FLIGHT_AT.opened,
    );
  }, [ready, registration, still, stamp, say]);
  useEffect(() => () => window.clearTimeout(flightTimer.current), []);

  const first = registration?.firstName ?? "";
  const P = REGISTERED.pool;
  const G = REGISTERED.globe;

  return (
    <div className="tr relative isolate min-h-[calc(100dvh-var(--nav-h))] overflow-x-clip">
      {/* The ground: the trip's black, gold high on the right, crimson low on the left, gold dust. */}
      <div aria-hidden className="tr-ground">
        <span className="tr-wash tr-wash-a" />
        <span className="tr-wash tr-wash-b" />
        <GoldDust className="absolute inset-0 h-full w-full" density={0.7} />
        <span className="cx-grain absolute inset-0" />
      </div>
      {arriving && (
        <div aria-hidden className="tr-arrive">
          <div className="cx-bloom" />
        </div>
      )}

      {/* As wide as the rest of the site (1600px), so a wide screen is not two dark margins round a column. */}
      <div className="relative z-10 mx-auto max-w-[1600px] px-5 pb-28 pt-8 sm:px-8 sm:pb-12 md:pt-10 lg:px-12 2xl:px-16">
        {/* The heading and yours under it; beside both on a wide screen, as tall as the two, the globe
            it goes into (registered.css, .tr-top). */}
        <div className="tr-top">
          {/* Held, unseen, until it is known who is reading (their registration is read in the browser),
              then risen in: the heading never greets a participant as a visitor first. */}
          <header key={ready ? "known" : "reading"} className={`tr-head tr-in ${ready ? "" : "invisible"}`} style={{ ["--d" as string]: "0s" }}>
            <p className={EYEBROW}>{REGISTERED.eyebrow}</p>
            <h1 className={`${DISPLAY} tr-title`}>{registered ? REGISTERED.title.registered : REGISTERED.title.visitor}</h1>
            <p className="tr-lede">{registered && first ? <span className="text-(--cx-white)">{REGISTERED.welcome(first)}</span> : REGISTERED.draw}</p>
          </header>

          {registered && registration ? (
            <div className="tr-pass-wrap tr-in" style={{ ["--d" as string]: "0.15s" }}>
              <BoardingPass reg={registration} stamp={stamp} />
            </div>
          ) : ready ? (
            <div className="tr-panel tr-apply tr-in" style={{ ["--d" as string]: "0.15s" }}>
              <span aria-hidden className="tr-apply-mark">
                <Plane size={20} strokeWidth={1.8} />
              </span>
              <p className="tr-apply-line">{REGISTERED.apply.line}</p>
              <Link href={REGISTERED.apply.href} className="cx-apply cx-apply-lg group relative inline-flex rounded-full focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-(--cx-white)">
                <span className="cx-apply-body min-h-[3.25rem] justify-between">
                  <span aria-hidden className="cx-apply-rim" />
                  <span aria-hidden className="cx-apply-face" />
                  <span aria-hidden className="cx-apply-sheen" />
                  <span className="cx-apply-label cx-apply-caps">{REGISTERED.apply.button}</span>
                  <span aria-hidden className="cx-apply-port">
                    <ArrowRight className="cx-apply-arrow" strokeWidth={2.2} />
                    <Plane className="cx-apply-plane" strokeWidth={1.9} />
                  </span>
                </span>
              </Link>
            </div>
          ) : (
            <div aria-hidden className="tr-panel tr-apply tr-apply-wait" />
          )}

          {/* Not a panel: the globe stands on the page itself, in its own light. */}
          <section className="tr-globe tr-in" style={{ ["--d" as string]: "0.25s" }} aria-labelledby="tr-globe-title">
            <p className="tr-panel-title">{G.eyebrow}</p>
            <h2 id="tr-globe-title" className={`${DISPLAY} tr-globe-title`}>
              {G.title}
            </h2>
            {/* Its room is held until it is known whose page this is. */}
            <div className="tr-globe-wrap">
              {ready && <DrawGlobe ref={globeRef} count={GLOBE_TICKETS} mine={registered} holdMine={registered && !still} label={G.label(registered)} shakeLabel={G.shake} />}
            </div>
            <p className="tr-globe-line">
              {registered && <span className="text-(--cx-white)">{G.mine} </span>}
              {G.line}
            </p>
          </section>
        </div>

        {/* The draw: the five seats, and the day. On a wide screen the words and the clock on the left,
            the aircraft on the right; on a phone the aircraft between them (registered.css, .tr-draw-grid). */}
        <section className="tr-panel tr-draw tr-in mt-6 lg:mt-8" style={{ ["--d" as string]: "0.32s" }} aria-labelledby="tr-draw-title">
          <div className="tr-draw-grid">
            <div className="tr-draw-places">
              <p className="tr-panel-title">{P.eyebrow}</p>
              <h2 id="tr-draw-title" className={`${DISPLAY} tr-draw-title`}>
                {P.title}
              </h2>
              <p className="tr-draw-line">{P.line}</p>
            </div>
            <FlightSeats lit={P.flight.lit} label={P.flight.label} note={P.flight.note} />
            <div className="tr-draw-when">
              <p className="tr-pool-when">
                {P.announced} · <span className="whitespace-nowrap text-(--cx-gold-hi)">{P.date}</span>
              </p>
              <DrawCountdown />
              <AddToCalendar tripId={registration?.referenceNo ?? null} />
            </div>
          </div>
        </section>

        {/* What happens next: the steps, as the team moves the trip along them in the console. */}
        <section className="tr-panel tr-next-panel tr-in mt-6 lg:mt-8" style={{ ["--d" as string]: "0.38s" }}>
          {ready && stage && <NextSteps appliedOn={registration ? appliedOn(registration.createdAt) : null} stage={stage} />}
        </section>

        {/* The foot: torn off along a perforation, as the stub of a ticket, then where to go next, each
            with a word on what is there. */}
        <nav aria-label="Free China Business Trip" className="tr-close tr-in" style={{ ["--d" as string]: "0.5s" }}>
          <span aria-hidden className="tr-close-tear" />
          <ul className="tr-close-links">
            {REGISTERED.close.links.map((l) => {
              const Icon = CLOSE_ICONS[l.icon];
              return (
                <li key={l.href}>
                  <Link href={l.href} className="tr-close-link">
                    <span aria-hidden className="tr-close-icon">
                      <Icon size={18} strokeWidth={1.8} />
                    </span>
                    <span className="tr-close-text">
                      <span className="tr-close-label">{l.label}</span>
                      <span className="tr-close-line">{l.line}</span>
                    </span>
                    <ArrowRight aria-hidden size={16} strokeWidth={2} className="tr-close-arrow" />
                  </Link>
                </li>
              );
            })}
          </ul>
          <p className="tr-close-sign">{REGISTERED.close.sign}</p>
        </nav>
      </div>

      {/* Their own ticket going into the draw, said as it lands. */}
      <div className="tr-toasts" role="status" aria-live="polite">
        {toast && (
          <div key={toast.key} className="tr-toast is-mine">
            <span aria-hidden className="tr-toast-mark">
              <Ticket size={15} strokeWidth={2} />
            </span>
            <span className="tr-toast-text">
              <span className="tr-toast-title">{toast.title}</span>
              <span className="tr-toast-line">{toast.line}</span>
            </span>
            <span aria-hidden className="tr-toast-time" style={{ ["--ms" as string]: `${TOAST_MS}ms` }} />
          </div>
        )}
      </div>
    </div>
  );
}
