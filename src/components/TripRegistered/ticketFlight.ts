import type { DrawGlobeHandle } from "./DrawGlobe";

/**
 * The visitor's ticket, torn from their boarding pass's stub, flies across
 * the page in an arc and drops into the draw globe through its opening
 * (DrawGlobe), whose lid opens for it as it leaves; it lands glowing, and
 * the air mixes it in; then `done`. A gold ticket of its own
 * with their Trip ID on it, over everything, for the length of the flight
 * (.tr-flying-ticket, registered.css).
 *
 * When there is nothing to fly from or to on the screen (the globe below the
 * fold on a phone), the ticket simply joins the globe. The caller keeps it
 * from reduced motion.
 */
export function flyTicketIn(globe: DrawGlobeHandle | null, tripId: string, done: () => void) {
  if (!globe) return;
  const stub = document.querySelector<HTMLElement>(".tr-pass-stub");
  const to = globe.opening();
  const view = window.innerHeight;
  if (!stub || !to || to.y < 24 || to.y > view - 24) {
    globe.drop(true);
    done();
    return;
  }
  globe.expect();
  const from = stub.getBoundingClientRect();
  const x0 = from.left + from.width / 2;
  const y0 = from.top + from.height * 0.6;
  const x1 = to.x;
  const y1 = to.y;
  // A low arc, under the globe's title, dropping in from just above the opening.
  const peak = Math.max(16, Math.min(y0, y1) - 45);

  const el = document.createElement("div");
  el.className = "tr-flying-ticket";
  el.setAttribute("aria-hidden", "true");
  const id = document.createElement("span");
  id.textContent = tripId;
  el.append(id);
  document.body.append(el);

  const at = (x: number, y: number, turn: number, scale: number) => `translate(${x}px, ${y}px) translate(-50%, -50%) rotate(${turn}deg) scale(${scale})`;
  const flight = el.animate(
    [
      { transform: at(x0, y0, -13, 0.7), opacity: 0 },
      { transform: at(x0, y0 - 34, -8, 1.05), opacity: 1, offset: 0.14 },
      { transform: at((x0 + x1) / 2, peak, 12, 0.85), offset: 0.55 },
      { transform: at(x1, y1 - 18, 80, 0.36), opacity: 1, offset: 0.9 },
      { transform: at(x1, y1 + 4, 90, 0.22), opacity: 0 },
    ],
    { duration: 1350, easing: "cubic-bezier(0.45, 0, 0.3, 1)", fill: "forwards" },
  );
  const land = () => {
    el.remove();
    globe.drop(true);
    done();
  };
  flight.onfinish = land;
  flight.oncancel = land;
}
