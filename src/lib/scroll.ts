// Smooth-scroll to an element by id.
//
// The careers page mounts a global Lenis smooth-scroll instance (see
// parallax-scrolling.tsx), which hijacks the wheel and overrides native
// window scrolling — so plain el.scrollIntoView() gets snapped back and
// appears to do nothing. When Lenis is running we route through its own
// scrollTo(); otherwise we fall back to native smooth scroll.
export function scrollToId(id: string, offset = -90) {
  if (typeof window === "undefined") return;
  const el = document.getElementById(id);
  if (!el) return;

  const lenis = (window as unknown as { lenis?: { scrollTo: (t: HTMLElement, o?: { offset?: number; duration?: number }) => void } }).lenis;
  if (lenis?.scrollTo) {
    lenis.scrollTo(el, { offset, duration: 1.2 });
  } else {
    el.scrollIntoView({ behavior: "smooth", block: "start" });
  }
}
