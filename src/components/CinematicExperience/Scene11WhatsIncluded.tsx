import { INCLUDED, INCLUDED_EYEBROW } from "./content";
import { DISPLAY, EYEBROW, PlaceholderTag } from "./parts";

/**
 * 11 What's included. The FREE lockup rises and shrinks to the top of the frame
 * and the four confirmed inclusions arrive beneath it as editorial rows, one
 * after another as you scroll: a hairline of gold draws across, then the row
 * resolves. Rows, not cards: no boxes, no fills, no icons. Only the four the
 * brief confirms (content.ts). On a wide screen each row is a two-column
 * table, the detail starting halfway across beside its title, every detail
 * on the same edge; narrower, the detail sits under its title. Set bright
 * and large enough to read over the stars (with a dark halo, cinematic.css).
 */
export function Scene11WhatsIncluded() {
  return (
    <div data-cx-scene="included">
      <div className="pointer-events-none absolute inset-x-0 bottom-[6svh] top-[29svh] z-[52] flex flex-col justify-center px-6 md:bottom-[7svh] md:top-[31svh] md:px-[8vw]">
        <p data-cx="inc-eyebrow" data-cx-hide className={EYEBROW}>
          {INCLUDED_EYEBROW}
        </p>
        <ul className="mt-3 md:mt-5">
          {INCLUDED.map((item) => (
            <li
              key={item.title}
              data-cx="inc-row"
              data-cx-hide
              className="relative flex flex-col gap-1 py-[1.7svh] md:py-[2.3svh] lg:grid lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] lg:items-baseline lg:gap-x-16 lg:gap-y-0"
            >
              <span
                data-cx="inc-line"
                aria-hidden
                className="absolute inset-x-0 top-0 h-px origin-left bg-linear-to-r from-(--cx-gold)/80 via-(--cx-gold)/30 to-transparent"
              />
              <h3 className={`${DISPLAY} text-[clamp(25px,7.2vw,40px)] leading-[1.05] text-(--cx-white) md:text-[clamp(32px,3.5vw,60px)]`}>
                {item.title}
                {item.placeholder && <PlaceholderTag />}
              </h3>
              <p className="cx-inc-detail text-[15px] leading-snug text-(--cx-white)/90 md:text-[17px] md:leading-[1.45] lg:text-[clamp(17px,1.25vw,21px)]">{item.detail}</p>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
