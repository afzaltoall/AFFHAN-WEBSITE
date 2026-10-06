"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { DISPLAY, EYEBROW } from "@/components/CinematicExperience/parts";
import { GoldDust } from "@/components/CinematicExperience/GoldDust";
import { TRIP_LOCKED } from "./content";
import { TripLockOverlay } from "./TripLockOverlay";
import { useTripBannerLock } from "./useTripBannerLock";
import { useTripStatus } from "./useTripStatus";
import "./trip-locked.css";

/** While it opens, how often the page asks whether the door lets it through yet, and how many times. */
const DOOR_MS = 1200;
const DOOR_TRIES = 25;
/** The page giving way to the trip, before it loads (trip-locked.css). */
const LEAVE_MS = 520;

/**
 * What every page under /free-china-trip/ shows while the trip is locked
 * (proxy.ts rewrites to it, so the address stays the one that was asked
 * for): "Opening soon", over the homepage banner sealed with the homepage's
 * own lock, larger (TripLockOverlay). A press on the lock shakes it, and the
 * line under it says "Locked for now".
 *
 * It opens live, as the banner does. It asks /api/trip-lock/ every ten
 * seconds or so while the tab is in view (useTripBannerLock); when an admin
 * unlocks the trip, the lock opens here, in front of whoever is waiting, and
 * the page gives way to the trip at the same address. Before it loads it,
 * it asks its own address until the door lets it through (the door reads the
 * lock through an edge copy up to five seconds old, so it can trail what
 * this page heard), so it never reloads into "Opening soon" again.
 *
 * Someone who registered before the trip was locked sees their Trip ID
 * (/api/trip-applications/me, their own registration only). Nothing else of
 * the trip is on this page, and it is not indexed.
 */
export function TripLockedExperience() {
  const lock = useTripBannerLock(true);
  const { registration } = useTripStatus();
  const [denied, setDenied] = useState(false);
  const [doorOpen, setDoorOpen] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const asking = useRef(false);
  const gone = useRef(false);
  useEffect(
    () => () => {
      gone.current = true;
    },
    [],
  );

  // A press on the lock: the line says why, for a moment.
  useEffect(() => {
    if (!lock.rattle || lock.phase !== "locked") return;
    setDenied(true);
    const t = window.setTimeout(() => setDenied(false), 2400);
    return () => window.clearTimeout(t);
  }, [lock.rattle, lock.phase]);

  // Unlocked: while the lock opens, ask this address until the door lets it
  // through. Once, and not tied to the lock's phases, which move on under it.
  useEffect(() => {
    if (lock.phase === "locked" || asking.current) return;
    asking.current = true;
    const ask = async (tries: number) => {
      if (gone.current) return;
      let open = tries >= DOOR_TRIES;
      if (!open) {
        try {
          const res = await fetch(window.location.href, { method: "HEAD", cache: "no-store", credentials: "same-origin" });
          open = res.headers.get("x-trip-lock") !== "locked";
        } catch {
          /* a hiccup: ask again */
        }
      }
      if (open) setDoorOpen(true);
      else window.setTimeout(() => void ask(tries + 1), DOOR_MS);
    };
    void ask(0);
  }, [lock.phase]);

  // Open, and the lock has let go: the page gives way to the trip.
  useEffect(() => {
    if (!doorOpen || lock.phase !== "open") return;
    setLeaving(true);
    const t = window.setTimeout(() => {
      // "Opening soon" asked for by its own address goes on to the trip itself.
      if (window.location.pathname.startsWith("/free-china-trip/locked")) window.location.assign("/free-china-trip/");
      else window.location.reload();
    }, LEAVE_MS);
    return () => window.clearTimeout(t);
  }, [doorOpen, lock.phase]);

  const S = TRIP_LOCKED.status;
  const opening = lock.phase !== "locked";
  const status = lock.phase === "locked" ? (denied ? S.denied : S.waiting) : lock.phase === "breaking" ? S.unlocking : S.opening;

  return (
    <div className={`tlk ${leaving ? "is-leaving" : ""}`}>
      <section className="tlk-stage" aria-labelledby="tlk-title">
        <div aria-hidden className="tlk-ground">
          <GoldDust className="absolute inset-0 h-full w-full" density={0.6} />
        </div>
        <div className="tlk-col">
          <p className={`${EYEBROW} tlk-in`} style={{ ["--d" as string]: "0s" }}>
            {TRIP_LOCKED.eyebrow}
          </p>
          <h1 id="tlk-title" className={`${DISPLAY} tlk-title tlk-in`} style={{ ["--d" as string]: "0.08s" }}>
            {TRIP_LOCKED.title}
          </h1>

          <div className="tlk-seal tlk-in" style={{ ["--d" as string]: "0.2s" }}>
            {/* Under the frost until it opens; the frost is drawn without it (trip-lock-overlay.css). */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/china-trip-hero.webp"
              srcSet="/china-trip-hero.webp 640w, /china-trip-hero-1280.webp 1280w"
              sizes="(max-width: 760px) calc(100vw - 2.5rem), 736px"
              width={1280}
              height={480}
              alt=""
              decoding="async"
              fetchPriority="low"
            />
            {lock.phase !== "open" && (
              <TripLockOverlay state={lock.phase === "locked" ? "locked" : "breaking"} rattle={lock.rattle} onPress={lock.press} />
            )}
          </div>

          <p role="status" aria-live="polite" className={`tlk-status tlk-in ${denied && !opening ? "is-denied" : ""}`} style={{ ["--d" as string]: "0.32s" }}>
            <span aria-hidden className={`tlk-dot ${opening ? "is-live" : ""}`} />
            <span>{status}</span>
          </p>
          <p className="tlk-line tlk-in" style={{ ["--d" as string]: "0.4s" }}>
            {TRIP_LOCKED.line}
          </p>

          {registration && (
            <p className="tlk-you tlk-in" style={{ ["--d" as string]: "0.48s" }}>
              <span>{TRIP_LOCKED.registered}</span>
              <span aria-hidden>·</span>
              <span className="tlk-you-id">{registration.referenceNo}</span>
            </p>
          )}

          <nav aria-label="AFFHAN" className="tlk-links tlk-in" style={{ ["--d" as string]: "0.52s" }}>
            {TRIP_LOCKED.links.map((l) => (
              <Link key={l.href} href={l.href}>
                {l.label}
              </Link>
            ))}
          </nav>
        </div>
      </section>
    </div>
  );
}
