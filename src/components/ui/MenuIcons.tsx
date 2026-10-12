import type { LucideIcon } from "lucide-react";
import { SHIP_MARK_NAV } from "@/lib/shipMarkAssets";

/**
 * The menu drawer's icons, as one family (the owner, 2026-10-12: "everything
 * looks different from one another"). It had four kinds: grey line icons, a
 * gold laurel photo, the shipping emblem in navy and teal, and the trip's full
 * colour picture. Now every row is drawn the way AFFHAN Shipping's emblem is,
 * a line in its own navy-to-teal (sampled from public/affhan-ship.png:
 * #011f5c at its foot to #01a8c5 at its top, the brand's teal), on the same
 * pale tile. A pointer, a press or the keyboard on a row fills its tile with
 * the gradient and turns the line white. The emblem itself is painted through
 * its own shape (a CSS mask), so it takes the gradient, and the white, like
 * the rest. The trip's colour picture stays where it is meant to stand out:
 * the bar (TripNavLink).
 */

/** The ink, bottom left to top right, as the emblem runs. */
const INK_FROM = "#06205e";
const INK_TO = "#03a6c4";
export const MENU_INK = `linear-gradient(45deg, ${INK_FROM}, ${INK_TO})`;
const INK_ID = "menu-ink";

/**
 * The gradient the line icons stroke with: once, in the drawer. In the icons'
 * own 24-unit frame (userSpaceOnUse), not each stroke's box: a straight line's
 * box has no width or no height, and a gradient laid on that paints nothing,
 * so About's "i" and the trophy's foot were missing.
 */
export function MenuInkDefs() {
  return (
    <svg aria-hidden="true" width="0" height="0" className="absolute">
      <defs>
        <linearGradient id={INK_ID} gradientUnits="userSpaceOnUse" x1="2" y1="22" x2="22" y2="2">
          <stop offset="0" stopColor={INK_FROM} />
          <stop offset="1" stopColor={INK_TO} />
        </linearGradient>
      </defs>
    </svg>
  );
}

/** Every row's tile: pale at rest, the gradient under a pointer, a press or the keyboard (the row is the `group`). */
export const MENU_TILE =
  "flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#eef6f9] ring-1 ring-inset ring-[#d7ebf2] transition-[background-color,box-shadow] duration-200 group-hover:bg-[linear-gradient(45deg,#06205e,#03a6c4)] group-hover:ring-transparent group-active:bg-[linear-gradient(45deg,#06205e,#03a6c4)] group-active:ring-transparent group-focus-visible:bg-[linear-gradient(45deg,#06205e,#03a6c4)] group-focus-visible:ring-transparent [&_svg]:transition-[stroke] group-hover:[&_svg]:stroke-white group-active:[&_svg]:stroke-white group-focus-visible:[&_svg]:stroke-white";

/** A line icon in the menu's ink. */
export function MenuGlyph({ icon: Icon }: { icon: LucideIcon }) {
  return <Icon aria-hidden size={19} strokeWidth={1.9} color={`url(#${INK_ID})`} />;
}

/** AFFHAN Shipping's emblem in the menu's ink: its own shape, painted with the gradient, white on a filled tile. */
export function ShipEmblemGlyph() {
  const shape = `url(${SHIP_MARK_NAV.src}) center / contain no-repeat`;
  return (
    <span
      aria-hidden="true"
      style={{ WebkitMask: shape, mask: shape }}
      className="block h-[26px] w-[26px] bg-[linear-gradient(45deg,#06205e,#03a6c4)] group-hover:bg-none group-hover:bg-white group-active:bg-none group-active:bg-white group-focus-visible:bg-none group-focus-visible:bg-white"
    />
  );
}
