import "./christmas-logo.css";

/**
 * The AFFHAN logo in its Santa hat, Christmas 2026 (the owner: "use this logo on website now affhan logo ... do some
 * animation on the christmas hat live waving in website ... responsive perfection"; lib/christmas.ts turns it on).
 *
 * public/affhan-christmas-layers.webp holds five 225 px tiles on one frame: public/logo.png itself, then the hat cut
 * from the owner's picture (public/affhan-christmas.png) in four pieces, by scripts/build_christmas_logo.mjs. Laid one
 * over another they are the picture. The brim sits on the A and stays; the cone sways a little on its base, its floppy
 * tip swings from the fold, and the pompom a moment after the tip, as a breeze would move it, with a gust once round.
 *
 * Every piece fills the box, so the logo follows the size of the box it is given (where public/logo.png was) and the
 * hat moves the same at every size. It is drawn a fifth bigger than the box and centred in it, hat and all (the owner:
 * "slightly make the logo big"; christmas-logo.css), without the box itself, or anything beside it, moving. Only
 * transforms move: the graphics card's work, never a repaint. Still, in its picture's pose, for anyone whose device
 * asks for less motion.
 */
export function ChristmasLogo({ label, className = "" }: { label: string; className?: string }) {
  return (
    <span role="img" aria-label={label} className={`xmas-logo ${className}`}>
      <span className="xmas-piece xmas-base" />
      <span className="xmas-sway">
        <span className="xmas-piece xmas-cone" />
        <span className="xmas-flop">
          <span className="xmas-piece xmas-tip" />
          <span className="xmas-bob">
            <span className="xmas-piece xmas-pompom" />
          </span>
        </span>
      </span>
      <span className="xmas-piece xmas-brim" />
    </span>
  );
}
