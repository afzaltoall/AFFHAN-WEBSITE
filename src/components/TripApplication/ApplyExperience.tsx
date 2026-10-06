"use client";

import { useEffect, useLayoutEffect, useRef, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import gsap from "gsap";
import { SplitText } from "gsap/SplitText";
import { applicationWindow, validateAll, type FieldErrors, type WindowState } from "@/lib/trip-application";
import { ARRIVAL_KEY, takeOff } from "@/components/CinematicExperience/takeoff";
import { TakeOffLayer } from "@/components/CinematicExperience/TakeOffLayer";
import { TRIP_SIGN_IN } from "@/components/TripAccess/content";
import { WELCOME_KEY, useTripStatus } from "@/components/TripAccess/useTripStatus";
import { useQuoteGate } from "@/context/QuoteGateContext";
import { TRIP_REGISTERED_HREF } from "@/lib/trip-legal";
import { revertTextFx, textIn } from "@/components/CinematicExperience/textfx";
import { agreeToTripTerms, hasAgreedToTripTerms } from "@/components/TripLegal/approval";
import { ConsentGate } from "@/components/TripLegal/ConsentGate";
import "@/components/CinematicExperience/cinematic.css";
import "./apply.css";
import { ApplicationIntro } from "./ApplicationIntro";
import { Atmosphere, Host, type Mood } from "./Atmosphere";
import { FAILURE, PAGE_TITLE, STEPS, SUBMIT, SUCCESS } from "./content";
import { StepAboutYou } from "./StepAboutYou";
import { StepBusiness } from "./StepBusiness";
import { StepHeader } from "./StepHeader";
import { StepIndicator } from "./StepIndicator";
import { StepNav } from "./StepNav";
import { StepProfile } from "./StepProfile";
import { StepReview } from "./StepReview";
import { StepScroll } from "./StepScroll";
import { StepTravel } from "./StepTravel";
import { SubmitStage } from "./SubmitStage";
import { submitApplication } from "./submitApplication";
import { toPayload, useApplication } from "./useApplication";

/**
 * /free-china-trip/apply/: the application as the next chapter of the film.
 *
 *   intro ──Start──▶ [agree] ──▶ 01 ⇄ 02 ⇄ 03 ⇄ 04 ⇄ 05 ──Submit──▶ sending ──▶ received
 *                                                                    └──▶ failed ──▶ (try again | review)
 *
 * The intro always plays first, whether the visitor came through the landing
 * page's transition or opened this address directly. Start asks for the
 * trip's Terms & Conditions and Privacy Policy (TripLegal/ConsentGate) unless
 * they were agreed on the landing page a moment ago. That agreement ticks
 * the review's Privacy Policy and Terms & Conditions boxes; the third (the
 * information is accurate) is ticked there, at the end. Outside the application
 * window (5 October to 25 November 2026, on a production build) the intro
 * says when applications open, or that they have closed, in place of Start.
 *
 * One screen, fixed: the progress and the step's heading at the top, Back
 * and Next (or Submit) at the bottom, and only the questions between them
 * scroll, when a step is taller than the screen (StepScroll). The page
 * itself never scrolls.
 *
 * All state lives in useApplication; Back never erases, forward validates,
 * Edit on the review returns to a step and back. Submit is disabled until
 * every answer and the three boxes are in (StepNav says what is missing),
 * and while sending. The request starts the moment Submit is pressed and the
 * animation runs alongside it; success is shown only when the server has
 * confirmed it.
 *
 * Motion is GSAP on transform, opacity and a little filter, all of it here,
 * so the choreography reads in one place. Reduced motion keeps every screen
 * and every function with fades in place of movement.
 */

const useIsoLayoutEffect = typeof window !== "undefined" ? useLayoutEffect : useEffect;

type Phase = "intro" | "form" | "sending" | "failed" | "received";

/** Which step asks for each answer, in the order the form asks them. */
const STEP_OF = {
  fullName: 0, email: 0, phone: 0, country: 0, city: 0, profileUrl: 0,
  businessStatus: 1, companyName: 1, role: 1, businessCategory: 1, companyWebsite: 1, yearsInBusiness: 1, businessDescription: 1,
  businessPlan: 1, areaOfInterest: 1, exploreGoal: 1,
  interests: 2, productsOfInterest: 2, exploreNotes: 2,
  nationality: 3, hasPassport: 3, travelledToChina: 3,
  privacy: 4, accuracy: 4, terms: 4,
} as const;
const FIELD_ORDER = Object.keys(STEP_OF) as Array<keyof typeof STEP_OF>;
const STEP_KEYS = ["personal", "business", "profile", "travel", "consent"] as const;
const LAST = STEPS.length - 1;

/**
 * Where the host stands, on a desktop: large in the intro, then one steady
 * place beside the form for all five steps, whole, sharp and bright. (He used
 * to change size, blur and dim at every step, which read as the picture
 * reloading each time.) At each page turn he leans towards the page and light
 * passes across him (go, below); gone while sending; back beside it after.
 */
const STEADY: gsap.TweenVars = { xPercent: 4, yPercent: 0, scale: 0.8, autoAlpha: 1, filter: "blur(0px) brightness(1)" };
const HOST: Record<string, gsap.TweenVars> = {
  "0": STEADY,
  "1": STEADY,
  "2": STEADY,
  "3": STEADY,
  "4": STEADY,
  done: { xPercent: 8, yPercent: 0, scale: 0.74, autoAlpha: 0.75, filter: "blur(0px) brightness(1)" },
};
/** Perspective for the page turn: deep enough that a page edge-on is a line, not a smear. */
const TURN_PERSPECTIVE = 1400;

const sleep = (ms: number) => new Promise<null>((resolve) => window.setTimeout(() => resolve(null), ms));

export function ApplyExperience() {
  const app = useApplication();
  const router = useRouter();
  const { requireLogin } = useQuoteGate();
  const { registration } = useTripStatus();
  const root = useRef<HTMLDivElement>(null);
  const liveRef = useRef<HTMLParagraphElement>(null);
  const [phase, setPhase] = useState<Phase>("intro");
  const [step, setStep] = useState(0);
  /** The heading and progress change at once; the fields follow the light. */
  const [headerStep, setHeaderStep] = useState(0);
  const [headerDir, setHeaderDir] = useState(1);
  const [editing, setEditing] = useState(false);
  const [reference, setReference] = useState<string | null>(null);
  /** When the database recorded it (ISO), for the submitted moment. */
  const [registeredAt, setRegisteredAt] = useState<string | null>(null);
  const [failure, setFailure] = useState("");
  /** The failure cannot be cured by sending again (a duplicate, or the window closed): no Try again. */
  const [failureFinal, setFailureFinal] = useState(false);
  /** The sign-in ended while the form was open: Sign in, in place of Try again. */
  const [signInFailure, setSignInFailure] = useState(false);
  /** Whether applications are being taken (lib/trip-application.ts): read in the browser, after the first render. */
  const [win, setWin] = useState<WindowState>("open");
  /** The consent popup, asked for by Start (the button focus goes back to). */
  const [asking, setAsking] = useState<{ from: HTMLElement | null } | null>(null);

  /** A transition is playing: further clicks wait for it. */
  const busy = useRef(true);
  /** Direction of the last step change, for the entering step (1 or -1). */
  const dir = useRef(1);
  const reduce = useRef(false);
  const indicatorShown = useRef(false);
  const introTl = useRef<gsap.core.Timeline | null>(null);
  /** Opened through the landing page's take-off: decided once (the flag is
   *  read and cleared), kept here so a development re-run of the intro
   *  effect opens the same way. */
  const fromLightRef = useRef<boolean | null>(null);
  /** The step being printed, so a quick Continue can finish it at once. */
  const enterTl = useRef<gsap.core.Timeline | null>(null);
  /** A page has just turned away (1 forward, -1 back): the next one settles in on the same spine. */
  const turnIn = useRef(0);
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

  /** Red silk across the screen: only ever during a transition. */
  const silk = (tl: gsap.core.Timeline, at: number, kind: "subtle" | "partial" | "brief") => {
    const el = $("silk");
    if (!el) return;
    const k = { subtle: { peak: 0.55, from: -65, to: 35, d: 1.4 }, partial: { peak: 0.72, from: -95, to: -30, d: 1.2 }, brief: { peak: 0.62, from: -45, to: 55, d: 0.9 } }[kind];
    tl.set(el, { xPercent: k.from, rotation: -3, autoAlpha: 0 }, at);
    tl.to(el, { xPercent: k.to, rotation: 2, duration: k.d, ease: "power2.inOut" }, at);
    tl.to(el, { autoAlpha: k.peak, duration: k.d * 0.4, ease: "power1.out" }, at);
    tl.to(el, { autoAlpha: 0, duration: k.d * 0.5, ease: "power1.in" }, at + k.d * 0.5);
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

  /** Back to the top of the chapter, if the visitor had scrolled down it. */
  const toTop = (instant: boolean) => {
    const el = root.current;
    if (!el) return;
    const top = el.getBoundingClientRect().top + window.scrollY - 64;
    if (window.scrollY > top + 4) window.scrollTo({ top, behavior: instant ? "instant" : "smooth" });
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
  // Accepted in the popup: the review's Privacy Policy and Terms boxes arrive ticked.
  const agreed = () => {
    agreeToTripTerms();
    app.update("consent", { privacy: true, terms: true });
    setAsking(null);
    void start();
  };

  // Applications are taken from 5 October to 25 November 2026 (Terms, clause
  // 1). Read here, in the browser, so a page built before the date still
  // knows; the API keeps the same window whatever the browser thinks.
  useEffect(() => {
    setWin(applicationWindow());
  }, []);

  // Registered already (one application per person): to the participants
  // board, where their Trip ID is, instead of a second application.
  useEffect(() => {
    if (registration && (phase === "intro" || phase === "form")) router.replace(TRIP_REGISTERED_HREF);
  }, [registration, phase, router]);

  /** The application starts: the button glows, a gold trail passes, the intro leaves, 01 arrives. */
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
      tl.set($("host"), { ...HOST["0"], autoAlpha: 0 }, 0.25);
      tl.to($("host"), { autoAlpha: HOST["0"].autoAlpha, duration: 0.35 }, 0.3);
      toMood(tl, "0", 0, 0.5);
      tl.to($("dust"), { autoAlpha: 0.45, duration: 0.5 }, 0);
    } else {
      tl.fromTo(btn?.querySelector("[data-ax-glow]") ?? null, { autoAlpha: 0, scale: 0.85 }, { autoAlpha: 1, scale: 1.12, duration: 0.35, ease: "power2.out" }, 0);
      tl.to(btn ?? null, { scale: 0.97, duration: 0.16, ease: "power2.out" }, 0);
      tl.to(btn ?? null, { scale: 1, duration: 0.3, ease: "power2.out" }, 0.16);
      trail(tl, 0.12, -2);
      tl.to(leaving, { autoAlpha: 0, y: -24, filter: "blur(6px)", duration: 0.5, stagger: 0.035, ease: "power2.in" }, 0.28);
      tl.to($("rule"), { autoAlpha: 0, duration: 0.6 }, 0.3);
      tl.to($("host"), { ...HOST["0"], x: 0, duration: 1.05, ease: "power3.inOut" }, 0.3);
      toMood(tl, "0", 0.35);
      tl.to($("dust"), { autoAlpha: 0.45, duration: 1.2 }, 0.4);
    }
    await new Promise<void>((resolve) => tl.call(resolve, [], reduce.current ? 0.3 : 0.85));
    dir.current = 1;
    setStep(0);
    setPhase("form");
  };

  /** The step's lines, top to bottom: its fields (or review sections), then its buttons. */
  const stepRows = (view: HTMLElement) => {
    const body = view.querySelector<HTMLElement>("[data-ax-body]")?.firstElementChild as HTMLElement | null;
    const nav = view.querySelector<HTMLElement>("[data-ax='nav']");
    const rows = body ? (Array.from(body.children) as HTMLElement[]) : [];
    if (nav) rows.push(nav);
    return rows;
  };
  /** How far down the step each line sits, 0 (top) to 1 (bottom). */
  const depthOf = (view: HTMLElement, rows: HTMLElement[]) => {
    const r = view.getBoundingClientRect();
    return rows.map((row) => Math.min(1, Math.max(0, (row.getBoundingClientRect().top - r.top) / Math.max(1, r.height))));
  };

  // ---- A step arrives ---------------------------------------------------------------
  // After a page turn (go), the next page settles in on the same spine. The
  // first step, arriving from the intro, is printed by a line of light, one
  // line at a time. The heading has already rolled (StepHeader); the progress
  // comet is already travelling.
  useIsoLayoutEffect(() => {
    if (phase !== "form") return;
    const view = root.current?.querySelector<HTMLElement>("[data-ax-view='step']");
    if (!view) return;
    const tl = track(gsap.timeline());
    enterTl.current = tl;
    if (reduce.current) {
      turnIn.current = 0;
      tl.fromTo(view, { autoAlpha: 0 }, { autoAlpha: 1, duration: 0.3 });
      tl.call(() => void (busy.current = false), [], 0.15);
    } else if (turnIn.current) {
      // THE NEXT PAGE settles in on the spine the last one turned on: from a
      // little way round, flat into place, and the light catches it as it lands.
      const fwd = turnIn.current > 0;
      turnIn.current = 0;
      tl.fromTo(
        view,
        { transformPerspective: TURN_PERSPECTIVE, transformOrigin: fwd ? "0% 50%" : "100% 50%", rotationY: fwd ? 30 : -30, x: fwd ? 28 : -28, autoAlpha: 0 },
        { rotationY: 0, x: 0, autoAlpha: 1, duration: 0.66, ease: "power3.out", clearProps: "transform,transformPerspective,transformOrigin" },
        0,
      );
      const gleam = $("gleam");
      tl.fromTo(gleam, { xPercent: fwd ? -130 : 330, autoAlpha: 0 }, { xPercent: fwd ? 330 : -130, duration: 0.8, ease: "power2.inOut" }, 0.06);
      tl.to(gleam, { autoAlpha: 1, duration: 0.18 }, 0.06);
      tl.to(gleam, { autoAlpha: 0, duration: 0.24 }, 0.62);
      tl.call(() => void (busy.current = false), [], 0.32);
    } else {
      const fwd = dir.current > 0;
      const rows = stepRows(view);
      const depth = depthOf(view, rows);
      const H = view.offsetHeight;
      // A longer step takes a little longer to print.
      const PRINT = Math.min(0.95, 0.5 + H / 2400);
      gsap.set(view, { autoAlpha: 1 });
      gsap.set(rows, { autoAlpha: 0 });
      const scan = $("scan");
      tl.fromTo(scan, { y: fwd ? 0 : H, autoAlpha: 0 }, { y: fwd ? H : 0, duration: PRINT, ease: "power1.inOut" }, 0);
      tl.to(scan, { autoAlpha: 1, duration: 0.1 }, 0);
      tl.to(scan, { autoAlpha: 0, duration: 0.25 }, PRINT - 0.12);
      rows.forEach((row, i) => {
        const t = fwd ? depth[i] : 1 - depth[i];
        tl.fromTo(row, { autoAlpha: 0, y: fwd ? 18 : -18, filter: "blur(6px)" }, { autoAlpha: 1, y: 0, filter: "blur(0px)", duration: 0.6, ease: "expo.out", clearProps: "transform,filter" }, 0.03 + t * PRINT * 0.9);
      });
      // Ready for the next click once the first lines are down; a Continue
      // pressed during the print finishes it at once (go, below).
      tl.call(() => void (busy.current = false), [], Math.min(0.5, PRINT * 0.55));
    }
    if (!indicatorShown.current) {
      indicatorShown.current = true;
      tl.fromTo([$("indicator"), $("step-head")], { autoAlpha: 0, y: -8 }, { autoAlpha: 1, y: 0, duration: 0.6, stagger: 0.08, ease: "power2.out" }, 0);
    }
    // The new step's title takes focus, once it can be seen (hidden things
    // can't take focus; on the first step the heading is still fading in).
    tl.call(() => document.getElementById("ax-step-title")?.focus({ preventScroll: true }), [], 0.3);
    return () => void tl.kill();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, step]);

  /**
   * Leave this step. The heading rolls to the next at once; a line of light
   * reads down the page (up it, going back) and lifts each line away as it
   * passes; light crosses the host as he takes his place for the next step;
   * the ground changes colour, and at the chapter's own moments silk or the
   * gold trail crosses. Then the next step is printed (the effect above).
   */
  const go = async (to: number, editingNext = false) => {
    if (busy.current || to === step) return;
    busy.current = true;
    // A step still being printed is finished at once (no callbacks fire).
    enterTl.current?.progress(1).kill();
    const from = step;
    const fwd = to > from;
    dir.current = fwd ? 1 : -1;
    setHeaderDir(dir.current);
    setHeaderStep(to);
    const view = root.current?.querySelector<HTMLElement>("[data-ax-view='step']") ?? null;
    const tl = track(gsap.timeline());
    const key = String(to);
    let lifted = 0.2;
    if (reduce.current) {
      tl.to(view, { autoAlpha: 0, duration: 0.2 }, 0);
      tl.to($("host"), { autoAlpha: 0, duration: 0.2 }, 0);
      tl.set($("host"), { ...HOST[key], autoAlpha: 0 }, 0.2);
      tl.to($("host"), { autoAlpha: HOST[key].autoAlpha, duration: 0.3 }, 0.25);
      toMood(tl, key as Mood, 0, 0.4);
      tl.to($("travel"), { autoAlpha: to === 3 ? 0.35 : 0, duration: 0.4 }, 0);
    } else {
      // The button that asked glows as it is pressed.
      const pressed = fwd ? view?.querySelector<HTMLElement>("button[type=submit] [data-ax-glow]") : null;
      if (pressed) tl.fromTo(pressed, { autoAlpha: 0, scale: 0.85 }, { autoAlpha: 1, scale: 1.12, duration: 0.3, ease: "power2.out" }, 0);
      // THE PAGE TURNS: it swings away on its spine (the left edge going
      // forward, the right going back), its free edge going into the screen,
      // until it is edge-on. Away, never towards you: towards you, perspective
      // magnified the page mid-turn. Only then does the next page come in (the
      // effect above), so the two never overlap and nothing is redrawn in view.
      if (view) {
        tl.set(view, { transformPerspective: TURN_PERSPECTIVE, transformOrigin: fwd ? "0% 50%" : "100% 50%" }, 0);
        tl.to(view, { rotationY: fwd ? 90 : -90, duration: 0.46, ease: "power2.in" }, 0.04);
        tl.to(view, { autoAlpha: 0, duration: 0.14, ease: "power1.in" }, 0.36);
      }
      lifted = 0.5;
      // The host leans towards the turning page and back, keeping his place
      // and size, and light passes across him (left to right going forward).
      tl.to($("host"), { x: fwd ? -18 : 18, rotation: fwd ? -0.8 : 0.8, transformOrigin: "50% 100%", duration: 0.4, ease: "power2.out" }, 0.02);
      tl.to($("host"), { ...HOST[key], x: 0, rotation: 0, duration: 0.8, ease: "power2.inOut" }, 0.42);
      tl.set($("host-sheen"), { autoAlpha: 1 }, 0.1);
      tl.fromTo($("host-band"), { xPercent: fwd ? 222 : -100 }, { xPercent: fwd ? -100 : 222, duration: 1.0, ease: "power2.inOut" }, 0.1);
      tl.to($("host-sheen"), { autoAlpha: 0, duration: 0.25 }, 0.95);
      toMood(tl, key as Mood, 0.1);
      if (to === 3) tl.fromTo($("travel"), { autoAlpha: 0, xPercent: 8, scale: 0.94 }, { autoAlpha: 0.42, xPercent: 0, scale: 1, duration: 1.2, ease: "power2.out" }, 0.2);
      else if (from === 3) tl.to($("travel"), { autoAlpha: 0, duration: 0.6 }, 0);
      // The motifs cross only going forward, at the chapter's own moments.
      if (from === 0 && to === 1) silk(tl, 0.05, "subtle");
      if (from === 1 && to === 2) silk(tl, 0.05, "partial");
      if (from === 2 && to === 3) trail(tl, 0.05, -6);
      if (from === 3 && to === 4) silk(tl, 0.05, "brief");
    }
    await new Promise<void>((resolve) => tl.call(resolve, [], lifted));
    toTop(reduce.current);
    if (!reduce.current) turnIn.current = fwd ? 1 : -1;
    setEditing(editingNext);
    setStep(to);
  };

  /** Continue: this step's rules first. On the review, it sends. */
  const onStepSubmit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (busy.current) return;
    if (step === LAST) {
      void send((e.nativeEvent as SubmitEvent).submitter as HTMLElement | null);
      return;
    }
    const { ok, errors } = app.check(STEP_KEYS[step]);
    if (!ok) {
      focusFirst(errors);
      return;
    }
    void go(editing ? LAST : step + 1);
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

  const send = async (fromButton: HTMLElement | null) => {
    if (busy.current) return;
    const consent = app.check("consent");
    if (!consent.ok) {
      focusFirst(consent.errors);
      return;
    }
    // Every step again: a draft restored from this session never skipped a rule.
    const all = validateAll(toPayload(app.state), app.phoneOk);
    const firstBad = FIELD_ORDER.find((k) => all[k]);
    if (firstBad) {
      app.setErrors(all);
      void go(STEP_OF[firstBad], true);
      return;
    }
    busy.current = true;
    setFailure("");
    setFailureFinal(false);
    setSignInFailure(false);
    setPhase("sending");

    const request = submitApplication(toPayload(app.state));
    // One frame for the pinned frame to be in place before anything is measured.
    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
    await playSending(fromButton ?? root.current?.querySelector<HTMLElement>("[data-ax-submit]") ?? null);
    announce(`${SUBMIT.processing}…`);
    // The light sweeps a moment at least, so the processing reads as a moment, not a flicker.
    const [result] = await Promise.all([request, sleep(reduce.current ? 300 : 1100)]);

    if (result.ok) {
      setReference(result.referenceNo);
      setRegisteredAt(result.registeredAt);
      app.clearDraft();
      setPhase("received");
      return;
    }
    if (result.reason === "invalid") {
      // The server questioned an answer: lift the overlay, go to that step.
      const fields = result.fields;
      const first = FIELD_ORDER.find((k) => fields[k]);
      const tl = track(gsap.timeline());
      lift(tl);
      app.setErrors(fields);
      dir.current = -1;
      setEditing(true);
      setHeaderDir(-1);
      setHeaderStep(first ? STEP_OF[first] : LAST);
      setStep(first ? STEP_OF[first] : LAST);
      setPhase("form");
      return;
    }
    // A duplicate, or the window closed: sending again would only be refused again.
    setFailureFinal(result.reason === "duplicate" || result.reason === "closed");
    setSignInFailure(result.reason === "signin");
    setFailure(
      result.reason === "limited"
        ? result.message || FAILURE.limited
        : result.reason === "duplicate"
          ? result.message || FAILURE.duplicate
          : result.reason === "closed"
            ? result.message || FAILURE.closed
            : result.reason === "signin"
              ? FAILURE.signin
              : result.reason === "server"
                ? FAILURE.server
                : "",
    );
    setPhase("failed");
  };

  /**
   * On to the participants board (TRIP_REGISTERED_HREF), which greets the new
   * participant (WELCOME_KEY). The screen fades as it goes.
   */
  const leavingRef = useRef(false);
  const toBoard = () => {
    if (leavingRef.current) return;
    leavingRef.current = true;
    try {
      sessionStorage.setItem(WELCOME_KEY, JSON.stringify({ ref: reference, at: Date.now() }));
    } catch {
      /* the board opens without its greeting */
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

  /** The sign-in ended while the form was open: sign in again, then send. */
  const signInAgain = () => {
    if (busy.current) return;
    requireLogin(() => retry(), TRIP_SIGN_IN.reason);
  };

  const backToReview = () => {
    if (busy.current) return;
    busy.current = true;
    const tl = track(gsap.timeline());
    lift(tl);
    tl.call(() => {
      dir.current = -1;
      setPhase("form");
    }, [], reduce.current ? 0.2 : 0.45);
  };

  const Step = [StepAboutYou, StepBusiness, StepProfile, StepTravel][step];
  const covered = phase === "sending" || phase === "failed";

  // Submit waits for every answer the application needs and the three boxes;
  // until then StepNav says what is missing. (Every step was checked on its
  // way forward, so this is mostly the boxes; a draft brought back from the
  // session is checked here all the same.)
  let submitHint = "";
  if (step === LAST && phase === "form") {
    const all = validateAll(toPayload(app.state), app.phoneOk);
    const unfinished = STEPS.slice(0, LAST).filter((_, i) => FIELD_ORDER.some((k) => all[k] && STEP_OF[k] === i));
    const boxes = (["privacy", "accuracy", "terms"] as const).filter((k) => all[k]);
    if (unfinished.length) submitHint = SUBMIT.needsAnswers(unfinished.map((s) => `${s.number} ${s.title}`).join(", "));
    else if (boxes.length) submitHint = SUBMIT.needsConsent(boxes);
  }

  return (
    <div ref={root} className="ax relative isolate h-[calc(100dvh-4rem)] overflow-clip">
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
        <div className={`relative flex h-full min-h-0 w-full flex-col lg:w-[45%] ${phase === "intro" ? "ax-thin-scroll overflow-y-auto py-8" : ""}`}>
          {/* The glass the form sits on: the sky behind the questions frosted (apply.css). */}
          {phase !== "intro" && <div aria-hidden className="ax-pane" />}
          {phase === "intro" && (
            <div className="my-auto">
              <ApplicationIntro onStart={requestStart} windowState={win} />
            </div>
          )}

          {phase !== "intro" && phase !== "received" && (
            <div inert={covered} className="flex min-h-0 flex-1 flex-col pb-4 pt-5 md:pb-6 md:pt-7">
              <StepIndicator step={headerStep} />
              <div data-ax="step-head" data-ax-hide>
                <StepHeader step={headerStep} dir={headerDir} />
              </div>
              <div className="ax-stage relative mt-5 flex min-h-0 flex-1 flex-col md:mt-6">
                {/* The line of light that lifts one step away and prints the next. */}
                <span data-ax="scan" aria-hidden className="ax-scan pointer-events-none absolute -inset-x-4 top-0 z-10 block h-px opacity-0 md:-inset-x-8" />
                {/* The light that catches each new page as it lands; clipped to the page. */}
                <span aria-hidden className="pointer-events-none absolute inset-0 z-10 overflow-hidden">
                  <span data-ax="gleam" className="ax-gleam absolute inset-y-0 left-0 block w-[34%] opacity-0" />
                </span>
                <form key={step} data-ax-view="step" noValidate onSubmit={onStepSubmit} aria-labelledby="ax-step-title" className="flex min-h-0 flex-1 flex-col">
                  <StepScroll>{step === LAST ? <StepReview app={app} onEdit={(i) => void go(i, true)} /> : <Step app={app} />}</StepScroll>
                  <StepNav
                    step={step}
                    last={LAST}
                    editing={editing}
                    onBack={() => void go(step - 1)}
                    disabled={step === LAST && (!!submitHint || phase !== "form")}
                    hint={submitHint}
                  />
                </form>
              </div>
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
        onReview={backToReview}
        onSignIn={signInFailure ? signInAgain : undefined}
        onContinue={toBoard}
      />
      {/* The plane Submit launches (takeoff.ts), above the stage. */}
      <TakeOffLayer />

      <ConsentGate open={asking !== null} onClose={() => setAsking(null)} onAgree={agreed} returnFocus={asking?.from} />
    </div>
  );
}
