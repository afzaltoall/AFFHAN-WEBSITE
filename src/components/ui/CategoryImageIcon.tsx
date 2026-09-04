import Image from "next/image";

/**
 * A category icon that is a picture rather than a glyph.
 *
 * Some categories have artwork of their own, in public/categories/. The rest
 * use a lucide icon. Rather than teach nine call sites the difference, this
 * wraps the image in the same shape a lucide icon has — a component taking
 * `size` and `className` — so getCategoryIcon can return either and nothing
 * downstream has to know which it got.
 *
 * The src it is given is already web-sized. next.config sets
 * images.unoptimized globally — see the note there — so next/image will not
 * shrink anything on the way out; whatever is in public/ is what ships. The
 * resizing happens once, by hand, when the artwork is added. See CUSTOM_ART in
 * lib/categoryTree.
 */
export function categoryImageIcon(src: string, alt: string) {
  function CategoryImageIcon({ size = 18, className = "" }: { size?: number; className?: string }) {
    return (
      <Image
        src={src}
        alt={alt}
        width={size}
        height={size}
        // Twice the drawn size, so it stays sharp on a retina screen without
        // asking for the whole original.
        sizes={`${size * 2}px`}
        className={`object-contain ${className}`}
      />
    );
  }
  // Named for the React devtools tree, where a wall of anonymous components is
  // hard to read.
  CategoryImageIcon.displayName = `CategoryImageIcon(${alt})`;
  return CategoryImageIcon;
}
