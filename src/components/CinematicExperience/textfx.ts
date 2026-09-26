import gsap from "gsap";
import { SplitText } from "gsap/SplitText";

/**
 * The film's words, each entering its own way, as a line in a title sequence
 * would. Added to the scrubbed timelines (animations.ts), so every effect
 * plays forwards and backwards with the scroll and every scroll position
 * shows the same frame.
 *
 *   rise      letters rise out of their own masks (passport, READY TO GO?)
 *   scramble  a departures board: letters flicker through the alphabet and
 *             land left to right (boarding pass, coordinates, the date)
 *   rush      words rush in from the right with motion blur (the plane)
 *   flip      letters turn over in 3D, from the middle out (the globe)
 *   wipe      a gold-edged wipe, like a route being drawn (the map)
 *   track     letters converge from wide spacing into the word (city names)
 *   type      typed, letter by letter, each landing in gold (arrival)
 *   words     word by word, soft, out of a blur (the hotel, lines of copy)
 *
 * SplitText keeps the words readable to screen readers (aria-label on the
 * element, the pieces hidden). Everything here is undone by revertTextFx(),
 * which CinematicExperience calls when the timelines are rebuilt, so a
 * scramble never leaves a half-set word behind.
 */
export type TextFx = "rise" | "scramble" | "rush" | "flip" | "wipe" | "track" | "type" | "words";

const undo = new Set<() => void>();

export function revertTextFx() {
  undo.forEach((fn) => fn());
  undo.clear();
}

function split(el: HTMLElement, type: "chars" | "words", mask = false) {
  const s = SplitText.create(el, mask ? { type, mask: type } : { type });
  undo.add(() => s.revert());
  return type === "chars" ? (s.chars as HTMLElement[]) : (s.words as HTMLElement[]);
}

/** A deterministic flicker: the same letter for the same place and moment. */
const flick = (i: number, frame: number, pool: string) => pool[Math.abs(Math.imul(i + 1, 2654435761) ^ Math.imul(frame + 7, 40503)) % pool.length];
const UPPER = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
const LOWER = "abcdefghijklmnopqrstuvwxyz";
const DIGITS = "0123456789";

/** Add `el`'s entrance to `tl` at `at`, lasting about `dur` (timeline units). */
export function textIn(tl: gsap.core.Timeline, el: Element | null | undefined, fx: TextFx, at: number, dur: number) {
  if (!(el instanceof HTMLElement)) return;
  switch (fx) {
    case "rise": {
      const chars = split(el, "chars", true);
      const each = (dur * 0.35) / Math.max(1, chars.length);
      tl.fromTo(chars, { yPercent: 118 }, { yPercent: 0, ease: "power3.out", duration: dur * 0.65, stagger: { each, from: "center" } }, at);
      return;
    }
    case "flip": {
      const chars = split(el, "chars");
      gsap.set(el, { perspective: 700 });
      const each = (dur * 0.4) / Math.max(1, chars.length);
      tl.fromTo(chars, { rotationX: -100, autoAlpha: 0, transformOrigin: "50% 50% -0.35em" }, { rotationX: 0, autoAlpha: 1, ease: "power2.out", duration: dur * 0.6, stagger: { each, from: "center" } }, at);
      return;
    }
    case "rush": {
      const words = split(el, "words");
      const each = (dur * 0.3) / Math.max(1, words.length);
      tl.fromTo(words, { x: "38vw", skewX: -16, autoAlpha: 0, filter: "blur(10px)" }, { x: 0, skewX: 0, autoAlpha: 1, filter: "blur(0px)", ease: "power3.out", duration: dur * 0.7, stagger: each }, at);
      return;
    }
    case "track": {
      const chars = split(el, "chars");
      const mid = (chars.length - 1) / 2;
      const em = parseFloat(getComputedStyle(el).fontSize) || 16;
      tl.fromTo(chars, { x: (i: number) => (i - mid) * em * 0.32, autoAlpha: 0, filter: "blur(10px)" }, { x: 0, autoAlpha: 1, filter: "blur(0px)", ease: "power3.out", duration: dur }, at);
      return;
    }
    case "type": {
      const chars = split(el, "chars");
      const each = dur / Math.max(1, chars.length);
      tl.fromTo(chars, { autoAlpha: 0 }, { autoAlpha: 1, duration: 0.001, stagger: each, immediateRender: true }, at);
      const ink = getComputedStyle(el).color;
      tl.fromTo(chars, { color: "#f2d38e" }, { color: ink, duration: each * 4, stagger: each, ease: "power1.out" }, at);
      return;
    }
    case "words": {
      const words = split(el, "words");
      const each = (dur * 0.45) / Math.max(1, words.length);
      tl.fromTo(words, { autoAlpha: 0, y: 12, filter: "blur(8px)" }, { autoAlpha: 1, y: 0, filter: "blur(0px)", ease: "power2.out", duration: dur * 0.55, stagger: each }, at);
      return;
    }
    case "wipe": {
      el.classList.add("cx-wipe");
      undo.add(() => el.classList.remove("cx-wipe"));
      tl.fromTo(el, { "--wipe": "0%" }, { "--wipe": "100%", ease: "power2.inOut", duration: dur }, at);
      // The gold edge goes once the words are whole.
      tl.fromTo(el, { "--wipe-done": 0 }, { "--wipe-done": 1, duration: dur * 0.25 }, at + dur * 0.85);
      return;
    }
    case "scramble": {
      const final = el.textContent ?? "";
      undo.add(() => {
        el.textContent = final;
      });
      if (!el.getAttribute("aria-label")) {
        el.setAttribute("aria-label", final);
        undo.add(() => el.removeAttribute("aria-label"));
      }
      const state = { p: 0 };
      const n = final.length;
      const draw = () => {
        // Letters land left to right; a few ahead of the landed ones flicker.
        const landed = Math.floor(state.p * (n + 5)) - 5;
        const frame = Math.floor(state.p * 48);
        let out = "";
        for (let i = 0; i < n; i++) {
          const ch = final[i];
          if (i < landed || !/[A-Za-z0-9]/.test(ch)) out += ch;
          else if (i < landed + 5) out += flick(i, frame, /[0-9]/.test(ch) ? DIGITS : ch === ch.toUpperCase() ? UPPER : LOWER);
          else out += " ";
        }
        el.textContent = out;
      };
      tl.fromTo(state, { p: 0 }, { p: 1, ease: "none", duration: dur, onUpdate: draw, onStart: draw }, at);
      return;
    }
  }
}
