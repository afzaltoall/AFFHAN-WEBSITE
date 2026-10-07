"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { ArrowRight, Plane, Ticket } from "lucide-react";
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
import { DepartureBoard, ago } from "./DepartureBoard";
import { DrawCountdown } from "./DrawCountdown";
import { DrawGlobe, type DrawGlobeHandle } from "./DrawGlobe";
import { Odometer } from "./Odometer";
import { FlightSeats } from "./FlightSeats";
import { flyTicketIn } from "./ticketFlight";
import "./registered.css";

/** How often the board asks for new registrations while the page is open. */
const POLL_MS = 12_000;
/** How long "+1 just now" stays beside the count after a registration arrives. */
const ARRIVED_MS = 6000;
/** How long a "Just registered" message stays. */
const TOAST_MS = 6500;
/** Countries listed by name before "and N more". */
const COUNTRIES_SHOWN = 5;
/** When the visitor's ticket leaves the pass for the globe: once the seal is down (later, arriving from the application). */
const FLIGHT_AT = { opened: 3000, arrived: 3400 } as const;
/**
 * On arriving, the last few registrations of the past day are told, as they were and with their
 * real times, once a visit: from when, how far apart, how many at most, how far back. The tab
 * remembers which have been told (TOLD_KEY), so a reload tells only what is new since.
 */
const REPLAY = { at: 5600, gap: 2600, most: 3, within: 24 * 3600_000 } as const;
const TOLD_KEY = "affhan:trip-told";

function readTold(): Set<string> {
  try {
    const v: unknown = JSON.parse(sessionStorage.getItem(TOLD_KEY) ?? "[]");
    return new Set(Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : []);
  } catch {
    return new Set();
  }
}
function saveTold(told: Set<string>) {
  try {
    sessionStorage.setItem(TOLD_KEY, JSON.stringify([...told].slice(-60)));
  } catch {
    /* no storage: they are told again next time */
  }
}

interface Toast {
  key: number;
  title: string;
  line: string;
  iso: string | null;
  mine?: boolean;
}

/**
 * /free-china-trip/registered/: the participants board, where a new
 * participant lands after submitting, and where the trip opens for anyone who
 * has registered already. Under the heading:
 *
 *  - yours, and where it goes: the participant's boarding pass (name, Trip
 *    ID, from, when; the plane flies its route and the seal comes down on its
 *    stub) under the heading, and beside the two, as tall as both, the draw
 *    globe, a ticket in it for every registration (DrawGlobe). Once the seal
 *    is down, the globe's lid opens, their ticket tears from the stub and
 *    flies in, where it glows, and the air mixes it in (the owner's idea of
 *    2026-10-07). Someone signed in who has not applied has the way in where
 *    the pass would be;
 *  - the draw: five places, as the five lit windows of the aircraft that
 *    will fly the winners, in flight over moving clouds (FlightSeats), the
 *    time left until the winners are announced, the day to add to a
 *    calendar;
 *  - everyone, live, in one panel: how many have registered, today's and the
 *    last hour's when they say something the count does not, the countries,
 *    and the newest registrations as a departures board.
 *
 * Live: every figure is the real one, read from the database every 12
 * seconds while the tab is visible (/api/trip-applications/participants/),
 * and the LIVE light blinks each time it is read. A registration that arrives
 * while the page is open drops into the globe, flips onto the board, rolls
 * the count, and says so in a message at the foot of the screen: "Just
 * registered", its Trip ID and its country. On arriving, the past day's last
 * few are told the same way, once a visit, with their real times
 * ("Registered 12 min ago"), a ticket in the globe catching the light as each
 * is. Anonymous by design, never a name: the trip's Privacy Policy publishes
 * nothing about anyone but the winners (sections 5 and 12;
 * lib/trip-participants.ts). Nothing here is a score, a rank or a chance of
 * winning: the draw is random among eligible applications, and nothing is
 * ever made up to look busy.
 */
export function RegisteredExperience() {
  const { ready, signedIn, registration } = useTripStatus();
  const [snap, setSnap] = useState<ParticipantsSnapshot | null>(null);
  const [failed, setFailed] = useState(false);
  /** Registrations that arrived while the page was open, said beside the count for a moment. */
  const [arrived, setArrived] = useState<{ n: number; at: number } | null>(null);
  const [stamp, setStamp] = useState(false);
  const [arriving, setArriving] = useState(false);
  /** Each read of the board, for the LIVE light's blink. */
  const [beat, setBeat] = useState(0);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const last = useRef<number | null>(null);
  const seenRefs = useRef<Set<string> | null>(null);
  const globeRef = useRef<DrawGlobeHandle>(null);
  const toastKey = useRef(0);
  const flown = useRef(false);
  const flightTimer = useRef(0);
  /** Messages and drops waiting their turn, cleared if the page goes. */
  const timers = useRef<number[]>([]);

  const toast = useCallback((t: Omit<Toast, "key">) => {
    const key = ++toastKey.current;
    setToasts((list) => [...list.slice(-2), { ...t, key }]);
    window.setTimeout(() => setToasts((list) => list.filter((x) => x.key !== key)), TOAST_MS);
  }, []);
  const later = useCallback((fn: () => void, ms: number) => {
    timers.current.push(window.setTimeout(fn, ms));
  }, []);
  useEffect(() => {
    const list = timers.current;
    return () => list.forEach((t) => window.clearTimeout(t));
  }, []);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/trip-applications/participants/", { cache: "no-store", credentials: "same-origin" });
      if (!res.ok) throw new Error(String(res.status));
      const next = (await res.json()) as ParticipantsSnapshot;
      const delta = last.current === null ? 0 : next.total - last.current;
      if (delta > 0) setArrived({ n: delta, at: Date.now() });
      last.current = next.total;
      const T = REGISTERED.live.toast;
      const before = seenRefs.current;
      const told = readTold();
      if (before) {
        // Lines new since the page opened, oldest first: each drops into the globe and says so, a
        // moment apart.
        const fresh = next.recent.filter((r) => !before.has(r.ref) && !r.you).slice(0, 6).reverse();
        fresh.forEach((r, i) =>
          later(() => {
            globeRef.current?.drop(false);
            toast({ title: T.title, line: T.line(r.ref, r.country), iso: r.iso });
          }, i * 900),
        );
      } else {
        // The first read: the past day's last few not told yet this visit, as they were, with their
        // real times. Their tickets are in the globe already; one catches the light as each is told.
        const now = Date.now();
        const earlier = next.recent
          .filter((r) => !r.you && !told.has(r.ref) && now - Date.parse(r.at) < REPLAY.within)
          .slice(0, REPLAY.most)
          .reverse();
        earlier.forEach((r, i) =>
          later(() => {
            const when = ago(r.at, Date.now());
            globeRef.current?.glint();
            toast({ title: when === "Just now" ? T.title : T.earlier(when), line: T.line(r.ref, r.country), iso: r.iso });
          }, REPLAY.at + i * REPLAY.gap),
        );
      }
      for (const r of next.recent) told.add(r.ref);
      saveTold(told);
      seenRefs.current = new Set([...(before ?? []), ...next.recent.map((r) => r.ref)]);
      setSnap(next);
      setFailed(false);
      setBeat((b) => b + 1);
    } catch {
      setFailed(true);
    }
  }, [toast, later]);

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
  const still = typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  // The globe is made once the count and the visitor are both known.
  const globeReady = !!snap && ready;

  // Once the seal is down, the visitor's ticket flies from the pass into the globe. Once a visit;
  // under reduced motion it is in the globe from the start.
  useEffect(() => {
    if (!globeReady || !registration || flown.current || still) return;
    flown.current = true;
    const ref = registration.referenceNo;
    flightTimer.current = window.setTimeout(
      () =>
        flyTicketIn(globeRef.current, ref, () => {
          if (stamp) toast({ title: REGISTERED.live.toast.mineTitle, line: REGISTERED.live.toast.mine(ref), iso: null, mine: true });
        }),
      stamp ? FLIGHT_AT.arrived : FLIGHT_AT.opened,
    );
  }, [globeReady, registration, still, stamp, toast]);
  useEffect(() => () => window.clearTimeout(flightTimer.current), []);

  const first = registration?.firstName ?? "";
  const L = REGISTERED.live;
  const P = REGISTERED.pool;
  const G = REGISTERED.globe;

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
        {/* The heading and yours under it; beside both on a wide screen, as tall as the two, the globe
            it goes into (registered.css, .tr-top). */}
        <div className="tr-top">
          {/* Held, unseen, until it is known who is reading (the sign-in and the registration are read in
              the browser), then risen in: the heading never says "The participants" to a participant first. */}
          <header key={ready ? "known" : "reading"} className={`tr-head tr-in ${ready ? "" : "invisible"}`} style={{ ["--d" as string]: "0s" }}>
            <p className={EYEBROW}>{REGISTERED.eyebrow}</p>
            <h1 className={`${DISPLAY} tr-title`}>{registered ? REGISTERED.title.registered : REGISTERED.title.visitor}</h1>
            <p className="tr-lede">
              {registered && first ? <span className="text-(--cx-white)">{REGISTERED.welcome(first)}</span> : `${REGISTERED.visitor} ${REGISTERED.draw}`}
            </p>
          </header>

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

          {/* Not a panel: the globe stands on the page itself, in its own light. */}
          <section className="tr-globe tr-in" style={{ ["--d" as string]: "0.25s" }} aria-labelledby="tr-globe-title">
            <p className="tr-panel-title">{G.eyebrow}</p>
            <h2 id="tr-globe-title" className={`${DISPLAY} tr-globe-title`}>
              {G.title}
            </h2>
            {/* Its room is held until the count is known. */}
            <div className="tr-globe-wrap">
              {globeReady && snap && (
                <DrawGlobe
                  ref={globeRef}
                  count={snap.total}
                  mine={registered}
                  holdMine={registered && !still}
                  label={G.label(snap.total, registered)}
                  shakeLabel={G.shake}
                />
              )}
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

        {/* Everyone, live. */}
        <section className="tr-panel tr-live-panel tr-in mt-6 lg:mt-8" style={{ ["--d" as string]: "0.38s" }} aria-labelledby="tr-count-title">
          <div className="tr-live-grid">
            <div className="tr-summary">
              <div className="flex items-center justify-between gap-4">
                <h2 id="tr-count-title" className="tr-panel-title">
                  {L.label}
                </h2>
                <span className="tr-live" title={L.checked}>
                  <span key={beat} aria-hidden className={`tr-live-dot ${beat > 1 ? "is-beat" : ""}`} />
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

      {/* Registrations arriving while the page is open, said as they come. */}
      <div className="tr-toasts" role="status" aria-live="polite">
        {toasts.map((t) => (
          <div key={t.key} className={`tr-toast ${t.mine ? "is-mine" : ""}`}>
            <span aria-hidden className="tr-toast-mark">
              {t.mine ? <Ticket size={15} strokeWidth={2} /> : <Plane size={15} strokeWidth={2} />}
            </span>
            <span className="tr-toast-text">
              <span className="tr-toast-title">{t.title}</span>
              <span className="tr-toast-line">
                {t.iso && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={flagUrl(t.iso)} alt="" width={18} height={12} className="tr-flag" />
                )}
                {t.line}
              </span>
            </span>
            <span aria-hidden className="tr-toast-time" style={{ ["--ms" as string]: `${TOAST_MS}ms` }} />
          </div>
        ))}
      </div>
    </div>
  );
}
