"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { ArrowRight, Plane } from "lucide-react";
import { DISPLAY, EYEBROW } from "@/components/CinematicExperience/parts";
import { GoldDust } from "@/components/CinematicExperience/GoldDust";
import { ARRIVAL_KEY } from "@/components/CinematicExperience/takeoff";
import { WELCOME_KEY, useTripStatus } from "@/components/TripAccess/useTripStatus";
import { flagUrl } from "@/lib/countries";
import type { ParticipantsSnapshot } from "@/lib/trip-participants";
import "@/components/CinematicExperience/cinematic.css";
import { AddToCalendar } from "./AddToCalendar";
import { BoardingPass } from "./BoardingPass";
import { REGISTERED } from "./content";
import { DepartureBoard } from "./DepartureBoard";
import { DrawCountdown } from "./DrawCountdown";
import { Odometer } from "./Odometer";
import "./registered.css";

/** How often the board asks for new registrations while the page is open. */
const POLL_MS = 12_000;
/** How long "+1 just now" stays beside the count after a registration arrives. */
const ARRIVED_MS = 6000;
/** Countries listed by name before "and N more". */
const COUNTRIES_SHOWN = 5;

/**
 * /free-china-trip/registered/: the participants board, where a new
 * participant lands after submitting, and where the trip opens for anyone who
 * has registered already. Two rows under the heading:
 *
 *  - yours, and what happens next: the participant's boarding pass (name,
 *    Trip ID, from, when, an entry seal on its stub; arriving from the
 *    application, WELCOME_KEY, it prints and the seal comes down), beside
 *    the draw: five places, drawn at random, the time left until the winners
 *    are announced, and the day to add to a calendar. Someone signed in who
 *    has not applied has the way in where the pass would be;
 *  - everyone, live, in one panel: how many have registered (the count
 *    rolls as registrations arrive, and says "+1 just now" for a moment),
 *    today's and the last hour's when they say something the count does not,
 *    the countries, and the newest registrations as a departures board.
 *
 * Every figure is the real one, read from the database every 12 seconds
 * while the tab is visible (/api/trip-applications/participants/). The board
 * is anonymous by design: Trip ID, country and time, never a name
 * (lib/trip-participants.ts). Nothing here is a score, a rank or a chance of
 * winning: the draw is random among eligible applications.
 */
export function RegisteredExperience() {
  const { ready, signedIn, registration } = useTripStatus();
  const [snap, setSnap] = useState<ParticipantsSnapshot | null>(null);
  const [failed, setFailed] = useState(false);
  /** Registrations that arrived while the page was open, said beside the count for a moment. */
  const [arrived, setArrived] = useState<{ n: number; at: number } | null>(null);
  const [stamp, setStamp] = useState(false);
  const [arriving, setArriving] = useState(false);
  const last = useRef<number | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/trip-applications/participants/", { cache: "no-store", credentials: "same-origin" });
      if (!res.ok) throw new Error(String(res.status));
      const next = (await res.json()) as ParticipantsSnapshot;
      const delta = last.current === null ? 0 : next.total - last.current;
      if (delta > 0) setArrived({ n: delta, at: Date.now() });
      last.current = next.total;
      setSnap(next);
      setFailed(false);
    } catch {
      setFailed(true);
    }
  }, []);

  // The board, live while the tab is visible.
  useEffect(() => {
    if (!signedIn) return;
    void load();
    const id = window.setInterval(() => {
      if (document.visibilityState === "visible") void load();
    }, POLL_MS);
    const onShow = () => document.visibilityState === "visible" && void load();
    document.addEventListener("visibilitychange", onShow);
    return () => {
      window.clearInterval(id);
      document.removeEventListener("visibilitychange", onShow);
    };
  }, [signedIn, load]);

  useEffect(() => {
    if (!arrived) return;
    const t = window.setTimeout(() => setArrived(null), ARRIVED_MS);
    return () => window.clearTimeout(t);
  }, [arrived]);

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
  const first = registration?.firstName ?? "";
  const L = REGISTERED.live;
  const P = REGISTERED.pool;

  // Today's and the last hour's, only where they say something the count
  // and each other do not (16 registered, all of them today and in the last
  // hour, is said once, by the 16).
  const pace: string[] = [];
  if (snap) {
    if (snap.today > 0 && snap.today < snap.total && snap.today !== snap.lastHour) pace.push(L.today(snap.today));
    if (snap.lastHour > 0 && snap.lastHour < snap.total) pace.push(L.lastHour(snap.lastHour));
  }
  const countries = snap?.countries ?? [];
  const most = countries[0]?.count ?? 1;

  return (
    <div className="tr relative isolate min-h-[calc(100dvh-4rem)] overflow-x-clip">
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
        {/* Held, unseen, until it is known who is reading (the sign-in and the registration are read in
            the browser), then risen in: the heading never says "The participants" to a participant first. */}
        <header key={ready ? "known" : "reading"} className={`tr-in ${ready ? "" : "invisible"}`} style={{ ["--d" as string]: "0s" }}>
          <p className={EYEBROW}>{REGISTERED.eyebrow}</p>
          <h1 className={`${DISPLAY} tr-title`}>{registered ? REGISTERED.title.registered : REGISTERED.title.visitor}</h1>
          <p className="tr-lede">
            {registered && first ? <span className="text-(--cx-white)">{REGISTERED.welcome(first)}</span> : `${REGISTERED.visitor} ${REGISTERED.draw}`}
          </p>
        </header>

        {/* Yours, and what happens next. */}
        <div className="tr-first mt-8 grid gap-6 lg:mt-10 lg:grid-cols-[minmax(0,7fr)_minmax(0,5fr)] lg:gap-8">
          {registered && registration ? (
            <div className="tr-pass-wrap tr-in" style={{ ["--d" as string]: "0.15s" }}>
              <BoardingPass reg={registration} stamp={stamp} />
            </div>
          ) : ready && signedIn ? (
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

          <section className="tr-panel tr-draw tr-in" style={{ ["--d" as string]: "0.25s" }} aria-labelledby="tr-draw-title">
            <p className="tr-panel-title">{P.eyebrow}</p>
            <h2 id="tr-draw-title" className={`${DISPLAY} tr-draw-title`}>
              {P.title}
            </h2>
            <p className="tr-draw-line">{P.line}</p>
            <ol className="tr-tickets" aria-label={P.title}>
              {Array.from({ length: 5 }, (_, i) => (
                <li key={i} className="tr-ticket" style={{ ["--i" as string]: i }}>
                  <span className="tr-ticket-face">
                    <Plane size={15} strokeWidth={2} aria-hidden />
                  </span>
                  <span className="sr-only">Place {i + 1}</span>
                </li>
              ))}
            </ol>
            <div className="tr-draw-when">
              <p className="tr-pool-when">
                {P.announced} · <span className="whitespace-nowrap text-(--cx-gold-hi)">{P.date}</span>
              </p>
              <DrawCountdown />
              <AddToCalendar tripId={registration?.referenceNo ?? null} />
            </div>
          </section>
        </div>

        {/* Everyone, live. */}
        <section className="tr-panel tr-live-panel tr-in mt-6 lg:mt-8" style={{ ["--d" as string]: "0.35s" }} aria-labelledby="tr-count-title">
          <div className="tr-live-grid">
            <div className="tr-summary">
              <div className="flex items-center justify-between gap-4">
                <h2 id="tr-count-title" className="tr-panel-title">
                  {L.label}
                </h2>
                <span className="tr-live">
                  <span aria-hidden className="tr-live-dot" />
                  {L.tag}
                </span>
              </div>
              <div className="tr-total">
                {snap ? <Odometer value={snap.total} label={L.total(snap.total)} /> : <span className="tr-total-wait" aria-hidden>··</span>}
                {arrived && (
                  <span key={arrived.at} className="tr-arrived" aria-live="polite">
                    {L.arrived(arrived.n)}
                  </span>
                )}
              </div>
              <p className="tr-places">{snap ? L.places : " "}</p>
              {pace.length > 0 && (
                <p className="tr-pace">
                  <span aria-hidden className="tr-pace-dot" />
                  {pace.join(" · ")}
                </p>
              )}

              {countries.length > 0 && (
                <div className="tr-from">
                  <h3 className="tr-panel-title tr-from-title">{L.from}</h3>
                  {countries.length === 1 ? (
                    <p className="tr-from-one">
                      {countries[0].iso && (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={flagUrl(countries[0].iso)} alt="" width={20} height={14} loading="lazy" className="tr-flag" />
                      )}
                      {countries[0].country}
                    </p>
                  ) : (
                    <ul className="tr-from-list">
                      {countries.slice(0, COUNTRIES_SHOWN).map((c) => (
                        <li key={c.country}>
                          {c.iso ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img src={flagUrl(c.iso)} alt="" width={20} height={14} loading="lazy" className="tr-flag" />
                          ) : (
                            <span aria-hidden className="tr-flag tr-flag-none" />
                          )}
                          <span className="truncate">{c.country}</span>
                          <span aria-hidden className="tr-from-bar">
                            <span style={{ ["--p" as string]: c.count / most }} />
                          </span>
                          <span className="tr-from-n">{c.count.toLocaleString("en-IN")}</span>
                        </li>
                      ))}
                    </ul>
                  )}
                  {countries.length > COUNTRIES_SHOWN && <p className="tr-from-more">{L.moreCountries(countries.length - COUNTRIES_SHOWN)}</p>}
                </div>
              )}
            </div>

            <DepartureBoard rows={snap?.recent ?? []} total={snap?.total ?? 0} loaded={!!snap} failed={failed} />
          </div>
          <p className="tr-board-privacy">{REGISTERED.board.privacy}</p>
        </section>

        <nav aria-label="Free China Business Trip" className="tr-links tr-in" style={{ ["--d" as string]: "0.5s" }}>
          {REGISTERED.links.map((l) => (
            <Link key={l.href} href={l.href}>
              {l.label}
            </Link>
          ))}
        </nav>
      </div>
    </div>
  );
}
