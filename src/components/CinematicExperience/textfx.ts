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
 * Three rules every effect keeps:
 *  - Its first frame is set on every piece when it is built (hold), not when
 *    the playhead reaches it. The film's timelines default to immediateRender
 *    false, so a word stood whole on screen until its effect began and then
 *    snapped back to play in: seen twice. And immediateRender is not enough
 *    for a staggered effect: it sets only the pieces that start at once (the
 *    first letter), so the rest showed early on a first pass down the page.
 *  - Letters are split inside their words, so a line only ever breaks
 *    between words ("journe / y" came from splitting letters alone).
 *  - Screen readers get the words once, plainly: a visually hidden copy sits
 *    beside the pieces, which are hidden from them. The element keeps its
 *    role, so a heading is still a heading.
 *
 * Everything here is undone by revertTextFx(), which CinematicExperience
 * calls when the timelines are rebuilt.
 */
export type TextFx = "rise" | "scramble" | "rush" | "flip" | "wipe" | "track" | "type" | "words";

const undo = new Set<() => void>();

export function revertTextFx() {
  undo.forEach((fn) => fn());
  undo.clear();
}

/** Give the element's words to an effect: a plain copy for screen readers, the rest for the eye. */
function stage(el: HTMLElement) {
  const html = el.innerHTML;
  const sr = document.createElement("span");
  sr.className = "sr-only";
  sr.textContent = (el.textContent ?? "").replace(/\s+/g, " ").trim();
  const vis = document.createElement("span");
  vis.setAttribute("aria-hidden", "true");
  vis.style.display = getComputedStyle(el).display.startsWith("inline") ? "inline-block" : "block";
  vis.append(...Array.from(el.childNodes));
  el.append(sr, vis);
  undo.add(() => {
    el.innerHTML = html;
  });
  return vis;
}

function split(el: HTMLElement, type: "chars" | "words", mask = false) {
  const vis = stage(el);
  const s = SplitText.create(vis, {
    type: type === "chars" ? "words,chars" : "words",
    aria: "none",
    wordsClass: "cx-wd",
    charsClass: "cx-ch",
    ...(mask ? { mask: "chars" as const } : {}),
  });
  undo.add(() => s.revert());
  return { chars: s.chars as HTMLElement[], words: s.words as HTMLElement[] };
}

/** A deterministic flicker: the same letter for the same place and moment. */
const flick = (i: number, frame: number, pool: string) => pool[Math.abs(Math.imul(i + 1, 2654435761) ^ Math.imul(frame + 7, 40503)) % pool.length];
const UPPER = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
const LOWER = "abcdefghijklmnopqrstuvwxyz";
const DIGITS = "0123456789";

/**
 * A fromTo whose first frame is on every target from the moment it is built:
 * set here, explicitly, because a staggered tween's immediateRender reaches
 * only the targets whose stagger starts at once.
 */
export function hold(tl: gsap.core.Timeline, targets: gsap.TweenTarget, from: gsap.TweenVars, to: gsap.TweenVars, at: number) {
  gsap.set(targets, from);
  tl.fromTo(targets, from, { ...to, immediateRender: false }, at);
}

/** Add `el`'s entrance to `tl` at `at`, lasting about `dur` (timeline units). */
export function textIn(tl: gsap.core.Timeline, el: Element | null | undefined, fx: TextFx, at: number, dur: number) {
  if (!(el instanceof HTMLElement)) return;
  switch (fx) {
    case "rise": {
      const { chars } = split(el, "chars", true);
      const each = (dur * 0.35) / Math.max(1, chars.length);
      // 140%: clear of the mask's padding (cinematic.css), which is there so
      // descenders and serifs are never clipped once the letters have landed.
      hold(tl, chars, { yPercent: 140 }, { yPercent: 0, ease: "power3.out", duration: dur * 0.65, stagger: { each, from: "center" } }, at);
      return;
    }
    case "flip": {
      const { chars, words } = split(el, "chars");
      gsap.set(words, { perspective: 700 });
      const each = (dur * 0.4) / Math.max(1, chars.length);
      hold(tl, chars, { rotationX: -100, autoAlpha: 0, transformOrigin: "50% 50% -0.35em" }, { rotationX: 0, autoAlpha: 1, ease: "power2.out", duration: dur * 0.6, stagger: { each, from: "center" } }, at);
      return;
    }
    case "rush": {
      const { words } = split(el, "words");
      const each = (dur * 0.3) / Math.max(1, words.length);
      hold(tl, words, { x: "38vw", skewX: -16, autoAlpha: 0, filter: "blur(10px)" }, { x: 0, skewX: 0, autoAlpha: 1, filter: "blur(0px)", ease: "power3.out", duration: dur * 0.7, stagger: each }, at);
      return;
    }
    case "track": {
      // Crisp at every frame: the letters slide together and are fully there
      // before they meet, so the word never reads as broken strokes.
      // Anchored on the first letter, which never moves: the rest come in
      // from the right, the way the cities travel. They used to spread about
      // the middle, 0.34em a letter, which put GUANGZHOU's G 1.36em left of
      // its place (163px at 1280) — over the hanzi beside it, and on a phone
      // off the screen, with the last letters off the other side. The spread
      // is capped by the room to the right of the word, so no letter ever
      // starts off screen. Measured from layout (offsetLeft), not from the
      // letters' boxes, which carry this very transform on a refresh.
      const { chars } = split(el, "chars");
      const em = parseFloat(getComputedStyle(el).fontSize) || 16;
      let step = 0;
      const spread = (i: number) => {
        if (i === 0) {
          const last = chars[chars.length - 1] as HTMLElement;
          const host = last.offsetParent as HTMLElement | null;
          const right = (host ? host.getBoundingClientRect().left : 0) + last.offsetLeft + last.offsetWidth;
          const room = window.innerWidth - right - 16;
          step = Math.max(0, Math.min(em * 0.34, room / Math.max(1, chars.length - 1)));
        }
        return i * step;
      };
      hold(tl, chars, { x: spread }, { x: 0, ease: "power3.out", duration: dur }, at);
      hold(tl, chars, { autoAlpha: 0 }, { autoAlpha: 1, ease: "power1.out", duration: dur * 0.45 }, at);
      return;
    }
    case "type": {
      const { chars } = split(el, "chars");
      const each = dur / Math.max(1, chars.length);
      hold(tl, chars, { autoAlpha: 0 }, { autoAlpha: 1, duration: 0.001, stagger: each }, at);
      const ink = getComputedStyle(el).color;
      // Once landed, the colour is the stylesheet's again (clearProps), so a
      // heading that lights up when it is being read (Terms) can still change.
      hold(tl, chars, { color: "#f2d38e" }, { color: ink, duration: each * 4, stagger: each, ease: "power1.out", clearProps: "color" }, at);
      return;
    }
    case "words": {
      const { words } = split(el, "words");
      const each = (dur * 0.45) / Math.max(1, words.length);
      hold(tl, words, { autoAlpha: 0, y: 12, filter: "blur(8px)" }, { autoAlpha: 1, y: 0, filter: "blur(0px)", ease: "power2.out", duration: dur * 0.55, stagger: each }, at);
      return;
    }
    case "wipe": {
      // Driven by custom properties whose stylesheet fallbacks ARE the first
      // frame (hidden, no edge): a ScrollTrigger refresh reverts the timelines,
      // and GSAP cannot save a custom property's inline value, so a revert
      // deletes it. With these fallbacks a deleted value can only hide.
      el.classList.add("cx-wipe");
      undo.add(() => {
        el.classList.remove("cx-wipe");
        ["--wipe", "--wipe-on", "--wipe-done"].forEach((p) => el.style.removeProperty(p));
      });
      hold(tl, el, { "--wipe-on": 0 }, { "--wipe-on": 1, duration: 0.001 }, at);
      hold(tl, el, { "--wipe": "0%" }, { "--wipe": "100%", ease: "power2.inOut", duration: dur }, at);
      // The gold edge goes once the words are whole.
      hold(tl, el, { "--wipe-done": 0 }, { "--wipe-done": 1, duration: dur * 0.25 }, at + dur * 0.85);
      return;
    }
    case "scramble": {
      const vis = stage(el);
      const final = vis.textContent ?? "";
      // What has landed (and the flicker at its front) is shown; the rest of
      // the words are there but invisible, so the line keeps its final width
      // and wrapping throughout and nothing beside it moves.
      const lit = document.createElement("span");
      const rest = document.createElement("span");
      rest.style.opacity = "0";
      vis.replaceChildren(lit, rest);
      const state = { p: 0 };
      const n = final.length;
      let last = "";
      let still: ReturnType<typeof setTimeout> | undefined;
      // settled: the scroll has stopped. The flicker is a thing of motion; at
      // rest every letter shown is its real one and the rest stay hidden.
      // Scrubbed, a stopped scroll used to freeze the flicker, and a reader
      // saw "23.13° N · 569." and "116.41° T": wrong figures, standing still.
      const draw = (settled = false) => {
        // Letters land left to right; a few ahead of the landed ones flicker;
        // nothing (not even a stray "." or "°") shows before the front reaches it.
        const landed = Math.floor(state.p * (n + 5)) - 5;
        const frame = Math.floor(state.p * 48);
        const cut = Math.max(0, Math.min(n, landed + 5));
        let shown = "";
        for (let i = 0; i < cut; i++) {
          const ch = final[i];
          if (settled || i < landed || /\s/.test(ch)) shown += ch;
          else shown += /[0-9]/.test(ch) ? flick(i, frame, DIGITS) : /[A-Z]/.test(ch) ? flick(i, frame, UPPER) : /[a-z]/.test(ch) ? flick(i, frame, LOWER) : ch;
        }
        const key = `${cut}|${shown}`;
        if (key === last) return;
        last = key;
        lit.textContent = shown;
        rest.textContent = final.slice(cut);
      };
      // The scrub keeps updating for its 0.6s catch-up after the wheel stops,
      // so "stopped" is 160ms without an update.
      const moved = () => {
        draw();
        clearTimeout(still);
        still = setTimeout(() => draw(true), 160);
      };
      undo.add(() => clearTimeout(still));
      draw();
      tl.fromTo(state, { p: 0 }, { p: 1, ease: "none", duration: dur, onUpdate: moved, onStart: moved, immediateRender: false }, at);
      return;
    }
  }
}
