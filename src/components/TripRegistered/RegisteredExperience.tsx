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
import { BoardingPass } from "./BoardingPass";
import { REGISTERED } from "./content";
import { DepartureBoard } from "./DepartureBoard";
import { DrawCountdown } from "./DrawCountdown";
import { Odometer } from "./Odometer";
import "./registered.css";

/** How often the board asks for new registrations while the page is open. */
const POLL_MS = 12_000;

/**
 * /free-china-trip/registered/: the participants board, where a new
 * participant lands after submitting, and where the trip opens for anyone who
 * has registered already.
 *
 *  - For a participant: YOU'RE REGISTERED, their boarding pass (name, Trip ID,
 *    from, when), and, arriving from the application (WELCOME_KEY), a gold
 *    REGISTERED seal pressed on it.
 *  - For everyone: how many have registered, live (the count rolls up as new
 *    registrations arrive, with today's and the last hour's), the five places
 *    and the time left until the winners are announced, the newest
 *    registrations as a departures board, and the countries they come from.
 *  - For someone signed in who has not applied: the same, with the way in.
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
  /** Registrations that arrived while the page was open, for the "+N" beside the count. */
  const [gained, setGained] = useState(0);
  const [stamp, setStamp] = useState(false);
  const [arriving, setArriving] = useState(false);
  const last = useRef<number | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/trip-applications/participants/", { cache: "no-store", credentials: "same-origin" });
      if (!res.ok) throw new Error(String(res.status));
      const next = (await res.json()) as ParticipantsSnapshot;
      const delta = last.current === null ? 0 : next.total - last.current;
      if (delta > 0) setGained((g) => g + delta);
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

  // Arriving: from the application (the seal is pressed on the pass), or out
  // of the landing page's take-off (the light it ended on opens out).
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
  const total = snap?.total ?? 0;
  const first = registration?.firstName ?? "";

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

      <div className="relative z-10 mx-auto max-w-[1320px] px-5 pb-12 pt-8 sm:px-8 md:pt-10 lg:px-12">
        <header className="tr-in" style={{ ["--d" as string]: "0s" }}>
          <p className={EYEBROW}>{REGISTERED.eyebrow}</p>
          <h1 className={`${DISPLAY} tr-title`}>{registered ? REGISTERED.title.registered : REGISTERED.title.visitor}</h1>
          <p className="tr-lede">
            {registered && first ? <span className="text-(--cx-white)">{REGISTERED.welcome(first)} </span> : !registered && ready ? `${REGISTERED.visitor} ` : null}
            {REGISTERED.draw}
          </p>
        </header>

        <div className="mt-8 grid gap-6 lg:mt-10 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] lg:gap-8">
          <div className="grid content-start gap-6">
            {registered && registration ? (
              <div className="tr-in" style={{ ["--d" as string]: "0.15s" }}>
                <BoardingPass reg={registration} stamp={stamp} />
              </div>
            ) : (
              ready &&
              signedIn && (
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
              )
            )}

            <section className="tr-panel tr-pool tr-in" style={{ ["--d" as string]: "0.3s" }} aria-labelledby="tr-pool-title">
              <div className="flex items-baseline justify-between gap-4">
                <h2 id="tr-pool-title" className="tr-panel-title">
                  {REGISTERED.pool.title}
                </h2>
                <span className="tr-pool-line">{REGISTERED.pool.line}</span>
              </div>
              <ol className="tr-seats" aria-label={REGISTERED.pool.title}>
                {Array.from({ length: 5 }, (_, i) => (
                  <li key={i} className="tr-seat" style={{ ["--i" as string]: i }}>
                    <Plane size={18} strokeWidth={1.7} aria-hidden />
                    <span className="sr-only">Place {i + 1}</span>
                  </li>
                ))}
              </ol>
              <p className="tr-pool-when">
                {REGISTERED.pool.announced} · <span className="text-(--cx-gold-hi)">{REGISTERED.pool.date}</span>
              </p>
              <DrawCountdown />
            </section>
          </div>

          <div className="grid content-start gap-6">
            <section className="tr-panel tr-count-panel tr-in" style={{ ["--d" as string]: "0.2s" }} aria-labelledby="tr-count-title">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <h2 id="tr-count-title" className="tr-panel-title">
                    {REGISTERED.live.label}
                  </h2>
                  <div className="tr-total">
                    {snap ? <Odometer value={total} label={REGISTERED.live.places(total)} /> : <span className="tr-total-wait" aria-hidden>··</span>}
                    {gained > 0 && (
                      <span key={gained} className="tr-gained" aria-hidden>
                        +{gained}
                      </span>
                    )}
                  </div>
                  <p className="tr-places">{snap ? REGISTERED.live.places(total) : " "}</p>
                </div>
                <span className="tr-live">
                  <span aria-hidden className="tr-live-dot" />
                  {REGISTERED.live.tag}
                </span>
              </div>
              {snap && (
                <ul className="tr-stats">
                  <li>{REGISTERED.live.today(snap.today)}</li>
                  <li>{REGISTERED.live.lastHour(snap.lastHour)}</li>
                  <li>{REGISTERED.live.countries(snap.countries.length)}</li>
                </ul>
              )}
            </section>

            <div className="tr-in" style={{ ["--d" as string]: "0.35s" }}>
              <DepartureBoard rows={snap?.recent ?? []} loaded={!!snap} failed={failed} />
            </div>

            {snap && snap.countries.length > 0 && (
              <section className="tr-countries tr-in" style={{ ["--d" as string]: "0.45s" }} aria-labelledby="tr-countries-title">
                <h2 id="tr-countries-title" className="tr-panel-title">
                  {REGISTERED.countries}
                </h2>
                <ul className="tr-country-list">
                  {snap.countries.map((c) => (
                    <li key={c.country} className="tr-country">
                      {c.iso && (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={flagUrl(c.iso)} alt="" width={20} height={14} loading="lazy" className="tr-flag" />
                      )}
                      <span>{c.country}</span>
                      <span className="tr-country-n">{c.count}</span>
                    </li>
                  ))}
                </ul>
              </section>
            )}
          </div>
        </div>

        <nav aria-label="Free China Business Trip" className="tr-links tr-in" style={{ ["--d" as string]: "0.55s" }}>
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
