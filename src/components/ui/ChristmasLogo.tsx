import "./christmas-logo.css";

/**
 * The AFFHAN logo in its Santa hat, Christmas 2026 (the owner: "use this logo on website now affhan logo ... do some
 * animation on the christmas hat live waving in website ... responsive perfection"; then their 3D picture: "use this
 * logo instead of the old logo ... the brand logo too perfectly"; lib/christmas.ts turns it on).
 *
 * public/affhan-christmas-layers.webp holds four 225 px tiles on one frame, cut from the owner's picture
 * (public/affhan-christmas.png) by scripts/build_christmas_logo.mjs: the hat's cone, its floppy tip and its pompom, and
 * the rest of the picture, laid over them. The brim sits on the A and stays, with the logo; the cone sways a little on
 * its base (down behind the brim), the tip swings from the fold, and the pompom a moment after the tip, as a breeze
 * would move it, with a gust once round.
 *
 * Every piece fills the box, so the logo follows the size of the box it is given (where public/logo.png was) and the
 * hat moves the same at every size; the frame holds the logo and its hat at 89% of its height, in the middle. Only
 * transforms move: the graphics card's work, never a repaint. Still, in its picture's pose, for anyone whose device
 * asks for less motion.
 */
export function ChristmasLogo({ label, className = "" }: { label: string; className?: string }) {
  return (
    <span role="img" aria-label={label} className={`xmas-logo ${className}`}>
      <span className="xmas-sway">
        <span className="xmas-piece xmas-cone" />
        <span className="xmas-flop">
          <span className="xmas-piece xmas-tip" />
          <span className="xmas-bob">
            <span className="xmas-piece xmas-pompom" />
          </span>
        </span>
      </span>
      <span className="xmas-piece xmas-rest" />
    </span>
  );
}
