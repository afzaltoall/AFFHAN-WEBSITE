import { useId } from "react";

/** The seats' places across the cabin: two, the aisle, three. */
const SEAT_X = [46, 128, 300, 382, 464];

/**
 * The five places, as one row of the aircraft's cabin seen from above: the
 * fuselage with its windows down both sides, seats 1A and 1B, the aisle, 1C
 * to 1E. One picture of five different seats, not one picture five times
 * (the owner's word on the five tickets, 2026-10-07), each waiting for the
 * one drawn for it: a light passes along them in turn (registered.css). The
 * codes name the seats; they are not a rank.
 */
export function SeatRow({ seats, label }: { seats: readonly string[]; label: string }) {
  const id = `tr-seats-${useId().replace(/[^\w-]/g, "")}`;
  return (
    <svg viewBox="0 0 560 170" role="img" aria-label={label} className="tr-seats-svg">
      <defs>
        <linearGradient id={`${id}-hull`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#241e27" />
          <stop offset="1" stopColor="#141016" />
        </linearGradient>
        <linearGradient id={`${id}-seat`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="rgb(242 211 142 / 0.24)" />
          <stop offset="1" stopColor="rgb(214 168 78 / 0.05)" />
        </linearGradient>
        <radialGradient id={`${id}-glow`} cx="0.5" cy="0.5" r="0.6">
          <stop offset="0" stopColor="rgb(255 226 160 / 0.55)" />
          <stop offset="1" stopColor="rgb(255 226 160 / 0)" />
        </radialGradient>
      </defs>
      {/* The cabin, and its windows down both sides. */}
      <rect x="4" y="10" width="552" height="150" rx="40" fill={`url(#${id}-hull)`} stroke="rgb(242 211 142 / 0.35)" strokeWidth="1.2" />
      {Array.from({ length: 9 }, (_, k) => (
        <g key={k} fill="rgb(242 211 142 / 0.12)" stroke="rgb(242 211 142 / 0.35)" strokeWidth="1">
          <ellipse cx={40 + k * 60} cy="24" rx="10" ry="5.5" />
          <ellipse cx={40 + k * 60} cy="146" rx="10" ry="5.5" />
        </g>
      ))}
      {/* The aisle, with the row's number. */}
      <rect x="214" y="40" width="80" height="94" rx="10" fill="rgb(255 248 230 / 0.035)" />
      <text x="254" y="91" textAnchor="middle" className="tr-seats-row">
        ROW 1
      </text>
      {seats.map((code, i) => (
        <g key={code} transform={`translate(${SEAT_X[i]} 38)`} className="tr-seat" style={{ ["--i" as string]: i }}>
          <rect className="tr-seat-glow" x="-10" y="-8" width="96" height="114" rx="18" fill={`url(#${id}-glow)`} />
          <rect x="0" y="20" width="10" height="64" rx="5" fill={`url(#${id}-seat)`} stroke="rgb(242 211 142 / 0.55)" strokeWidth="1.2" />
          <rect x="66" y="20" width="10" height="64" rx="5" fill={`url(#${id}-seat)`} stroke="rgb(242 211 142 / 0.55)" strokeWidth="1.2" />
          <rect x="8" y="2" width="60" height="24" rx="10" fill={`url(#${id}-seat)`} stroke="rgb(242 211 142 / 0.7)" strokeWidth="1.2" />
          <rect x="12" y="28" width="52" height="58" rx="12" fill={`url(#${id}-seat)`} stroke="rgb(242 211 142 / 0.55)" strokeWidth="1.2" />
          <text x="38" y="65" textAnchor="middle" className="tr-seat-code">
            {code}
          </text>
        </g>
      ))}
    </svg>
  );
}
