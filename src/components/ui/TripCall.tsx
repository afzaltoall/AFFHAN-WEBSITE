"use client";

import Link from "next/link";
import { useEffect, useId, useRef, useState, type MouseEvent as ReactMouseEvent, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, KeyRound, Lock, LockOpen, Plane } from "lucide-react";
import { useQuoteGate } from "@/context/QuoteGateContext";
import { TRIP_SIGN_IN } from "@/components/TripAccess/content";
import { tripEntryHref } from "@/components/TripAccess/useTripStatus";
import { APPLICATION_WINDOW, applicationWindow, type WindowState } from "@/lib/trip-application";
import { TRIP_FACTS } from "@/lib/trip-legal";
import "./trip-call.css";

/**
 * Opens the Free China Business Trip from a press on its banner or on its
 * call (TripCall). The trip is for signed-in visitors, so a press asks first:
 * the site's sign-in popup if nobody is signed in (the trip opens the moment
 * they are), and then the trip's page, or the participants board for someone
 * who has registered already. Ctrl, ⌘, Shift, Alt or a middle click still
 * open a new tab, as links do, and the trip's own gate asks there.
 */
export function useOpenTrip() {
  const router = useRouter();
  const { requireLogin } = useQuoteGate();
  return (e: ReactMouseEvent<HTMLAnchorElement>) => {
    if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    e.preventDefault();
    requireLogin(() => void tripEntryHref().then((href) => router.push(href)), TRIP_SIGN_IN.reason);
  };
}

const DAY = 86_400_000;

/** "25 November 2026" -> "25 November". */
const dayMonth = (date: string) => date.split(" ").slice(0, 2).join(" ");

/** The days left to apply, as the line under the button says them. */
function daysLeft(now: number) {
  const days = Math.floor((APPLICATION_WINDOW.closes - now) / DAY);
  if (days < 0) return null;
  if (days === 0) return "last day to apply";
  return days === 1 ? "1 day left" : `${days} days left`;
}

/**
 * The trip banner's call to action: a button under the banner that says, in
 * words, what a press on it does ("Click to apply free"; "Tap" on a touch
 * screen), and keeps catching the eye without shouting: every few seconds
 * its little plane takes off and another glides in, a light sweeps across
 * it and its gold arrow nudges on (trip-call.css). Under it, one live line:
 * applications open, and the days left until they close.
 *
 * Every word follows the facts. Whether applications are open is the same
 * test the application form and the API make (applicationWindow), worked
 * out on the server for the first paint (`initialWindow`) and again here
 * each minute; the days left are counted here, once the page is running,
 * so the server never sends a figure the visitor's own clock disagrees
 * with. Before the window the button says "see the trip" and the line when
 * it opens; after it, when it closed. Someone already registered is not
 * asked to apply again: theirs opens the participants board, and says so.
 *
 * While the banner is locked (`lock`, TripLockOverlay: the owner's request
 * of 2026-10-05) it is a dark, gold-lettered button that opens nothing: a
 * padlock where the plane was, a key on the coin where the arrow was,
 * "Opening soon", and under it "Unlocks live, right here", because it does:
 * the moment an admin unlocks it, the lock opens on this page. Every few
 * seconds the padlock jiggles and the key turns, on the open button's loop.
 * A press on it, or on the banner (`rattle`), shakes it, as a head shakes no,
 * and the line says "Locked for now". As the lock opens its padlock opens
 * too ("Unlocking…"), and as it lets go the red button takes its place with
 * a pop ("fresh"), keeping the keyboard on it if it was there.
 */
export function TripCall({
  className = "",
  initialWindow,
  registered = false,
  lock,
  rattle = 0,
  onLockedPress,
}: {
  /** Placing and sizing: --call-h (the button's height) and --call-fs (its type). */
  className?: string;
  /** applicationWindow() as the server saw it, so the first paint is right. */
  initialWindow: WindowState;
  /** The signed-in visitor has registered already. */
  registered?: boolean;
  /** The banner's lock: locked, opening now, or just opened in front of the visitor. */
  lock?: "locked" | "unlocking" | "fresh";
  /** Presses on the lock so far (TripBanner): each new one shakes the button. */
  rattle?: number;
  /** A press on the locked button. */
  onLockedPress?: () => void;
}) {
  const open = useOpenTrip();
  const statusId = useId();
  const [win, setWin] = useState<WindowState>(initialWindow);
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => {
    const tick = () => {
      setWin(applicationWindow());
      setNow(Date.now());
    };
    tick();
    const id = window.setInterval(tick, 60_000);
    return () => window.clearInterval(id);
  }, []);

  const lockedButton = useRef<HTMLButtonElement>(null);
  const openLink = useRef<HTMLAnchorElement>(null);
  const keepFocus = useRef(false);
  const [denied, setDenied] = useState(false);
  // A press on the lock: the button shakes its head, and the line says why.
  useEffect(() => {
    if (!rattle || lock !== "locked") return;
    setDenied(true);
    if (!window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      lockedButton.current?.animate(
        [0, -5, 4, -3, 2, 0].map((x) => ({ transform: `translateX(${x}px)` })),
        { duration: 420, easing: "ease-out" },
      );
    }
    const t = window.setTimeout(() => setDenied(false), 2400);
    return () => window.clearTimeout(t);
  }, [rattle, lock]);
  // The button is replaced by the link as it opens: if the keyboard was on
  // the one, it goes to the other.
  useEffect(() => {
    if (lock === "unlocking") keepFocus.current = document.activeElement === lockedButton.current;
    if (lock === "fresh" && keepFocus.current) {
      keepFocus.current = false;
      openLink.current?.focus();
    }
  }, [lock]);

  if (lock === "locked" || lock === "unlocking") {
    const unlocking = lock === "unlocking";
    return (
      <div className={`trip-call ${className}`}>
        <button
          ref={lockedButton}
          type="button"
          aria-disabled="true"
          aria-describedby={statusId}
          onClick={unlocking ? undefined : onLockedPress}
          className="trip-call-button is-locked"
        >
          {unlocking ? <LockOpen aria-hidden className="trip-call-lock" /> : <Lock aria-hidden className="trip-call-lock" />}
          <span className="trip-call-label">
            {unlocking ? "Unlocking…" : "Opening soon"}
            <span className="sr-only">: Free China Business Trip, locked</span>
          </span>
          <span aria-hidden className="trip-call-go">
            <KeyRound />
          </span>
        </button>
        <p id={statusId} aria-live="polite" className="trip-call-status">
          <span aria-hidden className={`trip-call-dot ${unlocking ? "is-live" : "is-waiting"}`} />
          <span>{unlocking ? "Unlocking now" : denied ? <strong>Locked for now</strong> : "Unlocks live, right here"}</span>
        </p>
      </div>
    );
  }

  // "Click" for a mouse, "Tap" for a finger (trip-call.css shows one).
  const verb = (
    <>
      <span className="trip-call-click">Click</span>
      <span className="trip-call-tap">Tap</span>
    </>
  );
  let label: ReactNode;
  let status: ReactNode;
  let live = false;
  if (registered) {
    label = "View participants";
    status = "You're registered";
  } else if (win === "open") {
    label = <>{verb} to apply free</>;
    const left = now === null ? null : daysLeft(now);
    status = left ? (
      <>
        Applications open · <strong>{left}</strong>
      </>
    ) : (
      "Applications open"
    );
    live = true;
  } else {
    label = <>{verb} to see the trip</>;
    status = win === "before" ? `Applications open ${dayMonth(TRIP_FACTS.applicationsOpen)}` : `Applications closed ${dayMonth(TRIP_FACTS.applicationsClose)}`;
  }

  return (
    <div className={`trip-call ${className}`}>
      <Link
        ref={openLink}
        href="/free-china-trip/"
        onClick={open}
        aria-describedby={statusId}
        className={`trip-call-button${lock === "fresh" ? " is-fresh" : ""}`}
      >
        <Plane aria-hidden className="trip-call-plane" />
        <span className="trip-call-label">
          {label}
          <span className="sr-only">: Free China Business Trip</span>
        </span>
        <span aria-hidden className="trip-call-go">
          <ArrowRight />
        </span>
      </Link>
      <p id={statusId} aria-live={lock ? "polite" : undefined} className="trip-call-status">
        <span aria-hidden className={`trip-call-dot${live ? " is-live" : ""}`} />
        <span>{status}</span>
      </p>
    </div>
  );
}
