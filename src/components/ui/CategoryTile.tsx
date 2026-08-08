"use client";

import { useState } from "react";
import Image from "next/image";
import { Box } from "lucide-react";

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
  onClick: () => void;
}

export function CategoryTile({
  name,
  thumbnailUrl,
  count,
  active = false,
  hideOnError = false,
  className = "",
  onClick,
}: CategoryTileProps) {
  const [failed, setFailed] = useState(false);
  if (failed && hideOnError) return null;
  const showImg = thumbnailUrl && !failed;

  return (
    <button onClick={onClick} className={`flex flex-col items-center gap-2 group text-center ${className}`}>
      {/* Circle shrinks on phones (56px) and grows on ≥sm (68px) so tiles stay
          comfortable at every width without a horizontal scroll. */}
      <div
        className={`w-14 h-14 sm:w-[68px] sm:h-[68px] rounded-full overflow-hidden relative flex items-center justify-center border shadow-sm transition-all ${
          active ? "border-brand ring-2 ring-brand/30" : "border-slate-200 group-hover:border-brand/50"
        }`}
      >
        {showImg ? (
          <Image
            src={thumbnailUrl as string}
            alt={name}
            fill
            sizes="72px"
            className="object-cover group-hover:scale-110 transition-transform duration-500"
            onError={() => setFailed(true)}
          />
        ) : (
          <Box className="w-7 h-7 sm:w-8 sm:h-8 text-slate-300" />
        )}
      </div>
      <span
        className={`text-[11px] sm:text-[12px] leading-tight line-clamp-2 px-0.5 ${
          active ? "font-bold text-brand-dark" : "font-medium text-slate-700 group-hover:text-brand-dark"
        }`}
      >
        {name}
      </span>
      {typeof count === "number" && <span className="text-[10px] text-slate-400 -mt-1">{count.toLocaleString()}</span>}
    </button>
  );
}
