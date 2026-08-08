"use client";

import React, { useEffect, useRef } from "react";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import Lenis from "lenis";

export function ParallaxComponent() {
  const parallaxRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    gsap.registerPlugin(ScrollTrigger);

    const sectionEl = parallaxRef.current?.querySelector(".parallax__header");
    const triggerElement = parallaxRef.current?.querySelector("[data-parallax-layers]");

    let tl: gsap.core.Timeline | null = null;
    if (sectionEl && triggerElement) {
      // Scrub across the whole (tall) header while the visuals stay pinned via
      // CSS sticky — a long, continuous parallax before the page moves on to
      // the footer, instead of a one-screen flash.
      tl = gsap.timeline({
        scrollTrigger: {
          trigger: sectionEl,
          start: "top top",
          end: "bottom bottom",
          scrub: 0.5,
        },
      });

      // All three image layers (1/2/4) stay static so the mountain scene reads
      // as one fixed background — animating them at different speeds separated
      // the ridges into a "double mountain" seam. Only the title (layer 3)
      // scrolls up over the fixed scene: background fixed, content scrolls.
      const layers = [
        { layer: "3", yPercent: -55 },
      ];

      layers.forEach((layerObj, idx) => {
        tl!.to(
          triggerElement.querySelectorAll(`[data-parallax-layer="${layerObj.layer}"]`),
          { yPercent: layerObj.yPercent, ease: "none" },
          idx === 0 ? undefined : "<"
        );
      });
    }

    const lenis = new Lenis();
    lenis.on("scroll", ScrollTrigger.update);
    const tick = (time: number) => lenis.raf(time * 1000);
    gsap.ticker.add(tick);
    gsap.ticker.lagSmoothing(0);

    // The parallax lives far down a very tall page (300vh WebGL hero above it)
    // and its layer images load late — both shift layout after the trigger's
    // start/end were first measured, which left the scrub range stale and the
    // layers frozen. Recompute once images are in and once more after layout
    // settles so the scroll effect actually tracks.
    const imgs = Array.from(parallaxRef.current?.querySelectorAll("img") ?? []);
    let loaded = 0;
    const onImg = () => { if (++loaded >= imgs.length) ScrollTrigger.refresh(); };
    imgs.forEach((img) => {
      if (img.complete) onImg();
      else img.addEventListener("load", onImg, { once: true });
    });
    const refreshTimer = setTimeout(() => ScrollTrigger.refresh(), 900);

    return () => {
      clearTimeout(refreshTimer);
      ScrollTrigger.getAll().forEach((st) => st.kill());
      if (triggerElement) gsap.killTweensOf(triggerElement);
      tl?.kill();
      gsap.ticker.remove(tick);
      lenis.destroy();
    };
  }, []);

  return (
    <div className="parallax" ref={parallaxRef}>
      <section className="parallax__header">
        <div className="parallax__visuals">
          <div className="parallax__black-line-overflow"></div>
          <div data-parallax-layers className="parallax__layers">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="https://cdn.prod.website-files.com/671752cd4027f01b1b8f1c7f/6717795be09b462b2e8ebf71_osmo-parallax-layer-3.webp" loading="eager" width={800} data-parallax-layer="1" alt="" className="parallax__layer-img" />
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="https://cdn.prod.website-files.com/671752cd4027f01b1b8f1c7f/6717795b4d5ac529e7d3a562_osmo-parallax-layer-2.webp" loading="eager" width={800} data-parallax-layer="2" alt="" className="parallax__layer-img" />
            <div data-parallax-layer="3" className="parallax__layer-title">
              <h2 className="parallax__title">Global Reach</h2>
            </div>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="https://cdn.prod.website-files.com/671752cd4027f01b1b8f1c7f/6717795bb5aceca85011ad83_osmo-parallax-layer-1.webp" loading="eager" width={800} data-parallax-layer="4" alt="" className="parallax__layer-img" />
          </div>
          <div className="parallax__fade"></div>
        </div>
      </section>
    </div>
  );
}

export default ParallaxComponent;
