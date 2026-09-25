import { FREE } from "./content";
import { DISPLAY } from "./parts";

/**
 * 10 FREE reveal: the biggest moment on the page, and built to be.
 *
 * Everything else has gone dark. Gold particles gather out of the black into
 * the shape of the word (particles.ts, scrubbed by scroll), then FREE itself
 * resolves from a blur into sharp, gold-lit type at the largest size anything
 * on the page is set, with a glow behind it and one sweep of light across the
 * letters. Then CHINA BUSINESS TRIP, letter by letter. No bounce, no overshoot.
 *
 * The light sweep is a narrow window (free-sweep) sliding across a brighter
 * copy of the word that slides the opposite way at the same rate, so the copy
 * stays registered on the letters while the window moves: a moving highlight
 * made of transforms only.
 */

const WORD = "block whitespace-nowrap uppercase leading-[0.8] tracking-[0.02em] text-[33vw] md:text-[min(29vw,52vh)]";

export function Scene10FreeReveal() {
  return (
    <div data-cx-scene="free">
      <canvas data-cx="free-particles" data-cx-hide aria-hidden className="pointer-events-none absolute inset-0 z-[49] h-full w-full" />
      <div className="pointer-events-none absolute inset-0 z-[50] flex items-center justify-center">
        <div data-cx="free-lockup" data-cx-hide className="relative flex flex-col items-center text-center">
          <div
            data-cx="free-glow"
            aria-hidden
            className="cx-free-glow absolute left-1/2 top-[44%] h-[92vw] w-[130vw] -translate-x-1/2 -translate-y-1/2 md:h-[min(60vw,110vh)] md:w-[96vw]"
          />
          <h2 className="relative">
            <span className="sr-only">
              {FREE.word} {FREE.sub}
            </span>
            <span aria-hidden className="relative block">
              <span data-cx="free-blur" className={`${DISPLAY} ${WORD} cx-free-blur absolute inset-0`}>
                {FREE.word}
              </span>
              <span data-cx="free-word" className={`${DISPLAY} ${WORD} cx-free-word relative`}>
                {FREE.word}
              </span>
              <span
                data-cx="free-sweep"
                className="absolute inset-y-0 left-0 w-[24%] overflow-hidden [mask-image:linear-gradient(90deg,transparent,#000_42%,#000_58%,transparent)]"
              >
                <span data-cx="free-sweep-inner" className={`${DISPLAY} ${WORD} cx-free-hi absolute left-0 top-0 w-[416.667%]`}>
                  {FREE.word}
                </span>
              </span>
            </span>
            <span
              aria-hidden
              className="mt-[2.2vh] block whitespace-nowrap text-[clamp(13px,4.1vw,22px)] font-medium uppercase tracking-[0.42em] text-(--cx-white) md:mt-[3vh] md:text-[clamp(16px,1.7vw,30px)] md:tracking-[0.55em]"
            >
              {[...FREE.sub].map((ch, i) => (
                <span key={i} data-cx="free-sub-char" className="inline-block">
                  {ch === " " ? "\u00a0" : ch}
                </span>
              ))}
            </span>
          </h2>
        </div>
      </div>
    </div>
  );
}
