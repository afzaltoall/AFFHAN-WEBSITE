/**
 * Reference-counted lock on background scrolling.
 *
 * Two overlays can be open at once — the image-search results panel opens the
 * inquiry modal on top of itself — and each used to save and restore
 * document.body.style.overflow on its own. That only works for one overlay at
 * a time: the inner one starts while overflow is already "hidden", so it saves
 * "hidden" as the value to put back, and whichever cleanup React happened to
 * run last decided the outcome. Closing both could leave the page frozen with
 * overflow:hidden and no way to scroll it.
 *
 * Counting removes the ordering question entirely. The original value is read
 * once, when the first lock is taken, and put back once, when the last is
 * released.
 */
let depth = 0;
let original = "";

/** Locks background scrolling. Returns the matching release; calling it more
 *  than once is a no-op, so it is safe to hand straight to an effect cleanup. */
export function lockBodyScroll(): () => void {
  if (depth === 0) {
    original = document.body.style.overflow;
    document.body.style.overflow = "hidden";
  }
  depth += 1;

  let released = false;
  return () => {
    if (released) return;
    released = true;
    depth -= 1;
    if (depth === 0) document.body.style.overflow = original;
  };
}
