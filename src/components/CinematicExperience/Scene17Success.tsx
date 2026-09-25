"use client";

import { useEffect, useRef } from "react";
import { SUCCESS } from "./content";
import { GoldDust } from "./GoldDust";
import { DISPLAY } from "./parts";

/**
 * 17 Success. Replaces the form in place once the application is sent. Dark,
 * calm, centred: gold dust drifts up behind APPLICATION RECEIVED. Focus moves
 * to the heading so keyboard and screen-reader users land on the result.
 */
export function Scene17Success() {
  const ref = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    ref.current?.focus({ preventScroll: true });
    ref.current?.scrollIntoView({ block: "center" });
  }, []);

  return (
    <div className="relative isolate flex min-h-[62svh] flex-col items-center justify-center overflow-hidden py-20 text-center">
      <GoldDust className="absolute inset-0 -z-10 h-full w-full" density={0.9} />
      <div aria-hidden className="cx-glow-gold absolute left-1/2 top-1/2 -z-10 h-[80vw] w-[80vw] -translate-x-1/2 -translate-y-1/2 opacity-60 md:h-[40vw] md:w-[40vw]" />
      <h2
        ref={ref}
        tabIndex={-1}
        className={`${DISPLAY} cx-enter-rise text-[clamp(34px,9vw,60px)] uppercase leading-[0.98] tracking-[0.02em] text-(--cx-white) outline-none md:text-[clamp(48px,5.6vw,96px)]`}
      >
        {SUCCESS.title}
      </h2>
      <p className="cx-enter-rise mt-7 max-w-[34rem] text-[17px] leading-relaxed text-(--cx-mute) md:text-[19px]" style={{ animationDelay: "0.25s" }}>
        {SUCCESS.line}
      </p>
    </div>
  );
}
