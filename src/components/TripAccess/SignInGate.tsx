"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { Plane } from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { useQuoteGate } from "@/context/QuoteGateContext";
import { displayFont } from "@/components/CinematicExperience/fonts";
import { GoldButton } from "@/components/TripApplication/StepNav";
import "@/components/CinematicExperience/cinematic.css";
import { TRIP_SIGN_IN } from "./content";
import "./trip-access.css";

/**
 * The Free China Business Trip is for signed-in visitors: its page, the
 * application and the participants board each render this, and someone who
 * is not signed in sees the page frosted behind a pane of dark glass, with the
 * site's own sign-in popup (LoginModal, through the QuoteGate's requireLogin)
 * opening over it by itself. Signed in, by the popup or the navbar's Login,
 * the gate simply lifts and the page carries on: nothing reloads.
 *
 * Closing the popup without signing in leaves the gate with its own Sign in
 * button and a way home. The navbar stays above it, usable. While it stands,
 * the page under it is inert and still (no scrolling, no Tab into it), and the
 * film's smooth scrolling is paused.
 *
 * It waits for the session check before deciding (AuthContext's loading), so
 * someone signed in never sees it flash.
 */
export function TripSignInGate() {
  const { user, loading } = useAuth();
  const { requireLogin } = useQuoteGate();
  const gated = !loading && !user;
  const [mounted, setMounted] = useState(false);
  const asked = useRef(false);

  useEffect(() => setMounted(true), []);

  // While it stands, the page behind it is still and out of reach.
  useEffect(() => {
    if (!gated) return;
    const main = document.querySelector("main");
    main?.setAttribute("inert", "");
    const html = document.documentElement;
    const before = html.style.overflow;
    html.style.overflow = "hidden";
    const lenis = (window as unknown as { lenis?: { stop(): void; start(): void } }).lenis;
    lenis?.stop();
    return () => {
      main?.removeAttribute("inert");
      html.style.overflow = before;
      lenis?.start();
    };
  }, [gated]);

  // Closed without signing in: focus comes back to the gate's own button.
  const ask = () => requireLogin(() => {}, TRIP_SIGN_IN.reason, () => document.querySelector<HTMLElement>("[data-trip-gate] button")?.focus());

  // The sign-in popup opens by itself, once, a moment after the gate does.
  useEffect(() => {
    if (!gated) return;
    const t = window.setTimeout(() => {
      if (asked.current) return;
      asked.current = true;
      ask();
    }, 500);
    return () => window.clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gated]);

  if (!mounted || !gated) return null;

  return createPortal(
    <div data-trip-gate className={`${displayFont.variable} cx trip-gate`} role="dialog" aria-modal="false" aria-labelledby="trip-gate-title">
      <div className="trip-gate-card">
        <span aria-hidden className="trip-gate-mark">
          <Plane size={20} strokeWidth={1.8} />
        </span>
        <p className="trip-gate-eyebrow">{TRIP_SIGN_IN.eyebrow}</p>
        <h2 id="trip-gate-title" className="trip-gate-title">
          {TRIP_SIGN_IN.title.map((line) => (
            <span key={line}>{line}</span>
          ))}
        </h2>
        <p className="trip-gate-line">{TRIP_SIGN_IN.line}</p>
        <GoldButton type="button" onClick={ask}>
          {TRIP_SIGN_IN.button}
        </GoldButton>
        <Link href={TRIP_SIGN_IN.home.href} className="trip-gate-home">
          {TRIP_SIGN_IN.home.label}
        </Link>
      </div>
    </div>,
    document.body,
  );
}
