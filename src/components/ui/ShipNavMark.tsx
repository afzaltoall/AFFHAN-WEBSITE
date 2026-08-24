import Image from "next/image";

/**
 * The AFFHAN sail mark, in the gap on the right of the navbar.
 *
 * Decorative only, so it is aria-hidden with an empty alt — a screen reader
 * announcing "ship" between the search field and the About link would be noise.
 *
 * No SVG sea under it, deliberately. Earlier revisions of this component drew
 * three animated wave layers because the supplied artwork was a photograph of a
 * vessel that needed water putting under it. This mark is a flat logo that
 * already contains its own wave, so a second one below it read as two different
 * bodies of water meeting at a seam. The motion moved onto the mark itself.
 *
 * That motion is a slow vertical drift rather than a roll. Rotating would tilt
 * the wave along with the hull, which looks like the sea is tipping rather than
 * the boat riding it.
 *
 * The asset is public/affhan-ship-nav.webp — the source PNG trimmed of its
 * transparent padding (284px of it horizontally, so the mark fills its box
 * instead of floating in the middle) and re-encoded, 166x175 at 5.9KB. It has a
 * real alpha channel, so it needs no plate behind it and works on any surface.
 */
export function ShipNavMark({ className = "" }: { className?: string }) {
  return (
    /* Centred by flex, not by absolute + translate.
     *
     * The previous version positioned the image with `absolute top-1/2` plus
     * `-translate-y-1/2`, while the drift animation also wrote `transform` —
     * two rules fighting over one property, so the centring only held for as
     * long as the keyframes happened to restate it. That is what pushed the
     * mark up out of the bar. Letting flex do the centring means the animation
     * owns `transform` outright and can never move the mark off its line.
     *
     * No fixed height either: the parent nav row is already `items-center`, so
     * the mark inherits the bar's own vertical centre instead of guessing at
     * it. */
    <span
      aria-hidden="true"
      className={`ship-mark flex shrink-0 items-center ${className}`}
    >
      {/* w-/h-auto as a pair: sizing only one of the two makes next/image warn
          that the aspect ratio changed, and it would be right. */}
      <Image
        src="/affhan-ship-nav.webp"
        alt=""
        width={166}
        height={175}
        sizes="44px"
        className="ship-mark__vessel block w-11 h-auto object-contain"
      />
    </span>
  );
}
