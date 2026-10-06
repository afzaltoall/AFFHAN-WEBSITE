import { Plane } from "lucide-react";

const SPARKS = 12;

/**
 * The way out to the application (takeoff.ts moves it): fixed over the whole
 * screen, under the navbar, hidden until an Apply button is pressed. While
 * the bar shows it stays on top, as it always has; once it has scrolled away
 * (it hides as the page goes down, so it is gone by the countdown) the light
 * reaches the top edge too. It used to start 64px down whatever the bar was
 * doing, and with the bar away that strip kept showing the page above the
 * light. A dimmer for the page, the contrail (a soft glow and a bright core,
 * drawn by their dash), sparks shed along it, the plane, the bloom of light
 * where it leaves, and plain black for reduced motion.
 */
export function TakeOffLayer() {
  return (
    <div data-cx="exit" aria-hidden className="pointer-events-none fixed inset-0 z-[90] hidden overflow-hidden">
      <div data-cx="exit-dim" className="absolute inset-0 bg-[#050505] opacity-0" />
      <svg className="absolute inset-0 h-full w-full overflow-visible">
        <path data-cx="exit-glow" className="cx-exit-glow" fill="none" stroke="rgb(242 211 142 / 0.45)" strokeWidth="12" strokeLinecap="round" />
        <path data-cx="exit-path" fill="none" stroke="#fff3d2" strokeWidth="2.4" strokeLinecap="round" />
      </svg>
      {Array.from({ length: SPARKS }, (_, i) => (
        <span key={i} data-cx="exit-spark" className="absolute left-0 top-0 -ml-[3px] -mt-[3px] h-1.5 w-1.5 rounded-full bg-(--cx-gold-hi) opacity-0 shadow-[0_0_10px_3px_rgb(242_211_142/0.6)]" />
      ))}
      <span data-cx="exit-plane" className="cx-exit-plane absolute left-0 top-0 -ml-[15px] -mt-[15px] h-[30px] w-[30px] text-[#fff3d2] opacity-0">
        <Plane className="h-full w-full" strokeWidth={1.8} />
      </span>
      <div data-cx="exit-bloom" className="cx-bloom opacity-0" />
      <div data-cx="exit-black" className="absolute inset-0 bg-[#050505] opacity-0" />
    </div>
  );
}
