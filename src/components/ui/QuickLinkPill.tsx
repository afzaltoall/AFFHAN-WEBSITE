import Link from "next/link";

// Shared "quick entry point" pill — the Top Ranking / Full Catalog links in the
// homepage hero, the catalog header and the rankings header. One component so
// the placements can't drift apart in padding, icon crop or hover accent, which
// is exactly what had happened: the catalog's Top Ranking sat on a plain white
// border with a differently-cropped icon, and the rankings page rendered a solid
// dark pill instead of the glass one.
//
// The icons are photos (public/top-1.jpg, public/cata.jpg) that ship with a thin
// frame and white margin, so they're cropped with clip-path and scaled back up
// to fill the icon box cleanly.

interface QuickLinkPillProps {
  href: string;
  /** Path under /public, e.g. "/top-1.jpg". */
  icon: string;
  label: string;
  /** Tailwind text-colour class applied on hover, e.g. "hover:text-amber-600". */
  hoverTextClass?: string;
  /** Hide the label below sm, keeping just the icon, where space is tight. */
  labelHiddenOnMobile?: boolean;
  className?: string;
}

export function QuickLinkPill({
  href,
  icon,
  label,
  hoverTextClass = "hover:text-brand-dark",
  labelHiddenOnMobile = false,
  className = "",
}: QuickLinkPillProps) {
  return (
    <Link
      href={href}
      className={`inline-flex items-center gap-2 text-sm font-semibold text-slate-700 ${hoverTextClass} liquid-glass-card !rounded-full px-4 py-2.5 shadow-sm hover:shadow transition-all whitespace-nowrap ${className}`}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={icon}
        alt=""
        aria-hidden="true"
        width={20}
        height={20}
        style={{ width: 20, height: 20 }}
        className="object-contain scale-[1.8] [clip-path:inset(20%)]"
      />
      <span className={labelHiddenOnMobile ? "hidden sm:inline" : undefined}>{label}</span>
    </Link>
  );
}
