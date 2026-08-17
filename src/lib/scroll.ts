// Prepare the /products catalogue for a category/search navigation, SYNCHRONOUSLY
// and before router.push (which is async in the App Router). The default view
// carries a tall opening scroll-hero (#catalogue-hero, the "Discover/Deliver/
// Verify/Customize" choreography). If we let React unmount it on its own, the
// page paints one hero frame at the top first — the reported flash. Hiding it +
// jumping to the top here, right in the click handler, means the very next paint
// is already the category view. Safe no-op on pages without the hero.
export function prepCatalogueNav() {
  if (typeof document === "undefined") return;
  const hero = document.getElementById("catalogue-hero");
  if (hero) hero.style.display = "none";
  const el = document.documentElement;
  const prev = el.style.scrollBehavior;
  el.style.scrollBehavior = "auto"; // beat the global smooth-scroll
  window.scrollTo(0, 0);
  el.style.scrollBehavior = prev;
}

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
