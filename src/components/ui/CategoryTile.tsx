"use client";

import { useState } from "react";
import Image from "next/image";
import { Box, Check } from "lucide-react";
import { getCdnUrl } from "@/lib/cdn";

// Shared circular category tile — the mega-menu's "All Categories" grid and the
// /products category rows both render through this so the image-thumbnail look
// only has to be built once.
//
// hideOnError: the mega-menu omits a tile entirely on a dead thumbnail (per its
// spec — never show a broken/placeholder tile). The /products rows keep the tile
// with an icon fallback instead, so a category is never made un-clickable.
interface CategoryTileProps {
  name: string;
  thumbnailUrl?: string | null;
  count?: number;
  active?: boolean;
  hideOnError?: boolean;
  className?: string;
  /**
   * For a tile lifted to the top level: the category it really sits under.
   *
   * 31 of the 53 top-level tiles are promoted children whose parent is also a
   * tile, so "Men's Clothing", "T-Shirts", "Men's Bottoms" and "Men's Outerwear
   * & Jackets" all appear side by side. Without this the grid reads as if it
   * were repeating itself; with it, the shortcut explains itself.
   */
  parentLabel?: string | null;
  onClick: () => void;
}

export function CategoryTile({
  name,
  thumbnailUrl,
  count,
  active = false,
  hideOnError = false,
  className = "",
  parentLabel = null,
  onClick,
}: CategoryTileProps) {
  const [failed, setFailed] = useState(false);
  if (failed && hideOnError) return null;
  const showImg = thumbnailUrl && !failed;

  return (
    <button
      onClick={onClick}
      aria-current={active ? "true" : undefined}
      className={`flex flex-col items-center gap-2 group text-center ${className}`}
    >
      {/* Circle shrinks on phones (56px) and grows on ≥sm (68px) so tiles stay
          comfortable at every width without a horizontal scroll. */}
      {/* The selected tile is ringed in brand blue, with a tick on the circle.
          A 2px ring at 30% opacity was the whole signal before, which on a grid
          of 50-odd near-identical circles is not enough to answer "which one did
          I pick" at a glance. ring-offset separates the halo from the photo so
          it reads as a ring rather than a border on a busy image. */}
      <div className="relative">
        <div
          className={`w-14 h-14 sm:w-[68px] sm:h-[68px] rounded-full overflow-hidden relative flex items-center justify-center shadow-sm transition-all ${
            active
              ? "border-2 border-brand ring-[3px] ring-brand/45 ring-offset-2 ring-offset-white"
              : "border border-slate-200 group-hover:border-brand/50"
          }`}
        >
        {showImg ? (
          <Image
            src={getCdnUrl(thumbnailUrl, 100) as string}
            alt={name}
            width={100}
            height={100}
            sizes="72px"
            className="absolute inset-0 w-full h-full object-cover group-hover:scale-110 transition-transform duration-500"
            onError={() => setFailed(true)}
          />
        ) : (
          <Box className="w-7 h-7 sm:w-8 sm:h-8 text-slate-300" />
        )}
        </div>
        {active && (
          <span
            aria-hidden="true"
            className="absolute -bottom-0.5 -right-0.5 flex h-5 w-5 items-center justify-center rounded-full bg-brand text-white shadow ring-2 ring-white"
          >
            <Check className="h-3 w-3" strokeWidth={3} />
          </span>
        )}
      </div>
      <span
        className={`text-[11px] sm:text-[12px] leading-tight line-clamp-2 px-0.5 ${
          active ? "font-bold text-brand-dark" : "font-medium text-slate-700 group-hover:text-brand-dark"
        }`}
      >
        {name}
      </span>
      {parentLabel && (
        <span className="-mt-1 text-[9.5px] leading-tight text-slate-400 line-clamp-1 px-0.5">
          in {parentLabel}
        </span>
      )}
      {typeof count === "number" && <span className="text-[10px] text-slate-400 -mt-1">{count.toLocaleString("en-US")}</span>}
    </button>
  );
}
