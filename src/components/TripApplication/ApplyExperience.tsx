"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import gsap from "gsap";
import { SplitText } from "gsap/SplitText";
import { Turnstile, type TurnstileInstance } from "@marsidev/react-turnstile";
import { applicationWindow, validateAll, type FieldErrors, type WindowState } from "@/lib/trip-application";
import { ARRIVAL_KEY, takeOff } from "@/components/CinematicExperience/takeoff";
import { TakeOffLayer } from "@/components/CinematicExperience/TakeOffLayer";
import { WELCOME_KEY, useTripStatus } from "@/components/TripAccess/useTripStatus";
import { useAuth } from "@/context/AuthContext";
import { TRIP_REGISTERED_HREF } from "@/lib/trip-legal";
import { TURNSTILE_SITE_KEY } from "@/lib/turnstile-site-key";
import { PHONE_QUERY } from "@/lib/useIsPhone";
import { revertTextFx, textIn } from "@/components/CinematicExperience/textfx";
import { agreeToTripTerms, hasAgreedToTripTerms } from "@/components/TripLegal/approval";
import { ConsentGate } from "@/components/TripLegal/ConsentGate";
import "@/components/CinematicExperience/cinematic.css";
import "./apply.css";
import { ApplicationIntro } from "./ApplicationIntro";
import { Atmosphere, Host, type Mood } from "./Atmosphere";
import { ApplicationForm } from "./ApplicationForm";
import { FAILURE, PAGE_TITLE, SUBMIT, SUCCESS } from "./content";
import { StepHeader } from "./StepHeader";
import { StepNav } from "./StepNav";
import { StepScroll } from "./StepScroll";
import { SubmitStage } from "./SubmitStage";
import { submitApplication } from "./submitApplication";
import { toPayload, useApplication } from "./useApplication";

/**
 * /free-china-trip/apply/: the application as the next chapter of the film.
 *
 *   intro ──Start──▶ [agree] ──▶ the questions ──Submit──▶ sending ──▶ received
 *                                                    └──▶ failed ──▶ (try again | back to the answers)
 *
 * One page (the owner, 2026-10-29, with their list: "single page edhu matu
 * use panalam indha contents"): name, mobile, country, city, doing business
 * or not, valid passport (ApplicationForm), and Submit. No steps, no review.
 *
 * On a computer the intro plays first, whether the visitor came through the
 * landing page's transition or opened this address directly. Start asks for
 * the trip's Terms & Conditions and Privacy Policy (TripLegal/ConsentGate)
 * unless they were agreed on the landing page a moment ago. That agreement is
 * all the application asks: its Privacy Policy and Terms consents, and the
 * third, accurate information, which the Terms themselves require (clause 2).
 * Nothing is asked again at Submit (the owner, 2026-10-29: "in start of
 * opening we asked terms and conditions and privacy policy soo dont need in
 * here").
 * Outside the application window (12 October to 25 November 2026, on a
 * production build) the intro says when applications open, or that they have
 * closed, in place of Start.
 *
 * On a phone there is no intro (the owner, 2026-10-28: "dont show start
 * application"): the Terms & Conditions and the Privacy Policy come first, in
 * the popup's phone sheet, over the page, and agreeing opens the questions;
 * agreed a moment ago (the landing page asks before its take-off), they open
 * at once, out of the take-off's light. Closing the sheet leaves the
 * application: back where the visitor came from in the site, or to the trip's
 * page. Outside the window the intro still says so.
 *
 * No account is needed (2026-10-28). Someone signed in has their details filled
 * in; someone who is not passes Cloudflare's check (out of sight unless
 * Cloudflare wants them to do something), and Submit waits for it.
 *
 * One screen, fixed: the heading at the top, Submit at the bottom, and only
 * the questions between them scroll, when they are taller than the screen
 * (StepScroll). The page itself never scrolls.
 *
 * All state lives in useApplication. Submit checks every answer: one missing
 * is said under its question, and the first takes focus. The request starts
 * the moment it passes and the animation runs alongside it; success is shown
 * only when the server has confirmed it.
 *
 * Motion is GSAP on transform, opacity and a little filter, all of it here,
 * so the choreography reads in one place. Reduced motion keeps every screen
 * and every function with fades in place of movement.
 */

const useIsoLayoutEffect = typeof window !== "undefined" ? useLayoutEffect : useEffect;

/** "consent": a phone, before the first question, while the Terms & Conditions are asked. */
type Phase = "intro" | "consent" | "form" | "sending" | "failed" | "received";

/** Whether this page was reached by a move inside the site (so Back returns there), not opened or reloaded here. */
function arrivedInSite() {
  try {
    const nav = performance.getEntriesByType("navigation")[0] as PerformanceNavigationTiming | undefined;
    return !!nav && new URL(nav.name).pathname !== window.location.pathname;
  } catch {
    return false;
  }
}

/** The answers in the order the page asks them: the first one missing takes focus. */
const FIELD_ORDER = ["fullName", "phone", "country", "city", "businessStatus", "hasPassport"] as const;

/**
 * Where the host stands, on a desktop: large in the intro, then one steady
 * place beside the questions, whole, sharp and bright; gone while sending;
 * back beside them after. The questions' sky is Atmosphere's first mood.
 */
const HOST: Record<"form" | "done", gsap.TweenVars> = {
  form: { xPercent: 4, yPercent: 0, scale: 0.8, autoAlpha: 1, filter: "blur(0px) brightness(1)" },
  done: { xPercent: 8, yPercent: 0, scale: 0.74, autoAlpha: 0.75, filter: "blur(0px) brightness(1)" },
};

const sleep = (ms: number) => new Promise<null>((resolve) => window.setTimeout(() => resolve(null), ms));

export function ApplyExperience() {
  const app = useApplication();
  const router = useRouter();
  const { registration } = useTripStatus();
  const { user, loading: authLoading } = useAuth();
  /** Not signed in: Cloudflare's check goes with the application (the API asks for it then, and only then). */
  const needsHuman = !!TURNSTILE_SITE_KEY && !authLoading && !user;
  const [humanToken, setHumanToken] = useState<string | null>(null);
  /** Cloudflare wants the visitor to do something: the widget shows, under the buttons. */
  const [humanShowing, setHumanShowing] = useState(false);
  /** Cloudflare's check could not run: Submit says so instead of "one moment" (the widget keeps retrying). */
  const [humanFailed, setHumanFailed] = useState(false);
  const humanRef = useRef<TurnstileInstance>(null);
  /** The token as it is now, for a send that waits for it (a retry, just after the widget was reset). */
  const humanTokenRef = useRef<string | null>(null);
  /** A token given or taken back: into the ref at once (a send may be waiting on it), and the state, for Submit. */
  const takeHumanToken = useCallback((token: string | null) => {
    humanTokenRef.current = token;
    setHumanToken(token);
    if (token) setHumanFailed(false);
  }, []);
  const root = useRef<HTMLDivElement>(null);
  const liveRef = useRef<HTMLParagraphElement>(null);
  const [phase, setPhase] = useState<Phase>("intro");
  const [reference, setReference] = useState<string | null>(null);
  /** When the database recorded it (ISO), for the submitted moment. */
  const [registeredAt, setRegisteredAt] = useState<string | null>(null);
  const [failure, setFailure] = useState("");
  /** The failure cannot be cured by sending again (a duplicate, or the window closed): no Try again. */
  const [failureFinal, setFailureFinal] = useState(false);
  /** Whether applications are being taken (lib/trip-application.ts): read in the browser, after the first render. */
  const [win, setWin] = useState<WindowState>("open");
  /** The consent popup, asked for by Start (the button focus goes back to). */
  const [asking, setAsking] = useState<{ from: HTMLElement | null } | null>(null);

  /** A transition is playing: further clicks wait for it. */
  const busy = useRef(true);
  const reduce = useRef(false);
  /** The heading has come in (with the questions, the first time only). */
  const headShown = useRef(false);
  const introTl = useRef<gsap.core.Timeline | null>(null);
  /** Opened through the landing page's take-off: decided once (the flag is
   *  read and cleared), kept here so a development re-run of the intro
   *  effect opens the same way. */
  const fromLightRef = useRef<boolean | null>(null);
  /** The questions being printed, so a quick Submit can finish it at once. */
  const enterTl = useRef<gsap.core.Timeline | null>(null);
  const running = useRef(new Set<gsap.core.Animation>());

  const track = <T extends gsap.core.Animation>(a: T) => {
    running.current.add(a);
    return a;
  };
  const $ = (key: string) => root.current?.querySelector<HTMLElement>(`[data-ax="${key}"]`) ?? null;
  const $$ = (key: string) => Array.from(root.current?.querySelectorAll<HTMLElement>(`[data-ax="${key}"]`) ?? []);

  const announce = (text: string) => {
    const el = liveRef.current;
    if (!el) return;
    el.textContent = "";
    window.setTimeout(() => {
      el.textContent = text;
    }, 60);
  };

  const toMood = (tl: gsap.core.Timeline, mood: Mood, at: number, duration = 1.1) => {
    for (const el of $$("mood")) tl.to(el, { autoAlpha: el.dataset.mood === mood ? 1 : 0, duration, ease: "power1.inOut" }, at);
  };

  /** The gold light trail, as a moving transition (never left on screen). */
  const trail = (tl: gsap.core.Timeline, at: number, tilt: number) => {
    const el = $("trail");
    if (!el) return;
    tl.set(el, { xPercent: -70, scaleX: 0.6, rotation: tilt - 4, autoAlpha: 0 }, at);
    tl.to(el, { xPercent: 25, scaleX: 1.1, rotation: tilt, duration: 1.15, ease: "power2.inOut" }, at);
    tl.to(el, { autoAlpha: 0.9, duration: 0.35, ease: "power1.out" }, at);
    tl.to(el, { autoAlpha: 0, duration: 0.5, ease: "power1.in" }, at + 0.65);
  };

  const focusFirst = (errors: FieldErrors) => {
    const key = FIELD_ORDER.find((k) => errors[k]);
    if (key) document.getElementById(`ax-${key}`)?.focus();
  };

  // ---- The intro: plays on arrival, however the visitor arrived ----------------
  useIsoLayoutEffect(() => {
    reduce.current = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    gsap.registerPlugin(SplitText);
    // Came through the landing page's take-off (takeoff.ts)? Then open out of
    // its light: the frame it ended on is the frame this page starts on.
    if (fromLightRef.current === null) {
      fromLightRef.current = false;
      try {
        const at = Number(sessionStorage.getItem(ARRIVAL_KEY));
        sessionStorage.removeItem(ARRIVAL_KEY);
        fromLightRef.current = !reduce.current && at > 0 && Date.now() - at < 8000;
      } catch {
        /* no storage: the intro opens from dark */
      }
    }
    const fromLight = fromLightRef.current;
    // A phone, while applications are being taken: no intro. The sky and the host as the questions have them;
    // the Terms & Conditions first, unless agreed a moment ago, then the questions print themselves in (below).
    if (window.matchMedia(PHONE_QUERY).matches && applicationWindow() === "open") {
      gsap.set($("host"), { ...HOST.form, x: 0 });
      gsap.set($("dust"), { autoAlpha: 0.45 });
      for (const el of $$("mood")) gsap.set(el, { autoAlpha: el.dataset.mood === "0" ? 1 : 0 });
      if (fromLight) {
        // The take-off's light opens out over the questions, as it does over the intro.
        const arrive = $("arrive");
        gsap.set(arrive, { autoAlpha: 1 });
        track(gsap.to(arrive, { autoAlpha: 0, duration: 1.1, delay: 0.14, ease: "power1.inOut" }));
        track(gsap.fromTo(arrive?.firstElementChild ?? null, { scale: 1 }, { scale: 1.3, duration: 1.1, delay: 0.14, ease: "power1.inOut" }));
      }
      if (hasAgreedToTripTerms()) {
        app.update("consent", { privacy: true, terms: true });
        setPhase("form");
        return;
      }
      setPhase("consent");
      // The sheet once the page has settled, not while it is still being hydrated: it makes everything behind it
      // inert, and the site's bar (in a Suspense boundary) hydrates a moment after this page; reached first, it
      // carried an `inert` React had not rendered (a hydration mismatch, 2026-10-28).
      const ask = () => setAsking({ from: null });
      const idle = "requestIdleCallback" in window ? window.requestIdleCallback(ask, { timeout: 1200 }) : 0;
      const late = idle ? 0 : window.setTimeout(ask, 250);
      return () => {
        if (idle) window.cancelIdleCallback(idle);
        window.clearTimeout(late);
      };
    }
    gsap.set($("host"), { filter: "blur(0px) brightness(1)" });
    const lines = $$("intro-line");
    const tl = track(gsap.timeline({ defaults: { ease: "power3.out" } }));
    introTl.current = tl;
    // Everything a beat later when opening out of the light.
    const o = fromLight ? 0.22 : 0;
    // The way in works as soon as it can be seen.
    tl.call(() => void (busy.current = false), [], reduce.current ? 0.2 : 1.6 + o);
    if (reduce.current) {
      tl.to([$("intro-host-m"), $("host"), $("intro-eyebrow"), ...lines, $("intro-support"), $("intro-body"), $("intro-cta")], { autoAlpha: 1, duration: 0.6, stagger: 0.04 }, 0);
      tl.to($("dust"), { autoAlpha: 1, duration: 0.8 }, 0);
      tl.to($("rule"), { autoAlpha: 0.45, duration: 0.8 }, 0);
    } else {
      if (fromLight) {
        // The light the plane left behind opens out, and its contrail carries on across.
        const arrive = $("arrive");
        gsap.set(arrive, { autoAlpha: 1 });
        // It holds a moment at full, exactly as the take-off left it, then opens.
        tl.to(arrive, { autoAlpha: 0, duration: 1.1, ease: "power1.inOut" }, 0.14);
        tl.fromTo(arrive?.firstElementChild ?? null, { scale: 1 }, { scale: 1.3, duration: 1.1, ease: "power1.inOut" }, 0.14);
        trail(tl, 0.1, 6);
      }
      tl.to($("dust"), { autoAlpha: 1, duration: 2.6, ease: "power1.out" }, 0);
      tl.fromTo($("rule"), { autoAlpha: 1, scaleX: 0 }, { scaleX: 1, duration: 1.4, ease: "power3.inOut" }, 0.15 + o);
      tl.to($("rule"), { autoAlpha: 0.45, duration: 1.2 }, 1.6 + o);
      // The host comes in from the right, out of the light (blur to sharp),
      // and light passes across him, cut to his silhouette, as he settles.
      tl.fromTo($("host"), { autoAlpha: 0, x: 120, scale: 0.94, filter: "blur(10px) brightness(1.35)" }, { autoAlpha: 1, x: 0, scale: 1, filter: "blur(0px) brightness(1)", duration: 1.4 }, 0.4 + o);
      tl.set($("host-sheen"), { autoAlpha: 1 }, 1.25 + o);
      tl.fromTo($("host-band"), { xPercent: -100 }, { xPercent: 222, duration: 1.0, ease: "power2.inOut" }, 1.25 + o);
      tl.to($("host-sheen"), { autoAlpha: 0, duration: 0.3 }, 2.15 + o);
      tl.fromTo($("intro-host-m"), { autoAlpha: 0, y: 24 }, { autoAlpha: 1, y: 0, duration: 1.1 }, 0.3 + o);
      // The words: the eyebrow typed, the heading's letters rising out of
      // their lines, the line and the paragraph word by word (textfx.ts, the
      // same hand as the film's titles). Each piece holds its first frame
      // from now, so the containers can show at once.
      const words = [$("intro-eyebrow"), ...lines, $("intro-support"), $("intro-body")];
      textIn(tl, $("intro-eyebrow"), "type", 0.45 + o, 0.5);
      lines.forEach((line, i) => textIn(tl, line, "rise", 0.62 + o + i * 0.16, 0.9));
      textIn(tl, $("intro-support"), "words", 1.1 + o, 0.6);
      textIn(tl, $("intro-body"), "words", 1.25 + o, 0.7);
      gsap.set(words, { autoAlpha: 1 });
      tl.fromTo($("intro-cta"), { autoAlpha: 0, y: 16 }, { autoAlpha: 1, y: 0, duration: 0.8 }, 1.5 + o);
    }
    return () => {
      tl.kill();
      revertTextFx();
    };
    // Once, on arrival.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Everything still moving stops when the page goes.
  useEffect(() => {
    const set = running.current;
    return () => {
      set.forEach((a) => a.kill());
    };
  }, []);

  /**
   * Start application: the agreement first. Agreed already (on the landing
   * page, a moment ago), straight on; otherwise the popup asks, and agreeing
   * there starts.
   */
  const requestStart = () => {
    if (busy.current) return;
    if (hasAgreedToTripTerms()) {
      app.update("consent", { privacy: true, terms: true });
      void start();
      return;
    }
    setAsking({ from: root.current?.querySelector<HTMLElement>("[data-ax-start]") ?? null });
  };
  // Accepted in the popup: the application's Privacy Policy and Terms consents.
  const agreed = () => {
    agreeToTripTerms();
    app.update("consent", { privacy: true, terms: true });
    setAsking(null);
    void start();
  };
  // A phone's way in: agreed, the questions print themselves in as the sheet goes (their own effect, below).
  const agreedFirst = () => {
    agreeToTripTerms();
    app.update("consent", { privacy: true, terms: true });
    setAsking(null);
    setPhase("form");
  };
  // Asked again from Submit (the agreement was missing): agreed, the application goes.
  const agreedToSend = () => {
    agreeToTripTerms();
    app.update("consent", { privacy: true, terms: true });
    const from = asking?.from ?? null;
    setAsking(null);
    void send(from, true);
  };
  // Closed without agreeing, on a phone: there is no application without the agreement, so the visitor goes
  // back where they came from in the site, or, having opened the application here, to the trip's page.
  const leaveFirst = () => {
    setAsking(null);
    if (arrivedInSite()) router.back();
    else router.replace("/free-china-trip/");
  };

  // Applications are taken from 12 October to 25 November 2026 (Terms, clause
  // 1). Read here, in the browser, so a page built before the date still
  // knows; the API keeps the same window whatever the browser thinks.
  useEffect(() => {
    setWin(applicationWindow());
  }, []);

  // Registered already (one application per person): to their boarding pass,
  // where their Trip ID is, instead of a second application.
  useEffect(() => {
    if (registration && (phase === "intro" || phase === "consent" || phase === "form")) router.replace(TRIP_REGISTERED_HREF);
  }, [registration, phase, router]);

  /** The application starts: the button glows, a gold trail passes, the intro leaves, the questions arrive. */
  const start = async () => {
    if (busy.current) return;
    busy.current = true;
    // Anything of the intro still arriving arrives now, then everything leaves.
    introTl.current?.progress(1).kill();
    const btn = root.current?.querySelector<HTMLElement>("[data-ax-start]");
    const leaving = [$("intro-host-m"), $("intro-eyebrow"), ...$$("intro-line"), $("intro-support"), $("intro-body"), $("intro-cta")];
    const tl = track(gsap.timeline());
    if (reduce.current) {
      tl.to([...leaving, $("rule")], { autoAlpha: 0, duration: 0.3 }, 0);
      tl.to($("host"), { autoAlpha: 0, duration: 0.25 }, 0);
      tl.set($("host"), { ...HOST.form, autoAlpha: 0 }, 0.25);
      tl.to($("host"), { autoAlpha: HOST.form.autoAlpha, duration: 0.35 }, 0.3);
      toMood(tl, "0", 0, 0.5);
      tl.to($("dust"), { autoAlpha: 0.45, duration: 0.5 }, 0);
    } else {
      tl.fromTo(btn?.querySelector("[data-ax-glow]") ?? null, { autoAlpha: 0, scale: 0.85 }, { autoAlpha: 1, scale: 1.12, duration: 0.35, ease: "power2.out" }, 0);
      tl.to(btn ?? null, { scale: 0.97, duration: 0.16, ease: "power2.out" }, 0);
      tl.to(btn ?? null, { scale: 1, duration: 0.3, ease: "power2.out" }, 0.16);
      trail(tl, 0.12, -2);
      tl.to(leaving, { autoAlpha: 0, y: -24, filter: "blur(6px)", duration: 0.5, stagger: 0.035, ease: "power2.in" }, 0.28);
      tl.to($("rule"), { autoAlpha: 0, duration: 0.6 }, 0.3);
      tl.to($("host"), { ...HOST.form, x: 0, duration: 1.05, ease: "power3.inOut" }, 0.3);
      toMood(tl, "0", 0.35);
      tl.to($("dust"), { autoAlpha: 0.45, duration: 1.2 }, 0.4);
    }
    await new Promise<void>((resolve) => tl.call(resolve, [], reduce.current ? 0.3 : 0.85));
    setPhase("form");
  };

  /** The questions' lines, top to bottom, then Submit. */
  const formRows = (view: HTMLElement) => {
    const body = view.querySelector<HTMLElement>("[data-ax-body]")?.firstElementChild as HTMLElement | null;
    const nav = view.querySelector<HTMLElement>("[data-ax='nav']");
    const rows = body ? (Array.from(body.children) as HTMLElement[]) : [];
    if (nav) rows.push(nav);
    return rows;
  };
  /** How far down the page each line sits, 0 (top) to 1 (bottom). */
  const depthOf = (view: HTMLElement, rows: HTMLElement[]) => {
    const r = view.getBoundingClientRect();
    return rows.map((row) => Math.min(1, Math.max(0, (row.getBoundingClientRect().top - r.top) / Math.max(1, r.height))));
  };

  // ---- The questions arrive ----------------------------------------------------------
  // Printed by a line of light, one line at a time, top to bottom (out of the intro, the phone's sheet, or back
  // from a failed send); the heading fades in with them the first time.
  useIsoLayoutEffect(() => {
    if (phase !== "form") return;
    const view = root.current?.querySelector<HTMLElement>("[data-ax-view='step']");
    if (!view) return;
    const tl = track(gsap.timeline());
    enterTl.current = tl;
    if (reduce.current) {
      tl.fromTo(view, { autoAlpha: 0 }, { autoAlpha: 1, duration: 0.3 });
      tl.call(() => void (busy.current = false), [], 0.15);
    } else {
      const rows = formRows(view);
      const depth = depthOf(view, rows);
      const H = view.offsetHeight;
      // A taller page takes a little longer to print.
      const PRINT = Math.min(0.95, 0.5 + H / 2400);
      gsap.set(view, { autoAlpha: 1 });
      gsap.set(rows, { autoAlpha: 0 });
      const scan = $("scan");
      tl.fromTo(scan, { y: 0, autoAlpha: 0 }, { y: H, duration: PRINT, ease: "power1.inOut" }, 0);
      tl.to(scan, { autoAlpha: 1, duration: 0.1 }, 0);
      tl.to(scan, { autoAlpha: 0, duration: 0.25 }, PRINT - 0.12);
      rows.forEach((row, i) => {
        tl.fromTo(row, { autoAlpha: 0, y: 18, filter: "blur(6px)" }, { autoAlpha: 1, y: 0, filter: "blur(0px)", duration: 0.6, ease: "expo.out", clearProps: "transform,filter" }, 0.03 + depth[i] * PRINT * 0.9);
      });
      // Ready once the first lines are down; a Submit pressed during the print finishes it at once (send, below).
      tl.call(() => void (busy.current = false), [], Math.min(0.5, PRINT * 0.55));
    }
    if (!headShown.current) {
      headShown.current = true;
      tl.fromTo($("step-head"), { autoAlpha: 0, y: -8 }, { autoAlpha: 1, y: 0, duration: 0.6, ease: "power2.out" }, 0);
    }
    // The title takes focus once it can be seen (hidden things can't take focus; the first time it is still fading in).
    tl.call(() => document.getElementById("ax-step-title")?.focus({ preventScroll: true }), [], 0.3);
    return () => void tl.kill();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase]);

  /** Submit: every answer checked first (send). */
  const onSubmit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (busy.current) return;
    void send((e.nativeEvent as SubmitEvent).submitter as HTMLElement | null);
  };

  // ---- Sending --------------------------------------------------------------------
  /** The flight layer (TakeOffLayer): the plane Submit launches. */
  const flightLayer = () => root.current?.querySelector<HTMLElement>("[data-cx='exit']") ?? null;

  /**
   * The light of time: a point of light sweeping the clock face like a second
   * hand, the ticks flaring as it passes and fading behind it. Driven from
   * GSAP's ticker by an angle that only grows, so it can quicken smoothly
   * (speed is tweenable) and, once `fillFrom` is set, light every tick it
   * passes for good; when it has gone all the way round from there, onFull.
   */
  const clock = useRef<{
    angle: number;
    speed: number;
    fillFrom: number | null;
    full: boolean;
    onFull: (() => void) | null;
    stop: () => void;
  } | null>(null);
  const stopClock = () => {
    clock.current?.stop();
    clock.current = null;
  };
  const startClock = () => {
    stopClock();
    const ticks = $$("send-tick");
    const hand = $("send-hand");
    const TRAIL = 56;
    const st = {
      angle: 0,
      speed: 150,
      fillFrom: null as number | null,
      full: false,
      onFull: null as (() => void) | null,
      stop: () => gsap.ticker.remove(advance),
    };
    const render = () => {
      if (hand) hand.style.transform = `rotate(${(st.angle % 360).toFixed(2)}deg)`;
      for (let i = 0; i < ticks.length; i++) {
        const t = i * 6;
        let o = 0.16;
        const behind = (((st.angle - t) % 360) + 360) % 360;
        if (behind < TRAIL) o = 0.16 + Math.pow(1 - behind / TRAIL, 1.6) * 0.84;
        if (st.fillFrom !== null) {
          const reached = st.fillFrom + ((((t - st.fillFrom) % 360) + 360) % 360);
          if (st.angle >= reached) o = Math.max(o, 0.95);
        }
        ticks[i].setAttribute("opacity", o.toFixed(3));
      }
      if (st.fillFrom !== null && !st.full && st.angle - st.fillFrom >= 360) {
        st.full = true;
        st.onFull?.();
      }
    };
    function advance(_time: number, deltaTime: number) {
      st.angle += (Math.min(deltaTime, 64) / 1000) * st.speed;
      render();
    }
    gsap.ticker.add(advance);
    clock.current = st;
    render();
  };
  // The ticker stops with the page.
  useEffect(() => () => stopClock(), []);

  /** Back to the start: the clock whole again, the line put away (for another attempt). */
  const resetStage = () => {
    gsap.set($("send-clock"), { clearProps: "transform" });
    gsap.set($("send-line"), { autoAlpha: 0, scaleX: 1, y: 0 });
    gsap.set($("send-full"), { attr: { "stroke-dashoffset": 1 }, opacity: 1 });
    gsap.set($("send-wave"), { opacity: 0 });
    gsap.set($("send-hand"), { autoAlpha: 1 });
    gsap.set($$("send-tick"), { attr: { opacity: 0.16 } });
  };

  /**
   * Submit pressed: the plane leaves the button's porthole on its gold
   * contrail (takeoff.ts, without the landing page's dim and bloom), the
   * screen darkens, and the clock face of light opens at its centre, its
   * point of light already sweeping: "Processing your application". Resolves
   * once it is in place; the light keeps sweeping until the server answers.
   */
  const playSending = (btn: HTMLElement | null) =>
    new Promise<void>((resolve) => {
      resetStage();
      const tl = track(gsap.timeline({ onComplete: resolve }));
      tl.set([$("send-caption"), $("done"), $("fail")], { autoAlpha: 0 }, 0);
      tl.to($("host"), { autoAlpha: 0, duration: 0.6, ease: "power1.out" }, 0);
      if (reduce.current) {
        tl.set($$("send-tick"), { attr: { opacity: 0.4 } }, 0);
        tl.set($("send-hand"), { autoAlpha: 0 }, 0);
        tl.to($("send-dark"), { autoAlpha: 0.9, duration: 0.4 }, 0);
        tl.to([$("send-clock"), $("send-caption")], { autoAlpha: 1, duration: 0.4 }, 0.2);
        tl.to($("send-light"), { autoAlpha: 0.5, duration: 0.4 }, 0.2);
        return;
      }
      // The flight: the plane leaves Submit's porthole for the top of the screen.
      const layer = flightLayer();
      if (btn && layer) {
        gsap.set(layer, { autoAlpha: 1 });
        track(takeOff(btn, layer, false, () => {}, { dim: false, bloom: false }));
        tl.to(layer, { autoAlpha: 0, duration: 0.7, ease: "power1.out" }, 1.1);
      }
      tl.to($("send-dark"), { autoAlpha: 0.97, duration: 1.0, ease: "power1.inOut" }, 0.2);
      tl.fromTo($("send-light"), { scale: 0.2, autoAlpha: 0 }, { scale: 1, autoAlpha: 1, duration: 1.1, ease: "power2.out" }, 0.55);
      // The clock face opens out of the light, its light of time already sweeping.
      tl.call(startClock, [], 0.6);
      tl.fromTo($("send-clock"), { autoAlpha: 0, scale: 1.18, filter: "blur(10px)" }, { autoAlpha: 1, scale: 1, filter: "blur(0px)", duration: 1.0, ease: "power3.out", clearProps: "filter,transform" }, 0.6);
      tl.fromTo($("send-caption"), { autoAlpha: 0, y: 8 }, { autoAlpha: 1, y: 0, duration: 0.5 }, 1.1);
    });

  /** Undo the button's take-off (for another attempt, or the review). */
  const restoreSubmit = () => {
    const btn = root.current?.querySelector<HTMLElement>("[data-ax-submit]");
    if (!btn) return;
    btn.classList.remove("cx-apply-launch");
    gsap.set([btn, ...Array.from(btn.children)], { clearProps: "all" });
  };

  /** The overlay lifts off the form (the review, or a step the server questioned). */
  const lift = (tl: gsap.core.Timeline) => {
    stopClock();
    tl.to([$("send-dark"), $("send-light"), $("send-clock"), $("send-line"), $("send-caption"), $("fail"), $("done")], { autoAlpha: 0, duration: reduce.current ? 0.2 : 0.45 }, 0);
    restoreSubmit();
  };

  /**
   * Submit. `agreedNow`: the Terms and the Privacy Policy were agreed this moment, in the popup Submit opened.
   */
  const send = async (fromButton: HTMLElement | null, agreedNow = false) => {
    if (busy.current) return;
    // The Terms and the Privacy Policy are agreed in the popup before the questions; should they be missing, they
    // are asked now, and agreeing sends (agreedToSend).
    const agreement = agreedNow ? { privacy: true, terms: true } : app.state.consent;
    if (!agreement.privacy || !agreement.terms) {
      setAsking({ from: fromButton });
      return;
    }
    const payload = toPayload({ ...app.state, consent: agreement });
    const all = validateAll(payload, app.phoneOk);
    if (FIELD_ORDER.some((k) => all[k])) {
      app.setErrors(all);
      focusFirst(all);
      return;
    }
    busy.current = true;
    enterTl.current?.progress(1).kill();
    setFailure("");
    setFailureFinal(false);
    setPhase("sending");

    // Not signed in: Cloudflare's token goes with it, the moment there is one (it is usually ready long before
    // Submit; a retry, just after the last one was spent, waits a moment for the next), while the plane takes off.
    const request = (needsHuman ? humanWhenReady() : Promise.resolve(null)).then(async (token) => ({ token, result: await submitApplication(payload, token) }));
    // One frame for the pinned frame to be in place before anything is measured.
    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
    await playSending(fromButton ?? root.current?.querySelector<HTMLElement>("[data-ax-submit]") ?? null);
    announce(`${SUBMIT.processing}…`);
    // The light sweeps a moment at least, so the processing reads as a moment, not a flicker.
    const [{ token, result }] = await Promise.all([request, sleep(reduce.current ? 300 : 1100)]);
    if (token) {
      // A token is good for one application: a fresh one for another attempt.
      takeHumanToken(null);
      humanRef.current?.reset();
    }

    if (result.ok) {
      setReference(result.referenceNo);
      setRegisteredAt(result.registeredAt);
      app.clearDraft();
      setPhase("received");
      return;
    }
    if (result.reason === "invalid") {
      // The server questioned an answer: lift the overlay, the questions again with its complaint under it, the
      // first one taking focus once they are back.
      const fields = result.fields;
      const tl = track(gsap.timeline());
      lift(tl);
      app.setErrors(fields);
      setPhase("form");
      tl.call(() => focusFirst(fields), [], reduce.current ? 0.4 : 0.9);
      return;
    }
    // A duplicate, or the window closed: sending again would only be refused again.
    setFailureFinal(result.reason === "duplicate" || result.reason === "closed");
    setFailure(
      result.reason === "limited"
        ? result.message || FAILURE.limited
        : result.reason === "duplicate"
          ? result.message || FAILURE.duplicate
          : result.reason === "closed"
            ? result.message || FAILURE.closed
            : result.reason === "human"
              ? FAILURE.human
              : result.reason === "server"
                ? FAILURE.server
                : "",
    );
    setPhase("failed");
  };

  /** Cloudflare's token now, or the next one it gives (up to 8 seconds; then none, and the server says so). */
  const humanWhenReady = async () => {
    for (let waited = 0; !humanTokenRef.current && waited < 8000; waited += 200) await sleep(200);
    return humanTokenRef.current;
  };

  /**
   * On to the boarding pass (TRIP_REGISTERED_HREF), which greets the new
   * participant (WELCOME_KEY). The screen fades as it goes.
   */
  const leavingRef = useRef(false);
  const toBoard = () => {
    if (leavingRef.current) return;
    leavingRef.current = true;
    try {
      sessionStorage.setItem(WELCOME_KEY, JSON.stringify({ ref: reference, at: Date.now() }));
    } catch {
      /* the pass opens without its greeting */
    }
    const go = () => router.push(TRIP_REGISTERED_HREF);
    if (reduce.current) go();
    else track(gsap.to($("send"), { autoAlpha: 0, duration: 0.4, ease: "power1.in", onComplete: go }));
  };

  // ---- Submitted: time completes, the light folds into a line, the words rise ----------
  useIsoLayoutEffect(() => {
    if (phase !== "received") return;
    const items = [$("done-eyebrow"), $("done-line"), $("done-ref"), $("done-next")].filter((el): el is HTMLElement => !!el);
    let tl: gsap.core.Timeline | null = null;
    let waiting = 0;

    /** The words, the line filling, and on to the board. */
    const words = (t: gsap.core.Timeline, at: number) => {
      // When the page carries on by itself (the button goes at once).
      const CONTINUE = at + (reduce.current ? 3.0 : 3.6);
      t.set($("done"), { autoAlpha: 1 }, at);
      if (reduce.current) {
        t.fromTo($("done"), { autoAlpha: 0 }, { autoAlpha: 1, duration: 0.4 }, at);
      } else {
        t.fromTo($("done-title"), { yPercent: 110 }, { yPercent: 0, duration: 0.95, ease: "power3.out" }, at);
        t.fromTo(items, { autoAlpha: 0, y: 14 }, { autoAlpha: 1, y: 0, duration: 0.6, stagger: 0.12, ease: "power3.out" }, at + 0.3);
      }
      t.fromTo($("done-bar"), { scaleX: 0 }, { scaleX: 1, duration: CONTINUE - (at + 0.6), ease: "none" }, at + 0.6);
      t.call(
        () => {
          $("done-title")?.focus({ preventScroll: true });
          announce(`${SUCCESS.title}. ${reference ? `${SUCCESS.reference}: ${reference}.` : ""} ${SUCCESS.next}.`);
          busy.current = false;
        },
        [],
        at + 0.4,
      );
      t.call(() => toBoard(), [], CONTINUE);
    };

    if (reduce.current || !clock.current) {
      tl = track(gsap.timeline());
      toMood(tl, "done", 0);
      tl.to([$("send-caption"), $("send-clock")], { autoAlpha: 0, duration: 0.3 }, 0);
      tl.set($("done"), { autoAlpha: 1 }, 0.3);
      tl.to($("send-line"), { autoAlpha: 1, duration: 0.3 }, 0.3);
      words(tl, 0.4);
    } else {
      // Time completes: the light quickens and lights every tick it passes, once round.
      const st = clock.current;
      st.fillFrom = st.angle;
      gsap.to(st, { speed: 760, duration: 0.5, ease: "power2.in" });
      track(gsap.to($("send-caption"), { autoAlpha: 0, y: -8, duration: 0.3 }));
      const fold = () => {
        tl = track(gsap.timeline({ defaults: { ease: "power3.out" } }));
        toMood(tl, "done", 0);
        // The full circle flashes; a ring of light goes out from it.
        tl.set($("send-full"), { attr: { "stroke-dashoffset": 0 } }, 0);
        tl.fromTo($("send-full"), { opacity: 1 }, { opacity: 0.85, duration: 0.3 }, 0);
        tl.to($("send-hand"), { autoAlpha: 0, duration: 0.25 }, 0);
        tl.fromTo($("send-wave"), { opacity: 0.95, scale: 1, transformOrigin: "50% 50%" }, { opacity: 0, scale: 1.5, duration: 1.0, ease: "power2.out" }, 0);
        tl.to($("send-light"), { scale: 1.25, duration: 0.5, ease: "power2.out" }, 0);
        tl.call(stopClock, [], 0.35);
        // It folds into a line of light at the centre, and the line rises and
        // opens out to become the horizon the words rise from.
        tl.to($("send-clock"), { scaleY: 0.012, duration: 0.55, ease: "power3.inOut" }, 0.3);
        tl.call(
          () => {
            const clockEl = $("send-clock");
            const line = $("send-line");
            if (!clockEl || !line) return;
            const c = clockEl.getBoundingClientRect();
            const l = line.getBoundingClientRect();
            gsap.set($("done"), { autoAlpha: 1 });
            gsap.set(line, { autoAlpha: 1, y: c.top + c.height / 2 - (l.top + l.height / 2), scaleX: Math.min(1, c.width / Math.max(1, line.offsetWidth)) });
            gsap.set(clockEl, { autoAlpha: 0 });
          },
          [],
          0.84,
        );
        tl.to($("send-line"), { y: 0, scaleX: 1, duration: 0.85, ease: "power3.inOut" }, 0.86);
        tl.to($("send-light"), { autoAlpha: 0.35, duration: 1.2, ease: "power1.inOut" }, 0.8);
        words(tl, 1.35);
      };
      st.onFull = fold;
      // Should the ticker stall (a hidden tab), the fold still comes.
      waiting = window.setTimeout(() => {
        if (clock.current && !clock.current.full) {
          clock.current.full = true;
          fold();
        }
      }, 1600);
    }
    return () => {
      window.clearTimeout(waiting);
      tl?.kill();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, reference]);

  // ---- Failed: the light goes out, the message comes up, the answers wait ----------
  useIsoLayoutEffect(() => {
    if (phase !== "failed") return;
    stopClock();
    const tl = track(gsap.timeline());
    tl.to([$("send-light"), $("send-clock"), $("send-caption")], { autoAlpha: 0, duration: reduce.current ? 0.2 : 0.5 }, 0);
    tl.to($("send-dark"), { autoAlpha: 0.92, duration: 0.5 }, 0);
    tl.fromTo($("fail"), { autoAlpha: 0, y: reduce.current ? 0 : 16 }, { autoAlpha: 1, y: 0, duration: 0.6, ease: "power3.out" }, reduce.current ? 0.2 : 0.55);
    tl.call(
      () => {
        $("fail-title")?.focus({ preventScroll: true });
        announce(`${FAILURE.title}. ${FAILURE.kept}`);
        busy.current = false;
      },
      [],
      reduce.current ? 0.3 : 0.9,
    );
    return () => void tl.kill();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase]);

  const retry = () => {
    if (busy.current) return;
    track(gsap.to($("fail"), { autoAlpha: 0, duration: 0.35 }));
    restoreSubmit();
    void send(root.current?.querySelector<HTMLElement>("[data-ax-retry]") ?? null);
  };

  const backToForm = () => {
    if (busy.current) return;
    busy.current = true;
    const tl = track(gsap.timeline());
    lift(tl);
    tl.call(() => setPhase("form"), [], reduce.current ? 0.2 : 0.45);
  };

  const covered = phase === "sending" || phase === "failed";

  // Submit waits only on Cloudflare (someone not signed in), and only when it has something to say: it wants the
  // visitor to do something (its box is under the button), or it could not load. Still finishing out of sight, Submit
  // goes and the send waits for the token as the plane takes off (send). Missing answers are said on Submit.
  let submitHint = "";
  if (phase === "form" && needsHuman && !humanToken && (humanFailed || humanShowing)) submitHint = humanFailed ? SUBMIT.checkFailed : SUBMIT.checkShowing;

  return (
    <div ref={root} className="ax relative isolate h-[calc(100dvh-var(--nav-h))] overflow-clip">
      <h1 className="sr-only">{PAGE_TITLE}</h1>
      <p ref={liveRef} aria-live="polite" className="sr-only" />

      <Atmosphere />
      <Host />
      {/* The light the landing page's take-off ended on (takeoff.ts): shown in
          the first frame only when the visitor came through it, then opened.
          The whole screen under the navbar, like the take-off's layer: the
          bar is usually away when the visitor leaves the countdown, and comes
          back down over the light here. */}
      <div data-ax="arrive" aria-hidden className="pointer-events-none fixed inset-0 z-[95] overflow-hidden opacity-0">
        <div className="cx-bloom" />
      </div>

      {/* One screen under the site's bar: the page never scrolls. */}
      <div className="relative z-20 mx-auto flex h-full max-w-[1320px] px-5 sm:px-8 lg:px-12">
        <div className={`relative flex h-full min-h-0 w-full flex-col lg:w-[45%] ${phase === "intro" ? "ax-thin-scroll overflow-y-auto overflow-x-hidden py-8" : ""}`}>
          {/* The glass the form sits on: the sky behind the questions frosted (apply.css). */}
          {phase !== "intro" && phase !== "consent" && <div aria-hidden className="ax-pane" />}
          {phase === "intro" && (
            <div className="my-auto">
              <ApplicationIntro onStart={requestStart} windowState={win} />
            </div>
          )}

          {phase !== "intro" && phase !== "consent" && phase !== "received" && (
            <div inert={covered} className="flex min-h-0 flex-1 flex-col pb-4 pt-5 md:pb-6 md:pt-7">
              <div data-ax="step-head" data-ax-hide>
                <StepHeader />
              </div>
              <div className="ax-stage relative mt-5 flex min-h-0 flex-1 flex-col md:mt-6">
                {/* The line of light that prints the questions in. */}
                <span data-ax="scan" aria-hidden className="ax-scan pointer-events-none absolute -inset-x-4 top-0 z-10 block h-px opacity-0 md:-inset-x-8" />
                <form data-ax-view="step" noValidate onSubmit={onSubmit} aria-labelledby="ax-step-title" className="flex min-h-0 flex-1 flex-col">
                  <StepScroll>
                    <ApplicationForm app={app} />
                  </StepScroll>
                  <StepNav disabled={!!submitHint || phase !== "form"} hint={submitHint} />
                </form>
              </div>
            </div>
          )}

          {/* Cloudflare's check, for someone not signed in: out of sight and out of the layout unless Cloudflare
              wants them to do something, then under Submit. Mounted with the questions, so it is usually done
              before they are answered. A token is good for one application (send resets it). */}
          {needsHuman && phase !== "intro" && TURNSTILE_SITE_KEY && (
            <div className={humanShowing ? "relative z-10 flex justify-center pb-3 [&_iframe]:!w-full" : "absolute h-0 w-0 overflow-hidden"} aria-hidden={!humanShowing}>
              <Turnstile
                ref={humanRef}
                siteKey={TURNSTILE_SITE_KEY}
                onSuccess={takeHumanToken}
                onExpire={() => takeHumanToken(null)}
                onError={() => {
                  takeHumanToken(null);
                  setHumanFailed(true);
                }}
                onBeforeInteractive={() => setHumanShowing(true)}
                onAfterInteractive={() => setHumanShowing(false)}
                options={{ theme: "dark", size: "flexible", appearance: "interaction-only" }}
              />
            </div>
          )}
        </div>
      </div>

      <SubmitStage
        active={phase === "sending" || phase === "failed" || phase === "received"}
        pinned={covered}
        phase={phase}
        reference={reference}
        registeredAt={registeredAt}
        firstName={app.state.personal.fullName.trim().split(/\s+/)[0] ?? ""}
        failure={failure}
        canRetry={!failureFinal}
        onRetry={retry}
        onReview={backToForm}
        onContinue={toBoard}
      />
      {/* The plane Submit launches (takeoff.ts), above the stage. */}
      <TakeOffLayer />

      <ConsentGate
        open={asking !== null}
        onClose={phase === "consent" ? leaveFirst : () => setAsking(null)}
        onAgree={phase === "consent" ? agreedFirst : phase === "intro" ? agreed : agreedToSend}
        returnFocus={asking?.from}
      />
    </div>
  );
}
