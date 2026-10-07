"use client";

import { useId, useRef, type PointerEvent as ReactPointerEvent } from "react";
import { Plane } from "lucide-react";
import { flagUrl } from "@/lib/countries";
import type { TripRegistration } from "@/components/TripAccess/useTripStatus";
import { DISPLAY } from "@/components/CinematicExperience/parts";
import { REGISTERED } from "./content";

const WHEN = new Intl.DateTimeFormat("en-GB", {
  timeZone: "Asia/Kolkata",
  day: "numeric",
  month: "short",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});
const parts = (iso: string) => Object.fromEntries(WHEN.formatToParts(new Date(iso)).map((x) => [x.type, x.value]));
/** "1 Oct 2026 · 17:42 IST" */
function registeredAt(iso: string) {
  const p = parts(iso);
  return `${p.day} ${p.month} ${p.year} · ${p.hour}:${p.minute} IST`;
}

/** "chennai" -> "Chennai": a city typed all in lower case, set as a name. Anything typed with capitals is kept as it was. */
function cityName(city: string) {
  return city === city.toLowerCase() ? city.replace(/(^|[\s'-])(\p{L})/gu, (_, before: string, letter: string) => before + letter.toUpperCase()) : city;
}

/**
 * The participant's own registration, as a boarding pass, laid out as tight
 * as a real one (the owner, 2026-10-07: no empty patches): their name and
 * Trip ID side by side, a barcode down the edge, where from, when they
 * applied, and when the winners are announced; a perforated stub with the
 * status and the Trip ID again, and an entry seal stamped
 * across the perforation, as a passport's is: "Registered" over its rim,
 * "Free China Trip" under it, the day they registered in its middle. On the
 * stub, so it covers nothing (it once sat across the route, and the plane
 * printed through it). Their own details, shown to them only.
 *
 * It is brought to life as the page opens (registered.css): the plane flies
 * the route from their country to China and leaves it lit gold, then the
 * seal comes down on the stub. Now and then a light passes over the foil,
 * and with a mouse the pass leans a little towards the pointer, catching the
 * light where it is. None of it for reduced motion.
 *
 * `stamp`, for the moment they arrive from the application: the pass prints
 * first, and the flight and the seal follow it.
 */
export function BoardingPass({ reg, stamp }: { reg: TripRegistration; stamp: boolean }) {
  const P = REGISTERED.pass;
  const ref = useRef<HTMLElement>(null);
  // The lean: a few degrees, from where the pointer is over the pass.
  const lean = (e: ReactPointerEvent<HTMLElement>) => {
    const el = ref.current;
    if (!el || e.pointerType !== "mouse" || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const r = el.getBoundingClientRect();
    const x = (e.clientX - r.left) / r.width;
    const y = (e.clientY - r.top) / r.height;
    el.style.setProperty("--ry", `${((x - 0.5) * 7).toFixed(2)}deg`);
    el.style.setProperty("--rx", `${((0.5 - y) * 5).toFixed(2)}deg`);
    el.style.setProperty("--gx", `${(x * 100).toFixed(1)}%`);
    el.style.setProperty("--gy", `${(y * 100).toFixed(1)}%`);
    el.classList.add("is-leaning");
  };
  const rest = () => {
    const el = ref.current;
    if (!el) return;
    el.style.setProperty("--rx", "0deg");
    el.style.setProperty("--ry", "0deg");
    el.classList.remove("is-leaning");
  };
  return (
    <article
      ref={ref}
      onPointerMove={lean}
      onPointerLeave={rest}
      className={`tr-pass ${stamp ? "tr-pass-stamp" : ""}`}
      aria-label={`${P.kind}: ${reg.fullName}, ${P.tripId} ${reg.referenceNo}`}
    >
      <span aria-hidden className="tr-pass-foil" />
      <span aria-hidden className="tr-pass-glare" />
      <div className="tr-pass-main">
        <header className="tr-pass-head">
          <span className="tr-pass-brand">{P.brand}</span>
          <span className="tr-pass-kind">{P.kind}</span>
        </header>
        <div className="tr-pass-grid">
          <div className="tr-pass-field">
            <span className="tr-pass-label">{P.passenger}</span>
            <span className={`${DISPLAY} tr-pass-name`}>{reg.fullName}</span>
          </div>
          <div className="tr-pass-field">
            <span className="tr-pass-label">{P.tripId}</span>
            <span className="tr-pass-id">{reg.referenceNo}</span>
          </div>
          {/* As a real pass has: a barcode down its edge, its Trip ID printed beside it. */}
          <span aria-hidden className="tr-pass-code">
            <Barcode text={reg.referenceNo} />
            <span className="tr-pass-code-text">{reg.referenceNo}</span>
          </span>
          <div className="tr-pass-route tr-pass-two" aria-hidden>
            <span className="tr-pass-place">
              <span className="tr-pass-label">{P.from}</span>
              <span className="tr-pass-city">
                {reg.iso && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={flagUrl(reg.iso)} alt="" width={20} height={14} className="tr-flag" />
                )}
                {reg.country}
              </span>
              <span className="tr-pass-sub">{cityName(reg.city)}</span>
            </span>
            {/* The route: dashed, then lit gold behind the plane as it flies it. */}
            <span className="tr-pass-flight">
              <span className="tr-pass-track" />
              <span className="tr-pass-trace" />
              <Plane size={18} strokeWidth={1.8} className="tr-pass-plane" />
            </span>
            <span className="tr-pass-place tr-pass-place-to">
              <span className="tr-pass-label">{P.to}</span>
              <span className="tr-pass-city">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={flagUrl("cn")} alt="" width={20} height={14} className="tr-flag" />
                {P.toValue}
              </span>
            </span>
          </div>
          <p className="sr-only">
            {P.from} {cityName(reg.city)}, {reg.country}. {P.to} {P.toValue}.
          </p>
          <div className="tr-pass-field">
            <span className="tr-pass-label">{P.registered}</span>
            <span className="tr-pass-value">{registeredAt(reg.createdAt)}</span>
          </div>
          <div className="tr-pass-field">
            <span className="tr-pass-label">{P.announced}</span>
            <span className="tr-pass-value">{REGISTERED.pool.date}</span>
          </div>
        </div>
      </div>
      <div className="tr-pass-stub">
        <span aria-hidden className="tr-pass-perf" />
        <span className="tr-pass-label">{P.statusLabel}</span>
        <span className="tr-pass-status">{P.status}</span>
        {/* The stub keeps the Trip ID, as a pass's stub keeps the flight. */}
        <span className="tr-pass-label tr-pass-stub-label">{P.tripId}</span>
        <span className="tr-pass-stub-id">{reg.referenceNo}</span>
        <Seal iso={reg.createdAt} />
      </div>
    </article>
  );
}

/**
 * A barcode down the pass's edge, drawn from its Trip ID: guard bars, then
 * each character's last five bits as a wide or narrow bar, then guards again.
 * The same pass always has the same code. Decoration, as the rest of the
 * pass is: it is not meant to be scanned.
 */
function Barcode({ text }: { text: string }) {
  const bars: { at: number; w: number }[] = [];
  let at = 0;
  const put = (dark: boolean, w: number) => {
    if (dark) bars.push({ at, w });
    at += w;
  };
  const guard = () => {
    put(true, 1);
    put(false, 1);
    put(true, 1);
    put(false, 1.4);
  };
  guard();
  for (const ch of text) {
    const c = ch.charCodeAt(0);
    for (let b = 4; b >= 0; b--) {
      put(true, (c >> b) & 1 ? 2.3 : 1);
      put(false, b === 0 ? 1.8 : 1);
    }
  }
  guard();
  return (
    <svg className="tr-pass-bars" viewBox={`0 0 10 ${at.toFixed(2)}`} preserveAspectRatio="none">
      {bars.map((b) => (
        <rect key={b.at} x="0" y={b.at.toFixed(2)} width="10" height={b.w} />
      ))}
    </svg>
  );
}

/**
 * The entry seal: two rings, the words around the rim, the day in the
 * middle, in a red ink that sinks into the gold (multiply), a little uneven,
 * as a rubber stamp leaves it. Drawn, so it is sharp at any size. Hidden from
 * a screen reader: the stub's status says the same.
 */
function Seal({ iso }: { iso: string }) {
  const p = parts(iso);
  const id = `tr-seal-${useId().replace(/[^\w-]/g, "")}`;
  const S = REGISTERED.pass.seal;
  return (
    <svg viewBox="0 0 120 120" className="tr-seal" aria-hidden>
      <defs>
        {/* The rim's words: the top along an arc over the middle, the bottom under it, both upright. */}
        <path id={`${id}-top`} d="M 15.5 60 A 44.5 44.5 0 0 1 104.5 60" />
        <path id={`${id}-bottom`} d="M 7.5 60 A 52.5 52.5 0 0 0 112.5 60" />
        {/* Uneven ink: specks where the stamp did not take, and edges a hair off true. */}
        <filter id={`${id}-ink`} x="-6%" y="-6%" width="112%" height="112%">
          <feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="2" seed="11" result="grain" />
          <feColorMatrix in="grain" type="matrix" values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 -1.5 1.55" result="holes" />
          <feComposite in="SourceGraphic" in2="holes" operator="in" result="inked" />
          <feTurbulence type="fractalNoise" baseFrequency="0.035" numOctaves="1" seed="4" result="warp" />
          <feDisplacementMap in="inked" in2="warp" scale="1.6" xChannelSelector="R" yChannelSelector="G" />
        </filter>
      </defs>
      <g filter={`url(#${id}-ink)`}>
        <circle cx="60" cy="60" r="55" fill="none" stroke="currentColor" strokeWidth="3" />
        <circle cx="60" cy="60" r="41" fill="none" stroke="currentColor" strokeWidth="1.3" />
        <circle cx="11.5" cy="60" r="1.7" fill="currentColor" />
        <circle cx="108.5" cy="60" r="1.7" fill="currentColor" />
        <text className="tr-seal-rim" fill="currentColor">
          <textPath href={`#${id}-top`} startOffset="50%" textAnchor="middle">
            {S.top.toUpperCase()}
          </textPath>
        </text>
        <text className="tr-seal-rim tr-seal-rim-sm" fill="currentColor">
          <textPath href={`#${id}-bottom`} startOffset="50%" textAnchor="middle">
            {S.bottom.toUpperCase()}
          </textPath>
        </text>
        <text x="60" y="61" textAnchor="middle" className="tr-seal-day" fill="currentColor">
          {`${p.day} ${p.month}`.toUpperCase()}
        </text>
        <text x="60" y="76" textAnchor="middle" className="tr-seal-year" fill="currentColor">
          {p.year}
        </text>
      </g>
    </svg>
  );
}
