import type { CSSProperties, ReactNode } from "react";
import { srcSetOf, type FilmAsset } from "./assets";
import { PLACEHOLDER_TAG } from "./content";

/** Tailwind class strings shared by the scenes. Literal, so Tailwind finds them. */
export const DISPLAY = "font-[family-name:var(--font-cx-display)]";
export const EYEBROW = "text-[11px] font-semibold uppercase tracking-[0.32em] text-(--cx-gold) sm:text-[12px]";
/** Every film object is a full-stage layer that centres its picture. */
export const LAYER = "pointer-events-none absolute inset-0 flex items-center justify-center";

/**
 * One picture in the film.
 *
 * `eager` pictures (the opening frame) get a real src in the server HTML.
 * Every other picture ships with data-src / data-srcset only and is given its
 * source by the loader in CinematicExperience, in the order the film needs
 * them, once the page has finished loading. Without that, all fourteen would
 * download at once on arrival (they sit inside the viewport, merely
 * transparent) and compete with the opening frame for bandwidth.
 */
export function FilmImage({
  asset,
  alt,
  sizes,
  eager = false,
  priority = false,
  className = "",
  style,
}: {
  asset: FilmAsset;
  alt: string;
  sizes: string;
  eager?: boolean;
  priority?: boolean;
  className?: string;
  style?: CSSProperties;
}) {
  const common = {
    alt,
    width: asset.w,
    height: asset.h,
    decoding: "async" as const,
    draggable: false,
    className: `block h-auto w-full select-none ${className}`,
    style,
  };
  if (eager) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        {...common}
        src={asset.src}
        srcSet={srcSetOf(asset)}
        sizes={sizes}
        fetchPriority={priority ? "high" : "low"}
      />
    );
  }
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img {...common} data-src={asset.src} data-srcset={srcSetOf(asset)} data-sizes={sizes} />
  );
}

/** A visible tag on anything that still needs approved copy. See README.md. */
export function PlaceholderTag({ className = "" }: { className?: string }) {
  return (
    <span
      className={`ml-2 inline-flex translate-y-[-0.15em] items-center rounded-full border border-dashed border-(--cx-gold)/60 px-2 py-[2px] align-middle font-sans text-[10px] font-semibold uppercase tracking-[0.18em] text-(--cx-gold) ${className}`}
    >
      {PLACEHOLDER_TAG}
    </span>
  );
}

/**
 * A chapter caption: small gold eyebrow, editorial title. Positioned by the
 * caller; animated as a whole by the film timeline through `cx`.
 */
export function Caption({
  cx,
  eyebrow,
  title,
  className = "",
  children,
}: {
  cx: string;
  eyebrow: string;
  title: string;
  className?: string;
  children?: ReactNode;
}) {
  return (
    <div data-cx={cx} data-cx-hide className={`pointer-events-none absolute z-40 max-w-[min(34rem,88vw)] ${className}`}>
      <p data-cx-part="eyebrow" className={EYEBROW}>{eyebrow}</p>
      <p data-cx-part="title" className={`${DISPLAY} mt-3 text-balance text-[clamp(30px,4.2vw,64px)] leading-[1.02] tracking-[-0.01em] text-(--cx-white)`}>
        {title}
      </p>
      {children}
    </div>
  );
}
